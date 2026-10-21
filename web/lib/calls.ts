/**
 * The exact contract call each write sends. Pure, so tests/calls.test.ts can
 * check every one against the deployment's own schema.
 */
export interface Call { method: string; args: unknown[]; value?: bigint }

export const calls = {
  createProduct: (json: string): Call => ({ method: "create_product", args: [json] }),
  deposit: (pid: string, wei: bigint): Call => ({ method: "deposit", args: [pid], value: wei }),
  withdraw: (pid: string, shares: bigint): Call => ({ method: "withdraw", args: [pid, shares.toString()] }),
  readVegetation: (yid: string): Call => ({ method: "read_vegetation", args: [yid] }),
  closeProduct: (pid: string): Call => ({ method: "close_product", args: [pid] }),
  buyPolicy: (pid: string, start: string, premium: bigint): Call => ({ method: "buy_policy", args: [pid, start], value: premium }),
  readIndex: (yid: string): Call => ({ method: "read_index", args: [yid] }),
  voidUnread: (yid: string): Call => ({ method: "void_unread", args: [yid] }),
  contest: (yid: string, text: string, bond: bigint): Call => ({ method: "contest", args: [yid, text], value: bond }),
  answer: (yid: string, text: string): Call => ({ method: "answer", args: [yid, text] }),
  decideContest: (yid: string): Call => ({ method: "decide_contest", args: [yid] }),
  lapseContest: (yid: string): Call => ({ method: "lapse_contest", args: [yid] }),
  appeal: (yid: string, text: string, bond: bigint): Call => ({ method: "appeal", args: [yid, text], value: bond }),
  decideAppeal: (yid: string): Call => ({ method: "decide_appeal", args: [yid] }),
  lapseAppeal: (yid: string): Call => ({ method: "lapse_appeal", args: [yid] }),
  finalize: (yid: string): Call => ({ method: "finalize", args: [yid] }),
  claim: (): Call => ({ method: "claim", args: [] }),
  filePhoto: (yid: string, caption: string, bytes: Uint8Array): Call => ({ method: "file_photo", args: [yid, caption, bytes] }),
  filePage: (yid: string, url: string, caption: string): Call => ({ method: "file_page", args: [yid, url, caption] }),
};

/** Writes that send value, and answer a refusal by returning, not failing. */
export const PAYABLE = new Set(["deposit", "buy_policy", "contest", "appeal"]);
/** Writes a consensus round decides, which take minutes. */
export const ROUNDS = new Set(["read_index", "decide_contest", "decide_appeal", "file_page", "read_vegetation"]);
