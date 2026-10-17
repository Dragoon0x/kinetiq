"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultAskPages,
  FallthroughAsk,
  type FallthroughAskHandle,
} from "@/registry/ui/fallthrough-ask";

export const tweaks = defineTweaks({
  answerHeight: {
    kind: "range",
    label: "Answer",
    default: 200,
    min: 140,
    max: 300,
    step: 20,
    unit: "px",
  },
  sourceStyle: {
    kind: "choice",
    label: "Sources",
    default: "chips",
    options: ["chips", "list", "notes"],
    names: { chips: "Chips", list: "List", notes: "Notes" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const FIRST = "how many unused days carry over";
const EXAMPLES = [
  FIRST,
  "train to a client",
  "can I bring my dog to the office",
  "payroll date",
];
const ASK_AFTER_MS = 1100;

/** The handbook page behind the palette, drawn with tokens. */
function Backdrop() {
  return (
    <div aria-hidden className="absolute inset-0 flex flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-hairline px-4">
        <span className="inline-flex size-6 items-center justify-center rounded-2 bg-foreground text-[10px] font-semibold text-background">
          Fw
        </span>
        <span className="text-[13px] font-semibold">Fernworks Handbook</span>
        <span className="ml-auto hidden h-7 w-40 items-center rounded-full border border-hairline px-3 text-[11px] text-ink-3 @[34rem]:inline-flex">
          Search ⌘K
        </span>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden w-44 shrink-0 flex-col gap-2.5 border-r border-hairline px-4 py-5 @[34rem]:flex">
          {[70, 54, 82, 60, 48, 66, 58].map((w, i) => (
            <span
              key={i}
              className={cn(
                "h-2 rounded-full",
                i === 2 ? "bg-cobalt-wash" : "bg-surface-2",
              )}
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-3 px-6 py-6">
          <span className="text-[11px] text-ink-3">People › Time off</span>
          <span className="text-[20px] font-semibold">Leave and holidays</span>
          {[96, 88, 92, 64, 0, 90, 84, 72].map((w, i) =>
            w ? (
              <span
                key={i}
                className="h-2 rounded-full bg-surface-2"
                style={{ width: `${w}%` }}
              />
            ) : (
              <span key={i} className="h-2" />
            ),
          )}
        </div>
      </div>
      <div className="absolute inset-0 bg-[color-mix(in_oklab,var(--bg-0)_58%,transparent)]" />
    </div>
  );
}

/**
 * The Fernworks handbook with a palette open over it. The gallery card has a
 * question typed that no command or page matches, so the ask row holds the
 * highlight; once seen, it unfolds, reads two pages and answers. The stage
 * adds example questions — the last one fails, to show the error state.
 */
export function FallthroughAskDemo({
  chrome = true,
  // The palette is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const api = React.useRef<FallthroughAskHandle | null>(null);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const once = React.useRef(false);
  const [query, setQuery] = React.useState(FIRST);
  const [note, setNote] = React.useState("asks when nothing matches");

  React.useEffect(() => {
    const node = ref.current;
    if (chrome || !node || typeof IntersectionObserver === "undefined") return;
    let timer = 0;
    const io = new IntersectionObserver(([entry]) => {
      window.clearTimeout(timer);
      if (entry?.isIntersecting && !once.current) {
        timer = window.setTimeout(() => {
          once.current = true;
          api.current?.ask();
        }, ASK_AFTER_MS);
      }
    });
    io.observe(node);
    return () => {
      window.clearTimeout(timer);
      io.disconnect();
    };
  }, [chrome]);

  const frame = (
    <div
      className="@container relative w-full overflow-hidden rounded-4 border border-hairline bg-background"
      style={{ height: chrome ? 500 : 520 }}
    >
      <Backdrop />
      <div className="absolute inset-x-3 top-3 flex justify-center @[34rem]:top-9">
        <FallthroughAsk
          ref={api}
          query={query}
          onQueryChange={setQuery}
          onSelect={({ kind, id }) =>
            setNote(
              `opened ${kind === "page" ? (defaultAskPages.find((p) => p.id === id)?.title ?? id) : id.replace(/-/g, " ")}`,
            )
          }
          onAsk={(q) => {
            setNote(`asked “${q}”`);
            // The payroll service is down today, so that one fails.
            if (q.includes("payroll"))
              return new Promise((_, reject) =>
                window.setTimeout(() => reject(new Error("offline")), 900),
              );
          }}
          onAnswer={(state, answer) =>
            setNote(
              state === "answered"
                ? `answered · ${answer?.sources.length ?? 0} sources`
                : state === "none"
                  ? "no answer · closest page offered"
                  : "error · query kept",
            )
          }
          onOpenSource={(id) =>
            setNote(
              `source · ${defaultAskPages.find((p) => p.id === id)?.title ?? id}`,
            )
          }
          maxHeight={chrome ? 440 : 470}
          className="max-w-[560px]"
          {...values}
        />
      </div>
    </div>
  );

  if (!chrome) {
    return (
      <div ref={ref} className="w-full max-w-3xl">
        {frame}
      </div>
    );
  }

  return (
    <div ref={ref} className="flex w-full max-w-3xl flex-col gap-4">
      {frame}
      <div className="flex flex-wrap items-center gap-2">
        {EXAMPLES.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => api.current?.ask(text)}
            className={cn(
              "inline-flex h-8 max-w-full items-center rounded-full border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
              "hover:bg-surface-2 hover:text-foreground",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            )}
          >
            <span className="truncate">{text}</span>
          </button>
        ))}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{note}</span>
        {query ? ` · “${query}”` : " · empty field"}
      </p>
    </div>
  );
}
