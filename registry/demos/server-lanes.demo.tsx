"use client";

import * as React from "react";

import { Pause, Play, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultServerLanesCalls,
  defaultServerLanesNow,
  defaultServerLanesServers,
  ServerLanes,
  type ServerLanesCall,
  type ServerLanesServer,
} from "@/registry/ui/server-lanes";

export const tweaks = defineTweaks({
  beadSize: {
    kind: "range",
    label: "Bead",
    default: 7,
    min: 4,
    max: 12,
    step: 1,
    unit: "px",
  },
  laneStyle: {
    kind: "choice",
    label: "Lane",
    default: "rails",
    options: ["rails", "tube", "thread"],
    names: { rails: "Rails", tube: "Tube", thread: "Thread" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "oklch(from var(--accent-bright) l c 300)",
      "var(--signal)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "oklch(from var(--accent-bright) l c 300)": "Plum",
      "var(--signal)": "Mint",
    },
  },
});

/* ------------------------------------------------------------------------ */
/*          Fieldline's morning: who answers fast, slow, or not at all       */
/* ------------------------------------------------------------------------ */

type Tool = { name: string; summary: string; error?: string };
const PLAN: Record<
  string,
  { tools: Tool[]; lat: [number, number]; fail: number; weight: number }
> = {
  data: {
    tools: [
      { name: "query_jobs", summary: 'site = "Larch St"' },
      { name: "site_metrics", summary: "week 41" },
      { name: "crew_roster", summary: "Tue 13 Oct" },
      { name: "weather_at", summary: "Larch St, 07:00" },
      { name: "export_csv", summary: "pours, October" },
    ],
    lat: [240, 620],
    fail: 0.03,
    weight: 0.46,
  },
  files: {
    tools: [
      { name: "search_files", summary: '"crane permit"' },
      { name: "read_file", summary: "larch/pour-0912.pdf" },
      {
        name: "upload_photo",
        summary: "slab-east.jpg",
        error: "Upload timed out",
      },
    ],
    lat: [1800, 3200],
    fail: 0.08,
    weight: 0.26,
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
    lat: [320, 900],
    fail: 0.36,
    weight: 0.28,
  },
  mail: {
    tools: [
      { name: "send_update", summary: "crew, 07:30" },
      { name: "read_inbox", summary: "unread, site" },
    ],
    lat: [400, 1100],
    fail: 0.05,
    weight: 0.2,
  },
};

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

type Plan = {
  latency: number;
  fail: boolean;
  error?: string;
  base: number | null;
};

/** The three calls already out when the view opens, and how they end. */
const OPENING: Record<string, Omit<Plan, "base">> = {
  "files-live-1": { latency: 2900, fail: false },
  "files-live-2": { latency: 3300, fail: false },
  "calendar-live-1": { latency: 700, fail: true, error: "Slot already taken" },
};

/**
 * Fieldline's crew assistant on a Tuesday morning, connected to the data,
 * files, calendar and mail servers. While the view is on screen a seeded
 * stream of calls goes out: data answers quickly, files slowly, calendar
 * fails about a third of the time, and mail needs reconnecting first.
 */
