"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";
import {
  ChevronRight,
  Eye,
  EyeOff,
  Inbox,
  KeyRound,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type WebhookChipStyle = "pill" | "tag" | "dot";
export type WebhookPayloadTheme = "plain" | "tinted" | "night";
export type WebhookDensity = "compact" | "regular" | "roomy";
export type WebhookStatus = "ready" | "loading" | "error";

export type WebhookEndpoint = {
  id: string;
  /** What the endpoint is for, in a few words. */
  name: string;
  /** Host and path, without the scheme. */
  url: string;
  /** The events it is subscribed to. */
  events: string[];
  /** The signing secret. Masked until revealed. */
  secret: string;
  /** Deliveries are queued instead of sent. */
  paused?: boolean;
};

export type WebhookReplayResult = {
  /** The HTTP status the endpoint answered with. */
  status: number;
  /** How long it took, ms. */
  duration: number;
  /** The response body, as text. */
  body?: string;
};

export type WebhookDelivery = {
  id: string;
  /** The endpoint it was sent to, by id. */
  endpoint: string;
  event: string;
  /** The HTTP status of the last attempt. */
  status: number;
  /** How long the last attempt took, ms. */
  duration: number;
  /** Attempts so far, from 1. */
  attempt: number;
  /** When the last attempt was made, ms. */
  at: number;
  /** The JSON body that was sent. */
  payload: Record<string, unknown>;
  /** The last response body, as text. */
  response?: string;
  /** What a replay answers when `onReplay` returns nothing. */
  replayAs?: WebhookReplayResult;
};

export type WebhookReplayProps = {
  /** How each status code is drawn: a tinted pill, a square tag with a leading bar, or a dot and the bare code. @default "pill" */
  chipStyle?: WebhookChipStyle;
  /** How payloads, headers and responses are coloured: one ink, tinted tokens, or a dark code panel in both themes. @default "tinted" */
  payloadTheme?: WebhookPayloadTheme;
  /** Row height and type in the log. @default "regular" */
  density?: WebhookDensity;
  /** The endpoints. @default defaultWebhookEndpoints */
  endpoints?: WebhookEndpoint[];
  /** Controlled deliveries, most recent first. Replays are reported through `onDeliveriesChange`. */
  deliveries?: WebhookDelivery[];
  /** Initial deliveries when uncontrolled. @default defaultWebhookDeliveries */
  defaultDeliveries?: WebhookDelivery[];
  /** Fires with every delivery after a replay or a test event. */
  onDeliveriesChange?: (deliveries: WebhookDelivery[]) => void;
  /** Controlled endpoint shown, by id. */
  endpoint?: string;
  /** Initial endpoint when uncontrolled. @default the first */
  defaultEndpoint?: string;
  /** Fires from the tab press or key that chose another endpoint. */
  onEndpointChange?: (id: string) => void;
  /** Replay was pressed. Return the result, or a promise of it; return nothing and the delivery's `replayAs` answers. */
  onReplay?: (
    delivery: WebhookDelivery,
  ) => WebhookReplayResult | Promise<WebhookReplayResult> | void;
  /** Pause or Resume was pressed. */
  onPause?: (endpoint: WebhookEndpoint, paused: boolean) => void;
  /** Rotate was confirmed. Return the new secret, or nothing for a generated one. */
  onRotateSecret?: (endpoint: WebhookEndpoint) => string | void;
  /** Send test event was pressed on an empty log. */
  onSendTest?: (endpoint: WebhookEndpoint) => void;
  /** The current time, ms; delivery times are read against it. Never read from the clock. @default defaultWebhookNow */
  now?: number;
  /** Whether the log has arrived. @default "ready" */
  status?: WebhookStatus;
  /** "Try again" was pressed after the log failed to load. */
  onRetry?: () => void;
  /** The heading. @default "Webhooks" */
  title?: string;
  /** Height of the surface, px; the log scrolls inside. @default 540 */
  height?: number;
  /** Nothing can be replayed, paused or rotated. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;

/** Monday 19 October 2026, 14:30. */
export const defaultWebhookNow = Date.UTC(2026, 9, 19, 14, 30);

export const defaultWebhookEndpoints: WebhookEndpoint[] = [
  {
    id: "orders",
    name: "Orders feed",
    url: "hooks.coldbrook.dev/v2/orders",
    events: ["order.created", "order.paid", "order.refunded"],
    secret: "whsec_7Kq2Vd9mP4xLr8Tz3f9a",
  },
  {
    id: "fulfil",
    name: "Fieldline fulfilment",
    url: "fulfil.fieldline.dev/in/coldbrook",
    events: ["order.paid"],
    secret: "whsec_Q1n6Bw0eHs5Yc2Ju7k1d",
  },
];

const order = (
  n: number,
  total: number,
  items: number,
  state: string,
  extra: Record<string, unknown> = {},
) => ({
  order: {
    id: `CB-${10_400 + n}`,
    state,
    total,
    currency: "GBP",
    items,
    customer: `cus_${(n * 7919).toString(36)}`,
    ...extra,
  },
});

const delivery = (
  i: number,
  event: string,
  status: number,
  duration: number,
  attempt: number,
  minutesAgo: number,
  data: Record<string, unknown>,
  response?: string,
  replayAs?: WebhookReplayResult,
): WebhookDelivery => ({
  id: `dlv_${(0x9f31 - i * 5).toString(16)}`,
  endpoint: "orders",
  event,
  status,
  duration,
  attempt,
  at: defaultWebhookNow - minutesAgo * MIN,
  payload: {
    id: `evt_${(0x51c0 + i * 37).toString(16)}`,
    type: event,
    created: new Date(defaultWebhookNow - minutesAgo * MIN)
      .toISOString()
      .replace(".000", ""),
    data,
  },
  response: response ?? '{"received":true}',
  replayAs,
});

/**
 * Coldbrook's orders feed over the last two hours: nine deliveries, three
 * failed — a timeout and a moved endpoint that will take a replay, and an
 * unknown product that will still be refused.
 */
export const defaultWebhookDeliveries: WebhookDelivery[] = [
  delivery(0, "order.paid", 200, 182, 1, 2, order(82, 4820, 3, "paid")),
  delivery(1, "order.created", 200, 96, 1, 4, order(83, 1260, 1, "open")),
  delivery(
    2,
    "order.paid",
    504,
    10_000,
    3,
    9,
    order(79, 9350, 6, "paid"),
    '{"error":"upstream timeout"}',
    { status: 200, duration: 212, body: '{"received":true}' },
  ),
  delivery(
    3,
    "order.refunded",
    200,
    240,
    1,
    14,
    order(71, 2400, 2, "refunded", { reason: "damaged" }),
  ),
  delivery(
    4,
    "order.created",
    422,
    318,
    2,
    21,
    order(77, 3190, 2, "open", { sku: "FW-BKT-12" }),
    '{"error":"unknown sku","sku":"FW-BKT-12"}',
    { status: 409, duration: 287, body: '{"error":"order already exists"}' },
  ),
  delivery(5, "order.paid", 200, 151, 1, 33, order(74, 640, 1, "paid")),
  delivery(
    6,
    "order.created",
    410,
    64,
    1,
    48,
    order(75, 5120, 4, "open"),
    '{"error":"endpoint moved"}',
    { status: 200, duration: 133, body: '{"received":true}' },
  ),
  delivery(7, "order.created", 200, 88, 1, 62, order(74, 640, 1, "open")),
  delivery(8, "order.paid", 200, 175, 1, 118, order(68, 7710, 5, "paid")),
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";

const OK_PIGMENT = "oklch(from var(--success) 0.72 0.14 h)";
const BAD_PIGMENT = "oklch(from var(--danger) 0.66 0.19 h)";

const STATUS_WORDS: Record<number, string> = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No content",
  400: "Bad request",
  401: "Unauthorised",
  403: "Forbidden",
  404: "Not found",
  409: "Conflict",
  410: "Gone",
  422: "Unprocessable",
  429: "Too many requests",
  500: "Server error",
  502: "Bad gateway",
  503: "Unavailable",
  504: "Gateway timeout",
};

const DENSITY: Record<
  WebhookDensity,
  { row: string; text: string; meta: string; pad: string }
> = {
  compact: {
    row: "py-1.5",
    text: "text-[12.5px]",
    meta: "text-[10.5px]",
    pad: "px-3",
  },
  regular: {
    row: "py-2.5",
    text: "text-[13px]",
    meta: "text-[11px]",
    pad: "px-4",
  },
  roomy: {
    row: "py-3.5",
    text: "text-[13.5px]",
    meta: "text-[11.5px]",
    pad: "px-5",
  },
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const ok = (code: number) => code >= 200 && code < 300;
/** Status 0 is a delivery still on its way: neither delivered nor failed. */
const failing = (code: number) => code !== 0 && !ok(code);
const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;
const words = (code: number) =>
  code === 0 ? "Sending" : (STATUS_WORDS[code] ?? `Status ${code}`);
const durationText = (ms: number) =>
  ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
const agoText = (at: number, now: number) => {
  const m = Math.floor((now - at) / MIN);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
};

/** A string hash for seeded choices (unsigned, so it never goes negative). */
const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};
const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const freshSecret = (seed: string) => {
  let out = "whsec_";
  for (let i = 0; i < 22; i++)
    out += GLYPHS[hash(`${seed}:${i}`) % GLYPHS.length] ?? "x";
  return out;
};
const masked = (secret: string) =>
  `${secret.slice(0, 6)}${"•".repeat(8)}${secret.slice(-4)}`;

type Token = { text: string; kind: "key" | "str" | "num" | "lit" | "punct" };

/** Splits pretty JSON into coloured runs: keys, strings, numbers, literals. */
function tokenize(json: string): Token[] {
  const out: Token[] = [];
  const re =
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let last = 0;
  for (const m of json.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: json.slice(last, at), kind: "punct" });
    if (m[1]) {
      out.push({ text: m[1], kind: m[2] ? "key" : "str" });
      if (m[2]) out.push({ text: m[2], kind: "punct" });
    } else if (m[3]) out.push({ text: m[3], kind: "lit" });
    else out.push({ text: m[0], kind: "num" });
    last = at + m[0].length;
  }
  if (last < json.length) out.push({ text: json.slice(last), kind: "punct" });
  return out;
}

