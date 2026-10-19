/**
 * Live proofs on a HarvestShield deployment, on GenLayer Studio Next, against
 * real weather: Abuja, 1 to 14 August 2026, where Open-Meteo reads about
 * 163 mm and NASA POWER about 117 mm. Every claim is an assertion; what the
 * validators were free to decide is logged as observed.
 *
 *   node scripts/proofs.mjs 0x…            run every proof in order (resumable)
 *
 * Contest A carries the evidence: two photographs and the farmer's field report.
 *
 *   P1 drought replay, 140 mm: the datasets disagree about the trigger
 *     A  read, contested by the farmer, answered, decided, appealed, decided
 *     B  read, contested, never decided: the contest lapses
 *     C  read, contested, decided, appealed, never decided: the appeal lapses
 *     D  read, not contested: settles on the reading
 *   P2 drought replay, 200 mm: both datasets trigger; nothing to contest; pays
 *   P3 forward product: refusals before the window, closing, withdrawing
 * then both sides draw what they are owed.
 */
import { createAccount, createClient } from "genlayer-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EXPLORER, GEN, chain, leaderOf, loadKeys, plainFees, resultText, rpc, sleep,
         transferFees, waitFinal } from "./lib.mjs";

const ADDRESS = process.argv[2];
if (!/^0x[0-9a-fA-F]{40}$/.test(ADDRESS ?? "")) throw new Error("usage: node scripts/proofs.mjs 0x…");
const OUT = fileURLToPath(new URL(`../.data/proofs-${ADDRESS}.json`, import.meta.url));
const KEYS = loadKeys();
const run = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf-8")) : { address: ADDRESS, steps: {}, ids: {}, passed: [], observed: [] };
const save = () => writeFileSync(OUT, JSON.stringify(run, null, 2));
const say = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const clientFor = (role) => createClient({ chain, account: createAccount(KEYS[role].pk) });
const reader = createClient({ chain, account: createAccount(KEYS.STRANGER.pk) });
const PERIOD = 600;
const SEASON = "2026-08-01";
const FIXTURES = new URL("../fixtures/", import.meta.url);
const photo = (name) => new Uint8Array(readFileSync(new URL(`photos/${name}`, FIXTURES)));
const REPORT = "https://raw.githubusercontent.com/Hemmy1417/HarvestShield/6c828a0213b429379fd9a3e5b72e901fc1b3366c/fixtures/pages/farmer-field-report.txt";

function assert(cond, message) {
  if (!cond) {
    say(`ASSERTION FAILED: ${message}`);
    process.exit(2);
  }
  if (!run.passed.includes(message)) run.passed.push(message);
  save();
}
/** A claim about one moment: once proved, a resumed run does not test it again. */
async function once(message, check) {
  if (run.passed.includes(message)) return say(`checked earlier: ${message}`);
  assert(await check(), message);
}
function observe(what) {
  if (!run.observed.includes(what)) run.observed.push(what);
  save();
  say(`observed: ${what}`);
}

async function read(fn, args) {
  for (let i = 0; i < 8; i++) {
    try {
      return await reader.readContract({ address: ADDRESS, functionName: fn, args });
    } catch (e) {
      if (i === 7) throw e;
      await sleep(5000 * (i + 1));
    }
  }
}
const readJson = async (fn, args) => JSON.parse(await read(fn, args));
const policy = (yid) => readJson("get_policy", [yid]);
const product = (pid) => readJson("get_product", [pid]);
const owed = async (role) => BigInt((await readJson("get_balance", [KEYS[role].addr])).claimable);
const ROUNDS = new Set(["read_index", "decide_contest", "decide_appeal"]);

