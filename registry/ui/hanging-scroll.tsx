"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HangingScrollItem = {
  /** The picture. Any image URL; drawn into a canvas, so a remote one needs CORS only if you read it back. @default a drawn ink-wash view */
  src?: string;
  /** What the picture shows, for assistive technology. */
  alt: string;
  /** A short title written under the picture. */
  caption?: string;
};

export type HangingScrollTone = "rice" | "silk" | "kraft" | "indigo";

export type HangingScrollProps = {
  /** The pictures, top to bottom. @default defaultScrollItems (five ink-wash views) */
  items?: HangingScrollItem[];
  /** How far the paper bows out before it meets the roll, 0 (straight into a tight roll) to 1 (a wide lifted curl). @default 0.5 */
  curl?: number;
  /** Diameter of the top rod in px, 10 to 28: a slim rod bends the pictures sharply, a thick roller slowly. @default 16 */
  rodSize?: number;
  /** The paper the pictures are mounted on. @default "rice" */
  paperTone?: HangingScrollTone;
  /** Colour of the mounting bands and borders, any CSS colour. @default the tone's own */
  mount?: string;
  /** How much the weighted bottom bar swings as the roll speeds up and slows, 0 to 1. @default 0.5 */
  sway?: number;
  /** Scroll distance from one picture to the next, px. @default 320 */
  range?: number;
  /** Height of the pinned stage, px. Give it the height of the scroll container it sits in. @default 520 */
  height?: number;
  /** Hang the rod from a cord and a nail. @default true */
  cord?: boolean;
  /** Fires with the picture at the reading line, from the scroll or key that moved it. */
  onIndexChange?: (index: number) => void;
  /** Fires as the paper rolls, 0 (all hanging) to 1 (rolled to the last picture). */
  onProgressChange?: (progress: number) => void;
  /** Names the scroll for assistive technology. @default "Hanging scroll" */
  label?: string;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  className?: string;
};

/* ------------------------------- pictures -------------------------------- */

const svg = (body: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500">${body}</svg>`,
  )}`;

const SILK = "rgb(241,236,222)";
const SEAL = (x: number, y: number) =>
  `<rect x="${x}" y="${y}" width="20" height="20" rx="2" fill="rgb(176,54,40)"/><path d="M${x + 5} ${y + 6}h10M${x + 5} ${y + 10}h10M${x + 5} ${y + 14}h10M${x + 10} ${y + 4}v12" stroke="rgb(236,214,196)" stroke-width="1.4" fill="none"/>`;

const MOUNTAINS = svg(`
<defs><linearGradient id="m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SILK}" stop-opacity="0"/><stop offset="0.5" stop-color="${SILK}" stop-opacity="0.9"/><stop offset="1" stop-color="${SILK}" stop-opacity="0"/></linearGradient></defs>
<rect width="400" height="500" fill="${SILK}"/>
<circle cx="292" cy="92" r="32" fill="rgb(226,214,192)"/>
<path d="M0 250 C 50 214 84 150 128 118 C 156 98 176 160 206 176 C 238 140 268 86 310 104 C 350 122 372 186 400 204 L400 500 L0 500Z" fill="rgb(160,158,150)" opacity="0.6"/>
<rect y="214" width="400" height="90" fill="url(#m)"/>
<path d="M0 334 C 44 296 76 262 118 268 C 158 274 188 232 230 248 C 270 262 300 226 340 236 C 368 244 386 268 400 280 L400 500 L0 500Z" fill="rgb(104,103,98)" opacity="0.85"/>
<rect y="318" width="400" height="80" fill="url(#m)"/>
<path d="M0 430 C 40 400 70 380 110 392 C 150 404 170 372 214 380 C 260 388 292 410 330 400 C 362 392 384 402 400 410 L400 500 L0 500Z" fill="rgb(44,44,42)"/>
${[40, 62, 92, 128, 170, 236, 262, 300, 344].map((x, i) => `<path d="M${x} ${404 - (i % 3) * 6} l-6 16 h12z" fill="rgb(36,36,34)"/>`).join("")}
${SEAL(354, 456)}`);

const HERON = svg(`
<rect width="400" height="500" fill="${SILK}"/>
${[30, 58, 84, 300, 328, 352, 376].map((x, i) => `<path d="M${x} 500 Q ${x + (i % 2 ? 14 : -10)} ${300 - i * 12} ${x + (i % 2 ? 26 : -4)} ${150 + (i % 3) * 30}" stroke="rgb(${120 + i * 8},${120 + i * 8},${112 + i * 8})" stroke-width="${3 - (i % 3) * 0.6}" fill="none"/>`).join("")}
<path d="M70 300 q 30 -20 44 -60 M330 330 q -26 -24 -30 -70" stroke="rgb(150,150,142)" stroke-width="2" fill="none"/>
<path d="M188 300 C 168 296 150 270 162 244 C 176 218 214 222 226 246 C 236 266 230 292 212 304Z" fill="rgb(206,206,200)" stroke="rgb(70,70,66)" stroke-width="2"/>
<path d="M214 248 C 222 210 202 188 210 160 C 216 140 236 134 244 146" stroke="rgb(70,70,66)" stroke-width="6" fill="none" stroke-linecap="round"/>
<path d="M244 146 l 34 6 l -34 2z" fill="rgb(60,60,56)"/>
<circle cx="241" cy="146" r="2" fill="rgb(30,30,28)"/>
<path d="M226 140 q 10 -8 18 -2" stroke="rgb(40,40,38)" stroke-width="3" fill="none"/>
<path d="M196 302 L 200 400 M 200 400 l -8 8 M200 400 l 10 6" stroke="rgb(60,60,56)" stroke-width="2.4" fill="none"/>
<path d="M200 330 q 16 4 22 -16" stroke="rgb(60,60,56)" stroke-width="2.2" fill="none"/>
<path d="M120 412 h 160 M150 424 h 110 M176 436 h 60" stroke="rgb(150,150,142)" stroke-width="1.6"/>
${SEAL(354, 456)}`);

const BAMBOO = svg(`
<rect width="400" height="500" fill="${SILK}"/>
${[
  [70, 6, 150],
  [140, 9, 90],
  [212, 7, 60],
  [286, 10, 30],
  [340, 5, 160],
]
  .map(
    ([x, w, tone]) =>
      `<path d="M${x} 500 Q ${(x ?? 0) + 8} 250 ${(x ?? 0) - 4} 0" stroke="rgb(${tone},${(tone ?? 0) + 4},${tone})" stroke-width="${w}" fill="none"/>${[
        90, 190, 290, 390,
      ]
        .map(
          (y) =>
            `<path d="M${(x ?? 0) - 6 + (y ?? 0) / 100} ${y} h ${(w ?? 0) + 6}" stroke="rgb(30,30,28)" stroke-width="2"/>`,
        )
        .join("")}`,
  )
  .join("")}
