/** Policy shapes exactly as the contract writes them, each naming its writer. */
import type { Policy, PolicyState, Reading } from "@/lib/types";

export const INSURER = "0xb549f0C168527f28E495f60f8193a24eEFBa0577";
export const FARMER = "0x07626150c9c8bE4007eAcb7C129d11AF0Bb99687";
export const STRANGER = "0x2356f4d58Cd0E72090Fddac51BF3B94D8E09738b";
export const T0 = Date.parse("2026-09-01T09:00:00Z");
export const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/** _buy */
export function active(over: Partial<Policy> = {}): Policy {
  return {
    policy_id: "po-00001", product_id: "pr-0001", insurer: INSURER, farmer: FARMER, crop: "Maize",
    region: "Abuja", lat: "9.06", lon: "7.49", trigger: "RAIN_BELOW", threshold_tenths: 1400, window_days: 14,
    window_start: "2026-08-01", window_end: "2026-08-14", premium_wei: (10n ** 17n).toString(),
    payout_wei: (2n * 10n ** 18n).toString(), primary: "OPEN_METEO", backup: "NASA_POWER",
    dispute_clause: "Prefer the plausible series.", periods: { contest: 3600, response: 3600, appeal: 3600 },
    replay: true, state: "ACTIVE", bought_at: iso(T0), held_wei: (10n ** 17n).toString(),
    paid_farmer_wei: "0", paid_insurer_wei: "0", reading: null, contest: null, appeal: null, decision: null,
    round_count: 0, contest_ends: "", response_ends: "", decision_long_stop: "", appeal_ends: "",
    settled_at: "", settled_how: "", paid_to_farmer: false, events: [], rounds: [],
    bond_wei: (2n * 10n ** 17n).toString(), ...over,
  };
}

/** read_index: Open-Meteo says no drought, NASA says drought (they disagree). */
export function reading(over: Partial<Reading> = {}): Reading {
  const series = Array.from({ length: 14 }, (_, i): [string, number | null] => [`2026-08-${String(i + 1).padStart(2, "0")}`, 100]);
  return {
    at: iso(T0), selected: "OPEN_METEO", other: "NASA_POWER", triggered: false, other_triggers: true,
    series: { OPEN_METEO: series, NASA_POWER: series },
    summaries: {
      OPEN_METEO: { total_tenths: 1630, days_reported: 14, days: 14, complete: true, digest: "a".repeat(64) },
      NASA_POWER: { total_tenths: 1171, days_reported: 14, days: 14, complete: true, digest: "b".repeat(64) },
    },
    ...over,
  };
}

export function at(state: PolicyState, over: Partial<Policy> = {}): Policy {
  const base: Partial<Policy> = { state };
  if (state !== "ACTIVE") Object.assign(base, { reading: reading(), contest_ends: iso(T0 + H) });
  if (["CONTESTED", "DECIDED", "APPEALED"].includes(state)) {
    Object.assign(base, {
      contest: { by: "FARMER", statement: "NASA governs.", bond_wei: "1", at: iso(T0), answer: "", answered_at: "" },
      response_ends: iso(T0 + H), decision_long_stop: iso(T0 + 4 * H),
    });
  }
  if (["DECIDED", "APPEALED"].includes(state)) {
    Object.assign(base, { decision: { verdict: "STANDS", outcome: false, round: 1, against: ["FARMER"] }, appeal_ends: iso(T0 + H) });
  }
  if (state === "APPEALED") {
    Object.assign(base, {
      appeal: { by: "FARMER", statement: "Wrong.", bond_wei: "1", at: iso(T0), answer: "", answered_at: "",
                evidence_ends: iso(T0 + H), lapse_at: iso(T0 + 4 * H), result: "" },
    });
  }
  return active({ ...base, ...over });
}
