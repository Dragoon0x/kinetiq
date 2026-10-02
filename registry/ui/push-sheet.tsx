"use client";

import * as React from "react";

import { X } from "lucide-react";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PushSheetSnaps = "half-full" | "full" | "thirds";

export type PushSheetApi = {
  /** Opens a sheet on top of the stack (or brings the stack back down to it). */
  open: (id: string) => void;
  /** Closes the top sheet, or the given sheet and everything above it. */
  close: (id?: string) => void;
  /** Moves the top sheet to one of its stops, lowest first. */
  snapTo: (index: number) => void;
  /** The open sheets, bottom first. */
  stack: string[];
};

export type PushSheetItem = {
  id: string;
  /** The sheet's heading and its dialog's name. */
  title: string;
  /** One line under the heading; describes the dialog. */
  description?: string;
  /** The sheet's body. A function receives the stack's controls. */
  content: React.ReactNode | ((api: PushSheetApi) => React.ReactNode);
  /** This sheet's own stops, in place of the component's. */
  snaps?: PushSheetSnaps | number[];
};

export type PushSheetProps = {
  /** Every sheet that can open, by id. */
  sheets: PushSheetItem[];
  /** The page under the sheets. A function receives the stack's controls. */
  children: React.ReactNode | ((api: PushSheetApi) => React.ReactNode);
  /** Controlled: the open sheets' ids, bottom first. */
  value?: string[];
  /** The sheets open at first when uncontrolled. @default [] */
  defaultValue?: string[];
  /** Fires from the call, drag, key or button that opened or closed a sheet, with the new stack. */
  onValueChange?: (stack: string[]) => void;
  /** A sheet came to rest on a stop, given as a share of its full height. */
  onSnapChange?: (id: string, snap: number) => void;
  /** How far a covered layer steps back, 0 to 1: 0 only dims it, 1 shrinks it to 94% per level and rounds it fully. @default 0.6 */
  push?: number;
  /** Where a sheet stops: half and full height, full only, thirds — or your own shares of the full height. @default "half-full" */
  snaps?: PushSheetSnaps | number[];
  /** How dark a fully covered layer gets, 0 to 0.8. @default 0.35 */
  dim?: number;
  /** Where a new sheet comes to rest: its lowest stop or its highest. @default "lowest" */
  openAt?: "lowest" | "highest";
  /** The gap above a sheet at full height, in px: where the layer behind peeks out. @default 28 */
  inset?: number;
  /** A sheet's widest, in px; it is centred when the box is wider. @default 560 */
  width?: number;
  /** The sheets' top corners and the pushed page's corners, in px. @default 16 */
  radius?: number;
  /** A drag down, Escape, a press on the page behind and Down at the lowest stop close the top sheet. @default true */
  dismissible?: boolean;
  /** The box's height: px or any CSS length. @default 520 */
  height?: number | string;
  /** What shows behind the pushed page: any CSS colour. @default "color-mix(in oklab, var(--background) 45%, black)" */
  backdrop?: string;
  /** The close button's accessible name. @default "Close" */
  closeLabel?: string;
  /** Play the swish of a sheet and the thock of it landing on a stop. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** Open sheets at once, plus room for two still leaving. */
const SLOTS = 6;
const MAX_OPEN = 4;
/** Below the box's bottom edge, clear of the sheet's shadow. */
const BELOW = 24;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const TABBABLE =
  "a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";

function stopsOf(snaps: PushSheetSnaps | number[] | undefined): number[] {
  if (Array.isArray(snaps)) {
    const list = snaps
      .filter((n) => Number.isFinite(n) && n > 0)
      .map((n) => r4(Math.min(1, n)))
      .sort((a, b) => a - b);
    return list.length > 0 ? Array.from(new Set(list)) : [1];
  }
  if (snaps === "full") return [1];
  if (snaps === "thirds") return [0.3333, 0.6667, 1];
  return [0.5, 1];
}

function stopName(f: number): string {
  if (f >= 0.999) return "Full height";
  if (Math.abs(f - 0.5) < 0.01) return "Half height";
  if (Math.abs(f - 1 / 3) < 0.01) return "One third height";
  if (Math.abs(f - 2 / 3) < 0.01) return "Two thirds height";
  return `${Math.round(f * 100)}% height`;
}

/** Renders a node, or a function of the stack's controls. */
function Slot({
  render,
  api,
}: {
  render: React.ReactNode | ((api: PushSheetApi) => React.ReactNode);
  api: PushSheetApi;
}) {
  return <>{typeof render === "function" ? render(api) : render}</>;
}

type Layer = {
  id: string;
  /** Which of the motion-value slots carries this sheet. */
  slot: number;
  leaving: boolean;
};

type Look = { scale: number; y: number; radius: number; dim: number };

/** Per-slot styles out of the shared per-frame look. */
function useLook(frame: MotionValue<Look[]>, index: number) {
  return {
    scale: useTransform(frame, (f) => f[index]?.scale ?? 1),
    y: useTransform(frame, (f) => f[index]?.y ?? 0),
    radius: useTransform(frame, (f) => f[index]?.radius ?? 0),
    dim: useTransform(frame, (f) => f[index]?.dim ?? 0),
  };
}

type SheetProps = {
  item: PushSheetItem;
  api: PushSheetApi;
  stops: number[];
  snap: number;
  top: boolean;
  leaving: boolean;
  zIndex: number;
  y: MotionValue<number>;
  look: ReturnType<typeof useLook>;
  opacity: MotionValue<number>;
  /** The y of a stop, px. */
  yAt: (f: number) => number;
  closedY: number;
  sheetH: number;
  inset: number;
  dismissible: boolean;
  disabled: boolean;
  motionSafe: boolean;
  closeLabel: string;
  bind: (node: HTMLDivElement | null) => void;
  halt: () => void;
  onSettle: (index: number, velocity: number) => void;
  onDismiss: (velocity: number) => void;
  onTrap: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onExpand: () => void;
};

/**
 * One sheet: its grabber and title bar drag it, 1:1 under the finger and
 * rubber-banded past its top stop, and a release commits to the stop the
 * throw was heading for — or sends it away.
 */
function Sheet({
  item,
  api,
  stops,
  snap,
  top,
  leaving,
  zIndex,
  y,
  look,
  opacity,
  yAt,
  closedY,
  sheetH,
  inset,
  dismissible,
  disabled,
  motionSafe,
  closeLabel,
  bind,
  halt,
  onSettle,
  onDismiss,
  onTrap,
  onExpand,
}: SheetProps) {
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;
  const start = React.useRef(0);
  const grab = useMotionValue(0);
  const live = top && !leaving && !disabled;

  const sheetY = useTransform(
    [y, look.y] as MotionValue<number>[],
    ([a = 0, b = 0]: number[]) => r2(a + b),
  );
  // Room under the body's end equal to what is below the box, so a sheet
  // at a low stop can still scroll its last line into view.
  const spare = useTransform(y, (v) => r2(clamp(v - inset, 0, sheetH)));
  const grabW = useTransform(grab, (g) => r2(36 + 8 * g));

  const highest = stops[stops.length - 1] ?? 1;

  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled: !live,
    onStart: () => {
      halt();
      start.current = y.get();
      if (motionSafe) animate(grab, 1, springs.flick);
      else grab.set(1);
    },
    onMove: ({ offset }) => {
      const raw = start.current + offset.y;
      const ceiling = yAt(highest);
      // Past the top stop the sheet resists; below it, it follows the finger
      // all the way down.
      const next =
        raw < ceiling
          ? ceiling + rubberband(raw - ceiling, Math.min(120, sheetH * 0.25))
          : raw;
      y.set(r2(next));
    },
    onEnd: ({ velocity }) => {
      if (motionSafe) animate(grab, 0, springs.glide);
      else grab.set(0);
      const landing = project(y.get(), velocity.y, 0.99);
      let best = -1;
      let gap = Math.abs(landing - closedY);
      if (!dismissible) gap = Number.POSITIVE_INFINITY;
      stops.forEach((f, i) => {
        const d = Math.abs(landing - yAt(f));
        if (d < gap) {
          gap = d;
          best = i;
        }
      });
      if (best === -1) onDismiss(velocity.y);
      else onSettle(best, velocity.y);
    },
    onCancel: () => {
      grab.set(0);
      onSettle(snap, 0);
    },
  });

  const f = stops[snap] ?? highest;

  const onGrabberKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!live) return;
    const last = stops.length - 1;
    switch (event.key) {
      case "ArrowUp":
      case "PageUp":
        event.preventDefault();
        if (snap < last) onSettle(snap + 1, 0);
        return;
      case "ArrowDown":
      case "PageDown":
        event.preventDefault();
        if (snap > 0) onSettle(snap - 1, 0);
        else if (dismissible) onDismiss(0);
        return;
      case "Home":
        event.preventDefault();
        onSettle(0, 0);
        return;
      case "End":
        event.preventDefault();
        onSettle(last, 0);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        onSettle(snap === last ? 0 : last, 0);
        return;
    }
  };

  return (
    <motion.div
      ref={bind}
      role="dialog"
      aria-modal={live || undefined}
      aria-labelledby={titleId}
      aria-describedby={item.description ? descId : undefined}
      aria-hidden={!live || undefined}
      inert={!live}
      tabIndex={-1}
      onKeyDown={onTrap}
      onFocusCapture={(event) => {
        // A control below the fold raises the sheet to see it. Judged against
        // where the sheet rests, not where it is now: it may still be rising.
        const target = event.target as HTMLElement;
        if (!live || target === event.currentTarget) return;
        const sheet = event.currentTarget.getBoundingClientRect();
        const below = target.getBoundingClientRect().bottom - sheet.top;
        const room = sheetH * f;
        if (f < highest && below > room - 8) onExpand();
      }}
      className="absolute inset-x-0 top-0 mx-auto flex w-full max-w-[var(--push-sheet-w)] flex-col rounded-t-[var(--push-sheet-r)] border border-b-0 border-hairline-strong bg-card text-foreground shadow-[0_-10px_30px_-12px_color-mix(in_oklab,black_40%,transparent)] outline-none"
      style={{
        zIndex,
        height: `calc(100% - ${inset}px)`,
        y: sheetY,
        scale: look.scale,
        opacity,
        transformOrigin: "50% 0%",
      }}
    >
      <div
        {...drag}
        className={cn(
          "shrink-0 touch-pan-x select-none",
          live && "cursor-grab active:cursor-grabbing",
        )}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div
            role="slider"
            tabIndex={live ? 0 : -1}
            aria-label={`${item.title} height`}
            aria-orientation="vertical"
            aria-valuemin={Math.round((stops[0] ?? 1) * 100)}
            aria-valuemax={100}
            aria-valuenow={Math.round(f * 100)}
            aria-valuetext={stopName(f)}
            onKeyDown={onGrabberKey}
            onClick={(event) => {
              // A pointer tap toggles too; keys arrive through onKeyDown.
              if (event.detail === 0 || !live) return;
              onSettle(snap === stops.length - 1 ? 0 : stops.length - 1, 0);
            }}
            className={cn(
              "flex h-4 w-14 items-center justify-center rounded-full",
              FOCUS,
            )}
          >
            <motion.span
              aria-hidden
              className="h-1 rounded-full bg-ink-3/45"
              style={{ width: grabW }}
            />
          </div>
        </div>
        <div className="flex items-start gap-3 px-4 pb-3">
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="truncate text-[15px] leading-6 font-semibold"
            >
              {item.title}
            </h2>
            {item.description ? (
              <p id={descId} className="truncate text-xs leading-4 text-ink-3">
                {item.description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            data-push-sheet-close=""
            aria-label={closeLabel}
            disabled={!live}
            onClick={() => onDismiss(0)}
            className={cn(
              "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-surface-2 text-ink-2 transition-colors hover:text-foreground active:scale-95 disabled:cursor-default",
              FOCUS,
            )}
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      </div>
      <div
        data-push-sheet-body=""
        className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-4"
      >
        <Slot render={item.content} api={api} />
        <motion.div aria-hidden style={{ height: spare }} />
      </div>
      {/* More sheet under the sheet: pulled past its top stop, it shows
          its own surface below, never a gap. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-[-1px] top-full h-40 border-x border-hairline-strong bg-card"
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-t-[var(--push-sheet-r)] bg-black"
        style={{ opacity: look.dim }}
      />
    </motion.div>
  );
}

/**
 * A bottom sheet that pushes its page back. As the sheet rises the page
 * behind it scales down about its top centre, drops a few pixels, rounds its
 * corners and dims, like a card behind another in a stack — and a sheet opened
 * from a sheet does the same to the one beneath it. Every layer's look is a
 * function of how far the sheets above it have risen, so dragging the top
 * sheet moves everything behind it 1:1.
 *
 * The sheet rises on the glide spring to its lowest stop (half and full
 * height by default). Its grabber and title bar drag it: 1:1 under the
 * finger, rubber-banded past the top stop, and a release commits to the stop
 * the throw was heading for, carrying its speed, or sends the sheet away.
 *
 * Each sheet is a modal dialog: focus moves in when it arrives, Tab stays in
 * it, Escape closes it and focus goes back to what opened it. Its grabber is
 * a slider — Up and Down move between stops, Down from the lowest closes it,
 * Enter jumps to the other end. Under reduced motion sheets fade in at their
 * stop and the page does not move, but it still dims and rounds its corners,
 * because what is covered is information.
 */
export function PushSheet({
  sheets,
  children,
  value,
  defaultValue = [],
  onValueChange,
  onSnapChange,
  push = 0.6,
  snaps = "half-full",
  dim = 0.35,
  openAt = "lowest",
  inset = 28,
  width = 560,
  radius = 16,
  dismissible = true,
  height = 520,
  backdrop = "color-mix(in oklab, var(--background) 45%, black)",
  closeLabel = "Close",
  sound = false,
  disabled = false,
  className,
}: PushSheetProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const gap = Math.max(0, Math.round(inset));
  const pushK = clamp(push, 0, 1);
  const dimK = clamp(dim, 0, 0.8);

  const valid = (list: string[]) => {
    const out: string[] = [];
    for (const id of list) {
      if (out.length >= MAX_OPEN) break;
      if (!out.includes(id) && sheets.some((s) => s.id === id)) out.push(id);
    }
    return out;
  };

  const [own, setOwn] = React.useState<string[]>(() => valid(defaultValue));
  const stack = valid(value ?? own);
  const stackKey = stack.join("\u0000");

  const [box, setBox] = React.useState<{ w: number; h: number } | null>(null);
  const H = box?.h ?? 0;
  const sheetH = Math.max(1, H - gap);
  const closedY = H + BELOW;
  const yAt = (f: number) => r2(H - f * sheetH);

  type State = {
    key: string;
    layers: Layer[];
    snap: Record<string, number>;
    seq: number;
    said: string;
  };
  const stopsFor = (id: string) =>
    stopsOf(sheets.find((s) => s.id === id)?.snaps ?? snaps);
  const titleOf = (id: string) => sheets.find((s) => s.id === id)?.title ?? id;

  const [state, setState] = React.useState<State>(() => ({
    key: stackKey,
    layers: stack.map((id, i) => ({ id, slot: i, leaving: false })),
    snap: Object.fromEntries(
      stack.map((id) => [
        id,
        openAt === "highest" ? stopsFor(id).length - 1 : 0,
      ]),
    ),
    seq: 0,
    said: "",
  }));
  if (state.key !== stackKey) {
    // Sheets that left the stack stay as leaving layers until their exit
    // ends; new ones take a free slot on top.
    const kept = state.layers.filter((l) => stack.includes(l.id) && !l.leaving);
    const going = state.layers
      .filter((l) => !stack.includes(l.id) || l.leaving)
      .map((l) => ({ ...l, leaving: true }));
    const used = new Set([...kept, ...going].map((l) => l.slot));
    const added: Layer[] = [];
    for (const id of stack) {
      if (kept.some((l) => l.id === id)) continue;
      let slot = 0;
      while (used.has(slot) && slot < SLOTS) slot += 1;
      if (slot >= SLOTS) {
        // Out of slots: the oldest leaving sheet gives its up at once.
        const oldest = going.shift();
        if (!oldest) break;
        slot = oldest.slot;
      }
      used.add(slot);
      added.push({ id, slot, leaving: false });
    }
    const order = [
      ...stack
        .map((id) => [...kept, ...added].find((l) => l.id === id))
        .filter((l): l is Layer => !!l),
      ...going.filter((l) => !stack.includes(l.id)),
    ];
    const snap = { ...state.snap };
    for (const l of added) {
      snap[l.id] = openAt === "highest" ? stopsFor(l.id).length - 1 : 0;
    }
    const opened = added[added.length - 1];
    const closed = going.find(
      (l) => !state.layers.find((o) => o.id === l.id)?.leaving,
    );
    const stops = opened ? stopsFor(opened.id) : [];
    setState({
      key: stackKey,
      layers: order,
      snap,
      seq: state.seq + 1,
      said: opened
        ? `${titleOf(opened.id)}, ${stopName(stops[snap[opened.id] ?? 0] ?? 1).toLowerCase()}.`
        : closed
          ? `Closed ${titleOf(closed.id)}.`
          : state.said,
    });
  }
  const layers = state.layers;
  const topLive = [...layers].reverse().find((l) => !l.leaving) ?? null;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const observer = React.useRef<ResizeObserver | null>(null);
  const nodes = React.useRef(new Map<string, HTMLDivElement>());
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const returnTo = React.useRef(new Map<string, HTMLElement>());
  const exitSpeed = React.useRef(new Map<string, number>());
  /** Sheets that have risen (or been placed), and sheets on their way out. */
  const arrived = React.useRef(new Set<string>());
  const exiting = React.useRef(new Set<string>());
  const loud = React.useRef(false);
  const api = React.useRef<{
    measure: (w: number, h: number) => void;
    gone: (id: string) => void;
  } | null>(null);

  const ys = [
    useMotionValue(BELOW * 40),
    useMotionValue(BELOW * 40),
    useMotionValue(BELOW * 40),
    useMotionValue(BELOW * 40),
    useMotionValue(BELOW * 40),
    useMotionValue(BELOW * 40),
  ];
  const fades = [
    useMotionValue(1),
    useMotionValue(1),
    useMotionValue(1),
    useMotionValue(1),
    useMotionValue(1),
    useMotionValue(1),
  ];

  // The whole stack's look, per frame, from every sheet's height. Declared
  // before the layout effects that move the sheets, so each commit has it
  // listening again before they do.
  const frame = useTransform(ys, (all: number[]) => {
    const progress = (slot: number) =>
      H > 0 ? clamp((H - (all[slot] ?? closedY)) / sheetH, 0, 1.2) : 0;
    const out: Look[] = Array.from({ length: SLOTS + 1 }, () => ({
      scale: 1,
      y: 0,
      radius: 0,
      dim: 0,
    }));
    // Index SLOTS is the page; a sheet's look is by its slot.
    const order = layers.map((l) => l.slot);
    const above = (from: number) => {
      let d = 0;
      for (let i = from; i < order.length; i += 1) {
        d += progress(order[i] ?? 0);
      }
      return d;
    };
    const lookOf = (d: number, page: boolean): Look => {
      // A layer has fully stepped back once three quarters of it is
      // covered, so a sheet at half height already reads as a stack; each
      // further level steps it back again.
      const one = Math.min(d / 0.75, 1);
      const more = clamp(d - 1, 0, 2);
      const moves = motionSafe ? pushK : 0;
      return {
        scale: r4(1 - moves * 0.06 * (one + more)),
        y: r2(
          page ? moves * (16 * one - 6 * more) : -moves * (20 * one + 8 * more),
        ),
        radius: r2(page ? radius * one * pushK : 0),
        dim: r4(Math.min(0.9, dimK * one + dimK * 0.5 * Math.min(more, 1))),
      };
    };
    out[SLOTS] = lookOf(above(0), true);
    order.forEach((slot, i) => {
      out[slot] = lookOf(above(i + 1), false);
    });
    return out;
  });
  const pageLook = useLook(frame, SLOTS);
  const looks = [
    useLook(frame, 0),
    useLook(frame, 1),
    useLook(frame, 2),
    useLook(frame, 3),
    useLook(frame, 4),
    useLook(frame, 5),
  ];

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };

  /* ------------------------------ requests ------------------------------- */

  const request = (next: string[], visitor: boolean) => {
    if (disabled) return;
    const clean = valid(next);
    if (clean.join("\u0000") === stackKey) return;
    loud.current = visitor;
    if (clean.length > stack.length) {
      audio.play("swish", { pitch: 1.1, gain: 0.3 });
    } else {
      audio.play("swish", { pitch: 0.8, gain: 0.22 });
    }
    if (value === undefined) setOwn(clean);
    onValueChange?.(clean);
  };

  const control: PushSheetApi = {
    stack,
    open: (id) => {
      const at = stack.indexOf(id);
      request(at === -1 ? [...stack, id] : stack.slice(0, at + 1), true);
    },
    close: (id) => {
      if (id === undefined) {
        request(stack.slice(0, -1), true);
        return;
      }
      const at = stack.indexOf(id);
      if (at !== -1) request(stack.slice(0, at), true);
    },
    snapTo: (index) => {
      const topId = stack[stack.length - 1];
      if (topId) settle(topId, index, 0, true);
    },
  };

  /* ------------------------------- motion -------------------------------- */

  const layerOf = (id: string) => layers.find((l) => l.id === id);

  /** Brings a sheet to rest on stop `index`, carrying a release's speed. */
  const settle = (
    id: string,
    index: number,
    velocity: number,
    visitor: boolean,
    report = true,
  ) => {
    const layer = layerOf(id);
    if (!layer || H <= 0) return;
    const stops = stopsFor(id);
    const i = clamp(Math.round(index), 0, stops.length - 1);
    const f = stops[i] ?? 1;
    const target = yAt(f);
    const y = ys[layer.slot];
    if (!y) return;
    if (state.snap[id] !== i) {
      setState((s) => ({
        ...s,
        snap: { ...s.snap, [id]: i },
        said: `${titleOf(id)}, ${stopName(f).toLowerCase()}.`,
      }));
    }
    if (report) onSnapChange?.(id, f);
    if (!motionSafe) {
      run(
        `y${layer.slot}`,
        animate(y, target, { duration: durations.fast, ease: easings.enter }),
      );
      if (visitor)
        audio.play("thock", { pitch: lerp(1.1, 0.85, f), gain: 0.4 });
      return;
    }
    let landed = false;
    const speed = Math.abs(velocity);
    run(
      `y${layer.slot}`,
      animate(y, target, {
        ...springs.glide,
        velocity,
        onUpdate: (v) => {
          if (landed || Math.abs(v - target) > 1.5) return;
          landed = true;
          if (visitor) {
            audio.play("thock", {
              pitch: r2(lerp(1.1, 0.85, f)),
              gain: r2(Math.min(0.7, 0.3 + speed / 5000)),
            });
          }
        },
      }),
    );
  };

  /** Sends a sheet below the box: at the throw's speed, or on the exit ease. */
  const leave = (id: string, slot: number) => {
    const y = ys[slot];
    const fade = fades[slot];
    if (!y || !fade) return;
    const speed = exitSpeed.current.get(id) ?? 0;
    exitSpeed.current.delete(id);
    const done = () => api.current?.gone(id);
    if (!motionSafe) {
      run(
        `y${slot}`,
        animate(fade, 0, {
          duration: durations.base,
          ease: easings.exit,
          onComplete: done,
        }),
      );
      return;
    }
    const distance = Math.max(0, closedY - y.get());
    // A throw keeps its own speed (exits never spring); a press or a key
    // takes the exit ease.
    const transition =
      speed > 600
        ? {
            duration: clamp(distance / speed, 0.08, 0.32),
            ease: easings.linear,
          }
        : { duration: durations.slow * 0.75, ease: easings.exit };
    run(`y${slot}`, animate(y, closedY, { ...transition, onComplete: done }));
  };

  const gone = (id: string) => {
    // Only the exit's own bookkeeping: the same id may already have been
    // opened again on another slot, and that one has arrived.
    exiting.current.delete(id);
    setState((s) => ({
      ...s,
      layers: s.layers.filter((l) => !(l.id === id && l.leaving)),
    }));
  };

  const dismiss = (id: string, velocity: number) => {
    if (!dismissible || disabled) return;
    exitSpeed.current.set(id, Math.max(0, velocity));
    const at = stack.indexOf(id);
    if (at === -1) return;
    // Controlled: spring back to the stop now; if the host takes the close,
    // the exit carries on from wherever the spring has got to.
    if (value !== undefined) settle(id, state.snap[id] ?? 0, velocity, false);
    request(stack.slice(0, at), true);
  };

  /* ---------------------------- measurement ------------------------------ */

  const measure = (w: number, h: number) => {
    setBox((b) => (b && b.w === w && b.h === h ? b : { w, h }));
  };

  const bindRoot = (node: HTMLDivElement | null) => {
    if (rootRef.current === node) return;
    observer.current?.disconnect();
    observer.current = null;
    rootRef.current = node;
    if (!node || typeof ResizeObserver === "undefined") return;
    observer.current = new ResizeObserver(() =>
      api.current?.measure(node.clientWidth, node.clientHeight),
    );
    observer.current.observe(node);
  };

  React.useLayoutEffect(() => {
    api.current = { measure, gone };
  });

  React.useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    api.current?.measure(node.clientWidth, node.clientHeight);
    if (!observer.current && typeof ResizeObserver !== "undefined") {
      observer.current = new ResizeObserver(() =>
        api.current?.measure(node.clientWidth, node.clientHeight),
      );
      observer.current.observe(node);
    }
    const running = anims.current;
    return () => {
      observer.current?.disconnect();
      observer.current = null;
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  // Each change of the stack: new sheets rise, leaving ones go, focus moves.
  // Bookkept by id, so StrictMode's second run finds nothing left to start.
  React.useLayoutEffect(() => {
    if (H <= 0) return;
    const visitor = loud.current;
    loud.current = false;
    const root = rootRef.current;
    let restore: HTMLElement | undefined;
    for (const layer of layers) {
      const y = ys[layer.slot];
      const fade = fades[layer.slot];
      if (!y || !fade) continue;
      if (layer.leaving) {
        if (exiting.current.has(layer.id)) continue;
        exiting.current.add(layer.id);
        arrived.current.delete(layer.id);
        leave(layer.id, layer.slot);
        // Focus goes back to what opened the lowest sheet that closed.
        const back = returnTo.current.get(layer.id);
        returnTo.current.delete(layer.id);
        if (!restore && back?.isConnected) restore = back;
        continue;
      }
      exiting.current.delete(layer.id);
      if (arrived.current.has(layer.id)) continue;
      arrived.current.add(layer.id);
      const target = yAt(stopsFor(layer.id)[state.snap[layer.id] ?? 0] ?? 1);
      if (state.seq === 0) {
        // Open from the first render: simply there.
        y.jump(target);
        fade.jump(1);
        continue;
      }
      if (motionSafe) {
        fade.jump(1);
        y.jump(closedY);
        settle(layer.id, state.snap[layer.id] ?? 0, 0, visitor, false);
      } else {
        y.jump(target);
        fade.jump(0);
        run(
          `y${layer.slot}`,
          animate(fade, 1, { duration: durations.base, ease: easings.enter }),
        );
      }
      const node = nodes.current.get(layer.id);
      if (node && layer === topLive) {
        const opener = document.activeElement;
        if (opener instanceof HTMLElement && !node.contains(opener)) {
          returnTo.current.set(layer.id, opener);
        }
        const first =
          node
            .querySelector("[data-push-sheet-body]")
            ?.querySelector<HTMLElement>(TABBABLE) ??
          node.querySelector<HTMLElement>("[data-push-sheet-close]");
        first?.focus({ preventScroll: true });
      }
    }
    if (restore) {
      const at = document.activeElement;
      const lost = !at || at === document.body || !!root?.contains(at);
      if (lost) restore.focus({ preventScroll: true });
    }
    // One pass per change of the stack, or of the box's height.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.seq, H]);

  // A new height moves every open sheet to its stop at once.
  React.useLayoutEffect(() => {
    if (H <= 0) return;
    for (const layer of layers) {
      if (layer.leaving || !arrived.current.has(layer.id)) continue;
      const y = ys[layer.slot];
      if (!y) continue;
      halt(`y${layer.slot}`);
      y.jump(yAt(stopsFor(layer.id)[state.snap[layer.id] ?? 0] ?? 1));
    }
    // Only a change of height re-places resting sheets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [H]);

  /* ------------------------------- render -------------------------------- */

  const onTrap = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      if (!dismissible || !topLive) return;
      // Handled where focus is; the page must not see this Escape.
      event.preventDefault();
      event.stopPropagation();
      dismiss(topLive.id, 0);
      return;
    }
    if (event.key !== "Tab") return;
    const list = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(TABBABLE),
    ).filter((el) => el.offsetParent !== null);
    if (list.length === 0) {
      event.preventDefault();
      return;
    }
    const first = list[0];
    const last = list[list.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const covered = layers.some((l) => !l.leaving);
  const scrimZ = topLive ? 9 + layers.indexOf(topLive) * 2 : 0;

  return (
    <div
      ref={bindRoot}
      className={cn(
        "relative isolate w-full overflow-clip rounded-3",
        disabled && "opacity-60",
        className,
      )}
      style={
        {
          height,
          background: backdrop,
          "--push-sheet-w": `${Math.max(200, Math.round(width))}px`,
          "--push-sheet-r": `${Math.max(0, Math.round(radius))}px`,
        } as React.CSSProperties
      }
    >
      <motion.div
        aria-hidden={covered || undefined}
        inert={covered}
        className="absolute inset-0 overflow-clip bg-background"
        style={{
          scale: pageLook.scale,
          y: pageLook.y,
          borderRadius: pageLook.radius,
          transformOrigin: "50% 0%",
        }}
      >
        <div className="h-full [scrollbar-width:thin] overflow-y-auto overscroll-contain">
          <Slot render={children} api={control} />
        </div>
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-black"
          style={{ opacity: pageLook.dim }}
        />
      </motion.div>

      {topLive && dismissible ? (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ zIndex: scrimZ }}
          onPointerDown={() => dismiss(topLive.id, 0)}
        />
      ) : null}

      {box
        ? layers.map((layer, i) => {
            const item = sheets.find((s) => s.id === layer.id);
            const y = ys[layer.slot];
            const look = looks[layer.slot];
            const fade = fades[layer.slot];
            if (!item || !y || !look || !fade) return null;
            const stops = stopsFor(layer.id);
            return (
              <Sheet
                key={layer.id}
                item={item}
                api={control}
                stops={stops}
                snap={state.snap[layer.id] ?? 0}
                top={layer === topLive}
                leaving={layer.leaving}
                zIndex={10 + i * 2}
                y={y}
                look={look}
                opacity={fade}
                yAt={yAt}
                closedY={closedY}
                sheetH={sheetH}
                inset={gap}
                dismissible={dismissible}
                disabled={disabled}
                motionSafe={motionSafe}
                closeLabel={closeLabel}
                bind={(node) => {
                  if (node) nodes.current.set(layer.id, node);
                  else nodes.current.delete(layer.id);
                }}
                halt={() => halt(`y${layer.slot}`)}
                onSettle={(index, velocity) =>
                  settle(layer.id, index, velocity, true)
                }
                onDismiss={(velocity) => dismiss(layer.id, velocity)}
                onTrap={onTrap}
                onExpand={() => settle(layer.id, stops.length - 1, 0, false)}
              />
            );
          })
        : null}

      <p role="status" className="sr-only">
        <span key={state.seq}>{state.said}</span>
      </p>
    </div>
  );
}
