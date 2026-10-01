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
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type TearPassPerforation = "round" | "slot";
export type TearPassPaper = "white" | "sky" | "sand";

export type TearPassPlace = {
  /** The three-letter code printed large, e.g. "CBK". */
  code: string;
  /** The city under it. */
  city: string;
};

export type TearPassProps = {
  /** Who flies it, printed in the pass's header. */
  carrier: string;
  /** e.g. "WL 214". */
  flight: string;
  passenger: string;
  from: TearPassPlace;
  to: TearPassPlace;
  /** As printed, e.g. "07 Oct". */
  date: string;
  /** Boarding time as printed, e.g. "08:15". */
  boards: string;
  /** Printed in split-flap tiles; a change rolls them. */
  gate: string;
  /** Printed in split-flap tiles; a change rolls them. */
  seat: string;
  /** Boarding group, printed under the seat. */
  zone?: string;
  /** The booking reference, drawn as a code on the stub's back. */
  code: string;
  /** Controlled: whether the stub has been torn off. */
  torn?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultTorn?: boolean;
  /** Fires from the drag or key that freed the stub, with true. */
  onTornChange?: (torn: boolean) => void;
  /** Round punched holes or slots along the tear. @default "round" */
  perforation?: TearPassPerforation;
  /** The card stock. @default "white" */
  paper?: TearPassPaper;
  /** The torn stub turns over to show its code; off, it cross-fades flat. @default true */
  flip?: boolean;
  /** Play the tear, the snap and the turn. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Stock = {
  paper: string;
  ink: string;
  faint: string;
  accent: string;
  fibre: string;
  tile: string;
  tileInk: string;
};

// Card stock is a physical object: fixed pigments, so a pass is the same card
// on either theme. On a dark page the paper is mixed a little toward the page
// (oklab, which keeps its hue) so it does not glare; the ink stays put.
const STOCKS: Record<TearPassPaper, Stock> = {
  white: {
    paper: "oklch(0.985 0.003 95)",
    ink: "oklch(0.24 0.02 262)",
    faint: "oklch(0.5 0.02 262)",
    accent: "oklch(0.5 0.16 262)",
    fibre: "oklch(0.7 0.012 95)",
    tile: "oklch(0.27 0.02 262)",
    tileInk: "oklch(0.97 0.01 95)",
  },
  sky: {
    paper: "oklch(0.935 0.032 228)",
    ink: "oklch(0.26 0.045 245)",
    faint: "oklch(0.47 0.045 240)",
    accent: "oklch(0.47 0.12 245)",
    fibre: "oklch(0.68 0.04 228)",
    tile: "oklch(0.29 0.05 245)",
    tileInk: "oklch(0.95 0.02 228)",
  },
  sand: {
    paper: "oklch(0.935 0.036 82)",
    ink: "oklch(0.28 0.03 55)",
    faint: "oklch(0.49 0.04 60)",
    accent: "oklch(0.5 0.12 42)",
    fibre: "oklch(0.67 0.05 80)",
    tile: "oklch(0.3 0.035 55)",
    tileInk: "oklch(0.95 0.03 82)",
  },
};

/** The paper's edge on a page of the same colour: a hairline and a soft lift. */
const PAPER_EDGE =
  "drop-shadow(0 0 0.5px oklch(0.25 0.02 260 / 0.45)) drop-shadow(0 1px 2px oklch(0.2 0.02 260 / 0.18))";

/** Radius of the half-moon notches at either end of the perforation. */
const NOTCH = 7;
/** Hole spacing along the seam, in px. */
const PITCH: Record<TearPassPerforation, number> = { round: 7, slot: 9 };
/** The bridge of paper left between two holes. */
const BRIDGE: Record<TearPassPerforation, number> = { round: 3, slot: 2 };
/** The stub's share of the pass's width; the seam sits at 1 − STUB. */
const STUB = 0.31;
/** The widest the wedge opens at the top while the stub is still attached. */
const GAP_MAX = 12;
/** Where the free stub comes to rest: a little out, down and turned. */
const REST = { x: 7, y: 4, r: 1.6 };
/** A torn fibre's frayed length once it has stopped quivering. */
const TUFT = 1.1;
/** The recoil spring's motion, solved: ω₀ = √(k/m), ζ = c / 2√(km). */
const W0 = Math.sqrt(springs.recoil.stiffness / springs.recoil.mass);
const ZETA =
  springs.recoil.damping /
  (2 * Math.sqrt(springs.recoil.stiffness * springs.recoil.mass));
const WD = W0 * Math.sqrt(1 - ZETA * ZETA);

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const r6 = (v: number) => Number(v.toFixed(6));

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

/**
 * The paper's outline as a mask: the two notches and a column of holes cut
 * into one edge. Each half of the pass carries half of every hole, so when
 * they part, both edges are scalloped where the holes were.
 */
function edgeMask(
  perforation: TearPassPerforation,
  edge: "left" | "right",
): React.CSSProperties {
  const x = edge === "right" ? "100%" : "0%";
  const hole =
    perforation === "round"
      ? `radial-gradient(circle 2px at ${x} 50%, transparent 72%, black 100%)`
      : `radial-gradient(1.5px 3.6px at ${x} 50%, transparent 72%, black 100%)`;
  const image = [
    `radial-gradient(circle ${NOTCH}px at ${x} 0%, transparent 93%, black 100%)`,
    `radial-gradient(circle ${NOTCH}px at ${x} 100%, transparent 93%, black 100%)`,
    hole,
  ].join(", ");
  return {
    maskImage: image,
    maskSize: `100% 100%, 100% 100%, 100% ${PITCH[perforation]}px`,
    maskRepeat: "no-repeat, no-repeat, repeat-y",
    maskPosition: "0 0, 0 0, 0 50%",
    maskComposite: "intersect",
  };
}

type Bridge = {
  y: number;
  /** How wide the gap gets here before its fibres let go. */
  len: number;
  /** Offsets of its fibres across the bridge. */
  fibres: number[];
  droop: number;
};

/** The paper left between the holes, where the fibres are. */
function bridgesFor(
  h: number,
  perforation: TearPassPerforation,
  seed: number,
): Bridge[] {
  if (h < NOTCH * 3) return [];
  const rand = lcg(seed);
  const pitch = PITCH[perforation];
  const span = BRIDGE[perforation];
  const out: Bridge[] = [];
  const reach = Math.ceil(h / pitch) + 1;
  for (let k = -reach; k <= reach; k += 1) {
    const y = h / 2 + (k + 0.5) * pitch;
    if (y < NOTCH + 1 || y > h - NOTCH - 1) continue;
    const count = rand() > 0.55 ? 3 : 2;
    const fibres: number[] = [];
    for (let i = 0; i < count; i += 1) {
      fibres.push(r2((rand() - 0.5) * span));
    }
    out.push({
      y: r2(y),
      len: r2(2.6 + rand() * 4.8),
      fibres,
      droop: r2((rand() - 0.5) * 1.4),
    });
  }
  return out.sort((a, b) => a.y - b.y);
}

/** A seeded 2D code from the booking reference: three finders and noise. */
function codeMatrix(code: string, n = 21): string {
  const rand = lcg(hash(`code:${code}`));
  const finder = (x: number, y: number) => {
    for (const [cx, cy] of [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ] as const) {
      if (x >= cx - 1 && x <= cx + 7 && y >= cy - 1 && y <= cy + 7) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return 0;
        const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        return ring === 3 || ring <= 1 ? 1 : 0;
      }
    }
    return -1;
  };
  let d = "";
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const f = finder(x, y);
      const on = f === -1 ? rand() > 0.5 : f === 1;
      if (on) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return d;
}

