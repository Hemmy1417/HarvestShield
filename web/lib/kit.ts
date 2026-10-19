"use client";

/**
 * The Transaction Kit, bound to the CONNECTED wallet's provider (never a
 * bare window.ethereum grab). Prices come from the network's live fee
 * policy; the one write that sends value out of the contract (claim) is
 * priced by simulation, see withTransferAllocations.
 */
import {
  createTransactionKit,
  type PolicyQuote,
  type SubmitInput,
  type TransactionKit,
} from "@genlayer/transaction-kit";
import { createClient } from "genlayer-js";
import { useMemo } from "react";

import { STUDIO_NEXT } from "./chain";
import { useWallet } from "./wallet";

/**
 * Writes that emit a value transfer out of the contract. Studio Next's
 * leader refuses such a write unless its fees carry the message
 * allocations the fee SIMULATION measured (`fee no_matching_allocation #
 * external`) and the transaction still FINALIZES, so the wallet sees a
 * "successful" round that paid nothing. The kit (0.1.0-rc.2) prices from
 * defaults and submits without allocations, so these methods are priced
 * by simulation instead.
 */
export const TRANSFER_METHODS: ReadonlySet<string> = new Set(["claim"]);

type Allocations = unknown[];
type SimulatedFees = {
  distribution: PolicyQuote["distribution"];
  feeValue: bigint;
  messageAllocations?: Allocations;
};
export type TransferClient = {
  estimateTransactionFeesForWrite(args: {
    address: `0x${string}`;
    functionName: string;
    args: unknown[];
    value: bigint;
    appealRounds: bigint;
    rotations: bigint[];
  }): Promise<SimulatedFees>;
  writeContract(args: {
    address: `0x${string}`;
    functionName: string;
    args: unknown[];
    value: bigint;
    fees: { distribution: PolicyQuote["distribution"]; feeValue: bigint; messageAllocations: Allocations };
  }): Promise<`0x${string}`>;
};

const isTransfer = (tx?: SubmitInput): tx is Extract<SubmitInput, { kind: "write" }> =>
  tx?.kind === "write" && TRANSFER_METHODS.has(tx.method);

export function withTransferAllocations(kit: TransactionKit, client: TransferClient): TransactionKit {
  const allocationsFor = new WeakMap<PolicyQuote, Allocations>();
  return {
    ...kit,
    async estimate(input, tx) {
      const quote = await kit.estimate(input, tx);
      if (!isTransfer(tx) || quote.gasless) return quote;
      const sim = await client.estimateTransactionFeesForWrite({
        address: tx.address,
        functionName: tx.method,
        args: tx.args ?? [],
        value: quote.userValue,
        appealRounds: quote.distribution.appealRounds,
        rotations: quote.distribution.rotations,
      });
      const allocations = sim.messageAllocations ?? [];
      if (allocations.length === 0) {
        throw new Error("The payout simulation found no transfer to fund, so nothing was signed.");
      }
      const d = sim.distribution;
      const q = quote.distribution;
      const capsMatch =
        d.maxPriceGenPerTimeUnit === q.maxPriceGenPerTimeUnit &&
        d.storageFeeMaxGasPrice === q.storageFeeMaxGasPrice &&
        d.receiptFeeMaxGasPrice === q.receiptFeeMaxGasPrice;
      const priced: PolicyQuote = {
        ...quote,
        distribution: d,
        feeValue: sim.feeValue,
        total: sim.feeValue + quote.userValue,
        breakdown: { ...quote.breakdown, messageFees: d.totalMessageFees },
        // The policy check compares price caps only; it carries over when the
        // simulated distribution uses the same caps, and is not claimed otherwise.
        verification: capsMatch ? { status: quote.verification.status } : { status: "unavailable" },
      };
      allocationsFor.set(priced, allocations);
      return priced;
    },
    async submit(quote, tx) {
      const allocations = allocationsFor.get(quote);
      // A gasless network takes no fees, so there is nothing to allocate.
      if (!isTransfer(tx) || quote.gasless) return kit.submit(quote, tx);
      if (!allocations) throw new Error("This payout was not priced by simulation, so nothing was signed.");
      const genlayerTxId = await client.writeContract({
        address: tx.address,
        functionName: tx.method,
        args: tx.args ?? [],
        value: quote.userValue,
        fees: { distribution: quote.distribution, feeValue: quote.feeValue, messageAllocations: allocations },
      });
      return { genlayerTxId };
    },
  };
}

export function useTransactionKit(): TransactionKit | null {
  const { provider, address, chainOk } = useWallet();
  return useMemo(() => {
    if (!provider || !address?.startsWith("0x") || !chainOk) return null;
    const account = address as `0x${string}`;
    const kit = createTransactionKit({ chain: STUDIO_NEXT, provider, account });
    const client = createClient({
      chain: { ...STUDIO_NEXT },
      provider,
      account,
    } as Parameters<typeof createClient>[0]) as unknown as TransferClient;
    return withTransferAllocations(kit, client);
  }, [provider, address, chainOk]);
}
