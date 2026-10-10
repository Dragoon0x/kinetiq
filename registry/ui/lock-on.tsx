"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type LockOnColor = "cobalt" | "signal" | "amber" | "ink";

export type LockOnProps = {
  /** Length of each bracket's arms, in px. @default 10 */
  corner?: number;
  /** How fast the idle reticle turns, in degrees per second; travel adds a little more. @default 40 */
  spin?: number;
  /** The reticle's colour: a named tone or any CSS colour. @default "cobalt" */
  color?: LockOnColor | (string & {});
  /** The idle reticle's size, in px. @default 32 */
  size?: number;
  /** Space between a locked target and its frame, in px. @default 6 */
  padding?: number;
  /** Bracket stroke width, in px. @default 2 */
  thickness?: number;
  /** The house spring the idle reticle trails the pointer on. @default "snap" */
  follow?: "flick" | "snap" | "glide";
  /** What the reticle locks onto, as a CSS selector; disabled controls never lock. @default interactive elements */
  targets?: string;
  /** Hide the system cursor inside the container while a mouse is there (text fields keep theirs). @default true */
  hideCursor?: boolean;
  /** Flash the frame when it locks. @default true */
  flash?: boolean;
  /** Show a hotspot dot exactly under the pointer. @default true */
  dot?: boolean;
  /** With nobody pointing, rest the frame dimly on the first target (or one marked `data-lock-home`). @default true */
  rest?: boolean;
  /** Play a tick when the reticle locks. Off unless asked for. @default false */
  sound?: boolean;
  /** Turn the reticle off and give the cursor back. @default false */
  disabled?: boolean;
  /** Called with the element the reticle locks onto, and with null when it lets go. */
  onLock?: (target: HTMLElement | null) => void;
  /** Classes for the container. */
  className?: string;
  /** The content the reticle roams over; it keeps every click, focus and key. */
  children?: React.ReactNode;
};

const TONES: Record<LockOnColor, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  amber: "var(--warn)",
  ink: "var(--foreground)",
};

const DEFAULT_TARGETS = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "[role='button']",
  "[role='link']",
  "[role='tab']",
  "[role='switch']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='slider']",
  "[tabindex]:not([tabindex='-1'])",
  "[data-lock-target]",
].join(", ");

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
/** An angle folded into [-45, 45): a square looks the same a quarter turn on. */
const fold = (deg: number) => ((((deg + 45) % 90) + 90) % 90) - 45;

const usable = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLElement &&
  !el.matches(":disabled, [aria-disabled='true'], [inert] *");

type Frame = { cx: number; cy: number; w: number; h: number };

function Bracket({
  k,
  cx,
  cy,
  w,
  h,
  turn,
  corner,
  thickness,
}: {
  k: 0 | 1 | 2 | 3;
  cx: MotionValue<number>;
  cy: MotionValue<number>;
  w: MotionValue<number>;
  h: MotionValue<number>;
  turn: MotionValue<number>;
  corner: number;
  thickness: number;
}) {
  // Each bracket is the same top-left L, turned a quarter more per corner,
  // with its vertex on the frame's corner after the frame's own rotation.
  const sx = k === 0 || k === 3 ? -1 : 1;
  const sy = k < 2 ? -1 : 1;
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useMotionValue(k * 90);
  // Placed from this part's own subscription rather than a combined
  // transform: StrictMode's rehearsal remount cancels a combined value's
  // pending update, and a re-set of an unchanged source never re-sends it.
  React.useEffect(() => {
    const place = () => {
      const t = turn.get();
      const a = (t * Math.PI) / 180;
      const vx = (sx * w.get()) / 2;
      const vy = (sy * h.get()) / 2;
      x.set(r2(cx.get() + vx * Math.cos(a) - vy * Math.sin(a)));
      y.set(r2(cy.get() + vx * Math.sin(a) + vy * Math.cos(a)));
      rotate.set(r2(t + k * 90));
    };
    place();
    const off = [cx, cy, w, h, turn].map((v) => v.on("change", place));
    return () => {
      for (const unsubscribe of off) unsubscribe();
    };
  }, [cx, cy, h, k, rotate, sx, sy, turn, w, x, y]);
  return (
    <motion.span
      className="absolute top-0 left-0 rounded-tl-[1px] border-current"
      style={{
        width: corner,
        height: corner,
        borderTopWidth: thickness,
        borderLeftWidth: thickness,
        x,
        y,
        rotate,
        originX: "0%",
        originY: "0%",
      }}
    />
  );
}