${[
  [150, 120, -30],
  [170, 132, 10],
  [228, 70, -50],
  [250, 84, -10],
  [300, 210, 30],
  [318, 226, 60],
  [96, 260, -40],
  [116, 276, 0],
]
  .map(
    ([x, y, a]) =>
      `<path d="M${x} ${y} q 30 -10 70 6 q -36 6 -70 -6z" fill="rgb(54,58,52)" transform="rotate(${a} ${x} ${y})"/>`,
  )
  .join("")}
${SEAL(28, 456)}`);

const BOAT = svg(`
<rect width="400" height="500" fill="${SILK}"/>
<path d="M0 214 C 40 196 70 180 112 190 C 150 198 170 176 214 182 C 256 188 280 200 320 192 C 356 184 380 196 400 202 L400 230 L0 230Z" fill="rgb(176,174,166)"/>
<path d="M0 230 L400 230" stroke="rgb(150,148,140)" stroke-width="1"/>
<path d="M0 232 C 60 240 120 236 200 238 C 280 240 340 236 400 240" stroke="rgb(206,204,196)" stroke-width="6" fill="none" opacity="0.6"/>
<path d="M150 352 q 50 20 104 0 q -8 10 -52 12 q -44 -2 -52 -12z" fill="rgb(40,40,38)"/>
<path d="M206 352 v -40" stroke="rgb(40,40,38)" stroke-width="2"/>
<path d="M190 350 q 2 -18 8 -24 q 6 6 6 24z" fill="rgb(50,50,48)"/>
<circle cx="198" cy="322" r="4.5" fill="rgb(50,50,48)"/>
<path d="M226 352 l 40 34" stroke="rgb(60,60,56)" stroke-width="1.6"/>
<path d="M140 374 h 120 M120 392 h 60 M220 392 h 70 M160 410 h 90" stroke="rgb(170,168,160)" stroke-width="1.4"/>
${SEAL(354, 456)}`);

const PLUM = svg(`
<rect width="400" height="500" fill="${SILK}"/>
<path d="M-10 470 C 60 430 90 380 140 360 C 190 340 196 290 240 250 C 280 214 300 160 360 120 C 380 106 400 100 420 96" stroke="rgb(46,40,36)" stroke-width="14" fill="none" stroke-linecap="round"/>
<path d="M140 360 C 120 320 126 280 104 250 M240 250 C 260 290 300 300 330 296 M300 170 C 280 140 284 110 270 80" stroke="rgb(52,46,40)" stroke-width="6" fill="none" stroke-linecap="round"/>
${[
  [104, 250],
  [330, 296],
  [270, 80],
  [196, 300],
  [262, 226],
  [340, 132],
  [150, 352],
  [92, 412],
  [296, 186],
]
  .map(
    ([x, y], i) =>
      `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((a) => `<circle cx="${Math.round(Math.cos((a * Math.PI) / 180) * 7)}" cy="${Math.round(Math.sin((a * Math.PI) / 180) * 7)}" r="${i % 3 ? 6 : 7}" fill="rgb(244,${206 - (i % 3) * 8},${210 - (i % 3) * 6})" stroke="rgb(196,150,150)" stroke-width="0.8"/>`).join("")}<circle r="3" fill="rgb(150,60,60)"/></g>`,
  )
  .join("")}
${[
  [124, 300],
  [220, 268],
  [318, 150],
]
  .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="rgb(176,90,96)"/>`)
  .join("")}
${SEAL(28, 456)}`);

