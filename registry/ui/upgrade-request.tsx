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
import { BellRing, Check, RotateCcw, Send, TriangleAlert } from "lucide-react";

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

export type UpgradeRequestCardStyle = "raised" | "outline" | "tinted";
export type UpgradeRequestEnvelopeStyle = "classic" | "airmail" | "plain";
export type UpgradeRequestAccentName = "cobalt" | "mint" | "amber" | "ink";
export type UpgradeRequestStatus = "ready" | "loading" | "error";
export type UpgradeRequestPresence = "online" | "away" | "offline";

export type UpgradeRequestAdmin = {
  id: string;
  name: string;
  /** "Owner", "Billing admin". */
  role: string;
  presence?: UpgradeRequestPresence;
  /** Avatar disc colour, any CSS colour. Defaults to a token picked from the id. */
  tint?: string;
};

export type UpgradeRequestPlan = {
  name: string;
  /** "$18 a member a month". */
  price: string;
  /** What the plan adds, short: "Version history", "SSO". */
  adds: string[];
};

export type UpgradeRequestFeature = {
  name: string;
  description: string;
};

export type UpgradeRequestRecord = {
  adminId: string;
  note: string;
  /** When it was asked, in ms. */
  at: number;
  status: "pending" | "approved" | "declined";
  /** The admin's answer, shown when declined (or approved). */
  reply?: string;
  /** When the last reminder went, in ms. */
  remindedAt?: number;
};

type Async = void | Promise<unknown>;

export type UpgradeRequestProps = {
  /** Who can approve the upgrade. @default defaultUpgradeRequestAdmins */
  admins?: UpgradeRequestAdmin[];
  /** The plan being asked for. @default defaultUpgradeRequestPlan */
  plan?: UpgradeRequestPlan;
  /** The feature the member reached for. @default defaultUpgradeRequestFeature */
  feature?: UpgradeRequestFeature;
  /** The note's starting text. @default a sentence about the Q3 roadmap */
  reason?: string;
  /** Controlled chosen admin id. */
  value?: string;
  /** Initial admin when uncontrolled. @default the first admin who is online */
  defaultValue?: string;
  /** Fires from the press or key that chose an admin. */
  onValueChange?: (id: string) => void;
  /** Controlled request: null before asking. Set its status to answer it. */
  request?: UpgradeRequestRecord | null;
  /** Initial request when uncontrolled. @default null */
  defaultRequest?: UpgradeRequestRecord | null;
  /** Fires when asking creates the request, a reminder updates it, or "Ask someone else" clears it. */
  onRequestChange?: (request: UpgradeRequestRecord | null) => void;
  /** Send was pressed. Return a promise to hold the button; a rejection keeps the form with its message. */
  onRequest?: (details: { admin: UpgradeRequestAdmin; note: string }) => Async;
  /** Remind was pressed on a pending request. */
  onRemind?: (request: UpgradeRequestRecord) => void;
  /** The unlocked feature's Open button was pressed. */
  onOpenFeature?: () => void;
  /** The moment times are written against, in ms. @default defaultUpgradeRequestNow */
  now?: number;
  /** Minutes before a second reminder can go. @default 15 */
  remindAfter?: number;
  /** The note's length limit, in characters. @default 280 */
  maxNote?: number;
  /** Whether the admins have arrived. @default "ready" */
  status?: UpgradeRequestStatus;
  /** "Try again" was pressed after the admins failed to load. */
  onRetry?: () => void;
  /** The request card: a raised popover, a hairline outline, or a wash of the accent. @default "raised" */
  cardStyle?: UpgradeRequestCardStyle;
  /** The envelope the card folds into: flap and seams, an airmail border, or a plain sleeve with a seal. @default "classic" */
  envelopeStyle?: UpgradeRequestEnvelopeStyle;
  /** The selection, Send and the envelope's seal: a named pigment or any CSS colour. @default "cobalt" */
  accent?: UpgradeRequestAccentName | (string & {});
  /** How a time is written. @default "14:32", 24-hour UTC */
  formatTime?: (ms: number) => string;
  /** The surface's height cap in px; it scrolls inside it. @default 560 */
  maxHeight?: number;
  /** Nothing can be sent; the request can still be read. @default false */
  disabled?: boolean;
  /** Classes for the surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** A fixed afternoon, so the defaults render the same on every machine. */
export const defaultUpgradeRequestNow = Date.UTC(2026, 9, 14, 14, 32);

export const defaultUpgradeRequestAdmins: UpgradeRequestAdmin[] = [
  { id: "priya", name: "Priya Raman", role: "Owner", presence: "online" },
  { id: "tomas", name: "Tomás Alves", role: "Billing admin", presence: "away" },
  { id: "june", name: "June Okafor", role: "Admin", presence: "offline" },
];

export const defaultUpgradeRequestPlan: UpgradeRequestPlan = {
  name: "Business",
  price: "$18 a member a month",
  adds: ["Version history", "Single sign-on", "Audit log"],
};

export const defaultUpgradeRequestFeature: UpgradeRequestFeature = {
  name: "Version history",
  description:
    "Every edit kept for a year, so any board can go back to how it was.",
};

const DEFAULT_REASON =
  "I need version history to restore the Q3 roadmap after Tuesday's edits.";

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const utcTime = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

/** Unsigned FNV-1a, so an id always picks the same disc colour. */
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};
const DISCS = [
  "var(--accent-bright)",
  "var(--success)",
  "var(--warn)",
  "var(--signal)",
  "var(--danger)",
];

