/**
 * Turn a finished live run into docs/proof-run.txt (every transaction) and
 * docs/live-proof.md (what each part proved).
 *
 *   node scripts/proof-log.mjs 0x…
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ADDRESS = process.argv[2];
const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const run = JSON.parse(readFileSync(at(`../.data/proofs-${ADDRESS}.json`), "utf-8"));
if (!run.finished_at) throw new Error("that run has not finished");
const steps = Object.values(run.steps);

const lines = [
  "HarvestShield live proof on GenLayer Studio Next (chain 61997)",
  `contract ${run.address}`,
  `finished ${run.finished_at}: ${run.passed.length} checks, ${steps.length} transactions, ${(run.no_consensus ?? []).length} rounds without a majority`,
  "",
];
for (const s of steps) {
  lines.push(`${s.ok ? "ok      " : "refused "}${s.name.padEnd(24)} ${s.role.padEnd(9)} ${s.fn.padEnd(17)} ${s.hash}`);
  if (s.returned && s.returned.refused === true) lines.push(`         returned a refusal: ${String(s.returned.reason).slice(0, 140)}`);
  if (!s.ok) lines.push(`         ${s.text.replace(/\s+/g, " ").slice(0, 150)}`);
  if (s.fn === "read_index" && s.returned) lines.push(`         ${s.returned.selected} ${(s.returned.total_tenths / 10).toFixed(1)} mm, triggered ${s.returned.triggered}`);
  if ((s.fn === "decide_contest" || s.fn === "decide_appeal") && s.returned) {
    lines.push(`         verdict ${s.returned.verdict}, outcome ${s.returned.outcome}, ${s.returned.contest ?? s.returned.appeal}`);
  }
}
if (run.no_consensus?.length) lines.push("", "rounds without a majority (nothing recorded; asked again):", ...run.no_consensus.map((n) => `  ${n.name} ${n.hash}`));
lines.push("", "checks passed:", ...run.passed.map((p) => `  ${p}`), "", "observed (not asserted):", ...run.observed.map((o) => `  ${o}`));
writeFileSync(at("../docs/proof-run.txt"), `${lines.join("\n")}\n`);

const link = (s) => `[${s.name}](${s.explorer})`;
const by = (prefix) => steps.filter((s) => s.name.startsWith(prefix)).map(link).join(", ");
const md = [
  "# Live proof",
  "",
  `Run by \`scripts/proofs.mjs\` on the deployment of record \`${run.address}\`, GenLayer Studio Next, finished ${run.finished_at}, against real weather: Abuja, 1 to 14 August 2026.`,
  `${run.passed.length} checks passed across ${steps.length} transactions; ${(run.no_consensus ?? []).length} rounds had no majority and were asked again. Every transaction is in [proof-run.txt](proof-run.txt).`,
  "",
  "Every check below is an assertion in the script. What the validators were free to decide is listed as observed.",
  "",
  "| Part | What it proves | Transactions |",
  "|---|---|---|",
  `| Product 1 | A replay of Abuja's season with a 140 mm drought threshold; a wrong premium and another season are refused and credited back. | ${by("P1.")} |`,
  `| Policy A | Both datasets read under consensus; Open-Meteo governs and does not trigger while NASA POWER does; a stranger cannot contest; the farmer contests; a decision waits for the answer; the verdict maps to its outcome and the bond follows it; an appeal is decided on the same recorded series and settles. | ${by("A.")} |`,
  `| Policy B | A contest nobody decides lapses: the reading stands and the bond returns. | ${by("B.")} |`,
  `| Policy C | The side a reading favoured cannot contest it; a decided contest is appealed and the appeal lapses on the decision. | ${by("C.")} |`,
  `| Policy D | An uncontested reading settles after its period; no payout, premium to the insurer. | ${by("D.")} |`,
  `| Product 2, policy E | With a 200 mm threshold both datasets trigger: there is nothing to contest, and the payout comes out of the product's funding to the farmer. | ${[by("P2."), by("E.")].filter(Boolean).join(", ")} |`,
  `| Product 3, policy F | A forward product: no window starting today, no reading before the window ends, no void before the long stop, no withdrawal of reserved funding, and no sale once closed. | ${[by("P3."), by("F.")].filter(Boolean).join(", ")} |`,
  "",
  "Both sides then drew what they were owed with `claim`.",
  "",
  "## Observed, not asserted",
  "",
  ...run.observed.map((o) => `- ${o}`),
  "",
];
writeFileSync(at("../docs/live-proof.md"), md.join("\n"));
console.log(`wrote docs/proof-run.txt and docs/live-proof.md (${steps.length} transactions)`);
