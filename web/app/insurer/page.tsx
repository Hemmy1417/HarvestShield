"use client";

/**
 * The insurer's desk: exposure across its products, the claims that need it,
 * and the product builder. Everything an insurer signs is in the builder:
 * after publishing, the product's own page holds funding and closing.
 */
import { useMemo, useState } from "react";

import { Card, Loading, TextLink } from "@/components/bits";
import { PolicyRow } from "@/components/PolicyRow";
import { ProductCard } from "@/components/ProductCard";
import { Write } from "@/components/Write";
import { sameAddress } from "@/lib/chain";
import { calls } from "@/lib/calls";
import { genText, mm, productName, span, toWei } from "@/lib/present";
import { policiesOf, productsOf } from "@/lib/read";
import { useChain } from "@/lib/useChain";
import { useWallet } from "@/lib/wallet";

const PACES = [{ label: "Demonstration, 10 minutes", s: 600 }, { label: "One day", s: 86400 }, { label: "Two weeks", s: 14 * 86400 }];

function Builder() {
  const [f, setF] = useState({
    crop: "Maize", region: "Abuja, Federal Capital Territory", lat: "9.06", lon: "7.49", trigger: "RAIN_BELOW",
    threshold: "140", window: "14", premium: "0.1", payout: "2", capacity: "10", primary: "OPEN_METEO",
    clause: "Where the datasets disagree, prefer the one whose daily pattern is more plausible for the season; a single day of extreme rain that the other dataset does not show is treated as a fault in that dataset.",
    replay: true, replayStart: "2026-08-01", pace: 600,
  });
  const [made, setMade] = useState("");
  const set = (k: string, v: string | boolean | number) => setF((o) => ({ ...o, [k]: v }));
  const threshold = Math.round(Number(f.threshold) * 10);
  const json = useMemo(() => JSON.stringify({
    crop: f.crop, region: f.region, lat: f.lat, lon: f.lon, trigger: f.trigger, threshold_tenths: threshold,
    window_days: Number(f.window), premium_wei: (toWei(f.premium) ?? 0n).toString(), payout_wei: (toWei(f.payout) ?? 0n).toString(),
    capacity: Number(f.capacity), primary: f.primary, backup: f.primary === "OPEN_METEO" ? "NASA_POWER" : "OPEN_METEO",
    dispute_clause: f.clause, periods: { contest: f.pace, response: f.pace, appeal: f.pace },
    replay: f.replay, replay_start: f.replay ? f.replayStart : "",
  }), [f, threshold]);
  const problems = [
    !f.crop.trim() && "Name the crop.",
    !f.region.trim() && "Name the growing area.",
    !(Number.isFinite(Number(f.lat)) && Math.abs(Number(f.lat)) <= 90) && "The latitude is between -90 and 90.",
    !(Number.isFinite(Number(f.lon)) && Math.abs(Number(f.lon)) <= 180) && "The longitude is between -180 and 180.",
    !(threshold > 0) && "Set a threshold in millimetres.",
    !(Number(f.window) >= 7 && Number(f.window) <= 120) && "The window is 7 to 120 days.",
    !((toWei(f.payout) ?? 0n) > (toWei(f.premium) ?? 0n) && (toWei(f.premium) ?? 0n) >= 10n ** 16n) && "The payout must exceed the premium, which is at least 0.01 GEN.",
    !(Number(f.capacity) >= 1 && Number(f.capacity) <= 200) && "Sell 1 to 200 policies.",
    f.clause.trim().length < 20 && "Write the dispute clause.",
  ].filter(Boolean) as string[];

  const input = (k: keyof typeof f, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-[14px]">{label}</span>
      <input className="field" value={String(f[k])} onChange={(e) => set(k, e.target.value)} {...extra} />
    </label>
  );

  return (
    <Card className="flex flex-col gap-5">
      <div>
        <p className="h-md">Publish a product</p>
        <p className="muted mt-1 text-[15px]">Everything here is frozen into every policy you sell.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {input("crop", "Crop")}
        {input("region", "Growing area")}
        {input("lat", "Latitude", { inputMode: "decimal" })}
        {input("lon", "Longitude", { inputMode: "decimal" })}
        <label className="flex flex-col gap-1.5">
          <span className="text-[14px]">Cover</span>
          <select className="field" value={f.trigger} onChange={(e) => set("trigger", e.target.value)}>
            <option value="RAIN_BELOW">Drought: pays when rain is below the threshold</option>
            <option value="RAIN_ABOVE">Excess rain: pays when rain is above it</option>
          </select>
        </label>
        {input("threshold", "Threshold, in millimetres over the window", { inputMode: "decimal" })}
        {input("window", "Window, in days", { inputMode: "numeric" })}
        {input("capacity", "How many policies", { inputMode: "numeric" })}
        {input("premium", "Premium, in GEN", { inputMode: "decimal" })}
        {input("payout", "Payout, in GEN", { inputMode: "decimal" })}
        <label className="flex flex-col gap-1.5">
          <span className="text-[14px]">Primary dataset (the other is the backup)</span>
          <select className="field" value={f.primary} onChange={(e) => set("primary", e.target.value)}>
            <option value="OPEN_METEO">Open-Meteo first, NASA POWER as backup</option>
            <option value="NASA_POWER">NASA POWER first, Open-Meteo as backup</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[14px]">Contest, answer and appeal periods</span>
          <select className="field" value={f.pace} onChange={(e) => set("pace", Number(e.target.value))}>
            {PACES.map((p) => <option key={p.s} value={p.s}>{p.label}</option>)}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[14px]">Dispute clause: how a disagreement between the datasets is decided</span>
        <textarea className="field" maxLength={900} value={f.clause} onChange={(e) => set("clause", e.target.value)} />
      </label>
      <label className="flex items-start gap-3 rounded-[12px] bg-parchment p-4">
        <input type="checkbox" className="mt-1" checked={f.replay} onChange={(e) => set("replay", e.target.checked)} />
        <span className="text-[14px]">
          <span className="font-medium">Replay a finished season.</span> The product covers one season that has already ended, which
          you name below, so the whole claim can be shown on real weather. A farmer cannot choose another.
          {f.replay ? <input type="date" className="field mt-2" value={f.replayStart} onChange={(e) => set("replayStart", e.target.value)} /> : null}
        </span>
      </label>
      <div className="rounded-[12px] border border-mist p-4 text-[14px]">
        Pays {f.payout} GEN when there is {f.trigger === "RAIN_BELOW" ? "less" : "more"} than {mm(threshold)} of rain over {f.window} days.
        Each sale reserves the payout from your funding. Periods of {span(f.pace)}.
      </div>
      <Write call={calls.createProduct(json)} label="Publish the product" disabled={problems.length > 0}
        onDone={(out) => setMade(String(out?.product_id ?? ""))} />
      {problems.length ? <ul className="muted flex flex-col gap-0.5 text-[13px]">{problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
      {made ? <p className="text-[14px]">Published. <TextLink href={`/products/${made}`}>Fund {productName(made)}</TextLink> before it can sell.</p> : null}
    </Card>
  );
}

export default function Insurer() {
  const wallet = useWallet();
  const products = useChain(wallet.address ? `productsOf.${wallet.address}` : null, (f) => productsOf(wallet.address, f));
  const policies = useChain(wallet.address ? `policiesOf.${wallet.address}` : null, (f) => policiesOf(wallet.address, f));
  const mine = products.data?.products ?? [];
  const funded = mine.reduce((t, p) => t + BigInt(p.funded_wei), 0n);
  const reserved = mine.reduce((t, p) => t + BigInt(p.reserved_wei), 0n);
  const paid = mine.reduce((t, p) => t + BigInt(p.paid_out_wei), 0n);
  const claims = (policies.data?.policies ?? []).filter((y) => sameAddress(y.insurer, wallet.address)
    && (y.state === "READ" || y.state === "CONTESTED" || y.state === "DECIDED" || y.state === "APPEALED"));

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="h-lg">The insurer desk</h1>
        <p className="mt-2 max-w-[62ch] text-[17px]">Your exposure, the claims that need you, and the product builder.</p>
      </div>
      {!wallet.address ? <p className="text-[16px]">Connect the insurer&apos;s wallet to see its products and exposure.</p> : (
        <>
          {products.loading ? <Loading what="your products" /> : (
            <div className="grid gap-4 md:grid-cols-3">
              <Card><p className="label">Funded</p><p className="h-md figure mt-2">{genText(funded)}</p></Card>
              <Card><p className="label">Reserved for live policies</p><p className="h-md figure mt-2">{genText(reserved)}</p></Card>
              <Card><p className="label">Paid out to farmers</p><p className="h-md figure mt-2">{genText(paid)}</p></Card>
            </div>
          )}
          {claims.length ? (
            <section className="flex flex-col gap-3">
              <h2 className="h-md">Claims that need you</h2>
              {claims.map((y) => <PolicyRow key={y.policy_id} y={y} />)}
            </section>
          ) : null}
          {mine.length ? (
            <section className="flex flex-col gap-3">
              <h2 className="h-md">Your products</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{mine.map((p) => <ProductCard key={p.product_id} p={p} />)}</div>
            </section>
          ) : null}
        </>
      )}
      <Builder />
    </div>
  );
}
