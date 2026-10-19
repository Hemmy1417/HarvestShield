"use client";

/**
 * One contract write: a button that opens the transaction panel for exactly
 * this call. A payable write answers a refusal by returning, so success on
 * chain is only success here once the returned record says so.
 */
import { useMemo, useState } from "react";

import { Button } from "./bits";
import { TxPanel, type TxOutcome } from "./TxPanel";
import { PAYABLE, ROUNDS, type Call } from "@/lib/calls";
import { CONTRACT_ADDRESS } from "@/lib/config";
import { useTransactionKit } from "@/lib/kit";
import { refusal } from "@/lib/present";
import { returnedJson } from "@/lib/receipt";
import { useWallet } from "@/lib/wallet";

export function Write({
  call, label, confirm, disabled, variant = "primary", onDone,
}: {
  call: Call;
  label: string;
  confirm?: string;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  onDone?: (returned: Record<string, unknown> | null) => void;
}) {
  const wallet = useWallet();
  const kit = useTransactionKit();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const tx = useMemo(
    () => ({ kind: "write" as const, address: CONTRACT_ADDRESS, method: call.method, args: call.args }),
    // Frozen when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  async function done(o: TxOutcome) {
    if (!o.successful || !o.hash) return;
    const out = await returnedJson<Record<string, unknown>>(o.hash).catch(() => null);
    if (PAYABLE.has(call.method) && out?.refused) {
      setNote(`The contract refused it: ${refusal(String(out.reason ?? ""))} What you sent is credited back to this wallet.`);
      return;
    }
    setNote("Done.");
    onDone?.(out);
  }

  if (!wallet.address) return <p className="muted text-[14px]">Connect a wallet to do this.</p>;
  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <div><Button variant={variant} disabled={disabled || !kit || !wallet.chainOk} onClick={() => { setNote(""); setOpen(true); }}>{label}</Button></div>
        {!wallet.chainOk ? <p className="muted text-[13px]">Switch the wallet to Studio Next first.</p> : null}
        {note ? <p className="text-[14px]">{note}</p> : null}
      </div>
    );
  }
  return kit ? (
    <div className="flex flex-col gap-3">
      <TxPanel
        kit={kit}
        tx={tx}
        value={call.value}
        confirmText={confirm ?? label}
        working={ROUNDS.has(call.method) ? "Every validator is fetching or judging the rainfall itself. This takes a few minutes." : undefined}
        onDone={(o) => void done(o)}
        onClose={() => setOpen(false)}
      />
      {note ? <p className="text-[14px]">{note}</p> : null}
    </div>
  ) : null;
}