const THEME_INK: Record<WebhookPayloadTheme, Record<Token["kind"], string>> = {
  plain: {
    key: "text-foreground",
    str: "text-ink-2",
    num: "text-ink-2",
    lit: "text-ink-2",
    punct: "text-ink-3",
  },
  tinted: {
    key: "text-cobalt-bright",
    str: "text-success",
    num: "text-warn",
    lit: "text-signal",
    punct: "text-ink-3",
  },
  night: {
    key: "text-[oklch(0.8_0.09_250)]",
    str: "text-[oklch(0.84_0.12_150)]",
    num: "text-[oklch(0.86_0.12_80)]",
    lit: "text-[oklch(0.8_0.1_320)]",
    punct: "text-[oklch(0.68_0.01_258)]",
  },
};

/* ----------------------------------------------------------------------- */
/*                               Small parts                                */
/* ----------------------------------------------------------------------- */

/** True from the frame after the first commit: what arrives later animates in. */
function useCommitted(): boolean {
  const [committed, setCommitted] = React.useState(false);
  React.useEffect(() => {
    const id = window.requestAnimationFrame(() => setCommitted(true));
    return () => window.cancelAnimationFrame(id);
  }, []);
  return committed;
}

/** A box that opens to its content's measured height on glide. */
function Reveal({
  open,
  motionSafe,
  id,
  children,
}: {
  open: boolean;
  motionSafe: boolean;
  id?: string;
  children: React.ReactNode;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(() => setHeight(node.offsetHeight));
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return (
    <motion.div
      id={id}
      initial={false}
      animate={{ height: open ? height : 0, opacity: open ? 1 : 0 }}
      transition={
        motionSafe
          ? { height: springs.glide, opacity: { duration: durations.fast } }
          : { duration: 0 }
      }
      style={{ overflow: "clip", overflowClipMargin: 4 }}
      aria-hidden={!open}
      inert={!open}
    >
      <div ref={setNode}>{children}</div>
    </motion.div>
  );
}

/**
 * A status code. A new code flips in about the horizontal axis: the old
 * one turns away on the exit ease, the new one lands on snap when it is a
 * success (one crisp overshoot) and on flick when it is not — a failure
 * never celebrates. A success also blooms one soft ring.
 */
function StatusChip({
  code,
  flip,
  bloom,
  chipStyle,
  sending,
  motionSafe,
}: {
  code: number;
  /** Changes when the chip should flip, even to the same code. */
  flip: string;
  bloom: number;
  chipStyle: WebhookChipStyle;
  sending: boolean;
  motionSafe: boolean;
}) {
  // Only a bloom earned while this chip is on screen plays.
  const [baseBloom] = React.useState(bloom);
  const good = ok(code);
  const pending = code === 0;
  const tone = pending ? "text-ink-3" : good ? "text-success" : "text-danger";
  const face =
    chipStyle === "pill"
      ? cn(
          "h-6 rounded-full px-2",
          pending
            ? "bg-surface-2"
            : good
              ? "bg-[color-mix(in_oklab,var(--success)_16%,transparent)]"
              : "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)]",
        )
      : chipStyle === "tag"
        ? cn(
            "h-6 rounded-1 border-l-[3px] bg-surface-2 pr-1.5 pl-1",
            pending
              ? "border-l-hairline-strong"
              : good
                ? "border-l-success"
                : "border-l-danger",
          )
        : "h-6 gap-1.5 px-0.5";
  return (
    <span
      data-wr-chip=""
      className="relative inline-flex shrink-0 [perspective:240px]"
      title={`${code} ${words(code)}`}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={flip}
          className={cn(
            "inline-flex items-center font-mono text-[11.5px] font-medium tabular-nums transition-opacity duration-200",
            face,
            tone,
            sending && "opacity-60",
          )}
          initial={motionSafe ? { rotateX: -90, opacity: 0 } : { opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          exit={
            motionSafe
              ? {
                  rotateX: 90,
                  opacity: 0,
                  transition: { duration: 0.12, ease: easings.exit },
                }
              : { opacity: 0, transition: { duration: durations.fast } }
          }
          transition={
            motionSafe
              ? {
                  rotateX: {
                    ...(good ? springs.snap : springs.flick),
                    delay: 0.1,
                  },
                  opacity: { duration: durations.fast, delay: 0.1 },
                }
              : { duration: durations.fast }
          }
          style={{ originY: 0.5 }}
        >
          {chipStyle === "dot" ? (
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{
                backgroundColor: pending
                  ? "var(--ink-3)"
                  : good
                    ? OK_PIGMENT
                    : BAD_PIGMENT,
              }}
            />
          ) : null}
          {pending ? "···" : code}
        </motion.span>
      </AnimatePresence>
      {bloom > baseBloom && motionSafe ? (
        <motion.span
          key={bloom}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full border-2"
          style={{ borderColor: OK_PIGMENT }}
          initial={{ opacity: 0.7, scale: 1 }}
          animate={{ opacity: 0, scale: 1.7 }}
          transition={{ duration: 0.55, ease: easings.enter, delay: 0.12 }}
        />
      ) : null}
    </span>
  );
}

type Geometry = {
  sx: number;
  sy: number;
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  ex: number;
  ey: number;
};

const pointAt = (g: Geometry, t: number) => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: r2(a * g.sx + b * g.c1x + c * g.c2x + d * g.ex),
    y: r2(a * g.sy + b * g.c1y + c * g.c2y + d * g.ey),
  };
};

