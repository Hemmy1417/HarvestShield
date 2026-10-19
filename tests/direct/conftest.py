"""Direct-mode harness for HarvestShield: the real contract module against a
stub `genlayer` that is as strict as the runtime where it matters.

  VALIDATORS RUN. `gl.vm.run_nondet` runs the leader, then the validator
  closure on the leader's result; a validator returning False fails the round
  with nothing written, like the network.

  THE MODEL. `exec_prompt` answers from per-role queues, one for image
  prompts ("look") and one for the judgment ("judge"), so a test can make the
  leader and a validator read the same evidence differently. It enforces
  GenVM's measured image rules: at most two images, each at most 5 MB, PNG or
  JFIF-headed JPEG only.

  THE CLOCK. `set_now(iso)` sets the transaction datetime; nothing advances
  on its own, so both sides of every window are testable.

  MONEY. `as_(module, who, wei)` sets sender and value; `_Payee.emit_transfer`
  appends to `transfers()`. A public write that raises reverts every tree,
  like the runtime, so a refusal can never leave half a state behind.
"""

import zlib
import importlib.util
import json
import os
import pathlib
import sys
import types
from datetime import datetime, timezone

import pytest
from eth_utils import to_checksum_address

CONTRACT_PATH = (pathlib.Path(__file__).resolve().parents[2]
                 / "contracts" / "harvestshield.py")

# EIP-55 checksummed, the form the contract records signers in.
INSURER = to_checksum_address("0x691e25a08e00fa16fc95b159589ba563727d77a8")
FARMER = to_checksum_address("0x56e71175c0772a21a6170e3d95184f126526e9f2")
STRANGER = to_checksum_address("0xd41fca7210904c6d2f4e00c377e76f8aad43ec9e")
DEPLOYER = to_checksum_address("0x26ed19d786db6c920d0969b2d8a25f6a0fc8e338")

GEN = 10**18

_ROLE = ["leader"]
_ANSWERS = {"look": {"leader": [], "validator": []}, "judge": {"leader": [], "validator": []}}
_CALLS = {"look": {"leader": 0, "validator": 0}, "judge": {"leader": 0, "validator": 0}}
_PROMPTS = []
_FORGED = []
_ACCEPTED = []
_PRINTS = []
_TRANSFERS = []
_PAGES = {"leader": {}, "validator": {}}
_FETCHES = []
_NOW = [datetime(2026, 9, 1, 9, 0, 0, tzinfo=timezone.utc)]


class _NoAnswer(BaseException):
    """A test forgot to queue a model answer. BaseException, so the
    contract's per-image isolation cannot swallow a harness mistake."""


class _UserError(Exception):
    def __init__(self, data):
        super().__init__(data)
        self.data = data

    def __str__(self):
        return str(self.data)


class _VMError:
    def __init__(self, message):
        self.message = message


class _Return:
    def __init__(self, calldata):
        self.calldata = calldata


def _roundtrip(value):
    """Consensus serializes the leader's result; round-tripping enforces
    that everything returned is plain data."""
    return json.loads(json.dumps(value))


def _run_nondet(leader_fn, validator_fn):
    if _ACCEPTED:
        # A result the network accepted whatever it says: tests the contract's
        # own boundary checks, the layer behind the validators.
        return _ACCEPTED.pop(0)
    if _FORGED:
        forged = _FORGED.pop(0)
        _ROLE[0] = "validator"
        try:
            ok = validator_fn(_Return(forged))
        except Exception:
            ok = False
        finally:
            _ROLE[0] = "leader"
        if not ok:
            raise _UserError("[LLM_ERROR] validators did not agree with the leader")
        return forged
    try:
        value = _roundtrip(leader_fn())
    except _UserError as e:
        _ROLE[0] = "validator"
        try:
            agreed = validator_fn(e)
        except Exception:
            agreed = False
        finally:
            _ROLE[0] = "leader"
        raise _UserError(e.data if agreed else
                         "[LLM_ERROR] validators disagreed with the leader's failure")
    _ROLE[0] = "validator"
    try:
        ok = validator_fn(_Return(value))
    except Exception:
        ok = False
    finally:
        _ROLE[0] = "leader"
    if not ok:
        raise _UserError("[LLM_ERROR] validators did not agree with the leader")
    return value


