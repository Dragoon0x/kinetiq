"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  LoaderCircle,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type ProbeStation = {
  id: string;
  name: string;
  /** Where it sits, in words. */
  region: string;
  /** Three-letter code, mono. */
  code: string;
};

export type ProbeResult = {
  station: string;
  /** Round trip, ms, or null when the probe failed. */
  latency: number | null;
  /** Why it failed, one short sentence. */
  error?: string;
};

export type ProbeCheck = {
  id: string;
  name: string;
  method: "GET" | "POST" | "HEAD";
  path: string;
  host: string;
  /** The latency budget, ms: at or under it is good. */
  budget: number;
  /** The schedule in words. */
  every: string;
  paused?: boolean;
  /** When the last run finished, ms. A new value means new results have landed. */
  ranAt: number;
  results: ProbeResult[];
};

export type ProbeStatus = "ready" | "loading" | "error";

export type ProbeRelayProps = {
  /** How much the paths bow, 0 (straight spokes) to 1 (deep curves). @default 0.45 */
  pathCurve?: number;
  /** Scales every travel time: 2 is twice as quick, 0.5 half. @default 1 */
  pulseSpeed?: number;
  /** Pulses, the target and the active check, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The stations, drawn round the target in order from the top. @default defaultProbeStations */
  stations?: ProbeStation[];
  /** The checks and their last results. @default defaultProbeChecks */
  checks?: ProbeCheck[];
  /** Controlled active check id. */
  value?: string;
  /** Initially active check when uncontrolled. @default the first check */
  defaultValue?: string;
  /** Fires from the tab, arrow or key that changed the active check. */
  onValueChange?: (id: string) => void;
  /** Run now (or R) was pressed. Answer by updating the check's `ranAt` and `results`. */
  onRun?: (check: ProbeCheck) => void;
  /** Pause or Resume was pressed, with the new paused state. */
  onPause?: (check: ProbeCheck, paused: boolean) => void;
  /** Edit was pressed. */
  onEdit?: (check: ProbeCheck) => void;
  /** Whether the checks have arrived. Loading draws dotted paths; error offers Retry. @default "ready" */
  status?: ProbeStatus;
  /** Retry was pressed after the checks failed to load. */
  onRetry?: () => void;
  /** The time "ran 2m ago" is measured from, ms. Never read from the clock. @default defaultProbeNow */
  now?: number;
  /** Formats a latency. @default "184 ms", or "1.2 s" past a second */
  formatLatency?: (ms: number) => string;
  /** The heading. @default "Waylight API" */
  title?: string;
  /** Height of the surface, px. @default 520 */
  height?: number;
  /** Nothing runs, pauses or edits; the surface dims. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

/** Tuesday 13 October 2026, 14:20 UTC. */
export const defaultProbeNow = Date.UTC(2026, 9, 13, 14, 20);

export const defaultProbeStations: ProbeStation[] = [
  { id: "coldbrook", name: "Coldbrook", region: "North coast", code: "CLB" },
  { id: "basinworks", name: "Basinworks", region: "The basin", code: "BSN" },
  { id: "fieldline", name: "Fieldline", region: "Plains", code: "FLD" },
  { id: "waylight", name: "Waylight", region: "Harbour", code: "WAY" },
  { id: "fernworks", name: "Fernworks", region: "Valley", code: "FRN" },
  { id: "gaugeworks", name: "Gaugeworks", region: "Highlands", code: "GGE" },
];

/** How far each station is from the endpoint, as a share of a slow round trip. */
const DISTANCE: Record<string, number> = {
  coldbrook: 0.28,
  basinworks: 0.55,
  fieldline: 0.46,
  waylight: 0.18,
  fernworks: 0.66,
  gaugeworks: 0.82,
};

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ERRORS = [
  "Connection timed out after 5,000 ms",
  "TLS handshake failed",
  "Connection reset by peer",
];

/**
 * One seeded run of a check: each station's round trip is its distance times
 * the check's weight, plus jitter; on every third run Basinworks fails. Runs
 * are numbered, so a host (or a demo) can replay the same sequence.
 */
export function probeRun(
  check: ProbeCheck,
  stations: ProbeStation[],
  run: number,
  ranAt: number,
): ProbeCheck {
  const rand = mulberry32(
    run * 7919 + check.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0),
  );
  const weight = check.budget * 1.45;
  return {
    ...check,
    ranAt,
    results: stations.map((s) => {
      const fail = s.id === "basinworks" && run % 3 === 2;
      const jitter = 0.78 + rand() * 0.44;
      return fail
        ? {
            station: s.id,
            latency: null,
            error: ERRORS[run % ERRORS.length] ?? "Probe failed",
          }
        : {
            station: s.id,
            latency: Math.round(
              (24 + (DISTANCE[s.id] ?? 0.5) * weight) * jitter,
            ),
          };
    }),
  };
}

