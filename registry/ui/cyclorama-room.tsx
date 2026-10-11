"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type CycloramaItem = {
  /** An image URL; without one a scene is painted in code. */
  src?: string;
  /** What the picture shows, for assistive technology. */
  alt: string;
  /** The title on the heading strip and the close-up card. */
  caption?: string;
};

export type CycloramaRoomProps = {
  /** The pictures, stitched round the drum in order. @default six scenes painted in code */
  items?: CycloramaItem[];
  /** Controlled heading: the angle at the centre of the view, degrees. */
  value?: number;
  /** Initial heading when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires with the heading a drag, throw or key is heading for, degrees 0–360. */
  onValueChange?: (heading: number) => void;
  /** How round the drum looks, 0 (a flat strip) to 1 (the true inside of a drum). @default 0.8 */
  curvature?: number;
  /** Field of view across the frame, degrees, 50 to 110. @default 75 */
  fov?: number;
  /** Draw the brass viewing rail in front of you. @default true */
  rail?: boolean;
  /** Idle turn, degrees a second, while nobody is touching it; 0 holds still. @default 3 */
  drift?: number;
  /** How close walking up to a picture gets, 1.4 to 3. @default 2.2 */
  zoom?: number;
  /** How wide the blend across each seam is, as a share of a picture, 0 to 0.3. @default 0.12 */
  blend?: number;
  /** The heading strip along the base. @default true */
  showStrip?: boolean;
  /** Walked up to a picture (its index), or back to the centre (null). */
  onOpen?: (index: number | null) => void;
  /** The picture in front changed as the drum turned: its index. */
  onFrontChange?: (index: number) => void;
  /** The view's accessible name. @default "Panorama" */
  label?: string;
  /** Cap on the canvas pixel ratio, 1 to 2. @default 2 */
  dpr?: number;
  /** No turning or walking up. @default false */
  disabled?: boolean;
  className?: string;
};

export const defaultCycloramaItems: CycloramaItem[] = [
  {
    alt: "A harbour at dawn, boats on a still sea",
    caption: "Harbour at dawn",
  },
  { alt: "An orchard in bloom on rolling hills", caption: "Orchard in bloom" },
  { alt: "Salt flats mirroring far mountains", caption: "Salt flats" },
  { alt: "A ridge of dark pines under a high sky", caption: "Pine ridge" },
  { alt: "A river town with red roofs at dusk", caption: "River town" },
  { alt: "A bay at night under a full moon", caption: "Night bay" },
];

/** The drum's own room: fixed pigments, the same room in either theme. */
const ROOM = {
  canopy: "oklch(0.2 0.018 60)",
  canopyLip: "oklch(0.3 0.03 65)",
  floor: "oklch(0.23 0.02 55)",
  brass: "oklch(0.74 0.11 80)",
  brassDark: "oklch(0.5 0.08 70)",
  brassLight: "oklch(0.9 0.08 90)",
};

const PANO_H = 420;
const STRIP_PX = 2;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const wrap360 = (a: number) => ((a % 360) + 360) % 360;

function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b1, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (b + 0x632be5ab), 0xc2b2ae35) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Skies round the drum: dawn, morning, noon, afternoon, dusk, night. */
const SKIES: [string, string][] = [
  ["oklch(0.62 0.08 290)", "oklch(0.88 0.08 60)"],
  ["oklch(0.7 0.09 240)", "oklch(0.92 0.04 200)"],
  ["oklch(0.66 0.11 245)", "oklch(0.9 0.04 220)"],
  ["oklch(0.6 0.1 250)", "oklch(0.88 0.06 90)"],
  ["oklch(0.45 0.1 300)", "oklch(0.78 0.12 50)"],
  ["oklch(0.2 0.05 270)", "oklch(0.36 0.07 260)"],
];