const FLAP_ALPHABET = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
/** The most characters a tile rolls through on one change. */
const FLAP_STEPS = 7;

/** The character a tile shows next on its way from `from` to `to`. */
function nextFlap(from: string, to: string): string {
  const n = FLAP_ALPHABET.length;
  const a = FLAP_ALPHABET.indexOf(from);
  const b = FLAP_ALPHABET.indexOf(to);
  if (a < 0 || b < 0) return to;
  const ahead = (b - a + n) % n;
  if (ahead > FLAP_STEPS)
    return FLAP_ALPHABET[(b - FLAP_STEPS + 1 + n) % n] ?? to;
  return FLAP_ALPHABET[(a + 1) % n] ?? to;
}

function FlapHalf({ char, half }: { char: string; half: "top" | "bottom" }) {
  return (
    <span
      className={cn(
        "absolute inset-x-0 h-1/2 overflow-clip",
        half === "top" ? "top-0" : "bottom-0",
      )}
    >
      <span
        className={cn(
          "block h-[1.4em] text-center leading-[1.4em]",
          half === "bottom" && "-translate-y-1/2",
        )}
      >
        {char === " " ? " " : char}
      </span>
    </span>
  );
}

/**
 * One split-flap tile. A change rolls it forward a character at a time: the
 * top half of the old character falls toward the viewer on an accelerating
 * tween and the next is under it. Each step re-runs the effect, so a
 * StrictMode re-run simply carries on from the character on show.
 */
function FlapTile({ char, motionSafe }: { char: string; motionSafe: boolean }) {
  const [shown, setShown] = React.useState(char);
  const [fallen, setFallen] = React.useState({ step: 0, char });

  React.useEffect(() => {
    if (shown === char || !motionSafe) return;
    const timer = window.setTimeout(() => {
      setFallen((f) => ({ step: f.step + 1, char: shown }));
      setShown(nextFlap(shown, char));
    }, 64);
    return () => window.clearTimeout(timer);
  }, [char, shown, motionSafe]);

  // Under reduced motion the tile shows the new character at once.
  const face = motionSafe ? shown : char;

  return (
    <span className="relative inline-block h-[1.4em] w-[0.95em] rounded-[3px] bg-(--tp-tile) font-mono text-(--tp-tile-ink) [perspective:6em]">
      <FlapHalf char={face} half="top" />
      <FlapHalf char={face} half="bottom" />
      {motionSafe && fallen.step > 0 ? (
        <motion.span
          key={fallen.step}
          className="absolute inset-x-0 top-0 h-1/2 overflow-clip rounded-t-[3px] bg-(--tp-tile) [backface-visibility:hidden]"
          style={{ originY: 1 }}
          initial={{ rotateX: 0 }}
          animate={{ rotateX: -90 }}
          transition={{ duration: 0.06, ease: easings.exit }}
        >
          <span className="block h-[1.4em] text-center leading-[1.4em]">
            {fallen.char === " " ? " " : fallen.char}
          </span>
        </motion.span>
      ) : null}
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-(--tp-tile)" />
    </span>
  );
}