export function ServerLanesDemo({
  chrome = true,
  // The view is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [calls, setCalls] = React.useState<ServerLanesCall[]>(
    defaultServerLanesCalls,
  );
  const [servers, setServers] = React.useState<ServerLanesServer[]>(
    defaultServerLanesServers,
  );
  const [paused, setPaused] = React.useState<string[]>([]);
  const [now, setNow] = React.useState(defaultServerLanesNow);
  const [inspected, setInspected] = React.useState<ServerLanesCall | null>(
    null,
  );
  const [round, setRound] = React.useState(0);
  const [inView, setInView] = React.useState(false);
  const [visible, setVisible] = React.useState(true);
  const frame = React.useRef<HTMLDivElement | null>(null);

  const callsRef = React.useRef(calls);
  const serversRef = React.useRef(servers);
  React.useEffect(() => {
    callsRef.current = calls;
    serversRef.current = servers;
  }, [calls, servers]);
  const plans = React.useRef(new Map<string, Plan>());
  const rnd = React.useRef(seeded(41));
  const counter = React.useRef(0);
  const t0 = React.useRef<number | null>(null);
  const extra = React.useRef(new Set<number>());

  const clock = React.useCallback(() => {
    if (t0.current === null) t0.current = performance.now();
    return defaultServerLanesNow + Math.round(performance.now() - t0.current);
  }, []);

  React.useEffect(() => {
    const node = frame.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(!!entry?.isIntersecting),
      {
        threshold: 0.15,
      },
    );
    io.observe(node);
    const onVis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  React.useEffect(() => {
    const timers = extra.current;
    return () => {
      for (const t of timers) window.clearTimeout(t);
      timers.clear();
    };
  }, []);

  const pausedKey = paused.join("|");
  React.useEffect(() => {
    if (!inView || !visible) return;
    const timers = new Set<number>();
    const later = (fn: () => void, ms: number) => {
      const t = window.setTimeout(
        () => {
          timers.delete(t);
          fn();
        },
        Math.max(0, Math.round(ms)),
      );
      timers.add(t);
    };
    const held = new Set(pausedKey ? pausedKey.split("|") : []);
    const live = (id: string) => {
      const s = serversRef.current.find((x) => x.id === id);
      return !!s && s.health !== "disconnected" && s.enabled !== false;
    };

    const finish = (id: string) => {
      const plan = plans.current.get(id);
      if (!plan) return;
      plans.current.delete(id);
      const at = clock();
      setNow(at);
      setCalls((list) =>
        list.map((c) =>
          c.id === id
            ? {
                ...c,
                status: plan.fail ? "error" : "ok",
                endedAt: Math.max(at, c.startedAt + 1),
                error: plan.fail ? plan.error : undefined,
              }
            : c,
        ),
      );
    };

    const settle = (c: ServerLanesCall) => {
      let plan = plans.current.get(c.id);
      if (!plan) {
        const opening = OPENING[c.id];
        const p = PLAN[c.server];
        plan = opening
          ? { ...opening, base: c.startedAt }
          : {
              latency: p
                ? p.lat[0] + rnd.current() * (p.lat[1] - p.lat[0])
                : 600,
              fail: false,
              base: c.startedAt,
            };
        plans.current.set(c.id, plan);
      }
      if (held.has(c.server)) {
        plan.base = null;
        return;
      }
      const at = clock();
      if (plan.base === null) plan.base = at;
      later(() => finish(c.id), plan.base + plan.latency - at);
    };

    const out = callsRef.current
      .filter((c) => c.status === "running")
      .map((c) => ({ ...c }));
    for (const c of out) settle(c);

    const spawn = () => {
      const choices = Object.entries(PLAN).filter(([id]) => live(id));
      const total = choices.reduce((sum, [, p]) => sum + p.weight, 0);
      let pick = rnd.current() * total;
      const entry =
        choices.find(([, p]) => (pick -= p.weight) < 0) ?? choices[0];
      if (entry) {
        const [server, p] = entry;
        const tool =
          p.tools[Math.floor(rnd.current() * p.tools.length)] ?? p.tools[0]!;
        const fail = rnd.current() < p.fail;
        counter.current += 1;
        const at = clock();
        const call: ServerLanesCall = {
          id: `live-${round}-${counter.current}`,
          server,
          tool: tool.name,
          summary: tool.summary,
          startedAt: at,
          status: "running",
        };
        plans.current.set(call.id, {
          latency: p.lat[0] + rnd.current() * (p.lat[1] - p.lat[0]),
          fail,
          error: fail
            ? (tool.error ?? "The server returned an error")
            : undefined,
          base: held.has(server) ? null : at,
        });
        setNow(at);
        setCalls((list) => [...list.slice(-80), call]);
        if (!held.has(server))
          later(
            () => finish(call.id),
            plans.current.get(call.id)?.latency ?? 600,
          );
      }
      later(spawn, 420 + rnd.current() * 560);
    };
    later(spawn, 500);

    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [inView, visible, pausedKey, round, clock]);

  React.useEffect(() => {
    if (!inspected) return;
    const t = window.setTimeout(() => setInspected(null), 3500);
    return () => window.clearTimeout(t);
  }, [inspected]);

  const reconnect = (id: string) => {
    const t = window.setTimeout(() => {
      extra.current.delete(t);
      setServers((list) =>
        list.map((s) =>
          s.id === id ? { ...s, health: "healthy", note: undefined } : s,
        ),
      );
    }, 1600);
    extra.current.add(t);
  };

  const surface = (
    <ServerLanes
      key={round}
      servers={servers}
      calls={calls}
      paused={paused}
      onPausedChange={setPaused}
      onToggleServer={(id, enabled) =>
        setServers((list) =>
          list.map((s) => (s.id === id ? { ...s, enabled } : s)),
        )
      }
      onReconnect={reconnect}
      onInspectCall={setInspected}
      now={now}
      {...values}
    />
  );

  if (!chrome)
    return (
      <div ref={frame} className="w-full">
        {surface}
      </div>
    );

  const out = calls.filter((c) => c.status === "running").length;
  const cutoff = now - 60_000;
  const calErrors = calls.filter(
    (c) =>
      c.server === "calendar" &&
      c.status === "error" &&
      (c.endedAt ?? 0) > cutoff,
  ).length;
  const slow = servers
    .filter((s) => s.health === "degraded")
    .map((s) => s.name.toLowerCase());
  const liveIds = servers
    .filter((s) => s.health !== "disconnected" && s.enabled !== false)
    .map((s) => s.id);
  const allPaused =
    liveIds.length > 0 && liveIds.every((id) => paused.includes(id));
  const line = inspected
    ? `${inspected.tool} · ${inspected.status === "running" ? "running" : inspected.error ? inspected.error.toLowerCase() : "ok"}`
    : [
        `${out} in flight`,
        slow.length ? `${slow.join(", ")} slow` : null,
        calErrors
          ? `calendar ${calErrors} ${calErrors === 1 ? "error" : "errors"} this minute`
          : null,
        paused.length ? `${paused.length} paused` : null,
      ]
        .filter(Boolean)
        .join(" · ");

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div ref={frame} className="flex w-full max-w-3xl flex-col gap-4">
      <p className="text-[13px] text-ink-2">
        Fieldline · crew assistant · Tuesday, 07:42
      </p>
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={allPaused}
          onClick={() => setPaused(allPaused ? [] : liveIds)}
          className={button}
        >
          {allPaused ? (
            <Play aria-hidden className="size-3.5" />
          ) : (
            <Pause aria-hidden className="size-3.5" />
          )}
          {allPaused ? "Resume all" : "Pause all"}
        </button>
        <button
          type="button"
          onClick={() => {
            plans.current.clear();
            t0.current = null;
            setCalls(defaultServerLanesCalls);
            setServers(defaultServerLanesServers);
            setPaused([]);
            setNow(defaultServerLanesNow);
            setInspected(null);
            setRound((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{line || "quiet"}</span>
        {" · fieldline assistant"}
      </p>
    </div>
  );
}
