"use client";

import * as React from "react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusPip } from "@/registry/ui/status-pip";
import { TraceInput } from "@/registry/ui/trace-input";
import { cn } from "@/registry/lib/utils";

export type TerraceColumn = {
  heading: string;
  links: { label: string; href: string }[];
};

export type FooterTerraceProps = {
  brand?: React.ReactNode;
  blurb?: string;
  columns?: TerraceColumn[];
  /** The newsletter slot. Omit `onSubscribe` to hide it. */
  newsletterTitle?: string;
  onSubscribe?: (email: string) => void;
  statusLabel?: string;
  fineprint?: string;
  className?: string;
};

const DEFAULT_COLUMNS: TerraceColumn[] = [
  {
    heading: "PRODUCT",
    links: [
      { label: "Benches", href: "#benches" },
      { label: "Recipes", href: "#recipes" },
      { label: "Integrations", href: "#integrations" },
      { label: "Changelog", href: "#changelog" },
    ],
  },
  {
    heading: "COMPANY",
    links: [
      { label: "About", href: "#about" },
      { label: "Journal", href: "#journal" },
      { label: "Careers", href: "#careers" },
    ],
  },
  {
    heading: "SUPPORT",
    links: [
      { label: "Documentation", href: "#docs" },
      { label: "Field guides", href: "#guides" },
      { label: "Contact", href: "#contact" },
    ],
  },
];

/**
 * A terraced mega footer: the brand and the ask on the top terrace, the link
 * garden below, and the ground line — status, fine print — at the base. The
 * newsletter slot is the library's own field and button, so subscribing has
 * the same traced focus and pressed confirm as the product above it, and the
 * status line breathes through a live pip rather than claiming "all systems"
 * in static text.
 */
export function FooterTerrace({
  brand = <span className="text-lg font-semibold tracking-tight">Fieldline</span>,
  blurb = "Instruments for teams that build in the open — benches, recipes, and a journal of what held.",
  columns = DEFAULT_COLUMNS,
  newsletterTitle = "One dispatch a month. No noise.",
  onSubscribe,
  statusLabel = "All benches operational",
  fineprint = "© 2026 Fieldline Instruments",
  className,
}: FooterTerraceProps) {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);

  const subscribe = (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    onSubscribe?.(email);
    setSent(true);
    setEmail("");
  };

  return (
    <footer className={cn("border-hairline bg-surface-0 border-t", className)}>
      <div className="mx-auto w-full max-w-7xl px-6 py-14">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="max-w-sm">
            {brand}
            <p className="text-ink-3 mt-3 text-sm leading-relaxed">{blurb}</p>

            <form onSubmit={subscribe} className="mt-6" aria-label="Newsletter">
              <p className="text-ink-2 mb-2 text-sm font-medium">
                {newsletterTitle}
              </p>
              <div className="flex items-start gap-2">
                <TraceInput
                  label="Email address"
                  labelHidden
                  type="email"
                  name="email"
                  placeholder="you@studio.example"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setSent(false);
                  }}
                  autoComplete="email"
                  className="flex-1"
                />
                <PressureButton type="submit" className="h-11 shrink-0">
                  {sent ? "Sent" : "Subscribe"}
                </PressureButton>
              </div>
              <p role="status" className="text-ink-3 mt-2 min-h-4 text-xs">
                {sent ? "Confirmed — first dispatch next month." : ""}
              </p>
            </form>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {columns.map((column) => (
              <nav key={column.heading} aria-label={column.heading}>
                <p className="text-label text-ink-3">{column.heading}</p>
                <ul className="mt-3 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        className="text-ink-2 hover:text-ink text-sm transition-colors"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>
      </div>

      <div className="border-hairline border-t">
        <div className="text-ink-3 mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-4 text-xs">
          <StatusPip status="online" label={statusLabel} />
          <span className="font-mono tracking-[0.08em] uppercase">{fineprint}</span>
        </div>
      </div>
    </footer>
  );
}
