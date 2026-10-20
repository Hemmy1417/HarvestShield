"""The reading: both datasets under consensus, the fixed selection rule, the
threshold, and settlement when nobody contests."""
import json

import pytest

from conftest import (earned,   # noqa: F401
    DRY, FARMER, GEN, INSURER, PAYOUT, PREMIUM, STRANGER, VERY_DRY, WET, as_, bought, claimable,
    conserved, err, forge_leader, network_accepts, policy, product, read, serve, set_now,
)


class TestTheReading:
    def test_the_primary_governs_when_it_is_complete(self, module, c):
        _, yid, out = read(module, c, om=WET, np=DRY)
        assert out["selected"] == "OPEN_METEO" and out["total_tenths"] == 1640
        assert out["triggered"] is False
        r = policy(c, yid)["reading"]
        assert r["other"] == "NASA_POWER" and r["other_triggers"] is True
        assert len(r["series"]["OPEN_METEO"]) == 14 and r["summaries"]["OPEN_METEO"]["complete"]

    def test_one_dataset_alone_waits_for_the_grace_period(self, module, c):
        gap = list(WET)
        gap[5] = None
        _, yid = bought(module, c)
        serve(module, gap, DRY)
        set_now("2026-09-11T23:00:00Z")
        as_(module, STRANGER)
        with pytest.raises(err(module), match="grace period ends on 2026-09-11"):
            c.read_index(yid)
        set_now("2026-09-12T00:00:00Z")
        assert json.loads(c.read_index(yid))["selected"] == "NASA_POWER"

    def test_the_backup_governs_when_the_primary_misses_a_day(self, module, c):
        gap = list(WET)
        gap[5] = None
        _, yid, out = read(module, c, om=gap, np=DRY, at="2026-09-12T00:00:00Z")
        assert out["selected"] == "NASA_POWER" and out["triggered"] is True
        assert policy(c, yid)["reading"]["other_triggers"] is None

    def test_no_complete_dataset_reads_nothing(self, module, c):
        gap = list(WET)
        gap[0] = None
        dry = list(DRY)
        dry[1] = None
        _, yid = bought(module, c)
        serve(module, gap, dry)
        as_(module, STRANGER)
        with pytest.raises(err(module), match="neither dataset covers every day"):
            c.read_index(yid)
        assert policy(c, yid)["state"] == "ACTIVE"

    def test_excess_rain_triggers_above(self, module, c):
        _, _, out = read(module, c, om=WET, np=DRY, trigger="RAIN_ABOVE", threshold_tenths=1500)
        assert out["triggered"] is True

    def test_not_before_the_window_ends(self, module, c):
        pid = __import__("conftest").funded_product(module, c, replay=False)
        as_(module, FARMER, PREMIUM)
        yid = json.loads(c.buy_policy(pid, "2026-09-02"))["policy_id"]
        as_(module, STRANGER)
        with pytest.raises(err(module), match="window has not ended"):
            c.read_index(yid)

    def test_a_validator_reading_other_numbers_fails_the_round(self, module, c):
        _, yid = bought(module, c)
        serve(module, WET, DRY, v_om=VERY_DRY)
        as_(module, STRANGER)
        with pytest.raises(err(module), match="did not agree"):
            c.read_index(yid)
        assert policy(c, yid)["state"] == "ACTIVE"

    def test_a_dataset_that_answers_an_error_reads_nothing(self, module, c):
        _, yid = bought(module, c)
        serve(module, WET, DRY)
        from conftest import url, web_page
        web_page(url(module, "NASA_POWER"), b"oops", status=503)
        as_(module, STRANGER)
        with pytest.raises(err(module)):
            c.read_index(yid)

    def test_a_nan_day_is_a_missing_day(self, module, c):
        bad = list(WET)
        bad[3] = float("nan")
        _, yid, out = read(module, c, om=bad, np=DRY, at="2026-09-12T00:00:00Z")
        assert out["selected"] == "NASA_POWER"

    @pytest.mark.parametrize("value", [None, {}, {"OPEN_METEO": []},
                                       {"OPEN_METEO": [["d", 1.5]] * 14, "NASA_POWER": [["d", 1]] * 14}])
    def test_an_agreed_reading_of_the_wrong_shape_records_nothing(self, module, c, value):
        _, yid = bought(module, c)
        network_accepts(value)
        as_(module, STRANGER)
        with pytest.raises(err(module), match="no usable reading"):
            c.read_index(yid)

    def test_only_once(self, module, c):
        _, yid, _ = read(module, c)
        with pytest.raises(err(module), match="while the policy is read"):
            c.read_index(yid)