class _TreeMap(dict):
    def __class_getitem__(cls, item):
        return cls

    def get(self, k, default=None):
        return super().get(k, default)


class _U256(int):
    def __new__(cls, v):
        return super().__new__(cls, int(v))


class _Address:
    def __init__(self, v):
        text = str(v).strip()
        if not (text.startswith("0x") and len(text) == 42):
            raise ValueError("not an address")
        int(text[2:], 16)
        self.as_hex = to_checksum_address(text)

    def __str__(self):
        return self.as_hex


class _ViewDeco:
    def __call__(self, fn):
        return fn


class _WriteDeco:
    payable = staticmethod(lambda fn: fn)

    def __call__(self, fn):
        return fn


class _Public:
    view = _ViewDeco()
    write = _WriteDeco()


def _sniff_ok(img: bytes) -> bool:
    return img[:8] == b"\x89PNG\r\n\x1a\n" or img[:4] == b"\xff\xd8\xff\xe0"


def _exec_prompt(prompt, response_format=None, images=None):
    role = _ROLE[0]
    kind = "look" if images else "judge"
    if images is not None:
        if len(images) > 2:
            raise RuntimeError("TOO_MANY_IMAGES")
        for img in images:
            if len(img) > 5 * 1024 * 1024:
                raise RuntimeError("IMAGE_TOO_LARGE")
            if not _sniff_ok(bytes(img)):
                raise RuntimeError("INVALID_IMAGE")
    _PROMPTS.append({"role": role, "kind": kind, "prompt": prompt,
                     "images": len(images or [])})
    queue = _ANSWERS[kind][role] or _ANSWERS[kind]["leader"]
    if not queue:
        raise _NoAnswer(f"test ran a {kind} prompt without an answer for it")
    idx = min(_CALLS[kind][role], len(queue) - 1)
    _CALLS[kind][role] += 1
    answer = queue[idx]
    if callable(answer):
        answer = answer(prompt, images)
    if isinstance(answer, BaseException):
        raise answer
    return answer


class _Fetched:
    def __init__(self, status, body):
        self.status = status
        self.body = body


def _web_get(url):
    role = _ROLE[0]
    _FETCHES.append({"role": role, "url": url})
    served = _PAGES[role].get(url, _PAGES["leader"].get(url))
    if served is None:
        return _Fetched(404, b"")
    if isinstance(served, BaseException):
        raise served
    return _Fetched(*served)


class _PayeeProxy:
    def __init__(self, addr):
        self.addr = str(addr)

    def emit_transfer(self, value=0):
        _TRANSFERS.append({"to": self.addr, "wei": int(value)})


def _contract_interface(cls):
    return _PayeeProxy


def _print_hook(*args, **kwargs):
    _PRINTS.append(" ".join(str(a) for a in args))


def _install():
    gl = types.ModuleType("genlayer")
    gl.public = _Public()
    gl.contract = types.SimpleNamespace(Contract=type("Contract", (), {}))
    gl.storage = types.SimpleNamespace(TreeMap=_TreeMap)
    gl.vm = types.SimpleNamespace(UserError=_UserError, VMError=_VMError,
                                  Return=_Return, run_nondet=_run_nondet)
    gl.nondet = types.SimpleNamespace(exec_prompt=_exec_prompt,
                                      web=types.SimpleNamespace(get=_web_get))
    gl.message = types.SimpleNamespace(sender_address=DEPLOYER, value=0)
    gl.evm = types.SimpleNamespace(contract_interface=_contract_interface)
    gl_types = types.ModuleType("genlayer.types")
    gl_types.u256 = _U256
    gl_types.Address = _Address
    gl.types = gl_types
    sys.modules["genlayer"] = gl
    sys.modules["genlayer.types"] = gl_types
    return gl


class _FakeDateTime(datetime):
    @classmethod
    def now(cls, tz=None):
        return _NOW[0]


