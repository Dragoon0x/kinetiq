"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound, type LoopHandle } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type EdgePeekSide = "left" | "right";
export type EdgePeekPull = "soft" | "firm";

export type EdgePeekProps = {
  /** The panel's name: the handle's and the panel's accessible name, and its heading. */
  label: string;
  /** What the panel holds. */
  panel: React.ReactNode;
  /** The surface the panel is tucked into. */
  children?: React.ReactNode;
  /** How far from the edge, in px, the handle starts to notice the pointer. @default 160 */
  reach?: number;
  /** How far the handle leans out at its closest, in px; past its own width it pulls the panel's edge out too. @default 24 */
  lean?: number;
  /** Which edge the panel lives on. @default "right" */
  side?: EdgePeekSide;
  /** Soft follows lazily and opens on a glide; firm answers at once and snaps open. @default "soft" */
  pull?: EdgePeekPull;
  /** Panel width in px, capped to the surface width less 56. @default 220 */
  panelWidth?: number;
  /** Controlled open state. */
  open?: boolean;
  /** Initial open state when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires from the press, drag, key or tint press that changed it. */
  onOpenChange?: (open: boolean) => void;
  /** Play the lean hum, the opening whoosh and the closing clack. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  /** Classes for the surface frame; the host sizes it. */
  className?: string;
};

/** The handle: width, height, and how much of it shows at rest. */
const HANDLE_W = 20;
const HANDLE_H = 64;
const SLIVER = 6;
/** On touch, a first tap this close to the edge leans the handle out. */
const TOUCH_EDGE = 32;
/** The panel never takes more of the surface than this leaves. */
const MARGIN = 56;

const FEEL = {
  soft: { lean: springs.drift, open: springs.glide },
  firm: { lean: springs.snap, open: springs.snap },
} as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** A hover sound waits for the page's first press, so hovering never wakes audio. */
const activated = () =>
  typeof navigator === "undefined" || !("userActivation" in navigator)
    ? true
    : navigator.userActivation.hasBeenActive;

/**
 * A side panel tucked into the edge of a surface, whose handle leans out as
 * the pointer comes near. Distance from the edge is mapped continuously to a
 * lean (a smoothstep over `reach`, the pointer's height off the handle
 * counted at half weight) and the lean is sprung, so the handle drifts out as
 * you approach and settles back as you leave. Past its own width the lean
 * starts pulling the panel's edge out behind it: close enough, the panel peeks.
 *
 * One number drives the geometry — how far the handle's outer edge stands
 * from the surface edge — and everything derives from it: the handle rides
 * the panel's edge, the panel follows once the handle is fully out, the tint
 * over the surface deepens as the panel opens. A press on the handle opens it
 * on the pull spring; the handle can also be dragged 1:1, rubber-bands at both
 * ends and commits by projection with its release velocity. A press on the
 * tint, the handle again, or Escape closes it on an exit tween.
 *
 * The handle is a real button with `aria-expanded`; keyboard focus leans it
 * out exactly as a near pointer does, Enter or Space opens the same way a
 * press does, Escape closes and returns focus to the handle. The panel is a
 * labelled region, inert while closed. On touch a first tap at the edge leans
 * the handle out and the second opens. Under reduced motion nothing travels:
 * the handle sits fully out, proximity only brightens it, and the panel
 * cross-fades in and out in place.
 */
