"""Mutation check: break each rule of contracts/harvestshield.py and prove the
direct suite fails, then prove the unbroken contract passes.

Run from the repo root:  python tests/mutation/mutate.py [words...]
Exit status 0 only if every mutant is killed and the control passes. Works on
a temporary copy; the repository's files are never touched. The random walks
run with fewer seeds here (HARVESTSHIELD_WALK_SEEDS).
"""
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

REPO = pathlib.Path(__file__).resolve().parents[2]
TEXT = (REPO / "contracts" / "harvestshield.py").read_text(encoding="utf-8")

MUTATIONS = [
    # ── the reading ─────────────────────────────────────────────────────────
    ("the trigger fires at the threshold",
     '    return total < threshold if trigger == "RAIN_BELOW" else total > threshold',
     '    return total <= threshold if trigger == "RAIN_BELOW" else total > threshold'),
    ("excess rain reads as drought",
     '    return total < threshold if trigger == "RAIN_BELOW" else total > threshold',
     '    return total < threshold'),
    ("the backup is preferred",
     '    if sums[policy["primary"]]["complete"]:\n        return policy["primary"]',
     '    if sums[policy["backup"]]["complete"]:\n        return policy["backup"]'),
    ("an incomplete dataset can be selected",
     '    if sums[policy["primary"]]["complete"]:', '    if True:'),
    ("a missing day counts as dry",
     '            found[str(t)] = _tenths(v)', '            found[str(t)] = _tenths(v) or 0'),
    ("the fill value counts as rain",
     '    if not math.isfinite(f) or f < 0 or f > 2000:', '    if not math.isfinite(f) or f > 2000:'),
    ("a NaN day crashes the round",
     '    if not math.isfinite(f) or f < 0 or f > 2000:', '    if f < 0 or f > 2000:'),
    ("validators need not reproduce the series",
     '            if mine != res.calldata:', '            if False:'),
    ("an agreed reading of the wrong shape records",
     '                    or any(not isinstance(v, (int, type(None))) for _, v in series):',
     '                    or False:'),
    ("read before the window ends",
     '        if _now().date() <= date.fromisoformat(y["window_end"]):\n            _refuse("the window has not ended yet")',
     '        if False:\n            _refuse("the window has not ended yet")'),
    ("one dataset read alone during the grace",
     '        if not all(v["complete"] for v in sums.values()) and _now().date() <= grace:',
     '        if False:'),
    ("the clock runs only from the window end",
     '        return max(date.fromisoformat(y["window_end"]), _parse_iso(y["bought_at"]).date())',
     '        return date.fromisoformat(y["window_end"])'),
    ("void before the long stop",
     '        if _now().date() <= stop:\n            _refuse("a reading can still be obtained', '        if False:\n            _refuse("a reading can still be obtained'),
    ("other_triggers ignores completeness",
     '                                                 y["threshold_tenths"]) if sums[other]["complete"] else None}',
     '                                                 y["threshold_tenths"])}'),

    # ── buying ──────────────────────────────────────────────────────────────
    ("a replay season can be chosen by the farmer",
     '            if start.isoformat() != p["replay_start"]:', '            if False:'),
    ("a replay season still running can be bought",
     '            if end > today - timedelta(days=7):', '            if False:'),
    ("a forward window may start today",
     '        elif start <= today:', '        elif start < today:'),
    ("any premium will do",
     '        if wei != int(p["premium_wei"]):', '        if wei < 1:'),
    ("sales ignore capacity",
     '        if p["sold"] >= p["capacity"]:', '        if False:'),
    ("sales ignore funding",
     '        if int(p["funded_wei"]) - int(p["reserved_wei"]) < int(p["payout_wei"]):', '        if False:'),
    ("a sale reserves nothing",
     '        p["reserved_wei"] = str(int(p["reserved_wei"]) + int(p["payout_wei"]))\n        p["sold"] += 1',
     '        p["sold"] += 1'),
    ("an insurer may withdraw reserved capital",
     '        free = int(p["funded_wei"]) - int(p["reserved_wei"])\n        if amount > free:',
     '        free = int(p["funded_wei"])\n        if amount > free:'),
    ("a closed product still sells",
     '        if not p["open"]:', '        if False:'),
    ("a refused payable write keeps the value",
     '            return self._buy(str(pid), str(window_start), sender, wei)\n        except Exception as e:\n            if wei:\n                self._credit(sender, wei)',
     '            return self._buy(str(pid), str(window_start), sender, wei)\n        except Exception as e:\n            if False:\n                self._credit(sender, wei)'),

    # ── contest ─────────────────────────────────────────────────────────────
    ("the winner may contest",
     '        if role != self._against(r["triggered"]):', '        if False:'),
    ("a contest needs no disagreement",
     '        if r["other_triggers"] is None or r["other_triggers"] == r["triggered"]:', '        if False:'),
    ("any bond will do",
     '        if wei != bond:\n            raise _PayableRefusal(f"send exactly the bond, {bond} wei")\n        now = _now()\n        y["contest"]',
     '        if wei < 1:\n            raise _PayableRefusal(f"send exactly the bond, {bond} wei")\n        now = _now()\n        y["contest"]'),
    ("a contest after its period",
     '        if _now() > _parse_iso(y["contest_ends"]):', '        if False:'),
    ("a contest decided before its period ends",
     '        if _now() <= _parse_iso(y["response_ends"]):', '        if False:'),
    ("an appeal decided before its period ends",
     '        if _now() <= _parse_iso(a["evidence_ends"]):', '        if False:'),
    ("a leader's page text may be cut short",
     '                    or len(theirs) < len(mine) - PAGE_SLACK_CHARS:', '                    or False:'),
    ("validators need not agree on the verdict",
     '            if mine["verdict"] != theirs.get("verdict"):', '            if False:'),
    ("an unknown verdict pays",
     '        if not isinstance(got, dict) or got.get("verdict") not in VERDICTS:\n            raise gl.vm.UserError(f"{ERROR_LLM} the validators returned no usable decision")',
     '        if not isinstance(got, dict):\n            raise gl.vm.UserError(f"{ERROR_LLM} the validators returned no usable decision")'),
    ("use_other keeps the reading",
     '        if verdict == "USE_OTHER":\n            return r["other_triggers"]', '        if verdict == "USE_OTHER":\n            return r["triggered"]'),
    ("no reliable reading pays the farmer",
     '            return r["other_triggers"]\n        return None', '            return r["other_triggers"]\n        return True'),
    ("void ranks as a loss",
     '        return 2 if outcome is good else (1 if outcome is None else 0)', '        return 2 if outcome is good else 0'),
    ("the bond always returns",
     '        self._pay(y, c["by"] if moved else other, int(c["bond_wei"]))', '        self._pay(y, c["by"], int(c["bond_wei"]))'),
    ("the answering side may be the contestant",
     '        if not role or role == case["by"]:', '        if not role:'),
    ("a contest lapses at once",
     '        if _now() <= _parse_iso(y["decision_long_stop"]):', '        if False:'),
    ("a lapsed contest keeps the bond",
     '        c = y["contest"]\n        self._pay(y, c["by"], int(c["bond_wei"]))\n        c["result"] = "LAPSED"',
     '        c = y["contest"]\n        self._pay(y, "INSURER" if c["by"] == "FARMER" else "FARMER", int(c["bond_wei"]))\n        c["result"] = "LAPSED"'),
    ("the decision refetches instead of judging the record",
     '        series = y["reading"]["series"]\n        sums = y["reading"]["summaries"]',
     '        series = self._fetch_both(y)\n        sums = {s: _summary(v) for s, v in series.items()}'),
    ("policy facts are not defused",
     "f\"<<<POLICY crop {_defuse(y['crop'])}, growing area {_defuse(y['region'])}, latitude \"",
     "f\"<<<POLICY crop {y['crop']}, growing area {y['region']}, latitude \""),

    # ── appeal and settlement ───────────────────────────────────────────────
    ("anyone may appeal",
     '            if not role or role not in y["decision"]["against"]:', '            if not role:'),
    ("a void lets only one side appeal",
     '        return [r for r in ("FARMER", "INSURER") if self._rank(r, outcome) < 2]',
     '        return [r for r in ("FARMER", "INSURER") if self._rank(r, outcome) == 0]'),
    ("an appeal after its window",
     '            if _now() > _parse_iso(y["appeal_ends"]):', '            if False:'),
    ("a held appeal returns the bond",
     '        self._pay(y, a["by"] if moved else other, int(a["bond_wei"]))', '        self._pay(y, a["by"], int(a["bond_wei"]))'),
    ("finalize inside the contest period",
     '            if _now() <= _parse_iso(y["contest_ends"]):\n                _refuse("the contest period is still open")',
     '            if False:\n                _refuse("the contest period is still open")'),
    ("finalize inside the appeal window",
     '            if _now() <= _parse_iso(y["appeal_ends"]):\n                _refuse("the appeal window is still open")',
     '            if False:\n                _refuse("the appeal window is still open")'),
    ("a trigger pays without the premium going to the insurer",
     '            self._pay(y, "FARMER", int(y["payout_wei"]))\n            self._pay(y, "INSURER", int(y["premium_wei"]))',
     '            self._pay(y, "FARMER", int(y["payout_wei"]))'),
    ("a void keeps the premium",
     '            self._release(y)\n            self._pay(y, "FARMER", int(y["premium_wei"]))',
     '            self._release(y)\n            self._pay(y, "INSURER", int(y["premium_wei"]))'),
    ("a payout leaves the reserve standing",
     '            p["reserved_wei"] = str(int(p["reserved_wei"]) - int(y["payout_wei"]))\n            p["active"] = int(p["active"]) - 1\n            p["paid_out_wei"]',
     '            p["active"] = int(p["active"]) - 1\n            p["paid_out_wei"]'),
    ("claim pays without zeroing",
     '        row["claimable"] = "0"\n        row["claimed"]', '        row["claimed"]'),
]

