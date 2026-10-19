"use client";

/**
 * How to check this deployment for yourself: which contract the app reads,
 * the source it was built from, and the rules the contract reports about
 * itself. The one page where machine values are the point.
 */
import { Card, Loading, Tag, TextLink } from "@/components/bits";
import { addressUrl } from "@/lib/chain";
import { CONTRACT_ADDRESS, CONTRACT_CONFIGURED, IS_RECORD, REPO_URL, SOURCE_SHA256, SOURCE_URL } from "@/lib/config";
import { gen, span } from "@/lib/present";
import { getConfig } from "@/lib/read";
import { useChain } from "@/lib/useChain";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t-[1.5px] border-dotted border-obsidian/40 py-3 md:grid-cols-[260px_1fr]">
      <dt className="text-[14px] text-basalt">{k}</dt>
      <dd className="text-[15px]">{v}</dd>
    </div>
  );
}

export default function Verify() {
  const cfg = useChain(CONTRACT_CONFIGURED ? "config" : null, () => getConfig());
  const c = cfg.data;
  return (
    <div className="flex flex-col gap-8">
      <div>
        <Tag>Verification</Tag>
        <h1 className="display type-heading-3xl mt-4">Check it yourself</h1>
        <p className="mt-3 max-w-[62ch] text-[17px]">
          This app reads one contract on GenLayer Studio Next and nothing else: no server, no database.
          Every number on every page comes from the contract.
        </p>
      </div>
      <Card>
        <dl>
          <Row k="Contract" v={<span className="mono break-all">{CONTRACT_ADDRESS}</span>} />
          <Row k="Deployment" v={IS_RECORD ? "The deployment of record" : "A test deployment set by this build's environment"} />
          <Row k="On the explorer" v={<TextLink href={addressUrl(CONTRACT_ADDRESS)} external>Studio explorer</TextLink>} />
          <Row k="Source" v={<TextLink href={SOURCE_URL} external>contracts/leaseresolve.py</TextLink>} />
          <Row k="Source sha256" v={<span className="mono break-all">{SOURCE_SHA256 || "Recorded once the deployment of record is made"}</span>} />
          <Row k="Repository" v={<TextLink href={REPO_URL} external>{REPO_URL.replace("https://", "")}</TextLink>} />
        </dl>
      </Card>
      <Card>
        <h2 className="display type-heading-lg">The contract reports</h2>
        {cfg.loading ? <div className="mt-4"><Loading what="the contract's rules" /></div> : c ? (
          <dl className="mt-4">
            <Row k="Rule set" v={<span className="mono">{c.ruleset}</span>} />
            <Row k="Rooms, clauses" v={`Up to ${c.max_rooms} rooms and ${c.max_clauses} clauses a lease`} />
            <Row k="Deductions" v={`Up to ${c.max_deductions} a lease, each paid whole or not at all`} />
            <Row k="Smallest deposit" v={`${gen(c.min_deposit_wei)} GEN`} />
            <Row k="Windows" v={`Between ${span(c.min_window_seconds)} and ${span(c.max_window_seconds)}`} />
            <Row k="Appeal bond" v={`${c.appeal_bond_bps / 100}% of what is disputed, at least ${gen(c.min_appeal_bond_wei)} GEN`} />
            <Row k="Long stop" v={`${c.long_stop_windows} appeal windows`} />
            <Row k="Photographs" v={`PNG or JFIF JPEG, up to ${Math.round(c.max_image_bytes / 1000)} KB, stored and hashed by the contract`} />
          </dl>
        ) : <p className="mt-4 text-[15px]">The contract did not answer. Reload in a moment.</p>}
      </Card>
      <Card>
        <h2 className="display type-heading-lg">From a terminal</h2>
        <p className="mt-3 max-w-[64ch] text-[15px]">
          The GenLayer command line prints the code a deployment holds. Its sha256 should match the
          file in the repository.
        </p>
        <pre className="mono mt-4 overflow-x-auto rounded-[20px] bg-obsidian p-5 text-chalk">{`genlayer network set studionet-next
genlayer code ${CONTRACT_ADDRESS} > deployed.py
sha256sum deployed.py contracts/leaseresolve.py`}</pre>
      </Card>
    </div>
  );
}
