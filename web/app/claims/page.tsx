"use client";

import { useState } from "react";

import { Loading, Problem } from "@/components/bits";
import { PolicyRow } from "@/components/PolicyRow";
import { roleOf } from "@/lib/acts";
import { CONTRACT_CONFIGURED } from "@/lib/config";
import { plural, roleWord } from "@/lib/present";
import { listPolicies, policiesOf } from "@/lib/read";
import { useChain } from "@/lib/useChain";
import { useWallet } from "@/lib/wallet";

export default function Claims() {
  const wallet = useWallet();
  const [mine, setMine] = useState(false);
  const showMine = mine && !!wallet.address;
  const list = useChain(
    CONTRACT_CONFIGURED ? (showMine ? `policiesOf.${wallet.address}` : "policies.0.50") : null,
    (f) => (showMine ? policiesOf(wallet.address, f) : listPolicies(0, 50, f)),
  );
  const ys = list.data?.policies ?? [];
  const live = ys.filter((y) => y.state === "CONTESTED" || y.state === "APPEALED" || y.state === "READ" || y.state === "DECIDED");
  const rest = ys.filter((y) => !live.includes(y));
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h-lg">Claim court</h1>
          <p className="mt-2 max-w-[62ch] text-[17px]">Every policy, its reading, and any contest or appeal over it.</p>
        </div>
        <div className="flex rounded-tab border border-mist bg-paper p-1">
          {[false, true].map((m) => (
            <button key={String(m)} type="button" disabled={m && !wallet.address} onClick={() => setMine(m)}
              className={`rounded-[6px] px-4 py-2 text-[14px] disabled:opacity-40 ${showMine === m ? "bg-lilac font-medium" : ""}`}>
              {m ? "Mine" : "All"}
            </button>
          ))}
        </div>
      </div>
      {list.loading ? <Loading what="the policies" /> : list.error ? <Problem title="The chain did not answer" /> : (
        <>
          {live.length ? (
            <section className="flex flex-col gap-3">
              <h2 className="h-md">Open to contest or appeal</h2>
              {live.map((y) => <PolicyRow key={y.policy_id} y={y} you={roleWord(roleOf(y, wallet.address)) ? `You are the ${roleWord(roleOf(y, wallet.address))}` : undefined} />)}
            </section>
          ) : null}
          <section className="flex flex-col gap-3">
            <h2 className="h-md">{live.length ? "Everything else" : plural(ys.length, "policy", "policies")}</h2>
            {rest.map((y) => <PolicyRow key={y.policy_id} y={y} you={roleWord(roleOf(y, wallet.address)) ? `You are the ${roleWord(roleOf(y, wallet.address))}` : undefined} />)}
            {ys.length === 0 ? <p className="muted">{showMine ? "This wallet holds no policy yet." : "No policy has been bought yet."}</p> : null}
          </section>
        </>
      )}
    </div>
  );
}
