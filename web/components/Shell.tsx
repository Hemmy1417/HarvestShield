"use client";

/**
 * The frame: a limestone pill floating on the plaster canvas holds the mark,
 * the three places, the network and the wallet. Below it, whatever the
 * contract owes the connected account, always to hand.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ClaimBar } from "./ClaimBar";
import { WalletDock } from "./WalletDock";
import { CONTRACT_ADDRESS, IS_RECORD, REPO_URL } from "@/lib/config";

const NAV = [
  { href: "/leases", label: "Leases" },
  { href: "/leases/new", label: "Offer a lease" },
  { href: "/verify", label: "Verify" },
];

export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="18" fill="#070607" />
      <path d="M32 12 L12 29 V52 H32 Z" fill="#fc5000" />
      <path d="M32 12 L52 29 V52 H32" fill="none" stroke="#f7f6f2" strokeWidth="4" strokeLinejoin="round" />
      <path d="M32 12 V52" stroke="#070607" strokeWidth="2.5" />
    </svg>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 px-4 pt-4 md:px-8">
        <nav className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-2 gap-y-2 rounded-pill bg-limestone py-2 pl-3 pr-2 md:pl-5">
          <Link href="/" className="mr-2 flex items-center gap-3 no-underline">
            <Mark />
            <span className="display text-[26px] tracking-[0.03em]">LeaseResolve</span>
          </Link>
          <span aria-hidden className="dotted-y mx-2 hidden h-6 md:block" />
          <ul className="order-3 flex w-full items-center gap-1 overflow-x-auto md:order-none md:w-auto">
            {NAV.map((n) => {
              const on = n.href === "/leases" ? path === "/leases" || /^\/leases\/ls-/.test(path) : path === n.href;
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    className={`block whitespace-nowrap rounded-pill px-4 py-2 text-[15px] no-underline ${on ? "bg-obsidian text-chalk" : "hover:bg-pumice"}`}
                  >
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-pill bg-pumice px-3 py-2 text-[13px] lg:inline-flex">
              <span aria-hidden className="h-2 w-2 rounded-full bg-ember" />
              Studio Next
            </span>
            <WalletDock />
          </div>
        </nav>
      </header>
      {!IS_RECORD ? (
        <p className="mx-auto mt-3 max-w-[1280px] rounded-pill bg-sulfur px-5 py-2 text-[13px]">
          This build reads a test deployment, not the deployment of record.
        </p>
      ) : null}
      <ClaimBar />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-24 pt-8 md:px-8">{children}</main>
      <footer className="mx-auto w-full max-w-[1280px] px-4 pb-10 md:px-8">
        <div className="rounded-card bg-obsidian p-8 text-chalk md:p-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="display text-[48px] leading-none">The deposit is the tenant&apos;s</p>
              <p className="display text-[48px] leading-none text-ember">unless the evidence says otherwise</p>
            </div>
            <div className="flex flex-col gap-1 text-[14px] text-chalk/80">
              <Link href="/verify" className="hover:text-chalk">Verify this deployment</Link>
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-chalk">Source code</a>
              <span className="mono text-chalk/50">{CONTRACT_ADDRESS.slice(0, 10)}…</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
