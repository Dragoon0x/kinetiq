"use client";

import * as React from "react";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronLeft,
  Clock3,
  Eye,
  EyeOff,
  MailQuestion,
  RotateCcw,
  Send,
  TriangleAlert,
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

export type InvitePerson = {
  id: string;
  name: string;
  /** Up to two letters drawn on the avatar. @default the name's initials */
  initials?: string;
  /** The avatar's hue, 0 to 360. */
  hue: number;
};

export type InviteRole = {
  id: string;
  /** The badge, e.g. "Editor". */
  label: string;
  /** What the role may do, one line. */
  summary: string;
};

export type InviteWorkspace = {
  id: string;
  name: string;
  /** One line under the name. */
  tagline?: string;
  /** The letters on the workspace mark. */
  mark: string;
  /** The mark's hue, 0 to 360. */
  hue: number;
  /** The members shown in the strip, in order. */
  members: InvitePerson[];
  /** How many members there are in all; the strip adds "+N" for the rest. @default members.length */
  memberCount?: number;
};

export type Invite = {
  /** Shown nowhere; the host's key, e.g. "inv-7f3a". */
  id: string;
  inviter: InvitePerson;
  workspace: InviteWorkspace;
  role: InviteRole;
  /** The address the invite was sent to. */
  email: string;
  /** A note the inviter wrote. */
  message?: string;
  /** When it was sent, in ms. */
  sentAt: number;
  /** When it stops working, in ms. */
  expiresAt: number;
};

/**
 * Where the invitee stands: no account for the address yet (a short sign-up),
 * an account that must sign in, already signed in as the invitee, or signed
 * in as someone else.
 */
export type InviteAccountState = "new" | "existing" | "signed-in" | "other";

export type InviteAccount = {
  state: InviteAccountState;
  /** Who is signed in when the state is "other". */
  current?: { name: string; email: string; hue?: number };
};

export type InviteForm = { email: string; name: string; password: string };
export type InviteChange = {
  field: keyof InviteForm;
  from: string;
  to: string;
};

export type InviteDeclineReason =
  "wrong-workspace" | "not-now" | "unknown-inviter" | "other";

export type InviteAcceptContext = {
  invite: Invite;
  form: InviteForm;
  account: InviteAccount;
};

export type InviteCardStyle = "card" | "letter";
export type InviteDensity = "compact" | "cozy" | "roomy";
export type InviteAccent = "cobalt" | "workspace" | "ink";
export type InviteStatus = "ready" | "loading" | "error";

