"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FormationName = "ring" | "spiral" | "globe" | "grid";

export type FormationFlightItem = {
  /** An image URL; without one a small landscape is drawn in code. */
  src?: string;
  /** What the picture shows, for assistive technology. */
  alt: string;
  /** A short title, read with the picture and shown under hover. */
  caption?: string;
};

export type FormationFlightProps = {
  /** The cards in the flock. @default twenty-four photographs drawn in code */
  items?: FormationFlightItem[];
  /** Controlled: the formation the flock holds. */
  formation?: FormationName;
  /** Initial formation when uncontrolled. @default "ring" */
  defaultFormation?: FormationName;
  /** Fires from the picker or the keys that asked for a new formation. */
  onFormationChange?: (formation: FormationName) => void;
  /** Which formations the picker offers, in order. @default ["ring", "spiral", "globe", "grid"] */
  formations?: FormationName[];
  /** How tightly the flock holds together in flight, 0 (a loose stream) to 1 (one body). @default 0.6 */
  cohesion?: number;
  /** How hard cards roll into their turns, 0 (flat) to 1. @default 0.6 */
  bank?: number;
  /** Idle turn of the ring, spiral and globe, degrees a second; 0 holds them still. @default 6 */
  spin?: number;
  /** Card size, 0.6 to 1.6. @default 1 */
  cardSize?: number;
  /** A flight's length at default cohesion, ms. @default 1400 */
  flightTime?: number;
  /** Show the formation picker. @default true */
  showPicker?: boolean;
  /** A card was chosen with a click or Enter. */
  onSelect?: (index: number) => void;
  /** The flock's accessible name. @default "Photo flock" */
  label?: string;
  /** Hold the idle turn. A flight still flies. @default false */
  paused?: boolean;
  /** The picker and the cards take no input. @default false */
  disabled?: boolean;
  className?: string;
};

const ALL: FormationName[] = ["ring", "spiral", "globe", "grid"];
const NAMES: Record<FormationName, string> = {
  ring: "Ring",
  spiral: "Spiral",
  globe: "Globe",
  grid: "Grid",
};

/** Seasons for the drawn photographs: sky top, sky low, sun, far hill, near hill. */
const PHOTO: string[][] = [
  [
    "oklch(0.72 0.09 235)",
    "oklch(0.9 0.05 80)",
    "oklch(0.95 0.08 90)",
    "oklch(0.62 0.08 160)",
    "oklch(0.48 0.09 150)",
  ],
  [
    "oklch(0.6 0.12 30)",
    "oklch(0.84 0.11 65)",
    "oklch(0.93 0.1 85)",
    "oklch(0.42 0.06 30)",
    "oklch(0.3 0.04 30)",
  ],
  [
    "oklch(0.82 0.05 230)",
    "oklch(0.95 0.02 230)",
    "oklch(0.98 0.02 90)",
    "oklch(0.8 0.03 230)",
    "oklch(0.92 0.01 230)",
  ],
  [
    "oklch(0.3 0.07 270)",
    "oklch(0.55 0.12 320)",
    "oklch(0.92 0.05 90)",
    "oklch(0.32 0.05 280)",
    "oklch(0.22 0.04 280)",
  ],
  [
    "oklch(0.78 0.08 210)",
    "oklch(0.92 0.06 120)",
    "oklch(0.96 0.07 95)",
    "oklch(0.66 0.12 135)",
    "oklch(0.55 0.13 125)",
  ],
  [
    "oklch(0.66 0.1 250)",
    "oklch(0.86 0.07 60)",
    "oklch(0.92 0.09 75)",
    "oklch(0.5 0.08 220)",
    "oklch(0.4 0.07 215)",
  ],
];

export const defaultFlockItems: FormationFlightItem[] = Array.from(
  { length: 24 },
  (_, i) => {
    const place = [
      "Ridge",
      "Estuary",
      "Salt flat",
      "Moor",
      "Orchard",
      "Headland",
    ][i % 6];
    const time = ["at dawn", "at noon", "after rain", "at dusk"][
      Math.floor(i / 6) % 4
    ];
    return {
      alt: `${place} ${time}, frame ${String(i + 1).padStart(2, "0")}`,
      caption: `${place} ${time}`,
    };
  },
);

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b1, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (b + 0x632be5ab), 0xc2b2ae35) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