const PRESENCE: Record<
  UpgradeRequestPresence,
  { words: string; dot: string; answers: string }
> = {
  online: {
    words: "active now",
    dot: "bg-success",
    answers: "usually answers within the hour",
  },
  away: {
    words: "away",
    dot: "bg-warn",
    answers: "usually answers within a few hours",
  },
  offline: {
    words: "offline",
    dot: "bg-ink-3",
    answers: "usually answers within a day",
  },
};

/**
 * Accent as custom properties. Mint and amber fills are pigment — the token's
 * hue and chroma at a fixed lightness — since the status tokens are tuned
 * for text and go muddy as a fill on a light page.
 */
const ACCENTS: Record<UpgradeRequestAccentName, Record<string, string>> = {
  cobalt: {
    "--ur-ink": "var(--accent-bright)",
    "--ur-fill": "var(--primary)",
    "--ur-on": "var(--primary-foreground)",
  },
  mint: {
    "--ur-ink": "var(--success)",
    "--ur-fill": "oklch(from var(--success) 0.74 c h)",
    "--ur-on": "oklch(from var(--success) 0.24 0.05 h)",
  },
  amber: {
    "--ur-ink": "var(--warn)",
    "--ur-fill": "oklch(from var(--warn) 0.8 0.13 h)",
    "--ur-on": "oklch(from var(--warn) 0.26 0.05 h)",
  },
  ink: {
    "--ur-ink": "var(--ink-2)",
    "--ur-fill": "var(--foreground)",
    "--ur-on": "var(--background)",
  },
};
const accentVars = (accent: string): React.CSSProperties =>
  ({
    ...(ACCENTS[accent as UpgradeRequestAccentName] ?? {
      "--ur-ink": accent,
      "--ur-fill": accent,
      "--ur-on": "var(--primary-foreground)",
    }),
    "--ur-wash": "color-mix(in oklab, var(--ur-ink) 9%, transparent)",
    "--ur-warm": "oklch(from var(--warn) 0.78 0.14 h)",
  }) as React.CSSProperties;

const CARD: Record<UpgradeRequestCardStyle, string> = {
  raised:
    "border border-hairline bg-popover shadow-sm dark:ring-1 dark:ring-hairline",
  outline: "border border-hairline-strong bg-transparent",
  tinted:
    "border border-[color-mix(in_oklab,var(--ur-ink)_28%,transparent)] bg-[var(--ur-wash)]",
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const EYEBROW =
  "font-mono text-[10px] leading-4 tracking-[0.08em] text-ink-3 uppercase";
const SECONDARY =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 border border-input bg-surface-1 px-3 text-[12px] font-medium whitespace-nowrap text-foreground transition-colors hover:bg-surface-2";

/** The envelope's drawn size; the card scales down onto it. */
const ENV_W = 96;
const ENV_H = 64;

/* ----------------------------------------------------------------------- */
/*                               Small parts                                */
/* ----------------------------------------------------------------------- */

/** A padlock whose shackle lifts and swings open about its left leg on snap. */
function LockGlyph({
  open,
  motionSafe,
  className,
}: {
  open: boolean;
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <motion.path
        d="M8 11V7a4 4 0 0 1 8 0v4"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        initial={false}
        animate={{ y: open ? -3 : 0, rotate: open ? -24 : 0 }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
        style={{ originX: 0, originY: 1 }}
      />
      <rect
        x={5}
        y={11}
        width={14}
        height={10}
        rx={2.5}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      />
    </svg>
  );
}

function Avatar({
  admin,
  size = 32,
}: {
  admin: UpgradeRequestAdmin;
  size?: number;
}) {
  const tint = admin.tint ?? DISCS[hash(admin.id) % DISCS.length] ?? DISCS[0];
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-medium text-foreground"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        backgroundColor: `color-mix(in oklab, ${tint} 22%, var(--card))`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${tint} 40%, transparent)`,
      }}
    >
      {initials(admin.name)}
    </span>
  );
}

