"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  CacheDividend,
  defaultCacheDays,
  defaultCachePrices,
} from "@/registry/ui/cache-dividend";

export const tweaks = defineTweaks({
  splitStyle: {
    kind: "choice",
    label: "Split",
    default: "stacked",
    options: ["stacked", "mirror", "share"],
    names: { stacked: "Stacked", mirror: "Mirror", share: "Share" },
  },
  counterStyle: {
    kind: "choice",
    label: "Counter",
    default: "odometer",
    options: ["odometer", "count", "gauge"],
    names: { odometer: "Odometer", count: "Count", gauge: "Gauge" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const LAST = defaultCacheDays.length - 1;
/** The walk starts on the day after the deploy, so the payout is visible. */
const FROM = 9;
const STEP_MS = 160;

const saved = (i: number) =>
  defaultCacheDays
    .slice(0, i + 1)
    .reduce(
      (s, d) =>
        s +
        (d.cached * (defaultCachePrices.input - defaultCachePrices.cached) -
          (d.writes ?? 0) *
            (defaultCachePrices.write - defaultCachePrices.input)) /
          1e6,
      0,
    );

/**
 * Coldbrook's support assistant in October. The gallery card opens on the
 * 10th and, once it is seen, walks the scrub day by day to the 17th so the
 * savings counter pays out; the walk runs only while the card is on screen
 * and the page is visible, and stops for good once a visitor scrubs.
 */
export function CacheDividendDemo({
  chrome = true,
  // The cache panel is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [day, setDay] = React.useState(chrome ? LAST : FROM);
  const [walking, setWalking] = React.useState(!chrome);
  const [inView, setInView] = React.useState(false);
  const [opened, setOpened] = React.useState<string | null>(null);
  const [exported, setExported] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(!!entry?.isIntersecting),
      { threshold: 0.3 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  // One step a beat, only while the card is seen and the page is visible,
  // and nothing at all once the walk has reached the last day.
  const done = day >= LAST;
  React.useEffect(() => {
    if (!walking || !inView || done) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setDay((d) => Math.min(LAST, d + 1));
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [walking, inView, done]);

  const panel = (
    <CacheDividend
      day={day}
      onScrub={(i) => {
        setWalking(false);
        setDay(i);
      }}
      onOpenPrompt={(p) => setOpened(p.name)}
      onExport={() => setExported(true)}
      className={chrome ? undefined : "max-h-[13.75rem]"}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={ref} className="w-full max-w-3xl">
        {panel}
      </div>
    );
  }

  const d = defaultCacheDays[day];
  const rate =
    d && d.input > 0
      ? Math.round(
          (defaultCacheDays
            .slice(0, day + 1)
            .reduce((s, x) => s + x.cached, 0) /
            defaultCacheDays
              .slice(0, day + 1)
              .reduce((s, x) => s + x.input, 0)) *
            100,
        )
      : 0;
  const money = `$${saved(day)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

  return (
    <div ref={ref} className="flex w-full max-w-3xl flex-col gap-4">
      {panel}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setDay(FROM);
            setOpened(null);
            setExported(false);
            setWalking(true);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Replay
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{`Oct ${day + 1} · ${money} saved`}</span>
        {` · ${rate}% cached${opened ? ` · opened ${opened}` : ""}${exported ? " · exported" : ""}`}
      </p>
    </div>
  );
}
