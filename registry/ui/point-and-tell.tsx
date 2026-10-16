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
  ChevronDown,
  Crosshair,
  RotateCcw,
  TriangleAlert,
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
import { cn } from "@/registry/lib/utils";

export type PointTargetKind =
  | "header"
  | "nav"
  | "heading"
  | "field"
  | "select"
  | "button"
  | "chart"
  | "table"
  | "card"
  | "note"
  | "badge";

export type PointRect = { x: number; y: number; w: number; h: number };

export type PointTarget = {
  id: string;
  /** What the part is called, in the outline's tag, the form and announcements. */
  label: string;
  /** How the part is drawn on the page. */
  kind: PointTargetKind;
  /** Its box, in percent of the 16:10 page. */
  rect: PointRect;
  /** What it shows. Lists (nav items, table rows) are split by "|". */
  text?: string;
  /** Holds personal data: shown on the page, masked in every crop. */
  sensitive?: boolean;
};

export type PointForm = {
  /** @default "Feedback" */
  heading?: string;
  /** @default "Point at the part you mean, then tell us about it." */
  prompt?: string;
  /** @default "What should we know?" */
  placeholder?: string;
  /** @default "Send" */
  sendLabel?: string;
};

export type PointFeedback = { message: string; targets: PointTarget[] };
export type PointOutlineStyle = "measure" | "dashed" | "corners";
export type PointMaskStyle = "blur" | "bars" | "dots";

