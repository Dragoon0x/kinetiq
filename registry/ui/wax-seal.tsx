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
import { durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type WaxSealWax = "crimson" | "navy" | "forest";

export type WaxSealProps = {
  /** Who the letter is for: written on the outside and in the greeting. */
  to: string;
  /** Who sealed it: the monogram in the wax and the signature. */
  from: string;
  /** Written on the outside and at the head of the letter. */
  date?: string;
  /** The letter itself. Blank lines start new paragraphs. */
  message: string;
  /** Controlled: whether the seal is broken and the letter open. */
  open?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires from the hold or key that broke the seal (true) and from Reseal (false). */
  onOpenChange?: (open: boolean) => void;
  /** How long the seal must be held before it breaks, in ms (400–1500). @default 800 */
  hold?: number;
  /** The wax's colour. @default "crimson" */
  wax?: WaxSealWax;
  /** Panels the letter is folded into: 2 (one flap) or 3 (two). @default 3 */
  folds?: number;
  /** @default "Reseal" */
  resealLabel?: string;
  /** Play the crack and the folds. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Pt = readonly [number, number];
type Crack = { pts: Pt[]; len: number; from: number; to: number };
type Cracks = {
  all: Crack[];
  /** The crack along the flap's edge, top rim to bottom rim. */
  edge: Pt[];
};

// Wax is pigment: fixed lightness and chroma, the same in either theme.
const WAX: Record<WaxSealWax, { base: string; pitch: number }> = {
  crimson: { base: "oklch(0.47 0.17 24)", pitch: 1 },
  navy: { base: "oklch(0.36 0.1 262)", pitch: 0.86 },
  forest: { base: "oklch(0.42 0.09 152)", pitch: 0.93 },
};

const PAPER = "oklch(0.952 0.026 85)";
const HAND = "oklch(0.31 0.07 262)";
const FAINT = "oklch(0.52 0.03 70)";
const PAPER_EDGE =
  "drop-shadow(0 0 0.5px oklch(0.25 0.02 260 / 0.45)) drop-shadow(0 2px 3px oklch(0.2 0.02 260 / 0.16))";

/** The outermost flap is a little narrower, so its edge lands inside the packet. */
const FLAP = 0.78;
/** The seal's radius in its own units; the seal is drawn 44px across 48 units. */
const R = 19.5;
const SEAL_PX = 44;
const UNIT = SEAL_PX / 48;
/** Where a key press cracks it from: a little off centre, as a thumb would. */
const KEY_POINT: Pt = [2.2, -3.4];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const pct = (v: number) => `${r3(v * 100)}%`;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Layout = {
  n: 2 | 3;
  /** The flap's width and a full panel's, as shares of the sheet. */
  w0: number;
  pw: number;
  /** The seal's centre, as a share of the sheet's width. */
  sealX: number;
  /** How far the sheet sits off centre while sealed, as a share of its width. */
  shift: number;
};

function layoutFor(folds: number): Layout {
  const n: 2 | 3 = folds >= 3 ? 3 : 2;
  const pw = 1 / (FLAP + n - 1);
  const w0 = FLAP * pw;
  return {
    n,
    w0: r3(w0 * 1e3) / 1e3,
    pw: r3(pw * 1e3) / 1e3,
    sealX: r3(2 * w0 * 1e3) / 1e3,
    shift: r3((0.5 - (w0 + pw / 2)) * 1e3) / 1e3,
  };
}

/** The wax's rim: a disc with a seeded, slightly lumpy edge. */
function rimOf(seed: number) {
  const rand = lcg(seed);
  const a = rand() * 6.28;
  const b = rand() * 6.28;
  const c = rand() * 6.28;
  const radius = (t: number) =>
    R *
    (1 +
      0.045 * Math.sin(3 * t + a) +
      0.03 * Math.sin(5 * t + b) +
      0.018 * Math.sin(8 * t + c));
  const pts: string[] = [];
  for (let i = 0; i < 48; i += 1) {
    const t = (i / 48) * Math.PI * 2;
    const r = radius(t);
    pts.push(`${r2(r * Math.cos(t))} ${r2(r * Math.sin(t))}`);
  }
  return { d: `M${pts.join("L")}Z`, radius };
}

const lengthOf = (pts: readonly Pt[]) => {
  let len = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const p = pts[i - 1];
    const q = pts[i];
    if (p && q) len += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  return len;
};

/**
 * Cracks from a press point: one that runs up and down to the rim, drawn
 * toward the flap's edge (x = 0) as it goes so the seal splits there, three
 * that wander out to the sides, and two short branches off those.
 */
function cracksFrom(
  point: Pt,
  seed: number,
  radius: (t: number) => number,
): Cracks {
  const rand = lcg(seed ^ hash(`${r2(point[0])},${r2(point[1])}`));
  const inside = (x: number, y: number) =>
    Math.hypot(x, y) < radius(Math.atan2(y, x)) - 0.4;
  const toRim = (x: number, y: number): Pt => {
    const t = Math.atan2(y, x);
    const r = radius(t) + 0.6;
    return [r2(r * Math.cos(t)), r2(r * Math.sin(t))];
  };
  const run = (dir: number): Pt[] => {
    const pts: Pt[] = [[r2(point[0]), r2(point[1])]];
    let [x, y] = point;
    for (let i = 0; i < 30; i += 1) {
      x = x + (0 - x) * 0.32 + (rand() - 0.5) * 1.8;
      y = y + dir * 2.4;
      if (!inside(x, y)) {
        pts.push(toRim(x, y));
        break;
      }
      pts.push([r2(x), r2(y)]);
    }
    return pts;
  };
  const up = run(-1);
  const down = run(1);
  const wander = (angle: number, steps: number, from: Pt): Pt[] => {
    const pts: Pt[] = [[r2(from[0]), r2(from[1])]];
    let [x, y] = from;
    let a = angle;
    for (let i = 0; i < steps; i += 1) {
      a += (rand() - 0.5) * 0.8;
      x += Math.cos(a) * 2.6;
      y += Math.sin(a) * 2.6;
      if (!inside(x, y)) {
        pts.push(toRim(x, y));
        break;
      }
      pts.push([r2(x), r2(y)]);
    }
    return pts;
  };
  const spokes = [
    Math.PI + (rand() - 0.5) * 0.9,
    (rand() - 0.5) * 0.9,
    (rand() > 0.5 ? 0.55 : 2.6) + (rand() - 0.5) * 0.5,
  ].map((a) => wander(a, 30, point));
  const branches: Pt[][] = [];
  for (const spoke of spokes.slice(0, 2)) {
    const at = spoke[Math.min(spoke.length - 1, 2 + Math.floor(rand() * 3))];
    if (at)
      branches.push(
        wander((rand() - 0.5) * 6.28, 3 + Math.floor(rand() * 3), at),
      );
  }
  const crack = (pts: Pt[], from: number, to: number): Crack => ({
    pts,
    len: lengthOf(pts),
    from,
    to,
  });
  return {
    all: [
      crack(up, 0, 0.82),
      crack(down, 0.04, 0.86),
      ...spokes.map((s, i) => crack(s, 0.1 + i * 0.06, 1)),
      ...branches.map((b) => crack(b, 0.45, 1)),
    ],
    edge: [...[...up].reverse(), ...down.slice(1)],
  };
}

/** Every crack, each drawn as far as `p` has taken it. */
function crackPath(cracks: Crack[], p: number): string {
  let d = "";
  for (const c of cracks) {
    const t = clamp((p - c.from) / (c.to - c.from), 0, 1);
    if (t <= 0 || c.len <= 0) continue;
    let left = t * c.len;
    const first = c.pts[0];
    if (!first) continue;
    d += `M${first[0]} ${first[1]}`;
    for (let i = 1; i < c.pts.length && left > 0; i += 1) {
      const a = c.pts[i - 1];
      const b = c.pts[i];
      if (!a || !b) continue;
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (seg <= left) {
        d += `L${b[0]} ${b[1]}`;
        left -= seg;
      } else {
        const k = left / seg;
        d += `L${r2(a[0] + (b[0] - a[0]) * k)} ${r2(a[1] + (b[1] - a[1]) * k)}`;
        left = 0;
      }
    }
  }
  return d;
}

/** The two sides of the edge crack, as clip polygons. */
function halvesOf(edge: Pt[]) {
  const top = edge[0] ?? [0, -R];
  const bottom = edge[edge.length - 1] ?? [0, R];
  const line = edge.map(([x, y]) => `${x} ${y}`).join("L");
  return {
    a: `M${line}L${bottom[0]} 30L-30 30L-30 -30L${top[0]} -30Z`,
    b: `M${line}L${bottom[0]} 30L30 30L30 -30L${top[0]} -30Z`,
  };
}

type Art = {
  id: string;
  rim: string;
  monogram: string;
  wax: string;
};

/**
 * The seal itself: the wax disc shaded from its pigment, a pressed ring,
 * the embossed monogram, and its cracks. `clip` keeps one side of the edge
 * crack for a broken half.
 */
function SealArt({
  art,
  cracks,
  crackD,
  stamp,
  clip,
  className,
}: {
  art: Art;
  cracks: Cracks;
  crackD: MotionValue<string> | string;
  stamp?: MotionValue<number> | number;
  clip?: "a" | "b";
  className?: string;
}) {
  const halves = clip ? halvesOf(cracks.edge) : null;
  const clipId = `${art.id}-${clip ?? "whole"}`;
  const light = `color-mix(in oklab, ${art.wax} 62%, white)`;
  const dark = `color-mix(in oklab, ${art.wax} 62%, black)`;
  return (
    <svg
      aria-hidden
      viewBox="-24 -24 48 48"
      className={cn("block overflow-visible", className)}
    >
      <defs>
        <radialGradient id={`${clipId}-g`} cx="38%" cy="32%" r="78%">
          <stop offset="0" stopColor={light} />
          <stop offset="0.5" stopColor={art.wax} />
          <stop offset="1" stopColor={dark} />
        </radialGradient>
        {halves ? (
          <clipPath id={`${clipId}-c`}>
            <path d={clip === "a" ? halves.a : halves.b} />
          </clipPath>
        ) : null}
      </defs>
      <g clipPath={halves ? `url(#${clipId}-c)` : undefined}>
        <path d={art.rim} fill={`url(#${clipId}-g)`} />
        <motion.g style={{ opacity: stamp ?? 1 }}>
          <circle
            r="13.4"
            fill="none"
            stroke={dark}
            strokeWidth="1.5"
            opacity="0.55"
          />
          <circle
            cx="-0.5"
            cy="-0.5"
            r="13.4"
            fill="none"
            stroke={light}
            strokeWidth="0.7"
            opacity="0.6"
          />
          <text
            x="0.6"
            y="0.6"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="16"
            fontStyle="italic"
            fontFamily="serif"
            fill={dark}
          >
            {art.monogram}
          </text>
          <text
            x="-0.45"
            y="-0.45"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="16"
            fontStyle="italic"
            fontFamily="serif"
            fill={light}
          >
            {art.monogram}
          </text>
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="16"
            fontStyle="italic"
            fontFamily="serif"
            fill={art.wax}
          >
            {art.monogram}
          </text>
        </motion.g>
        <motion.path
          d={crackD}
          fill="none"
          stroke={light}
          strokeWidth="0.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="translate(0.5 0.55)"
          opacity="0.7"
        />
        <motion.path
          d={crackD}
          fill="none"
          stroke={dark}
          strokeWidth="1.15"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

function LetterBody({
  to,
  from,
  date,
  message,
  margin,
}: {
  to: string;
  from: string;
  date?: string;
  message: string;
  margin: boolean;
}) {
  const first = to.trim().split(/\s+/)[0] ?? to;
  return (
    <div
      className={cn(
        "flex size-full flex-col gap-1 py-3.5 pl-4 [font-family:cursive] text-(--ws-hand)",
        margin ? "pr-11" : "pr-4",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] leading-5">Dear {first},</span>
        {date ? (
          <span className="shrink-0 text-[11px] leading-5 text-(--ws-faint)">
            {date}
          </span>
        ) : null}
      </div>
      <p className="text-[12px] leading-[1.45] whitespace-pre-line">
        {message}
      </p>
      <span className="self-end pr-2 text-[13px] leading-5">— {from}</span>
    </div>
  );
}

type Phase = "sealed" | "cracking" | "opening" | "open" | "sealing";

type Api = {
  open: (withSound: boolean) => void;
  reseal: (withSound: boolean) => void;
  relax: () => void;
};

/**
 * A letter folded into panels and closed with a wax seal. Pressing and
 * holding the seal cracks it: the wax gives under the thumb on the flick
 * spring and cracks spread from the exact point pressed — one runs up and
 * down to the rim along the flap's edge, three wander out to the sides, two
 * branch — each rebuilt every frame to the length the hold has reached, so
 * `hold` sets how fast they spread. Let go early and they close again.
 *
 * At full length it snaps: the wax splits along the edge crack, chips jump
 * off and fall, and the flap lifts with its half of the seal — each panel
 * rotates open about its fold on the glide spring with perspective, the next
 * one 120ms behind, while the sheet glides to stay centred — and the letter
 * reads across its creases. Reseal folds the panels back in reverse order,
 * a drop of wax falls onto the flap's edge, spreads with a wobble on the
 * recoil spring, and the monogram is pressed in.
 *
 * The seal is a real button: Enter or Space starts the same cracking, which
 * runs to the end on its own (Escape stops it), and focus moves to the open
 * letter, then back to the new seal after Reseal. Under reduced motion the
 * cracks still draw with the hold, nothing flies or unfolds: the packet and
 * the open letter cross-fade, and fresh wax fades in whole.
 */
export function WaxSeal({
  to,
  from,
  date,
  message,
  open,
  defaultOpen = false,
  onOpenChange,
  hold = 800,
  wax = "crimson",
  folds = 3,
  resealLabel = "Reseal",
  sound = false,
  disabled = false,
  className,
}: WaxSealProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const L = layoutFor(folds);
  const pigment = WAX[wax] ?? WAX.crimson;
  const holdMs = clamp(hold, 400, 1500);
  const seed = hash(`${from}|${to}`);

  const rim = React.useMemo(() => rimOf(seed), [seed]);
  const art: Art = {
    id: uid,
    rim: rim.d,
    monogram: (from.trim()[0] ?? "").toUpperCase(),
    wax: pigment.base,
  };

  const [own, setOwn] = React.useState(defaultOpen);
  const isOpen = open ?? own;
  const controlled = open !== undefined;
  const [check, setCheck] = React.useState(0);
  const [stage, setStage] = React.useState<Phase>(isOpen ? "open" : "sealed");
  const [broken, setBroken] = React.useState(isOpen);
  const [cracks, setCracks] = React.useState<Cracks>(() =>
    cracksFrom(KEY_POINT, seed, rim.radius),
  );

  const [said, setSaid] = React.useState({ n: 0, open: isOpen, text: "" });
  if (said.open !== isOpen) {
    setSaid({
      n: said.n + 1,
      open: isOpen,
      text: isOpen
        ? `Seal broken. Letter from ${from}, open.`
        : "Letter sealed.",
    });
  }

  const crack = useMotionValue(isOpen ? 1 : 0);
  const press = useMotionValue(1);
  const f0 = useMotionValue(isOpen ? 0 : 180);
  const f2 = useMotionValue(isOpen ? 0 : -180);
  const shift = useMotionValue(isOpen ? 0 : L.shift);
  const sheetO = useMotionValue(1);
  const sealO = useMotionValue(isOpen ? 0 : 1);
  const spreadX = useMotionValue(1);
  const spreadY = useMotionValue(1);
  const stampO = useMotionValue(1);
  const dropY = useMotionValue(-48);
  const dropO = useMotionValue(0);
  const chipT = useMotionValue(0);
  const resealO = useMotionValue(isOpen ? 1 : 0);

  const phase = React.useRef<Phase>(isOpen ? "open" : "sealed");
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  const detach = React.useRef<(() => void) | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const sealRef = React.useRef<HTMLButtonElement | null>(null);
  const regionRef = React.useRef<HTMLDivElement | null>(null);
  const refocus = React.useRef<"letter" | "seal" | null>(null);
  const voiced = React.useRef(false);
  const api = React.useRef<Api | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };
  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };
  const setPhase = (next: Phase) => {
    phase.current = next;
    setStage(next);
  };
  const pan = () => {
    const rect = sealRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const report = (next: boolean) => {
    if (!controlled) setOwn(next);
    onOpenChange?.(next);
    // A controlled host answers on its own schedule; once it has had its
    // turn, a host that refused gets the letter the way it asked for.
    if (controlled) React.startTransition(() => setCheck((c) => c + 1));
  };

  /** The hold begins: the wax gives and the cracks start from `at`. */
  const begin = (at: Pt, withSound: boolean) => {
    if (
      disabled ||
      (phase.current !== "sealed" && phase.current !== "cracking")
    )
      return;
    voiced.current = withSound;
    if (phase.current === "sealed") setCracks(cracksFrom(at, seed, rim.radius));
    setPhase("cracking");
    if (motionSafe) run("press", animate(press, 0.97, springs.flick));
    const left = Math.max(0.05, (1 - crack.get()) * (holdMs / 1000));
    run(
      "crack",
      animate(crack, 1, {
        duration: left,
        ease: "linear",
        onComplete: () => api.current?.open(withSound),
      }),
    );
  };

  /** Let go early: the cracks close back over the wax. */
  const relax = () => {
    if (phase.current !== "cracking") return;
    setPhase("sealed");
    run("crack", animate(crack, 0, { duration: 0.15, ease: easings.enter }));
    if (motionSafe) run("press", animate(press, 1, springs.flick));
  };

  /** The seal snaps and the letter unfolds, panel by panel. */
  const openLetter = (withSound: boolean) => {
    if (phase.current === "opening" || phase.current === "open") return;
    detach.current?.();
    detach.current = null;
    clearTimers();
    halt("crack");
    crack.set(1);
    const hadFocus = sealRef.current === document.activeElement;
    setPhase("opening");
    setBroken(true);
    sealO.set(0);
    press.set(1);
    if (withSound) {
      audio.play("snap", { pitch: pigment.pitch, gain: 0.65, pan: pan() });
    }
    if (hadFocus) refocus.current = "letter";
    if (withSound && !isOpen) report(true);
    const finish = () => {
      if (phase.current === "opening") setPhase("open");
    };
    if (!motionSafe) {
      run(
        "sheetO",
        animate(sheetO, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: () => {
            f0.set(0);
            f2.set(0);
            shift.set(0);
            resealO.set(1);
            run(
              "sheetO",
              animate(sheetO, 1, {
                duration: durations.base,
                ease: easings.enter,
                onComplete: finish,
              }),
            );
          },
        }),
      );
      return;
    }
    chipT.set(0);
    run("chips", animate(chipT, 1, { duration: 0.7, ease: "linear" }));
    later(120, () => {
      if (withSound)
        audio.play("paper", { pitch: 1.05, gain: 0.3, pan: pan() });
      run("f0", animate(f0, 0, springs.glide));
      run("shift", animate(shift, 0, springs.glide));
    });
    if (L.n === 3) {
      later(240, () => {
        if (withSound)
          audio.play("paper", { pitch: 0.9, gain: 0.26, pan: pan() });
        run("f2", animate(f2, 0, springs.glide));
      });
    } else {
      f2.set(0);
    }
    later(L.n === 3 ? 760 : 640, () => {
      run("reseal", animate(resealO, 1, { duration: durations.base }));
      finish();
    });
  };

  /** Folds it up again and pours fresh wax over the flap's edge. */
  const reseal = (withSound: boolean) => {
    if (phase.current !== "open" && phase.current !== "opening") return;
    clearTimers();
    for (const key of ["f0", "f2", "shift", "chips"]) halt(key);
    const hadFocus = Boolean(rootRef.current?.contains(document.activeElement));
    if (hadFocus) refocus.current = "seal";
    setPhase("sealing");
    resealO.set(0);
    if (withSound && isOpen) report(false);
    const sealed = () => {
      crack.set(0);
      setCracks(cracksFrom(KEY_POINT, seed, rim.radius));
      setPhase("sealed");
    };
    if (!motionSafe) {
      run(
        "sheetO",
        animate(sheetO, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: () => {
            f0.set(180);
            f2.set(L.n === 3 ? -180 : 0);
            shift.set(L.shift);
            setBroken(false);
            crack.set(0);
            spreadX.set(1);
            spreadY.set(1);
            stampO.set(1);
            run("sealO", animate(sealO, 1, { duration: durations.base }));
            run(
              "sheetO",
              animate(sheetO, 1, {
                duration: durations.base,
                ease: easings.enter,
                onComplete: sealed,
              }),
            );
          },
        }),
      );
      return;
    }
    const fold = (key: "f0" | "f2", to: number, pitch: number) => {
      if (withSound) audio.play("paper", { pitch, gain: 0.26, pan: pan() });
      run(key, animate(key === "f0" ? f0 : f2, to, springs.glide));
    };
    if (L.n === 3) {
      fold("f2", -180, 0.9);
      later(140, () => fold("f0", 180, 1.05));
    } else {
      f2.set(0);
      fold("f0", 180, 1.05);
    }
    later(L.n === 3 ? 140 : 0, () =>
      run("shift", animate(shift, L.shift, springs.glide)),
    );
    const pourAt = L.n === 3 ? 560 : 440;
    later(pourAt, () => {
      setBroken(false);
      crack.set(0);
      stampO.set(0);
      spreadX.set(0.18);
      spreadY.set(0.18);
      sealO.set(0);
      dropY.set(-48);
      dropO.set(1);
      run(
        "drop",
        animate(dropY, 0, {
          duration: 0.22,
          ease: easings.exit,
          onComplete: () => {
            dropO.set(0);
            sealO.set(1);
            run("sx", animate(spreadX, 1, springs.recoil));
            run("sy", animate(spreadY, 1, { ...springs.recoil, delay: 0.05 }));
          },
        }),
      );
    });
    later(pourAt + 520, () => {
      if (withSound) audio.play("snap", { pitch: 0.55, gain: 0.3, pan: pan() });
      press.set(0.94);
      run("press", animate(press, 1, springs.recoil));
      run(
        "stamp",
        animate(stampO, 1, { duration: durations.fast, ease: easings.enter }),
      );
    });
    later(pourAt + 760, sealed);
  };

  React.useEffect(() => {
    api.current = { open: openLetter, reseal, relax };
  });

  // What the host says. The visitor's own break or reseal is already on
  // show; a host that opens or seals the letter gets the same motion,
  // silently; a refusal is followed once the host has had its turn.
  React.useEffect(() => {
    const now = api.current;
    if (!now) return;
    const p = phase.current;
    if (isOpen && (p === "sealed" || p === "cracking")) now.open(false);
    else if (!isOpen && (p === "open" || p === "opening")) now.reseal(false);
  }, [isOpen, check]);

  // A different fold count re-lays a sealed or open letter at once.
  React.useEffect(() => {
    if (phase.current === "sealed" || phase.current === "cracking") {
      shift.set(L.shift);
      f0.set(180);
      f2.set(L.n === 3 ? -180 : 0);
    } else if (phase.current === "open") {
      shift.set(0);
      f0.set(0);
      f2.set(0);
    }
  }, [L.n, L.shift, shift, f0, f2]);

  // Focus follows the letter: into it once it is open (the sheet is always
  // there; it becomes the document), and onto the new seal button when it
  // arrives after a reseal.
  const letterOpen = stage === "open" || stage === "opening";
  React.useEffect(() => {
    if (!letterOpen || refocus.current !== "letter") return;
    refocus.current = null;
    regionRef.current?.focus({ preventScroll: true });
  }, [letterOpen]);
  const bindSeal = React.useCallback((node: HTMLButtonElement | null) => {
    sealRef.current = node;
    if (!node || refocus.current !== "seal") return;
    refocus.current = null;
    node.focus({ preventScroll: true });
  }, []);

  React.useEffect(() => {
    const interrupted = () => api.current?.relax();
    const onVisibility = () => {
      if (document.hidden) interrupted();
    };
    window.addEventListener("blur", interrupted);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", interrupted);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  React.useEffect(() => {
    const running = anims.current;
    const pending = timers.current;
    return () => {
      detach.current?.();
      detach.current = null;
      for (const c of running.values()) c.stop();
      running.clear();
      for (const t of pending) window.clearTimeout(t);
      pending.length = 0;
    };
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || phase.current !== "sealed") return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const at: Pt = [
      clamp(
        (event.clientX - rect.left - rect.width / 2) / UNIT,
        -R * 0.55,
        R * 0.55,
      ),
      clamp(
        (event.clientY - rect.top - rect.height / 2) / UNIT,
        -R * 0.55,
        R * 0.55,
      ),
    ];
    const id = event.pointerId;
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      detach.current?.();
      detach.current = null;
      api.current?.relax();
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    detach.current = () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    begin(at, true);
  };

  const crackD = useTransform(crack, (p) => crackPath(cracks.all, p));
  const fullCracks = crackPath(cracks.all, 1);
  const slideX = useTransform(shift, (s) => pct(s));
  const sealScaleX = useTransform(
    [press, spreadX] as MotionValue<number>[],
    ([p = 1, s = 1]: number[]) => r3(p * s),
  );
  const sealScaleY = useTransform(
    [press, spreadY] as MotionValue<number>[],
    ([p = 1, s = 1]: number[]) => r3(p * s),
  );

  // Three chips of wax thrown off the crack: a ballistic arc in px, solved.
  const chips = React.useMemo(() => {
    const rand = lcg(seed ^ 0x51ed270b);
    return [0, 1, 2].map((i) => {
      const at = cracks.edge[
        Math.floor(((i + 1) / 4) * cracks.edge.length)
      ] ?? [0, 0];
      return {
        x0: r2(at[0] * UNIT),
        y0: r2(at[1] * UNIT),
        vx: r2((i === 1 ? -1 : 1) * (26 + rand() * 46)),
        vy: r2(-(70 + rand() * 70)),
        spin: r2((rand() - 0.5) * 900),
        size: r2(3 + rand() * 2.5),
      };
    });
  }, [cracks, seed]);

  const pieces = [
    { key: "p0", left: 0, width: L.w0 },
    { key: "p1", left: L.w0, width: L.pw },
    ...(L.n === 3 ? [{ key: "p2", left: L.w0 + L.pw, width: L.pw }] : []),
  ];
  /** The seal's centre on the outside of the panel under the flap. */
  const underAt = L.w0 / L.pw;
  const letter = (
    <LetterBody
      to={to}
      from={from}
      date={date}
      message={message}
      margin={L.n === 2}
    />
  );
  const slice = (left: number, width: number) => (
    <div
      aria-hidden
      className="absolute inset-y-0"
      style={{ left: pct(-left / width), width: pct(1 / width) }}
    >
      {letter}
    </div>
  );
  const face = "absolute inset-0 bg-(--ws-paper) [backface-visibility:hidden]";
  const halfStyle = (x: number): React.CSSProperties => ({
    left: pct(x),
    width: SEAL_PX,
    height: SEAL_PX,
  });

  const vars = {
    "--ws-paper": `color-mix(in oklab, ${PAPER} 92%, var(--bg-0))`,
    "--ws-hand": HAND,
    "--ws-faint": FAINT,
  } as React.CSSProperties;

  const sealed = stage === "sealed" || stage === "cracking";
  const showLetter = stage === "open" || stage === "opening";

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative w-full max-w-[300px] overflow-x-clip py-3 select-none",
        disabled && "opacity-60",
        className,
      )}
      style={vars}
    >
      <motion.div
        ref={regionRef}
        role={showLetter ? "document" : "group"}
        aria-label={
          showLetter ? `Letter from ${from}` : `Sealed letter for ${to}`
        }
        tabIndex={showLetter ? -1 : undefined}
        className="relative aspect-[5/3] w-full rounded-[4px] outline-none [perspective:1400px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        style={{ x: slideX, opacity: sheetO, filter: PAPER_EDGE }}
      >
        <div className="absolute inset-0 [transform-style:preserve-3d]">
          {pieces.map((piece) => {
            const isFlap = piece.key === "p0";
            const isOuter = piece.key === "p2";
            const rotate = isFlap ? f0 : isOuter ? f2 : undefined;
            return (
              <motion.div
                key={piece.key}
                className="absolute inset-y-0 [transform-style:preserve-3d]"
                style={{
                  left: pct(piece.left),
                  width: pct(piece.width),
                  rotateY: rotate,
                  originX: isFlap ? 1 : 0,
                  z: isFlap ? 2 : isOuter ? 1 : 0,
                }}
              >
                <div
                  className={cn(
                    face,
                    "overflow-clip",
                    isFlap && "rounded-l-[4px]",
                    (isOuter || (L.n === 2 && piece.key === "p1")) &&
                      "rounded-r-[4px]",
                  )}
                >
                  {/* Under a closed flap the base panel's writing is hidden, so
                      no sliver of it shows along the fold. */}
                  {isFlap || isOuter || !sealed
                    ? slice(piece.left, piece.width)
                    : null}
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute inset-y-0 w-3",
                      isFlap
                        ? "right-0 bg-linear-to-l from-black/5 to-transparent"
                        : "left-0 bg-linear-to-r from-black/5 to-transparent",
                    )}
                  />
                  {!isFlap && !isOuter && broken && L.n === 2 ? (
                    <div
                      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                      style={halfStyle(underAt)}
                    >
                      <SealArt
                        art={art}
                        cracks={cracks}
                        crackD={fullCracks}
                        clip="b"
                      />
                    </div>
                  ) : null}
                </div>
                {isFlap || isOuter ? (
                  <div
                    className={cn(
                      face,
                      "[transform:rotateY(180deg)]",
                      // The flap's free edge throws a hairline shadow on the
                      // paper under it, so the fold reads with the seal on it.
                      isFlap
                        ? "rounded-r-[4px] shadow-[1px_0_1.5px_oklch(0.2_0.02_260/0.22)]"
                        : "rounded-l-[4px]",
                    )}
                  >
                    {isFlap ? (
                      <div className="flex size-full flex-col items-center justify-center gap-1 px-2 pr-5 text-center [font-family:cursive] text-(--ws-hand)">
                        <span className="text-[10px] leading-3 text-(--ws-faint)">
                          for
                        </span>
                        <span className="line-clamp-2 max-w-full text-[14px] leading-[1.15] break-words">
                          {to}
                        </span>
                        {date ? (
                          <span className="text-[10px] leading-3 text-(--ws-faint)">
                            {date}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {broken ? (
                      <div
                        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                        style={halfStyle(isFlap ? 1 : underAt)}
                      >
                        <SealArt
                          art={art}
                          cracks={cracks}
                          crackD={fullCracks}
                          clip={isFlap ? "a" : "b"}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </motion.div>
            );
          })}
        </div>

        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            left: pct(L.sealX),
            width: SEAL_PX,
            height: SEAL_PX,
            opacity: sealO,
          }}
        >
          <motion.div
            className="size-full"
            style={{ scaleX: sealScaleX, scaleY: sealScaleY }}
          >
            <SealArt art={art} cracks={cracks} crackD={crackD} stamp={stampO} />
          </motion.div>
        </motion.div>
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-3.5 w-3 -translate-x-1/2 -translate-y-1/2 rounded-[50%_50%_50%_50%/60%_60%_40%_40%]"
          style={{
            left: pct(L.sealX),
            y: dropY,
            opacity: dropO,
            background: pigment.base,
          }}
        />

        {sealed ? (
          <button
            ref={bindSeal}
            type="button"
            aria-label="Break the seal"
            aria-describedby={hintId}
            disabled={disabled}
            onPointerDown={onPointerDown}
            onContextMenu={(event) => event.preventDefault()}
            onClick={(event) => {
              // A click with no pointer behind it — Enter, Space, assistive
              // technology — starts the cracking, which runs to the end.
              if (event.detail === 0) begin(KEY_POINT, true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && phase.current === "cracking") {
                event.preventDefault();
                relax();
              }
            }}
            className={cn(
              "absolute top-1/2 size-11 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full outline-none [-webkit-touch-callout:none]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              disabled ? "cursor-not-allowed" : "cursor-pointer",
            )}
            style={{ left: pct(L.sealX) }}
          />
        ) : null}

        {stage === "open" ? (
          <motion.button
            type="button"
            onClick={() => reseal(true)}
            disabled={disabled}
            className={cn(
              "absolute right-2 bottom-2 inline-flex h-7 items-center gap-1.5 rounded-full border border-black/10 bg-(--ws-paper) px-2.5 text-[11px] font-medium text-(--ws-hand) outline-none",
              "hover:bg-[color-mix(in_oklab,var(--ws-paper)_90%,black)]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
            style={{ opacity: resealO }}
          >
            <svg aria-hidden viewBox="0 0 12 12" className="size-3 shrink-0">
              <path
                d="M6 1.2C6 1.2 2.6 5 2.6 7.4a3.4 3.4 0 0 0 6.8 0C9.4 5 6 1.2 6 1.2Z"
                fill={pigment.base}
              />
            </svg>
            {resealLabel}
          </motion.button>
        ) : null}

        {showLetter ? (
          <div className="sr-only">
            <p>Dear {to.trim().split(/\s+/)[0] ?? to},</p>
            {date ? <p>{date}</p> : null}
            <p>{message}</p>
            <p>— {from}</p>
          </div>
        ) : null}
      </motion.div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-clip"
      >
        {chips.map((c, i) => (
          <Chip
            key={i}
            chip={c}
            t={chipT}
            left={pct(L.shift + L.sealX)}
            wax={pigment.base}
          />
        ))}
      </div>

      <p id={hintId} className="sr-only">
        Press and hold the seal, or press Enter, to break it.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

function Chip({
  chip,
  t,
  left,
  wax,
}: {
  chip: {
    x0: number;
    y0: number;
    vx: number;
    vy: number;
    spin: number;
    size: number;
  };
  t: MotionValue<number>;
  left: string;
  wax: string;
}) {
  const T = 0.7;
  const x = useTransform(t, (v) => r2(chip.x0 + chip.vx * v * T));
  const y = useTransform(t, (v) =>
    r2(chip.y0 + chip.vy * v * T + 450 * (v * T) * (v * T)),
  );
  const rotate = useTransform(t, (v) => r2(chip.spin * v * T));
  const opacity = useTransform(t, (v) =>
    v <= 0 || v >= 1 ? 0 : r3(1 - v * v),
  );
  return (
    <motion.span
      className="absolute top-1/2"
      style={{
        left,
        x,
        y,
        rotate,
        opacity,
        width: chip.size,
        height: r2(chip.size * 0.7),
        marginLeft: r2(-chip.size / 2),
        background: wax,
        borderRadius: 1,
      }}
    />
  );
}
