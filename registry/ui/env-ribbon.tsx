"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useIsPresent,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  Check,
  ChevronDown,
  Eraser,
  Lock,
  RefreshCw,
  Rocket,
  RotateCcw,
  ShieldAlert,
  TriangleAlert,
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
import { cn } from "@/registry/lib/utils";

export type EnvRibbonAccent = "cobalt" | "plum" | "mint" | "ink";
export type EnvRibbonHatch = "stripe" | "cross" | "ticks" | "off";
export type EnvRibbonStatus = "ready" | "loading" | "error";
export type EnvRibbonServiceStatus =
  "healthy" | "degraded" | "deploying" | "stopped";
export type EnvRibbonActionKind = "primary" | "destructive" | "neutral";
export type EnvRibbonActionIcon = "deploy" | "rollback" | "purge" | "restart";

export type EnvRibbonEnvironment = {
  id: string;
  /** Shown in the switcher, the ribbon's bar and the footer; also the word typed to confirm. */
  name: string;
  /** The ribbon's colour, any CSS colour. Defaults by position: green, amber, red. */
  colour?: string;
  /** Switching in, and destructive actions inside, need a typed confirmation. */
  protected?: boolean;
  /** Where it runs, e.g. "eu-west-1". */
  region?: string;
  /** Its address, shown in the switcher. */
  host?: string;
};

export type EnvRibbonService = {
  id: string;
  name: string;
  version: string;
  instances: number;
  status: EnvRibbonServiceStatus;
};

export type EnvRibbonMetric = {
  id: string;
  label: string;
  /** Already formatted, e.g. "18.4k/min". */
  value: string;
  /** A short change line, e.g. "+3% vs last hour". */
  delta?: string;
  /** Colours the change line. @default "neutral" */
  tone?: "good" | "bad" | "neutral";
};

export type EnvRibbonSnapshot = {
  version: string;
  commit: string;
  /** ms since the epoch. */
  deployedAt: number;
  deployedBy: string;
  metrics: EnvRibbonMetric[];
  services: EnvRibbonService[];
};

export type EnvRibbonAction = {
  id: string;
  label: string;
  /** Destructive actions grow the hatched edge and ask first in a protected environment. @default "neutral" */
  kind?: EnvRibbonActionKind;
  icon?: EnvRibbonActionIcon;
  /** A shorter label for the primary action in a narrow frame, e.g. "Deploy". Other actions go icon-only there. */
  short?: string;
  /** What confirming it does, said in the protected dialog. */
  consequence?: string;
  /** The footer's result line once it ran, e.g. "Cache purged". */
  done?: string;
};

export type EnvRibbonConfirmRequest = {
  kind: "switch" | "action";
  envId: string;
  actionId?: string;
};

export type EnvRibbonProps = {
  /** Ribbon thickness along the frame's top edge, in px. The narrow labelled bar grows with it. @default 4 */
  ribbonWidth?: number;
  /** The edge destructive buttons grow in a protected environment. @default "stripe" */
  hatch?: EnvRibbonHatch;
  /** Interface accent: the mark, the primary action and the switcher's selection. A name or any CSS colour. @default "cobalt" */
  accent?: EnvRibbonAccent | (string & {});
  /** The environments, in switcher order. @default defaultEnvRibbonEnvironments */
  environments?: EnvRibbonEnvironment[];
  /** Controlled environment id. */
  environment?: string;
  /** Initial environment id when uncontrolled. @default "staging" */
  defaultEnvironment?: string;
  /** Fires from the choice (after any confirmation) that changed the environment. */
  onEnvironmentChange?: (id: string, environment: EnvRibbonEnvironment) => void;
  /** What each environment is running, by environment id. @default defaultEnvRibbonSnapshots */
  snapshots?: Record<string, EnvRibbonSnapshot>;
  /** The action bar, in order. @default defaultEnvRibbonActions */
  actions?: EnvRibbonAction[];
  /** An action ran straight away (anything outside a protected environment, and non-destructive ones inside). */
  onAction?: (actionId: string, envId: string) => void;
  /** A protected switch or destructive action was confirmed. */
  onConfirmProtected?: (request: EnvRibbonConfirmRequest) => void;
  /** Ask for the environment's name to be typed before a protected step. Off: one confirm press. @default true */
  confirmByTyping?: boolean;
  /** The moment relative times count from, in ms. @default defaultEnvRibbonNow */
  now?: number;
  /** Product name beside the mark. @default "Waylight" */
  product?: string;
  /** The console's title under the product. @default "Deploy console" */
  title?: string;
  /** Alt+E opens the switcher while focus is in the frame or it is hovered. @default true */
  shortcut?: boolean;
  /** Whether the current environment's data has arrived. @default "ready" */
  status?: EnvRibbonStatus;
  /** Try again after an error. */
  onRetry?: () => void;
  /** Read only: nothing can be switched or run. @default false */
  disabled?: boolean;
  /** The frame's accessible name. @default "<product> <title>" */
  label?: string;
  className?: string;
};

const MIN = 60_000;
/** A fixed afternoon, so the console renders the same on every machine. */
export const defaultEnvRibbonNow = Date.UTC(2026, 9, 14, 15, 20);
const N = defaultEnvRibbonNow;

/**
 * Pigments, not text colours: the hue and chroma of each status token at a
 * fixed lightness, so a ribbon reads as the same green, amber or red on a
 * light page and a dark one.
 */
const PIGMENT = {
  green: "oklch(from var(--success) 0.74 0.13 h)",
  amber: "oklch(from var(--warn) 0.8 0.14 h)",
  red: "oklch(from var(--danger) 0.64 0.2 h)",
  blue: "oklch(from var(--accent-bright) 0.7 0.14 h)",
} as const;
const FALLBACK = [PIGMENT.green, PIGMENT.amber, PIGMENT.red, PIGMENT.blue];

export const defaultEnvRibbonEnvironments: EnvRibbonEnvironment[] = [
  {
    id: "local",
    name: "local",
    colour: PIGMENT.green,
    region: "this machine",
    host: "localhost:4100",
  },
  {
    id: "staging",
    name: "staging",
    colour: PIGMENT.amber,
    region: "eu-west-1",
    host: "staging.waylight.internal",
  },
  {
    id: "production",
    name: "production",
    colour: PIGMENT.red,
    protected: true,
    region: "eu-west-1",
    host: "live.waylight.internal",
  },
];