const BASE_CHECKS: ProbeCheck[] = [
  {
    id: "health",
    name: "Health",
    method: "GET",
    path: "/health",
    host: "api.waylight.test",
    budget: 250,
    every: "Every 1 min",
    ranAt: defaultProbeNow - 2 * 60_000,
    results: [],
  },
  {
    id: "checkout",
    name: "Checkout",
    method: "POST",
    path: "/v2/checkout",
    host: "api.waylight.test",
    budget: 600,
    every: "Every 5 min",
    ranAt: defaultProbeNow - 4 * 60_000,
    results: [],
  },
  {
    id: "search",
    name: "Search",
    method: "GET",
    path: "/search?q=tea",
    host: "api.waylight.test",
    budget: 400,
    every: "Every 5 min",
    ranAt: defaultProbeNow - 3 * 60_000,
    results: [],
  },
  {
    id: "webhooks",
    name: "Webhooks",
    method: "POST",
    path: "/hooks/test",
    host: "hooks.waylight.test",
    budget: 800,
    every: "Every 15 min",
    paused: true,
    ranAt: defaultProbeNow - 3 * 3_600_000,
    results: [],
  },
];

/** Four checks on Waylight's API with one seeded run each; Webhooks is paused. */
export const defaultProbeChecks: ProbeCheck[] = BASE_CHECKS.map((c, i) =>
  probeRun(c, defaultProbeStations, i === 1 ? 2 : i, c.ranAt),
);

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const defaultFormat = (ms: number) =>
  ms >= 1000
    ? `${(Math.round(ms / 100) / 10).toFixed(1)} s`
    : `${Math.round(ms)} ms`;
const ago = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

type Verdict = "ok" | "slow" | "fail" | "none";
const verdictOf = (r: ProbeResult | undefined, budget: number): Verdict =>
  !r
    ? "none"
    : r.latency === null
      ? "fail"
      : r.latency <= budget
        ? "ok"
        : "slow";
const TONE: Record<Verdict, string> = {
  ok: "text-success",
  slow: "text-warn",
  fail: "text-danger",
  none: "text-ink-3",
};
const FILL: Record<Verdict, string> = {
  ok: "bg-success",
  slow: "bg-warn",
  fail: "bg-danger",
  none: "bg-hairline-strong",
};

type Point = { x: number; y: number };
type Geometry = {
  w: number;
  h: number;
  target: Point;
  nodes: { station: ProbeStation; at: Point; ctrl: Point }[];
};

/** Stations on an ellipse from the top, clockwise; each path bows the same way. */
function layout(
  stations: ProbeStation[],
  w: number,
  h: number,
  curve: number,
): Geometry {
  const target = { x: r2(w / 2), y: r2(h / 2) };
  const rx = Math.max(40, w / 2 - 68);
  const ry = Math.max(40, h / 2 - 40);
  const n = Math.max(1, stations.length);
  return {
    w,
    h,
    target,
    nodes: stations.map((station, i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const at = {
        x: r2(target.x + Math.cos(a) * rx),
        y: r2(target.y + Math.sin(a) * ry),
      };
      const dx = target.x - at.x;
      const dy = target.y - at.y;
      const bow = clamp(curve, 0, 1) * 0.42;
      const ctrl = {
        x: r2((at.x + target.x) / 2 - dy * bow),
        y: r2((at.y + target.y) / 2 + dx * bow),
      };
      return { station, at, ctrl };
    }),
  };
}

const bezier = (a: Point, c: Point, b: Point, t: number): Point => {
  const u = 1 - t;
  return {
    x: r2(u * u * a.x + 2 * u * t * c.x + t * t * b.x),
    y: r2(u * u * a.y + 2 * u * t * c.y + t * t * b.y),
  };
};

/* ----------------------------------------------------------------------- */
/*                                  Pulse                                  */
/* ----------------------------------------------------------------------- */

type Flight = { token: number; fromRanAt: number };
type Landing = {
  checkId: string;
  token: number;
  flight: number | null;
  results: ProbeResult[];
};

/**
 * One station's pulse. A run sends it to the target on the move ease; when
 * the results land it comes back taking time in proportion to the station's
 * latency, so the quickest stations hear back first, and it reports its
 * landing. Off screen or under reduced motion it lands at once.
 */
