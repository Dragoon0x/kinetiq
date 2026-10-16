"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ArrowLeft,
  CircleAlert,
  Clock,
  Lock,
  Mail,
  UsersRound,
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

export type InviteAcceptSide = "front" | "back";
export type InviteAcceptCardStyle = "plain" | "ticket" | "pass";
export type InviteAcceptFlipAxis = "y" | "x";
export type InviteAcceptStatus = "ready" | "loading" | "error";

export type InviteDetails = {
  inviter: { name: string; email?: string };
  workspace: { name: string; members?: number; href?: string };
  /** The role the invite grants; it carries across to the form as a chip. */
  role: string;
  /** What the role can and can't do, a line each, listed under it. */
  roleSummary?: string[];
  /** The invitee's address — the account will be made with it. */
  email: string;
  /** The invitee's name, if the inviter typed one; it prefills the form. */
  name?: string;
  /** A personal line from the inviter. */
  note?: string;
  /** When it was sent, ms since the epoch. */
  sentAt: number;
  /** When it stops working, ms since the epoch. */
  expiresAt: number;
};

/** What the form hands to `onAccept`. */
export type InviteAcceptDetails = {
  name: string;
  email: string;
  password: string;
  role: string;
};

/** An `onAccept` rejection can point at the field it was about. */
export type InviteAcceptError = Error & { field?: "name" | "password" };

export type InviteAcceptProps = {
  /** The invitation. @default defaultInvite */
  invite?: InviteDetails;
  /** The moment expiry counts from, ms since the epoch. @default defaultInviteNow */
  now?: number;
  /** Controlled: which face of the card is up. */
  side?: InviteAcceptSide;
  /** Initial face when uncontrolled. @default "front" */
  defaultSide?: InviteAcceptSide;
  /** Fires from the Accept, Back or Escape that turned the card. */
  onSideChange?: (side: InviteAcceptSide) => void;
  /** The form was sent. Return a promise to hold it pending; a rejection keeps the form with its message (or under the `field` it names). */
  onAccept?: (details: InviteAcceptDetails) => void | Promise<void>;
  /** Decline was pressed. */
  onDecline?: (invite: InviteDetails) => void;
  /** "Sign in" was chosen instead, with the invite's address. */
  onSignIn?: (email: string) => void;
  /** A new invite was asked for (after expiry or a decline). */
  onRequestNew?: (invite: InviteDetails) => void;
  /** Whether the invite has loaded: a skeleton while loading, a broken-link card on error. @default "ready" */
  status?: InviteAcceptStatus;
  /** The shortest password the form accepts. @default 10 */
  passwordMinLength?: number;
  /** The card's make: a plain card, a ticket with a perforated stub, or a pass with a coloured band. @default "plain" */
  cardStyle?: InviteAcceptCardStyle;
  /** The axis the card turns about: sideways (y) or top over bottom (x). @default "y" */
  flipAxis?: InviteAcceptFlipAxis;
  /** The workspace mark, the primary buttons, the pass band, the role chip and the checks. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Every action is unavailable. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;

/** A fixed morning, so the default invite renders the same everywhere. */
export const defaultInviteNow = Date.UTC(2026, 9, 14, 9, 30);

export const defaultInvite: InviteDetails = {
  inviter: { name: "Mara Lindqvist", email: "mara@basinworks.io" },
  workspace: { name: "Basinworks", members: 12, href: "#basinworks" },
  role: "Editor",
  roleSummary: [
    "Edit surveys, maps and field notes",
    "Invite teammates as viewers",
    "No access to billing or payouts",
  ],
  email: "theo.barros@fieldline.dev",
  name: "Theo Barros",
  note: "We're moving the river survey here; your transect notes would help.",
  sentAt: defaultInviteNow - DAY,
  expiresAt: defaultInviteNow + 6 * DAY,
};

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const FIELD =
  "h-9 w-full rounded-2 border bg-surface-0 px-3 text-[13px] text-foreground transition-colors placeholder:text-ink-3 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid";
/** Where the ticket's perforation sits, from the bottom. */
const STUB = 60;
/** The card's viewing distance, in px. */
const PERSPECTIVE = 1600;

const r3 = (v: number) => Math.round(v * 1000) / 1000;

const initials = (name: string) => {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    const word = parts[0] ?? "";
    return (word[0]?.toUpperCase() ?? "") + (word[1] ?? "");
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
};

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** "Expires in 6 days", "expired 2 days ago" — from `now`, never the clock. */
const expiry = (expiresAt: number, now: number) => {
  const left = expiresAt - now;
  if (left > 0) {
    if (left < DAY) {
      const h = Math.max(1, Math.round(left / 3_600_000));
      return `Expires in ${plural(h, "hour", "hours")}`;
    }
    return `Expires in ${plural(Math.ceil(left / DAY), "day", "days")}`;
  }
  const ago = Math.floor(-left / DAY);
  if (ago === 0) return "expired today";
  if (ago === 1) return "expired yesterday";
  return `expired ${ago} days ago`;
};

/** A short code printed on the ticket's stub, hashed from the workspace. */
const inviteCode = (seed: string) => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  }
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += alphabet[(h >>> (i * 5)) % alphabet.length] ?? "X";
  }
  return `${initials(seed) || "IN"}-${out}`;
};

