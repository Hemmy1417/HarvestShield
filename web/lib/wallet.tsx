"use client";

/**
 * The wallet layer: EIP-6963 discovery (every installed wallet announces
 * itself; two extensions never fight over one global), connection state,
 * and the network handshake. The SELECTED provider is what the
 * Transaction Kit signs through, never a bare window.ethereum grab, so a
 * multi-wallet browser signs with the wallet the person actually chose.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getAddress } from "viem";

import { CHAIN_HEX, STUDIO_NEXT, WALLET_NETWORK } from "./chain";

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

export interface Discovered {
  /** EIP-6963: `uuid` is new on every page load; `rdns` is the stable identity. */
  info: { uuid: string; name: string; icon?: string; rdns?: string };
  provider: Eip1193;
}

interface WalletState {
  wallets: Discovered[];
  address: string;
  /** The provider of the CONNECTED wallet: hand this to the kit. */
  provider: Eip1193 | null;
  chainOk: boolean;
  connecting: boolean;
  /** Silently restoring the wallet chosen before a reload (no prompt). */
  restoring: boolean;
  error: string;
  connect: (w: Discovered) => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
}

const Ctx = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet used outside WalletProvider");
  return v;
}

/**
 * The account as the contract records it: the signer's EIP-55 checksummed
 * address. Parties are compared by exact string, and wallets commonly
 * report lowercase; the faucet credits only checksummed addresses too.
 * Anything unparseable is no account.
 */
export function accountOf(raw: unknown): string {
  try {
    return typeof raw === "string" ? getAddress(raw) : "";
  } catch {
    return "";
  }
}

/* ── remembering the chosen wallet across reloads ── */

const REMEMBER_KEY = "harvestshield.wallet";

/** A wallet's identity across page loads (its uuid changes every load). */
export function walletKey(info: Discovered["info"]): string {
  return info.rdns || info.name;
}

function remembered(): string | null {
  try {
    return window.localStorage.getItem(REMEMBER_KEY);
  } catch {
    return null;
  }
}

const noSubscription = () => () => {};

function remember(key: string | null): void {
  try {
    if (key) window.localStorage.setItem(REMEMBER_KEY, key);
    else window.localStorage.removeItem(REMEMBER_KEY);
  } catch {
    /* no storage: the session simply is not restored */
  }
}

/**
 * The account a wallet ALREADY granted this site. `eth_accounts` never opens
 * a prompt: it returns [] when the site is not connected, so a reload
 * restores a connection only the person made and has not revoked.
 */
export async function silentAccount(provider: Eip1193): Promise<string> {
  const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
  return accountOf(accounts?.[0]);
}

function isUnknownChain(err: unknown): boolean {
  const code = (err as { code?: number })?.code;
  return code === 4902 || String((err as Error)?.message ?? "").includes("4902");
}

async function ensureChain(provider: Eip1193): Promise<void> {
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (err) {
    if (!isUnknownChain(err)) throw err;
    await provider.request({ method: "wallet_addEthereumChain", params: [WALLET_NETWORK] });
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
    } catch {
      /* chainOk reports the outcome */
    }
  }
}

