"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Stage footprint, px — fixed regardless of content. */
const STAGE_W = 220;
const STAGE_H = 180;

/** Cabinet body placement within the stage. */
const CASE_LEFT = 36;
const CASE_TOP = 26;
const CASE_W = 108;
/** Roof and side-wall depth, px — the iso "thickness" of the case. */
const SIDE_D = 20;

/** Vertical rhythm of the front face: lip, three drawers, two reveal gaps, a toe-kick. */
const DRAWER_H = 30;
const GAP = 4;
const TOP_LIP = 6;
const TOEKICK_H = 12;
const CASE_H = TOP_LIP + DRAWER_H * 3 + GAP * 2 + TOEKICK_H;

const DRAWER1_TOP = TOP_LIP;
const DRAWER2_TOP = DRAWER1_TOP + DRAWER_H + GAP;
const DRAWER3_TOP = DRAWER2_TOP + DRAWER_H + GAP;
const TOEKICK_TOP = DRAWER3_TOP + DRAWER_H;

const HANDLE_W = 22;
const HANDLE_H = 5;

/** Loop open offset, along the iso axis (2:1 slope, matching the roof rhombus). */
const OPEN_DX = 26;
const OPEN_DY = 13;
/** Extra hover extension, same axis. */
const EXTRA_DX = 12;
const EXTRA_DY = 6;

/** Loop dwell times, ms — closed hold and open hold (~5s per full cycle). */
const HOLD_CLOSED_MS = 1800;
const HOLD_OPEN_MS = 2700;

/**
 * Flat, unskewed front face; the roof and side wall fake the recession as
 * shear parallelograms. Each panel's own box is padded by SIDE_D beyond the
 * case so the shifted edge has room to land inside it — clip-path can only
 * carve within an element's own box, never past it — and the two panels'
 * far corners meet exactly, verified by hand: both resolve to the same
 * point relative to the case.
 */
const ROOF_CLIP = `polygon(0 100%, ${SIDE_D}px 0, 100% 0, ${CASE_W}px 100%)`;
const SIDE_CLIP = `polygon(0 ${SIDE_D}px, 100% 0, 100% ${CASE_H}px, 0 100%)`;

const FRONT_TINT =
  "color-mix(in oklab, var(--color-surface-2) 76%, var(--ink) 24%)";
const ROOF_TINT =
  "color-mix(in oklab, var(--color-surface-2) 92%, var(--ink) 8%)";
const SIDE_TINT =
  "color-mix(in oklab, var(--color-surface-2) 52%, var(--ink) 48%)";
const DRAWER_TINT =
  "color-mix(in oklab, var(--color-surface-2) 86%, var(--ink) 14%)";
const TOEKICK_TINT =
  "color-mix(in oklab, var(--color-surface-2) 58%, var(--ink) 42%)";
const CAVITY_TINT =
  "color-mix(in oklab, var(--color-surface-2) 38%, var(--ink) 62%)";
const HANDLE_TINT =
  "color-mix(in oklab, var(--ink) 58%, var(--color-surface-2) 42%)";
const FLOOR_TINT = "color-mix(in oklab, var(--ink) 35%, transparent)";

type DrawerPhase = "closed" | "open";

export type VignetteEmptyDrawerProps = {
  label?: string;
  className?: string;
};

/** A closed drawer front with a centered handle — drawers two and three. */
function DrawerBand({ top }: { top: number }) {
  return (
    <span
      className="absolute left-0 rounded-[2px] border border-hairline"
      style={{ top, width: CASE_W, height: DRAWER_H, background: DRAWER_TINT }}
    >
      <span
        className="absolute -translate-y-1/2 rounded-full"
        style={{
          left: (CASE_W - HANDLE_W) / 2,
          top: "50%",
          width: HANDLE_W,
          height: HANDLE_H,
          background: HANDLE_TINT,
        }}
      />
    </span>
  );
}

/**
 * The illustration for an empty archive: an isometric filing cabinet whose
 * top drawer is bare, springing open on a self-running loop to reveal a
 * dashed outline where folders would sit and a small mono "empty" tag —
 * then sliding shut again. The loop runs off chained timeouts on one
 * shared clock, never Date.now, pausing off-screen and in hidden tabs and
 * resuming from a rebased remaining time so it never jumps. Hovering the
 * wrapper pulls an open drawer out a little further, or opens a closed one
 * right away.
 *
 * Reduced motion: the drawer renders open at rest with the tag visible and
 * nothing moving.
 */
