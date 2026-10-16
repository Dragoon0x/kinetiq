"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ArrowUpRight,
  Brush,
  FileText,
  Paperclip,
  PenLine,
  Redo2,
  SendHorizontal,
  Square,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

/** A point in the pad's 400 × 300 drawing space. */
export type SketchPoint = [number, number];

export type SketchStroke =
  | {
      id: string;
      kind: "pen";
      /** Any CSS colour. */
      color: string;
      width: number;
      points: SketchPoint[];
    }
  | {
      id: string;
      kind: "box" | "arrow";
      color: string;
      width: number;
      from: SketchPoint;
      to: SketchPoint;
    };

export type SketchTool = "pen" | "box" | "arrow";
export type SketchGrid = "dots" | "lines" | "blank";

export type PromptAttachment = {
  id: string;
  name: string;
  /** Shown after the name: "1.2 MB". */
  size?: string;
};

export type ScribbleMessage = {
  id: string;
  role: "assistant" | "you";
  text: string;
  /** A sketch sent with the message, drawn as a thumbnail. */
  sketch?: SketchStroke[];
};

export type ScribbleSubmission = {
  text: string;
  /** The docked sketch, or null when there is none. */
  sketch: SketchStroke[] | null;
  attachments: PromptAttachment[];
};

export type ScribblePromptProps = {
  /** Controlled text. */
  value?: string;
  /** Initial text when uncontrolled. @default defaultScribbleText */
  defaultValue?: string;
  /** Fires from every keystroke with the new text. */
  onValueChange?: (text: string) => void;
  /** Controlled strokes. */
  strokes?: SketchStroke[];
  /** Initial strokes when uncontrolled. @default defaultSketchStrokes */
  defaultStrokes?: SketchStroke[];
  /** Fires from every stroke, undo, redo and clear with the whole list. */
  onStrokesChange?: (strokes: SketchStroke[]) => void;
  /** A stroke was finished, by pointer, pen or keyboard. */
  onStrokeEnd?: (stroke: SketchStroke, strokes: SketchStroke[]) => void;
  /** Controlled pad. */
  open?: boolean;
  /** Initial pad state when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires from the button, chip, key or drag that opened or closed the pad. */
  onOpenChange?: (open: boolean) => void;
  /** The sketch was docked into the field (Attach, or closing a pad with marks on it). */
  onAttachSketch?: (strokes: SketchStroke[]) => void;
  /** Controlled file attachments. */
  attachments?: PromptAttachment[];
  /** Initial attachments when uncontrolled. @default defaultPromptAttachments */
  defaultAttachments?: PromptAttachment[];
  /** Files were picked with Attach file. */
  onAttachFiles?: (files: File[]) => void;
  /** An attachment chip's remove button was pressed. */
  onRemoveAttachment?: (id: string) => void;
  /** Send was pressed (or Enter) with text, a sketch or a file. */
  onSubmit?: (submission: ScribbleSubmission) => void;
  /** Controlled thread above the composer. */
  messages?: ScribbleMessage[];
  /** Initial thread when uncontrolled; a send appends to it. @default defaultScribbleMessages */
  defaultMessages?: ScribbleMessage[];
  /** Pen colours, as CSS colours. @default ink, accent, warn and success tokens */
  colors?: string[];
  /** Stroke width for new marks, in drawing units (the pad is 400 wide). @default 2.5 */
  penWidth?: number;
  /** The pad's paper. @default "dots" */
  gridStyle?: SketchGrid;
  /** The active tool, the crosshair, Attach, Send and the sketch chip: any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Who answers, in the header. @default "Fernworks Studio" */
  assistant?: string;
  /** The text field's placeholder. @default "Describe the change, or sketch it" */
  placeholder?: string;
  /** The surface's height in px. @default 540 */
  height?: number;
  /** Nothing can be typed, drawn or sent. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const W = 400;
const H = 300;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** A loose, hand-drawn ring: a circle with a seeded wobble that overshoots its start. */
const ring = (
  cx: number,
  cy: number,
  r: number,
  seed: number,
): SketchPoint[] => {
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out: SketchPoint[] = [];
  for (let i = 0; i <= 22; i++) {
    const a = (i / 20) * Math.PI * 2 - Math.PI / 2;
    const rr = r * (0.94 + rnd() * 0.12);
    out.push([r1(cx + rr * Math.cos(a)), r1(cy + rr * Math.sin(a))]);
  }
  return out;
};

const wave = (x0: number, x1: number, y: number): SketchPoint[] => {
  const out: SketchPoint[] = [];
  for (let x = x0, i = 0; x <= x1; x += 10, i++)
    out.push([x, i % 2 ? y - 4 : y + 4]);
  return out;
};

export const defaultScribbleColors = [
  "var(--foreground)",
  "var(--accent-bright)",
  "var(--warn)",
  "var(--success)",
];

/** The Lisbon office floor: walls, the reception desk, the way in, two pods by the window. */
export const defaultSketchStrokes: SketchStroke[] = [
  {
    id: "walls",
    kind: "box",
    color: "var(--foreground)",
    width: 2.5,
    from: [26, 26],
    to: [374, 274],
  },
  {
    id: "desk",
    kind: "box",
    color: "var(--accent-bright)",
    width: 2.5,
    from: [54, 196],
    to: [150, 236],
  },
  {
    id: "way-in",
    kind: "arrow",
    color: "var(--accent-bright)",
    width: 2.5,
    from: [160, 222],
    to: [238, 262],
  },
  {
    id: "pod-a",
    kind: "pen",
    color: "var(--success)",
    width: 2.5,
    points: ring(252, 84, 26, 7),
  },
  {
    id: "pod-b",
    kind: "pen",
    color: "var(--success)",
    width: 2.5,
    points: ring(326, 84, 26, 19),
  },
  {
    id: "window",
    kind: "pen",
    color: "var(--warn)",
    width: 2.5,
    points: wave(206, 360, 40),
  },
];

export const defaultPromptAttachments: PromptAttachment[] = [
  { id: "plan", name: "lisbon-floor-v3.pdf", size: "1.2 MB" },
];

export const defaultScribbleMessages: ScribbleMessage[] = [
  {
    id: "m1",
    role: "assistant",
    text: "Here's the Lisbon floor as it stands. Tell me what to move, and sketch it if that's quicker.",
  },
];

export const defaultScribbleText =
  "Turn the reception desk to face the way in, and put both meeting pods along the window wall like this.";

/* ----------------------------------------------------------------------- */
/*                                 Drawing                                  */
/* ----------------------------------------------------------------------- */

/** Pen strokes are smoothed through the midpoints, so a quick scrawl reads as ink. */
const penPath = (points: SketchPoint[]) => {
  const [first, ...rest] = points;
  if (!first) return "";
  if (rest.length === 0) return `M ${first[0]} ${first[1]} l 0.01 0`;
  let d = `M ${first[0]} ${first[1]}`;
  for (let i = 0; i < rest.length - 1; i++) {
    const p = rest[i] as SketchPoint;
    const q = rest[i + 1] as SketchPoint;
    d += ` Q ${p[0]} ${p[1]} ${r1((p[0] + q[0]) / 2)} ${r1((p[1] + q[1]) / 2)}`;
  }
  const last = rest[rest.length - 1] as SketchPoint;
  return `${d} L ${last[0]} ${last[1]}`;
};

const boxPath = (a: SketchPoint, b: SketchPoint) => {
  const x = Math.min(a[0], b[0]);
  const y = Math.min(a[1], b[1]);
  const w = Math.abs(a[0] - b[0]);
  const h = Math.abs(a[1] - b[1]);
  return `M ${r1(x)} ${r1(y)} h ${r1(w)} v ${r1(h)} h ${r1(-w)} Z`;
};

const arrowPath = (a: SketchPoint, b: SketchPoint, width: number) => {
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const len = Math.min(16, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.45) + width;
  const h1: SketchPoint = [
    r1(b[0] - len * Math.cos(angle - 0.5)),
    r1(b[1] - len * Math.sin(angle - 0.5)),
  ];
  const h2: SketchPoint = [
    r1(b[0] - len * Math.cos(angle + 0.5)),
    r1(b[1] - len * Math.sin(angle + 0.5)),
  ];
  return `M ${a[0]} ${a[1]} L ${b[0]} ${b[1]} M ${h1[0]} ${h1[1]} L ${b[0]} ${b[1]} L ${h2[0]} ${h2[1]}`;
};

const strokePath = (s: SketchStroke) =>
  s.kind === "pen"
    ? penPath(s.points)
    : s.kind === "box"
      ? boxPath(s.from, s.to)
      : arrowPath(s.from, s.to, s.width);

function Strokes({
  strokes,
  thin = false,
}: {
  strokes: SketchStroke[];
  /** Hairlines that keep their width at any size: the thumbnail. */
  thin?: boolean;
}) {
  return (
    <>
      {strokes.map((s) => (
        <path
          key={s.id}
          d={strokePath(s)}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={thin ? 1.25 : s.width}
          vectorEffect={thin ? "non-scaling-stroke" : undefined}
          style={{ stroke: s.color }}
        />
      ))}
    </>
  );
}

function Paper({ grid, id }: { grid: SketchGrid; id: string }) {
  if (grid === "blank") return null;
  return (
    <>
      <defs>
        <pattern id={id} width={20} height={20} patternUnits="userSpaceOnUse">
          {grid === "dots" ? (
            <circle cx={10} cy={10} r={0.9} className="fill-ink-3/45" />
          ) : (
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              strokeWidth={0.6}
              className="stroke-ink-3/25"
            />
          )}
        </pattern>
      </defs>
      <rect width={W} height={H} fill={`url(#${id})`} />
    </>
  );
}

type Rect = { left: number; top: number; width: number; height: number };
type Op =
  | { type: "add"; stroke: SketchStroke }
  | { type: "clear"; strokes: SketchStroke[] };

const TOOLS: { id: SketchTool; label: string; key: string }[] = [
  { id: "pen", label: "Pen", key: "P" },
  { id: "box", label: "Box", key: "B" },
  { id: "arrow", label: "Arrow", key: "A" },
];

const ToolIcon = ({ tool }: { tool: SketchTool }) =>
  tool === "pen" ? (
    <PenLine aria-hidden className="size-3.5" />
  ) : tool === "box" ? (
    <Square aria-hidden className="size-3.5" />
  ) : (
    <ArrowUpRight aria-hidden className="size-3.5" />
  );

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * A prompt you can draw in. The sketch pad opens beside the text field (as a
 * sheet on a phone), and boxes, arrows and loose pen marks drawn on it — by
 * pointer, by pen with its pressure, or with the arrow keys — become part of
 * the request. Every finished mark lands with a flick of its weight on
 * `springs.flick`, and Cmd or Ctrl+Z takes it back.
 *
 * Attaching docks the drawing: the paper lifts off the pad and shrinks on
 * `springs.glide` into a thumbnail chip in the field, its strokes still
 * visible, while the pad's frame is gone and the chip's label fades in once
 * it lands. Pressing the chip reverses it — the drawing grows back out of the
 * chip into the pad, ready to edit. An empty pad keeps Attach disabled and
 * says why. Under reduced motion the pad and the chip cross-fade and marks
 * land without the flick.
 */
export function ScribblePrompt({
  value,
  defaultValue = defaultScribbleText,
  onValueChange,
  strokes,
  defaultStrokes = defaultSketchStrokes,
  onStrokesChange,
  onStrokeEnd,
  open,
  defaultOpen = false,
  onOpenChange,
  onAttachSketch,
  attachments,
  defaultAttachments = defaultPromptAttachments,
  onAttachFiles,
  onRemoveAttachment,
  onSubmit,
  messages,
  defaultMessages = defaultScribbleMessages,
  colors = defaultScribbleColors,
  penWidth = 2.5,
  gridStyle = "dots",
  accent = "var(--accent-bright)",
  assistant = "Fernworks Studio",
  placeholder = "Describe the change, or sketch it",
  height = 540,
  disabled = false,
  className,
}: ScribblePromptProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const padHelpId = `${uid}-pad-help`;
  const patternId = `${uid.replace(/[^a-zA-Z0-9_-]/g, "")}-paper`;

  /* ----------------------------- values ----------------------------- */

  const [ownText, setOwnText] = React.useState(defaultValue);
  const text = value ?? ownText;
  const setText = (next: string) => {
    if (value === undefined) setOwnText(next);
    onValueChange?.(next);
  };

  const [ownStrokes, setOwnStrokes] =
    React.useState<SketchStroke[]>(defaultStrokes);
  const marks = strokes ?? ownStrokes;
  const marksRef = React.useRef(marks);
  React.useEffect(() => {
    marksRef.current = marks;
  }, [marks]);
  const setMarks = (next: SketchStroke[]) => {
    marksRef.current = next;
    if (strokes === undefined) setOwnStrokes(next);
    onStrokesChange?.(next);
  };

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const isOpen = open ?? ownOpen;
  const setOpen = (next: boolean) => {
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  const [ownFiles, setOwnFiles] = React.useState(defaultAttachments);
  const files = attachments ?? ownFiles;

  const [ownMessages, setOwnMessages] = React.useState(defaultMessages);
  const thread = messages ?? ownMessages;

  /* ------------------------------ tools ----------------------------- */

  const [tool, setTool] = React.useState<SketchTool>("pen");
  const [colorIndex, setColorIndex] = React.useState(1);
  const color =
    colors[Math.min(colorIndex, colors.length - 1)] ?? "var(--foreground)";
  const [undoStack, setUndoStack] = React.useState<Op[]>([]);
  const [redoStack, setRedoStack] = React.useState<Op[]>([]);
  const [announcement, setAnnouncement] = React.useState("");
  const [landed, setLanded] = React.useState<string | null>(null);
  const counter = React.useRef(0);

  const count = (n: number) => `${n} ${n === 1 ? "mark" : "marks"}`;

  const addStroke = (stroke: SketchStroke) => {
    const next = [...marksRef.current, stroke];
    setMarks(next);
    setUndoStack((u) => [...u, { type: "add", stroke }]);
    setRedoStack([]);
    setLanded(stroke.id);
    onStrokeEnd?.(stroke, next);
    const name =
      stroke.kind === "pen" ? "Mark" : stroke.kind === "box" ? "Box" : "Arrow";
    setAnnouncement(`${name} placed. ${count(next.length)}.`);
  };

  const newId = (kind: string) => {
    counter.current += 1;
    return `${kind}-${counter.current}-${marksRef.current.length}`;
  };

  const undo = () => {
    const op = undoStack[undoStack.length - 1];
    if (!op) {
      // Strokes that arrived with the pad can still be taken back one by one.
      const last = marksRef.current[marksRef.current.length - 1];
      if (!last) return;
      setMarks(marksRef.current.slice(0, -1));
      setRedoStack((r) => [...r, { type: "add", stroke: last }]);
      setAnnouncement(`Undone. ${count(marksRef.current.length)}.`);
      return;
    }
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, op]);
    if (op.type === "add")
      setMarks(marksRef.current.filter((s) => s.id !== op.stroke.id));
    else setMarks(op.strokes);
    setAnnouncement(`Undone. ${count(marksRef.current.length)}.`);
  };

  const redo = () => {
    const op = redoStack[redoStack.length - 1];
    if (!op) return;
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, op]);
    if (op.type === "add") setMarks([...marksRef.current, op.stroke]);
    else setMarks([]);
    setAnnouncement(`Redone. ${count(marksRef.current.length)}.`);
  };

  const clear = () => {
    if (!marksRef.current.length) return;
    setUndoStack((u) => [...u, { type: "clear", strokes: marksRef.current }]);
    setRedoStack([]);
    setMarks([]);
    setAnnouncement("Pad cleared. Undo brings it back.");
  };

  /* ------------------------------ layout ---------------------------- */

  const rootRef = React.useRef<HTMLElement | null>(null);
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 608));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ------------------------------ flight ---------------------------- */

  const drawRef = React.useRef<SVGSVGElement | null>(null);
  const thumbRef = React.useRef<HTMLSpanElement | null>(null);
  const sketchButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const chipRef = React.useRef<HTMLButtonElement | null>(null);
  // The flyer is always laid out at the pad's full size and scaled down, so
  // the strokes are never a stretched little raster. Everything about a
  // flight is a motion value: it starts from a layout effect, the moment the
  // pad and the chip have swapped, without another render.
  const fl = useMotionValue(0);
  const ft = useMotionValue(0);
  const fw = useMotionValue(0);
  const fh = useMotionValue(0);
  const fx = useMotionValue(0);
  const fy = useMotionValue(0);
  const fs = useMotionValue(1);
  const flyerOpacity = useMotionValue(0);
  const thumbOpacity = useMotionValue(1);
  const labelOpacity = useMotionValue(1);
  const padInkOpacity = useMotionValue(1);
  const padRootRef = React.useRef<HTMLDivElement | null>(null);
  const userOpened = React.useRef(false);
  const chipAtOpen = React.useRef<Rect | null>(null);
  const flying = React.useRef<AnimationPlaybackControls[]>([]);

  const rectOf = (el: Element | null): Rect | null => {
    const root = rootRef.current;
    if (!el || !root || !el.isConnected) return null;
    const a = el.getBoundingClientRect();
    const b = root.getBoundingClientRect();
    return {
      left: a.left - b.left,
      top: a.top - b.top,
      width: a.width,
      height: a.height,
    };
  };

  /** Close the pad; a drawing on it docks into the field as a chip. */
  const dock = (attach: boolean) => {
    const current = marksRef.current;
    if (current.length && (attach || isOpen)) {
      onAttachSketch?.(current);
      setAnnouncement(`Sketch attached, ${count(current.length)}.`);
    }
    const hadFocus = !!padRootRef.current?.contains(document.activeElement);
    setOpen(false);
    // The control that closed the pad is gone with it: focus lands on the
    // chip that now holds the drawing, or back on Sketch.
    if (hadFocus)
      window.requestAnimationFrame(() =>
        (current.length ? chipRef.current : sketchButtonRef.current)?.focus(),
      );
  };

  /** Open the pad, growing the docked drawing back out of its chip. */
  const reopen = () => {
    if (disabled) return;
    chipAtOpen.current = rectOf(thumbRef.current);
    userOpened.current = true;
    setOpen(true);
  };

  const wasOpen = React.useRef(isOpen);
  const flight = React.useRef({ motionSafe, narrow, count: marks.length });
  React.useEffect(() => {
    flight.current = { motionSafe, narrow, count: marks.length };
  });
  React.useLayoutEffect(() => {
    if (wasOpen.current === isOpen) return;
    wasOpen.current = isOpen;
    for (const c of flying.current) c.stop();
    const { motionSafe: rich, narrow: sheet, count: n } = flight.current;
    const chip = isOpen ? chipAtOpen.current : rectOf(thumbRef.current);
    // The leaving pad is popped out of the layout but still on screen.
    const pad = rectOf(drawRef.current);
    chipAtOpen.current = null;
    const land = () => {
      flyerOpacity.jump(0);
      thumbOpacity.jump(1);
      padInkOpacity.jump(1);
      animate(labelOpacity, 1, {
        duration: durations.base,
        ease: easings.enter,
      });
    };
    if (!rich || !n || !chip || !pad || pad.width === 0 || (isOpen && sheet)) {
      land();
      return;
    }
    fl.jump(r1(pad.left));
    ft.jump(r1(pad.top));
    fw.jump(r1(pad.width));
    fh.jump(r1(pad.height));
    const small = {
      x: r1(chip.left - pad.left),
      y: r1(chip.top - pad.top),
      s: Number((chip.width / pad.width).toFixed(4)),
    };
    const from = isOpen ? small : { x: 0, y: 0, s: 1 };
    const to = isOpen ? { x: 0, y: 0, s: 1 } : small;
    fx.jump(from.x);
    fy.jump(from.y);
    fs.jump(from.s);
    flyerOpacity.jump(1);
    thumbOpacity.jump(0);
    labelOpacity.jump(0);
    padInkOpacity.jump(0);
    flying.current = [
      animate(fx, to.x, springs.glide),
      animate(fy, to.y, springs.glide),
      animate(fs, to.s, { ...springs.glide, onComplete: land }),
    ];
    // A flight a re-run interrupts must finish, not freeze: the cleanup
    // lands everything where it belongs.
    return () => {
      for (const c of flying.current) c.stop();
      land();
    };
    // Only an open or a close starts a flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  React.useEffect(() => () => flying.current.forEach((c) => c.stop()), []);

  /* ------------------------------ drawing --------------------------- */

  const live = React.useRef<{
    kind: SketchTool;
    points: SketchPoint[];
    from: SketchPoint;
    width: number;
  } | null>(null);
  const liveD = useMotionValue("");
  const [liveColor, setLiveColor] = React.useState(color);
  const [liveWidth, setLiveWidth] = React.useState(penWidth);

  const toPad = (x: number, y: number): SketchPoint => {
    const el = drawRef.current;
    if (!el) return [0, 0];
    const r = el.getBoundingClientRect();
    return [
      r1(Math.min(W, Math.max(0, ((x - r.left) / r.width) * W))),
      r1(Math.min(H, Math.max(0, ((y - r.top) / r.height) * H))),
    ];
  };

  const drawLive = () => {
    const l = live.current;
    if (!l) {
      liveD.set("");
      return;
    }
    const last = l.points[l.points.length - 1] ?? l.from;
    liveD.set(
      l.kind === "pen"
        ? penPath(l.points)
        : l.kind === "box"
          ? boxPath(l.from, last)
          : arrowPath(l.from, last, l.width),
    );
  };

  const pressureWidth = (event: PointerEvent | React.PointerEvent) =>
    event.pointerType === "pen" && event.pressure > 0
      ? r1(penWidth * (0.55 + event.pressure * 0.9))
      : penWidth;

  const drawDrag = useDrag({
    threshold: 2,
    disabled: disabled || !isOpen,
    onStart: ({ point, offset, event }) => {
      const start = toPad(point.x - offset.x, point.y - offset.y);
      live.current = {
        kind: tool,
        points: [start],
        from: start,
        width: pressureWidth(event),
      };
      setLiveColor(color);
      setLiveWidth(live.current.width);
    },
    onMove: ({ point }) => {
      const l = live.current;
      if (!l) return;
      const p = toPad(point.x, point.y);
      const prev = l.points[l.points.length - 1];
      if (l.kind === "pen") {
        if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) >= 1.5)
          l.points.push(p);
      } else {
        l.points = [l.from, p];
      }
      drawLive();
    },
    onEnd: () => {
      const l = live.current;
      live.current = null;
      drawLive();
      if (!l) return;
      const end = l.points[l.points.length - 1] ?? l.from;
      if (l.kind === "pen") {
        addStroke({
          id: newId("pen"),
          kind: "pen",
          color,
          width: l.width,
          points: l.points,
        });
      } else if (Math.hypot(end[0] - l.from[0], end[1] - l.from[1]) > 4) {
        addStroke({
          id: newId(l.kind),
          kind: l.kind,
          color,
          width: l.width,
          from: l.from,
          to: end,
        });
      }
    },
    onCancel: () => {
      live.current = null;
      drawLive();
    },
    onTap: (event) => {
      if (tool !== "pen") return;
      const p = toPad(event.clientX, event.clientY);
      addStroke({
        id: newId("dot"),
        kind: "pen",
        color,
        width: pressureWidth(event),
        points: [p],
      });
    },
  });

  /* ---------------------------- keyboard pad ------------------------ */

  const [cursor, setCursor] = React.useState<SketchPoint>([W / 2, H / 2]);
  const [anchor, setAnchor] = React.useState<SketchPoint[] | null>(null);
  const [padFocus, setPadFocus] = React.useState(false);

  const onPadKey = (event: React.KeyboardEvent<SVGSVGElement>) => {
    // Any key on the pad shows the crosshair, however the pad was focused.
    if (!padFocus) setPadFocus(true);
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    const step = event.shiftKey ? 20 : 4;
    const move: Record<string, SketchPoint> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = move[event.key];
    if (delta) {
      event.preventDefault();
      setCursor(([x, y]) => [
        Math.min(W, Math.max(0, x + delta[0])),
        Math.min(H, Math.max(0, y + delta[1])),
      ]);
      return;
    }
    const k = event.key.toLowerCase();
    const picked = TOOLS.find((t) => t.key.toLowerCase() === k);
    if (picked && !mod) {
      event.preventDefault();
      setTool(picked.id);
      setAnchor(null);
      setAnnouncement(`${picked.label} tool.`);
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      const here: SketchPoint = [cursor[0], cursor[1]];
      if (tool === "pen") {
        if (event.key === "Enter" && anchor) {
          addStroke({
            id: newId("pen"),
            kind: "pen",
            color,
            width: penWidth,
            points: [...anchor, here],
          });
          setAnchor(null);
        } else if (anchor) {
          setAnchor([...anchor, here]);
          setAnnouncement(
            `Point ${anchor.length + 1}. Enter finishes the line.`,
          );
        } else if (event.key === "Enter") {
          addStroke({
            id: newId("dot"),
            kind: "pen",
            color,
            width: penWidth,
            points: [here],
          });
        } else {
          setAnchor([here]);
          setAnnouncement(
            "Line started. Move, then Space adds a point, Enter finishes.",
          );
        }
        return;
      }
      if (!anchor) {
        setAnchor([here]);
        setAnnouncement(
          `${tool === "box" ? "Box" : "Arrow"} anchored. Move, then press again to place it.`,
        );
        return;
      }
      const from = anchor[0] ?? here;
      if (Math.hypot(here[0] - from[0], here[1] - from[1]) > 4)
        addStroke({
          id: newId(tool),
          kind: tool,
          color,
          width: penWidth,
          from,
          to: here,
        });
      setAnchor(null);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (anchor) {
        setAnchor(null);
        setAnnouncement("Cancelled.");
      } else {
        dock(false);
      }
    }
  };

  const preview = (() => {
    if (!anchor || !padFocus) return "";
    const from = anchor[0];
    if (!from) return "";
    if (tool === "pen") return penPath([...anchor, cursor]);
    return tool === "box"
      ? boxPath(from, cursor)
      : arrowPath(from, cursor, penWidth);
  })();

  /* ------------------------------- sheet ---------------------------- */

  const sheetY = useMotionValue(0);
  const sheetDrag = useDrag({
    axis: "y",
    threshold: 4,
    disabled: !narrow || !isOpen,
    onMove: ({ offset }) =>
      sheetY.set(offset.y < 0 ? rubberband(offset.y, 120) : offset.y),
    onEnd: ({ offset, velocity }) => {
      if (project(offset.y, velocity.y, 0.99) > 96) {
        sheetY.jump(0);
        dock(false);
      } else {
        animate(
          sheetY,
          0,
          motionSafe
            ? { ...springs.glide, velocity: velocity.y }
            : { duration: 0 },
        );
      }
    },
    onCancel: () => {
      animate(sheetY, 0, springs.glide);
    },
  });

  // Focus moves into the pad when it opens, and the sheet traps it.
  React.useEffect(() => {
    if (!isOpen || !userOpened.current) return;
    const raf = window.requestAnimationFrame(() => {
      userOpened.current = false;
      drawRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isOpen]);

  /* ------------------------------- send ----------------------------- */

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  React.useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(120, el.scrollHeight)}px`;
  }, [text, isOpen]);

  const docked = !isOpen && marks.length > 0;
  const canSend =
    !disabled && (text.trim().length > 0 || docked || files.length > 0);

  const send = () => {
    if (!canSend) return;
    const submission: ScribbleSubmission = {
      text: text.trim(),
      sketch: docked ? marks : null,
      attachments: files,
    };
    onSubmit?.(submission);
    if (messages === undefined) {
      setOwnMessages((m) => [
        ...m,
        {
          id: `you-${m.length}`,
          role: "you",
          text: submission.text,
          ...(submission.sketch ? { sketch: submission.sketch } : {}),
        },
      ]);
    }
    setText("");
    if (strokes === undefined) setOwnStrokes([]);
    if (attachments === undefined) setOwnFiles([]);
    setUndoStack([]);
    setRedoStack([]);
    setAnnouncement(submission.sketch ? "Sent with the sketch." : "Sent.");
  };

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length]);

  /* ------------------------------ styles ---------------------------- */

  const vars = {
    "--sp-accent": accent,
    "--sp-wash": `color-mix(in oklab, ${accent} 12%, transparent)`,
    "--sp-line": `color-mix(in oklab, ${accent} 50%, transparent)`,
    "--sp-solid": `oklch(from ${accent} 0.55 c h)`,
  } as React.CSSProperties;
  const focusRing =
    "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
  const iconButton = cn(
    "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-foreground disabled:opacity-40",
    focusRing,
  );

  /* ------------------------------- pad ------------------------------ */

  const pad = (
    <motion.div
      key="pad"
      role={narrow ? "dialog" : "group"}
      aria-modal={narrow || undefined}
      aria-label="Sketch pad"
      initial={
        motionSafe
          ? narrow
            ? { y: "100%" }
            : { opacity: 0, scale: 0.97 }
          : { opacity: 0 }
      }
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={
        narrow && motionSafe
          ? { y: "100%", transition: exitFor(durations.slow) }
          : { opacity: 0, transition: { duration: 0 } }
      }
      transition={
        motionSafe
          ? { ...springs.glide, opacity: { duration: durations.base } }
          : { duration: durations.fast }
      }
      ref={padRootRef}
      style={narrow ? { y: sheetY } : { originX: 0, originY: 1 }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          dock(false);
          return;
        }
        if (!narrow || event.key !== "Tab") return;
        const nodes = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            "button:not([disabled]), [tabindex='0'], svg[tabindex]",
          ),
        ].filter((n) => n.tabIndex >= 0);
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      className={cn(
        "flex flex-col gap-2",
        "absolute inset-x-0 bottom-0 z-20 rounded-t-4 border-t border-hairline-strong bg-popover p-3 pt-1.5 shadow-[0_-12px_32px_-16px_color-mix(in_oklab,black_40%,transparent)]",
        "@min-[38rem]/scribble-prompt:static @min-[38rem]/scribble-prompt:z-auto @min-[38rem]/scribble-prompt:w-[min(46%,17rem)] @min-[38rem]/scribble-prompt:shrink-0 @min-[38rem]/scribble-prompt:rounded-3 @min-[38rem]/scribble-prompt:border @min-[38rem]/scribble-prompt:bg-surface-1 @min-[38rem]/scribble-prompt:p-2 @min-[38rem]/scribble-prompt:shadow-none @min-[75rem]/scribble-prompt:w-[21rem]",
      )}
    >
      <div
        {...sheetDrag}
        aria-hidden
        className="mx-auto flex h-5 w-full cursor-grab touch-pan-x items-center justify-center @min-[38rem]/scribble-prompt:hidden"
      >
        <span className="h-1 w-10 rounded-full bg-hairline-strong" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div
          role="toolbar"
          aria-label="Drawing tools"
          className="flex items-center gap-0.5"
        >
          {TOOLS.map((t) => {
            const on = tool === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                aria-label={`${t.label} (${t.key})`}
                title={`${t.label} (${t.key})`}
                onClick={() => {
                  setTool(t.id);
                  setAnchor(null);
                }}
                className={cn(
                  iconButton,
                  "size-7",
                  on &&
                    "bg-(--sp-wash) text-(--sp-accent) hover:bg-(--sp-wash) hover:text-(--sp-accent)",
                )}
              >
                <ToolIcon tool={t.id} />
              </button>
            );
          })}
        </div>
        <div
          role="radiogroup"
          aria-label="Colour"
          className="flex items-center gap-1"
        >
          {colors.map((c, i) => {
            const on = i === colorIndex;
            const names = ["Ink", "Accent", "Amber", "Moss"];
            return (
              <button
                key={`${c}-${i}`}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={names[i] ?? `Colour ${i + 1}`}
                tabIndex={on ? 0 : -1}
                onClick={() => setColorIndex(i)}
                onKeyDown={(event) => {
                  const dir =
                    event.key === "ArrowRight" || event.key === "ArrowDown"
                      ? 1
                      : event.key === "ArrowLeft" || event.key === "ArrowUp"
                        ? -1
                        : 0;
                  if (!dir) return;
                  event.preventDefault();
                  const next = (i + dir + colors.length) % colors.length;
                  setColorIndex(next);
                  const parent = event.currentTarget.parentElement;
                  window.requestAnimationFrame(() =>
                    parent
                      ?.querySelector<HTMLElement>('[aria-checked="true"]')
                      ?.focus(),
                  );
                }}
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-full border transition-colors duration-150",
                  on
                    ? "border-(--sp-line)"
                    : "border-transparent hover:border-hairline-strong",
                  focusRing,
                )}
              >
                <span
                  className="size-3.5 rounded-full"
                  style={{ backgroundColor: c }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative">
        <motion.svg
          ref={drawRef}
          role="application"
          aria-label={`Sketch pad, ${count(marks.length)}`}
          aria-describedby={padHelpId}
          tabIndex={0}
          viewBox={`0 0 ${W} ${H}`}
          onKeyDown={onPadKey}
          onFocus={(event) => {
            // The crosshair is for keyboard drawing; a press that focuses the
            // pad to draw with the pointer does not need it.
            setPadFocus(event.currentTarget.matches(":focus-visible"));
          }}
          onBlur={() => {
            setPadFocus(false);
            setAnchor(null);
          }}
          {...drawDrag}
          className={cn(
            "block aspect-[4/3] w-full touch-none rounded-2 border border-hairline bg-card select-none",
            tool === "pen" ? "cursor-crosshair" : "cursor-cell",
            focusRing,
          )}
        >
          <Paper grid={gridStyle} id={patternId} />
          <motion.g style={{ opacity: padInkOpacity }}>
            {marks.map((s) => (
              <motion.path
                key={s.id}
                d={strokePath(s)}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ stroke: s.color }}
                initial={
                  landed === s.id && motionSafe
                    ? { strokeWidth: s.width * 2.2 }
                    : false
                }
                animate={{ strokeWidth: s.width }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
              />
            ))}
          </motion.g>
          <motion.path
            d={liveD}
            fill="none"
            strokeWidth={liveWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ stroke: liveColor }}
          />
          {padFocus ? (
            <g aria-hidden className="pointer-events-none">
              {preview ? (
                <path
                  d={preview}
                  fill="none"
                  strokeWidth={penWidth}
                  strokeDasharray="6 5"
                  strokeLinecap="round"
                  style={{ stroke: color }}
                />
              ) : null}
              <path
                d={`M ${cursor[0] - 9} ${cursor[1]} H ${cursor[0] + 9} M ${cursor[0]} ${cursor[1] - 9} V ${cursor[1] + 9}`}
                strokeWidth={1.5}
                className="stroke-(--sp-accent)"
              />
              <circle
                cx={cursor[0]}
                cy={cursor[1]}
                r={3}
                fill="none"
                strokeWidth={1.25}
                className="stroke-(--sp-accent)"
              />
            </g>
          ) : null}
        </motion.svg>
        {marks.length === 0 ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-[12px] leading-[1.5] text-ink-3">
            Draw boxes, arrows or anything. It goes with your message.
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Undo (Cmd or Ctrl+Z)"
          aria-disabled={(!marks.length && !undoStack.length) || undefined}
          onClick={undo}
          className={cn(iconButton, "size-7 aria-disabled:opacity-40")}
        >
          <Undo2 aria-hidden className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Redo (Shift+Cmd or Ctrl+Z)"
          aria-disabled={!redoStack.length || undefined}
          onClick={redo}
          className={cn(iconButton, "size-7 aria-disabled:opacity-40")}
        >
          <Redo2 aria-hidden className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Clear the pad"
          aria-disabled={!marks.length || undefined}
          onClick={clear}
          className={cn(iconButton, "size-7 aria-disabled:opacity-40")}
        >
          <Trash2 aria-hidden className="size-3.5" />
        </button>
        {/* The count is in the pad's name too; on a narrow sheet it gives
            its room to the buttons rather than truncating. */}
        <span className="ml-1 min-w-0 flex-1 font-mono text-[10.5px] whitespace-nowrap text-ink-3 tabular-nums">
          <span className="hidden @min-[22rem]/scribble-prompt:inline">
            {count(marks.length)}
          </span>
        </span>
        <button
          type="button"
          aria-label="Close the pad"
          onClick={() => dock(false)}
          className={cn(iconButton, "size-7")}
        >
          <X aria-hidden className="size-3.5" />
        </button>
        <button
          type="button"
          aria-disabled={!marks.length || undefined}
          aria-describedby={!marks.length ? `${uid}-empty` : undefined}
          onClick={() => {
            if (marks.length) dock(true);
          }}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-2 px-2.5 text-[12px] font-medium transition-colors duration-150",
            marks.length
              ? "bg-(--sp-solid) text-primary-foreground hover:bg-(--sp-accent)"
              : "bg-surface-2 text-ink-3",
            focusRing,
          )}
        >
          <Paperclip aria-hidden className="size-3.5" />
          Attach
        </button>
        {!marks.length ? (
          <span id={`${uid}-empty`} className="sr-only">
            Draw something first.
          </span>
        ) : null}
      </div>
      <p id={padHelpId} className="sr-only">
        Arrow keys move the crosshair, Shift for bigger steps. P, B and A pick
        pen, box and arrow. Space or Enter anchors a shape and places it. Escape
        cancels, or closes the pad. Command or Control Z undoes.
      </p>
    </motion.div>
  );

  /* ------------------------------ render ---------------------------- */

  return (
    <section
      ref={rootRef}
      aria-labelledby={titleId}
      className={cn(
        "@container/scribble-prompt relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{ ...vars, height }}
    >
      <header className="flex shrink-0 items-center gap-2.5 border-b border-hairline px-4 py-3">
        <span
          aria-hidden
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-2 bg-(--sp-wash) text-(--sp-accent)"
        >
          <Brush className="size-3.5" />
        </span>
        <div className="min-w-0">
          <h2
            id={titleId}
            className="truncate text-[13.5px] leading-5 font-semibold"
          >
            {assistant}
          </h2>
          <p className="truncate font-mono text-[10.5px] text-ink-3">
            words or a sketch, or both
          </p>
        </div>
      </header>

      <div
        ref={scrollRef}
        role="log"
        aria-label="Conversation"
        className="flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,transparent,black_16px,black)] px-4 py-4"
      >
        <ol className="mx-auto flex w-full max-w-[44rem] flex-col gap-3">
          <AnimatePresence initial={false}>
            {thread.map((m) => (
              <motion.li
                key={m.id}
                initial={
                  motionSafe
                    ? { opacity: 0, y: distances.step }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  y: springs.glide,
                  opacity: { duration: durations.base, ease: easings.enter },
                }}
                className={cn(
                  "flex max-w-[86%] flex-col gap-1.5",
                  m.role === "you" ? "ml-auto items-end" : "items-start",
                )}
                aria-label={m.role === "you" ? "You" : assistant}
              >
                {m.sketch?.length ? (
                  <span className="inline-flex overflow-hidden rounded-2 border border-hairline bg-card">
                    <svg
                      aria-label={`Sketch, ${count(m.sketch.length)}`}
                      role="img"
                      viewBox={`0 0 ${W} ${H}`}
                      className="block h-24 w-32"
                    >
                      <Strokes strokes={m.sketch} thin />
                    </svg>
                  </span>
                ) : null}
                {m.text ? (
                  <p
                    className={cn(
                      "rounded-3 px-3 py-2 text-[13px] leading-[1.55]",
                      m.role === "you"
                        ? "rounded-tr-1 border border-hairline bg-surface-2 text-foreground"
                        : "rounded-tl-1 bg-(--sp-wash) text-foreground",
                    )}
                  >
                    {m.text}
                  </p>
                ) : null}
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      </div>

      <div className="shrink-0 border-t border-hairline p-3">
        <div className="mx-auto flex max-w-[44rem] flex-col gap-2 rounded-3 border border-hairline-strong bg-surface-1 p-2 focus-within:border-(--sp-line)">
          {files.length || docked ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {docked ? (
                <span className="inline-flex h-11 items-center gap-1 rounded-2 border border-(--sp-line) bg-card pr-1 pl-1">
                  <button
                    ref={chipRef}
                    type="button"
                    aria-label={`Sketch, ${count(marks.length)}. Open the pad`}
                    disabled={disabled}
                    onClick={reopen}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-[5px] pr-1.5",
                      focusRing,
                    )}
                  >
                    <motion.span
                      ref={thumbRef}
                      className="inline-flex h-9 w-12 overflow-hidden rounded-1 border border-hairline bg-surface-1"
                      style={{ opacity: thumbOpacity }}
                    >
                      <svg
                        aria-hidden
                        viewBox={`0 0 ${W} ${H}`}
                        className="block size-full"
                      >
                        <Strokes strokes={marks} thin />
                      </svg>
                    </motion.span>
                    <motion.span
                      style={{ opacity: labelOpacity }}
                      className="flex flex-col items-start leading-tight"
                    >
                      <span className="text-[12px] font-medium text-foreground">
                        Sketch
                      </span>
                      <span className="font-mono text-[10px] text-ink-3">
                        {count(marks.length)}
                      </span>
                    </motion.span>
                  </button>
                  <button
                    type="button"
                    aria-label="Remove the sketch"
                    disabled={disabled}
                    onClick={() => {
                      setUndoStack((u) => [
                        ...u,
                        { type: "clear", strokes: marksRef.current },
                      ]);
                      setMarks([]);
                      setAnnouncement("Sketch removed.");
                      window.requestAnimationFrame(() =>
                        sketchButtonRef.current?.focus(),
                      );
                    }}
                    className={cn(iconButton, "size-6")}
                  >
                    <X aria-hidden className="size-3" />
                  </button>
                </span>
              ) : null}
              {files.map((f) => (
                <span
                  key={f.id}
                  className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-2 border border-hairline bg-card pr-1 pl-2 text-[12px]"
                >
                  <FileText
                    aria-hidden
                    className="size-3.5 shrink-0 text-ink-3"
                  />
                  <span className="truncate" title={f.name}>
                    {f.name}
                  </span>
                  {f.size ? (
                    <span className="shrink-0 font-mono text-[10px] text-ink-3">
                      {f.size}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    disabled={disabled}
                    onClick={() => {
                      if (attachments === undefined)
                        setOwnFiles((l) => l.filter((x) => x.id !== f.id));
                      onRemoveAttachment?.(f.id);
                      // The chip goes with its button; focus lands in the field.
                      window.requestAnimationFrame(() =>
                        textareaRef.current?.focus(),
                      );
                    }}
                    className={cn(iconButton, "size-6")}
                  >
                    <X aria-hidden className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex items-start gap-2">
            <textarea
              ref={textareaRef}
              rows={1}
              value={text}
              disabled={disabled}
              aria-label="Message"
              placeholder={placeholder}
              onChange={(event) => {
                const next = event.currentTarget.value;
                setText(next);
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  send();
                }
              }}
              className="min-w-0 flex-1 resize-none bg-transparent px-1 py-1 text-[13px] leading-[1.55] text-foreground outline-none placeholder:text-ink-3"
            />
            {/* popLayout: a closing pad leaves the layout at once, so the
                chip is measured where it will rest. */}
            <AnimatePresence initial={false} mode="popLayout">
              {isOpen ? pad : null}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-1">
            <button
              ref={sketchButtonRef}
              type="button"
              aria-pressed={isOpen}
              disabled={disabled}
              onClick={() => (isOpen ? dock(false) : reopen())}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 px-2 text-[12px] transition-colors duration-150 disabled:opacity-40",
                isOpen
                  ? "bg-(--sp-wash) text-(--sp-accent)"
                  : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                focusRing,
              )}
            >
              <PenLine aria-hidden className="size-3.5" />
              {isOpen ? "Close sketch" : docked ? "Edit sketch" : "Sketch"}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => fileRef.current?.click()}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 px-2 text-[12px] text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-foreground disabled:opacity-40",
                focusRing,
              )}
            >
              <Paperclip aria-hidden className="size-3.5" />
              <span className="hidden @min-[24rem]/scribble-prompt:inline">
                Attach file
              </span>
              <span className="sr-only @min-[24rem]/scribble-prompt:hidden">
                Attach file
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              tabIndex={-1}
              aria-hidden
              className="sr-only"
              onChange={(event) => {
                const picked = [...(event.currentTarget.files ?? [])];
                event.currentTarget.value = "";
                if (!picked.length) return;
                onAttachFiles?.(picked);
                if (attachments === undefined) {
                  setOwnFiles((l) => [
                    ...l,
                    ...picked.map((f, i) => ({
                      id: `file-${l.length + i}-${f.name}`,
                      name: f.name,
                      size:
                        f.size > 1e6
                          ? `${(f.size / 1e6).toFixed(1)} MB`
                          : `${Math.max(1, Math.round(f.size / 1e3))} KB`,
                    })),
                  ]);
                }
              }}
            />
            <span className="flex-1" />
            <button
              type="button"
              aria-label="Send"
              aria-disabled={!canSend || undefined}
              onClick={send}
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-2 transition-colors duration-150",
                canSend
                  ? "bg-(--sp-solid) text-primary-foreground hover:bg-(--sp-accent)"
                  : "bg-surface-2 text-ink-3",
                focusRing,
              )}
            >
              <SendHorizontal aria-hidden className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {marks.length ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute z-30 overflow-hidden rounded-2 border border-hairline bg-card shadow-[0_10px_24px_-12px_color-mix(in_oklab,black_40%,transparent)]"
          style={{
            opacity: flyerOpacity,
            left: fl,
            top: ft,
            width: fw,
            height: fh,
            x: fx,
            y: fy,
            scale: fs,
            originX: 0,
            originY: 0,
          }}
        >
          <svg viewBox={`0 0 ${W} ${H}`} className="block size-full">
            <Strokes strokes={marks} />
          </svg>
        </motion.div>
      ) : null}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
