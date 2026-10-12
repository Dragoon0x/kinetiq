"use client";

import * as React from "react";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  Copy,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
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
/*                                   Types                                  */
/* ----------------------------------------------------------------------- */

export type TokenScope = {
  id: string;
  /** Short chip text, e.g. "sites:read". */
  label: string;
  /** What the scope lets a caller do. */
  description: string;
};

export type TokenRecord = {
  id: string;
  name: string;
  /** The part of the secret that is safe to show, e.g. "fl_live_". */
  prefix: string;
  /** The secret's last four characters. */
  last4: string;
  /** Scope ids. */
  scopes: string[];
  /** When it was created, in ms. */
  createdAt: number;
  /** When it last authenticated a call, in ms; null if never. */
  lastUsedAt: number | null;
  /** When it stops working, in ms; null never expires. */
  expiresAt: number | null;
  /** Set on the old token after a rotation: when it is retired, in ms. */
  retiresAt?: number;
  /** The id of the token that replaced it. */
  supersededBy?: string;
};

/** What the Create form submits. */
export type TokenDraft = {
  name: string;
  scopes: string[];
  /** Days until expiry; null never expires. */
  expiresInDays: number | null;
};

export type TokenChange =
  | { type: "create"; id: string }
  | { type: "revoke"; id: string }
  | { type: "rotate"; id: string; replacementId: string }
  | { type: "retire"; id: string };

export type TokenRevealStyle = "unspool" | "fade" | "instant";
export type TokenDensity = "compact" | "cozy" | "roomy";
export type TokenAccent = "cobalt" | "signal" | "success";
export type TokenStatus = "ready" | "loading" | "error";

export type TokenLockerProps = {
  /** Controlled list, newest first. */
  tokens?: TokenRecord[];
  /** Initial list when uncontrolled. @default defaultTokens */
  defaultTokens?: TokenRecord[];
  /** Fires with the whole list after a create, revoke, rotation or retirement. */
  onChange?: (tokens: TokenRecord[], change: TokenChange) => void;
  /** The scopes the Create form offers. @default defaultTokenScopes */
  scopes?: TokenScope[];
  /** Mints the secret for a draft; may be async. @default simulateTokenSecret */
  onCreate?: (draft: TokenDraft) => Promise<string> | string;
  /** Controlled id of the opened row; null for none. */
  selectedId?: string | null;
  /** Initial opened row when uncontrolled. @default null */
  defaultSelectedId?: string | null;
  /** A row was opened or closed. */
  onSelect?: (id: string | null) => void;
  /** The secret was copied. */
  onCopy?: (token: TokenRecord) => void;
  /** A token was revoked. It is already off the list. */
  onRevoke?: (token: TokenRecord) => void;
  /** A token was rotated: the old one is retiring, the new one is on the list. */
  onRotate?: (previous: TokenRecord, replacement: TokenRecord) => void;
  /** How a fresh secret appears: character by character, as one fade, or at once. @default "unspool" */
  revealStyle?: TokenRevealStyle;
  /** Row heights, type size and padding. @default "cozy" */
  density?: TokenDensity;
  /** The colour of countdown bars, kept scopes and the reveal field. @default "cobalt" */
  accent?: TokenAccent;
  /** How long a fresh secret stays uncovered, in seconds. @default 30 */
  revealSeconds?: number;
  /** How long the old token keeps working after a rotation, in seconds. @default 45 */
  rotateGraceSeconds?: number;
  /** What a minted secret starts with; the default simulator uses it. @default "fl_live_" */
  prefix?: string;
  /** The moment ages and countdowns start from, in ms; the clock runs on from it after mount. @default defaultTokenNow */
  now?: number;
  /** Whether the tokens have arrived. @default "ready" */
  status?: TokenStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "API tokens" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the list scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be created, rotated or revoked. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const SEC = 1_000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Monday 12 October 2026, 09:30 UTC. */
export const defaultTokenNow = Date.UTC(2026, 9, 12, 9, 30);

export const defaultTokenScopes: TokenScope[] = [
  {
    id: "sites:read",
    label: "sites:read",
    description: "List sites and meters",
  },
  {
    id: "sites:write",
    label: "sites:write",
    description: "Add and edit sites",
  },
  {
    id: "readings:read",
    label: "readings:read",
    description: "Read meter readings",
  },
  {
    id: "readings:write",
    label: "readings:write",
    description: "Post readings from the field",
  },
  { id: "billing", label: "billing", description: "Export invoices" },
  {
    id: "webhooks",
    label: "webhooks",
    description: "Manage webhook endpoints",
  },
];

/** Six Fieldline API tokens, one expiring within the next couple of minutes. */
export const defaultTokens: TokenRecord[] = [
  {
    id: "tk-coldbrook",
    name: "Coldbrook field test",
    prefix: "fl_live_",
    last4: "q7mh",
    scopes: ["readings:write"],
    createdAt: defaultTokenNow - HOUR,
    lastUsedAt: defaultTokenNow - 3 * MIN,
    expiresAt: defaultTokenNow + 75 * SEC,
  },
  {
    id: "tk-basinworks",
    name: "Basinworks import",
    prefix: "fl_live_",
    last4: "e2xk",
    scopes: ["sites:read", "sites:write"],
    createdAt: defaultTokenNow - 5 * DAY,
    lastUsedAt: null,
    expiresAt: defaultTokenNow + 25 * DAY,
  },
  {
    id: "tk-tablet",
    name: "Night shift tablet",
    prefix: "fl_live_",
    last4: "9ab4",
    scopes: ["readings:read", "readings:write"],
    createdAt: defaultTokenNow - 20 * DAY,
    lastUsedAt: defaultTokenNow - 2 * HOUR,
    expiresAt: defaultTokenNow + 70 * DAY,
  },
  {
    id: "tk-ci",
    name: "CI deploy",
    prefix: "fl_live_",
    last4: "t0rv",
    scopes: ["sites:read", "readings:write", "webhooks"],
    createdAt: defaultTokenNow - 87 * DAY,
    lastUsedAt: defaultTokenNow - 6 * MIN,
    expiresAt: defaultTokenNow + 3 * DAY,
  },
  {
    id: "tk-partner",
    name: "Partner webhooks",
    prefix: "fl_live_",
    last4: "c6pn",
    scopes: ["webhooks", "readings:read"],
    createdAt: defaultTokenNow - 40 * DAY,
    lastUsedAt: defaultTokenNow - DAY,
    expiresAt: defaultTokenNow + 50 * DAY,
  },
  {
    id: "tk-billing",
    name: "Billing export",
    prefix: "fl_live_",
    last4: "m3wd",
    scopes: ["billing"],
    createdAt: defaultTokenNow - 200 * DAY,
    lastUsedAt: defaultTokenNow - 3 * DAY,
    expiresAt: null,
  },
];

const ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const randomChars = (n: number) => {
  const out: string[] = [];
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(n);
    c.getRandomValues(bytes);
    for (let i = 0; i < n; i += 1) {
      out.push(ALPHABET[(bytes[i] ?? 0) % ALPHABET.length] ?? "a");
    }
  } else {
    for (let i = 0; i < n; i += 1) {
      out.push(ALPHABET[Math.floor(Math.random() * ALPHABET.length)] ?? "a");
    }
  }
  return out.join("");
};

