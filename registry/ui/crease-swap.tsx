"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CreaseSwapElement =
  "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div";

export type CreaseSwapPaper = "indigo" | "vermilion" | "sage" | "kraft";

export type CreaseSwapProps = {
  /** The front word, as a string. Wins over `text`. */
  children?: string;
  /** The front word, when it is not given as children. */
  text?: string;
  /** The word printed on the backs of the squares. */
  back: string;
  /** The element that carries the words. @default "p" */
  as?: CreaseSwapElement;
  /** Controlled: latched to the back word. */
  pressed?: boolean;
  /** Latched when uncontrolled. @default false */
  defaultPressed?: boolean;
  /** Fires from the press that latched or released it. */
  onPressedChange?: (pressed: boolean) => void;
  /** Time between one square folding and the next, ms. @default 70 */
  stagger?: number;
  /** How deep the crease folds mid-turn: 0 turns flat like a card, 1 folds right over before the other half follows. @default 0.5 */
  depth?: number;
  /** The coloured side of the paper. @default "indigo" */
  paperTone?: CreaseSwapPaper;
  /** Perspective distance, em: smaller is a stronger 3D. @default 4 */
  perspective?: number;
  /** How dark the squares' shadows fall, 0 to 1. @default 0.5 */
  shadow?: number;
  /** Leave a faint crease in the paper once a square has folded. @default true */
  crease?: boolean;
  /** Fold over and back once, the first time it comes into view. @default true */
  tease?: boolean;
  /** Hover, focus and presses fold it. @default true */
  interactive?: boolean;
  /** Paper sounds for the folds the visitor makes. Off unless asked for. @default false */
  sound?: boolean;
  /** Stays as it is. @default false */
  disabled?: boolean;
  /** A fold finished: true when the back word shows. */
  onTurn?: (showingBack: boolean) => void;
  className?: string;
};

const TONES: Record<CreaseSwapPaper, string> = {
  indigo: "oklch(0.42 0.12 268)",
  vermilion: "oklch(0.6 0.18 35)",
  sage: "oklch(0.6 0.075 150)",
  kraft: "oklch(0.64 0.075 65)",
};

/** Origami paper is pigment: the same squares in either theme. */
const FRONT = "oklch(0.975 0.006 90)";
const FRONT_INK = "oklch(0.25 0.03 265)";
const BACK_INK = "oklch(0.975 0.01 90)";

/** A square's side, em. */
const TILE = 1.25;

/** Paper grain as an SVG noise tile: fixed art. */
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.3 0 0 0 0 0.26 0 0 0 0 0.2 0 0 0 -1.3 0.5'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}")`;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function graphemes(text: string): string[] {
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    return Array.from(
      new Seg(undefined, { granularity: "grapheme" }).segment(text),
      (s) => s.segment,
    );
  }
  return Array.from(text);
}

/**
 * Hover is not a user activation: a sound asked for before the page has had
 * a click, tap or key would only make a context the browser will not start.
 */
const activated = (fallback: boolean) =>
  typeof navigator !== "undefined" &&
  ((navigator as { userActivation?: { hasBeenActive: boolean } }).userActivation
    ?.hasBeenActive ??
    fallback);

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

/**
 * The two creases. Entering from the left, the top-left corner lifts and
 * travels to the bottom-right over the anti-diagonal; from the right, the
 * top-right corner travels to the bottom-left over the main diagonal. Each
 * axis is signed so a positive turn lifts the leading corner toward the eye.
 */
const AXES = {
  anti: {
    ux: -1,
    uy: 1,
    lead: "polygon(0 0, 100% 0, 0 100%)",
    trail: "polygon(100% 0, 100% 100%, 0 100%)",
    line: "to bottom right",
  },
  main: {
    ux: -1,
    uy: -1,
    lead: "polygon(0 0, 100% 0, 100% 100%)",
    trail: "polygon(0 0, 100% 100%, 0 100%)",
    line: "to top right",
  },
} as const;

type Axis = keyof typeof AXES;

/** A light from the top left, toward the eye. */
const LIGHT = { x: -0.35, y: -0.55, z: 0.76 };

