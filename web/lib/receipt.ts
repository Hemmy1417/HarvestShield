/**
 * Reading one transaction's consensus record straight from Studio Next:
 * the contract's refusal sentence for a refused write, and for a round, the
 * panel itself: every leader rotation, each node's model, its vote, and the
 * lines the contract printed (the leader's reading, a validator's reason
 * for disagreeing). Nothing here is inferred; it is the receipt, decoded.
 */
import { RPC_URL } from "./chain";

type Raw = Record<string, unknown>;

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (data.error) throw new Error(String(data.error.message ?? `${method} refused`));
  return data.result;
}

async function fetchTx(hash: string): Promise<Raw> {
  const tx = (await rpc("eth_getTransactionByHash", [hash])) as Raw | null;
  if (!tx) throw new Error("The network does not know this transaction.");
  return tx;
}

function leaderRow(rows: Raw[]): Raw | undefined {
  return rows.find((r) => r.mode !== "validator") ?? rows[0];
}

/** The text a leader receipt carries: base64, one tag byte first. */
export function decodeResult(result: unknown): string {
  if (typeof result !== "string") return "";
  try {
    const bytes = Uint8Array.from(atob(result), (c) => c.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    // Control characters (the tag byte among them) read as spaces.
    return Array.from(text, (c) => (c.charCodeAt(0) < 0x20 ? " " : c)).join("").trim();
  } catch {
    return "";
  }
}

/** The JSON a successful write returned, decoded from its receipt. */
export async function returnedJson<T>(hash: string): Promise<T | null> {
  const tx = await fetchTx(hash);
  const cd = tx.consensus_data as { leader_receipt?: Raw[] } | undefined;
  const text = decodeResult(leaderRow(cd?.leader_receipt ?? [])?.result);
  const i = text.indexOf("{");
  const j = text.lastIndexOf("}");
  if (i < 0 || j < i) return null;
  try {
    return JSON.parse(text.slice(i, j + 1)) as T;
  } catch {
    return null;
  }
}

/** The contract's sentence for a refused write. */
export async function refusalOf(hash: string): Promise<string | null> {
  const tx = await fetchTx(hash);
  const cd = tx.consensus_data as { leader_receipt?: Raw[] } | undefined;
  const text = decodeResult(leaderRow(cd?.leader_receipt ?? [])?.result);
  return text || null;
}

/* ── the panel ── */
