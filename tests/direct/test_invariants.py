"""Random walks: every act from every actor at every moment, two policies on
one graded product whose pool anyone may back. After every step: no wei made
or lost across the whole contract, a settled policy never changes again, a
pool never reserves more than it holds, and its shares never claim more than
it holds."""
import json
import os
import random
from datetime import timedelta

import pytest

from conftest import (  # noqa: F401
    PAGE_TEXT, PAGE_URL, jfif, seen, web_page, DRY, FARMER, GEN, INSURER, PREMIUM, STRANGER, VERY_DRY, WET, _NOW, as_, err, funded_product,
    llm, serve, transfers, verdict,
)

ACTORS = (INSURER, FARMER, STRANGER)
MID = [6.0] * 14                                   # 84.0 mm: the 70% step
DATA = [(WET, DRY), (WET, DRY), (VERY_DRY, WET), (VERY_DRY, WET), (WET, WET), (MID, WET), (DRY, MID)]
RELEVANT = {"ACTIVE": [2, 2, 3, 0, 1], "READ": [4, 4, 4, 4, 9, 15], "CONTESTED": [5, 6, 6, 7, 13, 14, 15],
            "DECIDED": [8, 8, 8, 9], "APPEALED": [5, 10, 10, 11, 13, 14, 15], "SETTLED": list(range(16)),
            "VOID": list(range(16))}
TIERS = [{"threshold_tenths": 1400, "pct": 40}, {"threshold_tenths": 1000, "pct": 70},
         {"threshold_tenths": 500, "pct": 100}]
VERDICTS = ["STANDS", "USE_OTHER", "USE_STATION", "NO_RELIABLE_READING"]
PROPER = {0: ACTORS, 1: ACTORS, 15: ACTORS, 2: ACTORS, 3: (STRANGER,), 4: (FARMER, INSURER),
          5: (FARMER, INSURER), 6: (FARMER, INSURER), 7: (STRANGER,), 8: (FARMER, INSURER),
          9: (STRANGER,), 10: (FARMER, INSURER), 11: (STRANGER,), 12: ACTORS,
          13: (FARMER, INSURER), 14: (FARMER, INSURER)}


def act(rng, module, c, pid, yid):
    y = json.loads(c.policies[yid])
    pick = rng.choice(RELEVANT[y["state"]]) if rng.random() < 0.8 else rng.randrange(16)
    who = rng.choice(PROPER[pick]) if rng.random() < 0.7 else rng.choice(ACTORS)
    as_(module, who)
    bond = max(10**16, int(y["payout_wei"]) // 10)
    if pick == 0:
        as_(module, who, rng.choice([GEN, GEN // 3, 10**15]))
        c.deposit(pid)
    elif pick == 1:
        have = int(c.shares.get(f"{pid}|{who}") or "0")
        c.withdraw(pid, str(max(1, rng.choice([have // 3, have, have + 1, 1]))))
    elif pick == 15:
        c.read_vegetation(yid)
    elif pick == 2:
        om, np = rng.choice(DATA)
        serve(module, om, np)
        c.read_index(yid)
    elif pick == 3:
        c.void_unread(yid)
    elif pick == 4:
        as_(module, who, bond if rng.random() < 0.8 else bond + 1)
        c.contest(yid, "The other dataset is the right one.")
    elif pick == 5:
        c.answer(yid, "The selected dataset is the right one.")
    elif pick == 6:
        serve(module, WET, DRY)
        llm(judge=verdict(rng.choice(VERDICTS)), look=seen())
        c.decide_contest(yid)
    elif pick == 7:
        c.lapse_contest(yid)
    elif pick == 8:
        as_(module, who, bond)
        c.appeal(yid, "The decision misreads the clause.")
    elif pick == 9:
        c.finalize(yid)
    elif pick == 10:
        serve(module, WET, DRY)
        llm(judge=verdict(rng.choice(VERDICTS)), look=seen())
        c.decide_appeal(yid)
    elif pick == 11:
        c.lapse_appeal(yid)
    elif pick == 13:
        c.file_photo(yid, "the field", jfif(str(rng.random()).encode()))
    elif pick == 14:
        web_page(PAGE_URL, PAGE_TEXT.encode())
        c.file_page(yid, PAGE_URL, "a report")
    else:
        c.claim()


def books(c):
    owed = sum(int(json.loads(c.ledger[a])["claimable"]) for a in c.ledger)
    held = sum(int(json.loads(v)["held_wei"]) for v in c.policies.values())
    pools = sum(int(json.loads(v)["pool_wei"]) for v in c.products.values())
    return owed + held + pools + sum(t["wei"] for t in transfers())


@pytest.mark.parametrize("seed", range(int(os.environ.get("HARVESTSHIELD_WALK_SEEDS", "80"))))
def test_a_random_walk_keeps_every_invariant(module, c, seed):
    rng = random.Random(seed)
    pid = funded_product(module, c, fund=5 * GEN, tiers=TIERS)
    paid_in = 5 * GEN
    yids = []
    for _ in range(2):
        as_(module, FARMER, PREMIUM)
        yids.append(json.loads(c.buy_policy(pid, "2026-08-01"))["policy_id"])
        paid_in += PREMIUM
    settled = {}
    for step in range(120):
        _NOW[0] += timedelta(seconds=rng.choice([0, 0, 0, 600, 1800, 4000]))
        yid = rng.choice(yids)
        before = c.policies[yid]
        try:
            act(rng, module, c, pid, yid)
        except err(module):
            assert c.policies[yid] == before, "a refusal leaves nothing behind"
        paid_in += int(module.gl.message.value or 0)
        as_(module, STRANGER, 0)
        assert books(c) == paid_in, f"step {step}: the books do not balance"
        p = json.loads(c.products[pid])
        assert 0 <= int(p["reserved_wei"]) <= int(p["pool_wei"]), f"step {step}: reserve exceeds the pool"
        shares = sum(int(v) for k, v in c.shares.items() if k.startswith(pid + "|"))
        assert shares == int(p["shares_total"]), f"step {step}: shares do not add up"
        assert int(json.loads(c.get_stats())["pool_wei"]) == int(p["pool_wei"]), f"step {step}: pool counter drifts"
        for x in yids:
            y = json.loads(c.policies[x])
            if x in settled:
                assert c.policies[x] == settled[x], f"step {step}: a settled policy changed"
            elif y["state"] in ("SETTLED", "VOID"):
                assert y["held_wei"] == "0"
                settled[x] = c.policies[x]
                REACHED.add(f"grade {y['grade_paid']}")
    p = json.loads(c.products[pid])
    if int(p["backers"]) > 1:
        REACHED.add("several backers")
    if int(p["shares_total"]) < 5 * GEN:
        REACHED.add("a withdrawal")


REACHED: set = set()


def test_the_walks_reach_every_grade_and_the_pool_moves():
    """Run after the walks: they must settle at every step of the scale, void,
    and see the pool backed by more than one backer and drawn down."""
    if not REACHED:
        pytest.skip("run with the walks")
    want = {"grade 0", "grade 40", "grade 70", "grade 100", "grade None", "several backers", "a withdrawal"}
    assert want <= REACHED, sorted(REACHED)
