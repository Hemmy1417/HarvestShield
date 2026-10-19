"use client";

/**
 * One policy as a case file: what it covers, what the two datasets read, who
 * contested it and what the validators decided, and the acts open to the
 * viewer. Machine values stay in the record section at the foot.
 */
import { useEffect, useState } from "react";

import { Card, Tag, TextLink } from "./bits";
import { RainChart } from "./RainChart";
import { Write } from "./Write";
import { actsFor, contestable, roleOf, waitingOn, type Act } from "@/lib/acts";
import { calls } from "@/lib/calls";
import { sourceUrl } from "@/lib/sources";
import {
  day, genText, mm, moment, outcomeSentence, policyName, policyState, productName, prose, roleWord,
  settledHow, shortAddress, source, sourceLong, triggerSentence, triggerShort, until, verdict,
} from "@/lib/present";
import type { Policy } from "@/lib/types";
import { useWallet } from "@/lib/wallet";

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

const STEPS = [
  { key: "ACTIVE", title: "Covered" },
  { key: "READ", title: "Read" },
  { key: "CONTESTED", title: "Contested" },
  { key: "DECIDED", title: "Decided" },
  { key: "APPEALED", title: "Appealed" },
  { key: "SETTLED", title: "Settled" },
];

function Steps({ y }: { y: Policy }) {
  const reached = new Set<string>(["ACTIVE"]);
  if (y.reading) reached.add("READ");
  if (y.contest) reached.add("CONTESTED");
  if (y.decision) reached.add("DECIDED");
  if (y.appeal) reached.add("APPEALED");
  if (y.state === "SETTLED" || y.state === "VOID") reached.add("SETTLED");
  const current = y.state === "VOID" ? "SETTLED" : y.state;
  return (
    <ol className="grid grid-cols-3 gap-2 rounded-tab bg-paper p-1 md:grid-cols-6">
      {STEPS.map((s) => {
        const on = s.key === current;
        const done = reached.has(s.key) && !on;
        return (
          <li key={s.key} className={`rounded-[6px] px-3 py-2.5 text-[14px] ${on ? "bg-lilac" : ""}`}>
            <span className={done || on ? "" : "muted"}>{s.title}</span>
            {done ? <span className="ml-1 text-violet" aria-label="done">✓</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

function Statement({ who, text, at, answer }: { who: string; text: string; at: string; answer?: { text: string; at: string; who: string } }) {
  return (
    <div className="flex flex-col gap-3">
      <blockquote className="rounded-[12px] border border-mist bg-parchment p-4">
        <p className="label">The {who}, {day(at)}</p>
        <p className="mt-1.5 text-[15px]">“{text}”</p>
      </blockquote>
      {answer ? (
        <blockquote className="rounded-[12px] border border-mist bg-parchment p-4">
          <p className="label">The {answer.who} answered, {day(answer.at)}</p>
          <p className="mt-1.5 text-[15px]">“{answer.text}”</p>
        </blockquote>
      ) : null}
    </div>
  );
}

function ActForm({ y, act }: { y: Policy; act: Act }) {
  const [text, setText] = useState("");
  const bond = BigInt(y.bond_wei ?? "0");
  const needsText = act.id === "contest" || act.id === "appeal" || act.id === "answer";
  const call = (() => {
    switch (act.id) {
      case "read_index": return calls.readIndex(y.policy_id);
      case "void_unread": return calls.voidUnread(y.policy_id);
      case "contest": return calls.contest(y.policy_id, text, bond);
      case "answer": return calls.answer(y.policy_id, text);
      case "decide_contest": return calls.decideContest(y.policy_id);
      case "lapse_contest": return calls.lapseContest(y.policy_id);
      case "appeal": return calls.appeal(y.policy_id, text, bond);
      case "decide_appeal": return calls.decideAppeal(y.policy_id);
      case "lapse_appeal": return calls.lapseAppeal(y.policy_id);
      default: return calls.finalize(y.policy_id);
    }
  })();
  return (
    <div className="flex flex-col gap-3">
      {needsText ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-[14px]">
            {act.id === "answer" ? "Your answer" : act.id === "appeal" ? "Why the decision is wrong" : "Why the reading should not govern"}
          </span>
          <textarea className="field" maxLength={1200} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Point to the policy's dispute clause and the daily data." />
        </label>
      ) : null}
      {act.id === "contest" || act.id === "appeal" ? (
        <p className="muted text-[13px]">Sends a bond of {genText(bond)}. It comes back if the decision moves your way.</p>
      ) : null}
      <Write call={call} label={act.title} disabled={needsText && text.trim().length < 10} />
    </div>
  );
}

function Acts({ y, nowMs }: { y: Policy; nowMs: number }) {
  const wallet = useWallet();
  const me = roleOf(y, wallet.address);
  const acts = actsFor(y, wallet.address, nowMs);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="rounded-card bg-lagoon p-5 text-paper md:p-6" aria-label="What you can do">
      <div className="flex items-center justify-between gap-3">
        <p className="h-sm">What you can do</p>
        {me ? <Tag tone="lilac">You are the {roleWord(me)}</Tag> : null}
      </div>
      <p className="mt-2 text-[14px] text-paper/80">{waitingOn(y, nowMs)}</p>
      {!wallet.address ? <p className="mt-4 text-[14px]">Connect a wallet to act. Anyone can read the policy.</p> : null}
      <ul className="mt-4 flex flex-col gap-2">
        {acts.map((a) => (
          <li key={a.id} className="rounded-[12px] bg-paper p-4 text-ink">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[15px] font-medium">{a.title}</span>
              {a.ready && open !== a.id ? (
                <button type="button" className="text-[14px] text-violet hover:underline" onClick={() => setOpen(a.id)}>Open</button>
              ) : null}
            </div>
            {!a.ready ? <p className="muted mt-1 text-[13px]">{a.why}</p> : null}
            {a.ready && open === a.id ? <div className="mt-3"><ActForm y={y} act={a} /></div> : null}
          </li>
        ))}
      </ul>
      {wallet.address && acts.length === 0 ? <p className="mt-4 text-[14px]">There is nothing for you to do on this policy.</p> : null}
    </section>
  );
}

export function PolicyView({ y }: { y: Policy }) {
  const nowMs = useNow();
  const r = y.reading;
  const sel = r ? r.summaries[r.selected] : null;
  const oth = r ? r.summaries[r.other] : null;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone="mist">{policyName(y.policy_id)}</Tag>
          <Tag tone={y.state === "SETTLED" || y.state === "VOID" ? "mist" : "lilac"}>{policyState(y.state)}</Tag>
          <Tag tone="harvest">{triggerShort(y.trigger)}</Tag>
          {y.replay ? <Tag tone="lagoon">Replay of a finished season</Tag> : null}
        </div>
        <h1 className="h-display max-w-[18ch]">{y.crop}, {y.region}</h1>
        <p className="max-w-[64ch] text-[18px]">
          Pays {genText(y.payout_wei)} if {y.region} has {triggerSentence(y.trigger, y.threshold_tenths)} between {day(y.window_start)} and {day(y.window_end)}.
          The premium was {genText(y.premium_wei)}.
        </p>
        <Steps y={y} />
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          <Card>
            <p className="label">The reading</p>
            {r && sel && oth ? (
              <>
                <p className="h-md mt-2">
                  {source(r.selected)} reads {mm(sel.total_tenths)}: {r.triggered ? "the cover pays." : "the cover does not pay."}
                </p>
                <p className="muted mt-1 text-[15px]">
                  {r.selected === y.primary
                    ? `${source(y.primary)} is the primary dataset and covered every day, so the policy's rule selected it.`
                    : `${source(y.primary)} missed a day, so the policy's rule fell back to ${source(y.backup)}.`}{" "}
                  {source(r.other)} reads {mm(oth.total_tenths)}
                  {r.other_triggers === null ? ", but it did not cover every day."
                    : r.other_triggers === r.triggered ? ", on the same side of the threshold." : ", on the other side of the threshold."}
                </p>
                <div className="mt-5"><RainChart series={r.series} primary={y.primary} other={y.backup} threshold={y.threshold_tenths} selected={r.selected} /></div>
                {contestable(y) ? (
                  <p className="mt-4 rounded-[10px] bg-lilac p-3 text-[14px]">
                    The two datasets disagree about the trigger, so the side the reading went against may contest it until {moment(y.contest_ends)}.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-[16px]">
                Not read yet. After the window ends, every validator fetches {source(y.primary)} and {source(y.backup)} for this point and must reproduce the same numbers.
              </p>
            )}
          </Card>

          {y.contest ? (
            <Card>
              <p className="label">The contest</p>
              <p className="h-sm mt-2">The {roleWord(y.contest.by)} contested the reading, with a bond of {genText(y.contest.bond_wei)}.</p>
              <div className="mt-4">
                <Statement who={roleWord(y.contest.by)} text={y.contest.statement} at={y.contest.at}
                  answer={y.contest.answer ? { text: y.contest.answer, at: y.contest.answered_at, who: y.contest.by === "FARMER" ? "insurer" : "farmer" } : undefined} />
              </div>
              {y.state === "CONTESTED" ? <p className="muted mt-3 text-[14px]">The answer period closes {until(y.response_ends, nowMs)}.</p> : null}
            </Card>
          ) : null}

          {(y.rounds ?? []).map((rd) => (
            <Card key={rd.n} className={rd.kind === "APPEAL" ? "border-violet" : ""}>
              <p className="label">{rd.kind === "APPEAL" ? "The appeal's decision" : "The validators' decision"}, {moment(rd.at)}</p>
              <p className="h-md mt-2">{verdict(rd.verdict)}.</p>
              <p className="mt-1 text-[16px]">{outcomeSentence(rd.outcome)}</p>
              {rd.reason ? <p className="muted mt-3 text-[15px]">The leading validator&apos;s reasons, in its own words: {prose(rd.reason)}</p> : null}
            </Card>
          ))}

          {y.appeal ? (
            <Card>
              <p className="label">The appeal</p>
              <p className="h-sm mt-2">The {roleWord(y.appeal.by)} appealed, with a bond of {genText(y.appeal.bond_wei)}.</p>
              <div className="mt-4">
                <Statement who={roleWord(y.appeal.by)} text={y.appeal.statement} at={y.appeal.at}
                  answer={y.appeal.answer ? { text: y.appeal.answer, at: y.appeal.answered_at, who: y.appeal.by === "FARMER" ? "insurer" : "farmer" } : undefined} />
              </div>
            </Card>
          ) : null}

          {y.settled_how ? (
            <Card className="bg-parchment">
              <p className="label">Settled {day(y.settled_at)}</p>
              <p className="h-sm mt-2">{settledHow(y.settled_how)}</p>
              <p className="mt-1 text-[15px]">The farmer was credited {genText(y.paid_farmer_wei)}; the insurer {genText(y.paid_insurer_wei)}.</p>
            </Card>
          ) : null}

          <Card>
            <p className="label">The dispute clause, agreed when the policy was sold</p>
            <p className="mt-2 text-[16px]">“{y.dispute_clause}”</p>
            <dl className="mt-5 grid gap-3 text-[14px] md:grid-cols-2">
              <div><dt className="muted">Primary dataset</dt><dd>{sourceLong(y.primary)}</dd></div>
              <div><dt className="muted">Backup dataset</dt><dd>{sourceLong(y.backup)}</dd></div>
              <div><dt className="muted">Point</dt><dd className="figure">{y.lat}, {y.lon}</dd></div>
              <div><dt className="muted">From</dt><dd><TextLink href={`/products/${y.product_id}`}>{productName(y.product_id)}</TextLink></dd></div>
            </dl>
          </Card>

          <details className="rounded-card border border-mist bg-paper p-5">
            <summary className="cursor-pointer text-[15px]">The record</summary>
            <dl className="mt-4 grid gap-2 text-[13px]">
              <div><dt className="muted">Farmer</dt><dd className="mono">{y.farmer}</dd></div>
              <div><dt className="muted">Insurer</dt><dd className="mono">{y.insurer}</dd></div>
              {[y.primary, y.backup].map((s) => (
                <div key={`u${s}`}><dt className="muted">What the validators fetch from {source(s)}</dt>
                  <dd><TextLink href={sourceUrl(s, y.lat, y.lon, y.window_start, y.window_days)} external>The dataset for this window</TextLink></dd></div>
              ))}
              {r ? Object.entries(r.summaries).map(([s, v]) => (
                <div key={s}><dt className="muted">{source(s)} series digest, {v.days_reported} of {v.days} days</dt><dd className="mono break-all">{v.digest}</dd></div>
              )) : null}
            </dl>
            <ol className="mt-4 flex flex-col gap-1 text-[13px]">
              {y.events.map((e, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2 border-t border-mist pt-1">
                  <span>{prose(e.kind.replace(/_/g, " ").toLowerCase())}{e.by ? `, by ${roleWord(roleOf(y, e.by)) || shortAddress(e.by)}` : ""}</span>
                  <span className="muted">{moment(e.at)}</span>
                </li>
              ))}
            </ol>
          </details>
        </div>
        <div className="lg:sticky lg:top-24">
          <Acts y={y} nowMs={nowMs} />
        </div>
      </div>
    </div>
  );
}