export type InviteAcceptProps = {
  /** The invite's finish: a plain card, or a letter with the note set in serif and the role as a round stamp. @default "card" */
  cardStyle?: InviteCardStyle;
  /** Padding, field heights, avatar and type size. @default "cozy" */
  density?: InviteDensity;
  /** The colour of the accept button, the role badge and the links: the cobalt token, the workspace mark's own hue, or ink. @default "cobalt" */
  accent?: InviteAccent;
  /** The invite; null reads "no invite found". @default defaultInvite */
  invite?: Invite | null;
  /** Where the invitee's account stands. @default defaultInviteAccount */
  account?: InviteAccount;
  /** Controlled form values. */
  value?: InviteForm;
  /** Initial form values when uncontrolled; the email is pre-filled from the invite when empty. @default defaultInviteForm */
  defaultValue?: InviteForm;
  /** Fires from every keystroke that changed a field, with all three values. */
  onChange?: (form: InviteForm, change: InviteChange) => void;
  /** Joins the workspace; resolve to land, reject to fail with Retry. @default a simulator that waits `acceptDelay` and fails while `acceptFails` */
  onAccept?: (context: InviteAcceptContext) => Promise<void>;
  /** The built-in simulator rejects while this is true. @default false */
  acceptFails?: boolean;
  /** How long the built-in simulator takes, in ms. @default 1400 */
  acceptDelay?: number;
  /** The join landed: the invitee is in the strip. */
  onAccepted?: (invite: Invite) => void;
  /** The join was rejected; the card shows Retry. */
  onAcceptError?: (error: unknown) => void;
  /** The invite was declined with a reason, and a note when one was typed. */
  onDecline?: (
    invite: Invite,
    reason: InviteDeclineReason,
    note: string,
  ) => void;
  /** Continue to workspace was pressed after joining. */
  onContinue?: (invite: Invite) => void;
  /** Sign in to accept was pressed; the password field opens. */
  onSignIn?: (email: string) => void;
  /** Switch account was pressed while signed in as someone else. */
  onSwitchAccount?: (account: InviteAccount) => void;
  /** Request a new invite was pressed on an expired or declined invite. */
  onRequestInvite?: (invite: Invite) => void;
  /** The moment the countdown counts from, in ms; never read from the clock. @default defaultInviteNow */
  now?: number;
  /** Tick the expiry chip once a second while the card is on screen and the tab is visible. @default true */
  countdown?: boolean;
  /** Whether the invite has arrived. @default "ready" */
  status?: InviteStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Invitation" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the card scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be typed, accepted or declined. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Monday 12 October 2026, 09:14 UTC: forty-seven minutes before the invite expires. */
export const defaultInviteNow = Date.UTC(2026, 9, 12, 9, 14);

/** Coldbrook Design's members, as the strip shows them. */
export const defaultInvitePeople: InvitePerson[] = [
  { id: "ines", name: "Ines Varga", hue: 24 },
  { id: "tomas", name: "Tomas Reyes", hue: 142 },
  { id: "mara", name: "Mara Lind", hue: 278 },
  { id: "kenji", name: "Kenji Aoki", hue: 196 },
  { id: "priya", name: "Priya Nair", hue: 330 },
  { id: "odile", name: "Odile Brandt", hue: 62 },
  { id: "sefu", name: "Sefu Mwangi", hue: 104 },
];

/** Ines Varga's invite to Coldbrook Design, sent on Thursday, with the hour nearly up. */
export const defaultInvite: Invite = {
  id: "inv-7f3a",
  inviter: defaultInvitePeople[0] ?? {
    id: "ines",
    name: "Ines Varga",
    hue: 24,
  },
  workspace: {
    id: "coldbrook-design",
    name: "Coldbrook Design",
    tagline: "Product and brand, one workspace",
    mark: "CD",
    hue: 210,
    members: defaultInvitePeople,
    memberCount: 23,
  },
  role: {
    id: "editor",
    label: "Editor",
    summary:
      "Can edit files and leave comments; cannot manage members or billing.",
  },
  email: "rae.okonkwo@fernmoor.example",
  message:
    "We'd love your eye on the autumn launch pages. Join whenever suits you.",
  sentAt: defaultInviteNow - 3 * DAY + 47 * MIN,
  expiresAt: defaultInviteNow + 47 * MIN,
};

export const defaultInviteAccount: InviteAccount = { state: "new" };

export const defaultInviteForm: InviteForm = {
  email: "",
  name: "",
  password: "",
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const LABEL = "font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase";

const DENSITY: Record<
  InviteDensity,
  {
    pad: string;
    gap: string;
    input: string;
    button: string;
    text: string;
    avatar: number;
    mark: number;
  }
> = {
  compact: {
    pad: "p-3.5",
    gap: "gap-3",
    input: "h-8 text-[13px]",
    button: "h-8 text-[13px]",
    text: "text-[13px]",
    avatar: 24,
    mark: 36,
  },
  cozy: {
    pad: "p-5",
    gap: "gap-4",
    input: "h-9 text-sm",
    button: "h-9 text-sm",
    text: "text-sm",
    avatar: 28,
    mark: 44,
  },
  roomy: {
    pad: "p-6",
    gap: "gap-5",
    input: "h-10 text-sm",
    button: "h-10 text-sm",
    text: "text-[15px]",
    avatar: 32,
    mark: 52,
  },
};

const REASONS: { id: InviteDeclineReason; label: string }[] = [
  { id: "wrong-workspace", label: "Wrong workspace" },
  { id: "not-now", label: "Not right now" },
  { id: "unknown-inviter", label: "I don't know the inviter" },
  { id: "other", label: "Something else" },
];

const REASON_WORD: Record<InviteDeclineReason, string> = {
  "wrong-workspace": "wrong workspace",
  "not-now": "not right now",
  "unknown-inviter": "unknown inviter",
  other: "something else",
};

const noopSubscribe = () => () => {};

const r3 = (v: number) => Number(v.toFixed(3));

/** Two letters from a name: "Rae Okonkwo" reads RO, "rae" reads RA. */
export const initialsOf = (name: string): string => {
  const parts = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
};

/** A stable hue for an address, so the invitee's avatar is the same every time. */
export const hueOf = (text: string): number => {
  let h = 7;
  for (let i = 0; i < text.length; i += 1)
    h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
};

/** "rae.okonkwo" reads Rae Okonkwo: what the invitee is called before they type a name. */
const nameFromEmail = (email: string): string =>
  (email.split("@")[0] ?? "")
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");

export type InviteStrength = { score: 0 | 1 | 2 | 3 | 4; label: string };

const STRENGTH_LABEL = ["Too short", "Weak", "Fair", "Good", "Strong"] as const;

/** Scores a password 0 to 4 from its length and the kinds of character it mixes. */
export const strengthOf = (password: string): InviteStrength => {
  if (password.length === 0) return { score: 0, label: "" };
  if (password.length < 8) return { score: 0, label: STRENGTH_LABEL[0] };
  let score = 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  const s = Math.min(4, score) as 1 | 2 | 3 | 4;
  return { score: s, label: STRENGTH_LABEL[s] };
};

const two = (n: number) => String(n).padStart(2, "0");

/** "in 2 days", "in 1h 12m", "in 46:59", or how long ago it expired. */
const formatLeft = (left: number): { short: string; long: string } => {
  if (left <= 0) {
    const ago = -left;
    const word =
      ago >= DAY
        ? `${Math.floor(ago / DAY)} ${ago >= 2 * DAY ? "days" : "day"} ago`
        : ago >= HOUR
          ? `${Math.floor(ago / HOUR)}h ago`
          : ago >= MIN
            ? `${Math.floor(ago / MIN)} min ago`
            : "just now";
    return { short: "Expired", long: `Expired ${word}` };
  }
  if (left >= 2 * DAY) {
    const d = Math.floor(left / DAY);
    return { short: `${d} days`, long: `Expires in ${d} days` };
  }
  if (left >= HOUR) {
    const h = Math.floor(left / HOUR);
    const m = Math.floor((left % HOUR) / MIN);
    return { short: `${h}h ${two(m)}m`, long: `Expires in ${h}h ${m}m` };
  }
  const m = Math.floor(left / MIN);
  const s = Math.floor((left % MIN) / 1000);
  return {
    short: `${m}:${two(s)}`,
    long: `Expires in ${m} min ${s} s`,
  };
};

type Phase =
  | "open"
  | "accepting"
  | "failed"
  | "joined"
  | "declining"
  | "declined"
  | "requested";

/* ----------------------------------------------------------------------- */
/*                                  Avatar                                  */
/* ----------------------------------------------------------------------- */

function Avatar({
  name,
  initials,
  hue,
  size,
  className,
}: {
  name: string;
  initials?: string;
  hue: number;
  size: number;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-[0.02em] text-white select-none",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: `oklch(0.6 0.14 ${hue})`,
      }}
    >
      {initials ?? initialsOf(name)}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Member strip                               */
/* ----------------------------------------------------------------------- */

function MemberStrip({
  members,
  count,
  me,
  joined,
  landed,
  size,
  motionSafe,
  live,
  layoutId,
  onLanded,
}: {
  members: InvitePerson[];
  count: number;
  me: { name: string; hue: number };
  joined: boolean;
  landed: boolean;
  size: number;
  motionSafe: boolean;
  live: boolean;
  layoutId: string;
  onLanded: () => void;
}) {
  const shown = members.slice(0, 7);
  const rest = Math.max(0, count - shown.length);
  const step = cascade(shown.length + 1);
  return (
    <ul
      role="list"
      aria-label={`Members, ${count + (joined ? 1 : 0)}`}
      className="flex items-center"
    >
      {shown.map((person, i) => (
        <motion.li
          key={person.id}
          className="-ml-2 first:ml-0"
          initial={
            live && motionSafe ? { opacity: 0, x: -distances.step } : false
          }
          animate={{ opacity: 1, x: 0 }}
          transition={
            motionSafe
              ? {
                  ...springs.drift,
                  delay: r3(i * step),
                  opacity: { duration: durations.base, ease: easings.enter },
                }
              : { duration: 0 }
          }
        >
          <Avatar
            name={person.name}
            initials={person.initials}
            hue={person.hue}
            size={size}
            className="border-2 border-card"
          />
        </motion.li>
      ))}
      <AnimatePresence initial={false}>
        {joined ? (
          <motion.li
            key="me"
            className="relative -ml-2"
            layoutId={motionSafe ? layoutId : undefined}
            layout={motionSafe}
            initial={motionSafe ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              layout: springs.glide,
              opacity: { duration: durations.base, ease: easings.enter },
            }}
            onLayoutAnimationComplete={onLanded}
          >
            <motion.span
              key={landed ? "landed" : "flying"}
              className="block"
              initial={landed && motionSafe ? { scale: 1.3 } : false}
              animate={{ scale: 1 }}
              transition={springs.recoil}
            >
              <Avatar
                name={`${me.name}, you`}
                hue={me.hue}
                size={size}
                className="border-2 border-card"
              />
            </motion.span>
            {landed && motionSafe ? (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full border-2 border-(--ia-accent-bright)"
                initial={{ scale: 0.9, opacity: 0.9 }}
                animate={{ scale: 1.9, opacity: 0 }}
                transition={{
                  ...springs.recoil,
                  opacity: { duration: durations.slow, ease: easings.exit },
                }}
              />
            ) : null}
          </motion.li>
        ) : null}
      </AnimatePresence>
      {rest > 0 ? (
        <motion.li
          className="-ml-2"
          initial={
            live && motionSafe ? { opacity: 0, x: -distances.step } : false
          }
          animate={{ opacity: 1, x: 0 }}
          transition={
            motionSafe
              ? {
                  ...springs.drift,
                  delay: r3(shown.length * step),
                  opacity: { duration: durations.base, ease: easings.enter },
                }
              : { duration: 0 }
          }
        >
          <span
            className="inline-flex items-center justify-center rounded-full border-2 border-card bg-surface-2 font-mono text-ink-2 tabular-nums"
            style={{
              width: size,
              height: size,
              fontSize: Math.round(size * 0.36),
            }}
          >
            +{rest}
          </span>
        </motion.li>
      ) : null}
    </ul>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Small parts                                */
/* ----------------------------------------------------------------------- */

function ExpiryChip({ left, stopped }: { left: number; stopped: boolean }) {
  const expired = left <= 0;
  const soon = !expired && left < HOUR;
  const text = formatLeft(left);
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[11px] tabular-nums transition-colors duration-200",
        expired
          ? "border-[color-mix(in_oklab,var(--danger)_40%,transparent)] bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] text-danger"
          : soon
            ? "border-[color-mix(in_oklab,var(--warn)_45%,transparent)] bg-[color-mix(in_oklab,var(--warn)_12%,transparent)] text-warn"
            : "border-hairline-strong text-ink-2",
        stopped && !expired && "opacity-60",
      )}
      title={text.long}
    >
      <Clock3 aria-hidden className="size-3" />
      <span className="sr-only">{text.long}</span>
      <span aria-hidden>{expired ? "Expired" : text.short}</span>
    </span>
  );
}