export type PointAndTellProps = {
  /** The page's parts, drawn and pointable. @default defaultPointTargets (Fieldline's equipment checkout) */
  targets?: PointTarget[];
  /** Names the page in its frame's bar. @default "Fieldline · Equipment checkout" */
  pageLabel?: string;
  /** The form's words. */
  form?: PointForm;
  /** Controlled: point mode is on. */
  pointing?: boolean;
  /** Initial point mode when uncontrolled. @default false */
  defaultPointing?: boolean;
  /** Fires from the button, key or click that turned point mode on or off. */
  onPointingChange?: (pointing: boolean) => void;
  /** Controlled pinned target ids, in pin order. */
  pins?: string[];
  /** Initial pins when uncontrolled. @default [] */
  defaultPins?: string[];
  /** Fires with every pin after one is added or removed. */
  onPinsChange?: (pins: string[]) => void;
  /** A part of the page was pinned. */
  onPoint?: (target: PointTarget) => void;
  /** Send was pressed. Return a promise to show sending; a rejection keeps the note and pins. */
  onSubmit?: (feedback: PointFeedback) => void | Promise<unknown>;
  /** Cancel was pressed: pins and note are cleared. */
  onCancel?: () => void;
  /** The pointing outline: a fine measuring box with ticks, guides and a size tag; a dashed box; or corner brackets. @default "measure" */
  outlineStyle?: PointOutlineStyle;
  /** How sensitive values look in crops: blurred, covered by bars, or replaced by dots. @default "blur" */
  maskStyle?: PointMaskStyle;
  /** Outline, guides, pin numbers, point-mode tint and Send — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The most parts that can be pinned at once. @default 4 */
  maxPins?: number;
  /** Tallest the surface grows before it scrolls inside, px. @default 540 */
  maxHeight?: number;
  /** Nothing can be pointed at, pinned or sent. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** Fieldline's equipment checkout, part by part. */
export const defaultPointTargets: PointTarget[] = [
  {
    id: "topbar",
    label: "Top bar",
    kind: "header",
    rect: { x: 0, y: 0, w: 100, h: 10 },
    text: "Fieldline",
  },
  {
    id: "nav",
    label: "Navigation",
    kind: "nav",
    rect: { x: 30, y: 2, w: 42, h: 6 },
    text: "Checkout|Returns|Inventory|Reports",
  },
  {
    id: "title",
    label: "Page title",
    kind: "heading",
    rect: { x: 4, y: 14, w: 46, h: 8 },
    text: "Equipment checkout",
  },
  {
    id: "overdue",
    label: "Overdue badge",
    kind: "badge",
    rect: { x: 80, y: 15, w: 16, h: 6 },
    text: "3 overdue",
  },
  {
    id: "form",
    label: "Checkout form",
    kind: "card",
    rect: { x: 4, y: 25, w: 56, h: 71 },
    text: "New checkout",
  },
  {
    id: "email",
    label: "Borrower email",
    kind: "field",
    rect: { x: 7, y: 33, w: 50, h: 12 },
    text: "r.okafor@fieldline.test",
    sensitive: true,
  },
  {
    id: "badge",
    label: "Badge number",
    kind: "field",
    rect: { x: 7, y: 47, w: 24, h: 12 },
    text: "FL-20417-88",
    sensitive: true,
  },
  {
    id: "return",
    label: "Return by",
    kind: "select",
    rect: { x: 33, y: 47, w: 24, h: 12 },
    text: "Fri, Oct 24",
  },
  {
    id: "equipment",
    label: "Equipment",
    kind: "select",
    rect: { x: 7, y: 61, w: 50, h: 12 },
    text: "Survey drone · SD-4",
  },
  {
    id: "terms",
    label: "Checkout note",
    kind: "note",
    rect: { x: 7, y: 77, w: 30, h: 15 },
    text: "Charge batteries before return. Late fees start after two days.",
  },
  {
    id: "submit",
    label: "Check out button",
    kind: "button",
    rect: { x: 41, y: 80, w: 16, h: 9 },
    text: "Check out",
  },
  {
    id: "availability",
    label: "Availability chart",
    kind: "chart",
    rect: { x: 63, y: 25, w: 33, h: 33 },
    text: "Drones free this week",
  },
  {
    id: "recent",
    label: "Recent checkouts",
    kind: "table",
    rect: { x: 63, y: 61, w: 33, h: 35 },
    text: "Laser level·Due Oct 18|Drill kit 4·Due Oct 21|Survey drone·Overdue",
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

/** The page's own size, px: the crops render it at this size and scale it. */
const PAGE_W = 640;
const PAGE_H = 400;
/** Pin thumbnails, px — 3:2, so a crop region is grown to this shape. */
const THUMB_W = 96;
const THUMB_H = 64;

const KIND_WORD: Record<PointTargetKind, string> = {
  header: "bar",
  nav: "navigation",
  heading: "heading",
  field: "field",
  select: "menu",
  button: "button",
  chart: "chart",
  table: "table",
  card: "panel",
  note: "text",
  badge: "badge",
};

/** "Borrower email, field" — but "Top bar", not "Top bar, bar". */
const nameOf = (t: PointTarget) =>
  t.label.toLowerCase().includes(KIND_WORD[t.kind])
    ? t.label
    : `${t.label}, ${KIND_WORD[t.kind]}`;

const BARS = [0.42, 0.7, 0.55, 0.9, 0.62, 0.35, 0.8];
const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const areaOf = (r: PointRect) => r.w * r.h;
const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

/**
 * The region of the page a crop shows, in page px: the part with a margin,
 * grown to the thumbnail's 3:2 and kept on the page. Because it is the
 * thumbnail's shape, the crop can fly from the page to its slot on one
 * uniform scale, with nothing stretched on the way.
 */
function cropRegion(rect: PointRect) {
  const x = (rect.x / 100) * PAGE_W;
  const y = (rect.y / 100) * PAGE_H;
  const w = (rect.w / 100) * PAGE_W;
  const h = (rect.h / 100) * PAGE_H;
  const pad = Math.max(8, Math.min(w, h) * 0.18);
  let rw = w + pad * 2;
  let rh = h + pad * 2;
  const aspect = THUMB_W / THUMB_H;
  if (rw / rh > aspect) rh = rw / aspect;
  else rw = rh * aspect;
  if (rw > PAGE_W) {
    rw = PAGE_W;
    rh = rw / aspect;
  }
  if (rh > PAGE_H) {
    rh = PAGE_H;
    rw = rh * aspect;
  }
  const rx = clamp(x + w / 2 - rw / 2, 0, PAGE_W - rw);
  const ry = clamp(y + h / 2 - rh / 2, 0, PAGE_H - rh);
  return { x: rx, y: ry, w: rw, h: rh };
}

function Masked({ text, mask }: { text: string; mask: PointMaskStyle }) {
  if (mask === "bars") {
    return (
      <span
        aria-hidden
        className="inline-block h-[1.5cqw] rounded-[0.3cqw] bg-foreground"
        style={{ width: `${Math.min(30, text.length * 1.05)}cqw` }}
      />
    );
  }
  if (mask === "dots") {
    return (
      <span className="tracking-[0.1cqw] text-ink-2">
        {text.replace(/[^\s]/g, "•")}
      </span>
    );
  }
  return <span className="blur-[0.55cqw] select-none">{text}</span>;
}

/** One part, drawn in units of the page's width so it scales with it. */
function Part({
  target,
  masked,
  mask,
}: {
  target: PointTarget;
  masked: boolean;
  mask: PointMaskStyle;
}) {
  const t = target;
  const text = t.text ?? t.label;
  const value = (v: string) =>
    masked && t.sensitive ? <Masked text={v} mask={mask} /> : v;
  switch (t.kind) {
    case "header":
      return (
        <div className="flex size-full items-center gap-[1.2cqw] border-b border-hairline bg-surface-0 px-[2.5cqw]">
          <span className="size-[2.6cqw] rounded-[0.6cqw] bg-cobalt-bright" />
          <span className="text-[1.9cqw] font-semibold">{text}</span>
        </div>
      );
    case "nav":
      return (
        <div className="flex size-full items-center justify-center gap-[2.6cqw] text-[1.6cqw]">
          {text.split("|").map((item, i) => (
            <span
              key={item}
              className={cn(
                "relative",
                i === 0 ? "font-semibold text-foreground" : "text-ink-3",
              )}
            >
              {item}
              {i === 0 ? (
                <span className="absolute inset-x-0 -bottom-[1.3cqw] h-[0.35cqw] rounded-full bg-cobalt-bright" />
              ) : null}
            </span>
          ))}
        </div>
      );
    case "heading":
      return (
        <div className="flex size-full flex-col justify-center">
          <span className="text-[3.1cqw] leading-none font-semibold">
            {text}
          </span>
        </div>
      );
    case "badge":
      return (
        <div className="flex size-full items-center justify-end">
          <span
            className="inline-flex h-full items-center gap-[0.8cqw] rounded-full px-[1.6cqw] text-[1.5cqw] font-medium text-warn"
            style={{
              backgroundColor:
                "color-mix(in oklab, var(--warn) 14%, transparent)",
            }}
          >
            <span className="size-[1cqw] rounded-full bg-warn" />
            {text}
          </span>
        </div>
      );
    case "card":
      return (
        // A block with the title's own size and leading, so no 16px line box
        // inherited from the page pushes the title down onto what it holds.
        <div className="size-full rounded-[1.2cqw] border border-hairline bg-surface-0 px-[2cqw] py-[1.6cqw] text-[1.6cqw] leading-none font-semibold text-ink-2">
          {text}
        </div>
      );
    case "field":
    case "select":
      return (
        <div className="flex size-full flex-col gap-[0.6cqw]">
          <span className="text-[1.35cqw] leading-none text-ink-3">
            {t.label}
          </span>
          <span className="flex flex-1 items-center justify-between overflow-hidden rounded-[0.8cqw] border border-hairline-strong bg-card px-[1.3cqw] text-[1.65cqw] whitespace-nowrap text-foreground">
            <span className="truncate">{value(text)}</span>
            {t.kind === "select" ? (
              <ChevronDown className="size-[1.8cqw] shrink-0 text-ink-3" />
            ) : null}
          </span>
        </div>
      );
    case "button":
      return (
        <div className="flex size-full items-center justify-center rounded-[0.8cqw] bg-primary text-[1.65cqw] font-medium text-primary-foreground">
          {text}
        </div>
      );
    case "note":
      return (
        <p className="text-[1.35cqw] leading-[1.45] text-ink-3">
          {value(text)}
        </p>
      );
    case "chart":
      return (
        <div className="flex size-full flex-col rounded-[1.2cqw] border border-hairline bg-surface-0 p-[1.6cqw]">
          <span className="text-[1.45cqw] font-semibold text-ink-2">
            {text}
          </span>
          <div className="mt-[1.2cqw] flex flex-1 items-end gap-[1cqw] overflow-hidden">
            {BARS.map((v, i) => (
              <div
                key={i}
                className="flex h-full flex-1 flex-col items-center justify-end gap-[0.5cqw]"
              >
                <span
                  className={cn(
                    "w-full rounded-[0.4cqw]",
                    i === 3 ? "bg-cobalt-bright" : "bg-cobalt-bright/45",
                  )}
                  style={{ height: `${Math.round(v * 72)}%` }}
                />
                <span className="text-[1.1cqw] leading-none text-ink-3">
                  {DAYS[i]}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    case "table":
      return (
        <div className="flex size-full flex-col rounded-[1.2cqw] border border-hairline bg-surface-0 px-[1.6cqw] py-[1.4cqw]">
          <span className="text-[1.45cqw] font-semibold text-ink-2">
            {t.label}
          </span>
          <div className="mt-[0.6cqw] flex flex-1 flex-col justify-around">
            {text.split("|").map((row) => {
              const [name = "", state = ""] = row.split("·");
              return (
                <div
                  key={row}
                  className="flex items-center justify-between gap-[1cqw] border-t border-hairline pt-[0.6cqw] text-[1.35cqw]"
                >
                  <span className="truncate text-foreground">{name}</span>
                  <span
                    className={cn(
                      "shrink-0",
                      state === "Overdue" ? "text-danger" : "text-ink-3",
                    )}
                  >
                    {state}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      );
    default:
      return null;
  }
}

/**
 * The whole page from its parts, largest first so panels sit under what is
 * in them. Font sizes are in container units: the same page draws at any
 * width, and a crop is this page at 640px, scaled.
 */
function PageArt({
  targets,
  masked,
  mask,
}: {
  targets: PointTarget[];
  masked: boolean;
  mask: PointMaskStyle;
}) {
  const ordered = [...targets].sort((a, b) => areaOf(b.rect) - areaOf(a.rect));
  return (
    <div className="[container-type:inline-size] absolute inset-0 overflow-clip bg-card font-sans text-foreground">
      {ordered.map((t) => (
        <div
          key={t.id}
          className="absolute"
          style={{
            left: `${r2(t.rect.x)}%`,
            top: `${r2(t.rect.y)}%`,
            width: `${r2(t.rect.w)}%`,
            height: `${r2(t.rect.h)}%`,
          }}
        >
          <Part target={t} masked={masked} mask={mask} />
        </div>
      ))}
    </div>
  );
}

/** A pinned part: the page at 640px, scaled and shifted so the part fills it. */
function Crop({
  targets,
  target,
  mask,
}: {
  targets: PointTarget[];
  target: PointTarget;
  mask: PointMaskStyle;
}) {
  const region = cropRegion(target.rect);
  const s = THUMB_W / region.w;
  return (
    <div
      aria-hidden
      className="relative overflow-clip rounded-2 border border-hairline-strong bg-card"
      style={{ width: THUMB_W, height: THUMB_H }}
    >
      <div
        className="absolute top-0 left-0"
        style={{
          width: PAGE_W,
          height: PAGE_H,
          transform: `translate(${r2(-region.x * s)}px, ${r2(-region.y * s)}px) scale(${Number(s.toFixed(4))})`,
          transformOrigin: "0 0",
        }}
      >
        <PageArt targets={targets} masked mask={mask} />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The component                              */
/* ----------------------------------------------------------------------- */

type SendState = "idle" | "sending" | "sent" | "failed";
type Flight = { n: number; id: string; from: DOMRect };

/**
 * Feedback that points. Point turns the page into targets: hovering — or
 * Tab, which cycles through the parts while point mode is on — finds the
 * smallest part under the pointer, and one fine measuring outline travels to
 * its box on `springs.snap` (x, y, width and height as motion values, one
 * crisp overshoot) with its size in a tag and guides out to the page's
 * edges. A click or Enter pins it: a crop of the page lifts off at the
 * part's own box and flies into its slot in the form on `springs.glide`,
 * growing or shrinking on one uniform scale, as the outline flashes.
 *
 * Crops are the page drawn again and scaled, so they are exact; sensitive
 * values show on the page and are masked in every crop. Escape or Done
 * leaves point mode and focus goes back to Point. Send reports sending, sent
 * and failed — a failure keeps the note and every pin. Under reduced motion
 * the outline jumps to each box and pins appear in their slots with a fade.
 */
export function PointAndTell({
  targets = defaultPointTargets,
  pageLabel = "Fieldline · Equipment checkout",
  form,
  pointing,
  defaultPointing = false,
  onPointingChange,
  pins,
  defaultPins,
  onPinsChange,
  onPoint,
  onSubmit,
  onCancel,
  outlineStyle = "measure",
  maskStyle = "blur",
  accent = "var(--accent-bright)",
  maxPins = 4,
  maxHeight = 540,
  disabled = false,
  className,
}: PointAndTellProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const promptId = `${uid}-prompt`;
  const hintId = `${uid}-hint`;
  const noteId = `${uid}-note`;
  const heading = form?.heading ?? "Feedback";
  const prompt =
    form?.prompt ?? "Point at the part you mean, then tell us about it.";
  const placeholder = form?.placeholder ?? "What should we know?";
  const sendLabel = form?.sendLabel ?? "Send";
  const limit = Math.max(1, Math.round(maxPins));

  /* -------------------------------- state -------------------------------- */

  const [ownPointing, setOwnPointing] = React.useState(defaultPointing);
  const isPointing = (pointing ?? ownPointing) && !disabled;
  const [ownPins, setOwnPins] = React.useState<string[]>(
    () => defaultPins ?? [],
  );
  const pinned = (pins ?? ownPins).filter((id) =>
    targets.some((t) => t.id === id),
  );
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState("");
  const [send, setSend] = React.useState<SendState>("idle");
  const [flight, setFlight] = React.useState<Flight | null>(null);
  const [flash, setFlash] = React.useState(0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const byId = (id: string | null) =>
    id ? targets.find((t) => t.id === id) : undefined;
  const hoveredTarget = isPointing ? byId(hovered) : undefined;
  // Reading order for Tab: top to bottom, then left to right.
  const reading = [...targets].sort(
    (a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x,
  );
  const depth = new Map(
    [...targets]
      .sort((a, b) => areaOf(b.rect) - areaOf(a.rect))
      .map((t, i) => [t.id, i + 1]),
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const pageRef = React.useRef<HTMLDivElement | null>(null);
  const flyerRef = React.useRef<HTMLDivElement | null>(null);
  const hitNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const slotNodes = React.useRef(new Map<string, HTMLDivElement>());
  const pointButton = React.useRef<HTMLButtonElement | null>(null);
  const sendToken = React.useRef(0);
  /** Focus that must land on a node after a swap: claimed once, on arrival. */
  const focusAsk = React.useRef<"point" | "again" | null>(null);
  const focusFirst = React.useRef(false);
  const byIdRef = React.useRef(byId);
  React.useEffect(() => {
    byIdRef.current = byId;
  });
  React.useEffect(() => {
    const token = sendToken;
    return () => {
      token.current += 1;
    };
  }, []);

  /* ------------------------------- outline ------------------------------- */

  const ox = useMotionValue(0);
  const oy = useMotionValue(0);
  const ow = useMotionValue(0);
  const oh = useMotionValue(0);
  const oLeft = useTransform(ox, (v) => `${r2(v)}%`);
  const oTop = useTransform(oy, (v) => `${r2(v)}%`);
  const oWidth = useTransform(ow, (v) => `${r2(v)}%`);
  const oHeight = useTransform(oh, (v) => `${r2(v)}%`);
  const oBottom = useTransform(
    [oy, oh] as MotionValue<number>[],
    ([y = 0, h = 0]: number[]) => `${r2(y + h)}%`,
  );
  const oRight = useTransform(
    [ox, ow] as MotionValue<number>[],
    ([x = 0, w = 0]: number[]) => `${r2(x + w)}%`,
  );
  const shown = React.useRef(false);

  // The outline travels to whatever is under the pointer or the focus: one
  // box on snap, so moving between parts reads as one tool, not many.
  React.useEffect(() => {
    const t = hoveredTarget;
    if (!t) {
      shown.current = false;
      return;
    }
    const to = [t.rect.x, t.rect.y, t.rect.w, t.rect.h];
    const mvs = [ox, oy, ow, oh];
    if (!shown.current || !motionSafe) {
      // The first box of a pointing session appears where it is.
      shown.current = true;
      mvs.forEach((mv, i) => mv.jump(to[i] ?? 0));
      return;
    }
    const running = mvs.map((mv, i) => animate(mv, to[i] ?? 0, springs.snap));
    return () => {
      for (const c of running) c.stop();
    };
  }, [hoveredTarget, motionSafe, ox, oy, ow, oh]);

  /* ------------------------------- actions ------------------------------- */

  const setPointingTo = (next: boolean) => {
    if (pointing === undefined) setOwnPointing(next);
    onPointingChange?.(next);
  };

  const writePins = (next: string[]) => {
    if (pins === undefined) setOwnPins(next);
    onPinsChange?.(next);
  };

  /** Point is focused now if it is on screen, or as soon as it arrives. */
  const focusPoint = () => {
    if (pointButton.current?.isConnected) pointButton.current.focus();
    else focusAsk.current = "point";
  };

  const startPointing = () => {
    if (disabled || send === "sending") return;
    setPointingTo(true);
    setHovered(reading[0]?.id ?? null);
    focusFirst.current = true;
    say(
      "Point mode. Tab moves between parts of the page, Enter pins one, Escape leaves.",
    );
  };

  const stopPointing = () => {
    setPointingTo(false);
    setHovered(null);
    focusPoint();
    say(`Point mode off. ${plural(pinned.length, "part", "parts")} pinned.`);
  };

  const pin = (target: PointTarget) => {
    if (disabled) return;
    if (pinned.includes(target.id)) {
      writePins(pinned.filter((id) => id !== target.id));
      say(`${target.label} unpinned.`);
      return;
    }
    if (pinned.length >= limit) {
      say(`${limit} is the most. Remove a pin to point at another part.`);
      setFlash((f) => f + 1);
      return;
    }
    const node = hitNodes.current.get(target.id);
    writePins([...pinned, target.id]);
    onPoint?.(target);
    if (send === "failed" || send === "sent") setSend("idle");
    if (node && motionSafe) {
      setFlight({
        n: (flight?.n ?? 0) + 1,
        id: target.id,
        from: node.getBoundingClientRect(),
      });
    }
    setFlash((f) => f + 1);
    say(`${target.label} pinned, ${pinned.length + 1} of ${limit}.`);
  };

  const unpin = (target: PointTarget) => {
    const at = pinned.indexOf(target.id);
    const next = pinned.filter((id) => id !== target.id);
    writePins(next);
    const neighbour = next[Math.min(at, next.length - 1)];
    if (neighbour) {
      document.getElementById(`${uid}-remove-${neighbour}`)?.focus();
    } else {
      focusPoint();
    }
    say(`${target.label} removed.`);
  };

  const submit = () => {
    if (disabled || send === "sending") return;
    const feedback: PointFeedback = {
      message: message.trim(),
      targets: pinned
        .map((id) => byId(id))
        .filter((t): t is PointTarget => t !== undefined),
    };
    if (!feedback.message && feedback.targets.length === 0) {
      document.getElementById(noteId)?.focus();
      say("Point at something or write a note first.");
      return;
    }
    if (isPointing) {
      setPointingTo(false);
      setHovered(null);
    }
    const token = ++sendToken.current;
    const result = onSubmit?.(feedback);
    const done = () => {
      if (token !== sendToken.current) return;
      focusAsk.current = "again";
      setSend("sent");
      say(
        `Sent: ${plural(feedback.targets.length, "area", "areas")}${feedback.message ? " and a note" : ""}.`,
      );
    };
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setSend("sending");
      say("Sending.");
      (result as Promise<unknown>).then(done, () => {
        if (token !== sendToken.current) return;
        setSend("failed");
        say("Could not send. Your note and pins are kept.");
      });
    } else {
      done();
    }
  };

  const reset = () => {
    sendToken.current += 1;
    writePins([]);
    setMessage("");
    setSend("idle");
    setHovered(null);
    if (isPointing) setPointingTo(false);
    focusPoint();
  };

  const cancel = () => {
    reset();
    onCancel?.();
    say("Cancelled. Pins and note cleared.");
  };

  /* ------------------------------ the flight ----------------------------- */

  const fx = useMotionValue(0);
  const fy = useMotionValue(0);
  const fs = useMotionValue(1);

  React.useLayoutEffect(() => {
    if (!flight) return;
    const root = rootRef.current;
    const flyer = flyerRef.current;
    const slot = slotNodes.current.get(flight.id);
    const target = byIdRef.current(flight.id);
    const page = pageRef.current;
    if (!root || !flyer || !slot || !target || !page) {
      const t = window.setTimeout(() => setFlight(null), 0);
      return () => window.clearTimeout(t);
    }
    const rootBox = root.getBoundingClientRect();
    const pageBox = page.getBoundingClientRect();
    const k = pageBox.width / PAGE_W;
    const region = cropRegion(target.rect);
    // The crop starts as the region of the page it shows, at the page's own
    // scale, so it lifts off exactly over what it copies.
    const sx = pageBox.left - rootBox.left + region.x * k;
    const sy = pageBox.top - rootBox.top + region.y * k;
    const s0 = (region.w * k) / THUMB_W;
    fx.jump(r2(sx));
    fy.jump(r2(sy));
    fs.jump(Number(s0.toFixed(4)));
    flyer.style.transform = `translateX(${r2(sx)}px) translateY(${r2(sy)}px) scale(${Number(s0.toFixed(4))})`;
    flyer.style.visibility = "visible";
    const running: AnimationPlaybackControls[] = [];
    const t = window.setTimeout(() => {
      running.push(
        animate(0, 1, {
          ...springs.glide,
          onUpdate: (p) => {
            // The slot may still be settling into the list: read it live.
            const rb = root.getBoundingClientRect();
            const sb = slot.getBoundingClientRect();
            const tx = sb.left - rb.left;
            const ty = sb.top - rb.top;
            fx.set(r2(sx + (tx - sx) * p));
            fy.set(r2(sy + (ty - sy) * p));
            fs.set(Number((s0 + (1 - s0) * p).toFixed(4)));
          },
          onComplete: () => setFlight(null),
        }),
      );
    }, 30);
    return () => {
      window.clearTimeout(t);
      for (const c of running) c.stop();
    };
  }, [flight, fx, fy, fs]);

  /* ------------------------------ keyboard ------------------------------- */

  const onHitKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      stopPointing();
    } else if (event.key === "Tab") {
      // Point mode is a loop: Tab cycles the parts until Escape or Done.
      event.preventDefault();
      const n = reading.length;
      const next = reading[(index + (event.shiftKey ? -1 : 1) + n) % n];
      if (next) hitNodes.current.get(next.id)?.focus();
    }
  };

  /* ------------------------------- render -------------------------------- */

  const pinnedTargets = pinned
    .map((id) => byId(id))
    .filter((t): t is PointTarget => t !== undefined);
  const sending = send === "sending";
  const sizeTag = hoveredTarget
    ? `${Math.round((hoveredTarget.rect.w / 100) * PAGE_W)} × ${Math.round((hoveredTarget.rect.h / 100) * PAGE_H)}`
    : "";
  const tagBelow = (hoveredTarget?.rect.y ?? 10) < 7;
  const flyingTarget = flight ? byId(flight.id) : undefined;

  const quiet = cn(
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors",
    "enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:opacity-50",
    FOCUS_RING,
  );

  const outline = (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute z-[6]"
      style={{ left: oLeft, top: oTop, width: oWidth, height: oHeight }}
      initial={false}
      animate={{ opacity: hoveredTarget ? 1 : 0 }}
      transition={{ duration: durations.fast }}
    >
      {outlineStyle === "corners" ? (
        [
          "top-0 left-0 border-t border-l",
          "top-0 right-0 border-t border-r",
          "bottom-0 left-0 border-b border-l",
          "bottom-0 right-0 border-b border-r",
        ].map((pos) => (
          <span
            key={pos}
            className={cn("absolute size-2.5 border-[1.5px]", pos)}
            style={{ borderColor: accent }}
          />
        ))
      ) : (
        <span
          className={cn(
            "absolute inset-0 rounded-[2px] border",
            outlineStyle === "dashed" ? "border-dashed" : "border-solid",
          )}
          style={{
            borderColor: accent,
            backgroundColor: `color-mix(in oklab, ${accent} 7%, transparent)`,
          }}
        />
      )}
      {outlineStyle === "measure"
        ? [
            "-top-[2px] -left-[2px]",
            "-top-[2px] -right-[2px]",
            "-bottom-[2px] -left-[2px]",
            "-bottom-[2px] -right-[2px]",
          ].map((pos) => (
            <span
              key={pos}
              className={cn("absolute size-[5px] bg-card", pos)}
              style={{ boxShadow: `inset 0 0 0 1px ${accent}` }}
            />
          ))
        : null}
      <span
        className={cn(
          "absolute left-0 rounded-[3px] px-1 font-mono text-[9px] leading-[14px] whitespace-nowrap tabular-nums",
          tagBelow ? "top-full mt-1" : "bottom-full mb-1",
        )}
        style={{
          backgroundColor: accent,
          color: "oklch(0.99 0 0)",
        }}
      >
        {sizeTag}
      </span>
      <motion.span
        key={`flash-${flash}`}
        className="absolute -inset-1 rounded-[4px] border-2"
        style={{ borderColor: accent }}
        initial={{ opacity: flash > 0 ? 0.9 : 0 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.5, ease: easings.enter }}
      />
    </motion.div>
  );

  const guides =
    outlineStyle === "measure" ? (
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[5]"
        initial={false}
        animate={{ opacity: hoveredTarget ? 1 : 0 }}
        transition={{ duration: durations.fast }}
      >
        {[
          { key: "t", style: { top: oTop, left: 0, right: 0, height: 1 } },
          { key: "b", style: { top: oBottom, left: 0, right: 0, height: 1 } },
          { key: "l", style: { left: oLeft, top: 0, bottom: 0, width: 1 } },
          { key: "r", style: { left: oRight, top: 0, bottom: 0, width: 1 } },
        ].map((g) => (
          <motion.span
            key={g.key}
            className="absolute"
            style={{
              ...g.style,
              backgroundColor: `color-mix(in oklab, ${accent} 30%, transparent)`,
            }}
          />
        ))}
      </motion.div>
    ) : null;

  const page = (
    <div className="flex min-w-0 flex-col gap-2">
      <div
        className="overflow-clip rounded-3 border bg-surface-0 transition-colors duration-200"
        style={{
          borderColor: isPointing
            ? `color-mix(in oklab, ${accent} 55%, transparent)`
            : "var(--hairline)",
        }}
      >
        <div className="flex h-8 items-center gap-2 border-b border-hairline px-3">
          <span aria-hidden className="flex shrink-0 gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-2 rounded-full bg-hairline-strong"
              />
            ))}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-ink-3">
            {pageLabel}
          </span>
          <AnimatePresence initial={false}>
            {isPointing ? (
              <motion.span
                key="mode"
                className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 font-mono text-[10px] tracking-[0.04em]"
                style={{
                  color: accent,
                  backgroundColor: `color-mix(in oklab, ${accent} 12%, transparent)`,
                }}
                initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? { y: springs.snap, opacity: { duration: durations.fast } }
                    : { duration: durations.fast }
                }
              >
                <Crosshair aria-hidden className="size-3" />
                <span className="hidden @min-[24rem]/point-and-tell:inline">
                  Pointing · Esc leaves
                </span>
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
        <div
          ref={pageRef}
          className={cn(
            "relative aspect-[16/10] w-full",
            isPointing && "cursor-crosshair",
          )}
        >
          <div aria-hidden className="absolute inset-0">
            <PageArt targets={targets} masked={false} mask={maskStyle} />
          </div>
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[4] bg-foreground"
            initial={false}
            animate={{ opacity: isPointing ? 0.05 : 0 }}
            transition={{ duration: durations.base }}
          />
          {pinnedTargets.map((t, i) => (
            <span
              key={t.id}
              aria-hidden
              className="pointer-events-none absolute z-[5] flex size-4 -translate-x-3/4 translate-y-[2px] items-center justify-center rounded-full font-mono text-[9px] font-semibold text-[oklch(0.99_0_0)] tabular-nums"
              style={{
                // The top-right corner: labels start at the top-left.
                left: `${r2(t.rect.x + t.rect.w)}%`,
                top: `${r2(t.rect.y)}%`,
                backgroundColor: accent,
              }}
            >
              {i + 1}
            </span>
          ))}
          {guides}
          {outline}
          {isPointing ? (
            <div
              role="group"
              aria-label={`Parts of ${pageLabel}`}
              aria-describedby={hintId}
              className="absolute inset-0 z-[7]"
              onPointerLeave={() => {
                const active = document.activeElement;
                const focusedHit = [...hitNodes.current.entries()].find(
                  ([, n]) => n === active,
                );
                setHovered(focusedHit ? focusedHit[0] : null);
              }}
            >
              {reading.map((t, i) => {
                const on = pinned.includes(t.id);
                return (
                  <button
                    key={t.id}
                    ref={(node) => {
                      if (node) {
                        hitNodes.current.set(t.id, node);
                        if (focusFirst.current && i === 0) {
                          focusFirst.current = false;
                          node.focus({ preventScroll: true });
                        }
                      } else hitNodes.current.delete(t.id);
                    }}
                    type="button"
                    aria-label={nameOf(t)}
                    aria-pressed={on}
                    onPointerEnter={() => setHovered(t.id)}
                    onFocus={() => setHovered(t.id)}
                    onClick={() => pin(t)}
                    onKeyDown={(event) => onHitKeyDown(event, i)}
                    className="absolute cursor-crosshair rounded-[2px] outline-none focus-visible:outline-1 focus-visible:outline-offset-[3px] focus-visible:outline-ring focus-visible:outline-solid"
                    style={{
                      left: `${r2(t.rect.x)}%`,
                      top: `${r2(t.rect.y)}%`,
                      width: `${r2(t.rect.w)}%`,
                      height: `${r2(t.rect.h)}%`,
                      zIndex: depth.get(t.id) ?? 1,
                    }}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  const pinsList = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-ink-2">Pinned</p>
        <motion.span
          key={`count-${flash}`}
          className="font-mono text-[10px] text-ink-3 tabular-nums"
          initial={flash > 0 && motionSafe ? { scale: 1.25 } : false}
          animate={{ scale: 1 }}
          transition={springs.recoil}
          style={{ originX: 0.5, originY: 0.5 }}
        >
          {pinned.length} of {limit}
        </motion.span>
      </div>
      {pinnedTargets.length === 0 ? (
        <p className="rounded-3 border border-dashed border-hairline-strong px-3 py-3 text-[12px] text-ink-3">
          Nothing pinned yet. Press Point, then choose a part of the page.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {pinnedTargets.map((t, i) => {
              const landing = flight?.id === t.id;
              return (
                <motion.li
                  key={t.id}
                  layout={motionSafe ? "position" : false}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{
                    opacity: 0,
                    height: 0,
                    transition: {
                      height: motionSafe ? springs.glide : { duration: 0 },
                      opacity: exitFor(durations.fast),
                    },
                  }}
                  transition={{
                    layout: springs.glide,
                    height: motionSafe ? springs.glide : { duration: 0 },
                    opacity: { duration: durations.base },
                  }}
                  className="overflow-clip"
                >
                  <div className="flex items-center gap-2.5 rounded-3 border border-hairline bg-surface-0 p-1.5">
                    <div
                      ref={(node) => {
                        if (node) slotNodes.current.set(t.id, node);
                        else slotNodes.current.delete(t.id);
                      }}
                      className="relative shrink-0"
                      style={{ opacity: landing ? 0 : 1 }}
                    >
                      <Crop targets={targets} target={t} mask={maskStyle} />
                      <span
                        aria-hidden
                        className="absolute top-1 left-1 flex size-4 items-center justify-center rounded-full font-mono text-[9px] font-semibold text-[oklch(0.99_0_0)] tabular-nums"
                        style={{ backgroundColor: accent }}
                      >
                        {i + 1}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        title={t.label}
                        className="line-clamp-2 text-[12.5px] leading-[1.25] font-medium text-foreground"
                      >
                        {t.label}
                      </p>
                      <p className="truncate text-[11px] text-ink-3">
                        {KIND_WORD[t.kind]}
                        {t.sensitive ? " · masked" : ""}
                      </p>
                    </div>
                    <button
                      id={`${uid}-remove-${t.id}`}
                      type="button"
                      aria-label={`Remove ${t.label}`}
                      disabled={disabled || sending}
                      onClick={() => unpin(t)}
                      className={cn(
                        "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground",
                        FOCUS_RING,
                      )}
                    >
                      <X aria-hidden className="size-3.5" />
                    </button>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );

  const formBody =
    send === "sent" ? (
      <motion.div
        key="sent"
        className="flex flex-col items-center gap-3 px-2 py-6 text-center"
        initial={
          motionSafe ? { opacity: 0, y: distances.step } : { opacity: 0 }
        }
        animate={{ opacity: 1, y: 0 }}
        transition={
          motionSafe
            ? { y: springs.glide, opacity: { duration: durations.base } }
            : { duration: durations.fast }
        }
      >
        <svg aria-hidden viewBox="0 0 40 40" className="size-10 text-success">
          <circle
            cx="20"
            cy="20"
            r="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            opacity="0.3"
          />
          <motion.path
            d="M12.5 20.5 L18 26 L28 14.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: motionSafe ? 0 : 1 }}
            animate={{ pathLength: 1 }}
            transition={
              motionSafe ? { ...springs.flick, delay: 0.1 } : { duration: 0 }
            }
          />
        </svg>
        <div>
          <p className="text-sm font-semibold">Sent</p>
          <p className="text-[12px] text-ink-2">
            {plural(pinnedTargets.length, "area", "areas")}
            {message.trim() ? " and a note" : ""}. Thank you.
          </p>
        </div>
        <button
          ref={(node) => {
            if (node && focusAsk.current === "again") {
              focusAsk.current = null;
              node.focus({ preventScroll: true });
            }
          }}
          type="button"
          onClick={reset}
          className={quiet}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Point at something else
        </button>
      </motion.div>
    ) : (
      <div className="flex flex-col gap-3.5">
        <div>
          <p className="text-sm font-semibold">{heading}</p>
          <p id={promptId} className="text-[12px] text-ink-3">
            {prompt}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            ref={(node) => {
              pointButton.current = node;
              if (node && focusAsk.current === "point") {
                focusAsk.current = null;
                node.focus({ preventScroll: true });
              }
            }}
            type="button"
            aria-pressed={isPointing}
            disabled={disabled}
            onClick={() => (isPointing ? stopPointing() : startPointing())}
            onKeyDown={(event) => {
              if (event.key === "Escape" && isPointing) {
                event.preventDefault();
                stopPointing();
              }
            }}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border px-3 text-[12px] font-medium transition-colors disabled:opacity-50",
              isPointing
                ? "border-transparent text-[oklch(0.99_0_0)]"
                : "border-hairline-strong text-foreground enabled:hover:bg-surface-2",
              FOCUS_RING,
            )}
            style={isPointing ? { backgroundColor: accent } : undefined}
          >
            <Crosshair aria-hidden className="size-3.5" />
            {isPointing ? "Done" : "Point"}
          </button>
          <span className="min-w-0 flex-1 truncate text-[11px] text-ink-3">
            {isPointing
              ? hoveredTarget
                ? hoveredTarget.label
                : "Choose a part"
              : `Pin up to ${limit} parts`}
          </span>
        </div>
        {pinsList}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={noteId}
            className="text-[11px] font-medium text-ink-2"
          >
            Note
          </label>
          <textarea
            id={noteId}
            rows={3}
            value={message}
            disabled={disabled}
            placeholder={placeholder}
            aria-describedby={promptId}
            onChange={(event) => {
              const text = event.currentTarget.value;
              setMessage(text);
              if (send === "failed") setSend("idle");
            }}
            className={cn(
              "w-full resize-none rounded-3 border border-hairline-strong bg-surface-0 px-3 py-2 text-[13px] text-foreground placeholder:text-ink-3",
              "outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
            )}
          />
        </div>
        {send === "failed" ? (
          <p className="flex items-start gap-1.5 text-[12px] text-danger">
            <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            Could not send. Your note and pins are kept.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={cancel}
            disabled={disabled || sending}
            className={quiet}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            aria-disabled={disabled || sending || undefined}
            aria-busy={sending || undefined}
            className={cn(
              "inline-flex h-8 min-w-[5.5rem] items-center justify-center gap-1.5 rounded-2 px-3.5 text-[12px] font-medium text-[oklch(0.99_0_0)] transition-opacity",
              disabled && "opacity-50",
              FOCUS_RING,
            )}
            style={{ backgroundColor: accent }}
          >
            {sending ? (
              motionSafe ? (
                <motion.svg
                  aria-hidden
                  viewBox="0 0 16 16"
                  className="size-3.5"
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 0.9,
                    ease: "linear",
                    repeat: Infinity,
                  }}
                  style={{ originX: 0.5, originY: 0.5 }}
                >
                  <path
                    d="M8 2 A6 6 0 0 1 14 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </motion.svg>
              ) : null
            ) : null}
            {sending ? "Sending" : send === "failed" ? "Try again" : sendLabel}
          </button>
        </div>
      </div>
    );

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={heading}
      onKeyDown={(event) => {
        // Escape leaves point mode wherever focus is inside the surface.
        if (event.key === "Escape" && isPointing && !event.defaultPrevented) {
          event.preventDefault();
          stopPointing();
        }
      }}
      className={cn(
        "@container/point-and-tell relative isolate flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{ maxHeight }}
    >
      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4 @min-[40rem]/point-and-tell:grid-cols-[minmax(0,1fr)_16rem] @min-[60rem]/point-and-tell:grid-cols-[minmax(0,1fr)_18.75rem]">
          {page}
          <div className="min-w-0 @min-[40rem]/point-and-tell:border-l @min-[40rem]/point-and-tell:border-hairline @min-[40rem]/point-and-tell:pl-4">
            {formBody}
          </div>
        </div>
      </div>

      {flight && flyingTarget ? (
        <motion.div
          ref={flyerRef}
          aria-hidden
          className="pointer-events-none invisible absolute top-0 left-0 z-20 shadow-[0_14px_32px_-12px_color-mix(in_oklab,black_50%,transparent)]"
          style={{ x: fx, y: fy, scale: fs, originX: 0, originY: 0 }}
        >
          <Crop targets={targets} target={flyingTarget} mask={maskStyle} />
        </motion.div>
      ) : null}

      <p id={hintId} className="sr-only">
        Tab and Shift Tab move between parts of the page, Enter or Space pins or
        unpins the part, Escape leaves point mode.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
