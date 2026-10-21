/**
 * The payout steps a product may define, checked the way the contract's
 * _validate_tiers checks them, and the grade a season total earns, the way
 * _grade computes it. Pure, so the builder can explain a refusal before
 * anything is signed and tests can hold both sides to the same rule.
 */
import type { Tier } from "./types";

export const MAX_TIERS = 4;

/** Steps mildest first (smallest share first), or a sentence saying what is wrong. */
export function checkTiers(trigger: string, raw: Tier[]): { tiers: Tier[]; problem: string } {
  if (raw.length < 1 || raw.length > MAX_TIERS) return { tiers: [], problem: `Give 1 to ${MAX_TIERS} payout steps.` };
  for (const t of raw) {
    if (!Number.isInteger(t.threshold_tenths) || t.threshold_tenths < 1) return { tiers: [], problem: "Each step needs a threshold above 0 mm." };
    if (!Number.isInteger(t.pct) || t.pct < 1 || t.pct > 100) return { tiers: [], problem: "Each step pays 1% to 100% of the payout." };
  }
  const tiers = [...raw].sort((a, b) => a.pct - b.pct);
  for (let i = 1; i < tiers.length; i++) {
    const a = tiers[i - 1]!;
    const b = tiers[i]!;
    const deeper = trigger === "RAIN_BELOW" ? b.threshold_tenths < a.threshold_tenths : b.threshold_tenths > a.threshold_tenths;
    if (b.pct === a.pct || !deeper) return { tiers: [], problem: "Each further step must need a worse season and pay a larger share." };
  }
  return { tiers, problem: "" };
}

/** The share of the payout, in percent, a season total earns: the largest step crossed. */
export function grade(trigger: string, totalTenths: number, tiers: Tier[]): number {
  let g = 0;
  for (const t of tiers) {
    const hit = trigger === "RAIN_BELOW" ? totalTenths < t.threshold_tenths : totalTenths > t.threshold_tenths;
    if (hit) g = Math.max(g, t.pct);
  }
  return g;
}
