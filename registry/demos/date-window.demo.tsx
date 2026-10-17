"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  DateWindow,
  defaultDateWindowPresets,
  defaultDateWindowRange,
  defaultDateWindowSeries,
  type DateWindowCompareMode,
  type DateWindowRange,
} from "@/registry/ui/date-window";

export const tweaks = defineTweaks({
  pillStyle: {
    kind: "choice",
    label: "Pill",
    default: "soft",
    options: ["solid", "soft", "line"],
    names: { solid: "Solid", soft: "Soft", line: "Line" },
  },
  calendarLayout: {
    kind: "choice",
    label: "Calendar",
    default: "single",
    options: ["single", "double", "strip"],
    names: { single: "Single", double: "Double", strip: "Strip" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const DAY = 86_400_000;
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const revenueOf = (start: string, end: string) =>
  defaultDateWindowSeries
    .filter((d) => d.date >= start && d.date <= end)
    .reduce((sum, d) => sum + d.revenue, 0);

/** The status line's revenue change, read the way the tiles read it. */
const change = (range: DateWindowRange, mode: DateWindowCompareMode) => {
  const days = Math.round((ms(range.end) - ms(range.start)) / DAY) + 1;
  const prev =
    mode === "year"
      ? {
          start: `${Number(range.start.slice(0, 4)) - 1}${range.start.slice(4)}`,
          end: `${Number(range.end.slice(0, 4)) - 1}${range.end.slice(4)}`,
        }
      : {
          start: iso(ms(range.start) - days * DAY),
          end: iso(ms(range.start) - DAY),
        };
  const now = revenueOf(range.start, range.end);
  const then = revenueOf(prev.start, prev.end);
  if (!then) return "no earlier data";
  const p = Math.round(((now - then) / then) * 1000) / 10;
  return `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(1)}% revenue`;
};

/**
 * Coldbrook's sales dashboard on the last 30 days. The gallery card turns
 * compare on once it has been seen, so the second range slides in beside
 * the first and the deltas rise.
 */
export function DateWindowDemo({
  chrome = true,
  // The header is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [range, setRange] = React.useState<DateWindowRange>(
    defaultDateWindowRange,
  );
  const [compare, setCompare] = React.useState(false);
  const [mode, setMode] = React.useState<DateWindowCompareMode>("previous");
  const frame = React.useRef<HTMLDivElement | null>(null);
  const once = React.useRef(false);

  React.useEffect(() => {
    const node = frame.current;
    if (chrome || !node || typeof IntersectionObserver === "undefined") return;
    let timer = 0;
    const io = new IntersectionObserver(([entry]) => {
      window.clearTimeout(timer);
      if (entry?.isIntersecting && !once.current) {
        timer = window.setTimeout(() => {
          once.current = true;
          setCompare(true);
        }, 1100);
      }
    });
    io.observe(node);
    return () => {
      window.clearTimeout(timer);
      io.disconnect();
    };
  }, [chrome]);

  const header = (
    <DateWindow
      range={range}
      onRangeChange={setRange}
      compare={compare}
      compareMode={mode}
      onCompareChange={(on, m) => {
        setCompare(on);
        setMode(m);
      }}
      className={chrome ? undefined : "max-h-[14.25rem]"}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={frame} className="w-full max-w-3xl">
        {header}
      </div>
    );
  }

  const label =
    defaultDateWindowPresets.find((p) => p.id === range.preset)?.label ??
    "Custom range";

  return (
    <div ref={frame} className="flex w-full max-w-3xl flex-col gap-4">
      {header}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setRange(defaultDateWindowRange);
            setCompare(false);
            setMode("previous");
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
        <span className="text-xs text-ink-3">
          Arrows move between presets · C compares · Custom opens a calendar
        </span>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{label}</span>
        {` · ${range.start.slice(5)} to ${range.end.slice(5)} · ${
          compare
            ? `vs ${mode === "year" ? "last year" : "previous period"} · ${change(range, mode)}`
            : "no comparison"
        }`}
      </p>
    </div>
  );
}
