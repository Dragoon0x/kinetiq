"use client";

import * as React from "react";

import { animate, type AnimationPlaybackControls } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PocketNav, type PocketNavLink } from "@/registry/ui/pocket-nav";

export const tweaks = defineTweaks({
  items: {
    kind: "range",
    label: "Items",
    default: 9,
    min: 4,
    max: 9,
    step: 1,
  },
  priority: {
    kind: "choice",
    label: "Priority",
    default: "order",
    options: ["order", "usage"],
    names: { order: "Bar order", usage: "Least used" },
  },
  pocket: {
    kind: "choice",
    label: "Pocket",
    default: "more",
    options: ["more", "dots"],
    names: { more: "More", dots: "Dots" },
  },
});

const LINKS: PocketNavLink[] = [
  { id: "overview", label: "Overview", usage: 120 },
  { id: "readings", label: "Readings", usage: 96 },
  { id: "alarms", label: "Alarms", usage: 88 },
  { id: "sites", label: "Sites", usage: 40 },
  { id: "crews", label: "Crews", usage: 22 },
  { id: "reports", label: "Reports", usage: 57 },
  { id: "billing", label: "Billing", usage: 9 },
  { id: "settings", label: "Settings", usage: 14 },
  { id: "help", label: "Help", usage: 5 },
];

const PAGES: Record<string, string> = {
  overview: "14 sites online, 2 need a look.",
  readings: "Flow and pressure, last 24 hours.",
  alarms: "One open: pressure high on Line 3.",
  sites: "Harbour, North weir and 12 more.",
  crews: "Three crews out, one on standby.",
  reports: "Weekly summary ready to send.",
  billing: "Next invoice on the 1st.",
  settings: "Units, alerts and people.",
  help: "Guides and the service desk.",
};

/** The narrowest the window goes, in px. */
const MIN = 200;
/** Room the grip takes beside the window. */
const GRIP = 16;

/**
 * The Gaugeworks console in a window you can resize: drag the grip on its
 * right edge (or focus it and use the arrow keys) and the top bar tucks what
 * no longer fits into its pocket.
 */
export function PocketNavDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const motionSafe = useMotionSafe();
  const [page, setPage] = React.useState("readings");
  const [room, setRoom] = React.useState(0);
  const [width, setWidth] = React.useState<number | null>(null);
  const [tucked, setTucked] = React.useState<string[]>([]);
  const start = React.useRef(0);
  const settle = React.useRef<AnimationPlaybackControls | null>(null);
  // Keys step from where the last key was aiming, not from where the
  // spring has got to, so a quick run of presses adds up.
  const aim = React.useRef<number | null>(null);
  const most = Math.max(MIN, room - GRIP);
  const shownWidth = width === null ? most : Math.min(width, most);

  const bindOuter = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver(() => setRoom(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const detach = React.useRef<(() => void) | null>(null);
  React.useEffect(
    () => () => {
      settle.current?.stop();
      detach.current?.();
    },
    [],
  );

  const resizeTo = (next: number, velocity = 0) => {
    settle.current?.stop();
    const target = Math.min(most, Math.max(MIN, next));
    aim.current = target;
    if (!motionSafe) {
      setWidth(target);
      return;
    }
    settle.current = animate(shownWidth, target, {
      ...springs.snap,
      velocity,
      onUpdate: (v) => setWidth(Math.round(v)),
      onComplete: () => {
        aim.current = null;
      },
    });
  };

  const drag = useDrag({
    axis: "x",
    threshold: 2,
    onStart: () => {
      settle.current?.stop();
      aim.current = null;
      start.current = shownWidth;
    },
    // The edge is under the finger 1:1, and gives less the further it is
    // pulled past either limit.
    onMove: ({ offset }) =>
      setWidth(
        Math.round(rubberClamp(start.current + offset.x, MIN, most, 120)),
      ),
    onEnd: ({ velocity }) => {
      if (shownWidth < MIN || shownWidth > most)
        resizeTo(shownWidth, velocity.x);
    },
    onCancel: () => resizeTo(shownWidth),
  });

  // The grip is a thin strip: a quick pull leaves it before the drag has
  // travelled far enough to capture the pointer. Until then, moves that land
  // outside it are handed to the drag from the window.
  const onGripPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerDown(event);
    detach.current?.();
    const grip = event.currentTarget;
    const pointerId = event.pointerId;
    const outside = (e: PointerEvent) =>
      e.pointerId === pointerId &&
      !(e.target instanceof Node && grip.contains(e.target));
    const asReact = (e: PointerEvent) => e as unknown as React.PointerEvent;
    const move = (e: PointerEvent) => {
      if (outside(e)) drag.onPointerMove(asReact(e));
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      if (outside(e)) {
        if (e.type === "pointerup") drag.onPointerUp(asReact(e));
        else drag.onPointerCancel(asReact(e));
      }
      detach.current?.();
      detach.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    detach.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  };

  const onGripKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 96 : 24;
    const from = aim.current ?? shownWidth;
    let next: number | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      next = from - step;
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      next = from + step;
    } else if (event.key === "PageDown") next = from - 96;
    else if (event.key === "PageUp") next = from + 96;
    else if (event.key === "Home") next = MIN;
    else if (event.key === "End") next = most;
    if (next === null) return;
    event.preventDefault();
    resizeTo(next);
  };

  const label = LINKS.find((l) => l.id === page)?.label ?? "";
  const inBar = LINKS.length - tucked.length;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <div ref={bindOuter} className="flex w-full items-stretch">
        <div
          className="flex h-[212px] shrink-0 flex-col rounded-3 border border-hairline bg-card"
          style={{ width: room ? shownWidth : `calc(100% - ${GRIP}px)` }}
        >
          <div className="flex min-w-0 items-center gap-2 border-b border-hairline pl-3">
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-2 bg-cobalt-wash font-mono text-[10px] font-semibold text-cobalt-bright"
            >
              G
            </span>
            <PocketNav
              label="Gaugeworks console"
              links={LINKS}
              value={page}
              onValueChange={setPage}
              onPocketChange={setTucked}
              sound={sound}
              className="flex-1 pr-1.5"
              {...values}
              items={values.items ?? tweaks.items.default}
            />
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-clip p-3">
            <p className="text-sm font-medium text-foreground">{label}</p>
            <p className="truncate text-xs text-ink-3">{PAGES[page]}</p>
            <div aria-hidden className="mt-1 flex flex-col gap-1.5">
              <span className="h-2 w-4/5 rounded-full bg-surface-2" />
              <span className="h-2 w-3/5 rounded-full bg-surface-2" />
              <span className="h-2 w-2/3 rounded-full bg-surface-2" />
            </div>
          </div>
        </div>
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Window width"
          aria-valuemin={MIN}
          aria-valuemax={Math.round(most)}
          aria-valuenow={Math.round(shownWidth)}
          aria-valuetext={`${Math.round(shownWidth)} pixels`}
          onKeyDown={onGripKey}
          {...drag}
          onPointerDown={onGripPointerDown}
          className="group/pocket-nav-grip flex w-4 shrink-0 cursor-ew-resize touch-pan-y items-center justify-center rounded-2 outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          <span className="h-12 w-1.5 rounded-full bg-hairline-strong transition-colors group-hover/pocket-nav-grip:bg-cobalt-bright group-focus-visible/pocket-nav-grip:bg-cobalt-bright" />
        </div>
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{inBar} in the bar</span> ·{" "}
          {tucked.length} in the pocket · window {Math.round(shownWidth)} px ·{" "}
          {label}
        </p>
      ) : null}
    </div>
  );
}
