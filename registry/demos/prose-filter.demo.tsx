"use client";

import * as React from "react";

import { Keyboard, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultProseRows,
  ProseFilter,
  proseMatches,
  type ProseQuery,
  type ProseStatus,
} from "@/registry/ui/prose-filter";

export const tweaks = defineTweaks({
  chipStyle: {
    kind: "choice",
    label: "Chips",
    default: "segment",
    options: ["segment", "soft", "outline"],
    names: { segment: "Segment", soft: "Soft", outline: "Outline" },
  },
  underlineStyle: {
    kind: "choice",
    label: "Underline",
    default: "dotted",
    options: ["dotted", "dashed", "wavy"],
    names: { dotted: "Dotted", dashed: "Dashed", wavy: "Wavy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

const START = "open invoices over 500 august";
const SCRIPT = "overdue bills over 1000 from fernworks september ";
const KEY_MS = 55;
const SEARCH_MS = 900;

/**
 * Waylight's receivables desk. The line opens with two filters docked and
 * one word left to choose; Type a sentence types a new one a key at a time,
 * so every phrase docks the way it would for a person typing.
 */
export function ProseFilterDemo({
  chrome = true,
  // The search line is silent: the stage's sound switch has nothing to play.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [seed, setSeed] = React.useState(START);
  const [query, setQuery] = React.useState<ProseQuery | null>(null);
  const [status, setStatus] = React.useState<ProseStatus>("ready");
  const [applied, setApplied] = React.useState(false);
  const [typing, setTyping] = React.useState(false);
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const timers = React.useRef<number[]>([]);

  const stop = React.useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    setTyping(false);
  }, []);
  React.useEffect(() => stop, [stop]);

  /** Types the script into the real input, one key at a time. */
  const typeScript = () => {
    stop();
    setSeed("");
    setRound((r) => r + 1);
    setApplied(false);
    setTyping(true);
    let i = 0;
    const step = () => {
      const input = boxRef.current?.querySelector("input");
      const ch = SCRIPT[i];
      if (!input || ch === undefined) {
        setTyping(false);
        return;
      }
      // A hidden page holds the typing where it is.
      if (document.hidden) {
        timers.current.push(window.setTimeout(step, 200));
        return;
      }
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      const at = input.selectionStart ?? input.value.length;
      setter?.call(
        input,
        input.value.slice(0, at) + ch + input.value.slice(at),
      );
      input.setSelectionRange(at + 1, at + 1);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      i += 1;
      timers.current.push(
        window.setTimeout(step, ch === " " ? KEY_MS * 4 : KEY_MS),
      );
    };
    timers.current.push(window.setTimeout(step, 400));
  };

  const filter = (
    <div
      ref={boxRef}
      className="w-full"
      onKeyDownCapture={(event) => {
        // A visitor's own key takes the line back from the script.
        if (typing && event.isTrusted) stop();
      }}
    >
      <ProseFilter
        key={round}
        defaultValue={seed}
        onQueryChange={(q) => {
          setQuery(q);
          setApplied(false);
        }}
        onApply={() => {
          setStatus("loading");
          timers.current.push(
            window.setTimeout(() => {
              setStatus("ready");
              setApplied(true);
            }, SEARCH_MS),
          );
        }}
        status={status}
        onRetry={() => setStatus("ready")}
        {...values}
      />
    </div>
  );

  if (!chrome) return filter;

  const count = query
    ? defaultProseRows.filter((row) => proseMatches(row, query.clauses)).length
    : 0;
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {filter}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={typeScript} className={button}>
          <Keyboard aria-hidden className="size-3.5" />
          Type a sentence
        </button>
        <button
          type="button"
          onClick={() => {
            stop();
            setSeed(START);
            setRound((r) => r + 1);
            setStatus("ready");
            setApplied(false);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status === "loading" ? (
          <span className="text-signal">searching invoices</span>
        ) : typing ? (
          <span className="text-signal">typing · phrases dock on space</span>
        ) : query && query.unsure.length > 0 ? (
          <>
            <span className="text-signal">
              {query.unsure.length}{" "}
              {query.unsure.length === 1 ? "word" : "words"} unsure
            </span>{" "}
            · tab to choose a meaning
          </>
        ) : (
          <>
            <span className="text-signal">
              {applied ? "applied · " : ""}
              {count} {count === 1 ? "invoice" : "invoices"}
            </span>{" "}
            · {query?.clauses.length ?? 0}{" "}
            {query?.clauses.length === 1 ? "chip" : "chips"}
          </>
        )}
      </p>
    </div>
  );
}
