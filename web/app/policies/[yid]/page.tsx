"use client";

import { use } from "react";

import { LinkButton, Loading, Problem } from "@/components/bits";
import { PolicyView } from "@/components/PolicyView";
import { getPolicy } from "@/lib/read";
import { useChain } from "@/lib/useChain";

export default function PolicyPage({ params }: { params: Promise<{ yid: string }> }) {
  const { yid } = use(params);
  const y = useChain(`policy.${yid}`, (fresh) => getPolicy(yid, fresh));
  if (y.loading) return <Loading what="the policy" />;
  if (y.error) return <Problem title="This policy could not be read">{y.error instanceof Error ? y.error.message : "Reload in a moment."}</Problem>;
  if (!y.data) {
    return (
      <Problem title="There is no such policy">
        <div className="mt-4"><LinkButton href="/claims" variant="secondary">All policies</LinkButton></div>
      </Problem>
    );
  }
  return <PolicyView y={y.data} />;
}