type Pose = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Card scale in this formation: a ring of 24 needs smaller prints than a wall. */
  scale: number;
};

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** Where card i of n sits in a formation, in cqmin, with the turn `phase` (rad). */
function poseOf(f: FormationName, i: number, n: number, phase: number): Pose {
  if (f === "grid") {
    const cols = Math.ceil(Math.sqrt(n * 1.5));
    const rows = Math.ceil(n / cols);
    const c = i % cols;
    const r = Math.floor(i / cols);
    const inRow = r === rows - 1 ? n - r * cols : cols;
    return {
      x: (c - (inRow - 1) / 2) * 15.5,
      y: (r - (rows - 1) / 2) * 12.5,
      z: 0,
      yaw: 0,
      pitch: 0,
      scale: 1,
    };
  }
  if (f === "globe") {
    const up = 1 - (2 * (i + 0.5)) / n;
    const ring = Math.sqrt(1 - up * up);
    const phi = i * GOLDEN + phase;
    const R = 31;
    return {
      x: R * ring * Math.cos(phi),
      y: -R * up,
      z: R * ring * Math.sin(phi),
      yaw: 90 - (phi * 180) / Math.PI,
      pitch: (Math.asin(up) * 180) / Math.PI,
      scale: 0.84,
    };
  }
  if (f === "spiral") {
    const t = n > 1 ? i / (n - 1) : 0;
    const theta = t * Math.PI * 4 + phase;
    const R = 26;
    return {
      x: R * Math.cos(theta),
      y: (t - 0.5) * 56,
      z: R * Math.sin(theta),
      yaw: 90 - (theta * 180) / Math.PI,
      pitch: 0,
      scale: 0.9,
    };
  }
  // The ring is tipped toward the viewer so the whole of it reads, near
  // side low, far side high.
  const theta = (i / n) * Math.PI * 2 + phase;
  const R = 46;
  const tip = (16 * Math.PI) / 180;
  const z = R * Math.sin(theta);
  return {
    x: R * Math.cos(theta),
    y: z * Math.sin(tip),
    z: z * Math.cos(tip),
    yaw: 90 - (theta * 180) / Math.PI,
    pitch: 0,
    scale: 0.76,
  };
}

/** The angle b, moved by whole turns to sit nearest a. */
const nearAngle = (a: number, b: number) => b + Math.round((a - b) / 360) * 360;

const transformOf = (
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number,
  roll: number,
  scale: number,
) =>
  `translate(-50%, -50%) translate3d(${r2(x)}cqmin, ${r2(y)}cqmin, ${r2(z)}cqmin) rotateY(${r2(yaw)}deg) rotateX(${r2(pitch)}deg) rotateZ(${r2(roll)}deg) scale(${r2(scale)})`;

/** A small landscape photograph, seeded by its index. */
function Photo({ index }: { index: number }) {
  const p = PHOTO[index % PHOTO.length] ?? PHOTO[0]!;
  const a = hash(index, 3);
  const b = hash(7, index);
  const id = `ff-sky-${index}`;
  const h1 = Math.round(30 + a * 14);
  const h2 = Math.round(44 + b * 10);
  return (
    <svg
      viewBox="0 0 80 60"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p[0]} />
          <stop offset="1" stopColor={p[1]} />
        </linearGradient>
      </defs>
      <rect width="80" height="60" fill={`url(#${id})`} />
      <circle
        cx={Math.round(18 + a * 44)}
        cy={Math.round(16 + b * 10)}
        r="6"
        fill={p[2]}
      />
      <path
        d={`M 0 ${h1} Q 24 ${h1 - 10} 46 ${h1 - 2} T 80 ${h1 - 4} V 60 H 0 Z`}
        fill={p[3]}
      />
      <path
        d={`M 0 ${h2} Q 30 ${h2 - 6} 56 ${h2 + 2} T 80 ${h2 - 2} V 60 H 0 Z`}
        fill={p[4]}
      />
    </svg>
  );
}

type Flight = {
  start: number;
  delay: Float64Array;
  dur: Float64Array;
  p0: Float64Array;
  c1: Float64Array;
  c2: Float64Array;
  yaw0: Float64Array;
  pitch0: Float64Array;
  scale0: Float64Array;
  end: number;
};

