"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultSuiteApps,
  SuiteAtrium,
  type SuiteApp,
} from "@/registry/ui/suite-atrium";

export const tweaks = defineTweaks({
  tileSize: {
    kind: "range",
    label: "Tile",
    default: 180,
    min: 140,
    max: 220,
    step: 20,
    unit: "px",
  },
  grow: {
    kind: "choice",
    label: "Grow",
    default: "tile",
    options: ["tile", "zoom", "sheet"],
    names: { tile: "Tile", zoom: "Zoom", sheet: "Sheet" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

/** Who clocks on and off while the home is watched: a seeded, looping shift. */
const SHIFT = [15, 16, 15, 13, 14];
const EVERY_MS = 4200;
const START_PINNED = ["survey"];

/**
 * Fieldline's home for Ines on a Wednesday afternoon. Crew's live summary
 * moves as people clock on, so its number rolls; changing how apps grow
 * plays one open-and-home with Survey so the new path is seen.
 */
export function SuiteAtriumDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // The suite is silent: the stage's sound switch has nothing to play here.
  void sound;
  const [open, setOpen] = React.useState<string | null>(null);
  const [pinned, setPinned] = React.useState<string[]>(START_PINNED);
  const [tick, setTick] = React.useState(-1);
  const [inView, setInView] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(!!entry?.isIntersecting),
      { threshold: 0.2 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  // One shift change at a time, only while on screen and visible.
  React.useEffect(() => {
    if (!inView) return;
    const t = window.setTimeout(() => {
      if (!document.hidden) setTick((n) => n + 1);
    }, EVERY_MS);
    return () => window.clearTimeout(t);
  }, [inView, tick]);

  // A new growth path is shown once: open Survey, then home again.
  const grow = values.grow ?? "tile";
  const [seenGrow, setSeenGrow] = React.useState(grow);
  const [play, setPlay] = React.useState(0);
  if (seenGrow !== grow) {
    setSeenGrow(grow);
    setPlay((n) => n + 1);
  }
  React.useEffect(() => {
    if (play === 0 || !inView) return;
    const a = window.setTimeout(() => setOpen("survey"), 120);
    const b = window.setTimeout(() => setOpen(null), 1900);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [play, inView]);

  const onShift = tick < 0 ? 14 : (SHIFT[tick % SHIFT.length] ?? 14);
  const apps: SuiteApp[] = React.useMemo(
    () =>
      defaultSuiteApps.map((app) =>
        app.id === "crew"
          ? {
              ...app,
              summary: `${onShift} on shift · ${Math.max(0, 16 - onShift)} open ${16 - onShift === 1 ? "slot" : "slots"}`,
              stat: { value: onShift, label: "on shift" },
            }
          : app,
      ),
    [onShift],
  );

  const surface = (
    <SuiteAtrium
      apps={apps}
      openApp={open}
      onOpenApp={(id) => setOpen(id)}
      onReturnHome={() => setOpen(null)}
      pinned={pinned}
      onPinApp={(_id, _on, all) => setPinned(all)}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={wrapRef} className="w-full max-w-3xl">
        {surface}
      </div>
    );
  }

  const openName = apps.find((a) => a.id === open)?.name;
  const pinnedNames = pinned
    .map((id) => apps.find((a) => a.id === id)?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <div ref={wrapRef} className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(null);
            setPinned(START_PINNED);
            setTick(-1);
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
        <span className="text-signal">
          {openName ? `${openName} open` : "home"}
        </span>
        {` · ${apps.length} apps · ${pinnedNames ? `${pinnedNames} pinned` : "nothing pinned"} · ${onShift} on shift`}
      </p>
    </div>
  );
}