async function step(name, role, fn, args, { value = 0n, transfer = false, refused = null } = {}) {
  if (run.steps[name]) {
    say(`${name}: done earlier`);
    return run.steps[name];
  }
  run.pending ??= {};
  const attempts = ROUNDS.has(fn) ? 3 : 1;
  let hash, t, secs;
  for (let ask = 1; ; ask++) {
    hash = run.pending[name];
    if (!hash) {
      for (let attempt = 0; ; attempt++) {
        try {
          const client = clientFor(role);
          const fees = transfer
            ? await transferFees(client, { address: ADDRESS, functionName: fn, args, value })
            : await plainFees(client);
          hash = await client.writeContract({ address: ADDRESS, functionName: fn, args, value, fees });
          break;
        } catch (e) {
          if (attempt >= 4) throw e;
          say(`${name}: send failed (${String(e.message).slice(0, 80)}), retrying`);
          await sleep(8000 * (attempt + 1));
        }
      }
      run.pending[name] = hash;
      save();
      say(`${name}: ${role} ${fn} ${hash}`);
    } else {
      say(`${name}: waiting again on ${hash}`);
    }
    const t0 = Date.now();
    try {
      t = await waitFinal(hash, { label: name, tries: ROUNDS.has(fn) ? 450 : 150 });
      secs = Math.round((Date.now() - t0) / 1000);
      break;
    } catch (e) {
      if (!/UNDETERMINED|CANCELED/.test(e.message)) throw e;
      delete run.pending[name];
      (run.no_consensus ??= []).push({ name, hash, at: new Date().toISOString() });
      save();
      if (ask >= attempts) throw e;
      say(`${name}: no majority, nothing recorded; asking again (${ask + 1} of ${attempts})`);
      await sleep(15000);
    }
  }
  delete run.pending[name];
  const leader = leaderOf(t);
  const ok = leader?.execution_result === "SUCCESS";
  const text = resultText(leader);
  say(`${name}: ${t.status} leader=${leader?.execution_result} in ${secs} s`);
  if (refused) {
    assert(!ok, `${name} should have been refused`);
    assert(text.includes(refused), `${name} refusal should say "${refused}", said "${text.slice(0, 200)}"`);
  } else {
    assert(ok, `${name} failed: ${text.slice(0, 300)}`);
  }
  const i = text.indexOf("{");
  let returned = null;
  try { returned = i >= 0 ? JSON.parse(text.slice(i)) : null; } catch { returned = null; }
  const rec = { name, role, fn, hash, secs, ok, returned, text: text.slice(0, 600), explorer: `${EXPLORER}/tx/${hash}` };
  run.steps[name] = rec;
  save();
  return rec;
}

async function after(iso, label) {
  const at = Date.parse(iso) + 20_000;
  while (Date.now() < at) {
    say(`waiting for ${label}: ${Math.ceil((at - Date.now()) / 60000)} min left`);
    await sleep(Math.min(60_000, at - Date.now()));
  }
}

function conserved(y) {
  const took = BigInt(y.premium_wei) + (y.paid_to_farmer ? BigInt(y.payout_wei) : 0n)
    + (y.contest ? BigInt(y.contest.bond_wei) : 0n) + (y.appeal ? BigInt(y.appeal.bond_wei) : 0n);
  return BigInt(y.held_wei) + BigInt(y.paid_farmer_wei) + BigInt(y.paid_insurer_wei) === took;
}

const CLAUSE = "Where the datasets disagree, prefer the one whose daily pattern is more plausible for "
  + "the season; a single day of extreme rain that the other dataset does not show is treated as a fault "
  + "in that dataset. Where neither pattern is clearly more plausible, the selected reading stands.";

function productJson({ threshold, replay = true, start = SEASON }) {
  return JSON.stringify({
    crop: "Maize", region: "Abuja, Federal Capital Territory", lat: "9.06", lon: "7.49",
    trigger: "RAIN_BELOW", threshold_tenths: threshold, window_days: 14,
    premium_wei: (GEN / 10n).toString(), payout_wei: (GEN / 2n).toString(), capacity: 6,
    primary: "OPEN_METEO", backup: "NASA_POWER", dispute_clause: CLAUSE,
    periods: { contest: PERIOD, response: PERIOD, appeal: PERIOD }, replay, replay_start: replay ? start : "",
  });
}

async function newProduct(key, opts, fund) {
  const rec = await step(`${key}.create`, "INSURER", "create_product", [productJson(opts)]);
  run.ids[key] ??= rec.returned.product_id;
  save();
  if (fund) {
    const f = await step(`${key}.fund`, "INSURER", "fund_product", [run.ids[key]], { value: fund });
    assert(f.returned?.refused === false, `${key} is funded`);
  }
  return run.ids[key];
}

async function buy(key, pid, start = SEASON) {
  const rec = await step(`${key}.buy`, "FARMER", "buy_policy", [pid, start], { value: GEN / 10n });
  assert(rec.returned?.refused === false, `${key}: the farmer buys the policy`);
  run.ids[key] ??= rec.returned.policy_id;
  save();
  return run.ids[key];
}