export const defaultEnvRibbonSnapshots: Record<string, EnvRibbonSnapshot> = {
  local: {
    version: "v2.15.0-dev",
    commit: "a17c3e9",
    deployedAt: N - 3 * MIN,
    deployedBy: "you",
    metrics: [
      { id: "rpm", label: "Requests", value: "42/min" },
      {
        id: "err",
        label: "Error rate",
        value: "1.9%",
        delta: "seeded faults",
        tone: "bad",
      },
      { id: "p95", label: "p95", value: "96 ms" },
      { id: "inst", label: "Instances", value: "5" },
    ],
    services: [
      {
        id: "api",
        name: "api-gateway",
        version: "2.15.0-dev",
        instances: 1,
        status: "healthy",
      },
      {
        id: "ledger",
        name: "ledger-sync",
        version: "2.15.0-dev",
        instances: 1,
        status: "healthy",
      },
      {
        id: "notify",
        name: "notify",
        version: "2.15.0-dev",
        instances: 1,
        status: "stopped",
      },
      {
        id: "auth",
        name: "card-auth",
        version: "2.15.0-dev",
        instances: 1,
        status: "healthy",
      },
      {
        id: "search",
        name: "search-index",
        version: "2.14.3",
        instances: 1,
        status: "degraded",
      },
    ],
  },
  staging: {
    version: "v2.15.0-rc.2",
    commit: "3fa90d1",
    deployedAt: N - 41 * MIN,
    deployedBy: "Tomas Brandt",
    metrics: [
      {
        id: "rpm",
        label: "Requests",
        value: "1.2k/min",
        delta: "+8% vs last hour",
        tone: "neutral",
      },
      {
        id: "err",
        label: "Error rate",
        value: "0.31%",
        delta: "+0.12 pts",
        tone: "bad",
      },
      {
        id: "p95",
        label: "p95",
        value: "240 ms",
        delta: "−18 ms",
        tone: "good",
      },
      { id: "inst", label: "Instances", value: "9" },
    ],
    services: [
      {
        id: "api",
        name: "api-gateway",
        version: "2.15.0-rc.2",
        instances: 2,
        status: "deploying",
      },
      {
        id: "ledger",
        name: "ledger-sync",
        version: "2.15.0-rc.2",
        instances: 2,
        status: "healthy",
      },
      {
        id: "notify",
        name: "notify",
        version: "2.15.0-rc.1",
        instances: 2,
        status: "healthy",
      },
      {
        id: "auth",
        name: "card-auth",
        version: "2.15.0-rc.2",
        instances: 2,
        status: "degraded",
      },
      {
        id: "search",
        name: "search-index",
        version: "2.14.3",
        instances: 1,
        status: "healthy",
      },
    ],
  },
  production: {
    version: "v2.14.3",
    commit: "8c41e2a",
    deployedAt: N - 12 * MIN,
    deployedBy: "Ines Duarte",
    metrics: [
      {
        id: "rpm",
        label: "Requests",
        value: "18.4k/min",
        delta: "+3% vs last hour",
        tone: "neutral",
      },
      {
        id: "err",
        label: "Error rate",
        value: "0.04%",
        delta: "−0.01 pts",
        tone: "good",
      },
      { id: "p95", label: "p95", value: "182 ms", delta: "+6 ms", tone: "bad" },
      { id: "inst", label: "Instances", value: "24" },
    ],
    services: [
      {
        id: "api",
        name: "api-gateway",
        version: "2.14.3",
        instances: 8,
        status: "healthy",
      },
      {
        id: "ledger",
        name: "ledger-sync",
        version: "2.14.3",
        instances: 6,
        status: "healthy",
      },
      {
        id: "notify",
        name: "notify",
        version: "2.14.1",
        instances: 4,
        status: "degraded",
      },
      {
        id: "auth",
        name: "card-auth",
        version: "2.14.3",
        instances: 4,
        status: "healthy",
      },
      {
        id: "search",
        name: "search-index",
        version: "2.13.9",
        instances: 2,
        status: "healthy",
      },
    ],
  },
};

export const defaultEnvRibbonActions: EnvRibbonAction[] = [
  {
    id: "deploy",
    label: "Deploy main",
    short: "Deploy",
    kind: "primary",
    icon: "deploy",
    done: "Deploy started",
  },
  {
    id: "rollback",
    label: "Roll back",
    kind: "destructive",
    icon: "rollback",
    consequence:
      "Every service returns to the previous release. Requests in flight finish first.",
    done: "Rolled back",
  },
  {
    id: "purge",
    label: "Purge cache",
    kind: "destructive",
    icon: "purge",
    consequence:
      "Cached pages and API responses are dropped, so the next minute of requests runs cold.",
    done: "Cache purged",
  },
  {
    id: "restart",
    label: "Restart workers",
    kind: "destructive",
    icon: "restart",
    consequence:
      "Queued jobs pause for about a minute while every worker restarts.",
    done: "Workers restarted",
  },
];

const ACCENTS: Record<EnvRibbonAccent, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const ICONS: Record<EnvRibbonActionIcon, typeof Rocket> = {
  deploy: Rocket,
  rollback: Undo2,
  purge: Eraser,
  restart: RefreshCw,
};

/** The stripes are pigment too: a warning edge that reads the same in both themes. */
const HATCH_INK = "oklch(from var(--danger) 0.64 0.2 h)";
const HATCH: Record<Exclude<EnvRibbonHatch, "off">, string> = {
  stripe: `repeating-linear-gradient(135deg, ${HATCH_INK} 0 2px, transparent 2px 5px)`,
  cross: `repeating-linear-gradient(45deg, ${HATCH_INK} 0 1.25px, transparent 1.25px 4.5px), repeating-linear-gradient(135deg, ${HATCH_INK} 0 1.25px, transparent 1.25px 4.5px)`,
  ticks: `repeating-linear-gradient(90deg, ${HATCH_INK} 0 2px, transparent 2px 5px)`,
};

