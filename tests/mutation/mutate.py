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
    ('the trigger fires at the threshold',
     '        if (total < t["threshold_tenths"]) if trigger == "RAIN_BELOW" else (total > t["threshold_tenths"]):',
     '        if (total <= t["threshold_tenths"]) if trigger == "RAIN_BELOW" else (total > t["threshold_tenths"]):'),
    ('excess rain reads as drought',
     '        if (total < t["threshold_tenths"]) if trigger == "RAIN_BELOW" else (total > t["threshold_tenths"]):',
     '        if total < t["threshold_tenths"]:'),
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
    ('validators need not reproduce the series',
     '                return False\n            if mine != res.calldata:\n                print("[DISAGREE] the series differ: "',
     '                return False\n            if False:\n                print("[DISAGREE] the series differ: "'),
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
    ('other_triggers ignores completeness',
     '        other_grade = _grade(y["trigger"], sums[other]["total_tenths"], y["tiers"]) \\\n            if sums[other]["complete"] else None',
     '        other_grade = _grade(y["trigger"], sums[other]["total_tenths"], y["tiers"])'),
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
    ('sales ignore funding',
     '        if int(p["pool_wei"]) - int(p["reserved_wei"]) < int(p["payout_wei"]):',
     '        if False:'),
    ("a sale reserves nothing",
     '        p["reserved_wei"] = str(int(p["reserved_wei"]) + int(p["payout_wei"]))\n        p["sold"] += 1',
     '        p["sold"] += 1'),
    ('an insurer may withdraw reserved capital',
     '        if wei > pool - int(p["reserved_wei"]):',
     '        if wei > pool:'),
    ("a closed product still sells",
     '        if not p["open"]:', '        if False:'),
    ("a refused payable write keeps the value",
     '            return self._buy(str(pid), str(window_start), sender, wei)\n        except Exception as e:\n            if wei:\n                self._credit(sender, wei)',
     '            return self._buy(str(pid), str(window_start), sender, wei)\n        except Exception as e:\n            if False:\n                self._credit(sender, wei)'),

    # ── contest ─────────────────────────────────────────────────────────────
    ('the winner may contest',
     '        if not any(self._better_for(role, g, r["grade"]) for g in alts):',
     '        if False:'),
    ('a contest needs no disagreement',
     '        if not any(g != r["grade"] for g in alts):',
     '        if False:'),
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
    ('use_other keeps the reading',
     '            if r["other_grade"] is None:\n                raise gl.vm.UserError(f"{ERROR_LLM} the other dataset has no grade to use")\n            return r["other_grade"]',
     '            if r["other_grade"] is None:\n                raise gl.vm.UserError(f"{ERROR_LLM} the other dataset has no grade to use")\n            return r["grade"]'),
    ('no reliable reading pays the farmer',
     '            return st["grade"]\n        return None',
     '            return st["grade"]\n        return 100'),
    ('void ranks as a loss',
     '        farmer = 0 if outcome is None else int(y["payout_wei"]) * int(outcome) // 100 - int(y["premium_wei"])',
     '        farmer = -int(y["premium_wei"]) if outcome is None else int(y["payout_wei"]) * int(outcome) // 100 - int(y["premium_wei"])'),
    ('the bond always returns',
     '        moved = self._value(y, c["by"], after) > self._value(y, c["by"], before)',
     '        moved = True'),
    ("the answering side may be the contestant",
     '        if not role or role == case["by"]:', '        if not role:'),
    ("a contest lapses at once",
     '        if _now() <= _parse_iso(y["decision_long_stop"]):', '        if False:'),
    ('a lapsed contest keeps the bond',
     '        c = y["contest"]\n        self._return(y, c["by"], int(c["bond_wei"]))\n        c["result"] = "LAPSED"',
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
    ('a void lets only one side appeal',
     '        best = {"FARMER": max(int(t["pct"]) for t in y["tiers"]), "INSURER": 0}',
     '        best = {"FARMER": max(int(t["pct"]) for t in y["tiers"]), "INSURER": None}'),
    ("an appeal after its window",
     '            if _now() > _parse_iso(y["appeal_ends"]):', '            if False:'),
    ('a held appeal returns the bond',
     '        moved = self._value(y, a["by"], after) > self._value(y, a["by"], before)',
     '        moved = True'),
    ("finalize inside the contest period",
     '            if _now() <= _parse_iso(y["contest_ends"]):\n                _refuse("the contest period is still open")',
     '            if False:\n                _refuse("the contest period is still open")'),
    ("finalize inside the appeal window",
     '            if _now() <= _parse_iso(y["appeal_ends"]):\n                _refuse("the appeal window is still open")',
     '            if False:\n                _refuse("the appeal window is still open")'),
    ('a trigger pays without the premium going to the insurer',
     '        else:\n            self._pay(y, "INSURER", int(y["premium_wei"]))',
     '        else:\n            pass'),
    ('a void keeps the premium',
     '        if grade is None:\n            self._pay(y, "FARMER", int(y["premium_wei"]))',
     '        if grade is None:\n            self._pay(y, "INSURER", int(y["premium_wei"]))'),
    ('a payout leaves the reserve standing',
     '        p["reserved_wei"] = str(int(p["reserved_wei"]) - int(y["payout_wei"]))\n        p["active"] = int(p["active"]) - 1\n        paid = 0',
     '        p["active"] = int(p["active"]) - 1\n        paid = 0'),
    ("claim pays without zeroing",
     '        row["claimable"] = "0"\n        row["claimed"]', '        row["claimed"]'),
    # ── the second version ──────────────────────────────────────────────────
    ('a grade is the first step crossed, not the largest',
     '            g = max(g, int(t["pct"]))',
     '            g = g or int(t["pct"])'),
    ('steps need not pay more for a worse season',
     '        if b["pct"] == a["pct"] or not deeper:',
     '        if b["pct"] == a["pct"]:'),
    ('a grade pays the whole payout',
     '            paid = int(y["payout_wei"]) * int(grade) // 100',
     '            paid = int(y["payout_wei"]) if grade else 0'),
    ("the farmer's best is always the whole payout",
     '        best = {"FARMER": max(int(t["pct"]) for t in y["tiers"]), "INSURER": 0}',
     '        best = {"FARMER": 100 + 1, "INSURER": 0}'),
    ('better means higher for both sides',
     '        return a > b if role == "FARMER" else a < b',
     '        return a > b'),
    ('a deposit of dust is taken',
     '            if wei < MIN_WEI:',
     '            if wei < 1:'),
    ('later deposits mint one share per wei',
     '            minted = wei if not total else wei * total // pool',
     '            minted = wei'),
    ('a backer redeems more shares than they hold',
     '        if n > have:',
     '        if False:'),
    ("a redemption ignores the pool's value",
     '        wei = n * pool // total',
     '        wei = n'),
    ('a distant station is used',
     '        elif raw["km"] > STATION_MAX_KM:',
     '        elif False:'),
    ('an incomplete station is graded',
     '            if summ["complete"]:',
     '            if True:'),
    ('the station holds a reading forever',
     '        return bool(y.get("station")) and _now().date() <= self._clock_from(y) + timedelta(days=READ_GRACE_DAYS)',
     '        return bool(y.get("station"))'),
    ('validators need not reproduce the vegetation',
     '                return False\n            if mine != res.calldata:\n                print("[DISAGREE] the vegetation series differ")',
     '                return False\n            if False:\n                print("[DISAGREE] the vegetation series differ")'),
    ('vegetation is read at any time',
     '        if not open_until or now > _parse_iso(open_until):',
     '        if not open_until:'),
    ('vegetation is overwritten',
     '        if y.get("vegetation"):',
     '        if False:'),
    ('an unpublished season records nothing to compare',
     '        if not current:',
     '        if False:'),
    ('fill values count as vegetation',
     '        if -2000 <= v <= 10000 and start.isoformat() <= d <= end.isoformat():',
     '        if start.isoformat() <= d <= end.isoformat():'),
]

# Equivalent mutants, removed with the reason each cannot change an outcome:
# - "an unknown verdict pays": the round checks the agreed verdict against the
#   allowed set after consensus too, so a validator that accepts a disallowed
#   verdict still records nothing.
# - "use_station without a station grade": the allowed set offers USE_STATION
#   only when the station graded the season, so _outcome never sees it otherwise.
# - "an emptied pool takes capital it cannot price": every settlement returns
#   the premium to the pool, so a pool with shares outstanding is never empty.
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
