"use client";

/**
 * The cover page: a golden-hour field with the two readings floating over it
 * as glass cards, the three roles as a tab strip, the map of insured points in
 * the lagoon band, and the latest claims.
 */
import Link from "next/link";
import { useState } from "react";

import { LinkButton, Tag } from "@/components/bits";
import { PolicyRow } from "@/components/PolicyRow";
import { RiskMap } from "@/components/RiskMap";
import { CONTRACT_CONFIGURED } from "@/lib/config";
import { gen, plural } from "@/lib/present";
import { getStats, listPolicies, listProducts } from "@/lib/read";
import { useChain } from "@/lib/useChain";

const ROLES = [
  {
    key: "farmer", title: "Farmers",
    lines: [
      "Choose cover for your crop and growing area, with the rainfall trigger written in plain numbers.",
      "Pay the premium into the contract. The payout is reserved from the insurer's funding the moment you buy.",
      "When the window ends, the rainfall is read from two public datasets. If the trigger fires, you are paid.",
    ],
    cta: { href: "/cover", label: "Buy cover" },
  },
  {
    key: "insurer", title: "Insurers",
    lines: [
      "Publish a product: point, threshold, window, premium, payout, two datasets and a dispute clause in words.",
      "Fund it. Each sale reserves one payout; unreserved funding is yours to take back at any time.",
      "Premiums are paid to you when policies settle. Contest a reading the datasets disagree about.",
    ],
    cta: { href: "/insurer", label: "Open the insurer desk" },
  },
  {
    key: "court", title: "Claim court",
    lines: [
      "When Open-Meteo and NASA POWER land on opposite sides of a threshold, the side the reading went against may contest it.",
      "GenLayer validators apply the policy's own dispute clause to the recorded daily data and must agree on the verdict.",
      "Code turns the verdict into money. One appeal; nothing waits forever.",
    ],
    cta: { href: "/claims", label: "See the claims" },
  },
];

export default function Home() {
  const [tab, setTab] = useState("farmer");
  const stats = useChain(CONTRACT_CONFIGURED ? "stats" : null, (f) => getStats(f));
  const products = useChain(CONTRACT_CONFIGURED ? "products.0.50" : null, (f) => listProducts(0, 50, f));
  const policies = useChain(CONTRACT_CONFIGURED ? "policies.0.50" : null, (f) => listPolicies(0, 50, f));
  const role = ROLES.find((r) => r.key === tab) ?? ROLES[0]!;
  const s = stats.data;

  return (
    <div className="flex flex-col gap-20">
      <section className="field-art relative -mx-4 overflow-hidden px-4 pb-10 pt-14 md:-mx-6 md:rounded-card md:px-10 md:pt-20">
        <div className="relative z-10 max-w-[640px]">
          <Tag tone="lilac">Parametric crop cover on GenLayer</Tag>
          <h1 className="h-display mt-5 text-ink">Cover that pays on the rain, and a fair hearing when the rain is in doubt.</h1>
          <p className="mt-5 max-w-[52ch] text-[18px] text-ink">
            A farmer&apos;s payout is decided by rainfall from two independent public datasets, read by every validator. When the
            datasets disagree about whether the trigger fired, validators decide which one governs, under the clause both sides signed.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <LinkButton href="/cover">Buy cover</LinkButton>
            <LinkButton href="/claims" variant="secondary">See the claim court</LinkButton>
          </div>
        </div>
        <div className="relative z-10 mt-12 grid gap-3 md:ml-auto md:mt-[-120px] md:w-[420px]">
          <div className="glass rounded-card p-4">
            <p className="label">Two readings, one window</p>
            <div className="mt-2 flex items-baseline justify-between text-[15px]"><span>Open-Meteo</span><span className="figure font-medium">163.0 mm</span></div>
            <div className="flex items-baseline justify-between text-[15px]"><span>NASA POWER</span><span className="figure font-medium">117.1 mm</span></div>
            <p className="muted mt-2 text-[13px]">As GenLayer validators read them for Abuja, 1 to 14 August 2026. Against a 140 mm drought threshold, one says the cover pays and one says it does not.</p>
          </div>
          <div className="glass rounded-card p-4">
            <p className="label">Live on the contract</p>
            <p className="mt-1 text-[15px]">
              {s ? `${plural(Number(s.policy), "policy", "policies")}, ${plural(Number(s.round), "decision")}, ${gen(s.paid_wei)} GEN settled.` : "Reading the contract."}
            </p>
          </div>
        </div>
      </section>

      <section>
        <div role="tablist" className="grid grid-cols-3 rounded-tab border border-mist bg-paper p-1">
          {ROLES.map((r) => (
            <button key={r.key} role="tab" aria-selected={tab === r.key} type="button" onClick={() => setTab(r.key)}
              className={`rounded-[6px] px-3 py-3 text-[15px] ${tab === r.key ? "bg-lilac font-medium" : "hover:bg-parchment"}`}>
              {r.title}
            </button>
          ))}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {role.lines.map((l, i) => (
            <div key={i} className="rounded-card border border-mist bg-paper p-5">
              <p className="text-violet text-[14px] font-medium">Step {i + 1}</p>
              <p className="mt-2 text-[16px]">{l}</p>
            </div>
          ))}
        </div>
        <div className="mt-6"><LinkButton href={role.cta.href} variant="secondary">{role.cta.label}</LinkButton></div>
      </section>

      <section className="-mx-4 bg-lagoon px-4 py-12 text-paper md:-mx-6 md:rounded-card md:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="h-lg max-w-[18ch] text-paper">Where the cover is</h2>
          <p className="max-w-[46ch] text-[15px] text-paper/80">Every product is one point on the map. The ring shows how many of its policies are still live.</p>
        </div>
        <div className="mt-8"><RiskMap products={products.data?.products ?? []} /></div>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="h-lg">Latest claims</h2>
          <Link href="/claims" className="text-violet hover:underline">All of them</Link>
        </div>
        <div className="mt-6 flex flex-col gap-3">
          {policies.loading ? <p className="pulse muted">Reading the policies.</p> : null}
          {(policies.data?.policies ?? []).slice(0, 4).map((y) => <PolicyRow key={y.policy_id} y={y} />)}
          {policies.data && policies.data.policies.length === 0 ? <p className="muted">No policy has been bought yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
