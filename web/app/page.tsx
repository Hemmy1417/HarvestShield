"use client";

import { PillLink, Tag } from "@/components/bits";
import { LeaseRow } from "@/components/LeaseRow";
import { CONTRACT_CONFIGURED } from "@/lib/config";
import { finding, findingSaid, gen } from "@/lib/present";
import { getStats, listLeases } from "@/lib/read";
import { FINDINGS } from "@/lib/types";
import { useChain } from "@/lib/useChain";

const STEPS = [
  { n: "01", title: "Offer", says: "The landlord names the tenant, the deposit, the rooms, the clauses and what counts as fair wear and tear." },
  { n: "02", title: "Baseline", says: "Both sides photograph every room on move-in day. The contract stores the photographs, hashes them and freezes the set." },
  { n: "03", title: "Tenancy", says: "The tenant reports repairs as they happen. Each notice carries the contract's own date." },
  { n: "04", title: "Claims", says: "At move-out the landlord lists deductions, each with a photograph. Whatever is not claimed goes back to the tenant at once." },
  { n: "05", title: "Ruling", says: "Disputed deductions go to GenLayer validators, who each read the photographs blind and then judge them against the baseline." },
  { n: "06", title: "Appeal", says: "The losing side can post a bond and appeal once. Both sides add evidence, and every deduction is judged again." },
];

export default function Home() {
  const stats = useChain(CONTRACT_CONFIGURED ? "stats" : null, (fresh) => getStats(fresh));
  const recent = useChain(CONTRACT_CONFIGURED ? "list.0.4" : null, (fresh) => listLeases(0, 4, fresh));
  const s = stats.data;

  return (
    <div className="flex flex-col gap-20">
      <section className="grid items-stretch gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="flex flex-col justify-between gap-8 py-4">
          <div>
            <Tag>Rental deposits on GenLayer</Tag>
            <h1 className="display type-display mt-6">
              Who keeps<br />the deposit<span className="text-ember">?</span>
            </h1>
          </div>
          <div>
            <p className="max-w-[54ch] text-[19px] leading-[1.5]">
              The deposit sits in a contract, not with either side. Every deduction the landlord
              claims is checked against photographs of the same room on move-in day. GenLayer
              validators each read the photographs themselves and have to agree, and plain code
              does the sums.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <PillLink href="/leases/new" variant="primary">Offer a lease</PillLink>
              <PillLink href="/leases">See the leases</PillLink>
            </div>
          </div>
        </div>
        <div className="halftone relative flex min-h-[420px] flex-col justify-end overflow-hidden rounded-card p-8 text-chalk md:p-10">
          <p className="text-[15px]">Held in deposits and bonds right now</p>
          <p className="display figure text-[120px] leading-[0.9] md:text-[150px]">
            {s ? gen(s.held_wei) : "…"}
          </p>
          <p className="display text-[40px] leading-none">GEN</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-card bg-ember p-8 text-chalk">
          <p className="text-[14px]">Leases offered</p>
          <p className="display figure mt-3 text-[88px] leading-none">{s ? Number(s.lease).toLocaleString("en-GB") : "…"}</p>
        </div>
        <div className="rounded-card bg-limestone p-8">
          <p className="text-[14px] text-basalt">Rulings and appeals decided</p>
          <p className="display figure mt-3 text-[88px] leading-none">{s ? Number(s.round).toLocaleString("en-GB") : "…"}</p>
        </div>
        <div className="rounded-card bg-obsidian p-8 text-chalk">
          <p className="text-[14px] text-chalk/75">Paid out to landlords and tenants</p>
          <p className="display figure mt-3 text-[88px] leading-none">{s ? gen(s.paid_wei) : "…"}<span className="ml-2 text-[36px]">GEN</span></p>
        </div>
      </section>

      <section>
        <h2 className="display type-heading-2xl max-w-[14ch]">How a deposit settles</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n} className="rounded-card bg-limestone p-8">
              <div className="flex items-center justify-between">
                <Tag>{step.title}</Tag>
                <span className="display text-[56px] leading-none text-grout">{step.n}</span>
              </div>
              <p className="mt-6 text-[16px]">{step.says}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 className="display type-heading-2xl">Five findings, one rule for the money</h2>
          <p className="mt-5 max-w-[48ch] text-[17px]">
            For each disputed deduction the validators have to agree on one thing: is this tenant
            damage? Code decides what the answer means for the money. A tenant damage finding keeps the
            deduction, and only stands when a move-in photograph and a later photograph of the same
            room back it. Every other finding returns the money to the tenant. No model ever names an
            amount.
          </p>
        </div>
        <ol className="flex flex-col gap-3">
          {FINDINGS.map((f) => (
            <li key={f} className={`rounded-[28px] p-6 ${f === "TENANT_DAMAGE" ? "bg-ember text-obsidian" : "bg-limestone"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="display text-[32px] leading-none">{finding(f)}</span>
                <span className="text-[14px]">{f === "TENANT_DAMAGE" ? "Paid to the landlord" : "Returned to the tenant"}</span>
              </div>
              <p className="mt-2 text-[15px] opacity-85">{findingSaid(f)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="display type-heading-2xl">Latest leases</h2>
          <PillLink href="/leases">All of them</PillLink>
        </div>
        <div className="mt-6 flex flex-col gap-3">
          {recent.loading ? <p className="pulse text-[14px] text-basalt">Reading the leases.</p> : null}
          {(recent.data?.leases ?? []).map((l) => <LeaseRow key={l.lease_id} lease={l} />)}
          {recent.data && recent.data.leases.length === 0 ? (
            <p className="rounded-card bg-limestone p-8">No lease has been offered yet.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