/** The envelope: a body, its seams or border, and a flap that closes on snap. */
function Envelope({
  style,
  flap,
}: {
  style: UpgradeRequestEnvelopeStyle;
  flap: MotionValue<number>;
}) {
  const body =
    style === "airmail" ? (
      <span
        className="absolute inset-0 rounded-2 p-[3px]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, var(--ur-fill) 0 6px, transparent 6px 10px, var(--ur-warm) 10px 16px, transparent 16px 20px)",
        }}
      >
        <span className="block size-full rounded-[3px] bg-card" />
      </span>
    ) : (
      <span
        className={cn(
          "absolute inset-0 border border-hairline-strong bg-card",
          style === "plain" ? "rounded-3" : "rounded-2",
        )}
      />
    );
  return (
    <>
      {body}
      {style === "plain" ? (
        <span className="absolute top-1/2 left-1/2 -mt-2.5 -ml-2.5 size-5 rounded-full bg-[var(--ur-fill)] shadow-sm" />
      ) : (
        <svg
          viewBox={`0 0 ${ENV_W} ${ENV_H}`}
          className="absolute inset-0 size-full overflow-visible"
        >
          {/* The seams the flap folds down onto. */}
          <path
            d={`M 3 ${ENV_H - 3} L ${ENV_W / 2} ${ENV_H * 0.48} L ${ENV_W - 3} ${ENV_H - 3}`}
            fill="none"
            strokeWidth={1}
            className="stroke-hairline-strong"
          />
          <motion.path
            d={`M 2 2 L ${ENV_W / 2} ${ENV_H * 0.56} L ${ENV_W - 2} 2 Z`}
            strokeWidth={1}
            strokeLinejoin="round"
            className="fill-surface-2 stroke-hairline-strong"
            style={{ scaleY: flap, originX: 0.5, originY: 0 }}
          />
          <circle
            cx={ENV_W / 2}
            cy={ENV_H * 0.5}
            r={4}
            className="fill-[var(--ur-fill)]"
          />
        </svg>
      )}
    </>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

type Flight = "fold" | "fly" | null;

/**
 * A member's request for an upgrade they can't buy themselves: the feature
 * they reached for, locked under the plan that has it, the admins who can
 * approve it as a radiogroup, and a card with the plan and a note.
 *
 * The signature is the fold and flight. Send folds the request card into an
 * envelope — the card's contents fade while an envelope the colour of the
 * card scales down from the card's measured box on `springs.glide` and its
 * flap closes on `springs.snap` — then the envelope travels to the chosen
 * admin's avatar, x on glide and y on the slower `springs.drift` so the
 * path arcs, shrinking as it goes until the avatar takes it: the ring swells
 * on `springs.recoil` and a Pending chip lands beside it with the time
 * asked. The card's place glides to the pending summary's measured height.
 * Positions are measured against the surface, so it flies true inside any
 * scroller.
 *
 * Approved, the feature unlocks in place: the shackle lifts and swings open
 * on snap, the veil over the preview fades, and its rows come up in a
 * cascade. Declined, the admin's note is shown with a way to ask someone
 * else. Admins move with arrows, Home and End; focus moves to Remind once the
 * request lands. Under reduced motion nothing folds or flies — the card
 * cross-fades to the summary and the chip fades in.
 */
export function UpgradeRequest({
  admins = defaultUpgradeRequestAdmins,
  plan = defaultUpgradeRequestPlan,
  feature = defaultUpgradeRequestFeature,
  reason = DEFAULT_REASON,
  value: valueProp,
  defaultValue,
  onValueChange,
  request: requestProp,
  defaultRequest = null,
  onRequestChange,
  onRequest,
  onRemind,
  onOpenFeature,
  now = defaultUpgradeRequestNow,
  remindAfter = 15,
  maxNote = 280,
  status = "ready",
  onRetry,
  cardStyle = "raised",
  envelopeStyle = "classic",
  accent = "cobalt",
  formatTime = utcTime,
  maxHeight = 560,
  disabled = false,
  className,
}: UpgradeRequestProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const ready = status === "ready";

  /* -------------------------------- state -------------------------------- */

  const firstOnline =
    admins.find((a) => a.presence === "online")?.id ?? admins[0]?.id ?? "";
  const [ownValue, setOwnValue] = React.useState(defaultValue ?? firstOnline);
  const chosenId = valueProp ?? ownValue;
  const chosen = admins.find((a) => a.id === chosenId) ?? null;

  const [ownRequest, setOwnRequest] =
    React.useState<UpgradeRequestRecord | null>(defaultRequest);
  const record = requestProp === undefined ? ownRequest : requestProp;
  const asked = record ? admins.find((a) => a.id === record.adminId) : null;

  const [note, setNote] = React.useState(reason);
  const [sending, setSending] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [flight, setFlight] = React.useState<Flight>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const attempt = React.useRef(0);

  const unlocked = record?.status === "approved";
  const sinceRemind = record ? now - (record.remindedAt ?? record.at) : 0;
  const remindable =
    !!record &&
    record.status === "pending" &&
    (record.remindedAt === undefined || sinceRemind >= remindAfter * 60_000);

  const commitRecord = (next: UpgradeRequestRecord | null) => {
    if (requestProp === undefined) setOwnRequest(next);
    onRequestChange?.(next);
  };

  const choose = (id: string) => {
    if (record || disabled) return;
    if (valueProp === undefined) setOwnValue(id);
    onValueChange?.(id);
  };

  /* -------------------------------- flight ------------------------------- */

  const rootRef = React.useRef<HTMLElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const avatarRefs = React.useRef(new Map<string, HTMLElement>());
  const ex = useMotionValue(0);
  const ey = useMotionValue(0);
  const foldX = useMotionValue(1);
  const foldY = useMotionValue(1);
  const shrink = useMotionValue(1);
  // Fade in and fade out are separate values: a second animate() on one
  // value stops the first, even while the second still waits on its delay.
  const envIn = useMotionValue(0);
  const envOut = useMotionValue(1);
  const envOpacity = useTransform(() =>
    Number((envIn.get() * envOut.get()).toFixed(3)),
  );
  const flap = useMotionValue(-1);
  const scaleX = useTransform(() =>
    Number((foldX.get() * shrink.get()).toFixed(4)),
  );
  const scaleY = useTransform(() =>
    Number((foldY.get() * shrink.get()).toFixed(4)),
  );
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const timers = React.useRef<number[]>([]);

  const halt = React.useCallback(() => {
    for (const c of running.current) c.stop();
    running.current = [];
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);
  // A flight interrupted (a StrictMode rehearsal, a host answering early)
  // finishes rather than freezing: the chip simply arrives.
  const land = React.useCallback(() => {
    halt();
    envIn.jump(0);
    setFlight(null);
  }, [envIn, halt]);

  const fly = (adminId: string) => {
    const root = rootRef.current;
    const card = cardRef.current;
    const avatar = avatarRefs.current.get(adminId);
    if (!motionSafe || !root || !card || !avatar) {
      setFlight(null);
      return;
    }
    halt();
    const rb = root.getBoundingClientRect();
    const cb = card.getBoundingClientRect();
    const ab = avatar.getBoundingClientRect();
    const fromX = Math.round(cb.left - rb.left + cb.width / 2 - ENV_W / 2);
    const fromY = Math.round(cb.top - rb.top + cb.height / 2 - ENV_H / 2);
    const toX = Math.round(ab.left - rb.left + ab.width / 2 - ENV_W / 2);
    const toY = Math.round(ab.top - rb.top + ab.height / 2 - ENV_H / 2);
    ex.jump(fromX);
    ey.jump(fromY);
    foldX.jump(Number((cb.width / ENV_W).toFixed(4)));
    foldY.jump(Number((cb.height / ENV_H).toFixed(4)));
    shrink.jump(1);
    flap.jump(-1);
    envIn.jump(0);
    envOut.jump(1);
    setFlight("fold");
    const lift = 0.5;
    running.current = [
      // Beat one: the card becomes the envelope and folds down to size.
      animate(envIn, 1, { duration: durations.fast, ease: easings.enter }),
      animate(foldX, 1, springs.glide),
      animate(foldY, 1, springs.glide),
      animate(flap, 1, { ...springs.snap, delay: 0.24 }),
      // Beat two: it travels on an arc, y slower than x, and shrinks.
      animate(ex, toX, { ...springs.glide, delay: lift }),
      animate(ey, toY, { ...springs.drift, delay: lift }),
      animate(shrink, 0.3, { ...springs.glide, delay: lift + 0.08 }),
      animate(envOut, 0, {
        duration: durations.fast,
        ease: easings.exit,
        delay: lift + 0.4,
      }),
    ];
    timers.current = [
      window.setTimeout(() => setFlight("fly"), Math.round(lift * 1000)),
      window.setTimeout(
        () => {
          running.current = [];
          timers.current = [];
          setFlight(null);
        },
        Math.round((lift + 0.62) * 1000),
      ),
    ];
  };

  // Unmounting or a rehearsal mid-flight lands it.
  React.useEffect(() => () => land(), [land]);

  const send = () => {
    if (!chosen || disabled || sending || record || !ready) return;
    if (note.length > maxNote) {
      setFailure(`The note is ${note.length - maxNote} characters over.`);
      return;
    }
    const run = ++attempt.current;
    const admin = chosen;
    const text = note.trim();
    setSending(true);
    setFailure(null);
    const go = () => {
      if (attempt.current !== run) return;
      setSending(false);
      focusRemind.current = true;
      commitRecord({
        adminId: admin.id,
        note: text,
        at: now,
        status: "pending",
      });
      setAnnouncement(`Asked ${admin.name} at ${formatTime(now)}. Pending.`);
      fly(admin.id);
    };
    const result = onRequest?.({ admin, note: text });
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).then(go, (why: unknown) => {
        if (attempt.current !== run) return;
        const message =
          why instanceof Error && why.message
            ? why.message
            : "The request didn't send. Your note is still here.";
        setSending(false);
        setFailure(message);
        setAnnouncement(message);
      });
    } else {
      go();
    }
  };

  const remind = () => {
    if (!record || record.status !== "pending" || !remindable) return;
    const next = { ...record, remindedAt: now };
    commitRecord(next);
    onRemind?.(next);
    setAnnouncement(`Reminded ${asked?.name ?? "the admin"}.`);
  };

  const askElse = () => {
    if (!record) return;
    const others = admins.filter((a) => a.id !== record.adminId);
    const next = others.find((a) => a.presence === "online") ?? others[0];
    commitRecord(null);
    if (next) {
      if (valueProp === undefined) setOwnValue(next.id);
      onValueChange?.(next.id);
    }
    setAnnouncement(next ? `Choose who to ask. ${next.name} selected.` : "");
  };

  // Announce a host's answer once, when it arrives.
  const [seenStatus, setSeenStatus] = React.useState(record?.status ?? null);
  if ((record?.status ?? null) !== seenStatus) {
    setSeenStatus(record?.status ?? null);
    if (record?.status === "approved")
      setAnnouncement(
        `${asked?.name ?? "Your admin"} approved ${plan.name}. ${feature.name} is unlocked.`,
      );
    else if (record?.status === "declined")
      setAnnouncement(
        `${asked?.name ?? "Your admin"} declined. ${record.reply ?? ""}`.trim(),
      );
  }

  /* -------------------------------- focus -------------------------------- */

  const focusRemind = React.useRef(false);
  const [remindNode, setRemindNode] = React.useState<HTMLElement | null>(null);
  const bindRemind = React.useCallback((node: HTMLElement | null) => {
    if (node) setRemindNode(node);
  }, []);
  React.useEffect(() => {
    if (!remindNode || !focusRemind.current || !remindNode.isConnected) return;
    focusRemind.current = false;
    remindNode.focus({ preventScroll: true });
  }, [remindNode]);

  const adminKeys = (event: React.KeyboardEvent, i: number) => {
    let next = -1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight")
      next = (i + 1) % admins.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft")
      next = (i - 1 + admins.length) % admins.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = admins.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const a = admins[next];
    if (!a) return;
    choose(a.id);
    avatarRefs.current.get(a.id)?.closest("button")?.focus();
  };

  /* -------------------------------- render ------------------------------- */

  const over = note.length > maxNote;
  const chipShown = !!record && flight === null;
  const summaryShown = !!record && flight !== "fold";

  const versions = [
    { who: "Rae Okafor", what: "Edited Q3 roadmap", when: "Today 14:02" },
    { who: "Priya Raman", what: "Moved 4 cards to Later", when: "Tue 09:40" },
    { who: "Tomás Alves", what: "Renamed Launch to Beta", when: "Mon 17:15" },
    { who: "June Okafor", what: "Created Q3 roadmap", when: "2 Oct" },
  ];

  const featurePanel = (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="relative overflow-hidden rounded-3 border border-hairline bg-surface-1">
        <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2">
          <span className="truncate text-[12px] font-medium text-foreground">
            {feature.name}
          </span>
          <span
            className={cn(
              "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium transition-colors duration-300",
              unlocked
                ? "bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-success"
                : "bg-surface-2 text-ink-2",
            )}
          >
            <LockGlyph
              open={unlocked}
              motionSafe={motionSafe}
              className="size-3.5"
            />
            {unlocked ? "Unlocked" : `On ${plan.name}`}
          </span>
        </div>
        <ol aria-hidden className="flex flex-col px-3 py-2">
          {versions.map((v, i) => (
            <motion.li
              key={v.when}
              className={cn(
                "relative flex gap-2.5 py-1.5 pl-0.5",
                i >= 2 && "hidden @min-[36rem]:flex",
              )}
              initial={false}
              animate={{ opacity: unlocked ? 1 : 0.55 }}
              transition={{
                duration: durations.base,
                delay: unlocked ? i * cascade(versions.length) : 0,
              }}
            >
              <span className="relative flex w-2 shrink-0 justify-center pt-1.5">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    i === 0 ? "bg-[var(--ur-ink)]" : "bg-ink-3",
                  )}
                />
                {i < versions.length - 1 ? (
                  <span className="absolute top-4 -bottom-2 w-px bg-hairline-strong" />
                ) : null}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[12px] text-foreground">
                  {v.what}
                </span>
                <span className="truncate text-[11px] text-ink-3">
                  {v.who} · {v.when}
                </span>
              </span>
            </motion.li>
          ))}
        </ol>
        {/* The veil: a translucent wash so the history reads through it, lifted on approval. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-10 bottom-0 bg-[color-mix(in_oklab,var(--card)_55%,transparent)] backdrop-blur-[1.5px]"
          initial={false}
          animate={{ opacity: unlocked ? 0 : 1 }}
          transition={{ duration: durations.slow, ease: easings.enter }}
        />
      </div>
      <p className="text-[12px] leading-4 text-ink-2">
        <span className="sr-only">
          {unlocked
            ? `${feature.name} is unlocked. `
            : `${feature.name} needs ${plan.name}. `}
        </span>
        {feature.description}
      </p>
      {unlocked ? (
        <motion.div
          initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            motionSafe
              ? { y: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          <button
            type="button"
            onClick={onOpenFeature}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 bg-[var(--ur-fill)] px-3 text-[12px] font-medium text-[var(--ur-on)] transition-colors hover:bg-[color-mix(in_oklab,var(--ur-fill)_88%,var(--foreground))]",
              FOCUS,
            )}
          >
            Open {feature.name.toLowerCase()}
          </button>
        </motion.div>
      ) : null}
    </div>
  );

  const adminList = (() => {
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-2 rounded-3 border border-hairline px-4 py-6 text-center">
          <TriangleAlert aria-hidden className="size-4 text-danger" />
          <p className="text-[13px] text-foreground">
            The admins didn&apos;t load.
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(SECONDARY, FOCUS)}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      );
    }
    if (status === "loading") {
      return (
        <div aria-busy="true" className="flex flex-col gap-1.5">
          <span className="sr-only">Loading admins.</span>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              aria-hidden
              className="h-12 rounded-3 bg-surface-2 motion-safe:animate-pulse"
            />
          ))}
        </div>
      );
    }
    return (
      <div
        role="radiogroup"
        aria-labelledby={`${uid}-who`}
        aria-disabled={!!record || disabled || undefined}
        className="flex flex-col gap-1"
      >
        {admins.map((a, i) => {
          const checked = a.id === chosenId;
          const presence =
            PRESENCE[a.presence ?? "offline"] ?? PRESENCE.offline;
          const isAsked = record?.adminId === a.id;
          const chip = isAsked && chipShown;
          const chipText = record
            ? record.status === "approved"
              ? "Approved"
              : record.status === "declined"
                ? "Declined"
                : `Pending · ${formatTime(record.at)}`
            : "";
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`${a.name}, ${a.role}, ${presence.words}${chip ? `, ${chipText}` : ""}`}
              tabIndex={checked ? 0 : -1}
              onClick={() => choose(a.id)}
              onKeyDown={(event) => adminKeys(event, i)}
              className={cn(
                "relative flex items-center gap-3 rounded-3 px-2.5 py-1.5 text-left transition-colors",
                FOCUS,
                !checked && !record && "hover:bg-surface-2",
                record && !isAsked && "opacity-60",
              )}
            >
              {checked ? (
                <motion.span
                  layoutId={`${uid}-who`}
                  aria-hidden
                  className="absolute inset-0 rounded-[inherit] bg-[var(--ur-wash)] ring-1 ring-[color-mix(in_oklab,var(--ur-ink)_35%,transparent)] ring-inset"
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}
              <span
                ref={(node) => {
                  if (node) avatarRefs.current.set(a.id, node);
                  else avatarRefs.current.delete(a.id);
                }}
                className="relative shrink-0"
              >
                <Avatar admin={a} />
                {/* The avatar takes the envelope: its ring lands on recoil. */}
                {chip ? (
                  <motion.span
                    aria-hidden
                    className="absolute -inset-[3px] rounded-full border-2 border-[var(--ur-ink)]"
                    initial={{ scale: motionSafe ? 1.4 : 1, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={
                      motionSafe
                        ? {
                            scale: springs.recoil,
                            opacity: { duration: durations.fast },
                          }
                        : { duration: durations.fast }
                    }
                  />
                ) : null}
                <span
                  aria-hidden
                  className={cn(
                    "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-card",
                    presence.dot,
                  )}
                />
              </span>
              <span
                aria-hidden
                className="relative flex min-w-0 flex-1 flex-col"
              >
                <span className="truncate text-[13px] leading-5 font-medium text-foreground">
                  {a.name}
                </span>
                <span className="truncate text-[11px] leading-4 text-ink-3">
                  {a.role} · {presence.words}
                </span>
              </span>
              {/* Chips stack in one cell, so a status change cross-fades in place. */}
              <span className="relative inline-grid shrink-0 justify-items-end">
                <AnimatePresence initial={false}>
                  {chip ? (
                    <motion.span
                      key={chipText}
                      aria-hidden
                      className={cn(
                        "inline-flex h-6 items-center gap-1 rounded-full px-2 font-mono text-[10px] whitespace-nowrap tabular-nums [grid-area:1/1]",
                        record?.status === "approved"
                          ? "bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-success"
                          : record?.status === "declined"
                            ? "bg-surface-2 text-ink-2"
                            : "bg-[var(--ur-wash)] text-[var(--ur-ink)]",
                      )}
                      // A pending or approved chip lands on recoil; a decline
                      // only fades — it is not news to celebrate.
                      initial={{
                        opacity: 0,
                        scale:
                          motionSafe && record?.status !== "declined" ? 0.6 : 1,
                      }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={
                        motionSafe
                          ? {
                              scale: springs.recoil,
                              opacity: { duration: durations.fast },
                            }
                          : { duration: durations.fast }
                      }
                    >
                      {chipText}
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </span>
            </button>
          );
        })}
      </div>
    );
  })();

  const card = (
    <motion.div
      ref={cardRef}
      className={cn(
        "flex flex-col gap-2.5 rounded-3 p-3.5",
        CARD[cardStyle] ?? CARD.raised,
      )}
      initial={false}
      animate={{ opacity: flight === "fold" ? 0 : 1 }}
      transition={{ duration: durations.fast }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-[13px] font-semibold text-foreground">
          {plan.name}
        </span>
        <span className="text-[12px] text-ink-2">{plan.price}</span>
      </div>
      <ul
        role="list"
        aria-label={`${plan.name} adds`}
        className="flex flex-wrap gap-1.5"
      >
        {plan.adds.map((add) => (
          <li
            key={add}
            className="inline-flex h-6 items-center gap-1 rounded-full border border-hairline px-2 text-[11px] text-ink-2"
          >
            <Check aria-hidden className="size-3 text-[var(--ur-ink)]" />
            {add}
          </li>
        ))}
      </ul>
      <label className="flex flex-col gap-1.5 text-[12px] text-ink-2">
        <span className="flex items-baseline justify-between gap-2">
          <span>Note to {chosen ? firstName(chosen.name) : "your admin"}</span>
          <span
            id={`${uid}-count`}
            className={cn(
              "font-mono text-[10px] tabular-nums",
              over ? "text-danger" : "text-ink-3",
            )}
          >
            {note.length}/{maxNote}
          </span>
        </span>
        <textarea
          value={note}
          rows={2}
          disabled={disabled}
          aria-describedby={`${uid}-count`}
          aria-invalid={over || undefined}
          onChange={(event) => {
            const v = event.currentTarget.value;
            setNote(v);
            if (failure) setFailure(null);
          }}
          className={cn(
            "w-full resize-none rounded-2 border border-input bg-surface-0 px-3 py-2 text-[13px] leading-5 text-foreground placeholder:text-ink-3",
            "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 text-[11px] leading-4 text-ink-3">
          {chosen
            ? `${firstName(chosen.name)} ${(PRESENCE[chosen.presence ?? "offline"] ?? PRESENCE.offline).answers}`
            : "Choose who to ask"}
        </span>
        <button
          type="button"
          onClick={send}
          aria-disabled={disabled || !chosen || over || !ready || undefined}
          aria-busy={sending || undefined}
          className={cn(
            "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-2 bg-[var(--ur-fill)] px-3.5 text-[13px] font-medium whitespace-nowrap text-[var(--ur-on)] transition-[background-color,opacity,translate] hover:bg-[color-mix(in_oklab,var(--ur-fill)_88%,var(--foreground))] active:translate-y-px @max-[30rem]:basis-full",
            FOCUS,
            (disabled || !chosen || over || !ready) && "opacity-60",
          )}
        >
          <Send aria-hidden className="size-3.5" />
          {sending
            ? "Sending…"
            : `Ask ${chosen ? firstName(chosen.name) : "admin"}`}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {failure ? (
          <motion.p
            key="failure"
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{
              opacity: 0,
              height: 0,
              transition: exitFor(durations.fast),
            }}
            transition={
              motionSafe
                ? {
                    height: springs.glide,
                    opacity: { duration: durations.fast },
                  }
                : { duration: 0 }
            }
            className="flex items-start gap-2 overflow-hidden text-[12px] leading-4 text-danger"
          >
            <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
            {failure}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );

  const summary = record ? (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-3 p-3.5",
        CARD[cardStyle] ?? CARD.raised,
      )}
    >
      {record.status === "pending" ? (
        <>
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--ur-wash)] text-[var(--ur-ink)]"
            >
              <Send className="size-3.5" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-[13px] leading-5 font-medium text-foreground">
                Waiting on {asked ? firstName(asked.name) : "your admin"}
              </p>
              <p className="text-[12px] leading-4 text-ink-3">
                Asked at {formatTime(record.at)}
                {record.remindedAt !== undefined
                  ? ` · reminded at ${formatTime(record.remindedAt)}`
                  : ""}
              </p>
            </div>
          </div>
          {record.note ? (
            <p className="line-clamp-2 border-l-2 border-hairline-strong pl-3 text-[12px] leading-4 text-ink-2">
              {record.note}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button
              ref={bindRemind}
              type="button"
              onClick={remind}
              aria-disabled={!remindable || undefined}
              className={cn(SECONDARY, FOCUS, !remindable && "opacity-60")}
            >
              <BellRing aria-hidden className="size-3.5" />
              {remindable
                ? `Remind ${asked ? firstName(asked.name) : ""}`.trim()
                : "Reminded"}
            </button>
            {!remindable ? (
              <span className="text-[11px] text-ink-3">
                You can nudge again in {remindAfter} min.
              </span>
            ) : null}
          </div>
        </>
      ) : record.status === "approved" ? (
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--ur-fill)] text-[var(--ur-on)]"
          >
            <Check className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-[13px] leading-5 font-medium text-foreground">
              {asked ? firstName(asked.name) : "Your admin"} approved{" "}
              {plan.name}
            </p>
            <p className="text-[12px] leading-4 text-ink-3">
              {record.reply ?? `${feature.name} is ready to use.`}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3">
            {asked ? <Avatar admin={asked} /> : null}
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-[13px] leading-5 font-medium text-foreground">
                {asked ? firstName(asked.name) : "Your admin"} said not yet
              </p>
              <blockquote className="border-l-2 border-hairline-strong pl-3 text-[12px] leading-4 text-ink-2">
                {record.reply ?? "No note was left."}
              </blockquote>
            </div>
          </div>
          <div>
            <button
              type="button"
              onClick={askElse}
              className={cn(SECONDARY, FOCUS)}
            >
              Ask someone else
            </button>
          </div>
        </>
      )}
    </div>
  ) : null;

  // The request area's height follows whichever card is showing, measured.
  const [areaNode, setAreaNode] = React.useState<HTMLDivElement | null>(null);
  const [areaHeight, setAreaHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!areaNode) return;
    const read = () => setAreaHeight(Math.round(areaNode.offsetHeight));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(areaNode);
    return () => ro.disconnect();
  }, [areaNode]);

  return (
    <section
      ref={rootRef}
      aria-labelledby={`${uid}-title`}
      className={cn(
        "@container relative flex w-full max-w-3xl flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{ ...accentVars(accent), maxHeight }}
    >
      <div className="[scrollbar-width:thin] overflow-y-auto overscroll-contain">
        <div className="grid grid-cols-1 gap-5 p-4 @min-[36rem]:grid-cols-[15.5rem_minmax(0,1fr)] @min-[36rem]:p-5">
          <div className="flex min-w-0 flex-col gap-1 @min-[36rem]:col-span-2">
            <p className={EYEBROW}>Fieldline · Upgrade</p>
            <h2
              id={`${uid}-title`}
              className="text-base leading-6 font-semibold"
            >
              {unlocked
                ? `${feature.name} is unlocked`
                : `${feature.name} is on ${plan.name}`}
            </h2>
            <p className="text-[12px] leading-4 text-ink-3">
              {unlocked
                ? `${plan.name} is on for the workspace.`
                : "You can't change the plan yourself. Ask an admin and they'll get your note."}
            </p>
          </div>
          {featurePanel}
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <h3 id={`${uid}-who`} className={EYEBROW}>
                Who to ask
              </h3>
              {adminList}
            </div>
            <motion.div
              className="-m-1 overflow-hidden"
              initial={false}
              animate={{ height: areaHeight ?? "auto" }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            >
              <div ref={setAreaNode} className="p-1">
                {summaryShown ? (
                  <motion.div
                    initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={
                      motionSafe
                        ? {
                            y: springs.glide,
                            opacity: { duration: durations.base },
                          }
                        : { duration: durations.fast }
                    }
                  >
                    {summary}
                  </motion.div>
                ) : ready ? (
                  card
                ) : null}
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* The envelope flies over everything, outside the scroller. It stays
          mounted, so its motion values are bound before a flight starts. */}
      <motion.div
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-0 left-0 z-20",
          flight === null && "invisible",
        )}
        style={{
          width: ENV_W,
          height: ENV_H,
          x: ex,
          y: ey,
          scaleX,
          scaleY,
          opacity: envOpacity,
        }}
      >
        <Envelope style={envelopeStyle} flap={flap} />
      </motion.div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
