import Link from "next/link";

import { Tag } from "./bits";
import { day, genText, productName, source, tiersSentence, triggerShort } from "@/lib/present";
import type { Product } from "@/lib/types";

/** A product as the farmer shopping for cover sees it. */
export function ProductCard({ p }: { p: Product }) {
  const left = p.capacity - p.sold;
  return (
    <Link href={`/products/${p.product_id}`} className="flex flex-col gap-3 rounded-card border border-mist bg-paper p-5 no-underline transition-colors hover:border-violet">
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone="harvest">{triggerShort(p.trigger)}</Tag>
        {p.replay ? <Tag tone="lagoon">Replay</Tag> : null}
        {!p.open ? <Tag tone="mist">Closed</Tag> : null}
        <span className="muted ml-auto text-[13px]">{productName(p.product_id)}</span>
      </div>
      <p className="h-sm">{p.crop}, {p.region}</p>
      <p className="text-[15px]">
        Pays {tiersSentence(p.trigger, p.tiers)}, out of {genText(p.payout_wei)}, over {p.window_days} days
        {p.replay ? ` from ${day(p.replay_start)}` : ""}.
      </p>
      <div className="mt-auto flex flex-wrap items-baseline justify-between gap-2 border-t border-mist pt-3 text-[14px]">
        <span>Premium <span className="figure font-medium">{genText(p.premium_wei)}</span></span>
        <span className="muted">{source(p.primary)} first, {source(p.backup)} as backup</span>
        <span className="muted">{left > 0 && p.open ? `${left} of ${p.capacity} left` : "None left"}</span>
      </div>
    </Link>
  );
}
