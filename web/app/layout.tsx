import type { Metadata } from "next";
import { Onest } from "next/font/google";

import { Shell } from "@/components/Shell";
import { WalletProvider } from "@/lib/wallet";

import "./globals.css";

/* One variable face: weight 460 for every large heading, 400 to 600 below. */
const onest = Onest({ subsets: ["latin"], variable: "--font-onest", display: "swap" });

export const metadata: Metadata = {
  title: "HarvestShield",
  description:
    "Parametric crop cover on GenLayer: rainfall read from two independent public datasets under "
    + "consensus, and a disputed reading decided by validators against the policy's own clause.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={onest.variable}>
      <body>
        <WalletProvider>
          <Shell>{children}</Shell>
        </WalletProvider>
      </body>
    </html>
  );
}
