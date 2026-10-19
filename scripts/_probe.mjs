// Throwaway: call run() on the probe and print every node's reading.
import { createAccount, createClient } from "genlayer-js";
import { chain, dumpReceipt, leaderOf, loadKeys, plainFees, resultText, waitFinal } from "./lib.mjs";

const address = process.argv[2];
const client = createClient({ chain, account: createAccount(loadKeys().INSURER.pk) });
const hash = await client.writeContract({ address, functionName: "run", args: [], value: 0n, fees: await plainFees(client) });
console.log("tx", hash);
const t = await waitFinal(hash, { label: "probe", tries: 120 });
console.log(leaderOf(t)?.execution_result, resultText(leaderOf(t)).slice(0, 300));
await dumpReceipt(hash, ["[PROBE]"]);
