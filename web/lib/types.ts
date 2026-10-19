/**
 * The shapes the contract's views return, field for field, each naming the
 * contract function that writes it. Nothing here is invented by the app.
 */

export type Role = "INSURER" | "FARMER";
export const SOURCES = ["OPEN_METEO", "NASA_POWER"] as const;
export type Source = (typeof SOURCES)[number];
export const TRIGGERS = ["RAIN_BELOW", "RAIN_ABOVE"] as const;
export type Trigger = (typeof TRIGGERS)[number];
export const VERDICTS = ["STANDS", "USE_OTHER", "NO_RELIABLE_READING"] as const;
export type Verdict = (typeof VERDICTS)[number];
export const POLICY_STATES = ["ACTIVE", "READ", "CONTESTED", "DECIDED", "APPEALED", "SETTLED", "VOID"] as const;
export type PolicyState = (typeof POLICY_STATES)[number];

export interface Periods { contest: number; response: number; appeal: number }

/** create_product, then fund/withdraw/close and every sale amend it. */
export interface Product {
  product_id: string;
  insurer: string;
  crop: string;
  region: string;
  lat: string;
  lon: string;
  trigger: Trigger;
  threshold_tenths: number;
  window_days: number;
  premium_wei: string;
  payout_wei: string;
  capacity: number;
  primary: Source;
  backup: Source;
  dispute_clause: string;
  periods: Periods;
  replay: boolean;
  /** The one season a replay product covers; "" for a forward product. */
  replay_start: string;
  created_at: string;
  funded_wei: string;
  reserved_wei: string;
  paid_out_wei: string;
  sold: number;
  active: number;
  open: boolean;
}

export type Series = [string, number | null][];
export interface Summary { total_tenths: number; days_reported: number; days: number; complete: boolean; digest: string }

/** read_index */
export interface Reading {
  at: string;
  selected: Source;
  other: Source;
  triggered: boolean;
  series: Record<Source, Series>;
  summaries: Record<Source, Summary>;
  /** null when the other dataset is incomplete. */
  other_triggers: boolean | null;
}

/** _contest / answer */
export interface Contest {
  by: Role;
  statement: string;
  bond_wei: string;
  at: string;
  answer: string;
  answered_at: string;
  result?: "MOVED" | "HELD" | "LAPSED";
}

/** appeal / answer */
export interface Appeal extends Contest {
  evidence_ends: string;
  lapse_at: string;
  result: "" | "MOVED" | "HELD" | "LAPSED";
}

/** decide_contest / decide_appeal. outcome: true pays the farmer, false does not, null voids. */
export interface Decision { verdict: Verdict; outcome: boolean | null; round: number; against: Role[] }

/** _record */
export interface Round {
  n: number;
  kind: "CONTEST" | "APPEAL";
  at: string;
  ruleset: string;
  verdict: Verdict;
  reason: string;
  digests: Record<Source, string>;
  totals: Record<Source, number>;
  by: Role;
  outcome: boolean | null;
}

export interface PolicyEvent { kind: string; at: string; by: string; detail: string }

/** _buy, then every write on the policy; get_policy adds rounds and bond_wei. */
export interface Policy {
  policy_id: string;
  product_id: string;
  insurer: string;
  farmer: string;
  crop: string;
  region: string;
  lat: string;
  lon: string;
  trigger: Trigger;
  threshold_tenths: number;
  window_days: number;
  window_start: string;
  window_end: string;
  premium_wei: string;
  payout_wei: string;
  primary: Source;
  backup: Source;
  dispute_clause: string;
  periods: Periods;
  replay: boolean;
  state: PolicyState;
  bought_at: string;
  held_wei: string;
  paid_farmer_wei: string;
  paid_insurer_wei: string;
  reading: Reading | null;
  contest: Contest | null;
  appeal: Appeal | null;
  decision: Decision | null;
  round_count: number;
  contest_ends: string;
  response_ends: string;
  decision_long_stop: string;
  appeal_ends: string;
  settled_at: string;
  settled_how: string;
  paid_to_farmer: boolean;
  events: PolicyEvent[];
  rounds?: Round[];
  bond_wei?: string;
}

export interface ProductList { total: number; products: Product[] }
export interface PolicyList { total: number; policies: Policy[] }
export interface Balance { claimable: string; claimed: string }
export interface Stats { product: string; policy: string; round: string; settled: string; paid_out: string; held_wei: string; paid_wei: string }
export interface Config {
  ruleset: string;
  deployer: string;
  sources: { id: Source; name: string }[];
  min_wei: string;
  min_window_days: number;
  max_window_days: number;
  max_capacity: number;
  min_period_seconds: number;
  max_period_seconds: number;
  read_long_stop_days: number;
  long_stop_periods: number;
  bond_bps: number;
  statement_max: number;
  clause_max: number;
}
