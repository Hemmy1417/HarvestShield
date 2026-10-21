/**
 * The shapes the contract's views return, field for field, each naming the
 * contract function that writes it. Nothing here is invented by the app.
 */

export type Role = "INSURER" | "FARMER";
export const SOURCES = ["OPEN_METEO", "NASA_POWER"] as const;
export type Source = (typeof SOURCES)[number];
export const TRIGGERS = ["RAIN_BELOW", "RAIN_ABOVE"] as const;
export type Trigger = (typeof TRIGGERS)[number];
export const VERDICTS = ["STANDS", "USE_OTHER", "USE_STATION", "NO_RELIABLE_READING"] as const;
export type Verdict = (typeof VERDICTS)[number];
export const POLICY_STATES = ["ACTIVE", "READ", "CONTESTED", "DECIDED", "APPEALED", "SETTLED", "VOID"] as const;
export type PolicyState = (typeof POLICY_STATES)[number];

export interface Periods { contest: number; response: number; appeal: number }

/** A payout step: the share of the payout a season past this threshold earns. */
export interface Tier { threshold_tenths: number; pct: number }

/** create_product, then deposit/withdraw/close and every sale and settlement amend it. */
export interface Product {
  product_id: string;
  insurer: string;
  crop: string;
  region: string;
  lat: string;
  lon: string;
  trigger: Trigger;
  /** The mildest step's threshold. */
  threshold_tenths: number;
  tiers: Tier[];
  /** A GHCN-Daily rain gauge id, or "". */
  station: string;
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
  /** Everything the pool holds: backers' capital and what it has earned. */
  pool_wei: string;
  shares_total: string;
  reserved_wei: string;
  paid_out_wei: string;
  earned_wei: string;
  backers: number;
  sold: number;
  active: number;
  open: boolean;
}

export type Series = [string, number | null][];
export interface Summary { total_tenths: number; days_reported: number; days: number; complete: boolean; digest: string }

/** read_index: what the named gauge said, and whether it could be used. */
export type StationStatus = "NONE" | "NOT_READ" | "NO_DATA" | "TOO_FAR" | "INCOMPLETE" | "OK";
export interface StationReading {
  status: StationStatus;
  id?: string;
  km?: number | null;
  series?: Series;
  summary?: Summary;
  grade?: number;
}

/** read_index */
export interface Reading {
  at: string;
  selected: Source;
  other: Source;
  /** The share of the payout, in percent, the selected reading earns. */
  grade: number;
  /** null when the other dataset is incomplete. */
  other_grade: number | null;
  triggered: boolean;
  series: Record<Source, Series>;
  summaries: Record<Source, Summary>;
  other_triggers: boolean | null;
  station?: StationReading;
}

/** read_vegetation */
export interface Vegetation {
  at: string;
  /** Year -> [[composite date, NDVI in ten-thousandths], ...]. */
  seasons: Record<string, [string, number][]>;
  window_mean: number;
  baseline_mean: number | null;
  anomaly_pct: number | null;
  digest: string;
}

/** _contest / answer */
export interface Contest {
  by: Role;
  statement: string;
  bond_wei: string;
  at: string;
  answer: string;
  answered_at: string;
  result?: "" | "MOVED" | "HELD" | "LAPSED";
}

/** appeal / answer */
export interface Appeal extends Contest {
  evidence_ends: string;
  lapse_at: string;
  result: "" | "MOVED" | "HELD" | "LAPSED";
}

/** decide_contest / decide_appeal. outcome: the grade it pays, in percent, or null for void. */
export interface Decision { verdict: Verdict; outcome: number | null; round: number; against: Role[] }

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
  outcome: number | null;
  station_digest?: string;
  vegetation_digest?: string;
  evidence: { evidence_id: string; kind: "PHOTO" | "PAGE"; by: Role; stage: "CONTEST" | "APPEAL"; sha256: string }[];
}

export interface PolicyEvent { kind: string; at: string; by: string; detail: string }

/** file_photo / file_page */
export interface Evidence {
  evidence_id: string;
  policy_id: string;
  kind: "PHOTO" | "PAGE";
  by: Role;
  stage: "CONTEST" | "APPEAL";
  caption: string;
  sha256: string;
  at: string;
  size?: number;
  url?: string;
  excerpt?: string;
}

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
  tiers: Tier[];
  station: string;
  vegetation: Vegetation | null;
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
  /** What the policy paid the insurer's side: the product's pool. */
  paid_pool_wei: string;
  /** The grade the policy settled at; null when void or not yet settled. */
  grade_paid: number | null;
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
  evidence_ids: string[];
  rounds?: Round[];
  evidence?: Evidence[];
  bond_wei?: string;
}

export interface ProductList { total: number; products: Product[] }
export interface PolicyList { total: number; policies: Policy[] }
export interface Balance { claimable: string; claimed: string }
export interface Stats { product: string; policy: string; round: string; settled: string; paid_out: string; held_wei: string; paid_wei: string; pool_wei: string }
/** get_backer */
export interface Backer { shares: string; shares_total: string; worth_wei: string; withdrawable_wei: string }
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
  max_tiers: number;
  station_max_km: number;
  vegetation_prior_years: number;
}
