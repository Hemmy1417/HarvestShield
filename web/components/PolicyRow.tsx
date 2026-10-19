import Link from "next/link";

import { Tag } from "./bits";
import { day, genText, mm, policyName, policyState, triggerShort } from "@/lib/present";
import type { Policy } from "@/lib/types";

/** One policy in a list, with the reading if there is one. */
export function PolicyRow({ y, you }: { y: Policy; you?: string }) {
  const r = y.reading;
  return (
    <Link href={`/policies/${y.policy_id}`} className="grid items-center gap-3 rounded-card border border-mist bg-paper px-5 py-4 no-underline transition-colors hover:border-violet md:grid-cols-[1fr_auto_auto]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="muted text-[13px]">{policyName(y.policy_id)}</span>
          <Tag tone={y.state === "SETTLED" || y.state === "VOID" ? "mist" : y.state === "CONTESTED" || y.state === "APPEALED" ? "wine" : "lilac"}>{policyState(y.state)}</Tag>
          <Tag tone="harvest">{triggerShort(y.trigger)}</Tag>
          {you ? <Tag tone="lagoon">{you}</Tag> : null}
        </div>
        <p className="h-sm mt-1.5">{y.crop}, {y.region}</p>
        <p className="muted text-[14px]">{day(y.window_start)} to {day(y.window_end)}</p>
      </div>
      <p className="text-[14px] md:text-right">
        {r ? <>Read {mm(r.summaries[r.selected].total_tenths)}, {r.triggered ? "pays" : "does not pay"}</> : <span className="muted">Not read yet</span>}
      </p>
      <p className="figure text-[15px] md:text-right">{genText(y.payout_wei)} cover</p>
    </Link>
  );
}
