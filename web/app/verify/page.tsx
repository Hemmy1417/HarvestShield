"use client";

/** How to check this deployment: the one page where machine values are the point. */
import { Card, Loading, TextLink } from "@/components/bits";
import { addressUrl } from "@/lib/chain";
import { CONTRACT_ADDRESS, CONTRACT_CONFIGURED, IS_RECORD, REPO_URL, SOURCE_SHA256, SOURCE_URL } from "@/lib/config";
import { gen, span } from "@/lib/present";
import { getConfig } from "@/lib/read";
import { useChain } from "@/lib/useChain";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-mist py-3 md:grid-cols-[240px_1fr]">
      <dt className="muted text-[14px]">{k}</dt>
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
        <h1 className="h-lg">Check it yourself</h1>
        <p className="mt-2 max-w-[62ch] text-[17px]">This app reads one contract on GenLayer Studio Next. No server and no database: every figure comes from the contract.</p>
      </div>
      <Card>
        <dl>
          <Row k="Contract" v={<span className="mono break-all">{CONTRACT_ADDRESS}</span>} />
          <Row k="Deployment" v={IS_RECORD ? "The deployment of record" : "A test deployment set by this build"} />
          <Row k="On the explorer" v={<TextLink href={addressUrl(CONTRACT_ADDRESS)} external>Studio explorer</TextLink>} />
          <Row k="Source" v={<TextLink href={SOURCE_URL} external>contracts/harvestshield.py</TextLink>} />
          <Row k="Source sha256" v={<span className="mono break-all">{SOURCE_SHA256 || "Recorded once the deployment of record is made"}</span>} />
          <Row k="Repository" v={<TextLink href={REPO_URL} external>{REPO_URL.replace("https://", "")}</TextLink>} />
        </dl>
      </Card>
      <Card>
        <p className="h-md">The contract reports</p>
        {cfg.loading ? <div className="mt-3"><Loading what="the contract's rules" /></div> : c ? (
          <dl className="mt-3">
            <Row k="Rule set" v={<span className="mono">{c.ruleset}</span>} />
            <Row k="Datasets" v={c.sources.map((s) => s.name).join("; ")} />
            <Row k="Windows" v={`${c.min_window_days} to ${c.max_window_days} days`} />
            <Row k="Smallest premium or payout" v={`${gen(c.min_wei)} GEN`} />
            <Row k="Periods" v={`Between ${span(c.min_period_seconds)} and ${span(c.max_period_seconds)}`} />
            <Row k="Bond" v={`${c.bond_bps / 100}% of the payout`} />
            <Row k="Reading long stop" v={`${c.read_long_stop_days} days from the window's end or the purchase, the later`} />
          </dl>
        ) : <p className="mt-3">The contract did not answer. Reload in a moment.</p>}
      </Card>
      <Card>
        <p className="h-md">From a terminal</p>
        <p className="mt-2 max-w-[64ch] text-[15px]">The GenLayer command line prints the code a deployment holds; its sha256 should match the file in the repository. Each policy page links the exact dataset URLs the validators fetch.</p>
        <pre className="mono mt-4 overflow-x-auto rounded-[12px] bg-ink p-4 text-paper">{`genlayer code ${CONTRACT_ADDRESS} > deployed.py
sha256sum deployed.py contracts/harvestshield.py`}</pre>
      </Card>
    </div>
  );
}