/** Five ink-wash views drawn in code, the default gallery. */
export const defaultScrollItems: HangingScrollItem[] = [
  {
    src: MOUNTAINS,
    alt: "Mountain ridges fading into mist under a pale moon",
    caption: "Mountains in mist",
  },
  {
    src: HERON,
    alt: "A grey heron standing on one leg among tall reeds",
    caption: "Heron in the reeds",
  },
  {
    src: BAMBOO,
    alt: "A grove of bamboo, its culms and leaves in grey washes",
    caption: "Bamboo grove",
  },
  {
    src: BOAT,
    alt: "A small boat with one figure on a still lake below far hills",
    caption: "Boat on a still lake",
  },
  {
    src: PLUM,
    alt: "A crooked plum branch with pale blossoms and buds",
    caption: "Plum branch in early spring",
  },
];

/* --------------------------------- layout --------------------------------- */

type Tone = {
  paper: string;
  fibre: string;
  mount: string;
  ink: string;
  faint: string;
};

/** Paper is pigment: the same in a light or a dark page. */
const TONES: Record<HangingScrollTone, Tone> = {
  rice: {
    paper: "oklch(0.95 0.014 85)",
    fibre: "oklch(0.78 0.03 75)",
    mount: "oklch(0.44 0.07 35)",
    ink: "oklch(0.3 0.02 60)",
    faint: "oklch(0.56 0.02 60)",
  },
  silk: {
    paper: "oklch(0.925 0.024 100)",
    fibre: "oklch(0.99 0.01 100)",
    mount: "oklch(0.46 0.06 165)",
    ink: "oklch(0.3 0.03 140)",
    faint: "oklch(0.55 0.03 140)",
  },
  kraft: {
    paper: "oklch(0.79 0.055 72)",
    fibre: "oklch(0.66 0.06 62)",
    mount: "oklch(0.33 0.04 48)",
    ink: "oklch(0.27 0.03 55)",
    faint: "oklch(0.44 0.04 60)",
  },
  indigo: {
    paper: "oklch(0.34 0.07 266)",
    fibre: "oklch(0.44 0.07 266)",
    mount: "oklch(0.22 0.05 266)",
    ink: "oklch(0.93 0.02 90)",
    faint: "oklch(0.74 0.03 260)",
  },
};

const WOOD = {
  light: "oklch(0.52 0.07 55)",
  mid: "oklch(0.38 0.06 48)",
  dark: "oklch(0.24 0.04 40)",
  grain: "oklch(0.2 0.03 40)",
};

type Layout = {
  paperW: number;
  paperX: number;
  rodY: number;
  r0: number;
  pw: number;
  ph: number;
  margin: number;
  top: number;
  pitch: number;
  captionH: number;
  total: number;
  roll: number;
};

const TOP = 34;
const CAPTION = 40;
const TAIL = 20;
const THICK = 0.42;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

function layoutOf(
  w: number,
  h: number,
  n: number,
  rodSize: number,
  cord: boolean,
): Layout {
  const paperW = Math.round(clamp(w - 56, 150, 320));
  const margin = Math.round(clamp(paperW * 0.1, 14, 28));
  const r0 = clamp(rodSize, 10, 28) / 2;
  const rodY = cord ? 46 : Math.round(r0 + 12);
  const room = h - rodY - TOP - CAPTION - 64;
  const pw0 = paperW - 2 * margin;
  const ph = Math.round(clamp(Math.min(pw0 * 1.25, room), 120, 420));
  const pw = Math.round(Math.min(pw0, ph / 1.25));
  const pitch = ph + 12 + CAPTION + 30;
  const count = Math.max(1, n);
  return {
    paperW,
    paperX: Math.round((w - paperW) / 2),
    rodY,
    r0,
    pw,
    ph,
    margin: Math.round((paperW - pw) / 2),
    top: TOP,
    pitch,
    captionH: CAPTION,
    total: TOP + count * pitch + TAIL,
    roll: (count - 1) * pitch,
  };
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const plate = (i: number) => `Plate ${ROMAN[i] ?? i + 1}`;

/** The nearest ancestor that scrolls vertically, or null for the page. */
function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY)) {
      return el;
    }
  }
  return null;
}

/** A small seeded generator for the paper's fibres. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wraps a caption to at most two lines in the sheet's width. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > 2) {
    let last = lines[1] ?? "";
    while (last && ctx.measureText(`${last}…`).width > width) {
      last = last.slice(0, -1);
    }
    return [lines[0] ?? "", `${last}…`];
  }
  return lines;
}

/* ---------------------------------- still --------------------------------- */

