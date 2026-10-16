"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  Check,
  Download,
  EyeOff,
  MousePointer2,
  MoveUpRight,
  Redo2,
  RotateCcw,
  Square,
  TriangleAlert,
  Type,
  Undo2,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ------------------------------------------------------------------------- */
/*                                   Types                                    */
/* ------------------------------------------------------------------------- */

export type MarkupTool = "select" | "arrow" | "box" | "text" | "redact";
export type MarkupPalette = "rail" | "float" | "strip";
export type MarkupStatus = "ready" | "loading" | "error";

export type MarkupArrow = {
  id: string;
  kind: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};
export type MarkupBox = {
  id: string;
  kind: "box";
  x: number;
  y: number;
  w: number;
  h: number;
};
export type MarkupText = {
  id: string;
  kind: "text";
  x: number;
  y: number;
  text: string;
};
export type MarkupRedact = {
  id: string;
  kind: "redact";
  /** The grid the cells sit on, in image pixels. */
  size: number;
  /** Pixelated cells as [column, row] on that grid. */
  cells: [number, number][];
};
/** Every mark lives in the image's own pixels, so it survives any display size. */
export type MarkupAnnotation =
  MarkupArrow | MarkupBox | MarkupText | MarkupRedact;

export type MarkupImage = {
  /** Natural width in px. */
  width: number;
  /** Natural height in px. */
  height: number;
  /** What the screenshot shows; names the canvas for assistive technology. */
  alt: string;
  /** A raster screenshot. Omit it to draw `content` instead. */
  src?: string;
  /** SVG children drawn in the image's coordinates (the default dashboard). */
  content?: React.ReactNode;
};

export type ScreenshotMarkupProps = {
  /** Stroke of arrows and boxes in image px; also sizes arrowheads, labels and the redact brush (6 × stroke). @default 3 */
  strokeWidth?: number;
  /** Where the tools live: a rail down the left, a pill floating over the image, or a strip under the header. Narrow editors dock them at the bottom. @default "rail" */
  toolPalette?: MarkupPalette;
  /** The markup colour. Fills use its hue at a fixed lightness, so marks read the same in both themes. @default "var(--danger)" */
  accent?: string;
  /** The screenshot. @default defaultMarkupImage */
  image?: MarkupImage;
  /** Controlled marks. */
  annotations?: MarkupAnnotation[];
  /** Initial marks when uncontrolled. @default defaultMarkupAnnotations */
  defaultAnnotations?: MarkupAnnotation[];
  /** Fires with every mark after one is drawn, moved, edited or removed. */
  onChange?: (annotations: MarkupAnnotation[]) => void;
  /** Controlled tool. */
  tool?: MarkupTool;
  /** Initial tool when uncontrolled. @default "arrow" */
  defaultTool?: MarkupTool;
  /** Fires from the button or key that picked a tool. */
  onToolChange?: (tool: MarkupTool) => void;
  /** Controlled selected mark id, or null. */
  selected?: string | null;
  /** Initial selection when uncontrolled. @default null */
  defaultSelected?: string | null;
  /** Fires when a click, key or new mark changes the selection. */
  onSelectedChange?: (id: string | null) => void;
  /** Undo was pressed (or Cmd+Z), with the marks it went back to. */
  onUndo?: (annotations: MarkupAnnotation[]) => void;
  /** Redo was pressed (or Shift+Cmd+Z), with the marks it restored. */
  onRedo?: (annotations: MarkupAnnotation[]) => void;
  /** Export was pressed. Return a promise to show it exporting. */
  onExport?: (
    annotations: MarkupAnnotation[],
    image: MarkupImage,
  ) => void | Promise<unknown>;
  /** Whether the screenshot has arrived. @default "ready" */
  status?: MarkupStatus;
  /** How much of a large screenshot has loaded, 0 to 1. Omit for an indeterminate bar. */
  progress?: number;
  /** "Try again" was pressed after the screenshot failed to load. */
  onRetry?: () => void;
  /** The editor's heading. @default "Basinworks · levels, 14 Oct" */
  title?: string;
  /** The redaction grid in image px. @default 16 */
  cellSize?: number;
  /** The editor's tallest height, px; the image letterboxes inside. @default 540 */
  height?: number;
  /** Marks can be viewed but not drawn, moved, removed or exported. @default false */
  disabled?: boolean;
  /** Classes for the editor's outer box. */
  className?: string;
};

/* ------------------------------------------------------------------------- */
/*                         The default screenshot                             */
/* ------------------------------------------------------------------------- */

const W0 = 960;
const H0 = 600;

const NAV = ["Overview", "Reservoirs", "Alerts", "Contacts", "Reports"];
const LEVELS = [
  { name: "North basin", value: 82, tone: "fill-cobalt-bright" },
  { name: "Weir pool", value: 64, tone: "fill-success" },
  { name: "Ridge tank", value: 41, tone: "fill-warn" },
];
const INFLOW = [38, 44, 41, 47, 92, 58, 51];
const DAYS = ["Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue"];
const CONTACTS = [
  [
    "Ines Duarte",
    "ines.duarte@basinworks.example",
    "0417 552 091",
    "ACC-4417-0092",
  ],
  [
    "Tomas Reyes",
    "t.reyes@basinworks.example",
    "0428 190 334",
    "ACC-4417-0131",
  ],
  [
    "Mara Okoro",
    "mara.okoro@basinworks.example",
    "0433 806 217",
    "ACC-4417-0207",
  ],
];

const chartX = (i: number) => 254 + i * 104;
const chartY = (v: number) => 372 - v * 1.5;
const INFLOW_PATH = INFLOW.map(
  (v, i) => `${i === 0 ? "M" : "L"}${chartX(i)} ${chartY(v)}`,
).join(" ");

