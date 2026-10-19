"use client";

/**
 * The frame: a sticky header blurred over the page, a wine announcement strip
 * when the build reads a test deployment, what the wallet is owed, and a wine
 * footer.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ClaimBar } from "./ClaimBar";
import { WalletDock } from "./WalletDock";
import { IS_RECORD, REPO_URL } from "@/lib/config";

const NAV = [
  { href: "/cover", label: "Buy cover" },
  { href: "/insurer", label: "Insurers" },
  { href: "/claims", label: "Claim court" },
  { href: "/verify", label: "Verify" },
];

export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="16" fill="#421d24" />
      <path d="M32 9 L51 16 V31 C51 44 42 52 32 56 C22 52 13 44 13 31 V16 Z" fill="#f2f0eb" />
      <path d="M15.5 36 H48.5 C46 45 39.5 51 32 54 C24.5 51 18 45 15.5 36 Z" fill="#e7a43c" />
      <path d="M20 41 H44 M23 46 H41" stroke="#421d24" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="28.5" y="16" width="7" height="16" rx="2" fill="none" stroke="#714cb6" strokeWidth="2.4" />
      <rect x="30.4" y="23" width="3.2" height="7.2" rx="1" fill="#714cb6" />
    </svg>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="flex min-h-screen flex-col">
      {!IS_RECORD ? (
        <p className="bg-wine px-4 py-2 text-center text-[13px] text-paper">This build reads a test deployment, not the deployment of record.</p>
      ) : null}
      <header className="sticky top-0 z-30 border-b border-mist bg-parchment/80 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <Mark />
            <span className="text-[19px] font-medium tracking-[-0.01em]">HarvestShield</span>
          </Link>
          <ul className="hidden flex-1 items-center justify-center gap-6 md:flex">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className={`text-[15px] no-underline ${path.startsWith(n.href) ? "text-violet" : "hover:text-violet"}`}>{n.label}</Link>
              </li>
            ))}
          </ul>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <span className="hidden items-center gap-1.5 rounded-pill border border-mist bg-paper px-3 py-1.5 text-[13px] lg:inline-flex">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-violet" /> Studio Next
            </span>
            <WalletDock />
          </div>
        </nav>
        <ul className="flex gap-5 overflow-x-auto px-4 pb-3 md:hidden">
          {NAV.map((n) => (
            <li key={n.href}><Link href={n.href} className={`whitespace-nowrap text-[14px] no-underline ${path.startsWith(n.href) ? "text-violet" : ""}`}>{n.label}</Link></li>
          ))}
        </ul>
      </header>
      <ClaimBar />
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-24 pt-8 md:px-6">{children}</main>
      <footer className="bg-wine text-paper">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-end justify-between gap-6 px-4 py-12 md:px-6">
          <p className="h-md max-w-[22ch] text-paper">Cover that pays on the reading, and a fair hearing when the reading is in doubt.</p>
          <div className="flex flex-col gap-1 text-[14px] text-paper/80">
            <Link href="/verify" className="hover:text-paper">Verify this deployment</Link>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-paper">Source code</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
