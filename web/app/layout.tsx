import type { Metadata } from "next";
import { Albert_Sans, Bebas_Neue } from "next/font/google";

import { Shell } from "@/components/Shell";
import { WalletProvider } from "@/lib/wallet";

import "./globals.css";

/*
 * Two faces. Bebas Neue stands in for a compressed ultrabold display cut and
 * carries every structural word at architectural scale; Albert Sans carries
 * everything else at weight 500 and nothing else.
 */
const display = Bebas_Neue({ subsets: ["latin"], weight: ["400"], variable: "--font-bebas", display: "swap" });
const body = Albert_Sans({ subsets: ["latin"], weight: ["500"], variable: "--font-albert", display: "swap" });

export const metadata: Metadata = {
  title: "LeaseResolve",
  description:
    "A tenant's security deposit, held by a contract, and every deduction from it judged by "
    + "GenLayer validators against the condition the flat was in on move-in day.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <WalletProvider>
          <Shell>{children}</Shell>
        </WalletProvider>
      </body>
    </html>
  );
}
