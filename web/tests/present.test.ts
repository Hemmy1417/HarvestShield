import { describe, expect, it } from "vitest";

import {
  day, gen, mm, moment, outcomeSentence, policyName, policyState, productName, refusal, settledHow, source, span,
  toWei, triggerSentence, verdict,
} from "@/lib/present";
import { sourceUrl } from "@/lib/sources";
import { POLICY_STATES, VERDICTS } from "@/lib/types";

const RAW = /[A-Z]{2,}_[A-Z]|po-\d|pr-\d|\bundefined\b|\bnull\b|NaN/;

describe("words", () => {
  it("writes every state, verdict and settlement in words", () => {
    for (const s of POLICY_STATES) expect(policyState(s)).not.toMatch(RAW);
    for (const v of VERDICTS) expect(verdict(v)).not.toMatch(RAW);
    for (const h of ["READING", "CONTEST", "APPEAL", "CONTEST_LAPSED", "APPEAL_LAPSED", "NO_READING", "NO_RELIABLE_READING"]) {
      expect(settledHow(h)).not.toMatch(RAW);
    }
    expect(source("NASA_POWER")).toBe("NASA POWER");
    expect(policyName("po-00012")).toBe("Policy 12");
    expect(productName("pr-0003")).toBe("Product 3");
  });
  it("writes rain in millimetres from tenths", () => {
    expect(mm(1630)).toBe("163.0 mm");
    expect(mm(5)).toBe("0.5 mm");
    expect(mm(12345)).toBe("1,234.5 mm");
    expect(triggerSentence("RAIN_BELOW", 1400)).toBe("less than 140.0 mm of rain");
    expect(triggerSentence("RAIN_ABOVE", 2000)).toBe("more than 200.0 mm of rain");
  });
  it("writes each outcome", () => {
    expect(outcomeSentence(100)).toMatch(/full payout goes to the farmer/);
    expect(outcomeSentence(40)).toMatch(/40% of the payout goes to the farmer/);
    expect(outcomeSentence(0)).toMatch(/reserve returns to the pool/);
    expect(outcomeSentence(null)).toMatch(/void/);
  });
  it("writes money and time", () => {
    expect(gen(15n * 10n ** 17n)).toBe("1.5");
    expect(toWei("0.1")).toBe(10n ** 17n);
    expect(toWei("1.")).toBeNull();
    expect(day("2026-08-14")).toBe("14 Aug 2026");
    expect(day("2026-08-14T23:30:00Z")).toBe("14 Aug 2026");
    expect(moment("2026-09-01T09:05:00Z")).toBe("1 Sep 2026, 09:05 UTC");
    expect(span(600)).toBe("10 minutes");
    expect(span(86400)).toBe("1 day");
  });
  it("keeps the contract's sentence from a refusal", () => {
    expect(refusal("[EXPECTED] the reading went your way")).toBe("The reading went your way.");
  });
});

describe("dataset URLs match the contract's _source_url", () => {
  it("builds the Open-Meteo archive URL", () => {
    expect(sourceUrl("OPEN_METEO", "9.06", "7.49", "2026-08-01", 14)).toBe(
      "https://archive-api.open-meteo.com/v1/archive?latitude=9.06&longitude=7.49&start_date=2026-08-01&end_date=2026-08-14&daily=precipitation_sum&timezone=UTC");
  });
  it("builds the NASA POWER URL, across a month end", () => {
    expect(sourceUrl("NASA_POWER", "9.06", "7.49", "2026-08-25", 14)).toBe(
      "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR&community=AG&longitude=7.49&latitude=9.06&start=20260825&end=20260907&format=JSON");
  });
});
