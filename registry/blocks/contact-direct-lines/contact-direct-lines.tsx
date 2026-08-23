"use client";

import * as React from "react";

import { Check, Copy } from "lucide-react";

import { StatusPip } from "@/registry/ui/status-pip";
import { cn } from "@/registry/lib/utils";

export type DirectLine = {
  id: string;
  kicker: string;
  title: string;
  /** The address itself — copyable verbatim. */
  address: string;
  detail: string;
  /** Presence on this line right now. */
  live?: boolean;
};

export type ContactDirectLinesProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  lines?: DirectLine[];
  className?: string;
};

const DEFAULT_LINES: DirectLine[] = [
  {
    id: "support",
    kicker: "SOMETHING BROKE",
    title: "The support desk",
    address: "desk@fieldline.example",
    detail: "Four working hours to a first reply, from a person on rotation.",
    live: true,
  },
  {
    id: "field",
    kicker: "ON SITE",
    title: "The field team",
    address: "field@fieldline.example",
    detail: "Yard visits and rollouts — booked within the week, region depending.",
  },
  {
    id: "security",
    kicker: "QUIETLY",
    title: "Security, directly",
    address: "security@fieldline.example",
    detail: "Read by the security desk only. Acknowledged within a day, any day.",
    live: true,
  },
];

/**
 * Contact without a form: three direct lines, each an address you can copy
 * verbatim — the copy control confirms in place — with who reads it, how
 * fast, and a live pip where someone is actually on rotation now. For teams
 * whose honest answer to "contact us" is an inbox with a person behind it,
 * not a ticket funnel.
 */
export function ContactDirectLines({
  eyebrow = "Fieldline · direct lines",
  headline = "Real inboxes, stated plainly.",
  copy = "No form, no funnel. Pick the line that matches, copy the address, and write like you would to a colleague.",
  lines = DEFAULT_LINES,
  className,
}: ContactDirectLinesProps) {
  const headingId = React.useId();
  const [copied, setCopied] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(null), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copyAddress = (line: DirectLine) => {
    void navigator.clipboard
      ?.writeText(line.address)
      .then(() => setCopied(line.id))
      .catch(() => undefined);
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="text-ink-2 mt-4 leading-relaxed">{copy}</p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {lines.map((line) => (
            <div
              key={line.id}
              className="border-hairline bg-surface-1 rounded-4 flex flex-col border p-5"
            >
              <p className="text-label text-ink-3">{line.kicker}</p>
              <h3 className="text-ink mt-2 font-semibold">{line.title}</h3>
              <p className="text-ink-2 mt-1.5 flex-1 text-sm leading-relaxed">
                {line.detail}
              </p>

              <div className="border-hairline mt-4 flex items-center justify-between gap-2 border-t pt-3">
                <a
                  href={`mailto:${line.address}`}
                  className="text-ink hover:text-cobalt-bright min-w-0 truncate font-mono text-xs transition-colors"
                >
                  {line.address}
                </a>
                <button
                  type="button"
                  onClick={() => copyAddress(line)}
                  aria-label={`Copy ${line.address}`}
                  className="border-hairline text-ink-3 hover:text-ink rounded-1 shrink-0 border p-1.5 transition-colors"
                >
                  {copied === line.id ? (
                    <Check
                      className="text-[var(--success,var(--primary))] size-3.5"
                      aria-hidden
                    />
                  ) : (
                    <Copy className="size-3.5" aria-hidden />
                  )}
                </button>
              </div>
              <div className="mt-3 min-h-5">
                {line.live && (
                  <StatusPip status="online" label="On rotation now" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
