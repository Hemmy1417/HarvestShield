/**
 * The typed read layer. Every contract view returns canonical JSON; callers
 * get parsed objects, null for absent records, or a ReadError a person can
 * act on.
 *
 * Reads go straight from this browser to Studio Next, BUDGETED: gen_call
 * allows 30 calls per rolling minute per IP, and the wallet's fee estimates
 * spend from the same bucket. Reads run concurrently up to a rolling budget
 * with headroom left for the wallet, retry transient failures, and cache
 * what cannot change (images, finished rounds) for good.
 */
import { createClient } from "genlayer-js";

import { isTransient, STUDIO_NEXT } from "./chain";
import { CONTRACT_ADDRESS, CONTRACT_CONFIGURED } from "./config";
import { sha256Hex } from "./hash";
import type { Backer, Balance, Config, Policy, PolicyList, Product, ProductList, Stats } from "./types";

type ReadClient = {
  readContract(args: { address: `0x${string}`; functionName: string; args: unknown[] }): Promise<unknown>;
};

export class ReadError extends Error {
  readonly transient: boolean;
  constructor(message: string, transient: boolean) {
    super(message);
    this.name = "ReadError";
    this.transient = transient;
  }
}

let client: ReadClient | null = null;
function readClient(): ReadClient {
  if (!CONTRACT_CONFIGURED) {
    throw new ReadError("No deployment is configured for this build.", false);
  }
  // No account: reads are unsigned. Requiring a wallet to look at a public
  // record would be a fake gate.
  client ??= createClient({ chain: STUDIO_NEXT }) as unknown as ReadClient;
  return client;
}

/* ── budget: at most READ_BUDGET call starts in any rolling minute ── */

export const READ_WINDOW_MS = 60_000;
export const READ_BUDGET = 22;
const MIN_GAP_MS = 120;

/**
 * When may the next call start, given the (ascending) start times already
 * planned? Pure, so the budget is testable to the millisecond. Mutates
 * `starts`: drops starts that left the window, appends the planned one.
 */
export function planStart(starts: number[], now: number): number {
  while (starts.length && (starts[0] ?? 0) <= now - READ_WINDOW_MS) starts.shift();
  let at = Math.max(now, (starts[starts.length - 1] ?? -Infinity) + MIN_GAP_MS);
  if (starts.length >= READ_BUDGET) {
    at = Math.max(at, (starts[starts.length - READ_BUDGET] ?? 0) + READ_WINDOW_MS);
  }
  starts.push(at);
  return at;
}

// The bucket is per IP, so the starts that actually happened are shared by
// every tab and survive reloads. Plans this document has not begun yet stay
// in memory: a page someone left must not keep holding budget.
const STARTS_KEY = "harvestshield.read-starts";
let memoryStarts: number[] = [];
const pending: number[] = [];

function recordedStarts(): number[] {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(STARTS_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((n): n is number => typeof n === "number") : memoryStarts;
  } catch {
    return memoryStarts;
  }
}

function recordStart(at: number): void {
  const keep = (t: number) => t > at - READ_WINDOW_MS;
  memoryStarts = [...memoryStarts.filter(keep), at];
  try {
    const next = [...recordedStarts().filter(keep), at].sort((a, b) => a - b);
    window.localStorage.setItem(STARTS_KEY, JSON.stringify(next));
  } catch {
    /* memory only */
  }
}

function paced<T>(work: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const plan = [...new Set([...recordedStarts(), ...memoryStarts, ...pending])].sort((a, b) => a - b);
  const at = planStart(plan, now);
  pending.push(at);
  const begin = () => {
    pending.splice(pending.indexOf(at), 1);
    recordStart(Date.now());
    return work();
  };
  const wait = at - now;
  return wait > 0 ? new Promise((r) => setTimeout(r, wait)).then(begin) : begin();
}

/** How long this page's next queued read still waits for the budget. */
export function readWaitMs(): number {
  return pending.length ? Math.max(0, Math.min(...pending) - Date.now()) : 0;
}

