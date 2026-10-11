"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MeltSwapTrigger = "mount" | "inView" | "hover" | "manual";
export type MeltSwapAlign = "start" | "center" | "end";

export type MeltSwapProps = {
  /** The words it swaps between, in order. @default ["melted", "tempered", "poured", "set"] */
  words?: readonly string[];
  /** Controlled: the index of the word shown. A new value pours into that word. */
  value?: number;
  /** The first word shown when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires when the word changes — from the timer, a hover or a host — with the new index, as the swap begins. */
  onValueChange?: (index: number) => void;
  /** Rest between swaps, in ms, before `pace`; 0 swaps only on hover or a new `value`. @default 2400 */
  interval?: number;
  /** How thick the liquid is, 0 to 1: runny beads race, splash and wobble; thick ones crawl and firm up composed. @default 0.5 */
  viscosity?: number;
  /** How wet the molten letters look, 0 (matte) to 1 (a bright highlight and shaded edges). @default 0.6 */
  gloss?: number;
  /** Speed of the whole pour, 0.25 to 2; the rest between swaps scales with it. @default 1 */
  pace?: number;
  /** Delay between letters starting to soften, in ms, from the middle of the word outward. @default 36 */
  stagger?: number;
  /** Wait before the first swap once triggered, in ms. @default 600 */
  delay?: number;
  /** What starts the swaps: on mount, on scrolling into view, one per hover or focus, or only a new `value`. @default "inView" */
  trigger?: MeltSwapTrigger;
  /** Stop at the last word instead of wrapping round. @default false */
  once?: boolean;
  /** Hold the current word; a swap under way finishes. @default false */
  paused?: boolean;
  /** Where each word sits in the box reserved for the widest. @default "center" */
  align?: MeltSwapAlign;
  /** The molten letters' colour, any CSS colour; they cool to the text colour as they firm. @default "currentColor" */
  liquidColor?: string;
  /** Announce each settled word politely to screen readers. @default false */
  announce?: boolean;
  /** The element to render. @default "span" */
  as?: React.ElementType;
  /** Fires when a swap has settled, with the index of the word now shown. */
  onComplete?: (index: number) => void;
  className?: string;
};

const DEFAULT_WORDS = ["melted", "tempered", "poured", "set"] as const;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0 || 1));
  return t * t * (3 - 2 * t);
};
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const mod = (v: number, m: number) => ((v % m) + m) % m;

/** The damping ratio of a calibration spring, so the liquid can borrow its personality. */
const zetaOf = (s: { stiffness: number; damping: number; mass: number }) =>
  s.damping / (2 * Math.sqrt(s.stiffness * s.mass));
const GLIDE_Z = zetaOf(springs.glide);
const RECOIL_Z = zetaOf(springs.recoil);

type Spring = { k: number; c: number };
const springOf = (k: number, zeta: number): Spring => ({
  k,
  c: 2 * zeta * Math.sqrt(k),
});

/** The physics integrates at a fixed 120 Hz, whatever the display's rate. */
const STEP = 1 / 120;

/** Grapheme clusters, so an accent or an emoji never splits into a drop of its own. */
function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

const isBlank = (g: string) => g.trim() === "";

/**
 * Which letters two words share: the longest common run in order first (so
 * they glide without crossing), then any leftover letter that still has a
 * twin, nearest place first.
 */