function walletErrorMessage(err: unknown): string {
  const code = (err as { code?: number })?.code;
  if (code === 4001) return "You declined in the wallet. Nothing was sent.";
  if (code === -32002) return "The wallet already shows a pending request. Open it to continue.";
  return `The wallet refused: ${String((err as Error)?.message ?? err).slice(0, 140)}`;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallets, setWallets] = useState<Discovered[]>([]);
  const [selected, setSelected] = useState<Discovered | null>(null);
  const [address, setAddress] = useState("");
  const [chainOk, setChainOk] = useState(false);
  const [connecting, setConnecting] = useState(false);
  // A wallet chosen before this reload is being restored until the attempt
  // settles; read from storage on the client only, so the server render and
  // the first client render agree.
  const wanted = useSyncExternalStore(noSubscription, remembered, () => null);
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState("");
  const listeners = useRef<{ provider: Eip1193; accounts: (a: unknown) => void; chain: (c: unknown) => void } | null>(null);

  const detach = useCallback(() => {
    const l = listeners.current;
    if (!l) return;
    l.provider.removeListener?.("accountsChanged", l.accounts);
    l.provider.removeListener?.("chainChanged", l.chain);
    listeners.current = null;
  }, []);

  const adopt = useCallback((d: Discovered, addr: string) => {
    detach();
    setSelected(d);
    setAddress(accountOf(addr));
    const accounts = (list: unknown) => {
      const account = accountOf((list as string[])?.[0]);
      if (!account) {
        // The person disconnected the site inside the wallet.
        remember(null);
        setSelected(null);
        setAddress("");
        setChainOk(false);
      } else setAddress(account);
    };
    const chain = (chainId: unknown) => setChainOk(String(chainId).toLowerCase() === CHAIN_HEX.toLowerCase());
    d.provider.on?.("accountsChanged", accounts);
    d.provider.on?.("chainChanged", chain);
    listeners.current = { provider: d.provider, accounts, chain };
  }, [detach]);

  useEffect(() => {
    const found = new Map<string, Discovered>();
    const wanted = remembered();
    let tried = false;
    // A remembered wallet that never announces (uninstalled, disabled) stops the wait.
    const giveUp = wanted ? window.setTimeout(() => setSettled(true), 2500) : 0;

    const onAnnounce = (e: Event) => {
      const d = (e as CustomEvent).detail as Discovered;
      if (!d?.info?.uuid || found.has(d.info.uuid)) return;
      found.set(d.info.uuid, d);
      setWallets([...found.values()]);
      if (tried || !wanted || walletKey(d.info) !== wanted) return;
      tried = true;
      void (async () => {
        try {
          const account = await silentAccount(d.provider);
          if (!account) {
            remember(null);
            return;
          }
          const chainId = (await d.provider.request({ method: "eth_chainId" })) as string;
          setChainOk(String(chainId).toLowerCase() === CHAIN_HEX.toLowerCase());
          adopt(d, account);
        } catch {
          /* stay disconnected; the Connect button still works */
        } finally {
          window.clearTimeout(giveUp);
          setSettled(true);
        }
      })();
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      window.clearTimeout(giveUp);
    };
  }, [adopt]);

  const connect = useCallback(async (d: Discovered) => {
    setConnecting(true);
    setError("");
    try {
      const accounts = (await d.provider.request({ method: "eth_requestAccounts" })) as string[];
      if (!accountOf(accounts?.[0])) throw new Error("The wallet returned no account.");
      await ensureChain(d.provider);
      const chainId = (await d.provider.request({ method: "eth_chainId" })) as string;
      setChainOk(String(chainId).toLowerCase() === CHAIN_HEX.toLowerCase());
      adopt(d, accounts[0] ?? "");
      remember(walletKey(d.info));
    } catch (err) {
      setError(walletErrorMessage(err));
    } finally {
      setConnecting(false);
    }
  }, [adopt]);

  const disconnect = useCallback(() => {
    detach();
    remember(null);
    setSelected(null);
    setAddress("");
    setChainOk(false);
  }, [detach]);

  const switchNetwork = useCallback(async () => {
    if (!selected) return;
    setError("");
    try {
      await ensureChain(selected.provider);
      const chainId = (await selected.provider.request({ method: "eth_chainId" })) as string;
      setChainOk(String(chainId).toLowerCase() === CHAIN_HEX.toLowerCase());
    } catch (err) {
      setError(walletErrorMessage(err));
    }
  }, [selected]);

  const restoring = !!wanted && !settled && !address;

  const value = useMemo<WalletState>(() => ({
    wallets,
    address,
    provider: selected?.provider ?? null,
    chainOk,
    connecting,
    restoring,
    error,
    connect,
    disconnect,
    switchNetwork,
  }), [wallets, address, selected, chainOk, connecting, restoring, error, connect, disconnect, switchNetwork]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export { STUDIO_NEXT };
