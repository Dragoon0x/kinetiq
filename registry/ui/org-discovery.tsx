"use client";

import * as React from "react";

import {
  AnimatePresence,
  LayoutGroup,
  motion,
  type TargetAndTransition,
  type Transition,
} from "motion/react";
import {
  ArrowRight,
  Building2,
  Check,
  KeyRound,
  Mail,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  TriangleAlert,
  Users,
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

export type OrgSso = "required" | "available" | "none";

export type OrgMember = { id: string; name: string };

export type OrgRecord = {
  id: string;
  /** The email domain that finds it, e.g. "fieldline.co". */
  domain: string;
  name: string;
  /** How many people are in it already. */
  memberCount: number;
  /** Whether single sign-on is the only way in, one way in, or not set up. */
  sso: OrgSso;
  /** A few of the members, shown in the strip; the rest are counted. */
  members: OrgMember[];
};

/** What a domain lookup can come back with. */
export type OrgLookupResult =
  | { kind: "found"; org: OrgRecord }
  | { kind: "personal" }
  | { kind: "unknown" };

/** Resolves a domain; a rejection reads as a failed lookup with a Retry. */
export type OrgLookup = (
  domain: string,
) => OrgLookupResult | Promise<OrgLookupResult>;

export type OrgChoice = "join" | "sso" | "create";
export type OrgApproval = "pending" | "approved" | "declined";
export type OrgDiscoveryStatus = "ready" | "loading" | "error";
export type OrgCardStyle = "card" | "inline";
export type OrgDensity = "compact" | "cozy" | "roomy";
export type OrgAccent = "cobalt" | "signal" | "ink";

export type OrgJoinRequest = {
  /** A request an admin approves, or a single sign-on redirect. */
  via: "request" | "sso";
  email: string;
  domain: string;
  /** The organisation found, or null when the domain had none yet. */
  org: OrgRecord | null;
};

export type OrgCreateRequest = {
  name: string;
  email: string;
  /** The work domain the organisation claims, or null from a personal address. */
  domain: string | null;
};

export type OrgDiscoveryProps = {
  /** How the discovery sits under the field: a raised card, or a section that unfolds inline. @default "card" */
  cardStyle?: OrgCardStyle;
  /** Padding, type size and row heights. @default "cozy" */
  density?: OrgDensity;
  /** The colour the mark, the strip, the rail and the chosen option take. @default "cobalt" */
  accent?: OrgAccent;
  /** Resolves a work domain to an organisation, a personal address or nothing. @default defaultOrgLookup */
  lookup?: OrgLookup;
  /** Controlled email. */
  value?: string;
  /** Initial email when uncontrolled. @default "" */
  defaultValue?: string;
  /** Fires on every keystroke in the email field. */
  onChange?: (email: string) => void;
  /** A lookup came back, with what it found and the domain it looked up. */
  onDiscover?: (result: OrgLookupResult, domain: string) => void;
  /** A join request was sent, or single sign-on was chosen. */
  onJoin?: (request: OrgJoinRequest) => void;
  /** Create organisation was pressed with a name. */
  onCreate?: (request: OrgCreateRequest) => void;
  /** Where a sent join request stands; the host moves it on. @default "pending" */
  approval?: OrgApproval;
  /** Whether the step itself is ready: a skeleton in the card's place while loading, a retry when it failed. @default "ready" */
  status?: OrgDiscoveryStatus;
  /** Try again was pressed after a failed load or lookup. */
  onRetry?: () => void;
  /** The heading. @default "Find your organisation" */
  title?: string;
  /** The small line above the heading. @default "Gaugeworks · Step 2 of 3" */
  eyebrow?: string;
  /** Shown under the prompt before an address is typed; empty hides it. @default "Try an address at fieldline.co, basinworks.io or coldbrook.app" */
  hint?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the card scrolls inside it. @default 540 */
  height?: number;
  /** Read only: the field and every button are inert. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** Three organisations already on Gaugeworks, found by their domains. */
export const defaultOrgDirectory: OrgRecord[] = [
  {
    id: "fieldline",
    domain: "fieldline.co",
    name: "Fieldline",
    memberCount: 14,
    sso: "available",
    members: [
      { id: "ines", name: "Ines Varga" },
      { id: "tomas", name: "Tomas Reyes" },
      { id: "mara", name: "Mara Lind" },
      { id: "kenji", name: "Kenji Aoki" },
      { id: "priya", name: "Priya Nair" },
      { id: "rhea", name: "Rhea Vance" },
    ],
  },
  {
    id: "basinworks",
    domain: "basinworks.io",
    name: "Basinworks",
    memberCount: 38,
    sso: "required",
    members: [
      { id: "dev", name: "Dev Okafor" },
      { id: "lena", name: "Lena Strand" },
      { id: "oskar", name: "Oskar Hale" },
      { id: "yara", name: "Yara Bello" },
      { id: "jonah", name: "Jonah Pike" },
      { id: "amal", name: "Amal Haddad" },
    ],
  },
  {
    id: "coldbrook",
    domain: "coldbrook.app",
    name: "Coldbrook",
    memberCount: 5,
    sso: "none",
    members: [
      { id: "noor", name: "Noor Said" },
      { id: "felix", name: "Felix Tan" },
      { id: "greta", name: "Greta Voss" },
      { id: "ivo", name: "Ivo Marsh" },
      { id: "sune", name: "Sune Berg" },
    ],
  },
];

/** Domains that belong to people rather than organisations. */
export const defaultOrgPersonalDomains: string[] = [
  "postbox.me",
  "mailnest.com",
  "homemail.co",
];

export type OrgLookupOptions = {
  /** @default defaultOrgDirectory */
  directory?: OrgRecord[];
  /** @default defaultOrgPersonalDomains */
  personalDomains?: string[];
  /** How long the pretend lookup takes, in ms. @default 700 */
  delay?: number;
};

/** A lookup that answers from a directory after a short wait. */
export function createOrgLookup({
  directory = defaultOrgDirectory,
  personalDomains = defaultOrgPersonalDomains,
  delay = 700,
}: OrgLookupOptions = {}): OrgLookup {
  return (domain) => {
    const key = domain.trim().toLowerCase();
    const answer = (): OrgLookupResult => {
      const org = directory.find((o) => o.domain.toLowerCase() === key);
      if (org) return { kind: "found", org };
      if (personalDomains.some((d) => d.toLowerCase() === key)) {
        return { kind: "personal" };
      }
      return { kind: "unknown" };
    };
    if (delay <= 0) return answer();
    return new Promise((resolve) => {
      setTimeout(() => resolve(answer()), delay);
    });
  };
}

export const defaultOrgLookup: OrgLookup = createOrgLookup();

export const defaultOrgHint =
  "Try an address at fieldline.co, basinworks.io or coldbrook.app";

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const BUTTON =
  "inline-flex items-center justify-center gap-1.5 rounded-2 border border-hairline text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground";

const PRIMARY =
  "inline-flex w-full items-center justify-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90";

/** The card's two columns from 36rem; one stack below it. */
const COLUMNS =
  "flex flex-col @min-[36rem]:flex-row @min-[36rem]:items-start @min-[36rem]:gap-6";
const RIGHT = "min-w-0 flex-1 @min-[36rem]:max-w-[18rem]";

const ACCENTS: Record<OrgAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ink: "var(--ink)",
};

const DENSITY: Record<
  OrgDensity,
  {
    pad: string;
    gap: string;
    field: string;
    option: string;
    button: string;
    text: string;
    name: string;
    mark: number;
    avatar: number;
  }
> = {
  compact: {
    pad: "px-3 py-3",
    gap: "gap-2.5",
    field: "h-9",
    option: "px-2.5 py-2",
    button: "h-8",
    text: "text-[12px]",
    name: "text-[15px]",
    mark: 36,
    avatar: 24,
  },
  cozy: {
    pad: "px-4 py-4",
    gap: "gap-3",
    field: "h-10",
    option: "px-3 py-2.5",
    button: "h-9",
    text: "text-[13px]",
    name: "text-base",
    mark: 44,
    avatar: 28,
  },
  roomy: {
    pad: "px-5 py-5",
    gap: "gap-4",
    field: "h-11",
    option: "px-3.5 py-3",
    button: "h-10",
    text: "text-sm",
    name: "text-lg",
    mark: 52,
    avatar: 32,
  },
};

/** The wait before a typed address is looked up, in ms. */
const DEBOUNCE_MS = 380;
/** How long the pretend admin notification takes, in ms. */
const NOTIFY_MS = 1100;
/** How long the pretend identity-provider round trip takes, in ms. */
const SSO_MS = 1500;
/** Most avatars drawn in the strip; the rest are counted. */
const STRIP_MAX = 5;

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const EMAIL = /^[^\s@]+@([^\s@]+\.[a-z]{2,})$/i;

/** The domain of a complete address, lower-cased, or null while it is partial. */
export const domainOf = (email: string): string | null => {
  const m = EMAIL.exec(email.trim());
  return m?.[1] ? m[1].toLowerCase() : null;
};

/** "basinworks.io" becomes "Basinworks": a first guess at a new organisation's name. */
export const nameFromDomain = (domain: string): string => {
  const head = domain.split(".")[0] ?? domain;
  const words = head.split(/[-_]+/).filter(Boolean);
  return words.map((w) => (w[0] ?? "").toUpperCase() + w.slice(1)).join(" ");
};

const initialOf = (name: string) => (name.trim()[0] ?? "?").toUpperCase();

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => (w[0] ?? "").toUpperCase())
    .join("");