function Flaps({
  text,
  motionSafe,
  className,
}: {
  text: string;
  motionSafe: boolean;
  className?: string;
}) {
  const chars = text.toUpperCase().split("");
  return (
    <span aria-hidden className={cn("inline-flex gap-[2px]", className)}>
      {chars.map((c, i) => (
        <FlapTile key={i} char={c} motionSafe={motionSafe} />
      ))}
    </span>
  );
}

function CarrierMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={className}>
      <circle cx="8" cy="8" r="7.5" className="fill-(--tp-accent)" />
      <path
        d="M3.2 10.4C5.6 6.6 9 5.3 12.9 5.9M4.6 12.2c2.3-2.6 4.9-3.6 8-3.4"
        fill="none"
        strokeWidth="1.3"
        strokeLinecap="round"
        className="stroke-(--tp-paper)"
      />
    </svg>
  );
}

function PlaneLine({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("flex items-center gap-1", className)}>
      <span className="h-px flex-1 border-t border-dashed border-(--tp-faint) opacity-60" />
      <svg
        viewBox="0 0 16 16"
        className="size-3.5 shrink-0 @min-[440px]:size-4"
      >
        <path
          d="M14.6 8 10 9 7.2 14.4H6L7.4 9 3.6 8.8 2.3 10.4H1.4L2 8 1.4 5.6h.9l1.3 1.6L7.4 7 6 1.6h1.2L10 7l4.6 1z"
          className="fill-(--tp-accent)"
        />
      </svg>
      <span className="h-px flex-1 border-t border-dashed border-(--tp-faint) opacity-60" />
    </span>
  );
}

function Field({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="font-mono text-[8px] leading-3 tracking-[0.1em] text-(--tp-faint) uppercase @min-[440px]:text-[9px]">
        {label}
      </dt>
      <dd
        className="truncate text-[11px] leading-4 font-semibold @min-[440px]:text-[13px] @min-[440px]:leading-5"
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function Place({
  place,
  end = false,
}: {
  place: TearPassPlace;
  end?: boolean;
}) {
  return (
    <div className={cn("flex min-w-0 shrink-0 flex-col", end && "items-end")}>
      <span className="font-mono text-[22px] leading-none font-semibold tracking-tight @min-[440px]:text-[34px]">
        {place.code}
      </span>
      <span
        className="mt-1 max-w-24 truncate text-[9px] leading-3 text-(--tp-faint) @min-[440px]:max-w-32 @min-[440px]:text-[11px] @min-[440px]:leading-4"
        title={place.city}
      >
        {place.city}
      </span>
    </div>
  );
}

function StubFace({
  gate,
  seat,
  zone,
  motionSafe,
  hint,
}: {
  gate: string;
  seat: string;
  zone?: string;
  motionSafe: boolean;
  hint: boolean;
}) {
  const label =
    "font-mono text-[8px] leading-3 tracking-[0.1em] text-(--tp-faint) uppercase @min-[440px]:text-[9px]";
  return (
    <div className="flex size-full flex-col justify-between gap-1.5 px-3 pt-3.5 pb-2.5 @min-[440px]:px-4 @min-[440px]:pt-5 @min-[440px]:pb-4">
      <div className="flex flex-col gap-2 @min-[440px]:gap-3">
        <div className="flex flex-col gap-1">
          <span className={label}>Gate</span>
          <span className="sr-only">{gate}</span>
          <Flaps
            text={gate}
            motionSafe={motionSafe}
            className="text-[12px] font-semibold @min-[440px]:text-[17px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className={label}>Seat</span>
          <span className="sr-only">{seat}</span>
          <Flaps
            text={seat}
            motionSafe={motionSafe}
            className="text-[12px] font-semibold @min-[440px]:text-[17px]"
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        {zone ? (
          <span className="truncate text-[10px] leading-4 font-semibold @min-[440px]:text-[11px]">
            <span className={cn(label, "mr-1")}>Zone</span>
            {zone}
          </span>
        ) : (
          <span />
        )}
        {hint ? (
          <span
            aria-hidden
            className="hidden shrink-0 items-center gap-1 font-mono text-[8px] tracking-[0.1em] text-(--tp-faint) uppercase @min-[440px]:flex"
          >
            <svg viewBox="0 0 10 10" className="size-2.5">
              <path
                d="M5 1v7M2.2 5.4 5 8.2l2.8-2.8"
                fill="none"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-(--tp-faint)"
              />
            </svg>
            Tear
          </span>
        ) : null}
      </div>
    </div>
  );
}

function StubBack({
  code,
  gate,
  seat,
  matrix,
}: {
  code: string;
  gate: string;
  seat: string;
  matrix: string;
}) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-1.5 p-2.5 @min-[440px]:gap-2 @min-[440px]:p-4">
      <span className="font-mono text-[8px] leading-3 tracking-[0.1em] text-(--tp-faint) uppercase @min-[440px]:text-[9px]">
        <span className="@min-[440px]:hidden">Code</span>
        <span className="hidden @min-[440px]:inline">Boarding code</span>
      </span>
      <svg
        role="img"
        aria-label={`Boarding code ${code}`}
        viewBox="-1 -1 23 23"
        shapeRendering="crispEdges"
        className="size-16 shrink-0 @min-[440px]:size-[100px]"
      >
        <rect
          x="-1"
          y="-1"
          width="23"
          height="23"
          className="fill-(--tp-paper)"
        />
        <path d={matrix} className="fill-(--tp-ink)" />
      </svg>
      <span className="font-mono text-[10px] leading-4 font-semibold tracking-[0.14em] @min-[440px]:text-[12px]">
        {code}
      </span>
      <span
        aria-hidden
        className="hidden font-mono text-[9px] leading-3 tracking-[0.08em] whitespace-nowrap text-(--tp-faint) uppercase @min-[440px]:block"
      >
        Gate {gate} · Seat {seat}
      </span>
    </div>
  );
}