TESTS = ["tests/direct"]


def suite_passes(work):
    env = dict(os.environ, HARVESTSHIELD_WALK_SEEDS=os.environ.get("HARVESTSHIELD_WALK_SEEDS", "20"))
    r = subprocess.run([sys.executable, "-m", "pytest", *TESTS, "-x", "-q", "--tb=no", "-p", "no:cacheprovider"],
                       cwd=work, capture_output=True, text=True, env=env)
    tail = [ln for ln in r.stdout.splitlines() if ln.strip()][-1:] or [""]
    return r.returncode == 0, tail[0]


def apply(text, edits):
    for old, new in edits:
        if text.count(old) != 1:
            return None
        text = text.replace(old, new)
    return text


def main():
    words = [a.lower() for a in sys.argv[1:]]
    chosen = [m for m in MUTATIONS if not words or any(w in m[0].lower() for w in words)]
    survivors = []
    with tempfile.TemporaryDirectory(prefix="harvestshield-mutants-") as tmp:
        work = pathlib.Path(tmp)
        shutil.copytree(REPO / "contracts", work / "contracts")
        shutil.copytree(REPO / "tests", work / "tests", ignore=shutil.ignore_patterns("__pycache__", "mutation"))
        shutil.copy(REPO / "pyproject.toml", work / "pyproject.toml")
        target = work / "contracts" / "harvestshield.py"
        for name, old, new in chosen:
            mutant = apply(TEXT, [(old, new)])
            if mutant is None:
                print(f"SKIPPED  {name}: a target is missing or ambiguous", flush=True)
                survivors.append(name)
                continue
            target.write_text(mutant, encoding="utf-8", newline="\n")
            passed, tail = suite_passes(work)
            print(f"{'SURVIVED' if passed else 'killed  '} {name}  ({tail})", flush=True)
            if passed:
                survivors.append(name)
                if os.environ.get("GITHUB_ACTIONS"):
                    print(f"::error title=mutant survived::{name}", flush=True)
        target.write_text(TEXT, encoding="utf-8", newline="\n")
        passed, tail = suite_passes(work)
    print(f"control, the contract as written: {'passes' if passed else 'FAILS'} ({tail})")
    print(f"{len(chosen) - len(survivors)}/{len(chosen)} mutants killed")
    if survivors:
        print("survivors: " + "; ".join(survivors))
    return 0 if passed and not survivors else 1


if __name__ == "__main__":
    sys.exit(main())