export function EdgePeek({
  label,
  panel,
  children,
  reach = 160,
  lean = 24,
  side = "right",
  pull = "soft",
  panelWidth = 220,
  open,
  defaultOpen = false,
  onOpenChange,
  sound = false,
  disabled = false,
  className,
}: EdgePeekProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const panelId = React.useId();
  const feel = FEEL[pull] ?? FEEL.soft;
  const dir = side === "left" ? 1 : -1;

  const [own, setOwn] = React.useState(defaultOpen);
  const isOpen = open ?? own;

  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const [surfaceWidth, setSurfaceWidth] = React.useState<number | null>(null);
  const width = Math.max(
    HANDLE_W * 4,
    Math.round(
      Math.min(panelWidth, (surfaceWidth ?? panelWidth + MARGIN) - MARGIN),
    ),
  );
  const openAt = width + HANDLE_W;

  // Where the handle's outer edge stands from the surface edge when not
  // leaning: SLIVER tucked, `openAt` open. The lean is a floor under it.
  const extent = useMotionValue(isOpen ? openAt : SLIVER);
  const near = useMotionValue(0);
  // The panel's opacity: 1 under full motion, the whole transition under
  // reduced motion.
  const fade = useMotionValue(isOpen ? 1 : 0);

  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const dragging = React.useRef(false);
  const dragStart = React.useRef(0);
  const closing = React.useRef(false);
  // Which way the last settle went, and which settle is current: a stale
  // completion from a superseded one must never move the panel.
  const settled = React.useRef(isOpen);
  const seq = React.useRef(0);
  const armed = React.useRef(false);
  const keyFocus = React.useRef(false);
  const hum = React.useRef<LoopHandle | null>(null);
  const humAt = React.useRef(-Infinity);
  const pillRef = React.useRef<HTMLButtonElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setSurfaceWidth(Math.round(root.offsetWidth)),
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [root]);

  const pan = side === "left" ? -0.5 : 0.5;

  const stopHum = React.useCallback(() => {
    hum.current?.stop();
    hum.current = null;
  }, []);

  // The hook stops its loops when sound goes off; forget the handle with it.
  React.useEffect(() => {
    if (!sound) hum.current = null;
  }, [sound]);

  /**
   * Leans the handle toward `target` (0 tucked, 1 fully out). Under reduced
   * motion the value still moves — it drives the handle's tint — but on a
   * short tween, and nothing it drives travels.
   */
  const aim = (target: number, fromPointer: boolean) => {
    const t = disabled ? 0 : target;
    animate(
      near,
      t,
      motionSafe
        ? feel.lean
        : { duration: durations.fast, ease: easings.enter },
    );
    if (!fromPointer || !sound) return;
    // The hum is the hover made audible: it lives only while a pointer is
    // inside the reach, and its level and pitch are the lean.
    if (t > 0.04 && !isOpen) {
      const level = { gain: r3(0.35 * t), pitch: r3(0.8 + 0.5 * t), pan };
      if (hum.current) {
        hum.current.set(level);
      } else {
        const now = performance.now();
        if (now - humAt.current > 150 && activated()) {
          humAt.current = now;
          hum.current = audio.start("hum", level);
        }
      }
    } else {
      stopHum();
    }
  };

  const halt = React.useCallback(() => {
    for (const c of running.current) c.stop();
    running.current = [];
  }, []);

  const settle = React.useCallback(
    (to: boolean, velocity = 0) => {
      halt();
      const token = ++seq.current;
      const was = settled.current;
      settled.current = to;
      if (to) {
        closing.current = false;
        armed.current = false;
        stopHum();
        animate(near, 0, feel.lean);
        if (!was) audio.play("whoosh", { pitch: 1, gain: 0.4, pan });
      } else {
        // Only a panel that is actually out can land home.
        closing.current = motionSafe
          ? extent.get() > SLIVER + 0.5
          : fade.get() > 0.01;
        // Closed with keyboard focus still on the handle (Escape, Enter):
        // focus leans it out, the same as when it arrived there.
        if (keyFocus.current && !disabled) {
          animate(
            near,
            1,
            motionSafe
              ? feel.lean
              : { duration: durations.fast, ease: easings.enter },
          );
        }
      }
      if (!motionSafe) {
        if (to) {
          extent.set(openAt);
          running.current = [
            animate(fade, 1, { duration: durations.fast, ease: easings.enter }),
          ];
        } else {
          running.current = [
            animate(fade, 0, {
              ...exitFor(durations.fast),
              onComplete: () => {
                if (seq.current === token) extent.set(SLIVER);
              },
            }),
          ];
        }
        return;
      }
      fade.set(1);
      const target = to ? openAt : SLIVER;
      // Opening, and any release with a throw behind it, rides the pull
      // spring with the hand's velocity; a plain close is an exit and
      // accelerates home instead.
      running.current = [
        to || velocity !== 0
          ? animate(extent, target, { ...feel.open, velocity })
          : animate(extent, target, exitFor(durations.slow)),
      ];
    },
    [
      audio,
      disabled,
      extent,
      fade,
      feel,
      halt,
      motionSafe,
      near,
      openAt,
      pan,
      stopHum,
    ],
  );

  // The clack belongs to the frame the panel lands home, whatever brought it
  // there — a press, a throw, a host, Escape.
  useMotionValueEvent(extent, "change", (v) => {
    if (closing.current && v <= SLIVER + 0.5) {
      closing.current = false;
      audio.play("clack", { pitch: 1, gain: 0.35, pan });
    }
  });

  // A host that changes `open` gets the same slide a press would.
  const shown = React.useRef(isOpen);
  React.useEffect(() => {
    if (shown.current === isOpen) return;
    shown.current = isOpen;
    if (!dragging.current) settle(isOpen);
  }, [isOpen, settle]);

  // A new width moves the open rest position; an open panel goes straight there.
  React.useEffect(() => {
    if (shown.current && !dragging.current) extent.set(openAt);
  }, [extent, openAt]);

  React.useEffect(() => halt, [halt]);

  const commit = (next: boolean, velocity = 0) => {
    if (next === isOpen) {
      settle(next, velocity);
      return;
    }
    if (open === undefined) {
      setOwn(next);
      shown.current = next;
      settle(next, velocity);
    } else {
      // Controlled: go back to where the host says it is; the effect above
      // carries the panel across once the host answers.
      settle(isOpen, velocity);
    }
    onOpenChange?.(next);
  };

  const close = () => {
    // Focus inside a panel about to turn inert would be dropped on the page.
    if (panelRef.current?.contains(document.activeElement)) {
      pillRef.current?.focus();
    }
    commit(false);
  };

  const leanOut = (e: number, n: number) =>
    motionSafe ? Math.max(e, SLIVER + lean * n) : Math.max(e, HANDLE_W);

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: () => {
      dragging.current = true;
      if (!motionSafe) return;
      halt();
      stopHum();
      // Take over from wherever the lean had it, so nothing jumps.
      dragStart.current = leanOut(extent.get(), near.get());
      extent.set(dragStart.current);
      near.set(0);
    },
    onMove: ({ offset }) => {
      if (!motionSafe) return;
      extent.set(
        r2(
          rubberClamp(
            dragStart.current + dir * offset.x,
            SLIVER,
            openAt,
            openAt,
          ),
        ),
      );
    },
    onEnd: ({ offset, velocity }) => {
      dragging.current = false;
      if (!motionSafe) {
        // Nothing follows the hand under reduced motion; a clear pull one
        // way or the other still opens or closes it.
        const pulled = dir * offset.x;
        if (Math.abs(pulled) > 24) commit(pulled > 0);
        return;
      }
      const v = dir * velocity.x;
      const landing = project(extent.get(), v, 0.99);
      commit(landing > (SLIVER + openAt) / 2, v);
    },
    onCancel: () => {
      dragging.current = false;
      settle(isOpen);
    },
    onTap: (event) => {
      // Touch has no hover: the first tap leans the handle out, as a near
      // pointer would; the second opens.
      if (event.pointerType !== "mouse" && !isOpen && !armed.current) {
        armed.current = true;
        aim(1, false);
        return;
      }
      commit(!isOpen);
    },
  });

  const out = useTransform([extent, near] as MotionValue<number>[], ([e, n]) =>
    leanOut(e as number, n as number),
  );
  const panelX = useTransform(out, (o) => {
    const shownPx = Math.max(0, o - HANDLE_W);
    return r2(dir * (shownPx - width));
  });
  // The button (the hit box) never leaves the surface: at rest it sits flush
  // inside the edge and only its visual pill slides out, clipped to the
  // sliver. Touch aims at a target's centre, and a button mostly outside
  // the surface was being aimed past the edge; this keeps the whole handle
  // width tappable. Once the lean passes the handle's width both move.
  const pillX = useTransform(out, (o) =>
    r2(dir * Math.max(0, Math.max(SLIVER, o) - HANDLE_W)),
  );
  const faceX = useTransform(out, (o) =>
    r2(dir * Math.min(0, Math.max(SLIVER, o) - HANDLE_W)),
  );
  const openness = useTransform(out, (o) =>
    clamp01((o - SLIVER) / (openAt - SLIVER)),
  );
  const turn = useTransform(openness, (p) => Math.round(p * 180));
  const glow = useTransform(
    [near, openness] as MotionValue<number>[],
    ([n, p]) => Math.round(22 + 78 * Math.max(n as number, p as number)),
  );
  const pillFill = useTransform(
    glow,
    (g) => `color-mix(in oklch, var(--accent) ${g}%, var(--bg-2))`,
  );
  const pillInk = useTransform(
    glow,
    (g) => `color-mix(in oklch, var(--primary-foreground) ${g}%, var(--ink-2))`,
  );
  const tint = useTransform([out, fade] as MotionValue<number>[], ([o, f]) =>
    motionSafe
      ? r3(clamp01(((o as number) - HANDLE_W - 40) / (width - 40)) * 0.55)
      : r3((f as number) * 0.55),
  );
  const panelOpacity = useTransform(fade, (f) => (motionSafe ? 1 : r3(f)));

  return (
    <div
      ref={setRoot}
      className={cn(
        "relative isolate overflow-clip [contain:paint]",
        className,
      )}
      onPointerMove={(event) => {
        if (
          event.pointerType === "touch" ||
          isOpen ||
          dragging.current ||
          !root
        ) {
          return;
        }
        const r = root.getBoundingClientRect();
        const sx = (root.offsetWidth > 0 ? r.width / root.offsetWidth : 1) || 1;
        const sy =
          (root.offsetHeight > 0 ? r.height / root.offsetHeight : 1) || 1;
        const dx =
          (side === "left" ? event.clientX - r.left : r.right - event.clientX) /
          sx;
        const dy = Math.max(
          0,
          Math.abs(event.clientY - (r.top + r.height / 2)) / sy - HANDLE_H / 2,
        );
        const t = clamp01(1 - Math.hypot(dx, dy * 0.5) / Math.max(1, reach));
        aim(keyFocus.current ? 1 : t * t * (3 - 2 * t), true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        stopHum();
        if (!isOpen) aim(keyFocus.current ? 1 : 0, false);
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" || isOpen || disabled || !root)
          return;
        if (pillRef.current?.contains(event.target as Node)) return;
        const r = root.getBoundingClientRect();
        const dx =
          side === "left" ? event.clientX - r.left : r.right - event.clientX;
        if (dx <= TOUCH_EDGE) {
          armed.current = true;
          aim(1, false);
        } else if (armed.current) {
          armed.current = false;
          aim(0, false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !isOpen || event.defaultPrevented) return;
        event.preventDefault();
        close();
      }}
    >
      {children}
      <motion.div
        aria-hidden
        onClick={() => {
          if (isOpen) close();
        }}
        className={cn(
          "absolute inset-0 z-10 bg-background",
          isOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        style={{ opacity: tint }}
      />
      <motion.button
        ref={pillRef}
        type="button"
        aria-label={label}
        aria-expanded={isOpen}
        aria-controls={panelId}
        disabled={disabled}
        onFocus={(event) => {
          let byKeyboard = true;
          try {
            byKeyboard = event.currentTarget.matches(":focus-visible");
          } catch {
            // Without :focus-visible every focus counts as keyboard.
          }
          if (!byKeyboard) return;
          keyFocus.current = true;
          if (!isOpen) aim(1, false);
        }}
        onBlur={() => {
          keyFocus.current = false;
          if (!isOpen) aim(0, false);
        }}
        onClick={(event) => {
          // Pointer presses arrive through the drag's tap; a click with no
          // pointer behind it (Enter, Space, assistive tech) is a press too.
          if (event.detail === 0) commit(!isOpen);
        }}
        {...drag}
        className={cn(
          "absolute top-[calc(50%-2rem)] z-30 flex h-16 w-5 cursor-pointer touch-pan-y items-center justify-center outline-none select-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          side === "left" ? "left-0 rounded-r-3" : "right-0 rounded-l-3",
        )}
        style={{ x: pillX }}
      >
        <motion.span
          aria-hidden
          className={cn(
            // Not a hit target: only the button, which never leaves the
            // surface, may catch a touch — a face shifted past the edge
            // would pull touch retargeting past it too.
            "pointer-events-none absolute inset-0 border border-hairline-strong",
            side === "left"
              ? "rounded-r-3 border-l-0"
              : "rounded-l-3 border-r-0",
          )}
          style={{ x: faceX, backgroundColor: pillFill }}
        />
        <motion.span
          aria-hidden
          className="pointer-events-none relative flex size-3 shrink-0"
          style={{ x: faceX, rotate: turn, color: pillInk }}
        >
          <svg viewBox="0 0 12 12" className="size-3">
            <path
              d={
                side === "left"
                  ? "M4.5 2.5 8 6l-3.5 3.5"
                  : "M7.5 2.5 4 6l3.5 3.5"
              }
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </motion.span>
      </motion.button>
      <motion.div
        ref={panelRef}
        id={panelId}
        role="region"
        aria-label={label}
        inert={!isOpen}
        className={cn(
          "absolute inset-y-0 z-20 flex flex-col gap-3 overflow-y-auto bg-popover p-3 text-popover-foreground",
          side === "left"
            ? "left-0 border-r border-hairline-strong"
            : "right-0 border-l border-hairline-strong",
        )}
        style={{ width, x: panelX, opacity: panelOpacity }}
      >
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {label}
        </p>
        {panel}
      </motion.div>
    </div>
  );
}
