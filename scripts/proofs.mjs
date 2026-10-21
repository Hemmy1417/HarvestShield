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
 *   P2 graded drought replay: Open-Meteo earns the 40% step and pays it;
 *     the insurer cannot contest a reading no other dataset grades lower
 *   P3 forward product: refusals before the window, closing, withdrawing
 *   P4 graded replay at Des Moines, Iowa, with a NOAA rain gauge: the gauge is
 *     read beside the datasets, satellite vegetation is recorded, the farmer
 *     contests on the gauge and NASA, the validators decide, the grade pays
 * P1's pool has a second backer; both backers redeem what they are owed, and
 * then every side draws.
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
const ROUNDS = new Set(["read_index", "decide_contest", "decide_appeal", "file_page", "read_vegetation"]);
const AGREED = new Set(["MAJORITY_AGREE", "AGREE"]);

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
    let failed = null;
    try {
      t = await waitFinal(hash, { label: name, tries: ROUNDS.has(fn) ? 450 : 150 });
      secs = Math.round((Date.now() - t0) / 1000);
      // A round the validators did not agree on changed nothing, whatever the leader says.
      if (!AGREED.has(t.result_name)) failed = String(t.result_name);
    } catch (e) {
      if (!/UNDETERMINED|CANCELED/.test(e.message)) throw e;
      failed = e.message;
    }
    if (!failed) break;
    delete run.pending[name];
    (run.no_consensus ??= []).push({ name, hash, result: failed, at: new Date().toISOString() });
    save();
    if (ask >= attempts) throw new Error(`${name}: no agreement after ${attempts} asks (${failed})`);
    say(`${name}: no agreement (${failed}), nothing recorded; asking again (${ask + 1} of ${attempts})`);
    await sleep(15000);
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
  const rec = { name, role, fn, hash, secs, ok, consensus: t.result_name, returned, text: text.slice(0, 600), explorer: `${EXPLORER}/tx/${hash}` };
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

/** Every wei a policy took in is held, paid to a side, or a bond handed back;
 * the graded share of the payout came from the pool's reserve. */
function conserved(y) {
  let took = BigInt(y.premium_wei) + BigInt(y.payout_wei) * BigInt(y.grade_paid ?? 0) / 100n;
  let back = 0n;
  for (const k of ["contest", "appeal"]) {
    if (!y[k]) continue;
    took += BigInt(y[k].bond_wei);
    if (["MOVED", "LAPSED"].includes(y[k].result)) back += BigInt(y[k].bond_wei);
  }
  return BigInt(y.held_wei) + BigInt(y.paid_farmer_wei) + BigInt(y.paid_pool_wei) + back === took;
}

const CLAUSE = "Where the datasets disagree, prefer the one whose daily pattern is more plausible for "
  + "the season; a single day of extreme rain that the other dataset does not show is treated as a fault "
  + "in that dataset. Where neither pattern is clearly more plausible, the selected reading stands.";

const STEPS = [{ threshold_tenths: 1400, pct: 40 }, { threshold_tenths: 1300, pct: 70 }, { threshold_tenths: 500, pct: 100 }];