def _load():
    _install()
    spec = importlib.util.spec_from_file_location("harvestshield_contract", CONTRACT_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.print = _print_hook
    mod.datetime = _FakeDateTime
    return mod


@pytest.fixture
def module():
    # The stub SDK must not outlive its test: the official-runner suite loads
    # the real `genlayer` in the same session.
    saved = {k: v for k, v in sys.modules.items()
             if k == "genlayer" or k.startswith("genlayer.")}
    try:
        yield _load()
    finally:
        for k in [k for k in sys.modules if k == "genlayer" or k.startswith("genlayer.")]:
            del sys.modules[k]
        sys.modules.update(saved)


if sys.platform == "win32":
    # genlayer-test's direct loader unlinks a temp file it still holds open,
    # which POSIX allows and Windows refuses; tolerate exactly that locally.
    _real_unlink = os.unlink

    def _tolerant_unlink(path, *args, **kwargs):
        try:
            _real_unlink(path, *args, **kwargs)
        except PermissionError:
            pass

    os.unlink = _tolerant_unlink


_TREES = ("counters", "products", "policies", "index", "rounds", "ledger")

_PUBLIC_WRITES = ("create_product", "fund_product", "withdraw_capital", "close_product",
                  "buy_policy", "read_index", "void_unread", "contest", "answer",
                  "decide_contest", "lapse_contest", "appeal", "decide_appeal",
                  "lapse_appeal", "finalize", "claim")


def _revert_on_raise(inst, name):
    fn = getattr(inst, name)

    def wrapped(*args, **kwargs):
        snapshot = {t: dict(getattr(inst, t)) for t in _TREES}
        n_transfers = len(_TRANSFERS)
        try:
            return fn(*args, **kwargs)
        except BaseException:
            for t, data in snapshot.items():
                tree = getattr(inst, t)
                tree.clear()
                tree.update(data)
            del _TRANSFERS[n_transfers:]
            raise

    return wrapped


def _fresh_instance(mod):
    inst = mod.HarvestShield.__new__(mod.HarvestShield)
    for name in _TREES:
        setattr(inst, name, _TreeMap())
    mod.gl.message.sender_address = DEPLOYER
    mod.gl.message.value = 0
    inst.__init__()
    for name in _PUBLIC_WRITES:
        setattr(inst, name, _revert_on_raise(inst, name))
    return inst


def _reset():
    _ROLE[0] = "leader"
    for kind in _ANSWERS:
        for role in _ANSWERS[kind]:
            _ANSWERS[kind][role].clear()
            _CALLS[kind][role] = 0
    _PROMPTS.clear()
    _FORGED.clear()
    _ACCEPTED.clear()
    _PRINTS.clear()
    _TRANSFERS.clear()
    _PAGES["leader"].clear()
    _PAGES["validator"].clear()
    _FETCHES.clear()
    _NOW[0] = datetime(2026, 9, 1, 9, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
def c(module):
    _reset()
    return _fresh_instance(module)


# ── helpers ──────────────────────────────────────────────────────────────────

def as_(module, who, value=0):
    module.gl.message.sender_address = who
    module.gl.message.value = value


def err(module):
    return module.gl.vm.UserError


def set_now(iso):
    _NOW[0] = datetime.fromisoformat(iso.replace("Z", "+00:00"))


def reset_prompts():
    _PROMPTS.clear()


def prompts(kind=None, role=None):
    return [p for p in _PROMPTS if (kind is None or p["kind"] == kind)
            and (role is None or p["role"] == role)]


def prints():
    return list(_PRINTS)


def transfers():
    return list(_TRANSFERS)


def web_page(url, body, status=200, validator=None):
    """Serve a page to every node; `validator` serves that role another body."""
    _PAGES["leader"][url] = body if isinstance(body, BaseException) else (status, body)
    if validator is not None:
        _PAGES["validator"][url] = (status, validator)


def fetches(role=None):
    return [f["url"] for f in _FETCHES if role is None or f["role"] == role]


def forge_leader(value):
    _FORGED.append(value)


def network_accepts(value):
    """The next round's consensus result, as if the network had accepted it."""
    _ACCEPTED.append(value)


def seg(marker: int, body: bytes = b"") -> bytes:
    """One JPEG segment: its marker, its length, its body."""
    return bytes([0xff, marker]) + (len(body) + 2).to_bytes(2, "big") + body


# The pieces of the smallest JPEG a decoder opens, by name, in file order.
JPEG_PARTS = {
    "soi": b"\xff\xd8",
    "app0": seg(0xe0, b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"),
    "note": b"",
    "dqt": seg(0xdb, b"\x00" + b"\x01" * 64),
    "sof": seg(0xc0, b"\x08\x00\x08\x00\x08\x01\x01\x11\x00"),
    "dc": seg(0xc4, b"\x00\x01" + b"\x00" * 15 + b"\x00"),
    "ac": seg(0xc4, b"\x10\x01" + b"\x00" * 15 + b"\x00"),
    "sos": seg(0xda, b"\x01\x01\x00\x00\x3f\x00"),
    "scan": b"\x00" * 8,
    "end": b"\xff\xd9",
}


def jpeg(size=0, **over) -> bytes:
    """A whole JPEG from its named pieces, any of them replaced or emptied,
    its scan padded with zeros to the size asked for."""
    parts = dict(JPEG_PARTS, **over)
    short = size - sum(len(v) for v in parts.values())
    parts["scan"] += b"\x00" * max(0, short)
    return b"".join(parts.values())


def jfif(tag=b"", size=4000):
    """A JPEG a decoder opens, made distinct by a comment, at an exact size."""
    return jpeg(size=size, note=seg(0xfe, tag) if tag else b"")


def chunk(name: bytes, body: bytes = b"") -> bytes:
    """One PNG chunk with its true checksum."""
    return len(body).to_bytes(4, "big") + name + body \
        + (zlib.crc32(name + body) & 0xffffffff).to_bytes(4, "big")


def ihdr(width=2, height=2, bits=8, kind=0, interlace=0, compression=0, filtering=0) -> bytes:
    return chunk(b"IHDR", width.to_bytes(4, "big") + height.to_bytes(4, "big")
                 + bytes([bits, kind, compression, filtering, interlace]))


# The pieces of the smallest PNG a decoder opens: two rows of two grey pixels.
PNG_PARTS = {
    "sig": b"\x89PNG\r\n\x1a\n",
    "ihdr": ihdr(),
    "plte": b"",
    "note": b"",
    "idat": chunk(b"IDAT", zlib.compress(b"\x00\x00\x00" * 2)),
    "pad": b"",
    "iend": chunk(b"IEND"),
}


def png_file(size=0, **over) -> bytes:
    parts = dict(PNG_PARTS, **over)
    short = size - sum(len(v) for v in parts.values()) - 12
    if short >= 0:
        parts["pad"] = chunk(b"zzPd", b"\x00" * short)
    return b"".join(parts.values())


def png(tag=b"", size=2000):
    return png_file(size=size, note=chunk(b"tEXt", b"Comment\x00" + tag) if tag else b"")


def exif_jpeg(size=4000):
    body = b"\xff\xd8\xff\xe1\x00\x10Exif\x00"
    return body + b"\x00" * max(0, size - len(body))








# ── the domain: products, policies and the two datasets ─────────────────────

from datetime import date as _date, timedelta as _td  # noqa: E402

LAT, LON = "9.06", "7.49"
START = "2026-08-01"
DAYS = 14
THRESHOLD = 1400                # 140.0 mm, rain below it is a drought
PREMIUM = GEN // 10
PAYOUT = 2 * GEN
PERIODS = {"contest": 3600, "response": 3600, "appeal": 3600}
CLAUSE = ("Where the datasets disagree, prefer the one whose daily pattern is more plausible "
          "for the season; a single day of extreme rain that the other dataset does not show "
          "is treated as a fault in that dataset.")


def product_params(**over):
    p = {"crop": "Maize", "region": "Abuja, Federal Capital Territory", "lat": LAT, "lon": LON,
         "trigger": "RAIN_BELOW", "threshold_tenths": THRESHOLD, "window_days": DAYS,
         "premium_wei": str(PREMIUM), "payout_wei": str(PAYOUT), "capacity": 5,
         "primary": "OPEN_METEO", "backup": "NASA_POWER", "dispute_clause": CLAUSE,
         "periods": dict(PERIODS), "replay": True, "replay_start": START}
    p.update(over)
    return json.dumps(p)


def days(start=START, n=DAYS):
    s = _date.fromisoformat(start)
    return [(s + _td(days=i)).isoformat() for i in range(n)]


def om_body(values, start=START):
    """Open-Meteo's archive JSON for these daily values (mm, None for missing)."""
    return json.dumps({"latitude": 9.03, "longitude": 7.47, "generationtime_ms": 0.12,
                       "daily_units": {"time": "iso8601", "precipitation_sum": "mm"},
                       "daily": {"time": days(start, len(values)), "precipitation_sum": values}}).encode()


def np_body(values, start=START):
    """NASA POWER's daily point JSON for these values (mm, -999 for missing)."""
    keys = [d.replace("-", "") for d in days(start, len(values))]
    return json.dumps({"type": "Feature", "properties": {"parameter": {"PRECTOTCORR": {
        k: (-999.0 if v is None else v) for k, v in zip(keys, values)}}}}).encode()


def url(module, source, start=START, n=DAYS, lat=LAT, lon=LON):
    s = _date.fromisoformat(start)
    return module._source_url(source, lat, lon, s, s + _td(days=n - 1))


WET = [13.9, 27.0, 14.6, 0.8, 4.1, 5.1, 8.7, 9.0, 14.3, 7.6, 21.0, 18.0, 9.0, 10.9]    # 164.0
DRY = [10.1, 10.59, 0.48, 0.17, 3.19, 3.31, 7.87, 21.15, 14.85, 19.67, 11.7, 6.25, 6.11, 1.67]  # 117.1
VERY_DRY = [1.0] * 14                                                                   # 14.0


def serve(module, om, np, start=START, n=DAYS, v_om=None, v_np=None):
    web_page(url(module, "OPEN_METEO", start, n), om_body(om, start),
             validator=om_body(v_om, start) if v_om is not None else None)
    web_page(url(module, "NASA_POWER", start, n), np_body(np, start),
             validator=np_body(v_np, start) if v_np is not None else None)


def funded_product(module, c, fund=10 * GEN, **over):
    as_(module, INSURER)
    pid = json.loads(c.create_product(product_params(**over)))["product_id"]
    as_(module, INSURER, fund)
    assert json.loads(c.fund_product(pid))["refused"] is False
    as_(module, INSURER, 0)
    return pid


def bought(module, c, pid=None, start=START, **over):
    pid = pid or funded_product(module, c, **over)
    as_(module, FARMER, PREMIUM)
    out = json.loads(c.buy_policy(pid, start))
    as_(module, FARMER, 0)
    assert out["refused"] is False, out
    return pid, out["policy_id"]


def read(module, c, om=WET, np=DRY, who=None, at=None, **kw):
    """A policy read with the primary (Open-Meteo) and backup (NASA) values
    given; `at` moves the clock after the purchase and before the reading."""
    pid, yid = bought(module, c, **kw)
    if at:
        set_now(at)
    serve(module, om, np)
    as_(module, who or STRANGER)
    return pid, yid, json.loads(c.read_index(yid))


def verdict(v, reason="Applied the clause to the daily data."):
    return {"verdict": v, "reason": reason}


def llm(judge=None, v_judge=None):
    for role, val in (("leader", judge), ("validator", v_judge)):
        _ANSWERS["judge"][role].clear()
        _CALLS["judge"][role] = 0
        if val is not None:
            _ANSWERS["judge"][role].extend(val if isinstance(val, list) else [val])


def claimable(c, addr):
    return int(json.loads(c.get_balance(addr))["claimable"])


def policy(c, yid):
    return json.loads(c.get_policy(yid))


def product(c, pid):
    return json.loads(c.get_product(pid))


def conserved(c, yid):
    """Every wei a policy took in is held or paid; the payout came from the reserve."""
    y = policy(c, yid)
    took = int(y["premium_wei"]) + (int(y["payout_wei"]) if y.get("paid_to_farmer") else 0)
    for k in ("contest", "appeal"):
        if y.get(k):
            took += int(y[k]["bond_wei"])
    return int(y["held_wei"]) + int(y["paid_farmer_wei"]) + int(y["paid_insurer_wei"]) == took
