"""The insurer's product, its funding, and buying a policy."""
import json

import pytest

from conftest import (  # noqa: F401
    DAYS, FARMER, GEN, INSURER, PAYOUT, PREMIUM, STRANGER, as_, bought, claimable, err,
    funded_product, policy, product, product_params, set_now,
)


class TestTheProduct:
    def test_an_insurer_publishes_and_funds_a_product(self, module, c):
        pid = funded_product(module, c)
        p = product(c, pid)
        assert p["insurer"] == INSURER and p["pool_wei"] == str(10 * GEN)
        assert p["shares_total"] == str(10 * GEN) and p["backers"] == 1
        assert p["tiers"] == [{"threshold_tenths": 1400, "pct": 100}] and p["station"] == ""
        assert p["lat"] == "9.06" and p["lon"] == "7.49" and p["replay"] is True

    @pytest.mark.parametrize("over,words", [
        ({"crop": ""}, "name the crop"),
        ({"lat": "95"}, "latitude must be between"),
        ({"lon": "x"}, "longitude must be a number"),
        ({"trigger": "HEAT"}, "rain below a threshold"),
        ({"threshold_tenths": 0}, "threshold"),
        ({"window_days": 3}, "window"),
        ({"premium_wei": "5"}, "at least"),
        ({"payout_wei": str(PREMIUM)}, "more than the premium"),
        ({"capacity": 0}, "number of policies"),
        ({"backup": "OPEN_METEO"}, "two different datasets"),
        ({"primary": "SOMEWHERE"}, "two different datasets"),
        ({"dispute_clause": "short"}, "dispute clause"),
        ({"periods": {"contest": 10, "response": 3600, "appeal": 3600}}, "contest period"),
        ({"periods": None}, "three periods"),
    ])
    def test_a_bad_product_is_refused_in_words(self, module, c, over, words):
        as_(module, INSURER)
        with pytest.raises(err(module), match=words):
            c.create_product(product_params(**over))

    def test_coordinates_are_kept_to_two_decimals(self, module, c):
        pid = funded_product(module, c, lat="9.0612", lon="-7.4")
        p = product(c, pid)
        assert (p["lat"], p["lon"]) == ("9.06", "-7.40")

    def test_anyone_backs_a_pool_for_shares(self, module, c):
        pid = funded_product(module, c)
        as_(module, STRANGER, 5 * GEN)
        out = json.loads(c.deposit(pid))
        assert out["refused"] is False and out["shares"] == str(5 * GEN)
        p = product(c, pid)
        assert p["pool_wei"] == str(15 * GEN) and p["backers"] == 2
        b = json.loads(c.get_backer(pid, STRANGER))
        assert b["worth_wei"] == str(5 * GEN) and b["withdrawable_wei"] == str(5 * GEN)
        assert json.loads(c.products_backed_by(STRANGER, 0, 10))["total"] == 1

    def test_a_dust_deposit_is_refused_and_credited_back(self, module, c):
        pid = funded_product(module, c)
        as_(module, STRANGER, 10**15)
        out = json.loads(c.deposit(pid))
        assert out["refused"] is True and claimable(c, STRANGER) == 10**15

    def test_a_backer_withdraws_only_unreserved_capital(self, module, c):
        pid, _ = bought(module, c)
        as_(module, INSURER)
        with pytest.raises(err(module), match="more than the pool holds unreserved"):
            c.withdraw(pid, str(10 * GEN - PAYOUT + 1))
        c.withdraw(pid, str(10 * GEN - PAYOUT))
        assert claimable(c, INSURER) == 10 * GEN - PAYOUT
        as_(module, STRANGER)
        with pytest.raises(err(module), match="you hold 0 shares"):
            c.withdraw(pid, "1")

    def test_a_closed_product_sells_nothing(self, module, c):
        pid = funded_product(module, c)
        as_(module, INSURER)
        c.close_product(pid)
        as_(module, FARMER, PREMIUM)
        out = json.loads(c.buy_policy(pid, "2026-08-01"))
        assert out["refused"] is True and "closed" in out["reason"]