type Phase = "whole" | "free";

type Api = {
  draw: (now?: number) => void;
  sweep: (voiced: boolean) => void;
  heal: () => void;
  /** The tear has reached the bottom notch on its own (keys, a throw). */
  sweepDone: () => void;
};

/**
 * A boarding pass whose stub tears off along its perforation. The holes are
 * real holes (the paper is masked), half on each side of the seam. Pressing
 * on the stub and dragging down runs the tear down the seam 1:1 with the
 * finger, and the torn part of the stub peels outward about the tear front —
 * a shear with its origin on the seam at the front, applied to a copy of the
 * stub clipped above the front, so the paper below never moves. Pulling
 * outward opens the wedge further, rubber-banded. In the bridges between the
 * holes the fibres stretch taut across the gap and, past each bridge's seeded
 * break length, snap and spring back to their own edges as frayed tufts that
 * quiver twice (the recoil spring, solved analytically, drawn by a frame loop
 * that runs only while one is moving).
 *
 * Let go short and the throw is projected: far enough, the tear finishes on
 * the glide spring with the release velocity; otherwise the wedge closes on
 * snap and the tear stays where it got to. At the bottom notch the stub comes
 * free in the hand, follows the finger, lands a little out and turned on the
 * recoil spring and turns over (glide, with perspective) to show its code.
 * Gate and seat sit in split-flap tiles that roll through to a new value.
 *
 * The stub is a real button: Enter or Space tears it from the top on a timed
 * sweep with the same fibres and sounds, and once it is free the same button
 * turns it over and back. Under reduced motion nothing shears, flies or
 * turns: the tear line still follows the finger, the free stub stands apart
 * at once, the code cross-fades in and the tiles swap.
 */