/** A member's hue, spread around the wheel so neighbours never match. */
const hueOf = (i: number) => (i * 67 + 20) % 360;

const noopSubscribe = () => () => {};

const SSO_WORD: Record<OrgSso, string> = {
  required: "SSO required",
  available: "SSO available",
  none: "No SSO",
};

type Look =
  | { domain: string; state: "looking" }
  | { domain: string; state: "failed" }
  | { domain: string; state: "done"; result: OrgLookupResult };

type Outcome =
  | { kind: "requested" }
  | { kind: "sso"; stage: "redirect" | "done" }
  | { kind: "created"; name: string };

type Option = {
  id: OrgChoice;
  title: string;
  detail: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
};

const optionsFor = (result: OrgLookupResult): Option[] => {
  if (result.kind === "found") {
    const { org } = result;
    const out: Option[] = [];
    if (org.sso !== "required") {
      out.push({
        id: "join",
        title: "Request to join",
        detail: `An admin at ${org.name} approves you.`,
        icon: Send,
      });
    }
    if (org.sso !== "none") {
      out.push({
        id: "sso",
        title: "Join with SSO",
        detail: `Sign in through ${org.name}'s identity provider.`,
        icon: KeyRound,
      });
    }
    return out;
  }
  if (result.kind === "unknown") {
    return [
      {
        id: "join",
        title: "Request an invite",
        detail: "We hold it until someone from your domain sets up a team.",
        icon: Send,
      },
      {
        id: "create",
        title: "Create a new organisation",
        detail: "Start one and invite your teammates.",
        icon: Plus,
      },
    ];
  }
  return [
    {
      id: "create",
      title: "Create a new organisation",
      detail: "Start one and invite your teammates.",
      icon: Plus,
    },
  ];
};

/* ----------------------------------------------------------------------- */
/*                                   Hooks                                  */
/* ----------------------------------------------------------------------- */

/** True while the node is in the viewport and the tab is in front. */
function useOnScreen(node: HTMLElement | null): boolean {
  const [visible, setVisible] = React.useState(true);
  const [hidden, setHidden] = React.useState(false);
  React.useEffect(() => {
    if (!node) return;
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (entry) setVisible(entry.isIntersecting);
      });
      io.observe(node);
    }
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [node]);
  return visible && !hidden;
}

/* ----------------------------------------------------------------------- */
/*                               Rolling digits                             */
/* ----------------------------------------------------------------------- */

