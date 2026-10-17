"use client";

import * as React from "react";

import { AnimatePresence, animate, motion } from "motion/react";
import {
  Check,
  CircleX,
  Copy,
  EyeOff,
  Layers,
  Pin,
  PinOff,
  RotateCcw,
  Scissors,
  TriangleAlert,
  X,
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
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type RequestAnatomyAccentName = "cobalt" | "plum" | "mint" | "ink";
export type RequestAnatomyPalette = "tones" | "spectrum" | "mono";
export type RequestAnatomySizeBy = "tokens" | "cost";
export type RequestAnatomyStatus = "ready" | "loading" | "error";

/** The parts a request's tokens divide into, in the order the bar draws them. */
export type AnatomyPart =
  "system" | "context" | "history" | "input" | "output" | "cached";

export type AnatomyPhase = {
  /** "queue", "prefill", "first token", "stream", "tool". */
  name: string;
  ms: number;
};

export type AnatomyRequest = {
  /** "req_7f3a_05". */
  id: string;
  /** What the agent was doing: "Draft reply". */
  step: string;
  /** The model billed for it; prices are looked up by this name. */
  model: string;
  /** When it started, ms after the run began. */
  at: number;
  /** Tokens per part. Cached tokens are the prompt prefix read from the cache. */
  tokens: Record<AnatomyPart, number>;
  /** Where the time went, in order. */
  phases: AnatomyPhase[];
  /** A finished request, one whose history was cut to fit, one that failed, or one whose content is hidden. @default "ok" */
  status?: "ok" | "truncated" | "errored" | "redacted";
  /** The failure, for an errored request: "529 · overloaded". */
  error?: string;
  /** For a truncated request, the history tokens dropped to fit. */
  dropped?: number;
  /** The start of the input, shown under the anatomy (never for a redacted request). */
  preview?: string;
};

/** Dollars per million tokens. */
export type AnatomyPrice = { input: number; output: number; cached: number };

export type RequestAnatomyProps = {
  /** The run's requests, in order. @default defaultAnatomyRequests */
  requests?: AnatomyRequest[];
  /** Prices per model name. @default defaultAnatomyPrices */
  prices?: Record<string, AnatomyPrice>;
  /** Controlled open request id, or null. */
  open?: string | null;
  /** Initial open request when uncontrolled. @default null */
  defaultOpen?: string | null;
  /** Fires when Enter or a click opens a request, or with null when it closes. */
  onOpenRequest?: (id: string | null, request: AnatomyRequest | null) => void;
  /** Controlled pinned request id, or null. */
  pinned?: string | null;
  /** Initial pinned request when uncontrolled. @default null */
  defaultPinned?: string | null;
  /** Fires when C or the pin button pins a request, or with null when it is unpinned. */
  onPin?: (id: string | null) => void;
  /** Fires when an open request is compared with a different pinned one. */
  onCompare?: (pinned: AnatomyRequest, open: AnatomyRequest) => void;
  /** Fires when a request id is copied. */
  onCopyId?: (id: string) => void;
  /** Controlled measure the bar is divided by. */
  sizeBy?: RequestAnatomySizeBy;
  /** Initial measure when uncontrolled. @default "tokens" */
  defaultSizeBy?: RequestAnatomySizeBy;
  /** Fires from the Tokens / Cost switch. */
  onSizeByChange?: (sizeBy: RequestAnatomySizeBy) => void;
  /** The run arrived, is on its way, or failed. @default "ready" */
  status?: RequestAnatomyStatus;
  /** "Try again" was pressed after the run failed to load. */
  onRetry?: () => void;
  /** The panel's heading. @default "Fernworks agent · run 7f3a" */
  title?: string;
  /** How money prints. @default "$0.049" by hand */
  formatMoney?: (amount: number) => string;
  /** How far apart the parts slide when a request opens, px. @default 6 */
  segmentGap?: number;
  /** The parts' colours: one hue in six steps, six hues, or ink greys. @default "tones" */
  palette?: RequestAnatomyPalette;
  /** The selection and the hue the palette turns from. @default "cobalt" */
  accent?: RequestAnatomyAccentName | (string & {});
  /** Read only: requests cannot be opened or pinned. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultAnatomyPrices: Record<string, AnatomyPrice> = {
  "Fernworks Model 3": { input: 3, output: 15, cached: 0.3 },
  "Fernworks Lite": { input: 0.25, output: 1.25, cached: 0.03 },
};

const M3 = "Fernworks Model 3";
const LITE = "Fernworks Lite";

const req = (
  n: number,
  step: string,
  model: string,
  at: number,
  t: [number, number, number, number, number, number],
  phases: [string, number][],
  extra: Partial<AnatomyRequest> = {},
): AnatomyRequest => ({
  id: `req_7f3a_${String(n).padStart(2, "0")}`,
  step,
  model,
  at,
  tokens: {
    system: t[0],
    context: t[1],
    history: t[2],
    input: t[3],
    output: t[4],
    cached: t[5],
  },
  phases: phases.map(([name, ms]) => ({ name, ms })),
  ...extra,
});

/**
 * A Fernworks support agent answering one customer: it plans, searches the
 * help centre, fetches the order, drafts a reply (the first try is refused
 * as overloaded and retried), looks the customer up behind a redaction
 * policy, summarises a long thread that had to be cut to fit, checks tone
 * and closes the ticket.
 */
export const defaultAnatomyRequests: AnatomyRequest[] = [
  req(
    1,
    "Plan",
    M3,
    0,
    [1820, 0, 640, 212, 386, 0],
    [
      ["queue", 40],
      ["prefill", 180],
      ["first token", 230],
      ["stream", 640],
    ],
    { preview: "Customer says order 4471 shows delivered but never arrived." },
  ),
  req(
    2,
    "Search help centre",
    LITE,
    1120,
    [640, 3420, 0, 118, 96, 1200],
    [
      ["queue", 20],
      ["prefill", 90],
      ["first token", 110],
      ["stream", 150],
    ],
    {
      preview: "Find: missing parcel, marked delivered, courier claim window.",
    },
  ),
  req(
    3,
    "Fetch order 4471",
    M3,
    1560,
    [520, 2104, 1252, 164, 212, 3920],
    [
      ["queue", 30],
      ["prefill", 140],
      ["first token", 160],
      ["stream", 220],
      ["tool", 940],
    ],
    { preview: "Call get_order with id 4471 and include the courier events." },
  ),
  req(
    4,
    "Draft reply",
    M3,
    3050,
    [480, 6840, 2410, 386, 0, 5600],
    [
      ["queue", 1180],
      ["prefill", 40],
    ],
    {
      status: "errored",
      error: "529 · overloaded",
      preview:
        "Draft a reply to Ines about order 4471: delivered, not received.",
    },
  ),
  req(
    5,
    "Draft reply",
    M3,
    4320,
    [480, 6840, 2410, 386, 1142, 5600],
    [
      ["queue", 60],
      ["prefill", 420],
      ["first token", 480],
      ["stream", 2380],
    ],
    {
      preview:
        "Draft a reply to Ines about order 4471: delivered, not received.",
    },
  ),
  req(
    6,
    "Look up customer",
    LITE,
    7740,
    [640, 1880, 0, 96, 140, 900],
    [
      ["queue", 20],
      ["prefill", 70],
      ["first token", 90],
      ["stream", 180],
    ],
    { status: "redacted" },
  ),
  req(
    7,
    "Summarise thread",
    M3,
    8160,
    [1820, 2400, 9800, 140, 420, 3200],
    [
      ["queue", 40],
      ["prefill", 760],
      ["first token", 820],
      ["stream", 900],
    ],
    {
      status: "truncated",
      dropped: 14212,
      preview:
        "Summarise the 38 messages with Ines since March for the handover.",
    },
  ),
  req(
    8,
    "Check tone",
    LITE,
    10760,
    [640, 1100, 0, 1240, 64, 800],
    [
      ["queue", 20],
      ["prefill", 60],
      ["first token", 70],
      ["stream", 80],
    ],
    {
      preview:
        "Is this reply warm, specific and free of blame? Answer yes or no.",
    },
  ),
  req(
    9,
    "Tag and close",
    LITE,
    11120,
    [640, 420, 0, 88, 32, 900],
    [
      ["queue", 10],
      ["prefill", 40],
      ["first token", 50],
      ["stream", 40],
    ],
    { preview: "Tag the ticket courier-claim and close it as solved." },
  ),
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const PARTS: AnatomyPart[] = [
  "system",
  "context",
  "history",
  "input",
  "output",
  "cached",
];

const PART_LABEL: Record<AnatomyPart, string> = {
  system: "System",
  context: "Context",
  history: "History",
  input: "Input",
  output: "Output",
  cached: "Cached",
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const commas = (n: number) =>
  String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Money by hand, three places under a dollar: "$0.049". */
const dollars = (amount: number): string => {
  const v = Math.abs(amount);
  const sign = amount < 0 ? "−" : "";
  if (v === 0) return "$0";
  if (v >= 1) return `${sign}$${v.toFixed(2)}`;
  if (v < 0.001) return `${sign}<$0.001`;
  return `${sign}$${v.toFixed(3)}`;
};

/** "18.4k" by hand: compact notation differs between Node and browsers. */
const compact = (n: number) => {
  const v = Math.abs(n);
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(v));
};

const seconds = (ms: number) =>
  ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;

const totalTokens = (r: AnatomyRequest) =>
  PARTS.reduce((s, p) => s + Math.max(0, r.tokens[p] ?? 0), 0);
const totalMs = (r: AnatomyRequest) =>
  r.phases.reduce((s, p) => s + Math.max(0, p.ms), 0);

const ACCENTS: Record<RequestAnatomyAccentName, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const accentVars = (accent: string): React.CSSProperties =>
  ({
    "--ra-ink": Object.hasOwn(ACCENTS, accent)
      ? ACCENTS[accent as RequestAnatomyAccentName]
      : accent,
    "--ra-wash": "color-mix(in oklab, var(--ra-ink) 10%, transparent)",
    "--ra-soft": "color-mix(in oklab, var(--ra-ink) 34%, transparent)",
  }) as React.CSSProperties;

/**
 * Parts are pigment: each colour sits at a fixed lightness in both themes,
 * turned from the accent's hue (tones step the lightness, spectrum the hue,
 * mono keeps to greys).
 */
const partColor = (palette: RequestAnatomyPalette, i: number): string => {
  if (palette === "mono")
    return `oklch(from var(--ink-2) ${[0.36, 0.47, 0.58, 0.68, 0.78, 0.86][i] ?? 0.6} 0.01 h)`;
  if (palette === "spectrum")
    return `oklch(from var(--ra-ink) 0.68 0.13 calc(h + ${[0, 52, 104, 156, 208, 290][i] ?? 0}))`;
  return `oklch(from var(--ra-ink) ${[0.4, 0.5, 0.6, 0.7, 0.56, 0.84][i] ?? 0.6} ${[0.12, 0.13, 0.12, 0.1, 0.16, 0.06][i] ?? 0.1} h)`;
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/* ----------------------------------------------------------------------- */
/*                                The bar                                   */
/* ----------------------------------------------------------------------- */

type Seg = { at: number; size: number };

/**
 * Lays the parts end to end along `length`, `gap` apart, at one scale per
 * `denom` (so a compared request keeps its true length). Parts with nothing
 * in them take no room and no gap; tiny ones keep 3px so they can be found.
 */
const layout = (
  values: number[],
  denom: number,
  length: number,
  gap: number,
): Seg[] => {
  const live = values.filter((v) => v > 0).length;
  const usable = Math.max(0, length - gap * Math.max(0, live - 1));
  const sizes = values.map((v) =>
    v > 0 ? Math.max(3, (v / (denom || 1)) * usable) : 0,
  );
  const sum = sizes.reduce((s, v) => s + v, 0);
  const fit = sum > usable && sum > 0 ? usable / sum : 1;
  const out: Seg[] = [];
  let at = 0;
  for (const raw of sizes) {
    const size = raw * fit;
    out.push({ at, size });
    if (size > 0) at += size + gap;
  }
  return out;
};

type BarProps = {
  values: number[];
  denom: number;
  gap: number;
  vertical: boolean;
  /** Animate from closed (no gaps) the first time it draws. */
  unfold: boolean;
  colors: string[];
  thickness: number;
  hot: number | null;
  torn: boolean;
  hatched: boolean;
  morphKey: string;
  motionSafe: boolean;
};

function Bar({
  values,
  denom,
  gap,
  vertical,
  unfold,
  colors,
  thickness,
  hot,
  torn,
  hatched,
  morphKey,
  motionSafe,
}: BarProps) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [length, setLength] = React.useState(vertical ? 200 : 600);
  React.useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(() => {
      const l = Math.round(vertical ? node.clientHeight : node.clientWidth);
      if (l > 0) setLength(l);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [node, vertical]);

  const target = React.useMemo(
    () => layout(values, denom, length, gap),
    [values, denom, length, gap],
  );
  const els = React.useRef<(HTMLSpanElement | null)[]>([]);
  const shown = React.useRef<Seg[] | null>(null);
  const latest = React.useRef(target);
  const unfoldRun = React.useRef<{ stop: () => void } | null>(null);

  const draw = React.useCallback(
    (segs: Seg[]) => {
      shown.current = segs;
      segs.forEach((s, i) => {
        const el = els.current[i];
        if (!el) return;
        el.style.transform = vertical
          ? `translateY(${r2(s.at)}px)`
          : `translateX(${r2(s.at)}px)`;
        if (vertical) el.style.height = `${r2(s.size)}px`;
        else el.style.width = `${r2(s.size)}px`;
      });
    },
    [vertical],
  );

  React.useLayoutEffect(() => {
    latest.current = target;
  });

  // Opened by a visitor, the bar arrives closed — every part touching — and
  // the parts slide apart on glide: the request comes apart in the hand. A
  // mount-only effect, so StrictMode's rehearsal simply plays it again.
  React.useLayoutEffect(() => {
    if (!unfold || !motionSafe) return;
    const closed = layout(values, denom, length, 0);
    draw(closed);
    let done = false;
    const ctrl = animate(0, 1, {
      ...springs.glide,
      onUpdate: (t) =>
        draw(
          latest.current.map((s, i) => {
            const f = closed[i] ?? s;
            return { at: lerp(f.at, s.at, t), size: lerp(f.size, s.size, t) };
          }),
        ),
      onComplete: () => {
        done = true;
        unfoldRun.current = null;
        draw(latest.current);
      },
    });
    unfoldRun.current = ctrl;
    return () => {
      ctrl.stop();
      unfoldRun.current = null;
      if (!done) draw(latest.current);
    };
    // Mount only: later changes morph through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A change of measure or comparison re-proportions on glide from the
  // frame on screen; a resize just redraws.
  const lastKey = React.useRef(morphKey);
  React.useLayoutEffect(() => {
    const changed = lastKey.current !== morphKey;
    lastKey.current = morphKey;
    const from = shown.current;
    if (!changed || !from || !motionSafe) {
      if (!unfoldRun.current) draw(target);
      return;
    }
    unfoldRun.current?.stop();
    unfoldRun.current = null;
    const ctrl = animate(0, 1, {
      ...springs.glide,
      onUpdate: (t) =>
        draw(
          target.map((s, i) => {
            const f = from[i] ?? s;
            return { at: lerp(f.at, s.at, t), size: lerp(f.size, s.size, t) };
          }),
        ),
      onComplete: () => draw(target),
    });
    return () => {
      ctrl.stop();
      draw(target);
    };
  }, [target, morphKey, motionSafe, draw]);

  return (
    <div
      ref={setNode}
      aria-hidden
      className={cn("relative shrink-0", vertical ? "h-full" : "w-full")}
      style={vertical ? { width: thickness } : { height: thickness }}
    >
      {values.map((_, i) => {
        const s = target[i] ?? { at: 0, size: 0 };
        const color = colors[i] ?? "var(--ra-ink)";
        const isTorn = torn && PARTS[i] === "history";
        return (
          <span
            key={PARTS[i]}
            ref={(el) => {
              els.current[i] = el;
            }}
            className={cn(
              "absolute top-0 left-0 rounded-[3px] transition-opacity duration-150",
              hot !== null && hot !== i && "opacity-30",
            )}
            style={{
              ...(vertical
                ? {
                    width: thickness,
                    height: r2(s.size),
                    transform: `translateY(${r2(s.at)}px)`,
                  }
                : {
                    height: thickness,
                    width: r2(s.size),
                    transform: `translateX(${r2(s.at)}px)`,
                  }),
              backgroundColor: color,
              backgroundImage: hatched
                ? "repeating-linear-gradient(135deg, color-mix(in oklab, var(--card) 55%, transparent) 0 2px, transparent 2px 5px)"
                : undefined,
              clipPath: isTorn
                ? vertical
                  ? "polygon(0 0, 100% 0, 100% calc(100% - 4px), 80% 100%, 60% calc(100% - 4px), 40% 100%, 20% calc(100% - 4px), 0 100%)"
                  : "polygon(0 0, calc(100% - 4px) 0, 100% 20%, calc(100% - 4px) 40%, 100% 60%, calc(100% - 4px) 80%, 100% 100%, 0 100%)"
                : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * A log of one agent run's model requests, each opening into its anatomy:
 * one long bar divided into system, context, history, input, output and
 * cached parts, with every part's tokens and price, and under it where the
 * time went with the slowest stretch marked.
 *
 * Opening is the moment it is built for. The row's height glides open, the
 * bar arrives closed with every part touching, and the parts slide apart on
 * `glide` to `segmentGap` while their captions rise into place in `cascade()`
 * order; then a bracket sweeps across the slowest stretch of latency. The
 * Tokens / Cost switch re-proportions the same parts on `glide` — output is
 * small in tokens and large in money, cached the reverse. Pin a request (C)
 * and any other you open shows the pinned one as a ghost bar at the same
 * scale, with per-part differences.
 *
 * The log is a grid: Up and Down move between requests, Home and End jump,
 * Enter or Space opens one, C pins it and Escape closes. Truncated, errored
 * and redacted requests are drawn as such. Below a 36rem container the bar
 * stands vertically beside its captions. Under reduced motion the bar opens
 * already apart and nothing slides; the numbers are all there.
 */
export function RequestAnatomy({
  requests = defaultAnatomyRequests,
  prices = defaultAnatomyPrices,
  open: openProp,
  defaultOpen = null,
  onOpenRequest,
  pinned: pinnedProp,
  defaultPinned = null,
  onPin,
  onCompare,
  onCopyId,
  sizeBy: sizeByProp,
  defaultSizeBy = "tokens",
  onSizeByChange,
  status = "ready",
  onRetry,
  title = "Fernworks agent · run 7f3a",
  formatMoney = dollars,
  segmentGap = 6,
  palette = "tones",
  accent = "cobalt",
  disabled = false,
  className,
}: RequestAnatomyProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;

  const [ownOpen, setOwnOpen] = React.useState<string | null>(defaultOpen);
  const openId = openProp === undefined ? ownOpen : openProp;
  const [ownPinned, setOwnPinned] = React.useState<string | null>(
    defaultPinned,
  );
  const pinnedId = pinnedProp === undefined ? ownPinned : pinnedProp;
  const [ownSize, setOwnSize] =
    React.useState<RequestAnatomySizeBy>(defaultSizeBy);
  const sizeBy = sizeByProp ?? ownSize;

  const [active, setActive] = React.useState(0);
  const [hot, setHot] = React.useState<number | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  // A request open from the first render is drawn open (no unfold on
  // hydration); every open after that, by a visitor or the host, unfolds.
  const [firstOpen, setFirstOpen] = React.useState<string | null>(openId);
  if (firstOpen !== null && firstOpen !== openId) setFirstOpen(null);

  const [rootNode, setRootNode] = React.useState<HTMLElement | null>(null);
  const [vertical, setVertical] = React.useState(false);
  React.useEffect(() => {
    if (!rootNode) return;
    const ro = new ResizeObserver(() => {
      const w = rootNode.clientWidth;
      if (w > 0) setVertical(w < 576);
    });
    ro.observe(rootNode);
    return () => ro.disconnect();
  }, [rootNode]);

  const copyTimer = React.useRef(0);
  React.useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  /* ------------------------------ readings ----------------------------- */

  const priceOf = React.useCallback(
    (r: AnatomyRequest) =>
      prices[r.model] ?? { input: 0, output: 0, cached: 0 },
    [prices],
  );
  const partCost = React.useCallback(
    (r: AnatomyRequest, p: AnatomyPart) => {
      const price = priceOf(r);
      const per =
        p === "output"
          ? price.output
          : p === "cached"
            ? price.cached
            : price.input;
      return (Math.max(0, r.tokens[p] ?? 0) * per) / 1e6;
    },
    [priceOf],
  );
  const costOf = React.useCallback(
    (r: AnatomyRequest) => PARTS.reduce((s, p) => s + partCost(r, p), 0),
    [partCost],
  );
  const measure = React.useCallback(
    (r: AnatomyRequest) =>
      PARTS.map((p) =>
        sizeBy === "cost" ? partCost(r, p) : Math.max(0, r.tokens[p] ?? 0),
      ),
    [sizeBy, partCost],
  );

  const runTokens = requests.reduce((s, r) => s + totalTokens(r), 0);
  const runCost = requests.reduce((s, r) => s + costOf(r), 0);
  const last = requests[requests.length - 1];
  const runMs = last ? last.at + totalMs(last) : 0;

  const colors = React.useMemo(
    () => PARTS.map((_, i) => partColor(palette, i)),
    [palette],
  );

  const indexOf = (id: string | null) =>
    id ? requests.findIndex((r) => r.id === id) : -1;
  const openReq = requests[indexOf(openId)] ?? null;
  const pinReq = requests[indexOf(pinnedId)] ?? null;

  const number = (r: AnatomyRequest) =>
    String(requests.indexOf(r) + 1).padStart(2, "0");
  const flagText = (r: AnatomyRequest) =>
    r.status === "truncated"
      ? "history truncated"
      : r.status === "errored"
        ? `failed, ${r.error ?? "error"}`
        : r.status === "redacted"
          ? "redacted"
          : "";

  /* ---------------------------- interactions --------------------------- */

  const setOpen = (r: AnatomyRequest | null) => {
    if (disabled) return;
    const next = r && r.id !== openId ? r : null;
    if (openProp === undefined) setOwnOpen(next?.id ?? null);
    onOpenRequest?.(next?.id ?? null, next);
    if (next && pinReq && pinReq.id !== next.id) onCompare?.(pinReq, next);
    setAnnouncement(
      next
        ? `Request ${number(next)} open: ${commas(totalTokens(next))} tokens, ${formatMoney(costOf(next))}.`
        : "Request closed.",
    );
  };

  const togglePin = (r: AnatomyRequest) => {
    if (disabled) return;
    const next = pinnedId === r.id ? null : r.id;
    if (pinnedProp === undefined) setOwnPinned(next);
    onPin?.(next);
    if (next && openReq && openReq.id !== next) onCompare?.(r, openReq);
    setAnnouncement(
      next
        ? `Request ${number(r)} pinned for comparison.`
        : `Request ${number(r)} unpinned.`,
    );
  };

  const copyId = (r: AnatomyRequest) => {
    try {
      void navigator.clipboard?.writeText(r.id).catch(() => {});
    } catch {
      // No clipboard in this context; the callback still reports the copy.
    }
    onCopyId?.(r.id);
    setCopied(r.id);
    setAnnouncement(`Copied ${r.id}.`);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(null), 1600);
  };

  const pickSize = (v: RequestAnatomySizeBy) => {
    if (v === sizeBy) return;
    if (sizeByProp === undefined) setOwnSize(v);
    onSizeByChange?.(v);
    setAnnouncement(v === "cost" ? "Sized by cost." : "Sized by tokens.");
  };

  const rowEls = React.useRef(new Map<string, HTMLDivElement>());
  const focusRow = (i: number) => {
    const n = clamp(i, 0, requests.length - 1);
    setActive(n);
    const r = requests[n];
    if (r) rowEls.current.get(r.id)?.focus();
  };

  const onRowKey = (
    event: React.KeyboardEvent,
    r: AnatomyRequest,
    i: number,
  ) => {
    if (event.target !== event.currentTarget) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusRow(i + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusRow(i - 1);
        break;
      case "Home":
        event.preventDefault();
        focusRow(0);
        break;
      case "End":
        event.preventDefault();
        focusRow(requests.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        setOpen(r);
        break;
      case "c":
      case "C":
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        event.preventDefault();
        togglePin(r);
        break;
      case "Escape":
        if (openId) {
          event.preventDefault();
          setOpen(null);
        }
        break;
      default:
        break;
    }
  };

  /* ------------------------------- header ------------------------------ */

  const sizeRadios = React.useRef(new Map<string, HTMLButtonElement>());
  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 pt-3">
      <span
        aria-hidden
        className="hidden size-8 shrink-0 items-center justify-center rounded-2 bg-[var(--ra-wash)] text-[var(--ra-ink)] @[30rem]:inline-flex"
      >
        <Layers className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p
          id={titleId}
          title={title}
          className="truncate text-[14px] leading-5 font-semibold"
        >
          {title}
        </p>
        <p className="truncate font-mono text-[11px] leading-4 text-ink-3 tabular-nums">
          {`${requests.length} ${requests.length === 1 ? "request" : "requests"} · ${compact(runTokens)} tokens · ${formatMoney(runCost)} · ${seconds(runMs)}`}
        </p>
      </div>
      <div
        role="radiogroup"
        aria-label="Size parts by"
        className="flex h-8 shrink-0 gap-0.5 rounded-2 border border-hairline bg-surface-1 p-0.5"
        onKeyDown={(event) => {
          if (
            !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
              event.key,
            )
          )
            return;
          event.preventDefault();
          const next = sizeBy === "tokens" ? "cost" : "tokens";
          pickSize(next);
          sizeRadios.current.get(next)?.focus();
        }}
      >
        {(["tokens", "cost"] as const).map((v) => {
          const on = sizeBy === v;
          return (
            <button
              key={v}
              ref={(el) => {
                if (el) sizeRadios.current.set(v, el);
                else sizeRadios.current.delete(v);
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => pickSize(v)}
              className={cn(
                "relative inline-flex h-full items-center rounded-[calc(var(--radius-2)-2px)] px-2.5 text-[12px] font-medium transition-colors",
                on ? "text-foreground" : "text-ink-3 hover:text-foreground",
                FOCUS,
              )}
            >
              {on ? (
                <motion.span
                  layoutId={`${uid}-size`}
                  aria-hidden
                  className="absolute inset-0 rounded-[calc(var(--radius-2)-2px)] border border-hairline bg-card shadow-[0_1px_2px_color-mix(in_oklab,var(--foreground)_8%,transparent)]"
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}
              <span className="relative">
                {v === "tokens" ? "Tokens" : "Cost"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  /* ---------------------------- compare tray --------------------------- */

  const tray = pinReq ? (
    <motion.div
      key="tray"
      className="mx-3 flex flex-col gap-1.5 rounded-3 border border-dashed border-[var(--ra-soft)] bg-[var(--ra-wash)] px-2.5 py-2"
      initial={{ opacity: 0, y: motionSafe ? -distances.step : 0 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: motionSafe ? springs.snap : { duration: durations.fast },
      }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Pin aria-hidden className="size-3.5 shrink-0 text-[var(--ra-ink)]" />
        <span className="min-w-0 flex-1 truncate text-[12px] leading-4">
          <span className="font-mono text-ink-3">{`${number(pinReq)} `}</span>
          <span className="font-medium">{pinReq.step}</span>
          <span className="font-mono text-ink-3 tabular-nums">{` · ${compact(totalTokens(pinReq))} · ${formatMoney(costOf(pinReq))}`}</span>
        </span>
        <button
          type="button"
          onClick={() => togglePin(pinReq)}
          aria-label={`Unpin request ${number(pinReq)}`}
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-1 text-ink-3 hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <X aria-hidden className="size-3.5" />
        </button>
      </div>
      <Bar
        values={measure(pinReq)}
        denom={measure(pinReq).reduce((s, v) => s + v, 0)}
        gap={2}
        vertical={false}
        unfold={false}
        colors={colors}
        thickness={6}
        hot={null}
        torn={pinReq.status === "truncated"}
        hatched={pinReq.status === "redacted"}
        morphKey={`${pinReq.id}|${sizeBy}`}
        motionSafe={motionSafe}
      />
    </motion.div>
  ) : null;

  /* ------------------------------ anatomy ------------------------------ */

  const anatomy = (r: AnatomyRequest) => {
    const values = measure(r);
    const ghost = pinReq && pinReq.id !== r.id ? pinReq : null;
    const ghostValues = ghost ? measure(ghost) : null;
    const total = values.reduce((s, v) => s + v, 0);
    const denom = Math.max(
      total,
      ghostValues ? ghostValues.reduce((s, v) => s + v, 0) : 0,
    );
    const slowest = r.phases.reduce(
      (best, p, i) => ((r.phases[best]?.ms ?? -1) < p.ms ? i : best),
      0,
    );
    const ms = totalMs(r);
    const step = cascade(PARTS.length);
    const unfold = r.id !== firstOpen;
    const tokensText = (n: number) => commas(n);
    const legend = (
      <ul
        className={cn(
          "grid gap-x-3 gap-y-1",
          vertical ? "min-w-0 flex-1 grid-cols-1" : "grid-cols-3",
        )}
      >
        {PARTS.map((p, i) => {
          const tk = Math.max(0, r.tokens[p] ?? 0);
          const cost = partCost(r, p);
          const share = total > 0 ? (values[i] ?? 0) / total : 0;
          const gt = ghost ? Math.max(0, ghost.tokens[p] ?? 0) : 0;
          const delta = ghost ? tk - gt : 0;
          const empty = tk === 0;
          return (
            <motion.li
              key={p}
              className="min-w-0"
              initial={
                unfold && motionSafe
                  ? { opacity: 0, y: distances.nudge }
                  : false
              }
              animate={{ opacity: 1, y: 0 }}
              transition={{
                opacity: {
                  duration: durations.base,
                  ease: easings.enter,
                  delay: 0.08 + i * step,
                },
                y: { ...springs.glide, delay: 0.08 + i * step },
              }}
            >
              <div
                onPointerEnter={() => setHot(i)}
                onPointerLeave={() => setHot(null)}
                className="flex min-w-0 items-start gap-1.5 rounded-1 py-0.5"
              >
                <span
                  aria-hidden
                  className="mt-[3px] size-2.5 shrink-0 rounded-[3px]"
                  style={{ backgroundColor: colors[i] }}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-baseline gap-1.5 text-[12px] leading-4">
                    <span className="font-medium">{PART_LABEL[p]}</span>
                    <span className="font-mono text-[10.5px] text-ink-3 tabular-nums">
                      {empty ? "—" : `${Math.round(share * 100)}%`}
                    </span>
                  </span>
                  <span className="truncate font-mono text-[10.5px] leading-4 text-ink-2 tabular-nums">
                    {p === "output" && r.status === "errored"
                      ? "failed · not billed"
                      : `${tokensText(tk)} · ${formatMoney(cost)}`}
                  </span>
                  {ghost && delta !== 0 ? (
                    <span
                      className={cn(
                        "font-mono text-[10px] leading-3.5 tabular-nums",
                        delta > 0 ? "text-warn" : "text-success",
                      )}
                    >
                      {`${delta > 0 ? "+" : "−"}${compact(Math.abs(delta))} vs ${number(ghost)}`}
                    </span>
                  ) : null}
                </span>
              </div>
            </motion.li>
          );
        })}
      </ul>
    );

    return (
      <div className="flex flex-col gap-3 px-3 pt-1 pb-3">
        <div
          className={cn(
            "flex gap-3",
            vertical ? "flex-row items-stretch" : "flex-col",
          )}
          onPointerLeave={() => setHot(null)}
        >
          <div
            className={cn(
              "flex gap-1",
              vertical ? "h-56 flex-row" : "flex-col",
            )}
          >
            <Bar
              values={values}
              denom={denom}
              gap={clamp(segmentGap, 0, 24)}
              vertical={vertical}
              unfold={unfold}
              colors={colors}
              thickness={26}
              hot={hot}
              torn={r.status === "truncated"}
              hatched={r.status === "redacted"}
              morphKey={`${sizeBy}|${ghost?.id ?? ""}|${segmentGap}`}
              motionSafe={motionSafe}
            />
            {ghost && ghostValues ? (
              <div className={cn("opacity-60", vertical ? "h-full" : "")}>
                <Bar
                  values={ghostValues}
                  denom={denom}
                  gap={clamp(segmentGap, 0, 24)}
                  vertical={vertical}
                  unfold={false}
                  colors={colors}
                  thickness={5}
                  hot={hot}
                  torn={ghost.status === "truncated"}
                  hatched
                  morphKey={`${sizeBy}|${ghost.id}|${segmentGap}`}
                  motionSafe={motionSafe}
                />
              </div>
            ) : null}
          </div>
          {legend}
        </div>

        {r.status === "truncated" ? (
          <p className="flex items-center gap-1.5 text-[11.5px] leading-4 text-warn">
            <Scissors aria-hidden className="size-3.5 shrink-0" />
            {`${commas(r.dropped ?? 0)} tokens of history dropped to fit`}
          </p>
        ) : null}
        {r.status === "errored" ? (
          <p className="flex items-center gap-1.5 text-[11.5px] leading-4 text-danger">
            <CircleX aria-hidden className="size-3.5 shrink-0" />
            {`${r.error ?? "Failed"} after ${seconds(ms)} · the prompt was still billed`}
          </p>
        ) : null}

        {/* Where the time went. */}
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
              Latency
            </span>
            <span className="font-mono text-[10.5px] text-ink-2 tabular-nums">
              {seconds(ms)}
            </span>
          </div>
          <div aria-hidden className="flex h-2.5 w-full gap-[2px]">
            {r.phases.map((p, i) => (
              <span
                key={`${p.name}-${i}`}
                className={cn(
                  "h-full rounded-[2px]",
                  i === slowest ? "bg-[var(--ra-ink)]" : "bg-hairline-strong",
                )}
                style={{ flexGrow: Math.max(1, p.ms), flexBasis: 0 }}
              />
            ))}
          </div>
          <div aria-hidden className="flex w-full gap-[2px]">
            {r.phases.map((p, i) => (
              <span
                key={`${p.name}-${i}`}
                className="relative min-w-0"
                style={{ flexGrow: Math.max(1, p.ms), flexBasis: 0 }}
              >
                {i === slowest ? (
                  <motion.span
                    className="block h-1.5 origin-left rounded-b-[2px] border-x border-b border-[var(--ra-ink)]"
                    initial={unfold && motionSafe ? { scaleX: 0 } : false}
                    animate={{ scaleX: 1 }}
                    transition={{ ...springs.glide, delay: 0.28 }}
                  />
                ) : null}
              </span>
            ))}
          </div>
          <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] leading-4 text-ink-3">
            {r.phases.map((p, i) => (
              <span
                key={`${p.name}-${i}`}
                className={cn(
                  i === slowest && "font-medium text-[var(--ra-ink)]",
                )}
              >
                {`${i === slowest ? "Slowest · " : ""}${p.name} ${seconds(p.ms)}`}
              </span>
            ))}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <p
            className="min-w-0 flex-1 truncate font-mono text-[11px] leading-4 text-ink-3"
            title={r.status === "redacted" ? undefined : r.preview}
          >
            {r.status === "redacted" ? (
              <span className="inline-flex items-center gap-1.5">
                <EyeOff aria-hidden className="size-3.5" />
                Redacted by policy · content hidden, counts kept
              </span>
            ) : (
              (r.preview ?? "")
            )}
          </p>
          <button
            type="button"
            onClick={() => togglePin(r)}
            aria-pressed={pinnedId === r.id}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-2 border px-2 text-[11.5px] font-medium transition-colors",
              pinnedId === r.id
                ? "border-[var(--ra-soft)] bg-[var(--ra-wash)] text-[var(--ra-ink)]"
                : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            {pinnedId === r.id ? (
              <PinOff aria-hidden className="size-3.5" />
            ) : (
              <Pin aria-hidden className="size-3.5" />
            )}
            {pinnedId === r.id ? "Pinned" : "Pin to compare"}
          </button>
          <button
            type="button"
            onClick={() => copyId(r)}
            aria-label={`Copy request id ${r.id}`}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2 font-mono text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <span className="relative inline-flex size-3.5 items-center justify-center">
              <AnimatePresence initial={false}>
                {copied === r.id ? (
                  <motion.span
                    key="ok"
                    className="absolute inset-0 inline-flex items-center justify-center text-success"
                    initial={{ opacity: 0, scale: motionSafe ? 0.6 : 1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={motionSafe ? springs.flick : { duration: 0 }}
                  >
                    <Check className="size-3.5" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="copy"
                    className="absolute inset-0 inline-flex items-center justify-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: durations.fast }}
                  >
                    <Copy className="size-3.5" />
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            {copied === r.id ? "Copied" : r.id}
          </button>
        </div>
      </div>
    );
  };

  /* -------------------------------- rows ------------------------------- */

  const rowGrid =
    "grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-2 @[36rem]:grid-cols-[1.5rem_minmax(0,1fr)_8.5rem_4rem_4rem_3.5rem_1.25rem]";

  const log = (
    <div
      role="grid"
      aria-labelledby={titleId}
      aria-describedby={hintId}
      className="flex flex-col"
    >
      <div
        role="row"
        className={cn(
          rowGrid,
          "border-b border-hairline px-3 pb-1.5 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase",
        )}
      >
        <span role="columnheader">#</span>
        <span role="columnheader">Step</span>
        <span role="columnheader" className="hidden @[36rem]:block">
          Model
        </span>
        <span role="columnheader" className="hidden text-right @[36rem]:block">
          Tokens
        </span>
        <span role="columnheader" className="hidden text-right @[36rem]:block">
          Cost
        </span>
        <span role="columnheader" className="hidden text-right @[36rem]:block">
          Time
        </span>
        <span role="columnheader" className="text-right">
          <span className="sr-only">State</span>
        </span>
      </div>
      {requests.map((r, i) => {
        const isOpen = r.id === openId;
        const isPinned = r.id === pinnedId;
        const flag = flagText(r);
        const name = `Request ${number(r)}, ${r.step}, ${r.model}, ${commas(totalTokens(r))} tokens, ${formatMoney(costOf(r))}, ${seconds(totalMs(r))}${flag ? `, ${flag}` : ""}${isPinned ? ", pinned" : ""}`;
        return (
          <React.Fragment key={r.id}>
            <div
              ref={(el) => {
                if (el) rowEls.current.set(r.id, el);
                else rowEls.current.delete(r.id);
              }}
              role="row"
              aria-label={name}
              aria-expanded={isOpen}
              aria-disabled={disabled || undefined}
              tabIndex={i === active ? 0 : -1}
              onFocus={() => setActive(i)}
              onClick={() => {
                setActive(i);
                setOpen(r);
              }}
              onKeyDown={(event) => onRowKey(event, r, i)}
              className={cn(
                rowGrid,
                "relative cursor-pointer border-b border-hairline px-3 py-1.5 text-left transition-colors",
                isOpen ? "bg-[var(--ra-wash)]" : "hover:bg-surface-1",
                disabled && "cursor-default",
                "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              )}
            >
              <span
                role="gridcell"
                className="font-mono text-[11px] text-ink-3 tabular-nums"
              >
                {number(r)}
              </span>
              <span role="gridcell" className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] leading-5 font-medium">
                  {r.step}
                </span>
                <span className="truncate font-mono text-[10.5px] leading-4 text-ink-3 tabular-nums @[36rem]:hidden">
                  {`${r.model.replace("Fernworks ", "")} · ${compact(totalTokens(r))} · ${formatMoney(costOf(r))} · ${seconds(totalMs(r))}`}
                </span>
              </span>
              <span
                role="gridcell"
                className="hidden truncate text-[12px] text-ink-2 @[36rem]:block"
              >
                {r.model}
              </span>
              <span
                role="gridcell"
                className="hidden text-right font-mono text-[11.5px] text-ink-2 tabular-nums @[36rem]:block"
              >
                {compact(totalTokens(r))}
              </span>
              <span
                role="gridcell"
                className="hidden text-right font-mono text-[11.5px] text-foreground tabular-nums @[36rem]:block"
              >
                {formatMoney(costOf(r))}
              </span>
              <span
                role="gridcell"
                className="hidden text-right font-mono text-[11.5px] text-ink-2 tabular-nums @[36rem]:block"
              >
                {seconds(totalMs(r))}
              </span>
              <span
                role="gridcell"
                className="flex items-center justify-end gap-1 text-ink-3"
              >
                {isPinned ? (
                  <Pin
                    aria-hidden
                    className="size-3.5 shrink-0 text-[var(--ra-ink)]"
                  />
                ) : null}
                {r.status === "truncated" ? (
                  <Scissors
                    aria-hidden
                    className="size-3.5 shrink-0 text-warn"
                  />
                ) : r.status === "errored" ? (
                  <CircleX
                    aria-hidden
                    className="size-3.5 shrink-0 text-danger"
                  />
                ) : r.status === "redacted" ? (
                  <EyeOff aria-hidden className="size-3.5 shrink-0" />
                ) : null}
              </span>
            </div>
            <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.div
                  key={`${r.id}-anatomy`}
                  role="row"
                  className="overflow-hidden border-b border-hairline bg-[var(--ra-wash)]"
                  initial={
                    motionSafe ? { height: 0, opacity: 0 } : { opacity: 0 }
                  }
                  animate={{
                    height: "auto",
                    opacity: 1,
                    transition: {
                      height: motionSafe ? springs.glide : { duration: 0 },
                      opacity: { duration: durations.fast },
                    },
                  }}
                  exit={{
                    height: 0,
                    opacity: 0,
                    transition: exitFor(durations.base),
                  }}
                >
                  <div
                    role="gridcell"
                    aria-label={`Anatomy of request ${number(r)}`}
                    onKeyDown={(event) => {
                      // Escape from the Pin or Copy buttons closes the request
                      // too, and hands focus back to its row.
                      if (event.key !== "Escape") return;
                      event.preventDefault();
                      event.stopPropagation();
                      setOpen(null);
                      focusRow(i);
                    }}
                  >
                    {anatomy(r)}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </React.Fragment>
        );
      })}
    </div>
  );

  /* -------------------------------- body ------------------------------- */

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div aria-hidden className="flex flex-col gap-2 px-3 pb-3">
        {[0.7, 0.5, 0.62, 0.44, 0.58].map((w, i) => (
          <div key={i} className="flex items-center gap-3 py-1">
            <span className="h-3 w-5 rounded-1 bg-surface-2" />
            <span
              className="h-3 rounded-1 bg-surface-2"
              style={{ width: `${w * 100}%` }}
            />
          </div>
        ))}
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-start gap-2 px-3 pb-4">
        <p className="inline-flex items-center gap-1.5 text-[13px] text-danger">
          <TriangleAlert aria-hidden className="size-4 shrink-0" />
          This run couldn’t load.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={() => onRetry()}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    );
  } else if (requests.length === 0) {
    body = (
      <p className="px-3 pb-4 text-[13px] text-ink-3">
        No requests in this run yet.
      </p>
    );
  } else {
    body = log;
  }

  return (
    <section
      ref={setRootNode}
      aria-labelledby={titleId}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container flex max-h-[36rem] w-full [scrollbar-width:thin] flex-col gap-3 overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={accentVars(accent)}
    >
      {header}
      <AnimatePresence initial={false}>{tray}</AnimatePresence>
      {body}
      <p id={hintId} className="sr-only">
        Up and Down move between requests. Enter opens one, C pins it for
        comparison, Escape closes it.
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