async function readAndContest(key, pid) {
  const yid = await buy(key, pid);
  const r = await step(`${key}.read`, "STRANGER", "read_index", [yid]);
  say(`${key} reading: ${JSON.stringify(r.returned)}`);
  const y = await policy(yid);
  await once(`${key}: both datasets were read and recorded in full`, async () =>
    y.reading.summaries.OPEN_METEO.days_reported === 14 && y.reading.summaries.NASA_POWER.days_reported === 14);
  await once(`${key}: the primary dataset governs and reads no drought, the backup reads one`, async () =>
    r.returned.selected === "OPEN_METEO" && r.returned.triggered === false && y.reading.other_triggers === true);
  return yid;
}

// ── P1: the datasets disagree ────────────────────────────────────────────────

async function p1Setup() {
  const pid = await newProduct("P1", { threshold: 1400 }, 4n * GEN);
  const bond = 5n * GEN / 100n; // 10% of a 0.5 GEN payout, the 0.01 floor not reached

  // A wrong premium is refused by returning, and credited back.
  const wrong = await step("P1.buy-wrong-premium", "FARMER", "buy_policy", [pid, SEASON], { value: GEN });
  assert(wrong.returned?.refused === true && /exactly the premium/.test(wrong.returned.reason), "a wrong premium is refused in words");
  const cherry = await step("P1.buy-other-season", "FARMER", "buy_policy", [pid, "2025-08-01"], { value: GEN / 10n });
  assert(cherry.returned?.refused === true && /covers only the season/.test(cherry.returned.reason), "a replay covers only the season its insurer named");

  // B and C first: their long stops run while the rest proceeds.
  const b = await readAndContest("B", pid);
  const bc = await step("B.contest", "FARMER", "contest", [b, "NASA POWER shows the dry spell my maize suffered in early August."], { value: bond });
  assert(bc.returned?.refused === false, "B: the farmer contests the reading with the bond");
  await step("B.lapse-too-early", "STRANGER", "lapse_contest", [b], { refused: "has not lapsed" });

  const c = await readAndContest("C", pid);
  await step("C.insurer-contests", "INSURER", "contest", [c, "We would like a second look."], { value: bond });
  await once("C: the side the reading favoured cannot contest it", async () =>
    run.steps["C.insurer-contests"].returned?.refused === true && /went your way/.test(run.steps["C.insurer-contests"].returned.reason));
  await step("C.contest", "FARMER", "contest", [c, "The clause favours the series without implausible days; NASA has none."], { value: bond });
  await step("C.answer", "INSURER", "answer", [c, "Open-Meteo's August pattern is typical for Abuja; NASA's early dry days are the outlier."]);
  await after((await policy(c)).response_ends, "C's response period");
  const cd = await step("C.decide", "FARMER", "decide_contest", [c]);
  say(`C decision: ${JSON.stringify(cd.returned)}`);
  observe(`C: the validators found ${cd.returned.verdict}`);
  let y = await policy(c);
  const appellant = y.decision.against[0] === "FARMER" ? "FARMER" : y.decision.against[0];
  const ca = await step("C.appeal", appellant, "appeal", [c, "The decision misapplies the clause to the daily data."], { value: bond });
  assert(ca.returned?.refused === false, "C: a side the decision left short of its best appeals");
  await step("C.lapse-too-early", "STRANGER", "lapse_appeal", [c], { refused: "has not lapsed" });
  return { pid, b, c, bond };
}