/** A number whose digits roll up from zero when it mounts. */
function Roll({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const digits = String(Math.max(0, Math.round(value))).split("");
  const step = cascade(digits.length + 1);
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      <span className="invisible w-0">0</span>
      {digits.map((d, i) => (
        <span
          key={digits.length - 1 - i}
          className="relative inline-block overflow-hidden"
          style={{ width: "1ch", height: `${DIGIT_H}em` }}
        >
          <motion.span
            className="absolute inset-x-0 top-0 flex flex-col items-center"
            initial={motionSafe ? { y: "0em" } : false}
            animate={{ y: `${-r3(Number(d) * DIGIT_H)}em` }}
            transition={
              motionSafe
                ? { ...springs.snap, delay: r3(i * step) }
                : { duration: 0 }
            }
          >
            {DIGITS.map((n) => (
              <span key={n} style={{ height: `${DIGIT_H}em` }}>
                {n}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Mark                                   */
/* ----------------------------------------------------------------------- */

/**
 * An organisation's logo mark, drawn: a rounded square whose outline draws
 * on flick while the initial lands inside it on recoil. `ghost` is the mark
 * of an organisation that does not exist yet — dashed, with no fill.
 */
function Mark({
  initial,
  size,
  ghost,
  motionSafe,
  land,
}: {
  initial: string;
  size: number;
  ghost?: boolean;
  motionSafe: boolean;
  /** Replays the landing, for a mark that has just been created. */
  land?: boolean;
}) {
  const r = Math.round(size * 0.24);
  return (
    <span
      aria-hidden
      className="relative block shrink-0"
      style={{ width: size, height: size }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0">
        <rect
          x={1}
          y={1}
          width={size - 2}
          height={size - 2}
          rx={r}
          fill={ghost ? "transparent" : "var(--od-wash)"}
        />
        <motion.rect
          x={1}
          y={1}
          width={size - 2}
          height={size - 2}
          rx={r}
          fill="none"
          stroke={ghost ? "var(--hairline-strong)" : "var(--od-edge)"}
          strokeWidth={1.5}
          strokeDasharray={ghost ? "3 3" : undefined}
          initial={motionSafe && !ghost ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={motionSafe ? springs.flick : { duration: 0 }}
        />
      </svg>
      <motion.span
        key={land ? "landed" : "still"}
        className={cn(
          "absolute inset-0 flex items-center justify-center font-semibold",
          ghost ? "text-ink-3" : "text-(--od-accent)",
        )}
        style={{ fontSize: Math.round(size * 0.48) }}
        initial={motionSafe ? { scale: 0.6, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={
          motionSafe
            ? {
                ...springs.recoil,
                delay: durations.blink,
                opacity: { duration: durations.fast },
              }
            : { duration: 0 }
        }
      >
        {initial}
      </motion.span>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Avatars                                 */
/* ----------------------------------------------------------------------- */

/** The teammates found, drifting into an overlapping strip one after another. */
function Strip({
  members,
  total,
  size,
  motionSafe,
}: {
  members: OrgMember[];
  total: number;
  size: number;
  motionSafe: boolean;
}) {
  const shown = members.slice(0, STRIP_MAX);
  const rest = Math.max(0, total - shown.length);
  const step = cascade(shown.length + 1);
  const names = members.map((m) => m.name).join(", ");
  return (
    <span
      role="img"
      aria-label={`${names}${rest > 0 ? ` and ${rest} more` : ""}`}
      className="flex items-center"
      style={{ height: size }}
    >
      {shown.map((m, i) => {
        const hue = hueOf(i);
        return (
          <motion.span
            key={m.id}
            title={m.name}
            className="relative flex shrink-0 items-center justify-center rounded-full border-2 border-card font-mono font-medium"
            style={{
              width: size,
              height: size,
              marginLeft: i === 0 ? 0 : -Math.round(size * 0.28),
              fontSize: Math.round(size * 0.36),
              background: `oklch(0.8 0.08 ${hue})`,
              color: `oklch(0.3 0.08 ${hue})`,
              zIndex: shown.length - i,
            }}
            initial={
              motionSafe
                ? { opacity: 0, x: -distances.step, scale: 0.9 }
                : { opacity: 0 }
            }
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={
              motionSafe
                ? {
                    ...springs.drift,
                    delay: r3(durations.fast + i * step),
                    opacity: { duration: durations.base, ease: easings.enter },
                  }
                : { duration: durations.fast }
            }
          >
            {initialsOf(m.name)}
          </motion.span>
        );
      })}
      {rest > 0 ? (
        <motion.span
          className="relative flex shrink-0 items-center justify-center rounded-full border-2 border-card bg-surface-2 font-mono text-ink-2"
          style={{
            height: size,
            minWidth: size,
            paddingInline: 6,
            marginLeft: -Math.round(size * 0.28),
            fontSize: Math.round(size * 0.34),
          }}
          initial={
            motionSafe ? { opacity: 0, x: -distances.step } : { opacity: 0 }
          }
          animate={{ opacity: 1, x: 0 }}
          transition={
            motionSafe
              ? {
                  ...springs.drift,
                  delay: r3(durations.fast + shown.length * step),
                  opacity: { duration: durations.base, ease: easings.enter },
                }
              : { duration: durations.fast }
          }
        >
          +{rest}
        </motion.span>
      ) : null}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Rail                                   */
/* ----------------------------------------------------------------------- */

type RailStep = {
  id: string;
  label: string;
  detail?: string;
  state: "done" | "active" | "todo" | "failed";
};

/**
 * The approval wait: a vertical track whose fill climbs on glide as each
 * step lands. Done dots fill on snap with a check drawn on flick; the active
 * dot breathes only while the surface is on screen.
 */
function Rail({
  steps,
  motionSafe,
  breathing,
  density,
}: {
  steps: RailStep[];
  motionSafe: boolean;
  breathing: boolean;
  density: OrgDensity;
}) {
  const lastDone = steps.reduce(
    (acc, s, i) => (s.state === "done" ? i : acc),
    -1,
  );
  const fill =
    steps.length > 1 ? clamp(lastDone / (steps.length - 1), 0, 1) : 0;
  const rowH = density === "compact" ? 40 : density === "roomy" ? 52 : 46;
  return (
    <ol
      role="list"
      aria-label="Request progress"
      className="relative flex flex-col"
    >
      <span
        aria-hidden
        className="absolute bottom-0 left-[9px] w-px bg-hairline-strong"
        style={{ top: rowH / 2, bottom: rowH / 2 }}
      />
      <motion.span
        aria-hidden
        className="absolute left-[9px] w-px origin-top bg-(--od-accent)"
        style={{ top: rowH / 2, height: `calc(100% - ${rowH}px)` }}
        initial={false}
        animate={{ scaleY: fill }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      />
      {steps.map((s) => {
        const done = s.state === "done";
        const active = s.state === "active";
        const failed = s.state === "failed";
        return (
          <li
            key={s.id}
            className="relative flex items-center gap-3"
            style={{ minHeight: rowH }}
          >
            <span
              className="relative flex size-[19px] shrink-0 items-center justify-center"
              aria-hidden
            >
              <motion.span
                className={cn(
                  "absolute inset-0 rounded-full border",
                  done
                    ? "border-(--od-accent) bg-(--od-accent)"
                    : failed
                      ? "border-danger bg-[color-mix(in_oklab,var(--danger)_14%,transparent)]"
                      : active
                        ? "border-(--od-accent) bg-card"
                        : "border-hairline-strong bg-card",
                )}
                initial={false}
                animate={{ scale: done || active ? 1 : 0.8 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
              {done ? (
                <svg viewBox="0 0 14 14" className="relative size-3 text-card">
                  <motion.path
                    d="M3 7.4 5.8 10 11 4.2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.9}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={motionSafe ? { pathLength: 0 } : false}
                    animate={{ pathLength: 1 }}
                    transition={
                      motionSafe
                        ? { ...springs.flick, delay: durations.blink }
                        : { duration: 0 }
                    }
                  />
                </svg>
              ) : failed ? (
                <X className="relative size-3 text-danger" aria-hidden />
              ) : active ? (
                <span
                  className={cn(
                    "relative size-2 rounded-full bg-(--od-accent)",
                    breathing && motionSafe && "animate-pulse",
                  )}
                />
              ) : null}
            </span>
            <span className="flex min-w-0 flex-col">
              <span
                className={cn(
                  "truncate text-[13px]",
                  done || active
                    ? "text-foreground"
                    : failed
                      ? "text-danger"
                      : "text-ink-3",
                  active && "font-medium",
                )}
              >
                {s.label}
              </span>
              {s.detail ? (
                <span className="truncate text-[11px] text-ink-3">
                  {s.detail}
                </span>
              ) : null}
            </span>
            <span className="sr-only">
              {done
                ? ", done"
                : active
                  ? ", in progress"
                  : failed
                    ? ", failed"
                    : ", not yet"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Skeleton                                 */
/* ----------------------------------------------------------------------- */

function Skeleton({
  domain,
  density,
}: {
  domain: string | null;
  density: OrgDensity;
}) {
  const d = DENSITY[density];
  return (
    <div className={cn("flex flex-col", d.gap)}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="shrink-0 rounded-3 bg-surface-2 motion-safe:animate-pulse"
          style={{ width: d.mark, height: d.mark }}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span
            aria-hidden
            className="h-3.5 w-32 rounded-1 bg-surface-2 motion-safe:animate-pulse"
          />
          <span
            aria-hidden
            className="h-3 w-24 rounded-1 bg-surface-2 motion-safe:animate-pulse"
            style={{ animationDelay: "80ms" }}
          />
        </span>
      </div>
      <div className="flex items-center" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <span
            key={i}
            className="rounded-full border-2 border-card bg-surface-2 motion-safe:animate-pulse"
            style={{
              width: d.avatar,
              height: d.avatar,
              marginLeft: i === 0 ? 0 : -8,
              animationDelay: `${i * 70}ms`,
            }}
          />
        ))}
      </div>
      <span
        aria-hidden
        className={cn(
          "w-full rounded-3 bg-surface-2 motion-safe:animate-pulse",
          d.button,
        )}
        style={{ animationDelay: "160ms" }}
      />
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        {domain ? `Looking up ${domain}` : "Loading"}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * The sign-up step that finds the person's organisation from their email.
 * Finish the address and, after a short pause, a card rises beneath the
 * field on `springs.glide`: the organisation's mark draws itself (its
 * outline on `springs.flick`, the initial landing on `springs.recoil`), the
 * teammate count rolls up from zero on `springs.snap`, and the teammates'
 * avatars drift into an overlapping strip on `springs.drift`, one after the
 * other. A personal address offers to create a new organisation and the
 * name field unfolds on glide; an unknown domain offers an invite request
 * or a new organisation. Another address sends the card away on the exit
 * ease before the next one rises.
 *
 * The ways in are one radio group whose chosen outline slides between them
 * on snap. Sending a request swaps the options for an approval rail whose
 * fill climbs on glide as each step lands; the host moves it on through
 * `approval`. SSO shows a mock redirect whose bar fills on drift and then a
 * check on flick. The field is a native form, arrows move and choose in the
 * group, Enter goes, and every change is announced. Under reduced motion
 * nothing rises, rolls or drifts: cards cross-fade in place, the count
 * appears, the rail fills at once, and every state is still reached.
 */
export function OrgDiscovery({
  cardStyle = "card",
  density = "cozy",
  accent = "cobalt",
  lookup = defaultOrgLookup,
  value,
  defaultValue = "",
  onChange,
  onDiscover,
  onJoin,
  onCreate,
  approval = "pending",
  status = "ready",
  onRetry,
  title = "Find your organisation",
  eyebrow = "Gaugeworks · Step 2 of 3",
  hint = defaultOrgHint,
  label,
  height = 540,
  disabled = false,
  className,
}: OrgDiscoveryProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const fieldId = `${uid}-email`;
  const fieldHintId = `${uid}-email-hint`;
  const nameId = `${uid}-name`;
  const d = DENSITY[density];

  const [own, setOwn] = React.useState(defaultValue);
  const email = value ?? own;
  const domain = domainOf(email);
  const ready = status === "ready";
  const inert = disabled || !ready;

  const [look, setLook] = React.useState<Look | null>(null);
  const [choice, setChoice] = React.useState<OrgChoice | null>(null);
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);
  const [orgName, setOrgName] = React.useState("");
  const [nameTouched, setNameTouched] = React.useState(false);
  const [notified, setNotified] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [rootNode, setRootNode] = React.useState<HTMLDivElement | null>(null);
  const onScreen = useOnScreen(rootNode);
  // False for the server render and hydration, so a card already on the
  // page never rises again; true for cards that mount later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const lookupRef = React.useRef(lookup);
  const discoverRef = React.useRef(onDiscover);
  const seq = React.useRef(0);
  const debounce = React.useRef<number | null>(null);
  const stage = React.useRef<number | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const nameRef = React.useRef<HTMLInputElement | null>(null);
  const optionNodes = React.useRef(new Map<OrgChoice, HTMLButtonElement>());
  const primaryRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    lookupRef.current = lookup;
    discoverRef.current = onDiscover;
  });

  /* ------------------------------- lookup ------------------------------ */

  const run = React.useCallback((target: string) => {
    const id = (seq.current += 1);
    setLook({ domain: target, state: "looking" });
    setChoice(null);
    setOutcome(null);
    setNotified(false);
    setAnnouncement(`Looking up ${target}.`);
    let settled: OrgLookupResult | Promise<OrgLookupResult>;
    try {
      settled = lookupRef.current(target);
    } catch {
      settled = Promise.reject(new Error("lookup failed"));
    }
    Promise.resolve(settled).then(
      (result) => {
        if (seq.current !== id) return;
        setLook({ domain: target, state: "done", result });
        setChoice(optionsFor(result)[0]?.id ?? null);
        setOrgName(result.kind === "unknown" ? nameFromDomain(target) : "");
        setNameTouched(false);
        if (result.kind === "found") {
          const { org } = result;
          setAnnouncement(
            `Found ${org.name}: ${org.memberCount} ${org.memberCount === 1 ? "teammate" : "teammates"} already here, ${SSO_WORD[org.sso].toLowerCase()}.`,
          );
        } else if (result.kind === "personal") {
          setAnnouncement(
            `${target} is a personal address. You can create a new organisation.`,
          );
        } else {
          setAnnouncement(
            `No organisation for ${target} yet. Request an invite or create one.`,
          );
        }
        discoverRef.current?.(result, target);
      },
      () => {
        if (seq.current !== id) return;
        setLook({ domain: target, state: "failed" });
        setAnnouncement(`The lookup for ${target} failed.`);
      },
    );
  }, []);

  // A typed address is looked up once the typing pauses; clearing the
  // field drops the card at once.
  React.useEffect(() => {
    if (debounce.current !== null) window.clearTimeout(debounce.current);
    debounce.current = null;
    if (domain === null) {
      if (email.trim() === "") {
        seq.current += 1;
        debounce.current = window.setTimeout(() => {
          debounce.current = null;
          setLook(null);
          setOutcome(null);
          setChoice(null);
        }, 0);
        return () => {
          if (debounce.current !== null) window.clearTimeout(debounce.current);
          debounce.current = null;
        };
      }
      return;
    }
    debounce.current = window.setTimeout(() => {
      debounce.current = null;
      setLook((prev) => {
        if (prev && prev.domain === domain && prev.state !== "failed") {
          return prev;
        }
        // Scheduled rather than run here so the lookup's own state
        // changes happen outside this updater.
        window.setTimeout(() => run(domain), 0);
        return prev;
      });
    }, DEBOUNCE_MS);
    return () => {
      if (debounce.current !== null) window.clearTimeout(debounce.current);
      debounce.current = null;
    };
  }, [domain, email, run]);

  React.useEffect(
    () => () => {
      seq.current += 1;
      if (debounce.current !== null) window.clearTimeout(debounce.current);
      if (stage.current !== null) window.clearTimeout(stage.current);
    },
    [],
  );

  /* ------------------------------ outcomes ----------------------------- */

  const clearStage = () => {
    if (stage.current !== null) window.clearTimeout(stage.current);
    stage.current = null;
  };

  const result = look?.state === "done" ? look.result : null;
  const org = result?.kind === "found" ? result.org : null;
  const options = result ? optionsFor(result) : [];
  const selected =
    choice && options.some((o) => o.id === choice)
      ? choice
      : (options[0]?.id ?? null);
  const locked = outcome !== null;
  const nameValid = orgName.trim().length > 0;

  const setEmail = (next: string) => {
    if (value === undefined) setOwn(next);
    onChange?.(next);
  };

  const submitEmail = () => {
    if (inert || locked) return;
    if (domain === null) {
      setAnnouncement(
        email.trim() === ""
          ? "Enter your work email."
          : "Finish the address, then we can look up its domain.",
      );
      return;
    }
    if (debounce.current !== null) window.clearTimeout(debounce.current);
    debounce.current = null;
    if (look && look.domain === domain && look.state === "done") {
      const first = optionNodes.current.get(selected ?? "join");
      first?.focus();
      return;
    }
    run(domain);
  };

  const retry = () => {
    if (disabled) return;
    if (status === "error") {
      onRetry?.();
      return;
    }
    if (look?.state === "failed") {
      onRetry?.();
      run(look.domain);
    }
  };

  const edit = () => {
    if (inert) return;
    clearStage();
    setOutcome(null);
    setNotified(false);
    setAnnouncement("Choose again, or change the address.");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const act = () => {
    if (inert || !result || !selected || !domain) return;
    if (selected === "create") {
      if (!nameValid) {
        setNameTouched(true);
        setAnnouncement("Give the organisation a name first.");
        nameRef.current?.focus();
        return;
      }
      const name = orgName.trim();
      clearStage();
      setOutcome({ kind: "created", name });
      setAnnouncement(`${name} is ready. You are its first member.`);
      onCreate?.({
        name,
        email: email.trim(),
        domain: result.kind === "personal" ? null : domain,
      });
      return;
    }
    if (selected === "sso") {
      clearStage();
      setOutcome({ kind: "sso", stage: "redirect" });
      setAnnouncement(`Redirecting to ${org?.name ?? domain}'s sign-in.`);
      onJoin?.({ via: "sso", email: email.trim(), domain, org });
      stage.current = window.setTimeout(() => {
        stage.current = null;
        setOutcome({ kind: "sso", stage: "done" });
        setAnnouncement(
          `Signed in with SSO. You are a member of ${org?.name ?? domain}.`,
        );
      }, SSO_MS);
      return;
    }
    clearStage();
    setOutcome({ kind: "requested" });
    setNotified(false);
    setAnnouncement(
      org
        ? `Join request sent to ${org.name}. Waiting for an admin.`
        : `Invite request saved for ${domain}. We will watch for an organisation.`,
    );
    onJoin?.({ via: "request", email: email.trim(), domain, org });
    stage.current = window.setTimeout(() => {
      stage.current = null;
      setNotified(true);
      setAnnouncement(
        org
          ? `Admins at ${org.name} have been notified.`
          : `Watching ${domain} for an organisation.`,
      );
    }, NOTIFY_MS);
  };

  // The host moves the approval on; the rail lands and says so.
  const approvedWord =
    outcome?.kind === "requested"
      ? approval === "approved"
        ? `You are in. Welcome to ${org?.name ?? domain ?? "the team"}.`
        : approval === "declined"
          ? "Your request was declined. Try another way in."
          : ""
      : "";

  const chooseOption = (id: OrgChoice, focus: boolean) => {
    if (inert || locked) return;
    setChoice(id);
    const option = options.find((o) => o.id === id);
    if (option) setAnnouncement(`${option.title} chosen.`);
    if (focus) optionNodes.current.get(id)?.focus();
  };

  const onOptionKey = (event: React.KeyboardEvent, id: OrgChoice) => {
    const i = options.findIndex((o) => o.id === id);
    let to = -1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") to = i + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = options.length - 1;
    else if (event.key === " ") {
      event.preventDefault();
      chooseOption(id, false);
      return;
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (selected !== id) chooseOption(id, false);
      if (id === "create" && !nameValid) {
        setNameTouched(true);
        setAnnouncement("Give the organisation a name first.");
        window.setTimeout(() => nameRef.current?.focus(), 0);
        return;
      }
      act();
      return;
    } else return;
    event.preventDefault();
    const target = options[(to + options.length) % options.length];
    if (target) chooseOption(target.id, true);
  };

  /* -------------------------------- scene ------------------------------ */

  const scene = !ready
    ? status
    : look === null
      ? "prompt"
      : `${look.state === "done" ? look.result.kind : look.state}:${look.domain}`;

  const breathing = onScreen && !inert;

  const primaryLabel =
    selected === "sso"
      ? "Continue with SSO"
      : selected === "create"
        ? "Create organisation"
        : result?.kind === "unknown"
          ? "Request an invite"
          : "Send join request";

  const railSteps = (): RailStep[] => {
    const admin = org?.members[0]?.name;
    const done = approval === "approved";
    const declined = approval === "declined";
    const told = notified || done || declined;
    if (org) {
      return [
        { id: "sent", label: "Request sent", state: "done" },
        {
          id: "notified",
          label: "Admins notified",
          detail: admin ? `${admin} and the other admins` : undefined,
          state: told ? "done" : "active",
        },
        {
          id: "wait",
          label: declined ? "Request declined" : "Waiting for approval",
          detail: declined
            ? "An admin said no. Try SSO or create your own."
            : told
              ? "Usually within a day"
              : undefined,
          state: done ? "done" : declined ? "failed" : told ? "active" : "todo",
        },
        {
          id: "in",
          label: "You're in",
          detail: done ? `Welcome to ${org.name}` : undefined,
          state: done ? "done" : "todo",
        },
      ];
    }
    return [
      { id: "saved", label: "Request saved", state: "done" },
      {
        id: "watch",
        label: `Watching ${domain ?? "the domain"}`,
        detail: "We notice when an organisation claims it",
        state: told ? "done" : "active",
      },
      {
        id: "wait",
        label: declined ? "Request declined" : "Waiting for an organisation",
        detail: declined ? "Create your own instead." : undefined,
        state: done ? "done" : declined ? "failed" : told ? "active" : "todo",
      },
      {
        id: "in",
        label: "You're in",
        state: done ? "done" : "todo",
      },
    ];
  };

  const cardFrame =
    cardStyle === "card"
      ? "rounded-3 border border-hairline-strong bg-surface-0 shadow-[0_14px_34px_-18px_color-mix(in_oklab,black_45%,transparent)]"
      : "border-t border-hairline";

  const sectionTransition = (): {
    initial: TargetAndTransition;
    animate: TargetAndTransition;
    exit: TargetAndTransition;
    transition: Transition;
  } => ({
    initial: live
      ? { opacity: 0, y: motionSafe ? distances.shift : 0 }
      : { opacity: 1, y: 0 },
    animate: { opacity: 1, y: 0 },
    exit: {
      opacity: 0,
      y: motionSafe ? -distances.nudge : 0,
      transition: exitFor(durations.base),
    },
    transition: motionSafe
      ? {
          ...springs.glide,
          opacity: { duration: durations.base, ease: easings.enter },
        }
      : { duration: durations.fast },
  });

  const innerTransition = {
    initial: { opacity: 0, y: motionSafe ? distances.step : 0 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, transition: exitFor(durations.fast) },
    transition: motionSafe
      ? {
          ...springs.glide,
          opacity: { duration: durations.base, ease: easings.enter },
        }
      : { duration: durations.fast },
  };

  const accentVar = ACCENTS[accent] ?? ACCENTS.cobalt;

  /* ------------------------------- render ------------------------------ */

  const renderOptions = () => (
    <div className={cn("flex flex-col", d.gap)}>
      <div
        role="radiogroup"
        aria-label="How to continue"
        className="flex flex-col gap-1.5"
      >
        {options.map((o) => {
          const Icon = o.icon;
          const on = selected === o.id;
          return (
            <button
              key={o.id}
              ref={(node) => {
                if (node) optionNodes.current.set(o.id, node);
                else optionNodes.current.delete(o.id);
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-disabled={inert || undefined}
              tabIndex={on ? 0 : -1}
              onClick={() => chooseOption(o.id, false)}
              onKeyDown={(event) => onOptionKey(event, o.id)}
              className={cn(
                "relative flex w-full items-start gap-2.5 rounded-3 border border-hairline text-left transition-colors",
                d.option,
                on ? "bg-(--od-wash)" : "hover:bg-surface-1",
                inert ? "cursor-not-allowed" : "cursor-pointer",
                FOCUS_RING,
              )}
            >
              {on ? (
                motionSafe ? (
                  <motion.span
                    aria-hidden
                    layoutId={`${uid}-choice`}
                    className="pointer-events-none absolute -inset-px rounded-3 border-2 border-(--od-accent)"
                    transition={springs.snap}
                  />
                ) : (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-px rounded-3 border-2 border-(--od-accent)"
                  />
                )
              ) : null}
              <span
                className={cn(
                  "relative mt-px flex size-5 shrink-0 items-center justify-center rounded-full",
                  on ? "text-(--od-accent)" : "text-ink-3",
                )}
              >
                <Icon aria-hidden className="size-4" />
              </span>
              <span className="relative flex min-w-0 flex-col">
                <span
                  className={cn(
                    "font-medium",
                    d.text,
                    on ? "text-foreground" : "text-ink-2",
                  )}
                >
                  {o.title}
                </span>
                <span className="text-[11px] text-ink-3">{o.detail}</span>
              </span>
            </button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {selected === "create" ? (
          <motion.div
            key="name"
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{
              height: 0,
              opacity: 0,
              transition: exitFor(durations.base),
            }}
            transition={{
              height: motionSafe ? springs.glide : { duration: 0 },
              opacity: { duration: durations.base, ease: easings.enter },
            }}
          >
            <label
              htmlFor={nameId}
              className="mb-1.5 block font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            >
              Organisation name
            </label>
            <div className="relative">
              <Building2
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
              />
              <input
                ref={nameRef}
                id={nameId}
                type="text"
                autoComplete="organization"
                value={orgName}
                placeholder="Your organisation's name"
                readOnly={inert}
                aria-invalid={nameTouched && !nameValid ? true : undefined}
                onChange={(event) => {
                  setOrgName(event.target.value);
                  setNameTouched(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    act();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    optionNodes.current.get("create")?.focus();
                  }
                }}
                className={cn(
                  "w-full rounded-2 border bg-card pr-3 pl-9 text-foreground placeholder:text-ink-3",
                  d.field,
                  d.text,
                  nameTouched && !nameValid
                    ? "border-danger"
                    : "border-hairline-strong",
                  FOCUS_RING,
                )}
              />
            </div>
            {nameTouched && !nameValid ? (
              <p className="mt-1 text-[11px] text-danger">Give it a name.</p>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <button
        ref={primaryRef}
        type="button"
        onClick={act}
        aria-disabled={inert || !selected || undefined}
        className={cn(
          PRIMARY,
          d.button,
          (inert || !selected) && "cursor-not-allowed opacity-60",
          FOCUS_RING,
        )}
      >
        {primaryLabel}
        <ArrowRight aria-hidden className="size-3.5" />
      </button>
    </div>
  );

  const renderFound = (found: OrgRecord) => (
    <div className={cn(COLUMNS, d.gap)}>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start gap-3">
          <Mark
            initial={initialOf(found.name)}
            size={d.mark}
            motionSafe={motionSafe}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2">
              <p className={cn("truncate font-semibold", d.name)}>
                {found.name}
              </p>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px font-mono text-[10px] tracking-[0.04em] uppercase",
                  found.sso === "none"
                    ? "border-hairline text-ink-3"
                    : "border-(--od-edge) text-(--od-accent)",
                )}
              >
                {found.sso === "none" ? (
                  <KeyRound aria-hidden className="size-2.5" />
                ) : (
                  <ShieldCheck aria-hidden className="size-2.5" />
                )}
                {SSO_WORD[found.sso]}
              </span>
            </div>
            <p className="truncate font-mono text-[11px] text-ink-3">
              {found.domain}
            </p>
            <p
              className={cn(
                "mt-1 flex items-baseline gap-1 text-ink-2",
                d.text,
              )}
            >
              <span className="sr-only">
                {found.memberCount}{" "}
                {found.memberCount === 1 ? "teammate" : "teammates"} already
                here
              </span>
              <Roll
                value={found.memberCount}
                motionSafe={motionSafe}
                className="font-mono text-foreground"
              />
              <span aria-hidden>
                {found.memberCount === 1 ? "teammate" : "teammates"} already
                here
              </span>
            </p>
          </div>
        </div>
        <Strip
          members={found.members}
          total={found.memberCount}
          size={d.avatar}
          motionSafe={motionSafe}
        />
      </div>
      <div className={RIGHT}>{renderOptions()}</div>
    </div>
  );

  const renderPersonal = () => (
    <div className={cn(COLUMNS, d.gap)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          aria-hidden
          className="flex shrink-0 items-center justify-center rounded-3 border border-dashed border-hairline-strong text-ink-3"
          style={{ width: d.mark, height: d.mark }}
        >
          <Mail className="size-[45%]" />
        </span>
        <div className="flex min-w-0 flex-col">
          <p className={cn("font-semibold", d.name)}>
            That&apos;s a personal address
          </p>
          <p className={cn("text-ink-2", d.text)}>
            <span className="font-mono text-ink-3">{domain}</span> isn&apos;t
            tied to an organisation. Create one and invite your team, or use
            your work email instead.
          </p>
        </div>
      </div>
      <div className={RIGHT}>{renderOptions()}</div>
    </div>
  );

  const renderUnknown = () => (
    <div className={cn(COLUMNS, d.gap)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Mark
          initial={initialOf(nameFromDomain(domain ?? "?"))}
          size={d.mark}
          ghost
          motionSafe={motionSafe}
        />
        <div className="flex min-w-0 flex-col">
          <p className={cn("font-semibold", d.name)}>
            No organisation for{" "}
            <span className="font-mono font-medium">{domain}</span> yet
          </p>
          <p className={cn("text-ink-2", d.text)}>
            You could be the first, or ask to be let in when one appears.
          </p>
        </div>
      </div>
      <div className={RIGHT}>{renderOptions()}</div>
    </div>
  );

  const renderOutcome = (o: Outcome) => {
    if (o.kind === "requested") {
      const steps = railSteps();
      const done = approval === "approved";
      const declined = approval === "declined";
      return (
        <div className={cn(COLUMNS, d.gap)}>
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {org ? (
              <Mark
                initial={initialOf(org.name)}
                size={d.mark}
                motionSafe={false}
              />
            ) : (
              <Mark
                initial={initialOf(nameFromDomain(domain ?? "?"))}
                size={d.mark}
                ghost
                motionSafe={false}
              />
            )}
            <div className="flex min-w-0 flex-col">
              <p className={cn("font-semibold", d.name)}>
                {done
                  ? `Welcome to ${org?.name ?? nameFromDomain(domain ?? "")}`
                  : declined
                    ? "Not this time"
                    : org
                      ? `Request sent to ${org.name}`
                      : "Invite request saved"}
              </p>
              <p className={cn("text-ink-2", d.text)}>
                {done
                  ? "Your account is ready. We'll take you to the workspace."
                  : declined
                    ? "You can still sign in with SSO or start your own organisation."
                    : org
                      ? "An admin has to let you in. We'll email you when they do."
                      : `We'll email you once someone from ${domain} sets up a team.`}
              </p>
              <AnimatePresence initial={false}>
                {done ? (
                  <motion.span
                    key="in"
                    className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-(--od-accent) px-2.5 py-1 text-[11px] font-medium text-card"
                    initial={
                      motionSafe ? { scale: 0.7, opacity: 0 } : { opacity: 0 }
                    }
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.recoil,
                            opacity: { duration: durations.fast },
                          }
                        : { duration: durations.fast }
                    }
                  >
                    <Check aria-hidden className="size-3" />
                    Approved
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
          <div className={RIGHT}>
            <Rail
              steps={steps}
              motionSafe={motionSafe}
              breathing={breathing && !done && !declined}
              density={density}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {done ? (
                <button
                  type="button"
                  aria-disabled={inert || undefined}
                  className={cn(
                    PRIMARY,
                    d.button,
                    inert && "cursor-not-allowed opacity-60",
                    FOCUS_RING,
                  )}
                >
                  Open {org?.name ?? "workspace"}
                  <ArrowRight aria-hidden className="size-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={edit}
                  aria-disabled={inert || undefined}
                  className={cn(BUTTON, "px-2.5", d.button, FOCUS_RING)}
                >
                  <X aria-hidden className="size-3.5" />
                  {declined ? "Try another way" : "Cancel request"}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }
    if (o.kind === "sso") {
      const landed = o.stage === "done";
      return (
        <div className={cn(COLUMNS, d.gap)}>
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Mark
              initial={initialOf(org?.name ?? domain ?? "?")}
              size={d.mark}
              motionSafe={false}
            />
            <div className="flex min-w-0 flex-col">
              <p className={cn("font-semibold", d.name)}>
                {landed
                  ? `Signed in to ${org?.name ?? domain}`
                  : `Redirecting to ${org?.name ?? domain}`}
              </p>
              <p className={cn("text-ink-2", d.text)}>
                {landed
                  ? "Your identity provider vouched for you. Your account is ready."
                  : "Sign in with your work account, then you'll land back here."}
              </p>
            </div>
          </div>
          <div className={cn(RIGHT, "flex flex-col gap-3")}>
            <div
              role="progressbar"
              aria-label="Single sign-on"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={landed ? 100 : undefined}
              aria-valuetext={landed ? "Signed in" : "Redirecting"}
              className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
            >
              <motion.span
                className="absolute inset-y-0 left-0 origin-left rounded-full bg-(--od-accent)"
                style={{ width: "100%" }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: landed ? 1 : motionSafe ? 0.82 : 0.5 }}
                transition={
                  motionSafe
                    ? landed
                      ? springs.snap
                      : { ...springs.drift, duration: SSO_MS / 1000 }
                    : { duration: 0 }
                }
              />
            </div>
            <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              <AnimatePresence mode="wait" initial={false}>
                {landed ? (
                  <motion.span
                    key="done"
                    className="inline-flex items-center gap-1.5 text-(--od-accent)"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{ duration: durations.fast }}
                  >
                    <svg viewBox="0 0 14 14" className="size-3.5">
                      <motion.path
                        d="M3 7.4 5.8 10 11 4.2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={motionSafe ? { pathLength: 0 } : false}
                        animate={{ pathLength: 1 }}
                        transition={
                          motionSafe ? springs.flick : { duration: 0 }
                        }
                      />
                    </svg>
                    Signed in via {domain}
                  </motion.span>
                ) : (
                  <motion.span
                    key="wait"
                    className="inline-flex items-center gap-1.5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{ duration: durations.fast }}
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full bg-(--od-accent)",
                        breathing && motionSafe && "animate-pulse",
                      )}
                    />
                    Contacting {domain}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            {landed ? (
              <button
                type="button"
                aria-disabled={inert || undefined}
                className={cn(
                  PRIMARY,
                  d.button,
                  inert && "cursor-not-allowed opacity-60",
                  FOCUS_RING,
                )}
              >
                Open {org?.name ?? "workspace"}
                <ArrowRight aria-hidden className="size-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={edit}
                aria-disabled={inert || undefined}
                className={cn(BUTTON, "w-fit px-2.5", d.button, FOCUS_RING)}
              >
                <X aria-hidden className="size-3.5" />
                Cancel
              </button>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className={cn(COLUMNS, d.gap)}>
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Mark
            initial={initialOf(o.name)}
            size={d.mark}
            motionSafe={motionSafe}
            land
          />
          <div className="flex min-w-0 flex-col">
            <p className={cn("font-semibold", d.name)}>{o.name} is ready</p>
            <p className={cn("text-ink-2", d.text)}>
              You&apos;re its first member
              {result?.kind === "unknown" && domain
                ? `, and anyone at ${domain} can ask to join.`
                : "."}
            </p>
            <motion.span
              className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-(--od-wash) px-2.5 py-1 text-[11px] font-medium text-(--od-accent)"
              initial={motionSafe ? { scale: 0.7, opacity: 0 } : { opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={
                motionSafe
                  ? {
                      ...springs.recoil,
                      delay: durations.fast,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: durations.fast }
              }
            >
              <Users aria-hidden className="size-3" />1 member
            </motion.span>
          </div>
        </div>
        <div className={cn(RIGHT, "flex flex-col gap-2")}>
          <button
            type="button"
            aria-disabled={inert || undefined}
            className={cn(
              PRIMARY,
              d.button,
              inert && "cursor-not-allowed opacity-60",
              FOCUS_RING,
            )}
          >
            Invite teammates
            <ArrowRight aria-hidden className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={edit}
            aria-disabled={inert || undefined}
            className={cn(BUTTON, "w-full px-2.5", d.button, FOCUS_RING)}
          >
            <Pencil aria-hidden className="size-3.5" />
            Start over
          </button>
        </div>
      </div>
    );
  };

  const renderCard = () => {
    if (!ready) {
      if (status === "loading") {
        return <Skeleton domain={null} density={density} />;
      }
      return (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">This step didn&apos;t load.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={retry}
              className={cn(BUTTON, "h-8 px-3", FOCUS_RING)}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      );
    }
    if (!look) return null;
    if (look.state === "looking") {
      return <Skeleton domain={look.domain} density={density} />;
    }
    if (look.state === "failed") {
      return (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            We couldn&apos;t look up{" "}
            <span className="font-mono">{look.domain}</span>.
          </p>
          <button
            type="button"
            onClick={retry}
            aria-disabled={disabled || undefined}
            className={cn(BUTTON, "h-8 px-3", FOCUS_RING)}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        </div>
      );
    }
    const inner = look.result;
    return (
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={outcome?.kind ?? "choose"} {...innerTransition}>
          {outcome
            ? renderOutcome(outcome)
            : inner.kind === "found"
              ? renderFound(inner.org)
              : inner.kind === "personal"
                ? renderPersonal()
                : renderUnknown()}
        </motion.div>
      </AnimatePresence>
    );
  };

  const showCard = scene !== "prompt";

  return (
    <div
      ref={setRootNode}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--od-accent" as string]: accentVar,
        ["--od-wash" as string]: `color-mix(in oklab, ${accentVar} 12%, var(--bg-1))`,
        ["--od-edge" as string]: `color-mix(in oklab, ${accentVar} 40%, transparent)`,
      }}
    >
      <header className={cn("flex shrink-0 flex-col gap-0.5", d.pad, "pb-0")}>
        {eyebrow ? (
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
      </header>

      <form
        className={cn("flex shrink-0 flex-col gap-1.5", d.pad, "pt-3 pb-3")}
        onSubmit={(event) => {
          event.preventDefault();
          submitEmail();
        }}
      >
        <label
          htmlFor={fieldId}
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          Work email
        </label>
        <div className="relative flex items-center">
          <Mail
            aria-hidden
            className="pointer-events-none absolute left-3 size-4 text-ink-3"
          />
          <input
            ref={inputRef}
            id={fieldId}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            value={email}
            placeholder="you@yourcompany.com"
            readOnly={inert || locked}
            aria-describedby={fieldHintId}
            onChange={(event) => {
              if (inert || locked) return;
              setEmail(event.target.value);
            }}
            className={cn(
              "w-full rounded-2 border border-hairline-strong bg-surface-0 pl-9 text-foreground placeholder:text-ink-3",
              d.field,
              d.text,
              locked ? "pr-20 text-ink-2" : "pr-3",
              FOCUS_RING,
            )}
          />
          <AnimatePresence initial={false}>
            {locked ? (
              <motion.button
                key="edit"
                type="button"
                onClick={edit}
                aria-disabled={inert || undefined}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.fast }}
                className={cn(
                  "absolute right-1.5 inline-flex h-7 items-center gap-1 rounded-2 px-2 text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <Pencil aria-hidden className="size-3" />
                Change
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>
        <p id={fieldHintId} className="sr-only">
          We look up the domain after the at sign. Press Enter to look it up
          now.
        </p>
      </form>

      <div
        className={cn(
          "relative flex-1 overflow-x-hidden overflow-y-auto overscroll-contain",
          d.pad,
          "pt-0",
        )}
      >
        <LayoutGroup id={uid}>
          <AnimatePresence mode="wait" initial={false}>
            {showCard ? (
              <motion.section
                key={scene}
                aria-label={
                  look?.state === "done" && look.result.kind === "found"
                    ? `${look.result.org.name} found`
                    : "Discovery"
                }
                className={cn(
                  "relative",
                  cardFrame,
                  cardStyle === "card" ? d.pad : "pt-4",
                )}
                {...sectionTransition()}
              >
                {cardStyle === "card" ? (
                  <motion.span
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-0.5 origin-left rounded-t-3 bg-(--od-accent)"
                    initial={live && motionSafe ? { scaleX: 0 } : false}
                    animate={{ scaleX: 1 }}
                    transition={
                      motionSafe
                        ? { ...springs.glide, delay: durations.blink }
                        : { duration: 0 }
                    }
                  />
                ) : null}
                {renderCard()}
              </motion.section>
            ) : (
              <motion.div
                key="prompt"
                className="flex flex-col items-center gap-3 px-4 py-8 text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.base, ease: easings.enter }}
              >
                <span aria-hidden className="flex items-center">
                  {Array.from({ length: 3 }, (_, i) => (
                    <span
                      key={i}
                      className="size-7 rounded-full border border-dashed border-hairline-strong bg-card"
                      style={{ marginLeft: i === 0 ? 0 : -8 }}
                    />
                  ))}
                </span>
                <p className="text-sm text-ink-2">
                  {email.trim() === ""
                    ? "Enter your work email and we'll find your team."
                    : "Finish the address and we'll look up its domain."}
                </p>
                {hint ? (
                  <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    {hint}
                  </p>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        </LayoutGroup>
      </div>

      <p role="status" className="sr-only">
        {approvedWord || announcement}
      </p>
    </div>
  );
}