type Live = {
  formation: FormationName;
  cohesion: number;
  bank: number;
  spin: number;
  size: number;
  flight: number;
  paused: boolean;
  motionSafe: boolean;
  count: number;
  hovered: number;
  keys: string[];
};

/**
 * A flock of photo cards in real CSS 3D that holds a named formation — a
 * tipped ring, a two-turn spiral, a globe or a flat grid — turning slowly
 * while it waits. Choosing a formation sends every card on its own cubic
 * path: it leaves along its present heading, swoops through a curve the
 * whole flock shares, and comes in to its new place from its own side.
 * Departures go from the flock's leading edge and arrivals are packed tighter
 * than departures, so the flock stretches into a stream and tightens into the
 * new shape. Each card's roll is computed from its real sideways acceleration
 * on the path, so cards bank into the turn and level out as they land.
 *
 * Hover a card and it comes forward on the snap spring while the rest dim a
 * little. The picker is a radiogroup — arrow keys cycle formations — and the
 * flock is a listbox: arrows move between cards, bringing each forward, and
 * Enter chooses one. Under reduced motion there are no flights: the cards
 * fade out and back in at their new places, nothing turns, and a hovered
 * card grows in place.
 */
export function FormationFlight({
  items = defaultFlockItems,
  formation,
  defaultFormation = "ring",
  onFormationChange,
  formations = ALL,
  cohesion = 0.6,
  bank = 0.6,
  spin = 6,
  cardSize = 1,
  flightTime = 1400,
  showPicker = true,
  onSelect,
  label = "Photo flock",
  paused = false,
  disabled = false,
  className,
}: FormationFlightProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const count = items.length;
  const [own, setOwn] = React.useState<FormationName>(defaultFormation);
  const current = formation ?? own;
  const offered = formations.length > 0 ? formations : ALL;
  const [hovered, setHovered] = React.useState(-1);
  const [active, setActive] = React.useState(0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [first] = React.useState(current);
  const [ringed, setRinged] = React.useState(false);

  const keyOf = (i: number) => `${i}:${items[i]?.alt ?? ""}`;
  const keys = items.map((_, i) => keyOf(i));
  const size = clamp(cardSize, 0.6, 1.6);

  const cardRefs = React.useRef(new Map<string, HTMLElement>());
  const radioRefs = React.useRef(new Map<FormationName, HTMLButtonElement>());
  const engine = React.useRef<{
    kick: () => void;
    fly: (to: FormationName) => void;
  } | null>(null);

  const latest = React.useRef<Live>({
    formation: current,
    cohesion,
    bank,
    spin,
    size,
    flight: flightTime,
    paused,
    motionSafe,
    count,
    hovered,
    keys,
  });
  React.useLayoutEffect(() => {
    latest.current = {
      formation: current,
      cohesion,
      bank,
      spin,
      size,
      flight: flightTime,
      paused,
      motionSafe,
      count,
      hovered,
      keys,
    };
  });

  React.useEffect(() => {
    const root = document.getElementById(`${uid}-flock`);
    if (!root) return;
    const L = () => latest.current;
    let n = L().count;
    let raf = 0;
    let last = 0;
    let visible = false;
    let phase = 0;
    let shape: FormationName = L().formation;
    let fromShape: FormationName = shape;
    let flight: Flight | null = null;
    let fadeAt: number | null = null;
    /** When the flock first moved: the hover-in-place eases in from it. */
    let wokeAt: number | null = null;
    // Where each card is now, for the next flight to leave from.
    let pos = new Float64Array(n * 3);
    let ori = new Float64Array(n * 2);
    let scl = new Float64Array(n);
    let lift = new Float64Array(n);
    let liftV = new Float64Array(n);
    let disposed = false;

    const resize = () => {
      n = L().count;
      pos = new Float64Array(n * 3);
      ori = new Float64Array(n * 2);
      scl = new Float64Array(n);
      lift = new Float64Array(n);
      liftV = new Float64Array(n);
      for (let i = 0; i < n; i += 1) {
        const p = poseOf(shape, i, n, phase);
        pos.set([p.x, p.y, p.z], i * 3);
        ori.set([p.yaw, p.pitch], i * 2);
        scl[i] = p.scale;
      }
    };
    resize();

    const fly = (to: FormationName) => {
      const live = L();
      if (live.count !== n) resize();
      if (to === shape && !flight) return;
      const now = performance.now() / 1000;
      fromShape = shape;
      shape = to;
      if (!live.motionSafe) {
        flight = null;
        fadeAt = now;
        kick();
        return;
      }
      const coh = clamp(live.cohesion, 0, 1);
      const T = (clamp(live.flight, 400, 4000) / 1000) * (1.15 - coh * 0.25);
      // The flock's shared swoop: out to one side and over, the side set by
      // where the flock is heading, so a sequence of changes weaves.
      const sideSeed = hash(ALL.indexOf(to), Math.round(now * 10));
      const side = sideSeed > 0.5 ? 1 : -1;
      const swoop = [side * 30, -18, 22];
      const delay = new Float64Array(n);
      const dur = new Float64Array(n);
      const p0 = new Float64Array(n * 3);
      const c1 = new Float64Array(n * 3);
      const c2 = new Float64Array(n * 3);
      const yaw0 = new Float64Array(n);
      const pitch0 = new Float64Array(n);
      const scale0 = new Float64Array(n);
      // Leaders: the cards furthest along the swoop leave first.
      const order = Array.from({ length: n }, (_, i) => i).sort(
        (a, b) =>
          (pos[b * 3] ?? 0) * side - (pos[a * 3] ?? 0) * side ||
          (pos[b * 3 + 2] ?? 0) - (pos[a * 3 + 2] ?? 0),
      );
      const spread = 0.42 * (1.25 - coh);
      let end = 0;
      order.forEach((i, rank) => {
        const lead = n > 1 ? rank / (n - 1) : 0;
        const d = lead * spread;
        // Arrivals packed at 40% of the departure spread: the stream tightens.
        const length = T + lead * spread * 0.4 - d;
        delay[i] = d;
        dur[i] = Math.max(0.35, length * (0.92 + hash(i, 11) * 0.16));
        end = Math.max(end, d + (dur[i] ?? 0));
        const x0 = pos[i * 3] ?? 0;
        const y0 = pos[i * 3 + 1] ?? 0;
        const z0 = pos[i * 3 + 2] ?? 0;
        p0.set([x0, y0, z0], i * 3);
        const loose = (1 - coh) * 26;
        const jx = (hash(i, 21) - 0.5) * loose;
        const jy = (hash(i, 22) - 0.5) * loose;
        const jz = (hash(i, 23) - 0.5) * loose;
        const target = poseOf(to, i, n, phase);
        c1.set(
          [
            x0 + (swoop[0] ?? 0) * 0.9 + jx,
            y0 + (swoop[1] ?? 0) * 0.9 + jy,
            z0 + (swoop[2] ?? 0) * 0.9 + jz,
          ],
          i * 3,
        );
        c2.set(
          [
            target.x + (swoop[0] ?? 0) * 0.45 - jy * 0.6,
            target.y + (swoop[1] ?? 0) * 0.2 + jx * 0.6,
            target.z + (swoop[2] ?? 0) * 0.5 + jz * 0.4,
          ],
          i * 3,
        );
        yaw0[i] = ori[i * 2] ?? 0;
        pitch0[i] = ori[i * 2 + 1] ?? 0;
        scale0[i] = scl[i] ?? 1;
      });
      flight = {
        start: now,
        delay,
        dur,
        p0,
        c1,
        c2,
        yaw0,
        pitch0,
        scale0,
        end,
      };
      kick();
    };

    const frame = (ms: number) => {
      raf = 0;
      if (disposed || !visible || document.hidden) return;
      const live = L();
      if (live.count !== n) resize();
      const now = ms / 1000;
      const dt = Math.min(0.05, Math.max(0, now - last));
      last = now;
      let busy = false;
      const turning =
        live.motionSafe && !live.paused && live.spin !== 0 && shape !== "grid";
      if (turning) {
        phase += ((live.spin * Math.PI) / 180) * dt;
        busy = true;
      }
      const g = 900;
      const bankK = clamp(live.bank, 0, 1);
      // At rest the flock still holds itself in the air: a loose flock bobs
      // out of line, and every card rocks a little, banking with its bob.
      const ambient = live.motionSafe && !live.paused;
      if (wokeAt === null) wokeAt = now;
      const ease = clamp((now - wokeAt) / 1.2, 0, 1);
      const bob = ambient ? (1 - clamp(live.cohesion, 0, 1)) * 2.6 * ease : 0;
      const rock = ambient
        ? bankK * 8 * (1 - clamp(live.cohesion, 0, 1) * 0.5) * ease
        : 0;
      if (bob > 0.01 || rock > 0.01) busy = true;
      // Turning in a ring or a spiral, the cards lean into the turn.
      const lean =
        turning && (shape === "ring" || shape === "spiral")
          ? bankK * 14 * clamp(live.spin / 6, -1.5, 1.5)
          : 0;
      const fade = fadeAt === null ? 1 : clamp((now - fadeAt) / 0.39, 0, 1);
      if (fadeAt !== null && fade < 1) busy = true;
      if (fadeAt !== null && fade >= 1) fadeAt = null;
      for (let i = 0; i < n; i += 1) {
        const node = cardRefs.current.get(live.keys[i] ?? "");
        // A reduced-motion change swaps places while the cards are faded out.
        const held = fadeAt !== null && fade < 0.38 ? fromShape : shape;
        const target = poseOf(held, i, n, phase);
        let x = target.x;
        let y = target.y;
        let z = target.z;
        let yaw = target.yaw;
        let pitch = target.pitch;
        let form = target.scale;
        let roll = 0;
        if (flight) {
          const d = flight.delay[i] ?? 0;
          const D = flight.dur[i] ?? 1;
          const tau = clamp((now - flight.start - d) / D, 0, 1);
          if (tau < 1) {
            busy = true;
            const s = tau * tau * tau * (tau * (tau * 6 - 15) + 10);
            const s1 = (30 * tau * tau * (tau - 1) * (tau - 1)) / D;
            const s2 = (60 * tau * (2 * tau * tau - 3 * tau + 1)) / (D * D);
            const k = i * 3;
            const P = (j: number, end: number) => {
              const a = flight!.p0[k + j] ?? 0;
              const b = flight!.c1[k + j] ?? 0;
              const c = flight!.c2[k + j] ?? 0;
              const u = s;
              const m = 1 - u;
              const value =
                m * m * m * a +
                3 * m * m * u * b +
                3 * m * u * u * c +
                u * u * u * end;
              const d1 =
                3 * m * m * (b - a) +
                6 * m * u * (c - b) +
                3 * u * u * (end - c);
              const d2 = 6 * m * (c - 2 * b + a) + 6 * u * (end - 2 * c + b);
              return [value, d1 * s1, d2 * s1 * s1 + d1 * s2] as const;
            };
            const sc0 = flight.scale0[i] ?? 1;
            form = sc0 + (target.scale - sc0) * s;
            const [px, vx, ax] = P(0, target.x);
            const [py, vy, ay] = P(1, target.y);
            const [pz] = P(2, target.z);
            x = px;
            y = py;
            z = pz;
            // Bank: the sideways acceleration across the line of flight, as
            // a roll of atan(a⊥ / g), faded in with speed.
            const speed = Math.hypot(vx, vy);
            if (speed > 0.001) {
              const lateral = (vx * ay - vy * ax) / speed;
              roll =
                bankK *
                clamp((Math.atan2(lateral, g) * 180) / Math.PI, -55, 55) *
                clamp(speed / 30, 0, 1);
            }
            // Cards turn to face the way they fly through the middle.
            const y0 = flight.yaw0[i] ?? 0;
            const y1 = nearAngle(y0, target.yaw);
            const turn = Math.sin(Math.PI * s) * 0.6;
            yaw = (y0 + (y1 - y0) * s) * (1 - turn);
            pitch =
              ((flight.pitch0[i] ?? 0) +
                (target.pitch - (flight.pitch0[i] ?? 0)) * s) *
              (1 - turn);
          }
        }
        if (bob > 0.01 || rock > 0.01 || lean !== 0) {
          const w1 = 0.8 + hash(i, 41) * 0.7;
          const ph = hash(43, i) * Math.PI * 2;
          x += bob * 0.6 * Math.sin(now * w1 + ph);
          y += bob * Math.sin(now * w1 * 1.3 + ph * 1.7);
          roll += rock * Math.cos(now * w1 + ph);
          pitch += lean * ease;
        }
        pos[i * 3] = x;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = z;
        ori[i * 2] = yaw;
        ori[i * 2 + 1] = pitch;
        scl[i] = form;
        // Hover: forward on the snap spring.
        const want = live.hovered === i ? 1 : 0;
        let h = lift[i] ?? 0;
        let hv = liftV[i] ?? 0;
        if (!live.motionSafe) {
          h = want;
          hv = 0;
        } else if (h !== want || hv !== 0) {
          const { stiffness: ks, damping: cs, mass: ms2 } = springs.snap;
          const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
          const hh = dt / steps;
          for (let st = 0; st < steps; st += 1) {
            const a = (-ks * (h - want) - cs * hv) / ms2;
            hv += a * hh;
            h += hv * hh;
          }
          if (Math.abs(h - want) < 0.001 && Math.abs(hv) < 0.01) {
            h = want;
            hv = 0;
          } else busy = true;
        }
        lift[i] = h;
        liftV[i] = hv;
        if (!node) continue;
        const forward = live.motionSafe ? h : 0;
        node.style.transform = transformOf(
          x,
          y,
          z + forward * 22,
          yaw * (1 - forward),
          pitch * (1 - forward),
          roll * (1 - forward),
          live.size * form * (1 + h * 0.18),
        );
        const dim = live.hovered >= 0 && live.hovered !== i ? 0.72 : 1;
        const fadeOpacity =
          fade < 0.38 ? 1 - fade / 0.38 : (fade - 0.38) / 0.62;
        node.style.opacity = String(
          r2(dim * (fadeAt === null ? 1 : fadeOpacity)),
        );
        node.style.zIndex = h > 0.01 ? "10" : "";
      }
      if (flight && now - flight.start > flight.end + 0.05) flight = null;
      if (busy) raf = window.requestAnimationFrame(frame);
    };

    const kick = () => {
      if (disposed || raf || !visible || document.hidden) return;
      last = performance.now() / 1000;
      raf = window.requestAnimationFrame(frame);
    };

    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible = Boolean(entry?.isIntersecting);
      if (visible) kick();
    });
    io.observe(root);
    const onVis = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVis);
    engine.current = { kick, fly };
    // A remount (StrictMode's rehearsal) lands on the live formation.
    if (L().formation !== shape) fly(L().formation);
    return () => {
      disposed = true;
      if (raf) window.cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      engine.current = null;
    };
  }, [uid]);

  // A new formation, from the picker, the keys or the host, flies the flock.
  React.useEffect(() => {
    engine.current?.fly(current);
  }, [current]);

  React.useEffect(() => {
    engine.current?.kick();
  }, [hovered, spin, paused, motionSafe, cardSize, count, bank, cohesion]);

  const choose = (to: FormationName, from: "picker" | "keys") => {
    if (disabled || to === current) return;
    if (formation === undefined) setOwn(to);
    onFormationChange?.(to);
    setSaid((s) => ({
      n: s.n + 1,
      text: `${NAMES[to]}, ${count} ${count === 1 ? "card" : "cards"}${from === "keys" ? "" : " in flight"}`,
    }));
  };

  const onRadioKey = (event: React.KeyboardEvent) => {
    const at = offered.indexOf(current);
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (at + 1) % offered.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (at - 1 + offered.length) % offered.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = offered.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const to = offered[next];
    if (!to) return;
    choose(to, "keys");
    radioRefs.current.get(to)?.focus();
  };

  const onListKey = (event: React.KeyboardEvent) => {
    if (disabled || count === 0) return;
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = Math.min(count - 1, active + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = Math.max(0, active - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect?.(active);
      return;
    }
    if (next < 0) return;
    event.preventDefault();
    setActive(next);
    setHovered(next);
  };

  return (
    <div
      className={cn(
        "group/formation-flight [container-type:size] relative isolate overflow-hidden",
        className,
      )}
    >
      {showPicker ? (
        <div
          role="radiogroup"
          aria-label="Formation"
          className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-hairline bg-popover/85 p-0.5 backdrop-blur-sm"
        >
          {offered.map((f) => {
            const on = f === current;
            return (
              <button
                key={f}
                ref={(node) => {
                  if (node) radioRefs.current.set(f, node);
                  else radioRefs.current.delete(f);
                }}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                disabled={disabled}
                onClick={() => choose(f, "picker")}
                onKeyDown={onRadioKey}
                className={cn(
                  "h-7 rounded-full px-2.5 text-xs font-medium transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  on
                    ? "bg-primary text-primary-foreground"
                    : "text-ink-2 hover:text-foreground",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {NAMES[f]}
              </button>
            );
          })}
        </div>
      ) : null}
      <div
        id={`${uid}-flock`}
        role="listbox"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-activedescendant={count > 0 ? `${uid}-card-${active}` : undefined}
        aria-describedby={`${uid}-hint`}
        onKeyDown={onListKey}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) {
            setRinged(true);
            setHovered(active);
          }
        }}
        onBlur={() => {
          setRinged(false);
          setHovered(-1);
        }}
        className={cn(
          "absolute inset-0 outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
        style={{ perspective: "150cqmin" }}
      >
        <div
          className="absolute inset-0 [transform-style:preserve-3d]"
          style={{ transform: "translateY(2cqmin) rotateX(-12deg)" }}
        >
          {items.map((item, i) => {
            const p = poseOf(first, i, count, 0);
            const isActive = i === active;
            return (
              <div
                key={keyOf(i)}
                id={`${uid}-card-${i}`}
                role="option"
                aria-selected={isActive}
                aria-label={
                  item.caption ? `${item.alt}. ${item.caption}` : item.alt
                }
                ref={(node) => {
                  const k = keyOf(i);
                  if (node) cardRefs.current.set(k, node);
                  else cardRefs.current.delete(k);
                }}
                onPointerEnter={() => {
                  if (!disabled) setHovered(i);
                }}
                onPointerLeave={() => setHovered((h) => (h === i ? -1 : h))}
                onClick={() => {
                  if (disabled) return;
                  setActive(i);
                  onSelect?.(i);
                }}
                className={cn(
                  "absolute top-1/2 left-1/2 cursor-pointer rounded-[1.2cqmin] [transform-style:preserve-3d]",
                  // The keyboard's card wears the focus ring.
                  ringed &&
                    isActive &&
                    "outline-2 outline-offset-2 outline-ring outline-solid",
                )}
                style={{
                  width: "14cqmin",
                  height: "10.5cqmin",
                  transform: transformOf(
                    p.x,
                    p.y,
                    p.z,
                    p.yaw,
                    p.pitch,
                    0,
                    size * p.scale,
                  ),
                }}
              >
                <div
                  className="absolute inset-0 overflow-hidden rounded-[inherit] bg-card [backface-visibility:hidden]"
                  style={{
                    padding: "0.55cqmin",
                    boxShadow:
                      "0 0.6cqmin 1.6cqmin color-mix(in oklab, black 28%, transparent)",
                  }}
                >
                  <div className="size-full overflow-hidden rounded-[0.7cqmin]">
                    {item.src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.src}
                        alt=""
                        draggable={false}
                        className="block size-full object-cover"
                      />
                    ) : (
                      <Photo index={i} />
                    )}
                  </div>
                </div>
                {/* The back of the print, for cards seen from behind. */}
                <div
                  className="absolute inset-0 rounded-[inherit] border border-hairline-strong [backface-visibility:hidden]"
                  style={{
                    transform: "rotateY(180deg)",
                    background:
                      "repeating-linear-gradient(135deg, color-mix(in oklab, var(--card) 92%, var(--foreground)) 0 0.5cqmin, var(--card) 0.5cqmin 1cqmin)",
                  }}
                />
              </div>
            );
          })}
        </div>
        {hovered >= 0 && items[hovered] ? (
          <p
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-3 text-center font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase"
          >
            {String(hovered + 1).padStart(2, "0")} ·{" "}
            {items[hovered]?.caption ?? items[hovered]?.alt}
          </p>
        ) : null}
      </div>
      <span id={`${uid}-hint`} className="sr-only">
        Arrow keys move between photographs and bring each forward; Enter
        chooses one. The formation picker changes the flock&apos;s shape.
      </span>
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
