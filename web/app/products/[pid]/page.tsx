"use client";

/**
 * One product: its terms, how much of its funding is free, and the two acts it
 * offers. A farmer buys a policy; the insurer funds it, takes back unreserved
 * capital, or closes it to new sales.
 */
import { use, useState } from "react";

import { Card, LinkButton, Loading, Problem, Tag, TextLink } from "@/components/bits";
import { Write } from "@/components/Write";
import { sameAddress } from "@/lib/chain";
import { calls } from "@/lib/calls";
import {
  day, genText, mm, policyName, productName, source, sourceLong, span, toWei, triggerSentence, triggerShort,
} from "@/lib/present";
import { getProduct, policiesOf } from "@/lib/read";
import { useChain } from "@/lib/useChain";
import { useWallet } from "@/lib/wallet";
import type { Product } from "@/lib/types";

function tomorrow(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

function Buy({ p }: { p: Product }) {
  const [start, setStart] = useState(() => (p.replay ? p.replay_start : tomorrow()));
  const [bought, setBought] = useState("");
  const free = BigInt(p.funded_wei) - BigInt(p.reserved_wei);
  const closed = !p.open ? "This product is closed to new policies."
    : p.sold >= p.capacity ? "Every policy this product offers has been sold."
    : free < BigInt(p.payout_wei) ? "The insurer has not funded enough to reserve another payout."
    : "";
  return (
    <section className="rounded-card bg-lagoon p-5 text-paper md:p-6">
      <p className="h-sm">Buy this cover</p>
      {closed ? <p className="mt-3 text-[14px]">{closed}</p> : (
        <div className="mt-4 flex flex-col gap-4 text-ink">
          <label className="flex flex-col gap-1.5 text-paper">
            <span className="text-[14px]">{p.replay ? "The season this replay covers" : "The window starts on"}</span>
            <input type="date" className="field" value={start} disabled={p.replay} onChange={(e) => setStart(e.target.value)} />
            <span className="text-[13px] text-paper/75">
              {p.replay
                ? "A replay covers one finished season, named by the insurer, so the whole claim can be shown on real weather."
                : `The window runs ${p.window_days} days and must start after today.`}
            </span>
          </label>
          <div className="rounded-[12px] bg-paper p-4">
            <p className="text-[14px]">You pay {genText(p.premium_wei)}, held by the contract until the policy settles. If the trigger fires you receive {genText(p.payout_wei)}.</p>
            <div className="mt-3">
              <Write call={calls.buyPolicy(p.product_id, start, BigInt(p.premium_wei))} label="Buy the policy"
                onDone={(out) => setBought(String(out?.policy_id ?? ""))} />
            </div>
            {bought ? <p className="mt-3 text-[14px]">Bought. <TextLink href={`/policies/${bought}`}>Open {policyName(bought)}</TextLink></p> : null}
          </div>
        </div>
      )}
    </section>
  );
}

function InsurerActs({ p }: { p: Product }) {
  const [fund, setFund] = useState("");
  const [take, setTake] = useState("");
  const fundWei = toWei(fund);
  const takeWei = toWei(take);
  const free = BigInt(p.funded_wei) - BigInt(p.reserved_wei);
  return (
    <Card className="flex flex-col gap-5">
      <p className="h-sm">You publish this product</p>
      <label className="flex flex-col gap-1.5">
        <span className="text-[14px]">Add funding, in GEN</span>
        <input className="field figure" inputMode="decimal" value={fund} onChange={(e) => setFund(e.target.value)} placeholder="10" />
        <Write call={calls.fundProduct(p.product_id, fundWei ?? 0n)} label="Fund it" disabled={!fundWei || fundWei <= 0n} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[14px]">Take back unreserved funding ({genText(free)} free)</span>
        <input className="field figure" inputMode="decimal" value={take} onChange={(e) => setTake(e.target.value)} placeholder="1" />
        <Write variant="secondary" call={calls.withdrawCapital(p.product_id, takeWei ?? 0n)} label="Withdraw"
          disabled={!takeWei || takeWei <= 0n || takeWei > free} />
      </label>
      {p.open ? <Write variant="secondary" call={calls.closeProduct(p.product_id)} label="Close to new policies" /> : <p className="muted text-[14px]">Closed to new policies.</p>}
    </Card>
  );
}

export default function ProductPage({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = use(params);
  const wallet = useWallet();
  const p = useChain(`product.${pid}`, (fresh) => getProduct(pid, fresh));
  const mine = useChain(wallet.address ? `policiesOf.${wallet.address}` : null, (fresh) => policiesOf(wallet.address, fresh));
  if (p.loading) return <Loading what="the product" />;
  if (p.error) return <Problem title="This product could not be read">{p.error instanceof Error ? p.error.message : ""}</Problem>;
  if (!p.data) return <Problem title="There is no such product"><div className="mt-4"><LinkButton href="/cover" variant="secondary">All cover</LinkButton></div></Problem>;
  const d = p.data;
  const isInsurer = sameAddress(wallet.address, d.insurer);
  const held = (mine.data?.policies ?? []).filter((y) => y.product_id === d.product_id && sameAddress(y.farmer, wallet.address));
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Tag tone="mist">{productName(d.product_id)}</Tag>
          <Tag tone="harvest">{triggerShort(d.trigger)}</Tag>
          {d.replay ? <Tag tone="lagoon">Replay of the season from {day(d.replay_start)}</Tag> : null}
        </div>
        <h1 className="h-display max-w-[16ch]">{d.crop}, {d.region}</h1>
        <p className="max-w-[60ch] text-[18px]">Pays {genText(d.payout_wei)} when there is {triggerSentence(d.trigger, d.threshold_tenths)} over a {d.window_days}-day window.</p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          <Card>
            <dl className="grid gap-4 text-[15px] md:grid-cols-2">
              <div><dt className="label">Premium</dt><dd className="figure mt-1">{genText(d.premium_wei)}</dd></div>
              <div><dt className="label">Payout</dt><dd className="figure mt-1">{genText(d.payout_wei)}</dd></div>
              <div><dt className="label">Threshold</dt><dd className="mt-1">{mm(d.threshold_tenths)} over {d.window_days} days</dd></div>
              <div><dt className="label">Point</dt><dd className="figure mt-1">{d.lat}, {d.lon}</dd></div>
              <div><dt className="label">Primary dataset</dt><dd className="mt-1">{sourceLong(d.primary)}</dd></div>
              <div><dt className="label">Backup dataset</dt><dd className="mt-1">{sourceLong(d.backup)}</dd></div>
              <div><dt className="label">Contest, answer, appeal</dt><dd className="mt-1">{span(d.periods.contest)}, {span(d.periods.response)}, {span(d.periods.appeal)}</dd></div>
              <div><dt className="label">Sold</dt><dd className="mt-1">{d.sold} of {d.capacity}</dd></div>
            </dl>
          </Card>
          <Card>
            <p className="label">The dispute clause</p>
            <p className="mt-2 text-[16px]">“{d.dispute_clause}”</p>
            <p className="muted mt-3 text-[14px]">If {source(d.primary)} and {source(d.backup)} put a season on opposite sides of the threshold, this is the rule the validators apply.</p>
          </Card>
          <Card>
            <p className="label">Funding</p>
            <p className="mt-2 text-[15px]">
              {genText(d.funded_wei)} funded, {genText(d.reserved_wei)} reserved for {d.active} live {d.active === 1 ? "policy" : "policies"}, {genText(d.paid_out_wei)} paid out so far.
            </p>
          </Card>
          {held.length ? (
            <Card>
              <p className="label">Your policies on this product</p>
              <ul className="mt-2 flex flex-col gap-1">{held.map((y) => <li key={y.policy_id}><TextLink href={`/policies/${y.policy_id}`}>{policyName(y.policy_id)}</TextLink></li>)}</ul>
            </Card>
          ) : null}
        </div>
        <div className="flex flex-col gap-4 lg:sticky lg:top-24">
          {isInsurer ? <InsurerActs p={d} /> : <Buy p={d} />}
        </div>
      </div>
    </div>
  );
}
