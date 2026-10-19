// Mutation sweep for the web rules (pnpm mutate): break one rule at a time in
// web/lib, run the tests that cover it, and require a failure. Every file is
// restored in a finally block and compared at the end.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = fileURLToPath(new URL("../..", import.meta.url));
const VITEST = join(WEB, "node_modules/vitest/vitest.mjs");

const M = [
  ["acts", "a boundary counts as passed when reached",
   "export const past = (iso: string, nowMs: number) => nowMs > ms(iso);",
   "export const past = (iso: string, nowMs: number) => nowMs >= ms(iso);"],
  ["acts", "the reading opens on the window's last day",
   "  new Date(nowMs).toISOString().slice(0, 10) > isoDay;",
   "  new Date(nowMs).toISOString().slice(0, 10) >= isoDay;"],
  ["acts", "the winner may contest",
   "      add(\"contest\", \"Contest the reading\", open && me === loser && contestable(y),",
   "      add(\"contest\", \"Contest the reading\", open && contestable(y),"],
  ["acts", "a contest needs no disagreement",
   "  return !!r && r.other_triggers !== null && r.other_triggers !== r.triggered;",
   "  return !!r;"],
  ["acts", "the contestant answers itself",
   "    if (me && me !== c.by) {",
   "    if (me) {"],
  ["acts", "a decision before the answer or period",
   "      add(\"decide_contest\", \"Ask the validators to decide\", !!c.answer || !open,",
   "      add(\"decide_contest\", \"Ask the validators to decide\", true,"],
  ["acts", "anyone may appeal",
   "      add(\"appeal\", \"Appeal the decision\", open && y.decision.against.includes(me),",
   "      add(\"appeal\", \"Appeal the decision\", open,"],
  ["acts", "a contest lapses at once",
   "    add(\"lapse_contest\", \"Let the reading stand\", past(y.decision_long_stop, nowMs),",
   "    add(\"lapse_contest\", \"Let the reading stand\", true,"],
  ["acts", "an appeal lapses at once",
   "    add(\"lapse_appeal\", \"Let the decision stand\", past(a.lapse_at, nowMs),",
   "    add(\"lapse_appeal\", \"Let the decision stand\", true,"],
  ["acts", "settling inside the contest period",
   "    add(\"finalize\", \"Settle on the reading\", !open, opens(y.contest_ends, nowMs, \"The contest period closes\"));",
   "    add(\"finalize\", \"Settle on the reading\", true, opens(y.contest_ends, nowMs, \"The contest period closes\"));"],
  ["present", "tenths read as millimetres",
   "  return `${(tenths / 10).toLocaleString(\"en-GB\", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mm`;",
   "  return `${tenths.toLocaleString(\"en-GB\", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mm`;"],
  ["present", "dates in local time",
   "  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;",
   "  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;"],
  ["present", "the trigger sentence flips",
   "  return `${trigger === \"RAIN_BELOW\" ? \"less\" : \"more\"} than ${mm(tenths)} of rain`;",
   "  return `${trigger === \"RAIN_BELOW\" ? \"more\" : \"less\"} than ${mm(tenths)} of rain`;"],
  ["sources", "the window's last day is dropped",
   "  const end = addDays(start, days - 1);", "  const end = addDays(start, days - 2);"],
];

const files = { acts: "lib/acts.ts", present: "lib/present.ts", sources: "lib/sources.ts" };
const tests = { acts: "tests/acts.test.ts", present: "tests/present.test.ts", sources: "tests/present.test.ts" };
const [MAJOR, MINOR] = process.versions.node.split(".").map(Number);
// A timezone away from UTC, so local time differs from UTC even on a UTC runner.
const BASE = { ...process.env, TZ: "Pacific/Auckland" };
const ENV = MAJOR < 22 || (MAJOR === 22 && MINOR < 12)
  ? { ...BASE, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --experimental-require-module`.trim() }
  : BASE;

function run(t) {
  const r = spawnSync(process.execPath, [VITEST, "run", ...t.split(" ")], { cwd: WEB, encoding: "utf8", env: ENV });
  const tail = `${r.stdout}${r.stderr}`.match(/Tests\s+[^\n]+/)?.[0] ?? "no summary";
  return { ok: r.status === 0, tail: tail.replace(/\s+/g, " ").trim() };
}

const snapshot = Object.fromEntries(Object.values(files).map((f) => [f, readFileSync(join(WEB, f), "utf8")]));
let killed = 0;
const survivors = [];
for (const [area, name, from, to] of M) {
  const path = join(WEB, files[area]);
  const original = readFileSync(path, "utf8");
  if (original.split(from).length - 1 !== 1) {
    console.log(`BAD      ${name}: pattern not found once`);
    survivors.push(name);
    continue;
  }
  try {
    writeFileSync(path, original.replace(from, to));
    const r = run(tests[area]);
    if (r.ok) { survivors.push(name); console.log(`SURVIVED ${name}  (${r.tail})`); }
    else { killed++; console.log(`killed   ${name}  (${r.tail})`); }
  } finally {
    writeFileSync(path, original);
  }
}
const control = run("tests");
console.log(`control, the code as written: ${control.ok ? "passes" : "FAILS"} (${control.tail})`);
const changed = Object.entries(snapshot).filter(([f, t]) => readFileSync(join(WEB, f), "utf8") !== t).map(([f]) => f);
console.log(`files after restore: ${changed.length ? `CHANGED ${changed.join(", ")}` : "as they were"}`);
console.log(`${killed}/${M.length} mutants killed${survivors.length ? `; survivors: ${survivors.join(", ")}` : ""}`);
if (survivors.length || !control.ok || changed.length) process.exit(1);