/** How much darker a face is than the flat sheet, from its turn about the axis. */
function shadeOf(axis: Axis, angle: number, back: boolean): number {
  const { ux, uy } = AXES[axis];
  const len = Math.hypot(ux, uy);
  const ax = ux / len;
  const ay = uy / len;
  const s = Math.sin((angle * Math.PI) / 180);
  const c = Math.cos((angle * Math.PI) / 180);
  // The face's normal after turning (0, 0, 1) about the in-plane axis.
  const dot = ay * s * LIGHT.x - ax * s * LIGHT.y + c * LIGHT.z;
  const lit = Math.max(0, back ? -dot : dot);
  return r3(Math.min(0.38, (LIGHT.z - lit) * 0.55));
}

type Square = {
  node: HTMLElement;
  lead: HTMLElement[];
  trail: HTMLElement[];
};

type Body = {
  a: Float64Array;
  av: Float64Array;
  b: Float64Array;
  bv: Float64Array;
  /** Reduced motion: each square's cross-fade toward its back. */
  f: Float64Array;
  /** When each square's leading half (and then its trailing half) may go. */
  goA: Float64Array;
  goB: Float64Array;
  /** Where each square is headed: 0 front, 180 back. */
  goal: Float64Array;
  axis: Axis[];
  creased: Uint8Array;
  side: Uint8Array;
  visitor: boolean;
  pressed: boolean;
  /** The last reported face, so a finished fold is told once. */
  told: number;
};

const bodyOf = (n: number, back: boolean): Body => {
  const at = back ? 180 : 0;
  return {
    a: new Float64Array(n).fill(at),
    av: new Float64Array(n),
    b: new Float64Array(n).fill(at),
    bv: new Float64Array(n),
    f: new Float64Array(n).fill(back ? 1 : 0),
    goA: new Float64Array(n),
    goB: new Float64Array(n),
    goal: new Float64Array(n).fill(at),
    axis: Array.from({ length: n }, () => "anti" as Axis),
    creased: new Uint8Array(n),
    side: new Uint8Array(n).fill(back ? 1 : 0),
    visitor: false,
    pressed: false,
    told: back ? 1 : 0,
  };
};

/** One side of one triangle of a square. */
function Face({
  side,
  half,
  glyph,
  paper,
  tone,
}: {
  side: "front" | "back";
  half: "a" | "b";
  glyph: string;
  paper: string;
  tone: string;
}) {
  // The leading triangle's front and the trailing triangle's back share a
  // shape; the back is turned with its triangle, so it is cut as the other.
  const leadShape = (half === "a") === (side === "front");
  return (
    <span
      data-face
      className="absolute inset-0 flex items-center justify-center [backface-visibility:hidden]"
      style={{
        transform:
          side === "back"
            ? "rotate3d(var(--ux), var(--uy), 0, 180deg)"
            : undefined,
        clipPath: leadShape ? AXES.anti.lead : AXES.anti.trail,
        backgroundColor: side === "front" ? paper : tone,
        backgroundImage: GRAIN,
        backgroundSize: "120px 120px",
        color: side === "front" ? FRONT_INK : BACK_INK,
      }}
    >
      <span
        className="leading-none"
        style={{ fontSize: `${r2(TILE * 0.68)}em` }}
      >
        {glyph}
      </span>
      <span
        className="absolute inset-0 block"
        style={{
          opacity: "var(--crease)",
          backgroundImage:
            "linear-gradient(var(--crease-line), transparent calc(50% - 0.6px), oklch(0 0 0 / 0.16) 50%, oklch(1 0 0 / 0.18) calc(50% + 0.6px), transparent calc(50% + 1.2px))",
        }}
      />
      <span
        className="absolute inset-0 block bg-[oklch(0.15_0.02_265)]"
        style={{ opacity: `var(--${side === "front" ? "f" : "b"}${half})` }}
      />
    </span>
  );
}

type Api = {
  wake: () => void;
  halt: () => void;
  fold: (back: boolean, fromLeft: boolean, visitor: boolean) => void;
};

/**
 * A word in squares of origami paper — white on the front with the letter in
 * ink, coloured on the back with the other word's letter in white. Hover and
 * the squares fold over one after another from the side you came in: the
 * corner nearest you lifts and travels over the diagonal crease to the far
 * corner, the leading triangle rising on the snap calibration and the
 * trailing one following on glide a beat behind (`depth`), so the paper
 * creases into a V along the diagonal mid-turn before it lands flat, coloured
 * side up, and the row reads the other word. Every face is shaded from its
 * own angle to a top-left light, a lifted square throws a soft shadow, and a
 * folded square keeps a faint crease. Leaving folds them back, starting from
 * the side you leave by.
 *
 * Pressing latches it — it is a toggle button with `aria-pressed` — and
 * keyboard focus folds it like a hover. One loop turns every square and stops
 * when they rest. The word showing is read once from an sr-only copy. Under
 * reduced motion no square turns: each cross-fades from its front to its back
 * in the same order.
 */