class TestSettlingTheReading:
    def test_an_uncontested_trigger_pays_the_farmer_after_the_period(self, module, c):
        pid, yid, out = read(module, c, om=VERY_DRY, np=DRY)
        assert out["triggered"] is True
        as_(module, STRANGER)
        with pytest.raises(err(module), match="contest period is still open"):
            c.finalize(yid)
        set_now("2026-09-01T10:00:01Z")
        c.finalize(yid)
        assert claimable(c, FARMER) == PAYOUT and earned(c, yid) == PREMIUM
        p = product(c, pid)
        assert p["pool_wei"] == str(10 * GEN - PAYOUT + PREMIUM) and p["reserved_wei"] == "0"
        assert conserved(c, yid) and policy(c, yid)["held_wei"] == "0"

    def test_an_uncontested_no_trigger_releases_the_reserve(self, module, c):
        pid, yid, out = read(module, c, om=WET, np=WET)
        assert out["triggered"] is False
        set_now("2026-09-01T10:00:01Z")
        as_(module, STRANGER)
        c.finalize(yid)
        assert claimable(c, FARMER) == 0 and earned(c, yid) == PREMIUM
        p = product(c, pid)
        assert p["pool_wei"] == str(10 * GEN + PREMIUM) and p["reserved_wei"] == "0" and p["active"] == 0
        assert conserved(c, yid)

    def test_a_reading_never_obtained_voids_at_the_long_stop(self, module, c):
        pid, yid = bought(module, c)
        as_(module, STRANGER)
        set_now("2026-10-16T09:00:00Z")
        with pytest.raises(err(module), match="long stop has not passed"):
            c.void_unread(yid)
        set_now("2026-10-17T09:00:00Z")
        c.void_unread(yid)
        y = policy(c, yid)
        assert y["state"] == "VOID" and y["settled_how"] == "NO_READING"
        assert claimable(c, FARMER) == PREMIUM and product(c, pid)["reserved_wei"] == "0"
        assert conserved(c, yid)

    def test_the_pool_earns_the_premium_and_its_backers_draw_it(self, module, c):
        pid, yid, _ = read(module, c, om=WET, np=WET)
        set_now("2026-09-01T10:00:01Z")
        as_(module, STRANGER)
        c.finalize(yid)
        b = json.loads(c.get_backer(pid, INSURER))
        assert b["worth_wei"] == str(10 * GEN + PREMIUM) and b["withdrawable_wei"] == b["worth_wei"]
        as_(module, INSURER)
        out = json.loads(c.withdraw(pid, b["shares"]))
        assert out["withdrawn_wei"] == str(10 * GEN + PREMIUM)
        assert json.loads(c.claim())["claimed_wei"] == str(10 * GEN + PREMIUM)
        with pytest.raises(err(module), match="nothing is owed"):
            c.claim()


class TestTheBoundary:
    def test_rain_exactly_at_a_drought_threshold_does_not_trigger(self, module, c):
        exact = [10.0] * 14     # 140.0 mm, the threshold itself
        _, _, out = read(module, c, om=exact, np=exact)
        assert out["total_tenths"] == 1400 and out["triggered"] is False

    def test_rain_exactly_at_an_excess_threshold_does_not_trigger(self, module, c):
        exact = [10.0] * 14
        _, _, out = read(module, c, om=exact, np=exact, trigger="RAIN_ABOVE")
        assert out["triggered"] is False

    def test_a_tenth_below_the_drought_threshold_triggers(self, module, c):
        under = [10.0] * 13 + [9.9]
        _, _, out = read(module, c, om=under, np=under)
        assert out["total_tenths"] == 1399 and out["triggered"] is True
