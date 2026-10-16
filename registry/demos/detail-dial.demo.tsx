"use client";

import * as React from "react";

import { useInView } from "motion/react";
import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  DetailDial,
  defaultDetailAnswer,
  defaultDetailLevelNames,
} from "@/registry/ui/detail-dial";

export const tweaks = defineTweaks({
  levels: {
    kind: "range",
    label: "Levels",
    default: 4,
    min: 2,
    max: 4,
    step: 1,
  },
  unfurlSpeed: {
    kind: "range",
    label: "Unfurl",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.25,
    unit: "×",
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

/** The answer level a detent shows, as the dial spreads them. */
const levelFor = (k: number, levels: number) =>
  k >= levels ? 4 : 1 + Math.floor(((k - 1) * 3) / Math.max(1, levels - 1));

const wordsAt = (level: number) =>
  defaultDetailAnswer
    .flatMap((b) => b.sentences)
    .filter((s) => s.level <= level)
    .reduce((n, s) => n + s.text.split(/\s+/).length, 0);

/**
 * A Gaugeworks customer asks whether water damage to their G4 thermostat is
 * covered. The gallery card turns the dial up from one line, one detent at a
 * time, once it is seen.
 */
export function DetailDialDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const levels = Math.round(values.levels ?? 4);
  const [depth, setDepth] = React.useState(chrome ? 2 : 1);
  const [slow, setSlow] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const written = React.useRef(new Set<number>());
  const frame = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(frame, { amount: 0.35 });
  const shown = Math.min(depth, levels);

  const describe = (k: number) => {
    const level = levelFor(k, levels);
    return `level ${k} · ${(defaultDetailLevelNames[level - 1] ?? "").toLowerCase()} · ${wordsAt(level)} words`;
  };

  // The gallery card turns the dial up once it has been seen.
  const played = React.useRef(false);
  React.useEffect(() => {
    if (chrome || !inView || played.current) return;
    const a = window.setTimeout(() => setDepth(2), 900);
    const b = window.setTimeout(() => {
      played.current = true;
      setDepth(3);
    }, 2600);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [chrome, inView]);

  const surface = (
    <DetailDial
      key={round}
      depth={shown}
      onDepthChange={(k) => {
        setDepth(k);
        const level = levelFor(k, levels);
        if (!slow || written.current.has(level) || k < shown) {
          setNote(describe(k));
          return;
        }
        setNote(`writing level ${k}`);
        return new Promise<void>((resolve) =>
          window.setTimeout(() => {
            written.current.add(level);
            setNote(describe(k));
            resolve();
          }, 900),
        );
      }}
      onCopyLevel={(k) => setNote(`copied level ${k}`)}
      {...values}
      levels={levels}
    />
  );

  if (!chrome)
    return (
      <div ref={frame} className="w-full">
        {surface}
      </div>
    );

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground aria-pressed:border-(--accent-bright)/50 aria-pressed:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div ref={frame} className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={slow}
          onClick={() => {
            setSlow((s) => !s);
            written.current.clear();
          }}
          className={button}
        >
          Slow writer
        </button>
        <button
          type="button"
          onClick={() => {
            setDepth(2);
            setNote(null);
            written.current.clear();
            setRound((r) => r + 1);
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
        <span className="text-signal">{note ?? describe(shown)}</span>
        {" · gaugeworks warranty"}
      </p>
    </div>
  );
}
