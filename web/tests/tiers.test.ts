/** The builder's step rules and the app's grades, held to the contract's. */
import { describe, expect, it } from "vitest";

import { actsFor, alternatives, betterFor, contestable, vegetationOpenUntil } from "@/lib/acts";
import { checkTiers, grade } from "@/lib/tiers";
import { at, FARMER, H, INSURER, reading, STRANGER, T0 } from "./fixtures";

const STEPS = [{ threshold_tenths: 1400, pct: 40 }, { threshold_tenths: 1000, pct: 70 }, { threshold_tenths: 500, pct: 100 }];

describe("payout steps", () => {
  it("keeps valid steps mildest first", () => {
    const r = checkTiers("RAIN_BELOW", [...STEPS].reverse());
    expect(r.problem).toBe("");
    expect(r.tiers.map((t) => t.pct)).toEqual([40, 70, 100]);
  });
  it("refuses what the contract refuses", () => {
    expect(checkTiers("RAIN_BELOW", []).problem).toMatch(/1 to 4/);
    expect(checkTiers("RAIN_BELOW", [...STEPS, STEPS[0]!, STEPS[1]!]).problem).toMatch(/1 to 4/);
    expect(checkTiers("RAIN_BELOW", [{ threshold_tenths: 1400, pct: 0 }]).problem).toMatch(/1% to 100%/);
    expect(checkTiers("RAIN_BELOW", [{ threshold_tenths: 0, pct: 50 }]).problem).toMatch(/above 0/);
    expect(checkTiers("RAIN_BELOW", [{ threshold_tenths: 1400, pct: 40 }, { threshold_tenths: 1500, pct: 70 }]).problem).toMatch(/worse season/);
    expect(checkTiers("RAIN_BELOW", [{ threshold_tenths: 1400, pct: 40 }, { threshold_tenths: 1000, pct: 40 }]).problem).toMatch(/worse season/);
    expect(checkTiers("RAIN_ABOVE", STEPS).problem).toMatch(/worse season/);
    expect(checkTiers("RAIN_ABOVE", [{ threshold_tenths: 2000, pct: 50 }, { threshold_tenths: 3000, pct: 100 }]).problem).toBe("");
  });
  it("grades a total at the largest step it crosses", () => {
    for (const [total, g] of [[1400, 0], [1399, 40], [1000, 40], [999, 70], [500, 70], [499, 100]] as const) {
      expect(grade("RAIN_BELOW", total, STEPS)).toBe(g);
    }
    expect(grade("RAIN_ABOVE", 3001, [{ threshold_tenths: 2000, pct: 50 }, { threshold_tenths: 3000, pct: 100 }])).toBe(100);
  });
});

describe("contests on grades", () => {
  it("counts the station as another reading only when it graded the season", () => {
    const y = at("READ", { reading: reading({ grade: 40, other_grade: 40, station: { status: "OK", grade: 100 } }) });
    expect(alternatives(y)).toEqual([40, 100]);
    expect(contestable(y)).toBe(true);
    expect(betterFor(y, "FARMER")).toBe(true);
    expect(betterFor(y, "INSURER")).toBe(false);
    const bad = at("READ", { reading: reading({ grade: 40, other_grade: 40, station: { status: "TOO_FAR", km: 80 } }) });
    expect(contestable(bad)).toBe(false);
  });
  it("lets the insurer contest a grade another reading puts lower", () => {
    const y = at("READ", { reading: reading({ grade: 70, other_grade: 40 }) });
    expect(actsFor(y, INSURER, T0).find((a) => a.id === "contest")?.ready).toBe(true);
    expect(actsFor(y, FARMER, T0).find((a) => a.id === "contest")?.ready).toBe(false);
  });
});

describe("satellite vegetation", () => {
  it("opens while the reading can be contested or decided, and only once", () => {
    expect(vegetationOpenUntil(at("ACTIVE"))).toBe("");
    const read = at("READ");
    expect(vegetationOpenUntil(read)).toBe(read.contest_ends);
    expect(vegetationOpenUntil(at("CONTESTED"))).toBe(at("CONTESTED").response_ends);
    expect(vegetationOpenUntil(at("APPEALED"))).toBe(at("APPEALED").appeal!.evidence_ends);
    expect(vegetationOpenUntil(at("DECIDED"))).toBe("");
    const recorded = at("READ", { vegetation: { at: "", seasons: {}, window_mean: 1, baseline_mean: 1, anomaly_pct: 0, digest: "" } });
    expect(vegetationOpenUntil(recorded)).toBe("");
  });
  it("is an act for anyone, until its window closes", () => {
    const v = (now: number) => actsFor(at("READ"), STRANGER, now).find((a) => a.id === "read_vegetation");
    expect(v(T0 + H)?.ready).toBe(true);
    expect(v(T0 + H + 1)?.ready).toBe(false);
  });
});