function StrengthMeter({
  strength,
  motionSafe,
}: {
  strength: InviteStrength;
  motionSafe: boolean;
}) {
  const tone =
    strength.score >= 3
      ? "var(--success)"
      : strength.score === 2
        ? "var(--warn)"
        : "var(--danger)";
  return (
    <div className="flex items-center gap-2">
      <div
        aria-hidden
        className="flex flex-1 gap-1"
        style={{ ["--ia-strength" as string]: tone }}
      >
        {[1, 2, 3, 4].map((n) => (
          <span
            key={n}
            className="relative h-1 flex-1 overflow-hidden rounded-full bg-surface-2"
          >
            <motion.span
              className="absolute inset-0 origin-left rounded-full bg-(--ia-strength)"
              initial={false}
              animate={{ scaleX: strength.score >= n ? 1 : 0 }}
              transition={
                motionSafe
                  ? { ...springs.snap, delay: r3((n - 1) * 0.03) }
                  : { duration: durations.fast }
              }
            />
          </span>
        ))}
      </div>
      <span
        aria-live="polite"
        className="w-14 shrink-0 text-right font-mono text-[10px] tracking-[0.04em] text-ink-3 uppercase"
      >
        {strength.label}
      </span>
    </div>
  );
}

function RoleBadge({
  role,
  stamped,
  cardStyle,
  motionSafe,
}: {
  role: InviteRole;
  stamped: boolean;
  cardStyle: InviteCardStyle;
  motionSafe: boolean;
}) {
  const letter = cardStyle === "letter";
  return (
    <motion.span
      key={stamped ? "stamped" : "plain"}
      initial={
        stamped && motionSafe
          ? { scale: 1.5, opacity: 0, rotate: letter ? -14 : 0 }
          : false
      }
      animate={{ scale: 1, opacity: 1, rotate: letter ? -5 : 0 }}
      transition={
        motionSafe
          ? {
              ...springs.recoil,
              opacity: { duration: durations.fast, ease: easings.enter },
            }
          : { duration: durations.fast }
      }
      className={cn(
        "inline-flex shrink-0 items-center gap-1 font-mono tracking-[0.08em] uppercase transition-colors duration-200",
        letter
          ? "rounded-full border-2 border-double px-3 py-1.5 text-[11px]"
          : "rounded-full border px-2.5 py-1 text-[10px]",
        stamped
          ? "border-(--ia-accent-bright) bg-(--ia-wash) text-(--ia-accent-bright)"
          : letter
            ? "border-hairline-strong text-ink-2"
            : "border-hairline-strong bg-surface-1 text-ink-2",
      )}
    >
      {stamped ? (
        <svg aria-hidden viewBox="0 0 14 14" className="size-3">
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
              motionSafe
                ? { ...springs.flick, delay: durations.fast }
                : { duration: 0 }
            }
          />
        </svg>
      ) : null}
      {role.label}
    </motion.span>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-[11px] text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const INPUT =
  "w-full rounded-2 border border-hairline-strong bg-background px-3 text-foreground placeholder:text-ink-3 transition-colors read-only:bg-surface-1 read-only:text-ink-2 disabled:cursor-not-allowed disabled:opacity-60";

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * The card an invitation opens to. On one side, who asked and where: the
 * inviter, the workspace mark, its members drifting into a strip on
 * `springs.drift` in a cascade, the role, the inviter's note and a chip
 * counting down to expiry. On the other, the account path for the address
 * the invite was sent to: a short sign-up with a strength meter when there is
 * no account, Sign in to accept when there is one, or a plain Accept when
 * already signed in; signed in as someone else, it offers Switch account.
 *
 * Accept runs a progress line under the button, and when the join resolves
 * the card joins: the invitee's own avatar leaves the form and glides into
 * the end of the member strip on `springs.glide`, lands with a ring on
 * `springs.recoil`, the role badge stamps on the same spring, and Continue
 * to workspace appears and takes focus. A rejected join shows why, with
 * Retry. Decline asks for a reason first and then fades the invite; an
 * expired or declined invite offers Request a new invite.
 *
 * The form is native: Tab moves through the fields, Enter submits, the
 * decline reasons are radios and the member strip is a list. Every state is
 * announced in words. Under reduced motion nothing travels: the avatar and
 * the stamp appear in place and the strip is simply there.
 */
export function InviteAccept({
  cardStyle = "card",
  density = "cozy",
  accent = "cobalt",
  invite = defaultInvite,
  account = defaultInviteAccount,
  value,
  defaultValue = defaultInviteForm,
  onChange,
  onAccept,
  acceptFails = false,
  acceptDelay = 1400,
  onAccepted,
  onAcceptError,
  onDecline,
  onContinue,
  onSignIn,
  onSwitchAccount,
  onRequestInvite,
  now = defaultInviteNow,
  countdown = true,
  status = "ready",
  onRetry,
  title = "Invitation",
  label,
  height = 540,
  disabled = false,
  className,
}: InviteAcceptProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const emailId = `${uid}-email`;
  const nameId = `${uid}-name`;
  const passId = `${uid}-pass`;
  const noteId = `${uid}-note`;
  const meLayoutId = `${uid}-me`;

  const d = DENSITY[density];
  const ready = status === "ready";
  const inert = disabled || !ready;

  // False for the server render and hydration, so the strip is already in
  // place on the page; true afterwards, so a strip that arrives drifts in.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  /* -------------------------------- form ------------------------------- */

  const [own, setOwn] = React.useState<InviteForm>(defaultValue);
  const raw = value ?? own;
  const form: InviteForm = {
    ...raw,
    email: raw.email || invite?.email || "",
  };

  const setField = (field: keyof InviteForm, to: string) => {
    if (inert) return;
    const from = form[field];
    if (from === to) return;
    const next = { ...form, [field]: to };
    if (value === undefined) setOwn(next);
    onChange?.(next, { field, from, to });
  };

  /* -------------------------------- state ------------------------------ */

  const [phase, setPhase] = React.useState<Phase>("open");
  const [failure, setFailure] = React.useState<string | null>(null);
  const [landed, setLanded] = React.useState(false);
  const [signInOpen, setSignInOpen] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [reason, setReason] = React.useState<InviteDeclineReason>("not-now");
  const [note, setNote] = React.useState("");
  const [announcement, setAnnouncement] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const nameRef = React.useRef<HTMLInputElement | null>(null);
  const passRef = React.useRef<HTMLInputElement | null>(null);
  const continueRef = React.useRef<HTMLButtonElement | null>(null);
  const reasonRef = React.useRef<HTMLInputElement | null>(null);
  const acceptRef = React.useRef<HTMLButtonElement | null>(null);
  const simTimer = React.useRef<number | null>(null);
  const landTimer = React.useRef<number | null>(null);
  const focusTimer = React.useRef<number | null>(null);
  const acceptSeq = React.useRef(0);
  const mounted = React.useRef(true);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (simTimer.current !== null) window.clearTimeout(simTimer.current);
      if (landTimer.current !== null) window.clearTimeout(landTimer.current);
      if (focusTimer.current !== null) window.clearTimeout(focusTimer.current);
    };
  }, []);

  const say = (text: string) => setAnnouncement(text);

  /* ------------------------------ the clock ---------------------------- */

  // Seconds that have ticked since `now` was last given; `now` changing
  // starts the chip again from the host's moment.
  const [base, setBase] = React.useState(now);
  const [tick, setTick] = React.useState(0);
  if (base !== now) {
    setBase(now);
    setTick(0);
  }
  const effectiveNow = now + tick;
  const left = invite ? invite.expiresAt - effectiveNow : 0;
  const expired = invite !== null && left <= 0;

  const [wasExpired, setWasExpired] = React.useState(expired);
  if (wasExpired !== expired) {
    setWasExpired(expired);
    if (expired && phase === "open" && ready && invite) {
      setAnnouncement(
        `The invite has expired. Ask ${invite.inviter.name} for a new one.`,
      );
    }
  }

  const ticking =
    countdown &&
    ready &&
    invite !== null &&
    !expired &&
    (phase === "open" ||
      phase === "declining" ||
      phase === "failed" ||
      phase === "accepting");

  React.useEffect(() => {
    if (!ticking) return;
    const root = rootRef.current;
    let onScreen = true;
    let visible = !document.hidden;
    let id: number | null = null;
    const start = () => {
      if (id === null && onScreen && visible) {
        id = window.setInterval(() => setTick((t) => t + 1000), 1000);
      }
    };
    const stop = () => {
      if (id !== null) window.clearInterval(id);
      id = null;
    };
    const sync = () => {
      if (onScreen && visible) start();
      else stop();
    };
    const onVisibility = () => {
      visible = !document.hidden;
      sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    let io: IntersectionObserver | null = null;
    if (root && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((entries) => {
        onScreen = entries[0]?.isIntersecting ?? true;
        sync();
      });
      io.observe(root);
    }
    sync();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
    };
  }, [ticking]);

  /* ------------------------------- derived ----------------------------- */

  const me = React.useMemo(() => {
    const email = form.email;
    const name = form.name.trim() || nameFromEmail(email) || "You";
    return { name, hue: hueOf(email || name) };
  }, [form.email, form.name]);

  const strength = strengthOf(form.password);
  const joined = phase === "joined";
  const declined = phase === "declined";
  const busy = phase === "accepting";
  const canAccept =
    !inert &&
    invite !== null &&
    !expired &&
    (phase === "open" || phase === "failed") &&
    account.state !== "other";

  // The accent is pigment: a hue at a fixed lightness reads the same in both
  // themes, so the workspace's own colour needs no light and dark pair.
  const accentVars = (
    accent === "workspace" && invite
      ? {
          "--ia-accent": `oklch(0.52 0.15 ${invite.workspace.hue})`,
          "--ia-accent-bright": `oklch(0.62 0.17 ${invite.workspace.hue})`,
          "--ia-wash": `color-mix(in oklab, oklch(0.62 0.17 ${invite.workspace.hue}) 14%, transparent)`,
          "--ia-on-accent": "white",
        }
      : accent === "ink"
        ? {
            "--ia-accent": "var(--ink)",
            "--ia-accent-bright": "var(--ink-2)",
            "--ia-wash": "color-mix(in oklab, var(--ink) 9%, transparent)",
            "--ia-on-accent": "var(--bg-0)",
          }
        : {
            "--ia-accent": "var(--accent)",
            "--ia-accent-bright": "var(--accent-bright)",
            "--ia-wash": "var(--accent-wash)",
            "--ia-on-accent": "white",
          }
  ) as React.CSSProperties;

  /* ------------------------------- actions ----------------------------- */

  const simulate = (): Promise<void> =>
    new Promise((resolve, reject) => {
      if (simTimer.current !== null) window.clearTimeout(simTimer.current);
      simTimer.current = window.setTimeout(() => {
        simTimer.current = null;
        if (acceptFails) {
          reject(
            new Error(
              `${invite?.workspace.name ?? "The workspace"} did not answer.`,
            ),
          );
        } else resolve();
      }, acceptDelay);
    });

  const land = () => {
    if (landTimer.current !== null) window.clearTimeout(landTimer.current);
    landTimer.current = null;
    setLanded(true);
  };

  const accept = async () => {
    if (!canAccept || !invite) return;
    if (account.state === "new") {
      if (!form.name.trim()) {
        say("Enter your name to create the account.");
        nameRef.current?.focus();
        return;
      }
      if (strength.score < 2) {
        say(
          strength.score === 0
            ? "Choose a password of at least 8 characters."
            : `Choose a stronger password: ${strength.label.toLowerCase()}. Mix cases, digits or symbols.`,
        );
        passRef.current?.focus();
        return;
      }
    }
    if (account.state === "existing") {
      if (!signInOpen) {
        setSignInOpen(true);
        onSignIn?.(form.email);
        say("Enter your password to sign in and accept.");
        return;
      }
      if (!form.password) {
        say("Enter your password.");
        passRef.current?.focus();
        return;
      }
    }
    const seq = (acceptSeq.current += 1);
    setFailure(null);
    setPhase("accepting");
    say(`Joining ${invite.workspace.name}.`);
    try {
      await (onAccept ?? simulate)({ invite, form, account });
    } catch (error) {
      if (!mounted.current || seq !== acceptSeq.current) return;
      const text =
        error instanceof Error && error.message
          ? error.message
          : "Something went wrong.";
      setFailure(text);
      setPhase("failed");
      onAcceptError?.(error);
      say(`Could not join ${invite.workspace.name}. ${text} Retry.`);
      return;
    }
    if (!mounted.current || seq !== acceptSeq.current) return;
    setPhase("joined");
    onAccepted?.(invite);
    say(
      `Joined ${invite.workspace.name} as ${invite.role.label}. Continue to the workspace.`,
    );
    // The landing follows the avatar's glide; if nothing could glide (no
    // motion, or no avatar to leave from) it lands at once.
    if (!motionSafe) land();
    else {
      landTimer.current = window.setTimeout(land, 900);
    }
  };

  const startDecline = () => {
    if (inert || !invite || !(phase === "open" || phase === "failed")) return;
    setPhase("declining");
    say("Why are you declining? Choose a reason.");
  };

  const cancelDecline = () => {
    setPhase("open");
    say("Back to the invite.");
    // The form mounts after the reasons leave; focus waits for it.
    if (focusTimer.current !== null) window.clearTimeout(focusTimer.current);
    focusTimer.current = window.setTimeout(() => {
      focusTimer.current = null;
      acceptRef.current?.focus({ preventScroll: true });
    }, durations.base * 1000);
  };

  const confirmDecline = () => {
    if (inert || !invite) return;
    setPhase("declined");
    onDecline?.(invite, reason, note.trim());
    say(
      `Invitation to ${invite.workspace.name} declined: ${REASON_WORD[reason]}.`,
    );
  };

  const requestInvite = () => {
    if (inert || !invite) return;
    setPhase("requested");
    onRequestInvite?.(invite);
    say(`Request for a new invite sent to ${invite.inviter.name}.`);
  };

  const switchAccount = () => {
    if (inert) return;
    onSwitchAccount?.(account);
    say("Switching account.");
  };

  // Focus lands on the reasons when declining opens, and on Continue once
  // the avatar has landed.
  React.useEffect(() => {
    if (phase === "declining") reasonRef.current?.focus();
  }, [phase]);
  React.useEffect(() => {
    if (landed) continueRef.current?.focus({ preventScroll: true });
  }, [landed]);

  /* ------------------------------- render ------------------------------ */

  const button = (kind: "primary" | "quiet" | "danger") =>
    cn(
      "inline-flex items-center justify-center gap-1.5 rounded-2 px-3 font-medium whitespace-nowrap transition-colors",
      d.button,
      kind === "primary" &&
        "bg-(--ia-accent) text-(--ia-on-accent) hover:bg-(--ia-accent-bright)",
      kind === "quiet" &&
        "border border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
      kind === "danger" &&
        "border border-[color-mix(in_oklab,var(--danger)_45%,transparent)] text-danger hover:bg-[color-mix(in_oklab,var(--danger)_10%,transparent)]",
      FOCUS_RING,
    );

  const enter = (i = 0) => ({
    initial: { opacity: 0, y: motionSafe ? distances.nudge : 0 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, transition: exitFor(durations.fast) },
    transition: motionSafe
      ? {
          ...springs.snap,
          delay: r3(i * 0.05),
          opacity: { duration: durations.base, ease: easings.enter },
        }
      : { duration: durations.fast },
  });

  const letter = cardStyle === "letter";

  const meRow = (
    <div className="flex items-center gap-2.5">
      {!joined ? (
        <motion.span
          layoutId={motionSafe ? meLayoutId : undefined}
          layout={motionSafe}
          className="block"
          transition={{ layout: springs.glide }}
        >
          <Avatar
            name={`${me.name}, you`}
            hue={me.hue}
            size={d.avatar}
            className="border-2 border-card"
          />
        </motion.span>
      ) : null}
      <p className="min-w-0 text-[12px] text-ink-2">
        <span className={LABEL}>Joining as</span>{" "}
        <span className="block truncate text-foreground">
          {me.name}
          {invite ? (
            <span className="text-ink-3"> · {invite.role.label}</span>
          ) : null}
        </span>
      </p>
    </div>
  );

  const progress = (
    <div
      aria-hidden
      className="relative h-0.5 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <motion.span
        className={cn(
          "absolute inset-0 origin-left rounded-full",
          phase === "failed" ? "bg-danger" : "bg-(--ia-accent-bright)",
        )}
        initial={false}
        animate={{
          scaleX: busy ? 0.92 : joined ? 1 : phase === "failed" ? 0.92 : 0,
          opacity: busy || joined || phase === "failed" ? 1 : 0,
        }}
        transition={
          busy
            ? {
                scaleX: {
                  duration: r3(Math.max(0.3, (acceptDelay / 1000) * 0.9)),
                  ease: easings.enter,
                },
                opacity: { duration: durations.fast },
              }
            : joined && motionSafe
              ? { scaleX: springs.flick, opacity: { duration: 0 } }
              : { duration: durations.fast }
        }
      />
    </div>
  );

  const accountPane = () => {
    if (!invite) return null;

    if (joined) {
      return (
        <motion.div key="joined" {...enter()} className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <motion.span
              key={landed ? "ok" : "wait"}
              className="inline-flex size-7 items-center justify-center rounded-full bg-(--ia-wash) text-(--ia-accent-bright)"
              initial={landed && motionSafe ? { scale: 0.4 } : false}
              animate={{ scale: 1 }}
              transition={motionSafe ? springs.recoil : { duration: 0 }}
            >
              <Check aria-hidden className="size-4" />
            </motion.span>
            <div className="min-w-0">
              <p className={cn("font-semibold", d.text)}>You&apos;re in</p>
              <p className="truncate text-[12px] text-ink-2">
                Joined {invite.workspace.name} as {invite.role.label}
              </p>
            </div>
          </div>
          {progress}
          <AnimatePresence>
            {landed ? (
              <motion.button
                key="continue"
                ref={continueRef}
                type="button"
                onClick={() => onContinue?.(invite)}
                className={button("primary")}
                {...enter()}
              >
                Continue to workspace
                <ArrowRight aria-hidden className="size-3.5" />
              </motion.button>
            ) : null}
          </AnimatePresence>
        </motion.div>
      );
    }

    if (phase === "requested") {
      return (
        <motion.div
          key="requested"
          {...enter()}
          className="flex flex-col gap-2.5"
        >
          <div className="flex items-center gap-2.5">
            <motion.span
              className="inline-flex size-7 items-center justify-center rounded-full bg-(--ia-wash) text-(--ia-accent-bright)"
              initial={motionSafe ? { scale: 0.4 } : false}
              animate={{ scale: 1 }}
              transition={motionSafe ? springs.recoil : { duration: 0 }}
            >
              <Send aria-hidden className="size-3.5" />
            </motion.span>
            <div className="min-w-0">
              <p className={cn("font-semibold", d.text)}>Request sent</p>
              <p className="text-[12px] text-ink-2">
                {invite.inviter.name} will get a note asking for a new invite to{" "}
                {invite.workspace.name}.
              </p>
            </div>
          </div>
        </motion.div>
      );
    }

    if (declined) {
      return (
        <motion.div key="declined" {...enter()} className="flex flex-col gap-3">
          <div>
            <p className={cn("font-semibold", d.text)}>Invitation declined</p>
            <p className="text-[12px] text-ink-2">
              {invite.inviter.name} won&apos;t be told why. Changed your mind?
            </p>
          </div>
          <button
            type="button"
            onClick={requestInvite}
            aria-disabled={inert || undefined}
            className={button("quiet")}
          >
            <Send aria-hidden className="size-3.5" />
            Request a new invite
          </button>
        </motion.div>
      );
    }

    if (expired) {
      return (
        <motion.div key="expired" {...enter()} className="flex flex-col gap-3">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] text-danger">
              <Clock3 aria-hidden className="size-3.5" />
            </span>
            <div className="min-w-0">
              <p className={cn("font-semibold", d.text)}>
                This invite has expired
              </p>
              <p className="text-[12px] text-ink-2">
                It {formatLeft(left).long.toLowerCase()}. Invites to{" "}
                {invite.workspace.name} work for three days;{" "}
                {invite.inviter.name} can send another.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={requestInvite}
            aria-disabled={inert || undefined}
            className={button("primary")}
          >
            <Send aria-hidden className="size-3.5" />
            Request a new invite
          </button>
        </motion.div>
      );
    }

    if (phase === "declining") {
      return (
        <motion.form
          key="declining"
          {...enter()}
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            confirmDecline();
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className={cn("font-semibold", d.text)}>
              Why are you declining?
            </legend>
            <p className="text-[12px] text-ink-2">
              Only you and Coldbrook see this.
            </p>
            <div
              role="radiogroup"
              aria-label="Reason"
              className="mt-1 flex flex-wrap gap-1.5"
            >
              {REASONS.map((r, i) => (
                <label
                  key={r.id}
                  className={cn(
                    "relative inline-flex h-7 cursor-pointer items-center rounded-full border px-2.5 text-xs transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring has-focus-visible:outline-solid",
                    reason === r.id
                      ? "border-(--ia-accent-bright) bg-(--ia-wash) text-(--ia-accent-bright)"
                      : "border-hairline-strong text-ink-2 hover:bg-surface-2",
                  )}
                >
                  <input
                    ref={i === 0 ? reasonRef : undefined}
                    type="radio"
                    name={`${uid}-reason`}
                    value={r.id}
                    checked={reason === r.id}
                    disabled={inert}
                    onChange={() => {
                      setReason(r.id);
                      say(`Reason: ${REASON_WORD[r.id]}.`);
                    }}
                    className="sr-only"
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={noteId} className={LABEL}>
              Anything else (optional)
            </label>
            <textarea
              id={noteId}
              value={note}
              disabled={inert}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              className={cn(INPUT, "resize-none py-2 text-[13px]")}
              placeholder="A line for your own records"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              aria-disabled={inert || undefined}
              className={button("danger")}
            >
              Decline invitation
            </button>
            <button
              type="button"
              onClick={cancelDecline}
              className={button("quiet")}
            >
              <ChevronLeft aria-hidden className="size-3.5" />
              Back
            </button>
          </div>
        </motion.form>
      );
    }

    if (account.state === "other") {
      const cur = account.current ?? { name: "Someone else", email: "" };
      return (
        <motion.div key="other" {...enter()} className="flex flex-col gap-3">
          <div>
            <p className={cn("font-semibold", d.text)}>
              You&apos;re signed in as someone else
            </p>
            <p className="text-[12px] text-ink-2">
              This invite was sent to{" "}
              <span className="font-mono text-foreground">{invite.email}</span>.
              Switch to that account to accept it.
            </p>
          </div>
          <div className="flex items-center gap-2.5 rounded-3 border border-hairline bg-surface-1 px-3 py-2">
            <Avatar
              name={cur.name}
              hue={cur.hue ?? hueOf(cur.email || cur.name)}
              size={d.avatar}
            />
            <div className="min-w-0">
              <p className="truncate text-[13px] text-foreground">{cur.name}</p>
              {cur.email ? (
                <p className="truncate font-mono text-[11px] text-ink-3">
                  {cur.email}
                </p>
              ) : null}
            </div>
            <span className={cn("ml-auto shrink-0", LABEL)}>signed in</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={switchAccount}
              aria-disabled={inert || undefined}
              className={button("primary")}
            >
              <ArrowLeftRight aria-hidden className="size-3.5" />
              Switch account
            </button>
            <button
              type="button"
              onClick={startDecline}
              aria-disabled={inert || undefined}
              className={button("quiet")}
            >
              Decline
            </button>
          </div>
        </motion.div>
      );
    }

    const isNew = account.state === "new";
    const isExisting = account.state === "existing";
    const signedIn = account.state === "signed-in";
    const passwordShown = isNew || (isExisting && signInOpen);
    const primaryText = busy
      ? `Joining ${invite.workspace.name}`
      : phase === "failed"
        ? "Retry"
        : isNew
          ? "Create account and accept"
          : isExisting
            ? signInOpen
              ? "Sign in and accept"
              : "Sign in to accept"
            : "Accept invitation";

    return (
      <motion.form
        key={`form-${account.state}`}
        {...enter()}
        className="flex flex-col gap-3.5"
        onSubmit={(event) => {
          event.preventDefault();
          void accept();
        }}
      >
        <div>
          <p className={cn("font-semibold", d.text)}>
            {isNew
              ? "Create your account"
              : isExisting
                ? "Sign in to accept"
                : "Accept the invitation"}
          </p>
          <p className="text-[12px] text-ink-2">
            {isNew
              ? "No Coldbrook account uses this address yet. It takes a name and a password."
              : isExisting
                ? "There is a Coldbrook account for this address."
                : "You are signed in with the address the invite was sent to."}
          </p>
        </div>

        {signedIn ? (
          <div className="flex items-center gap-2 rounded-3 border border-hairline bg-surface-1 px-3 py-2">
            <span className={LABEL}>Signed in as</span>
            <span className="min-w-0 truncate font-mono text-[12px] text-foreground">
              {form.email}
            </span>
          </div>
        ) : (
          <Field
            id={emailId}
            label="Email"
            hint="Invites are tied to the address they were sent to."
          >
            <input
              id={emailId}
              type="email"
              value={form.email}
              readOnly
              aria-describedby={`${emailId}-hint`}
              className={cn(INPUT, d.input, "font-mono text-[13px]")}
            />
          </Field>
        )}

        {isNew ? (
          <Field id={nameId} label="Your name">
            <input
              ref={nameRef}
              id={nameId}
              type="text"
              autoComplete="name"
              value={form.name}
              disabled={inert || busy}
              onChange={(event) => setField("name", event.target.value)}
              placeholder={nameFromEmail(form.email) || "Your name"}
              className={cn(INPUT, d.input)}
            />
          </Field>
        ) : null}

        <AnimatePresence initial={false}>
          {passwordShown ? (
            <motion.div
              key="password"
              className="overflow-hidden"
              initial={isExisting ? { height: 0, opacity: 0 } : false}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0, transition: exitFor() }}
              transition={
                motionSafe
                  ? {
                      height: springs.snap,
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                    }
                  : { duration: durations.fast }
              }
            >
              <div className="flex flex-col gap-2 p-px">
                <Field id={passId} label={isNew ? "Password" : "Your password"}>
                  <div className="relative">
                    <input
                      ref={passRef}
                      id={passId}
                      type={showPassword ? "text" : "password"}
                      autoComplete={isNew ? "new-password" : "current-password"}
                      value={form.password}
                      disabled={inert || busy}
                      onChange={(event) =>
                        setField("password", event.target.value)
                      }
                      aria-describedby={
                        isNew ? `${passId}-strength` : undefined
                      }
                      className={cn(INPUT, d.input, "pr-9")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-pressed={showPassword}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      className={cn(
                        "absolute top-1/2 right-1.5 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-1 text-ink-3 transition-colors hover:text-foreground",
                        FOCUS_RING,
                      )}
                    >
                      {showPassword ? (
                        <EyeOff aria-hidden className="size-3.5" />
                      ) : (
                        <Eye aria-hidden className="size-3.5" />
                      )}
                    </button>
                  </div>
                </Field>
                {isNew ? (
                  <div id={`${passId}-strength`}>
                    <StrengthMeter
                      strength={strength}
                      motionSafe={motionSafe}
                    />
                  </div>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {meRow}

        <div className="flex flex-col gap-2">
          {progress}
          <AnimatePresence initial={false}>
            {phase === "failed" && failure ? (
              <motion.p
                key="failure"
                role="alert"
                className="flex items-start gap-1.5 text-[12px] text-danger"
                {...enter()}
              >
                <TriangleAlert
                  aria-hidden
                  className="mt-0.5 size-3.5 shrink-0"
                />
                <span>
                  Could not join {invite.workspace.name}: {failure}
                </span>
              </motion.p>
            ) : null}
          </AnimatePresence>
          <div className="flex flex-wrap items-center gap-2">
            <motion.button
              ref={acceptRef}
              type="submit"
              aria-disabled={!canAccept || undefined}
              aria-busy={busy || undefined}
              whileTap={canAccept && motionSafe ? { scale: 0.97 } : undefined}
              transition={springs.flick}
              className={cn(
                button("primary"),
                !canAccept && "cursor-default opacity-70",
                busy && "opacity-90",
              )}
            >
              {busy ? (
                <motion.span
                  aria-hidden
                  className="size-3 rounded-full border-2 border-current border-t-transparent"
                  animate={motionSafe ? { rotate: 360 } : { rotate: 0 }}
                  transition={
                    motionSafe
                      ? { repeat: Infinity, duration: 0.9, ease: "linear" }
                      : { duration: 0 }
                  }
                />
              ) : phase === "failed" ? (
                <RotateCcw aria-hidden className="size-3.5" />
              ) : null}
              {primaryText}
              {busy ? <span aria-hidden>...</span> : null}
            </motion.button>
            <button
              type="button"
              onClick={startDecline}
              aria-disabled={inert || busy || undefined}
              className={cn(button("quiet"), busy && "opacity-60")}
            >
              Decline
            </button>
          </div>
        </div>
      </motion.form>
    );
  };

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
      style={{ height, ...accentVars }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
        <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
          {title}
        </p>
        {ready && invite ? (
          <ExpiryChip
            left={left}
            stopped={joined || declined || phase === "requested"}
          />
        ) : null}
      </header>

      <div className="relative flex-1 overflow-y-auto overscroll-contain">
        {status === "loading" ? (
          <div
            aria-hidden
            className={cn(
              "grid grid-cols-1 @min-[40rem]:grid-cols-2",
              d.pad,
              d.gap,
            )}
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="size-7 rounded-full bg-surface-2 motion-safe:animate-pulse" />
                <span className="h-3 w-40 rounded-full bg-surface-2 motion-safe:animate-pulse" />
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="rounded-3 bg-surface-2 motion-safe:animate-pulse"
                  style={{ width: d.mark, height: d.mark }}
                />
                <div className="flex flex-col gap-2">
                  <span className="h-3.5 w-36 rounded-full bg-surface-2 motion-safe:animate-pulse" />
                  <span className="h-2.5 w-48 rounded-full bg-surface-2 motion-safe:animate-pulse" />
                </div>
              </div>
              <div className="flex">
                {Array.from({ length: 6 }, (_, i) => (
                  <span
                    key={i}
                    className="-ml-2 rounded-full border-2 border-card bg-surface-2 first:ml-0 motion-safe:animate-pulse"
                    style={{
                      width: d.avatar,
                      height: d.avatar,
                      animationDelay: `${i * 70}ms`,
                    }}
                  />
                ))}
              </div>
              <span className="h-2.5 w-full rounded-full bg-surface-2 motion-safe:animate-pulse" />
              <span className="h-2.5 w-3/4 rounded-full bg-surface-2 motion-safe:animate-pulse" />
            </div>
            <div className="flex flex-col gap-3">
              <span className="h-3.5 w-32 rounded-full bg-surface-2 motion-safe:animate-pulse" />
              {Array.from({ length: 3 }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "w-full rounded-2 bg-surface-2 motion-safe:animate-pulse",
                    d.input,
                  )}
                  style={{ animationDelay: `${i * 90}ms` }}
                />
              ))}
              <span
                className={cn(
                  "w-44 rounded-2 bg-surface-2 motion-safe:animate-pulse",
                  d.button,
                )}
              />
            </div>
          </div>
        ) : status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The invite didn&apos;t load.
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
        ) : !invite ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <MailQuestion aria-hidden className="size-5 text-ink-3" />
            <p className="text-sm text-foreground">No invite found</p>
            <p className="max-w-xs text-[12px] text-ink-2">
              The link may have been used already, or it belongs to another
              address. Ask whoever sent it for a new one.
            </p>
          </div>
        ) : (
          <LayoutGroup id={uid}>
            <div className="grid min-h-full grid-cols-1 @min-[40rem]:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
              {/* ------------------------- the invite ------------------------ */}
              <motion.section
                aria-label="The invitation"
                initial={false}
                animate={{
                  opacity: declined ? 0.45 : 1,
                  filter: declined ? "grayscale(1)" : "grayscale(0)",
                }}
                transition={{ duration: durations.slow, ease: easings.exit }}
                className={cn(
                  "flex flex-col border-b border-hairline @min-[40rem]:border-r @min-[40rem]:border-b-0",
                  d.pad,
                  d.gap,
                  letter &&
                    "bg-surface-1 bg-[radial-gradient(circle_at_top_left,var(--ia-wash),transparent_60%)]",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Avatar
                    name={invite.inviter.name}
                    initials={invite.inviter.initials}
                    hue={invite.inviter.hue}
                    size={d.avatar}
                  />
                  <p className={cn("min-w-0", d.text)}>
                    <span className="font-semibold">{invite.inviter.name}</span>{" "}
                    <span className="text-ink-2">invited you to join</span>
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="inline-flex shrink-0 items-center justify-center rounded-3 font-semibold tracking-[0.04em] text-white"
                    style={{
                      width: d.mark,
                      height: d.mark,
                      fontSize: Math.round(d.mark * 0.36),
                      background: `oklch(0.5 0.15 ${invite.workspace.hue})`,
                    }}
                  >
                    {invite.workspace.mark}
                  </span>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "truncate font-semibold",
                        density === "roomy" ? "text-lg" : "text-base",
                        letter && "font-serif",
                      )}
                    >
                      {invite.workspace.name}
                    </p>
                    {invite.workspace.tagline ? (
                      <p className="truncate text-[12px] text-ink-2">
                        {invite.workspace.tagline}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className={LABEL}>
                    {invite.workspace.memberCount ??
                      invite.workspace.members.length}{" "}
                    members
                  </span>
                  <MemberStrip
                    members={invite.workspace.members}
                    count={
                      invite.workspace.memberCount ??
                      invite.workspace.members.length
                    }
                    me={me}
                    joined={joined}
                    landed={landed}
                    size={d.avatar}
                    motionSafe={motionSafe}
                    live={live}
                    layoutId={meLayoutId}
                    onLanded={() => {
                      if (joined && !landed) land();
                    }}
                  />
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className={LABEL}>Your role</span>
                    <p className="text-[12px] text-ink-2">
                      {invite.role.summary}
                    </p>
                  </div>
                  <RoleBadge
                    role={invite.role}
                    stamped={landed}
                    cardStyle={cardStyle}
                    motionSafe={motionSafe}
                  />
                </div>

                {invite.message ? (
                  <figure
                    className={cn(
                      "mt-auto",
                      letter
                        ? "border-t border-dashed border-hairline-strong pt-3"
                        : "border-l-2 border-(--ia-accent-bright) pl-3",
                    )}
                  >
                    <blockquote
                      className={cn(
                        "text-ink-2",
                        letter
                          ? "font-serif text-[15px] italic"
                          : "text-[13px]",
                      )}
                    >
                      {invite.message}
                    </blockquote>
                    <figcaption className={cn("mt-1.5", LABEL)}>
                      {invite.inviter.name}
                    </figcaption>
                  </figure>
                ) : null}
              </motion.section>

              {/* ------------------------- the account ----------------------- */}
              <section
                aria-label="Your account"
                className={cn("relative flex flex-col", d.pad)}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {accountPane()}
                </AnimatePresence>
              </section>
            </div>
          </LayoutGroup>
        )}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