const STATUS_WORD: Record<EnvRibbonServiceStatus, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  deploying: "Deploying",
  stopped: "Stopped",
};
const STATUS_TONE: Record<EnvRibbonServiceStatus, string> = {
  healthy: "text-success",
  degraded: "text-warn",
  deploying: "text-[var(--er-ink)]",
  stopped: "text-ink-3",
};
const STATUS_DOT: Record<EnvRibbonServiceStatus, string> = {
  healthy: "bg-success",
  degraded: "bg-warn",
  deploying: "bg-[var(--er-ink)]",
  stopped: "bg-ink-3",
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const CLOSED = "inset(0 50% 0 50%)";
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Server and browser both: a layout effect where there is a layout. */
const useIsoLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/**
 * How long the glide spring takes to carry the sweep a fraction `s` of its
 * way. Glide is damped just short of critical, so its step response is
 * close to 1 − (1 + ωt)·e^(−ωt); solving that lets a hatched edge grow at
 * the moment the colour reaches its button instead of on a guessed beat.
 */
const GLIDE_W = Math.sqrt(springs.glide.stiffness / springs.glide.mass);
function reachTime(s: number): number {
  if (s <= 0) return 0;
  if (s >= 0.99) return 0.55;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const t = (lo + hi) / 2;
    const x = 1 - (1 + GLIDE_W * t) * Math.exp(-GLIDE_W * t);
    if (x < s) lo = t;
    else hi = t;
  }
  return r3(Math.min(0.55, hi));
}

function ago(at: number, now: number): string {
  const m = Math.max(0, Math.round((now - at) / MIN));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

const plural = (n: number, one: string, other = `${one}s`) =>
  `${n} ${n === 1 ? one : other}`;

/* ------------------------------ snapshot view ----------------------------- */

function Rise({
  i,
  step,
  motionSafe,
  className,
  children,
}: {
  i: number;
  step: number;
  motionSafe: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const delay = r3(i * step);
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        motionSafe
          ? {
              y: { ...springs.glide, delay },
              opacity: { duration: durations.base, ease: easings.enter, delay },
            }
          : { duration: durations.fast }
      }
    >
      {children}
    </motion.div>
  );
}

