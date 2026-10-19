"use client";

/**
 * The small parts every page is built from. Buttons are pills, always; the
 * filled ember button is the one primary act on a view, and everything else
 * is an outline. Tags are sulfur pills. Cards are limestone at 40px.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import { getImage } from "@/lib/read";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "chalk";
};

export function Button({ variant = "primary", className = "", ...rest }: ButtonProps) {
  const look = {
    primary: "bg-ember text-obsidian hover:bg-[#ff6a24]",
    secondary: "border-[1.5px] border-obsidian text-obsidian hover:bg-limestone",
    ghost: "text-obsidian hover:bg-limestone",
    chalk: "border-[1.5px] border-chalk text-chalk hover:bg-chalk hover:text-obsidian",
  }[variant];
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-pill px-6 py-3 text-[16px] leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${look} ${className}`}
      {...rest}
    />
  );
}

export function PillLink({
  href, children, variant = "secondary",
}: { href: string; children: React.ReactNode; variant?: "primary" | "secondary" }) {
  const look = variant === "primary"
    ? "bg-ember text-obsidian hover:bg-[#ff6a24]"
    : "border-[1.5px] border-obsidian text-obsidian hover:bg-limestone";
  return (
    <Link href={href} className={`inline-flex items-center rounded-pill px-6 py-3 text-[16px] leading-none no-underline ${look}`}>
      {children}
    </Link>
  );
}

export function TextLink({ href, children, external }: { href: string; children: React.ReactNode; external?: boolean }) {
  const cls = "underline decoration-[1.5px] underline-offset-[3px] decoration-ember hover:text-ember-deep";
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>{children}</a>
  ) : (
    <Link href={href} className={cls}>{children}</Link>
  );
}

export function Tag({ children, tone = "sulfur" }: { children: React.ReactNode; tone?: "sulfur" | "plain" | "ember" | "dark" }) {
  const look = {
    sulfur: "bg-sulfur text-obsidian",
    plain: "bg-pumice text-obsidian",
    ember: "bg-ember text-obsidian",
    dark: "bg-obsidian text-chalk",
  }[tone];
  return <span className={`inline-flex items-center rounded-pill px-3 py-1 text-[13px] leading-tight ${look}`}>{children}</span>;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-card bg-limestone p-7 md:p-10 ${className}`}>{children}</div>;
}

export function Stat({ label, value, unit, tone = "ember" }: { label: string; value: string; unit?: string; tone?: "ember" | "limestone" | "obsidian" }) {
  const look = {
    ember: "bg-ember text-chalk",
    limestone: "bg-limestone text-obsidian",
    obsidian: "bg-obsidian text-chalk",
  }[tone];
  return (
    <div className={`rounded-card p-7 md:p-8 ${look}`}>
      <p className="text-[14px] opacity-90">{label}</p>
      <p className="display figure mt-3 text-[64px] md:text-[80px]">
        {value}
        {unit ? <span className="ml-2 text-[32px] md:text-[40px]">{unit}</span> : null}
      </p>
    </div>
  );
}

export function Dotted({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`dotted-x w-full ${className}`} />;
}

export function Note({ children }: { children: React.ReactNode }) {
  return <p className="type-caption max-w-[62ch]">{children}</p>;
}

export function Loading({ what }: { what: string }) {
  return <p className="pulse type-caption">Reading {what} from the chain.</p>;
}

export function Problem({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Card>
      <p className="display type-heading">{title}</p>
      {children ? <div className="mt-3 max-w-[60ch] text-basalt">{children}</div> : null}
    </Card>
  );
}

/**
 * A photograph held by the contract, fetched from the chain and checked in
 * this browser against the digest the contract recorded when it was filed.
 */
export function StoredPhoto({
  eid, sha256, alt, className = "",
}: { eid: string; sha256: string; alt: string; className?: string }) {
  const [state, setState] = useState<{ url?: string; ok?: boolean; error?: boolean }>({});
  useEffect(() => {
    let alive = true;
    let url = "";
    getImage(eid).then(
      (img) => {
        if (!alive) return;
        url = URL.createObjectURL(new Blob([img.bytes as BlobPart], { type: "image/jpeg" }));
        setState({ url, ok: img.digest === sha256 });
      },
      () => { if (alive) setState({ error: true }); },
    );
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [eid, sha256]);

  if (state.error) {
    return <div className={`grid place-items-center bg-pumice text-[13px] text-basalt ${className}`}>The chain did not return this photograph.</div>;
  }
  if (!state.url) {
    return <div className={`pulse bg-grout ${className}`} aria-label="Loading a photograph" />;
  }
  return (
    <figure className={`relative overflow-hidden ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={state.url} alt={alt} className="h-full w-full object-cover" />
      {!state.ok ? (
        <figcaption className="absolute inset-x-3 bottom-3 rounded-pill bg-rust px-3 py-1 text-[12px] text-chalk">
          These bytes do not match the digest the contract recorded.
        </figcaption>
      ) : null}
    </figure>
  );
}