/** A stretch of the curve between two times, as a polyline (empty when it has none). */
const segment = (g: Geometry, a: number, b: number) => {
  const from = Math.max(0, a);
  const to = Math.min(1, b);
  if (to <= from) return "M 0 0";
  let d = "";
  for (let i = 0; i <= 6; i++) {
    const p = pointAt(g, from + ((to - from) * i) / 6);
    d += `${i === 0 ? "M" : " L"} ${p.x} ${p.y}`;
  }
  return d;
};

/**
 * The replay pulse: a comet — a bright head and a tail that fades behind it
 * — riding one motion value from the event name to the status column. If
 * the answer is not back when it arrives, the head breathes at the chip.
 */
function Pulse({
  geometry,
  run,
  waiting,
  onArrive,
}: {
  geometry: Geometry;
  run: number;
  waiting: boolean;
  onArrive: (run: number) => void;
}) {
  const t = useMotionValue(0);
  const arrive = React.useRef(onArrive);
  React.useEffect(() => {
    arrive.current = onArrive;
  });
  React.useEffect(() => {
    let live = true;
    t.jump(0);
    // A plain number written into the value: a value bound to an element
    // that has only just mounted can sit idle under animate().
    const controls = animate(0, 1, {
      duration: 0.52,
      ease: easings.move,
      onUpdate: (v) => t.set(v),
      onComplete: () => {
        if (live) arrive.current(run);
      },
    });
    return () => {
      live = false;
      controls.stop();
    };
  }, [run, t]);
  const d = `M ${geometry.sx} ${geometry.sy} C ${geometry.c1x} ${geometry.c1y} ${geometry.c2x} ${geometry.c2y} ${geometry.ex} ${geometry.ey}`;
  // The comet is three short stretches of the curve behind the head, each
  // fainter than the one ahead: a tail that fades without a gradient.
  const near = useTransform(t, (v) => segment(geometry, v - 0.1, v));
  const mid = useTransform(t, (v) => segment(geometry, v - 0.2, v - 0.1));
  const far = useTransform(t, (v) => segment(geometry, v - 0.32, v - 0.2));
  const hx = useTransform(t, (v) => pointAt(geometry, v).x);
  const hy = useTransform(t, (v) => pointAt(geometry, v).y);
  const fade = useTransform(t, [0, 0.08], [0, 1]);
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
    >
      <path
        d={d}
        fill="none"
        strokeWidth={1}
        className="stroke-[color-mix(in_oklab,var(--accent-bright)_30%,transparent)]"
        strokeDasharray="2 4"
      />
      <motion.g style={{ opacity: fade }}>
        <motion.path
          d={far}
          fill="none"
          strokeWidth={1.5}
          strokeLinecap="round"
          className="stroke-cobalt-bright opacity-25"
        />
        <motion.path
          d={mid}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          className="stroke-cobalt-bright opacity-55"
        />
        <motion.path
          d={near}
          fill="none"
          strokeWidth={2.5}
          strokeLinecap="round"
          className="stroke-cobalt-bright"
        />
        <motion.circle
          r={3.5}
          className="fill-cobalt-bright"
          style={{ cx: hx, cy: hy }}
        />
      </motion.g>
      {waiting ? (
        <motion.circle
          cx={geometry.ex}
          cy={geometry.ey}
          r={4}
          className="fill-none stroke-cobalt-bright"
          strokeWidth={1.5}
          initial={{ opacity: 0.8, scale: 1 }}
          animate={{ opacity: 0, scale: 2.4 }}
          // A bounded wait: after about seven seconds the head simply rests
          // at the chip, so a host that never answers leaves nothing looping.
          transition={{ duration: 0.9, ease: easings.enter, repeat: 8 }}
          style={{ originX: 0.5, originY: 0.5 }}
        />
      ) : null}
    </svg>
  );
}

