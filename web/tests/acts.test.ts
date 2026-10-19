import { describe, expect, it } from "vitest";

import { actsFor, contestable, dayPassed, roleOf, waitingOn, type ActId } from "@/lib/acts";
import { POLICY_STATES } from "@/lib/types";

import { active, at, FARMER, H, INSURER, reading, STRANGER, T0 } from "./fixtures";

const ready = (a: ReturnType<typeof actsFor>, id: ActId) => a.find((x) => x.id === id)?.ready;
const ids = (a: ReturnType<typeof actsFor>) => a.map((x) => x.id);

describe("roles and every state", () => {
  it("knows the parties", () => {
    expect(roleOf(active(), FARMER.toLowerCase())).toBe("FARMER");
    expect(roleOf(active(), INSURER)).toBe("INSURER");
    expect(roleOf(active(), STRANGER)).toBe("");
  });
  for (const s of POLICY_STATES) {
    it(`answers in ${s} for everyone`, () => {
      for (const who of [FARMER, INSURER, STRANGER, ""]) {
        expect(() => actsFor(at(s), who, T0)).not.toThrow();
        if (!who) expect(actsFor(at(s), who, T0)).toEqual([]);
      }
      expect(waitingOn(at(s), T0)).not.toBe("");
    });
  }
});

describe("reading (read_index compares dates)", () => {
  it("opens the day after the window ends, to anyone", () => {
    expect(dayPassed("2026-08-14", Date.parse("2026-08-14T23:59:00Z"))).toBe(false);
    expect(dayPassed("2026-08-14", Date.parse("2026-08-15T00:00:00Z"))).toBe(true);
    const fwd = active({ window_end: "2026-09-10" });
    expect(ready(actsFor(fwd, STRANGER, T0), "read_index")).toBe(false);
    expect(ready(actsFor(active(), STRANGER, T0), "read_index")).toBe(true);
  });
  it("voids only after the long stop", () => {
    expect(ready(actsFor(active(), STRANGER, T0), "void_unread")).toBe(false);
  });
});

describe("contest (_contest)", () => {
  it("is for the side the reading went against, when the datasets disagree", () => {
    expect(ready(actsFor(at("READ"), FARMER, T0), "contest")).toBe(true);
    expect(ready(actsFor(at("READ"), INSURER, T0), "contest")).toBe(false);
    const agree = at("READ", { reading: reading({ other_triggers: false }) });
    expect(contestable(agree)).toBe(false);
    expect(ready(actsFor(agree, FARMER, T0), "contest")).toBe(false);
    const partial = at("READ", { reading: reading({ other_triggers: null }) });
    expect(ready(actsFor(partial, FARMER, T0), "contest")).toBe(false);
  });
  it("closes with its period, when settling opens", () => {
    expect(ready(actsFor(at("READ"), FARMER, T0 + H), "contest")).toBe(true);
    expect(ready(actsFor(at("READ"), FARMER, T0 + H), "finalize")).toBe(false);
    expect(ready(actsFor(at("READ"), FARMER, T0 + H + 1), "contest")).toBe(false);
    expect(ready(actsFor(at("READ"), STRANGER, T0 + H + 1), "finalize")).toBe(true);
  });
  it("is offered to strangers not at all", () => {
    expect(ids(actsFor(at("READ"), STRANGER, T0))).not.toContain("contest");
  });
});

describe("answer and decide (answer, decide_contest)", () => {
  it("lets only the other side answer, inside the period", () => {
    expect(ids(actsFor(at("CONTESTED"), FARMER, T0))).not.toContain("answer");
    expect(ready(actsFor(at("CONTESTED"), INSURER, T0), "answer")).toBe(true);
    expect(ready(actsFor(at("CONTESTED"), INSURER, T0 + H + 1), "answer")).toBe(false);
  });
  it("decides after an answer or after the period, never for a stranger", () => {
    expect(ready(actsFor(at("CONTESTED"), FARMER, T0), "decide_contest")).toBe(false);
    const answered = at("CONTESTED");
    answered.contest!.answer = "No.";
    expect(ready(actsFor(answered, FARMER, T0), "decide_contest")).toBe(true);
    expect(ready(actsFor(at("CONTESTED"), FARMER, T0 + H + 1), "decide_contest")).toBe(true);
    expect(ids(actsFor(at("CONTESTED"), STRANGER, T0))).not.toContain("decide_contest");
  });
  it("lapses only after the long stop", () => {
    expect(ready(actsFor(at("CONTESTED"), STRANGER, T0 + 4 * H), "lapse_contest")).toBe(false);
    expect(ready(actsFor(at("CONTESTED"), STRANGER, T0 + 4 * H + 1), "lapse_contest")).toBe(true);
  });
});

describe("appeal (appeal)", () => {
  it("is for a side the decision left short of its best", () => {
    expect(ready(actsFor(at("DECIDED"), FARMER, T0), "appeal")).toBe(true);
    expect(ready(actsFor(at("DECIDED"), INSURER, T0), "appeal")).toBe(false);
    const voided = at("DECIDED", { decision: { verdict: "NO_RELIABLE_READING", outcome: null, round: 1, against: ["FARMER", "INSURER"] } });
    expect(ready(actsFor(voided, INSURER, T0), "appeal")).toBe(true);
    expect(ready(actsFor(voided, FARMER, T0), "appeal")).toBe(true);
  });
  it("closes with its window, when settling opens", () => {
    expect(ready(actsFor(at("DECIDED"), FARMER, T0 + H + 1), "appeal")).toBe(false);
    expect(ready(actsFor(at("DECIDED"), STRANGER, T0 + H + 1), "finalize")).toBe(true);
  });
  it("is answered by the other side and decided after the period", () => {
    expect(ready(actsFor(at("APPEALED"), INSURER, T0), "answer")).toBe(true);
    expect(ready(actsFor(at("APPEALED"), FARMER, T0), "decide_appeal")).toBe(false);
    expect(ready(actsFor(at("APPEALED"), FARMER, T0 + H + 1), "decide_appeal")).toBe(true);
    expect(ready(actsFor(at("APPEALED"), STRANGER, T0 + 4 * H), "lapse_appeal")).toBe(false);
    expect(ready(actsFor(at("APPEALED"), STRANGER, T0 + 4 * H + 1), "lapse_appeal")).toBe(true);
  });
});

describe("settled", () => {
  it("offers nothing", () => {
    for (const s of ["SETTLED", "VOID"] as const) {
      for (const who of [FARMER, INSURER, STRANGER]) expect(actsFor(at(s), who, T0)).toEqual([]);
    }
  });
});