// Studio Next runs gen_calls in a small pool of execution slots shared by
// every visitor; one page never holds more than half of them.
export const MAX_IN_FLIGHT = 4;
let inFlight = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(work: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((r) => waiting.push(r));
  inFlight += 1;
  try {
    return await work();
  } finally {
    inFlight -= 1;
    waiting.shift()?.();
  }
}

const isRateLimited = (e: unknown) => /rate limit|429|-32029/i.test(String((e as Error)?.message ?? e));

/**
 * The contract's own sentence from a refused read. genlayer-js surfaces
 * gen_call refusals as a generic viem error; the contract's text rides
 * base64-encoded (one tag byte first) at `cause.data.receipt.result`.
 */
export function contractRefusal(e: unknown): string | null {
  let x: unknown = e;
  for (let depth = 0; x && depth < 8; depth++) {
    const node = x as { data?: { receipt?: { result?: unknown } }; message?: unknown; cause?: unknown };
    const b64 = node.data?.receipt?.result;
    if (typeof b64 === "string") {
      try {
        const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
        const decoded = new TextDecoder().decode(bytes);
        // Leading control characters (the tag byte) are not part of the sentence.
        let start = 0;
        while (start < decoded.length && decoded.charCodeAt(start) < 0x20) start++;
        const text = decoded.slice(start).trim();
        if (text) return text;
      } catch {
        /* not base64: keep walking */
      }
    }
    if (typeof node.message === "string" && node.message.includes("[EXPECTED]")) return node.message;
    x = node.cause;
  }
  return null;
}

async function call(functionName: string, args: unknown[], tries = 3): Promise<unknown> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await withSlot(() => paced(() =>
        readClient().readContract({ address: CONTRACT_ADDRESS, functionName, args }),
      ));
    } catch (e) {
      lastErr = e;
      const refusal = contractRefusal(e);
      if (refusal) {
        throw new ReadError(refusal.split("[EXPECTED]").pop()?.trim() || refusal, false);
      }
      if (!isTransient(e) || i === tries - 1) break;
      await new Promise((r) => setTimeout(r, (isRateLimited(e) ? 15_000 : 2_500) * (i + 1)));
    }
  }
  throw new ReadError(
    isTransient(lastErr)
      ? "Studio Next is not answering right now; it usually recovers in a moment."
      : "The chain could not answer this read. Reload in a moment; if it persists, the record may not exist.",
    isTransient(lastErr),
  );
}

async function view<T>(functionName: string, args: unknown[]): Promise<T> {
  return JSON.parse(String(await call(functionName, args))) as T;
}

/* ── caches ── */

// Memory for this page; session storage so a reload inside the TTL spends
// no budget. Keys carry the deployment address.
const TTL = 20_000;
const STASH = `harvestshield.${CONTRACT_ADDRESS}.`;
const memo = new Map<string, { at: number; value: unknown; forever?: boolean }>();

function cached<T>(key: string): T | undefined {
  const hit = memo.get(key);
  if (hit && (hit.forever || Date.now() - hit.at < TTL)) return hit.value as T;
  try {
    const raw = window.sessionStorage.getItem(STASH + key);
    if (raw) {
      const { at, value, forever } = JSON.parse(raw) as { at: number; value: T; forever?: boolean };
      if (forever || Date.now() - at < TTL) {
        memo.set(key, { at, value, forever });
        return value;
      }
    }
  } catch {
    /* no session storage: memory only */
  }
  return undefined;
}

function remember<T>(key: string, value: T, forever = false): T {
  const at = Date.now();
  memo.set(key, { at, value, forever });
  try {
    window.sessionStorage.setItem(STASH + key, JSON.stringify({ at, value, forever }));
  } catch {
    /* memory only */
  }
  return value;
}

/** Forget every changeable read after a write; immutable records stay. */
export function invalidateReads(): void {
  for (const [k, v] of memo) if (!v.forever) memo.delete(k);
  try {
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const k = window.sessionStorage.key(i);
      if (!k?.startsWith(STASH)) continue;
      const raw = window.sessionStorage.getItem(k);
      if (raw && !(JSON.parse(raw) as { forever?: boolean }).forever) window.sessionStorage.removeItem(k);
    }
  } catch {
    /* memory only */
  }
}

