"use client";

/**
 * The evidence filed in a contest or an appeal: each photograph fetched from
 * the chain and checked in this browser against the digest the contract
 * recorded, each page as the validators read it when it was filed.
 */
import { useEffect, useState } from "react";

import { Tag, TextLink } from "./bits";
import { day, roleWord } from "@/lib/present";
import { getImage } from "@/lib/read";
import type { Evidence } from "@/lib/types";

function Photo({ e }: { e: Evidence }) {
  const [s, setS] = useState<{ url?: string; ok?: boolean; error?: boolean }>({});
  useEffect(() => {
    let alive = true;
    let url = "";
    getImage(e.evidence_id).then(
      (img) => {
        if (!alive) return;
        url = URL.createObjectURL(new Blob([img.bytes as BlobPart], { type: "image/jpeg" }));
        setS({ url, ok: img.digest === e.sha256 });
      },
      () => { if (alive) setS({ error: true }); },
    );
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [e.evidence_id, e.sha256]);
  if (s.error) return <div className="grid aspect-[4/3] place-items-center rounded-[12px] bg-parchment text-[13px] muted">The chain did not return this photograph.</div>;
  if (!s.url) return <div className="pulse aspect-[4/3] rounded-[12px] bg-mist" />;
  return (
    <figure className="relative overflow-hidden rounded-[12px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={s.url} alt={e.caption || "A photograph of the field"} className="aspect-[4/3] w-full object-cover" />
      {!s.ok ? <figcaption className="absolute inset-x-2 bottom-2 rounded-pill bg-wine px-3 py-1 text-[12px] text-paper">These bytes do not match the recorded digest.</figcaption> : null}
    </figure>
  );
}

export function EvidenceList({ items }: { items: Evidence[] }) {
  if (!items.length) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((e) => (
        <div key={e.evidence_id} className="flex flex-col gap-2 rounded-[12px] border border-mist bg-paper p-3">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <Tag tone={e.by === "FARMER" ? "harvest" : "lilac"}>From the {roleWord(e.by)}</Tag>
            <span className="muted">{e.stage === "APPEAL" ? "For the appeal" : "For the contest"}, {day(e.at)}</span>
          </div>
          {e.kind === "PHOTO" ? <Photo e={e} /> : (
            <blockquote className="max-h-56 overflow-y-auto rounded-[10px] bg-parchment p-3 text-[14px]">
              <p className="label mb-1">As the validators read it when filed</p>
              {e.excerpt}
            </blockquote>
          )}
          {e.caption ? <p className="text-[14px]">“{e.caption}”</p> : null}
          {e.kind === "PAGE" && e.url ? <p className="text-[13px]"><TextLink href={e.url} external>Open the page</TextLink> <span className="muted">(chosen by the {roleWord(e.by)})</span></p> : null}
        </div>
      ))}
    </div>
  );
}
