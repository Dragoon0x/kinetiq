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

export type RatioMorphSet = "social" | "photo" | "screen";

/** A point on the picture, as fractions of its width and height (0 to 1). */
export type RatioMorphFocalPoint = { x: number; y: number };

export type RatioMorphProps = {
  /** The shapes offered: a named set, or your own list of `"w:h"` strings. @default "social" */
  ratios?: RatioMorphSet | readonly string[];
  /** Controlled ratio, as `"w:h"`. */
  value?: string;
  /** Initial ratio when uncontrolled. @default the first of `ratios` */
  defaultValue?: string;
  /** Fires from the press or key that chose a new ratio. */
  onValueChange?: (ratio: string) => void;
  /** Controlled focal point: what the frame keeps in view as it changes shape. */
  focalPoint?: RatioMorphFocalPoint;
  /** Initial focal point when uncontrolled. @default { x: 0.5, y: 0.5 } */
  defaultFocalPoint?: RatioMorphFocalPoint;
  /** Fires when a drag is released, a tap lands or a key moves the focal point. */
  onFocalPointChange?: (point: RatioMorphFocalPoint) => void;
  /** Length of each corner bracket's arms, in px, 6 to 40. @default 16 */
  brackets?: number;
  /** Mark the focal point with a reticle. @default true */
  focal?: boolean;
  /** Rule-of-thirds lines inside the frame. @default false */
  grid?: boolean;
  /**
   * What is framed. It is laid out in a box of `pictureRatio` and scaled, so
   * give it something that fills its box (an `<img>` with `object-cover`).
   * @default a procedural harbour at dusk
   */
  picture?: React.ReactNode;
  /** The picture's own width over its height. @default 1.5 */
  pictureRatio?: number;
  /** What the picture shows, for assistive technology. */
  alt?: string;
  /** The ratio picker's accessible name. @default "Aspect ratio" */
  label?: string;
  /** Play the detents and clicks. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** The named sets, in the order their chips appear. */
export const RATIO_MORPH_SETS: Record<RatioMorphSet, readonly string[]> = {
  social: ["1:1", "4:5", "16:9", "9:16"],
  photo: ["3:2", "4:3", "1:1", "2:3"],
  screen: ["16:9", "16:10", "21:9", "4:3"],
};

type Ratio = { key: string; w: number; h: number; r: number };
type Size = { w: number; h: number };

const STAGE_H = 172;
/** Stage padding round the largest frame: the brackets and their gap fit inside it. */
const PAD = 14;
/** The brackets sit this far outside the frame. */
const GAP = 4;
/** The picture is laid out at this width and scaled to fit each frame. */
const BASE_W = 600;
/** The picture covers the frame with this much to spare, so there is always somewhere to look. */
const HEADROOM = 1.18;
/** The stage's width before it has been measured: the server's and the first client render's. */
const FALLBACK_W = 320;
const RETICLE = 22;
/** How far a reticle pulled past the picture's edge may stretch. */
const GIVE = 12;
/** The reticle's reach stops this far inside the stage, so a stretch never hides it. */
const EDGE = 8;
const STEP = 0.05;
const BIG_STEP = 0.2;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

function parseRatio(text: string): Ratio | null {
  const [a, b] = text.split(":").map((part) => Number(part.trim()));
  if (!a || !b || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a <= 0 || b <= 0) return null;
  return { key: text.trim(), w: a, h: b, r: a / b };
}

const SQUARE: Ratio = { key: "1:1", w: 1, h: 1, r: 1 };

function ratioList(ratios: RatioMorphSet | readonly string[]): Ratio[] {
  const source =
    typeof ratios === "string"
      ? (RATIO_MORPH_SETS[ratios] ?? RATIO_MORPH_SETS.social)
      : ratios;
  const seen = new Set<string>();
  const out: Ratio[] = [];
  for (const text of source) {
    const r = parseRatio(text);
    if (r && !seen.has(r.key)) {
      seen.add(r.key);
      out.push(r);
    }
  }
  return out.length > 0 ? out : ratioList("social");
}

const shapeOf = (r: Ratio) =>
  Math.abs(r.r - 1) < 0.01 ? "square" : r.r > 1 ? "landscape" : "portrait";

/** The largest frame of this ratio that fits the stage's inner box. */
function frameFor(stageWidth: number, r: number): Size {
  const bw = Math.max(48, stageWidth - PAD * 2);
  const bh = STAGE_H - PAD * 2;
  const w = Math.min(bw, bh * r);
  return { w: r2(w), h: r2(w / r) };
}

/**
 * Where the picture sits in a frame: covering it (with headroom) and shifted
 * so the focal point is as near the frame's centre as its edges allow — the
 * edges never come inside the frame.
 */
function place(stageWidth: number, fw: number, fh: number, ratio: number) {
  const ph = BASE_W / ratio;
  const s = Math.max(fw / BASE_W, fh / ph) * HEADROOM;
  return {
    left: (stageWidth - fw) / 2,
    top: (STAGE_H - fh) / 2,
    scale: s,
    iw: BASE_W * s,
    ih: ph * s,
  };
}
const shift = (frame: number, image: number, f: number) =>
  Math.min(0, Math.max(frame - image, frame / 2 - f * image));

const pitchOf = (r: number) =>
  r3(clamp(Math.pow(2, Math.log2(r) * 0.35), 0.7, 1.4));
const percent = (v: number) => `${Math.round(v * 100)}%`;
const sentence = (p: RatioMorphFocalPoint) =>
  `Focal point ${percent(p.x)} across, ${percent(p.y)} down.`;

const CENTRE: RatioMorphFocalPoint = { x: 0.5, y: 0.5 };
const DEFAULT_ALT = "Harbour at dusk with a lighthouse on the headland";

/**
 * An aspect-ratio picker that reframes a picture. Choosing a shape morphs
 * the frame: its width and height glide to the new ratio, four corner
 * brackets ride its corners as they spread or close, and the picture is
 * re-laid on every frame of the morph so its focal point stays as near the
 * centre as the picture's edges allow — a landscape going to 9:16 keeps its
 * subject rather than its middle.
 *
 * The focal point is moved by hand. Press anywhere on the stage and the
 * reticle comes to the finger and follows it 1:1, while a ghost of the whole
 * picture fades in round the frame so a subject outside the crop can be
 * picked; past the picture's edge it rubber-bands. On release the throw is
 * projected, and the picture glides to re-centre on the new point, carrying
 * the reticle with it. A tap sets it the same way.
 *
 * The chips are a real radiogroup (arrows choose, Home and End jump); the
 * stage is focusable and its arrow keys move the focal point by 5%, 20% with
 * Shift, each move announced once. Under reduced motion the frame changes
 * shape at once and its brackets fade in, the picture re-lays at once, and a
 * drag still follows the finger but lands without a glide.
 */
export function RatioMorph({
  ratios = "social",
  value,
  defaultValue,
  onValueChange,
  focalPoint,
  defaultFocalPoint = CENTRE,
  onFocalPointChange,
  brackets = 16,
  focal = true,
  grid = false,
  picture,
  pictureRatio = 1.5,
  alt,
  label = "Aspect ratio",
  sound = false,
  disabled = false,
  className,
}: RatioMorphProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const list = ratioList(ratios);
  const [own, setOwn] = React.useState(defaultValue);
  const wanted = value ?? own;
  const current = list.find((r) => r.key === wanted) ?? list[0] ?? SQUARE;

  const [ownFocal, setOwnFocal] = React.useState(defaultFocalPoint);
  const shownFocal = focalPoint ?? ownFocal;

  const pr = pictureRatio > 0 ? pictureRatio : 1.5;
  const arm = Math.round(clamp(brackets, 6, 40));

  const [stage, setStage] = React.useState<HTMLDivElement | null>(null);
  const [stageWidth, setStageWidth] = React.useState(FALLBACK_W);
  const target = frameFor(stageWidth, current.r);

  const sw = useMotionValue(stageWidth);
  const fw = useMotionValue(target.w);
  const fh = useMotionValue(target.h);
  /** Where the picture is centred. */
  const pfx = useMotionValue(clamp01(shownFocal.x));
  const pfy = useMotionValue(clamp01(shownFocal.y));
  /** Where the reticle is, on the picture: apart from the picture's point only while it is held. */
  const rfx = useMotionValue(clamp01(shownFocal.x));
  const rfy = useMotionValue(clamp01(shownFocal.y));
  const held = useMotionValue(0);
  const grip = useMotionValue(0);
  const shown = useMotionValue(1);

  const morphs = React.useRef<AnimationPlaybackControls[]>([]);
  const moves = React.useRef<AnimationPlaybackControls[]>([]);
  const fades = React.useRef<AnimationPlaybackControls[]>([]);
  const applied = React.useRef<string | null>(null);
  const armed = React.useRef<string | null>(null);
  const landing = React.useRef<Size>(target);
  const aimed = React.useRef<RatioMorphFocalPoint>(shownFocal);
  const dragging = React.useRef(false);
  const edges = React.useRef({ x: false, y: false });
  const chips = React.useRef(new Map<string, HTMLButtonElement>());

  // The stage's width is measured, not assumed: the frame is as large as the
  // stage allows, whatever column it is placed in.
  React.useEffect(() => {
    if (!stage || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const width = Math.round(stage.clientWidth);
      if (width > 0) setStageWidth(width);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stage]);

  const latest = React.useRef({ audio, currentKey: current.key });
  React.useEffect(() => {
    latest.current = { audio, currentKey: current.key };
  });

  const land = React.useCallback(() => {
    const key = armed.current;
    if (!key || key !== latest.current.currentKey) return;
    armed.current = null;
    const r = parseRatio(key);
    latest.current.audio.play("click", {
      pitch: r ? pitchOf(r.r) : 1,
      gain: 0.55,
    });
  }, []);

  // A new shape morphs; a new stage width (a resize, the first measurement)
  // goes straight there. An interrupted morph is finished, never frozen.
  React.useEffect(() => {
    const morphing =
      applied.current !== null && applied.current !== current.key;
    applied.current = current.key;
    landing.current = { w: target.w, h: target.h };
    sw.set(stageWidth);
    for (const c of morphs.current) c.stop();
    morphs.current = [];
    if (!morphing) {
      fw.set(target.w);
      fh.set(target.h);
      return;
    }
    if (!motionSafe) {
      fw.set(target.w);
      fh.set(target.h);
      shown.set(0);
      morphs.current = [
        animate(shown, 1, { duration: durations.fast, ease: easings.enter }),
      ];
      land();
      return;
    }
    morphs.current = [
      animate(fw, target.w, springs.glide),
      animate(fh, target.h, { ...springs.glide, onComplete: land }),
    ];
  }, [
    current.key,
    fh,
    fw,
    land,
    motionSafe,
    shown,
    stageWidth,
    sw,
    target.h,
    target.w,
  ]);

  // The click belongs to the frame arriving, so it is heard on the frame the
  // brackets reach their corners rather than when the spring finally rests.
  React.useEffect(() => {
    const check = () => {
      const t = landing.current;
      if (Math.abs(fw.get() - t.w) < 0.75 && Math.abs(fh.get() - t.h) < 0.75) {
        land();
      }
    };
    const offW = fw.on("change", check);
    const offH = fh.on("change", check);
    return () => {
      offW();
      offH();
    };
  }, [fh, fw, land]);

  const settle = React.useCallback(
    (to: RatioMorphFocalPoint, velocity = { x: 0, y: 0 }) => {
      for (const c of moves.current) c.stop();
      moves.current = [];
      aimed.current = to;
      if (!motionSafe) {
        pfx.set(to.x);
        pfy.set(to.y);
        rfx.set(to.x);
        rfy.set(to.y);
        return;
      }
      moves.current = [
        animate(pfx, to.x, springs.glide),
        animate(pfy, to.y, springs.glide),
        animate(rfx, to.x, { ...springs.glide, velocity: velocity.x }),
        animate(rfy, to.y, { ...springs.glide, velocity: velocity.y }),
      ];
    },
    [motionSafe, pfx, pfy, rfx, rfy],
  );

  // A host that moves the focal point gets the same reframing a drop would.
  React.useEffect(() => {
    const to = { x: clamp01(shownFocal.x), y: clamp01(shownFocal.y) };
    if (dragging.current) return;
    if (to.x === aimed.current.x && to.y === aimed.current.y) return;
    settle(to);
  }, [settle, shownFocal.x, shownFocal.y]);

  React.useEffect(
    () => () => {
      for (const c of [...morphs.current, ...moves.current, ...fades.current])
        c.stop();
    },
    [],
  );

  const fade = (to: number) => {
    for (const c of fades.current) c.stop();
    fades.current = [
      animate(
        held,
        to,
        to > 0
          ? { duration: durations.fast, ease: easings.enter }
          : { duration: durations.base, ease: easings.exit },
      ),
    ];
    // The reticle swells in the hand; under reduced motion it keeps its size.
    if (motionSafe) fades.current.push(animate(grip, to, springs.flick));
    else grip.set(0);
  };

  const commitFocal = (
    next: RatioMorphFocalPoint,
    velocity = { x: 0, y: 0 },
  ) => {
    const to = { x: r3(clamp01(next.x)), y: r3(clamp01(next.y)) };
    if (focalPoint === undefined) {
      setOwnFocal(to);
      settle(to, velocity);
    } else {
      // Controlled: head back to where the host says it is; if the host takes
      // the new point, the effect above reframes to it as soon as it answers.
      settle({ x: clamp01(focalPoint.x), y: clamp01(focalPoint.y) }, velocity);
    }
    onFocalPointChange?.(to);
  };

  const choose = (r: Ratio, from?: HTMLElement | null) => {
    if (disabled || r.key === current.key) return;
    const rect = from?.getBoundingClientRect();
    audio.play("detent", {
      pitch: pitchOf(r.r),
      gain: 0.6,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
    armed.current = r.key;
    if (value === undefined) setOwn(r.key);
    onValueChange?.(r.key);
  };

  /** Stage coordinates of a pointer, allowing for any scale on the way to the screen. */
  const toStage = (clientX: number, clientY: number) => {
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    const k = stage.offsetWidth > 0 ? rect.width / stage.offsetWidth : 1;
    return {
      x: (clientX - rect.left) / (k || 1) - stage.clientLeft,
      y: (clientY - rect.top) / (k || 1) - stage.clientTop,
    };
  };

  /** The picture's box on the stage right now, and the part of it the reticle may reach. */
  const bounds = () => {
    const g = place(sw.get(), fw.get(), fh.get(), pr);
    const x = g.left + shift(fw.get(), g.iw, pfx.get());
    const y = g.top + shift(fh.get(), g.ih, pfy.get());
    return {
      x,
      y,
      iw: g.iw,
      ih: g.ih,
      minX: Math.max(EDGE, x),
      maxX: Math.min(sw.get() - EDGE, x + g.iw),
      minY: Math.max(EDGE, y),
      maxY: Math.min(STAGE_H - EDGE, y + g.ih),
    };
  };

  const reach = (px: number, py: number, pan: number) => {
    const b = bounds();
    const x = rubberClamp(px, b.minX, b.maxX, GIVE);
    const y = rubberClamp(py, b.minY, b.maxY, GIVE);
    const outX = px < b.minX || px > b.maxX;
    const outY = py < b.minY || py > b.maxY;
    if ((outX && !edges.current.x) || (outY && !edges.current.y)) {
      audio.play("detent", { pitch: 0.8, gain: 0.45, pan });
    }
    edges.current = { x: outX, y: outY };
    rfx.set(r4((x - b.x) / b.iw));
    rfy.set(r4((y - b.y) / b.ih));
  };

  const drop = (px: number, py: number, pan: number, v = { x: 0, y: 0 }) => {
    const b = bounds();
    const x = clamp(px, b.minX, b.maxX);
    const y = clamp(py, b.minY, b.maxY);
    audio.play("click", { pitch: 0.9, gain: 0.35, pan });
    commitFocal(
      { x: (x - b.x) / b.iw, y: (y - b.y) / b.ih },
      { x: v.x / b.iw, y: v.y / b.ih },
    );
  };

  const drag = useDrag({
    disabled,
    onStart: ({ point }) => {
      const at = toStage(point.x, point.y);
      if (!at) return;
      dragging.current = true;
      edges.current = { x: false, y: false };
      for (const c of moves.current) c.stop();
      moves.current = [];
      fade(1);
      reach(at.x, at.y, panFrom(point.x, stage));
    },
    onMove: ({ point }) => {
      if (!dragging.current) return;
      const at = toStage(point.x, point.y);
      if (at) reach(at.x, at.y, panFrom(point.x, stage));
    },
    onEnd: ({ point, velocity }) => {
      if (!dragging.current) return;
      dragging.current = false;
      fade(0);
      const at = toStage(point.x, point.y);
      if (!at) return;
      // A flick lands where it would come to rest, not where the finger lifted.
      const v = motionSafe ? velocity : { x: 0, y: 0 };
      drop(
        motionSafe ? project(at.x, v.x, 0.99) : at.x,
        motionSafe ? project(at.y, v.y, 0.99) : at.y,
        panFrom(point.x, stage),
        v,
      );
    },
    onCancel: () => {
      if (!dragging.current) return;
      dragging.current = false;
      fade(0);
      settle({ x: pfx.get(), y: pfy.get() });
    },
    onTap: (event) => {
      const at = toStage(event.clientX, event.clientY);
      if (at) drop(at.x, at.y, panFrom(event.clientX, stage));
    },
  });

  const onStageKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = event.shiftKey ? BIG_STEP : STEP;
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = steps[event.key];
    if (!d) return;
    event.preventDefault();
    const from = { x: aimed.current.x, y: aimed.current.y };
    const to = {
      x: r3(clamp01(from.x + d[0])),
      y: r3(clamp01(from.y + d[1])),
    };
    const rect = stage?.getBoundingClientRect();
    const pan = rect ? panFrom(rect.left + to.x * rect.width, null) : 0;
    if (to.x === from.x && to.y === from.y) {
      audio.play("detent", { pitch: 0.8, gain: 0.45, pan });
      return;
    }
    audio.play("click", { pitch: 0.9, gain: 0.35, pan });
    commitFocal(to);
  };

  const onChipKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const i = list.findIndex((r) => r.key === current.key);
    const n = list.length;
    const to: Record<string, number> = {
      ArrowRight: (i + 1) % n,
      ArrowDown: (i + 1) % n,
      ArrowLeft: (i - 1 + n) % n,
      ArrowUp: (i - 1 + n) % n,
      Home: 0,
      End: n - 1,
    };
    const next = to[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const r = list[next];
    if (!r) return;
    const node = chips.current.get(r.key);
    node?.focus();
    choose(r, node);
  };

  // Per-frame geometry: every number below is derived from the motion values,
  // rounded before it reaches a style.
  const geo = [sw, fw, fh] as MotionValue<number>[];
  const clipPath = useTransform(geo, ([s, w, h]) => {
    const g = place(s as number, w as number, h as number, pr);
    return `inset(${r2(g.top)}px ${r2(g.left)}px round 6px)`;
  });
  const picX = useTransform(
    [sw, fw, fh, pfx] as MotionValue<number>[],
    ([s, w, h, f]) => {
      const g = place(s as number, w as number, h as number, pr);
      return r2(g.left + shift(w as number, g.iw, f as number));
    },
  );
  const picY = useTransform(
    [sw, fw, fh, pfy] as MotionValue<number>[],
    ([s, w, h, f]) => {
      const g = place(s as number, w as number, h as number, pr);
      return r2(g.top + shift(h as number, g.ih, f as number));
    },
  );
  const picScale = useTransform(geo, ([s, w, h]) =>
    r4(place(s as number, w as number, h as number, pr).scale),
  );
  const reticleX = useTransform(
    [picX, sw, fw, fh, rfx] as MotionValue<number>[],
    ([x, s, w, h, f]) => {
      const g = place(s as number, w as number, h as number, pr);
      return r2((x as number) + (f as number) * g.iw - RETICLE / 2);
    },
  );
  const reticleY = useTransform(
    [picY, sw, fw, fh, rfy] as MotionValue<number>[],
    ([y, s, w, h, f]) => {
      const g = place(s as number, w as number, h as number, pr);
      return r2((y as number) + (f as number) * g.ih - RETICLE / 2);
    },
  );
  const reticleScale = useTransform(grip, (g) => r3(1 + 0.18 * g));
  const ghost = useTransform(held, (h) => r3(clamp01(h) * 0.3));
  const lines = useTransform(held, (h) => r3(0.32 + 0.4 * clamp01(h)));

  const left = useTransform([sw, fw] as MotionValue<number>[], ([s, w]) =>
    r2(((s as number) - (w as number)) / 2),
  );
  const top = useTransform(fh, (h) => r2((STAGE_H - h) / 2));
  const nearX = useTransform(left, (l) => r2(l - GAP));
  const farX = useTransform([left, fw] as MotionValue<number>[], ([l, w]) =>
    r2((l as number) + (w as number) + GAP - arm),
  );
  const nearY = useTransform(top, (t) => r2(t - GAP));
  const farY = useTransform([top, fh] as MotionValue<number>[], ([t, h]) =>
    r2((t as number) + (h as number) + GAP - arm),
  );
  const third1X = useTransform([left, fw] as MotionValue<number>[], ([l, w]) =>
    r2((l as number) + (w as number) / 3),
  );
  const third2X = useTransform([left, fw] as MotionValue<number>[], ([l, w]) =>
    r2((l as number) + ((w as number) * 2) / 3),
  );
  const third1Y = useTransform([top, fh] as MotionValue<number>[], ([t, h]) =>
    r2((t as number) + (h as number) / 3),
  );
  const third2Y = useTransform([top, fh] as MotionValue<number>[], ([t, h]) =>
    r2((t as number) + ((h as number) * 2) / 3),
  );

  const [spoken, setSpoken] = React.useState({
    at: `${shownFocal.x}:${shownFocal.y}`,
    text: "",
  });
  const focalKey = `${shownFocal.x}:${shownFocal.y}`;
  if (spoken.at !== focalKey) {
    setSpoken({ at: focalKey, text: sentence(shownFocal) });
  }

  const ph = BASE_W / pr;
  // Two copies are drawn (the ghost and the framed one); each needs its own ids.
  const art = (copy: string) => picture ?? <Harbour uid={`${uid}${copy}`} />;
  // The hint adds its own full stop, so one the alt text carries is dropped.
  const description = (alt ?? (picture ? "The picture" : DEFAULT_ALT))
    .trim()
    .replace(/[.!?]+$/, "");

  const bracket = (
    x: MotionValue<number>,
    y: MotionValue<number>,
    corner: string,
  ) => (
    <motion.span
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-0 left-0 border-foreground",
        corner,
      )}
      style={{ x, y, width: arm, height: arm, opacity: shown }}
    />
  );

  return (
    <div
      className={cn(
        "relative flex w-full flex-col gap-2",
        disabled && "opacity-50",
        className,
      )}
    >
      <div
        ref={setStage}
        role="application"
        aria-roledescription="picture frame"
        aria-label="Focal point"
        aria-describedby={hintId}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onStageKey}
        {...drag}
        className={cn(
          "relative w-full shrink-0 touch-none overflow-clip rounded-3 border border-hairline bg-surface-0 [contain:paint] select-none",
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-not-allowed" : "cursor-crosshair",
        )}
        style={{ height: STAGE_H }}
      >
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-0 left-0"
          style={{
            width: BASE_W,
            height: r2(ph),
            x: picX,
            y: picY,
            scale: picScale,
            originX: 0,
            originY: 0,
            opacity: ghost,
          }}
        >
          {art("g")}
        </motion.div>

        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ clipPath }}
        >
          <motion.div
            className="absolute top-0 left-0"
            style={{
              width: BASE_W,
              height: r2(ph),
              x: picX,
              y: picY,
              scale: picScale,
              originX: 0,
              originY: 0,
            }}
          >
            {art("f")}
          </motion.div>
          {grid ? (
            <>
              <motion.span
                className="absolute top-0 left-0 h-full w-px bg-primary-foreground"
                style={{ x: third1X, opacity: lines }}
              />
              <motion.span
                className="absolute top-0 left-0 h-full w-px bg-primary-foreground"
                style={{ x: third2X, opacity: lines }}
              />
              <motion.span
                className="absolute top-0 left-0 h-px w-full bg-primary-foreground"
                style={{ y: third1Y, opacity: lines }}
              />
              <motion.span
                className="absolute top-0 left-0 h-px w-full bg-primary-foreground"
                style={{ y: third2Y, opacity: lines }}
              />
            </>
          ) : null}
        </motion.div>

        {focal ? (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute top-0 left-0"
            style={{
              x: reticleX,
              y: reticleY,
              scale: reticleScale,
              width: RETICLE,
              height: RETICLE,
            }}
          >
            <svg
              viewBox="0 0 22 22"
              width={RETICLE}
              height={RETICLE}
              className="block overflow-visible"
              fill="none"
            >
              <circle
                cx={11}
                cy={11}
                r={7}
                strokeWidth={3.5}
                style={{
                  stroke: "color-mix(in oklab, black 42%, transparent)",
                }}
              />
              <circle
                cx={11}
                cy={11}
                r={7}
                strokeWidth={1.5}
                className="stroke-primary-foreground"
              />
              <path
                d="M11 1V4M11 18V21M1 11H4M18 11H21"
                strokeWidth={3.5}
                strokeLinecap="round"
                style={{
                  stroke: "color-mix(in oklab, black 42%, transparent)",
                }}
              />
              <path
                d="M11 1V4M11 18V21M1 11H4M18 11H21"
                strokeWidth={1.5}
                strokeLinecap="round"
                className="stroke-primary-foreground"
              />
              <circle
                cx={11}
                cy={11}
                r={1.6}
                className="fill-primary-foreground"
              />
            </svg>
          </motion.span>
        ) : null}

        {bracket(nearX, nearY, "rounded-tl-[4px] border-t-2 border-l-2")}
        {bracket(farX, nearY, "rounded-tr-[4px] border-t-2 border-r-2")}
        {bracket(nearX, farY, "rounded-bl-[4px] border-b-2 border-l-2")}
        {bracket(farX, farY, "rounded-br-[4px] border-r-2 border-b-2")}
      </div>

      <div
        role="radiogroup"
        aria-label={label}
        aria-disabled={disabled || undefined}
        className="@container grid auto-cols-fr grid-flow-col gap-1.5"
      >
        {list.map((r) => {
          const checked = r.key === current.key;
          const gw = r.r >= 1 ? 12 : 12 * r.r;
          const gh = r.r >= 1 ? 12 / r.r : 12;
          return (
            <button
              key={r.key}
              ref={(node) => {
                if (node) chips.current.set(r.key, node);
                else chips.current.delete(r.key);
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`${r.w} by ${r.h}, ${shapeOf(r)}`}
              tabIndex={checked ? 0 : -1}
              disabled={disabled}
              onClick={(event) => choose(r, event.currentTarget)}
              onKeyDown={onChipKey}
              className={cn(
                "inline-flex h-8 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-2 border px-2 font-mono text-[11px] tabular-nums transition-colors duration-150",
                "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                "disabled:cursor-not-allowed",
                checked
                  ? "border-cobalt-bright/40 bg-cobalt-wash text-cobalt-bright"
                  : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <svg
                aria-hidden
                viewBox="0 0 14 14"
                // A narrow row keeps the ratio whole and lets the glyph go.
                className="size-3.5 shrink-0 @max-[300px]:hidden"
                fill="none"
              >
                <rect
                  x={r3(7 - gw / 2)}
                  y={r3(7 - gh / 2)}
                  width={r3(gw)}
                  height={r3(gh)}
                  rx={1.5}
                  stroke="currentColor"
                  strokeWidth={1.25}
                  fill="currentColor"
                  fillOpacity={checked ? 0.28 : 0}
                />
              </svg>
              <span className="truncate" title={r.key}>
                {r.key}
              </span>
            </button>
          );
        })}
      </div>

      <p id={hintId} className="sr-only">
        {`${description}. Drag or tap to place the focal point, or use the arrow keys; Shift moves further.`}
      </p>
      <p role="status" className="sr-only">
        {spoken.text}
      </p>
    </div>
  );
}

/**
 * A harbour at dusk, drawn from the theme's own colours so it sits in light
 * and dark alike: sky, sun, hills, a headland with a lighthouse, a boat.
 * The lighthouse is the subject a focal point is set on.
 */
function Harbour({ uid }: { uid: string }) {
  const sky = `${uid}-sky`;
  const sea = `${uid}-sea`;
  const glow = `${uid}-glow`;
  const dark = "color-mix(in oklab, var(--accent) 22%, black)";
  const hull = "color-mix(in oklab, var(--accent) 16%, black)";
  const light = "color-mix(in oklab, var(--warn) 30%, white)";
  return (
    <svg
      viewBox="0 0 600 400"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
    >
      <defs>
        <linearGradient id={sky} x1={0} y1={0} x2={0} y2={1}>
          <stop
            offset={0}
            style={{
              stopColor: "color-mix(in oklab, var(--accent) 70%, black)",
            }}
          />
          <stop
            offset={0.55}
            style={{
              stopColor: "color-mix(in oklab, var(--accent) 55%, var(--warn))",
            }}
          />
          <stop
            offset={1}
            style={{ stopColor: "color-mix(in oklab, var(--warn) 85%, white)" }}
          />
        </linearGradient>
        <linearGradient id={sea} x1={0} y1={0} x2={0} y2={1}>
          <stop
            offset={0}
            style={{
              stopColor: "color-mix(in oklab, var(--accent) 60%, var(--warn))",
            }}
          />
          <stop
            offset={1}
            style={{
              stopColor: "color-mix(in oklab, var(--accent) 45%, black)",
            }}
          />
        </linearGradient>
        <radialGradient id={glow}>
          <stop
            offset={0}
            style={{
              stopColor: "color-mix(in oklab, var(--warn) 70%, white)",
              stopOpacity: 0.7,
            }}
          />
          <stop
            offset={1}
            style={{ stopColor: "var(--warn)", stopOpacity: 0 }}
          />
        </radialGradient>
      </defs>
      <rect width={600} height={272} fill={`url(#${sky})`} />
      <circle cx={404} cy={232} r={130} fill={`url(#${glow})`} />
      <circle cx={404} cy={236} r={34} style={{ fill: light }} />
      <path
        d="M0 258C70 236 140 244 214 254S360 236 450 248S560 244 600 246V274H0Z"
        style={{ fill: "color-mix(in oklab, var(--accent) 40%, black)" }}
        opacity={0.75}
      />
      <rect y={268} width={600} height={132} fill={`url(#${sea})`} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect
          key={i}
          x={404 - (44 - i * 6)}
          y={280 + i * 14}
          width={(44 - i * 6) * 2}
          height={3}
          rx={1.5}
          style={{ fill: light }}
          opacity={r2(0.55 - i * 0.07)}
        />
      ))}
      <path
        d="M0 292C36 254 96 236 160 250C204 260 240 284 276 318C300 340 318 368 330 400H0Z"
        style={{ fill: dark }}
      />
      <path
        d="M148 186L184 176L184 196Z"
        style={{ fill: light }}
        opacity={0.3}
      />
      <path
        d="M140 188L96 176L96 200Z"
        style={{ fill: light }}
        opacity={0.18}
      />
      <path d="M142 250L146 196H158L162 250Z" style={{ fill: light }} />
      <path d="M143.6 229H160.4L161.2 239H142.8Z" className="fill-danger" />
      <path d="M145.2 208H158.8L159.5 217H144.5Z" className="fill-danger" />
      <rect
        x={144}
        y={184}
        width={16}
        height={12}
        rx={1}
        style={{ fill: dark }}
      />
      <rect
        x={146.5}
        y={186}
        width={11}
        height={8}
        rx={1}
        style={{ fill: "color-mix(in oklab, var(--warn) 60%, white)" }}
      />
      <path d="M142 184L152 174L162 184Z" style={{ fill: dark }} />
      <path d="M470 330H520L512 340H478Z" style={{ fill: hull }} />
      <path d="M494 328V296L512 328Z" style={{ fill: light }} opacity={0.85} />
      <path
        d="M300 132Q306 126 312 132Q318 126 324 132M336 116Q340 112 344 116Q348 112 352 116"
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        style={{ stroke: hull }}
        opacity={0.7}
      />
    </svg>
  );
}
