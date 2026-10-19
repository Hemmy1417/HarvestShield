/**
 * Read a deployment's own signatures and write them where the interface's
 * tests check every composed call against them.
 *
 *   node scripts/schema.mjs 0x…        writes web/lib/contract-schema.json
 *
 * The file records the address it was read from, and web/scripts/check-address.mjs
 * refuses a build in which that is not the deployment of record.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { rpc } from "./lib.mjs";

const ADDRESS = process.argv[2];
if (!/^0x[0-9a-fA-F]{40}$/.test(ADDRESS ?? "")) throw new Error("usage: node scripts/schema.mjs 0x…");

const got = await rpc("gen_getContractSchema", [ADDRESS]);
const methods = got.result?.methods;
if (!methods) throw new Error(`no schema at ${ADDRESS}: ${JSON.stringify(got.error ?? got).slice(0, 200)}`);

const writes = {};
for (const name of Object.keys(methods).sort()) {
  const m = methods[name];
  if (m.readonly) continue;
  writes[name] = { params: m.params.map((p) => p[0]), types: m.params.map((p) => p[1]),
                   payable: Boolean(m.payable) };
}
const out = fileURLToPath(new URL("../web/lib/contract-schema.json", import.meta.url));
writeFileSync(out, `${JSON.stringify({ address: ADDRESS, writes }, null, 2)}\n`);
console.log(`${Object.keys(writes).length} writes read from ${ADDRESS}`);