function productJson({ threshold, tiers, replay = true, start = SEASON, region = "Abuja, Federal Capital Territory",
  lat = "9.06", lon = "7.49", station = "" }) {
  return JSON.stringify({
    crop: "Maize", region, lat, lon, station, tiers,
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
    const f = await step(`${key}.fund`, "INSURER", "deposit", [run.ids[key]], { value: fund });
    assert(f.returned?.refused === false && f.returned.shares === fund.toString(), `${key}: the insurer backs the pool, one share per wei to start`);
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
  await once(`${key}: the primary dataset governs and grades the season 0, the backup grades it 100`, async () =>
    r.returned.selected === "OPEN_METEO" && r.returned.grade === 0 && y.reading.other_grade === 100);
  return yid;
}

// ── P1: the datasets disagree ────────────────────────────────────────────────

async function p1Setup() {
  const pid = await newProduct("P1", { threshold: 1400 }, 4n * GEN);
  const second = await step("P1.second-backer", "STRANGER", "deposit", [pid], { value: GEN });
  assert(second.returned?.refused === false, "P1: a second backer buys into the pool");
  const dust = await step("P1.dust-deposit", "STRANGER", "deposit", [pid], { value: 10n ** 15n });
  assert(dust.returned?.refused === true && /at least/.test(dust.returned.reason), "P1: a dust deposit is refused and credited back");
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
  const expected = d.returned.verdict === "STANDS" ? 0 : d.returned.verdict === "USE_OTHER" ? 100 : null;
  await once("A: code turned the verdict into the outcome the rules define", async () => y.decision.outcome === expected);
  await once("A: the bond went where the moved rule says", async () =>
    y.contest.result === (expected === 0 ? "HELD" : "MOVED"));
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

const P2_STEPS = [{ threshold_tenths: 2000, pct: 40 }, { threshold_tenths: 1300, pct: 70 }, { threshold_tenths: 500, pct: 100 }];

async function p2() {
  const pid = await newProduct("P2", { threshold: 2000, tiers: P2_STEPS }, GEN);
  const e = await buy("E", pid);
  const r = await step("E.read", "STRANGER", "read_index", [e]);
  const y = await policy(e);
  assert(r.returned.grade === 40 && y.reading.other_grade === 70,
    "E: Open-Meteo's 163 mm earns the 40% step, NASA POWER's 117 mm the 70% step");
  await step("E.insurer-contests", "INSURER", "contest", [e, "We dispute this reading."], { value: 5n * GEN / 100n });
  await once("E: the insurer cannot contest a grade no other reading puts lower", async () =>
    run.steps["E.insurer-contests"].returned?.refused === true && /went your way/.test(run.steps["E.insurer-contests"].returned.reason));
  return e;
}

async function p2Finish(e) {
  let y = await policy(e);
  await after(y.contest_ends, "E's contest period");
  await step("E.finalize", "STRANGER", "finalize", [e]);
  y = await policy(e);
  const share = (GEN / 2n) * 40n / 100n;
  assert(y.grade_paid === 40 && y.paid_farmer_wei === share.toString() && conserved(y), "E: 40% of the payout goes to the farmer");
  const p = await product(run.ids.P2);
  assert(p.paid_out_wei === share.toString() && p.reserved_wei === "0" && p.pool_wei === (GEN - share + GEN / 10n).toString(),
    "P2: the share came out of the pool, which kept the premium");
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
  await step("P3.withdraw-reserved", "INSURER", "withdraw", [pid, GEN.toString()], { refused: "more than the pool holds unreserved" });
  await step("P3.withdraw", "INSURER", "withdraw", [pid, (GEN / 2n).toString()]);
  await step("P3.close", "INSURER", "close_product", [pid]);
  await step("P3.buy-closed", "FARMER", "buy_policy", [pid, tomorrow], { value: GEN / 10n });
  await once("P3: a closed product sells nothing", async () => run.steps["P3.buy-closed"].returned?.refused === true);
}

// ── P4: a graded product with a NOAA rain gauge, and satellite vegetation ─────

async function p4() {
  const pid = await newProduct("P4", { threshold: 1400, tiers: STEPS, region: "Des Moines, Iowa", lat: "41.53",
    lon: "-93.65", station: "USW00014933" }, GEN);
  const g = await buy("G", pid);
  const r = await step("G.read", "STRANGER", "read_index", [g]);
  let y = await policy(g);
  const st = y.reading.station;
  await once("G: the NOAA gauge is read beside the datasets, within reach of the point, every day reported", async () =>
    st.status === "OK" && st.km <= 50 && st.summary.days_reported === 14);
  observe(`G: Open-Meteo ${y.reading.summaries.OPEN_METEO.total_tenths / 10} mm grades ${r.returned.grade}%, NASA POWER `
    + `${y.reading.summaries.NASA_POWER.total_tenths / 10} mm ${y.reading.other_grade}%, the gauge ${st.summary.total_tenths / 10} mm ${st.grade}%`);
  const v = await step("G.vegetation", "STRANGER", "read_vegetation", [g]);
  y = await policy(g);
  await once("G: satellite vegetation is recorded with its digest", async () =>
    y.vegetation && y.vegetation.digest.length === 64 && y.vegetation.window_mean === v.returned.window_mean);
  observe(`G: vegetation index ${v.returned.window_mean / 10000} against ${v.returned.baseline_mean === null ? "no usable baseline" : v.returned.baseline_mean / 10000}`
    + `, ${Object.values(y.vegetation.clouded).reduce((a, b) => a + b, 0)} cloudy composites left out`);
  await step("G.vegetation-twice", "STRANGER", "read_vegetation", [g], { refused: "already recorded" });
  const better = [y.reading.other_grade, st.grade].some((x) => x !== null && x > r.returned.grade);
  if (!better) {
    observe("G: no other reading graded the season above the selected one, so there was nothing for the farmer to contest");
    await after(y.contest_ends, "G's contest period");
    await step("G.finalize", "STRANGER", "finalize", [g]);
  } else {
    const bond = BigInt(y.bond_wei);
    await step("G.contest", "FARMER", "contest", [g, "The rain gauge a kilometre from the field and NASA POWER both show a drier season than Open-Meteo."], { value: bond });
    await step("G.answer", "INSURER", "answer", [g, "Open-Meteo is the selected dataset and its daily pattern is plausible for Iowa in August."]);
    await after((await policy(g)).response_ends, "G's response period");
    const d = await step("G.decide", "FARMER", "decide_contest", [g]);
    observe(`G: the validators found ${d.returned.verdict}, which pays ${d.returned.outcome}%`);
    y = await policy(g);
    await once("G: the decision recorded the gauge and the vegetation it weighed, by digest", async () =>
      y.rounds[0].station_digest === st.summary.digest && y.rounds[0].vegetation_digest === y.vegetation.digest);
    await after(y.appeal_ends, "G's appeal window");
    await step("G.finalize", "STRANGER", "finalize", [g]);
  }
  y = await policy(g);
  const g0 = y.grade_paid ?? 0;
  assert(y.state === "SETTLED" && y.paid_farmer_wei === ((GEN / 2n) * BigInt(g0) / 100n
    + (y.contest && y.contest.result === "MOVED" ? BigInt(y.contest.bond_wei) : 0n)).toString() && conserved(y),
  "G: the farmer is paid exactly the grade's share of the payout, and every wei is accounted for");
}

async function redeem(key, role) {
  const pid = run.ids[key];
  const b = await readJson("get_backer", [pid, KEYS[role].addr]);
  if (run.steps[`${key}.redeem.${role}`]) return say(`${key}.redeem.${role}: done earlier`);
  if (BigInt(b.shares) === 0n) return say(`${role} holds no shares in ${key}`);
  const out = await step(`${key}.redeem.${role}`, role, "withdraw", [pid, b.shares]);
  assert(out.returned.withdrawn_wei === b.worth_wei, `${key}: ${role} redeems every share for exactly its worth`);
}

async function draw(role) {
  const key = `draw.${role}`;
  if (run.steps[key]) return say(`${key}: done earlier`);
  if ((await owed(role)) === 0n) return say(`${role} is owed nothing`);
  await step(key, role, "claim", [], { transfer: true });
  assert((await owed(role)) === 0n, `${role}'s ledger is empty after drawing`);
}

const cfg = await readJson("get_config", []);
assert(cfg.ruleset === "harvestshield-rules-2", "the deployment runs this rule set");
const p1s = await p1Setup();
await p1A(p1s.pid, p1s.bond);
const d = await p1D(p1s.pid);
const e = await p2();
await p3();
await p4();
await p2Finish(e);
await p1Finish(p1s, d);
const p1 = await product(run.ids.P1);
await once("P1: every policy settled, nothing is reserved, and the pool kept what it earned", async () =>
  p1.active === 0 && p1.reserved_wei === "0" && BigInt(p1.earned_wei) > 0n);
await redeem("P1", "STRANGER");
await redeem("P1", "INSURER");
await draw("FARMER");
await draw("INSURER");
await draw("STRANGER");
const writes = new Set(Object.values(run.steps).map((s) => s.fn));
say(`writes reached: ${[...writes].sort().join(", ")} (${writes.size})`);
assert(writes.size === 19, "every write the contract has was sent");
run.checks = run.passed.length;
run.finished_at = new Date().toISOString();
save();
say(`EVERY CHECK PASSED (${run.checks} checks, ${Object.keys(run.steps).length} transactions, `
  + `${(run.no_consensus ?? []).length} rounds without a majority)`);
