"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { CurtainCount } from "@/registry/ui/curtain-count";

export const tweaks = defineTweaks({
  // Five variants is one more than a choice row holds on a phone plate, so
  // the variant is a stepped slider; the prop takes the name or its number.
  variant: {
    kind: "range",
    label: "Variant",
    default: 1,
    min: 1,
    max: 5,
    step: 1,
  },
  exitMotion: {
    kind: "choice",
    label: "Exit",
    default: "split",
    options: ["split", "slats", "shutter"],
    names: { split: "Split", slats: "Slats", shutter: "Shutter" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--signal)",
      "var(--warn)",
      "var(--danger)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--signal)": "Signal",
      "var(--warn)": "Amber",
      "var(--danger)": "Coral",
    },
  },
});

const NAMES = ["counter", "word", "bars", "split", "radial"];

/** A loader's honest rhythm: quick early requests, a stall, a rush, the last few. */
const SCRIPT: readonly (readonly [number, number])[] = [
  [200, 0.06],
  [460, 0.17],
  [760, 0.26],
  [1100, 0.41],
  [1380, 0.44],
  [1700, 0.62],
  [1960, 0.7],
  [2280, 0.85],
  [2560, 0.94],
  [2820, 1],
];

const STORIES = [
  { title: "Salt marsh walks", note: "Six routes at low tide" },
  { title: "Orchard maps", note: "Where the late pears are" },
  { title: "Tide tables", note: "October to December" },
];

/** The Fieldline page the curtain hides while it loads. */
function FieldlinePage() {
  return (
    <div className="@container flex h-full flex-col gap-5 overflow-hidden bg-background p-5 text-foreground @[480px]:p-8">
      <header className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] font-medium tracking-[0.16em] uppercase">
          Fieldline
        </span>
        <span className="hidden items-center gap-5 text-xs text-ink-2 @[420px]:flex">
          <span>Journal</span>
          <span>Maps</span>
          <span>Shop</span>
        </span>
        <span className="inline-flex h-7 items-center rounded-full border border-hairline-strong px-3 text-xs">
          Join
        </span>
      </header>
      <div className="flex flex-col gap-2">
        <p className="font-mono text-[10px] tracking-[0.16em] text-ink-3 uppercase">
          Autumn 2026
        </p>
        <h2 className="text-2xl font-medium tracking-tight text-balance @[480px]:text-4xl">
          Field notes for the season
        </h2>
        <p className="max-w-md text-sm text-ink-2">
          Walks, maps and tide tables for the shortening days, gathered by
          people who were out there.
        </p>
      </div>
      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden @[480px]:grid-cols-3">
        {STORIES.map((story, i) => (
          <div
            key={story.title}
            className={cn(
              "flex-col gap-3 overflow-hidden rounded-3 border border-hairline bg-card p-3",
              i === 2 ? "hidden @[480px]:flex" : "flex",
            )}
          >
            <div
              className="flex-1 rounded-2"
              style={{
                background: `linear-gradient(${140 + i * 30}deg, var(--accent-wash), color-mix(in oklab, var(--signal) 14%, transparent) 70%, transparent)`,
              }}
            />
            <div>
              <p className="text-sm font-medium">{story.title}</p>
              <p className="text-xs text-ink-3">{story.note}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Fieldline's autumn page loading behind the curtain: the demo plays a
 * seeded loader script once the frame is in view, and the curtain splits
 * and lifts at 100 %.
 */
export function CurtainCountDemo({
  chrome = true,
  // The curtain is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [progress, setProgress] = React.useState(0);
  const [run, setRun] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  const boxRef = React.useRef<HTMLDivElement | null>(null);

  // Each run plays the script from the top once the frame is in view.
  React.useEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    const timers: number[] = [];
    let started = false;
    const watcher = new IntersectionObserver(
      (entries) => {
        if (started || !entries.some((e) => e.isIntersecting)) return;
        started = true;
        for (const [at, value] of SCRIPT) {
          timers.push(window.setTimeout(() => setProgress(value), at));
        }
      },
      { threshold: 0.3 },
    );
    watcher.observe(node);
    return () => {
      watcher.disconnect();
      for (const t of timers) window.clearTimeout(t);
    };
  }, [run]);

  // In the gallery the page shows for a moment, then the curtain comes back.
  React.useEffect(() => {
    if (chrome || !revealed) return;
    const t = window.setTimeout(() => {
      setProgress(0);
      setRun((r) => r + 1);
    }, 2600);
    return () => window.clearTimeout(t);
  }, [chrome, revealed]);

  const replay = () => {
    setProgress(0);
    setRun((r) => r + 1);
  };

  const frame = (
    <CurtainCount
      progress={progress}
      onRevealChange={setRevealed}
      brand="Fieldline"
      caption="Loading the season"
      {...values}
    >
      <FieldlinePage />
    </CurtainCount>
  );

  if (!chrome) {
    return (
      <div
        ref={boxRef}
        className="w-full overflow-clip rounded-3 border border-hairline"
        style={{ height: 540 }}
      >
        {frame}
      </div>
    );
  }

  const v = Math.min(5, Math.max(1, Math.round(values.variant ?? 1)));
  const exit = values.exitMotion ?? "split";

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fieldline · autumn page
          </p>
          <p className="text-sm font-medium text-foreground">
            Holding the stage
          </p>
        </div>
        <button
          type="button"
          onClick={replay}
          className="inline-flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs text-foreground outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Replay
        </button>
      </div>
      <div
        ref={boxRef}
        className="w-full overflow-clip rounded-3 border border-hairline"
        style={{ height: 400 }}
      >
        {frame}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {revealed ? (
          <>
            <span className="text-signal">revealed</span> · {exit} exit
          </>
        ) : (
          <>
            <span className="text-signal">loading</span> ·{" "}
            {Math.round(progress * 100)}% · {NAMES[v - 1]}
          </>
        )}
      </p>
    </div>
  );
}