function Still({
  layout,
  items,
  tone,
  mount,
  index,
  cord,
  height,
  stageW,
}: {
  layout: Layout;
  items: HangingScrollItem[];
  tone: Tone;
  mount: string;
  index: number;
  cord: boolean;
  height: number;
  stageW: number;
}) {
  const { paperW, paperX, rodY, r0, pw, ph, margin, top, pitch } = layout;
  const over = 12;
  const slot = (i: number, at: 0 | 1) => (
    <div
      key={`${at}-${i}`}
      className={cn(
        "absolute flex flex-col items-center transition-opacity duration-400",
        (at === 0 ? i === index : i === index + 1)
          ? "opacity-100"
          : "opacity-0",
      )}
      style={{ left: margin, top: top + at * pitch, width: pw }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={items[i]?.src ?? defaultScrollItems[i % 5]?.src}
        alt=""
        draggable={false}
        className="block object-cover"
        style={{
          width: pw,
          height: ph,
          boxShadow: `0 0 0 1px color-mix(in oklab, ${tone.ink} 22%, transparent)`,
        }}
      />
      <span
        className="mt-3 font-mono text-[9px] tracking-[0.16em] uppercase"
        style={{ color: tone.faint }}
      >
        {plate(i)}
      </span>
      <span
        className="mt-1 line-clamp-2 text-center text-xs leading-[15px]"
        style={{ color: tone.ink }}
      >
        {items[i]?.caption}
      </span>
    </div>
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {cord ? (
        <svg
          className="absolute inset-0 size-full"
          viewBox={`0 0 ${stageW} ${height}`}
          preserveAspectRatio="none"
        >
          <path
            d={`M${paperX + 10} ${rodY - r0} L${stageW / 2} 12 L${paperX + paperW - 10} ${rodY - r0}`}
            fill="none"
            stroke="oklch(0.48 0.09 38)"
            strokeWidth={1.5}
          />
          <circle cx={stageW / 2} cy={11} r={3} fill="oklch(0.4 0.02 60)" />
        </svg>
      ) : null}
      <div
        className="absolute overflow-hidden"
        style={{
          left: paperX,
          top: rodY,
          width: paperW,
          height: Math.max(0, height - rodY),
          backgroundColor: tone.paper,
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-5"
          style={{ backgroundColor: mount }}
        />
        <div
          className="absolute inset-y-0 w-px"
          style={{ left: margin / 2, backgroundColor: mount, opacity: 0.55 }}
        />
        <div
          className="absolute inset-y-0 w-px"
          style={{ right: margin / 2, backgroundColor: mount, opacity: 0.55 }}
        />
        {items.map((_, i) => slot(i, 0))}
        {items.map((_, i) => slot(i, 1))}
        <div
          className="absolute inset-x-0 top-0 h-3"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, color-mix(in oklab, black 22%, transparent), transparent)",
          }}
        />
      </div>
      <div
        className="absolute rounded-full"
        style={{
          left: paperX - over,
          top: rodY - r0,
          width: paperW + 2 * over,
          height: 2 * r0,
          backgroundImage: `linear-gradient(to bottom, ${WOOD.light}, ${WOOD.mid} 45%, ${WOOD.dark})`,
        }}
      />
    </div>
  );
}

/* -------------------------------- component ------------------------------- */

type Sim = {
  p: number;
  v: number;
  goal: number;
  theta: number;
  omega: number;
  frame: number;
  last: number;
  visible: boolean;
};

/**
 * A vertical gallery mounted on a long paper scroll hung from a turned rod.
 * As its scroll container scrolls through the section, the stage pins and
 * the paper rolls up onto the rod: the paper below the roll lifts off the
 * wall in a gentle bow (`curl`), each picture bends over the front of the
 * roll, foreshortening and darkening as it turns away, and disappears over
 * the top; the roll fattens with every turn and the knobs on the rod's ends
 * turn with it, exactly — rolled length over radius. Further down the weighted
 * bottom bar arrives and rises with the last picture. Scrolling back unrolls
 * it. The shown progress follows the scroll on a critically damped spring
 * with the glide constants, and the hanging part is a pendulum the roll's
 * changes of speed kick into a slight sway, swinging quicker as it shortens.
 *
 * Drawn in Canvas 2D: the paper is painted once to a sheet and each frame
 * draws the hanging part in one piece and the bow and the roll as one-pixel
 * strips. The stage is focusable: Down, Page Down and Space roll to the next
 * picture, Up and Page Up back, Home and End to either end. Under reduced
 * motion the scroll hangs still and the pictures cross-fade as the reading
 * line passes them.
 */