/**
 * A target cursor bounded to the container it wraps. Inside, the system
 * cursor gives way to a hotspot dot that sits exactly under the pointer and
 * a reticle of four corner brackets that trails it on a house spring and
 * turns slowly, a little faster while it travels. When the pointer reaches
 * an interactive child, the brackets leave it and snap outward to frame that
 * child on springs.snap while the rotation unwinds to square, with a flash
 * and a tick; leaving the child releases them back to the pointer on
 * springs.glide. Keyboard focus locks the same way, and the system cursor
 * comes back while the keyboard is in use.
 *
 * The reticle is aria-hidden and never takes a click, focus or key from the
 * content. Under reduced motion nothing spins or springs: the reticle follows
 * the dot exactly and a lock jumps onto its target with a short fade.
 */
export function LockOn({
  corner = 10,
  spin = 40,
  color = "cobalt",
  size = 32,
  padding = 6,
  thickness = 2,
  follow = "snap",
  targets = DEFAULT_TARGETS,
  hideCursor = true,
  flash = true,
  dot = true,
  rest = true,
  sound = false,
  disabled = false,
  onLock,
  className,
  children,
}: LockOnProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [cursorHidden, setCursorHidden] = React.useState(false);

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const cx = useMotionValue(0);
  const cy = useMotionValue(0);
  const w = useMotionValue(size);
  const h = useMotionValue(size);
  const turn = useMotionValue(0);
  const shown = useMotionValue(0);
  const dotShown = useMotionValue(0);
  const flashLevel = useMotionValue(0);

  const tone = TONES[color as LockOnColor] ?? color;

  const params = React.useRef({
    spin,
    size,
    padding,
    follow,
    targets,
    hideCursor,
    flash,
    rest,
    disabled,
    motionSafe,
    audio,
    onLock,
  });
  React.useEffect(() => {
    params.current = {
      spin,
      size,
      padding,
      follow,
      targets,
      hideCursor,
      flash,
      rest,
      disabled,
      motionSafe,
      audio,
      onLock,
    };
  });
  const api = React.useRef<{ refresh: () => void } | null>(null);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let raf = 0;
    let last = 0;
    let inView = true;
    let inside = false;
    let keyboard = false;
    let locked: HTMLElement | null = null;
    let resting: HTMLElement | null = null;
    let running: AnimationPlaybackControls[] = [];
    let lastPoint = { x: 0, y: 0 };
    // Where the locked frame is headed, so a scroll or resize that changes
    // nothing never interrupts the lock's own spring.
    let aim: Frame | null = null;
    let targetSizer: ResizeObserver | null = null;

    const stop = () => {
      for (const c of running) c.stop();
      running = [];
    };

    const frameOf = (el: HTMLElement): Frame => {
      const box = root.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const pad = Math.max(0, params.current.padding);
      // The frame stays inside the container, so a control at its edge keeps
      // all four brackets.
      const left = clamp(r.left - box.left - pad, 0, box.width);
      const top = clamp(r.top - box.top - pad, 0, box.height);
      const right = clamp(r.right - box.left + pad, 0, box.width);
      const bottom = clamp(r.bottom - box.top + pad, 0, box.height);
      return {
        cx: r2((left + right) / 2),
        cy: r2((top + bottom) / 2),
        w: r2(Math.max(4, right - left)),
        h: r2(Math.max(4, bottom - top)),
      };
    };

    const moveFrame = (
      f: Frame,
      spring: (typeof springs)[keyof typeof springs] | null,
      toTurn: number | null,
    ) => {
      stop();
      if (!spring || !params.current.motionSafe) {
        cx.set(f.cx);
        cy.set(f.cy);
        w.set(f.w);
        h.set(f.h);
        if (toTurn !== null) turn.set(toTurn);
        return;
      }
      running = [
        animate(cx, f.cx, spring),
        animate(cy, f.cy, spring),
        animate(w, f.w, spring),
        animate(h, f.h, spring),
      ];
      if (toTurn !== null) running.push(animate(turn, toTurn, spring));
    };

    const show = (target: MotionValue<number>, on: boolean) => {
      if (target.get() === (on ? 1 : 0) && !target.isAnimating()) return;
      animate(
        target,
        on ? 1 : 0,
        on ? { duration: durations.fast, ease: easings.enter } : exitFor(),
      );
    };

    const canSpin = () =>
      inside &&
      !locked &&
      !keyboard &&
      params.current.spin > 0 &&
      params.current.motionSafe &&
      !params.current.disabled &&
      inView &&
      !document.hidden;

    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const next = turn.get() + params.current.spin * dt;
      // Folding is only invisible while the reticle is square.
      turn.set(r2(Math.abs(w.get() - h.get()) < 0.5 ? fold(next) : next));
      if (canSpin()) raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (raf || !canSpin()) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const halt = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const homeTarget = () => {
      const p = params.current;
      const marked = root.querySelector("[data-lock-home]");
      if (usable(marked)) return marked;
      for (const el of root.querySelectorAll(p.targets)) {
        if (usable(el) && el !== root) return el;
      }
      return null;
    };

    // Nobody pointing, nothing focused: the frame rests dimly on the home
    // target, so the piece shows what it does before anyone touches it.
    const settleRest = (animated: boolean) => {
      const p = params.current;
      if (inside || locked || p.disabled || !p.rest) {
        resting = null;
        if (!inside && !locked) show(shown, false);
        return;
      }
      resting = homeTarget();
      if (!resting) {
        show(shown, false);
        return;
      }
      moveFrame(frameOf(resting), animated ? springs.glide : null, 0);
      animate(shown, 0.45, { duration: durations.base, ease: easings.enter });
    };

    const lock = (el: HTMLElement, quiet = false) => {
      const p = params.current;
      if (locked === el && !quiet) return;
      const fresh = locked !== el;
      locked = el;
      resting = null;
      if (fresh) {
        // The frame follows its target if the target itself changes size.
        targetSizer?.disconnect();
        targetSizer?.observe(el);
      }
      halt();
      const f = frameOf(el);
      if (
        quiet &&
        aim &&
        Math.abs(f.cx - aim.cx) +
          Math.abs(f.cy - aim.cy) +
          Math.abs(f.w - aim.w) +
          Math.abs(f.h - aim.h) <
          0.5
      ) {
        return;
      }
      aim = f;
      // A square reticle looks the same a quarter turn on, so the unwind
      // starts from the nearest square angle and never spins the long way.
      if (Math.abs(w.get() - h.get()) < 0.5) turn.jump(fold(turn.get()));
      moveFrame(f, quiet ? springs.flick : springs.snap, 0);
      show(shown, true);
      if (!fresh || quiet) return;
      if (!p.motionSafe) {
        shown.jump(0);
        animate(shown, 1, { duration: durations.base, ease: easings.enter });
      }
      if (p.flash) {
        flashLevel.jump(1);
        animate(flashLevel, 0, {
          duration: durations.slow,
          ease: easings.exit,
        });
      }
      // A tick answers the visitor: never before the page has had a click,
      // tap or key, since a hover alone is not one.
      if (navigator.userActivation?.hasBeenActive ?? false) {
        const r = el.getBoundingClientRect();
        p.audio.play("tick", {
          pitch: clamp(1.45 - r.width / 420, 0.7, 1.45),
          gain: 0.45,
          pan: panFrom(r.left + r.width / 2, null),
        });
      }
      p.onLock?.(el);
    };

    /** Let go of the target: back to the pointer, or to rest when it has gone. */
    const release = (toRest = false) => {
      if (!locked) return;
      locked = null;
      aim = null;
      targetSizer?.disconnect();
      params.current.onLock?.(null);
      if (inside && !toRest) {
        const s = params.current.size;
        moveFrame(
          { cx: px.get(), cy: py.get(), w: s, h: s },
          springs.glide,
          null,
        );
        wake();
      } else {
        settleRest(true);
      }
    };

    const targetAt = (node: EventTarget | null) => {
      if (!(node instanceof Element)) return null;
      const el = node.closest(params.current.targets);
      if (!el || el === root || !root.contains(el)) return null;
      return usable(el) ? el : null;
    };

    const syncCursor = () =>
      setCursorHidden(
        inside &&
          !keyboard &&
          params.current.hideCursor &&
          !params.current.disabled,
      );

    const onMove = (event: PointerEvent) => {
      const p = params.current;
      if (p.disabled || event.pointerType === "touch") return;
      const box = root.getBoundingClientRect();
      const x = r2(event.clientX - box.left);
      const y = r2(event.clientY - box.top);
      const arriving = !inside;
      if (arriving || keyboard) {
        inside = true;
        keyboard = false;
        syncCursor();
      }
      px.set(x);
      py.set(y);
      show(dotShown, true);
      const el = targetAt(event.target);
      if (el) {
        lock(el);
      } else {
        if (locked) release();
        if (arriving && !locked) {
          // Arriving, the reticle appears where the pointer is rather than
          // flying in from where it rested.
          stop();
          cx.jump(x);
          cy.jump(y);
          w.jump(p.size);
          h.jump(p.size);
          show(shown, true);
        } else if (!locked) {
          show(shown, true);
          const travel = Math.hypot(x - lastPoint.x, y - lastPoint.y);
          if (p.motionSafe) {
            // The reticle rolls along a little as it travels.
            turn.set(r2(turn.get() + Math.min(travel, 40) * 0.12));
            const spring = springs[p.follow] ?? springs.snap;
            running = [animate(cx, x, spring), animate(cy, y, spring)];
          } else {
            cx.set(x);
            cy.set(y);
          }
        }
      }
      lastPoint = { x, y };
      wake();
    };

    const onLeave = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      inside = false;
      syncCursor();
      show(dotShown, false);
      halt();
      const active = document.activeElement;
      if (keyboard && active instanceof HTMLElement && root.contains(active)) {
        return;
      }
      if (locked) release(true);
      else settleRest(true);
    };

    const onFocusIn = (event: FocusEvent) => {
      if (params.current.disabled) return;
      const el = targetAt(event.target);
      if (!el || !el.matches(":focus-visible")) return;
      keyboard = true;
      syncCursor();
      show(dotShown, false);
      lock(el);
    };

    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && root.contains(next)) return;
      if (!keyboard) return;
      keyboard = false;
      syncCursor();
      if (inside) release();
      else if (locked) release(true);
      else settleRest(true);
    };

    // Keys mean the keyboard is in use: the system cursor comes back.
    const onKey = () => {
      if (keyboard || !inside) return;
      keyboard = true;
      syncCursor();
    };

    const follow = () => {
      if (locked && locked.isConnected) lock(locked, true);
      else if (locked) release();
      else if (resting) settleRest(false);
    };

    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerenter", onMove);
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    root.addEventListener("keydown", onKey);
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    const sizer = new ResizeObserver(follow);
    sizer.observe(root);
    targetSizer = new ResizeObserver(follow);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (inView) wake();
      else halt();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (document.hidden) halt();
      else wake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    api.current = {
      refresh: () => {
        if (params.current.disabled) {
          inside = false;
          keyboard = false;
          if (locked) {
            locked = null;
            aim = null;
            targetSizer?.disconnect();
            params.current.onLock?.(null);
          }
          syncCursor();
          show(shown, false);
          show(dotShown, false);
          halt();
          return;
        }
        syncCursor();
        if (locked) lock(locked, true);
        else if (!inside) settleRest(false);
        wake();
      },
    };
    settleRest(false);

    return () => {
      halt();
      stop();
      sizer.disconnect();
      targetSizer?.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("scroll", follow, { capture: true });
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerenter", onMove);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      root.removeEventListener("keydown", onKey);
      api.current = null;
    };
  }, [cx, cy, dotShown, flashLevel, h, px, py, shown, turn, w]);

  React.useEffect(() => {
    api.current?.refresh();
  }, [disabled, rest, padding, size, targets, hideCursor, spin, motionSafe]);

  const flashOpacity = useTransform(flashLevel, (f) => r2(f * 0.16));
  const flashX = useMotionValue(0);
  const flashY = useMotionValue(0);
  React.useEffect(() => {
    const place = () => {
      flashX.set(r2(cx.get() - w.get() / 2));
      flashY.set(r2(cy.get() - h.get() / 2));
    };
    place();
    const off = [cx, cy, w, h].map((v) => v.on("change", place));
    return () => {
      for (const unsubscribe of off) unsubscribe();
    };
  }, [cx, cy, flashX, flashY, h, w]);
  const dotX = useTransform(px, (v) => r2(v - 2.5));
  const dotY = useTransform(py, (v) => r2(v - 2.5));
  const stroke = Math.max(1, thickness);
  const arm = Math.max(stroke * 2, corner);

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative",
        cursorHidden &&
          "cursor-none [&_*]:cursor-none [&_input]:cursor-text [&_textarea]:cursor-text",
        className,
      )}
    >
      {children}
      {/* The colour sits on a plain wrapper: a changed `color` tweak is then
          React's to apply, not a static style motion might keep. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-clip"
        style={{ color: tone }}
      >
        <motion.div className="absolute inset-0" style={{ opacity: shown }}>
          <motion.span
            className="absolute top-0 left-0 rounded-1 bg-current"
            style={{
              x: flashX,
              y: flashY,
              width: w,
              height: h,
              rotate: turn,
              opacity: flashOpacity,
            }}
          />
          {([0, 1, 2, 3] as const).map((k) => (
            <Bracket
              key={k}
              k={k}
              cx={cx}
              cy={cy}
              w={w}
              h={h}
              turn={turn}
              corner={arm}
              thickness={stroke}
            />
          ))}
          {dot ? (
            <motion.span
              className="absolute top-0 left-0 size-[5px] rounded-full bg-current"
              style={{ x: dotX, y: dotY, opacity: dotShown }}
            />
          ) : null}
        </motion.div>
      </div>
    </div>
  );
}