/** One of the six scenes, painted into a panel of width w, height h. */
function paintScene(
  ctx: CanvasRenderingContext2D,
  k: number,
  w: number,
  h: number,
) {
  const sky = SKIES[k % SKIES.length] ?? SKIES[0]!;
  const horizon = h * 0.6;
  const g = ctx.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, sky[0]);
  g.addColorStop(1, sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, horizon + 1);
  const hill = (y: number, amp: number, colour: string, seed: number) => {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      const t = x / w;
      ctx.lineTo(
        x,
        y -
          amp *
            (Math.sin(t * 6.2 + seed) * 0.6 +
              Math.sin(t * 13.1 + seed * 2) * 0.25 +
              Math.sin(t * 27 + seed * 3) * 0.1),
      );
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
  };
  const disc = (x: number, y: number, r: number, colour: string) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
  };
  if (k % 6 === 0) {
    disc(w * 0.62, horizon - 18, 22, "oklch(0.93 0.09 80)");
    ctx.fillStyle = "oklch(0.52 0.07 250)";
    ctx.fillRect(0, horizon, w, h - horizon);
    ctx.fillStyle = "oklch(0.82 0.07 70)";
    ctx.fillRect(w * 0.5, horizon + 6, w * 0.22, 2);
    for (const [x, s] of [
      [0.2, 1],
      [0.36, 0.7],
      [0.78, 0.85],
    ] as const) {
      const bx = w * x;
      const by = horizon + 30 * s;
      ctx.fillStyle = "oklch(0.26 0.03 260)";
      ctx.beginPath();
      ctx.moveTo(bx - 26 * s, by);
      ctx.lineTo(bx + 26 * s, by);
      ctx.lineTo(bx + 18 * s, by + 8 * s);
      ctx.lineTo(bx - 18 * s, by + 8 * s);
      ctx.fill();
      ctx.fillRect(bx - 1, by - 40 * s, 2, 40 * s);
    }
    ctx.fillStyle = "oklch(0.32 0.03 60)";
    ctx.fillRect(w * 0.02, horizon + 40, w * 0.12, 6);
  } else if (k % 6 === 1) {
    hill(horizon + 10, 18, "oklch(0.6 0.09 140)", 1);
    hill(horizon + 60, 22, "oklch(0.5 0.1 140)", 2);
    for (let i = 0; i < 18; i += 1) {
      const x = (i + 0.5) * (w / 18);
      const y = horizon + 70 + (i % 3) * 18;
      ctx.fillStyle = "oklch(0.36 0.05 60)";
      ctx.fillRect(x - 1.5, y - 4, 3, 16);
      disc(
        x,
        y - 10,
        11,
        i % 2 ? "oklch(0.86 0.07 350)" : "oklch(0.9 0.05 10)",
      );
    }
    hill(h - 30, 8, "oklch(0.44 0.09 135)", 3);
  } else if (k % 6 === 2) {
    hill(horizon, 40, "oklch(0.62 0.04 260)", 4);
    ctx.fillStyle = "oklch(0.93 0.02 220)";
    ctx.fillRect(0, horizon + 4, w, h - horizon);
    ctx.globalAlpha = 0.35;
    hill(horizon + 4 + 40, -40, "oklch(0.75 0.04 250)", 4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "oklch(0.86 0.03 220)";
    for (let i = 0; i < 6; i += 1) {
      ctx.fillRect(0, horizon + 60 + i * 22, w, 1.5);
    }
  } else if (k % 6 === 3) {
    hill(horizon - 10, 30, "oklch(0.55 0.05 230)", 5);
    hill(horizon + 30, 26, "oklch(0.38 0.06 160)", 6);
    for (let i = 0; i < 26; i += 1) {
      const x = hash(i, 9) * w;
      const y = horizon + 40 + hash(9, i) * 70;
      const s = 18 + hash(i, 4) * 26;
      ctx.fillStyle = "oklch(0.28 0.05 160)";
      ctx.beginPath();
      ctx.moveTo(x, y - s * 1.6);
      ctx.lineTo(x + s * 0.5, y);
      ctx.lineTo(x - s * 0.5, y);
      ctx.fill();
    }
    hill(h - 20, 10, "oklch(0.3 0.05 150)", 7);
  } else if (k % 6 === 4) {
    hill(horizon + 4, 12, "oklch(0.5 0.07 130)", 8);
    ctx.fillStyle = "oklch(0.5 0.08 230)";
    ctx.fillRect(0, horizon + 60, w, 34);
    for (let i = 0; i < 9; i += 1) {
      const x = w * (0.06 + i * 0.105);
      const bh = 28 + hash(i, 2) * 30;
      ctx.fillStyle = i % 2 ? "oklch(0.86 0.03 80)" : "oklch(0.8 0.04 70)";
      ctx.fillRect(x, horizon + 58 - bh, 34, bh);
      ctx.fillStyle = "oklch(0.52 0.15 32)";
      ctx.beginPath();
      ctx.moveTo(x - 4, horizon + 58 - bh);
      ctx.lineTo(x + 17, horizon + 40 - bh);
      ctx.lineTo(x + 38, horizon + 58 - bh);
      ctx.fill();
      ctx.fillStyle = "oklch(0.9 0.12 85)";
      ctx.fillRect(x + 12, horizon + 40 - bh * 0.4, 6, 6);
    }
    hill(h - 24, 6, "oklch(0.42 0.06 130)", 9);
  } else {
    for (let i = 0; i < 70; i += 1) {
      disc(
        hash(i, 1) * w,
        hash(1, i) * horizon * 0.9,
        0.6 + hash(i, 5) * 1.2,
        "oklch(0.95 0.02 90)",
      );
    }
    disc(w * 0.4, horizon * 0.42, 20, "oklch(0.95 0.04 95)");
    ctx.fillStyle = "oklch(0.24 0.05 255)";
    ctx.fillRect(0, horizon, w, h - horizon);
    ctx.fillStyle = "oklch(0.8 0.05 95)";
    for (let i = 0; i < 8; i += 1) {
      ctx.fillRect(
        w * 0.4 - 14 + hash(i, 8) * 8,
        horizon + 8 + i * 9,
        28 - i * 2.4,
        1.6,
      );
    }
    hill(horizon + 8, 14, "oklch(0.18 0.03 260)", 10);
  }
  // A painted surface: a fine seeded stipple of light and shade.
  for (let i = 0; i < 260; i += 1) {
    ctx.fillStyle = i % 2 ? "rgb(255 255 255 / 0.05)" : "rgb(0 0 0 / 0.05)";
    ctx.fillRect(hash(i, k + 31) * w, hash(k + 31, i) * h, 2, 1);
  }
}

