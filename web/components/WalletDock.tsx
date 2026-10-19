"use client";

/**
 * The wallet, at the right end of the nav pill. Connecting opens a list of
 * every wallet the page discovered; connected, it offers test GEN from the
 * Studio faucet so nobody needs anything outside this page.
 *
 * The connected address is machine text and never reaches the page surface.
 * It is shown inside the dropdown, where somebody has asked which account is
 * about to sign, which is the one moment they need to know.
 */
import { useEffect, useRef, useState } from "react";

import { Button } from "./bits";
import { FAUCET_GEN, fundFromFaucet, nativeBalance } from "@/lib/faucet";
import { gen } from "@/lib/present";
import { useWallet } from "@/lib/wallet";

function Faucet({ address }: { address: string }) {
  const [state, setState] = useState<"idle" | "asking" | "done" | "failed">("idle");
  const [balance, setBalance] = useState<bigint | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    nativeBalance(address).then((b) => { if (alive) setBalance(b); }, () => {});
    return () => { alive = false; };
  }, [address, state]);

  async function ask() {
    setState("asking");
    setError("");
    try {
      await fundFromFaucet(address);
      setState("done");
    } catch (e) {
      setError(String((e as Error)?.message ?? e).slice(0, 140));
      setState("failed");
    }
  }

  return (
    <div className="mt-4 rounded-[20px] bg-pumice p-4">
      <p className="type-caption">In this wallet</p>
      <p className="display figure mt-1 text-[32px]">{balance === null ? "…" : `${gen(balance)} GEN`}</p>
      <div className="mt-3">
        <Button variant="secondary" disabled={state === "asking"} onClick={() => void ask()}>
          {state === "asking" ? "Asking the faucet" : `Get ${FAUCET_GEN} test GEN`}
        </Button>
      </div>
      {state === "done" ? <p className="type-caption mt-2">Sent. It can take a few seconds to show.</p> : null}
      {state === "failed" ? <p className="type-caption mt-2">The faucet refused: {error}</p> : null}
    </div>
  );
}

export function WalletDock() {
  const w = useWallet();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (w.restoring) {
    return <span className="type-caption">Reconnecting</span>;
  }

  if (w.address) {
    return (
      <div className="relative" ref={box}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="rounded-pill bg-obsidian px-4 py-2 text-[14px] text-chalk"
        >
          Connected
        </button>
        {open ? (
          <div className="absolute right-0 top-[calc(100%+8px)] w-[300px] rounded-[28px] bg-limestone p-5 outline outline-[1.5px] outline-obsidian">
            <p className="type-caption">Signing as</p>
            <p className="mono mt-1 break-all text-obsidian">{w.address}</p>
            <Faucet address={w.address} />
            {!w.chainOk ? (
              <div className="mt-4">
                <p className="type-caption mb-2">
                  This wallet is on another network, so it cannot sign here.
                </p>
                <Button variant="secondary" onClick={() => void w.switchNetwork()}>
                  Switch network
                </Button>
              </div>
            ) : null}
            <div className="mt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  w.disconnect();
                  setOpen(false);
                }}
              >
                Disconnect
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative" ref={box}>
      <Button onClick={() => setOpen((v) => !v)} disabled={w.connecting}>
        {w.connecting ? "Connecting" : "Connect wallet"}
      </Button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] w-[300px] rounded-[28px] bg-limestone p-5 outline outline-[1.5px] outline-obsidian">
          {w.wallets.length === 0 ? (
            <p className="type-caption">
              No wallet was offered to this page. Install one that speaks to GenLayer, then
              reload.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {w.wallets.map((d) => (
                <li key={d.info.rdns ?? d.info.uuid}>
                  <button
                    type="button"
                    onClick={() => {
                      void w.connect(d);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-card px-3 py-2 text-left text-[15px] text-obsidian hover:bg-pumice"
                  >
                    {d.info.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.info.icon} alt="" width={20} height={20} aria-hidden="true" />
                    ) : null}
                    {d.info.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {w.error ? <p className="type-caption mt-3 text-obsidian">{w.error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
