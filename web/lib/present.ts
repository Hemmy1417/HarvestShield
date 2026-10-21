/**
 * Every word a person reads passes through here. Machine values (enum names,
 * ids, wei, tenths of a millimetre) become sentences in one place, so no page
 * can print them raw. Identifiers and digests appear only on Verify and in the
 * record of a round, where somebody asked to see them.
 */
import type { PolicyState, Source, Trigger, Verdict } from "./types";

export function humanize(value: string): string {
  const t = String(value ?? "").trim();
  if (!t) return "";
  const s = t.replace(/[_-]+/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const label = (map: Record<string, string>, k: string | null | undefined) =>
  map[String(k ?? "")] ?? humanize(String(k ?? ""));

const SOURCE: Record<Source, string> = { OPEN_METEO: "Open-Meteo", NASA_POWER: "NASA POWER" };
export const source = (s: string) => label(SOURCE, s);
const SOURCE_LONG: Record<Source, string> = {
  OPEN_METEO: "Open-Meteo historical archive, built on the ERA5 reanalysis",
  NASA_POWER: "NASA POWER daily point data, built on the MERRA-2 reanalysis",
};
export const sourceLong = (s: string) => label(SOURCE_LONG, s);

const STATE: Record<PolicyState, string> = {
  ACTIVE: "Covering its window",
  READ: "Read, open to contest",
  CONTESTED: "Contested",
  DECIDED: "Decided, open to appeal",
  APPEALED: "Under appeal",
  SETTLED: "Settled",
  VOID: "Void",
};
export const policyState = (s: string) => label(STATE, s);

const VERDICT: Record<Verdict, string> = {
  STANDS: "The selected reading stands",
  USE_OTHER: "The other dataset governs",
  USE_STATION: "The ground station governs",
  NO_RELIABLE_READING: "No reading can be relied on",
};
export const verdict = (s: string) => label(VERDICT, s);

const HOW: Record<string, string> = {
  READING: "Settled on the reading, which nobody contested.",
  CONTEST: "Settled on the decision of the contest.",
  APPEAL: "Settled on the decision of the appeal.",
  CONTEST_LAPSED: "The contest could not be decided in time, so the reading stood.",
  APPEAL_LAPSED: "The appeal could not be decided in time, so the decision stood.",
  NO_READING: "No complete reading could be obtained, so the policy is void and the premium went back.",
  NO_RELIABLE_READING: "No reading could be relied on, so the policy is void and the premium went back.",
};
export const settledHow = (s: string) => label(HOW, s);

export const roleWord = (r: string) => (r === "INSURER" ? "insurer" : r === "FARMER" ? "farmer" : "");

/** "less than 140 mm of rain" / "more than 200 mm of rain". */
export function triggerSentence(trigger: Trigger | string, tenths: number): string {
  return `${trigger === "RAIN_BELOW" ? "less" : "more"} than ${mm(tenths)} of rain`;
}
export const triggerShort = (t: string) => (t === "RAIN_BELOW" ? "Drought cover" : "Excess rain cover");

/** Whole tenths of a millimetre, written as millimetres. */
export function mm(tenths: number | null | undefined): string {
  if (tenths === null || tenths === undefined) return "no value";
  return `${(tenths / 10).toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mm`;
}

const WEI = 10n ** 18n;
export function gen(wei: string | bigint | number | null | undefined): string {
  let v: bigint;
  try {
    v = BigInt(wei ?? 0);
  } catch {
    return "0";
  }
  const whole = v / WEI;
  const frac = ((v % WEI) * 10_000n) / WEI;
  const f = frac === 0n ? "" : `.${frac.toString().padStart(4, "0").replace(/0+$/, "")}`;
  return `${whole.toLocaleString("en-GB")}${f}`;
}
export const genText = (wei: string | bigint | number) => `${gen(wei)} GEN`;

export function toWei(text: string): bigint | null {
  const t = text.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  return BigInt(w ?? "0") * WEI + BigInt((f + "0".repeat(18)).slice(0, 18));
}

export function plural(n: number, word: string, many?: string): string {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? word : many ?? `${word}s`}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "1 Aug 2026" for a date or a timestamp, always in UTC. */
export function day(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function moment(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  return `${day(iso)}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
}
export function span(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s >= 2 * 86400 || (s >= 86400 && s % 86400 === 0)) return plural(Math.round(s / 86400), "day");
  if (s >= 2 * 3600 || (s >= 3600 && s % 3600 === 0)) return plural(Math.round(s / 3600), "hour");
  if (s >= 120) return plural(Math.round(s / 60), "minute");
  return plural(s, "second");
}
export function until(iso: string, nowMs: number): string {
  const t = new Date(iso).getTime();
  if (!iso || Number.isNaN(t)) return "";
  const d = (t - nowMs) / 1000;
  return d >= 0 ? `in ${span(d)}` : `${span(-d)} ago`;
}

/** "Policy 12", "Product 3": never the raw id. */
export const policyName = (yid: string) => `Policy ${Number(yid.replace(/^po-0*/, "")) || ""}`.trim();
export const productName = (pid: string) => `Product ${Number(pid.replace(/^pr-0*/, "")) || ""}`.trim();

export function shortAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export function refusal(text: string): string {
  const t = String(text ?? "").replace(/\[EXPECTED\]\s*/g, "").replace(/\[LLM_ERROR\]\s*/g, "")
    .replace(/^.*?UserError\(['"]?/, "").replace(/['"]?\)\s*$/, "").trim();
  if (!t) return "The contract refused it.";
  const s = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(s) ? s : `${s}.`;
}
export function prose(text: string): string {
  const t = String(text ?? "").trim();
  if (!t) return "";
  const s = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

/** A grade's effect, for a sentence. */
export function outcomeSentence(outcome: number | null): string {
  if (outcome === null) return "The policy is void: the premium goes back to the farmer.";
  if (outcome >= 100) return "The full payout goes to the farmer.";
  if (outcome > 0) return `${outcome}% of the payout goes to the farmer; the rest of the reserve returns to the pool.`;
  return "No payout; the reserve returns to the pool.";
}

/** "40% of the payout below 140.0 mm; 70% below 100.0 mm; the full payout below 50.0 mm". */
export function tiersSentence(trigger: string, tiers: { threshold_tenths: number; pct: number }[]): string {
  const word = trigger === "RAIN_BELOW" ? "below" : "above";
  return tiers.map((t) => `${t.pct >= 100 ? "the full payout" : `${t.pct}% of the payout`} ${word} ${mm(t.threshold_tenths)}`).join("; ");
}

/** What a grade pays, in wei, as a string for gen(). */
export const gradeWei = (payoutWei: string, grade: number) => ((BigInt(payoutWei) * BigInt(grade)) / 100n).toString();

const STATION: Record<string, string> = {
  NONE: "No rain gauge is named for this product.",
  NOT_READ: "The named gauge was not read: the reading came after its grace period.",
  NO_DATA: "The named gauge reported nothing for the window.",
  TOO_FAR: "The named gauge is too far from the point to count.",
  INCOMPLETE: "The named gauge did not report every day of the window.",
  OK: "The named gauge reported every day of the window.",
};
export const stationStatus = (s: string) => label(STATION, s);