function Pulse({
  id,
  from,
  ctrl,
  to,
  flight,
  landing,
  result,
  slowest,
  speed,
  live,
  onLand,
}: {
  id: string;
  from: Point;
  ctrl: Point;
  to: Point;
  flight: number | null;
  landing: Landing | null;
  result: ProbeResult | undefined;
  slowest: number;
  speed: number;
  live: boolean;
  onLand: (station: string, landing: Landing) => void;
}) {
  const p = useMotionValue(0);
  const shown = useMotionValue(0);
  // 1 while travelling out to the target, -1 on the way back: the tail
  // always trails behind the dot.
  const dir = useMotionValue(1);
  const [arrived, setArrived] = React.useState<number | null>(null);

  const cx = useTransform(p, (t) => bezier(from, ctrl, to, t).x);
  const cy = useTransform(p, (t) => bezier(from, ctrl, to, t).y);
  const tail = useTransform([p, dir], ([t, d]) => {
    const steps = 5;
    const reach = 0.16;
    let path = "";
    for (let k = 0; k <= steps; k += 1) {
      const tt = clamp(
        (t as number) - ((d as number) * reach * k) / steps,
        0,
        1,
      );
      const pt = bezier(from, ctrl, to, tt);
      path += `${k === 0 ? "M" : "L"}${pt.x} ${pt.y}`;
    }
    return path;
  });
  const tailOpacity = useTransform(shown, (v) => r2(v * 0.5));
  const haloOpacity = useTransform(shown, (v) => r2(v * 0.18));

  React.useEffect(() => {
    if (flight === null) return;
    if (!live) {
      p.jump(1);
      shown.jump(0);
      return;
    }
    p.jump(0);
    dir.jump(1);
    shown.jump(1);
    const controls = animate(p, 1, {
      duration: r2(0.62 / speed),
      ease: easings.move,
      onComplete: () => {
        shown.set(0);
        setArrived(flight);
      },
    });
    return () => controls.stop();
  }, [dir, flight, live, p, shown, speed]);

  const failed = result?.latency === null;
  const latency = result?.latency ?? 0;
  React.useEffect(() => {
    if (!landing) return;
    const waiting =
      live && landing.flight !== null && arrived !== landing.flight;
    if (waiting) return;
    if (!live || failed) {
      onLand(id, landing);
      return;
    }
    p.jump(1);
    dir.jump(-1);
    shown.jump(1);
    const share = clamp(latency / Math.max(1, slowest), 0, 1);
    const controls: AnimationPlaybackControls = animate(p, 0, {
      duration: r2((0.32 + share * 0.78) / speed),
      ease: easings.enter,
      onComplete: () => {
        shown.set(0);
        onLand(id, landing);
      },
    });
    return () => controls.stop();
  }, [
    landing,
    arrived,
    live,
    failed,
    latency,
    slowest,
    speed,
    id,
    onLand,
    p,
    shown,
    dir,
  ]);

  return (
    <g aria-hidden>
      <motion.path
        d={tail}
        fill="none"
        strokeWidth={2.5}
        strokeLinecap="round"
        className="stroke-(--pr-accent)"
        style={{ opacity: tailOpacity }}
      />
      <motion.circle
        cx={cx}
        cy={cy}
        r={8}
        className="fill-(--pr-accent)"
        style={{ opacity: haloOpacity }}
      />
      <motion.circle
        cx={cx}
        cy={cy}
        r={4}
        className="fill-(--pr-accent)"
        style={{ opacity: shown }}
      />
    </g>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A synthetic check runner. Six stations sit on a ring round the endpoint,
 * each joined to it by a path that bows the same way, so the ring reads as a
 * pinwheel; each holds its last latency for the active check and a slim bar
 * of it against the budget.
 *
 * Run now sends a pulse from every station to the target at once on the move
 * ease, and while the results are out the paths turn dotted and march. When
 * they land, a pulse returns to each station taking time in proportion to its
 * latency, so the fastest stations hear back first; each number then lands at
 * its station on `springs.recoil`, coloured against the budget, and its bar
 * glides to length on `springs.glide`. A failed probe's path flashes danger,
 * nothing returns, and its error shows under the station.
 *
 * Checks are a tablist; each station is its own tab stop and opens a small
 * card. R reruns the active check from anywhere inside. Below a 544px
 * container the ring becomes a list of stations with latency bars. Under
 * reduced motion nothing travels: numbers fade to their new value and bars
 * set, and the waiting paths are dotted but still.
 */
export function ProbeRelay({
  pathCurve = 0.45,
  pulseSpeed = 1,
  accent = "var(--accent-bright)",
  stations = defaultProbeStations,
  checks = defaultProbeChecks,
  value,
  defaultValue,
  onValueChange,
  onRun,
  onPause,
  onEdit,
  status = "ready",
  onRetry,
  now = defaultProbeNow,
  formatLatency = defaultFormat,
  title = "Waylight API",
  height = 520,
  disabled = false,
  className,
}: ProbeRelayProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const panelId = `${uid}-panel`;
  const ready = status === "ready";
  const speed = clamp(pulseSpeed, 0.25, 4);

  const [own, setOwn] = React.useState(defaultValue ?? checks[0]?.id ?? "");
  const activeId =
    (value ?? own) && checks.some((c) => c.id === (value ?? own))
      ? (value ?? own)
      : (checks[0]?.id ?? "");
  const check = checks.find((c) => c.id === activeId);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(rootRef);
  const live = motionSafe && inView;

  /* ------------------------------ geometry ------------------------------ */

  const [size, setSize] = React.useState({ w: 520, h: 360 });
  const roRef = React.useRef<ResizeObserver | null>(null);
  const bindStage = React.useCallback((node: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const w = Math.round(entry.contentRect.width);
      const h = Math.round(entry.contentRect.height);
      if (w > 0 && h > 0) {
        setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
      }
    });
    ro.observe(node);
    roRef.current = ro;
  }, []);
  React.useEffect(() => () => roRef.current?.disconnect(), []);
  const geo = React.useMemo(
    () => layout(stations, size.w, size.h, pathCurve),
    [stations, size.w, size.h, pathCurve],
  );

  /* ----------------------------- runs, landing ---------------------------- */

  // What each station shows: results update a station only when its pulse
  // lands, so the numbers keep the last run until the new one arrives there.
  const [shown, setShown] = React.useState<Record<string, ProbeResult[]>>(() =>
    Object.fromEntries(checks.map((c) => [c.id, c.results])),
  );
  const [flights, setFlights] = React.useState<Record<string, Flight>>({});
  const [landing, setLanding] = React.useState<Landing | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const tokens = React.useRef(0);
  const timers = React.useRef<number[]>([]);
  React.useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
    },
    [],
  );

  const ranKey = checks.map((c) => `${c.id}\u0000${c.ranAt}`).join("\u0001");
  const [seenRan, setSeenRan] = React.useState(ranKey);
  if (seenRan !== ranKey) {
    const before = new Map(
      seenRan.split("\u0001").map((row) => {
        const [id = "", at = ""] = row.split("\u0000");
        return [id, at] as const;
      }),
    );
    setSeenRan(ranKey);
    const nextShown = { ...shown };
    let nextLanding = landing;
    for (const c of checks) {
      const was = before.get(c.id);
      if (was === String(c.ranAt)) continue;
      if (c.id === activeId && was !== undefined && ready) {
        // A landing already in progress finishes at once: its numbers stand.
        if (nextLanding) nextShown[nextLanding.checkId] = nextLanding.results;
        nextLanding = {
          checkId: c.id,
          token: c.ranAt,
          flight: flights[c.id]?.token ?? null,
          results: c.results,
        };
      } else {
        nextShown[c.id] = c.results;
      }
    }
    setShown(nextShown);
    setLanding(nextLanding);
  }

  const settleLanding = (finished: Landing) => {
    const results = finished.results;
    const c = checks.find((x) => x.id === finished.checkId);
    const ok = results.filter(
      (r) => r.latency !== null && r.latency <= (c?.budget ?? Infinity),
    ).length;
    const failed = results
      .filter((r) => r.latency === null)
      .map((r) => stations.find((s) => s.id === r.station)?.name ?? r.station);
    setAnnouncement(
      `Run finished: ${ok} of ${results.length} within budget${failed.length ? `, ${failed.join(" and ")} failed` : ""}.`,
    );
  };

  const onLand = React.useCallback((station: string, from: Landing) => {
    const next = from.results.find((r) => r.station === station);
    if (!next) return;
    setShown((s) => {
      const list = [...(s[from.checkId] ?? [])];
      const at = list.findIndex((r) => r.station === station);
      if (at >= 0 && list[at] === next) return s;
      if (at >= 0) list[at] = next;
      else list.push(next);
      return { ...s, [from.checkId]: list };
    });
  }, []);

  // When every station of the landing has reported, the run is over.
  const landingDone =
    landing !== null &&
    stations.every((s) => {
      const r = landing.results.find((x) => x.station === s.id);
      const cur = (shown[landing.checkId] ?? []).find(
        (x) => x.station === s.id,
      );
      return !r || cur === r;
    });
  if (landing && landingDone) {
    setLanding(null);
    settleLanding(landing);
  }

  const run = (target: ProbeCheck | undefined) => {
    if (!target || disabled || !ready) return;
    const inFlight = flights[target.id];
    if (inFlight && inFlight.fromRanAt === target.ranAt) return;
    tokens.current += 1;
    const token = tokens.current;
    setFlights((f) => ({
      ...f,
      [target.id]: { token, fromRanAt: target.ranAt },
    }));
    onRun?.(target);
    setAnnouncement(
      `Running ${target.method} ${target.path} from ${stations.length} stations.`,
    );
    // A host that never answers does not leave the run spinning.
    timers.current.push(
      window.setTimeout(() => {
        setFlights((f) => {
          const current = f[target.id];
          if (!current || current.token !== token) return f;
          const rest = { ...f };
          delete rest[target.id];
          return rest;
        });
      }, 12_000),
    );
  };

  const flight = check ? flights[check.id] : undefined;
  const waiting = Boolean(check && flight && flight.fromRanAt === check.ranAt);

  /* ---------------------------- pause, select --------------------------- */

  const [pausedLocal, setPausedLocal] = React.useState<Record<string, boolean>>(
    {},
  );
  const isPaused = (c: ProbeCheck) => pausedLocal[c.id] ?? Boolean(c.paused);

  const select = (id: string) => {
    if (id === activeId) return;
    if (landing) {
      setShown((s) => ({ ...s, [landing.checkId]: landing.results }));
      setLanding(null);
    }
    if (value === undefined) setOwn(id);
    onValueChange?.(id);
    setPicked(null);
  };

  const [picked, setPicked] = React.useState<string | null>(null);
  const stationRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const tabRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const bindStation = React.useCallback(
    (id: string) => (node: HTMLButtonElement | null) => {
      if (node) stationRefs.current.set(id, node);
      else stationRefs.current.delete(id);
    },
    [],
  );
  const bindTab = React.useCallback(
    (id: string) => (node: HTMLButtonElement | null) => {
      if (node) tabRefs.current.set(id, node);
      else tabRefs.current.delete(id);
    },
    [],
  );

  const onTabKey = (event: React.KeyboardEvent, index: number) => {
    const keys = [
      "ArrowDown",
      "ArrowRight",
      "ArrowUp",
      "ArrowLeft",
      "Home",
      "End",
    ];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const to =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? checks.length - 1
          : event.key === "ArrowDown" || event.key === "ArrowRight"
            ? (index + 1) % checks.length
            : (index - 1 + checks.length) % checks.length;
    const next = checks[to];
    if (!next) return;
    select(next.id);
    tabRefs.current.get(next.id)?.focus();
  };

  const closePicked = () => {
    const back = picked ? stationRefs.current.get(picked) : undefined;
    setPicked(null);
    if (back?.isConnected) back.focus();
  };

  const onRootKey = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select")) return;
    if (
      (event.key === "r" || event.key === "R") &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      run(check);
    } else if (event.key === "Escape" && picked) {
      event.preventDefault();
      closePicked();
    }
  };

  /* -------------------------------- views ------------------------------- */

  const results = check ? (shown[check.id] ?? check.results) : [];
  const resultOf = (stationId: string) =>
    results.find((r) => r.station === stationId);
  const latencies = results
    .map((r) => r.latency)
    .filter((v): v is number => v !== null);
  const slowestIncoming = Math.max(
    1,
    ...(landing?.results ?? [])
      .map((r) => r.latency)
      .filter((v): v is number => v !== null),
  );
  const scaleMax = Math.max((check?.budget ?? 1) * 2, ...latencies, 1);
  const okCount = check
    ? results.filter((r) => r.latency !== null && r.latency <= check.budget)
        .length
    : 0;
  const failCount = results.filter((r) => r.latency === null).length;

  // Dotted paths march while a run is out (on screen, motion allowed).
  const march = useMotionValue(0);
  React.useEffect(() => {
    if (!(waiting && live)) {
      march.jump(0);
      return;
    }
    const controls = animate(march, -12, {
      duration: 0.6,
      ease: "linear",
      repeat: Infinity,
    });
    return () => controls.stop();
  }, [waiting, live, march]);

  const button = cn(
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
    FOCUS_RING,
  );

  const pickedNode = picked
    ? geo.nodes.find((n) => n.station.id === picked)
    : null;
  const pickedResult = picked ? resultOf(picked) : undefined;

  const body = () => {
    if (status === "error") {
      return (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 px-6 py-16 text-center"
        >
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-ink-2">The checks did not load.</p>
          {onRetry ? (
            <button type="button" onClick={onRetry} className={button}>
              <RotateCcw aria-hidden className="size-3.5" />
              Retry
            </button>
          ) : null}
        </div>
      );
    }
    if (!check) {
      return (
        <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
          <p className="text-sm text-ink-2">No checks yet.</p>
        </div>
      );
    }
    return (
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${uid}-tab-${check.id}`}
        className="flex min-w-0 flex-1 flex-col overflow-hidden"
      >
        {/* The ring (wide). */}
        <div
          ref={bindStage}
          className="relative hidden flex-1 overflow-hidden @min-[34rem]/probe-relay:block"
        >
          <svg
            aria-hidden
            className="absolute inset-0 size-full"
            viewBox={`0 0 ${geo.w} ${geo.h}`}
          >
            <ellipse
              cx={geo.target.x}
              cy={geo.target.y}
              rx={r2(Math.max(40, geo.w / 2 - 68))}
              ry={r2(Math.max(40, geo.h / 2 - 40))}
              fill="none"
              strokeWidth={1}
              strokeDasharray="2 5"
              className="stroke-hairline"
            />
            {geo.nodes.map(({ station, at, ctrl }) => {
              const r = resultOf(station.id);
              const v = verdictOf(r, check.budget);
              const dim = picked !== null && picked !== station.id;
              const d = `M${at.x} ${at.y}Q${ctrl.x} ${ctrl.y} ${geo.target.x} ${geo.target.y}`;
              return (
                <g key={station.id}>
                  <motion.path
                    d={d}
                    fill="none"
                    strokeLinecap="round"
                    strokeWidth={waiting || !ready ? 1.5 : 1.25}
                    strokeDasharray={waiting || !ready ? "2 4" : undefined}
                    style={{ strokeDashoffset: march }}
                    className={cn(
                      "transition-[stroke,opacity] duration-300",
                      v === "fail" && !waiting
                        ? "stroke-danger"
                        : waiting
                          ? "stroke-(--pr-accent)"
                          : "stroke-hairline-strong",
                    )}
                    initial={false}
                    animate={{ opacity: dim ? 0.3 : 1 }}
                    transition={{ duration: durations.base }}
                  />
                </g>
              );
            })}
            {ready
              ? geo.nodes.map(({ station, at, ctrl }) => (
                  <Pulse
                    key={station.id}
                    id={station.id}
                    from={at}
                    ctrl={ctrl}
                    to={geo.target}
                    flight={flight?.token ?? null}
                    landing={
                      landing && landing.checkId === check.id ? landing : null
                    }
                    result={landing?.results.find(
                      (r) => r.station === station.id,
                    )}
                    slowest={slowestIncoming}
                    speed={speed}
                    live={live}
                    onLand={onLand}
                  />
                ))
              : null}
          </svg>

          <div
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 rounded-3 border border-[color-mix(in_oklab,var(--pr-accent)_40%,transparent)] bg-card px-3 py-2 text-center shadow-[0_0_0_4px_color-mix(in_oklab,var(--pr-accent)_10%,transparent)]"
            style={{ left: geo.target.x, top: geo.target.y }}
          >
            <span className="font-mono text-[11px] text-foreground">
              <span className="text-(--pr-accent)">{check.method}</span>{" "}
              {check.path}
            </span>
            <span className="font-mono text-[10px] text-ink-3">
              {check.host}
            </span>
            {waiting && live ? (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-3 border border-(--pr-accent)"
                initial={{ opacity: 0.7, scale: 1 }}
                animate={{ opacity: 0, scale: 1.35 }}
                transition={{
                  duration: 0.9,
                  delay: r2(0.62 / speed),
                  ease: easings.enter,
                }}
              />
            ) : null}
          </div>

          {geo.nodes.map(({ station, at }) => {
            const r = resultOf(station.id);
            const v = verdictOf(r, check.budget);
            const label =
              r?.latency === null || r?.latency === undefined
                ? `${station.name}, failed: ${r?.error ?? "no answer"}`
                : `${station.name}, ${formatLatency(r.latency)}, ${v === "ok" ? "within" : "over"} the ${formatLatency(check.budget)} budget`;
            return (
              <button
                key={`${check.id}-${station.id}`}
                ref={bindStation(station.id)}
                type="button"
                aria-label={label}
                aria-expanded={picked === station.id}
                onClick={() =>
                  setPicked((p) => (p === station.id ? null : station.id))
                }
                className={cn(
                  "absolute flex w-[7.5rem] -translate-x-1/2 -translate-y-1/2 flex-col gap-1 rounded-2 border bg-card px-2 py-1.5 text-left transition-[border-color,opacity] duration-200",
                  FOCUS_RING,
                  picked === station.id
                    ? "border-(--pr-accent)"
                    : "border-hairline hover:border-hairline-strong",
                  picked !== null && picked !== station.id && "opacity-60",
                )}
                style={{ left: at.x, top: at.y }}
              >
                <span className="flex items-baseline justify-between gap-1">
                  <span className="truncate text-[11.5px] font-medium text-foreground">
                    {station.name}
                  </span>
                  <span className="font-mono text-[9.5px] text-ink-3">
                    {station.code}
                  </span>
                </span>
                <Reading
                  result={r}
                  verdict={v}
                  budget={check.budget}
                  scaleMax={scaleMax}
                  waiting={waiting}
                  ready={ready}
                  motionSafe={motionSafe}
                  formatLatency={formatLatency}
                />
              </button>
            );
          })}

          <AnimatePresence>
            {pickedNode ? (
              <motion.div
                key={pickedNode.station.id}
                role="group"
                aria-label={`${pickedNode.station.name} details`}
                className="absolute z-10 flex w-52 flex-col gap-1 rounded-3 border border-hairline-strong bg-popover p-3 shadow-[0_12px_32px_color-mix(in_oklab,black_16%,transparent)]"
                style={{
                  left: clamp(
                    pickedNode.at.x < geo.target.x
                      ? pickedNode.at.x + 66
                      : pickedNode.at.x - 66 - 208,
                    8,
                    Math.max(8, geo.w - 216),
                  ),
                  top: clamp(pickedNode.at.y - 40, 8, Math.max(8, geo.h - 140)),
                }}
                initial={{ opacity: 0, y: motionSafe ? 4 : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  transition: { duration: durations.fast, ease: easings.exit },
                }}
                transition={{
                  y: motionSafe ? springs.snap : { duration: 0 },
                  opacity: { duration: durations.fast },
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium">
                    {pickedNode.station.name}
                  </span>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={closePicked}
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-1 text-ink-3 hover:text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-ink-3">
                  {pickedNode.station.region} · {pickedNode.station.code}
                </p>
                <p
                  className={cn(
                    "font-mono text-[12px] tabular-nums",
                    TONE[verdictOf(pickedResult, check.budget)],
                  )}
                >
                  {pickedResult?.latency !== null &&
                  pickedResult?.latency !== undefined
                    ? `${formatLatency(pickedResult.latency)} of ${formatLatency(check.budget)}`
                    : "Failed"}
                </p>
                {pickedResult?.error ? (
                  <p className="text-[11px] text-danger">
                    {pickedResult.error}
                  </p>
                ) : null}
                <p className="text-[11px] text-ink-3">
                  Ran {ago(now - check.ranAt)}
                </p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* The list (narrow). */}
        <ul
          role="list"
          aria-label="Stations"
          className="flex flex-col gap-1 overflow-y-auto overscroll-contain px-3 py-3 @min-[34rem]/probe-relay:hidden"
        >
          {stations.map((station) => {
            const r = resultOf(station.id);
            const v = verdictOf(r, check.budget);
            return (
              <li
                key={`${check.id}-${station.id}`}
                className="relative flex flex-col gap-1.5 rounded-2 border border-hairline px-3 py-2"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[12.5px] font-medium">
                    {station.name}{" "}
                    <span className="font-mono text-[10px] font-normal text-ink-3">
                      {station.code}
                    </span>
                  </span>
                  <span className="sr-only">
                    {r?.latency === null || r?.latency === undefined
                      ? `failed: ${r?.error ?? "no answer"}`
                      : `${formatLatency(r.latency)}, ${v === "ok" ? "within" : "over"} budget`}
                  </span>
                </span>
                <Reading
                  result={r}
                  verdict={v}
                  budget={check.budget}
                  scaleMax={scaleMax}
                  waiting={waiting}
                  ready={ready}
                  motionSafe={motionSafe}
                  formatLatency={formatLatency}
                  wide
                />
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      onKeyDown={onRootKey}
      className={cn(
        "@container/probe-relay relative w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height, ["--pr-accent" as string]: accent }}
    >
      <div className="flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
          <div className="min-w-36 flex-1">
            <p id={titleId} className="truncate text-sm font-semibold">
              {title}
            </p>
            <p className="truncate text-[11px] text-ink-3">
              {!ready || !check
                ? status === "loading"
                  ? "Loading checks"
                  : status === "error"
                    ? "Checks unavailable"
                    : "No checks"
                : waiting
                  ? `Probing from ${stations.length} stations`
                  : `${okCount} of ${results.length} within ${formatLatency(check.budget)}${failCount ? ` · ${failCount} failed` : ""} · ran ${ago(now - check.ranAt)}`}
            </p>
          </div>
          {check && ready ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (disabled) return;
                  const next = !isPaused(check);
                  setPausedLocal((p) => ({ ...p, [check.id]: next }));
                  onPause?.(check, next);
                  setAnnouncement(
                    `${check.name} ${next ? "paused" : "resumed"}.`,
                  );
                }}
                aria-label={
                  isPaused(check)
                    ? `Resume ${check.name}`
                    : `Pause ${check.name}`
                }
                className={cn(button, "w-8 justify-center px-0")}
              >
                {isPaused(check) ? (
                  <Play aria-hidden className="size-3.5" />
                ) : (
                  <Pause aria-hidden className="size-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!disabled) onEdit?.(check);
                }}
                aria-label={`Edit ${check.name}`}
                className={cn(button, "w-8 justify-center px-0")}
              >
                <Pencil aria-hidden className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => run(check)}
                aria-busy={waiting || undefined}
                aria-disabled={disabled || undefined}
                aria-keyshortcuts="R"
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 bg-(--pr-accent) px-3 text-xs font-medium text-background transition-[filter] hover:brightness-110",
                  FOCUS_RING,
                )}
              >
                <span className="relative flex size-3.5">
                  {waiting ? (
                    <LoaderCircle
                      aria-hidden
                      className="size-3.5 motion-safe:animate-spin"
                    />
                  ) : (
                    <Play aria-hidden className="size-3.5 fill-current" />
                  )}
                </span>
                <span className="grid">
                  {["Run now", "Running"].map((t) => (
                    <span
                      key={t}
                      aria-hidden={t !== (waiting ? "Running" : "Run now")}
                      className={cn(
                        "col-start-1 row-start-1 text-left",
                        t === (waiting ? "Running" : "Run now")
                          ? "visible"
                          : "invisible",
                      )}
                    >
                      {t}
                    </span>
                  ))}
                </span>
              </button>
            </div>
          ) : null}
        </header>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden @min-[34rem]/probe-relay:flex-row">
          <div
            role="tablist"
            aria-label="Checks"
            className="flex shrink-0 [scrollbar-width:none] gap-1 overflow-x-auto border-b border-hairline [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] px-3 py-2 @min-[34rem]/probe-relay:w-44 @min-[34rem]/probe-relay:flex-col @min-[34rem]/probe-relay:overflow-x-visible @min-[34rem]/probe-relay:overflow-y-auto @min-[34rem]/probe-relay:border-r @min-[34rem]/probe-relay:border-b-0 @min-[34rem]/probe-relay:[mask-image:none] @min-[34rem]/probe-relay:py-3"
          >
            {status === "loading"
              ? Array.from({ length: 4 }, (_, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className="h-11 w-28 shrink-0 rounded-2 bg-surface-2 motion-safe:animate-pulse @min-[34rem]/probe-relay:w-full"
                  />
                ))
              : checks.map((c, i) => {
                  const selected = c.id === activeId;
                  const res = shown[c.id] ?? c.results;
                  const fails = res.filter((r) => r.latency === null).length;
                  const slow = res.filter(
                    (r) => r.latency !== null && r.latency > c.budget,
                  ).length;
                  const dot = fails
                    ? "bg-danger"
                    : slow
                      ? "bg-warn"
                      : "bg-success";
                  return (
                    <button
                      key={c.id}
                      ref={bindTab(c.id)}
                      id={`${uid}-tab-${c.id}`}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-controls={panelId}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => select(c.id)}
                      onKeyDown={(event) => onTabKey(event, i)}
                      className={cn(
                        "relative flex shrink-0 flex-col items-start gap-0.5 rounded-2 px-2.5 py-1.5 text-left transition-colors",
                        FOCUS_RING,
                        selected
                          ? "bg-[color-mix(in_oklab,var(--pr-accent)_10%,transparent)]"
                          : "hover:bg-surface-2",
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className={cn("size-1.5 rounded-full", dot)}
                        />
                        <span
                          className={cn(
                            "text-[12.5px]",
                            selected
                              ? "font-medium text-foreground"
                              : "text-ink-2",
                          )}
                        >
                          {c.name}
                        </span>
                        {isPaused(c) ? (
                          <span className="rounded-full bg-surface-2 px-1.5 text-[9.5px] text-ink-3">
                            Paused
                          </span>
                        ) : null}
                      </span>
                      <span className="font-mono text-[10px] whitespace-nowrap text-ink-3">
                        {c.method} {c.path}
                      </span>
                    </button>
                  );
                })}
          </div>

          {status === "loading" ? (
            <div
              aria-busy="true"
              aria-label="Loading checks"
              className="relative flex-1"
            >
              <svg
                aria-hidden
                className="absolute inset-0 size-full"
                viewBox={`0 0 ${geo.w} ${geo.h}`}
              >
                {geo.nodes.map(({ station, at, ctrl }) => (
                  <path
                    key={station.id}
                    d={`M${at.x} ${at.y}Q${ctrl.x} ${ctrl.y} ${geo.target.x} ${geo.target.y}`}
                    fill="none"
                    strokeWidth={1.5}
                    strokeDasharray="2 4"
                    strokeLinecap="round"
                    className="stroke-hairline-strong"
                  />
                ))}
              </svg>
            </div>
          ) : (
            body()
          )}
        </div>

        <footer
          aria-hidden
          className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline px-4 py-2 text-[10.5px] text-ink-3"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-success" />
            Within budget
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-warn" />
            Over budget
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-danger" />
            Failed
          </span>
          <span className="hidden @min-[34rem]/probe-relay:inline">
            R reruns the check
          </span>
        </footer>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Reading                                 */
/* ----------------------------------------------------------------------- */

/**
 * A station's number and its bar against the budget. A new number lands on
 * `springs.recoil` (keyed by the value, so it only plays when the reading
 * changes); the bar glides on `springs.glide`. While a run is out both dim.
 */
function Reading({
  result,
  verdict,
  budget,
  scaleMax,
  waiting,
  ready,
  motionSafe,
  formatLatency,
  wide = false,
}: {
  result: ProbeResult | undefined;
  verdict: Verdict;
  budget: number;
  scaleMax: number;
  waiting: boolean;
  ready: boolean;
  motionSafe: boolean;
  formatLatency: (ms: number) => string;
  wide?: boolean;
}) {
  const failed = result?.latency === null;
  const share = failed ? 1 : clamp((result?.latency ?? 0) / scaleMax, 0, 1);
  const text = !result
    ? "—"
    : failed
      ? "Failed"
      : formatLatency(result.latency ?? 0);
  const readingKey = `${result?.latency ?? "x"}-${result?.error ?? ""}`;
  // The first reading is drawn, not landed: only a changed one plays.
  const [firstKey] = React.useState(readingKey);
  const landing = readingKey !== firstKey;
  return (
    <span
      className={cn(
        "flex flex-col gap-1 transition-opacity duration-300",
        waiting && "opacity-40",
      )}
    >
      <span
        className={cn(
          "flex h-4 items-center overflow-visible",
          wide ? "absolute top-2 right-3" : "relative",
        )}
      >
        <motion.span
          key={readingKey}
          className={cn(
            "font-mono text-[12px] leading-none font-medium tabular-nums",
            TONE[verdict],
          )}
          initial={
            landing && ready
              ? motionSafe
                ? { y: -6, opacity: 0 }
                : { opacity: 0 }
              : false
          }
          animate={{ y: 0, opacity: 1 }}
          transition={{
            y: motionSafe ? springs.recoil : { duration: 0 },
            opacity: { duration: durations.fast },
          }}
        >
          {text}
        </motion.span>
      </span>
      <span
        aria-hidden
        className="relative h-[3px] w-full overflow-visible rounded-full bg-surface-2"
      >
        <motion.span
          className={cn(
            "absolute inset-y-0 left-0 w-full rounded-full",
            FILL[verdict],
          )}
          style={{ originX: 0 }}
          initial={false}
          animate={{
            scaleX: waiting ? 0 : r2(share),
            opacity: failed ? 0.35 : 1,
          }}
          transition={{
            scaleX: motionSafe ? springs.glide : { duration: 0 },
            opacity: { duration: durations.fast },
          }}
        />
        <span
          className="absolute -top-[2px] h-[7px] w-px bg-ink-3"
          style={{ left: `${r2(clamp(budget / scaleMax, 0, 1) * 100)}%` }}
        />
      </span>
      {failed && result?.error ? (
        <span
          className="truncate text-[10px] leading-snug text-danger"
          title={result.error}
        >
          {result.error}
        </span>
      ) : null}
    </span>
  );
}