async function p1A(pid, bond) {
  const a = await readAndContest("A", pid);
  await step("A.stranger-contests", "STRANGER", "contest", [a, "A stranger's view of this."], { value: bond });
  await once("A: a stranger cannot contest", async () => run.steps["A.stranger-contests"].returned?.refused === true);
  await step("A.contest", "FARMER", "contest", [a, "NASA POWER shows the dry spell; Open-Meteo's wet days 2 and 11 look like faults."], { value: bond });
  await step("A.decide-too-early", "FARMER", "decide_contest", [a], { refused: "response period has not ended" });
  await step("A.answer", "INSURER", "answer", [a, "Both wet days fall in the rainy season and are plausible; Open-Meteo governs."]);
  await step("A.farmer-photo", "FARMER", "file_photo", [a, "My maize on 10 August: rolled grey leaves, cracked soil.", photo("maize-stressed-10-august.jpg")]);
  await step("A.farmer-page", "FARMER", "file_page", [a, REPORT, "My field report for 1 to 14 August."]);
  await step("A.insurer-photo", "INSURER", "file_photo", [a, "A field near the farm on 10 August.", photo("maize-green-10-august.jpg")]);
  await step("A.stranger-photo", "STRANGER", "file_photo", [a, "Mine.", photo("maize-green-10-august.jpg")], { refused: "only the farmer or the insurer" });
  await step("A.not-an-image", "FARMER", "file_photo", [a, "Not a photo.", new TextEncoder().encode("plain text, not a picture")], { refused: "PNG and JFIF JPEG only" });
  let ya = await policy(a);
  await once("A: the photographs are held on chain byte for byte, and the page as the validators read it", async () => {
    const ev = ya.evidence;
    const pg = ev.find((e) => e.kind === "PAGE");
    return ev.length === 3 && ev.filter((e) => e.kind === "PHOTO").length === 2
      && pg && pg.excerpt.includes("leaves were rolling") && pg.by === "FARMER";
  });
  await after(ya.response_ends, "A's response period");
  await step("A.photo-too-late", "FARMER", "file_photo", [a, "Late.", photo("maize-stressed-10-august.jpg")], { refused: "evidence is filed while" });
  const d = await step("A.decide", "INSURER", "decide_contest", [a]);
  say(`A decision: ${JSON.stringify(d.returned)}`);
  observe(`A: the validators found ${d.returned.verdict}`);
  let y = await policy(a);
  const expected = d.returned.verdict === "STANDS" ? false : d.returned.verdict === "USE_OTHER" ? true : null;
  await once("A: code turned the verdict into the outcome the rules define", async () => y.decision.outcome === expected);
  await once("A: the bond went where the moved rule says", async () =>
    y.contest.result === (expected === false ? "HELD" : "MOVED"));
  const appellant = y.decision.against.includes("INSURER") ? "INSURER" : "FARMER";
  await step("A.appeal", appellant, "appeal", [a, "The decision reads the clause against the daily data the wrong way."], { value: bond });
  const other = appellant === "FARMER" ? "INSURER" : "FARMER";
  await step("A.answer-appeal", other, "answer", [a, "The decision applied the clause as written."]);
  await step("A.decide-appeal-too-early", "FARMER", "decide_appeal", [a], { refused: "appeal's period has not ended" });
  await after((await policy(a)).appeal.evidence_ends, "A's appeal period");
  const ad = await step("A.decide-appeal", "FARMER", "decide_appeal", [a]);
  say(`A appeal: ${JSON.stringify(ad.returned)}`);
  observe(`A: the appeal found ${ad.returned.verdict} (${ad.returned.appeal})`);
  y = await policy(a);
  assert(["SETTLED", "VOID"].includes(y.state) && y.held_wei === "0" && conserved(y), "A: the appeal settles the policy and every wei is accounted for");
  assert(y.rounds.length === 2 && y.rounds.every((r) => r.digests.OPEN_METEO === y.reading.summaries.OPEN_METEO.digest),
    "A: both decisions judged the series the reading recorded");
  assert(y.rounds[0].evidence.length === 3, "A: the contest's decision weighed all three pieces of evidence");
}

async function p1D(pid) {
  const d = await readAndContest("D", pid);
  await step("D.finalize-too-early", "STRANGER", "finalize", [d], { refused: "contest period is still open" });
  return d;
}

async function p1Finish({ b, c }, d) {
  let y = await policy(d);
  await after(y.contest_ends, "D's contest period");
  await step("D.finalize", "STRANGER", "finalize", [d]);
  y = await policy(d);
  assert(y.settled_how === "READING" && y.paid_to_farmer === false && conserved(y), "D: an uncontested reading settles; no payout, premium to the insurer");

  y = await policy(b);
  await after(y.decision_long_stop, "B's contest long stop");
  await step("B.lapse", "STRANGER", "lapse_contest", [b]);
  y = await policy(b);
  assert(y.settled_how === "CONTEST_LAPSED" && y.contest.result === "LAPSED" && conserved(y), "B: an undecided contest lapses, the reading stands, the bond returns");

  y = await policy(c);
  await after(y.appeal.lapse_at, "C's appeal long stop");
  await step("C.lapse", "STRANGER", "lapse_appeal", [c]);
  y = await policy(c);
  assert(y.settled_how === "APPEAL_LAPSED" && y.appeal.result === "LAPSED" && conserved(y), "C: an undecided appeal lapses on the decision, the bond returns");
}