function Snapshot({
  env,
  snapshot,
  status,
  now,
  motionSafe,
  onRetry,
}: {
  env: EnvRibbonEnvironment | undefined;
  snapshot: EnvRibbonSnapshot | undefined;
  status: EnvRibbonStatus;
  now: number;
  motionSafe: boolean;
  onRetry?: () => void;
}) {
  // A leaving layer still paints while it fades; it must not take focus or clicks.
  const present = useIsPresent();
  const name = env?.name ?? "this environment";

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div aria-busy="true" className="flex flex-col gap-4">
        <p className="sr-only">{`Loading ${name}.`}</p>
        <div className="h-4 w-3/5 rounded-2 bg-surface-2" />
        <div className="grid grid-cols-2 gap-2 @min-[40rem]:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-3 bg-surface-2" />
          ))}
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-8 rounded-2 bg-surface-2" />
        ))}
      </div>
    );
  } else if (status === "error" || !snapshot) {
    body = (
      <div className="flex flex-col items-center-safe justify-center-safe gap-3 py-10 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">{`Couldn’t load ${name}.`}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    );
  } else {
    const rows = 2 + snapshot.services.length;
    const step = cascade(rows);
    body = (
      <div className="flex flex-col gap-4">
        <Rise i={0} step={step} motionSafe={motionSafe}>
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px] text-ink-2">
            <span className="font-mono text-[13px] font-medium text-foreground">
              {snapshot.version}
            </span>
            <span className="font-mono text-[11px] text-ink-3">
              {snapshot.commit}
            </span>
            <span className="text-[12px] text-ink-3">
              {`deployed ${ago(snapshot.deployedAt, now)} by ${snapshot.deployedBy}`}
            </span>
          </p>
        </Rise>
        <Rise i={1} step={step} motionSafe={motionSafe}>
          <dl className="grid grid-cols-2 gap-2 @min-[40rem]:grid-cols-4">
            {snapshot.metrics.map((m) => (
              <div
                key={m.id}
                className="flex flex-col gap-0.5 rounded-3 border border-hairline bg-surface-1 px-3 py-2.5"
              >
                <dt className="truncate text-[11px] text-ink-3">{m.label}</dt>
                <dd className="font-mono text-[15px] leading-5 font-medium text-foreground tabular-nums">
                  {m.value}
                </dd>
                {m.delta ? (
                  <dd
                    className={cn(
                      "truncate text-[11px]",
                      m.tone === "good"
                        ? "text-success"
                        : m.tone === "bad"
                          ? "text-danger"
                          : "text-ink-3",
                    )}
                  >
                    {m.delta}
                  </dd>
                ) : null}
              </div>
            ))}
          </dl>
        </Rise>
        <div>
          <p className="mb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {`Services · ${snapshot.services.length}`}
          </p>
          <table className="hidden w-full border-collapse text-[13px] @min-[40rem]:table">
            <caption className="sr-only">{`Services on ${name}`}</caption>
            <thead>
              <tr className="border-b border-hairline text-left text-[11px] text-ink-3">
                <th scope="col" className="py-1.5 pr-3 font-normal">
                  Service
                </th>
                <th scope="col" className="py-1.5 pr-3 font-normal">
                  Version
                </th>
                <th scope="col" className="py-1.5 pr-3 text-right font-normal">
                  Instances
                </th>
                <th scope="col" className="py-1.5 font-normal">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {snapshot.services.map((s, i) => (
                <motion.tr
                  key={s.id}
                  className="border-b border-hairline last:border-b-0"
                  initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    motionSafe
                      ? {
                          y: { ...springs.glide, delay: r3((i + 2) * step) },
                          opacity: {
                            duration: durations.base,
                            ease: easings.enter,
                            delay: r3((i + 2) * step),
                          },
                        }
                      : { duration: durations.fast }
                  }
                >
                  <td className="h-9 py-1 pr-3 font-medium text-foreground">
                    {s.name}
                  </td>
                  <td className="py-1 pr-3 font-mono text-[12px] text-ink-2">
                    {s.version}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono text-[12px] text-ink-2 tabular-nums">
                    {s.instances}
                  </td>
                  <td className="py-1">
                    <StatusChip status={s.status} />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          <ul className="flex flex-col @min-[40rem]:hidden">
            {snapshot.services.map((s, i) => (
              <li key={s.id}>
                <Rise
                  i={i + 2}
                  step={step}
                  motionSafe={motionSafe}
                  className="flex items-center gap-3 border-b border-hairline py-2 last:border-b-0"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-medium text-foreground">
                      {s.name}
                    </span>
                    <span className="truncate font-mono text-[11px] text-ink-3">
                      {`${s.version} · ${plural(s.instances, "instance")}`}
                    </span>
                  </span>
                  <StatusChip status={s.status} />
                </Rise>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      inert={!present}
      className="flex flex-col p-4 [grid-area:1/1]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.base) }}
      transition={{
        duration: motionSafe ? durations.base : durations.fast,
        ease: easings.enter,
      }}
    >
      {body}
    </motion.div>
  );
}

function StatusChip({ status }: { status: EnvRibbonServiceStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-1 px-2 text-[11px]",
        STATUS_TONE[status],
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[status])}
      />
      {STATUS_WORD[status]}
    </span>
  );
}

/* --------------------------------- frame --------------------------------- */

type Confirming = EnvRibbonConfirmRequest & { returnTo: HTMLElement | null };

/**
 * An app shell that always says which environment it is pointed at. A
 * ribbon along the frame's top edge carries the environment's colour, and a
 * change sweeps the new colour across it from the switcher outward on
 * `glide` — one value carries both edges to the frame's ends together, a
 * glint riding each — while the console's data cross-fades underneath, its
 * rows rising 4px in `cascade()` order. Entering a protected environment
 * grows a hatched edge on every destructive button on `snap`, each at the
 * moment the sweep's edge reaches it; leaving it, the edges fade on the exit
 * ease, because stepping out of production must not celebrate.
 *
 * Switching into a protected environment, or running a destructive action
 * inside one, asks first in an alert dialog that wants the environment's
 * name typed. Alt+E opens the switcher, a listbox with arrow keys,
 * type-ahead and Escape. Below a 22rem container the ribbon thickens into a
 * labelled bar. Under reduced motion the colour cross-fades in place and
 * the edges fade without growing; the data still changes.
 */
export function EnvRibbon({
  ribbonWidth = 4,
  hatch = "stripe",
  accent = "cobalt",
  environments = defaultEnvRibbonEnvironments,
  environment,
  defaultEnvironment = "staging",
  onEnvironmentChange,
  snapshots = defaultEnvRibbonSnapshots,
  actions = defaultEnvRibbonActions,
  onAction,
  onConfirmProtected,
  confirmByTyping = true,
  now = defaultEnvRibbonNow,
  product = "Waylight",
  title = "Deploy console",
  shortcut = true,
  status = "ready",
  onRetry,
  disabled = false,
  label,
  className,
}: EnvRibbonProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const listId = `${uid}-envs`;
  const dialogTitleId = `${uid}-dialog-title`;
  const dialogBodyId = `${uid}-dialog-body`;
  const fieldId = `${uid}-confirm`;

  const [own, setOwn] = React.useState(defaultEnvironment);
  const wanted = environment ?? own;
  const envIndex = Math.max(
    0,
    environments.findIndex((e) => e.id === wanted),
  );
  const env = environments[envIndex];
  const envId = env?.id ?? wanted;

  const colourOf = React.useCallback(
    (id: string) => {
      const i = environments.findIndex((e) => e.id === id);
      const found = environments[i];
      return (
        found?.colour ??
        FALLBACK[Math.max(0, i) % FALLBACK.length] ??
        PIGMENT.blue
      );
    },
    [environments],
  );

  /* -------------------------------- ribbon -------------------------------- */

  const [baseId, setBaseId] = React.useState(envId);
  const [sweepId, setSweepId] = React.useState(envId);
  const clip = useMotionValue(CLOSED);
  const sweepOpacity = useMotionValue(0);
  const sweepColour = useMotionValue(colourOf(envId));
  const glintLeft = useMotionValue("50%");
  const glintRight = useMotionValue("50%");
  const glint = useMotionValue(0);
  const sweepAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const running = React.useRef(false);
  const ribbonRef = React.useRef<HTMLDivElement | null>(null);
  const switcherRef = React.useRef<HTMLButtonElement | null>(null);
  const actionRefs = React.useRef(new Map<string, HTMLElement>());
  const [hatchDelay, setHatchDelay] = React.useState<Record<string, number>>(
    {},
  );
  // The environment the hatched edges answer to. It moves with the delays,
  // in one render, so each edge starts on the beat the sweep reaches it.
  const [armedId, setArmedId] = React.useState(envId);

  const startSweep = React.useCallback(
    (toId: string) => {
      sweepAnim.current?.stop();
      const ribbon = ribbonRef.current;
      const button = switcherRef.current;
      let origin = 50;
      let left = 0;
      let width = 0;
      if (ribbon && button) {
        const r = ribbon.getBoundingClientRect();
        const b = button.getBoundingClientRect();
        left = r.left;
        width = r.width;
        if (width > 0) {
          origin = r2(
            clamp(((b.left + b.width / 2 - r.left) / width) * 100, 0, 100),
          );
        }
      }
      // Each destructive button's edge grows when the colour arrives there.
      const delays: Record<string, number> = {};
      for (const [id, node] of actionRefs.current) {
        if (!motionSafe || width <= 0) {
          delays[id] = 0;
          continue;
        }
        const b = node.getBoundingClientRect();
        const at = ((b.left + b.width / 2 - left) / width) * 100;
        const s =
          at >= origin
            ? (at - origin) / Math.max(1, 100 - origin)
            : (origin - at) / Math.max(1, origin);
        delays[id] = reachTime(clamp(s, 0, 1));
      }
      setHatchDelay(delays);
      setArmedId(toId);
      sweepColour.set(colourOf(toId));
      setSweepId(toId);
      running.current = true;
      if (!motionSafe) {
        clip.set("inset(0 0% 0 0%)");
        sweepOpacity.jump(0);
        glint.set(0);
        sweepAnim.current = animate(0, 1, {
          duration: durations.base,
          ease: easings.enter,
          onUpdate: (v) => sweepOpacity.set(r3(v)),
          onComplete: () => {
            running.current = false;
            setBaseId(toId);
          },
        });
        return;
      }
      sweepOpacity.jump(1);
      sweepAnim.current = animate(0, 1, {
        ...springs.glide,
        onUpdate: (s) => {
          const l = origin * (1 - s);
          const r = origin + (100 - origin) * s;
          clip.set(`inset(0 ${r2(100 - r)}% 0 ${r2(l)}%)`);
          glintLeft.set(`${r2(l)}%`);
          glintRight.set(`${r2(r)}%`);
          glint.set(r3(Math.min(1, s * 6) * (1 - s) * 0.9));
        },
        onComplete: () => {
          running.current = false;
          glint.set(0);
          setBaseId(toId);
        },
      });
    },
    [
      clip,
      colourOf,
      glint,
      glintLeft,
      glintRight,
      motionSafe,
      sweepColour,
      sweepOpacity,
    ],
  );

  // A changed environment — chosen here or set by the host — sweeps in.
  const shown = React.useRef(envId);
  React.useEffect(() => {
    if (shown.current === envId) return;
    shown.current = envId;
    startSweep(envId);
  }, [envId, startSweep]);

  // Once the base has taken the colour (in the same paint), the sweep layer
  // closes; doing it from the animation's last frame would flash the old one.
  useIsoLayoutEffect(() => {
    if (running.current) return;
    clip.set(CLOSED);
    sweepOpacity.jump(0);
  }, [baseId, clip, sweepOpacity]);

  React.useEffect(
    () => () => {
      sweepAnim.current?.stop();
      running.current = false;
    },
    [],
  );

  /* ------------------------------- switcher ------------------------------- */

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [active, setActive] = React.useState(envIndex);
  const [menuNode, setMenuNode] = React.useState<HTMLDivElement | null>(null);
  const switcherWrap = React.useRef<HTMLDivElement | null>(null);
  const optionRefs = React.useRef(new Map<string, HTMLDivElement>());

  const openMenu = () => {
    if (disabled) return;
    setActive(envIndex);
    setMenuOpen(true);
  };
  const closeMenu = (refocus: boolean) => {
    setMenuOpen(false);
    if (refocus) switcherRef.current?.focus();
  };

  // Focus lands on the chosen option once the list has arrived.
  React.useEffect(() => {
    if (!menuOpen || !menuNode) return;
    const id = environments[active]?.id;
    if (id) optionRefs.current.get(id)?.focus();
  }, [active, environments, menuNode, menuOpen]);

  // A press anywhere outside closes the list without moving focus.
  React.useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      const wrap = switcherWrap.current;
      if (wrap && e.target instanceof Node && !wrap.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  /* ------------------------------ confirmation ----------------------------- */

  const [confirming, setConfirming] = React.useState<Confirming | null>(null);
  const [typed, setTyped] = React.useState("");
  const [dialogNode, setDialogNode] = React.useState<HTMLDivElement | null>(
    null,
  );
  const [result, setResult] = React.useState({ n: 0, text: "" });
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // The sentence is frozen from the render that sees the new environment —
  // never from the press, which a controlling host may still refuse.
  const [lastEnv, setLastEnv] = React.useState(envId);
  if (lastEnv !== envId) {
    setLastEnv(envId);
    setSaid((s) => ({
      n: s.n + 1,
      text: `Now on ${env?.name ?? envId}${env?.region ? `, ${env.region}` : ""}.`,
    }));
  }

  const confirmEnv = confirming
    ? environments.find((e) => e.id === confirming.envId)
    : undefined;
  const confirmAction =
    confirming?.kind === "action"
      ? actions.find((a) => a.id === confirming.actionId)
      : undefined;
  const needWord = confirmEnv?.name ?? "";
  const matches =
    !confirmByTyping ||
    typed.trim().toLowerCase() === needWord.trim().toLowerCase();

  React.useEffect(() => {
    if (!dialogNode) return;
    const field = dialogNode.querySelector<HTMLElement>(
      confirmByTyping ? "input" : "[data-er-confirm]",
    );
    field?.focus();
  }, [confirmByTyping, dialogNode]);

  const openConfirm = (
    request: EnvRibbonConfirmRequest,
    from: HTMLElement | null,
  ) => {
    setTyped("");
    setConfirming({ ...request, returnTo: from });
  };

  const closeConfirm = () => {
    const back = confirming?.returnTo;
    setConfirming(null);
    setTyped("");
    const target =
      back && back.isConnected ? back : (switcherRef.current ?? null);
    // Focus goes back once the dialog has let go of the tree.
    window.requestAnimationFrame(() => target?.focus());
  };

  const commitEnv = (id: string) => {
    const next = environments.find((e) => e.id === id);
    if (!next) return;
    if (environment === undefined) setOwn(id);
    onEnvironmentChange?.(id, next);
  };

  const choose = (id: string) => {
    setMenuOpen(false);
    if (id === envId) {
      switcherRef.current?.focus();
      return;
    }
    const next = environments.find((e) => e.id === id);
    if (next?.protected) {
      openConfirm({ kind: "switch", envId: id }, switcherRef.current);
      return;
    }
    commitEnv(id);
    switcherRef.current?.focus();
  };

  const finish = (action: EnvRibbonAction, onEnv: string) => {
    const where = environments.find((e) => e.id === onEnv)?.name ?? onEnv;
    const text = `${action.done ?? action.label} on ${where}`;
    setResult((r) => ({ n: r.n + 1, text }));
    say(`${text}.`);
  };

  const runAction = (action: EnvRibbonAction, from: HTMLElement) => {
    if (disabled || status !== "ready") return;
    if (action.kind === "destructive" && env?.protected) {
      openConfirm({ kind: "action", envId, actionId: action.id }, from);
      return;
    }
    finish(action, envId);
    onAction?.(action.id, envId);
  };

  const submitConfirm = () => {
    if (!confirming || !matches) return;
    const request: EnvRibbonConfirmRequest =
      confirming.kind === "switch"
        ? { kind: "switch", envId: confirming.envId }
        : {
            kind: "action",
            envId: confirming.envId,
            actionId: confirming.actionId,
          };
    closeConfirm();
    if (request.kind === "switch") {
      commitEnv(request.envId);
    } else if (confirmAction) {
      finish(confirmAction, request.envId);
    }
    onConfirmProtected?.(request);
  };

  /* -------------------------------- keyboard ------------------------------- */

  const rootRef = React.useRef<HTMLElement | null>(null);
  const hovered = React.useRef(false);

  const onShortcut = (e: KeyboardEvent | React.KeyboardEvent) => {
    if (!shortcut || disabled || confirming) return false;
    // By code, not key: on a Mac, Alt+E is a dead key that types nothing.
    if (!e.altKey || e.metaKey || e.ctrlKey || e.code !== "KeyE") return false;
    e.preventDefault();
    if (menuOpen) closeMenu(true);
    else openMenu();
    return true;
  };

  const shortcutRef = React.useRef(onShortcut);
  React.useEffect(() => {
    shortcutRef.current = onShortcut;
  });

  // With nothing focused, the frame under the pointer still answers Alt+E.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = document.activeElement;
      if (!hovered.current) return;
      if (a && a !== document.body && rootRef.current?.contains(a)) return;
      if (a && a !== document.body) return;
      shortcutRef.current(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const count = environments.length;
    if (count === 0) return;
    const move = (i: number) => setActive(((i % count) + count) % count);
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(active + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(active - 1);
        break;
      case "Home":
        e.preventDefault();
        move(0);
        break;
      case "End":
        e.preventDefault();
        move(count - 1);
        break;
      case "Enter":
      case " ": {
        e.preventDefault();
        const id = environments[active]?.id;
        if (id) choose(id);
        break;
      }
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        closeMenu(true);
        break;
      case "Tab":
        setMenuOpen(false);
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key) && !e.altKey) {
          const k = e.key.toLowerCase();
          for (let j = 1; j <= count; j += 1) {
            const i = (active + j) % count;
            if (environments[i]?.name.toLowerCase().startsWith(k)) {
              move(i);
              break;
            }
          }
        }
    }
  };

  const onDialogKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeConfirm();
      return;
    }
    if (e.key !== "Tab" || !dialogNode) return;
    const nodes = [
      ...dialogNode.querySelectorAll<HTMLElement>("input, button"),
    ].filter((n) => !n.hasAttribute("disabled"));
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  /* --------------------------------- render -------------------------------- */

  const baseEnv = environments.find((e) => e.id === baseId) ?? env;
  const sweepEnv = environments.find((e) => e.id === sweepId) ?? env;
  const isProtected = !!env?.protected;
  const armedProtected = !!environments.find((e) => e.id === armedId)
    ?.protected;
  const snapshot = snapshots[envId];
  const name = label ?? `${product} ${title}`;
  const envColour = colourOf(envId);

  const barText = (e: EnvRibbonEnvironment | undefined) =>
    e ? [e.name, e.region].filter(Boolean).join(" · ") : "";
  const barInk = (colour: string) => `oklch(from ${colour} 0.25 0.05 h)`;

  const ribbon = (
    <div
      ref={ribbonRef}
      aria-hidden
      className="relative h-[var(--er-rw)] shrink-0 overflow-hidden @max-[22rem]:h-[calc(var(--er-rw)*1.5_+_14px)]"
    >
      <div
        className="absolute inset-0 flex items-center px-4"
        style={{ backgroundColor: colourOf(baseId) }}
      >
        <span
          className="hidden truncate font-mono text-[10px] font-medium tracking-[0.08em] uppercase @max-[22rem]:block"
          style={{ color: barInk(colourOf(baseId)) }}
        >
          {barText(baseEnv)}
        </span>
      </div>
      <motion.div
        className="absolute inset-0 flex items-center px-4"
        style={{
          backgroundColor: sweepColour,
          clipPath: clip,
          opacity: sweepOpacity,
        }}
      >
        <span
          className="hidden truncate font-mono text-[10px] font-medium tracking-[0.08em] uppercase @max-[22rem]:block"
          style={{ color: barInk(colourOf(sweepId)) }}
        >
          {barText(sweepEnv)}
        </span>
      </motion.div>
      {[glintLeft, glintRight].map((x, i) => (
        <motion.span
          key={i}
          className="pointer-events-none absolute inset-y-0 w-10 -translate-x-1/2"
          style={{
            left: x,
            opacity: glint,
            backgroundImage:
              "linear-gradient(90deg, transparent, color-mix(in oklab, white 75%, transparent), transparent)",
          }}
        />
      ))}
    </div>
  );

  const switcher = (
    <div ref={switcherWrap} className="relative ml-auto shrink-0">
      <div className="flex items-center gap-2">
        <kbd
          aria-hidden
          className="hidden h-5 items-center rounded-1 border border-hairline px-1 font-mono text-[10px] text-ink-3 @min-[40rem]:inline-flex"
        >
          Alt E
        </kbd>
        <button
          ref={switcherRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? listId : undefined}
          aria-keyshortcuts={shortcut ? "Alt+E" : undefined}
          aria-label={`Environment: ${env?.name ?? envId}${isProtected ? ", protected" : ""}. Change environment`}
          disabled={disabled}
          onClick={() => (menuOpen ? closeMenu(false) : openMenu())}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              openMenu();
            }
          }}
          className={cn(
            "inline-flex h-8 max-w-[11rem] items-center gap-2 rounded-2 border border-hairline bg-surface-1 px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60",
            FOCUS,
          )}
        >
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full transition-colors duration-300"
            style={{ backgroundColor: envColour }}
          />
          <span className="truncate">{env?.name ?? envId}</span>
          {isProtected ? (
            <Lock aria-hidden className="size-3 shrink-0 text-danger" />
          ) : null}
          <motion.span
            aria-hidden
            className="inline-flex shrink-0 text-ink-3"
            initial={false}
            animate={{ rotate: menuOpen ? 180 : 0 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            <ChevronDown className="size-3.5" />
          </motion.span>
        </button>
      </div>
      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            key="menu"
            ref={setMenuNode}
            id={listId}
            role="listbox"
            aria-label="Environments"
            onKeyDown={onMenuKey}
            initial={{
              opacity: 0,
              y: motionSafe ? -distances.nudge : 0,
              scale: motionSafe ? 0.97 : 1,
            }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              y: motionSafe ? -distances.nudge : 0,
              transition: exitFor(durations.fast),
            }}
            transition={
              motionSafe
                ? {
                    y: springs.snap,
                    scale: springs.snap,
                    opacity: { duration: durations.fast },
                  }
                : { duration: durations.fast }
            }
            style={{ originX: "100%", originY: "0%" }}
            className="absolute top-full right-0 z-20 mt-1.5 flex w-[min(16rem,calc(100cqw-2rem))] flex-col gap-0.5 rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_10px_28px_color-mix(in_oklab,black_18%,transparent)]"
          >
            {environments.map((e, i) => {
              const selected = e.id === envId;
              return (
                <div
                  key={e.id}
                  ref={(node) => {
                    if (node) optionRefs.current.set(e.id, node);
                    else optionRefs.current.delete(e.id);
                  }}
                  role="option"
                  aria-selected={selected}
                  tabIndex={i === active ? 0 : -1}
                  onClick={() => choose(e.id)}
                  onPointerMove={() => {
                    if (active !== i) setActive(i);
                  }}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-2 px-2.5 py-2 text-left",
                    i === active ? "bg-surface-2" : "",
                    FOCUS_IN,
                  )}
                >
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: colourOf(e.id) }}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                      <span className="truncate">{e.name}</span>
                      {e.protected ? (
                        <Lock
                          aria-hidden
                          className="size-3 shrink-0 text-danger"
                        />
                      ) : null}
                      {e.protected ? (
                        <span className="sr-only">, protected</span>
                      ) : null}
                    </span>
                    {e.region || e.host ? (
                      <span className="truncate font-mono text-[10.5px] text-ink-3">
                        {[e.region, e.host].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
                  </span>
                  <Check
                    aria-hidden
                    className={cn(
                      "size-3.5 shrink-0 text-[var(--er-ink)]",
                      selected ? "opacity-100" : "opacity-0",
                    )}
                  />
                </div>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );

  const actionBar = (
    <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-4 py-2.5">
      {actions.map((action) => {
        const kind = action.kind ?? "neutral";
        const Icon = action.icon ? ICONS[action.icon] : null;
        const destructive = kind === "destructive";
        const guarded = destructive && isProtected;
        const ring = destructive && hatch !== "off";
        const armed = destructive && armedProtected;
        const delay = hatchDelay[action.id] ?? 0;
        return (
          <span key={action.id} className="relative inline-flex">
            {ring ? (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute -inset-1 rounded-[10px]"
                initial={false}
                animate={{
                  opacity: armed ? 1 : 0,
                  scale: armed || !motionSafe ? 1 : 0.92,
                }}
                transition={
                  armed
                    ? motionSafe
                      ? {
                          scale: { ...springs.snap, delay },
                          opacity: { duration: durations.fast, delay },
                        }
                      : { duration: durations.base }
                    : exitFor(durations.base)
                }
                style={{
                  backgroundImage: HATCH[hatch],
                  padding: 3,
                  maskImage:
                    "linear-gradient(black, black), linear-gradient(black, black)",
                  maskClip: "content-box, border-box",
                  maskComposite: "exclude",
                  WebkitMaskComposite: "xor",
                }}
              />
            ) : null}
            <motion.button
              ref={(node: HTMLButtonElement | null) => {
                if (!destructive) return;
                if (node) actionRefs.current.set(action.id, node);
                else actionRefs.current.delete(action.id);
              }}
              type="button"
              title={guarded ? `${action.label} (asks first)` : action.label}
              disabled={disabled}
              aria-disabled={status !== "ready" || undefined}
              onClick={(e) => runAction(action, e.currentTarget)}
              whileTap={
                motionSafe && status === "ready" ? { scale: 0.97 } : undefined
              }
              transition={springs.flick}
              className={cn(
                "relative inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:opacity-60",
                kind === "primary"
                  ? "bg-[var(--er-ink)] text-background hover:opacity-90"
                  : destructive
                    ? "border border-hairline bg-surface-1 text-danger hover:bg-surface-2"
                    : "border border-hairline bg-surface-1 text-ink-2 hover:bg-surface-2 hover:text-foreground",
                kind === "primary"
                  ? "@max-[22rem]:px-2.5"
                  : "@max-[22rem]:w-8 @max-[22rem]:justify-center @max-[22rem]:px-0",
                FOCUS,
              )}
            >
              {Icon ? <Icon aria-hidden className="size-3.5 shrink-0" /> : null}
              <span
                className={cn(
                  "truncate",
                  (kind !== "primary" || action.short) &&
                    "@max-[22rem]:sr-only",
                )}
              >
                {action.label}
              </span>
              {kind === "primary" && action.short ? (
                <span
                  aria-hidden
                  className="hidden truncate @max-[22rem]:inline"
                >
                  {action.short}
                </span>
              ) : null}
              {guarded ? (
                <>
                  <Lock
                    aria-hidden
                    className="size-3 shrink-0 @max-[22rem]:hidden"
                  />
                  <span className="sr-only">, asks for confirmation</span>
                </>
              ) : null}
            </motion.button>
          </span>
        );
      })}
    </div>
  );

  const ready = status === "ready";

  return (
    <div
      className={cn("@container w-full", className)}
      style={
        {
          "--er-ink": ACCENTS[accent as EnvRibbonAccent] ?? accent,
          "--er-wash": "color-mix(in oklab, var(--er-ink) 14%, transparent)",
          "--er-rw": `${clamp(Math.round(ribbonWidth), 1, 12)}px`,
        } as React.CSSProperties
      }
    >
      <section
        ref={rootRef}
        aria-labelledby={label ? undefined : titleId}
        aria-label={label ? name : undefined}
        onKeyDown={(e) => {
          onShortcut(e);
        }}
        onPointerEnter={() => {
          hovered.current = true;
        }}
        onPointerLeave={() => {
          hovered.current = false;
        }}
        className="relative flex max-h-[34rem] w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground"
      >
        {ribbon}
        <div
          inert={!!confirming}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <header className="relative flex items-center gap-3 px-4 py-3">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-7 opacity-[0.14] transition-colors duration-500"
              style={{
                backgroundColor: envColour,
                maskImage: "linear-gradient(to bottom, black, transparent)",
              }}
            />
            <span
              aria-hidden
              className="relative flex size-8 shrink-0 items-center justify-center rounded-2 bg-[var(--er-wash)] text-sm font-semibold text-[var(--er-ink)]"
            >
              {product.charAt(0)}
            </span>
            <div className="relative flex min-w-0 flex-1 flex-col @max-[22rem]:sr-only">
              <p
                id={titleId}
                className="truncate text-sm leading-5 font-semibold"
              >
                <span>{product}</span>
                <span className="sr-only"> </span>
                <span className="block truncate text-xs leading-4 font-normal text-ink-3">
                  {title}
                </span>
              </p>
            </div>
            {switcher}
          </header>

          <div className="grid flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain border-t border-hairline">
            <AnimatePresence initial={false}>
              <Snapshot
                key={`${envId}:${status}`}
                env={env}
                snapshot={snapshot}
                status={status}
                now={now}
                motionSafe={motionSafe}
                onRetry={onRetry}
              />
            </AnimatePresence>
          </div>

          {actions.length > 0 && ready ? actionBar : null}

          <footer className="flex h-8 shrink-0 items-center gap-2 border-t border-hairline px-4 font-mono text-[10.5px] text-ink-3">
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full transition-colors duration-300"
              style={{ backgroundColor: envColour }}
            />
            <span className="shrink-0 text-ink-2">{env?.name ?? envId}</span>
            {env?.region ? (
              <span className="hidden shrink-0 @min-[30rem]:inline">
                {`· ${env.region}`}
              </span>
            ) : null}
            {snapshot && ready ? (
              <span className="hidden shrink-0 @min-[30rem]:inline">
                {`· ${snapshot.version}`}
              </span>
            ) : null}
            <span className="grid min-w-0 flex-1 justify-items-end">
              <AnimatePresence initial={false}>
                {result.text ? (
                  <motion.span
                    key={result.n}
                    className="max-w-full truncate text-right [grid-area:1/1]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{
                      duration: durations.base,
                      ease: easings.enter,
                    }}
                  >
                    {result.text}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </span>
          </footer>
        </div>

        <AnimatePresence>
          {confirming ? (
            <motion.div
              key="scrim"
              className="absolute inset-0 z-30 flex items-center-safe justify-center-safe overflow-y-auto p-4"
              style={{
                backgroundColor:
                  "color-mix(in oklab, var(--background) 72%, transparent)",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast }}
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) closeConfirm();
              }}
            >
              <motion.div
                ref={setDialogNode}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={dialogTitleId}
                aria-describedby={dialogBodyId}
                onKeyDown={onDialogKey}
                initial={{
                  y: motionSafe ? distances.step : 0,
                  scale: motionSafe ? 0.98 : 1,
                }}
                animate={{ y: 0, scale: 1 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
                className="flex w-full max-w-sm flex-col gap-3 rounded-3 border border-hairline-strong bg-popover p-4 text-popover-foreground shadow-[0_16px_40px_color-mix(in_oklab,black_22%,transparent)]"
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="flex size-8 shrink-0 items-center justify-center rounded-full"
                    style={{
                      backgroundColor:
                        "color-mix(in oklab, oklch(from var(--danger) 0.64 0.2 h) 16%, transparent)",
                    }}
                  >
                    <ShieldAlert className="size-4 text-danger" />
                  </span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <h2
                      id={dialogTitleId}
                      className="text-sm leading-5 font-semibold text-foreground"
                    >
                      {confirming.kind === "switch"
                        ? `Switch to ${needWord}`
                        : `${confirmAction?.label ?? "Run"} on ${needWord}`}
                    </h2>
                    <p
                      id={dialogBodyId}
                      className="text-[13px] leading-5 text-ink-2"
                    >
                      {confirming.kind === "switch"
                        ? `You are about to work on ${needWord}${confirmEnv?.region ? ` in ${confirmEnv.region}` : ""}. Destructive actions here reach real customers.`
                        : (confirmAction?.consequence ??
                          "This reaches real customers.")}
                    </p>
                  </div>
                </div>
                {confirmByTyping ? (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={fieldId} className="text-[12px] text-ink-2">
                      Type{" "}
                      <span className="font-mono font-medium text-foreground">
                        {needWord}
                      </span>{" "}
                      to confirm
                    </label>
                    <input
                      id={fieldId}
                      value={typed}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(e) => {
                        const v = e.currentTarget.value;
                        setTyped(v);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          submitConfirm();
                        }
                      }}
                      className={cn(
                        "h-9 rounded-2 border bg-surface-1 px-3 font-mono text-[13px] text-foreground transition-colors placeholder:text-ink-3",
                        matches ? "border-hairline-strong" : "border-hairline",
                        FOCUS,
                      )}
                      placeholder={needWord}
                    />
                  </div>
                ) : null}
                <div className="flex flex-wrap justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeConfirm}
                    className={cn(
                      "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-[13px] text-foreground transition-colors hover:bg-surface-2",
                      FOCUS,
                    )}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    data-er-confirm=""
                    aria-disabled={!matches || undefined}
                    onClick={submitConfirm}
                    className={cn(
                      "inline-flex h-8 items-center rounded-2 px-3 text-[13px] font-medium transition-colors",
                      matches
                        ? "bg-destructive text-destructive-foreground hover:opacity-90"
                        : "cursor-not-allowed bg-surface-2 text-ink-3",
                      FOCUS,
                    )}
                  >
                    {confirming.kind === "switch"
                      ? `Switch to ${needWord}`
                      : (confirmAction?.label ?? "Confirm")}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <p role="status" className="sr-only">
          <span key={said.n}>{said.text}</span>
        </p>
      </section>
    </div>
  );
}