export function VignetteEmptyDrawer({
  label = "An empty archive drawer",
  className,
}: VignetteEmptyDrawerProps) {
  const motionSafe = useMotionSafe();
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const timerRef = React.useRef<number | null>(null);
  const tickRef = React.useRef<() => void>(() => {});

  const [phase, setPhase] = React.useState<DrawerPhase>("closed");
  const [hovering, setHovering] = React.useState(false);

  const x = useMotionValue<number>(0);
  const y = useMotionValue<number>(0);

  // The loop: chained timeouts on one clock. An IntersectionObserver and
  // visibilitychange pause it off-screen and in hidden tabs; resuming
  // re-arms only the remaining time, so the clock never jumps.
  React.useEffect(() => {
    if (!motionSafe) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    let phaseNow: DrawerPhase = "closed";
    let remaining = HOLD_CLOSED_MS;
    let deadline = 0;
    let running = false;
    let onscreen = false;
    let docVisible = document.visibilityState === "visible";

    const clear = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const arm = (ms: number) => {
      clear();
      deadline = performance.now() + ms;
      running = true;
      timerRef.current = window.setTimeout(() => tickRef.current(), ms);
    };

    const pause = () => {
      if (!running) return;
      remaining = Math.max(0, deadline - performance.now());
      clear();
      running = false;
    };

    const sync = () => {
      const shouldRun = onscreen && docVisible;
      if (shouldRun && !running) arm(remaining);
      else if (!shouldRun && running) pause();
    };

    // Re-scheduled only through tickRef, never by calling itself directly.
    const advance = () => {
      phaseNow = phaseNow === "closed" ? "open" : "closed";
      remaining = phaseNow === "closed" ? HOLD_CLOSED_MS : HOLD_OPEN_MS;
      setPhase(phaseNow);
      arm(remaining);
    };
    tickRef.current = advance;

    const intersection = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) onscreen = last.isIntersecting;
      sync();
    });
    intersection.observe(wrapper);

    const onVisibility = () => {
      docVisible = document.visibilityState === "visible";
      sync();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clear();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [motionSafe]);

  // The drawer's position: set-then-animate toward whatever the loop phase
  // and hover state imply — snap outward, glide back to fully closed.
  React.useEffect(() => {
    if (!motionSafe) {
      x.set(OPEN_DX);
      y.set(OPEN_DY);
      return;
    }
    const targetOpen = phase === "open" || hovering;
    const targetX = targetOpen ? OPEN_DX + (hovering ? EXTRA_DX : 0) : 0;
    const targetY = targetOpen ? OPEN_DY + (hovering ? EXTRA_DY : 0) : 0;
    const spring = targetOpen ? springs.snap : springs.glide;
    const animX = animate(x, targetX, spring);
    const animY = animate(y, targetY, spring);
    return () => {
      animX.stop();
      animY.stop();
    };
  }, [motionSafe, phase, hovering, x, y]);

  const tagVisible = !motionSafe || phase === "open" || hovering;
  const tagBright = motionSafe && hovering;

  return (
    <div
      ref={wrapperRef}
      role="img"
      aria-label={label}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      className={cn("w-full max-w-xs", className)}
    >
      <div
        aria-hidden
        className="relative mx-auto"
        style={{ width: STAGE_W, height: STAGE_H }}
      >
        {/* Floor shadow. */}
        <span
          className="absolute rounded-full blur-[6px]"
          style={{
            left: CASE_LEFT - 12,
            top: CASE_TOP + CASE_H + 4,
            width: CASE_W + SIDE_D + 24,
            height: 14,
            background: FLOOR_TINT,
            opacity: 0.55,
          }}
        />

        {/* The cabinet body. */}
        <div
          className="absolute"
          style={{
            left: CASE_LEFT,
            top: CASE_TOP,
            width: CASE_W,
            height: CASE_H,
            background: FRONT_TINT,
          }}
        >
          {/* Roof — its far corner meets the side wall's far corner exactly. */}
          <span
            className="absolute left-0"
            style={{
              top: -SIDE_D,
              width: CASE_W + SIDE_D,
              height: SIDE_D,
              background: ROOF_TINT,
              clipPath: ROOF_CLIP,
            }}
          />
          {/* Side wall. */}
          <span
            className="absolute"
            style={{
              left: CASE_W,
              top: -SIDE_D,
              width: SIDE_D,
              height: CASE_H + SIDE_D,
              background: SIDE_TINT,
              clipPath: SIDE_CLIP,
            }}
          />

          <DrawerBand top={DRAWER2_TOP} />
          <DrawerBand top={DRAWER3_TOP} />

          {/* Toe-kick. */}
          <span
            className="absolute left-0"
            style={{
              top: TOEKICK_TOP,
              width: CASE_W,
              height: TOEKICK_H,
              background: TOEKICK_TINT,
            }}
          />

          {/* The empty interior, waiting behind the drawer face. */}
          <div
            className="absolute left-0"
            style={{
              top: DRAWER1_TOP,
              width: CASE_W,
              height: DRAWER_H,
              background: CAVITY_TINT,
              zIndex: 1,
            }}
          >
            <span
              className="absolute rounded-[2px] border border-dashed border-hairline-strong opacity-40"
              style={{ left: 6, right: 6, top: 4, bottom: 4 }}
            />
            <span
              className="absolute -translate-y-1/2 rounded-full border border-hairline bg-surface-0/80 px-1.5 py-0.5 font-mono text-[8px] tracking-[0.06em] transition-all duration-150"
              style={{
                right: 6,
                top: "50%",
                opacity: tagVisible ? 1 : 0,
                color: tagBright ? "var(--ink)" : "var(--ink-3)",
              }}
            >
              empty
            </span>
          </div>

          {/* The top drawer face — slides out along the iso axis. */}
          <motion.div
            className="absolute left-0 rounded-[2px] border border-hairline"
            style={{
              top: DRAWER1_TOP,
              width: CASE_W,
              height: DRAWER_H,
              background: DRAWER_TINT,
              zIndex: 3,
              x,
              y,
            }}
          >
            <span
              className="absolute -translate-y-1/2 rounded-full"
              style={{
                left: (CASE_W - HANDLE_W) / 2,
                top: "50%",
                width: HANDLE_W,
                height: HANDLE_H,
                background: HANDLE_TINT,
              }}
            />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