/** Sums layout offsets up to `root`: transforms never move these. */
const offsetIn = (el: HTMLElement | null, root: HTMLElement | null) => {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return node === root ? { x, y } : null;
};

/* ----------------------------------------------------------------------- */
/*                                  Parts                                   */
/* ----------------------------------------------------------------------- */

function RoleChip({
  role,
  className,
  chipRef,
  style,
}: {
  role: string;
  className?: string;
  chipRef?: React.Ref<HTMLSpanElement>;
  style?: React.ComponentProps<typeof motion.span>["style"];
}) {
  return (
    <motion.span
      ref={chipRef}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--ia-accent)_38%,transparent)] bg-[color-mix(in_oklab,var(--ia-accent)_12%,var(--card))] px-2.5 text-[12px] leading-none font-medium whitespace-nowrap text-[var(--ia-accent)]",
        className,
      )}
      style={style}
    >
      <UsersRound aria-hidden className="size-3.5 shrink-0" />
      {role}
    </motion.span>
  );
}

function WorkspaceMark({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-3 font-mono font-semibold text-[var(--ia-on)]"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.32),
        backgroundColor: "var(--ia-accent)",
        backgroundImage:
          "linear-gradient(135deg, color-mix(in oklab, white 18%, transparent), transparent 55%), repeating-linear-gradient(-45deg, transparent 0 5px, color-mix(in oklab, black 8%, transparent) 5px 6px)",
      }}
    >
      {initials(name)}
    </span>
  );
}

