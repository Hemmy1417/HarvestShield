/** Shared chain config and transport for every HarvestShield script. */
import { studioDevnet } from "genlayer-js/chains";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const RPC = process.env.GENLAYER_RPC_URL ?? "https://studio-dev.genlayer.com/api";
export const chain = { ...studioDevnet, name: "GenLayer Studio Next", rpcUrls: { default: { http: [RPC] } } };
export const EXPLORER = "https://explorer-studio-dev.genlayer.com";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const FEE_FLOOR = 10n ** 15n;
export const GEN = 10n ** 18n;

export const KEYS_PATH = fileURLToPath(new URL("../.data/keys.json", import.meta.url));
export const loadKeys = () => JSON.parse(readFileSync(KEYS_PATH, "utf-8"));

/** Raw JSON-RPC with transient retries; waits out Studio Next's 30 reads a minute. */
export async function rpc(method, params) {
  let lastErr;
  for (let i = 0; i < 8; i++) {
    try {
      const res = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 harvestshield-scripts" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const text = await res.text();
      if (text.trimStart().startsWith("<")) throw new Error(`HTTP ${res.status} (html)`);
      const json = JSON.parse(text);
      if (json?.error?.code === -32029 || /rate limit/i.test(json?.error?.message ?? "")) {
        await sleep(20000);
        continue;
      }
      return json;
    } catch (e) {
      lastErr = e;
      await sleep(3000 * (i + 1));
    }
  }
  throw lastErr ?? new Error(`${method}: rate limited`);
}

/** Wait for FINALIZED. FINALIZED is not success: callers check the leader. */
/** How long a transaction may sit in one non-final status before we call it stalled. */
const STALL_MS = 8 * 60 * 1000;

export async function waitFinal(hash, { tries = 225, label = "tx" } = {}) {
  let sameSince = Date.now();
  let lastStatus = null;
  for (let i = 0; i < tries; i++) {
    await sleep(4000);
    const t = (await rpc("eth_getTransactionByHash", [hash])).result;
    const status = t?.status ?? t?.statusName;
    if (status === "FINALIZED") return t;
    if (status === "CANCELED" || status === "UNDETERMINED") {
      const err = new Error(`${label} ${status}`);
      err.tx = t;
      throw err;
    }
    if (status !== lastStatus) {
      lastStatus = status;
      sameSince = Date.now();
    } else if (Date.now() - sameSince > STALL_MS) {
      // Studio Next can leave a transaction in COMMITTING or REVEALING with
      // no path forward: the lifecycle says NoOp and nothing behind it in the
      // contract's queue moves either. Waiting longer never helps.
      const lc = (await rpc("gen_getTransactionLifecycle", [{ txId: hash }])).result;
      if (lc?.resolutionAction === "NoOp" && !lc?.decisionActive) {
        const err = new Error(
          `${label}: the network stalled this transaction in ${status} with no way forward `
          + `(${t?.result_name ?? "no result"}); the contract's queue is blocked behind it, so redeploy and rerun`);
        err.tx = t;
        err.stalled = true;
        throw err;
      }
      sameSince = Date.now();
    }
    if (i % 10 === 9) console.log(`  … ${label} ${status ?? "pending"}`);
  }
  throw new Error(`${label}: no finality after ${(tries * 4) / 60} minutes`);
}

export function leaderOf(t) {
  const arr = t?.consensus_data?.leader_receipt ?? [];
  return arr.find((x) => x?.mode !== "validator") ?? arr[0];
}

/** The text a refused write carries: base64 with a leading tag byte. */
export function resultText(receipt) {
  const res = receipt?.result;
  return typeof res === "string"
    ? Buffer.from(res, "base64").toString("utf-8").replace(/[^\x20-\x7e]/g, " ").trim()
    : "";
}

/** Plain fees for a write that moves no value out. */
export async function plainFees(client) {
  const est = await client.estimateTransactionFees();
  return { distribution: est.distribution, feeValue: est.feeValue > FEE_FLOOR ? est.feeValue : FEE_FLOOR };
}

/**
 * Fees for a TRANSFER-EMITTING write (claim): the fee simulation runs the
 * call and returns messageAllocations; without them the leader dies with
 * `fee no_matching_allocation # external` even though the tx finalizes.
 */
export async function transferFees(client, { address, functionName, args, value = 0n }) {
  const est = await client.estimateTransactionFeesForWrite({ address, functionName, args, value });
  if (!est.messageAllocations?.length) throw new Error("the fee simulation returned no message allocations");
  const feeValue = est.feeValue > FEE_FLOOR ? est.feeValue : FEE_FLOOR;
  return { distribution: est.distribution, feeValue, messageAllocations: est.messageAllocations };
}

/**
 * Every node's model, vote and diagnostic lines, for every leader rotation
 * (consensus_history), not only the last one.
 */
export async function dumpReceipt(hash, tags = ["[ROUND]", "[DISAGREE]", "[LOOK]"]) {
  const t = (await rpc("eth_getTransactionByHash", [hash])).result;
  const rotations = t?.consensus_history?.consensus_results?.length
    ? t.consensus_history.consensus_results.map((r) => ({
        label: r.consensus_round, leader: r.leader_result ?? [], validators: r.validator_results ?? [] }))
    : [{ label: "final", leader: t?.consensus_data?.leader_receipt ?? [], validators: t?.consensus_data?.validators ?? [] }];
  console.log(`receipt ${hash} status=${t?.status} result=${t?.result_name} rotations=${rotations.length}`);
  const out = [];
  rotations.forEach((rot, i) => {
    console.log(` rotation ${i + 1}: ${rot.label}`);
    const rows = [...rot.leader.map((r) => ({ ...r, _from: "leader" })), ...rot.validators.map((r) => ({ ...r, _from: "validator" }))];
    for (const r of rows) {
      const model = r?.node_config?.primary_model?.model ?? r?.node_config?.model ?? "?";
      const lines = String(r?.genvm_result?.stdout ?? "").split("\n").filter((l) => tags.some((tag) => l.includes(tag)));
      console.log(`  ${r._from}/${r?.mode ?? "?"} vote=${r?.vote ?? "?"} model=${model} exec=${r?.execution_result ?? "?"}`);
      for (const l of lines) console.log(`     ${l.slice(0, 420)}`);
      out.push({ rotation: i + 1, from: r._from, mode: r?.mode, vote: r?.vote, model, exec: r?.execution_result, lines });
    }
  });
  return { tx: t, nodes: out };
}