/** The secret's tail scrambles through seeded glyphs and settles letter by letter. */
function SecretText({
  secret,
  reveal,
  spin,
  motionSafe,
}: {
  secret: string;
  reveal: boolean;
  spin: number;
  motionSafe: boolean;
}) {
  const target = reveal ? secret : masked(secret);
  const text = useMotionValue(target);
  React.useEffect(() => {
    if (spin === 0 || !motionSafe) {
      text.set(target);
      return;
    }
    const tail = reveal ? target.length - 6 : 4;
    const head = target.slice(0, target.length - tail);
    let step = 0;
    const controls = animate(0, 1, {
      duration: 0.46,
      ease: easings.linear,
      onUpdate: (v) => {
        step += 1;
        let out = head;
        for (let i = 0; i < tail; i++) {
          const settled = v * (tail + 2) - 2 > i;
          const real = target[head.length + i] ?? "";
          out += settled
            ? real
            : (GLYPHS[hash(`${spin}:${i}:${step}`) % GLYPHS.length] ?? real);
        }
        text.set(out);
      },
      onComplete: () => text.set(target),
    });
    return () => {
      controls.stop();
      text.set(target);
    };
  }, [spin, target, reveal, motionSafe, text]);
  return (
    <motion.span className="truncate font-mono text-[12px] tabular-nums">
      {text}
    </motion.span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The manager                               */
/* ----------------------------------------------------------------------- */

type Filter = "all" | "failed" | "ok";
type Said = { n: number; text: string };
type Run = { run: number; geometry: Geometry | null; arrived: boolean };
type Detail = "payload" | "headers" | "response";

/**
 * A webhook endpoint's delivery log. Replaying a failed delivery sends a
 * pulse along its row — a comet on one motion value, 520 ms on the move
 * ease — from the event name to the status column, where the chip flips:
 * out on the exit ease, in on snap with a soft success ring, or, still
 * failing, in on flick to the new code with the new response under it.
 * Attempt, duration and time update with the flip. Rows open with Enter to
 * the payload, the headers and the response, measured and grown on glide.
 * The endpoint can be paused, and its signing secret revealed or rotated
 * (the new tail scrambles and settles). An empty log says how to send a
 * test event. Up and Down walk the rows, R replays the focused failure.
 * Under reduced motion nothing travels or flips; codes cross-fade.
 */
export function WebhookReplay({
  chipStyle = "pill",
  payloadTheme = "tinted",
  density = "regular",
  endpoints = defaultWebhookEndpoints,
  deliveries,
  defaultDeliveries,
  onDeliveriesChange,
  endpoint,
  defaultEndpoint,
  onEndpointChange,
  onReplay,
  onPause,
  onRotateSecret,
  onSendTest,
  now = defaultWebhookNow,
  status = "ready",
  onRetry,
  title = "Webhooks",
  height = 540,
  disabled = false,
  className,
}: WebhookReplayProps) {
  const motionSafe = useMotionSafe();
  const committed = useCommitted();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const ready = status === "ready";
  const d = DENSITY[density] ?? DENSITY.regular;

  /* ------------------------------- state --------------------------------- */

  const [ownList, setOwnList] = React.useState<WebhookDelivery[]>(
    () => defaultDeliveries ?? defaultWebhookDeliveries,
  );
  const list = deliveries ?? ownList;
  const listRef = React.useRef(list);
  React.useEffect(() => {
    listRef.current = list;
  });

  const [ownEndpoint, setOwnEndpoint] = React.useState(
    () => defaultEndpoint ?? endpoints[0]?.id ?? "",
  );
  const endpointId = endpoint ?? ownEndpoint;
  const ep = endpoints.find((e) => e.id === endpointId) ?? endpoints[0];

  const [pausedOwn, setPausedOwn] = React.useState<Record<string, boolean>>(
    () => Object.fromEntries(endpoints.map((e) => [e.id, Boolean(e.paused)])),
  );
  const paused = ep ? (pausedOwn[ep.id] ?? Boolean(ep.paused)) : false;
  const [secrets, setSecrets] = React.useState<Record<string, string>>({});
  const [spins, setSpins] = React.useState<Record<string, number>>({});
  const [revealed, setRevealed] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const secret = ep ? (secrets[ep.id] ?? ep.secret) : "";

  const [filter, setFilter] = React.useState<Filter>("all");
  const [open, setOpen] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<Detail>("payload");
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [runs, setRuns] = React.useState<Record<string, Run>>({});
  const [flips, setFlips] = React.useState<Record<string, number>>({});
  const [blooms, setBlooms] = React.useState<Record<string, number>>({});
  const [arrivals, setArrivals] = React.useState<Record<string, number>>({});
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const forEndpoint = list.filter((x) => x.endpoint === ep?.id);
  const failed = forEndpoint.filter((x) => failing(x.status));
  const shown =
    filter === "failed"
      ? failed
      : filter === "ok"
        ? forEndpoint.filter((x) => ok(x.status))
        : forEndpoint;

  /* ------------------------------- replay -------------------------------- */

  const rootRef = React.useRef<HTMLDivElement | null>(null);

  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const results = React.useRef(new Map<string, WebhookReplayResult>());
  const arrivedRuns = React.useRef(new Map<string, number>());
  const runCount = React.useRef(0);

  const writeList = (next: WebhookDelivery[]) => {
    if (deliveries === undefined) setOwnList(next);
    onDeliveriesChange?.(next);
  };

  /** Both halves are in — the pulse has landed and the answer is back. */
  const land = (id: string, run: number) => {
    const res = results.current.get(id);
    if (!res || arrivedRuns.current.get(id) !== run) return;
    results.current.delete(id);
    arrivedRuns.current.delete(id);
    const current = listRef.current;
    const before = current.find((x) => x.id === id);
    if (!before) return;
    const next = current.map((x) =>
      x.id === id
        ? {
            ...x,
            status: res.status,
            duration: res.duration,
            // A test event's first answer is its first try, not a retry.
            attempt: x.status === 0 ? x.attempt : x.attempt + 1,
            at: now,
            response: res.body ?? x.response,
          }
        : x,
    );
    writeList(next);
    setRuns((r) => {
      const rest = { ...r };
      delete rest[id];
      return rest;
    });
    setFlips((f) => ({ ...f, [id]: (f[id] ?? 0) + 1 }));
    if (ok(res.status)) setBlooms((b) => ({ ...b, [id]: (b[id] ?? 0) + 1 }));
    say(
      ok(res.status)
        ? `Delivered ${before.event}: ${res.status} ${words(res.status)} in ${durationText(res.duration)}.`
        : `Still failing: ${res.status} ${words(res.status)}.`,
    );
  };

  const measure = (id: string): Geometry | null => {
    const row = rootRef.current?.querySelector<HTMLElement>(
      `[data-wr-row="${CSS.escape(id)}"]`,
    );
    const name = row?.querySelector<HTMLElement>("[data-wr-event]");
    const chip = row?.querySelector<HTMLElement>("[data-wr-chip]");
    if (!row || !name || !chip) return null;
    const r = row.getBoundingClientRect();
    const n = name.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    const sy = r2(n.top + n.height / 2 - r.top);
    if (c.left > n.right) {
      // Wide: along the row, from the name to the chip, dipping under the
      // columns between them so it never runs through their figures.
      const head = row.querySelector<HTMLElement>("button[aria-expanded]");
      const floor = r2(
        (head?.getBoundingClientRect().bottom ?? r.bottom) - r.top - 5,
      );
      const sx = r2(n.right + 6 - r.left);
      const ex = r2(c.left - 4 - r.left);
      const ey = r2(c.top + c.height / 2 - r.top);
      const span = ex - sx;
      return {
        sx,
        sy,
        c1x: r2(sx + span * 0.2),
        c1y: floor,
        c2x: r2(sx + span * 0.8),
        c2y: floor,
        ex,
        ey,
      };
    }
    // Stacked: status sits above the event, so the pulse climbs to it.
    const sx = r2(n.left - r.left + Math.min(40, n.width / 2));
    const ex = r2(c.left + c.width / 2 - r.left);
    const ey = r2(c.bottom + 2 - r.top);
    return {
      sx,
      sy: r2(n.top - r.top),
      c1x: sx,
      c1y: r2((n.top + c.bottom) / 2 - r.top),
      c2x: ex,
      c2y: r2(ey + 6),
      ex,
      ey,
    };
  };

  const replay = (x: WebhookDelivery) => {
    if (disabled || !ready || paused || !failing(x.status) || runs[x.id])
      return;
    runCount.current += 1;
    const run = runCount.current;
    const geometry = motionSafe ? measure(x.id) : null;
    setRuns((r) => ({ ...r, [x.id]: { run, geometry, arrived: false } }));
    say(`Replaying ${x.event}.`);
    const fallback: WebhookReplayResult = x.replayAs ?? {
      status: 200,
      duration: 140,
      body: '{"received":true}',
    };
    Promise.resolve(onReplay?.(x))
      .then((res) => res ?? fallback)
      .catch(() => ({ status: 502, duration: 0, body: "No answer" }))
      .then((res) => {
        if (!alive.current) return;
        results.current.set(x.id, res);
        if (arrivedRuns.current.get(x.id) === run) land(x.id, run);
      });
    if (!geometry) {
      // No travel: a short sending tint stands in for the pulse.
      window.setTimeout(() => arrive(x.id, run), motionSafe ? 0 : 240);
    }
  };

  const arrive = (id: string, run: number) => {
    if (!alive.current) return;
    arrivedRuns.current.set(id, run);
    setArrivals((a) => ({ ...a, [id]: run }));
    if (results.current.has(id)) land(id, run);
  };

  /* ------------------------------ endpoint ------------------------------- */

  const chooseEndpoint = (id: string) => {
    if (id === endpointId) return;
    if (endpoint === undefined) setOwnEndpoint(id);
    onEndpointChange?.(id);
    setOpen(null);
    setConfirming(false);
    setRevealed(false);
    const e = endpoints.find((x) => x.id === id);
    const n = list.filter((x) => x.endpoint === id).length;
    say(`${e?.name ?? id}: ${plural(n, "delivery", "deliveries")}.`);
  };

  const togglePause = () => {
    if (disabled || !ep) return;
    const next = !paused;
    setPausedOwn((p) => ({ ...p, [ep.id]: next }));
    onPause?.(ep, next);
    say(
      next
        ? `${ep.name} paused. New events wait in the queue.`
        : `${ep.name} resumed.`,
    );
  };

  const rotate = () => {
    if (disabled || !ep) return;
    const spin = (spins[ep.id] ?? 0) + 1;
    const given = onRotateSecret?.(ep);
    const next =
      typeof given === "string" && given.length > 0
        ? given
        : freshSecret(`${ep.id}:${spin}`);
    setSecrets((s) => ({ ...s, [ep.id]: next }));
    setSpins((s) => ({ ...s, [ep.id]: spin }));
    setConfirming(false);
    say("Secret rotated. The old one keeps working for 24 hours.");
  };

  const sendTest = () => {
    if (disabled || !ep || paused) return;
    onSendTest?.(ep);
    runCount.current += 1;
    const id = `dlv_test_${runCount.current}`;
    const made: WebhookDelivery = {
      id,
      endpoint: ep.id,
      event: "test.ping",
      status: 0,
      duration: 0,
      attempt: 1,
      at: now,
      payload: {
        id: `evt_test_${runCount.current}`,
        type: "test.ping",
        created: new Date(now).toISOString().replace(".000", ""),
        data: { message: "A test event from Coldbrook." },
      },
      response: '{"received":true}',
    };
    writeList([made, ...list]);
    setFilter("all");
    // Its answer is already known; the pulse carries it to the chip once the
    // row has arrived and can be measured.
    results.current.set(id, {
      status: 200,
      duration: 118,
      body: '{"received":true}',
    });
    setQueued(id);
    say("Sending a test event.");
  };

  const [queued, setQueued] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!queued) return;
    const id = queued;
    const frame = window.requestAnimationFrame(() => {
      setQueued(null);
      runCount.current += 1;
      const run = runCount.current;
      const geometry = motionSafe ? measure(id) : null;
      setRuns((r) => ({ ...r, [id]: { run, geometry, arrived: false } }));
      if (!geometry)
        window.setTimeout(() => arrive(id, run), motionSafe ? 0 : 240);
    });
    return () => window.cancelAnimationFrame(frame);
    // The queued row is measured once it is drawn; the helpers are stable in effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued]);

  /* ------------------------------ keyboard ------------------------------- */

  const headNodes = React.useRef(new Map<string, HTMLButtonElement>());

  const onHeadKey = (event: React.KeyboardEvent, x: WebhookDelivery) => {
    const i = shown.findIndex((s) => s.id === x.id);
    const go = (j: number) => {
      const target = shown[Math.max(0, Math.min(shown.length - 1, j))];
      if (!target) return;
      setFocusId(target.id);
      headNodes.current.get(target.id)?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        go(i + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        go(i - 1);
        return;
      case "Home":
        event.preventDefault();
        go(0);
        return;
      case "End":
        event.preventDefault();
        go(shown.length - 1);
        return;
      case "r":
      case "R":
        if (!failing(x.status)) return;
        event.preventDefault();
        replay(x);
        return;
      default:
        return;
    }
  };

  /* -------------------------------- parts -------------------------------- */

  const codeBlock = (text: string, json: boolean) => {
    const ink = THEME_INK[payloadTheme] ?? THEME_INK.tinted;
    const tokens: Token[] = json
      ? tokenize(text)
      : [{ text, kind: "punct" as const }];
    return (
      <pre
        className={cn(
          "[scrollbar-width:thin] overflow-x-auto rounded-2 border px-3 py-2.5 font-mono text-[11.5px] leading-relaxed",
          payloadTheme === "night"
            ? "border-[oklch(0.32_0.02_258)] bg-[oklch(0.2_0.02_258)] text-[oklch(0.9_0.01_258)]"
            : "border-hairline bg-surface-1 text-ink-2",
        )}
      >
        <code>
          {tokens.map((tk, i) => (
            <span key={i} className={json ? ink[tk.kind] : undefined}>
              {tk.text}
            </span>
          ))}
        </code>
      </pre>
    );
  };

  const headersOf = (x: WebhookDelivery) =>
    [
      ["content-type", "application/json"],
      ["user-agent", "Coldbrook-Hooks/2.4"],
      ["x-coldbrook-event", x.event],
      ["x-coldbrook-delivery", x.id],
      [
        "x-coldbrook-signature",
        `t=${Math.floor(x.at / 1000)},v1=${"•".repeat(10)}${(hash(`${x.id}:${secret}`) >>> 0).toString(16).slice(0, 4)}`,
      ],
    ] as const;

  const details = (x: WebhookDelivery) => {
    const tabs: { id: Detail; label: string }[] = [
      { id: "payload", label: "Payload" },
      { id: "headers", label: "Headers" },
      { id: "response", label: "Response" },
    ];
    return (
      <div className={cn("flex flex-col gap-2.5 pt-1 pb-3", d.pad)}>
        <div
          role="tablist"
          aria-label="Delivery details"
          className="flex gap-1 border-b border-hairline"
        >
          {tabs.map((t, i) => {
            const on = t.id === detail;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`${uid}-${x.id}-${t.id}`}
                aria-selected={on}
                aria-controls={`${uid}-${x.id}-panel`}
                tabIndex={on ? 0 : -1}
                onClick={() => setDetail(t.id)}
                onKeyDown={(event) => {
                  const step =
                    event.key === "ArrowRight"
                      ? 1
                      : event.key === "ArrowLeft"
                        ? -1
                        : 0;
                  if (!step) return;
                  event.preventDefault();
                  const next = tabs[(i + step + tabs.length) % tabs.length];
                  if (!next) return;
                  setDetail(next.id);
                  const group = event.currentTarget.parentElement;
                  group
                    ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                    [(i + step + tabs.length) % tabs.length]?.focus();
                }}
                className={cn(
                  "relative -mb-px inline-flex h-8 items-center px-2.5 text-[12px] transition-colors",
                  on ? "text-foreground" : "text-ink-3 hover:text-foreground",
                  FOCUS_IN,
                )}
              >
                {t.label}
                {on ? (
                  <motion.span
                    layoutId={`${uid}-${x.id}-tab`}
                    aria-hidden
                    className="absolute inset-x-1.5 bottom-0 h-0.5 rounded-full bg-foreground"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        <div
          id={`${uid}-${x.id}-panel`}
          role="tabpanel"
          aria-labelledby={`${uid}-${x.id}-${detail}`}
        >
          {detail === "payload" ? (
            codeBlock(JSON.stringify(x.payload, null, 2), true)
          ) : detail === "headers" ? (
            <dl
              className={cn(
                "grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-2 border px-3 py-2.5 font-mono text-[11.5px]",
                payloadTheme === "night"
                  ? "border-[oklch(0.32_0.02_258)] bg-[oklch(0.2_0.02_258)] text-[oklch(0.9_0.01_258)]"
                  : "border-hairline bg-surface-1",
              )}
            >
              {headersOf(x).map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt
                    className={cn(
                      payloadTheme === "plain"
                        ? "text-foreground"
                        : (THEME_INK[payloadTheme] ?? THEME_INK.tinted).key,
                    )}
                  >
                    {k}
                  </dt>
                  <dd className="min-w-0 truncate text-ink-2" title={v}>
                    {v}
                  </dd>
                </React.Fragment>
              ))}
            </dl>
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-2 tabular-nums">
                <span className={ok(x.status) ? "text-success" : "text-danger"}>
                  {x.status} {words(x.status)}
                </span>
                · {durationText(x.duration)} · attempt {x.attempt}
              </p>
              {codeBlock(x.response ?? "", (x.response ?? "").startsWith("{"))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const tabStop = shown.some((x) => x.id === focusId) ? focusId : shown[0]?.id;

  const row = (x: WebhookDelivery) => {
    const isOpen = open === x.id;
    const run = runs[x.id];
    const sending = Boolean(run);
    const waiting = Boolean(run && arrivals[x.id] === run.run);
    const failedRow = failing(x.status);
    const panelId = `${uid}-${x.id}-details`;
    const label = `${x.event}, ${x.status} ${words(x.status)}, attempt ${x.attempt}, ${durationText(x.duration)}, ${agoText(x.at, now)}`;
    return (
      <motion.li
        key={x.id}
        data-wr-row={x.id}
        className="relative border-b border-hairline last:border-b-0"
        initial={
          committed
            ? { opacity: 0, y: motionSafe ? -distances.step : 0 }
            : false
        }
        animate={{ opacity: 1, y: 0 }}
        transition={
          motionSafe
            ? { y: springs.glide, opacity: { duration: durations.base } }
            : { duration: durations.fast }
        }
      >
        <div className="relative">
          <button
            ref={(node) => {
              if (node) headNodes.current.set(x.id, node);
            }}
            type="button"
            aria-expanded={isOpen}
            aria-controls={panelId}
            aria-label={label}
            aria-describedby={hintId}
            tabIndex={tabStop === x.id ? 0 : -1}
            onFocus={() => setFocusId(x.id)}
            onClick={() => setOpen((o) => (o === x.id ? null : x.id))}
            onKeyDown={(event) => onHeadKey(event, x)}
            className={cn(
              "grid w-full items-center gap-x-3 gap-y-1 text-left transition-colors hover:bg-surface-1",
              "grid-cols-[1rem_minmax(0,1fr)_auto] [grid-template-areas:'ch_chip_time'_'ch_event_event'_'ch_meta_meta']",
              "@min-[40rem]:grid-cols-[1rem_minmax(0,1fr)_3.25rem_4.5rem_5.5rem_4.5rem] @min-[40rem]:[grid-template-areas:'ch_event_att_dur_time_chip']",
              d.row,
              d.pad,
              failedRow && "pr-12",
              "@min-[40rem]:pr-[7.5rem]",
              FOCUS_IN,
            )}
          >
            <motion.span
              aria-hidden
              className="flex items-center justify-center text-ink-3 [grid-area:ch]"
              initial={false}
              animate={{ rotate: isOpen ? 90 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              <ChevronRight className="size-4" />
            </motion.span>
            <span className="flex min-w-0 flex-col [grid-area:event]">
              <span
                data-wr-event=""
                className={cn(
                  "self-start truncate font-mono font-medium",
                  d.text,
                )}
              >
                {x.event}
              </span>
              <span className={cn("truncate font-mono text-ink-3", d.meta)}>
                {x.id}
                {failedRow && x.response ? (
                  <span className="text-danger"> · {x.response}</span>
                ) : null}
              </span>
            </span>
            <span
              className={cn(
                "font-mono text-ink-2 tabular-nums [grid-area:meta] @min-[40rem]:hidden",
                d.meta,
              )}
            >
              #{x.attempt} · {durationText(x.duration)}
            </span>
            <span
              className={cn(
                "hidden font-mono text-ink-2 tabular-nums [grid-area:att] @min-[40rem]:block",
                d.meta,
              )}
            >
              #{x.attempt}
            </span>
            <span
              className={cn(
                "hidden font-mono text-ink-2 tabular-nums [grid-area:dur] @min-[40rem]:block",
                d.meta,
              )}
            >
              {durationText(x.duration)}
            </span>
            <span
              className={cn(
                "justify-self-end text-ink-3 tabular-nums [grid-area:time] @min-[40rem]:justify-self-start",
                d.meta,
              )}
            >
              {agoText(x.at, now)}
            </span>
            <span className="justify-self-start [grid-area:chip]">
              <StatusChip
                code={x.status}
                flip={`${x.status}-${flips[x.id] ?? 0}`}
                bloom={blooms[x.id] ?? 0}
                chipStyle={chipStyle}
                sending={sending}
                motionSafe={motionSafe}
              />
            </span>
          </button>
          {run?.geometry ? (
            <Pulse
              geometry={run.geometry}
              run={run.run}
              waiting={waiting}
              onArrive={(r) => arrive(x.id, r)}
            />
          ) : null}
          {failedRow ? (
            <button
              type="button"
              onClick={() => replay(x)}
              aria-disabled={paused || sending || disabled || undefined}
              aria-label={
                paused
                  ? `Replay ${x.event}: resume the endpoint first`
                  : sending
                    ? `Replaying ${x.event}`
                    : `Replay ${x.event}`
              }
              title={paused ? "Resume the endpoint to replay" : undefined}
              className={cn(
                "absolute top-2.5 right-3 inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-2 text-xs text-foreground transition-colors hover:bg-surface-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 @min-[40rem]:top-1/2 @min-[40rem]:right-4 @min-[40rem]:-translate-y-1/2 @min-[40rem]:px-2.5",
                FOCUS_RING,
              )}
            >
              <RefreshCw
                aria-hidden
                className={cn(
                  "size-3.5 shrink-0",
                  sending && "motion-safe:animate-spin",
                )}
              />
              <span className="hidden @min-[40rem]:inline">
                {sending ? "Sending" : "Replay"}
              </span>
            </button>
          ) : null}
        </div>
        <Reveal open={isOpen} motionSafe={motionSafe} id={panelId}>
          {details(x)}
        </Reveal>
      </motion.li>
    );
  };

  const filters: { id: Filter; label: string; n: number }[] = [
    { id: "all", label: "All", n: forEndpoint.length },
    { id: "failed", label: "Failed", n: failed.length },
    { id: "ok", label: "Succeeded", n: forEndpoint.length - failed.length },
  ];

  const endpointBar = ep ? (
    <div
      className={cn(
        "flex flex-col gap-2.5 border-b border-hairline py-3",
        d.pad,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="inline-flex h-6 shrink-0 items-center rounded-1 border border-hairline bg-surface-1 px-1.5 font-mono text-[10.5px] font-semibold text-ink-2">
          POST
        </span>
        <span
          className="min-w-0 flex-1 basis-40 truncate font-mono text-[12.5px]"
          title={ep.url}
        >
          {ep.url}
        </span>
        <span
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px]",
            paused
              ? "border-[color-mix(in_oklab,var(--warn)_45%,transparent)] text-warn"
              : "border-[color-mix(in_oklab,var(--success)_45%,transparent)] text-success",
          )}
        >
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{ backgroundColor: paused ? "var(--warn)" : OK_PIGMENT }}
          />
          {paused ? "Paused" : "Active"}
        </span>
        <button
          type="button"
          onClick={togglePause}
          aria-disabled={disabled || undefined}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-foreground transition-colors hover:bg-surface-2",
            FOCUS_RING,
          )}
        >
          {paused ? (
            <Play aria-hidden className="size-3.5" />
          ) : (
            <Pause aria-hidden className="size-3.5" />
          )}
          {paused ? "Resume" : "Pause"}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <ul aria-label="Subscribed events" className="flex flex-wrap gap-1">
          {ep.events.map((e) => (
            <li
              key={e}
              className="inline-flex h-5 items-center rounded-1 bg-surface-2 px-1.5 font-mono text-[10.5px] text-ink-2"
            >
              {e}
            </li>
          ))}
        </ul>
        <div className="flex min-w-0 flex-1 basis-56 items-center justify-end gap-1.5">
          <KeyRound aria-hidden className="size-3.5 shrink-0 text-ink-3" />
          <span className="sr-only">Signing secret</span>
          <SecretText
            secret={secret}
            reveal={revealed}
            spin={spins[ep.id] ?? 0}
            motionSafe={motionSafe}
          />
          <button
            type="button"
            aria-pressed={revealed}
            aria-label="Reveal signing secret"
            onClick={() => setRevealed((r) => !r)}
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            {revealed ? (
              <EyeOff aria-hidden className="size-3.5" />
            ) : (
              <Eye aria-hidden className="size-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-disabled={disabled || undefined}
            aria-expanded={confirming}
            className={cn(
              "inline-flex h-7 shrink-0 items-center rounded-2 px-2 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            Rotate
          </button>
        </div>
      </div>
      <Reveal open={confirming} motionSafe={motionSafe}>
        <div
          role="group"
          aria-label="Rotate signing secret"
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2 border border-hairline bg-surface-1 px-3 py-2"
        >
          <p className="min-w-0 flex-1 basis-48 text-[12px] text-ink-2">
            Rotate the secret? The old one keeps working for 24 hours.
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className={cn(
                "inline-flex h-7 items-center rounded-2 px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                FOCUS_RING,
              )}
            >
              Keep
            </button>
            <button
              type="button"
              onClick={rotate}
              aria-disabled={disabled || undefined}
              className={cn(
                "inline-flex h-7 items-center rounded-2 bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
                FOCUS_RING,
              )}
            >
              Rotate now
            </button>
          </div>
        </div>
      </Reveal>
      {paused ? (
        <p className="flex items-center gap-1.5 text-[12px] text-warn">
          <Pause aria-hidden className="size-3.5 shrink-0" />
          Paused · new events wait in the queue for up to 3 days.
        </p>
      ) : null}
    </div>
  ) : null;

  const empty = (
    <div className="flex flex-col items-center-safe justify-center-safe gap-2 px-6 py-10 text-center">
      <span
        aria-hidden
        className="flex size-10 items-center justify-center rounded-full border border-hairline bg-surface-1 text-ink-3"
      >
        <Inbox className="size-5" />
      </span>
      <p className="text-sm font-medium text-foreground">No deliveries yet</p>
      <p className="max-w-xs text-[12px] leading-snug text-ink-3">
        Send a test event and it arrives here within seconds, with the response
        your endpoint gave. Real events follow as orders come in.
      </p>
      <button
        type="button"
        onClick={sendTest}
        aria-disabled={disabled || paused || undefined}
        className={cn(
          "mt-1 inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 aria-disabled:opacity-50",
          FOCUS_RING,
        )}
      >
        <Send aria-hidden className="size-3.5" />
        Send test event
      </button>
    </div>
  );

  const loading = (
    <div aria-busy="true" className="flex flex-col gap-2 p-4">
      <p className="sr-only">Loading deliveries.</p>
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="h-3 w-28 rounded-full bg-surface-2 motion-safe:animate-pulse" />
          <span className="h-3 flex-1 rounded-full bg-surface-2 opacity-50" />
          <span className="h-5 w-10 rounded-full bg-surface-2 motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container relative grid w-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <header
        className={cn(
          "flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-hairline pt-3",
          d.pad,
        )}
      >
        <div className="min-w-0 pb-2.5">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate text-[12px] text-ink-3">
            Coldbrook · {plural(endpoints.length, "endpoint", "endpoints")}
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Endpoints"
          className="flex min-w-0 gap-1"
        >
          {endpoints.map((e, i) => {
            const isOn = e.id === ep?.id;
            return (
              <button
                key={e.id}
                type="button"
                role="tab"
                aria-selected={isOn}
                tabIndex={isOn ? 0 : -1}
                onClick={() => chooseEndpoint(e.id)}
                onKeyDown={(event) => {
                  const step =
                    event.key === "ArrowRight"
                      ? 1
                      : event.key === "ArrowLeft"
                        ? -1
                        : 0;
                  if (!step) return;
                  event.preventDefault();
                  const next =
                    endpoints[(i + step + endpoints.length) % endpoints.length];
                  if (!next) return;
                  chooseEndpoint(next.id);
                  const group = event.currentTarget.parentElement;
                  group
                    ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                    [(i + step + endpoints.length) % endpoints.length]?.focus();
                }}
                className={cn(
                  "relative inline-flex h-9 min-w-0 items-center px-2 text-[12.5px] transition-colors",
                  isOn ? "text-foreground" : "text-ink-3 hover:text-foreground",
                  FOCUS_IN,
                )}
              >
                <span className="truncate">{e.name}</span>
                {isOn ? (
                  <motion.span
                    layoutId={`${uid}-endpoint`}
                    aria-hidden
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-foreground"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </header>

      <p id={hintId} className="sr-only">
        Up and Down move between deliveries; Enter opens one; R replays a failed
        delivery.
      </p>

      {ready ? endpointBar : <div />}

      {status === "error" ? (
        <div className="flex flex-col items-center-safe justify-center-safe gap-3 overflow-y-auto p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The log did not load.</p>
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
        <div className="overflow-y-auto">{loading}</div>
      ) : forEndpoint.length === 0 ? (
        <div className="overflow-y-auto">{empty}</div>
      ) : (
        <div className="flex min-w-0 flex-col overflow-hidden">
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5",
              d.pad,
            )}
          >
            <div
              role="radiogroup"
              aria-label="Show"
              className="flex rounded-full border border-hairline bg-surface-1 p-0.5"
            >
              {filters.map((f, i) => {
                const isOn = f.id === filter;
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={isOn}
                    tabIndex={isOn ? 0 : -1}
                    onClick={() => setFilter(f.id)}
                    onKeyDown={(event) => {
                      const step =
                        event.key === "ArrowRight" || event.key === "ArrowDown"
                          ? 1
                          : event.key === "ArrowLeft" || event.key === "ArrowUp"
                            ? -1
                            : 0;
                      if (!step) return;
                      event.preventDefault();
                      const next =
                        filters[(i + step + filters.length) % filters.length];
                      if (!next) return;
                      setFilter(next.id);
                      const group = event.currentTarget.parentElement;
                      group
                        ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
                        [(i + step + filters.length) % filters.length]?.focus();
                    }}
                    className={cn(
                      "relative inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] transition-colors",
                      isOn
                        ? "text-foreground"
                        : "text-ink-2 hover:text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    {isOn ? (
                      <motion.span
                        layoutId={`${uid}-filter`}
                        aria-hidden
                        className="absolute inset-0 z-0 rounded-full border border-hairline-strong bg-card"
                        transition={motionSafe ? springs.snap : { duration: 0 }}
                      />
                    ) : null}
                    <span className="relative z-10">{f.label}</span>
                    <span
                      className={cn(
                        "relative z-10 font-mono text-[10.5px] tabular-nums",
                        f.id === "failed" && f.n > 0
                          ? "text-danger"
                          : "text-ink-3",
                      )}
                    >
                      {f.n}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="hidden text-[11px] text-ink-3 @min-[40rem]:block">
              Last 2 hours · newest first
            </p>
          </div>
          <div
            aria-hidden
            className={cn(
              "hidden grid-cols-[1rem_minmax(0,1fr)_3.25rem_4.5rem_5.5rem_4.5rem] gap-x-3 border-y border-hairline bg-surface-1 py-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[40rem]:grid",
              d.pad,
              // After the padding, so the merge keeps the room Replay takes.
              "pr-[7.5rem]",
            )}
          >
            <span />
            <span>Event</span>
            <span>Try</span>
            <span>Took</span>
            <span>When</span>
            <span>Status</span>
          </div>
          <div className="min-w-0 flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain border-t border-hairline @min-[40rem]:border-t-0">
            {shown.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12px] text-ink-3">
                {filter === "failed"
                  ? "No failed deliveries. Everything was received."
                  : "Nothing here."}
              </p>
            ) : (
              <ol aria-label="Deliveries" className="flex flex-col">
                {shown.map((x) => row(x))}
              </ol>
            )}
          </div>
        </div>
      )}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
