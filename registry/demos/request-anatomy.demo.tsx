"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultAnatomyPrices,
  defaultAnatomyRequests,
  RequestAnatomy,
} from "@/registry/ui/request-anatomy";

export const tweaks = defineTweaks({
  segmentGap: {
    kind: "range",
    label: "Gap",
    default: 6,
    min: 0,
    max: 12,
    step: 1,
    unit: "px",
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "tones",
    options: ["tones", "spectrum", "mono"],
    names: { tones: "Tones", spectrum: "Spectrum", mono: "Mono" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

/** The long draft that went through: the request worth taking apart. */
const SHOWCASE = defaultAnatomyRequests[4]?.id ?? null;

const compact = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);

/**
 * One Fernworks support-agent run, nine requests. The gallery card opens the
 * long draft reply once it is seen, so its anatomy unfolds; on the stage
 * every request opens, pins (C) and copies.
 */
export function RequestAnatomyDemo({
  chrome = true,
  // The log is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState<string | null>(null);
  const [pinned, setPinned] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const once = React.useRef(false);
  const replay = React.useRef(0);
  React.useEffect(() => () => window.clearTimeout(replay.current), []);

  React.useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    let timer = 0;
    const io = new IntersectionObserver(([entry]) => {
      window.clearTimeout(timer);
      if (entry?.isIntersecting && !once.current) {
        timer = window.setTimeout(() => {
          once.current = true;
          setOpen(SHOWCASE);
        }, 900);
      }
    });
    io.observe(node);
    return () => {
      window.clearTimeout(timer);
      io.disconnect();
    };
  }, []);

  const panel = (
    <RequestAnatomy
      open={open}
      onOpenRequest={(id) => setOpen(id)}
      pinned={pinned}
      onPin={(id) => setPinned(id)}
      onCopyId={(id) => setCopied(id)}
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

  const r = defaultAnatomyRequests.find((x) => x.id === open);
  const tokens = r ? Object.values(r.tokens).reduce((s, v) => s + v, 0) : 0;
  const price = r ? defaultAnatomyPrices[r.model] : undefined;
  const cost =
    r && price
      ? ((r.tokens.system +
          r.tokens.context +
          r.tokens.history +
          r.tokens.input) *
          price.input +
          r.tokens.output * price.output +
          r.tokens.cached * price.cached) /
        1e6
      : 0;
  const num = (id: string | null) => (id ? id.slice(-2) : "none");

  return (
    <div ref={ref} className="flex w-full max-w-3xl flex-col gap-4">
      {panel}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(null);
            setPinned(null);
            setCopied(null);
            window.clearTimeout(replay.current);
            replay.current = window.setTimeout(() => setOpen(SHOWCASE), 450);
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
        <span className="text-signal">
          {r
            ? `open req ${num(open)} · ${compact(tokens)} tokens · $${cost.toFixed(3)}`
            : "no request open"}
        </span>
        {` · pinned ${num(pinned)}${copied ? " · id copied" : ""}`}
      </p>
    </div>
  );
}