/** A Basinworks reservoir dashboard, drawn from tokens so it follows the theme. */
function BasinworksDashboard() {
  return (
    <g fontFamily="inherit">
      <rect width={W0} height={H0} className="fill-surface-0" />
      <rect width="176" height={H0} className="fill-surface-1" />
      <rect x="176" width="1" height={H0} className="fill-hairline-strong" />
      <circle cx="32" cy="34" r="10" className="fill-cobalt-bright" />
      <path
        d="M27 36 Q32 26 37 36"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <text
        x="50"
        y="39"
        fontSize="15"
        fontWeight="600"
        className="fill-foreground"
      >
        Basinworks
      </text>
      {NAV.map((n, i) => (
        <g key={n}>
          {i === 0 ? (
            <rect
              x="12"
              y={68 + i * 36}
              width="152"
              height="30"
              rx="8"
              className="fill-surface-2"
            />
          ) : null}
          <rect
            x="26"
            y={78 + i * 36}
            width="10"
            height="10"
            rx="3"
            className={i === 0 ? "fill-cobalt-bright" : "fill-hairline-strong"}
          />
          <text
            x="46"
            y={88 + i * 36}
            fontSize="13"
            fontWeight={i === 0 ? 600 : 400}
            className={i === 0 ? "fill-foreground" : "fill-ink-2"}
          >
            {n}
          </text>
        </g>
      ))}

      <text
        x="204"
        y="44"
        fontSize="20"
        fontWeight="600"
        className="fill-foreground"
      >
        Reservoir levels
      </text>
      <text x="204" y="64" fontSize="12" className="fill-ink-3">
        Tuesday 14 October · updated 09:40
      </text>
      <circle cx="920" cy="42" r="15" className="fill-surface-2" />
      <text
        x="920"
        y="46"
        fontSize="11"
        fontWeight="600"
        textAnchor="middle"
        className="fill-ink-2"
      >
        ID
      </text>

      {LEVELS.map((l, i) => {
        const x = 204 + i * 252;
        return (
          <g key={l.name}>
            <rect
              x={x}
              y="88"
              width="236"
              height="92"
              rx="12"
              className="fill-card stroke-hairline-strong"
            />
            <text x={x + 18} y="114" fontSize="12" className="fill-ink-2">
              {l.name}
            </text>
            <text
              x={x + 18}
              y="150"
              fontSize="26"
              fontWeight="600"
              className="fill-foreground"
            >
              {l.value}%
            </text>
            <rect
              x={x + 18}
              y="162"
              width="200"
              height="6"
              rx="3"
              className="fill-surface-2"
            />
            <rect
              x={x + 18}
              y="162"
              width={l.value * 2}
              height="6"
              rx="3"
              className={l.tone}
            />
          </g>
        );
      })}

      <rect
        x="204"
        y="196"
        width="740"
        height="200"
        rx="12"
        className="fill-card stroke-hairline-strong"
      />
      <text
        x="222"
        y="222"
        fontSize="13"
        fontWeight="600"
        className="fill-foreground"
      >
        Inflow, last 7 days
      </text>
      <text
        x="926"
        y="222"
        fontSize="11"
        textAnchor="end"
        className="fill-ink-3"
      >
        megalitres
      </text>
      {[0, 1, 2, 3].map((k) => (
        <rect
          key={k}
          x="236"
          y={242 + k * 40}
          width="660"
          height="1"
          className="fill-hairline"
        />
      ))}
      <path
        d={INFLOW_PATH}
        fill="none"
        strokeWidth="2.5"
        strokeLinejoin="round"
        className="stroke-cobalt-bright"
      />
      {INFLOW.map((v, i) => (
        <circle
          key={i}
          cx={chartX(i)}
          cy={chartY(v)}
          r="3.5"
          className="fill-card stroke-cobalt-bright"
          strokeWidth="2"
        />
      ))}
      {DAYS.map((d, i) => (
        <text
          key={d}
          x={chartX(i)}
          y="388"
          fontSize="11"
          textAnchor="middle"
          className="fill-ink-3"
        >
          {d}
        </text>
      ))}

      <rect
        x="204"
        y="412"
        width="740"
        height="172"
        rx="12"
        className="fill-card stroke-hairline-strong"
      />
      <text
        x="222"
        y="438"
        fontSize="13"
        fontWeight="600"
        className="fill-foreground"
      >
        On call this week
      </text>
      {["Name", "Email", "Phone", "Account"].map((h, i) => (
        <text
          key={h}
          x={[222, 380, 640, 784][i]}
          y="462"
          fontSize="11"
          className="fill-ink-3"
        >
          {h}
        </text>
      ))}
      <rect x="222" y="470" width="704" height="1" className="fill-hairline" />
      {CONTACTS.map((row, r) => (
        <g key={row[0]}>
          {row.map((cell, i) => (
            <text
              key={cell}
              x={[222, 380, 640, 784][i]}
              y={494 + r * 32}
              fontSize="13"
              className={i === 0 ? "fill-foreground" : "fill-ink-2"}
              fontFamily={i >= 2 ? "var(--font-mono), monospace" : undefined}
            >
              {cell}
            </text>
          ))}
          {r < 2 ? (
            <rect
              x="222"
              y={504 + r * 32}
              width="704"
              height="1"
              className="fill-hairline"
            />
          ) : null}
        </g>
      ))}
    </g>
  );
}

export const defaultMarkupImage: MarkupImage = {
  width: W0,
  height: H0,
  alt: "Basinworks dashboard: reservoir levels, a week of inflow with a spike on Sunday, and the on-call contacts",
  content: <BasinworksDashboard />,
};

/** Cells covering a rectangle of the image, on a 16px grid. */
const cellsOver = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  size = 16,
) => {
  const out: [number, number][] = [];
  for (let r = Math.floor(y0 / size); r < Math.ceil(y1 / size); r += 1) {
    for (let c = Math.floor(x0 / size); c < Math.ceil(x1 / size); c += 1) {
      out.push([c, r]);
    }
  }
  return out;
};

/** A spike called out, a level boxed, and one email already pixelated. */
export const defaultMarkupAnnotations: MarkupAnnotation[] = [
  { id: "spike", kind: "arrow", x1: 772, y1: 300, x2: 684, y2: 242 },
  {
    id: "spike-note",
    kind: "text",
    x: 712,
    y: 322,
    text: "Storm inflow, Sunday",
  },
  { id: "ridge", kind: "box", x: 696, y: 80, w: 256, h: 108 },
  {
    id: "email",
    kind: "redact",
    size: 16,
    cells: cellsOver(372, 478, 600, 500),
  },
];

/* ------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* ------------------------------------------------------------------------- */

const TOOLS: {
  tool: MarkupTool;
  name: string;
  key: string;
  Icon: typeof Square;
}[] = [
  { tool: "select", name: "Select", key: "V", Icon: MousePointer2 },
  { tool: "arrow", name: "Arrow", key: "A", Icon: MoveUpRight },
  { tool: "box", name: "Box", key: "B", Icon: Square },
  { tool: "text", name: "Text", key: "T", Icon: Type },
  { tool: "redact", name: "Redact", key: "R", Icon: EyeOff },
];

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;
const pigment = (accent: string, l = 0.6) => `oklch(from ${accent} ${l} c h)`;
const wash = (accent: string, pct: number) =>
  `color-mix(in oklab, ${accent} ${pct}%, transparent)`;

/** The arrowhead's outline at a tip, pointing along `angle`, scaled. */
function headPath(
  tx: number,
  ty: number,
  angle: number,
  length: number,
  half: number,
  scale: number,
) {
  const l = length * scale;
  const h = half * scale;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const bx = tx - l * cos;
  const by = ty - l * sin;
  const p = (x: number, y: number) => `${r2(x)} ${r2(y)}`;
  return `M${p(tx, ty)}L${p(bx - h * sin, by + h * cos)}Q${p(bx + l * 0.18 * cos, by + l * 0.18 * sin)} ${p(bx + h * sin, by - h * cos)}Z`;
}

const kindWord: Record<MarkupAnnotation["kind"], string> = {
  arrow: "Arrow",
  box: "Box",
  text: "Label",
  redact: "Redaction",
};

function describe(a: MarkupAnnotation): string {
  if (a.kind === "text") return `Label, ${a.text}`;
  if (a.kind === "redact")
    return `Redaction, ${plural(a.cells.length, "cell", "cells")}`;
  return kindWord[a.kind];
}

