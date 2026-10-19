/**
 * GenLayer Studio Next, the one network this build speaks to. The network
 * itself resolves in ./network (env-overridable, shared by wallet, SDK and
 * Kit); these names are what the rest of the app imports.
 */
import { GENLAYER_CHAIN, GENLAYER_CHAIN_ID, GENLAYER_CHAIN_ID_HEX, GENLAYER_NETWORK } from "./network";

export const STUDIO_NEXT = GENLAYER_CHAIN;
export const RPC_URL: string = GENLAYER_CHAIN.rpcUrls.default.http[0] ?? "https://studio-dev.genlayer.com/api";
export const CHAIN_ID = GENLAYER_CHAIN_ID;
export const CHAIN_HEX = GENLAYER_CHAIN_ID_HEX;

export const EXPLORER = "https://explorer-studio-dev.genlayer.com";
export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (addr: string) => `${EXPLORER}/address/${addr}`;

export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function truncAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

/** Errors worth an automatic retry: rate limits, a saturated node and transport drops. */
export function isTransient(e: unknown): boolean {
  const text = String((e as Error)?.message ?? e ?? "").toLowerCase();
  return (
    text.includes("429") ||
    text.includes("-32029") ||
    // Studio Next: "Server busy: all 8 execution slots occupied, retry later"
    text.includes("server busy") ||
    text.includes("retry later") ||
    text.includes("rate") ||
    text.includes("fetch failed") ||
    text.includes("econnreset") ||
    text.includes("network") ||
    text.includes("timeout") ||
    text.includes("502") ||
    text.includes("503")
  );
}

/** The network entry a wallet adds. */
export const WALLET_NETWORK = GENLAYER_NETWORK;