export function TearPass({
  carrier,
  flight,
  passenger,
  from,
  to,
  date,
  boards,
  gate,
  seat,
  zone,
  code,
  torn,
  defaultTorn = false,
  onTornChange,
  perforation = "round",
  paper = "white",
  flip = true,
  sound = false,
  disabled = false,
  className,
}: TearPassProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const perf: TearPassPerforation = perforation === "slot" ? "slot" : "round";
  const stock = STOCKS[paper] ?? STOCKS.white;
  const seed = hash(`${code}|${perf}`);
  const turnIn3d = flip && motionSafe;

  const [own, setOwn] = React.useState(defaultTorn);
  const isTorn = torn ?? own;
  const controlled = torn !== undefined;
  const [freed, setFreed] = React.useState(isTorn);
  const [turned, setTurned] = React.useState(isTorn);
  const [check, setCheck] = React.useState(0);
  const [size, setSize] = React.useState({ w: 0, h: 0 });

  const [said, setSaid] = React.useState({
    n: 0,
    gate,
    seat,
    torn: isTorn,
    text: "",
  });
  if (said.gate !== gate || said.seat !== seat || said.torn !== isTorn) {
    const parts: string[] = [];
    if (said.torn !== isTorn) {
      parts.push(
        isTorn ? `Stub torn off. Boarding code ${code}.` : "New boarding pass.",
      );
    }
    if (said.gate !== gate) parts.push(`Gate changed to ${gate}.`);
    if (said.seat !== seat) parts.push(`Seat changed to ${seat}.`);
    setSaid({ n: said.n + 1, gate, seat, torn: isTorn, text: parts.join(" ") });
  }

  const frac = useMotionValue(isTorn ? 1 : 0);
  const gap = useMotionValue(0);
  const stubX = useMotionValue(isTorn ? REST.x : 0);
  const stubY = useMotionValue(isTorn && motionSafe ? REST.y : 0);
  const stubR = useMotionValue(isTorn && motionSafe ? REST.r : 0);
  const turn = useMotionValue(isTorn && flip ? 180 : 0);
  const fade = useMotionValue(isTorn && !flip ? 1 : 0);
  const fibresD = useMotionValue("");
  const tuftsD = useMotionValue("");
  const seamD = useMotionValue("");

  const rowRef = React.useRef<HTMLDivElement | null>(null);
  const sizeRef = React.useRef({ w: 0, h: 0 });
  const phase = React.useRef<Phase>(isTorn ? "free" : "whole");
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  const loop = React.useRef(0);
  const broken = React.useRef<number[]>([]);
  const bridges = React.useRef<Bridge[]>([]);
  const voiced = React.useRef(false);
  const lastPaper = React.useRef(0);
  const drag = React.useRef<{
    startFrac: number;
    /** Where the pointer was, and where the stub stood, when it came free. */
    freeFrom: { x: number; y: number } | null;
    base: { x: number; y: number };
    /** The stub was already free when this drag began: it is only moved. */
    wasFree: boolean;
  } | null>(null);
  const api = React.useRef<Api | null>(null);

  const matrix = React.useMemo(() => codeMatrix(code), [code]);

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

  const seamPan = () => {
    const rect = rowRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width * (1 - STUB), null) : 0;
  };

  /** One crinkle per bridge that lets go, never faster than the ear can split. */
  const crinkle = (y: number, h: number) => {
    if (!voiced.current) return;
    const now = performance.now();
    if (now - lastPaper.current < 45) return;
    lastPaper.current = now;
    audio.play("paper", {
      pitch: r2(1.25 - 0.4 * (y / Math.max(1, h))),
      gain: 0.3,
      pan: seamPan(),
    });
  };

  /**
   * Rebuilds the fibres, the tufts and the torn hairline from the tear's
   * motion values. A bridge whose gap has passed its break length snaps here,
   * which is also where it is heard.
   */
  const draw = (now = performance.now()) => {
    const { h } = sizeRef.current;
    if (h < 1) return;
    const front = frac.get() * h;
    const g = gap.get();
    const free = phase.current === "free";
    const list = bridges.current;
    let fibres = "";
    let tufts = "";
    let seam = "";
    let moving = false;
    list.forEach((b, i) => {
      if (b.y >= front && !free) return;
      const at = front > 0.5 ? (g * (front - b.y)) / front : 0;
      let t = broken.current[i] ?? Number.NaN;
      if (Number.isNaN(t)) {
        if (at <= b.len) {
          if (at > 0.3) {
            for (const dy of b.fibres) {
              fibres += `M0 ${r2(b.y + dy)}L${r2(at)} ${r2(b.y + dy * 0.5)}`;
            }
          }
          return;
        }
        t = now;
        broken.current[i] = t;
        crinkle(b.y, h);
      }
      const age = (now - t) / 1000;
      const s = age < 0.9 ? Math.exp(-ZETA * W0 * age) * Math.cos(WD * age) : 0;
      if (age < 0.9) moving = true;
      const len = Math.max(0.4, TUFT + (b.len / 2 - TUFT) * s);
      for (const dy of b.fibres) {
        const y = b.y + dy;
        tufts += `M0 ${r2(y)}l${r2(len)} ${r2(b.droop * (len / 3))}`;
        if (!free) {
          tufts += `M${r2(at)} ${r2(y)}l${r2(-len)} ${r2(-b.droop * (len / 3))}`;
        }
      }
    });
    if (!free && front > NOTCH) {
      // Where the wedge has closed again, the tear shows as a ragged hairline.
      const rand = lcg(seed ^ 0x9e3779b9);
      const pts: string[] = [];
      for (let y = NOTCH; y <= front; y += 3) {
        const at = (g * (front - y)) / front;
        const jitter = (rand() - 0.5) * 0.7;
        if (at < 1.2) pts.push(`${r2(at / 2 + jitter)} ${r2(y)}`);
        else if (pts.length > 1) {
          seam += `M${pts.join("L")}`;
          pts.length = 0;
        } else pts.length = 0;
      }
      if (pts.length > 1) seam += `M${pts.join("L")}`;
    }
    fibresD.set(fibres);
    tuftsD.set(tufts);
    seamD.set(seam);
    if (moving && !loop.current) {
      loop.current = window.requestAnimationFrame(() => {
        loop.current = 0;
        if (document.hidden) return;
        api.current?.draw();
      });
    }
  };

  const reportTorn = (next: boolean) => {
    if (!controlled) setOwn(next);
    onTornChange?.(next);
    // A controlled host answers on its own schedule; once it has had its
    // turn, a host that refused gets the pass it asked for.
    if (controlled) React.startTransition(() => setCheck((c) => c + 1));
  };

  const showBack = (back: boolean, withSound: boolean) => {
    setTurned(back);
    if (withSound) {
      audio.play("paper", { pitch: 0.72, gain: 0.22, pan: seamPan() });
    }
    if (turnIn3d) {
      run("turn", animate(turn, back ? 180 : 0, springs.glide));
      fade.set(0);
    } else {
      turn.set(0);
      run(
        "fade",
        animate(fade, back ? 1 : 0, {
          duration: durations.base,
          ease: easings.enter,
        }),
      );
    }
  };

  /** The stub lands where a torn stub rests, then (once) shows its code. */
  const land = (vx = 0, vy = 0, turnOver = true) => {
    if (!motionSafe) {
      stubX.set(REST.x);
      stubY.set(0);
      stubR.set(0);
      gap.set(0);
      if (turnOver) showBack(true, false);
      return;
    }
    run("gap", animate(gap, 0, springs.flick));
    run("x", animate(stubX, REST.x, { ...springs.recoil, velocity: vx }));
    run("y", animate(stubY, REST.y, { ...springs.recoil, velocity: vy }));
    run("r", animate(stubR, REST.r, springs.recoil));
    if (turnOver) later(260, () => showBack(true, false));
  };

  /** The tear has reached the bottom notch: the stub is free. */
  const free = (holding: boolean) => {
    if (phase.current === "free") return;
    phase.current = "free";
    halt("frac");
    halt("sweep");
    frac.set(1);
    const now = performance.now();
    broken.current = bridges.current.map((_, i) => {
      const t = broken.current[i];
      return t === undefined || Number.isNaN(t) ? (motionSafe ? now : -1e9) : t;
    });
    setFreed(true);
    if (voiced.current) {
      audio.play("snap", {
        pitch: perf === "slot" ? 0.88 : 1,
        gain: 0.6,
        pan: seamPan(),
      });
    }
    draw(now);
    if (!holding) land();
    if (voiced.current && !isTorn) reportTorn(true);
  };

  /** The tear from the top, by itself: the keys' path, and the host's. */
  const sweep = (withSound: boolean) => {
    if (phase.current === "free") return;
    voiced.current = withSound;
    halt("gap");
    const start = frac.get();
    const { h } = sizeRef.current;
    if (!motionSafe || h < 1) {
      free(false);
      return;
    }
    run(
      "sweep",
      animate(start, 1, {
        duration: 0.12 + 0.5 * (1 - start),
        ease: easings.move,
        onUpdate: (v) => {
          frac.set(r6(v));
          gap.set(r2(Math.min(9, v * h * 0.09)));
          if (v * h >= h - NOTCH) api.current?.sweepDone();
        },
        onComplete: () => api.current?.sweepDone(),
      }),
    );
  };

  /** A whole pass again: the stub comes back, the perforation is whole. */
  const heal = () => {
    clearTimers();
    for (const c of anims.current.values()) c.stop();
    anims.current.clear();
    phase.current = "whole";
    drag.current = null;
    setFreed(false);
    setTurned(false);
    voiced.current = false;
    const reset = () => {
      frac.set(0);
      gap.set(0);
      broken.current = [];
      draw();
    };
    if (!motionSafe) {
      turn.set(0);
      fade.set(0);
      stubX.set(0);
      stubY.set(0);
      stubR.set(0);
      reset();
      return;
    }
    run("turn", animate(turn, 0, springs.glide));
    run("fade", animate(fade, 0, { duration: durations.fast }));
    run("x", animate(stubX, 0, springs.glide));
    run("y", animate(stubY, 0, springs.glide));
    run("r", animate(stubR, 0, { ...springs.glide, onComplete: reset }));
  };

  React.useEffect(() => {
    api.current = { draw, sweep, heal, sweepDone: () => free(false) };
  });

  // What the host says. A tear the visitor made is already on show; a host
  // that tears the pass gets the same sweep, silently; a pass handed back
  // whole (a new pass, or a refusal) heals.
  React.useEffect(() => {
    const now = api.current;
    if (!now) return;
    if (isTorn && phase.current !== "free") now.sweep(false);
    else if (!isTorn && phase.current === "free") now.heal();
  }, [isTorn, check]);

  // Reduced motion or `flip` changed under a turned stub: the same side stays
  // on show in the other mode.
  React.useEffect(() => {
    halt("turn");
    halt("fade");
    turn.set(turned && turnIn3d ? 180 : 0);
    fade.set(turned && !turnIn3d ? 1 : 0);
    // Only a change of mode re-seats the stub; the turns themselves animate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnIn3d]);

  // The pass's size, bound to the row when it arrives: the bridges and the
  // fibres are laid out in its pixels.
  const bindRow = React.useCallback((node: HTMLDivElement | null) => {
    rowRef.current = node;
    if (!node) return;
    const measure = () => {
      const w = Math.round(node.clientWidth);
      const h = Math.round(node.clientHeight);
      if (w === sizeRef.current.w && h === sizeRef.current.h) return;
      sizeRef.current = { w, h };
      setSize({ w, h });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    bridges.current = bridgesFor(size.h, perf, seed);
    broken.current = bridges.current.map(() =>
      phase.current === "free" ? -1e9 : Number.NaN,
    );
    api.current?.draw();
  }, [size.h, perf, seed]);

  React.useEffect(() => {
    const redraw = () => api.current?.draw();
    const offs = [frac.on("change", redraw), gap.on("change", redraw)];
    return () => {
      for (const off of offs) off();
    };
  }, [frac, gap]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
      if (loop.current) window.cancelAnimationFrame(loop.current);
      loop.current = 0;
    };
  }, []);

  const gesture = useDrag({
    threshold: 4,
    disabled,
    onStart: () => {
      clearTimers();
      halt("sweep");
      voiced.current = true;
      const wasFree = phase.current === "free";
      if (wasFree) {
        halt("x");
        halt("y");
        halt("r");
      }
      drag.current = {
        startFrac: frac.get(),
        freeFrom: wasFree ? { x: 0, y: 0 } : null,
        base: { x: stubX.get(), y: stubY.get() },
        wasFree,
      };
    },
    onMove: ({ offset }) => {
      const d = drag.current;
      const { h } = sizeRef.current;
      if (!d || h < 1) return;
      if (phase.current === "free") {
        // In the hand: 1:1 with the finger, held inside the card's margin.
        const o = d.freeFrom ?? { x: 0, y: 0 };
        if (!motionSafe) return;
        stubX.set(r2(rubberClamp(d.base.x + offset.x - o.x, -4, 10, 2)));
        stubY.set(r2(rubberClamp(d.base.y + offset.y - o.y, -4, 6, 4)));
        return;
      }
      // A tear never heals: the front only goes down.
      const next = clamp(d.startFrac + offset.y / h, frac.get(), 1);
      frac.set(r6(next));
      if (motionSafe) {
        const base = Math.min(10, next * h * 0.1);
        const pull = Math.max(0, offset.x) * 0.5;
        gap.set(r2(rubberClamp(base + pull, 0, GAP_MAX, GAP_MAX)));
      }
      if (next * h >= h - NOTCH) {
        free(true);
        d.freeFrom = { x: offset.x, y: offset.y };
        d.base = { x: stubX.get(), y: stubY.get() };
        if (motionSafe) {
          // The shear lets go into the hand: the stub's top was out by the
          // gap, now the whole stub is, and it follows from there.
          run("gap", animate(gap, 0, springs.flick));
        }
      }
    },
    onEnd: ({ velocity }) => {
      const d = drag.current;
      drag.current = null;
      const { h } = sizeRef.current;
      if (!d || h < 1) return;
      if (phase.current === "free") {
        land(velocity.x, velocity.y, !d.wasFree);
        return;
      }
      const landing = project(frac.get() * h, velocity.y, 0.99);
      if (landing >= h * 0.85) {
        if (!motionSafe) {
          free(false);
          return;
        }
        run(
          "frac",
          animate(frac, 1, {
            ...springs.glide,
            velocity: velocity.y / h,
            onUpdate: (v) => {
              if (v * h >= h - NOTCH) api.current?.sweepDone();
            },
          }),
        );
        return;
      }
      run("gap", animate(gap, 0, springs.snap));
    },
    onCancel: () => {
      const d = drag.current;
      drag.current = null;
      if (phase.current === "free") {
        land(0, 0, !d?.wasFree);
        return;
      }
      run("gap", animate(gap, 0, springs.snap));
    },
    onTap: () => {
      if (phase.current === "free") {
        showBack(!turned, true);
        return;
      }
      // A tap is a hint, not a tear: a begun tear gapes and closes again;
      // a whole stub gives a small tug at the seam.
      if (!motionSafe) return;
      if (frac.get() * sizeRef.current.h > NOTCH * 2) {
        run(
          "gap",
          animate(gap, [gap.get(), 4, 0], {
            duration: durations.slow,
            ease: easings.move,
          }),
        );
        return;
      }
      run(
        "x",
        animate(stubX, [stubX.get(), 2.5, 0], {
          duration: durations.slow,
          ease: easings.move,
        }),
      );
    },
  });

  const skew = useTransform(
    [frac, gap] as MotionValue<number>[],
    ([f = 0, g = 0]: number[]) => {
      const front = f * sizeRef.current.h;
      return front > 0.5 ? r3((-Math.atan(g / front) * 180) / Math.PI) : 0;
    },
  );
  const upperClip = useTransform(
    frac,
    (f) => `inset(0 0 ${r3((1 - f) * 100)}% 0)`,
  );
  // The paper under the front reaches a pixel above it, behind the torn
  // copy, so the two never leave an anti-aliased seam between them.
  const lowerClip = useTransform(
    frac,
    (f) => `inset(max(0px, calc(${r3(f * 100)}% - 1px)) 0 0 0)`,
  );
  const faceOpacity = useTransform(fade, (v) => r3(1 - v));
  const backTurn = turnIn3d ? 180 : 0;

  const vars = {
    "--tp-paper": `color-mix(in oklab, ${stock.paper} 92%, var(--bg-0))`,
    "--tp-ink": stock.ink,
    "--tp-faint": stock.faint,
    "--tp-accent": stock.accent,
    "--tp-fibre": stock.fibre,
    "--tp-tile": stock.tile,
    "--tp-tile-ink": stock.tileInk,
  } as React.CSSProperties;

  const stubLayer =
    "absolute inset-0 overflow-clip rounded-r-[10px] bg-(--tp-paper) text-(--tp-ink)";
  const band = "absolute inset-x-0 top-0 h-1.5 bg-(--tp-accent)";

  const buttonLabel = !freed
    ? "Tear off the stub"
    : turned
      ? "Show seat and gate"
      : "Show the boarding code";

  return (
    <div
      className={cn(
        "@container w-full max-w-[584px] px-3 py-4 select-none",
        disabled && "opacity-50",
        className,
      )}
      style={vars}
    >
      <div
        ref={bindRow}
        role="group"
        aria-label={`Boarding pass, ${from.code} to ${to.code}`}
        className="relative flex w-full @min-[440px]:aspect-[3/1]"
        style={{ filter: PAPER_EDGE }}
      >
        <div
          className="relative flex min-w-0 flex-1 flex-col justify-between gap-2.5 overflow-clip rounded-l-[10px] bg-(--tp-paper) px-3 pt-3.5 pb-3 text-(--tp-ink) @min-[440px]:px-5 @min-[440px]:pt-5 @min-[440px]:pb-4"
          style={edgeMask(perf, "right")}
        >
          <span aria-hidden className={band} />
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <CarrierMark className="size-3.5 shrink-0 @min-[440px]:size-4" />
              <span className="truncate text-[10px] leading-4 font-semibold tracking-[0.06em] uppercase @min-[440px]:text-[11px]">
                {carrier}
              </span>
            </span>
            <span className="hidden shrink-0 font-mono text-[9px] leading-3 tracking-[0.12em] text-(--tp-faint) uppercase @min-[440px]:inline">
              Boarding pass
            </span>
          </div>
          <div className="flex items-end gap-2 @min-[440px]:gap-4">
            <Place place={from} />
            <PlaneLine className="mb-4 min-w-6 flex-1 @min-[440px]:mb-5" />
            <Place place={to} end />
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 @min-[440px]:grid-cols-4 @min-[440px]:gap-x-4">
            <Field label="Passenger" value={passenger} />
            <Field label="Flight" value={flight} />
            <Field label="Date" value={date} />
            <Field label="Boards" value={boards} />
          </dl>
        </div>

        <div className="relative w-[31%] shrink-0">
          <motion.div
            className="absolute inset-0 [perspective:1200px]"
            style={{ x: stubX, y: stubY, rotate: stubR }}
          >
            <motion.div
              className="relative size-full [transform-style:preserve-3d]"
              style={{ rotateY: turn }}
            >
              <motion.div
                className="absolute inset-0 [backface-visibility:hidden]"
                style={{ opacity: faceOpacity }}
              >
                <motion.div
                  className={stubLayer}
                  style={{ ...edgeMask(perf, "left"), clipPath: lowerClip }}
                >
                  <span aria-hidden className={band} />
                  <StubFace
                    gate={gate}
                    seat={seat}
                    zone={zone}
                    motionSafe={motionSafe}
                    hint={!freed}
                  />
                </motion.div>
                <motion.div
                  aria-hidden
                  className={stubLayer}
                  style={{
                    ...edgeMask(perf, "left"),
                    clipPath: upperClip,
                    skewX: skew,
                    originX: 0,
                    originY: frac,
                  }}
                >
                  <span className={band} />
                  <StubFace
                    gate={gate}
                    seat={seat}
                    zone={zone}
                    motionSafe={motionSafe}
                    hint={!freed}
                  />
                </motion.div>
              </motion.div>
              <motion.div
                className="absolute inset-0 overflow-clip rounded-l-[10px] bg-(--tp-paper) text-(--tp-ink) [backface-visibility:hidden]"
                style={{
                  ...edgeMask(perf, "right"),
                  rotateY: backTurn,
                  opacity: turnIn3d ? 1 : fade,
                }}
              >
                <span aria-hidden className={band} />
                <StubBack code={code} gate={gate} seat={seat} matrix={matrix} />
              </motion.div>
            </motion.div>
            <button
              type="button"
              aria-label={buttonLabel}
              aria-describedby={freed ? undefined : hintId}
              disabled={disabled}
              onClick={(event) => {
                // Pointer tears arrive through the drag. A click with no
                // pointer behind it — Enter, Space, assistive technology —
                // tears from the top, or turns a free stub over.
                if (event.detail !== 0) return;
                if (phase.current === "free") showBack(!turned, true);
                else sweep(true);
              }}
              {...gesture}
              className={cn(
                "absolute inset-y-0 right-0 -left-1.5 touch-pan-x rounded-r-[10px] outline-none [-webkit-touch-callout:none]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                disabled
                  ? "cursor-not-allowed"
                  : freed
                    ? "cursor-pointer"
                    : "cursor-grab active:cursor-grabbing",
              )}
            />
          </motion.div>
        </div>

        {size.h > 0 ? (
          <svg
            aria-hidden
            width={24}
            height={size.h}
            viewBox={`0 0 24 ${size.h}`}
            className="pointer-events-none absolute top-0 left-[69%] overflow-visible"
            fill="none"
            strokeLinecap="round"
          >
            <motion.path
              d={seamD}
              strokeWidth={0.7}
              className="stroke-(--tp-faint) opacity-50"
            />
            <motion.path
              d={fibresD}
              strokeWidth={0.45}
              className="stroke-(--tp-fibre)"
            />
            <motion.path
              d={tuftsD}
              strokeWidth={0.6}
              className="stroke-(--tp-fibre)"
            />
          </svg>
        ) : null}
      </div>

      <p id={hintId} className="sr-only">
        Drag down the perforation, or press Enter, to tear off the stub.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