class TestBuying:
    def test_a_policy_holds_the_premium_and_reserves_the_payout(self, module, c):
        pid, yid = bought(module, c)
        y = policy(c, yid)
        assert y["held_wei"] == str(PREMIUM) and y["farmer"] == FARMER
        assert y["window_end"] == "2026-08-14" and y["state"] == "ACTIVE"
        p = product(c, pid)
        assert p["reserved_wei"] == str(PAYOUT) and p["sold"] == 1

    @pytest.mark.parametrize("wei,words", [(PREMIUM - 1, "exactly the premium"), (0, "exactly the premium")])
    def test_a_wrong_premium_is_refused_and_credited_back(self, module, c, wei, words):
        pid = funded_product(module, c)
        as_(module, FARMER, wei)
        out = json.loads(c.buy_policy(pid, "2026-08-01"))
        assert out["refused"] is True and words in out["reason"]
        assert claimable(c, FARMER) == wei

    def test_the_insurer_cannot_insure_itself(self, module, c):
        pid = funded_product(module, c)
        as_(module, INSURER, PREMIUM)
        assert json.loads(c.buy_policy(pid, "2026-08-01"))["refused"] is True

    def test_a_replay_covers_only_the_season_its_insurer_named(self, module, c):
        pid = funded_product(module, c)
        for start in ("2020-08-01", "2026-07-01"):
            as_(module, FARMER, PREMIUM)
            out = json.loads(c.buy_policy(pid, start))
            assert out["refused"] is True and "covers only the season starting 2026-08-01" in out["reason"]

    def test_a_replay_season_must_be_over_a_week_ago(self, module, c):
        pid = funded_product(module, c, replay_start="2026-08-20")
        as_(module, FARMER, PREMIUM)
        out = json.loads(c.buy_policy(pid, "2026-08-20"))
        assert out["refused"] is True and "ended at least a week ago" in out["reason"]

    def test_a_replay_product_names_its_season(self, module, c):
        as_(module, INSURER)
        with pytest.raises(err(module), match="replay season's start"):
            c.create_product(product_params(replay_start=""))

    def test_a_forward_window_must_start_after_the_purchase(self, module, c):
        pid = funded_product(module, c, replay=False)
        as_(module, FARMER, PREMIUM)
        for start in ("2026-09-01", "2026-08-01"):
            out = json.loads(c.buy_policy(pid, start))
            assert out["refused"] is True and "start after the day" in out["reason"]
        as_(module, FARMER, PREMIUM)
        assert json.loads(c.buy_policy(pid, "2026-09-02"))["refused"] is False
        as_(module, FARMER, PREMIUM)
        assert "within a year" in json.loads(c.buy_policy(pid, "2027-12-01"))["reason"]

    def test_a_bad_date_is_refused(self, module, c):
        pid = funded_product(module, c)
        as_(module, FARMER, PREMIUM)
        assert "YYYY-MM-DD" in json.loads(c.buy_policy(pid, "August"))["reason"]

    def test_sales_stop_at_capacity_and_at_the_funding(self, module, c):
        pid = funded_product(module, c, fund=3 * GEN, capacity=5)
        bought(module, c, pid=pid)
        as_(module, FARMER, PREMIUM)
        out = json.loads(c.buy_policy(pid, "2026-08-01"))
        assert out["refused"] is True and "does not have the capital" in out["reason"]
        pid2 = funded_product(module, c, capacity=1)
        bought(module, c, pid=pid2)
        as_(module, FARMER, PREMIUM)
        assert "sold every policy" in json.loads(c.buy_policy(pid2, "2026-08-01"))["reason"]

    def test_both_parties_find_the_policy(self, module, c):
        _, yid = bought(module, c)
        for who in (FARMER, INSURER):
            assert json.loads(c.policies_of(who, 0, 10))["policies"][0]["policy_id"] == yid
        assert json.loads(c.list_policies(0, 10))["total"] == 1
        assert json.loads(c.products_of(INSURER, 0, 10))["total"] == 1

    def test_the_source_urls_are_the_contracts_own(self, module, c):
        _, yid = bought(module, c)
        u = c.source_url(yid, "NASA_POWER")
        assert "latitude=9.06" in u and "start=20260801" in u and "end=20260814" in u
        with pytest.raises(err(module), match="not a dataset"):
            c.source_url(yid, "ELSEWHERE")
