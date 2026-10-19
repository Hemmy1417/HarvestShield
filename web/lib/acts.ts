/**
 * What a viewer can do on a policy now, and why not when they cannot. Pure:
 * a function of the policy, the viewer and a clock. Every rule mirrors the
 * check the contract makes in the write it names; tests/acts.test.ts walks
 * every state, role and both sides of every window.
 */
import { sameAddress } from "./chain";
import { span } from "./present";
import type { Policy, Role } from "./types";

export type ActId = "read_index" | "void_unread" | "contest" | "answer" | "decide_contest" | "lapse_contest"
  | "appeal" | "decide_appeal" | "lapse_appeal" | "finalize";

export interface Act { id: ActId; title: string; ready: boolean; why: string }

export const READ_LONG_STOP_DAYS = 45;
const DAY = 86_400_000;

export function roleOf(y: Pick<Policy, "farmer" | "insurer">, address: string): Role | "" {
  if (sameAddress(address, y.farmer)) return "FARMER";
  if (sameAddress(address, y.insurer)) return "INSURER";
  return "";
}

const ms = (iso: string) => (iso ? new Date(iso).getTime() : NaN);
/** Strictly after, as the contract's `now > end` reads it. */
export const past = (iso: string, nowMs: number) => nowMs > ms(iso);
/** The contract compares dates: a window ending on a day is readable from the next UTC day. */
export const dayPassed = (isoDay: string, nowMs: number) =>
  new Date(nowMs).toISOString().slice(0, 10) > isoDay;

function opens(iso: string, nowMs: number, what: string): string {
  const left = (ms(iso) - nowMs) / 1000;
  return `${what} ${left > 0 ? `in ${span(left)}` : "about now"}.`;
}

/** Who a reading goes against: the insurer if it pays, the farmer if it does not. */
export const against = (triggered: boolean): Role => (triggered ? "INSURER" : "FARMER");

/** Whether the two datasets disagree about the trigger, which is what makes a contest possible. */
export function contestable(y: Policy): boolean {
  const r = y.reading;
  return !!r && r.other_triggers !== null && r.other_triggers !== r.triggered;
}

export function actsFor(y: Policy, address: string, nowMs: number): Act[] {
  const me = roleOf(y, address);
  const out: Act[] = [];
  const add = (id: ActId, title: string, ready: boolean, why = "") => out.push({ id, title, ready, why: ready ? "" : why });
  if (!address) return out;

  if (y.state === "ACTIVE") {
    const ended = dayPassed(y.window_end, nowMs);
    add("read_index", "Read the rainfall", ended,
      `The window ends on ${y.window_end}; the reading opens the day after, once both datasets cover it.`);
    const stop = new Date(new Date(`${y.window_end}T00:00:00Z`).getTime() + READ_LONG_STOP_DAYS * DAY).toISOString().slice(0, 10);
    add("void_unread", "Void it for want of a reading", dayPassed(stop, nowMs),
      `Only if no complete reading is obtained by ${stop}.`);
  }

  if (y.state === "READ" && y.reading) {
    const open = !past(y.contest_ends, nowMs);
    if (me) {
      const loser = against(y.reading.triggered);
      add("contest", "Contest the reading", open && me === loser && contestable(y),
        !open ? "The contest period has ended."
          : me !== loser ? "The reading went your way."
          : "Both datasets put the season on the same side of the threshold, so there is nothing to contest.");
    }
    add("finalize", "Settle on the reading", !open, opens(y.contest_ends, nowMs, "The contest period closes"));
  }

  if (y.state === "CONTESTED" && y.contest) {
    const c = y.contest;
    const open = !past(y.response_ends, nowMs);
    if (me && me !== c.by) {
      add("answer", "Answer the contest", open && !c.answer, c.answer ? "Your answer is filed." : "The period for an answer has ended.");
    }
    if (me) {
      add("decide_contest", "Ask the validators to decide", !!c.answer || !open,
        opens(y.response_ends, nowMs, "The other side may still answer. That period closes"));
    }
    add("lapse_contest", "Let the reading stand", past(y.decision_long_stop, nowMs),
      opens(y.decision_long_stop, nowMs, "Only if the contest is never decided. That opens"));
  }

  if (y.state === "DECIDED" && y.decision) {
    const open = !past(y.appeal_ends, nowMs);
    if (me) {
      add("appeal", "Appeal the decision", open && y.decision.against.includes(me),
        !open ? "The appeal window has closed." : "The decision gave you the best outcome it could.");
    }
    add("finalize", "Settle on the decision", !open, opens(y.appeal_ends, nowMs, "The appeal window closes"));
  }

  if (y.state === "APPEALED" && y.appeal) {
    const a = y.appeal;
    const open = !past(a.evidence_ends, nowMs);
    if (me && me !== a.by) {
      add("answer", "Answer the appeal", open && !a.answer, a.answer ? "Your answer is filed." : "The period for an answer has ended.");
    }
    if (me) {
      add("decide_appeal", "Ask the validators to decide the appeal", !!a.answer || !open,
        opens(a.evidence_ends, nowMs, "The other side may still answer. That period closes"));
    }
    add("lapse_appeal", "Let the decision stand", past(a.lapse_at, nowMs),
      opens(a.lapse_at, nowMs, "Only if the appeal is never decided. That opens"));
  }

  return out;
}

/** A sentence on what the policy is waiting for. */
export function waitingOn(y: Policy, nowMs: number): string {
  switch (y.state) {
    case "ACTIVE": return dayPassed(y.window_end, nowMs)
      ? "The window has ended. Anyone can ask for the reading."
      : `Cover runs until ${y.window_end}.`;
    case "READ": return "The reading stands unless the side it went against contests it.";
    case "CONTESTED": return "The contest is open. The other side may answer, then either side asks for a decision.";
    case "DECIDED": return "The decision stands unless the side it went against appeals.";
    case "APPEALED": return "The appeal is open for an answer, then a decision.";
    case "SETTLED": return "Settled. Each side draws what it is owed from the bar at the top.";
    case "VOID": return "Void. The premium went back to the farmer.";
    default: return "";
  }
}
