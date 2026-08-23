"use client";

import * as React from "react";

import { ArrowUpRight, Check, Copy } from "lucide-react";

import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type Surface = {
  id: string;
  name: string;
  /** What this surface is for, in one line. */
  purpose: string;
  /** The shape of it — an endpoint, an event name, a command. */
  signature: string;
};

export type IntegrationsBuildYourOwnProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  surfaces?: Surface[];
  /** The snippet that proves the API is real. */
  snippet?: string;
  snippetLabel?: string;
  /** The commitment about breaking changes. */
  stabilityLine?: string;
  docsLabel?: string;
  docsHref?: string;
  className?: string;
};

const DEFAULT_SURFACES: Surface[] = [
  {
    id: "s1",
    name: "Read the record",
    purpose: "Every board, every override, paged and filterable.",
    signature: "GET /v1/boards",
  },
  {
    id: "s2",
    name: "Add a constraint",
    purpose: "Anything that should limit a cut, from your own systems.",
    signature: "POST /v1/constraints",
  },
  {
    id: "s3",
    name: "Hear about cuts",
    purpose: "Fires whenever a board is cut or re-cut, with the cause.",
    signature: "webhook: board.cut",
  },
  {
    id: "s4",
    name: "Hear about overrides",
    purpose: "Fires when a person overrules the scheduler, with their line.",
    signature: "webhook: board.overridden",
  },
];

const DEFAULT_SNIPPET = `curl -sS https://api.waylight.example/v1/boards \\
  -H "Authorization: Bearer $WAYLIGHT_TOKEN" \\
  -G --data-urlencode "yard=north-basin" \\
     --data-urlencode "since=2026-03-01"`;

/**
 * The honest answer to "do you integrate with X" when the answer is no: four
 * surfaces, the exact shape of each, one command you can paste, and a
 * versioning promise. Most integration pages end at the logo grid and leave
 * anyone with an unlisted system guessing whether they are stuck; this
 * section exists so the answer is "not yet, and here is the door".
 */
export function IntegrationsBuildYourOwn({
  eyebrow = "Waylight · if we do not have yours",
  headline = "Four surfaces, and the door is open.",
  copy = "Everything the built-in connections use is the same public API you get. There is no private tier and no partner programme to join.",
  surfaces = DEFAULT_SURFACES,
  snippet = DEFAULT_SNIPPET,
  snippetLabel = "Read a yard's boards",
  stabilityLine = "v1 is stable. Breaking changes ship as v2 alongside it, and v1 keeps running for at least eighteen months after that.",
  docsLabel = "API reference",
  docsHref = "#api",
  className,
}: IntegrationsBuildYourOwnProps) {
  const headingId = React.useId();
  const [copied, setCopied] = React.useState(false);

  // The confirmation clears itself; a copy button that stays "copied" is lying
  // about the next press.
  React.useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy_ = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
    } catch {
      // Clipboard can be denied; the snippet is selectable either way.
    }
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-4xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>
        </div>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {surfaces.map((surface) => (
            <li
              key={surface.id}
              className="min-w-0 rounded-4 border border-hairline bg-surface-1 p-5"
            >
              <p className="font-medium text-ink">{surface.name}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
                {surface.purpose}
              </p>
              <p className="mt-3 truncate border-t border-hairline pt-3 font-mono text-[11px] text-ink-3">
                {surface.signature}
              </p>
            </li>
          ))}
        </ul>

        <figure className="mt-8 overflow-hidden rounded-4 border border-hairline bg-surface-1">
          <figcaption className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
            <span className="text-label text-ink-3">{snippetLabel}</span>
            <button
              type="button"
              onClick={copy_}
              className="inline-flex items-center gap-1.5 text-xs text-ink-3 transition-colors hover:text-ink"
            >
              {copied ? (
                <Check
                  className="size-3.5 text-[var(--success,var(--primary))]"
                  aria-hidden
                />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          </figcaption>
          <pre className="overflow-x-auto px-4 py-4 font-mono text-[11px] leading-6 text-ink-2">
            <code>{snippet}</code>
          </pre>
        </figure>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <StatusSeal variant="success">v1 stable</StatusSeal>
          <a
            href={docsHref}
            className="inline-flex items-center gap-1.5 text-sm text-ink-2 underline underline-offset-4 transition-colors hover:text-ink"
          >
            {docsLabel}
            <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        </div>
        {stabilityLine && (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-3">
            {stabilityLine}
          </p>
        )}
      </div>
    </section>
  );
}