function Check({
  motionSafe,
  className,
}: {
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={cn("size-4", className)}>
      <motion.path
        d="M3.5 8.5l3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: motionSafe ? 0 : 1 }}
        animate={{ pathLength: 1 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      />
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

type FrontState = "invite" | "declined" | "requested";
type FieldErrors = { name?: string; password?: string };

/**
 * An invitation landing: the invite is a card on a quiet backdrop — the
 * workspace, who asked, a personal line, the role and when it lapses.
 *
 * Accept turns the card over about `flipAxis` on `springs.snap` — one crisp
 * overshoot, a card actually turning — its scale dipping with the sine of
 * the angle so the perspective never grows it past its own box. The role
 * chip does not turn with it: it lifts off on flick, travels flat from its
 * slot on the front to its slot on the back on `springs.glide`, and lands on
 * snap — the role carries across to the sign-up form on the back, where the
 * name and email are already filled in from the invite and the fields
 * arrive in a cascade.
 *
 * The form is real: labels, autocomplete, Enter submits, errors stay under
 * their fields and the first one takes focus; a rejected `onAccept` keeps the
 * form with its message. An expired invite offers to ask again; a declined
 * one says so. Escape on the back turns the card back. Under reduced motion
 * the faces cross-fade and the chip simply appears in its new place.
 */
export function InviteAccept({
  invite = defaultInvite,
  now = defaultInviteNow,
  side: sideProp,
  defaultSide = "front",
  onSideChange,
  onAccept,
  onDecline,
  onSignIn,
  onRequestNew,
  status = "ready",
  passwordMinLength = 10,
  cardStyle = "plain",
  flipAxis = "y",
  accent = "var(--accent-bright)",
  disabled = false,
  className,
}: InviteAcceptProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const ids = {
    front: `${uid}-front`,
    back: `${uid}-back`,
    name: `${uid}-name`,
    email: `${uid}-email`,
    password: `${uid}-password`,
    nameMsg: `${uid}-name-msg`,
    emailMsg: `${uid}-email-msg`,
    passwordMsg: `${uid}-password-msg`,
    formError: `${uid}-form-error`,
  };

  const [ownSide, setOwnSide] = React.useState<InviteAcceptSide>(defaultSide);
  const side = sideProp ?? ownSide;
  const [front, setFront] = React.useState<FrontState>("invite");
  const [name, setName] = React.useState(invite.name ?? "");
  const [password, setPassword] = React.useState("");
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [joined, setJoined] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");

  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const frontChipRef = React.useRef<HTMLSpanElement | null>(null);
  const backChipRef = React.useRef<HTMLSpanElement | null>(null);
  const acceptRef = React.useRef<HTMLButtonElement | null>(null);
  const nameRef = React.useRef<HTMLInputElement | null>(null);
  const passwordRef = React.useRef<HTMLInputElement | null>(null);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const focusAfter = React.useRef(false);
  const attempt = React.useRef(0);
  const sectionRef = React.useRef<HTMLElement | null>(null);
  // Whatever replaces a pressed control takes focus when it arrives, so a
  // decline, a request or a join never drops focus to the page.
  const focusArrival = React.useRef(false);
  const [arrival, setArrival] = React.useState<HTMLElement | null>(null);
  const keepFocus = () => {
    const root = sectionRef.current;
    const active = document.activeElement;
    focusArrival.current = Boolean(root && active && root.contains(active));
  };
  React.useEffect(() => {
    if (!arrival || !focusArrival.current) return;
    focusArrival.current = false;
    arrival.focus({ preventScroll: true });
  }, [arrival]);

  const turn = useMotionValue(side === "back" ? 180 : 0);
  // How far the card shrinks when edge-on: half the turning dimension over
  // the perspective — exactly what the nearer edge grows by — measured as
  // each turn starts, so a tall card turned top over bottom fits as well.
  const dipBy = useMotionValue(0.1);
  const dip = useTransform([turn, dipBy], ([t, k]) =>
    r3(1 - (k as number) * Math.abs(Math.sin(((t as number) * Math.PI) / 180))),
  );
  const flyX = useMotionValue(0);
  const flyY = useMotionValue(0);
  const flyScale = useMotionValue(1);
  const flyOpacity = useMotionValue(0);
  const frontChipOpacity = useMotionValue(side === "front" ? 1 : 0);
  const backChipOpacity = useMotionValue(side === "back" ? 1 : 0);

  const expired = invite.expiresAt <= now;
  const lapse = expiry(invite.expiresAt, now);
  const inviter = firstName(invite.inviter.name);
  const workspace = invite.workspace.name;

  React.useEffect(
    () => () => {
      for (const c of running.current) c.stop();
      running.current = [];
      attempt.current += 1;
    },
    [],
  );

  const focusFace = React.useCallback((to: InviteAcceptSide) => {
    if (!focusAfter.current) return;
    focusAfter.current = false;
    if (to === "back") {
      const target = nameRef.current?.value
        ? passwordRef.current
        : nameRef.current;
      target?.focus({ preventScroll: true });
    } else {
      acceptRef.current?.focus({ preventScroll: true });
    }
  }, []);

  // The turn and the carried chip follow the face, whoever changed it.
  const shown = React.useRef(side);
  React.useLayoutEffect(() => {
    if (shown.current === side) return;
    shown.current = side;
    for (const c of running.current) c.stop();
    running.current = [];
    const target = side === "back" ? 180 : 0;
    const landing = side === "back" ? backChipOpacity : frontChipOpacity;
    const leaving = side === "back" ? frontChipOpacity : backChipOpacity;
    if (!motionSafe) {
      turn.jump(target);
      leaving.jump(0);
      landing.jump(1);
      flyOpacity.jump(0);
      focusFace(side);
      return;
    }
    const wrap = wrapRef.current;
    if (wrap) {
      const depth =
        (flipAxis === "x" ? wrap.offsetHeight : wrap.offsetWidth) / 2;
      dipBy.jump(Math.min(0.3, Math.max(0.04, depth / PERSPECTIVE)));
    }
    // A turn reversed mid-flight sends the chip back from where it is.
    const from =
      flyOpacity.get() > 0
        ? { x: flyX.get(), y: flyY.get() }
        : offsetIn(
            side === "back" ? frontChipRef.current : backChipRef.current,
            wrap,
          );
    const to = offsetIn(
      side === "back" ? backChipRef.current : frontChipRef.current,
      wrap,
    );
    running.current.push(
      animate(turn.get(), target, {
        ...springs.snap,
        onUpdate: (v) => turn.set(v),
        onComplete: () => focusFace(side),
      }),
    );
    if (!from || !to) {
      leaving.jump(0);
      landing.jump(1);
      return;
    }
    // The chip stays flat while the card turns under it.
    flyX.jump(from.x);
    flyY.jump(from.y);
    flyScale.jump(1);
    flyOpacity.jump(1);
    leaving.jump(0);
    landing.jump(0);
    running.current.push(
      animate(flyScale, 1.08, springs.flick),
      animate(flyX, to.x, springs.glide),
      animate(flyY, to.y, {
        ...springs.glide,
        onComplete: () => {
          running.current.push(animate(flyScale, 1, springs.snap));
          landing.jump(1);
          flyOpacity.jump(0);
        },
      }),
    );
  }, [
    backChipOpacity,
    dipBy,
    flipAxis,
    flyOpacity,
    flyScale,
    flyX,
    flyY,
    focusFace,
    frontChipOpacity,
    motionSafe,
    side,
    turn,
  ]);

  const setSide = (next: InviteAcceptSide) => {
    if (next === side) return;
    focusAfter.current = true;
    if (sideProp === undefined) setOwnSide(next);
    onSideChange?.(next);
    setAnnouncement(
      next === "back"
        ? `Create your account. Your ${invite.name ? "name and email are" : "email is"} filled in from the invite.`
        : `Invite to ${workspace}.`,
    );
  };

  const decline = () => {
    if (disabled) return;
    keepFocus();
    setFront("declined");
    setAnnouncement(`You declined the invite to ${workspace}.`);
    onDecline?.(invite);
  };

  const requestNew = () => {
    if (disabled) return;
    keepFocus();
    setFront("requested");
    setAnnouncement(`Asked ${inviter} for a new invite.`);
    onRequestNew?.(invite);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending || disabled) return;
    const next: FieldErrors = {};
    if (!name.trim()) next.name = "Enter your name.";
    if (password.length < passwordMinLength) {
      next.password = `Use at least ${passwordMinLength} characters.`;
    }
    setErrors(next);
    setFormError(null);
    if (next.name || next.password) {
      (next.name ? nameRef : passwordRef).current?.focus();
      setAnnouncement(next.name ?? next.password ?? "");
      return;
    }
    const run = ++attempt.current;
    const details = {
      name: name.trim(),
      email: invite.email,
      password,
      role: invite.role,
    };
    const done = () => {
      if (run !== attempt.current) return;
      keepFocus();
      setPending(false);
      setJoined(true);
      setAnnouncement(`You joined ${workspace} as ${invite.role}.`);
    };
    const result = onAccept?.(details);
    if (result && typeof (result as Promise<void>).then === "function") {
      setPending(true);
      setAnnouncement(`Joining ${workspace}.`);
      (result as Promise<void>).then(done, (reason: unknown) => {
        if (run !== attempt.current) return;
        setPending(false);
        const err = reason as InviteAcceptError | undefined;
        const message =
          err instanceof Error && err.message
            ? err.message
            : `${workspace} didn't answer. Your details are still here.`;
        if (err?.field) {
          setErrors({ [err.field]: message });
          (err.field === "name" ? nameRef : passwordRef).current?.focus();
        } else {
          setFormError(message);
        }
        setAnnouncement(message);
      });
    } else {
      done();
    }
  };

  /* ------------------------------ drawing ------------------------------ */

  const vars = {
    "--ia-accent": accent,
    "--ia-on": `oklch(from ${accent} clamp(0, (0.7 - l) * 100, 1) 0 0)`,
  } as React.CSSProperties;
  const primary = cn(
    "inline-flex h-9 items-center justify-center gap-2 rounded-2 bg-[var(--ia-accent)] px-4 text-[13px] font-medium text-[var(--ia-on)] transition-[background-color,opacity] hover:bg-[color-mix(in_oklab,var(--ia-accent)_88%,black)]",
    FOCUS,
    disabled && "cursor-not-allowed opacity-50",
  );
  const quiet = cn(
    "inline-flex h-9 items-center justify-center rounded-2 border border-input bg-surface-1 px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-2",
    FOCUS,
    disabled && "cursor-not-allowed opacity-50",
  );
  const link = cn(
    "rounded-1 font-medium text-foreground underline-offset-2 hover:underline",
    FOCUS,
  );
  const ticketMask =
    cardStyle === "ticket"
      ? `radial-gradient(circle 10px at 0 calc(100% - ${STUB}px), transparent 9.5px, black 10px) left / 51% 100% no-repeat, radial-gradient(circle 10px at 100% calc(100% - ${STUB}px), transparent 9.5px, black 10px) right / 51% 100% no-repeat`
      : undefined;
  const face =
    "relative flex min-w-0 flex-col overflow-hidden rounded-4 border border-hairline bg-card text-card-foreground shadow-raised [grid-area:1/1]";
  const axis = flipAxis === "x" ? "rotateX" : "rotateY";
  const backTransform = motionSafe ? `${axis}(180deg)` : undefined;
  const reveal = (i: number) =>
    side === "back"
      ? {
          opacity: 1,
          y: 0,
          transition: motionSafe
            ? {
                y: { ...springs.glide, delay: 0.16 + i * cascade(5) },
                opacity: {
                  duration: durations.base,
                  ease: easings.enter,
                  delay: 0.16 + i * cascade(5),
                },
              }
            : { duration: durations.fast },
        }
      : { opacity: 0, y: motionSafe ? distances.nudge : 0 };

  const meta = (
    <span className="inline-flex items-center gap-1.5 text-[12px] leading-4 text-ink-3">
      <Clock aria-hidden className="size-3.5 shrink-0" />
      <span className={cn(expired && "text-warn")}>
        {expired ? `This invite ${lapse}` : lapse}
      </span>
    </span>
  );

  const frontBody =
    front === "declined" ? (
      <motion.div
        key="declined"
        className="flex flex-col gap-3"
        initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          motionSafe
            ? { y: springs.glide, opacity: { duration: durations.base } }
            : { duration: durations.fast }
        }
      >
        <p className="text-[14px] leading-5 font-semibold">You declined</p>
        <p className="text-[13px] leading-5 text-ink-2">
          {inviter} will see that you passed on {workspace}. If that was a slip,
          ask for a new invite.
        </p>
        <button
          ref={setArrival}
          type="button"
          onClick={requestNew}
          aria-disabled={disabled || undefined}
          className={cn(quiet, "self-start")}
        >
          Ask {inviter} again
        </button>
      </motion.div>
    ) : front === "requested" ? (
      <motion.div
        key="requested"
        className="flex flex-col gap-2"
        initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          motionSafe
            ? { y: springs.glide, opacity: { duration: durations.base } }
            : { duration: durations.fast }
        }
      >
        <p
          ref={setArrival}
          tabIndex={-1}
          className={cn(
            "inline-flex items-center gap-2 self-start rounded-1 text-[14px] leading-5 font-semibold",
            FOCUS,
          )}
        >
          <span className="flex size-5 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--success)_16%,transparent)] text-success">
            <Check motionSafe={motionSafe} className="size-3.5" />
          </span>
          Request sent
        </p>
        <p className="text-[13px] leading-5 text-ink-2">
          {inviter} will get an email asking to invite {invite.email} again.
        </p>
      </motion.div>
    ) : expired ? (
      <div className="flex flex-col gap-3">
        <p className="flex items-start gap-2 rounded-2 bg-[color-mix(in_oklab,var(--warn)_10%,transparent)] px-3 py-2 text-[13px] leading-5 text-warn">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          This invite {lapse}. Invites last a week, so {inviter} will need to
          send a new one.
        </p>
        <button
          type="button"
          onClick={requestNew}
          aria-disabled={disabled || undefined}
          className={cn(primary, "w-full")}
        >
          Ask {inviter} for a new invite
        </button>
      </div>
    ) : (
      <div className="flex flex-col gap-2 @min-[24rem]:flex-row">
        <button
          ref={acceptRef}
          type="button"
          onClick={() => {
            if (!disabled) setSide("back");
          }}
          aria-disabled={disabled || undefined}
          className={cn(primary, "@min-[24rem]:flex-1")}
        >
          Accept invite
        </button>
        <button
          type="button"
          onClick={decline}
          aria-disabled={disabled || undefined}
          className={quiet}
        >
          Decline
        </button>
      </div>
    );

  const frontFace = (
    <div
      role="group"
      aria-labelledby={ids.front}
      inert={side !== "front"}
      className={face}
      style={{
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        mask: ticketMask,
        WebkitMask: ticketMask,
        opacity: motionSafe ? 1 : side === "front" ? 1 : 0,
        transition: motionSafe ? undefined : "opacity 160ms linear",
        zIndex: side === "front" ? 1 : 0,
      }}
    >
      {cardStyle === "pass" ? (
        <div
          className="flex items-center gap-3 px-5 py-4 text-[var(--ia-on)]"
          style={{
            backgroundColor: "var(--ia-accent)",
            backgroundImage:
              "linear-gradient(120deg, color-mix(in oklab, white 14%, transparent), transparent 60%)",
          }}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-3 border border-[color-mix(in_oklab,var(--ia-on)_30%,transparent)] font-mono text-[13px] font-semibold">
            {initials(workspace)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] leading-5 font-semibold">
              {workspace}
            </span>
            <span className="font-mono text-[10px] tracking-[0.08em] uppercase opacity-80">
              Member pass
            </span>
          </span>
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-5 p-5 @min-[24rem]:p-6">
        {cardStyle !== "pass" ? (
          <div className="flex items-center gap-3">
            <WorkspaceMark name={workspace} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[15px] leading-5 font-semibold">
                {workspace}
              </span>
              {typeof invite.workspace.members === "number" ? (
                <span className="text-[12px] leading-4 text-ink-3">
                  {plural(invite.workspace.members, "member", "members")}
                </span>
              ) : null}
            </span>
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-2 font-mono text-[11px] font-semibold text-foreground"
            >
              {initials(invite.inviter.name)}
            </span>
            <h2
              id={ids.front}
              className="text-[15px] leading-[1.4] text-pretty text-ink-2"
            >
              <span className="font-semibold text-foreground">
                {invite.inviter.name}
              </span>{" "}
              invited you to join{" "}
              <span className="font-semibold text-foreground">{workspace}</span>
              .
            </h2>
          </div>
          {invite.note && front === "invite" ? (
            <blockquote className="border-l-2 border-[color-mix(in_oklab,var(--ia-accent)_45%,transparent)] pl-3 text-[13px] leading-5 text-pretty text-ink-2">
              {invite.note}
            </blockquote>
          ) : null}
        </div>

        {cardStyle !== "ticket" ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <RoleChip
              role={invite.role}
              chipRef={frontChipRef}
              style={{ opacity: frontChipOpacity }}
            />
            {meta}
          </div>
        ) : null}

        {invite.roleSummary?.length && front === "invite" && !expired ? (
          <ul
            role="list"
            aria-label={`What ${invite.role.toLowerCase()}s can do`}
            className="flex flex-col gap-1.5"
          >
            {invite.roleSummary.map((line) => {
              const no = /^no\b/i.test(line);
              return (
                <li
                  key={line}
                  className="flex items-start gap-2 text-[13px] leading-5 text-ink-2"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full",
                      no ? "bg-hairline-strong" : "bg-[var(--ia-accent)]",
                    )}
                  />
                  {line}
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="mt-auto flex flex-col gap-3">
          {frontBody}
          {front === "invite" ? (
            <p className="text-center text-[12px] leading-4 text-ink-3">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => onSignIn?.(invite.email)}
                className={link}
              >
                Sign in
              </button>
            </p>
          ) : null}
        </div>
      </div>
      {cardStyle === "ticket" ? (
        <div
          className="flex shrink-0 items-center gap-3 border-t border-dashed border-hairline-strong px-5 @min-[24rem]:px-6"
          style={{ height: STUB }}
        >
          <RoleChip
            role={invite.role}
            chipRef={frontChipRef}
            style={{ opacity: frontChipOpacity }}
          />
          <span className="min-w-0 flex-1 truncate">{meta}</span>
          <span className="hidden shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[22rem]:inline">
            {inviteCode(workspace)}
          </span>
        </div>
      ) : null}
    </div>
  );

  const fieldMsg = (msgId: string, error?: string, hint?: React.ReactNode) =>
    error ? (
      <span
        id={msgId}
        className="flex items-start gap-1.5 text-[11px] leading-4 text-danger"
      >
        <CircleAlert aria-hidden className="mt-px size-3 shrink-0" />
        {error}
      </span>
    ) : hint ? (
      <span
        id={msgId}
        className="flex items-center gap-1.5 text-[11px] leading-4 text-ink-3"
      >
        {hint}
      </span>
    ) : null;

  const longEnough = password.length >= passwordMinLength;

  const backFace = (
    <div
      role="group"
      aria-labelledby={ids.back}
      inert={side !== "back"}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !pending && !joined) {
          event.preventDefault();
          setSide("front");
        }
      }}
      className={face}
      style={{
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        transform: backTransform,
        mask: ticketMask,
        WebkitMask: ticketMask,
        opacity: motionSafe ? 1 : side === "back" ? 1 : 0,
        transition: motionSafe ? undefined : "opacity 160ms linear",
        zIndex: side === "back" ? 1 : 0,
      }}
    >
      {cardStyle === "pass" ? (
        <span
          aria-hidden
          className="h-1.5 shrink-0"
          style={{ backgroundColor: "var(--ia-accent)" }}
        />
      ) : null}
      <div className="flex flex-1 flex-col gap-4 p-5 @min-[24rem]:p-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSide("front")}
            aria-disabled={pending || joined || undefined}
            className={cn(
              "-ml-1.5 inline-flex h-8 items-center gap-1.5 rounded-2 px-1.5 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <ArrowLeft aria-hidden className="size-4" />
            Invite
          </button>
          <span className="inline-flex items-center gap-2 text-[12px] text-ink-3">
            <span className="hidden @min-[20rem]:inline">Joining as</span>
            <RoleChip
              role={invite.role}
              chipRef={backChipRef}
              style={{ opacity: backChipOpacity }}
            />
          </span>
        </div>

        <AnimatePresence initial={false} mode="wait">
          {joined ? (
            <motion.div
              key="joined"
              className="flex flex-1 flex-col items-start justify-center gap-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              <motion.span
                className="flex size-11 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--ia-accent)_14%,transparent)] text-[var(--ia-accent)]"
                initial={{ scale: motionSafe ? 0.6 : 1 }}
                animate={{ scale: 1 }}
                transition={motionSafe ? springs.recoil : { duration: 0 }}
              >
                <Check motionSafe={motionSafe} className="size-5" />
              </motion.span>
              <h2
                id={ids.back}
                ref={setArrival}
                tabIndex={-1}
                className={cn(
                  "rounded-1 text-[18px] leading-6 font-semibold",
                  FOCUS,
                )}
              >
                You&apos;re in
              </h2>
              <p className="text-[13px] leading-5 text-ink-2">
                Welcome to {workspace}. You joined as{" "}
                {invite.role.toLowerCase()}, and {inviter} has been told.
              </p>
              {invite.workspace.href ? (
                <a href={invite.workspace.href} className={primary}>
                  Open {workspace}
                </a>
              ) : null}
            </motion.div>
          ) : (
            <motion.div
              key="form"
              className="flex flex-col gap-4"
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            >
              <motion.div
                className="flex flex-col gap-0.5"
                initial={false}
                animate={reveal(0)}
              >
                <h2
                  id={ids.back}
                  className="text-[18px] leading-6 font-semibold"
                >
                  Create your account
                </h2>
                <p className="text-[13px] leading-5 text-ink-2">
                  One more step and you&apos;re in {workspace}.
                </p>
              </motion.div>
              <form
                noValidate
                onSubmit={submit}
                className="flex flex-col gap-3"
              >
                <motion.div
                  className="flex flex-col gap-1.5"
                  initial={false}
                  animate={reveal(1)}
                >
                  <label
                    htmlFor={ids.name}
                    className="text-[12px] leading-4 font-medium text-ink-2"
                  >
                    Name
                  </label>
                  <input
                    ref={nameRef}
                    id={ids.name}
                    autoComplete="name"
                    value={name}
                    readOnly={pending}
                    aria-invalid={errors.name ? true : undefined}
                    aria-describedby={errors.name ? ids.nameMsg : undefined}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setName(value);
                      if (errors.name)
                        setErrors((e) => ({ ...e, name: undefined }));
                    }}
                    className={cn(
                      FIELD,
                      errors.name ? "border-danger" : "border-input",
                    )}
                  />
                  {fieldMsg(ids.nameMsg, errors.name)}
                </motion.div>
                <motion.div
                  className="flex flex-col gap-1.5"
                  initial={false}
                  animate={reveal(2)}
                >
                  <label
                    htmlFor={ids.email}
                    className="text-[12px] leading-4 font-medium text-ink-2"
                  >
                    Email
                  </label>
                  <div className="relative">
                    <input
                      id={ids.email}
                      type="email"
                      autoComplete="email"
                      value={invite.email}
                      readOnly
                      aria-describedby={ids.emailMsg}
                      className={cn(
                        FIELD,
                        "border-input bg-surface-2 pr-9 text-ink-2",
                      )}
                    />
                    <Lock
                      aria-hidden
                      className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-ink-3"
                    />
                  </div>
                  {fieldMsg(
                    ids.emailMsg,
                    undefined,
                    <>
                      <Mail aria-hidden className="size-3 shrink-0" />
                      From {inviter}&apos;s invite
                    </>,
                  )}
                </motion.div>
                <motion.div
                  className="flex flex-col gap-1.5"
                  initial={false}
                  animate={reveal(3)}
                >
                  <label
                    htmlFor={ids.password}
                    className="text-[12px] leading-4 font-medium text-ink-2"
                  >
                    Password
                  </label>
                  <input
                    ref={passwordRef}
                    id={ids.password}
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    readOnly={pending}
                    aria-invalid={errors.password ? true : undefined}
                    aria-describedby={ids.passwordMsg}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setPassword(value);
                      if (errors.password) {
                        setErrors((e) => ({ ...e, password: undefined }));
                      }
                    }}
                    className={cn(
                      FIELD,
                      errors.password ? "border-danger" : "border-input",
                    )}
                  />
                  {fieldMsg(
                    ids.passwordMsg,
                    errors.password,
                    <>
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-3 shrink-0 items-center justify-center",
                          longEnough ? "text-success" : "text-ink-3",
                        )}
                      >
                        {longEnough ? (
                          <Check motionSafe={motionSafe} className="size-3" />
                        ) : (
                          <span className="size-1 rounded-full bg-current" />
                        )}
                      </span>
                      At least {passwordMinLength} characters
                    </>,
                  )}
                </motion.div>
                {formError ? (
                  <p
                    id={ids.formError}
                    role="alert"
                    className="flex items-start gap-2 rounded-2 bg-[color-mix(in_oklab,var(--danger)_9%,transparent)] px-3 py-2 text-[12px] leading-4 text-danger"
                  >
                    <CircleAlert
                      aria-hidden
                      className="mt-px size-3.5 shrink-0"
                    />
                    {formError}
                  </p>
                ) : null}
                <motion.div initial={false} animate={reveal(4)}>
                  <button
                    type="submit"
                    aria-disabled={pending || disabled || undefined}
                    aria-busy={pending || undefined}
                    aria-describedby={formError ? ids.formError : undefined}
                    className={cn(primary, "w-full")}
                  >
                    {pending ? (
                      <motion.span
                        aria-hidden
                        className="size-3.5 rounded-full border-2 border-current border-t-transparent"
                        animate={motionSafe ? { rotate: 360 } : undefined}
                        transition={
                          motionSafe
                            ? {
                                duration: 0.8,
                                ease: "linear",
                                repeat: Infinity,
                              }
                            : undefined
                        }
                      />
                    ) : null}
                    {pending ? "Joining…" : `Join ${workspace}`}
                  </button>
                </motion.div>
              </form>
              <p className="text-center text-[12px] leading-4 text-ink-3">
                Have an account?{" "}
                <button
                  type="button"
                  onClick={() => onSignIn?.(invite.email)}
                  className={link}
                >
                  Sign in instead
                </button>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  let card: React.ReactNode;
  if (status === "loading") {
    card = (
      <div
        role="status"
        aria-label="Loading the invite"
        className="relative flex w-full flex-col gap-5 overflow-hidden rounded-4 border border-hairline bg-card p-6 @min-[30rem]:max-w-[26rem]"
      >
        <div className="flex items-center gap-3">
          <span className="size-10 rounded-3 bg-surface-2" />
          <span className="flex flex-col gap-1.5">
            <span className="h-3 w-28 rounded-full bg-surface-2" />
            <span className="h-2 w-16 rounded-full bg-surface-2" />
          </span>
        </div>
        <span className="h-3 w-4/5 rounded-full bg-surface-2" />
        <span className="h-3 w-3/5 rounded-full bg-surface-2" />
        <span className="h-9 w-full rounded-2 bg-surface-2" />
        {motionSafe ? (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-1/2"
            style={{
              backgroundImage:
                "linear-gradient(90deg, transparent, color-mix(in oklab, var(--foreground) 5%, transparent), transparent)",
            }}
            initial={{ x: "-100%" }}
            animate={{ x: "200%" }}
            transition={{ duration: 1.6, ease: easings.move, repeat: Infinity }}
          />
        ) : null}
      </div>
    );
  } else if (status === "error") {
    card = (
      <div className="flex w-full flex-col gap-3 rounded-4 border border-hairline bg-card p-6 @min-[30rem]:max-w-[26rem]">
        <span className="flex size-10 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--warn)_14%,transparent)] text-warn">
          <CircleAlert aria-hidden className="size-5" />
        </span>
        <h2 className="text-[16px] leading-6 font-semibold">
          This invite link doesn&apos;t work
        </h2>
        <p className="text-[13px] leading-5 text-ink-2">
          It may have been used already or copied only in part. Ask whoever sent
          it for a new one, or sign in if you already have an account.
        </p>
        <button
          type="button"
          onClick={() => onSignIn?.(invite.email)}
          className={cn(quiet, "self-start")}
        >
          Sign in
        </button>
      </div>
    );
  } else {
    card = (
      <div
        ref={wrapRef}
        className="relative w-full @min-[30rem]:max-w-[26rem]"
        style={{ perspective: PERSPECTIVE }}
      >
        <motion.div
          className="grid"
          style={
            !motionSafe
              ? undefined
              : flipAxis === "x"
                ? { rotateX: turn, scale: dip, transformStyle: "preserve-3d" }
                : { rotateY: turn, scale: dip, transformStyle: "preserve-3d" }
          }
        >
          {frontFace}
          {backFace}
        </motion.div>
        {/* The role in flight: it never turns with the card. */}
        <RoleChip
          role={invite.role}
          className="pointer-events-none absolute top-0 left-0 z-20 shadow-raised"
          style={{
            x: flyX,
            y: flyY,
            scale: flyScale,
            opacity: flyOpacity,
          }}
        />
      </div>
    );
  }

  return (
    <section
      ref={sectionRef}
      aria-label={`Invitation to ${workspace}`}
      className={cn(
        "@container relative flex w-full justify-center overflow-hidden rounded-4 bg-surface-0 @min-[30rem]:px-6 @min-[30rem]:py-8",
        className,
      )}
      style={{
        ...vars,
        backgroundImage:
          "radial-gradient(ellipse 70% 55% at 50% 0%, color-mix(in oklab, var(--ia-accent) 10%, transparent), transparent 70%), radial-gradient(circle at 1px 1px, var(--grid-major) 1px, transparent 1.5px)",
        backgroundSize: "100% 100%, 18px 18px",
      }}
    >
      {card}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
