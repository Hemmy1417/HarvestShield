/**
 * Every call the interface composes, checked against the deployment's own
 * schema (lib/contract-schema.json, read by scripts/schema.mjs): arity, types,
 * which writes take value, and that every write is reachable from the app.
 */
import { describe, expect, it } from "vitest";

import { calls, PAYABLE } from "@/lib/calls";
import schema from "@/lib/contract-schema.json";

type W = { params: string[]; types: string[]; payable: boolean };
const writes = schema.writes as Record<string, W>;

const typeOk = (t: string, v: unknown) =>
  t === "string" ? typeof v === "string" : t === "bool" ? typeof v === "boolean" : t === "int" ? typeof v === "number" || typeof v === "bigint" : true;

const composed = [
  calls.createProduct("{}"), calls.fundProduct("pr-0001", 1n), calls.withdrawCapital("pr-0001", 1n),
  calls.closeProduct("pr-0001"), calls.buyPolicy("pr-0001", "2026-08-01", 1n), calls.readIndex("po-00001"),
  calls.voidUnread("po-00001"), calls.contest("po-00001", "words", 1n), calls.answer("po-00001", "words"),
  calls.decideContest("po-00001"), calls.lapseContest("po-00001"), calls.appeal("po-00001", "words", 1n),
  calls.decideAppeal("po-00001"), calls.lapseAppeal("po-00001"), calls.finalize("po-00001"), calls.claim(),
  calls.filePhoto("po-00001", "caption", new Uint8Array([1])), calls.filePage("po-00001", "https://example.org/", "caption"),
];

describe("composed calls match the deployed schema", () => {
  for (const call of composed) {
    it(call.method, () => {
      const w = writes[call.method];
      expect(w, `${call.method} is not a write on the deployment`).toBeTruthy();
      expect(call.args.length).toBe(w!.params.length);
      call.args.forEach((a, i) => expect(typeOk(w!.types[i]!, a), `${call.method} arg ${i}`).toBe(true));
      expect(call.value !== undefined).toBe(w!.payable);
      expect(PAYABLE.has(call.method)).toBe(w!.payable);
    });
  }
  it("reaches every write", () => {
    expect([...new Set(composed.map((c) => c.method))].sort()).toEqual(Object.keys(writes).sort());
  });
});