/**
 * The default `onCreate`: waits as a real mint would and returns a secret of
 * the prefix plus 24 random characters. Hosts replace it with their API call.
 */
export const simulateTokenSecret = (
  _draft: TokenDraft,
  prefix = "fl_live_",
  delayMs = 700,
): Promise<string> =>
  new Promise((resolve) => {
    setTimeout(() => resolve(`${prefix}${randomChars(24)}`), delayMs);
  });

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const ACCENTS: Record<TokenAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  success: "var(--success)",
};

const EXPIRY_CHOICES: { days: number | null; label: string }[] = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: null, label: "Never" },
];

/** A token with under this long to live keeps a one-second clock running. */
const LIVE_WINDOW = 2 * MIN;
const ARM_MS = 600;
const STRIKE_MS = 420;
const COPIED_COVER_MS = 900;
const NAME_MAX = 40;

const noopSubscribe = () => () => {};

/** The newest value, readable from a timer or a promise without re-binding. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}
const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "3 Oct 2026", in UTC so the server and the client print the same. */
const dateWord = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCFullYear()}`;
};

/** "6 min ago", "2 h ago", "3 d ago". */
const agoWord = (ms: number, now: number) => {
  const diff = Math.max(0, now - ms);
  if (diff < MIN) return "just now";
  if (diff < HOUR) return `${Math.round(diff / MIN)} min ago`;
  if (diff < DAY) return `${Math.round(diff / HOUR)} h ago`;
  if (diff < 30 * DAY) return `${Math.round(diff / DAY)} d ago`;
  return dateWord(ms);
};

/** "45 s", "12 min", "3 h", "25 d" from a span in ms. */
const spanWord = (ms: number) => {
  const d = Math.max(0, ms);
  if (d < MIN) return `${Math.ceil(d / SEC)} s`;
  if (d < HOUR) return `${Math.ceil(d / MIN)} min`;
  if (d < DAY) return `${Math.ceil(d / HOUR)} h`;
  return `${Math.ceil(d / DAY)} d`;
};

/** The same in words, for announcements. */
const spanLong = (ms: number) => {
  const d = Math.max(0, ms);
  const n = (v: number, one: string) => `${v} ${one}${v === 1 ? "" : "s"}`;
  if (d < MIN) return n(Math.ceil(d / SEC), "second");
  if (d < HOUR) return n(Math.ceil(d / MIN), "minute");
  if (d < DAY) return n(Math.ceil(d / HOUR), "hour");
  return n(Math.ceil(d / DAY), "day");
};

type Life = {
  kind: "never" | "live" | "soon" | "critical" | "expired" | "retiring";
  /** 0..1 of the lifetime left; 1 for tokens that never expire. */
  fraction: number;
  /** "Expires in 3 d", "Retires in 40 s", "Expired", "Never expires". */
  text: string;
  /** For announcements. */
  long: string;
};

const lifeOf = (token: TokenRecord, now: number, graceMs: number): Life => {
  if (token.retiresAt !== undefined) {
    const left = token.retiresAt - now;
    return {
      kind: "retiring",
      fraction: clamp(left / Math.max(SEC, graceMs), 0, 1),
      text: `Retires in ${spanWord(left)}`,
      long: `retires in ${spanLong(left)}`,
    };
  }
  if (token.expiresAt === null) {
    return {
      kind: "never",
      fraction: 1,
      text: "Never expires",
      long: "never expires",
    };
  }
  const left = token.expiresAt - now;
  if (left <= 0) {
    return { kind: "expired", fraction: 0, text: "Expired", long: "expired" };
  }
  const total = Math.max(SEC, token.expiresAt - token.createdAt);
  const fraction = clamp(left / total, 0, 1);
  return {
    kind:
      left < 5 * MIN || fraction < 0.05
        ? "critical"
        : fraction < 0.2
          ? "soon"
          : "live",
    fraction,
    text: `Expires in ${spanWord(left)}`,
    long: `expires in ${spanLong(left)}`,
  };
};

const masked = (token: TokenRecord) => `${token.prefix}••••••••${token.last4}`;

const DENSITY: Record<
  TokenDensity,
  { row: string; detail: string; text: string; chip: string; pad: string }
> = {
  compact: {
    row: "min-h-10 py-1.5",
    detail: "gap-2 pt-1.5 pb-2.5",
    text: "text-[12px]",
    chip: "h-4 text-[9px]",
    pad: "px-3",
  },
  cozy: {
    row: "min-h-14 py-2.5",
    detail: "gap-3 pt-2 pb-3",
    text: "text-[13px]",
    chip: "h-[18px] text-[10px]",
    pad: "px-4",
  },
  roomy: {
    row: "min-h-[4.25rem] py-3.5",
    detail: "gap-3.5 pt-3 pb-4",
    text: "text-[14px]",
    chip: "h-5 text-[10px]",
    pad: "px-5",
  },
};

/* ----------------------------------------------------------------------- */
/*                              Small subcomponents                         */
/* ----------------------------------------------------------------------- */

/** A check that draws itself on `springs.flick`. */
function Tick({
  motionSafe,
  className,
}: {
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <svg aria-hidden viewBox="0 0 14 14" className={cn("size-3.5", className)}>
      <motion.path
        d="M3 7.4 5.8 10 11 4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={motionSafe ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      />
    </svg>
  );
}

/** A thin bar whose fill glides to the fraction it is given. */
function Meter({
  fraction,
  tone,
  motionSafe,
  className,
}: {
  fraction: number;
  /** A CSS colour. */
  tone: string;
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "block h-1 w-full overflow-hidden rounded-full bg-surface-2",
        className,
      )}
    >
      <motion.span
        className="block h-full rounded-full"
        style={{ background: tone, originX: 0 }}
        initial={false}
        animate={{ scaleX: r3(clamp(fraction, 0, 1)) }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      />
    </span>
  );
}

function ScopeChip({
  label,
  active,
  className,
}: {
  label: string;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 font-mono tracking-[0.02em] whitespace-nowrap",
        active
          ? "border-[color-mix(in_oklab,var(--tl-accent)_35%,transparent)] bg-(--tl-wash) text-(--tl-accent)"
          : "border-hairline bg-surface-1 text-ink-2",
        className,
      )}
    >
      {label}
    </span>
  );
}

/** A region whose height glides to its content on open and eases shut. */
function Reveal({
  open,
  motionSafe,
  children,
  className,
}: {
  open: boolean;
  motionSafe: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="open"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{
            height: 0,
            opacity: 0,
            transition: exitFor(durations.base),
          }}
          transition={
            motionSafe
              ? {
                  height: springs.glide,
                  opacity: { duration: durations.base, ease: easings.enter },
                }
              : { duration: durations.fast }
          }
          className={cn("overflow-hidden", className)}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Create form                              */
/* ----------------------------------------------------------------------- */

type FormProps = {
  uid: string;
  scopes: TokenScope[];
  draft: TokenDraft;
  onDraft: (draft: TokenDraft) => void;
  error: string | null;
  motionSafe: boolean;
  density: TokenDensity;
  onSubmit: () => void;
  onCancel: () => void;
  nameRef: React.RefObject<HTMLInputElement | null>;
};

function CreateForm({
  uid,
  scopes,
  draft,
  onDraft,
  error,
  motionSafe,
  density,
  onSubmit,
  onCancel,
  nameRef,
}: FormProps) {
  const d = DENSITY[density];
  const nameId = `${uid}-name`;
  const errId = `${uid}-err`;
  const scopesId = `${uid}-scopes`;
  const expiryId = `${uid}-expiry`;
  const radioNodes = React.useRef(new Map<number, HTMLButtonElement>());
  const chosen = EXPIRY_CHOICES.findIndex(
    (c) => c.days === draft.expiresInDays,
  );
  const chosenIndex = chosen === -1 ? 0 : chosen;

  const toggleScope = (id: string) => {
    const has = draft.scopes.includes(id);
    onDraft({
      ...draft,
      scopes: has
        ? draft.scopes.filter((s) => s !== id)
        : [...draft.scopes, id],
    });
  };

  const onRadioKey = (event: React.KeyboardEvent, i: number) => {
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = EXPIRY_CHOICES.length - 1;
    else return;
    event.preventDefault();
    const next = (to + EXPIRY_CHOICES.length) % EXPIRY_CHOICES.length;
    const choice = EXPIRY_CHOICES[next];
    if (!choice) return;
    onDraft({ ...draft, expiresInDays: choice.days });
    radioNodes.current.get(next)?.focus();
  };

  return (
    <form
      aria-label="New token"
      className={cn("flex flex-col gap-3 pb-3", d.pad)}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="flex flex-col gap-3 @min-[40rem]:flex-row @min-[40rem]:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label
            htmlFor={nameId}
            className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            Name
          </label>
          <input
            ref={nameRef}
            id={nameId}
            type="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={NAME_MAX}
            placeholder="What will use it, e.g. Night shift tablet"
            value={draft.name}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errId : undefined}
            onChange={(event) =>
              onDraft({ ...draft, name: event.target.value })
            }
            className={cn(
              "h-9 w-full rounded-2 border border-hairline-strong bg-surface-0 px-3 text-[13px] text-foreground placeholder:text-ink-3",
              FOCUS_RING,
            )}
          />
        </div>
        <div className="flex flex-col gap-1.5 @min-[40rem]:w-[42%] @min-[40rem]:shrink-0">
          <span
            id={expiryId}
            className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            Expires
          </span>
          <div
            role="radiogroup"
            aria-labelledby={expiryId}
            className="relative flex h-9 items-stretch rounded-2 border border-hairline-strong bg-surface-0 p-0.5"
          >
            <LayoutGroup id={`${uid}-expiry`}>
              {EXPIRY_CHOICES.map((choice, i) => {
                const on = i === chosenIndex;
                return (
                  <button
                    key={choice.label}
                    ref={(node) => {
                      if (node) radioNodes.current.set(i, node);
                      else radioNodes.current.delete(i);
                    }}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    tabIndex={on ? 0 : -1}
                    onClick={() =>
                      onDraft({ ...draft, expiresInDays: choice.days })
                    }
                    onKeyDown={(event) => onRadioKey(event, i)}
                    className={cn(
                      "relative flex-1 rounded-[4px] px-1 text-[12px] transition-colors",
                      on
                        ? "text-foreground"
                        : "text-ink-2 hover:text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    {on ? (
                      <motion.span
                        aria-hidden
                        layoutId={motionSafe ? "pill" : undefined}
                        className="absolute inset-0 rounded-[4px] bg-surface-2"
                        transition={springs.snap}
                      />
                    ) : null}
                    <span className="relative">{choice.label}</span>
                  </button>
                );
              })}
            </LayoutGroup>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span
          id={scopesId}
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          Scopes
        </span>
        <div
          role="group"
          aria-labelledby={scopesId}
          className="flex flex-wrap gap-1.5"
        >
          {scopes.map((scope) => {
            const on = draft.scopes.includes(scope.id);
            return (
              <button
                key={scope.id}
                type="button"
                aria-pressed={on}
                title={scope.description}
                onClick={() => toggleScope(scope.id)}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-full border pr-2.5 pl-1.5 font-mono text-[11px] transition-colors duration-200",
                  on
                    ? "border-[color-mix(in_oklab,var(--tl-accent)_35%,transparent)] bg-(--tl-wash) text-(--tl-accent)"
                    : "border-hairline-strong bg-transparent text-ink-2 hover:bg-surface-1 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <span className="flex size-3.5 shrink-0 items-center justify-center">
                  {on ? (
                    <Tick motionSafe={motionSafe} className="size-3" />
                  ) : (
                    <Plus aria-hidden className="size-3 text-ink-3" />
                  )}
                </span>
                {scope.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={errId} role="alert" className="min-w-0 text-[12px] text-danger">
          {error}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className={cn(
              "inline-flex h-8 items-center rounded-2 px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            Cancel
          </button>
          <motion.button
            type="submit"
            whileTap={motionSafe ? { scale: 0.97 } : undefined}
            transition={springs.flick}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground",
              FOCUS_RING,
            )}
          >
            <KeyRound aria-hidden className="size-3.5" />
            Create token
          </motion.button>
        </div>
      </div>
    </form>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Reveal panel                              */
/* ----------------------------------------------------------------------- */

type RevealProps = {
  uid: string;
  token: TokenRecord;
  /** Null once the cover has closed: the secret is gone from memory. */
  secret: string | null;
  covered: boolean;
  copied: boolean;
  closesIn: number;
  revealSeconds: number;
  revealStyle: TokenRevealStyle;
  rotatedFrom: TokenRecord | null;
  motionSafe: boolean;
  density: TokenDensity;
  onCopy: () => void;
  onDone: () => void;
  copyRef: React.RefObject<HTMLButtonElement | null>;
};

function RevealPanel({
  uid,
  token,
  secret,
  covered,
  copied,
  closesIn,
  revealSeconds,
  revealStyle,
  rotatedFrom,
  motionSafe,
  density,
  onCopy,
  onDone,
  copyRef,
}: RevealProps) {
  const d = DENSITY[density];
  const chars = React.useMemo(() => (secret ?? "").split(""), [secret]);
  const unspool = motionSafe && revealStyle === "unspool";
  const fade = motionSafe && revealStyle === "fade";
  const step = cascade(chars.length);
  const settleMs = unspool
    ? Math.round((chars.length * step + 0.25) * 1000)
    : fade
      ? Math.round(durations.base * 1000)
      : 0;
  // The overlay of animated characters shows first; once it has settled the
  // real input's text takes over, so selection and copy work on the field.
  const [settled, setSettled] = React.useState(settleMs === 0);
  React.useEffect(() => {
    if (settleMs === 0) return;
    const t = window.setTimeout(() => setSettled(true), settleMs);
    return () => window.clearTimeout(t);
  }, [settleMs]);

  const fieldId = `${uid}-secret`;
  const fraction = revealSeconds > 0 ? closesIn / revealSeconds : 0;

  return (
    <div className={cn("flex flex-col gap-3 pb-3", d.pad)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 text-[13px] font-medium">
          {rotatedFrom ? "Replacement for " : "New token: "}
          <span className="text-foreground">{token.name}</span>
        </p>
        <p className="text-[11px] text-ink-3">
          {covered
            ? "Hidden. It will not be shown again."
            : "Copy it now. It will not be shown again."}
        </p>
      </div>

      <div className="flex flex-col gap-2 @min-[28rem]:flex-row @min-[28rem]:items-center">
        <div
          className={cn(
            "relative h-9 min-w-0 flex-1 overflow-hidden rounded-2 border bg-surface-0 transition-colors duration-200",
            covered
              ? "border-hairline"
              : "border-[color-mix(in_oklab,var(--tl-accent)_55%,transparent)]",
          )}
        >
          {secret !== null ? (
            <>
              <input
                id={fieldId}
                readOnly
                type="text"
                value={secret}
                aria-label={`Secret for ${token.name}, read only`}
                spellCheck={false}
                autoComplete="off"
                onFocus={(event) => event.currentTarget.select()}
                className={cn(
                  "h-full w-full bg-transparent px-3 font-mono text-[12px] tracking-normal text-foreground selection:bg-(--tl-wash)",
                  !settled && "text-transparent caret-transparent",
                  FOCUS_RING,
                  "focus-visible:outline-offset-[-2px]",
                )}
              />
              {!settled ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-3 font-mono text-[12px] tracking-normal whitespace-nowrap text-foreground"
                >
                  {unspool ? (
                    chars.map((c, i) => (
                      <motion.span
                        key={i}
                        className="inline-block"
                        initial={{ opacity: 0, y: distances.nudge }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...springs.flick, delay: r3(i * step) }}
                      >
                        {c}
                      </motion.span>
                    ))
                  ) : (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{
                        duration: durations.base,
                        ease: easings.enter,
                      }}
                    >
                      {secret}
                    </motion.span>
                  )}
                </span>
              ) : null}
            </>
          ) : null}

          <AnimatePresence initial={false}>
            {covered ? (
              <motion.div
                key="cover"
                aria-hidden={secret !== null ? true : undefined}
                initial={
                  motionSafe ? { scaleX: 0, opacity: 1 } : { opacity: 0 }
                }
                animate={{ scaleX: 1, opacity: 1 }}
                transition={
                  motionSafe
                    ? springs.glide
                    : { duration: durations.base, ease: easings.enter }
                }
                style={{ originX: 1 }}
                className="absolute inset-0 flex items-center gap-2 bg-surface-2 px-3 font-mono text-[12px] text-ink-2"
              >
                <Lock aria-hidden className="size-3.5 shrink-0 text-ink-3" />
                <span className="truncate">{masked(token)}</span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <motion.button
            ref={copyRef}
            type="button"
            onClick={onCopy}
            aria-disabled={covered || undefined}
            aria-label={copied ? "Copied" : "Copy secret"}
            whileTap={motionSafe && !covered ? { scale: 0.96 } : undefined}
            transition={springs.flick}
            className={cn(
              "inline-flex h-9 min-w-[5.5rem] items-center justify-center gap-1.5 rounded-2 border text-xs font-medium transition-colors",
              covered
                ? "cursor-default border-hairline text-ink-3"
                : copied
                  ? "border-[color-mix(in_oklab,var(--tl-accent)_45%,transparent)] bg-(--tl-wash) text-(--tl-accent)"
                  : "border-transparent bg-primary text-primary-foreground",
              FOCUS_RING,
            )}
          >
            {copied ? (
              <Tick motionSafe={motionSafe} />
            ) : (
              <Copy aria-hidden className="size-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </motion.button>
          <button
            type="button"
            onClick={onDone}
            className={cn(
              "inline-flex h-9 items-center rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            Done
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Meter
          fraction={covered ? 0 : fraction}
          tone="var(--tl-accent)"
          motionSafe={motionSafe}
          className="flex-1"
        />
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums">
          {covered
            ? copied
              ? "Copied and hidden"
              : "Hidden"
            : `Hides in ${closesIn} s`}
        </span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                    Row                                   */
/* ----------------------------------------------------------------------- */

type RowProps = {
  token: TokenRecord;
  life: Life;
  scopeLabel: (id: string) => string;
  now: number;
  open: boolean;
  confirming: boolean;
  armed: boolean;
  striking: boolean;
  tabIndex: number;
  density: TokenDensity;
  motionSafe: boolean;
  inert: boolean;
  nodeRef: (node: HTMLDivElement | null) => void;
  cancelRef: (node: HTMLButtonElement | null) => void;
  onFocus: () => void;
  onToggle: () => void;
  onNav: (event: React.KeyboardEvent) => void;
  onAskRevoke: () => void;
  onCancelRevoke: () => void;
  onRevoke: () => void;
  onRotate: () => void;
};

function TokenRow({
  token,
  life,
  scopeLabel,
  now,
  open,
  confirming,
  armed,
  striking,
  tabIndex,
  density,
  motionSafe,
  inert,
  nodeRef,
  cancelRef,
  onFocus,
  onToggle,
  onNav,
  onAskRevoke,
  onCancelRevoke,
  onRevoke,
  onRotate,
}: RowProps) {
  const d = DENSITY[density];
  const dim = life.kind === "expired" || life.kind === "retiring";
  const tone =
    life.kind === "expired" || life.kind === "critical"
      ? "var(--danger)"
      : life.kind === "soon" || life.kind === "retiring"
        ? "var(--warn)"
        : "var(--tl-accent)";
  const textTone =
    life.kind === "expired" || life.kind === "critical"
      ? "text-danger"
      : life.kind === "soon" || life.kind === "retiring"
        ? "text-warn"
        : "text-ink-2";
  const description = [
    token.name,
    masked(token),
    token.scopes.map(scopeLabel).join(", "),
    life.long,
    token.lastUsedAt === null
      ? "never used"
      : `last used ${agoWord(token.lastUsedAt, now)}`,
  ].join(", ");

  return (
    <motion.div
      ref={nodeRef}
      role="option"
      aria-selected={open}
      aria-label={description}
      tabIndex={tabIndex}
      layout={motionSafe ? "position" : false}
      initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        x: motionSafe ? -distances.shift : 0,
        transition: exitFor(durations.base),
      }}
      transition={{
        layout: springs.glide,
        y: motionSafe ? springs.recoil : { duration: 0 },
        opacity: { duration: durations.base, ease: easings.enter },
      }}
      onFocus={(event) => {
        if (event.target === event.currentTarget) onFocus();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          // Works from the confirm's buttons too, so a Cancel never needs a
          // trip back to the row first.
          if (confirming) {
            event.preventDefault();
            onCancelRevoke();
          } else if (open && event.target === event.currentTarget) {
            event.preventDefault();
            onToggle();
          }
          return;
        }
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
          return;
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          if (!inert) onAskRevoke();
          return;
        }
        onNav(event);
      }}
      className={cn(
        "relative mx-1 rounded-3 border border-transparent transition-colors duration-200",
        open && !confirming && "border-hairline bg-surface-1",
        confirming &&
          "border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)]",
        !open && !inert && "hover:bg-surface-1",
        inert ? "cursor-default" : "cursor-pointer",
        FOCUS_RING,
      )}
    >
      {/* The headline, pressed to open or close the detail. */}
      <div
        onClick={() => {
          if (!striking) onToggle();
        }}
        className={cn(
          "grid grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-x-3 gap-y-1 @min-[40rem]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_7rem] @min-[52rem]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_6rem_7rem]",
          d.row,
          d.pad,
        )}
      >
        <div className="relative min-w-0">
          <p
            className={cn(
              "truncate font-medium",
              d.text,
              dim ? "text-ink-2" : "text-foreground",
            )}
          >
            {token.name}
            {life.kind === "retiring" ? (
              <span className="ml-1.5 font-mono text-[10px] tracking-[0.08em] text-warn uppercase">
                retiring
              </span>
            ) : null}
          </p>
          <p className="truncate font-mono text-[11px] text-ink-3">
            {masked(token)}
          </p>
          {striking ? (
            <motion.span
              aria-hidden
              className="absolute top-1/2 left-0 h-px w-full bg-ink-2"
              style={{ originX: 0 }}
              initial={motionSafe ? { scaleX: 0 } : { opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={
                motionSafe ? springs.flick : { duration: durations.fast }
              }
            />
          ) : null}
        </div>

        <div className="col-span-2 flex min-w-0 flex-wrap gap-1 @min-[40rem]:col-span-1 @min-[40rem]:flex-nowrap @min-[40rem]:overflow-hidden">
          {token.scopes.map((id) => (
            <ScopeChip
              key={id}
              label={scopeLabel(id)}
              className={cn(d.chip, dim && "opacity-70")}
            />
          ))}
        </div>

        <div className="hidden min-w-0 @min-[52rem]:block">
          <p className="truncate text-[11px] text-ink-2">
            {token.lastUsedAt === null
              ? "Never used"
              : agoWord(token.lastUsedAt, now)}
          </p>
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            last used
          </p>
        </div>

        <div className="col-start-2 row-start-1 flex min-w-0 flex-col gap-1 @min-[40rem]:col-start-auto @min-[40rem]:row-start-auto">
          <p
            className={cn(
              "truncate text-right text-[11px] tabular-nums",
              textTone,
            )}
          >
            {life.text}
          </p>
          <Meter fraction={life.fraction} tone={tone} motionSafe={motionSafe} />
        </div>
      </div>

      <Reveal open={open} motionSafe={motionSafe}>
        {confirming ? (
          <div
            role="group"
            aria-label={`Revoke ${token.name}`}
            className={cn("flex flex-col", d.detail, d.pad)}
          >
            <p className="text-[12px] text-foreground">
              Revoke <span className="font-medium">{token.name}</span>? Anything
              still sending it will be refused from now on.
            </p>
            <div className="flex items-center gap-2">
              <button
                ref={cancelRef}
                type="button"
                onClick={onCancelRevoke}
                className={cn(
                  "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                  FOCUS_RING,
                )}
              >
                Cancel
              </button>
              <button
                type="button"
                aria-disabled={!armed || undefined}
                onClick={() => {
                  if (armed) onRevoke();
                }}
                className={cn(
                  "relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-2 border px-3 text-xs font-medium transition-colors duration-200",
                  armed
                    ? "border-transparent bg-danger text-background"
                    : "cursor-default border-[color-mix(in_oklab,var(--danger)_35%,transparent)] text-danger",
                  FOCUS_RING,
                )}
              >
                {!armed ? (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 bg-[color-mix(in_oklab,var(--danger)_14%,transparent)]"
                    style={{ originX: 0 }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{
                      duration: motionSafe ? ARM_MS / 1000 : 0,
                      ease: easings.enter,
                    }}
                  />
                ) : null}
                <Trash2 aria-hidden className="relative size-3.5" />
                <span className="relative">Revoke</span>
              </button>
              <span
                aria-hidden
                className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
              >
                {armed ? "armed" : "arming"}
              </span>
            </div>
          </div>
        ) : (
          <div className={cn("flex flex-col", d.detail, d.pad)}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] @min-[40rem]:grid-cols-4">
              <div className="min-w-0">
                <dt className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  Created
                </dt>
                <dd className="truncate text-ink-2">
                  {dateWord(token.createdAt)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  Last used
                </dt>
                <dd className="truncate text-ink-2">
                  {token.lastUsedAt === null
                    ? "Never"
                    : agoWord(token.lastUsedAt, now)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  {token.retiresAt !== undefined ? "Retires" : "Expires"}
                </dt>
                <dd className={cn("truncate", textTone)}>
                  {token.retiresAt !== undefined
                    ? life.text
                    : token.expiresAt === null
                      ? "Never"
                      : `${dateWord(token.expiresAt)}${life.kind === "expired" ? " (expired)" : ""}`}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  Scopes
                </dt>
                <dd className="truncate text-ink-2">{token.scopes.length}</dd>
              </div>
            </dl>
            {token.supersededBy ? (
              <p className="text-[11px] text-ink-3">
                Replaced by a rotated token; calls with this one keep working
                until it retires.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-disabled={
                  inert || token.retiresAt !== undefined || undefined
                }
                onClick={() => {
                  if (!inert && token.retiresAt === undefined) onRotate();
                }}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs transition-colors",
                  inert || token.retiresAt !== undefined
                    ? "cursor-default text-ink-3"
                    : "text-foreground hover:bg-surface-2",
                  FOCUS_RING,
                )}
              >
                <RefreshCw aria-hidden className="size-3.5" />
                Rotate
              </button>
              <button
                type="button"
                aria-disabled={inert || undefined}
                onClick={() => {
                  if (!inert) onAskRevoke();
                }}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border px-3 text-xs transition-colors",
                  inert
                    ? "cursor-default border-hairline text-ink-3"
                    : "border-[color-mix(in_oklab,var(--danger)_35%,transparent)] text-danger hover:bg-[color-mix(in_oklab,var(--danger)_10%,transparent)]",
                  FOCUS_RING,
                )}
              >
                <Trash2 aria-hidden className="size-3.5" />
                Revoke
              </button>
            </div>
          </div>
        )}
      </Reveal>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Stage =
  | { kind: "form" }
  | { kind: "busy"; draft: TokenDraft; rotateOf: string | null; done: boolean }
  | {
      kind: "reveal";
      token: TokenRecord;
      secret: string | null;
      copied: boolean;
      /** When the cover closes, in clock ms. */
      closesAt: number;
      rotatedFrom: TokenRecord | null;
    };

const emptyDraft = (): TokenDraft => ({
  name: "",
  scopes: [],
  expiresInDays: 30,
});

/**
 * API tokens for a product, with their one-time reveal. Each row shows a
 * token's name, masked secret, scopes and how long it has left: a bar that
 * glides emptier on `springs.glide` as expiry nears, turning amber and then
 * red. Create opens an inline form (name, scope chips that tick on
 * `springs.flick`, an expiry radio whose pill slides on `springs.snap`); a
 * short progress bar runs on `springs.drift` while the secret is minted, then
 * the secret unspools into a read-only mono field character by character on
 * a `cascade`, with a Copy button whose check draws on `springs.flick`. A
 * cover glides shut over the field once it is copied, or when the countdown
 * runs out, leaving only the prefix and the last four; the secret is dropped
 * from memory at the same moment.
 *
 * Revoke tints the row and arms its button after 600 ms; confirmed, a strike
 * draws through the name on `springs.flick` and the row leaves on the exit
 * ease while the rows below glide up. Rotate mints a replacement, reveals it,
 * and keeps the old token on the list marked retiring until its grace runs
 * out. New rows land on `springs.recoil`.
 *
 * The list is a listbox: Up/Down and Home/End move, Enter or Space opens a
 * row's detail with Rotate and Revoke, Delete asks to revoke, Escape closes.
 * The clock that drives the countdowns ticks once a second only while a
 * reveal is open or a token has under two minutes left, and only while the
 * surface is on screen in a visible tab. Under reduced motion nothing
 * unspools, slides or draws: the secret, the cover and the strike appear at
 * once, and every state is still announced.
 */
export function TokenLocker({
  tokens,
  defaultTokens: initialTokens = defaultTokens,
  onChange,
  scopes = defaultTokenScopes,
  onCreate,
  selectedId,
  defaultSelectedId = null,
  onSelect,
  onCopy,
  onRevoke,
  onRotate,
  revealStyle = "unspool",
  density = "cozy",
  accent = "cobalt",
  revealSeconds = 30,
  rotateGraceSeconds = 45,
  prefix = "fl_live_",
  now = defaultTokenNow,
  status = "ready",
  onRetry,
  title = "API tokens",
  label,
  height = 540,
  disabled = false,
  className,
}: TokenLockerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const listId = `${uid}-list`;

  const [own, setOwn] = React.useState<TokenRecord[]>(initialTokens);
  const list = tokens ?? own;
  const controlled = tokens !== undefined;
  const latest = useLatest({ list, controlled, onChange });
  const [ownSelected, setOwnSelected] = React.useState<string | null>(
    defaultSelectedId,
  );
  const openId = selectedId === undefined ? ownSelected : selectedId;
  const ready = status === "ready";
  const inert = disabled || !ready;

  const [stage, setStage] = React.useState<Stage | null>(null);
  const [draft, setDraft] = React.useState<TokenDraft>(emptyDraft);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const [armed, setArmed] = React.useState(false);
  const [striking, setStriking] = React.useState<string | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  // The clock starts at `now` for the server render and hydration, then runs
  // on from it once mounted, so the page never prints a time the server did
  // not.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const mountedAt = React.useRef<number | null>(null);
  const [clock, setClock] = React.useState(now);
  const nowMs = React.useCallback(() => {
    if (mountedAt.current === null) mountedAt.current = Date.now();
    return now + (Date.now() - mountedAt.current);
  }, [now]);

  const [onScreen, setOnScreen] = React.useState(true);
  const [tabVisible, setTabVisible] = React.useState(true);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const rowNodes = React.useRef(new Map<string, HTMLDivElement>());
  const cancelNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const nameRef = React.useRef<HTMLInputElement | null>(null);
  const copyRef = React.useRef<HTMLButtonElement | null>(null);
  const createRef = React.useRef<HTMLButtonElement | null>(null);
  const timers = React.useRef(new Set<number>());
  const mintSeq = React.useRef(0);
  const focusReq = React.useRef<{
    kind: "row" | "cancel" | "name" | "copy" | "create";
    id?: string;
  } | null>(null);
  const [focusSeq, setFocusSeq] = React.useState(0);

  const later = React.useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
    return id;
  }, []);

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending) window.clearTimeout(id);
      pending.clear();
    };
  }, []);

  /* ------------------------------ visibility --------------------------- */

  React.useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setOnScreen(entry.isIntersecting);
      },
      { threshold: 0 },
    );
    io.observe(root);
    return () => io.disconnect();
  }, []);

  /* -------------------------------- clock ------------------------------ */

  const revealOpen = stage?.kind === "reveal" && stage.closesAt > clock;
  const hasLiveToken = list.some((t) => {
    const at = t.retiresAt ?? t.expiresAt;
    return (
      at !== null && at !== undefined && at > clock && at - clock < LIVE_WINDOW
    );
  });
  const ticking =
    live && ready && onScreen && tabVisible && (revealOpen || hasLiveToken);

  React.useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setClock(nowMs()), SEC);
    return () => window.clearInterval(id);
  }, [ticking, nowMs]);

  /* -------------------------------- focus ------------------------------ */

  React.useLayoutEffect(() => {
    const req = focusReq.current;
    if (!req) return;
    focusReq.current = null;
    const node =
      req.kind === "row"
        ? rowNodes.current.get(req.id ?? "")
        : req.kind === "cancel"
          ? cancelNodes.current.get(req.id ?? "")
          : req.kind === "name"
            ? nameRef.current
            : req.kind === "copy"
              ? copyRef.current
              : createRef.current;
    node?.focus({ preventScroll: req.kind === "row" });
  }, [focusSeq]);

  const focusLater = (req: NonNullable<typeof focusReq.current>) => {
    focusReq.current = req;
    setFocusSeq((s) => s + 1);
  };

  /* ------------------------------- changes ----------------------------- */

  // Reads the newest list, so a commit from a timer or a resolved mint never
  // builds on a snapshot that a quicker change has already replaced.
  const commit = React.useCallback(
    (make: (current: TokenRecord[]) => TokenRecord[], change: TokenChange) => {
      const next = make(latest.current.list);
      if (!latest.current.controlled) setOwn(next);
      latest.current.onChange?.(next, change);
      return next;
    },
    [latest],
  );

  const select = (id: string | null) => {
    if (selectedId === undefined) setOwnSelected(id);
    onSelect?.(id);
  };

  const scopeLabel = (id: string) =>
    scopes.find((s) => s.id === id)?.label ?? id;

  const toggleRow = (id: string) => {
    if (confirmId === id) {
      setConfirmId(null);
      setArmed(false);
    }
    const token = list.find((t) => t.id === id);
    if (openId === id) {
      select(null);
      setAnnouncement(`${token?.name ?? "Row"} closed.`);
    } else {
      select(id);
      setAnnouncement(
        `${token?.name ?? "Row"} opened. Rotate and Revoke available.`,
      );
    }
  };

  const askRevoke = (id: string) => {
    if (inert) return;
    const token = list.find((t) => t.id === id);
    if (!token) return;
    select(id);
    setConfirmId(id);
    setArmed(false);
    later(() => {
      setArmed(true);
    }, ARM_MS);
    setAnnouncement(`Revoke ${token.name}? Confirm or cancel.`);
    focusLater({ kind: "cancel", id });
  };

  const cancelRevoke = (id: string) => {
    setConfirmId(null);
    setArmed(false);
    const token = list.find((t) => t.id === id);
    setAnnouncement(`Kept ${token?.name ?? "the token"}.`);
    focusLater({ kind: "row", id });
  };

  const revoke = (id: string) => {
    const token = list.find((t) => t.id === id);
    if (!token || striking) return;
    setConfirmId(null);
    setArmed(false);
    setStriking(id);
    const i = list.findIndex((t) => t.id === id);
    const neighbour = list[i + 1] ?? list[i - 1] ?? null;
    later(
      () => {
        setStriking(null);
        commit((current) => current.filter((t) => t.id !== id), {
          type: "revoke",
          id,
        });
        if (openId === id) select(null);
        onRevoke?.(token);
        setAnnouncement(`${token.name} revoked.`);
        if (neighbour) focusLater({ kind: "row", id: neighbour.id });
        else focusLater({ kind: "create" });
      },
      motionSafe ? STRIKE_MS : 0,
    );
  };

  // A retiring token leaves the list once its grace has run out.
  const retiringDue = list.find(
    (t) => t.retiresAt !== undefined && t.retiresAt <= clock,
  );
  const retiringDueId = retiringDue?.id ?? null;
  const retireRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!retiringDueId || retireRef.current === retiringDueId) return;
    retireRef.current = retiringDueId;
    const id = window.setTimeout(() => {
      const token = latest.current.list.find((t) => t.id === retiringDueId);
      if (!token) return;
      commit((current) => current.filter((t) => t.id !== retiringDueId), {
        type: "retire",
        id: retiringDueId,
      });
      setAnnouncement(`${token.name} retired.`);
    }, 0);
    return () => window.clearTimeout(id);
  }, [retiringDueId, commit, latest]);

  /* -------------------------------- create ----------------------------- */

  const openForm = () => {
    if (inert) return;
    setDraft(emptyDraft());
    setFormError(null);
    setStage({ kind: "form" });
    setAnnouncement("New token form opened.");
    focusLater({ kind: "name" });
  };

  const closePanel = () => {
    const was = stage?.kind;
    setStage(null);
    setFormError(null);
    if (was === "reveal") setAnnouncement("Reveal closed.");
    else if (was === "form") setAnnouncement("New token form closed.");
    focusLater({ kind: "create" });
  };

  const mint = (d: TokenDraft, rotateOf: TokenRecord | null) => {
    const seq = (mintSeq.current += 1);
    setStage({
      kind: "busy",
      draft: d,
      rotateOf: rotateOf?.id ?? null,
      done: false,
    });
    setAnnouncement(
      rotateOf ? `Rotating ${rotateOf.name}.` : `Creating ${d.name}.`,
    );
    const create =
      onCreate ?? ((x: TokenDraft) => simulateTokenSecret(x, prefix));
    Promise.resolve()
      .then(() => create(d))
      .then(
        (secret) => {
          if (seq !== mintSeq.current) return;
          const at = nowMs();
          const id = `tk-${at.toString(36)}-${randomChars(4)}`;
          const token: TokenRecord = {
            id,
            name: d.name,
            prefix: secret.slice(0, Math.max(0, secret.length - 24)) || prefix,
            last4: secret.slice(-4),
            scopes: d.scopes,
            createdAt: at,
            lastUsedAt: null,
            expiresAt:
              d.expiresInDays === null ? null : at + d.expiresInDays * DAY,
          };
          let previous: TokenRecord | null = null;
          if (rotateOf) {
            previous =
              latest.current.list.find((t) => t.id === rotateOf.id) ?? null;
            commit(
              (current) => [
                token,
                ...current.map((t) =>
                  t.id === rotateOf.id
                    ? {
                        ...t,
                        retiresAt: at + rotateGraceSeconds * SEC,
                        supersededBy: id,
                      }
                    : t,
                ),
              ],
              { type: "rotate", id: rotateOf.id, replacementId: id },
            );
          } else {
            commit((current) => [token, ...current], { type: "create", id });
          }
          if (previous) onRotate?.(previous, token);
          setStage({
            kind: "busy",
            draft: d,
            rotateOf: rotateOf?.id ?? null,
            done: true,
          });
          later(() => {
            if (seq !== mintSeq.current) return;
            setClock(nowMs());
            setStage({
              kind: "reveal",
              token,
              secret,
              copied: false,
              closesAt: at + revealSeconds * SEC,
              rotatedFrom: previous,
            });
            setAnnouncement(
              `${previous ? "Replacement" : "Token"} ${d.name} created. The secret is shown once; copy it within ${revealSeconds} seconds.`,
            );
            focusLater({ kind: "copy" });
          }, 180);
        },
        () => {
          if (seq !== mintSeq.current) return;
          setDraft(d);
          setFormError("The token could not be created. Try again.");
          setStage({ kind: "form" });
          setAnnouncement("The token could not be created.");
          focusLater({ kind: "name" });
        },
      );
  };

  const submit = () => {
    if (inert || stage?.kind !== "form") return;
    const name = draft.name.trim();
    if (!name) {
      setFormError("Give the token a name.");
      focusLater({ kind: "name" });
      return;
    }
    if (draft.scopes.length === 0) {
      setFormError("Pick at least one scope.");
      return;
    }
    setFormError(null);
    mint({ ...draft, name }, null);
  };

  const rotate = (id: string) => {
    if (inert) return;
    const token = list.find((t) => t.id === id);
    if (!token || token.retiresAt !== undefined) return;
    setConfirmId(null);
    setArmed(false);
    const days =
      token.expiresAt === null
        ? null
        : Math.max(1, Math.round((token.expiresAt - token.createdAt) / DAY));
    mint(
      { name: token.name, scopes: token.scopes, expiresInDays: days },
      token,
    );
  };

  /* -------------------------------- reveal ----------------------------- */

  const cover = React.useCallback(
    (reason: "copied" | "timer") => {
      setStage((s) => {
        if (!s || s.kind !== "reveal" || s.secret === null) return s;
        return { ...s, secret: null, closesAt: Math.min(s.closesAt, clock) };
      });
      setAnnouncement(
        reason === "copied"
          ? "Copied. The secret is hidden now."
          : `Secret hidden after ${revealSeconds} seconds.`,
      );
    },
    [clock, revealSeconds],
  );

  // The countdown hides the secret the moment it runs out.
  const revealDue =
    stage?.kind === "reveal" &&
    stage.secret !== null &&
    stage.closesAt <= clock;
  React.useEffect(() => {
    if (!revealDue) return;
    const id = window.setTimeout(() => cover("timer"), 0);
    return () => window.clearTimeout(id);
  }, [revealDue, cover]);

  const copy = async () => {
    if (stage?.kind !== "reveal" || stage.secret === null) return;
    const secret = stage.secret;
    let ok = false;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(secret);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      const input = document.getElementById(`${uid}-secret`);
      try {
        if (input instanceof HTMLInputElement) input.select();
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      setAnnouncement("Copy failed. Select the field and copy it yourself.");
      return;
    }
    setStage((s) => (s && s.kind === "reveal" ? { ...s, copied: true } : s));
    onCopy?.(stage.token);
    setAnnouncement("Copied.");
    later(() => cover("copied"), COPIED_COVER_MS);
  };

  /* ------------------------------ keyboard ----------------------------- */

  const ids = list.map((t) => t.id);
  const activeRow =
    activeId && ids.includes(activeId) ? activeId : (ids[0] ?? null);

  const onNav = (event: React.KeyboardEvent, id: string) => {
    const i = ids.indexOf(id);
    let to = -1;
    if (event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = ids.length - 1;
    else return;
    event.preventDefault();
    const target = ids[clamp(to, 0, ids.length - 1)];
    if (target) rowNodes.current.get(target)?.focus({ preventScroll: false });
  };

  /* ------------------------------- render ------------------------------ */

  const accentColour = ACCENTS[accent] ?? ACCENTS.cobalt;
  const graceMs = rotateGraceSeconds * SEC;
  const expiringSoon = list.filter((t) => {
    const k = lifeOf(t, clock, graceMs).kind;
    return k === "soon" || k === "critical" || k === "retiring";
  }).length;
  const panelOpen = stage !== null;
  const closesIn =
    stage?.kind === "reveal"
      ? Math.max(0, Math.ceil((stage.closesAt - clock) / SEC))
      : 0;

  return (
    <div
      ref={rootRef}
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
        ["--tl-accent" as string]: accentColour,
        ["--tl-wash" as string]: `color-mix(in oklab, ${accentColour} 12%, transparent)`,
      }}
    >
      <p id={hintId} className="sr-only">
        Up and Down move between tokens. Enter opens a token. Delete asks to
        revoke it. Escape closes.
      </p>

      <header
        className={cn(
          "flex shrink-0 items-center justify-between gap-3 pt-3 pb-2.5",
          DENSITY[density].pad,
        )}
      >
        <div className="flex min-w-0 items-baseline gap-2">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          {ready ? (
            <p className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums">
              {list.length}
              {expiringSoon > 0 ? (
                <span className="text-warn"> · {expiringSoon} ending soon</span>
              ) : null}
            </p>
          ) : null}
        </div>
        <button
          ref={createRef}
          type="button"
          aria-expanded={panelOpen}
          aria-disabled={inert || undefined}
          onClick={() => {
            if (panelOpen) closePanel();
            else openForm();
          }}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1 rounded-2 border px-2 text-xs transition-colors",
            inert
              ? "cursor-default border-hairline text-ink-3"
              : panelOpen
                ? "border-hairline bg-surface-2 text-foreground"
                : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
          )}
        >
          {panelOpen ? (
            <X aria-hidden className="size-3.5" />
          ) : (
            <Plus aria-hidden className="size-3.5" />
          )}
          {panelOpen ? "Close" : "New token"}
        </button>
      </header>

      {/* The create / reveal panel. */}
      <Reveal
        open={panelOpen && ready}
        motionSafe={motionSafe}
        className="shrink-0"
      >
        <div className="border-t border-hairline pt-3">
          {stage?.kind === "form" ? (
            <CreateForm
              uid={uid}
              scopes={scopes}
              draft={draft}
              onDraft={(d) => {
                setDraft(d);
                if (formError) setFormError(null);
              }}
              error={formError}
              motionSafe={motionSafe}
              density={density}
              onSubmit={submit}
              onCancel={closePanel}
              nameRef={nameRef}
            />
          ) : stage?.kind === "busy" ? (
            <div
              aria-busy
              className={cn("flex flex-col gap-2 pb-4", DENSITY[density].pad)}
            >
              <p className="text-[12px] text-ink-2">
                {stage.rotateOf ? "Minting a replacement for " : "Minting "}
                <span className="font-medium text-foreground">
                  {stage.draft.name}
                </span>
                ...
              </p>
              <span className="block h-1 w-full overflow-hidden rounded-full bg-surface-2">
                <motion.span
                  className="block h-full rounded-full bg-(--tl-accent)"
                  style={{ originX: 0 }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: stage.done ? 1 : 0.86 }}
                  transition={
                    motionSafe
                      ? stage.done
                        ? springs.flick
                        : springs.drift
                      : { duration: 0 }
                  }
                />
              </span>
            </div>
          ) : stage?.kind === "reveal" ? (
            <RevealPanel
              key={stage.token.id}
              uid={uid}
              token={stage.token}
              secret={stage.secret}
              covered={stage.secret === null}
              copied={stage.copied}
              closesIn={closesIn}
              revealSeconds={revealSeconds}
              revealStyle={revealStyle}
              rotatedFrom={stage.rotatedFrom}
              motionSafe={motionSafe}
              density={density}
              onCopy={() => void copy()}
              onDone={closePanel}
              copyRef={copyRef}
            />
          ) : null}
        </div>
      </Reveal>

      <div className="relative flex-1 overflow-y-auto overscroll-contain border-t border-hairline">
        {status === "error" ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The tokens didn&apos;t load.
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
          <div aria-hidden className="flex flex-col gap-1 px-2 py-2">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-3 px-3",
                  DENSITY[density].row,
                )}
              >
                <span className="flex flex-col gap-1.5">
                  <span
                    className="h-3 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                    style={{
                      width: `${38 + ((i * 17) % 30)}%`,
                      animationDelay: `${i * 90}ms`,
                    }}
                  />
                  <span
                    className="h-2.5 w-28 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                    style={{ animationDelay: `${i * 90 + 40}ms` }}
                  />
                </span>
                <span
                  className="h-1 rounded-full bg-surface-2 motion-safe:animate-pulse"
                  style={{ animationDelay: `${i * 90 + 80}ms` }}
                />
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-8 text-center">
            <span className="flex size-9 items-center justify-center rounded-full bg-surface-2">
              <KeyRound aria-hidden className="size-4 text-ink-3" />
            </span>
            <p className="text-sm font-medium text-foreground">No tokens yet</p>
            <p className="max-w-[22rem] text-[12px] text-ink-2">
              Create one to call the Fieldline API from a script, a device or a
              partner.
            </p>
            {!inert && !panelOpen ? (
              <button
                type="button"
                onClick={openForm}
                className={cn(
                  "mt-1 inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground",
                  FOCUS_RING,
                )}
              >
                <Plus aria-hidden className="size-3.5" />
                New token
              </button>
            ) : null}
          </div>
        ) : (
          <div
            id={listId}
            role="listbox"
            aria-label={`${title}, newest first`}
            aria-describedby={hintId}
            className="flex flex-col py-1"
          >
            <AnimatePresence initial={false} mode="popLayout">
              {list.map((token) => (
                <TokenRow
                  key={token.id}
                  token={token}
                  life={lifeOf(token, clock, graceMs)}
                  scopeLabel={scopeLabel}
                  now={clock}
                  open={openId === token.id}
                  confirming={confirmId === token.id}
                  armed={confirmId === token.id && armed}
                  striking={striking === token.id}
                  tabIndex={activeRow === token.id ? 0 : -1}
                  density={density}
                  motionSafe={motionSafe}
                  inert={inert}
                  nodeRef={(node) => {
                    if (node) rowNodes.current.set(token.id, node);
                    else rowNodes.current.delete(token.id);
                  }}
                  cancelRef={(node) => {
                    if (node) cancelNodes.current.set(token.id, node);
                    else cancelNodes.current.delete(token.id);
                  }}
                  onFocus={() => setActiveId(token.id)}
                  onToggle={() => toggleRow(token.id)}
                  onNav={(event) => onNav(event, token.id)}
                  onAskRevoke={() => askRevoke(token.id)}
                  onCancelRevoke={() => cancelRevoke(token.id)}
                  onRevoke={() => revoke(token.id)}
                  onRotate={() => rotate(token.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
