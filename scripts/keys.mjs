/**
 * Role keys for the scripts. Creates .data/keys.json with a fresh key for
 * each role (OPERATOR deploys; INSURER, FARMER and STRANGER act in the
 * proofs) when the file does not exist, then tops each account up
 * from Studio Next's faucet. The file is gitignored and no key is printed;
 * only addresses are.
 *
 *   node scripts/keys.mjs            create if missing, fund every role to at least 20 GEN
 */
import { createAccount, generatePrivateKey } from "genlayer-js";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { GEN, KEYS_PATH, loadKeys, rpc, sleep } from "./lib.mjs";

const ROLES = ["OPERATOR", "INSURER", "FARMER", "STRANGER"];
const TARGET = 20n * GEN;

if (!existsSync(KEYS_PATH)) {
  const keys = {};
  for (const role of ROLES) {
    const pk = generatePrivateKey();
    keys[role] = { pk, addr: createAccount(pk).address };
  }
  mkdirSync(dirname(KEYS_PATH), { recursive: true });
  writeFileSync(KEYS_PATH, JSON.stringify(keys, null, 2));
  console.log(`created ${KEYS_PATH}`);
}

const keys = loadKeys();
const balance = async (addr) => BigInt((await rpc("eth_getBalance", [addr, "latest"])).result ?? "0x0");

for (const role of ROLES) {
  // The faucet counts in atto and credits only the checksummed spelling.
  const addr = createAccount(keys[role].pk).address;
  let have = await balance(addr);
  if (have < TARGET) {
    const r = await rpc("sim_fundAccount", [addr, (TARGET - have).toString()]);
    if (r.error) throw new Error(`${role}: the faucet refused (${r.error.message})`);
    for (let i = 0; i < 15 && have < TARGET; i++) {
      await sleep(2000);
      have = await balance(addr);
    }
  }
  console.log(`${role.padEnd(10)} ${addr}  ${Number(have / 10n ** 14n) / 10_000} GEN`);
}
