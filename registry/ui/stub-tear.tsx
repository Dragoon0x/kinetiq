"use client";

import * as React from "react";

import { Check } from "lucide-react";
import {
  animate,
  cancelFrame,
  frame,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type StubTearSize = "sm" | "md" | "lg";

export type StubTearProps = {
  /** The ticket's body: what is being confirmed. */
  children?: React.ReactNode;
  /** The stub's face. Presentational: it is drawn twice while it tears, once hidden from assistive tech. */
  stubContent?: React.ReactNode;
  /** The tear handle's accessible name. @default "Tear to confirm" */
  label?: string;
  /** Shown where the stub was, and the handle's name once torn. @default "Confirmed" */
  confirmedLabel?: string;
  /** Controlled: whether the stub has been torn off. Setting it back to false puts the stub back. */
  torn?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultTorn?: boolean;
  /** Fires from the drag or key that tore the stub off (true). */
  onTornChange?: (torn: boolean) => void;
  /** Called once when the stub drops free: the action is confirmed. */
  onConfirm?: () => void;
  /** Fires as the visitor tears, with how far along the seam, 0 to 1 (two decimals). */
  onProgressChange?: (progress: number) => void;
  /** How hard the paper bridges between the holes catch, 0 to 1: a clean zip to a fibrous stick-slip. @default 0.4 */
  resistance?: number;
  /** The stub's share of the ticket's width, 0.15 to 0.5. @default 0.28 */
  stub?: number;
  /** How far the torn flap swings and lifts as it comes away, 0 to 1. @default 0.5 */
  curl?: number;
  /** Spacing of the punched holes along the seam, in px. @default 9 */
  holes?: number;
  /** The body's paper, any CSS colour. @default "var(--card)" */
  paper?: string;
  /** The stub's paper; a pigment at fixed lightness so it reads the same in both themes. @default "oklch(from var(--accent-bright) 0.94 0.035 h)" */
  stubPaper?: string;
  /** Ink for the stub's face. @default "oklch(from var(--accent-bright) 0.34 0.09 h)" */
  stubInk?: string;
  /** @default "md" */
  size?: StubTearSize;
  /** Play a paper tick at every bridge that gives and a snap when the stub comes free. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Geometry = { height: number; notch: number; pad: string };

const SIZES: Record<StubTearSize, Geometry> = {
  sm: { height: 112, notch: 6, pad: "p-3 pr-4" },
  md: { height: 132, notch: 7, pad: "p-4 pr-5" },
  lg: { height: 152, notch: 8, pad: "p-5 pr-6" },
};

/** The body and stub overlap the seam by this much, so ragged fibres can show. */
const LAP = 3;
/** Room kept under the ticket for the dropping stub. */
const ROOM_BELOW = 20;
/** The seam's own drawing: a band this wide, centred on the perforation. */
const BAND = 24;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const smooth = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Seam = {
  height: number;
  notch: number;
  spacing: number;
  /** The tear line's sideways offset, every 2px down the seam. */
  rag: number[];
  /** Hole centres, top to bottom. */
  holes: number[];
};

/**
 * The line a perforation tears along: nearly straight through the punched
 * holes, ragged across the paper bridges between them, where fibres pull.
 */
function buildSeam(height: number, notch: number, spacing: number): Seam {
  const rand = rng(1486 + height * 13 + Math.round(spacing * 7));
  const holes: number[] = [];
  for (let y = notch + spacing * 0.6; y < height - notch - 1; y += spacing) {
    holes.push(r2(y));
  }
  const rag: number[] = [];
  let drift = 0;
  for (let y = 0; y <= height; y += 2) {
    let near = spacing;
    for (const h of holes) near = Math.min(near, Math.abs(y - h));
    const bridge = clamp(near / (spacing / 2), 0, 1);
    drift = drift * 0.55 + (rand() - 0.5) * 1.6;
    rag.push(r2(drift * (0.25 + bridge * 1.1)));
  }
  return { height, notch, spacing, rag, holes };
}

const ragAt = (seam: Seam, y: number) => {
  const i = clamp(y / 2, 0, seam.rag.length - 1);
  const k = Math.floor(i);
  const a = seam.rag[k] ?? 0;
  const b = seam.rag[k + 1] ?? a;
  return a + (b - a) * (i - k);
};

/** A notch's quarter arc, as [dx, y] points from `from` to `to` radians. */
const arc = (cy: number, r: number, from: number, to: number) => {
  const out: [number, number][] = [];
  for (let i = 0; i <= 6; i += 1) {
    const a = from + ((to - from) * i) / 6;
    out.push([r2(r * Math.cos(a)), r2(cy + r * Math.sin(a))]);
  }
  return out;
};

/** Points along the tear, `from` to `to` (either direction), as [dx, y]. */
const tearLine = (seam: Seam, from: number, to: number) => {
  const out: [number, number][] = [];
  const steps = Math.max(1, Math.ceil(Math.abs(to - from) / 2));
  for (let i = 0; i <= steps; i += 1) {
    const y = from + ((to - from) * i) / steps;
    out.push([ragAt(seam, y), r2(y)]);
  }
  return out;
};

/** The body's outline: its right edge is the seam, torn down to `front`. */
function bodyClip(seam: Seam, front: number): string {
  const { height: H, notch: n } = seam;
  const x = (dx: number) => {
    const off = r2(dx - LAP);
    return off >= 0 ? `calc(100% + ${off}px)` : `calc(100% - ${-off}px)`;
  };
  const pts: string[] = ["0 0"];
  for (const [dx, y] of arc(0, n, Math.PI, Math.PI / 2)) {
    pts.push(`${x(dx)} ${y}px`);
  }
  if (front > n) {
    for (const [dx, y] of tearLine(seam, n, front)) pts.push(`${x(dx)} ${y}px`);
  }
  pts.push(`${x(0)} ${r2(Math.max(front, n))}px`);
  for (const [dx, y] of arc(H, n, (3 * Math.PI) / 2, Math.PI)) {
    pts.push(`${x(dx)} ${y}px`);
  }
  pts.push(`0 ${H}px`);
  return `polygon(${pts.join(",")})`;
}

/** The part of the stub still attached: below the tear front. */
function lowerClip(seam: Seam, front: number): string {
  const { height: H, notch: n } = seam;
  if (front >= H - n - 0.5) return "polygon(0 0,0 0,0 0)";
  const x = (dx: number) => `${r2(LAP + dx)}px`;
  const pts: string[] = [];
  if (front <= n) {
    for (const [dx, y] of arc(0, n, Math.PI / 2, 0))
      pts.push(`${x(dx)} ${y}px`);
    pts.push("100% 0");
  } else {
    pts.push(`${x(ragAt(seam, front))} ${r2(front)}px`);
    pts.push(`100% ${r2(front)}px`);
  }
  pts.push(`100% ${H}px`);
  for (const [dx, y] of arc(H, n, 2 * Math.PI, (3 * Math.PI) / 2)) {
    pts.push(`${x(dx)} ${y}px`);
  }
  return `polygon(${pts.join(",")})`;
}

/** The torn flap: the stub above the tear front. */
function flapClip(seam: Seam, front: number): string {
  const { height: H, notch: n } = seam;
  if (front <= n + 0.5) return "polygon(0 0,0 0,0 0)";
  const x = (dx: number) => `${r2(LAP + dx)}px`;
  const pts: string[] = [];
  for (const [dx, y] of arc(0, n, Math.PI / 2, 0)) pts.push(`${x(dx)} ${y}px`);
  pts.push("100% 0");
  if (front >= H - n - 0.5) {
    pts.push(`100% ${H}px`);
    for (const [dx, y] of arc(H, n, 2 * Math.PI, (3 * Math.PI) / 2)) {
      pts.push(`${x(dx)} ${y}px`);
    }
    for (const [dx, y] of tearLine(seam, H - n, n)) pts.push(`${x(dx)} ${y}px`);
  } else {
    pts.push(`100% ${r2(front)}px`);
    for (const [dx, y] of tearLine(seam, front, n)) pts.push(`${x(dx)} ${y}px`);
  }
  return `polygon(${pts.join(",")})`;
}

/** A torn edge as an SVG path in a band `BAND` wide centred on the seam. */
function edgePath(seam: Seam, from: number, to: number, origin: number) {
  if (to - from < 1) return "";
  return tearLine(seam, from, to)
    .map(([dx, y], i) => `${i ? "L" : "M"}${r2(origin + dx)} ${y}`)
    .join("");
}

/** The punched holes below the tear front. */
function holesPath(seam: Seam, front: number) {
  let d = "";
  for (const y of seam.holes) {
    if (y < front + 1) continue;
    d += `M${BAND / 2 - 1.5} ${y}a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0`;
  }
  return d;
}

type Engine = {
  grab: () => void;
  pull: (offsetY: number) => void;
  release: (velocityY: number) => void;
  cancel: () => void;
  tearAll: () => void;
  hint: () => void;
  restore: () => void;
  jumpTorn: () => void;
  reshape: () => void;
};

type Params = {
  motionSafe: boolean;
  resistance: number;
  curl: number;
  audio: ReturnType<typeof useTactileSound>;
  onProgress: (p: number) => void;
  onTorn: () => void;
};

/**
 * A confirmation ticket you tear. Pull down the perforation and the tear
 * front follows the finger 1:1 down the seam, its two edges ragged where
 * the paper bridges between the holes give — each bridge catching until the
 * finger is `resistance` × 8px past it, then letting go with a tick — while
 * the torn flap of the stub hinges away about the front, its edge lifting by
 * `curl` over a soft shadow. Let go short of the end and the seam springs
 * closed (springs.snap, or springs.glide when the paper is stiff), taking
 * the release velocity; a flick that would carry past the end finishes it.
 * At the end the stub drops free on the exit ease and the action confirms.
 *
 * The handle is a real button: Enter or Space tears the whole seam in one
 * motion. Under reduced motion the seam still opens with the finger, but
 * nothing swings, springs or falls: the stub fades and the confirmation
 * fades in.
 */
export function StubTear({
  children,
  stubContent,
  label = "Tear to confirm",
  confirmedLabel = "Confirmed",
  torn,
  defaultTorn = false,
  onTornChange,
  onConfirm,
  onProgressChange,
  resistance = 0.4,
  stub = 0.28,
  curl = 0.5,
  holes = 9,
  paper = "var(--card)",
  stubPaper = "oklch(from var(--accent-bright) 0.94 0.035 h)",
  stubInk = "oklch(from var(--accent-bright) 0.34 0.09 h)",
  size = "md",
  sound = false,
  disabled = false,
  className,
}: StubTearProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const g = SIZES[size] ?? SIZES.md;
  const share = clamp(stub, 0.15, 0.5);
  const spacing = clamp(holes, 5, 24);
  const seam = React.useMemo(
    () => buildSeam(g.height, g.notch, spacing),
    [g.height, g.notch, spacing],
  );
  const hintId = React.useId();

  const [own, setOwn] = React.useState(defaultTorn);
  const isTorn = torn ?? own;
  const [said, setSaid] = React.useState("");
  const [aware, setAware] = React.useState(false);
  const [first] = React.useState(() => ({
    torn: isTorn,
    body: bodyClip(seam, isTorn ? g.height - g.notch : g.notch),
    lower: lowerClip(seam, isTorn ? g.height : g.notch),
    flap: flapClip(seam, g.notch),
    holes: holesPath(seam, isTorn ? g.height : g.notch),
  }));

  const front = useMotionValue(isTorn ? g.height - g.notch : g.notch);
  const gone = useMotionValue(isTorn ? 1 : 0);

  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const stubRef = React.useRef<HTMLDivElement | null>(null);
  const lowerRef = React.useRef<HTMLDivElement | null>(null);
  const flapRef = React.useRef<HTMLDivElement | null>(null);
  const flapClipRef = React.useRef<HTMLDivElement | null>(null);
  const shadeRef = React.useRef<HTMLDivElement | null>(null);
  const holesRef = React.useRef<SVGPathElement | null>(null);
  const bodyEdgeRef = React.useRef<SVGPathElement | null>(null);
  const flapEdgeRef = React.useRef<SVGPathElement | null>(null);
  const gripRef = React.useRef<HTMLSpanElement | null>(null);
  const doneRef = React.useRef<HTMLDivElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const shownTorn = React.useRef(isTorn);

  const latest = React.useRef({
    onTornChange,
    onConfirm,
    onProgressChange,
    controlled: torn !== undefined,
  });
  React.useEffect(() => {
    latest.current = {
      onTornChange,
      onConfirm,
      onProgressChange,
      controlled: torn !== undefined,
    };
  });

  const params = React.useRef<Params | null>(null);
  React.useEffect(() => {
    params.current = {
      motionSafe,
      resistance: clamp(resistance, 0, 1),
      curl: clamp(curl, 0, 1),
      audio,
      onProgress: (p) => latest.current.onProgressChange?.(p),
      onTorn: () => {
        shownTorn.current = true;
        setSaid("Stub torn off. Confirmed.");
        if (!latest.current.controlled) setOwn(true);
        latest.current.onTornChange?.(true);
        latest.current.onConfirm?.();
      },
    };
  });

  React.useEffect(() => {
    const body = bodyRef.current;
    const stubBox = stubRef.current;
    const lower = lowerRef.current;
    const flap = flapRef.current;
    const flapInner = flapClipRef.current;
    const shade = shadeRef.current;
    const holesNode = holesRef.current;
    const bodyEdge = bodyEdgeRef.current;
    const flapEdge = flapEdgeRef.current;
    const grip = gripRef.current;
    const done = doneRef.current;
    if (
      !body ||
      !stubBox ||
      !lower ||
      !flap ||
      !flapInner ||
      !shade ||
      !holesNode ||
      !bodyEdge ||
      !flapEdge ||
      !grip ||
      !done
    ) {
      return;
    }
    const H = seam.height;
    const n = seam.notch;
    const end = H - n;
    let anims: AnimationPlaybackControls[] = [];
    let queued = false;
    let grabbedAt = n;
    let lastBridge = -1;
    let tearing = false;
    let state: "attached" | "dropping" | "torn" = shownTorn.current
      ? "torn"
      : "attached";

    const P = () => params.current;
    // Bumped by every stop: a stopped animation can still report finishing a
    // moment later, and a stale finish must not act.
    let epoch = 0;
    const live = <A extends unknown[]>(fn: (...args: A) => void) => {
      const born = epoch;
      return (...args: A) => {
        if (born === epoch) fn(...args);
      };
    };
    const stop = () => {
      epoch += 1;
      for (const a of anims) a.stop();
      anims = [];
    };
    const progressOf = (f: number) => clamp((f - n) / (end - n), 0, 1);

    const paint = () => {
      const p = P();
      if (!p) return;
      const ms = p.motionSafe;
      const f = clamp(front.get(), n, end);
      const t = progressOf(f);
      const out = gone.get();
      body.style.clipPath = bodyClip(seam, f);
      lower.style.clipPath = lowerClip(seam, f);
      flapInner.style.clipPath = flapClip(seam, f);
      // The flap hinges about the tear front; the more it has torn, the
      // further it swings and the more it lifts toward you.
      // The swing peaks mid-tear and eases as the last of the seam goes, so
      // the flap stays inside the room the box keeps for it.
      const swing = Math.sin(Math.PI * t);
      const angle = ms ? lerp(6, 16, p.curl) * swing : 0;
      const lift = ms ? 1 + p.curl * 0.03 * swing : 1;
      flap.style.transformOrigin = `${r2(LAP + ragAt(seam, f))}px ${r2(f)}px`;
      flap.style.transform = ms
        ? `rotate(${r2(angle)}deg) scale(${r2(lift * 1000) / 1000})`
        : t > 0
          ? "translateX(1.5px)"
          : "";
      shade.style.opacity = String(r2(p.curl * smooth(t * 1.6) * 0.9));
      flap.style.filter =
        ms && t > 0
          ? `drop-shadow(${r2(1 + angle * 0.12)}px ${r2(1.5 + angle * 0.2)}px ${r2(2 + angle * 0.25)}px color-mix(in oklab, black ${Math.round(12 + p.curl * 10)}%, transparent))`
          : "";
      // Dropping: the whole stub falls away, turning a little about its
      // top corner, and fades.
      stubBox.style.transform =
        ms && out > 0
          ? `translateY(${r2(out * 8)}px) rotate(${r2(out * 3)}deg)`
          : "";
      stubBox.style.opacity = String(r2(1 - out));
      done.style.opacity = String(r2(out));
      holesNode.setAttribute("d", holesPath(seam, out > 0 ? H : f));
      bodyEdge.setAttribute("d", edgePath(seam, n, f, BAND / 2));
      flapEdge.setAttribute("d", edgePath(seam, n, f, LAP));
      grip.style.transform = `translateY(${r2(Math.max(0, f - n))}px)`;
      grip.style.opacity = out > 0 ? "0" : "1";
    };
    const flush = () => {
      queued = false;
      paint();
    };
    const schedule = () => {
      if (queued) return;
      queued = true;
      frame.render(flush);
    };
    const offs = [front.on("change", schedule), gone.on("change", schedule)];

    const tick = (f: number) => {
      const bridge = Math.floor((f - n) / seam.spacing);
      if (bridge > lastBridge && tearing) {
        P()?.audio.play("paper", {
          pitch: 0.9 + (bridge % 3) * 0.09,
          gain: 0.32,
        });
      }
      lastBridge = Math.max(lastBridge, bridge);
      P()?.onProgress(Math.round(progressOf(f) * 100) / 100);
    };

    const drop = () => {
      const p = P();
      if (!p) return;
      stop();
      state = "dropping";
      tearing = false;
      front.jump(end);
      p.audio.play("snap", { pitch: 1, gain: 0.55 });
      anims.push(
        animate(gone, 1, {
          duration: p.motionSafe ? durations.slow : durations.base,
          ease: easings.exit,
          onComplete: live(() => {
            state = "torn";
          }),
        }),
      );
      p.onTorn();
    };

    const closeUp = (velocity: number) => {
      const p = P();
      if (!p) return;
      stop();
      tearing = false;
      lastBridge = -1;
      if (!p.motionSafe) {
        front.jump(n);
        p.onProgress(0);
        return;
      }
      // Stiff paper settles back without the overshoot.
      const spring = p.resistance > 0.6 ? springs.glide : springs.snap;
      anims.push(
        animate(front, n, {
          ...spring,
          velocity,
          onComplete: live(() => p.onProgress(0)),
        }),
      );
    };

    engine.current = {
      grab: () => {
        if (state !== "attached") return;
        stop();
        tearing = true;
        grabbedAt = front.get();
        lastBridge = Math.floor((grabbedAt - n) / seam.spacing);
      },
      pull: (offsetY) => {
        if (state !== "attached" || !tearing) return;
        const p = P();
        if (!p) return;
        const finger = clamp(grabbedAt + offsetY, n, end);
        let f = finger;
        const current = front.get();
        // Stick-slip: the next bridge holds the front until the finger is
        // far enough past it, then lets go all at once.
        if (finger > current) {
          const catchAt = p.resistance * 8;
          const next =
            n +
            (Math.floor((current - n) / seam.spacing) + 1) * seam.spacing -
            seam.spacing / 2;
          if (next > current && finger > next && finger - next < catchAt) {
            f = next;
          }
        }
        front.set(r2(f));
        tick(f);
        if (finger >= end) drop();
      },
      release: (velocity) => {
        if (state !== "attached") return;
        const f = front.get();
        if (f >= end - 0.5) {
          drop();
          return;
        }
        if (project(f, velocity, 0.99) >= end && velocity > 0) {
          stop();
          if (!P()?.motionSafe) {
            drop();
            return;
          }
          // A throw that would carry past the end finishes the tear.
          anims.push(
            animate(front, end, {
              ...springs.glide,
              velocity,
              onUpdate: (v) => tick(v),
              onComplete: live(drop),
            }),
          );
          return;
        }
        closeUp(velocity);
      },
      cancel: () => {
        if (state === "attached") closeUp(0);
      },
      tearAll: () => {
        if (state !== "attached") return;
        const p = P();
        stop();
        tearing = true;
        lastBridge = Math.floor((front.get() - n) / seam.spacing);
        if (!p?.motionSafe) {
          drop();
          return;
        }
        anims.push(
          animate(front, end, {
            duration: 0.42 * (1 - progressOf(front.get())),
            ease: easings.move,
            onUpdate: (v) => tick(v),
            onComplete: live(drop),
          }),
        );
      },
      hint: () => {
        if (state !== "attached" || !P()?.motionSafe) return;
        stop();
        const to = Math.min(end, front.get() + 14);
        anims.push(
          animate(front, to, {
            ...springs.flick,
            onComplete: live(() => closeUp(0)),
          }),
        );
      },
      restore: () => {
        stop();
        state = "attached";
        tearing = false;
        lastBridge = -1;
        front.jump(n);
        const p = P();
        if (!p?.motionSafe) {
          anims.push(
            animate(gone, 0, { duration: durations.base, ease: easings.enter }),
          );
          return;
        }
        anims.push(animate(gone, 0, springs.glide));
      },
      jumpTorn: () => {
        stop();
        state = "torn";
        tearing = false;
        front.jump(end);
        gone.jump(1);
      },
      reshape: schedule,
    };

    schedule();
    return () => {
      stop();
      for (const off of offs) off();
      cancelFrame(flush);
      engine.current = null;
    };
  }, [seam, front, gone]);

  React.useEffect(() => {
    engine.current?.reshape();
  }, [motionSafe, curl, share]);

  // A host that changes `torn`: the stub comes back, or goes without a show.
  React.useEffect(() => {
    if (shownTorn.current === isTorn) return;
    shownTorn.current = isTorn;
    if (isTorn) engine.current?.jumpTorn();
    else engine.current?.restore();
  }, [isTorn]);

  const blocked = disabled || isTorn;
  const drag = useDrag({
    axis: "y",
    threshold: 3,
    disabled: blocked,
    onStart: () => engine.current?.grab(),
    onMove: ({ offset }) => engine.current?.pull(offset.y),
    onEnd: ({ velocity }) => engine.current?.release(velocity.y),
    onCancel: () => engine.current?.cancel(),
    onTap: () => engine.current?.hint(),
  });

  const seamX = `${r2((1 - share) * 100)}%`;
  // The box keeps room beside and under the ticket for the flap's swing and
  // the stub's drop, so neither ever draws outside it.
  const room = Math.ceil(g.height * (0.06 + 0.13 * clamp(curl, 0, 1))) + 2;

  return (
    <div
      className={cn("relative w-full", className)}
      style={{
        maxWidth: 520 + room * 2,
        paddingRight: room,
        // Matched on the left while there is width to spare, so the ticket
        // sits centred; on a narrow host the room is kept on the right only.
        paddingLeft: `clamp(0px, calc(100% - ${520 + room}px), ${room}px)`,
        paddingBottom: ROOM_BELOW,
      }}
    >
      <div
        className="relative w-full [filter:drop-shadow(0_0_0.5px_var(--hairline-strong))_drop-shadow(0_8px_14px_color-mix(in_oklab,black_10%,transparent))]"
        style={{ height: g.height }}
      >
        <div
          ref={bodyRef}
          className={cn(
            "absolute inset-y-0 left-0 overflow-hidden rounded-l-4 text-foreground shadow-[inset_0_0_0_1px_var(--hairline-strong)]",
            g.pad,
          )}
          style={{
            width: `calc(${seamX} + ${LAP}px)`,
            background: paper,
            clipPath: first.body,
          }}
        >
          {children}
        </div>

        <div
          aria-hidden
          ref={doneRef}
          className="pointer-events-none absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-1.5 rounded-r-4 border border-dashed border-hairline-strong text-success"
          style={{
            width: `calc(${r2(share * 100)}% - 6px)`,
            opacity: first.torn ? 1 : 0,
          }}
        >
          <Check aria-hidden className="size-4 shrink-0" />
          <span className="max-w-full truncate px-1 font-mono text-[9px] tracking-[0.06em] uppercase">
            {confirmedLabel}
          </span>
        </div>

        <div
          ref={stubRef}
          className="absolute inset-y-0 right-0"
          style={{
            transformOrigin: "0 0",
            width: `calc(${r2(share * 100)}% + ${LAP}px)`,
            opacity: first.torn ? 0 : 1,
          }}
        >
          <div
            ref={lowerRef}
            className="absolute inset-0 overflow-hidden rounded-r-4"
            style={{ background: stubPaper, clipPath: first.lower }}
          >
            <StubFace ink={stubInk}>{stubContent}</StubFace>
          </div>
          <div ref={flapRef} aria-hidden className="absolute inset-0">
            <div
              ref={flapClipRef}
              inert
              className="absolute inset-0 overflow-hidden rounded-r-4"
              style={{ background: stubPaper, clipPath: first.flap }}
            >
              <StubFace ink={stubInk}>{stubContent}</StubFace>
              {/* The underside showing as the torn edge lifts. */}
              <div
                ref={shadeRef}
                className="absolute inset-y-0 left-0 w-1/3 bg-linear-to-r from-[color-mix(in_oklab,black_16%,transparent)] to-transparent"
                style={{ opacity: 0 }}
              />
              <svg
                className="absolute inset-y-0 left-0 overflow-visible"
                width={BAND}
                height={g.height}
              >
                <path
                  ref={flapEdgeRef}
                  d=""
                  fill="none"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                  style={{ stroke: "oklch(1 0 0 / 0.7)" }}
                />
              </svg>
            </div>
          </div>
        </div>

        {/* The seam: holes still punched, and the body's torn edge. */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-y-0 overflow-visible"
          width={BAND}
          height={g.height}
          style={{ left: `calc(${seamX} - ${BAND / 2}px)` }}
        >
          <path
            ref={holesRef}
            d={first.holes}
            className={cn(
              "transition-colors duration-150",
              aware ? "fill-ink-2" : "fill-ink-3",
            )}
          />
          <path
            ref={bodyEdgeRef}
            d=""
            fill="none"
            strokeWidth={1.4}
            strokeLinecap="round"
            style={{ stroke: "oklch(1 0 0 / 0.7)" }}
          />
        </svg>

        <button
          type="button"
          {...drag}
          onClick={(event) => {
            // Pointer presses arrive through the drag; a click with no pointer
            // behind it (Enter, Space, assistive tech) tears the whole seam.
            if (event.detail === 0 && !blocked) engine.current?.tearAll();
          }}
          onPointerEnter={() => setAware(true)}
          onPointerLeave={() => setAware(false)}
          onFocus={() => setAware(true)}
          onBlur={() => setAware(false)}
          disabled={disabled}
          aria-disabled={isTorn || undefined}
          aria-label={isTorn ? confirmedLabel : label}
          aria-describedby={blocked ? undefined : hintId}
          className={cn(
            "absolute inset-y-0 w-8 touch-pan-x rounded-2 outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "disabled:cursor-not-allowed",
            blocked ? "cursor-default" : "cursor-grab active:cursor-grabbing",
          )}
          style={{ left: `calc(${seamX} - 16px)` }}
        >
          <span
            ref={gripRef}
            aria-hidden
            className="absolute left-1/2 block"
            style={{ top: g.notch + 2, opacity: first.torn ? 0 : 1 }}
          >
            <span
              className={cn(
                "flex h-4 w-3 -translate-x-1/2 flex-col items-center justify-center gap-0.5 rounded-1 border border-hairline-strong bg-card shadow-sm transition-transform duration-200",
                aware && !blocked ? "-translate-y-0.5" : "translate-y-0",
              )}
            >
              <span className="h-px w-1.5 bg-ink-3" />
              <span className="h-px w-1.5 bg-ink-3" />
              <span className="h-px w-1.5 bg-ink-3" />
            </span>
          </span>
        </button>
      </div>
      <span id={hintId} className="sr-only">
        Drag down the perforation, or press Enter, to tear off the stub.
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}

function StubFace({
  children,
  ink,
}: {
  children?: React.ReactNode;
  ink: string;
}) {
  // The seam's lap is on the left: the face centres in what is left.
  return (
    <div
      className="flex size-full min-w-0 flex-col items-center justify-center py-3 pr-2 pl-[calc(3px+0.5rem)] text-center"
      style={{ color: ink }}
    >
      {children}
    </div>
  );
}