type Live = {
  count: number;
  curvature: number;
  fov: number;
  rail: boolean;
  drift: number;
  zoom: number;
  blend: number;
  dpr: number;
  motionSafe: boolean;
  controlled: boolean;
  srcs: string[];
};

type Engine = {
  heading: () => number;
  target: () => number;
  setTarget: (deg: number, velocity?: number) => void;
  grab: () => void;
  dragTo: (deg: number) => void;
  open: (index: number | null) => void;
  touch: () => void;
  compose: () => void;
  kick: () => void;
  focal: () => number;
  angleAt: (clientX: number) => number;
  dispose: () => void;
};

/**
 * Your pictures, composited into one continuous painted band and wrapped
 * round the inside of a drum, with you standing at its centre behind a
 * viewing rail. Each picture is cover-fitted into a panel and the neighbours
 * are cross-faded across a blend zone, so the seams dissolve; the default
 * scenes share a horizon and a sky that turns from dawn to night round the
 * drum. A Canvas 2D view draws the band in two-pixel strips, each strip's
 * angle and height taken from the camera — `atan(x / f)` across and
 * `1 / cos` up — so the band bows toward you at the edges as the inside of a
 * drum does; `curvature` blends that from a flat strip, `fov` sets how much
 * of the room you see.
 *
 * Drag to look round: the heading follows the finger 1:1 and a release coasts
 * on with the throw on the drift spring to where it would come to rest. A
 * heading strip along the base marks every picture by name and brightens the
 * one in front. Click a picture, or press Enter, and you walk up to it: the
 * heading glides to centre it and the view narrows on the drift spring while
 * the rail drops away and its card rises. Escape, a click or Step back walks
 * you back. The drum turns slowly on its own until someone touches it. Left
 * and Right turn 15°, Page Up, Page Down, Home and End go picture to picture.
 * Under reduced motion nothing drifts or coasts, keys jump, and walking up
 * is a cross-fade.
 */
