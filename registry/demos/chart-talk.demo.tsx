"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { ChartTalk, defaultChartTalkTurns } from "@/registry/ui/chart-talk";

export const tweaks = defineTweaks({
  chartKind: {
    kind: "choice",
    label: "Chart",
    default: "bars",
    options: ["bars", "lines", "area"],
    names: { bars: "Bars", lines: "Lines", area: "Area" },
  },
  thumbSize: {
    kind: "choice",
    label: "Thumbs",
    default: "md",
    options: ["sm", "md", "lg"],
    names: { sm: "Small", md: "Medium", lg: "Large" },
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

const turnOf = (key: string) =>
  defaultChartTalkTurns.find((t) => t.id === key || key.startsWith(`${t.id}-`));
const describe = (key: string) => {
  const spec = turnOf(key)?.spec;
  if (!spec) return "no match";
  const months =
    spec.from || spec.to
      ? `${(spec.from ?? 1) === 7 ? "jul" : "jan"}–${(spec.to ?? 9) === 9 ? "sep" : "dec"}`
      : "jan–sep";
  return [
    spec.measure,
    spec.by === "quarter" ? "by quarter" : months,
    spec.share ? "as share" : spec.split ? "by region" : "total",
  ].join(" · ");
};

type Event =
  | { kind: "select"; key: string; index: number }
  | { kind: "rewind"; key: string; index: number }
  | { kind: "ask"; question: string; matched: boolean }
  | { kind: "export"; rows: number };

/**
 * A Gaugeworks sales analyst asking the sensor table three questions so far;
 * two more are offered under the composer.
 */
export function ChartTalkDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [event, setEvent] = React.useState<Event | null>(null);
  const keys = React.useRef<string[]>(
    defaultChartTalkTurns.slice(0, 3).map((t) => t.id),
  );

  const surface = (
    <ChartTalk
      key={round}
      onValueChange={(key) => {
        if (!keys.current.includes(key)) keys.current.push(key);
        setEvent({ kind: "select", key, index: keys.current.indexOf(key) });
      }}
      onRestoreTurn={(key) =>
        setEvent({ kind: "rewind", key, index: keys.current.indexOf(key) })
      }
      onAsk={(question, turn) =>
        setEvent({ kind: "ask", question, matched: !!turn })
      }
      onExport={(table) =>
        setEvent({ kind: "export", rows: table.rows.length })
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            keys.current = defaultChartTalkTurns.slice(0, 3).map((t) => t.id);
            setRound((r) => r + 1);
            setEvent(null);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {event?.kind === "rewind" ? (
          <>
            <span className="text-signal">
              rewound to turn {event.index + 1}
            </span>{" "}
            · {describe(event.key)}
          </>
        ) : event?.kind === "select" ? (
          <>
            <span className="text-signal">turn {event.index + 1}</span> ·{" "}
            {describe(event.key)}
          </>
        ) : event?.kind === "ask" ? (
          <>
            <span className="text-signal">
              {event.matched ? "asked" : "no match"}
            </span>{" "}
            · {event.question.replace(/\.$/, "").toLowerCase()}
          </>
        ) : event?.kind === "export" ? (
          <>
            <span className="text-signal">exported {event.rows} rows</span> ·
            csv ready
          </>
        ) : (
          <>
            <span className="text-signal">turn 3 of 3</span> ·{" "}
            {describe("last-quarter")}
          </>
        )}
      </p>
    </div>
  );
}