/** A mark's centre, for keyboard selection and the cursor. */
function centreOf(a: MarkupAnnotation): [number, number] {
  switch (a.kind) {
    case "arrow":
      return [(a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2];
    case "box":
      return [a.x + a.w / 2, a.y + a.h / 2];
    case "text":
      return [a.x, a.y];
    default: {
      const first = a.cells[0] ?? [0, 0];
      return [(first[0] + 0.5) * a.size, (first[1] + 0.5) * a.size];
    }
  }
}

function moveBy(a: MarkupAnnotation, dx: number, dy: number): MarkupAnnotation {
  switch (a.kind) {
    case "arrow":
      return {
        ...a,
        x1: r2(a.x1 + dx),
        y1: r2(a.y1 + dy),
        x2: r2(a.x2 + dx),
        y2: r2(a.y2 + dy),
      };
    case "box":
      return { ...a, x: r2(a.x + dx), y: r2(a.y + dy) };
    case "text":
      return { ...a, x: r2(a.x + dx), y: r2(a.y + dy) };
    default: {
      const dc = Math.round(dx / a.size);
      const dr = Math.round(dy / a.size);
      return {
        ...a,
        cells: a.cells.map(([c, r]) => [c + dc, r + dr] as [number, number]),
      };
    }
  }
}

/* ------------------------------------------------------------------------- */
/*                                   Marks                                    */
/* ------------------------------------------------------------------------- */

type ArrowLanding = { cx: number; cy: number; angle: number };

/**
 * A committed arrow. A freshly drawn one lands: the shaft pulls taut on glide
 * from the bow the hand left in it, and the head springs to full size and
 * onto the shaft's angle on recoil — two visible bounces.
 */
function ArrowMark({
  a,
  sw,
  colour,
  landing,
  motionSafe,
}: {
  a: MarkupArrow;
  sw: number;
  colour: string;
  landing: ArrowLanding | null;
  motionSafe: boolean;
}) {
  const midX = (a.x1 + a.x2) / 2;
  const midY = (a.y1 + a.y2) / 2;
  const rest = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
  const cx = useMotionValue(midX);
  const cy = useMotionValue(midY);
  const scale = useMotionValue(1);
  const angle = useMotionValue(rest);

  React.useEffect(() => {
    if (!landing || !motionSafe) {
      cx.jump(midX);
      cy.jump(midY);
      scale.jump(1);
      angle.jump(rest);
      return;
    }
    // Every run starts from the hand's last frame, so a StrictMode rehearsal
    // still lands the whole spring.
    cx.jump(landing.cx);
    cy.jump(landing.cy);
    scale.jump(0.45);
    // Turn the short way round.
    let from = landing.angle;
    while (from - rest > Math.PI) from -= Math.PI * 2;
    while (rest - from > Math.PI) from += Math.PI * 2;
    angle.jump(from);
    const running = [
      animate(cx, midX, springs.glide),
      animate(cy, midY, springs.glide),
      animate(scale, 1, springs.recoil),
      animate(angle, rest, springs.recoil),
    ];
    return () => {
      for (const c of running) c.complete();
    };
  }, [landing, motionSafe, midX, midY, rest, cx, cy, scale, angle]);

  const length = 4 * sw + 7;
  const half = 2.4 * sw + 3;
  const shaft = useTransform(
    [cx, cy, angle, scale] as MotionValue<number>[],
    ([qx = 0, qy = 0, an = 0, k = 1]: number[]) => {
      // The shaft stops inside the head so its square end never shows.
      const inset = length * k * 0.55;
      const ex = a.x2 - inset * Math.cos(an);
      const ey = a.y2 - inset * Math.sin(an);
      return `M${r2(a.x1)} ${r2(a.y1)}Q${r2(qx)} ${r2(qy)} ${r2(ex)} ${r2(ey)}`;
    },
  );
  const head = useTransform(
    [angle, scale] as MotionValue<number>[],
    ([an = 0, k = 1]: number[]) => headPath(a.x2, a.y2, an, length, half, k),
  );
  // The colour rides on a plain group: motion would not re-apply a changed
  // style colour on an SVG element it manages.
  return (
    <g style={{ color: colour }}>
      <motion.path
        d={shaft}
        fill="none"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <motion.path
        d={head}
        fill="currentColor"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth={r2(sw * 0.6)}
      />
    </g>
  );
}

/**
 * A label on a pill of the markup colour. The pill is sized from an estimate
 * on the server and from the text's real length once it is in the page.
 */
function LabelMark({
  m,
  size,
  colour,
}: {
  m: MarkupText;
  size: number;
  colour: string;
}) {
  const [len, setLen] = React.useState(() => r2(m.text.length * size * 0.56));
  const textRef = React.useRef<SVGTextElement | null>(null);
  React.useLayoutEffect(() => {
    const node = textRef.current;
    if (!node) return;
    const measured = node.getComputedTextLength();
    if (measured > 0) setLen(r2(measured));
  }, [m.text, size]);
  const h = r2(size + 12);
  return (
    <>
      <rect
        x={m.x}
        y={r2(m.y - h / 2)}
        width={r2(len + 22)}
        height={h}
        rx={r2(h / 2)}
        style={{ fill: colour }}
      />
      <text
        ref={textRef}
        x={r2(m.x + 11)}
        y={r2(m.y + size * 0.36)}
        fontSize={size}
        fontWeight={600}
        fill="white"
      >
        {m.text}
      </text>
    </>
  );
}

/**
 * One redaction: the pixelated copy of the image, clipped to its cells. The
 * cells pop in as separate rounded tiles while the brush is down; when the
 * stroke ends they settle — gaps close and corners square on snap, in the
 * order they were laid — into one solid mosaic.
 */
function RedactLayer({
  r,
  phase,
  clipId,
  shotId,
  filterId,
  motionSafe,
}: {
  r: MarkupRedact;
  phase: "live" | "settle" | "rest";
  clipId: string;
  shotId: string;
  filterId: string;
  motionSafe: boolean;
}) {
  const s = r.size;
  const step = Math.min(0.012, cascade(r.cells.length));
  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          {r.cells.map(([c, row], i) => {
            const at = (k: number) => {
              const inset = s * k;
              return {
                attrX: r2(c * s + inset),
                attrY: r2(row * s + inset),
                width: r2(s - inset * 2),
                height: r2(s - inset * 2),
                rx: r2(k * 14),
              };
            };
            const live = phase === "live";
            const still = !motionSafe || phase === "rest";
            return (
              <motion.rect
                key={`${c},${row}`}
                initial={still ? false : at(live ? 0.5 : 0.18)}
                animate={at(live && motionSafe ? 0.18 : 0)}
                transition={
                  still
                    ? { duration: 0 }
                    : live
                      ? {
                          ...springs.flick,
                          rx: { duration: durations.fast },
                        }
                      : {
                          ...springs.snap,
                          delay: Math.min(0.6, i * step),
                          // The corners square on a tween: the spring's one
                          // overshoot would ask for a negative radius.
                          rx: {
                            duration: durations.base,
                            ease: easings.enter,
                            delay: Math.min(0.6, i * step),
                          },
                        }
                }
              />
            );
          })}
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <use href={`#${shotId}`} filter={`url(#${filterId})`} />
      </g>
    </g>
  );
}

/* ------------------------------------------------------------------------- */
/*                                 The editor                                 */
/* ------------------------------------------------------------------------- */

type Draft =
  | { kind: "arrow"; x1: number; y1: number; keyboard: boolean }
  | { kind: "box"; x0: number; y0: number; keyboard: boolean }
  | { kind: "redact"; cells: [number, number][]; keyboard: boolean };

type Typing = { id: string | null; x: number; y: number; value: string };
type Phase = "idle" | "busy" | "done" | "failed";

/**
 * A screenshot annotation editor: arrows, boxes, labels and redaction over a
 * Basinworks dashboard, every mark kept in the image's own pixels.
 *
 * Two moments carry it. Drawing an arrow, the shaft bows behind the hand — a
 * curve whose control point trails the pointer on a spring — and on release
 * it pulls taut on glide while the head springs into place on recoil, two
 * visible bounces. The redact brush pixelates whatever passes under it:
 * cells of a grid fill with the real mosaic of the image beneath, popping in
 * as separate tiles on flick, and when the stroke ends the blocks settle —
 * gaps closing, corners squaring on snap in the order they were laid — into
 * one solid mosaic.
 *
 * Tools have single keys (V, A, B, T, R). Every pointer mark has a keyboard
 * path: arrows move a cursor, Enter starts a mark there, arrows extend it and
 * Enter ends it with the same landing; [ and ] select marks, arrows nudge the
 * selected one and Delete removes it. Undo and redo walk a history. Under
 * reduced motion the shaft draws straight, the head appears in place and the
 * mosaic lands solid; the pixelation itself never changes.
 */