export function CycloramaRoom({
  items = defaultCycloramaItems,
  value,
  defaultValue = 0,
  onValueChange,
  curvature = 0.8,
  fov = 75,
  rail = true,
  drift = 3,
  zoom = 2.2,
  blend = 0.12,
  showStrip = true,
  onOpen,
  onFrontChange,
  label = "Panorama",
  dpr = 2,
  disabled = false,
  className,
}: CycloramaRoomProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const count = Math.max(1, items.length);
  const span = 360 / count;
  const [first] = React.useState(() => wrap360(value ?? defaultValue));
  const [open, setOpen] = React.useState<number | null>(null);
  const [front, setFront] = React.useState(
    () => Math.floor(wrap360(value ?? defaultValue) / span) % count,
  );
  const [painted, setPainted] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const stripRef = React.useRef<HTMLDivElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const dragFrom = React.useRef(0);

  const latest = React.useRef<Live>({
    count,
    curvature,
    fov,
    rail,
    drift,
    zoom,
    blend,
    dpr,
    motionSafe,
    controlled: value !== undefined,
    srcs: items.map((item) => item.src ?? ""),
  });
  const frontReport = React.useRef(onFrontChange);
  React.useEffect(() => {
    frontReport.current = onFrontChange;
  });
  const handlers = React.useRef({
    onFront: (i: number) => {
      setFront(i);
      frontReport.current?.(i);
    },
    onPainted: () => setPainted(true),
  });
  React.useLayoutEffect(() => {
    latest.current = {
      count,
      curvature,
      fov,
      rail,
      drift,
      zoom,
      blend,
      dpr,
      motionSafe,
      controlled: value !== undefined,
      srcs: items.map((item) => item.src ?? ""),
    };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const strip = stripRef.current;
    if (!root || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pano = document.createElement("canvas");
    const pctx = pano.getContext("2d");
    const panel = document.createElement("canvas");
    const qctx = panel.getContext("2d");
    if (!pctx || !qctx) return;
    const L = () => latest.current;

    let w = 1;
    let h = 1;
    let ratio = 1;
    let panoW = 1;
    let raf = 0;
    let last = 0;
    let visible = false;
    let disposed = false;
    let lastFront = -1;
    let idleAt = performance.now();
    let wake = 0;
    // Built once per size, never per frame.
    let room: CanvasGradient | null = null;
    let lip: CanvasGradient | null = null;
    let side: CanvasGradient | null = null;
    const post = document.createElement("canvas");
    post.width = 16;
    post.height = 1;
    const postCtx = post.getContext("2d");
    if (postCtx) {
      const pg = postCtx.createLinearGradient(0, 0, 16, 0);
      pg.addColorStop(0, ROOM.brassDark);
      pg.addColorStop(0.45, ROOM.brassLight);
      pg.addColorStop(1, ROOM.brassDark);
      postCtx.fillStyle = pg;
      postCtx.fillRect(0, 0, 16, 1);
    }
    let dragging = false;
    const images = new Map<string, HTMLImageElement>();
    // Heading (deg) on a drift spring toward a target; zoom likewise.
    const cam = {
      h: first,
      v: 0,
      target: first,
      z: 1,
      zv: 0,
      zTarget: 1,
      fade: 0,
    };

    const compose = () => {
      const live = L();
      const n = live.count;
      const pw = Math.round(PANO_H * 1.5);
      panoW = pw * n;
      pano.width = panoW;
      pano.height = PANO_H;
      const b = Math.round(pw * clamp(live.blend, 0, 0.3));
      panel.width = pw + 2 * b;
      panel.height = PANO_H;
      const drawPanel = (i: number, offset: number) => {
        const k = ((i % n) + n) % n;
        qctx.globalCompositeOperation = "source-over";
        qctx.clearRect(0, 0, panel.width, PANO_H);
        const src = live.srcs[k];
        const img = src ? images.get(src) : undefined;
        if (img && img.complete && img.naturalWidth > 0) {
          const s = Math.max(
            panel.width / img.naturalWidth,
            PANO_H / img.naturalHeight,
          );
          const dw = img.naturalWidth * s;
          const dh = img.naturalHeight * s;
          qctx.drawImage(
            img,
            (panel.width - dw) / 2,
            (PANO_H - dh) / 2,
            dw,
            dh,
          );
        } else {
          paintScene(qctx, k, panel.width, PANO_H);
        }
        if (b > 0) {
          // Fade in across the seam: drawn over the opaque end of the panel
          // before it, this is an exact cross-fade. The mask spans the whole
          // panel, because destination-in clears whatever it does not cover.
          const fadeIn = qctx.createLinearGradient(0, 0, panel.width, 0);
          fadeIn.addColorStop(0, "rgb(0 0 0 / 0)");
          fadeIn.addColorStop((2 * b) / panel.width, "rgb(0 0 0 / 1)");
          fadeIn.addColorStop(1, "rgb(0 0 0 / 1)");
          qctx.globalCompositeOperation = "destination-in";
          qctx.fillStyle = fadeIn;
          qctx.fillRect(0, 0, panel.width, PANO_H);
          qctx.globalCompositeOperation = "source-over";
        }
        pctx.drawImage(panel, k * pw - b + offset, 0);
      };
      pctx.clearRect(0, 0, panoW, PANO_H);
      drawPanel(n - 1, -panoW);
      for (let i = 0; i < n; i += 1) drawPanel(i, 0);
      drawPanel(0, panoW);
    };

    const load = () => {
      for (const src of L().srcs) {
        if (!src || images.has(src)) continue;
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          if (disposed) return;
          compose();
          paint();
        };
        img.src = src;
        images.set(src, img);
      }
    };

    const resize = () => {
      const box = root.getBoundingClientRect();
      w = Math.max(1, box.width);
      h = Math.max(1, box.height);
      ratio = clamp(Math.min(window.devicePixelRatio || 1, L().dpr), 1, 2);
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      room = ctx.createLinearGradient(0, 0, 0, h);
      room.addColorStop(0, ROOM.canopy);
      room.addColorStop(0.5, ROOM.canopy);
      room.addColorStop(0.5, ROOM.floor);
      room.addColorStop(1, ROOM.floor);
      lip = ctx.createLinearGradient(0, 0, 0, h * 0.3);
      lip.addColorStop(0, "rgb(0 0 0 / 0.55)");
      lip.addColorStop(1, "rgb(0 0 0 / 0)");
      side = ctx.createLinearGradient(0, 0, w, 0);
      side.addColorStop(0, "rgb(0 0 0 / 0.38)");
      side.addColorStop(0.18, "rgb(0 0 0 / 0)");
      side.addColorStop(0.82, "rgb(0 0 0 / 0)");
      side.addColorStop(1, "rgb(0 0 0 / 0.38)");
      paint();
    };

    /** A touch stops the idle turn; it resumes three seconds later. */
    const touched = () => {
      idleAt = performance.now();
      window.clearTimeout(wake);
      wake = window.setTimeout(() => kick(), 3100);
    };

    const focal = () => {
      const half = (clamp(L().fov, 50, 110) * Math.PI) / 360;
      return w / 2 / Math.tan(half);
    };

    /** The panorama angle (deg) under a screen x, at the current zoom. */
    const angleOf = (x: number) => {
      const live = L();
      const f = focal() * cam.z;
      const c = clamp(live.curvature, 0, 1);
      const u = (x - w / 2) / f;
      const d = u + (Math.atan(u) - u) * c;
      return cam.h + (d * 180) / Math.PI;
    };

    const paint = () => {
      const live = L();
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      // The room: a dark canopy above, the floor below.
      ctx.fillStyle = room ?? ROOM.canopy;
      ctx.fillRect(0, 0, w, h);
      const f = focal() * cam.z;
      const c = clamp(live.curvature, 0, 1);
      const yc = h * 0.44;
      const half = h * 0.3 * cam.z;
      const k = panoW / 360;
      // The band, strip by strip.
      for (let x = 0; x < w; x += STRIP_PX) {
        const u0 = (x - w / 2) / f;
        const u1 = (x + STRIP_PX - w / 2) / f;
        const um = (u0 + u1) / 2;
        const d0 = u0 + (Math.atan(u0) - u0) * c;
        const d1 = u1 + (Math.atan(u1) - u1) * c;
        const dm = um + (Math.atan(um) - um) * c;
        const lift = 1 + (1 / Math.cos(dm) - 1) * c;
        let sx = (((cam.h + (d0 * 180) / Math.PI) % 360) + 360) % 360;
        sx *= k;
        let sw = ((d1 - d0) * 180 * k) / Math.PI;
        const bh = half * 2 * lift;
        const top = yc - half * lift;
        if (sx + sw <= panoW) {
          ctx.drawImage(
            pano,
            sx,
            0,
            Math.max(0.01, sw),
            PANO_H,
            x,
            top,
            STRIP_PX + 1,
            bh,
          );
        } else {
          const a = panoW - sx;
          const share = a / sw;
          ctx.drawImage(
            pano,
            sx,
            0,
            Math.max(0.01, a),
            PANO_H,
            x,
            top,
            STRIP_PX * share + 0.5,
            bh,
          );
          sw -= a;
          sx = 0;
          ctx.drawImage(
            pano,
            sx,
            0,
            Math.max(0.01, sw),
            PANO_H,
            x + STRIP_PX * share,
            top,
            STRIP_PX * (1 - share) + 1,
            bh,
          );
        }
      }
      // Canopy shade over the top of the band, and a side vignette.
      if (lip) {
        ctx.fillStyle = lip;
        ctx.fillRect(0, 0, w, h * 0.3);
      }
      if (side) {
        ctx.fillStyle = side;
        ctx.fillRect(0, 0, w, h);
      }
      // The viewing rail: a ring of brass round you, bowing with the drum,
      // its posts fixed round the ring so they pass as you turn.
      const railAlpha = live.rail ? clamp(1 - cam.fade * 1.6, 0, 1) : 0;
      if (railAlpha > 0.01) {
        ctx.globalAlpha = railAlpha;
        const yr = h * 0.8 + cam.fade * h * 0.25;
        const yFloor = h * 1.1 + cam.fade * h * 0.25;
        const rf = focal();
        const yOf = (x: number, y0: number) => {
          const u = (x - w / 2) / rf;
          const d = u + (Math.atan(u) - u) * c;
          return yc + (y0 - yc) * (1 + (1 / Math.cos(d) - 1) * c);
        };
        for (let stake = 0; stake < 24; stake += 1) {
          const ang = stake * 15;
          let rel = wrap360(ang - cam.h + 180) - 180;
          rel = (rel * Math.PI) / 180;
          if (Math.abs(rel) > 1.2) continue;
          const u = Math.tan(rel);
          const x = w / 2 + rf * (c > 0 ? u + (rel - u) * (1 - c) : rel);
          if (x < -10 || x > w + 10) continue;
          const y0 = yOf(x, yr);
          const y1 = yOf(x, yFloor);
          const pw2 = Math.max(2, 5 / Math.cos(rel));
          ctx.drawImage(post, x - pw2 / 2, y0, pw2, y1 - y0);
        }
        ctx.beginPath();
        for (let x = -4; x <= w + 4; x += 6) {
          const y = yOf(x, yr);
          if (x === -4) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineCap = "round";
        ctx.strokeStyle = ROOM.brassDark;
        ctx.lineWidth = 9;
        ctx.stroke();
        ctx.strokeStyle = ROOM.brass;
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.translate(0, -1.5);
        ctx.strokeStyle = ROOM.brassLight;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.globalAlpha = 1;
      }
      // The heading strip follows the same heading, as a translate.
      if (strip) {
        const hd = wrap360(cam.h + 180) - 180;
        strip.style.transform = `translateX(${r2(-((hd + 360) / 720) * 100)}%)`;
      }
      const nowFront =
        Math.floor(wrap360(cam.h) / (360 / live.count)) % live.count;
      if (nowFront !== lastFront) {
        lastFront = nowFront;
        handlers.current.onFront(nowFront);
      }
    };

    const frame = (ms: number) => {
      raf = 0;
      if (disposed || !visible || document.hidden) return;
      const live = L();
      const dt = Math.min(0.05, Math.max(0, (ms - last) / 1000));
      last = ms;
      let busy = false;
      if (!dragging) {
        if (!live.motionSafe) {
          cam.h = cam.target;
          cam.v = 0;
        } else {
          const { stiffness: k, damping: c, mass: m } = springs.drift;
          const n = Math.max(1, Math.ceil(dt / (1 / 240)));
          for (let s = 0; s < n; s += 1) {
            const a = (-k * (cam.h - cam.target) - c * cam.v) / m;
            cam.v += a * (dt / n);
            cam.h += cam.v * (dt / n);
          }
          if (Math.abs(cam.h - cam.target) < 0.01 && Math.abs(cam.v) < 0.01) {
            cam.h = cam.target;
            cam.v = 0;
          } else busy = true;
        }
        // The idle turn: only when nobody has touched it for a while.
        const idle = performance.now() - idleAt > 3000;
        if (
          idle &&
          live.motionSafe &&
          !live.controlled &&
          live.drift !== 0 &&
          cam.zTarget === 1 &&
          Math.abs(cam.h - cam.target) < 0.5
        ) {
          cam.target += live.drift * dt;
          cam.h = cam.target;
          busy = true;
        }
      }
      // Walking up and back: drift spring on the zoom.
      if (!live.motionSafe) {
        cam.fade = clamp(
          cam.fade + (cam.zTarget > 1 ? 1 : -1) * (dt / 0.24),
          0,
          1,
        );
        cam.z = 1;
        if (cam.fade > 0 && cam.fade < 1) busy = true;
      } else {
        const { stiffness: k, damping: c, mass: m } = springs.drift;
        const n = Math.max(1, Math.ceil(dt / (1 / 240)));
        for (let s = 0; s < n; s += 1) {
          const a = (-k * (cam.z - cam.zTarget) - c * cam.zv) / m;
          cam.zv += a * (dt / n);
          cam.z += cam.zv * (dt / n);
        }
        if (Math.abs(cam.z - cam.zTarget) < 0.001 && Math.abs(cam.zv) < 0.001) {
          cam.z = cam.zTarget;
          cam.zv = 0;
        } else busy = true;
        const zMax = Math.max(1.01, clamp(live.zoom, 1.4, 3));
        cam.fade = clamp((cam.z - 1) / (zMax - 1), 0, 1);
      }
      paint();
      if (busy) raf = window.requestAnimationFrame(frame);
    };

    const kick = () => {
      if (disposed || raf || !visible || document.hidden) return;
      last = performance.now();
      raf = window.requestAnimationFrame(frame);
    };

    compose();
    load();
    resize();
    handlers.current.onPainted();

    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible = Boolean(entry?.isIntersecting);
      if (visible) kick();
    });
    io.observe(root);
    let pending = 0;
    const ro = new ResizeObserver(() => {
      if (pending) return;
      pending = window.requestAnimationFrame(() => {
        pending = 0;
        resize();
      });
    });
    ro.observe(root);
    const onVis = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVis);

    engine.current = {
      heading: () => wrap360(cam.h),
      target: () => cam.target,
      setTarget: (deg, velocity = 0) => {
        dragging = false;
        cam.target = deg;
        if (velocity) cam.v = velocity;
        touched();
        kick();
      },
      grab: () => {
        dragging = true;
        cam.v = 0;
        cam.target = cam.h;
        touched();
      },
      dragTo: (deg) => {
        // 1:1 under the finger: no spring while held.
        cam.h = deg;
        cam.target = deg;
        touched();
        paint();
      },
      open: (index) => {
        const live = L();
        touched();
        dragging = false;
        if (index === null) {
          cam.zTarget = 1;
        } else {
          const centre = (index + 0.5) * (360 / live.count);
          cam.target = cam.h + (wrap360(centre - cam.h + 180) - 180);
          cam.zTarget = clamp(live.zoom, 1.4, 3);
        }
        kick();
      },
      touch: () => {
        touched();
        dragging = false;
        kick();
      },
      compose: () => {
        compose();
        load();
        paint();
      },
      kick: () => {
        paint();
        kick();
      },
      focal,
      angleAt: (clientX) => {
        const box = root.getBoundingClientRect();
        return angleOf(clientX - box.left);
      },
      dispose: () => {
        disposed = true;
        if (raf) window.cancelAnimationFrame(raf);
        if (pending) window.cancelAnimationFrame(pending);
        window.clearTimeout(wake);
        io.disconnect();
        ro.disconnect();
        document.removeEventListener("visibilitychange", onVis);
        for (const img of images.values()) img.onload = null;
      },
    };
    return () => {
      engine.current?.dispose();
      engine.current = null;
    };
  }, [first]);

  const srcKey = items.map((item) => item.src ?? "").join("|");
  React.useEffect(() => {
    engine.current?.compose();
  }, [srcKey, blend, count]);

  React.useEffect(() => {
    engine.current?.kick();
  }, [curvature, fov, rail, drift, zoom, motionSafe, dpr]);

  // A host that moves `value` turns the drum there.
  React.useEffect(() => {
    if (value === undefined) return;
    const e = engine.current;
    if (!e) return;
    const now = e.target();
    const to = now + (wrap360(value - now + 180) - 180);
    if (Math.abs(to - now) > 0.05) e.setTarget(to);
  }, [value]);

  const report = (deg: number) => onValueChange?.(r2(wrap360(deg)));

  const walk = (index: number | null) => {
    if (disabled) return;
    setOpen(index);
    engine.current?.open(index);
    onOpen?.(index);
    const item = index !== null ? items[index] : undefined;
    setSaid((s) => ({
      n: s.n + 1,
      text: item
        ? `Up close: ${item.caption ?? item.alt}`
        : "Back at the centre of the room",
    }));
  };

  const turnTo = (to: number, announce: boolean) => {
    const e = engine.current;
    if (!e) return;
    e.setTarget(to);
    report(to);
    if (announce) {
      const i = Math.floor(wrap360(to) / span) % count;
      const item = items[i];
      setSaid((s) => ({
        n: s.n + 1,
        text: `Facing ${item?.caption ?? item?.alt ?? ""}, ${i + 1} of ${count}, ${Math.round(wrap360(to))} degrees`,
      }));
    }
  };

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: () => {
      const e = engine.current;
      if (!e || open !== null) return;
      e.grab();
      dragFrom.current = e.target();
    },
    onMove: ({ offset }) => {
      const e = engine.current;
      if (!e || open !== null) return;
      // 1:1 at the centre of view: pixels to degrees through the focal length.
      const deg = dragFrom.current - (offset.x / e.focal()) * (180 / Math.PI);
      e.dragTo(deg);
    },
    onEnd: ({ velocity }) => {
      const e = engine.current;
      if (!e || open !== null) return;
      // The throw coasts on to where it would come to rest, and the drift
      // spring takes it there carrying the release velocity.
      const v = -(velocity.x / e.focal()) * (180 / Math.PI);
      const base = e.target();
      const to = motionSafe ? project(base, v, 0.996) : base;
      e.setTarget(to, motionSafe ? v : 0);
      report(to);
    },
    onCancel: () => engine.current?.touch(),
    onTap: (event) => {
      const e = engine.current;
      if (!e || disabled) return;
      if (open !== null) {
        walk(null);
        return;
      }
      const deg = e.angleAt(event.clientX);
      walk(Math.floor(wrap360(deg) / span) % count);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    // Keys on the Step back button are the button's, except Escape.
    if (event.target !== event.currentTarget && event.key !== "Escape") return;
    const e = engine.current;
    if (!e) return;
    const now = e.target();
    const centreOf = (i: number) => (i + 0.5) * span;
    const at = Math.floor(wrap360(now) / span) % count;
    const toPicture = (i: number) => {
      const c = centreOf(((i % count) + count) % count);
      return now + (wrap360(c - now + 180) - 180);
    };
    if (event.key === "Escape") {
      if (open !== null) {
        event.preventDefault();
        walk(null);
      }
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      walk(open !== null ? null : at);
      return;
    }
    let to: number | null = null;
    if (event.key === "ArrowLeft") to = now - 15;
    else if (event.key === "ArrowRight") to = now + 15;
    else if (event.key === "PageUp") to = toPicture(at - 1);
    else if (event.key === "PageDown") to = toPicture(at + 1);
    else if (event.key === "Home") to = toPicture(0);
    else if (event.key === "End") to = toPicture(count - 1);
    if (to === null) return;
    event.preventDefault();
    if (open !== null) walk(null);
    turnTo(to, true);
  };

  const shownItem = open !== null ? items[open] : undefined;
  const hd = wrap360(first + 180) - 180;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-roledescription="panorama"
      aria-label={label}
      aria-describedby={`${uid}-hint`}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
      {...drag}
      className={cn(
        "group/cyclorama-room relative isolate overflow-hidden outline-none select-none",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled
          ? "cursor-default"
          : open !== null
            ? "cursor-zoom-out"
            : "cursor-grab touch-pan-y",
        className,
      )}
    >
      {/* The server's frame: a painted dawn-to-night band behind the canvas. */}
      <div
        aria-hidden
        className={cn("absolute inset-0", painted && "hidden")}
        style={{
          background: `linear-gradient(180deg, ${ROOM.canopy} 0 14%, transparent 14% 74%, ${ROOM.floor} 74%), linear-gradient(90deg, ${SKIES.map((s, i) => `${s[1]} ${r2((i / SKIES.length) * 100)}%`).join(", ")})`,
        }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="absolute inset-0 size-full"
      />
      {showStrip ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-6 overflow-hidden border-t border-white/10 bg-black/45 backdrop-blur-[2px]"
        >
          <div
            ref={stripRef}
            className="absolute inset-y-0 left-1/2"
            style={{
              width: `${r2((720 / clamp(fov, 50, 110)) * 100)}%`,
              transform: `translateX(${r2(-((hd + 360) / 720) * 100)}%)`,
              backgroundImage:
                "repeating-linear-gradient(90deg, rgb(255 255 255 / 0.3) 0 1px, transparent 1px calc(100% / 72))",
              backgroundSize: "100% 5px",
              backgroundRepeat: "no-repeat",
            }}
          >
            {[-1, 0].flatMap((loop) =>
              items.map((item, i) => (
                <span
                  key={`${loop}-${i}`}
                  className={cn(
                    "absolute top-1.5 -translate-x-1/2 font-mono text-[9px] leading-none tracking-[0.08em] whitespace-nowrap uppercase transition-colors duration-300",
                    i === front ? "text-white" : "text-white/45",
                  )}
                  style={{
                    left: `${r2((((i + 0.5) * span + loop * 360 + 360) / 720) * 100)}%`,
                  }}
                >
                  {item.caption ?? item.alt}
                </span>
              )),
            )}
          </div>
          <span className="absolute top-0 left-1/2 h-1.5 w-px -translate-x-1/2 bg-white/80" />
        </div>
      ) : null}
      <div
        className={cn(
          "absolute bottom-8 left-3 flex max-w-[calc(100%-1.5rem)] items-center gap-3 rounded-3 border border-white/15 bg-black/55 py-1.5 pr-1.5 pl-3 text-white backdrop-blur-sm",
          motionSafe
            ? "transition-[opacity,translate] duration-300"
            : "transition-opacity duration-200",
          shownItem
            ? "opacity-100"
            : "pointer-events-none translate-y-2 opacity-0",
          !motionSafe && "translate-y-0",
        )}
        aria-hidden={!shownItem}
      >
        <p
          className="min-w-0 truncate text-xs font-medium"
          title={shownItem?.caption ?? shownItem?.alt}
        >
          {shownItem?.caption ?? shownItem?.alt ?? ""}
        </p>
        <button
          type="button"
          tabIndex={shownItem ? 0 : -1}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => walk(null)}
          className="inline-flex h-7 shrink-0 items-center rounded-2 bg-white/15 px-2.5 text-xs font-medium transition-colors outline-none hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Step back
        </button>
      </div>
      <ol className="sr-only">
        {items.map((item, i) => (
          <li key={i}>{item.alt}</li>
        ))}
      </ol>
      <span id={`${uid}-hint`} className="sr-only">
        Drag or use Left and Right to look round; Page Up and Page Down go
        picture to picture. Enter walks up to the picture in front; Escape steps
        back.
      </span>
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
