"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";
import {
  Bot,
  CircleAlert,
  LoaderCircle,
  Pause,
  Play,
  PlugZap,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type ServerLanesHealth = "healthy" | "degraded" | "disconnected";

export type ServerLanesServer = {
  id: string;
  /** Short name shown on the lane: "Files". */
  name: string;
  /** Where it runs, shown in mono: "fieldline-files". */
  host: string;
  /** The tools it offers. */
  tools: string[];
  health: ServerLanesHealth;
  /** Whether the assistant may call it. @default true */
  enabled?: boolean;
  /** One line on its health: "p95 2.4 s", "Token expired". */
  note?: string;
};

export type ServerLanesCallStatus = "running" | "ok" | "error";

export type ServerLanesCall = {
  id: string;
  /** The server's id. */
  server: string;
  tool: string;
  /** The arguments in a few words: `site = "Larch St"`. */
  summary?: string;
  /** ms since the epoch. */
  startedAt: number;
  /** ms since the epoch; set once the call has come back. */
  endedAt?: number;
  status: ServerLanesCallStatus;
  /** What went wrong, for a failed call. */
  error?: string;
};

export type ServerLanesLaneStyle = "rails" | "tube" | "thread";
export type ServerLanesStatus = "ready" | "loading";

export type ServerLanesProps = {
  /** The servers the assistant is connected to, one lane each. @default defaultServerLanesServers */
  servers?: ServerLanesServer[];
  /** Every call, any order; a new id launches a bead. @default defaultServerLanesCalls */
  calls?: ServerLanesCall[];
  /** The assistant's name at the head of the spine. @default "Fieldline assistant" */
  assistant?: string;
  /** Controlled: ids of the paused lanes. */
  paused?: string[];
  /** Initially paused lanes when uncontrolled. @default [] */
  defaultPaused?: string[];
  /** Fires from Space or the pause button with every paused lane. */
  onPausedChange?: (ids: string[]) => void;
  /** Controlled: the lane whose recent calls are listed, or null. */
  open?: string | null;
  /** Initially open lane when uncontrolled. @default null */
  defaultOpen?: string | null;
  /** Fires from Enter, a click or Escape. */
  onOpenChange?: (id: string | null) => void;
  /** The switch on a server card: may the assistant call it. */
  onToggleServer?: (id: string, enabled: boolean) => void;
  /** Reconnect on a disconnected server. */
  onReconnect?: (id: string) => void;
  /** A call in a lane's recent list was chosen. */
  onInspectCall?: (call: ServerLanesCall) => void;
  /** The moment "3 s ago" counts from, ms. @default defaultServerLanesNow */
  now?: number;
  /** loading draws the lanes as placeholders. @default "ready" */
  status?: ServerLanesStatus;
  /** A call slower than this comes home amber, ms. @default 1500 */
  slowMs?: number;
  /** How long a bead takes to run the length of its lane, ms. @default 650 */
  travelMs?: number;
  /** Bead diameter in px, and with it how tightly waiting beads pack. @default 7 */
  beadSize?: number;
  /** Two hairline rails, a rounded tube, or one dotted thread. @default "rails" */
  laneStyle?: ServerLanesLaneStyle;
  /** Good calls, the spine's node and switches — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** How many results the strip on each server card keeps. @default 12 */
  recentCount?: number;
  /** The view's accessible name. @default "Tool servers" */
  label?: string;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

/** A fixed Tuesday morning, so the default view renders the same everywhere. */
export const defaultServerLanesNow = Date.UTC(2026, 9, 13, 7, 42, 10);
const N = defaultServerLanesNow;

export const defaultServerLanesServers: ServerLanesServer[] = [
  {
    id: "data",
    name: "Data",
    host: "fieldline-data",
    tools: [
      "query_jobs",
      "site_metrics",
      "crew_roster",
      "weather_at",
      "export_csv",
    ],
    health: "healthy",
  },
  {
    id: "files",
    name: "Files",
    host: "fieldline-files",
    tools: ["search_files", "read_file", "upload_photo"],
    health: "degraded",
    note: "p95 2.4 s",
  },
  {
    id: "calendar",
    name: "Calendar",
    host: "fieldline-calendar",
    tools: ["list_events", "book_slot", "move_event"],
    health: "healthy",
  },
  {
    id: "mail",
    name: "Mail",
    host: "fieldline-mail",
    tools: ["send_update", "read_inbox"],
    health: "disconnected",
    note: "Token expired",
  },
];

type ToolSeed = { name: string; summary: string; error?: string };

const SEEDS: Record<
  string,
  { tools: ToolSeed[]; lat: [number, number]; fail: number; count: number }
> = {
  data: {
    tools: [
      { name: "query_jobs", summary: 'site = "Larch St"' },
      { name: "site_metrics", summary: "week 41" },
      { name: "crew_roster", summary: "Tue 13 Oct" },
      { name: "weather_at", summary: "Larch St, 07:00" },
    ],
    lat: [220, 640],
    fail: 0,
    count: 10,
  },
  files: {
    tools: [
      { name: "search_files", summary: '"pour log"' },
      { name: "read_file", summary: "larch/pour-0912.pdf" },
      {
        name: "upload_photo",
        summary: "slab-east.jpg",
        error: "Upload timed out",
      },
    ],
    lat: [1700, 3300],
    fail: 0.1,
    count: 7,
  },
  calendar: {
    tools: [
      {
        name: "list_events",
        summary: "this week",
        error: "Calendar token was refused",
      },
      {
        name: "book_slot",
        summary: "crane, Thu 07:00",
        error: "Slot already taken",
      },
      {
        name: "move_event",
        summary: "site walk → Fri",
        error: "Calendar token was refused",
      },
    ],
    lat: [300, 900],
    fail: 0.4,
    count: 9,
  },
};

/** A small seeded generator, so the default history is the same on every machine. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 1831565813) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedCalls(): ServerLanesCall[] {
  const rnd = seeded(20417);
  const out: ServerLanesCall[] = [];
  for (const [server, plan] of Object.entries(SEEDS)) {
    for (let i = 0; i < plan.count; i += 1) {
      const tool =
        plan.tools[Math.floor(rnd() * plan.tools.length)] ?? plan.tools[0]!;
      const startedAt =
        N - (plan.count - i) * 21_000 - Math.round(rnd() * 8000);
      const latency = Math.round(
        plan.lat[0] + rnd() * (plan.lat[1] - plan.lat[0]),
      );
      const failed = rnd() < plan.fail;
      out.push({
        id: `${server}-${i + 1}`,
        server,
        tool: tool.name,
        summary: tool.summary,
        startedAt,
        endedAt: startedAt + latency,
        status: failed ? "error" : "ok",
        error: failed
          ? (tool.error ?? "The server returned an error")
          : undefined,
      });
    }
  }
  out.push(
    {
      id: "files-live-1",
      server: "files",
      tool: "read_file",
      summary: "larch/pour-0912.pdf",
      startedAt: N - 1600,
      status: "running",
    },
    {
      id: "files-live-2",
      server: "files",
      tool: "search_files",
      summary: '"crane permit"',
      startedAt: N - 700,
      status: "running",
    },
    {
      id: "calendar-live-1",
      server: "calendar",
      tool: "book_slot",
      summary: "crane, Thu 07:00",
      startedAt: N - 300,
      status: "running",
    },
  );
  return out.sort((a, b) => a.startedAt - b.startedAt);
}

export const defaultServerLanesCalls: ServerLanesCall[] = seedCalls();

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

type Tone = "ok" | "slow" | "error";

const toneOf = (c: ServerLanesCall, slowMs: number): Tone =>
  c.status === "error"
    ? "error"
    : c.endedAt !== undefined && c.endedAt - c.startedAt > slowMs
      ? "slow"
      : "ok";

/** Pigments: a filled bead reads the same in both themes. */
const TONE_BG: Record<Tone, string> = {
  ok: "bg-(--sl-bead)",
  slow: "bg-[oklch(from_var(--warn)_0.76_c_h)]",
  error: "bg-[oklch(from_var(--danger)_0.62_c_h)]",
};

const latencyText = (c: ServerLanesCall) => {
  if (c.endedAt === undefined) return "running";
  const ms = c.endedAt - c.startedAt;
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
};

const ago = (at: number, now: number) => {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s} s ago`;
  return `${Math.round(s / 60)} min ago`;
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const EMPTY: string[] = [];

/** Beads drawn per lane; older calls still out are drawn as already home. */
const MAX_BEADS = 10;

function useMeasured() {
  const [node, setNode] = React.useState<HTMLElement | null>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  React.useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const r = node.getBoundingClientRect();
      setSize({ width: Math.round(r.width), height: Math.round(r.height) });
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return [setNode, size] as const;
}

/* ----------------------------------------------------------------------- */
/*                                  A bead                                  */
/* ----------------------------------------------------------------------- */

type Phase = "held" | "out" | "wait" | "back";

/**
 * One call as a bead. It runs out on a tween over the lane (time is the
 * meaning: every lane is the same length, so a bead crosses any lane in the
 * same time), waits at its slot behind any older call still out, drops to the
 * return rail on snap when its result arrives, and runs home tinted by it.
 * Positions are motion values fed from plain-number tweens, so nothing about a
 * bead re-renders per frame.
 */
function Bead({
  call,
  start,
  slot,
  held,
  launchDelay,
  paused,
  end,
  size,
  outY,
  backY,
  travelMs,
  tone,
  motionSafe,
  onLanded,
}: {
  call: ServerLanesCall;
  start: Phase;
  slot: number;
  held: number;
  launchDelay: number;
  paused: boolean;
  end: number;
  size: number;
  outY: number;
  backY: number;
  travelMs: number;
  tone: Tone;
  motionSafe: boolean;
  onLanded: (call: ServerLanesCall) => void;
}) {
  const [phase, setPhase] = React.useState<Phase>(start);
  const [wasHeld, setWasHeld] = React.useState(start === "held");
  const x = useMotionValue(
    start === "wait" ? slot : start === "held" ? held : 0,
  );
  const y = useMotionValue(outY);
  const callRef = React.useRef(call);
  const landedRef = React.useRef(onLanded);
  React.useEffect(() => {
    callRef.current = call;
    landedRef.current = onLanded;
  });

  // Transitions that follow from props are taken while rendering, so a bead
  // never shows one frame in the wrong phase.
  if (phase === "held" && !paused) setPhase("out");
  if (phase === "wait" && call.status !== "running") setPhase("back");
  if (!motionSafe && phase === "out")
    setPhase(call.status === "running" ? "wait" : "back");
  if (phase !== "held" && wasHeld && phase !== "out") setWasHeld(false);

  const target = phase === "held" ? held : phase === "back" ? 0 : slot;

  React.useEffect(() => {
    if (!motionSafe) {
      x.jump(target);
      if (phase !== "back") return;
      const t = window.setTimeout(() => landedRef.current(callRef.current), 0);
      return () => window.clearTimeout(t);
    }
    const from = x.get();
    const write = (v: number) => x.set(Number(v.toFixed(2)));
    if (phase === "out" || phase === "back") {
      const span = Math.max(1, end);
      const duration = Math.max(
        0.12,
        (travelMs / 1000) * Math.min(1, Math.abs(target - from) / span),
      );
      const controls = animate(from, target, {
        duration,
        ease: easings.move,
        delay: phase === "back" ? 0.1 : wasHeld ? launchDelay : 0,
        onUpdate: write,
        onComplete: () => {
          if (phase === "out")
            setPhase(callRef.current.status === "running" ? "wait" : "back");
          else landedRef.current(callRef.current);
        },
      });
      return () => controls.stop();
    }
    // Waiting and held beads re-pack as the ones ahead of them leave.
    const controls = animate(from, target, {
      ...springs.glide,
      onUpdate: write,
    });
    return () => controls.stop();
  }, [phase, target, end, travelMs, motionSafe, x, launchDelay, wasHeld]);

  React.useEffect(() => {
    const to = phase === "back" ? backY : outY;
    if (!motionSafe) {
      y.jump(to);
      return;
    }
    const controls = animate(y.get(), to, {
      ...springs.snap,
      onUpdate: (v) => y.set(Number(v.toFixed(2))),
    });
    return () => controls.stop();
  }, [phase, outY, backY, motionSafe, y]);

  return (
    <motion.span
      aria-hidden
      className={cn(
        "absolute top-0 left-0 rounded-full transition-colors duration-200",
        phase === "back"
          ? TONE_BG[tone]
          : "bg-[color-mix(in_oklab,var(--foreground)_55%,transparent)]",
      )}
      style={{ x, y, width: size, height: size }}
    />
  );
}

/* ----------------------------------------------------------------------- */
/*                                  A lane                                  */
/* ----------------------------------------------------------------------- */

type LaneProps = {
  server: ServerLanesServer;
  calls: ServerLanesCall[];
  landed: Set<string>;
  bornLanded: Set<string>;
  bornWaiting: Set<string>;
  last: boolean;
  enabled: boolean;
  paused: boolean;
  open: boolean;
  focused: boolean;
  reconnecting: boolean;
  pulse: number;
  now: number;
  slowMs: number;
  travelMs: number;
  beadSize: number;
  laneStyle: ServerLanesLaneStyle;
  recentCount: number;
  motionSafe: boolean;
  laneRef: (node: HTMLButtonElement | null) => void;
  onLanded: (call: ServerLanesCall) => void;
  onLaneKey: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onFocusLane: () => void;
  onToggleOpen: () => void;
  onTogglePause: () => void;
  onToggleEnabled: () => void;
  onReconnect: () => void;
  onInspect: (call: ServerLanesCall) => void;
  onPanelEscape: () => void;
};

function Lane({
  server,
  calls,
  landed,
  bornLanded,
  bornWaiting,
  last,
  enabled,
  paused,
  open,
  focused,
  reconnecting,
  pulse,
  now,
  slowMs,
  travelMs,
  beadSize,
  laneStyle,
  recentCount,
  motionSafe,
  laneRef,
  onLanded,
  onLaneKey,
  onFocusLane,
  onToggleOpen,
  onTogglePause,
  onToggleEnabled,
  onReconnect,
  onInspect,
  onPanelEscape,
}: LaneProps) {
  const [bindTrack, track] = useMeasured();
  const [bindPanel, panel] = useMeasured();
  const panelId = React.useId();

  const size = Math.round(Math.min(14, Math.max(3, beadSize)));
  const d = Math.round(size / 2 + 2);
  const trackH = Math.max(28, 2 * d + size + 10);
  const mid = trackH / 2;
  const outY = Number((mid - d - size / 2).toFixed(2));
  const backY = Number((mid + d - size / 2).toFixed(2));
  const end = Math.max(0, track.width - size - 6);
  const pitch = size + 2;

  const down = server.health === "disconnected";
  const live = enabled && !down;
  const running = calls
    .filter((c) => c.status === "running")
    .sort((a, b) => a.startedAt - b.startedAt);
  const beads = live
    ? calls
        .filter((c) => !landed.has(c.id))
        .sort((a, b) => a.startedAt - b.startedAt)
        .slice(-MAX_BEADS)
    : [];
  const strip = calls
    .filter((c) => c.status !== "running" && landed.has(c.id))
    .sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))
    .slice(0, recentCount);
  const listed = calls
    .slice()
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 6);
  const counts = strip.reduce(
    (acc, c) => {
      acc[toneOf(c, slowMs)] += 1;
      return acc;
    },
    { ok: 0, slow: 0, error: 0 } as Record<Tone, number>,
  );
  const held = paused ? running.length : 0;

  const healthText = down
    ? `disconnected${server.note ? `, ${server.note.toLowerCase()}` : ""}`
    : server.health === "degraded"
      ? `degraded${server.note ? `, ${server.note}` : ""}`
      : "healthy";
  const laneName = [
    `${server.name} server, ${healthText}`,
    !enabled ? "switched off" : null,
    live ? `${running.length} in flight` : null,
    strip.length
      ? `last ${plural(strip.length, "call", "calls")}: ${counts.ok} ok, ${counts.slow} slow, ${counts.error} failed`
      : "no calls yet",
    paused ? "paused" : null,
  ]
    .filter(Boolean)
    .join(", ");

  const overlay = down
    ? reconnecting
      ? "Reconnecting…"
      : "Disconnected"
    : !enabled
      ? "Off · not called"
      : calls.length === 0
        ? "No calls yet"
        : null;

  const lineClass =
    "absolute left-1/2 w-px -translate-x-1/2 bg-hairline-strong";
  const narrowOnly = "@min-[36rem]/server-lanes:hidden";

  const switchEl = down ? (
    <button
      type="button"
      onClick={onReconnect}
      aria-disabled={reconnecting || undefined}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-1 border border-hairline-strong bg-surface-1 px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-surface-2",
        FOCUS,
      )}
    >
      {reconnecting ? (
        <LoaderCircle
          aria-hidden
          className="size-3 shrink-0 motion-safe:animate-spin"
        />
      ) : (
        <PlugZap aria-hidden className="size-3 shrink-0" />
      )}
      {reconnecting ? "Reconnecting" : "Reconnect"}
    </button>
  ) : (
    <span className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        aria-pressed={paused}
        aria-label={`Pause ${server.name}`}
        title={paused ? "Resume (Space)" : "Pause (Space)"}
        aria-disabled={!enabled || undefined}
        onClick={onTogglePause}
        className={cn(
          "inline-flex size-6 items-center justify-center rounded-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
          paused && "bg-surface-2 text-foreground",
          !enabled && "opacity-50",
          FOCUS,
        )}
      >
        {paused ? (
          <Play aria-hidden className="size-3" />
        ) : (
          <Pause aria-hidden className="size-3" />
        )}
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`Let the assistant call ${server.name}`}
        onClick={onToggleEnabled}
        className={cn(
          "inline-flex h-6 items-center rounded-full px-0.5",
          FOCUS,
        )}
      >
        <span
          aria-hidden
          className={cn(
            "relative inline-flex h-4 w-7 items-center rounded-full border transition-colors",
            enabled
              ? "border-(--sl-line) bg-(--sl-solid)"
              : "border-hairline-strong bg-surface-2",
          )}
        >
          <motion.span
            className="absolute top-[1px] left-[1px] size-3 rounded-full bg-background shadow-sm"
            initial={false}
            animate={{ x: enabled ? 12 : 0 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          />
        </span>
      </button>
    </span>
  );

  const head = (
    <div className="col-start-2 row-start-1 flex min-w-0 items-center gap-2 pt-2.5 pb-1.5 pl-2 @min-[36rem]/server-lanes:p-0">
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full",
          down
            ? "border border-ink-3"
            : server.health === "degraded"
              ? "bg-warn"
              : "bg-success",
        )}
      />
      <span className="shrink-0 text-[13px] font-medium text-foreground">
        {server.name}
      </span>
      <span
        title={server.host}
        className="min-w-0 truncate font-mono text-[10.5px] text-ink-3 @min-[36rem]/server-lanes:hidden"
      >
        {server.host}
      </span>
      {live && running.length > 0 ? (
        <span className="shrink-0 font-mono text-[10.5px] text-ink-2 tabular-nums @min-[36rem]/server-lanes:hidden">
          {`${running.length} out`}
        </span>
      ) : null}
      <span className="ml-auto" />
      {switchEl}
    </div>
  );

  const stripEl = (
    <div className="col-start-2 row-start-3 flex min-w-0 items-center gap-2 pt-1.5 pb-2.5 pl-2 @min-[36rem]/server-lanes:p-0">
      <span aria-hidden className="flex items-center gap-[2px]">
        {Array.from({ length: recentCount }, (_, i) => {
          const c = strip[i];
          if (!c)
            return (
              <span
                key={`empty-${i}`}
                className="h-2.5 w-1.5 rounded-[1.5px] bg-surface-2"
              />
            );
          const fresh = !bornLanded.has(c.id) && motionSafe;
          return (
            <motion.span
              key={c.id}
              layout={motionSafe ? "position" : false}
              title={`${c.tool} · ${latencyText(c)}`}
              className={cn(
                "h-2.5 w-1.5 rounded-[1.5px]",
                TONE_BG[toneOf(c, slowMs)],
              )}
              initial={fresh ? { scale: 0, opacity: 0 } : false}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...springs.snap, layout: springs.glide }}
            />
          );
        })}
      </span>
      {server.note ? (
        <span
          className={cn(
            "min-w-0 truncate font-mono text-[10.5px]",
            down ? "text-ink-3" : "text-warn",
          )}
          title={server.note}
        >
          {server.note}
        </span>
      ) : null}
    </div>
  );

  return (
    <li className="relative">
      <div className="grid grid-cols-[20px_minmax(0,1fr)] @min-[36rem]/server-lanes:grid-cols-[20px_minmax(0,1fr)_13rem]">
        {/* The spine, drawn by each lane: above the head on a phone… */}
        <span
          aria-hidden
          className={cn("relative col-start-1 row-start-1", narrowOnly)}
        >
          <span className={cn(lineClass, "inset-y-0")} />
        </span>
        {!last ? (
          <span
            aria-hidden
            className={cn("relative col-start-1 row-start-3", narrowOnly)}
          >
            <span className={cn(lineClass, "inset-y-0")} />
          </span>
        ) : null}
        {/* …and through the port, where the lane branches off. */}
        <span
          aria-hidden
          className="relative col-start-1 row-start-2 @min-[36rem]/server-lanes:row-start-1"
        >
          <span className={cn(lineClass, "top-0 bottom-1/2")} />
          {!last ? (
            <span className={cn(lineClass, "top-1/2 bottom-0")} />
          ) : null}
          <span
            className={cn(
              "absolute top-1/2 right-0 left-1/2 h-px -translate-y-1/2",
              down
                ? "bg-[repeating-linear-gradient(90deg,var(--hairline-strong)_0_2px,transparent_2px_4px)]"
                : "bg-hairline-strong",
            )}
          />
          <motion.span
            key={pulse}
            className={cn(
              "absolute top-1/2 right-0 size-2 translate-x-1/2 -translate-y-1/2 rounded-full border",
              live
                ? "border-(--sl-line) bg-(--sl-wash)"
                : "border-hairline-strong bg-card",
            )}
            initial={pulse && motionSafe ? { scale: 1.9 } : false}
            animate={{ scale: 1 }}
            transition={springs.flick}
          />
        </span>

        <div className="col-start-2 row-start-2 flex items-center @min-[36rem]/server-lanes:row-start-1">
          <button
            ref={(node) => {
              laneRef(node);
              bindTrack(node);
            }}
            type="button"
            tabIndex={focused ? 0 : -1}
            aria-label={laneName}
            aria-expanded={open}
            aria-controls={panelId}
            aria-keyshortcuts="Space"
            onFocus={onFocusLane}
            onClick={onToggleOpen}
            onKeyDown={onLaneKey}
            onKeyUp={(event) => {
              if (event.key === " ") event.preventDefault();
            }}
            className={cn(
              "relative block w-full touch-manipulation overflow-hidden rounded-2 text-left transition-colors",
              open
                ? "bg-(--sl-wash)"
                : "hover:bg-[color-mix(in_oklab,var(--foreground)_3%,transparent)]",
              FOCUS,
            )}
            style={{ height: trackH }}
          >
            {/* The lane itself. */}
            {laneStyle === "tube" ? (
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full border bg-surface-1",
                  live
                    ? "border-hairline-strong"
                    : "border-dashed border-hairline-strong opacity-60",
                )}
                style={{ height: 2 * d + size + 4 }}
              />
            ) : laneStyle === "thread" ? (
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-0 top-1/2 h-0 border-t border-dotted border-ink-3",
                  !live && "opacity-50",
                )}
              />
            ) : (
              <>
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-x-0 h-px",
                    live
                      ? "bg-hairline-strong"
                      : "bg-[repeating-linear-gradient(90deg,var(--hairline-strong)_0_3px,transparent_3px_6px)]",
                  )}
                  style={{ top: Math.round(mid - d) }}
                />
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-x-0 h-px",
                    live
                      ? "bg-hairline"
                      : "bg-[repeating-linear-gradient(90deg,var(--hairline)_0_3px,transparent_3px_6px)]",
                  )}
                  style={{ top: Math.round(mid + d) }}
                />
              </>
            )}
            {paused && live ? (
              <span
                aria-hidden
                className="absolute inset-0 bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--foreground)_7%,transparent)_0_2px,transparent_2px_7px)]"
              />
            ) : null}
            {/* Where the server answers. */}
            <span
              aria-hidden
              className={cn(
                "absolute top-1/2 right-0.5 w-[2px] -translate-y-1/2 rounded-full",
                live ? "bg-ink-3" : "bg-hairline-strong",
              )}
              style={{ height: 2 * d + size }}
            />
            {track.width > 0
              ? beads.map((c) => {
                  const qi = running.indexOf(c);
                  const slot = Math.max(0, end - (qi < 0 ? 0 : qi) * pitch);
                  const heldX = Math.min(
                    end,
                    Math.max(0, (running.length - 1 - qi) * pitch + 2),
                  );
                  return (
                    <Bead
                      key={c.id}
                      call={c}
                      start={
                        bornWaiting.has(c.id) ? "wait" : paused ? "held" : "out"
                      }
                      slot={slot}
                      held={heldX}
                      launchDelay={Number(
                        (
                          (qi < 0 ? 0 : qi) * cascade(Math.max(2, held))
                        ).toFixed(3),
                      )}
                      paused={paused}
                      end={end}
                      size={size}
                      outY={outY}
                      backY={backY}
                      travelMs={travelMs}
                      tone={toneOf(c, slowMs)}
                      motionSafe={motionSafe}
                      onLanded={onLanded}
                    />
                  );
                })
              : null}
            {overlay ? (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="rounded-1 bg-card px-1.5 font-mono text-[10.5px] text-ink-3">
                  {overlay}
                </span>
              </span>
            ) : paused && live ? (
              <span className="absolute inset-y-0 right-3 flex items-center">
                <span className="rounded-1 bg-card px-1.5 font-mono text-[10.5px] text-ink-2 tabular-nums">
                  {held ? `Paused · ${held} held` : "Paused"}
                </span>
              </span>
            ) : null}
          </button>
        </div>

        {/* The server: a card at the lane's end, or rows around the track on a phone. */}
        <div className="contents @min-[36rem]/server-lanes:my-1.5 @min-[36rem]/server-lanes:ml-3 @min-[36rem]/server-lanes:flex @min-[36rem]/server-lanes:flex-col @min-[36rem]/server-lanes:gap-1 @min-[36rem]/server-lanes:rounded-2 @min-[36rem]/server-lanes:border @min-[36rem]/server-lanes:border-hairline @min-[36rem]/server-lanes:bg-surface-1 @min-[36rem]/server-lanes:px-2.5 @min-[36rem]/server-lanes:py-1.5">
          {head}
          <span className="hidden truncate font-mono text-[10.5px] leading-4 text-ink-3 @min-[36rem]/server-lanes:block">
            {`${server.host} · ${plural(server.tools.length, "tool", "tools")}`}
          </span>
          {stripEl}
        </div>
      </div>

      {/* Recent calls, opened under the lane. */}
      <motion.div
        id={panelId}
        className="relative overflow-hidden"
        initial={false}
        animate={{ height: open ? panel.height : 0, opacity: open ? 1 : 0 }}
        transition={
          motionSafe
            ? { height: springs.glide, opacity: { duration: durations.base } }
            : { duration: durations.fast }
        }
        inert={!open}
      >
        {!last ? (
          <span
            aria-hidden
            className="absolute top-0 bottom-0 left-[10px] w-px -translate-x-1/2 bg-hairline-strong"
          />
        ) : null}
        <div ref={bindPanel} className="pb-2 pl-[28px]">
          <div
            className="rounded-2 border border-hairline bg-surface-0 p-1"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onPanelEscape();
              }
            }}
          >
            {listed.length === 0 ? (
              <p className="px-2 py-1.5 text-[12px] text-ink-3">
                No calls to this server yet.
              </p>
            ) : (
              <ol
                aria-label={`Recent calls to ${server.name}`}
                className="flex flex-col"
              >
                {listed.map((c) => {
                  const t = c.status === "running" ? null : toneOf(c, slowMs);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => onInspect(c)}
                        title={`${c.tool}${c.summary ? ` (${c.summary})` : ""} · ${ago(c.startedAt, now)}${c.error ? ` · ${c.error}` : ""}`}
                        className={cn(
                          "grid h-7 w-full grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-1 px-2 text-left text-[12px] transition-colors hover:bg-surface-2",
                          FOCUS,
                        )}
                      >
                        {t ? (
                          <span
                            aria-hidden
                            className={cn("size-1.5 rounded-full", TONE_BG[t])}
                          />
                        ) : (
                          <LoaderCircle
                            aria-hidden
                            className="size-3 text-ink-3 motion-safe:animate-spin"
                          />
                        )}
                        <span className="font-mono text-foreground">
                          {c.tool}
                        </span>
                        <span
                          className={cn(
                            "truncate",
                            c.error ? "text-danger" : "text-ink-3",
                          )}
                        >
                          {c.error ?? c.summary ?? ""}
                        </span>
                        <span className="font-mono text-[11px] text-ink-2 tabular-nums">
                          {latencyText(c)}
                          <span className="sr-only">
                            {`, ${c.status === "running" ? "still running" : c.status === "error" ? "failed" : t === "slow" ? "slow" : "ok"}, ${ago(c.startedAt, now)}`}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </motion.div>
    </li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The view                                  */
/* ----------------------------------------------------------------------- */

/**
 * The tool servers an assistant is connected to, each a lane branching off
 * the assistant's spine to a card for the server. Every call is a bead: it
 * runs out along the upper rail on a tween over `travelMs`, waits at the
 * server end behind any call still out (re-packing on `springs.glide` as each
 * leaves), drops to the lower rail on `springs.snap` when its result comes
 * back, and runs home tinted by it — accent for ok, amber when slower than
 * `slowMs`, red for an error. So a slow server shows as beads bunching at its
 * end and a failing one as red coming home; the lane's port pulses on
 * `springs.flick` as each lands and the card's strip gains a mark on snap.
 *
 * Lanes are one roving group: Up and Down move between them, Home and End
 * jump, Enter lists a lane's recent calls under it (open on glide; Escape
 * closes), and Space pauses it — new beads are held at the assistant end and
 * released in a cascade when it resumes. Under reduced motion beads do not
 * travel: a running call sits at the server end and its result lands straight
 * in the strip.
 */
export function ServerLanes({
  servers = defaultServerLanesServers,
  calls = defaultServerLanesCalls,
  assistant = "Fieldline assistant",
  paused: pausedProp,
  defaultPaused = EMPTY,
  onPausedChange,
  open: openProp,
  defaultOpen = null,
  onOpenChange,
  onToggleServer,
  onReconnect,
  onInspectCall,
  now = defaultServerLanesNow,
  status = "ready",
  slowMs = 1500,
  travelMs = 650,
  beadSize = 7,
  laneStyle = "rails",
  accent = "var(--accent-bright)",
  recentCount = 12,
  label = "Tool servers",
  className,
}: ServerLanesProps) {
  const motionSafe = useMotionSafe();

  /* ------------------------------ values ------------------------------- */

  const [ownPaused, setOwnPaused] = React.useState<string[]>(defaultPaused);
  const pausedIds = pausedProp ?? ownPaused;
  const [ownOpen, setOwnOpen] = React.useState<string | null>(defaultOpen);
  const openId = openProp === undefined ? ownOpen : openProp;

  const [override, setOverride] = React.useState<Record<string, boolean>>({});
  const enabledSig = servers
    .map((s) => `${s.id}:${s.enabled !== false}`)
    .join("|");
  const [seenEnabled, setSeenEnabled] = React.useState(enabledSig);
  if (seenEnabled !== enabledSig) {
    // The host answered a toggle: its word wins over the local guess.
    setSeenEnabled(enabledSig);
    setOverride({});
  }
  const enabledOf = (s: ServerLanesServer) =>
    override[s.id] ?? s.enabled !== false;

  const [reconnecting, setReconnecting] = React.useState<string[]>([]);
  const healthSig = servers.map((s) => `${s.id}:${s.health}`).join("|");
  const [seenHealth, setSeenHealth] = React.useState(healthSig);
  if (seenHealth !== healthSig) {
    setSeenHealth(healthSig);
    setReconnecting([]);
  }

  /* ------------------------------- beads ------------------------------- */

  const [bornLanded] = React.useState(
    () => new Set(calls.filter((c) => c.status !== "running").map((c) => c.id)),
  );
  const [bornWaiting] = React.useState(
    () => new Set(calls.filter((c) => c.status === "running").map((c) => c.id)),
  );
  const [landed, setLanded] = React.useState<Set<string>>(bornLanded);
  const [pulses, setPulses] = React.useState<Record<string, number>>({});
  const idsRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    idsRef.current = new Set(calls.map((c) => c.id));
  }, [calls]);

  const onLanded = React.useCallback((call: ServerLanesCall) => {
    setLanded((prev) => {
      if (prev.has(call.id)) return prev;
      const next = new Set<string>();
      for (const id of prev) if (idsRef.current.has(id)) next.add(id);
      next.add(call.id);
      return next;
    });
    setPulses((p) => ({ ...p, [call.server]: (p[call.server] ?? 0) + 1 }));
  }, []);

  /* ---------------------------- announcing ----------------------------- */

  const [announcement, setAnnouncement] = React.useState("");
  const errorSig = calls
    .filter((c) => c.status === "error")
    .map((c) => c.id)
    .join("|");
  const [seenErrors, setSeenErrors] = React.useState(errorSig);
  if (seenErrors !== errorSig) {
    const before = new Set(seenErrors.split("|"));
    const fresh = calls.filter(
      (c) => c.status === "error" && !before.has(c.id),
    );
    const newest = fresh[fresh.length - 1];
    setSeenErrors(errorSig);
    if (newest) {
      const s = servers.find((x) => x.id === newest.server);
      setAnnouncement(
        `${s?.name ?? newest.server}: ${newest.tool} failed${newest.error ? `, ${newest.error}` : ""}.`,
      );
    }
  }

  /* ------------------------------ actions ------------------------------ */

  const setPaused = (next: string[]) => {
    if (pausedProp === undefined) setOwnPaused(next);
    onPausedChange?.(next);
  };
  const togglePause = (s: ServerLanesServer) => {
    if (s.health === "disconnected" || !enabledOf(s)) return;
    const on = pausedIds.includes(s.id);
    setPaused(on ? pausedIds.filter((x) => x !== s.id) : [...pausedIds, s.id]);
    setAnnouncement(
      on
        ? `${s.name} resumed.`
        : `${s.name} paused. New calls wait at the assistant.`,
    );
  };
  const setOpen = (id: string | null) => {
    if (openProp === undefined) setOwnOpen(id);
    onOpenChange?.(id);
  };
  const toggleOpen = (s: ServerLanesServer) => {
    const next = openId === s.id ? null : s.id;
    setOpen(next);
    const n = calls.filter((c) => c.server === s.id).length;
    setAnnouncement(
      next
        ? `${s.name}: ${plural(Math.min(6, n), "recent call", "recent calls")} listed.`
        : `${s.name} list closed.`,
    );
  };
  const toggleEnabled = (s: ServerLanesServer) => {
    const next = !enabledOf(s);
    setOverride((o) => ({ ...o, [s.id]: next }));
    onToggleServer?.(s.id, next);
    if (!next && pausedIds.includes(s.id))
      setPaused(pausedIds.filter((x) => x !== s.id));
    setAnnouncement(
      next
        ? `${s.name} switched on.`
        : `${s.name} switched off. The assistant won’t call it.`,
    );
  };
  const reconnect = (s: ServerLanesServer) => {
    if (reconnecting.includes(s.id)) return;
    setReconnecting((r) => [...r, s.id]);
    onReconnect?.(s.id);
    setAnnouncement(`Reconnecting ${s.name}.`);
  };

  /* ------------------------------ keyboard ----------------------------- */

  const [focusId, setFocusId] = React.useState<string | null>(null);
  const activeId =
    focusId && servers.some((s) => s.id === focusId)
      ? focusId
      : (servers[0]?.id ?? null);
  const laneRefs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const focusLane = (i: number) => {
    const s = servers[Math.max(0, Math.min(servers.length - 1, i))];
    if (!s) return;
    setFocusId(s.id);
    laneRefs.current.get(s.id)?.focus();
  };
  const onLaneKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    s: ServerLanesServer,
    i: number,
  ) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusLane(i + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusLane(i - 1);
        break;
      case "Home":
        event.preventDefault();
        focusLane(0);
        break;
      case "End":
        event.preventDefault();
        focusLane(servers.length - 1);
        break;
      case " ":
        event.preventDefault();
        togglePause(s);
        break;
      case "Escape":
        if (openId === s.id) {
          event.preventDefault();
          setOpen(null);
        }
        break;
      default:
        break;
    }
  };

  /* ------------------------------- totals ------------------------------ */

  const liveIds = new Set(
    servers
      .filter((s) => s.health !== "disconnected" && enabledOf(s))
      .map((s) => s.id),
  );
  const inFlight = calls.filter(
    (c) => c.status === "running" && liveIds.has(c.server),
  ).length;
  const recentErrors = calls.filter(
    (c) =>
      c.status === "error" &&
      landed.has(c.id) &&
      now - (c.endedAt ?? c.startedAt) < 5 * 60_000,
  ).length;
  const slowNames = servers
    .filter((s) => s.health === "degraded")
    .map((s) => s.name);

  const vars = {
    "--sl-accent": accent,
    "--sl-bead": `oklch(from ${accent} 0.64 c h)`,
    "--sl-wash": `color-mix(in oklab, ${accent} 10%, transparent)`,
    "--sl-line": `color-mix(in oklab, ${accent} 45%, transparent)`,
    "--sl-solid": `oklch(from ${accent} 0.55 c h)`,
  } as React.CSSProperties;

  return (
    <section
      aria-label={label}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container/server-lanes flex max-h-[34rem] w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={vars}
    >
      <div className="[scrollbar-width:thin] overflow-y-auto overscroll-contain px-3 pt-3 pb-1.5">
        {/* The assistant, at the head of the spine. */}
        <div className="grid grid-cols-[20px_minmax(0,1fr)] items-center gap-x-2">
          <span className="relative flex h-full items-center justify-center self-stretch">
            <span
              aria-hidden
              className="absolute top-1/2 bottom-0 left-1/2 w-px -translate-x-1/2 bg-hairline-strong"
            />
            <span className="relative flex size-5 items-center justify-center rounded-full border border-(--sl-line) bg-card text-(--sl-accent)">
              <Bot aria-hidden className="size-3" />
            </span>
          </span>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <span className="text-[13px] font-semibold">{assistant}</span>
              <span className="font-mono text-[10.5px] text-ink-3 tabular-nums">
                {[
                  plural(servers.length, "server", "servers"),
                  `${inFlight} in flight`,
                  recentErrors ? plural(recentErrors, "error", "errors") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <span
              aria-hidden
              className="hidden items-center gap-2.5 font-mono text-[10px] text-ink-3 @min-[36rem]/server-lanes:flex"
            >
              {(["ok", "slow", "error"] as Tone[]).map((t) => (
                <span key={t} className="inline-flex items-center gap-1">
                  <span className={cn("size-1.5 rounded-full", TONE_BG[t])} />
                  {t === "ok"
                    ? "ok"
                    : t === "slow"
                      ? `over ${(slowMs / 1000).toFixed(1)} s`
                      : "error"}
                </span>
              ))}
            </span>
          </div>
        </div>

        {status === "loading" ? (
          <ul
            aria-label="Loading servers"
            className="flex flex-col gap-3 py-2 pl-[28px]"
          >
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="h-7 flex-1 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
                <span className="hidden h-14 w-52 rounded-2 bg-surface-2 motion-safe:animate-pulse @min-[36rem]/server-lanes:block" />
              </li>
            ))}
          </ul>
        ) : (
          <ol aria-label="Servers" className="flex flex-col">
            {servers.map((s, i) => (
              <Lane
                key={s.id}
                server={s}
                calls={calls.filter((c) => c.server === s.id)}
                landed={landed}
                bornLanded={bornLanded}
                bornWaiting={bornWaiting}
                last={i === servers.length - 1}
                enabled={enabledOf(s)}
                paused={pausedIds.includes(s.id)}
                open={openId === s.id}
                focused={activeId === s.id}
                reconnecting={reconnecting.includes(s.id)}
                pulse={pulses[s.id] ?? 0}
                now={now}
                slowMs={slowMs}
                travelMs={travelMs}
                beadSize={beadSize}
                laneStyle={laneStyle}
                recentCount={recentCount}
                motionSafe={motionSafe}
                laneRef={(node) => {
                  laneRefs.current.set(s.id, node);
                }}
                onLanded={onLanded}
                onLaneKey={(event) => onLaneKey(event, s, i)}
                onFocusLane={() => setFocusId(s.id)}
                onToggleOpen={() => toggleOpen(s)}
                onTogglePause={() => togglePause(s)}
                onToggleEnabled={() => toggleEnabled(s)}
                onReconnect={() => reconnect(s)}
                onInspect={(c) => onInspectCall?.(c)}
                onPanelEscape={() => {
                  setOpen(null);
                  laneRefs.current.get(s.id)?.focus();
                }}
              />
            ))}
          </ol>
        )}
        {slowNames.length > 0 && status !== "loading" ? (
          <p className="flex items-center gap-1.5 pt-1 pl-[28px] text-[11.5px] text-ink-3">
            <CircleAlert aria-hidden className="size-3.5 shrink-0 text-warn" />
            {`${slowNames.join(" and ")} ${slowNames.length === 1 ? "is" : "are"} answering slowly.`}
          </p>
        ) : null}
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
