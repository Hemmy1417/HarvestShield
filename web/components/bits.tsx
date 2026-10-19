"use client";

/**
 * The small parts. One filled button per view, in midnight wine; secondary
 * actions are lilac with an ink hairline; everything else is a quiet text
 * button. Cards are white on parchment with a warm hairline and no shadow.
 */
import Link from "next/link";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "light" };

export function Button({ variant = "primary", className = "", ...rest }: ButtonProps) {
  const look = {
    primary: "rounded-[14px] bg-wine px-5 py-3 text-paper hover:bg-wine-soft",
    secondary: "rounded-tab border border-ink bg-lilac px-4 py-2 text-ink hover:bg-[#c8b8ff]",
    ghost: "px-1 py-1 text-ink underline-offset-4 hover:underline",
    light: "rounded-tab border border-paper/60 px-4 py-2 text-paper hover:bg-paper hover:text-ink",
  }[variant];
  return (
    <button type="button" className={`inline-flex items-center justify-center gap-2 text-[15px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${look} ${className}`} {...rest} />
  );
}

export function LinkButton({ href, children, variant = "primary" }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary" }) {
  const look = variant === "primary"
    ? "rounded-[14px] bg-wine px-5 py-3 text-paper hover:bg-wine-soft"
    : "rounded-tab border border-ink bg-lilac px-4 py-2 text-ink hover:bg-[#c8b8ff]";
  return <Link href={href} className={`inline-flex items-center gap-2 text-[15px] font-medium no-underline ${look}`}>{children} <span aria-hidden>→</span></Link>;
}

export function TextLink({ href, children, external }: { href: string; children: React.ReactNode; external?: boolean }) {
  const cls = "text-violet underline-offset-4 hover:underline";
  return external
    ? <a href={href} target="_blank" rel="noreferrer" className={cls}>{children}</a>
    : <Link href={href} className={cls}>{children}</Link>;
}

export function Tag({ children, tone = "lilac" }: { children: React.ReactNode; tone?: "lilac" | "mist" | "wine" | "harvest" | "lagoon" }) {
  const look = {
    lilac: "bg-lilac text-ink",
    mist: "bg-mist text-ink",
    wine: "bg-wine text-paper",
    harvest: "bg-harvest text-ink",
    lagoon: "bg-lagoon text-paper",
  }[tone];
  return <span className={`inline-flex items-center rounded-pill px-2.5 py-0.5 text-[12.5px] font-medium ${look}`}>{children}</span>;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-card border border-mist bg-paper p-5 md:p-6 ${className}`}>{children}</div>;
}

export function Loading({ what }: { what: string }) {
  return <p className="pulse muted text-[14px]">Reading {what} from the chain.</p>;
}

export function Problem({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Card>
      <p className="h-md">{title}</p>
      {children ? <div className="muted mt-2 max-w-[60ch]">{children}</div> : null}
    </Card>
  );
}
