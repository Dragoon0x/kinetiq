"use client";

import * as React from "react";

import { ArrowLeft } from "lucide-react";

import { BalanceQuote } from "@/registry/ui/balance-quote";
import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type PostBlock =
  | { kind: "para"; id: string; text: string }
  | { kind: "heading"; id: string; text: string }
  | { kind: "quote"; id: string; text: string; cite?: string }
  | { kind: "list"; id: string; items: string[] };

export type BlogPostProps = {
  backLabel?: string;
  backHref?: string;
  topic?: string;
  title?: string;
  standfirst?: string;
  author?: string;
  date?: string;
  readMinutes?: number;
  blocks?: PostBlock[];
  /** The correction notice, when there is one. Kept at the top, not the foot. */
  correction?: string;
  className?: string;
};

const DEFAULT_BLOCKS: PostBlock[] = [
  {
    kind: "para",
    id: "b1",
    text: "For four months, Waylight read tide windows an hour early in one timezone. Four yards were affected. Nobody missed a berth because of it, which is luck rather than design, and the reason it took four months to find is that the error was small enough to look like weather.",
  },
  {
    kind: "heading",
    id: "b2",
    text: "What actually happened",
  },
  {
    kind: "para",
    id: "b3",
    text: "Tide tables arrive in local time. We convert to UTC on ingest. The converter used the offset in force on the day the table was published rather than the day each tide occurs — which is correct for about ten months of the year and wrong across a daylight-saving boundary.",
  },
  {
    kind: "para",
    id: "b4",
    text: "The yards that noticed were the two with the narrowest windows. The other two had enough slack that an hour did not change a plan, so the error sat there producing boards that were subtly wrong and entirely plausible.",
  },
  {
    kind: "quote",
    id: "b5",
    text: "Plausible and wrong is worse than obviously broken, because nobody reports it.",
    cite: "The line we have written on the review template since",
  },
  {
    kind: "heading",
    id: "b6",
    text: "Why the review missed it",
  },
  {
    kind: "list",
    id: "b7",
    items: [
      "Our fixtures were all generated in a single timezone with no DST boundary in range.",
      "The integration test asserted the shape of a converted tide, not its value.",
      "Nobody who reviewed the converter had worked a yard where an hour matters.",
    ],
  },
  {
    kind: "para",
    id: "b8",
    text: "The third is the real one. The first two are the kind of gap any team can close with a fixture and an assertion, and we have. The third is why we now send every engineer to a yard in their first month, at six in the morning, in whatever weather there is.",
  },
];

/**
 * A long-form post with the correction notice at the top rather than appended
 * as a footnote nobody scrolls to. Everything else is deliberately plain —
 * the reading measure, the pull quote on the balance instrument, and nothing
 * that moves while someone is trying to read.
 */
export function BlogPost({
  backLabel = "All writing",
  backHref = "/blog",
  topic = "Post-mortem",
  title = "We got tide modelling wrong for four months",
  standfirst = "A one-hour offset in a single timezone, four yards affected, and the review process that should have caught it in week one.",
  author = "Ilya Renner",
  date = "18 February",
  readMinutes = 9,
  blocks = DEFAULT_BLOCKS,
  correction = "Corrected 20 February: an earlier version said three yards were affected. It was four — the fourth was on a shared crane and inherited the window.",
  className,
}: BlogPostProps) {
  const headingId = React.useId();

  return (
    <main className={cn("min-h-screen bg-surface-0", className)}>
      <article className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-20">
        <a
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          {backLabel}
        </a>

        <p className="mt-8 flex flex-wrap items-baseline gap-x-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          <span>{topic}</span>
          <span>
            {date} · {readMinutes} min
          </span>
        </p>
        <h1
          id={headingId}
          className="mt-3 text-4xl font-semibold tracking-tight text-balance text-ink"
        >
          {title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">{standfirst}</p>
        <p className="mt-4 text-sm text-ink-3">
          <span className="font-mono text-ink-2 italic">{author}</span>
        </p>

        {/* A correction belongs where the error was read, not appended to the
            foot where only people who already finished will see it. */}
        {correction && (
          <aside className="mt-8 rounded-4 border border-hairline-strong bg-surface-1 p-5">
            <StatusSeal variant="warn">corrected</StatusSeal>
            <p className="mt-3 text-sm leading-relaxed text-ink-2">
              {correction}
            </p>
          </aside>
        )}

        <div className="mt-10">
          {blocks.map((block) => {
            if (block.kind === "heading") {
              return (
                <h2
                  key={block.id}
                  className="mt-10 text-xl font-semibold tracking-tight text-ink"
                >
                  {block.text}
                </h2>
              );
            }
            if (block.kind === "quote") {
              return (
                <div key={block.id} className="my-8">
                  <BalanceQuote cite={block.cite}>{block.text}</BalanceQuote>
                </div>
              );
            }
            if (block.kind === "list") {
              return (
                <ul key={block.id} className="mt-4 flex flex-col gap-2.5">
                  {block.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 leading-relaxed text-ink-2"
                    >
                      <span
                        aria-hidden
                        className="mt-3 h-px w-3 shrink-0 bg-hairline-strong"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              );
            }
            return (
              <p key={block.id} className="mt-4 leading-relaxed text-ink-2">
                {block.text}
              </p>
            );
          })}
        </div>
      </article>
    </main>
  );
}