export function CreaseSwap({
  children,
  text,
  back,
  as = "p",
  pressed,
  defaultPressed = false,
  onPressedChange,
  stagger = 70,
  depth = 0.5,
  paperTone = "indigo",
  perspective = 4,
  shadow = 0.5,
  crease = true,
  tease = true,
  interactive = true,
  sound = false,
  disabled = false,
  onTurn,
  className,
}: CreaseSwapProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const front = ((typeof children === "string" ? children : text) ?? "").trim();
  const reverse = back.trim();
  const tone = TONES[paperTone] ?? TONES.indigo;
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;
  const active = interactive && !disabled;

  const [own, setOwn] = React.useState(defaultPressed);
  const latched = pressed ?? own;

  // Squares pair the two words letter for letter, centred; a place where both
  // have a space is a gap the row may wrap at.
  const model = React.useMemo(() => {
    const a = graphemes(front);
    const b = graphemes(reverse);
    const n = Math.max(a.length, b.length);
    const padA = Math.floor((n - a.length) / 2);
    const padB = Math.floor((n - b.length) / 2);
    const cells = Array.from({ length: n }, (_, k) => ({
      front: a[k - padA] ?? " ",
      back: b[k - padB] ?? " ",
    }));
    const groups: number[][] = [];
    let group: number[] = [];
    cells.forEach((cell, k) => {
      if (cell.front.trim() === "" && cell.back.trim() === "") {
        if (group.length) groups.push(group);
        group = [];
        return;
      }
      group.push(k);
    });
    if (group.length) groups.push(group);
    const squares = groups.flat();
    return { cells, groups, squares };
  }, [front, reverse]);

  // The first frame is the state the server drew, so it is held as it was.
  const [first] = React.useState(latched);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const squares = React.useRef(new Map<number, Square>());
  const body = React.useRef<Body>(bodyOf(0, first));
  const raf = React.useRef(0);
  const last = React.useRef(0);
  const live = React.useRef(running);
  const hover = React.useRef({ on: false, focus: false, quiet: false });
  const teased = React.useRef(false);
  const api = React.useRef<Api | null>(null);
  const cfg = React.useRef({
    stagger,
    depth,
    shadow,
    crease,
    motionSafe,
    audio,
    line: `${front}/${reverse}`,
    onTurn,
  });
  const frameRef = React.useRef((now: number) => {
    void now;
  });

  const wake = () => {
    if (raf.current || !live.current) return;
    last.current = performance.now();
    raf.current = window.requestAnimationFrame((ts) => frameRef.current(ts));
  };
  const halt = () => {
    if (raf.current) window.cancelAnimationFrame(raf.current);
    raf.current = 0;
  };

  /** A square starting from flat takes the crease for the side it was entered from. */
  const setAxis = (k: number, axis: Axis) => {
    const b = body.current;
    const sq = squares.current.get(k);
    b.axis[k] = axis;
    if (!sq) return;
    const spec = AXES[axis];
    sq.node.style.setProperty("--ux", String(spec.ux));
    sq.node.style.setProperty("--uy", String(spec.uy));
    // Each triangle's back is the other triangle's shape before its own turn,
    // so it lies exactly under its front.
    const [leadFront, leadBack] = sq.lead;
    const [trailFront, trailBack] = sq.trail;
    if (leadFront) leadFront.style.clipPath = spec.lead;
    if (leadBack) leadBack.style.clipPath = spec.trail;
    if (trailFront) trailFront.style.clipPath = spec.trail;
    if (trailBack) trailBack.style.clipPath = spec.lead;
    sq.node.style.setProperty("--crease-line", spec.line);
  };

  /** Every square toward one face, a stagger apart from one side. */
  const fold = (toBack: boolean, fromLeft: boolean, visitor: boolean) => {
    const b = body.current;
    const c = cfg.current;
    const now = performance.now();
    const target = toBack ? 180 : 0;
    const lag = (30 + 140 * clamp01(c.depth)) * (c.motionSafe ? 1 : 0);
    b.visitor = visitor;
    model.squares.forEach((k, rank) => {
      const order = fromLeft ? rank : model.squares.length - 1 - rank;
      const at = now + order * Math.max(0, c.stagger);
      if ((b.goal[k] ?? 0) === target) return;
      const flat =
        Math.abs((b.a[k] ?? 0) - (b.b[k] ?? 0)) < 1 &&
        Math.abs(b.a[k] ?? 0) < 1;
      if (flat) setAxis(k, fromLeft ? "anti" : "main");
      b.goal[k] = target;
      b.goA[k] = at;
      b.goB[k] = at + lag;
    });
    wake();
  };

  const stepAll = (dt: number, now: number): boolean => {
    const b = body.current;
    const c = cfg.current;
    const kA = springs.snap.stiffness / springs.snap.mass;
    const cA = springs.snap.damping / springs.snap.mass;
    const kB = springs.glide.stiffness / springs.glide.mass;
    const cB = springs.glide.damping / springs.glide.mass;
    let busy = false;
    let allBack = true;
    let allFront = true;
    for (const k of model.squares) {
      const sq = squares.current.get(k);
      const goal = b.goal[k] ?? 0;
      let a = b.a[k] ?? 0;
      let av = b.av[k] ?? 0;
      let bb = b.b[k] ?? 0;
      let bv = b.bv[k] ?? 0;
      let f = b.f[k] ?? 0;
      const tA = now >= (b.goA[k] ?? 0) ? goal : a > 90 ? 180 : 0;
      const tB = now >= (b.goB[k] ?? 0) ? goal : bb > 90 ? 180 : 0;
      if (!c.motionSafe) {
        // Still: no turn — the squares stay face up and the back is laid
        // over them in a cross-fade, in the same order.
        a = 0;
        bb = 0;
        av = 0;
        bv = 0;
        const fGoal = now >= (b.goA[k] ?? 0) ? goal / 180 : f > 0.5 ? 1 : 0;
        const stepF = dt / durations.base;
        f = fGoal > f ? Math.min(fGoal, f + stepF) : Math.max(fGoal, f - stepF);
        if (Math.abs(f - fGoal) > 1e-3 || fGoal !== goal / 180) busy = true;
      } else {
        f = goal / 180;
        let left = dt;
        while (left > 1e-7) {
          const h = Math.min(1 / 240, left);
          left -= h;
          av += (-kA * (a - tA) - cA * av) * h;
          a += av * h;
          bv += (-kB * (bb - tB) - cB * bv) * h;
          bb += bv * h;
          // Paper creases only so far: the halves never part by more than
          // the depth allows.
          const most = 25 + 125 * clamp01(c.depth);
          if (a - bb > most) bb = a - most;
          if (bb - a > most) bb = a + most;
        }
        if (
          Math.abs(a - goal) > 0.05 ||
          Math.abs(bb - goal) > 0.05 ||
          Math.abs(av) > 0.05 ||
          Math.abs(bv) > 0.05 ||
          tA !== goal ||
          tB !== goal
        ) {
          busy = true;
        }
      }
      // The crinkle as the leading corner passes upright.
      const over = a > 90 ? 1 : 0;
      if (over !== b.side[k]) {
        b.side[k] = over;
        if (b.visitor && c.motionSafe && activated(b.pressed)) {
          c.audio.play("paper", {
            pitch: r2(0.95 + ((hash(`${c.line}${k}`) % 100) / 100) * 0.3),
            gain: 0.2,
            pan: sq
              ? panFrom(sq.node.getBoundingClientRect().left, rootRef.current)
              : 0,
          });
        }
        if (over) b.creased[k] = 1;
      }
      if (goal === 0) allBack = false;
      else allFront = false;
      b.a[k] = a;
      b.av[k] = av;
      b.b[k] = bb;
      b.bv[k] = bv;
      b.f[k] = f;
      if (!sq) continue;
      const axis = b.axis[k] ?? "anti";
      const lift = Math.max(
        Math.abs(Math.sin((a * Math.PI) / 180)),
        Math.abs(Math.sin((bb * Math.PI) / 180)),
      );
      const style = sq.node.style;
      style.setProperty("--a", `${r2(a)}deg`);
      style.setProperty("--b", `${r2(bb)}deg`);
      style.setProperty("--fa", String(shadeOf(axis, a, false)));
      style.setProperty("--ba", String(shadeOf(axis, a, true)));
      style.setProperty("--fb", String(shadeOf(axis, bb, false)));
      style.setProperty("--bb", String(shadeOf(axis, bb, true)));
      style.setProperty("--lift", String(r3(c.motionSafe ? lift : 0)));
      style.setProperty("--flip", String(r3(c.motionSafe ? 0 : f)));
      style.setProperty(
        "--crease",
        String(c.crease && (b.creased[k] ?? 0) ? 1 : 0),
      );
    }
    if (!busy) {
      const face = allBack ? 1 : allFront ? 0 : -1;
      if (face >= 0 && face !== b.told) {
        b.told = face;
        c.onTurn?.(face === 1);
      }
    }
    return busy;
  };

  const frame = (now: number) => {
    raf.current = 0;
    const dt = Math.min(0.05, Math.max(0, (now - last.current) / 1000));
    last.current = now;
    const busy = stepAll(dt, now);
    if (busy && live.current) {
      raf.current = window.requestAnimationFrame((ts) => frameRef.current(ts));
    }
  };

  React.useLayoutEffect(() => {
    cfg.current = {
      stagger,
      depth,
      shadow,
      crease,
      motionSafe,
      audio,
      line: `${front}/${reverse}`,
      onTurn,
    };
    frameRef.current = frame;
    live.current = running;
    api.current = { wake, halt, fold };
  });

  React.useLayoutEffect(() => {
    body.current = bodyOf(model.cells.length, first);
    api.current?.wake();
  }, [model, first]);

  React.useEffect(() => {
    if (running) api.current?.wake();
    else api.current?.halt();
    return () => api.current?.halt();
  }, [running]);

  React.useEffect(() => {
    api.current?.wake();
  }, [motionSafe, crease, depth]);

  /** What should show now, from the latch, the hover and the focus. */
  const want = (h = hover.current, isLatched = latched) =>
    isLatched || (h.on && !h.quiet) || h.focus;

  // A host that latches or releases it folds it the way a press would.
  const shown = React.useRef(latched);
  React.useEffect(() => {
    if (shown.current === latched) return;
    shown.current = latched;
    api.current?.fold(want(), true, false);
    // `want` reads refs and the latch; the latch is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latched]);

  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const pending = new Set<number>();
      const later = (ms: number, then: () => void) => {
        const id = window.setTimeout(() => {
          pending.delete(id);
          then();
        }, ms);
        pending.add(id);
      };
      const busy = () =>
        hover.current.on || hover.current.focus || shown.current;
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        const visible = Boolean(entry?.isIntersecting);
        setOnScreen(visible);
        // Once, the first time it is seen: over and back, so a reader knows.
        if (visible && tease && !teased.current) {
          teased.current = true;
          later(450, () => {
            if (busy()) return;
            api.current?.fold(true, true, false);
            later(1300, () => {
              if (!busy()) api.current?.fold(false, true, false);
            });
          });
        }
      });
      watcher.observe(node);
      return () => {
        watcher.disconnect();
        for (const id of pending) window.clearTimeout(id);
        // A tease cut short by an unmount plays on the next mount.
        if (pending.size) teased.current = false;
      };
    },
    [tease],
  );

  const bindSquare = (k: number) => (node: HTMLSpanElement | null) => {
    if (!node) {
      squares.current.delete(k);
      return;
    }
    const halves = node.querySelectorAll<HTMLElement>("[data-half]");
    const facesOf = (half: Element | undefined) =>
      half ? Array.from(half.querySelectorAll<HTMLElement>("[data-face]")) : [];
    squares.current.set(k, {
      node,
      lead: facesOf(halves[0]),
      trail: facesOf(halves[1]),
    });
  };

  const sideOf = (clientX: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect ? clientX < rect.left + rect.width / 2 : true;
  };

  const toggle = (fromLeft: boolean) => {
    if (!active) return;
    const next = !latched;
    body.current.pressed = true;
    // Releasing under the pointer shows the front at once; the hover folds
    // it again only after the pointer has left and come back.
    hover.current.quiet = hover.current.on && !next;
    if (pressed === undefined) {
      setOwn(next);
      shown.current = next;
      fold(want(hover.current, next), fromLeft, true);
    }
    onPressedChange?.(next);
  };

  const Tag = as;
  const showing = latched ? reverse : front;
  const paper = `color-mix(in oklab, ${FRONT} 94%, var(--background))`;
  const at = first ? "180deg" : "0deg";

  return (
    <div
      ref={bindRoot}
      className={cn("relative inline-block max-w-full", className)}
      onPointerEnter={(event) => {
        if (!active || event.pointerType === "touch") return;
        hover.current = { ...hover.current, on: true, quiet: false };
        body.current.visitor = true;
        fold(want(), sideOf(event.clientX), true);
      }}
      onPointerLeave={(event) => {
        if (!active || event.pointerType === "touch") return;
        hover.current = { ...hover.current, on: false, quiet: false };
        fold(want(), sideOf(event.clientX), true);
      }}
      onClick={(event) => {
        // Pointer presses toggle from the side they landed on; Enter and
        // Space arrive as keyboard events on the button below.
        if (event.detail === 0) return;
        toggle(sideOf(event.clientX));
      }}
    >
      <Tag className="m-0 block">
        <span className="sr-only">{showing}</span>
        <span
          aria-hidden
          className="flex flex-wrap gap-x-[0.34em] gap-y-[0.14em] p-[0.32em] select-none"
        >
          {model.groups.map((group, g) => (
            <span key={g} className="flex gap-[0.08em]">
              {group.map((k) => {
                const cell = model.cells[k] ?? { front: " ", back: " " };
                const tilt = r2(((hash(`${front}${k}`) % 200) / 100 - 1) * 1.1);
                return (
                  <span
                    key={k}
                    ref={bindSquare(k)}
                    className="relative block shrink-0"
                    style={
                      {
                        width: `${TILE}em`,
                        height: `${TILE}em`,
                        perspective: `${perspective}em`,
                        rotate: `${tilt}deg`,
                        "--ux": AXES.anti.ux,
                        "--uy": AXES.anti.uy,
                        "--a": at,
                        "--b": at,
                        "--fa": 0,
                        "--ba": 0,
                        "--fb": 0,
                        "--bb": 0,
                        "--lift": 0,
                        "--flip": first ? 1 : 0,
                        "--crease": 0,
                        "--crease-line": AXES.anti.line,
                      } as React.CSSProperties
                    }
                  >
                    <span
                      className="absolute inset-[6%] block rounded-[0.04em]"
                      style={{
                        // A contact shadow at rest; lifted, the paper throws a
                        // softer, fainter one further off.
                        background: `oklch(0.15 0.02 265 / ${r2(clamp01(shadow) * 0.5)})`,
                        filter: "blur(calc(0.04em + var(--lift) * 0.14em))",
                        transform:
                          "translate(calc(0.04em + var(--lift) * 0.12em), calc(0.07em + var(--lift) * 0.18em)) scale(calc(1 - var(--lift) * 0.1))",
                        opacity: "calc(1 - var(--lift) * 0.55)",
                      }}
                    />
                    <span className="absolute inset-0 block [transform-style:preserve-3d]">
                      {(["a", "b"] as const).map((half) => (
                        <span
                          key={half}
                          data-half
                          className="absolute inset-0 block [transform-style:preserve-3d]"
                          style={{
                            transform: `rotate3d(var(--ux), var(--uy), 0, var(--${half}))`,
                          }}
                        >
                          <Face
                            side="front"
                            half={half}
                            glyph={cell.front}
                            paper={paper}
                            tone={tone}
                          />
                          <Face
                            side="back"
                            half={half}
                            glyph={cell.back}
                            paper={paper}
                            tone={tone}
                          />
                        </span>
                      ))}
                    </span>
                    {/* Reduced motion's cross-fade: the back, flat, fading in. */}
                    <span
                      className="absolute inset-0 flex items-center justify-center"
                      style={{
                        opacity: "var(--flip)",
                        backgroundColor: tone,
                        backgroundImage: GRAIN,
                        backgroundSize: "120px 120px",
                        color: BACK_INK,
                      }}
                    >
                      <span
                        className="leading-none"
                        style={{ fontSize: `${r2(TILE * 0.68)}em` }}
                      >
                        {cell.back}
                      </span>
                    </span>
                  </span>
                );
              })}
            </span>
          ))}
        </span>
      </Tag>
      {interactive ? (
        <>
          <span
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-pressed={latched}
            aria-label="Turn the letters over"
            aria-describedby={hintId}
            aria-disabled={disabled || undefined}
            onFocus={(event) => {
              if (!active || !event.currentTarget.matches(":focus-visible"))
                return;
              hover.current = { ...hover.current, focus: true };
              body.current.visitor = true;
              fold(want(), true, true);
            }}
            onBlur={() => {
              if (!hover.current.focus) return;
              hover.current = { ...hover.current, focus: false };
              fold(want(), true, true);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              toggle(true);
            }}
            className="pointer-events-none absolute inset-0 rounded-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          />
          <span id={hintId} className="sr-only">
            Hover or focus to turn the squares over to “{reverse}”; press to
            keep them turned.
          </span>
        </>
      ) : null}
    </div>
  );
}
