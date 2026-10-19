// One address everywhere: the deployment of record the app reads must be the
// one the committed contract schema was read from, the one the live proof log
// was recorded on, and the one the documents name. A judge clones and runs; a
// checkout whose config surfaces disagree does not reproduce what was judged.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// A transaction hash also begins with 40 hex characters: keep a right boundary.
const ADDRESS = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;
const at = (path) => fileURLToPath(new URL(path, import.meta.url));
const shown = (path) => path.replace(/^(\.\.\/)+/, "");
const problems = [];
const read = (path) => {
  if (existsSync(at(path))) return readFileSync(at(path), "utf8");
  problems.push(`${shown(path)} is missing`);
  return "";
};

const record = read("../lib/config.ts").match(/RECORD_ADDRESS = "(0x[0-9a-fA-F]{40})"/)?.[1];
if (!record) {
  console.error("lib/config.ts names no RECORD_ADDRESS");
  process.exit(1);
}
const same = (a) => String(a).toLowerCase() === record.toLowerCase();

const schema = JSON.parse(read("../lib/contract-schema.json") || "{}");
if (!same(schema.address ?? "")) problems.push(`lib/contract-schema.json was read from ${schema.address || "nowhere"}`);

// Lines that name "the deployment of record" must name this one.
for (const doc of ["../../README.md", "../../docs/live-proof.md"]) {
  const text = read(doc);
  const lines = text.split("\n").filter((l) => /deployment of record/i.test(l) && /0x[0-9a-fA-F]{40}/.test(l));
  if (text && !lines.length) problems.push(`${shown(doc)} never names the deployment of record`);
  for (const line of lines) {
    for (const addr of line.match(ADDRESS) ?? []) {
      if (!same(addr)) problems.push(`${shown(doc)} names ${addr} as the deployment of record`);
    }
  }
}

// The proof log is checked whole: it was recorded against one contract.
const log = read("../../docs/proof-run.txt");
const found = new Set((log.match(ADDRESS) ?? []).filter((a) => /^0x/.test(a)));
if (log && ![...found].some(same)) problems.push("docs/proof-run.txt was not recorded on the deployment of record");

if (problems.length) {
  console.error(`The deployment of record is ${record}, but:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`one address everywhere: ${record}`);