function matchLetters(a: string[], b: string[]): Map<number, number> {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = dp[i] as number[];
    const below = dp[i + 1] as number[];
    for (let j = m - 1; j >= 0; j -= 1) {
      row[j] =
        a[i] === b[j] && !isBlank(a[i] ?? "")
          ? (below[j + 1] ?? 0) + 1
          : Math.max(below[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const pairs = new Map<number, number>();
  const usedB = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j] && !isBlank(a[i] ?? "")) {
      pairs.set(i, j);
      usedB.add(j);
      i += 1;
      j += 1;
    } else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  for (let x = 0; x < n; x += 1) {
    if (pairs.has(x) || isBlank(a[x] ?? "")) continue;
    let best = -1;
    let bestD = Infinity;
    for (let y = 0; y < m; y += 1) {
      if (usedB.has(y) || b[y] !== a[x]) continue;
      const d = Math.abs(x / Math.max(1, n) - y / Math.max(1, m));
      if (d < bestD) {
        bestD = d;
        best = y;
      }
    }
    if (best >= 0) {
      pairs.set(x, best);
      usedB.add(best);
    }
  }
  return pairs;
}

type Box = { ch: string; x: number; y: number; w: number; h: number };
type Layout = { boxes: Box[]; baseline: number };

type Glyph = Box & {
  /** Baseline, from the top of the glyph's own box. */
  by: number;
};

type Plan = {
  id: number;
  from: number;
  to: number;
  font: number;
  melters: (Glyph & { start: number })[];
  risers: (Glyph & { feeders: number[] })[];
  shared: (Glyph & { x1: number; y1: number })[];
  drops: {
    x0: number;
    x1: number;
    y: number;
    w: number;
    h: number;
    start: number;
    /** -1: the drop buds from a shared letter instead of a melting one. */
    melter: number;
    absorb: boolean;
  }[];
};

/** Reads every letter's box in one word row, relative to the root. */
function measureRow(row: HTMLElement): Layout {
  const boxes: Box[] = [];
  let baseline = 0;
  for (const child of Array.from(row.children)) {
    const el = child as HTMLElement;
    if (el.dataset.base !== undefined) {
      baseline = el.offsetTop + el.offsetHeight;
      continue;
    }
    boxes.push({
      ch: el.textContent ?? "",
      x: el.offsetLeft,
      y: el.offsetTop,
      w: el.offsetWidth,
      h: el.offsetHeight,
    });
  }
  return { boxes, baseline };
}

/**
 * Turns two measured words into a pour: which letters melt, which rise, which
 * glide across, and where every bead of liquid goes. Beads are mapped in
 * order, so they never cross: extra beads pool into one letter, too few split.
 */
function makePlan(
  id: number,
  from: number,
  to: number,
  a: Layout,
  b: Layout,
  font: number,
  viscosity: number,
  staggerS: number,
): Plan {
  const pairs = matchLetters(
    a.boxes.map((x) => x.ch),
    b.boxes.map((x) => x.ch),
  );
  const sharedB = new Set(pairs.values());
  const glyph = (box: Box, baseline: number): Glyph => ({
    ...box,
    by: baseline - box.y,
  });

  const melterBoxes = a.boxes
    .map((box, i) => ({ box, i }))
    .filter(({ box, i }) => !pairs.has(i) && !isBlank(box.ch));
  const riserBoxes = b.boxes
    .map((box, j) => ({ box, j }))
    .filter(({ box, j }) => !sharedB.has(j) && !isBlank(box.ch));

  // Soften from the middle of the change outward.
  const span = melterBoxes.map(({ box }) => box.x + box.w / 2);
  const mid = span.length
    ? (Math.min(...span) + Math.max(...span)) / 2
    : a.boxes.reduce((s, x) => s + x.x + x.w / 2, 0) /
      Math.max(1, a.boxes.length);
  const order = melterBoxes
    .map((m, k) => ({ k, d: Math.abs(m.box.x + m.box.w / 2 - mid) }))
    .sort((p, q) => p.d - q.d);
  const startOf = new Array<number>(melterBoxes.length).fill(0);
  order.forEach((o, rank) => {
    startOf[o.k] = rank * staggerS;
  });

  const melters = melterBoxes.map(({ box }, k) => ({
    ...glyph(box, a.baseline),
    start: startOf[k] ?? 0,
  }));
  const risers = riserBoxes.map(({ box }) => ({
    ...glyph(box, b.baseline),
    feeders: [] as number[],
  }));
  const shared = [...pairs.entries()].map(([i, j]) => {
    const fromBox = a.boxes[i] as Box;
    const toBox = b.boxes[j] as Box;
    return {
      ...glyph(fromBox, a.baseline),
      x1: toBox.x,
      y1: toBox.y,
    };
  });

  const em = font;
  const dropH = em * lerp(0.32, 0.42, viscosity);
  const dropW = (w: number) =>
    clamp(w * lerp(0.62, 0.76, viscosity), em * 0.32, em * 0.8);
  const drops: Plan["drops"] = [];
  const centre = (g: Glyph) => g.x + g.w / 2;
  const M = melters.length;
  const R = risers.length;

  if (M > 0 && R > 0) {
    if (M >= R) {
      melters.forEach((m, k) => {
        const r = Math.min(R - 1, Math.floor((k * R) / M));
        const target = risers[r];
        if (!target) return;
        target.feeders.push(drops.length);
        drops.push({
          x0: centre(m),
          x1: centre(target),
          y: a.baseline,
          w: dropW(m.w),
          h: dropH,
          start: m.start,
          melter: k,
          absorb: false,
        });
      });
    } else {
      // Too few beads: one splits to feed several letters.
      const links = new Array<number>(M).fill(0);
      for (let r = 0; r < R; r += 1) {
        const k = Math.min(M - 1, Math.floor((r * M) / R));
        links[k] = (links[k] ?? 0) + 1;
      }
      for (let r = 0; r < R; r += 1) {
        const k = Math.min(M - 1, Math.floor((r * M) / R));
        const m = melters[k];
        const target = risers[r];
        if (!m || !target) continue;
        target.feeders.push(drops.length);
        drops.push({
          x0: centre(m),
          x1: centre(target),
          y: a.baseline,
          w: dropW(m.w) / Math.sqrt(links[k] ?? 1),
          h: dropH / Math.pow(links[k] ?? 1, 0.25),
          start: m.start,
          melter: k,
          absorb: false,
        });
      }
    }
  } else if (M > 0) {
    // Nothing new to pour into: the beads run into the nearest kept letter.
    melters.forEach((m, k) => {
      let best: { x1: number; y1: number; w: number } | null = null;
      let bestD = Infinity;
      for (const s of shared) {
        const d = Math.abs(s.x1 + s.w / 2 - centre(m));
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      drops.push({
        x0: centre(m),
        x1: best ? best.x1 + best.w / 2 : centre(m),
        y: a.baseline,
        w: dropW(m.w),
        h: dropH,
        start: m.start,
        melter: k,
        absorb: true,
      });
    });
  } else if (R > 0) {
    // Nothing melts: liquid buds off the nearest kept letter instead.
    risers.forEach((r, j) => {
      let best: Glyph | null = null;
      let bestD = Infinity;
      for (const s of shared) {
        const d = Math.abs(s.x1 + s.w / 2 - centre(r));
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      r.feeders.push(drops.length);
      drops.push({
        x0: best ? best.x + best.w / 2 : centre(r),
        x1: centre(r),
        y: b.baseline,
        w: dropW(r.w),
        h: dropH,
        start: j * staggerS,
        melter: -1,
        absorb: false,
      });
    });
  }

  return { id, from, to, font, melters, risers, shared, drops };
}

type Tuning = {
  viscosity: number;
  gloss: number;
  pace: number;
};

type Engine = {
  start: () => void;
  stop: () => void;
  tune: (t: Tuning) => void;
};

/**
 * One pour, integrated at 120 Hz and written straight to the layer's nodes —
 * transforms, blur, opacity and colour, every number rounded — so React
 * renders the plan once and never again per frame. `start` resumes from
 * wherever a previous `stop` left it, which is what makes StrictMode's
 * rehearsal mount harmless.
 */
function createEngine(
  plan: Plan,
  goo: HTMLElement,
  crisp: HTMLElement,
  liquid: string,
  tuning: Tuning,
  onDone: () => void,
): Engine {
  let t = tuning;
  const em = plan.font;
  const pick = (root: HTMLElement, attr: string) =>
    Array.from(root.querySelectorAll<HTMLElement>(`[${attr}]`));
  const melterEls = pick(goo, "data-melter");
  const dropEls = pick(goo, "data-drop");
  const riserEls = pick(goo, "data-riser");
  const poolEls = pick(goo, "data-pool");
  const sharedEls = pick(crisp, "data-shared");
  const firmEls = pick(crisp, "data-firm");

  const dropX = plan.drops.map((d) => d.x0);
  const dropV = plan.drops.map(() => 0);
  const dropArrived = plan.drops.map(() => 0);
  const riserR = plan.risers.map(() => 0.15);
  const riserV = plan.risers.map(() => 0);
  const riserT0 = plan.risers.map(() => -1);
  const riserFirm = plan.risers.map(() => false);
  const riserRest = plan.risers.map(() => false);
  const sharedX = plan.shared.map((s) => s.x);
  const sharedY = plan.shared.map((s) => s.y);
  const sharedV = plan.shared.map(() => 0);
  const sharedVy = plan.shared.map(() => 0);
  // Each melting letter leans toward wherever its liquid is going.
  const lean = plan.melters.map((_, k) => {
    const d = plan.drops.find((x) => x.melter === k);
    return d ? Math.sign(d.x1 - d.x0) : 0;
  });

  let clock = 0;
  let frame = 0;
  let last = 0;
  let acc = 0;
  let finished = false;

  // Timings and springs for the current tuning, worked out once per change
  // rather than every frame.
  const paramsOf = (tune: Tuning) => {
    const v = clamp01(tune.viscosity);
    return {
      meltDur: lerp(0.26, 0.4, v),
      blur: em * lerp(0.085, 0.125, v),
      slide: springOf(
        springs.glide.stiffness * lerp(0.72, 0.28, v),
        lerp(0.7, GLIDE_Z, v),
      ),
      rise: springOf(
        springs.recoil.stiffness * lerp(0.8, 0.32, v),
        lerp(RECOIL_Z * 0.9, 0.9, v),
      ),
      firmDur: lerp(0.3, 0.46, v),
      glide: springOf(springs.glide.stiffness * lerp(0.85, 0.5, v), GLIDE_Z),
      sharedAt: 0.08 + v * 0.08,
    };
  };
  let p = paramsOf(t);

  const step = (dt: number) => {
    clock += dt;
    // Beads: grow under their melting letter, then slide along the baseline.
    plan.drops.forEach((d, i) => {
      const mu = clamp01((clock - d.start) / p.meltDur);
      if (mu < 0.6) return;
      const x = dropX[i] ?? d.x0;
      const v = dropV[i] ?? 0;
      const a = -p.slide.k * (x - d.x1) - p.slide.c * v;
      const nv = v + a * dt;
      dropV[i] = nv;
      dropX[i] = x + nv * dt;
      const reach = Math.max(em * 0.28, Math.abs(d.x1 - d.x0) * 0.3);
      const arrived =
        1 - smooth(em * 0.03, reach, Math.abs((dropX[i] ?? 0) - d.x1));
      dropArrived[i] = Math.max(dropArrived[i] ?? 0, arrived);
    });
    // Letters rise out of their pool once enough liquid has arrived.
    plan.risers.forEach((r, j) => {
      const fill =
        r.feeders.reduce((s, f) => s + (dropArrived[f] ?? 0), 0) /
        Math.max(1, r.feeders.length);
      if ((riserT0[j] ?? -1) < 0) {
        if (fill >= 0.35) riserT0[j] = clock;
        else return;
      }
      const x = riserR[j] ?? 0.15;
      const v = riserV[j] ?? 0;
      const a = -p.rise.k * (x - 1) - p.rise.c * v;
      const nv = v + a * dt;
      riserV[j] = nv;
      riserR[j] = x + nv * dt;
      if (!riserFirm[j] && clock - (riserT0[j] ?? 0) >= p.firmDur) {
        riserFirm[j] = true;
      }
      if (
        riserFirm[j] &&
        Math.abs((riserR[j] ?? 1) - 1) < 0.003 &&
        Math.abs(riserV[j] ?? 0) < 0.03
      ) {
        riserR[j] = 1;
        riserV[j] = 0;
        riserRest[j] = true;
      }
    });
    // Shared letters keep their substance and glide across.
    if (clock >= p.sharedAt) {
      plan.shared.forEach((s, i) => {
        const x = sharedX[i] ?? s.x;
        const v = sharedV[i] ?? 0;
        const a = -p.glide.k * (x - s.x1) - p.glide.c * v;
        sharedV[i] = v + a * dt;
        sharedX[i] = x + (sharedV[i] ?? 0) * dt;
        const y = sharedY[i] ?? s.y;
        const vy = sharedVy[i] ?? 0;
        const ay = -p.glide.k * (y - s.y1) - p.glide.c * vy;
        sharedVy[i] = vy + ay * dt;
        sharedY[i] = y + (sharedVy[i] ?? 0) * dt;
      });
    }
  };

  const settled = () => {
    const meltersDone = plan.melters.every((m) => clock - m.start >= p.meltDur);
    const dropsDone = plan.drops.every((_, i) => (dropArrived[i] ?? 0) > 0.995);
    const risersDone = riserRest.every(Boolean);
    const sharedDone = plan.shared.every(
      (s, i) =>
        Math.abs((sharedX[i] ?? 0) - s.x1) < 0.05 &&
        Math.abs(sharedV[i] ?? 0) < 1 &&
        Math.abs((sharedY[i] ?? 0) - s.y1) < 0.05,
    );
    return (meltersDone && dropsDone && risersDone && sharedDone) || clock > 6;
  };

  const paint = () => {
    plan.melters.forEach((m, k) => {
      const el = melterEls[k];
      if (!el) return;
      const mu = clamp01((clock - m.start) / p.meltDur);
      const e = smooth(0, 1, mu);
      el.style.transform = `translate(${r2(m.x)}px, ${r2(m.y)}px) scale(${r3(1 + 0.22 * e)}, ${r3(1 - 0.7 * e)}) skewX(${r2(-(lean[k] ?? 0) * 9 * e)}deg)`;
      el.style.filter = e > 0.002 ? `blur(${r2(p.blur * e)}px)` : "none";
      el.style.opacity = String(r3(1 - smooth(0.55, 1, mu)));
      el.style.color = `color-mix(in oklab, ${liquid} ${Math.round(smooth(0, 0.6, mu) * 100)}%, currentColor)`;
    });
    plan.drops.forEach((d, i) => {
      const el = dropEls[i];
      if (!el) return;
      const mu = clamp01((clock - d.start) / p.meltDur);
      const grow = smooth(0.1, 0.8, mu);
      const arrived = dropArrived[i] ?? 0;
      const s = grow * (1 - 0.92 * arrived);
      const speed = Math.abs(dropV[i] ?? 0) / Math.max(1, em);
      const stretch = 1 + Math.min(0.9, speed * 0.12);
      const x = dropX[i] ?? d.x0;
      el.style.transform = `translate(${r2(x - d.w / 2)}px, ${r2(d.y - d.h + em * 0.05)}px) scale(${r3(s * stretch)}, ${r3(s / Math.sqrt(stretch))})`;
      el.style.opacity = arrived > 0.995 ? "0" : "1";
    });
    plan.risers.forEach((r, j) => {
      const el = riserEls[j];
      const pool = poolEls[j];
      const firm = firmEls[j];
      const fill =
        r.feeders.reduce((s, f) => s + (dropArrived[f] ?? 0), 0) /
        Math.max(1, r.feeders.length);
      const t0 = riserT0[j] ?? -1;
      const f = t0 < 0 ? 0 : smooth(0, p.firmDur, clock - t0);
      const sy = riserR[j] ?? 0.15;
      const sx = Math.min(1.25, 1 / Math.sqrt(Math.max(0.15, sy)));
      const transform = `translate(${r2(r.x)}px, ${r2(r.y)}px) scale(${r3(sx)}, ${r3(sy)})`;
      if (pool) {
        const ps = fill * (1 - f);
        pool.style.transform = `translate(${r2(r.x + r.w / 2 - r.w * 0.42)}px, ${r2(r.y + r.by - em * 0.36)}px) scale(${r3(ps)})`;
      }
      if (el) {
        el.style.transform = transform;
        el.style.filter =
          1 - f > 0.004 ? `blur(${r2(p.blur * (1 - f))}px)` : "none";
        el.style.opacity = riserFirm[j]
          ? "0"
          : String(r3(smooth(0, 0.3, fill)));
        el.style.color = `color-mix(in oklab, ${liquid} ${Math.round((1 - f) * 100)}%, currentColor)`;
      }
      if (firm) {
        firm.style.opacity = riserFirm[j] ? "1" : "0";
        firm.style.transform = riserRest[j]
          ? `translate(${r2(r.x)}px, ${r2(r.y)}px)`
          : transform;
      }
    });
    plan.shared.forEach((s, i) => {
      const el = sharedEls[i];
      if (!el) return;
      const v = (sharedV[i] ?? 0) / Math.max(1, em);
      const skew = clamp(-v * 0.7, -6, 6);
      el.style.transform = `translate(${r2(sharedX[i] ?? s.x)}px, ${r2(sharedY[i] ?? s.y)}px) skewX(${r2(skew)}deg)`;
    });
  };

  const tick = (now: number) => {
    frame = 0;
    if (finished) return;
    const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60;
    last = now;
    acc += dt * clamp(t.pace, 0.25, 2);
    while (acc >= STEP) {
      step(STEP);
      acc -= STEP;
    }
    paint();
    if (settled()) {
      finished = true;
      onDone();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };

  return {
    start() {
      if (finished || frame) return;
      last = 0;
      paint();
      frame = window.requestAnimationFrame(tick);
    },
    stop() {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
    tune(next) {
      t = next;
      p = paramsOf(next);
    },
  };
}

const JUSTIFY: Record<MeltSwapAlign, React.CSSProperties["justifySelf"]> = {
  start: "start",
  center: "center",
  end: "end",
};

/**
 * A word that swaps by melting. Letters the next word does not share sag to
 * the baseline and soften into glossy beads, the beads slide along the
 * baseline to where the new letters stand and pool there, and the new letters
 * rise out of the pools and firm up with a slight wobble; letters the two
 * words share keep their substance and glide across. The box is reserved to
 * the widest word, so the line around it never moves, and at rest the word is
 * real, selectable text.
 *
 * The liquid is one SVG goo filter (an alpha threshold over blurred glyphs and
 * beads, lit with a diffuse shade and a specular highlight scaled by `gloss`),
 * applied only while a swap runs; the motion is a 120 Hz integration whose
 * springs come from the calibration set, thickened by `viscosity`. Under
 * reduced motion the words cross-fade in place.
 */
export function MeltSwap({
  words = DEFAULT_WORDS,
  value,
  defaultValue = 0,
  onValueChange,
  interval = 2400,
  viscosity = 0.5,
  gloss = 0.6,
  pace = 1,
  stagger = 36,
  delay = 600,
  trigger = "inView",
  once = false,
  paused = false,
  align = "center",
  liquidColor = "currentColor",
  announce = false,
  as: Tag = "span",
  onComplete,
  className,
}: MeltSwapProps) {
  const motionSafe = useMotionSafe();
  const rawId = React.useId();
  const filterId = `melt-swap-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const count = Math.max(1, words.length);
  const split = React.useMemo(() => words.map((w) => graphemes(w)), [words]);

  const [own, setOwn] = React.useState(() =>
    mod(Math.round(defaultValue), count),
  );
  const index = mod(Math.round(value ?? own), count);
  const [shownState, setShown] = React.useState(index);
  // A shorter `words` can leave the shown index past the end: show the value.
  const shown = shownState < count ? shownState : index;
  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [inView, setInView] = React.useState(false);
  const [pageVisible, setPageVisible] = React.useState(true);
  const [spoken, setSpoken] = React.useState(() => words[index] ?? "");

  const rootRef = React.useRef<HTMLElement | null>(null);
  const rowsRef = React.useRef<HTMLSpanElement | null>(null);
  const gooRef = React.useRef<HTMLSpanElement | null>(null);
  const crispRef = React.useRef<HTMLSpanElement | null>(null);
  const engines = React.useRef(new Map<number, Engine>());
  const seq = React.useRef(0);
  const shownAt = React.useRef(index);
  const [filterFont, setFilterFont] = React.useState(16);

  const tuning: Tuning = { viscosity, gloss, pace };
  const tuningRef = React.useRef(tuning);
  React.useEffect(() => {
    tuningRef.current = tuning;
    if (plan) engines.current.get(plan.id)?.tune(tuning);
  });

  const finishRef = React.useRef<(p: Plan) => void>(() => {});
  const beginRef = React.useRef<(to: number) => void>(() => {});
  const fadeTimer = React.useRef(0);

  React.useEffect(() => {
    // A swap settles: the crisp layer already shows the new word where its
    // row sits, so swapping the row back in changes nothing on screen.
    finishRef.current = (p: Plan) => {
      engines.current.delete(p.id);
      shownAt.current = p.to;
      setShown(p.to);
      setPlan(null);
      setSpoken(words[p.to] ?? "");
      onComplete?.(p.to);
    };

    beginRef.current = (to: number) => {
      const rows = rowsRef.current;
      const from = shownAt.current;
      if (to === from) return;
      if (!motionSafe || !rows) {
        shownAt.current = to;
        setShown(to);
        setSpoken(words[to] ?? "");
        window.clearTimeout(fadeTimer.current);
        fadeTimer.current = window.setTimeout(
          () => onComplete?.(to),
          durations.base * 1000,
        );
        return;
      }
      const rowA = rows.children[from] as HTMLElement | undefined;
      const rowB = rows.children[to] as HTMLElement | undefined;
      const root = rootRef.current;
      if (!rowA || !rowB || !root) {
        // The words changed under us: show the new word without a pour.
        shownAt.current = to;
        setShown(to);
        setSpoken(words[to] ?? "");
        return;
      }
      const font = parseFloat(getComputedStyle(root).fontSize) || 16;
      setFilterFont(Math.round(font));
      seq.current += 1;
      setPlan(
        makePlan(
          seq.current,
          from,
          to,
          measureRow(rowA),
          measureRow(rowB),
          font,
          clamp01(viscosity),
          Math.max(0, stagger) / 1000,
        ),
      );
    };
  });

  React.useEffect(() => () => window.clearTimeout(fadeTimer.current), []);

  // A new index — from the timer, a hover or the host — pours in once the
  // pour under way has settled.
  React.useEffect(() => {
    if (plan || index === shownAt.current) return;
    beginRef.current(index);
  }, [index, plan]);

  // The pour itself: built when its plan renders, resumed after a rehearsal
  // unmount rather than restarted, stopped (not discarded) on cleanup.
  React.useLayoutEffect(() => {
    if (!plan) return;
    const goo = gooRef.current;
    const crisp = crispRef.current;
    if (!goo || !crisp) return;
    let engine = engines.current.get(plan.id);
    if (!engine) {
      engine = createEngine(
        plan,
        goo,
        crisp,
        liquidColor,
        tuningRef.current,
        () => finishRef.current(plan),
      );
      engines.current.set(plan.id, engine);
    }
    engine.start();
    const running = engine;
    return () => running.stop();
  }, [plan, liquidColor]);

  // When to swap on our own.
  const auto = trigger === "mount" || trigger === "inView";
  const live =
    auto &&
    inView &&
    pageVisible &&
    !paused &&
    interval > 0 &&
    !plan &&
    !(once && index >= count - 1);
  const firstSwap = React.useRef(true);
  React.useEffect(() => {
    if (!live) return;
    const wait = firstSwap.current
      ? Math.max(0, delay)
      : Math.max(200, interval / clamp(pace, 0.25, 2));
    const timer = window.setTimeout(() => {
      firstSwap.current = false;
      const next = index + 1;
      if (once && next >= count) return;
      const to = mod(next, count);
      if (value === undefined) setOwn(to);
      onValueChange?.(to);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [live, index, delay, interval, pace, once, count, value, onValueChange]);

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setInView(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const swapOnce = () => {
    if (trigger !== "hover" || paused || plan) return;
    const next = index + 1;
    if (once && next >= count) return;
    const to = mod(next, count);
    if (value === undefined) setOwn(to);
    onValueChange?.(to);
  };

  const v = clamp01(viscosity);
  const shine = clamp01(gloss);
  const soft = r2(filterFont * lerp(0.04, 0.06, v));
  const depth = r2(filterFont * lerp(0.05, 0.08, v));
  const shade = r3(0.55 * shine);
  const justify = JUSTIFY[align] ?? "center";

  return (
    <Tag
      ref={bindRoot}
      onPointerEnter={swapOnce}
      onFocus={swapOnce}
      className={cn("relative inline-grid align-baseline", className)}
    >
      <span
        className="sr-only select-none"
        aria-live={announce ? "polite" : undefined}
      >
        {spoken}
      </span>
      <span ref={rowsRef} aria-hidden className="contents">
        {split.map((letters, i) => {
          const on = i === shown && !plan;
          return (
            <span
              key={i}
              aria-hidden
              className="col-start-1 row-start-1 whitespace-pre"
              style={{
                justifySelf: justify,
                visibility: on ? "visible" : "hidden",
                opacity: on ? 1 : 0,
                transition: motionSafe
                  ? undefined
                  : `opacity ${durations.base}s ease, visibility 0s linear ${on ? 0 : durations.base}s`,
              }}
            >
              {letters.map((g, j) => (
                <span key={j} className="inline-block">
                  {g}
                </span>
              ))}
              <span data-base="" className="inline-block h-0 w-0" />
            </span>
          );
        })}
      </span>
      {plan ? (
        <>
          <span
            ref={gooRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 select-none"
            style={{ filter: `url(#${filterId})` }}
          >
            {plan.melters.map((m, k) => (
              <span
                key={`m${k}`}
                data-melter=""
                className="absolute top-0 left-0 inline-block whitespace-pre"
                style={{
                  transformOrigin: `${r2(m.w / 2)}px ${r2(m.by)}px`,
                  transform: `translate(${r2(m.x)}px, ${r2(m.y)}px)`,
                }}
              >
                {m.ch}
              </span>
            ))}
            {plan.risers.map((r, j) => (
              <span
                key={`p${j}`}
                data-pool=""
                className="absolute top-0 left-0 rounded-full"
                style={{
                  width: r2(r.w * 0.84),
                  height: r2(plan.font * 0.4),
                  background: liquidColor,
                  transformOrigin: "50% 100%",
                  transform: "scale(0)",
                }}
              />
            ))}
            {plan.drops.map((d, i) => (
              <span
                key={`d${i}`}
                data-drop=""
                className="absolute top-0 left-0 rounded-full"
                style={{
                  width: r2(d.w),
                  height: r2(d.h),
                  background: liquidColor,
                  transformOrigin: "50% 100%",
                  transform: "scale(0)",
                }}
              />
            ))}
            {plan.risers.map((r, j) => (
              <span
                key={`r${j}`}
                data-riser=""
                className="absolute top-0 left-0 inline-block whitespace-pre"
                style={{
                  color: liquidColor,
                  opacity: 0,
                  transformOrigin: `${r2(r.w / 2)}px ${r2(r.by)}px`,
                  transform: `translate(${r2(r.x)}px, ${r2(r.y)}px) scale(1.25, 0.15)`,
                }}
              >
                {r.ch}
              </span>
            ))}
          </span>
          <span
            ref={crispRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 select-none"
          >
            {plan.shared.map((s, i) => (
              <span
                key={`s${i}`}
                data-shared=""
                className="absolute top-0 left-0 inline-block whitespace-pre"
                style={{
                  transformOrigin: `${r2(s.w / 2)}px ${r2(s.by)}px`,
                  transform: `translate(${r2(s.x)}px, ${r2(s.y)}px)`,
                }}
              >
                {s.ch}
              </span>
            ))}
            {plan.risers.map((r, j) => (
              <span
                key={`f${j}`}
                data-firm=""
                className="absolute top-0 left-0 inline-block whitespace-pre"
                style={{
                  opacity: 0,
                  transformOrigin: `${r2(r.w / 2)}px ${r2(r.by)}px`,
                  transform: `translate(${r2(r.x)}px, ${r2(r.y)}px)`,
                }}
              >
                {r.ch}
              </span>
            ))}
          </span>
        </>
      ) : null}
      <svg
        aria-hidden
        width="0"
        height="0"
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        <filter
          id={filterId}
          x="-20%"
          y="-60%"
          width="140%"
          height="220%"
          colorInterpolationFilters="sRGB"
        >
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"
            result="goo"
          />
          <feGaussianBlur in="goo" stdDeviation={soft} result="bump" />
          <feDiffuseLighting
            in="bump"
            surfaceScale={depth}
            diffuseConstant="1.25"
            lightingColor="white"
            result="diffuse"
          >
            <feDistantLight azimuth="225" elevation="52" />
          </feDiffuseLighting>
          <feComposite
            in="goo"
            in2="diffuse"
            operator="arithmetic"
            k1={shade}
            k2={r3(1 - shade)}
            k3="0"
            k4="0"
            result="shaded"
          />
          <feSpecularLighting
            in="bump"
            surfaceScale={depth}
            specularConstant="0.9"
            specularExponent="24"
            lightingColor="white"
            result="spec"
          >
            <feDistantLight azimuth="225" elevation="52" />
          </feSpecularLighting>
          <feComposite in="spec" in2="goo" operator="in" result="shine" />
          <feComposite
            in="shine"
            in2="shaded"
            operator="arithmetic"
            k1="0"
            k2={r3(shine * 0.85)}
            k3="1"
            k4="0"
          />
        </filter>
      </svg>
    </Tag>
  );
}
