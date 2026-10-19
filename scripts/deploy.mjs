/**
 * Deploy HarvestShield to GenLayer Studio Next and verify the bytes.
 *
 *   node scripts/deploy.mjs [label]            deploy contracts/harvestshield.py, record it under label
 *   node scripts/deploy.mjs verify 0x…         fetch the deployed source, diff it byte for byte
 *
 * Signs with the OPERATOR key in .data/keys.json (gitignored, never printed).
 * Deployments are recorded in .data/deployments.json with the source digest.
 */
import { createAccount, createClient } from "genlayer-js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EXPLORER, chain, leaderOf, loadKeys, plainFees, resultText, rpc, waitFinal } from "./lib.mjs";

const SOURCE = fileURLToPath(new URL(process.env.SOURCE ?? "../contracts/harvestshield.py", import.meta.url));
const RECORD = fileURLToPath(new URL("../.data/deployments.json", import.meta.url));
const sha = (s) => createHash("sha256").update(s, "utf-8").digest("hex");

async function deploy(label) {
  const account = createAccount(loadKeys().OPERATOR.pk);
  const client = createClient({ chain, account });
  const code = readFileSync(SOURCE, "utf-8");
  if (code.includes("\r")) throw new Error("the contract carries CR bytes; normalize to LF first");
  console.log(`deploying contracts/harvestshield.py (sha256 ${sha(code)}) on chain ${chain.id}`);
  const hash = await client.deployContract({ code, args: [], fees: await plainFees(client) });
  console.log(`deploy tx ${hash}`);
  const t = await waitFinal(hash, { label: "deploy", tries: 120 });
  const leader = leaderOf(t);
  if (leader?.execution_result !== "SUCCESS") {
    console.error(resultText(leader));
    console.error(String(leader?.genvm_result?.stderr ?? "").slice(-1800));
    process.exit(1);
  }
  const address = t.data?.contract_address;
  const log = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, "utf-8")) : [];
  log.push({ label, address, tx: hash, source_sha256: sha(code), at: new Date().toISOString() });
  writeFileSync(RECORD, JSON.stringify(log, null, 2));
  console.log(`CONTRACT ${address}\n${EXPLORER}/address/${address}`);
}

async function verify(address) {
  const r = await rpc("gen_getContractCode", [address]);
  const raw = typeof r.result === "string" ? r.result : (r.result?.code ?? "");
  const live = raw.startsWith("# ") ? raw : Buffer.from(raw, "base64").toString("utf-8");
  const repo = readFileSync(SOURCE, "utf-8");
  console.log(`live  sha256 ${sha(live)}  (${live.length} chars)`);
  console.log(`repo  sha256 ${sha(repo)}  (${repo.length} chars)`);
  if (live !== repo) {
    const a = live.split("\n");
    const b = repo.split("\n");
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) {
        console.log(`first difference at line ${i + 1}\n  live: ${a[i]}\n  repo: ${b[i]}`);
        break;
      }
    }
    console.error("verify: the deployed source does NOT match contracts/harvestshield.py");
    process.exit(1);
  }
  console.log("verify: byte-for-byte identical");
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "verify") await verify(arg);
else await deploy(cmd ?? "unlabelled");
