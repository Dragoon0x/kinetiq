"use client";

import * as React from "react";

import { motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LodestoneRelease = "recoil" | "snap" | "glide";
export type LodestoneAxis = "both" | "x" | "y";

export type LodestoneProps = {
  /** What the lodestone pulls: a button, an icon, a card. It keeps its own role, focus and clicks. */
  children: React.ReactNode;
  /** How far the pull reaches beyond the child's own edges, in CSS pixels. @default 72 */
  radius?: number;
  /** How much of the pointer's offset from the child's centre it follows, 0 to 1. @default 0.35 */
  strength?: number;
  /** How far it tilts toward the pointer at most, in degrees: the nearest side rises toward it. @default 8 */
  tilt?: number;
  /** The most it travels, in CSS pixels; the pull eases into this cap rather than hitting it. @default 12 */
  limit?: number;
  /** How far keyboard focus lifts it, in CSS pixels, while holding it steady. @default 3 */
  lift?: number;
  /** The shadow that falls away from the pull and deepens with the lift, 0 (none) to 1. @default 0.5 */
  shadow?: number;
  /** The spring it snaps home on when the pointer leaves the field. @default "recoil" */
  release?: LodestoneRelease;
  /** Which way it may travel. @default "both" */
  axis?: LodestoneAxis;
  /** A press seats it: back toward the centre and down a little, until release. @default true */
  pressable?: boolean;
  /** The pointer pulls it (mouse and pen; touch gets the resting state). @default true */
  interactive?: boolean;
  /** No pull, no tilt, no press; it rests. @default false */
  disabled?: boolean;
  /** Fires when the pointer enters or leaves the field, with whether it is now pulled. */
  onPullChange?: (pulled: boolean) => void;
  /** The wrapper's element: a div, or a span for inline use. @default "div" */
  as?: "div" | "span";
  /** Classes for the still outer box (its layout never moves). */
  className?: string;
  /** Classes for the moving inner layer. */
  innerClassName?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** The follow spring sits between glide and snap: quick, but no overshoot. */
const FOLLOW = { stiffness: 420, damping: 37, mass: 1 };

type Spring = { stiffness: number; damping: number; mass: number };
type Axis = { v: number; vel: number; to: number };

const stepAxis = (a: Axis, s: Spring, dt: number) => {
  a.vel += ((-s.stiffness * (a.v - a.to) - s.damping * a.vel) / s.mass) * dt;
  a.v += a.vel * dt;
};
const restless = (a: Axis, eps: number) =>
  Math.abs(a.v - a.to) > eps || Math.abs(a.vel) > eps * 10;

/**
 * A magnetic wrapper. Its outer box never moves — the pointer is measured
 * against a still frame, so the pull can never chase itself — while an inner
 * layer leans toward the pointer once it comes within `radius` of the
 * child's own edges: it follows `strength` of the pointer's offset — most
 * when the pointer is close, less toward the field's edge — eased into a
 * `limit` (tanh), and tilts up to `tilt` degrees in perspective so the side
 * nearest the pointer rises toward it, all on a spring between glide and
 * snap integrated per frame. Past `radius × 1.12` the bond breaks and it snaps home on the
 * `release` spring (springs.recoil by default: two visible bounces), keeping
 * the velocity it had. A press seats it on springs.flick; keyboard focus
 * holds it steady and lifts it `lift` px on springs.snap; a drop shadow falls
 * away from the pull and deepens with the lift. Under reduced motion it
 * stays put, and focus shows as a shadow alone.
 */
export function Lodestone({
  children,
  radius = 72,
  strength = 0.35,
  tilt = 8,
  limit = 12,
  lift = 3,
  shadow = 0.5,
  release = "recoil",
  axis = "both",
  pressable = true,
  interactive = true,
  disabled = false,
  onPullChange,
  as = "div",
  className,
  innerClassName,
}: LodestoneProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLElement | null>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const scale = useMotionValue(1);
  const filter = useMotionValue("none");

  const params = React.useRef({
    radius,
    strength,
    tilt,
    limit,
    lift,
    shadow,
    release,
    axis,
    pressable,
    interactive,
    disabled,
    motionSafe,
    onPullChange,
  });
  React.useEffect(() => {
    params.current = {
      radius,
      strength,
      tilt,
      limit,
      lift,
      shadow,
      release,
      axis,
      pressable,
      interactive,
      disabled,
      motionSafe,
      onPullChange,
    };
  });

  const api = React.useRef<{
    focus: (on: boolean) => void;
    press: (on: boolean) => void;
    rest: () => void;
  } | null>(null);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let raf = 0;
    let last = 0;
    let inView = false;
    let listening = false;
    let pulled = false;
    let focused = false;
    let pressed = false;
    let mode: "follow" | "release" = "release";
    const px: Axis = { v: 0, vel: 0, to: 0 };
    const py: Axis = { v: 0, vel: 0, to: 0 };
    const rx: Axis = { v: 0, vel: 0, to: 0 };
    const ry: Axis = { v: 0, vel: 0, to: 0 };
    const up: Axis = { v: 0, vel: 0, to: 0 };
    const seat: Axis = { v: 0, vel: 0, to: 0 };
    const axes = [px, py, rx, ry, up, seat];
    // The pull as last measured, before focus or a press shape it.
    const pull = { x: 0, y: 0, rx: 0, ry: 0 };

    const aim = () => {
      const hold = focused ? 0 : pressed ? 0.3 : 1;
      px.to = pull.x * hold;
      py.to = pull.y * hold;
      rx.to = pull.rx * (focused ? 0 : pressed ? 0.4 : 1);
      ry.to = pull.ry * (focused ? 0 : pressed ? 0.4 : 1);
      up.to = focused ? 1 : 0;
      seat.to = pressed ? 1 : 0;
    };

    const write = () => {
      const p = params.current;
      const liftPx = clamp(p.lift, 0, 24);
      x.set(r2(px.v));
      y.set(r2(py.v - up.v * liftPx));
      rotateX.set(r2(rx.v));
      rotateY.set(r2(ry.v));
      scale.set(r3(1 + up.v * 0.02 - seat.v * 0.03));
      const strengthOf = clamp(p.shadow, 0, 1);
      const reach = Math.min(1, Math.hypot(px.v, py.v) / Math.max(1, p.limit));
      const depth = clamp(reach * 0.8 + up.v, 0, 1.4);
      if (strengthOf <= 0 || depth < 0.01) {
        filter.set("none");
        return;
      }
      // Light from above and in front: the shadow falls away from the pull.
      const sx = r2(-px.v * 0.3);
      const sy = r2(2 + depth * 4 - py.v * 0.3);
      const blur = r2(4 + depth * 10);
      const alpha = r3(strengthOf * 0.32 * Math.min(1, depth));
      filter.set(
        `drop-shadow(${sx}px ${sy}px ${blur}px rgb(0 0 0 / ${alpha}))`,
      );
    };

    const step = (dt: number) => {
      const p = params.current;
      const back =
        p.release === "snap"
          ? springs.snap
          : p.release === "glide"
            ? springs.glide
            : springs.recoil;
      const s = mode === "follow" && !focused ? FOLLOW : back;
      stepAxis(px, s, dt);
      stepAxis(py, s, dt);
      stepAxis(rx, s, dt);
      stepAxis(ry, s, dt);
      stepAxis(up, springs.snap, dt);
      stepAxis(seat, springs.flick, dt);
    };

    const busy = () =>
      restless(px, 0.05) ||
      restless(py, 0.05) ||
      restless(rx, 0.02) ||
      restless(ry, 0.02) ||
      restless(up, 0.002) ||
      restless(seat, 0.002);

    const frame = (now: number) => {
      raf = 0;
      if (!inView || document.hidden) {
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      let t = dt;
      while (t > 1e-6) {
        const d = Math.min(t, 1 / 120);
        step(d);
        t -= d;
      }
      write();
      if (busy()) {
        raf = requestAnimationFrame(frame);
      } else {
        for (const a of axes) {
          a.v = a.to;
          a.vel = 0;
        }
        write();
        last = 0;
      }
    };

    const wake = () => {
      const p = params.current;
      aim();
      if (!p.motionSafe) {
        // Reduced motion: nothing travels; focus is told by the shadow.
        for (const a of axes) {
          a.v = 0;
          a.vel = 0;
        }
        x.set(0);
        y.set(0);
        rotateX.set(0);
        rotateY.set(0);
        scale.set(1);
        const a = r3(clamp(p.shadow, 0, 1) * 0.32);
        filter.set(
          focused && a > 0
            ? `drop-shadow(0px 4px 10px rgb(0 0 0 / ${a}))`
            : "none",
        );
        return;
      }
      if (raf || !inView || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };

    const setPulled = (next: boolean) => {
      if (pulled === next) return;
      pulled = next;
      mode = next ? "follow" : "release";
      params.current.onPullChange?.(next);
    };

    const onMove = (event: PointerEvent) => {
      const p = params.current;
      if (event.pointerType === "touch") return;
      if (!p.interactive || p.disabled || !p.motionSafe) return;
      const r = root.getBoundingClientRect();
      const hw = r.width / 2;
      const hh = r.height / 2;
      const dx = event.clientX - (r.left + hw);
      const dy = event.clientY - (r.top + hh);
      const ex = Math.max(0, Math.abs(dx) - hw);
      const ey = Math.max(0, Math.abs(dy) - hh);
      const edge = Math.hypot(ex, ey);
      const field = Math.max(1, p.radius);
      // Hysteresis: it engages at the radius and lets go a little past it,
      // so a pointer resting on the boundary never makes it chatter.
      const inside = pulled ? edge <= field * 1.12 : edge <= field;
      setPulled(inside);
      if (inside) {
        // Strongest close in, still holding at the field's edge, so the
        // let-go has something to snap back from.
        const near = 1 - 0.6 * Math.min(1, edge / field) ** 1.5;
        const k0 = clamp(p.strength, 0, 1) * near;
        let ox = p.axis === "y" ? 0 : dx * k0;
        let oy = p.axis === "x" ? 0 : dy * k0;
        const d = Math.hypot(ox, oy);
        const cap = Math.max(1, p.limit);
        if (d > 0) {
          const k = (cap * Math.tanh(d / cap)) / d;
          ox *= k;
          oy *= k;
        }
        const tl = clamp(p.tilt, 0, 45);
        pull.x = ox;
        pull.y = oy;
        pull.rx = r2(tl * clamp(dy / (hh + field), -1, 1));
        pull.ry = r2(-tl * clamp(dx / (hw + field), -1, 1));
      } else {
        pull.x = pull.y = pull.rx = pull.ry = 0;
      }
      wake();
    };
    const onOut = (event: PointerEvent) => {
      // The pointer left the window: the bond breaks.
      if (event.relatedTarget) return;
      pull.x = pull.y = pull.rx = pull.ry = 0;
      setPulled(false);
      wake();
    };
    const onUp = () => {
      if (!pressed) return;
      pressed = false;
      wake();
    };

    const listen = (on: boolean) => {
      if (on === listening) return;
      listening = on;
      if (on) {
        document.addEventListener("pointermove", onMove, { passive: true });
        document.addEventListener("pointerout", onOut, { passive: true });
      } else {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerout", onOut);
      }
    };
    document.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointercancel", onUp, { passive: true });

    api.current = {
      focus: (on) => {
        focused = on;
        wake();
      },
      press: (on) => {
        const p = params.current;
        if (!p.pressable || p.disabled || !p.motionSafe) return;
        pressed = on;
        wake();
      },
      rest: () => {
        const p = params.current;
        if (p.disabled || !p.interactive || !p.motionSafe) {
          pull.x = pull.y = pull.rx = pull.ry = 0;
          setPulled(false);
          pressed = false;
        }
        listen(inView && p.interactive && !p.disabled && p.motionSafe);
        wake();
      },
    };

    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      const p = params.current;
      listen(inView && p.interactive && !p.disabled && p.motionSafe);
      if (!inView) {
        pull.x = pull.y = pull.rx = pull.ry = 0;
        setPulled(false);
      }
      wake();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      listen(false);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.removeEventListener("visibilitychange", onVisibility);
      watcher.disconnect();
      api.current = null;
    };
  }, [x, y, rotateX, rotateY, scale, filter]);

  React.useEffect(() => {
    api.current?.rest();
  }, [interactive, disabled, motionSafe, release, shadow, lift]);

  const setRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
  }, []);
  const Outer = as === "span" ? "span" : "div";
  const Inner = as === "span" ? motion.span : motion.div;

  return (
    <Outer
      ref={setRoot}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if (event.pointerType === "touch") return;
        api.current?.press(true);
      }}
      onFocus={(event) => {
        if ((event.target as HTMLElement).matches(":focus-visible")) {
          api.current?.focus(true);
        }
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && rootRef.current?.contains(next)) return;
        api.current?.focus(false);
      }}
      className={cn("relative inline-flex", className)}
    >
      <Inner
        className={cn("inline-flex", innerClassName)}
        style={{
          x,
          y,
          rotateX,
          rotateY,
          scale,
          filter,
          transformPerspective: 600,
        }}
      >
        {children}
      </Inner>
    </Outer>
  );
}
