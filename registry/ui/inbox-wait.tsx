"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  LayoutGroup,
  motion,
  useInView,
  useMotionValue,
  type MotionValue,
} from "motion/react";
import {
  ArrowRight,
  Clock,
  Hourglass,
  MonitorSmartphone,
  RotateCcw,
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

export type InboxWaitStatus =
  "waiting" | "verified" | "expired" | "other-device";
export type InboxWaitEnvelopeStyle = "flap" | "mailer" | "line";
export type InboxWaitTone = "calm" | "warm" | "mono";
export type InboxWaitVia = "channel" | "check" | "host";

type Async = void | Promise<unknown>;

export type InboxWaitProps = {
  /** Where the link went. @default "ana@waylight.studio" */
  email?: string;
  /** Controlled status. */
  status?: InboxWaitStatus;
  /** Initial status when uncontrolled. @default "waiting" */
  defaultStatus?: InboxWaitStatus;
  /** Fires when the page notices the link opened, the link expires, or a new link goes out. */
  onStatusChange?: (status: InboxWaitStatus) => void;
  /** When the link was sent, in ms. @default defaultInboxWaitNow */
  sentAt?: number;
  /** The moment the page first renders, in ms; timers count on from it. @default defaultInboxWaitNow */
  now?: number;
  /** Seconds before Resend becomes available. @default 30 */
  resendAfter?: number;
  /** Minutes a link stays valid; the page turns to "expired" when it lapses. @default 15 */
  expiresAfter?: number;
  /** Resend was pressed. Return a promise to hold the button. */
  onResend?: () => Async;
  /** A new address was saved; a fresh link is assumed to have gone to it. */
  onChangeEmail?: (email: string) => void;
  /** The page noticed the link was opened, and how. Fires once per link. */
  onVerified?: (info: { name?: string; via: InboxWaitVia }) => void;
  /** Continue was pressed on the welcome. */
  onContinue?: () => void;
  /** A BroadcastChannel name. Another tab posts { type: "verified", name? } (or "expired", "other-device") when the link opens. */
  channel?: string;
  /** Asked when the tab regains focus (and every `pollInterval` ms while visible); resolve true once the link has been opened. */
  onCheck?: () => boolean | Promise<boolean>;
  /** Milliseconds between checks while the page is visible and on screen; 0 checks only on focus. @default 0 */
  pollInterval?: number;
  /** Who the welcome greets. @default "Ana" */
  name?: string;
  /** The product being signed in to. @default "Waylight" */
  product?: string;
  /** The envelope: a classic flap, a mailer with a tear strip, or line art. @default "flap" */
  envelopeStyle?: InboxWaitEnvelopeStyle;
  /** How strongly the resting envelope glows, 0 to 1; 0 is unlit and still. @default 0.6 */
  glowAmount?: number;
  /** The glow, the seal and the primary action: cobalt, amber or ink. @default "calm" */
  tone?: InboxWaitTone;
  /** Resend and Change email are unavailable. @default false */
  disabled?: boolean;
  /** Classes for the surface; it is max-w-sm unless widened here. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** A fixed afternoon, so the countdowns render the same on every machine. */
export const defaultInboxWaitNow = Date.UTC(2026, 9, 14, 9, 41, 6);

const DEFAULT_SENT = defaultInboxWaitNow - 6000;

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const TONE: Record<InboxWaitTone, Record<string, string>> = {
  calm: {
    "--iw-ink": "var(--accent-bright)",
    "--iw-glow": "oklch(from var(--accent-bright) 0.7 c h)",
    "--iw-fill": "var(--primary)",
    "--iw-on": "var(--primary-foreground)",
  },
  warm: {
    "--iw-ink": "var(--warn)",
    "--iw-glow": "oklch(from var(--warn) 0.82 c h)",
    "--iw-fill": "oklch(from var(--warn) 0.8 0.13 h)",
    "--iw-on": "oklch(from var(--warn) 0.26 0.05 h)",
  },
  mono: {
    "--iw-ink": "var(--ink-2)",
    "--iw-glow": "oklch(from var(--ink-2) 0.7 0.02 h)",
    "--iw-fill": "var(--foreground)",
    "--iw-on": "var(--background)",
  },
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const BUTTON =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 px-3 text-[12px] font-medium whitespace-nowrap transition-[background-color,color,opacity,translate] active:translate-y-px";
const SECONDARY = cn(
  BUTTON,
  "border border-input bg-surface-1 text-foreground hover:bg-surface-2",
);
const GHOST = cn(
  BUTTON,
  "px-2 text-ink-2 hover:bg-surface-2 hover:text-foreground",
);
const PRIMARY = cn(
  BUTTON,
  "bg-[var(--iw-fill)] text-[var(--iw-on)] hover:bg-[color-mix(in_oklab,var(--iw-fill)_88%,var(--foreground))]",
);

/* ----------------------------------------------------------------------- */
/*                               The envelope                               */
/* ----------------------------------------------------------------------- */

type Unfold = "closed" | "opening" | "open";

function Envelope({
  style,
  unfold,
  letterId,
  glow,
  breathing,
  motionSafe,
  bob,
}: {
  style: InboxWaitEnvelopeStyle;
  unfold: Unfold;
  letterId: string;
  glow: number;
  breathing: boolean;
  motionSafe: boolean;
  bob: MotionValue<number>;
}) {
  const opening = unfold !== "closed";
  const line = style === "line";
  const lo = Number((glow * 0.35).toFixed(3));
  const hi = Number((glow * 0.85).toFixed(3));
  const paper = line ? "fill-card" : "fill-surface-2";
  const edge = line ? "stroke-[var(--iw-ink)]" : "stroke-hairline-strong";
  return (
    <motion.div
      aria-hidden
      className="relative h-[52px] w-[72px] shrink-0 @min-[23rem]:h-[68px] @min-[23rem]:w-24"
      style={{ y: bob }}
    >
      {/* The resting glow: breathes on a mirrored tween only while the page
          waits, is on screen and the tab is shown; otherwise it holds still. */}
      {glow > 0 ? (
        <motion.span
          className="pointer-events-none absolute -inset-3 rounded-full bg-[radial-gradient(closest-side,var(--iw-glow),transparent)]"
          initial={false}
          animate={
            breathing
              ? { opacity: [lo, hi], scale: [0.9, 1.06] }
              : {
                  opacity: opening ? 0 : Number((glow * 0.6).toFixed(3)),
                  scale: 1,
                }
          }
          transition={
            breathing
              ? {
                  duration: 1.6,
                  ease: easings.move,
                  repeat: Infinity,
                  repeatType: "mirror",
                }
              : { duration: durations.slow, ease: easings.enter }
          }
        />
      ) : null}
      {/* Back of the envelope. */}
      <span
        className={cn(
          "absolute inset-0 border",
          style === "mailer" ? "rounded-3" : "rounded-2",
          line
            ? "border-[var(--iw-ink)] bg-card"
            : "border-hairline-strong bg-surface-2",
        )}
      />
      {/* The letter: a card that rises out and becomes the welcome. */}
      <motion.div
        layoutId={letterId}
        className="absolute inset-x-[12%] top-[12%] bottom-[16%] flex flex-col gap-[12%] rounded-1 border border-hairline bg-card px-[10%] pt-[12%]"
        initial={false}
        animate={{ y: opening && motionSafe ? -18 : 0 }}
        transition={
          motionSafe ? { ...springs.glide, delay: 0.12 } : { duration: 0 }
        }
        style={{ zIndex: 1 }}
      >
        <span className="h-[3px] w-3/4 rounded-full bg-hairline-strong" />
        <span className="h-[3px] w-1/2 rounded-full bg-hairline-strong" />
        <span className="h-[3px] w-2/3 rounded-full bg-[var(--iw-ink)] opacity-70" />
      </motion.div>
      {/* The front: opaque, so a closed envelope hides its letter until
          the letter rises out over the top edge. */}
      <svg
        viewBox="0 0 100 72"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full overflow-visible"
        style={{ zIndex: 2 }}
      >
        <rect
          x={0.5}
          y={0.5}
          width={99}
          height={71}
          rx={style === "mailer" ? 9 : 6}
          vectorEffect="non-scaling-stroke"
          className={cn(paper, edge)}
        />
        {style === "mailer" ? null : (
          <path
            d="M 1.5 70.5 L 50 40 L 98.5 70.5"
            fill="none"
            vectorEffect="non-scaling-stroke"
            className={
              line ? "stroke-[var(--iw-ink)]" : "stroke-hairline-strong"
            }
          />
        )}
      </svg>
      {style === "mailer" ? (
        // The tear strip slides off the top as the mailer opens.
        <motion.span
          className="absolute inset-x-0 top-[20%] flex h-[9%] items-center"
          initial={false}
          animate={{
            x: opening && motionSafe ? "70%" : "0%",
            opacity: opening ? 0 : 1,
          }}
          transition={
            opening
              ? { duration: durations.base, ease: easings.exit }
              : { duration: durations.fast }
          }
          style={{ zIndex: 3 }}
        >
          <span className="h-full flex-1 border-y border-dashed border-[color-mix(in_oklab,var(--iw-ink)_55%,transparent)]" />
          <span className="h-[160%] w-[14%] rounded-r-[3px] bg-[var(--iw-fill)]" />
        </motion.span>
      ) : (
        // The flap swings open about its top edge on snap, then sits behind
        // the rising letter.
        <motion.svg
          viewBox="0 0 100 44"
          preserveAspectRatio="none"
          className="absolute inset-x-0 top-0 h-[61%] w-full overflow-visible"
          initial={false}
          animate={{
            scaleY: opening ? (motionSafe ? -1 : 1) : 1,
            opacity: opening && !motionSafe ? 0 : 1,
          }}
          transition={motionSafe ? springs.snap : { duration: durations.fast }}
          style={{ originX: 0.5, originY: 0, zIndex: opening ? 0 : 3 }}
        >
          <path
            d="M 0.5 1 L 50 43 L 99.5 1 Z"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            className={cn(paper, edge)}
          />
          <circle cx={50} cy={34} r={5} className="fill-[var(--iw-fill)]" />
        </motion.svg>
      )}
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

/**
 * A magic-link waiting screen that notices when the link is opened. An
 * envelope rests in a slow breathing glow — a mirrored opacity and scale
 * tween whose strength is `glowAmount`, running only while the page waits,
 * is on screen and the tab is shown — beside "Check your inbox", the
 * address, Resend (counting down, active when its timer ends) and Change
 * email.
 *
 * The page notices three ways: a BroadcastChannel another tab posts to when
 * the link opens, `onCheck` asked whenever the tab regains focus (and on an
 * optional interval while visible), or the host setting `status`. Then the
 * envelope unfolds into the signed-in welcome: the flap swings open about
 * its top edge on `springs.snap` (the mailer's tear strip slides off
 * instead), the letter rises out of the pocket on `springs.glide`, and the
 * letter itself grows into the welcome card through a shared layout on
 * glide while the envelope leaves and the welcome's lines arrive in a
 * cascade.
 *
 * Timers count from `now` without reading the clock in render, re-sync when
 * a hidden tab is shown, and schedule only the next tick they need. An
 * expired link and a link opened on another device each explain the next
 * step. Under reduced motion the glow is still, and the envelope cross-fades
 * to the welcome.
 */
export function InboxWait({
  email: emailProp = "ana@waylight.studio",
  status: statusProp,
  defaultStatus = "waiting",
  onStatusChange,
  sentAt = DEFAULT_SENT,
  now = defaultInboxWaitNow,
  resendAfter = 30,
  expiresAfter = 15,
  onResend,
  onChangeEmail,
  onVerified,
  onContinue,
  channel,
  onCheck,
  pollInterval = 0,
  name = "Ana",
  product = "Waylight",
  envelopeStyle = "flap",
  glowAmount = 0.6,
  tone = "calm",
  disabled = false,
  className,
}: InboxWaitProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const letterId = `${uid}-letter`;

  const [ownStatus, setOwnStatus] =
    React.useState<InboxWaitStatus>(defaultStatus);
  const status = statusProp ?? ownStatus;
  const [email, setEmail] = React.useState(emailProp);
  const [seenEmail, setSeenEmail] = React.useState(emailProp);
  if (seenEmail !== emailProp) {
    setSeenEmail(emailProp);
    setEmail(emailProp);
  }
  const [announcement, setAnnouncement] = React.useState("");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [draftError, setDraftError] = React.useState<string | null>(null);
  const [resending, setResending] = React.useState(false);
  const [verifiedBy, setVerifiedBy] = React.useState<string | null>(null);

  /* ------------------------------- timing -------------------------------- */

  // A virtual clock: `now` plus the milliseconds the page has been open,
  // advanced only by the timers below — never read from the wall clock in
  // render, so the server and the first client render agree.
  const [elapsed, setElapsed] = React.useState(0);
  const [sentLocal, setSentLocal] = React.useState(sentAt);
  const opened = React.useRef<number | null>(null);
  const [visible, setVisible] = React.useState(true);
  const virtual = now + elapsed;
  const sinceSent = Math.max(0, virtual - sentLocal);
  const left = Math.max(0, resendAfter - Math.floor(sinceSent / 1000));
  const expiresAt = sentLocal + expiresAfter * 60_000;
  const minutesLeft = Math.max(0, Math.ceil((expiresAt - virtual) / 60_000));

  const sync = React.useCallback(() => {
    if (opened.current === null) return;
    setElapsed(Math.round(performance.now() - opened.current));
  }, []);

  React.useEffect(() => {
    // Idempotent: a StrictMode rehearsal keeps the first mount's stamp.
    if (opened.current === null) opened.current = performance.now();
    const onVisible = () => {
      setVisible(!document.hidden);
      if (!document.hidden) sync();
    };
    onVisible();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [sync]);

  const setStatus = React.useCallback(
    (next: InboxWaitStatus) => {
      if (statusProp === undefined) setOwnStatus(next);
      onStatusChange?.(next);
    },
    [onStatusChange, statusProp],
  );

  const waiting = status === "waiting";

  // Only the next tick that changes something is scheduled: each second
  // while Resend counts down, then each minute until the link lapses, when
  // the tick turns the page to "expired" instead.
  React.useEffect(() => {
    if (!waiting || !visible) return;
    const toExpiry = expiresAt - virtual;
    const wait =
      left > 0
        ? 1000 - (sinceSent % 1000)
        : Math.min(toExpiry, toExpiry - (minutesLeft - 1) * 60_000);
    const t = window.setTimeout(
      () => {
        const at =
          now +
          (opened.current === null ? 0 : performance.now() - opened.current);
        if (at >= expiresAt) {
          setStatus("expired");
          setAnnouncement(
            `The link has expired. Links last ${expiresAfter} minutes.`,
          );
        } else {
          sync();
        }
      },
      Math.max(50, Math.round(wait)),
    );
    return () => window.clearTimeout(t);
  }, [
    expiresAfter,
    expiresAt,
    left,
    minutesLeft,
    now,
    setStatus,
    sinceSent,
    sync,
    virtual,
    visible,
    waiting,
  ]);

  // Resend's arrival is announced once, not every second.
  const [seenLeft, setSeenLeft] = React.useState(left);
  if (seenLeft !== left) {
    setSeenLeft(left);
    if (left === 0 && waiting) setAnnouncement("You can resend the link now.");
  }

  /* ------------------------------- noticing ------------------------------ */

  const live = React.useRef({ status, onVerified, onCheck });
  React.useEffect(() => {
    live.current = { status, onVerified, onCheck };
  });

  const notice = React.useCallback(
    (via: InboxWaitVia, who?: string) => {
      if (live.current.status !== "waiting") return;
      live.current.status = "verified";
      setVerifiedBy(via);
      setStatus("verified");
      live.current.onVerified?.({ name: who, via });
    },
    [setStatus],
  );

  // Another tab says the link opened.
  React.useEffect(() => {
    if (!channel || typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel(channel);
    bc.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; name?: string } | null;
      if (data?.type === "verified") notice("channel", data.name);
      else if (data?.type === "expired" && live.current.status === "waiting")
        setStatus("expired");
      else if (
        data?.type === "other-device" &&
        live.current.status === "waiting"
      )
        setStatus("other-device");
    };
    return () => bc.close();
  }, [channel, notice, setStatus]);

  // Coming back to the tab is the moment to ask; so is an interval, if set,
  // while the page is visible and on screen.
  const rootRef = React.useRef<HTMLElement | null>(null);
  const inView = useInView(rootRef, { amount: 0.2 });
  React.useEffect(() => {
    if (!onCheck || !waiting) return;
    let alive = true;
    const ask = () => {
      const check = live.current.onCheck;
      if (!check || document.hidden) return;
      Promise.resolve(check()).then(
        (ok) => {
          if (alive && ok) notice("check");
        },
        () => undefined,
      );
    };
    window.addEventListener("focus", ask);
    document.addEventListener("visibilitychange", ask);
    const poll =
      pollInterval > 0 && inView && visible
        ? window.setInterval(ask, pollInterval)
        : 0;
    return () => {
      alive = false;
      window.removeEventListener("focus", ask);
      document.removeEventListener("visibilitychange", ask);
      if (poll) window.clearInterval(poll);
    };
  }, [inView, notice, onCheck, pollInterval, visible, waiting]);

  /* -------------------------------- unfold ------------------------------- */

  // Verified plays the unfold: opening (flap and letter) for a beat, then the
  // letter grows into the welcome. Decided in render as the status flips, so
  // a host-driven status unfolds exactly like a noticed one.
  const [unfold, setUnfold] = React.useState<Unfold>(
    status === "verified" ? "open" : "closed",
  );
  const [seenStatus, setSeenStatus] = React.useState(status);
  if (seenStatus !== status) {
    setSeenStatus(status);
    if (status === "verified") {
      setUnfold(motionSafe ? "opening" : "open");
      setAnnouncement(`Signed in. Welcome back, ${name}.`);
    } else {
      setUnfold("closed");
      if (status === "expired")
        setAnnouncement(`The link has expired. Send a fresh one.`);
      if (status === "other-device")
        setAnnouncement("The link was opened on another device.");
    }
  }
  React.useEffect(() => {
    if (unfold !== "opening") return;
    const t = window.setTimeout(() => setUnfold("open"), 380);
    return () => window.clearTimeout(t);
  }, [unfold]);

  /* ------------------------------- actions ------------------------------- */

  const bob = useMotionValue(0);
  const resend = () => {
    if (disabled || resending) return;
    if (waiting && left > 0) return;
    const go = () => {
      setResending(false);
      sync();
      setSentLocal(
        now +
          (opened.current === null
            ? 0
            : Math.round(performance.now() - opened.current)),
      );
      if (status !== "waiting") setStatus("waiting");
      setAnnouncement(`Sent a new link to ${email}.`);
      // The letter dips into the post and comes back: a three-key tween.
      if (motionSafe)
        animate(bob, [0, -distances.nudge * 1.5, 0], {
          duration: durations.slow,
          ease: easings.move,
        });
    };
    const result = onResend?.();
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setResending(true);
      (result as Promise<unknown>).then(go, () => {
        setResending(false);
        setAnnouncement("The link didn't send. Try again.");
      });
    } else {
      go();
    }
  };

  const focusHeading = React.useRef(false);
  const [headingNode, setHeadingNode] = React.useState<HTMLElement | null>(
    null,
  );
  const bindHeading = React.useCallback((node: HTMLElement | null) => {
    if (node) setHeadingNode(node);
  }, []);
  // A status change moves focus to the new heading — but only when focus was
  // already in here (or nowhere), so a link noticed in the background never
  // pulls focus away from something else on the page.
  React.useEffect(() => {
    if (status !== "waiting") focusHeading.current = true;
  }, [status]);
  React.useEffect(() => {
    if (!headingNode || !focusHeading.current || !headingNode.isConnected)
      return;
    focusHeading.current = false;
    const active = document.activeElement;
    const ours =
      !active ||
      active === document.body ||
      (rootRef.current?.contains(active) ?? false);
    if (ours) headingNode.focus({ preventScroll: true });
  }, [headingNode]);

  const [inputNode, setInputNode] = React.useState<HTMLInputElement | null>(
    null,
  );
  React.useEffect(() => {
    if (editing && inputNode?.isConnected) inputNode.focus();
  }, [editing, inputNode]);
  // Back from editing, focus returns to Change email once it is back.
  const focusChange = React.useRef(false);
  const [changeNode, setChangeNode] = React.useState<HTMLButtonElement | null>(
    null,
  );
  React.useEffect(() => {
    if (!changeNode || !focusChange.current || !changeNode.isConnected) return;
    focusChange.current = false;
    changeNode.focus({ preventScroll: true });
  }, [changeNode]);

  const startEdit = () => {
    if (disabled) return;
    setDraft(email);
    setDraftError(null);
    setEditing(true);
  };
  const stopEdit = (save: boolean) => {
    if (save) {
      const next = draft.trim();
      if (!EMAIL.test(next)) {
        setDraftError("Enter an address like name@company.com.");
        return;
      }
      setEmail(next);
      onChangeEmail?.(next);
      setSentLocal(
        now +
          (opened.current === null
            ? 0
            : Math.round(performance.now() - opened.current)),
      );
      sync();
      setAnnouncement(`Sent a new link to ${next}.`);
    }
    focusChange.current = true;
    setEditing(false);
    setDraftError(null);
  };

  /* -------------------------------- render ------------------------------- */

  const breathing =
    waiting &&
    motionSafe &&
    inView &&
    visible &&
    glowAmount > 0 &&
    unfold === "closed";
  const glow = Math.min(1, Math.max(0, glowAmount));
  const showWelcome = status === "verified" && unfold === "open";

  const heading = (text: string) => (
    <h2
      ref={bindHeading}
      tabIndex={-1}
      className="text-[15px] leading-5 font-semibold text-foreground outline-none"
    >
      {text}
    </h2>
  );

  const waitingView = (
    <motion.div
      key="waiting"
      className="flex flex-col gap-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.base) }}
      transition={{ duration: durations.fast }}
    >
      <div className="flex items-center gap-4 @min-[23rem]:flex-col @min-[23rem]:gap-3 @min-[23rem]:text-center">
        <Envelope
          style={envelopeStyle}
          unfold={unfold}
          letterId={letterId}
          glow={glow}
          breathing={breathing}
          motionSafe={motionSafe}
          bob={bob}
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          {heading(unfold === "closed" ? "Check your inbox" : "Signing you in")}
          {editing ? (
            <p className="text-[12px] leading-4 text-ink-2">
              Where should the link go?
            </p>
          ) : (
            <p className="text-[12px] leading-4 text-ink-2">
              We sent a sign-in link to{" "}
              <span
                title={email}
                className="inline-block max-w-full truncate align-bottom font-medium text-foreground"
              >
                {email}
              </span>
            </p>
          )}
        </div>
      </div>
      {editing ? (
        <form
          noValidate
          className="flex flex-col gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            stopEdit(true);
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={setInputNode}
              type="email"
              value={draft}
              aria-label="Email address"
              aria-invalid={draftError ? true : undefined}
              aria-describedby={draftError ? `${uid}-err` : undefined}
              onChange={(event) => {
                const v = event.currentTarget.value;
                setDraft(v);
                setDraftError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  stopEdit(false);
                }
              }}
              className="h-8 min-w-0 flex-1 basis-40 rounded-2 border border-input bg-surface-0 px-2.5 text-[13px] text-foreground focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid"
            />
            <span className="flex gap-2">
              <button type="submit" className={cn(PRIMARY, FOCUS)}>
                Send link
              </button>
              <button
                type="button"
                onClick={() => stopEdit(false)}
                className={cn(GHOST, FOCUS)}
              >
                Cancel
              </button>
            </span>
          </div>
          {draftError ? (
            <p id={`${uid}-err`} className="text-[11px] leading-4 text-danger">
              {draftError}
            </p>
          ) : null}
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2 @min-[23rem]:justify-center">
          <button
            type="button"
            onClick={resend}
            aria-disabled={disabled || left > 0 || resending || undefined}
            aria-busy={resending || undefined}
            aria-label={
              left > 0
                ? `Resend link, available in ${left} ${left === 1 ? "second" : "seconds"}`
                : "Resend link"
            }
            className={cn(
              SECONDARY,
              FOCUS,
              "tabular-nums",
              (left > 0 || disabled) &&
                "cursor-default text-ink-3 hover:bg-surface-1",
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            <span aria-hidden>
              {resending
                ? "Sending…"
                : left > 0
                  ? `Resend in ${mmss(left)}`
                  : "Resend link"}
            </span>
          </button>
          <button
            ref={setChangeNode}
            type="button"
            onClick={startEdit}
            aria-disabled={disabled || undefined}
            className={cn(GHOST, FOCUS)}
          >
            Change email
          </button>
        </div>
      )}
      <p className="flex items-center gap-1.5 text-[11px] leading-4 text-ink-3 @min-[23rem]:justify-center">
        <Clock aria-hidden className="size-3.5 shrink-0" />
        <span className="min-w-0">
          Link expires in {minutesLeft} min · this page will notice
        </span>
      </p>
    </motion.div>
  );

  const stepView = (kind: "expired" | "other-device") => (
    <motion.div
      key={kind}
      className="flex flex-col gap-3"
      initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={
        motionSafe
          ? { y: springs.glide, opacity: { duration: durations.base } }
          : { duration: durations.fast }
      }
    >
      <div className="flex items-start gap-3 @min-[23rem]:flex-col @min-[23rem]:items-center @min-[23rem]:text-center">
        <span
          aria-hidden
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-3",
            kind === "expired"
              ? "bg-[color-mix(in_oklab,var(--warn)_14%,transparent)] text-warn"
              : "bg-[color-mix(in_oklab,var(--iw-ink)_12%,transparent)] text-[var(--iw-ink)]",
          )}
        >
          {kind === "expired" ? (
            <Hourglass className="size-4" />
          ) : (
            <MonitorSmartphone className="size-4" />
          )}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          {heading(
            kind === "expired"
              ? "That link has expired"
              : "Opened on another device",
          )}
          <p className="text-[12px] leading-4 text-ink-2">
            {kind === "expired"
              ? `Links last ${expiresAfter} minutes. Send a fresh one to ${email}.`
              : "You're signed in there. To sign in here too, send a link and open it on this device."}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 @min-[23rem]:justify-center">
        <button
          type="button"
          onClick={() => {
            focusHeading.current = true;
            resend();
          }}
          aria-disabled={disabled || resending || undefined}
          aria-busy={resending || undefined}
          className={cn(PRIMARY, FOCUS)}
        >
          {resending
            ? "Sending…"
            : kind === "expired"
              ? "Send a new link"
              : "Send a link for this device"}
        </button>
      </div>
    </motion.div>
  );

  const arrive = (k: number) =>
    motionSafe
      ? {
          y: { ...springs.glide, delay: 0.22 + k * cascade(3) },
          opacity: { duration: durations.base, delay: 0.22 + k * cascade(3) },
        }
      : { duration: durations.fast };
  const rise = {
    initial: { opacity: 0, y: motionSafe ? distances.nudge : 0 },
    animate: { opacity: 1, y: 0 },
  };

  const welcomeView = (
    <motion.div
      key="welcome"
      className="flex flex-col gap-3"
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
    >
      {/* The letter, grown into the welcome card through the shared layout. */}
      <motion.div
        layoutId={letterId}
        className="flex items-center gap-3 rounded-3 border border-hairline bg-surface-1 p-3"
        transition={motionSafe ? springs.glide : { duration: 0 }}
      >
        <motion.span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--iw-fill)] text-[14px] font-semibold text-[var(--iw-on)]"
          initial={{ opacity: 0, scale: motionSafe ? 0.7 : 1 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={
            motionSafe
              ? {
                  scale: { ...springs.snap, delay: 0.18 },
                  opacity: { duration: durations.fast, delay: 0.18 },
                }
              : { duration: durations.fast }
          }
        >
          {name.charAt(0).toUpperCase()}
        </motion.span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <motion.div {...rise} transition={arrive(0)}>
            {heading(`Welcome back, ${name}`)}
          </motion.div>
          <motion.p
            {...rise}
            transition={arrive(1)}
            title={email}
            className="truncate text-[12px] leading-4 text-ink-2"
          >
            Signed in to {product} as {email}
          </motion.p>
        </div>
      </motion.div>
      <motion.div
        {...rise}
        transition={arrive(2)}
        className="flex flex-wrap items-center justify-between gap-2"
      >
        <span className="text-[11px] leading-4 text-ink-3">
          {verifiedBy === "channel"
            ? "Noticed the link opening in another tab."
            : verifiedBy === "check"
              ? "Noticed when you came back."
              : "Your link worked."}
        </span>
        <button
          type="button"
          onClick={onContinue}
          className={cn(PRIMARY, FOCUS)}
        >
          Continue to {product}
          <ArrowRight aria-hidden className="size-3.5" />
        </button>
      </motion.div>
    </motion.div>
  );

  const view =
    status === "expired"
      ? stepView("expired")
      : status === "other-device"
        ? stepView("other-device")
        : showWelcome
          ? welcomeView
          : waitingView;

  return (
    <section
      ref={rootRef}
      aria-label="Sign-in link"
      className={cn(
        "@container w-full max-w-sm rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={TONE[tone] ?? TONE.calm}
    >
      {/* Views pop out of flow as they leave, so this box is their anchor. */}
      <div className="relative p-4 @min-[23rem]:p-5">
        <LayoutGroup id={uid}>
          <AnimatePresence initial={false} mode="popLayout">
            {view}
          </AnimatePresence>
        </LayoutGroup>
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