export function ScreenshotMarkup({
  strokeWidth = 3,
  toolPalette = "rail",
  accent = "var(--danger)",
  image = defaultMarkupImage,
  annotations,
  defaultAnnotations,
  onChange,
  tool,
  defaultTool = "arrow",
  onToolChange,
  selected,
  defaultSelected = null,
  onSelectedChange,
  onUndo,
  onRedo,
  onExport,
  status = "ready",
  progress,
  onRetry,
  title = "Basinworks · levels, 14 Oct",
  cellSize = 16,
  height = 540,
  disabled = false,
  className,
}: ScreenshotMarkupProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const shotId = `${idBase}-shot`;
  const filterId = `${idBase}-pix`;
  const W = Math.max(1, image.width);
  const H = Math.max(1, image.height);
  const ready = status === "ready";
  const locked = disabled || !ready;
  const sw = r2(clamp(strokeWidth, 1, 10));
  const cell = Math.max(4, Math.round(cellSize));
  const brush = sw * 6;
  const markColour = pigment(accent, 0.62);
  const labelSize = r2(13 + sw * 1.5);

  /* --------------------------------- state -------------------------------- */

  const [own, setOwn] = React.useState<MarkupAnnotation[]>(
    () => defaultAnnotations ?? defaultMarkupAnnotations,
  );
  const marks = annotations ?? own;
  const [ownTool, setOwnTool] = React.useState<MarkupTool>(defaultTool);
  const current = tool ?? ownTool;
  const [ownSel, setOwnSel] = React.useState<string | null>(defaultSelected);
  const selRaw = selected !== undefined ? selected : ownSel;
  const sel = selRaw && marks.some((m) => m.id === selRaw) ? selRaw : null;

  const [past, setPast] = React.useState<MarkupAnnotation[][]>([]);
  const [future, setFuture] = React.useState<MarkupAnnotation[][]>([]);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [typing, setTyping] = React.useState<Typing | null>(null);
  const [landings, setLandings] = React.useState<Record<string, ArrowLanding>>(
    {},
  );
  const [settling, setSettling] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [kbd, setKbd] = React.useState(false);
  const [narrow, setNarrow] = React.useState(false);
  const [exporting, setExporting] = React.useState<Phase>("idle");
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (t: string) => setSaid((s) => ({ n: s.n + 1, text: t }));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const counter = React.useRef(0);
  const timers = React.useRef(new Set<number>());
  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const downTarget = React.useRef<string | null>(null);
  const moving = React.useRef<{ id: string; dx: number; dy: number } | null>(
    null,
  );
  const lastStamp = React.useRef<[number, number] | null>(null);
  /** The mark in progress, read by handlers that may run before a re-render. */
  const draftRef = React.useRef<Draft | null>(null);
  const setLive = (d: Draft | null) => {
    draftRef.current = d;
    setDraft(d);
  };

  // The cursor (keyboard drawing point) and the live geometry of a mark in
  // progress: motion values, so a drag never renders React per frame.
  const curX = useMotionValue(W / 2);
  const curY = useMotionValue(H / 2);
  const origX = useMotionValue(0);
  const origY = useMotionValue(0);
  const tipX = useMotionValue(0);
  const tipY = useMotionValue(0);
  const ctrlX = useMotionValue(0);
  const ctrlY = useMotionValue(0);
  const offX = useMotionValue(0);
  const offY = useMotionValue(0);

  /* -------------------------------- writes -------------------------------- */

  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };

  const write = (next: MarkupAnnotation[], record = true) => {
    if (record) {
      setPast((p) => [...p.slice(-39), marks]);
      setFuture([]);
    }
    if (annotations === undefined) setOwn(next);
    onChange?.(next);
  };

  const pick = (id: string | null) => {
    if (id === sel) return;
    if (selected === undefined) setOwnSel(id);
    onSelectedChange?.(id);
  };

  const chooseTool = (t: MarkupTool) => {
    if (t === current) return;
    if (tool === undefined) setOwnTool(t);
    onToolChange?.(t);
    setDraft(null);
    const entry = TOOLS.find((x) => x.tool === t);
    say(`${entry?.name ?? t} tool.`);
  };

  const newId = (kind: string) => {
    const taken = new Set(marks.map((m) => m.id));
    let id = "";
    do {
      counter.current += 1;
      id = `${idBase}-${kind}${counter.current}`;
    } while (taken.has(id));
    return id;
  };

  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev || locked) return;
    setPast(past.slice(0, -1));
    setFuture((f) => [marks, ...f]);
    write(prev, false);
    onUndo?.(prev);
    say(`Undone. ${plural(prev.length, "mark", "marks")}.`);
  };

  const redo = () => {
    const next = future[0];
    if (!next || locked) return;
    setFuture(future.slice(1));
    setPast((p) => [...p, marks]);
    write(next, false);
    onRedo?.(next);
    say(`Redone. ${plural(next.length, "mark", "marks")}.`);
  };

  const remove = (id: string) => {
    const gone = marks.find((m) => m.id === id);
    if (!gone || locked) return;
    write(marks.filter((m) => m.id !== id));
    pick(null);
    say(
      `${kindWord[gone.kind]} removed. ${plural(marks.length - 1, "mark", "marks")}.`,
    );
  };

  const nudge = (dx: number, dy: number) => {
    if (!sel || locked) return;
    write(marks.map((m) => (m.id === sel ? moveBy(m, dx, dy) : m)));
  };

  /* -------------------------------- effects ------------------------------- */

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => setNarrow(root.clientWidth < 576));
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    const pending = timers.current;
    const running = runs.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
      for (const c of running) c.stop();
    };
  }, []);

  /* ------------------------------ geometry -------------------------------- */

  const toImage = (clientX: number, clientY: number): [number, number] => {
    const box = boxRef.current;
    if (!box) return [0, 0];
    const r = box.getBoundingClientRect();
    return [
      r2(clamp(((clientX - r.left) / Math.max(1, r.width)) * W, 0, W)),
      r2(clamp(((clientY - r.top) / Math.max(1, r.height)) * H, 0, H)),
    ];
  };

  /** Cells the brush covers at a point, appended in the order they are laid. */
  const stamp = (cells: [number, number][], x: number, y: number) => {
    const seen = new Set(cells.map(([c, r]) => `${c},${r}`));
    const out = [...cells];
    const reach = Math.ceil(brush / cell);
    const c0 = Math.floor(x / cell);
    const r0 = Math.floor(y / cell);
    for (let dr = -reach; dr <= reach; dr += 1) {
      for (let dc = -reach; dc <= reach; dc += 1) {
        const c = c0 + dc;
        const r = r0 + dr;
        if (c < 0 || r < 0 || c * cell >= W || r * cell >= H) continue;
        const cx = (c + 0.5) * cell;
        const cy = (r + 0.5) * cell;
        if (Math.hypot(cx - x, cy - y) > brush + cell * 0.35) continue;
        const key = `${c},${r}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push([c, r]);
      }
    }
    return out;
  };

  /** Stamps along the path from the last stamp, so a fast stroke leaves no holes. */
  const brushTo = (x: number, y: number) => {
    const d = draftRef.current;
    if (!d || d.kind !== "redact") return;
    let cells = d.cells;
    const from = lastStamp.current ?? [x, y];
    const dist = Math.hypot(x - from[0], y - from[1]);
    const steps = Math.max(1, Math.ceil(dist / (cell / 2)));
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      cells = stamp(
        cells,
        from[0] + (x - from[0]) * t,
        from[1] + (y - from[1]) * t,
      );
    }
    lastStamp.current = [x, y];
    // State changes only when the brush crosses a new cell.
    if (cells.length !== d.cells.length) setLive({ ...d, cells });
  };

  /* ----------------------------- drawing flow ----------------------------- */

  const begin = (x: number, y: number, keyboard: boolean) => {
    if (locked) return;
    for (const c of runs.current) c.stop();
    runs.current = [];
    origX.jump(x);
    origY.jump(y);
    tipX.jump(x);
    tipY.jump(y);
    ctrlX.jump(x);
    ctrlY.jump(y);
    if (current === "arrow") {
      setLive({ kind: "arrow", x1: x, y1: y, keyboard });
    } else if (current === "box") {
      setLive({ kind: "box", x0: x, y0: y, keyboard });
    } else if (current === "redact") {
      lastStamp.current = [x, y];
      setLive({ kind: "redact", cells: stamp([], x, y), keyboard });
    }
    pick(null);
  };

  const extend = (x: number, y: number) => {
    const draft = draftRef.current;
    if (!draft) return;
    if (draft.kind === "arrow") {
      tipX.set(x);
      tipY.set(y);
      // The control point trails the hand toward the shaft's middle: a fast
      // stroke bows the line like a cord, a slow one barely does.
      const mx = (draft.x1 + x) / 2;
      const my = (draft.y1 + y) / 2;
      for (const c of runs.current) c.stop();
      runs.current = motionSafe
        ? [animate(ctrlX, mx, springs.glide), animate(ctrlY, my, springs.glide)]
        : [];
      if (!motionSafe) {
        ctrlX.jump(mx);
        ctrlY.jump(my);
      }
    } else if (draft.kind === "box") {
      tipX.set(x);
      tipY.set(y);
    } else {
      brushTo(x, y);
    }
  };

  const commitRedaction = (cells: [number, number][]) => {
    if (cells.length === 0) return;
    const id = newId("redact");
    setSettling((s) => new Set(s).add(id));
    later(() => {
      setSettling((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }, 1200);
    write([...marks, { id, kind: "redact", size: cell, cells }]);
    say(
      `Redacted ${plural(cells.length, "cell", "cells")}. ${plural(marks.length + 1, "mark", "marks")}.`,
    );
  };

  const finish = () => {
    const d = draftRef.current;
    if (!d) return;
    for (const c of runs.current) c.stop();
    runs.current = [];
    setLive(null);
    if (d.kind === "arrow") {
      const x2 = r2(tipX.get());
      const y2 = r2(tipY.get());
      if (Math.hypot(x2 - d.x1, y2 - d.y1) < 12) {
        say("Too short for an arrow. Drag further.");
        return;
      }
      const id = newId("arrow");
      const cx = ctrlX.get();
      const cy = ctrlY.get();
      setLandings((l) => ({
        ...l,
        [id]: { cx, cy, angle: Math.atan2(y2 - cy, x2 - cx) },
      }));
      write([
        ...marks,
        { id, kind: "arrow", x1: r2(d.x1), y1: r2(d.y1), x2, y2 },
      ]);
      pick(id);
      say(`Arrow added. ${plural(marks.length + 1, "mark", "marks")}.`);
    } else if (d.kind === "box") {
      const x1 = tipX.get();
      const y1 = tipY.get();
      const x = r2(Math.min(d.x0, x1));
      const y = r2(Math.min(d.y0, y1));
      const w = r2(Math.abs(x1 - d.x0));
      const h = r2(Math.abs(y1 - d.y0));
      if (w < 8 || h < 8) {
        say("Too small for a box. Drag further.");
        return;
      }
      const id = newId("box");
      write([...marks, { id, kind: "box", x, y, w, h }]);
      pick(id);
      say(`Box added. ${plural(marks.length + 1, "mark", "marks")}.`);
    } else {
      commitRedaction(d.cells);
    }
    lastStamp.current = null;
  };

  const cancelDraft = () => {
    for (const c of runs.current) c.stop();
    runs.current = [];
    setLive(null);
    lastStamp.current = null;
  };

  const openText = (x: number, y: number, existing?: MarkupText) => {
    if (locked) return;
    setTyping({
      id: existing?.id ?? null,
      x: existing?.x ?? x,
      y: existing?.y ?? y,
      value: existing?.text ?? "",
    });
  };

  const commitText = () => {
    const t = typing;
    if (!t) return;
    setTyping(null);
    const value = t.value.trim();
    if (t.id) {
      if (!value) remove(t.id);
      else {
        write(
          marks.map((m) =>
            m.id === t.id && m.kind === "text" ? { ...m, text: value } : m,
          ),
        );
        say("Label updated.");
      }
    } else if (value) {
      const id = newId("text");
      write([...marks, { id, kind: "text", x: t.x, y: t.y, text: value }]);
      pick(id);
      say(`Label added. ${plural(marks.length + 1, "mark", "marks")}.`);
    }
    stageRef.current?.focus({ preventScroll: true });
  };

  /* ---------------------------- pointer gesture ---------------------------- */

  const drag = useDrag({
    threshold: 3,
    disabled: locked || typing !== null,
    onStart: ({ point, offset }) => {
      setKbd(false);
      const [x0, y0] = toImage(point.x - offset.x, point.y - offset.y);
      const hit = downTarget.current;
      if (current === "select") {
        if (!hit) return;
        pick(hit);
        offX.jump(0);
        offY.jump(0);
        moving.current = { id: hit, dx: 0, dy: 0 };
        return;
      }
      begin(x0, y0, false);
      const [x, y] = toImage(point.x, point.y);
      extend(x, y);
    },
    onMove: ({ point, offset }) => {
      if (moving.current) {
        const box = boxRef.current?.getBoundingClientRect();
        const k = box ? W / Math.max(1, box.width) : 1;
        offX.set(r2(offset.x * k));
        offY.set(r2(offset.y * k));
        return;
      }
      const [x, y] = toImage(point.x, point.y);
      extend(x, y);
    },
    onEnd: ({ velocity }) => {
      const m = moving.current;
      moving.current = null;
      if (m) {
        const box = boxRef.current?.getBoundingClientRect();
        const k = box ? W / Math.max(1, box.width) : 1;
        // Commit where the throw would have come to rest, then let the
        // offset spring home from where the hand let go.
        const reach = W / 4;
        const dx = r2(
          clamp(project(offX.get(), velocity.x * k, 0.99), -reach, reach),
        );
        const dy = r2(
          clamp(project(offY.get(), velocity.y * k, 0.99), -reach, reach),
        );
        const target = marks.find((x) => x.id === m.id);
        if (!target) return;
        const moved = moveBy(target, dx, dy);
        const [cx0, cy0] = centreOf(target);
        const [cx1, cy1] = centreOf(moved);
        const realDx = cx1 - cx0;
        const realDy = cy1 - cy0;
        offX.jump(r2(offX.get() - realDx));
        offY.jump(r2(offY.get() - realDy));
        write(marks.map((x) => (x.id === m.id ? moved : x)));
        if (motionSafe) {
          runs.current = [
            animate(offX, 0, { ...springs.snap, velocity: velocity.x * k }),
            animate(offY, 0, { ...springs.snap, velocity: velocity.y * k }),
          ];
        } else {
          offX.jump(0);
          offY.jump(0);
        }
        say(`${kindWord[target.kind]} moved.`);
        return;
      }
      finish();
    },
    onCancel: () => {
      if (moving.current) {
        moving.current = null;
        offX.jump(0);
        offY.jump(0);
        return;
      }
      cancelDraft();
    },
    onTap: (event) => {
      setKbd(false);
      const [x, y] = toImage(event.clientX, event.clientY);
      const hit = downTarget.current;
      if (current === "select") {
        pick(hit);
        if (hit) {
          const m = marks.find((a) => a.id === hit);
          if (m) say(`${describe(m)} selected.`);
        }
        return;
      }
      if (current === "text") {
        const m = hit ? marks.find((a) => a.id === hit) : undefined;
        openText(x, y, m?.kind === "text" ? m : undefined);
        return;
      }
      if (current === "redact" && !locked) {
        // A tap is a single dab, laid and settled at once.
        commitRedaction(stamp([], x, y));
      }
    },
  });

  /* ------------------------------- keyboard ------------------------------- */

  const onRootKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const t = event.target;
    if (t instanceof HTMLElement && t.closest("input, textarea")) return;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && (event.key === "z" || event.key === "Z")) {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (mod || event.altKey) return;
    const entry = TOOLS.find(
      (x) => x.key.toLowerCase() === event.key.toLowerCase(),
    );
    if (entry && !locked) {
      event.preventDefault();
      chooseTool(entry.tool);
    }
  };

  const ARROWS: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };

  const onStageKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    setKbd(true);
    const arrow = ARROWS[event.key];
    if (arrow) {
      event.preventDefault();
      if (sel && !draftRef.current) {
        const k = event.shiftKey ? 10 : 1;
        nudge(arrow[0] * k, arrow[1] * k);
        return;
      }
      const k = event.shiftKey ? 32 : 8;
      const x = r2(clamp(curX.get() + arrow[0] * k, 0, W));
      const y = r2(clamp(curY.get() + arrow[1] * k, 0, H));
      curX.set(x);
      curY.set(y);
      if (draftRef.current) extend(x, y);
      return;
    }
    switch (event.key) {
      case "Enter":
      case " ": {
        event.preventDefault();
        if (locked) return;
        if (draftRef.current) {
          finish();
          return;
        }
        const x = curX.get();
        const y = curY.get();
        if (current === "text") {
          openText(x, y);
        } else if (current === "select") {
          // The mark nearest the cursor.
          const next = [...marks].sort((a, b) => {
            const [ax, ay] = centreOf(a);
            const [bx, by] = centreOf(b);
            return Math.hypot(ax - x, ay - y) - Math.hypot(bx - x, by - y);
          })[0];
          if (next) {
            pick(next.id);
            say(`${describe(next)} selected. Arrows nudge it.`);
          }
        } else {
          begin(x, y, true);
          say(
            current === "redact"
              ? "Brushing. Arrows paint, Enter ends."
              : `${current === "arrow" ? "Arrow" : "Box"} started. Arrows move its end, Enter ends.`,
          );
        }
        return;
      }
      case "[":
      case "]": {
        event.preventDefault();
        if (marks.length === 0) return;
        const at = sel ? marks.findIndex((m) => m.id === sel) : -1;
        const d = event.key === "]" ? 1 : -1;
        const next = marks[(at + d + marks.length) % marks.length] ?? marks[0];
        if (!next) return;
        pick(next.id);
        const [cx, cy] = centreOf(next);
        curX.set(r2(cx));
        curY.set(r2(cy));
        say(
          `${describe(next)} selected, ${marks.indexOf(next) + 1} of ${marks.length}.`,
        );
        return;
      }
      case "Delete":
      case "Backspace":
        if (sel) {
          event.preventDefault();
          remove(sel);
        }
        return;
      case "Escape":
        if (draftRef.current) {
          event.preventDefault();
          cancelDraft();
          say("Mark cancelled.");
        } else if (sel) {
          event.preventDefault();
          pick(null);
          say("Selection cleared.");
        }
        return;
      default:
        break;
    }
  };

  /* -------------------------------- export -------------------------------- */

  const runExport = () => {
    if (locked || exporting === "busy") return;
    const result = onExport?.(marks, image);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setExporting("busy");
      say("Exporting.");
      (result as Promise<unknown>).then(
        () => {
          setExporting("done");
          say(`Exported with ${plural(marks.length, "mark", "marks")}.`);
          later(() => setExporting("idle"), 1600);
        },
        () => {
          setExporting("failed");
          say("The export failed. Try again.");
        },
      );
    } else {
      setExporting("done");
      say(`Exported with ${plural(marks.length, "mark", "marks")}.`);
      later(() => setExporting("idle"), 1600);
    }
  };

  /* -------------------------------- render -------------------------------- */

  const boxDraft = useTransform(
    [origX, origY, tipX, tipY] as MotionValue<number>[],
    ([ox = 0, oy = 0, x = 0, y = 0]: number[]) => {
      const x0 = Math.min(ox, x);
      const y0 = Math.min(oy, y);
      const w = Math.abs(x - ox);
      const h = Math.abs(y - oy);
      const k = Math.min(6, w / 2, h / 2);
      return `M${r2(x0 + k)} ${r2(y0)}H${r2(x0 + w - k)}Q${r2(x0 + w)} ${r2(y0)} ${r2(x0 + w)} ${r2(y0 + k)}V${r2(y0 + h - k)}Q${r2(x0 + w)} ${r2(y0 + h)} ${r2(x0 + w - k)} ${r2(y0 + h)}H${r2(x0 + k)}Q${r2(x0)} ${r2(y0 + h)} ${r2(x0)} ${r2(y0 + h - k)}V${r2(y0 + k)}Q${r2(x0)} ${r2(y0)} ${r2(x0 + k)} ${r2(y0)}Z`;
    },
  );
  const arrowDraft = useTransform(
    [origX, origY, tipX, tipY, ctrlX, ctrlY] as MotionValue<number>[],
    ([ox = 0, oy = 0, tx = 0, ty = 0, qx = 0, qy = 0]: number[]) =>
      `M${r2(ox)} ${r2(oy)}Q${r2(qx)} ${r2(qy)} ${r2(tx)} ${r2(ty)}`,
  );
  const arrowDraftHead = useTransform(
    [origX, origY, tipX, tipY, ctrlX, ctrlY] as MotionValue<number>[],
    ([ox = 0, oy = 0, tx = 0, ty = 0, qx = 0, qy = 0]: number[]) => {
      const an =
        Math.hypot(tx - qx, ty - qy) < 0.5
          ? Math.atan2(ty - oy, tx - ox)
          : Math.atan2(ty - qy, tx - qx);
      return headPath(tx, ty, an, 4 * sw + 7, 2.4 * sw + 3, 0.45);
    },
  );

  const selMark = sel ? (marks.find((m) => m.id === sel) ?? null) : null;
  const bounds = (m: MarkupAnnotation) => {
    switch (m.kind) {
      case "arrow":
        return {
          x: Math.min(m.x1, m.x2),
          y: Math.min(m.y1, m.y2),
          w: Math.abs(m.x2 - m.x1),
          h: Math.abs(m.y2 - m.y1),
        };
      case "box":
        return { x: m.x, y: m.y, w: m.w, h: m.h };
      case "text": {
        const w = m.text.length * labelSize * 0.56 + 20;
        return { x: m.x, y: m.y - labelSize, w, h: labelSize * 2 };
      }
      default: {
        const cs = m.cells;
        const xs = cs.map(([c]) => c);
        const ys = cs.map(([, r]) => r);
        const c0 = Math.min(...xs);
        const r0 = Math.min(...ys);
        return {
          x: c0 * m.size,
          y: r0 * m.size,
          w: (Math.max(...xs) - c0 + 1) * m.size,
          h: (Math.max(...ys) - r0 + 1) * m.size,
        };
      }
    }
  };

  const markNode = (m: MarkupAnnotation) => {
    const isSel = m.id === sel;
    const hitProps = {
      "data-sm-mark": m.id,
      style: {
        cursor: current === "select" ? (isSel ? "move" : "pointer") : undefined,
      },
    };
    let body: React.ReactNode = null;
    if (m.kind === "arrow") {
      body = (
        <>
          <path
            d={`M${m.x1} ${m.y1}L${m.x2} ${m.y2}`}
            stroke="transparent"
            strokeWidth={Math.max(16, sw * 5)}
            {...hitProps}
          />
          <g pointerEvents="none">
            <ArrowMark
              a={m}
              sw={sw}
              colour={markColour}
              landing={landings[m.id] ?? null}
              motionSafe={motionSafe}
            />
          </g>
        </>
      );
    } else if (m.kind === "box") {
      body = (
        <rect
          x={m.x}
          y={m.y}
          width={m.w}
          height={m.h}
          rx={r2(Math.min(10, m.w / 4, m.h / 4))}
          strokeWidth={sw}
          {...hitProps}
          style={{
            ...hitProps.style,
            stroke: markColour,
            fill: wash(markColour, 9),
          }}
        />
      );
    } else if (m.kind === "text") {
      body = (
        <g {...hitProps}>
          <LabelMark m={m} size={labelSize} colour={markColour} />
        </g>
      );
    } else {
      body = (
        <g {...hitProps}>
          <RedactLayer
            r={m}
            phase={settling.has(m.id) ? "settle" : "rest"}
            clipId={`${idBase}-clip-${m.id}`}
            shotId={shotId}
            filterId={filterId}
            motionSafe={motionSafe}
          />
        </g>
      );
    }
    return (
      <motion.g key={m.id} style={isSel ? { x: offX, y: offY } : undefined}>
        {body}
      </motion.g>
    );
  };

  const selOutline = selMark
    ? (() => {
        const b = bounds(selMark);
        const pad = 6;
        return (
          <motion.g pointerEvents="none" style={{ x: offX, y: offY }}>
            <rect
              x={r2(b.x - pad)}
              y={r2(b.y - pad)}
              width={r2(b.w + pad * 2)}
              height={r2(b.h + pad * 2)}
              rx="4"
              fill="none"
              strokeWidth="1.5"
              strokeDasharray="5 4"
              className="stroke-foreground/60"
            />
            {[
              [b.x - pad, b.y - pad],
              [b.x + b.w + pad, b.y - pad],
              [b.x - pad, b.y + b.h + pad],
              [b.x + b.w + pad, b.y + b.h + pad],
            ].map(([x = 0, y = 0], i) => (
              <rect
                key={i}
                x={r2(x - 4)}
                y={r2(y - 4)}
                width="8"
                height="8"
                rx="2"
                className="fill-card stroke-foreground/70"
                strokeWidth="1.5"
              />
            ))}
          </motion.g>
        );
      })()
    : null;

  const toolBtn = (t: (typeof TOOLS)[number], vertical: boolean) => {
    const on = current === t.tool;
    return (
      <button
        key={t.tool}
        type="button"
        aria-pressed={on}
        aria-keyshortcuts={t.key}
        aria-label={`${t.name} (${t.key})`}
        title={`${t.name} · ${t.key}`}
        tabIndex={on ? 0 : -1}
        data-sm-tool={t.tool}
        disabled={locked}
        onClick={() => chooseTool(t.tool)}
        onKeyDown={(e) => {
          const fwd = vertical ? "ArrowDown" : "ArrowRight";
          const back = vertical ? "ArrowUp" : "ArrowLeft";
          const alt1 = vertical ? "ArrowRight" : "ArrowDown";
          const alt2 = vertical ? "ArrowLeft" : "ArrowUp";
          let d = 0;
          if (e.key === fwd || e.key === alt1) d = 1;
          else if (e.key === back || e.key === alt2) d = -1;
          else if (e.key === "Home") d = -99;
          else if (e.key === "End") d = 99;
          if (!d) return;
          e.preventDefault();
          const at = TOOLS.findIndex((x) => x.tool === t.tool);
          const next =
            TOOLS[
              d === -99
                ? 0
                : d === 99
                  ? TOOLS.length - 1
                  : (at + d + TOOLS.length) % TOOLS.length
            ];
          if (!next) return;
          chooseTool(next.tool);
          e.currentTarget.parentElement
            ?.querySelector<HTMLButtonElement>(`[data-sm-tool="${next.tool}"]`)
            ?.focus();
        }}
        className={cn(
          "relative inline-flex size-8 shrink-0 items-center justify-center rounded-2 transition-colors disabled:opacity-50 @min-[36rem]/screenshot-markup:size-9",
          on
            ? "text-foreground"
            : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
          FOCUS_IN,
        )}
      >
        {on ? (
          <motion.span
            layoutId={`${uid}-tool-${vertical ? "v" : "h"}`}
            aria-hidden
            className="absolute inset-0.5 rounded-[5px] border"
            style={{
              backgroundColor: wash(markColour, 12),
              borderColor: wash(markColour, 45),
            }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          />
        ) : null}
        <t.Icon
          aria-hidden
          className="relative size-4"
          style={on ? { color: markColour } : undefined}
        />
        <span
          aria-hidden
          className="absolute right-0.5 bottom-0 hidden font-mono text-[8px] leading-3 text-ink-3 @min-[36rem]/screenshot-markup:block"
        >
          {t.key}
        </span>
      </button>
    );
  };

  const historyBtn = cn(
    "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-40 aria-disabled:hover:bg-transparent",
    FOCUS_RING,
  );
  const history = (
    <>
      <button
        type="button"
        aria-label="Undo"
        aria-keyshortcuts="Meta+Z Control+Z"
        aria-disabled={locked || past.length === 0 || undefined}
        onClick={undo}
        className={historyBtn}
      >
        <Undo2 aria-hidden className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Redo"
        aria-keyshortcuts="Meta+Shift+Z Control+Shift+Z"
        aria-disabled={locked || future.length === 0 || undefined}
        onClick={redo}
        className={historyBtn}
      >
        <Redo2 aria-hidden className="size-4" />
      </button>
    </>
  );

  const vertical = toolPalette === "rail" && !narrow;
  const toolbar = (
    <div
      role="toolbar"
      aria-label="Markup tools"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      className={cn(
        "z-10 flex shrink-0 items-center gap-0.5 bg-card p-1.5 @min-[36rem]/screenshot-markup:gap-1",
        // Narrow: docked along the bottom, history beside the tools.
        "order-last justify-center border-t border-hairline",
        toolPalette === "rail" &&
          "@min-[36rem]/screenshot-markup:order-first @min-[36rem]/screenshot-markup:flex-col @min-[36rem]/screenshot-markup:justify-start @min-[36rem]/screenshot-markup:border-t-0 @min-[36rem]/screenshot-markup:border-r",
        toolPalette === "strip" &&
          "@min-[36rem]/screenshot-markup:order-first @min-[36rem]/screenshot-markup:justify-start @min-[36rem]/screenshot-markup:border-t-0 @min-[36rem]/screenshot-markup:border-b @min-[36rem]/screenshot-markup:px-3",
        toolPalette === "float" &&
          "@min-[36rem]/screenshot-markup:absolute @min-[36rem]/screenshot-markup:top-3 @min-[36rem]/screenshot-markup:left-1/2 @min-[36rem]/screenshot-markup:-translate-x-1/2 @min-[36rem]/screenshot-markup:rounded-full @min-[36rem]/screenshot-markup:border @min-[36rem]/screenshot-markup:border-hairline-strong @min-[36rem]/screenshot-markup:bg-popover @min-[36rem]/screenshot-markup:shadow-[0_8px_24px_color-mix(in_oklab,black_16%,transparent)]",
      )}
    >
      {TOOLS.map((t) => toolBtn(t, vertical))}
      <span className="ml-1.5 flex items-center gap-0.5 border-l border-hairline pl-1.5 @min-[36rem]/screenshot-markup:hidden">
        {history}
      </span>
    </div>
  );

  // Room the image may take: the editor's height less its chrome.
  const maxImageH = Math.max(120, height - 44 - 56 - 24);
  const maxImageW = Math.round((maxImageH * W) / H);

  const loader = (
    <div className="flex size-full flex-col items-center justify-center gap-3 bg-surface-1 p-6">
      <div
        aria-hidden
        className="grid w-3/5 grid-cols-[1fr_4fr] gap-2 opacity-70"
      >
        <span className="row-span-3 rounded-2 bg-surface-2" />
        <span className="h-6 rounded-2 bg-surface-2" />
        <span className="h-16 rounded-2 bg-surface-2" />
        <span className="h-10 rounded-2 bg-surface-2" />
      </div>
      <div
        role="progressbar"
        aria-label="Loading the screenshot"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={
          progress === undefined
            ? undefined
            : Math.round(clamp(progress, 0, 1) * 100)
        }
        className="relative h-1.5 w-3/5 overflow-hidden rounded-full bg-surface-2"
      >
        {progress === undefined ? (
          <motion.span
            className="absolute inset-y-0 w-1/3 rounded-full"
            style={{ backgroundColor: markColour }}
            animate={motionSafe ? { x: ["-100%", "300%"] } : { x: "100%" }}
            transition={
              motionSafe
                ? { duration: 1.1, ease: "linear", repeat: Infinity }
                : { duration: 0 }
            }
          />
        ) : (
          <motion.span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ backgroundColor: markColour }}
            initial={false}
            animate={{ width: `${Math.round(clamp(progress, 0, 1) * 100)}%` }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          />
        )}
      </div>
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums">
        {progress === undefined
          ? "Loading screenshot"
          : `Loading screenshot · ${Math.round(clamp(progress, 0, 1) * 100)}%`}
      </p>
    </div>
  );

  const cursorShown = kbd && !locked && typing === null;

  const stage = (
    <div
      className={cn(
        "relative flex flex-1 items-center-safe justify-center-safe overflow-hidden bg-surface-0 p-3",
        toolPalette === "float" && "@min-[36rem]/screenshot-markup:pt-16",
      )}
    >
      <div
        className="relative w-full"
        style={{ aspectRatio: `${W} / ${H}`, maxWidth: maxImageW }}
      >
        {status === "error" ? (
          <div className="flex size-full flex-col items-center justify-center gap-3 rounded-3 border border-hairline bg-surface-1 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The screenshot did not load.
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                  FOCUS_RING,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Try again
              </button>
            ) : null}
          </div>
        ) : status === "loading" ? (
          <div className="size-full overflow-hidden rounded-3 border border-hairline">
            {loader}
          </div>
        ) : (
          <div
            ref={(node) => {
              boxRef.current = node;
              stageRef.current = node;
            }}
            role="group"
            aria-roledescription="markup canvas"
            aria-label={image.alt}
            aria-describedby={hintId}
            tabIndex={0}
            onKeyDown={onStageKey}
            onPointerDown={(e) => {
              const hit = (e.target as Element).closest?.("[data-sm-mark]");
              downTarget.current = hit?.getAttribute("data-sm-mark") ?? null;
              drag.onPointerDown(e);
            }}
            onPointerMove={drag.onPointerMove}
            onPointerUp={drag.onPointerUp}
            onPointerCancel={drag.onPointerCancel}
            onLostPointerCapture={drag.onLostPointerCapture}
            onBlur={() => setKbd(false)}
            className={cn(
              "absolute inset-0 touch-none overflow-hidden rounded-2 shadow-[0_0_0_1px_var(--hairline-strong),0_10px_30px_color-mix(in_oklab,black_14%,transparent)] select-none",
              current === "select" ? "cursor-default" : "cursor-crosshair",
              locked && "cursor-not-allowed",
              FOCUS_RING,
            )}
          >
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="xMidYMid meet"
              className="block size-full"
            >
              <defs>
                <filter
                  id={filterId}
                  x="0"
                  y="0"
                  width={W}
                  height={H}
                  filterUnits="userSpaceOnUse"
                  primitiveUnits="userSpaceOnUse"
                >
                  <feGaussianBlur
                    in="SourceGraphic"
                    stdDeviation={r2(cell / 3)}
                    result="soft"
                  />
                  <feFlood
                    x={cell / 2 - 1}
                    y={cell / 2 - 1}
                    width="2"
                    height="2"
                  />
                  <feComposite width={cell} height={cell} />
                  <feTile result="dots" />
                  <feComposite in="soft" in2="dots" operator="in" />
                  <feMorphology operator="dilate" radius={cell / 2 - 1} />
                </filter>
              </defs>
              <g id={shotId}>
                {image.src ? (
                  <image
                    href={image.src}
                    width={W}
                    height={H}
                    preserveAspectRatio="xMidYMid slice"
                  />
                ) : (
                  (image.content ?? null)
                )}
              </g>

              {marks.map(markNode)}

              {draft?.kind === "redact" ? (
                <RedactLayer
                  r={{
                    id: "draft",
                    kind: "redact",
                    size: cell,
                    cells: draft.cells,
                  }}
                  phase="live"
                  clipId={`${idBase}-clip-draft`}
                  shotId={shotId}
                  filterId={filterId}
                  motionSafe={motionSafe}
                />
              ) : null}
              {draft?.kind === "box" ? (
                <g pointerEvents="none" style={{ color: markColour }}>
                  <motion.path
                    d={boxDraft}
                    stroke="currentColor"
                    fill="currentColor"
                    fillOpacity={0.05}
                    strokeWidth={sw}
                    strokeDasharray={`${r2(sw * 3)} ${r2(sw * 2)}`}
                  />
                </g>
              ) : null}
              {draft?.kind === "arrow" ? (
                <g pointerEvents="none" style={{ color: markColour }}>
                  <motion.path
                    d={arrowDraft}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={sw}
                    strokeLinecap="round"
                  />
                  <motion.path d={arrowDraftHead} fill="currentColor" />
                </g>
              ) : null}

              {selOutline}

              {cursorShown ? (
                <motion.g pointerEvents="none" style={{ x: curX, y: curY }}>
                  <circle
                    r={current === "redact" ? brush : 9}
                    fill="none"
                    strokeWidth="1.5"
                    className="stroke-foreground"
                  />
                  <path
                    d="M-16 0H-5M5 0H16M0 -16V-5M0 5V16"
                    strokeWidth="1.5"
                    className="stroke-foreground"
                  />
                </motion.g>
              ) : null}
            </svg>

            {typing ? (
              <div
                className="absolute z-20 -translate-y-1/2"
                style={{
                  left: `${r2((typing.x / W) * 100)}%`,
                  top: `${r2((typing.y / H) * 100)}%`,
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <label htmlFor={`${uid}-label`} className="sr-only">
                  Label text
                </label>
                <input
                  id={`${uid}-label`}
                  ref={(node) => node?.focus({ preventScroll: true })}
                  value={typing.value}
                  placeholder="Say what this is"
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    setTyping((t) => (t ? { ...t, value } : t));
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitText();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setTyping(null);
                      stageRef.current?.focus({ preventScroll: true });
                    }
                  }}
                  onBlur={commitText}
                  className="h-8 w-48 rounded-full border-2 bg-card px-3 text-[13px] font-medium text-foreground shadow-md outline-none placeholder:text-ink-3"
                  style={{ borderColor: markColour }}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );

  const redactions = marks.filter((m) => m.kind === "redact").length;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      onKeyDown={onRootKey}
      className={cn(
        "@container/screenshot-markup relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ maxHeight: height }}
    >
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-hairline pr-1.5 pl-3">
        <div className="min-w-0">
          <p
            id={titleId}
            className="truncate text-[13px] leading-5 font-semibold"
          >
            {title}
          </p>
          <p className="hidden truncate text-[11px] leading-4 text-ink-3 tabular-nums @min-[30rem]/screenshot-markup:block">
            {plural(marks.length, "mark", "marks")}
            {redactions > 0
              ? ` · ${plural(redactions, "redaction", "redactions")}`
              : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="hidden items-center gap-0.5 @min-[36rem]/screenshot-markup:flex">
            {history}
          </span>
          <button
            type="button"
            onClick={runExport}
            aria-disabled={locked || exporting === "busy" || undefined}
            aria-busy={exporting === "busy" || undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90",
              (locked || exporting === "busy") && "opacity-60",
              FOCUS_RING,
            )}
          >
            {exporting === "done" ? (
              <Check aria-hidden className="size-3.5" />
            ) : (
              <Download aria-hidden className="size-3.5" />
            )}
            {exporting === "busy"
              ? "Exporting"
              : exporting === "done"
                ? "Exported"
                : exporting === "failed"
                  ? "Retry export"
                  : "Export"}
          </button>
        </div>
      </header>

      <p id={hintId} className="sr-only">
        Tools: V select, A arrow, B box, T text, R redact. Arrow keys move the
        cursor; Enter starts a mark there, arrows extend it and Enter ends it.
        Left and right brackets select marks; arrows nudge the selected mark,
        Shift for ten pixels; Delete removes it; Escape cancels.
      </p>

      <div
        className={cn(
          "relative flex flex-1 flex-col overflow-hidden",
          toolPalette === "rail" && "@min-[36rem]/screenshot-markup:flex-row",
        )}
      >
        {toolbar}
        {stage}
      </div>

      <AnimatePresence>
        {exporting === "done" ? (
          <motion.p
            key="done"
            aria-hidden
            className="pointer-events-none absolute right-3 bottom-3 z-30 inline-flex h-7 items-center gap-1.5 rounded-full border border-hairline bg-popover px-3 text-[11px] font-medium text-foreground shadow-sm @max-[36rem]/screenshot-markup:bottom-16"
            initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              opacity: { duration: durations.fast, ease: easings.enter },
              y: motionSafe ? springs.recoil : { duration: 0 },
            }}
          >
            <Check className="size-3.5 text-success" />
            Exported
          </motion.p>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