async function cachedView<T>(key: string, fn: string, args: unknown[], fresh: boolean): Promise<T> {
  if (!fresh) {
    const hit = cached<T>(key);
    if (hit !== undefined) return hit;
  }
  return remember(key, await view<T>(fn, args));
}

const notFound = (e: unknown, pattern: RegExp) =>
  e instanceof ReadError && !e.transient && pattern.test(e.message);

/* ── typed getters ── */

let configFlight: Promise<Config> | null = null;

export async function getConfig(): Promise<Config> {
  const hit = cached<Config>("config");
  if (hit) return hit;
  configFlight ??= view<Config>("get_config", [])
    .then((c) => remember("config", c, true))
    .finally(() => { configFlight = null; });
  return configFlight;
}

export function getStats(fresh = false): Promise<Stats> {
  return cachedView<Stats>("stats", "get_stats", [], fresh);
}

export function listProducts(skip = 0, limit = 50, fresh = false): Promise<ProductList> {
  return cachedView<ProductList>(`products.${skip}.${limit}`, "list_products", [skip, limit], fresh);
}

export function productsOf(addr: string, fresh = false): Promise<ProductList> {
  return cachedView<ProductList>(`productsOf.${addr}`, "products_of", [addr, 0, 50], fresh);
}

export function listPolicies(skip = 0, limit = 50, fresh = false): Promise<PolicyList> {
  return cachedView<PolicyList>(`policies.${skip}.${limit}`, "list_policies", [skip, limit], fresh);
}

export function policiesOf(addr: string, fresh = false): Promise<PolicyList> {
  return cachedView<PolicyList>(`policiesOf.${addr}`, "policies_of", [addr, 0, 50], fresh);
}

export async function getProduct(pid: string, fresh = false): Promise<Product | null> {
  try {
    return await cachedView<Product>(`product.${pid}`, "get_product", [pid], fresh);
  } catch (e) {
    if (notFound(e, /there is no product/i)) return null;
    throw e;
  }
}

export async function getPolicy(yid: string, fresh = false): Promise<Policy | null> {
  try {
    return await cachedView<Policy>(`policy.${yid}`, "get_policy", [yid], fresh);
  } catch (e) {
    if (notFound(e, /there is no policy/i)) return null;
    throw e;
  }
}

export function getBacker(pid: string, addr: string, fresh = false): Promise<Backer> {
  return cachedView<Backer>(`backer.${pid}.${addr}`, "get_backer", [pid, addr], fresh);
}

export function productsBackedBy(addr: string, fresh = false): Promise<ProductList> {
  return cachedView<ProductList>(`backedBy.${addr}`, "products_backed_by", [addr, 0, 50], fresh);
}

export function getBalance(addr: string, fresh = true): Promise<Balance> {
  return cachedView<Balance>(`balance.${addr}`, "get_balance", [addr], fresh);
}

const images = new Map<string, Promise<{ bytes: Uint8Array; digest: string }>>();

/** A photograph held by the contract, and the sha256 of the bytes this browser received. */
export function getImage(eid: string): Promise<{ bytes: Uint8Array; digest: string }> {
  let flight = images.get(eid);
  if (!flight) {
    flight = call("get_image", [eid]).then(async (raw) => {
      let bytes: Uint8Array;
      if (raw instanceof Uint8Array) bytes = raw;
      else if (typeof raw === "string" && raw.startsWith("0x")) {
        const hex = raw.slice(2);
        bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      } else throw new ReadError("The chain returned a photograph in a form this app does not read.", false);
      return { bytes, digest: await sha256Hex(bytes) };
    });
    flight.catch(() => images.delete(eid));
    images.set(eid, flight);
  }
  return flight;
}

export async function sourceUrl(yid: string, source: string): Promise<string> {
  return String(await call("source_url", [yid, source]));
}

/** Poll a predicate after a write until the state shows it (or tries end). */
export async function pollUntil(
  predicate: () => Promise<boolean>,
  { tries = 30, gapMs = 4_000 } = {},
): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      if (await predicate()) return true;
    } catch {
      /* transient reads never abort a poll */
    }
    await new Promise((r) => setTimeout(r, gapMs));
  }
  return false;
}
