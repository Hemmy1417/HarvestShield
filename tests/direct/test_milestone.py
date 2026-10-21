"""The second version: graded payouts, a pool anyone may back, a ground
station read beside the datasets, and satellite vegetation in the record."""
import json

import pytest

from conftest import (  # noqa: F401
    DRY, FARMER, GEN, INSURER, PAYOUT, PREMIUM, STATION, STRANGER, VEG, VERY_DRY, WET, as_, bought,
    claimable, conserved, earned, err, funded_product, llm, policy, product, product_params, prompts,
    read, serve, serve_station, serve_vegetation, set_now, verdict,
)

TIERS = [{"threshold_tenths": 1400, "pct": 40}, {"threshold_tenths": 1000, "pct": 70},
         {"threshold_tenths": 500, "pct": 100}]
MID = [6.0] * 14            # 84.0 mm: past the 70% step, short of the 100% step
BOND = PAYOUT // 10


def finalize(module, c, yid, at="2026-09-01T10:00:01Z"):
    set_now(at)
    as_(module, STRANGER)
    c.finalize(yid)
    return policy(c, yid)


# ── graded payouts ───────────────────────────────────────────────────────────

class TestTiers:
    @pytest.mark.parametrize("tiers,words", [
        ([], "1 to 4 payout steps"),
        ([{"threshold_tenths": 1400, "pct": 40}] * 5, "1 to 4 payout steps"),
        ([{"threshold_tenths": 1400, "pct": 0}], "share of the payout"),
        ([{"threshold_tenths": 1400, "pct": 101}], "share of the payout"),
        ([{"threshold_tenths": 1400, "pct": 40}, {"threshold_tenths": 1500, "pct": 70}], "worse season"),
        ([{"threshold_tenths": 1400, "pct": 40}, {"threshold_tenths": 1000, "pct": 40}], "worse season"),
        (["40%"], "threshold and a percentage"),
    ])
    def test_bad_steps_are_refused_in_words(self, module, c, tiers, words):
        as_(module, INSURER)
        with pytest.raises(err(module), match=words):
            c.create_product(product_params(tiers=tiers))

    def test_steps_are_kept_mildest_first_and_the_threshold_is_the_mildest(self, module, c):
        pid = funded_product(module, c, tiers=list(reversed(TIERS)))
        p = product(c, pid)
        assert [t["pct"] for t in p["tiers"]] == [40, 70, 100] and p["threshold_tenths"] == 1400

    def test_excess_rain_steps_need_more_rain(self, module, c):
        as_(module, INSURER)
        with pytest.raises(err(module), match="worse season"):
            c.create_product(product_params(trigger="RAIN_ABOVE", tiers=TIERS))
        c.create_product(product_params(trigger="RAIN_ABOVE", tiers=[
            {"threshold_tenths": 2000, "pct": 50}, {"threshold_tenths": 3000, "pct": 100}]))

    @pytest.mark.parametrize("total,grade", [(1400, 0), (1399, 40), (1000, 40), (999, 70), (500, 70),
                                             (499, 100), (0, 100)])
    def test_the_grade_is_the_largest_step_crossed(self, module, total, grade):
        assert module._grade("RAIN_BELOW", total, TIERS) == grade

    @pytest.mark.parametrize("om,grade,paid", [(WET, 0, 0), (DRY, 40, PAYOUT * 40 // 100),
                                               (MID, 70, PAYOUT * 70 // 100), (VERY_DRY, 100, PAYOUT)])
    def test_a_reading_pays_its_grade_from_the_pool(self, module, c, om, grade, paid):
        pid, yid, out = read(module, c, om=om, np=om, tiers=TIERS)
        assert out["grade"] == grade
        y = finalize(module, c, yid)
        assert y["grade_paid"] == grade and claimable(c, FARMER) == paid
        p = product(c, pid)
        assert p["pool_wei"] == str(10 * GEN - paid + PREMIUM) and p["reserved_wei"] == "0"
        assert conserved(c, yid)

    def test_a_partial_payout_can_be_contested_upwards(self, module, c):
        _, yid, out = read(module, c, om=DRY, np=VERY_DRY, tiers=TIERS)
        assert out["grade"] == 40 and policy(c, yid)["reading"]["other_grade"] == 100
        as_(module, FARMER, BOND)
        assert json.loads(c.contest(yid, "NASA shows the drought I saw."))["refused"] is False

    def test_the_insurer_may_contest_a_partial_payout_downwards(self, module, c):
        _, yid, _ = read(module, c, om=DRY, np=WET, tiers=TIERS)
        as_(module, FARMER, BOND)
        out = json.loads(c.contest(yid, "Pay me more."))
        assert out["refused"] is True and "went your way" in out["reason"]
        as_(module, INSURER, BOND)
        assert json.loads(c.contest(yid, "Open-Meteo overstates the shortfall."))["refused"] is False

    def test_a_decision_moves_the_grade_and_the_bond_follows_the_value(self, module, c):
        _, yid, _ = read(module, c, om=DRY, np=VERY_DRY, tiers=TIERS)
        as_(module, FARMER, BOND)
        c.contest(yid, "NASA shows the drought I saw.")
        set_now("2026-09-01T10:00:01Z")
        serve(module, DRY, VERY_DRY)
        llm(judge=verdict("USE_OTHER"))
        as_(module, FARMER)
        out = json.loads(c.decide_contest(yid))
        assert out["outcome"] == 100 and out["contest"] == "MOVED"
        y = policy(c, yid)
        # The farmer has the largest step; only the insurer may appeal.
        assert y["decision"]["against"] == ["INSURER"]
        y = finalize(module, c, yid, "2026-09-01T11:00:02Z")
        assert y["grade_paid"] == 100 and claimable(c, FARMER) == BOND + PAYOUT and conserved(c, yid)

    def test_void_against_a_partial_payout_leaves_both_sides_short(self, module, c):
        _, yid, _ = read(module, c, om=DRY, np=VERY_DRY, tiers=TIERS)
        as_(module, FARMER, BOND)
        c.contest(yid, "NASA shows the drought I saw.")
        set_now("2026-09-01T10:00:01Z")
        serve(module, DRY, VERY_DRY)
        llm(judge=verdict("NO_RELIABLE_READING"))
        as_(module, FARMER)
        out = json.loads(c.decide_contest(yid))
        # 40% of 1 GEN is 0.4 GEN, more than the 0.1 GEN premium a void returns:
        # the farmer is worse off, so the contest did not move their way.
        assert out["outcome"] is None and out["contest"] == "HELD"
        assert sorted(policy(c, yid)["decision"]["against"]) == ["FARMER", "INSURER"]


# ── the pool ─────────────────────────────────────────────────────────────────

class TestThePool:
    def test_a_later_backer_buys_in_at_the_pool_value(self, module, c):
        pid, yid, _ = read(module, c, om=WET, np=WET)
        finalize(module, c, yid)                       # the pool earned a premium
        as_(module, STRANGER, GEN)
        out = json.loads(c.deposit(pid))
        assert int(out["shares"]) == GEN * 10 * GEN // (10 * GEN + PREMIUM)
        b = json.loads(c.get_backer(pid, STRANGER))
        assert GEN - 2 <= int(b["worth_wei"]) <= GEN

    def test_backers_share_a_payout_in_proportion(self, module, c):
        pid = funded_product(module, c, fund=4 * GEN)
        as_(module, STRANGER, 4 * GEN)
        c.deposit(pid)
        _, yid = bought(module, c, pid=pid)
        set_now("2026-09-01T09:00:00Z")
        serve(module, VERY_DRY, VERY_DRY)
        as_(module, STRANGER)
        c.read_index(yid)
        finalize(module, c, yid)
        a = int(json.loads(c.get_backer(pid, INSURER))["worth_wei"])
        b = int(json.loads(c.get_backer(pid, STRANGER))["worth_wei"])
        assert a == b == (8 * GEN - PAYOUT + PREMIUM) // 2

    def test_reserved_capital_waits_for_its_policy(self, module, c):
        pid, yid = bought(module, c, fund=PAYOUT)
        b = json.loads(c.get_backer(pid, INSURER))
        assert b["worth_wei"] == str(PAYOUT) and b["withdrawable_wei"] == "0"
        as_(module, INSURER)
        with pytest.raises(err(module), match="unreserved"):
            c.withdraw(pid, "1")

    def test_an_emptied_pool_takes_no_new_capital(self, module, c):
        pid = funded_product(module, c, fund=PAYOUT)
        _, yid = bought(module, c, pid=pid)
        serve(module, VERY_DRY, VERY_DRY)
        as_(module, STRANGER)
        c.read_index(yid)
        finalize(module, c, yid)
        assert product(c, pid)["pool_wei"] == str(PREMIUM)
        as_(module, INSURER)
        c.withdraw(pid, str(PAYOUT))                   # all the shares: the premium left
        assert product(c, pid)["pool_wei"] == "0" and product(c, pid)["backers"] == 0
        as_(module, STRANGER, GEN)
        assert json.loads(c.deposit(pid))["refused"] is False   # an empty pool starts afresh

    def test_withdrawals_refuse_bad_amounts(self, module, c):
        pid = funded_product(module, c)
        as_(module, INSURER)
        for bad in ("0", "x", str(10 * GEN + 1)):
            with pytest.raises(err(module)):
                c.withdraw(pid, bad)


# ── the ground station ───────────────────────────────────────────────────────

def read_with_station(module, c, om=WET, np=WET, st=None, lat="9.10", lon="7.45", at=None, **over):
    pid, yid = bought(module, c, station=STATION, **over)
    if at:
        set_now(at)
    serve(module, om, np)
    serve_station(module, st if st is not None else om, lat, lon)
    as_(module, STRANGER)
    return pid, yid, json.loads(c.read_index(yid))


class TestTheStation:
    def test_a_station_id_must_be_a_ghcn_id(self, module, c):
        as_(module, INSURER)
        with pytest.raises(err(module), match="eleven-character"):
            c.create_product(product_params(station="DES MOINES"))
        assert json.loads(c.get_product(json.loads(c.create_product(
            product_params(station="usw00014933")))["product_id"]))["station"] == STATION

    def test_the_station_is_read_beside_the_datasets(self, module, c):
        _, yid, _ = read_with_station(module, c, om=WET, np=WET, st=VERY_DRY)
        st = policy(c, yid)["reading"]["station"]
        assert st["status"] == "OK" and st["km"] == 6 and st["grade"] == 100
        assert st["summary"]["total_tenths"] == 140

    def test_a_station_that_disagrees_opens_a_contest(self, module, c):
        _, yid, out = read_with_station(module, c, om=WET, np=WET, st=VERY_DRY)
        assert out["grade"] == 0
        as_(module, FARMER, BOND)
        assert json.loads(c.contest(yid, "The gauge by my farm saw almost no rain."))["refused"] is False

    def test_use_station_pays_the_station_grade(self, module, c):
        _, yid, _ = read_with_station(module, c, om=WET, np=WET, st=VERY_DRY)
        as_(module, FARMER, BOND)
        c.contest(yid, "The gauge by my farm saw almost no rain.")
        set_now("2026-09-01T10:00:01Z")
        llm(judge=verdict("USE_STATION"))
        as_(module, FARMER)
        out = json.loads(c.decide_contest(yid))
        assert out["outcome"] == 100 and out["contest"] == "MOVED"
        p = prompts("judge", "leader")[-1]["prompt"]
        assert "ground station USW00014933, 6 km from the point" in p and "USE_STATION" in p
        assert policy(c, yid)["rounds"][0]["station_digest"] == policy(c, yid)["reading"]["station"]["summary"]["digest"]

    @pytest.mark.parametrize("lat,lon,st,status", [
        ("10.10", "7.45", WET, "TOO_FAR"),
        ("9.10", "7.45", [None] + WET[1:], "INCOMPLETE"),
        ("9.10", "7.45", [None] * 14, "NO_DATA"),
    ])
    def test_a_station_that_cannot_be_used_is_recorded_why(self, module, c, lat, lon, st, status):
        _, yid, _ = read_with_station(module, c, om=WET, np=WET, st=st, lat=lat, lon=lon)
        rec = policy(c, yid)["reading"]["station"]
        assert rec["status"] == status and "grade" not in rec
        as_(module, FARMER, BOND)
        assert json.loads(c.contest(yid, "Something else."))["refused"] is True

    def test_use_station_is_no_answer_without_a_station_grade(self, module, c):
        _, yid, _ = read(module, c, om=WET, np=DRY)
        as_(module, FARMER, BOND)
        c.contest(yid, "NASA shows the dry spell.")
        set_now("2026-09-01T10:00:01Z")
        serve(module, WET, DRY)
        llm(judge=verdict("USE_STATION"))
        as_(module, FARMER)
        with pytest.raises(err(module)):
            c.decide_contest(yid)
        assert "USE_STATION" not in prompts("judge", "leader")[-1]["prompt"]

    def test_after_the_grace_period_the_station_is_not_read(self, module, c):
        _, yid, out = read_with_station(module, c, om=WET, np=WET, st=VERY_DRY, at="2026-09-12T00:00:00Z")
        assert policy(c, yid)["reading"]["station"]["status"] == "NOT_READ"

    def test_validators_must_read_the_station_alike(self, module, c):
        pid, yid = bought(module, c, station=STATION)
        serve(module, WET, WET)
        serve_station(module, WET, validator=VERY_DRY)
        as_(module, STRANGER)
        with pytest.raises(err(module)):
            c.read_index(yid)


# ── satellite vegetation ─────────────────────────────────────────────────────

class TestVegetation:
    def test_the_index_is_read_with_its_baseline(self, module, c):
        _, yid, _ = read(module, c)
        serve_vegetation(module)
        as_(module, STRANGER)
        out = json.loads(c.read_vegetation(yid))
        v = policy(c, yid)["vegetation"]
        assert out["window_mean"] == (3229 + 3860) // 2 == v["window_mean"]
        base = (4300 + 5100 + 4500 + 5300 + 4400 + 5000) // 6
        assert v["baseline_mean"] == base and v["anomaly_pct"] == ((3229 + 3860) // 2 - base) * 100 // base
        assert len(v["digest"]) == 64

    def test_it_reaches_the_judge(self, module, c):
        _, yid, _ = read(module, c, om=WET, np=DRY)
        serve_vegetation(module)
        as_(module, STRANGER)
        c.read_vegetation(yid)
        as_(module, FARMER, BOND)
        c.contest(yid, "NASA shows the dry spell.")
        set_now("2026-09-01T10:00:01Z")
        serve(module, WET, DRY)
        llm(judge=verdict("USE_OTHER"))
        as_(module, FARMER)
        c.decide_contest(yid)
        p = prompts("judge", "leader")[-1]["prompt"]
        assert "satellite vegetation index" in p and "2026-07-28: 0.32" in p and "% difference" in p
        assert policy(c, yid)["rounds"][0]["vegetation_digest"] == policy(c, yid)["vegetation"]["digest"]

    def test_without_it_the_judge_is_told_so(self, module, c):
        _, yid, _ = read(module, c, om=WET, np=DRY)
        as_(module, FARMER, BOND)
        c.contest(yid, "NASA shows the dry spell.")
        set_now("2026-09-01T10:00:01Z")
        serve(module, WET, DRY)
        llm(judge=verdict("STANDS"))
        as_(module, FARMER)
        c.decide_contest(yid)
        assert "No satellite vegetation reading was recorded" in prompts("judge", "leader")[-1]["prompt"]

    def test_it_is_recorded_once_and_only_while_it_can_matter(self, module, c):
        _, yid = bought(module, c)
        as_(module, STRANGER)
        with pytest.raises(err(module), match="while the reading can still be contested"):
            c.read_vegetation(yid)                     # not read yet
        serve(module, WET, WET)
        c.read_index(yid)
        serve_vegetation(module)
        c.read_vegetation(yid)
        with pytest.raises(err(module), match="already recorded"):
            c.read_vegetation(yid)
        _, other = bought(module, c)
        serve(module, WET, WET)
        c.read_index(other)
        set_now("2026-09-01T10:00:01Z")                # the contest period is over
        with pytest.raises(err(module), match="while the reading can still be contested"):
            c.read_vegetation(other)

    def test_an_unpublished_season_is_asked_again_later(self, module, c):
        _, yid, _ = read(module, c)
        serve_vegetation(module, dict(VEG, **{"2026": []}))
        as_(module, STRANGER)
        with pytest.raises(err(module), match="not published yet"):
            c.read_vegetation(yid)
        assert policy(c, yid)["vegetation"] is None

    def test_validators_must_read_the_index_alike(self, module, c):
        _, yid, _ = read(module, c)
        serve_vegetation(module, validator={"2025": [["2025-07-28", 4300], ["2025-08-13", 9999]]})
        as_(module, STRANGER)
        with pytest.raises(err(module)):
            c.read_vegetation(yid)

    def test_fill_values_and_dates_outside_the_span_are_dropped(self, module):
        from datetime import date
        body = json.dumps({"subset": [
            {"calendar_date": "2026-07-28", "data": [3229]}, {"calendar_date": "2026-07-01", "data": [5000]},
            {"calendar_date": "2026-08-13", "data": [-3000]}]})
        assert module._parse_vegetation(body, date(2026, 7, 16), date(2026, 8, 14)) == ([["2026-07-28", 3229]], 0)

    def test_cloudy_composites_are_left_out_and_counted(self, module, c):
        _, yid, _ = read(module, c)
        serve_vegetation(module, cloudy=("2026-08-13", "2025-07-28", "2025-08-13"))
        as_(module, STRANGER)
        c.read_vegetation(yid)
        v = policy(c, yid)["vegetation"]
        assert v["seasons"]["2026"] == [["2026-07-28", 3229]] and v["window_mean"] == 3229
        assert v["seasons"]["2025"] == [] and v["clouded"] == {"2026": 1, "2025": 2, "2024": 0, "2023": 0}
        assert v["baseline_mean"] == (4500 + 5300 + 4400 + 5000) // 4

    def test_a_season_with_only_cloud_records_nothing(self, module, c):
        _, yid, _ = read(module, c)
        serve_vegetation(module, cloudy=("2026-07-28", "2026-08-13"))
        as_(module, STRANGER)
        with pytest.raises(err(module), match="rated cloudy"):
            c.read_vegetation(yid)

    def test_the_judge_is_told_what_cloud_left_out(self, module, c):
        _, yid, _ = read(module, c, om=WET, np=DRY)
        serve_vegetation(module, cloudy=("2025-07-28", "2024-07-27"))
        as_(module, STRANGER)
        c.read_vegetation(yid)
        as_(module, FARMER, BOND)
        c.contest(yid, "NASA shows the dry spell.")
        set_now("2026-09-01T10:00:01Z")
        serve(module, WET, DRY)
        llm(judge=verdict("STANDS"))
        as_(module, FARMER)
        c.decide_contest(yid)
        assert "2 composites were left out because MODIS rates them cloudy" in prompts("judge", "leader")[-1]["prompt"]

    def test_no_usable_earlier_season_means_no_baseline(self, module, c):
        _, yid, _ = read(module, c)
        cloud = tuple(d for y, pts in VEG.items() if y != "2026" for d, _ in pts)
        serve_vegetation(module, cloudy=cloud)
        as_(module, STRANGER)
        c.read_vegetation(yid)
        v = policy(c, yid)["vegetation"]
        assert v["baseline_mean"] is None and v["anomaly_pct"] is None