// ── P2: both datasets trigger ───────────────────────────────────────────────

async function p2() {
  const pid = await newProduct("P2", { threshold: 2000 }, GEN);
  const e = await buy("E", pid);
  const r = await step("E.read", "STRANGER", "read_index", [e]);
  assert(r.returned.triggered === true, "E: below 200 mm on the selected dataset, the drought cover triggers");
  await step("E.insurer-contests", "INSURER", "contest", [e, "We dispute this reading."], { value: 5n * GEN / 100n });
  await once("E: with both datasets below the threshold there is nothing to contest", async () =>
    run.steps["E.insurer-contests"].returned?.refused === true && /same side/.test(run.steps["E.insurer-contests"].returned.reason));
  return e;
}

async function p2Finish(e) {
  let y = await policy(e);
  await after(y.contest_ends, "E's contest period");
  await step("E.finalize", "STRANGER", "finalize", [e]);
  y = await policy(e);
  assert(y.paid_to_farmer === true && y.paid_farmer_wei === (GEN / 2n).toString() && conserved(y), "E: the payout goes to the farmer");
  const p = await product(run.ids.P2);
  assert(p.paid_out_wei === (GEN / 2n).toString() && p.reserved_wei === "0", "P2: the payout came out of the product's funding");
}

// ── P3: a forward product ────────────────────────────────────────────────────

async function p3() {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const pid = await newProduct("P3", { threshold: 1400, replay: false }, GEN);
  await step("P3.buy-today", "FARMER", "buy_policy", [pid, new Date().toISOString().slice(0, 10)], { value: GEN / 10n });
  await once("P3: a forward window must start after the day of purchase", async () =>
    run.steps["P3.buy-today"].returned?.refused === true);
  const f = await buy("F", pid, run.steps["F.buy"]?.returned?.window_start ?? tomorrow);
  await step("F.read-too-early", "STRANGER", "read_index", [f], { refused: "window has not ended" });
  await step("F.void-too-early", "STRANGER", "void_unread", [f], { refused: "long stop has not passed" });
  await step("P3.withdraw-reserved", "INSURER", "withdraw_capital", [pid, GEN.toString()], { refused: "more than the funding no policy has reserved" });
  await step("P3.withdraw", "INSURER", "withdraw_capital", [pid, (GEN / 2n).toString()]);
  await step("P3.close", "INSURER", "close_product", [pid]);
  await step("P3.buy-closed", "FARMER", "buy_policy", [pid, tomorrow], { value: GEN / 10n });
  await once("P3: a closed product sells nothing", async () => run.steps["P3.buy-closed"].returned?.refused === true);
}

async function draw(role) {
  const key = `draw.${role}`;
  if (run.steps[key]) return say(`${key}: done earlier`);
  if ((await owed(role)) === 0n) return say(`${role} is owed nothing`);
  await step(key, role, "claim", [], { transfer: true });
  assert((await owed(role)) === 0n, `${role}'s ledger is empty after drawing`);
}

const cfg = await readJson("get_config", []);
assert(cfg.ruleset === "harvestshield-rules-1", "the deployment runs this rule set");
const p1s = await p1Setup();
await p1A(p1s.pid, p1s.bond);
const d = await p1D(p1s.pid);
const e = await p2();
await p3();
await p2Finish(e);
await p1Finish(p1s, d);
await draw("FARMER");
await draw("INSURER");
const writes = new Set(Object.values(run.steps).map((s) => s.fn));
say(`writes reached: ${[...writes].sort().join(", ")} (${writes.size})`);
assert(writes.size === 18, "every write the contract has was sent");
run.checks = run.passed.length;
run.finished_at = new Date().toISOString();
save();
say(`EVERY CHECK PASSED (${run.checks} checks, ${Object.keys(run.steps).length} transactions, `
  + `${(run.no_consensus ?? []).length} rounds without a majority)`);
