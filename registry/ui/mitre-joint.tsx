"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type MitreJointProfile = "flat" | "cove" | "gilt";
export type MitreJointGlow = "gold" | "accent" | "frost" | "ember";
export type MitreJointTrigger = "inView" | "mount" | "manual";

export type MitreJointProps = {
  /** The content inside the frame. It keeps its own semantics and focus. */
  children?: React.ReactNode;
  /** The moulding's profile: a flat lacquered rail, a walnut cove, or gilt with beads. @default "gilt" */
  profile?: MitreJointProfile;
  /** The moulding's width, px, 6 to 28. @default 14 */
  bevel?: number;
  /** The light that runs along the bevel once the corners meet: a preset or any CSS colour. @default "gold" */
  glow?: MitreJointGlow | (string & {});
  /** The moulding's colour; any CSS colour. @default by profile: the page's ink, walnut, or gold leaf */
  color?: string;
  /** When the frame assembles: the first time it is seen, at mount, or only when `assembled` says so. @default "inView" */
  trigger?: MitreJointTrigger;
  /** Controls the frame: true slides the lengths in, false takes them apart. Leave undefined to let `trigger` decide. */
  assembled?: boolean;
  /** Assemble only the first time it comes into view; false assembles again on every return. @default true */
  once?: boolean;
  /** Wait before the first length moves, ms. @default 0 */
  delay?: number;
  /** Time between the four lengths setting off, ms, 0 to 150. @default 60 */
  stagger?: number;
  /** Fires when the last corner clicks home. */
  onAssembled?: () => void;
  /** How far hover or focus inside lifts the frame, px, 0 to 6. @default 2 */
  lift?: number;
  /** Strength of the highlight that follows the pointer along the moulding, 0 to 1. @default 0.6 */
  highlight?: number;
  /** The quiet sheen the glow settles to, 0 to 1. @default 0.5 */
  sheen?: number;
  /** Hover and focus lift the frame and move its light. @default true */
  interactive?: boolean;
  /** Play the click when the corners meet, if the visitor's own action assembled it. Off unless asked for. @default false */
  sound?: boolean;
  /** Classes for the root (width, margins). */
  className?: string;
  /** Classes for the opening that holds the content (padding, background). */
  contentClassName?: string;
};

const GLOWS: Record<MitreJointGlow, string> = {
  gold: "oklch(0.92 0.12 88)",
  accent: "var(--accent-bright)",
  frost: "oklch(0.95 0.035 230)",
  ember: "oklch(0.78 0.16 42)",
};

const MOULDING: Record<MitreJointProfile, string> = {
  flat: "color-mix(in oklab, var(--foreground) 82%, var(--background))",
  cove: "oklch(0.46 0.07 52)",
  gilt: "oklch(0.76 0.115 84)",
};

/** Each profile across the moulding's width: [fraction of the bevel, shade]. Shade > 0 mixes white, < 0 black. */
const PROFILES: Record<MitreJointProfile, [number, number][]> = {
  flat: [
    [0, 0.2],
    [0.08, 0],
    [0.82, 0],
    [0.85, -0.24],
    [0.9, 0.1],
    [1, -0.32],
  ],
  cove: [
    [0, 0.22],
    [0.1, 0],
    [0.42, -0.4],
    [0.7, 0.08],
    [0.82, 0.26],
    [0.9, 0],
    [1, -0.36],
  ],
  gilt: [
    [0, -0.3],
    [0.06, 0.36],
    [0.16, -0.16],
    [0.22, 0],
    [0.45, 0.24],
    [0.6, 0],
    [0.72, -0.32],
    [0.84, 0.16],
    [0.9, 0.42],
    [0.95, -0.2],
    [1, -0.46],
  ],
};

type Side = "top" | "right" | "bottom" | "left";
const SIDES: Side[] = ["top", "right", "bottom", "left"];

