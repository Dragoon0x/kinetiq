"use client";

import * as React from "react";

import { Check, Trash2, Undo2 } from "lucide-react";
import {
  animate,
  cancelFrame,
  frame,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { useTactileSound, type LoopHandle } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type StripShredPhase =
  | "idle"
  | "armed"
  | "shredding"
  | "undo"
  | "deleting"
  | "deleted"
  | "restoring";

export type StripShredSize = "sm" | "md" | "lg";

export type StripShredProps = {
  /** The card's content. The component draws the card's paper and border around it. */
  children?: React.ReactNode;
  /** The button's idle label and accessible name. @default "Delete" */
  label?: string;
  /** The label while it waits for a second press. @default "Confirm" */
  confirmLabel?: string;
  /** The label from the shred until the undo window closes. @default "Undo" */
  undoLabel?: string;
  /** The label while `onDelete`'s promise is pending. @default "Deleting" */
  deletingLabel?: string;
  /** The label once the delete has landed. @default "Deleted" */
  deletedLabel?: string;
  /** Printed in the dashed outline left where the card was. @default "Shredded" */
  shreddedLabel?: string;
  /** Called when the undo window closes. Return a promise to show a pending state; a rejection puts the card back. */
  onDelete?: () => void | Promise<unknown>;
  /** Called when the visitor undoes the shred. */
  onUndo?: () => void;
  /** Controlled: whether the card has been deleted. Setting it back to false reassembles the card. */
  deleted?: boolean;
  /** Initial deleted state when uncontrolled. @default false */
  defaultDeleted?: boolean;
  /** Fires when the delete lands (true). */
  onDeletedChange?: (deleted: boolean) => void;
  /** Fires on every step of the cycle, from the press or timer that caused it. */
  onPhaseChange?: (phase: StripShredPhase) => void;
  /** How many strips the cutters make, 3 to 24. @default 10 */
  strips?: number;
  /** The undo window after the shred, in ms; 0 deletes as soon as the shred finishes. @default 5000 */
  undo?: number;
  /** The motor's speed: the feed, the fall and the slips all scale with it. @default 1 */
  speed?: number;
  /** How far the strips roll toward you as they hang, 0 to 1. @default 0.6 */
  curl?: number;
  /** How hard the paper fights the cutters: the depth of the stick-slip judder, 0 to 1. @default 0.5 */
  resistance?: number;
  /** Ask for a second press before shredding. @default true */
  confirm?: boolean;
  /** The card's paper, any CSS colour; the strips are cut from it. @default "var(--card)" */
  paper?: string;
  /** The colour of the word fragments printed on the strips. @default "var(--ink-2)" */
  ink?: string;
  /** @default "md" */
  size?: StripShredSize;
  /** Play the motor's scratch and the thud of the last strip. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Geometry = {
  max: number;
  head: number;
  mouth: number;
  bin: number;
  button: string;
  icon: string;
};

const SIZES: Record<StripShredSize, Geometry> = {
  sm: {
    max: 240,
    head: 38,
    mouth: 6,
    bin: 48,
    button: "h-6 gap-1 px-2 text-xs",
    icon: "size-3.5",
  },
  md: {
    max: 280,
    head: 44,
    mouth: 7,
    bin: 56,
    button: "h-7 gap-1.5 px-2.5 text-xs",
    icon: "size-3.5",
  },
  lg: {
    max: 320,
    head: 50,
    mouth: 8,
    bin: 64,
    button: "h-8 gap-1.5 px-3 text-sm",
    icon: "size-4",
  },
};

/** How far the bin tucks up under the head. */
const TUCK = 8;
/** Pixels of feed per stick-slip of the judder. */
const SLIP = 6;
/** Samples per strip, at most: one every 4px of a 256px-tall card. */
const MAX_STEPS = 64;
const RING = 2 * Math.PI * 6;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Small, fast, seeded: every strip's character is the same on every load. */
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

type Strip = {
  /** Share of the curl this strip takes, ±25%. */
  curl: number;
  /** Sideways sway along its length, px per px² over the card's height. */
  sway: number;
  /** When it lets go, 0 to 1 of the release spread. */
  delay: number;
  /** Degrees it turns per px of fall. */
  spin: number;
  /** Sideways drift per px of fall. */
  drift: number;
  /** Its place in the reassembly cascade. */
  order: number;
};

function stripsFor(n: number): Strip[] {
  const rand = rng(1484 + n * 31);
  const out: Strip[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push({
      curl: 0.75 + rand() * 0.5,
      sway: (rand() - 0.5) * 0.4,
      delay: rand(),
      spin: (rand() - 0.5) * 0.36,
      drift: (rand() - 0.5) * 0.32,
      order: 0,
    });
  }
  // Strips gather from the middle out, so the card closes like a zip.
  const byCentre = out
    .map((_, i) => i)
    .sort(
      (a, b) => Math.abs(a - (n - 1) / 2) - Math.abs(b - (n - 1) / 2) || a - b,
    );
  byCentre.forEach((index, rank) => {
    const strip = out[index];
    if (strip) strip.order = rank;
  });
  return out;
}

type Word = { x0: number; x1: number; y0: number; y1: number };

/**
 * Every word in the card as a box in the card's own pixels, thinned to the
 * band where letters carry most of their ink — what a strip would show of it.
 */
function measureWords(card: HTMLElement): Word[] {
  const box = card.getBoundingClientRect();
  const scale = box.width > 0 ? card.offsetWidth / box.width : 1;
  const out: Word[] = [];
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (
    let node = walker.nextNode();
    node && out.length < 400;
    node = walker.nextNode()
  ) {
    const text = node.nodeValue ?? "";
    const pattern = /\S+/g;
    for (
      let match = pattern.exec(text);
      match && out.length < 400;
      match = pattern.exec(text)
    ) {
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      for (const rect of range.getClientRects()) {
        if (rect.width < 0.5 || rect.height < 0.5) continue;
        const mid = rect.top + rect.height * 0.56;
        out.push({
          x0: (rect.left - box.left) * scale,
          x1: (rect.right - box.left) * scale,
          y0: (mid - rect.height * 0.22 - box.top) * scale,
          y1: (mid + rect.height * 0.22 - box.top) * scale,
        });
      }
    }
  }
  return out;
}

type Engine = {
  arm: (on: boolean) => void;
  shred: (audible: boolean) => void;
  restore: (audible: boolean) => void;
  /** The delete landed: under reduced motion the still frame fades away. */
  landed: () => void;
  /** Re-applies the pose of the current phase (reduced motion changed). */
  pose: () => void;
  repaint: () => void;
};

type Params = {
  motionSafe: boolean;
  speed: number;
  curl: number;
  resistance: number;
  bin: number;
  audio: ReturnType<typeof useTactileSound>;
  onShredDone: () => void;
  onRestored: () => void;
};

type Face = "idle" | "armed" | "undo" | "deleting" | "deleted";

const faceOf = (phase: StripShredPhase): Face =>
  phase === "armed"
    ? "armed"
    : phase === "shredding" || phase === "undo"
      ? "undo"
      : phase === "deleting"
        ? "deleting"
        : phase === "deleted"
          ? "deleted"
          : "idle";

const GONE: StripShredPhase[] = ["shredding", "undo", "deleting", "deleted"];

const seconds = (ms: number) => {
  const s = Math.round(ms / 100) / 10;
  return `${s} ${s === 1 ? "second" : "seconds"}`;
};

/**
 * A delete control for a small card, with a shredder under it. Confirming
 * starts the motor: the card gives a little as the teeth bite, then is pulled
 * into the mouth at a steady rate with a stick-slip judder whose depth is
 * `resistance`, while the teeth and the head shiver. Under the head the card
 * comes out as strips at the rate it goes in — ribbons that roll toward you
 * more the further they hang, printed with the fragments of the card's own
 * words that were in each column — and when the top edge is through, each
 * strip lets go on a seeded beat and falls under gravity, turning and curling
 * tighter, into the bin.
 *
 * The button cycles in one place — Delete, Confirm, Undo with a draining
 * ring, Deleting, Deleted — so focus never moves. Undo springs every strip
 * back up on springs.snap in a cascade and feeds the card back out of the
 * mouth on springs.glide. When the window closes `onDelete` is called; a
 * rejected promise reassembles the card. Under reduced motion the card and a
 * still frame of hanging strips crossfade, and the ring still drains.
 */
export function StripShred({
  children,
  label = "Delete",
  confirmLabel = "Confirm",
  undoLabel = "Undo",
  deletingLabel = "Deleting",
  deletedLabel = "Deleted",
  shreddedLabel = "Shredded",
  onDelete,
  onUndo,
  deleted,
  defaultDeleted = false,
  onDeletedChange,
  onPhaseChange,
  strips = 10,
  undo = 5000,
  speed = 1,
  curl = 0.6,
  resistance = 0.5,
  confirm = true,
  paper = "var(--card)",
  ink = "var(--ink-2)",
  size = "md",
  sound = false,
  disabled = false,
  className,
}: StripShredProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const g = SIZES[size] ?? SIZES.md;
  const n = Math.round(clamp(Number.isFinite(strips) ? strips : 10, 3, 24));
  const windowMs = Math.max(0, Number.isFinite(undo) ? undo : 0);
  const hintId = React.useId();

  const [own, setOwn] = React.useState(defaultDeleted);
  const isDeleted = deleted ?? own;
  // The markup the server sends must already show a deleted card as gone.
  const [startedDeleted] = React.useState(isDeleted);
  const [phase, setPhase] = React.useState<StripShredPhase>(
    startedDeleted ? "deleted" : "idle",
  );
  const [said, setSaid] = React.useState("");
  const [aware, setAware] = React.useState(false);

  const fed = useMotionValue(startedDeleted ? 1 : 0);
  const lean = useMotionValue(0);
  const cardFade = useMotionValue(1);
  const stripFade = useMotionValue(startedDeleted ? 0 : 1);
  const ring = useMotionValue(1);
  const ringOffset = useTransform(ring, (v) => r2((1 - v) * RING));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const placeholderRef = React.useRef<HTMLDivElement | null>(null);
  const headRef = React.useRef<HTMLDivElement | null>(null);
  const teethRef = React.useRef<SVGGElement | null>(null);
  const lampRef = React.useRef<HTMLSpanElement | null>(null);
  const stripsRef = React.useRef<SVGGElement | null>(null);
  const frontRef = React.useRef<SVGPathElement | null>(null);
  const backRef = React.useRef<SVGPathElement | null>(null);
  const shadeRef = React.useRef<SVGPathElement | null>(null);
  const inkRef = React.useRef<SVGPathElement | null>(null);

  const phaseRef = React.useRef(phase);
  const engine = React.useRef<Engine | null>(null);
  const timers = React.useRef<number[]>([]);
  const ringRun = React.useRef<AnimationPlaybackControls | null>(null);
  const token = React.useRef(0);
  const shownDeleted = React.useRef(isDeleted);
  /** The host deleted it: shred without a window and without calling back. */
  const quiet = React.useRef(false);

  const latest = React.useRef({
    onDelete,
    onUndo,
    onDeletedChange,
    onPhaseChange,
    windowMs,
    controlled: deleted !== undefined,
    confirm,
    disabled,
  });
  React.useEffect(() => {
    latest.current = {
      onDelete,
      onUndo,
      onDeletedChange,
      onPhaseChange,
      windowMs,
      controlled: deleted !== undefined,
      confirm,
      disabled,
    };
  });

  const go = React.useCallback((next: StripShredPhase) => {
    if (phaseRef.current === next) return;
    phaseRef.current = next;
    setPhase(next);
    latest.current.onPhaseChange?.(next);
  }, []);

  const clearTimers = React.useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    ringRun.current?.stop();
    ringRun.current = null;
  }, []);

  const finishDeleted = React.useCallback(() => {
    shownDeleted.current = true;
    go("deleted");
    engine.current?.landed();
    setSaid("Deleted.");
    if (!latest.current.controlled) setOwn(true);
    latest.current.onDeletedChange?.(true);
  }, [go]);

  const restoreQuietly = React.useCallback(
    (sentence: string) => {
      clearTimers();
      go("restoring");
      setSaid(sentence);
      engine.current?.restore(false);
    },
    [clearTimers, go],
  );

  const commitDelete = React.useCallback(() => {
    clearTimers();
    ring.jump(0);
    const ticket = ++token.current;
    let result: unknown;
    try {
      result = latest.current.onDelete?.();
    } catch {
      restoreQuietly("Couldn't delete. Restored.");
      return;
    }
    if (result && typeof (result as PromiseLike<unknown>).then === "function") {
      go("deleting");
      (result as PromiseLike<unknown>).then(
        () => {
          if (ticket === token.current && phaseRef.current === "deleting") {
            finishDeleted();
          }
        },
        () => {
          if (ticket === token.current && phaseRef.current === "deleting") {
            restoreQuietly("Couldn't delete. Restored.");
          }
        },
      );
      return;
    }
    finishDeleted();
  }, [clearTimers, finishDeleted, go, restoreQuietly, ring]);

  const params = React.useRef<Params>({
    motionSafe,
    speed,
    curl,
    resistance,
    bin: g.bin,
    audio,
    onShredDone: () => {},
    onRestored: () => {},
  });
  React.useEffect(() => {
    params.current = {
      motionSafe,
      speed: clamp(speed, 0.25, 3),
      curl: clamp(curl, 0, 1),
      resistance: clamp(resistance, 0, 1),
      bin: g.bin,
      audio,
      // The shred has finished falling: the window opens, or the delete
      // goes straight through when there is no window.
      onShredDone: () => {
        if (phaseRef.current !== "shredding") return;
        if (quiet.current) {
          quiet.current = false;
          go("deleted");
          engine.current?.landed();
          return;
        }
        const ms = latest.current.windowMs;
        if (ms <= 0) {
          commitDelete();
          return;
        }
        go("undo");
        ring.jump(1);
        ringRun.current = animate(ring, 0, {
          duration: ms / 1000,
          ease: "linear",
        });
        timers.current.push(window.setTimeout(commitDelete, ms));
      },
      onRestored: () => {
        if (phaseRef.current !== "restoring") return;
        shownDeleted.current = false;
        go("idle");
      },
    };
  });

  /*
   * The machine. Everything that moves per frame is written here, outside
   * React: one paint per frame from the motion values, and nothing at rest.
   */
  React.useEffect(() => {
    const card = cardRef.current;
    const placeholder = placeholderRef.current;
    const head = headRef.current;
    const teeth = teethRef.current;
    const lamp = lampRef.current;
    const group = stripsRef.current;
    const front = frontRef.current;
    const back = backRef.current;
    const shade = shadeRef.current;
    const inkPath = inkRef.current;
    if (
      !card ||
      !placeholder ||
      !head ||
      !teeth ||
      !lamp ||
      !group ||
      !front ||
      !back ||
      !shade ||
      !inkPath
    ) {
      return;
    }

    const seeds = stripsFor(n);
    const drops = seeds.map(() => motionValue(0));
    const xs = new Float64Array(MAX_STEPS + 1);
    const ys = new Float64Array(MAX_STEPS + 1);
    const faces = new Float64Array(MAX_STEPS);
    const dims = { w: card.offsetWidth, h: card.offsetHeight };
    let words: Word[] = [];
    let runs: AnimationPlaybackControls[] = [];
    let waits: number[] = [];
    let loop: LoopHandle | null = null;
    let lastSlip = -1;
    let queued = false;

    const far = () => params.current.bin + dims.h + 48;

    // Bumped by every halt: an animation stopped mid-way can still report
    // finishing a moment later, and a stale finish must not act.
    let epoch = 0;
    const live = (fn: () => void) => {
      const born = epoch;
      return () => {
        if (born === epoch) fn();
      };
    };
    const halt = () => {
      epoch += 1;
      for (const r of runs) r.stop();
      runs = [];
      for (const t of waits) window.clearTimeout(t);
      waits = [];
      loop?.stop();
      loop = null;
    };

    const shownOf = (f: number) => {
      const H = dims.h;
      const px = f * H;
      if (px <= 0 || px >= H) return clamp(px, 0, H);
      // Stick-slip: the paper lags the rollers by up to `a` px and catches
      // up at every slip, so it advances in small, felt steps.
      const a = params.current.resistance * 2.4;
      const taper = Math.min(1, px / SLIP, (H - px) / SLIP);
      const lag = a * taper * (px / SLIP - Math.floor(px / SLIP));
      return clamp(px - lag, 0, H);
    };

    const paint = () => {
      const P = params.current;
      const W = dims.w;
      const H = dims.h;
      const f = fed.get();
      const shown = shownOf(f);
      const ms = P.motionSafe;

      // The card: pulled down behind the head's top edge.
      const y = ms ? r2(lean.get() + shown) : 0;
      card.style.transform = y ? `translateY(${y}px)` : "";
      card.style.opacity = String(r3(cardFade.get()));
      const left = H > 0 ? cardFade.get() * (1 - (ms ? shown / H : 0)) : 1;
      placeholder.style.opacity = String(r3(clamp(1 - left, 0, 1)));

      // The teeth shiver only while paper is moving through them, read from
      // the feed itself, so they stop the frame the feed does.
      const running =
        ms && Math.abs(fed.getVelocity()) > 0.02 && f > 0.002 && f < 0.998;
      const jx = running ? Math.sin(shown * 2.3) : 0;
      // The comb is drawn in a 100-wide box stretched to the card: ±1px.
      teeth.setAttribute(
        "transform",
        `translate(${W > 0 ? r2((jx * 100) / W) : 0} 0)`,
      );
      head.style.transform = running ? `translateX(${r2(jx * 0.5)}px)` : "";
      lamp.style.opacity = running ? "1" : "0.3";
      if (loop) {
        const slip = Math.floor(shown / SLIP);
        if (slip !== lastSlip) {
          lastSlip = slip;
          loop.set({ pitch: slip % 2 ? 1.08 : 0.94 });
        }
      }

      group.style.opacity = String(r3(stripFade.get()));
      if (W <= 0 || H <= 0) {
        front.setAttribute("d", "");
        back.setAttribute("d", "");
        shade.setAttribute("d", "");
        inkPath.setAttribute("d", "");
        return;
      }

      const count = drops.length;
      const colW = W / count;
      // Under ~2.5px a gap is a grey smear: thin strips sit edge to edge.
      const gap = colW >= 2.5 ? 1 : 0;
      const half = (colW - gap) / 2;
      const L = ms ? shown : H;
      const phiMax = 1.7 * Math.PI * P.curl * (ms ? 1 : 0.2);
      const limit = far() - 1;
      let frontD = "";
      let shadeD = "";
      let backD = "";
      let inkD = "";

      if (L >= 0.5) {
        for (let i = 0; i < count; i += 1) {
          const s = seeds[i];
          const dv = drops[i];
          if (!s || !dv) continue;
          const drop = ms ? dv.get() : 0;
          if (drop >= limit) continue;
          const steps = Math.min(MAX_STEPS, Math.max(2, Math.ceil(L / 4)));
          const ds = L / steps;
          // A falling strip curls tighter as it goes.
          const boost = 1 + clamp(drop / P.bin, 0, 1) * 0.8;
          const tip = phiMax * s.curl * boost;
          xs[0] = 0;
          ys[0] = 0;
          for (let k = 1; k <= steps; k += 1) {
            const mid = (k - 0.5) * ds;
            // Curvature grows along the strip, so the roll gathers toward
            // the free end and a longer strip rolls further.
            const phi = tip * Math.pow(mid / H, 1.5);
            const c = Math.cos(phi);
            ys[k] = (ys[k - 1] ?? 0) + c * ds;
            const at = k * ds;
            xs[k] = (s.sway * at * at) / H;
            faces[k - 1] = c;
          }
          const a = (drop * s.spin * Math.PI) / 180;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          const ox = i * colW + colW / 2 + drop * s.drift;
          const oy = TUCK + drop;
          const px = (k: number, side: number) =>
            r2(ox + (xs[k] ?? 0) * ca - (ys[k] ?? 0) * sa + side * half * ca);
          const py = (k: number, side: number) =>
            r2(oy + (xs[k] ?? 0) * sa + (ys[k] ?? 0) * ca + side * half * sa);

          // Three tones: paper facing the light, paper rolling away from it,
          // and the back of the paper where the strip has turned over.
          const tone = (k: number) => {
            const c = faces[k] ?? 1;
            return c < 0 ? 2 : c < 0.5 ? 1 : 0;
          };
          let k0 = 0;
          while (k0 < steps) {
            const kind = tone(k0);
            let k1 = k0;
            while (k1 < steps && tone(k1) === kind) k1 += 1;
            let d = `M${px(k0, -1)} ${py(k0, -1)}`;
            for (let k = k0 + 1; k <= k1; k += 1) {
              d += `L${px(k, -1)} ${py(k, -1)}`;
            }
            for (let k = k1; k >= k0; k -= 1) {
              d += `L${px(k, 1)} ${py(k, 1)}`;
            }
            d += "Z";
            if (kind === 0) frontD += d;
            else if (kind === 1) shadeD += d;
            else backD += d;
            k0 = k1;
          }

          // The words that were in this column, where that part of the card
          // now hangs: the bottom of the card comes out first.
          const colX0 = i * colW + gap / 2;
          const span = colW - gap;
          const shift = H - L;
          for (const word of words) {
            if (word.x1 <= colX0 || word.x0 >= colX0 + span) continue;
            const s0 = Math.max(0, word.y0 - shift);
            const s1 = Math.min(L, word.y1 - shift);
            if (s1 - s0 < 0.3) continue;
            const midK = Math.min(steps - 1, Math.floor((s0 + s1) / 2 / ds));
            if ((faces[midK] ?? 1) < 0) continue;
            const u0 = clamp((word.x0 - colX0) / span, 0, 1) * 2 - 1;
            const u1 = clamp((word.x1 - colX0) / span, 0, 1) * 2 - 1;
            const m = Math.max(1, Math.ceil((s1 - s0) / 3));
            let left = "";
            let right = "";
            for (let j = 0; j <= m; j += 1) {
              const sAt = s0 + ((s1 - s0) * j) / m;
              const idx = Math.min(steps, sAt / ds);
              const k = Math.min(steps - 1, Math.floor(idx));
              const t = idx - k;
              const cx = (xs[k] ?? 0) + ((xs[k + 1] ?? 0) - (xs[k] ?? 0)) * t;
              const cy = (ys[k] ?? 0) + ((ys[k + 1] ?? 0) - (ys[k] ?? 0)) * t;
              const bx = ox + cx * ca - cy * sa;
              const by = oy + cx * sa + cy * ca;
              left += `${j === 0 ? "M" : "L"}${r2(bx + u0 * half * ca)} ${r2(by + u0 * half * sa)}`;
              right = `L${r2(bx + u1 * half * ca)} ${r2(by + u1 * half * sa)}${right}`;
            }
            inkD += `${left}${right}Z`;
          }
        }
      }
      front.setAttribute("d", frontD);
      back.setAttribute("d", backD);
      shade.setAttribute("d", shadeD);
      inkPath.setAttribute("d", inkD);
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
    const unsubscribe = [
      fed.on("change", schedule),
      lean.on("change", schedule),
      cardFade.on("change", schedule),
      stripFade.on("change", schedule),
      ...drops.map((d) => d.on("change", schedule)),
    ];
    const sizer = new ResizeObserver(() => {
      dims.w = card.offsetWidth;
      dims.h = card.offsetHeight;
      schedule();
    });
    sizer.observe(card);

    const run = (controls: AnimationPlaybackControls) => {
      runs.push(controls);
    };

    const fall = () => {
      const P = params.current;
      const gravity = 1500 * P.speed * P.speed;
      const dist = far();
      let longest = 0;
      seeds.forEach((s, i) => {
        const d = drops[i];
        if (!d) return;
        const t = Math.sqrt((2 * dist) / gravity);
        // Each strip lets go on its own beat; the whole release stays
        // under the 600ms choreography budget.
        const delay = (s.delay * 0.5) / Math.max(1, P.speed);
        longest = Math.max(longest, delay + t);
        run(
          animate(d, dist, {
            duration: t,
            delay,
            ease: [0.55, 0.085, 0.68, 0.53],
          }),
        );
      });
      waits.push(
        window.setTimeout(
          () => params.current.onShredDone(),
          Math.round(longest * 1000),
        ),
      );
    };

    engine.current = {
      arm: (on) => {
        if (!params.current.motionSafe) {
          lean.jump(0);
          return;
        }
        run(animate(lean, on ? 4 : 0, springs.snap));
      },
      shred: (audible) => {
        halt();
        const P = params.current;
        dims.w = card.offsetWidth;
        dims.h = card.offsetHeight;
        words = measureWords(card);
        for (const d of drops) d.jump(0);
        if (!P.motionSafe) {
          lean.jump(0);
          fed.jump(1);
          stripFade.jump(0);
          run(
            animate(cardFade, 0, {
              duration: durations.base,
              ease: easings.exit,
            }),
          );
          run(
            animate(stripFade, 1, {
              duration: durations.base,
              ease: easings.enter,
              onComplete: live(() => P.onShredDone()),
            }),
          );
          return;
        }
        cardFade.jump(1);
        stripFade.jump(1);
        // The teeth bite first: the card gives a few px on the flick spring
        // before the motor takes it at a steady rate.
        run(animate(lean, 6, springs.flick));
        const duration = (0.55 + dims.h / 150) / P.speed;
        lastSlip = -1;
        if (audible)
          loop = P.audio.start("scratch", { pitch: 0.94, gain: 0.5 });
        run(
          animate(fed, 1, {
            duration: duration * (1 - fed.get()),
            delay: 0.11,
            ease: "linear",
            onComplete: live(() => {
              loop?.stop();
              loop = null;
              if (audible) P.audio.play("thud", { pitch: 0.9, gain: 0.55 });
              lean.jump(0);
              fall();
            }),
          }),
        );
      },
      restore: (audible) => {
        halt();
        const P = params.current;
        if (!P.motionSafe) {
          for (const d of drops) d.jump(0);
          lean.jump(0);
          run(
            animate(stripFade, 0, {
              duration: durations.base,
              ease: easings.exit,
            }),
          );
          run(
            animate(cardFade, 1, {
              duration: durations.base,
              ease: easings.enter,
              onComplete: live(() => {
                fed.jump(0);
                P.onRestored();
              }),
            }),
          );
          return;
        }
        cardFade.jump(1);
        stripFade.jump(1);
        const step = cascade(seeds.length);
        const fallen = drops.some((d) => d.get() > 0.5);
        seeds.forEach((s, i) => {
          const d = drops[i];
          if (!d || d.get() <= 0.5) return;
          run(
            animate(d, 0, {
              ...springs.snap,
              delay: s.order * step,
              velocity: d.getVelocity(),
            }),
          );
        });
        const wait = fallen ? (seeds.length - 1) * step + 0.3 : 0;
        waits.push(
          window.setTimeout(
            () => {
              lastSlip = -1;
              if (audible) {
                loop = P.audio.start("scratch", { pitch: 1.1, gain: 0.4 });
              }
              run(animate(lean, 0, springs.glide));
              run(
                animate(fed, 0, {
                  ...springs.glide,
                  restDelta: 0.0005,
                  restSpeed: 0.005,
                  onComplete: live(() => {
                    loop?.stop();
                    loop = null;
                    if (audible) {
                      P.audio.play("thud", { pitch: 1.35, gain: 0.35 });
                    }
                    P.onRestored();
                  }),
                }),
              );
            },
            Math.round(wait * 1000),
          ),
        );
      },
      pose: () => {},
      repaint: schedule,
      landed: () => {
        if (params.current.motionSafe) return;
        run(
          animate(stripFade, 0, {
            duration: durations.slow,
            ease: easings.exit,
          }),
        );
      },
    };

    // A fresh machine (first mount, a new strip count, or reduced motion
    // switched) takes the pose of the phase it finds, and finishes any step
    // it interrupted.
    const pose = () => {
      halt();
      const now = phaseRef.current;
      if (GONE.includes(now)) {
        fed.jump(1);
        lean.jump(0);
        for (const d of drops) d.jump(far());
        const ms = params.current.motionSafe;
        cardFade.jump(ms ? 1 : 0);
        stripFade.jump(!ms && now === "deleted" ? 0 : 1);
        if (now === "shredding") params.current.onShredDone();
      } else {
        fed.jump(0);
        for (const d of drops) d.jump(0);
        lean.jump(now === "armed" && params.current.motionSafe ? 4 : 0);
        cardFade.jump(1);
        stripFade.jump(params.current.motionSafe ? 1 : 0);
        if (now === "restoring") params.current.onRestored();
      }
      schedule();
    };
    if (engine.current) engine.current.pose = pose;
    pose();
    schedule();

    return () => {
      halt();
      for (const off of unsubscribe) off();
      cancelFrame(flush);
      sizer.disconnect();
      engine.current = null;
    };
  }, [n, fed, lean, cardFade, stripFade]);

  // Reduced motion switched mid-cycle: the machine takes the new pose. A
  // new curl or resistance only needs a repaint.
  const poseFor = React.useRef(motionSafe);
  React.useEffect(() => {
    if (poseFor.current === motionSafe) return;
    poseFor.current = motionSafe;
    engine.current?.pose();
  }, [motionSafe]);
  React.useEffect(() => {
    engine.current?.repaint();
  }, [curl, resistance]);

  React.useEffect(() => clearTimers, [clearTimers]);

  // A host that changes `deleted` gets the card put back, or taken, quietly.
  React.useEffect(() => {
    if (shownDeleted.current === isDeleted) return;
    shownDeleted.current = isDeleted;
    const now = phaseRef.current;
    if (isDeleted) {
      if (now === "deleted" || now === "deleting") return;
      clearTimers();
      token.current += 1;
      quiet.current = true;
      go("shredding");
      engine.current?.shred(false);
    } else if (GONE.includes(now)) {
      token.current += 1;
      clearTimers();
      go("restoring");
      setSaid("Restored.");
      engine.current?.restore(false);
    }
  }, [isDeleted, clearTimers, go]);

  const disarm = () => {
    clearTimers();
    go("idle");
    engine.current?.arm(false);
  };

  const undoNow = () => {
    token.current += 1;
    quiet.current = false;
    clearTimers();
    ring.jump(1);
    go("restoring");
    setSaid("Restored.");
    latest.current.onUndo?.();
    engine.current?.restore(true);
  };

  const shred = () => {
    clearTimers();
    ring.jump(1);
    go("shredding");
    const ms = latest.current.windowMs;
    setSaid(
      ms > 0 ? `Shredding. Undo is open for ${seconds(ms)}.` : "Shredding.",
    );
    engine.current?.shred(true);
  };

  const press = () => {
    if (latest.current.disabled) return;
    const now = phaseRef.current;
    if (now === "idle") {
      if (!latest.current.confirm) {
        shred();
        return;
      }
      go("armed");
      setSaid("Press again to shred.");
      engine.current?.arm(true);
      // An armed button that is left alone goes back to sleep.
      timers.current.push(
        window.setTimeout(() => {
          if (phaseRef.current === "armed") disarm();
        }, 5000),
      );
    } else if (now === "armed") {
      shred();
    } else if (now === "shredding" || now === "undo") {
      undoNow();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const now = phaseRef.current;
    if (event.key === "Escape") {
      if (now === "armed") {
        event.preventDefault();
        disarm();
      } else if (now === "shredding" || now === "undo") {
        event.preventDefault();
        undoNow();
      }
      return;
    }
    if (event.key === "Delete" && (now === "idle" || now === "armed")) {
      const target = event.target as HTMLElement;
      if (
        target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
      ) {
        return;
      }
      event.preventDefault();
      press();
    }
  };

  const face = faceOf(phase);
  const gone = GONE.includes(phase) || phase === "restoring";
  const busy =
    face === "deleting" || face === "deleted" || phase === "restoring";
  const names: Record<Face, string> = {
    idle: label,
    armed: confirmLabel,
    undo: undoLabel,
    deleting: deletingLabel,
    deleted: deletedLabel,
  };
  const hint =
    face === "armed"
      ? "Press again to shred. Escape cancels."
      : face === "undo"
        ? "Press to put the card back. Escape also undoes."
        : face === "idle"
          ? confirm
            ? "Press twice to shred the card."
            : "Press to shred the card."
          : "";

  const cols = Array.from({ length: n + 1 }, (_, k) => k / n);

  return (
    <div
      ref={rootRef}
      onKeyDown={onKeyDown}
      className={cn("relative flex w-full flex-col", className)}
      style={{ maxWidth: g.max }}
    >
      {/* The card's well clips only at its bottom, the head's top edge. */}
      <div
        className="relative"
        style={{ clipPath: "inset(-16px -16px 0 -16px)" }}
      >
        <div
          ref={placeholderRef}
          aria-hidden
          className="absolute inset-0 flex items-center justify-center rounded-3 border border-dashed border-hairline-strong"
          style={{ opacity: startedDeleted ? 1 : 0 }}
        >
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {shreddedLabel}
          </span>
        </div>
        <div
          ref={cardRef}
          inert={gone}
          aria-hidden={gone || undefined}
          className="relative rounded-3 border border-hairline-strong p-3 text-foreground"
          style={{
            background: paper,
            opacity: startedDeleted ? 0 : undefined,
          }}
        >
          {children}
        </div>
      </div>

      <div
        ref={headRef}
        className="relative z-10 flex flex-col overflow-clip rounded-3 border border-hairline-strong bg-surface-2 shadow-[0_6px_14px_-10px_color-mix(in_oklab,black_60%,transparent)]"
        style={{ height: g.head }}
      >
        {/* The mouth: a dark slot with the cutters' comb in it. */}
        <div
          aria-hidden
          className="relative w-full shrink-0"
          style={{ height: g.mouth, background: "oklch(0.15 0.012 258)" }}
        >
          <svg
            className={cn(
              "absolute inset-0 size-full overflow-visible transition-transform duration-150",
              aware || face === "armed" ? "translate-y-px" : "translate-y-0",
            )}
            preserveAspectRatio="none"
            viewBox={`0 0 100 ${g.mouth}`}
          >
            {/* The rollers' nip, and a cutter disc's edge at every cut. */}
            <rect
              x={0}
              y={r2(g.mouth / 2 - 0.3)}
              width={100}
              height={0.6}
              fill="oklch(0.5 0.01 258)"
            />
            <g ref={teethRef}>
              {cols.slice(1, -1).map((u, k) => (
                <rect
                  key={k}
                  x={r2(u * 100 - 0.45)}
                  y={1}
                  width={0.9}
                  height={g.mouth - 2}
                  fill="oklch(0.84 0.008 258)"
                />
              ))}
            </g>
          </svg>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2 pr-1.5 pl-3">
          <span aria-hidden className="flex items-center gap-1.5">
            <span
              ref={lampRef}
              className="size-1.5 shrink-0 rounded-full bg-signal"
              style={{ opacity: 0.3 }}
            />
            <span className="flex gap-0.5">
              <span className="h-2.5 w-px bg-hairline-strong" />
              <span className="h-2.5 w-px bg-hairline-strong" />
              <span className="h-2.5 w-px bg-hairline-strong" />
            </span>
          </span>
          <motion.button
            type="button"
            onClick={press}
            onPointerEnter={() => setAware(true)}
            onPointerLeave={() => setAware(false)}
            onFocus={() => setAware(true)}
            onBlur={() => {
              setAware(false);
              if (phaseRef.current === "armed") disarm();
            }}
            whileTap={motionSafe && !busy ? { y: 1, scale: 0.98 } : undefined}
            transition={springs.flick}
            disabled={disabled}
            aria-disabled={busy || undefined}
            aria-busy={face === "deleting" || undefined}
            aria-label={names[face]}
            aria-describedby={hint ? hintId : undefined}
            className={cn(
              "relative inline-grid shrink-0 items-center rounded-2 border font-medium transition-colors duration-150 select-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              "disabled:cursor-not-allowed disabled:opacity-50",
              g.button,
              face === "armed"
                ? "border-transparent bg-destructive text-destructive-foreground"
                : face === "deleting" || face === "deleted"
                  ? "cursor-default border-hairline bg-surface-1 text-ink-3"
                  : "border-hairline-strong bg-card text-foreground hover:bg-surface-1",
            )}
          >
            {(Object.keys(names) as Face[]).map((key) => (
              <span
                key={key}
                aria-hidden
                className={cn(
                  "col-start-1 row-start-1 flex items-center justify-center gap-1.5 transition-opacity duration-150",
                  key === face ? "opacity-100" : "opacity-0",
                )}
              >
                {key === "idle" || key === "armed" ? (
                  <Trash2 aria-hidden className={cn("shrink-0", g.icon)} />
                ) : key === "undo" ? (
                  <span
                    className={cn(
                      "relative flex shrink-0 items-center justify-center",
                      g.icon,
                    )}
                  >
                    <svg
                      viewBox="0 0 16 16"
                      className="absolute -inset-1 size-[calc(100%+8px)] -rotate-90"
                    >
                      <circle
                        cx={8}
                        cy={8}
                        r={6}
                        fill="none"
                        strokeWidth={1.25}
                        className="stroke-hairline-strong"
                      />
                      <motion.circle
                        cx={8}
                        cy={8}
                        r={6}
                        fill="none"
                        strokeWidth={1.25}
                        strokeLinecap="round"
                        strokeDasharray={r2(RING)}
                        className="stroke-current"
                        style={{ strokeDashoffset: ringOffset }}
                      />
                    </svg>
                    <Undo2 aria-hidden className="size-[70%]" />
                  </span>
                ) : key === "deleting" ? (
                  <svg
                    viewBox="0 0 16 16"
                    className={cn(
                      "shrink-0 animate-spin motion-reduce:animate-none",
                      g.icon,
                    )}
                  >
                    <circle
                      cx={8}
                      cy={8}
                      r={6}
                      fill="none"
                      strokeWidth={1.5}
                      className="stroke-hairline-strong"
                    />
                    <path
                      d="M8 2a6 6 0 0 1 6 6"
                      fill="none"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      className="stroke-current"
                    />
                  </svg>
                ) : (
                  <Check aria-hidden className={cn("shrink-0", g.icon)} />
                )}
                <span className="whitespace-nowrap">{names[key]}</span>
              </span>
            ))}
          </motion.button>
        </div>
      </div>

      {/* The bin the strips fall into, tucked up under the head. */}
      <div
        aria-hidden
        className="relative -mt-2 overflow-clip rounded-b-4 border border-t-0 border-hairline bg-surface-1"
        style={{ height: g.bin + TUCK }}
      >
        <div className="absolute inset-x-0 top-0 h-5 bg-linear-to-b from-[color-mix(in_oklab,black_14%,transparent)] to-transparent" />
        <svg
          className="absolute inset-0 size-full"
          style={{
            maskImage: "linear-gradient(to bottom, black 45%, transparent)",
          }}
        >
          <g ref={stripsRef}>
            <path
              ref={frontRef}
              d=""
              strokeWidth={0.75}
              strokeLinejoin="round"
              className="stroke-hairline-strong"
              style={{ fill: paper }}
            />
            <path
              ref={shadeRef}
              d=""
              strokeWidth={0.75}
              strokeLinejoin="round"
              className="stroke-hairline-strong"
              style={{ fill: `color-mix(in oklab, ${paper} 95%, black)` }}
            />
            <path ref={inkRef} d="" style={{ fill: ink, opacity: 0.75 }} />
            <path
              ref={backRef}
              d=""
              strokeWidth={0.75}
              strokeLinejoin="round"
              className="stroke-hairline-strong"
              style={{ fill: `color-mix(in oklab, ${paper} 87%, black)` }}
            />
          </g>
        </svg>
      </div>

      <span id={hintId} className="sr-only">
        {hint}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
