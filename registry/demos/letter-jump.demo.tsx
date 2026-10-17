"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  assignLetterKeys,
  defaultLetterJumpItems,
  LetterJump,
} from "@/registry/ui/letter-jump";

export const tweaks = defineTweaks({
  badgeStyle: {
    kind: "choice",
    label: "Badge",
    default: "keycap",
    options: ["keycap", "pill", "outline"],
    names: { keycap: "Keycap", pill: "Pill", outline: "Outline" },
  },
  cascade: {
    kind: "range",
    label: "Cascade",
    default: 20,
    min: 0,
    max: 40,
    step: 5,
    unit: "ms",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

/** How long the demo holds the keys up when it shows them by itself. */
const SHOW_MS = 1800;
const KEYS = assignLetterKeys(defaultLetterJumpItems);
const TWO = Object.values(KEYS).filter((k) => k.length === 2).length;

/**
 * Gaugeworks' support desk, sitting on Inbox. Once it is on screen — and
 * again whenever a tweak changes — the keys rise by themselves for a moment
 * so the ripple can be seen; hold G yourself and press R for Refunds.
 */
export function LetterJumpDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // The list is silent: the stage's sound switch has nothing to play here.
  void sound;
  const [current, setCurrent] = React.useState("inbox");
  const [shown, setShown] = React.useState(false);
  const [jumped, setJumped] = React.useState<string | null>(null);
  const [inView, setInView] = React.useState(false);
  const [play, setPlay] = React.useState(0);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(!!entry?.isIntersecting),
      { threshold: 0.3 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  // A tweak that changes the badges replays them.
  const look = `${values.badgeStyle ?? ""}|${values.cascade ?? ""}|${values.accent ?? ""}`;
  const [seenLook, setSeenLook] = React.useState(look);
  if (seenLook !== look) {
    setSeenLook(look);
    setPlay((n) => n + 1);
  }

  // Shown once on arrival, and once per replay, only while on screen.
  const [played, setPlayed] = React.useState(-1);
  React.useEffect(() => {
    if (!inView || played === play) return;
    const up = window.setTimeout(() => {
      setPlayed(play);
      setShown(true);
    }, 500);
    return () => window.clearTimeout(up);
  }, [inView, play, played]);
  React.useEffect(() => {
    if (!shown || played !== play) return;
    const down = window.setTimeout(() => setShown(false), SHOW_MS);
    return () => window.clearTimeout(down);
  }, [shown, played, play]);

  const surface = (
    <LetterJump
      current={current}
      onNavigate={(id) => {
        setCurrent(id);
        setJumped(id);
      }}
      showKeys={shown}
      onShowKeysChange={setShown}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={wrapRef} className="w-full max-w-80">
        {surface}
      </div>
    );
  }

  const item = defaultLetterJumpItems.find((it) => it.id === current);
  const key = (KEYS[current] ?? "").toUpperCase();

  return (
    <div ref={wrapRef} className="flex w-full max-w-80 flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setCurrent("inbox");
            setJumped(null);
            setPlay((n) => n + 1);
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
          {jumped
            ? `on ${item?.label ?? current} · ${key}`
            : (item?.label ?? current)}
        </span>
        {shown
          ? " · keys up"
          : ` · ${defaultLetterJumpItems.length} items · ${TWO} two-letter keys`}
      </p>
    </div>
  );
}
