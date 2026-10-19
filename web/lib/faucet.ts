/**
 * Test GEN from Studio's own faucet (`sim_fundAccount`), so a visitor can pay
 * a deposit and a bond without leaving this page. Studio Next only: the
 * method does not exist on a real network, and the amount is in atto.
 */
import { RPC_URL } from "./chain";

export const FAUCET_GEN = 20n;

export async function fundFromFaucet(address: string): Promise<void> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "sim_fundAccount",
      params: [address, (FAUCET_GEN * 10n ** 18n).toString()],
    }),
  });
  const data = (await res.json()) as { error?: { message?: string } };
  if (!res.ok || data.error) throw new Error(data.error?.message || `The faucet answered ${res.status}.`);
}

/** The wallet's native balance, in wei, read from the RPC. */
export async function nativeBalance(address: string): Promise<bigint> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
  });
  const data = (await res.json()) as { result?: string };
  return BigInt(data.result ?? "0x0");
}