export function HangingScroll({
  items = defaultScrollItems,
  curl = 0.5,
  rodSize = 16,
  paperTone = "rice",
  mount,
  sway = 0.5,
  range = 320,
  height = 520,
  cord = true,
  onIndexChange,
  onProgressChange,
  label = "Hanging scroll",
  dpr = 2,
  className,
}: HangingScrollProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const list = items.length ? items : defaultScrollItems;
  const n = list.length;
  const span = Math.max(1, clamp(range, 80, 2000) * Math.max(1, n - 1));
  const tone = TONES[paperTone] ?? TONES.rice;
  const mountColour = mount ?? tone.mount;

  const [w, setW] = React.useState(360);
  const [index, setIndex] = React.useState(0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const layout = layoutOf(w, height, n, rodSize, cord);

  const sectionRef = React.useRef<HTMLElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const monoRef = React.useRef<HTMLSpanElement | null>(null);
  const sheetRef = React.useRef<HTMLCanvasElement | null>(null);
  const images = React.useRef<(HTMLImageElement | null)[]>([]);
  const engine = React.useRef<{
    kick: () => void;
    repaint: () => void;
  } | null>(null);
  const sim = React.useRef<Sim>({
    p: 0,
    v: 0,
    goal: 0,
    theta: 0,
    omega: 0,
    frame: 0,
    last: 0,
    visible: false,
  });
  const reported = React.useRef({ index: 0, progress: -1 });
  /** The bow's rows, reused every frame. */
  const bowRows = React.useRef<
    { s: number; ds: number; z: number; dz: number }[]
  >([]);

  const config = {
    layout,
    list,
    tone,
    mountColour,
    curl: clamp(curl, 0, 1),
    sway: clamp(sway, 0, 1),
    span,
    height,
    cord,
    dpr: clamp(dpr, 0.5, 2),
    motionSafe,
    onIndexChange,
    onProgressChange,
  };
  const latest = React.useRef(config);
  React.useEffect(() => {
    latest.current = config;
    engine.current?.kick();
  });

  /* The sheet: the whole paper, painted once per layout, tone and images. */
  const paintSheet = React.useCallback(() => {
    const c = latest.current;
    const L = c.layout;
    const ratio = Math.min(window.devicePixelRatio || 1, c.dpr);
    const sheet = sheetRef.current ?? document.createElement("canvas");
    sheetRef.current = sheet;
    const sw = Math.max(1, Math.round(L.paperW * ratio));
    const sh = Math.max(1, Math.round(L.total * ratio));
    if (sheet.width !== sw) sheet.width = sw;
    if (sheet.height !== sh) sheet.height = sh;
    const ctx = sheet.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = c.tone.paper;
    ctx.fillRect(0, 0, L.paperW, L.total);
    // Fibres and a faint mottle, seeded so the paper is the same each time.
    const rand = seeded(1789 + L.total);
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = c.tone.fibre;
    ctx.lineWidth = 0.6;
    const fibres = Math.round((L.paperW * L.total) / 420);
    for (let i = 0; i < fibres; i += 1) {
      const x = rand() * L.paperW;
      const y = rand() * L.total;
      const a = rand() * Math.PI;
      const len = 3 + rand() * 9;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(a) * len * 0.5 + (rand() - 0.5) * 3,
        y + Math.sin(a) * len * 0.5,
        x + Math.cos(a) * len,
        y + Math.sin(a) * len,
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Mounting: a band at the head and the tail, and two thin borders.
    ctx.fillStyle = c.mountColour;
    ctx.fillRect(0, 0, L.paperW, 20);
    ctx.fillRect(0, L.total - 14, L.paperW, 14);
    ctx.globalAlpha = 0.55;
    ctx.fillRect(Math.round(L.margin / 2), 20, 1, L.total - 34);
    ctx.fillRect(Math.round(L.paperW - L.margin / 2) - 1, 20, 1, L.total - 34);
    ctx.globalAlpha = 1;
    const root = stageRef.current;
    const sans = root ? getComputedStyle(root).fontFamily : "sans-serif";
    const mono = monoRef.current
      ? getComputedStyle(monoRef.current).fontFamily
      : "monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    c.list.forEach((item, i) => {
      const y = L.top + i * L.pitch;
      const img = images.current[i];
      ctx.fillStyle = c.tone.ink;
      ctx.globalAlpha = 0.22;
      ctx.fillRect(L.margin - 1, y - 1, L.pw + 2, L.ph + 2);
      ctx.globalAlpha = 1;
      if (img && img.complete && img.naturalWidth > 0) {
        const s = Math.max(L.pw / img.naturalWidth, L.ph / img.naturalHeight);
        const iw = L.pw / s;
        const ih = L.ph / s;
        ctx.drawImage(
          img,
          (img.naturalWidth - iw) / 2,
          (img.naturalHeight - ih) / 2,
          iw,
          ih,
          L.margin,
          y,
          L.pw,
          L.ph,
        );
      } else {
        ctx.fillStyle = "oklch(0.93 0.015 90)";
        ctx.fillRect(L.margin, y, L.pw, L.ph);
      }
      const cx = L.paperW / 2;
      ctx.fillStyle = c.tone.faint;
      ctx.font = `9px ${mono}`;
      ctx.letterSpacing = "1.4px";
      ctx.fillText(plate(i).toUpperCase(), cx, y + L.ph + 22);
      ctx.letterSpacing = "0px";
      if (item.caption) {
        ctx.fillStyle = c.tone.ink;
        ctx.font = `12px ${sans}`;
        wrap(ctx, item.caption, L.pw).forEach((line, k) => {
          ctx.fillText(line, cx, y + L.ph + 40 + k * 15);
        });
      }
    });
  }, []);

  React.useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!section || !canvas || !stage) return;
    const scroller = scrollParent(section);
    const target: HTMLElement | Window = scroller ?? window;
    const s = sim.current;
    let painted = false;

    const goal = () => {
      const c = latest.current;
      const top0 = scroller ? scroller.getBoundingClientRect().top : 0;
      const rel = section.getBoundingClientRect().top - top0;
      return clamp(-rel / c.span, 0, 1);
    };

    /** The reading line moved: report it from the scroll that moved it. */
    const report = (g: number) => {
      const c = latest.current;
      const count = c.list.length;
      const i = Math.round(g * Math.max(0, count - 1));
      const rounded = Math.round(g * 1000) / 1000;
      if (rounded !== reported.current.progress) {
        reported.current.progress = rounded;
        c.onProgressChange?.(rounded);
      }
      if (i !== reported.current.index) {
        reported.current.index = i;
        setIndex(i);
        c.onIndexChange?.(i);
        const item = c.list[i];
        setSaid((p) => ({
          n: p.n + 1,
          text: `Picture ${i + 1} of ${count}${item?.caption ? `: ${item.caption}` : ""}.`,
        }));
      }
    };

    const draw = () => {
      const c = latest.current;
      const L = c.layout;
      const sheet = sheetRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx || !sheet || canvas.width < 2) return;
      const ratio = canvas.width / Math.max(1, canvas.clientWidth);
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const k = sheet.width / Math.max(1, L.paperW);
      const rolled = s.p * L.roll;
      const R = Math.sqrt(L.r0 * L.r0 + (rolled * THICK) / Math.PI);
      const turn = ((R - L.r0) / THICK) * Math.PI * 2;
      const cx = L.paperX + L.paperW / 2;
      const rodY = L.rodY;
      const bowLen = Math.round(36 + c.curl * 104);
      const A = c.curl * 20;
      // The flat part turns about the rod, so its top edge moves by
      // −bowLen·sin θ; the bow eases into that offset.
      const sin = Math.sin(s.theta);

      // The cord and its nail.
      if (c.cord) {
        ctx.strokeStyle = "oklch(0.48 0.09 38)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(L.paperX + 10, rodY - L.r0);
        ctx.lineTo(W / 2, 12);
        ctx.lineTo(L.paperX + L.paperW - 10, rodY - L.r0);
        ctx.stroke();
        ctx.fillStyle = "oklch(0.4 0.02 60)";
        ctx.beginPath();
        ctx.arc(W / 2, 11, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // The hanging part's paper coordinate where the bow ends, and the bow.
      let sCur = rolled;
      const bow: { s: number; ds: number; z: number; dz: number }[] =
        bowRows.current;
      bow.length = 0;
      for (let i = 0; i < bowLen; i += 1) {
        const t = (i + 0.5) / bowLen;
        const z = A * Math.sin(Math.PI * t) ** 2;
        const dz = (A * Math.PI * Math.sin(2 * Math.PI * t)) / bowLen;
        const ds = Math.sqrt(1 + dz * dz);
        bow.push({ s: sCur, ds, z, dz });
        sCur += ds;
      }
      const sFlat = sCur;
      const flatTop = rodY + bowLen;
      const left = Math.max(0, L.total - sFlat);
      const flatLen = Math.min(left, H - flatTop + 30);

      // Shadow on the wall: the paper's outline, offset by the bow's lift.
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.22)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = c.tone.paper;
      ctx.beginPath();
      ctx.moveTo(L.paperX, rodY);
      for (let i = 0; i < bowLen; i += 6) {
        const row = bow[i];
        const off = -i * sin * (i / bowLen);
        ctx.lineTo(L.paperX + off - (row?.z ?? 0) * 0.2, rodY + i);
      }
      ctx.translate(cx, rodY);
      ctx.rotate(s.theta);
      ctx.lineTo(-L.paperW / 2, bowLen + flatLen);
      ctx.lineTo(L.paperW / 2, bowLen + flatLen);
      ctx.lineTo(L.paperW / 2, bowLen);
      ctx.rotate(-s.theta);
      ctx.translate(-cx, -rodY);
      for (let i = bowLen - 1; i >= 0; i -= 6) {
        const row = bow[i];
        const off = -i * sin * (i / bowLen);
        ctx.lineTo(L.paperX + L.paperW + off + (row?.z ?? 0) * 0.5, rodY + i);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // The flat hanging part, swaying about the rod, and the bottom bar.
      ctx.save();
      ctx.translate(cx, rodY);
      ctx.rotate(s.theta);
      if (flatLen > 0.5) {
        ctx.drawImage(
          sheet,
          0,
          sFlat * k,
          sheet.width,
          Math.max(1, flatLen * k),
          -L.paperW / 2,
          bowLen,
          L.paperW,
          flatLen,
        );
      }
      if (left < H - flatTop + 20) {
        const y = bowLen + left;
        const rb = Math.max(5, L.r0 * 0.75);
        const bar = ctx.createLinearGradient(0, y - rb, 0, y + rb);
        bar.addColorStop(0, WOOD.light);
        bar.addColorStop(0.45, WOOD.mid);
        bar.addColorStop(1, WOOD.dark);
        ctx.fillStyle = bar;
        ctx.beginPath();
        ctx.roundRect(-L.paperW / 2 - 9, y - rb + 2, L.paperW + 18, 2 * rb, rb);
        ctx.fill();
        ctx.fillStyle = WOOD.dark;
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.roundRect(
            sx < 0 ? -L.paperW / 2 - 15 : L.paperW / 2 + 7,
            y - rb - 1,
            8,
            2 * rb + 6,
            3,
          );
          ctx.fill();
        }
      }
      ctx.restore();

      // The bow: strips of the sheet, wider as they come toward you and
      // shaded by their slope to a light from above.
      for (let i = 0; i < bowLen; i += 1) {
        const row = bow[i];
        if (!row) continue;
        const persp = 900 / (900 - row.z);
        const width = L.paperW * persp;
        const off = -i * sin * (i / bowLen);
        const x = cx - width / 2 + off;
        if (row.s + row.ds > L.total) break;
        ctx.drawImage(
          sheet,
          0,
          row.s * k,
          sheet.width,
          Math.max(1, row.ds * k),
          x,
          rodY + i,
          width,
          1.02,
        );
        const lit = (0.55 * row.dz + 0.83) / Math.sqrt(1 + row.dz * row.dz);
        const b = lit / 0.83;
        if (b > 1) {
          ctx.fillStyle = `rgba(255, 252, 244, ${r2(Math.min(0.22, (b - 1) * 0.7))})`;
        } else {
          ctx.fillStyle = `rgba(0, 0, 0, ${r2(Math.min(0.26, (1 - b) * 0.75))})`;
        }
        ctx.fillRect(x, rodY + i, width, 1.02);
      }
      // The roll throws a soft shadow on the paper just below it.
      const under = ctx.createLinearGradient(0, rodY, 0, rodY + 14);
      under.addColorStop(0, "rgba(0, 0, 0, 0.28)");
      under.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = under;
      ctx.fillRect(L.paperX, rodY, L.paperW, 14);

      // The rod beyond the paper, then the roll's front, strip by strip.
      const rod = ctx.createLinearGradient(0, rodY - L.r0, 0, rodY + L.r0);
      rod.addColorStop(0, WOOD.light);
      rod.addColorStop(0.45, WOOD.mid);
      rod.addColorStop(1, WOOD.dark);
      ctx.fillStyle = rod;
      // Only beyond the paper: in the middle the hanging paper is in front.
      ctx.fillRect(L.paperX - 12, rodY - L.r0, 12, 2 * L.r0);
      ctx.fillRect(L.paperX + L.paperW, rodY - L.r0, 12, 2 * L.r0);
      const rows = Math.ceil(R);
      for (let j = 0; j < rows; j += 1) {
        const phi = Math.asin(Math.min(1, (j + 0.5) / R));
        const ds = Math.min(6, 1 / Math.max(Math.cos(phi), 0.17));
        const sR = rolled - R * phi;
        const y = rodY - j - 1;
        if (sR - ds >= 0) {
          ctx.drawImage(
            sheet,
            0,
            (sR - ds) * k,
            sheet.width,
            Math.max(1, ds * k),
            L.paperX,
            y,
            L.paperW,
            1.02,
          );
        } else {
          ctx.fillStyle = WOOD.mid;
          ctx.fillRect(L.paperX, y, L.paperW, 1.02);
        }
        const light = 0.62 + 0.38 * Math.cos(phi - 0.9);
        ctx.fillStyle =
          light >= 0.9
            ? `rgba(255, 252, 244, ${r2((light - 0.9) * 1.2)})`
            : `rgba(0, 0, 0, ${r2((0.9 - light) * 1.1)})`;
        ctx.fillRect(L.paperX, y, L.paperW, 1.02);
      }
      // Knobs at the rod's ends, their grain turning with the roll.
      const kr = L.r0 + 3;
      for (const side of [-1, 1]) {
        const kx = side < 0 ? L.paperX - 22 : L.paperX + L.paperW + 12;
        const knob = ctx.createLinearGradient(0, rodY - kr, 0, rodY + kr);
        knob.addColorStop(0, WOOD.light);
        knob.addColorStop(0.5, WOOD.mid);
        knob.addColorStop(1, WOOD.dark);
        ctx.fillStyle = knob;
        ctx.beginPath();
        ctx.roundRect(kx, rodY - kr, 10, 2 * kr, 3);
        ctx.fill();
        ctx.fillStyle = WOOD.grain;
        for (let g = 0; g < 3; g += 1) {
          const a = turn + (g * Math.PI * 2) / 3;
          if (Math.cos(a) <= 0.05) continue;
          const gy = rodY - kr * Math.sin(a);
          ctx.globalAlpha = Math.min(1, Math.cos(a) * 1.6);
          ctx.fillRect(kx + 1, gy - 0.6, 8, 1.2);
        }
        ctx.globalAlpha = 1;
      }
      if (!painted) {
        painted = true;
        stage.setAttribute("data-live", "");
      }
    };

    const tick = (now: number) => {
      s.frame = 0;
      const c = latest.current;
      if (!s.visible || document.hidden) {
        s.last = 0;
        return;
      }
      const dt = s.last ? Math.min(0.04, (now - s.last) / 1000) : 1 / 60;
      s.last = now;
      s.goal = goal();
      report(s.goal);
      const L = c.layout;
      const gk = springs.glide.stiffness / springs.glide.mass;
      const gc = springs.glide.damping / springs.glide.mass;
      const hang = Math.max(120, Math.min(L.total - s.p * L.roll, c.height));
      const w0 = Math.sqrt(4000 / hang);
      const zeta = 0.12;
      const kick = 0.000008 * c.sway;
      const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / steps;
      for (let i = 0; i < steps; i += 1) {
        const acc = -gk * (s.p - s.goal) - gc * s.v;
        s.v += acc * h;
        s.p += s.v * h;
        // A change in the roll's speed pushes the hanging part sideways.
        const push = kick * acc * L.roll;
        s.omega += (-w0 * w0 * s.theta - 2 * zeta * w0 * s.omega + push) * h;
        s.theta += s.omega * h;
      }
      s.theta = clamp(s.theta, -0.06, 0.06);
      if (
        Math.abs(s.p - s.goal) < 1e-4 &&
        Math.abs(s.v) < 1e-4 &&
        Math.abs(s.theta) < 2e-4 &&
        Math.abs(s.omega) < 1e-3
      ) {
        s.p = s.goal;
        s.v = 0;
        s.theta = 0;
        s.omega = 0;
        draw();
        s.last = 0;
        return;
      }
      draw();
      s.frame = window.requestAnimationFrame(tick);
    };

    const kick = () => {
      const c = latest.current;
      if (!c.motionSafe) {
        report(goal());
        return;
      }
      if (s.frame || !s.visible || document.hidden) return;
      s.frame = window.requestAnimationFrame(tick);
    };

    const size = () => {
      const c = latest.current;
      const ratio = Math.min(window.devicePixelRatio || 1, c.dpr);
      const cw = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const ch = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== cw) canvas.width = cw;
      if (canvas.height !== ch) canvas.height = ch;
    };

    engine.current = {
      kick,
      repaint: () => {
        if (!latest.current.motionSafe) {
          // Reduced motion shows the still; the canvas is not live.
          painted = false;
          stage.removeAttribute("data-live");
          return;
        }
        size();
        paintSheet();
        draw();
      },
    };

    s.goal = goal();
    s.p = s.goal;
    report(s.goal);
    const onScroll = () => kick();
    target.addEventListener("scroll", onScroll, { passive: true });
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      s.visible = Boolean(entry?.isIntersecting);
      if (s.visible) kick();
    });
    watcher.observe(stage);
    const onVisibility = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const sizer = new ResizeObserver(() => {
      const next = Math.round(stage.clientWidth);
      if (next > 0) setW((prev) => (prev === next ? prev : next));
      engine.current?.repaint();
    });
    sizer.observe(stage);
    return () => {
      target.removeEventListener("scroll", onScroll);
      watcher.disconnect();
      sizer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (s.frame) window.cancelAnimationFrame(s.frame);
      s.frame = 0;
      s.last = 0;
      s.visible = false;
      engine.current = null;
      stage.removeAttribute("data-live");
    };
  }, [paintSheet]);

  // A new layout, tone or set of pictures repaints the sheet.
  const sheetKey = `${layout.paperW}|${layout.total}|${layout.ph}|${paperTone}|${mountColour}|${n}|${dpr}|${motionSafe}`;
  React.useEffect(() => {
    engine.current?.repaint();
  }, [sheetKey]);

  // Pictures load as images; each arrival repaints the sheet.
  React.useEffect(() => {
    let alive = true;
    const loaded: (HTMLImageElement | null)[] = list.map(() => null);
    images.current = loaded;
    const els = list.map((item, i) => {
      const el = new Image();
      el.decoding = "async";
      el.onload = () => {
        if (!alive) return;
        loaded[i] = el;
        engine.current?.repaint();
      };
      el.src = item.src ?? defaultScrollItems[i % 5]?.src ?? "";
      return el;
    });
    if (typeof document !== "undefined" && document.fonts) {
      void document.fonts.ready.then(() => {
        if (alive) engine.current?.repaint();
      });
    }
    return () => {
      alive = false;
      for (const el of els) el.onload = null;
    };
  }, [list]);

  /** Scrolls the container so the reading line is at picture `i`. */
  const goTo = (i: number) => {
    const section = sectionRef.current;
    if (!section) return;
    const scroller = scrollParent(section);
    const top0 = scroller ? scroller.getBoundingClientRect().top : 0;
    const now = scroller ? scroller.scrollTop : window.scrollY;
    const start = section.getBoundingClientRect().top - top0 + now;
    const p = n > 1 ? clamp(i, 0, n - 1) / (n - 1) : 0;
    const top = Math.max(0, Math.round(start + p * span));
    const behavior: ScrollBehavior = motionSafe ? "smooth" : "auto";
    if (scroller) scroller.scrollTo({ top, behavior });
    else window.scrollTo({ top, behavior });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      PageDown: index + 1,
      " ": index + 1,
      ArrowUp: index - 1,
      PageUp: index - 1,
      Home: 0,
      End: n - 1,
    };
    const to = moves[event.key];
    if (to === undefined) return;
    event.preventDefault();
    goTo(to);
  };

  return (
    <section
      ref={sectionRef}
      className={cn("relative w-full", className)}
      style={{ height: height + span }}
    >
      <div
        ref={stageRef}
        role="group"
        aria-roledescription="hanging scroll"
        aria-label={label}
        aria-describedby={hintId}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={cn(
          "group/hanging-scroll sticky top-0 isolate w-full overflow-clip outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
        style={{ height }}
      >
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-300",
            motionSafe && "group-data-live/hanging-scroll:opacity-0",
          )}
        >
          <Still
            layout={layout}
            items={list}
            tone={tone}
            mount={mountColour}
            index={index}
            cord={cord}
            height={height}
            stageW={w}
          />
        </div>
        <canvas
          ref={canvasRef}
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300",
            motionSafe && "group-data-live/hanging-scroll:opacity-100",
          )}
        />
        <span ref={monoRef} aria-hidden className="hidden font-mono" />
        <ol className="sr-only">
          {list.map((item, i) => (
            <li key={i}>
              <span role="img" aria-label={item.alt} />
              {item.caption ? ` ${plate(i)}: ${item.caption}` : ` ${plate(i)}`}
            </li>
          ))}
        </ol>
        <p id={hintId} className="sr-only">
          Scroll to roll the paper up. Down, Page Down and Space roll to the
          next picture, Up and Page Up back, Home and End to the first and last.
        </p>
        <p role="status" className="sr-only">
          <span key={said.n}>{said.text}</span>
        </p>
      </div>
    </section>
  );
}