const B = "var(--mitre-b)";
const CLIPS: Record<Side, string> = {
  top: `polygon(0 0, 100% 0, calc(100% - ${B}) ${B}, ${B} ${B})`,
  right: `polygon(100% 0, 100% 100%, calc(100% - ${B}) calc(100% - ${B}), calc(100% - ${B}) ${B})`,
  bottom: `polygon(0 100%, ${B} calc(100% - ${B}), calc(100% - ${B}) calc(100% - ${B}), 100% 100%)`,
  left: `polygon(0 0, ${B} ${B}, ${B} calc(100% - ${B}), 0 100%)`,
};
/** The whole moulding as one ring: the outer box less the opening. */
const RING = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${B} ${B}, ${B} calc(100% - ${B}), calc(100% - ${B}) calc(100% - ${B}), calc(100% - ${B}) ${B}, ${B} ${B})`;
const TOWARD: Record<Side, string> = {
  top: "to bottom",
  right: "to left",
  bottom: "to top",
  left: "to right",
};
/** Which way each length faces, for the light. */
const NORMAL: Record<Side, [number, number]> = {
  top: [0, -1],
  right: [1, 0],
  bottom: [0, 1],
  left: [-1, 0],
};
/** Resting light: from the upper left. */
const REST: [number, number] = [-0.55, -0.83];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const shadeOf = (colour: string, k: number) =>
  k === 0
    ? colour
    : `color-mix(in oklab, ${colour} ${Math.round((1 - Math.abs(k)) * 100)}%, ${k > 0 ? "white" : "black"})`;

function profileGradient(
  profile: MitreJointProfile,
  side: Side,
  colour: string,
  bevel: number,
): string {
  const stops = (PROFILES[profile] ?? PROFILES.gilt)
    .map(([at, k]) => `${shadeOf(colour, k)} ${r2(at * bevel)}px`)
    .join(", ");
  return `linear-gradient(${TOWARD[side]}, ${stops})`;
}

/** The gilt's bead-and-reel: a fine rhythm along the outer bead only. */
function beadLayer(
  side: Side,
  bevel: number,
): {
  image: string;
  size: string;
  position: string;
} {
  const along = side === "top" || side === "bottom" ? "90deg" : "0deg";
  const band = r2(bevel * 0.12);
  const from = r2(bevel * 0.05);
  const image = `repeating-linear-gradient(${along}, transparent 0 3px, oklch(0 0 0 / 0.2) 3px 4px, oklch(1 0 0 / 0.18) 4px 5px, transparent 5px 7px)`;
  if (side === "top")
    return { image, size: `100% ${band}px`, position: `0 ${from}px` };
  if (side === "bottom")
    return {
      image,
      size: `100% ${band}px`,
      position: `0 calc(100% - ${from}px)`,
    };
  if (side === "left")
    return { image, size: `${band}px 100%`, position: `${from}px 0` };
  return {
    image,
    size: `${band}px 100%`,
    position: `calc(100% - ${from}px) 0`,
  };
}

/** Did the visitor just act (a click or key within the last few seconds)? */
const visitorActive = () =>
  typeof navigator !== "undefined" &&
  Boolean(
    (navigator as Navigator & { userActivation?: { isActive: boolean } })
      .userActivation?.isActive,
  );

type Phase = "out" | "moving" | "seated";

/** One length's light: its facing against the light direction, as a tint. */
function useSideLight(
  side: Side,
  lx: MotionValue<number>,
  ly: MotionValue<number>,
) {
  const [nx, ny] = NORMAL[side];
  return useTransform([lx, ly] as MotionValue<number>[], ([x, y]) => {
    const d = nx * (x as number) + ny * (y as number);
    return d >= 0
      ? `oklch(1 0 0 / ${r3(d * 0.2)})`
      : `oklch(0 0 0 / ${r3(-d * 0.26)})`;
  });
}

/**
 * A border for any content, built like a picture frame: four lengths of
 * moulding with mitred ends, each shaded across its own width by the
 * profile, so a real seam shows where two meet. The first time it is seen the
 * lengths slide in from beyond their edges on the glide spring, a few
 * milliseconds apart; when the last one seats the corners click (the frame
 * settles on the flick spring and the seams flash), and a crisp glow runs
 * once round the bevel — two heads leaving the top-left corner and meeting at
 * the bottom-right — before it settles to a quiet sheen.
 *
 * Hover, or keyboard focus inside the content, lifts the frame a fraction on
 * glide and turns the light toward the pointer: the lengths facing it
 * brighten, the far ones fall into shade, and a highlight slides along the
 * moulding under the pointer. Every painted layer is aria-hidden and ignores
 * the pointer, so the content keeps all of its own behaviour. Under reduced
 * motion the frame fades in already assembled and nothing lifts; the light
 * still follows the pointer.
 */
export function MitreJoint({
  children,
  profile = "gilt",
  bevel = 14,
  glow = "gold",
  color,
  trigger = "inView",
  assembled,
  once = true,
  delay = 0,
  stagger = 60,
  onAssembled,
  lift = 2,
  highlight = 0.6,
  sheen = 0.5,
  interactive = true,
  sound = false,
  className,
  contentClassName,
}: MitreJointProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const b = Math.round(clamp(bevel, 6, 28));
  const up = clamp(lift, 0, 6);
  const pad = Math.ceil(up) + 4;
  const moulding = color ?? MOULDING[profile] ?? MOULDING.gilt;
  const light =
    typeof glow === "string" && glow in GLOWS
      ? GLOWS[glow as MitreJointGlow]
      : glow;
  const away = b + pad + 6;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const phase = React.useRef<Phase>("out");
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const seen = React.useRef(false);
  const assembledRef = React.useRef(assembled);
  React.useEffect(() => {
    assembledRef.current = assembled;
  });
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  const [run, setRun] = React.useState(0);

  // Each length's offset from home along its own normal, px.
  const top = useMotionValue(away);
  const right = useMotionValue(away);
  const bottom = useMotionValue(away);
  const left = useMotionValue(away);
  const offsets: Record<Side, MotionValue<number>> = {
    top,
    right,
    bottom,
    left,
  };
  const topY = useTransform(top, (v) => -v);
  const leftX = useTransform(left, (v) => -v);
  const shift: Record<
    Side,
    { x?: MotionValue<number>; y?: MotionValue<number> }
  > = {
    top: { y: topY },
    right: { x: right },
    bottom: { y: bottom },
    left: { x: leftX },
  };
  const frameOpacity = useMotionValue(1);
  const seat = useMotionValue(1);
  const seams = useMotionValue(0);
  const sheenOpacity = useMotionValue(0);
  const runProgress = useMotionValue(0);
  const runOpacity = useMotionValue(0);
  const flash = useMotionValue(0);

  // The light: a direction (toward the light) and the highlight's place.
  const lxRaw = useMotionValue(REST[0]);
  const lyRaw = useMotionValue(REST[1]);
  const lxSpring = useSpring(lxRaw, springs.glide);
  const lySpring = useSpring(lyRaw, springs.glide);
  const mxRaw = useMotionValue(0);
  const myRaw = useMotionValue(0);
  const mxSpring = useSpring(mxRaw, springs.glide);
  const mySpring = useSpring(myRaw, springs.glide);
  const lx = motionSafe ? lxSpring : lxRaw;
  const ly = motionSafe ? lySpring : lyRaw;
  const mx = motionSafe ? mxSpring : mxRaw;
  const my = motionSafe ? mySpring : myRaw;
  const spot = useMotionValue(0);
  const raised = useMotionValue(0);
  const raisedY = useTransform(raised, (v) => r2(-v * up));
  const shadow = useTransform(
    raised,
    (v) =>
      `0 ${r2(1 + v * up)}px ${r2(2 + v * up * 1.6)}px -1px oklch(0 0 0 / ${r3(0.18 + v * 0.16)})`,
  );
  const spotImage = useMotionTemplate`radial-gradient(circle ${Math.round(b * 3.2)}px at ${mx}px ${my}px, ${light}, transparent 70%)`;

  const sideLights = {
    top: useSideLight("top", lx, ly),
    right: useSideLight("right", lx, ly),
    bottom: useSideLight("bottom", lx, ly),
    left: useSideLight("left", lx, ly),
  };

  const halt = React.useCallback(() => {
    for (const c of running.current) c.stop();
    running.current = [];
  }, []);

  const latest = React.useRef({
    motionSafe,
    away,
    delay,
    stagger,
    sheen,
    onAssembled,
    audio,
    profile,
  });
  React.useEffect(() => {
    latest.current = {
      motionSafe,
      away,
      delay,
      stagger,
      sheen,
      onAssembled,
      audio,
      profile,
    };
  });

  /** The corners meet: a click, a settle, the seams flash, then the glow runs. */
  const seatHome = React.useCallback(
    (visitor: boolean) => {
      const L = latest.current;
      phase.current = "seated";
      L.onAssembled?.();
      if (!L.motionSafe) {
        seams.set(0.4);
        running.current.push(
          animate(sheenOpacity, clamp(L.sheen, 0, 1), {
            duration: durations.slow,
            ease: easings.enter,
          }),
        );
        return;
      }
      if (visitor) {
        L.audio.play("click", {
          pitch: L.profile === "gilt" ? 1.12 : L.profile === "cove" ? 0.86 : 1,
          gain: 0.5,
        });
      }
      seat.jump(0.996);
      seams.jump(1);
      running.current.push(
        animate(seat, 1, springs.flick),
        animate(seams, 0.4, { duration: durations.slow, ease: easings.enter }),
      );
      runProgress.jump(0);
      runOpacity.jump(1);
      setRun((n) => n + 1);
      running.current.push(
        animate(runProgress, 1, {
          duration: 0.72,
          ease: easings.move,
          onComplete: () => {
            flash.jump(1);
            running.current.push(
              animate(flash, 0, {
                duration: durations.slow,
                ease: easings.exit,
              }),
              animate(runOpacity, 0, {
                duration: durations.base,
                ease: easings.exit,
              }),
              animate(sheenOpacity, clamp(latest.current.sheen, 0, 1), {
                duration: durations.slow,
                ease: easings.enter,
              }),
            );
          },
        }),
      );
    },
    [flash, runOpacity, runProgress, seams, seat, sheenOpacity],
  );

  const assemble = React.useCallback(
    (visitor: boolean) => {
      const L = latest.current;
      if (phase.current !== "out") return;
      halt();
      phase.current = "moving";
      sheenOpacity.jump(0);
      if (!L.motionSafe) {
        for (const side of SIDES) offsets[side].jump(0);
        frameOpacity.jump(0);
        running.current.push(
          animate(frameOpacity, 1, {
            duration: durations.base,
            ease: easings.enter,
            delay: L.delay / 1000,
            onComplete: () => seatHome(visitor),
          }),
        );
        return;
      }
      frameOpacity.jump(1);
      SIDES.forEach((side, i) => {
        const mv = offsets[side];
        mv.jump(L.away);
        running.current.push(
          animate(mv, 0, {
            ...springs.glide,
            delay: (L.delay + i * clamp(L.stagger, 0, 150)) / 1000,
            // The last length home is the click.
            onComplete:
              i === SIDES.length - 1 ? () => seatHome(visitor) : undefined,
          }),
        );
      });
    },
    // The four offsets are stable motion values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frameOpacity, halt, seatHome, sheenOpacity],
  );

  const takeApart = React.useCallback(
    (instant: boolean) => {
      const L = latest.current;
      halt();
      phase.current = "out";
      runOpacity.jump(0);
      flash.jump(0);
      seams.jump(0);
      if (instant || !L.motionSafe) {
        for (const side of SIDES) offsets[side].jump(L.away);
        sheenOpacity.jump(0);
        return;
      }
      for (const side of SIDES) {
        running.current.push(
          animate(offsets[side], L.away, {
            duration: durations.base * 0.6,
            ease: easings.exit,
          }),
        );
      }
      running.current.push(
        animate(sheenOpacity, 0, {
          duration: durations.base * 0.6,
          ease: easings.exit,
        }),
      );
    },
    // The four offsets are stable motion values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flash, halt, runOpacity, sheenOpacity],
  );

  // A host's `assembled` drives the frame; the click answers only a visitor.
  React.useEffect(() => {
    if (assembled === undefined) return;
    if (assembled) assemble(visitorActive());
    else takeApart(false);
  }, [assembled, assemble, takeApart]);

  // `mount`: assemble now. StrictMode's rehearsal is undone by the cleanup.
  React.useEffect(() => {
    if (assembled !== undefined || trigger !== "mount") return;
    assemble(false);
    return () => takeApart(true);
    // Only the trigger decides this; `assembled` takes over once defined.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  // `inView`: assemble when it comes into view (again, unless `once`).
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || trigger !== "inView") return;
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (assembledRef.current !== undefined) return;
        if (entry?.isIntersecting) {
          seen.current = true;
          assemble(false);
        } else if (!once && seen.current && phase.current !== "out") {
          takeApart(true);
        }
      },
      { threshold: 0.3 },
    );
    watcher.observe(root);
    return () => watcher.disconnect();
  }, [trigger, once, assemble, takeApart]);

  // A changed bevel moves "away"; a frame that is out stays out of sight.
  React.useEffect(() => {
    if (phase.current !== "out") return;
    for (const side of SIDES) offsets[side].jump(away);
    // The four offsets are stable motion values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [away]);

  // Reduced motion arriving mid-flight lands everything at once.
  React.useEffect(() => {
    if (motionSafe || phase.current === "out") return;
    halt();
    for (const side of SIDES) offsets[side].jump(0);
    frameOpacity.jump(1);
    runOpacity.jump(0);
    seams.jump(0.4);
    sheenOpacity.jump(clamp(latest.current.sheen, 0, 1));
    phase.current = "seated";
    // The offsets are stable motion values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionSafe, frameOpacity, halt, runOpacity, sheenOpacity]);

  // A settled sheen follows the prop.
  React.useEffect(() => {
    if (phase.current === "seated") sheenOpacity.set(clamp(sheen, 0, 1));
  }, [sheen, sheenOpacity]);

  React.useEffect(() => halt, [halt]);

  const bindFrame = React.useCallback((node: HTMLDivElement | null) => {
    frameRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      setBox({ w: node.clientWidth, h: node.clientHeight });
    });
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  /** Turns the light toward a point (client coordinates) and puts the highlight there. */
  const lightAt = (x: number, y: number, snapToRing: boolean) => {
    const node = frameRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    let px = x - rect.left;
    let py = y - rect.top;
    const dx = px - rect.width / 2;
    const dy = py - rect.height / 2;
    const len = Math.hypot(
      dx / Math.max(1, rect.width / 2),
      dy / Math.max(1, rect.height / 2),
    );
    const n = Math.hypot(dx, dy) || 1;
    const reach = clamp(len, 0.25, 1);
    lxRaw.set(r3((dx / n) * reach));
    lyRaw.set(r3((dy / n) * reach));
    if (snapToRing) {
      // Focus parks the highlight on the edge nearest the focused element.
      const toLeft = px;
      const toRight = rect.width - px;
      const toTop = py;
      const toBottom = rect.height - py;
      const least = Math.min(toLeft, toRight, toTop, toBottom);
      if (least === toLeft) px = b / 2;
      else if (least === toRight) px = rect.width - b / 2;
      else if (least === toTop) py = b / 2;
      else py = rect.height - b / 2;
    }
    mxRaw.set(Math.round(px));
    myRaw.set(Math.round(py));
  };

  const engage = (on: boolean) => {
    if (!interactive) return;
    const target = on ? 1 : 0;
    if (motionSafe) {
      animate(raised, up > 0 ? target : 0, springs.glide);
      animate(spot, on ? clamp(highlight, 0, 1) : 0, {
        duration: durations.base,
        ease: easings.enter,
      });
    } else {
      raised.set(0);
      animate(spot, on ? clamp(highlight, 0, 1) : 0, {
        duration: durations.fast,
      });
    }
    if (!on) {
      lxRaw.set(REST[0]);
      lyRaw.set(REST[1]);
    }
  };

  const hover = React.useRef(false);
  const focus = React.useRef(false);

  const h = Math.max(0, box.h);
  const w = Math.max(0, box.w);
  const c = b / 2;
  const clockwise = `M ${c} ${c} H ${r2(w - c)} V ${r2(h - c)} H ${c} Z`;
  const counter = `M ${c} ${c} V ${r2(h - c)} H ${r2(w - c)} V ${c} Z`;
  const dash = 0.06;
  // Both heads leave the top-left corner and meet half way round.
  const offsetA = useTransform(runProgress, (p) => r3(dash / 2 - p * 0.5));
  const offsetCore = useTransform(runProgress, (p) => r3(dash * 0.3 - p * 0.5));
  const flashX = r2(w - c);
  const flashY = r2(h - c);

  return (
    <div
      ref={rootRef}
      onPointerMove={(event) => {
        if (!interactive || event.pointerType === "touch") return;
        if (!hover.current) {
          hover.current = true;
          engage(true);
        }
        lightAt(event.clientX, event.clientY, false);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        hover.current = false;
        if (!focus.current) engage(false);
      }}
      onFocus={(event) => {
        const el = event.target;
        if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
        focus.current = true;
        engage(true);
        const r = el.getBoundingClientRect();
        lightAt(r.left + r.width / 2, r.top + r.height / 2, true);
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && rootRef.current?.contains(next)) return;
        focus.current = false;
        if (!hover.current) engage(false);
      }}
      className={cn(
        "group/mitre-joint relative isolate overflow-clip",
        className,
      )}
      style={{ padding: pad }}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute"
        style={{ inset: pad, boxShadow: shadow, opacity: frameOpacity }}
      />
      <motion.div
        ref={bindFrame}
        className="relative"
        style={
          {
            y: raisedY,
            "--mitre-b": `${b}px`,
          } as unknown as React.ComponentProps<typeof motion.div>["style"]
        }
      >
        <div
          className={cn("relative", contentClassName)}
          style={{ padding: b }}
        >
          {children}
        </div>
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ opacity: frameOpacity, scale: seat }}
        >
          {SIDES.map((side) => {
            const bead = profile === "gilt" ? beadLayer(side, b) : null;
            return (
              <motion.div
                key={side}
                className="absolute inset-0"
                style={{ ...shift[side], clipPath: CLIPS[side] }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundColor: moulding,
                    backgroundImage: bead
                      ? `${bead.image}, ${profileGradient(profile, side, moulding, b)}`
                      : profileGradient(profile, side, moulding, b),
                    backgroundSize: bead
                      ? `${bead.size}, 100% 100%`
                      : undefined,
                    backgroundPosition: bead
                      ? `${bead.position}, 0 0`
                      : undefined,
                    backgroundRepeat: bead ? "no-repeat" : undefined,
                  }}
                />
                <motion.div
                  className="absolute inset-0"
                  style={{ backgroundColor: sideLights[side] }}
                />
              </motion.div>
            );
          })}
          {/* The four seams: a hairline down each mitre. */}
          {(
            [
              ["left-0 top-0", "45deg"],
              ["right-0 top-0", "135deg"],
              ["right-0 bottom-0", "45deg"],
              ["left-0 bottom-0", "135deg"],
            ] as const
          ).map(([place, angle]) => (
            <motion.div
              key={place}
              className={cn("absolute", place)}
              style={{
                width: b,
                height: b,
                opacity: seams,
                backgroundImage: `linear-gradient(${angle}, transparent calc(50% - 0.7px), color-mix(in oklab, ${moulding} 45%, black) 50%, transparent calc(50% + 0.7px))`,
              }}
            />
          ))}
          {/* The light layers, clipped to the moulding. */}
          <div className="absolute inset-0" style={{ clipPath: RING }}>
            <motion.div
              className="absolute inset-0"
              style={{
                opacity: sheenOpacity,
                backgroundImage:
                  "linear-gradient(115deg, transparent 26%, oklch(1 0 0 / 0.34) 42%, transparent 58%, transparent 70%, oklch(1 0 0 / 0.16) 80%, transparent 90%)",
              }}
            />
            <motion.div
              className="absolute inset-0"
              style={{
                opacity: spot,
                backgroundImage: spotImage,
                mixBlendMode: "screen",
              }}
            />
            {run > 0 && w > 0 ? (
              <motion.svg
                key={run}
                className="absolute inset-0 overflow-visible"
                width={w}
                height={h}
                viewBox={`0 0 ${w} ${h}`}
                style={{ opacity: runOpacity, mixBlendMode: "plus-lighter" }}
              >
                {[clockwise, counter].map((d) => (
                  <g key={d}>
                    <motion.path
                      d={d}
                      pathLength={1}
                      fill="none"
                      stroke={light}
                      strokeWidth={b * 1.5}
                      strokeLinecap="round"
                      strokeDasharray={`${dash} ${1 - dash}`}
                      style={{ strokeDashoffset: offsetA, filter: "blur(4px)" }}
                    />
                    <motion.path
                      d={d}
                      pathLength={1}
                      fill="none"
                      stroke={`color-mix(in oklab, ${light} 45%, white)`}
                      strokeWidth={Math.max(2, b * 0.34)}
                      strokeLinecap="round"
                      strokeDasharray={`${dash * 0.6} ${1 - dash * 0.6}`}
                      style={{ strokeDashoffset: offsetCore }}
                    />
                  </g>
                ))}
                <motion.circle
                  cx={flashX}
                  cy={flashY}
                  r={b * 1.6}
                  fill={light}
                  style={{ opacity: flash, filter: "blur(6px)" }}
                />
              </motion.svg>
            ) : null}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
