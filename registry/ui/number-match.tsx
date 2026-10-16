"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  CircleCheck,
  Clock,
  Laptop,
  Lock,
  MapPin,
  ShieldX,
  TimerOff,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
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

export type NumberMatchStatus =
  "waiting" | "approved" | "blocked" | "denied" | "expired";
export type NumberMatchLayout = "split" | "overlap" | "mirror";

export type NumberMatchRequest = {
  /** The two-digit number the signing-in screen shows. */
  number: number;
  /** The three numbers the phone offers, the right one among them. @default seeded from `number` */
  choices?: number[];
  /** What is signing in, in words. */
  device: string;
  /** Roughly where, in words. */
  place: string;
  /** When the request was made, ms since the epoch. */
  time: number;
  /** The account being signed in to. */
  account: string;
};

export type NumberMatchProps = {
  /** The sign-in being approved. @default defaultNumberMatchRequest */
  request?: NumberMatchRequest;
  /** Controlled: where the request stands. */
  status?: NumberMatchStatus;
  /** Initial status when uncontrolled. @default "waiting" */
  defaultStatus?: NumberMatchStatus;
  /** Fires from the choice, the denial or the expiry that changed it. */
  onStatusChange?: (status: NumberMatchStatus) => void;
  /** The right number was chosen. */
  onApprove?: (request: NumberMatchRequest) => void;
  /** The request was stopped: a wrong number, or "No, it's not me". */
  onDeny?: (request: NumberMatchRequest, reason: "mismatch" | "denied") => void;
  /** The request ran out of time before anyone chose. */
  onExpire?: (request: NumberMatchRequest) => void;
  /** "Try again" or "Send a new request" on the signing-in screen. Pass a new request to start over. */
  onRetry?: () => void;
  /** How long the request lives, in ms. @default 60000 */
  expiresIn?: number;
  /** The time zone the request's time is shown in. @default "UTC" */
  timeZone?: string;
  /** The product's name, on both screens. @default "Fieldline" */
  appName?: string;
  /** The address in the signing-in window's bar. @default "fieldline.app/sign-in" */
  signInUrl?: string;
  /** Where "Change your password" goes after a block. @default "#security" */
  secureHref?: string;
  /** The two screens side by side, the phone over the window's edge, or the phone first. They stack in narrow containers. @default "split" */
  layout?: NumberMatchLayout;
  /** The number's size on the signing-in screen, in px. @default 56 */
  numberSize?: number;
  /** The number, the waiting highlights and the app marks. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The choices and the denial are unavailable. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultNumberMatchRequest: NumberMatchRequest = {
  number: 47,
  choices: [82, 47, 19],
  device: "Desktop browser on a laptop",
  place: "Near Porto, Portugal",
  time: Date.UTC(2026, 9, 14, 14, 32),
  account: "rae@fieldline.dev",
};

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const r1 = (v: number) => Math.round(v * 10) / 10;

const mulberry = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Two decoys and the number, in a seeded order, when none are given. */
const choicesFor = (request: NumberMatchRequest): number[] => {
  const given = request.choices?.filter((n, i, all) => all.indexOf(n) === i);
  if (given && given.length >= 2 && given.includes(request.number)) {
    return given.slice(0, 4);
  }
  const rand = mulberry(request.number * 7919 + 17);
  const out = new Set<number>([request.number]);
  while (out.size < 3) out.add(10 + Math.floor(rand() * 90));
  const list = [...out];
  const slot = Math.floor(rand() * 3);
  const [right] = list.splice(0, 1);
  list.splice(slot, 0, right ?? request.number);
  return list;
};

const two = (n: number) =>
  String(Math.abs(Math.round(n)) % 100).padStart(2, "0");

const timeOf = (ms: number, timeZone: string) => {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    }).format(ms);
  } catch {
    const d = new Date(ms);
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  }
};

type Point = { x: number; y: number };
type Line = {
  a: Point;
  b: Point;
  kind: "match" | "miss";
  w: number;
  h: number;
};

/** Splits the bezier from `a` to `b` at its middle into two halves, each
 * drawn from its own end toward the middle. */
const halves = (line: Line) => {
  const { a, b } = line;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const across = Math.abs(dx) >= Math.abs(dy);
  const c1 = across
    ? { x: a.x + dx * 0.5, y: a.y }
    : { x: a.x, y: a.y + dy * 0.5 };
  const c2 = across
    ? { x: b.x - dx * 0.5, y: b.y }
    : { x: b.x, y: b.y - dy * 0.5 };
  const mid = (p: Point, q: Point) => ({
    x: (p.x + q.x) / 2,
    y: (p.y + q.y) / 2,
  });
  const p01 = mid(a, c1);
  const p12 = mid(c1, c2);
  const p23 = mid(c2, b);
  const p012 = mid(p01, p12);
  const p123 = mid(p12, p23);
  const m = mid(p012, p123);
  const f = (p: Point) => `${r1(p.x)} ${r1(p.y)}`;
  return {
    fromA: `M${f(a)}C${f(p01)} ${f(p012)} ${f(m)}`,
    fromB: `M${f(b)}C${f(p23)} ${f(p123)} ${f(m)}`,
    mid: { x: r1(m.x), y: r1(m.y) },
  };
};

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

/**
 * A new-device approval drawn as the two screens it happens on: the browser
 * that is signing in, showing a two-digit number, and the trusted phone,
 * asking whether it's you and offering three numbers.
 *
 * Choosing the right one joins the screens: a line grows from the number
 * and from the phone's frame, level with the chosen key, at once — each
 * half drawn on `springs.glide` —
 * and they meet in the middle, where a dot lands on `springs.recoil`; both
 * screens turn to success as it lands and the phone stamps its check. A
 * wrong number blocks the request: the halves reach for each other in
 * danger, stop short and draw back as they fade — a tween, because a
 * refusal never bounces — and both screens explain why. The choices stay
 * where they were through every outcome, so the line's end never moves,
 * and it lands on the frame rather than crossing a key or a word. "No, it's not me" stops it too, and a request left
 * alone runs out on a lifetime bar that drains only while it can be seen.
 *
 * The choices are buttons in a group with roving focus — the arrow keys, Home
 * and End move, Enter and Space choose — and every outcome is announced. The
 * screens sit side by side, overlap, or mirror, and stack in a narrow
 * container, where the line runs down instead of across. Under reduced
 * motion the line appears whole (dashed when it fails) and only colours
 * change.
 */
export function NumberMatch({
  request = defaultNumberMatchRequest,
  status: statusProp,
  defaultStatus = "waiting",
  onStatusChange,
  onApprove,
  onDeny,
  onExpire,
  onRetry,
  expiresIn = 60_000,
  timeZone = "UTC",
  appName = "Fieldline",
  signInUrl = "fieldline.app/sign-in",
  secureHref = "#security",
  layout = "split",
  numberSize = 56,
  accent = "var(--accent-bright)",
  disabled = false,
  className,
}: NumberMatchProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const ids = {
    laptop: `${uid}-laptop`,
    phone: `${uid}-phone`,
  };

  const [ownStatus, setOwnStatus] = React.useState(defaultStatus);
  const status = statusProp ?? ownStatus;
  const [chosen, setChosen] = React.useState<number | null>(null);
  const [active, setActive] = React.useState(0);
  const [line, setLine] = React.useState<Line | null>(null);
  const [round, setRound] = React.useState(0);
  const [announcement, setAnnouncement] = React.useState("");
  const [live, setLive] = React.useState(false);
  const [outcomeNode, setOutcomeNode] = React.useState<HTMLElement | null>(
    null,
  );

  // A new request starts over — decided in render, as it arrives.
  const requestKey = `${request.number}:${request.time}:${request.account}`;
  const [seenKey, setSeenKey] = React.useState(requestKey);
  if (seenKey !== requestKey) {
    setSeenKey(requestKey);
    setChosen(null);
    setLine(null);
    setActive(0);
    setRound((r) => r + 1);
    if (statusProp === undefined) setOwnStatus("waiting");
  }

  const choices = React.useMemo(() => choicesFor(request), [request]);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const tileRef = React.useRef<HTMLDivElement | null>(null);
  const phoneRef = React.useRef<HTMLElement | null>(null);
  const barRef = React.useRef<HTMLSpanElement | null>(null);
  const choiceRefs = React.useRef(new Map<number, HTMLButtonElement>());
  const deadline = React.useRef<number | null>(null);
  const focusOutcome = React.useRef(false);
  const focusChoice = React.useRef(false);
  const expireRef = React.useRef<() => void>(() => {});

  const setStatus = (next: NumberMatchStatus) => {
    if (statusProp === undefined) setOwnStatus(next);
    onStatusChange?.(next);
  };

  // Only animate where someone can see it.
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    let onScreen = true;
    const update = () => setLive(onScreen && !document.hidden);
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      update();
    });
    io.observe(node);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  /* ---------------------------- the lifetime ---------------------------- */

  React.useEffect(() => {
    deadline.current = null;
  }, [round]);

  React.useEffect(() => {
    if (status !== "waiting") return;
    if (deadline.current === null) deadline.current = Date.now() + expiresIn;
    const id = window.setTimeout(
      () => expireRef.current(),
      Math.max(0, deadline.current - Date.now()),
    );
    return () => window.clearTimeout(id);
  }, [expiresIn, round, status]);

  // The bar drains on the compositor, and only while it can be seen.
  React.useEffect(() => {
    const bar = barRef.current;
    if (!bar || status !== "waiting" || !live) return;
    const end = deadline.current;
    if (end === null) return;
    const ms = Math.max(0, end - Date.now());
    const from = Math.min(1, ms / expiresIn);
    const drain: AnimationPlaybackControls = animate(
      bar,
      { scaleX: [from, 0] },
      { duration: ms / 1000, ease: "linear" },
    );
    return () => drain.stop();
  }, [expiresIn, live, round, status]);

  /* ------------------------------ the line ------------------------------ */

  const measure = React.useCallback(
    (n: number, kind: Line["kind"]): Line | null => {
      const root = rootRef.current;
      const tile = tileRef.current;
      const phoneNode = phoneRef.current;
      const button = choiceRefs.current.get(n);
      if (!root || !tile || !phoneNode || !button) return null;
      const box = root.getBoundingClientRect();
      const t = tile.getBoundingClientRect();
      const p = phoneNode.getBoundingClientRect();
      const c = button.getBoundingClientRect();
      const tc = { x: t.left + t.width / 2, y: t.top + t.height / 2 };
      const pc = { x: p.left + p.width / 2, y: p.top + p.height / 2 };
      const cc = { x: c.left + c.width / 2, y: c.top + c.height / 2 };
      // Side by side the line runs across; stacked, it runs down.
      const across = Math.abs(pc.x - tc.x) > Math.abs(pc.y - tc.y);
      // One end leaves the tile's facing edge; the other lands on the
      // phone's frame in line with the chosen key, so the line never
      // crosses another key or any words on the phone.
      const a = across
        ? { x: pc.x > tc.x ? t.right : t.left, y: tc.y }
        : { x: tc.x, y: pc.y > tc.y ? t.bottom : t.top };
      const b = across
        ? { x: pc.x > tc.x ? p.left : p.right, y: cc.y }
        : { x: cc.x, y: pc.y > tc.y ? p.top : p.bottom };
      return {
        a: { x: r1(a.x - box.left), y: r1(a.y - box.top) },
        b: { x: r1(b.x - box.left), y: r1(b.y - box.top) },
        kind,
        w: Math.round(box.width),
        h: Math.round(box.height),
      };
    },
    [],
  );

  // The line follows its ends if the surface is resized while it shows.
  const lineRef = React.useRef(line);
  const chosenRef = React.useRef(chosen);
  React.useEffect(() => {
    lineRef.current = line;
    chosenRef.current = chosen;
  });
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => {
      const current = lineRef.current;
      const n = chosenRef.current;
      if (!current || n === null) return;
      const next = measure(n, current.kind);
      if (next) setLine(next);
    });
    // Either screen can change height under a settled line.
    ro.observe(root);
    for (const pane of root.querySelectorAll("section")) ro.observe(pane);
    return () => ro.disconnect();
  }, [measure]);

  /* ------------------------------- choosing ------------------------------- */

  const remember = () => {
    const root = rootRef.current;
    const activeEl = document.activeElement;
    focusOutcome.current = Boolean(root && activeEl && root.contains(activeEl));
  };

  const choose = (n: number) => {
    if (disabled || status !== "waiting") return;
    remember();
    setChosen(n);
    const right = n === request.number;
    setLine(measure(n, right ? "match" : "miss"));
    if (right) {
      setStatus("approved");
      setAnnouncement(`${two(n)} matched. Sign-in approved.`);
      onApprove?.(request);
    } else {
      setStatus("blocked");
      setAnnouncement(
        `${two(n)} didn't match ${two(request.number)}. The sign-in was blocked.`,
      );
      onDeny?.(request, "mismatch");
    }
  };

  const deny = () => {
    if (disabled || status !== "waiting") return;
    remember();
    setStatus("denied");
    setAnnouncement("You said it wasn't you. The sign-in was stopped.");
    onDeny?.(request, "denied");
  };

  React.useEffect(() => {
    expireRef.current = () => {
      if (status !== "waiting") return;
      setStatus("expired");
      setAnnouncement("The sign-in request expired.");
      onExpire?.(request);
    };
  });

  const retry = () => {
    // Try again leaves with the outcome; focus goes back to the choices.
    const root = rootRef.current;
    const activeEl = document.activeElement;
    focusChoice.current = Boolean(root && activeEl && root.contains(activeEl));
    onRetry?.();
    if (statusProp === undefined) {
      setOwnStatus("waiting");
      setChosen(null);
      setLine(null);
      setRound((r) => r + 1);
    }
    setAnnouncement("Waiting for your phone.");
  };

  React.useEffect(() => {
    if (status !== "waiting" || !focusChoice.current) return;
    focusChoice.current = false;
    const n = choices[active] ?? choices[0];
    if (n !== undefined)
      choiceRefs.current.get(n)?.focus({ preventScroll: true });
  }, [active, choices, round, status]);

  // Focus that was on a choice goes to the outcome when it arrives.
  React.useEffect(() => {
    if (!outcomeNode || !focusOutcome.current) return;
    focusOutcome.current = false;
    outcomeNode.focus({ preventScroll: true });
  }, [outcomeNode]);

  const onChoiceKey = (event: React.KeyboardEvent, index: number) => {
    const last = choices.length - 1;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? Math.min(last, index + 1)
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? Math.max(0, index - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    const n = choices[next];
    if (n !== undefined) choiceRefs.current.get(n)?.focus();
  };

  /* ------------------------------ drawing ------------------------------ */

  const tone =
    status === "approved"
      ? "var(--success)"
      : status === "blocked" || status === "denied"
        ? "var(--danger)"
        : status === "expired"
          ? "var(--ink-3)"
          : accent;
  const settled = status !== "waiting";
  const vars = {
    "--nm-accent": accent,
    "--nm-tone": tone,
    "--nm-on": `oklch(from ${accent} clamp(0, (0.7 - l) * 100, 1) 0 0)`,
  } as React.CSSProperties;
  const size = Math.min(120, Math.max(28, numberSize));
  const swap = {
    initial: { opacity: 0, y: motionSafe ? distances.nudge : 0 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, transition: exitFor(durations.fast) },
    transition: motionSafe
      ? {
          y: springs.glide,
          opacity: { duration: durations.base, ease: easings.enter },
        }
      : { duration: durations.fast },
  };
  const frame = cn(
    "transition-[border-color,background-color] duration-300",
    settled && status !== "expired"
      ? "border-[color-mix(in_oklab,var(--nm-tone)_45%,transparent)]"
      : "border-hairline",
  );
  const mark = (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-2 font-mono text-[11px] font-semibold text-[var(--nm-on)]"
      style={{ backgroundColor: "var(--nm-accent)" }}
    >
      {appName.slice(0, 1).toUpperCase()}
    </span>
  );
  const textButton = cn(
    "rounded-1 font-medium text-foreground underline-offset-2 hover:underline",
    FOCUS,
  );

  const laptopText =
    status === "approved"
      ? "Approved on your phone. Signing you in…"
      : status === "blocked"
        ? "This sign-in was blocked on your phone."
        : status === "denied"
          ? "You said this wasn't you, so the sign-in was stopped."
          : status === "expired"
            ? "This request expired before it was answered."
            : `Tap ${two(request.number)} on your phone to finish signing in.`;

  const laptop = (
    <section
      aria-labelledby={ids.laptop}
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden rounded-3 border bg-card text-card-foreground shadow-raised",
        frame,
      )}
    >
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-hairline bg-surface-2 px-3">
        <span aria-hidden className="flex gap-1">
          <span className="size-1.5 rounded-full bg-hairline-strong" />
          <span className="size-1.5 rounded-full bg-hairline-strong" />
        </span>
        <span className="mx-auto inline-flex min-w-0 items-center gap-1.5 rounded-full bg-surface-1 px-2.5 py-0.5 font-mono text-[10px] text-ink-3">
          <Lock aria-hidden className="size-2.5 shrink-0" />
          <span className="truncate">{signInUrl}</span>
        </span>
      </div>
      <div className="flex flex-1 items-center gap-4 px-4 py-4 @min-[36rem]:flex-col @min-[36rem]:justify-center @min-[36rem]:gap-4 @min-[36rem]:px-6 @min-[36rem]:py-7 @min-[36rem]:text-center">
        <motion.div
          key={status}
          className="flex min-w-0 flex-1 flex-col items-start gap-1 @min-[36rem]:flex-none @min-[36rem]:items-center"
          initial={{ opacity: settled ? 0 : 1 }}
          animate={{ opacity: 1 }}
          transition={{ duration: durations.base, ease: easings.enter }}
        >
          <span className="mb-1 hidden @min-[36rem]:block">{mark}</span>
          <h3 id={ids.laptop} className="text-[15px] leading-5 font-semibold">
            {status === "approved"
              ? "Approved"
              : status === "waiting"
                ? "Check your phone"
                : "Sign-in stopped"}
          </h3>
          <p className="text-[12px] leading-4 text-pretty text-ink-2 @min-[36rem]:max-w-[16rem] @min-[36rem]:text-[13px] @min-[36rem]:leading-5">
            {laptopText}
          </p>
          {settled && status !== "approved" ? (
            <button
              type="button"
              onClick={retry}
              className={cn("mt-1 text-[12px] leading-4", textButton)}
            >
              {status === "expired" ? "Send a new request" : "Try again"}
            </button>
          ) : (
            <p className="hidden truncate text-[12px] leading-4 text-ink-3 @min-[36rem]:block">
              {request.account}
            </p>
          )}
        </motion.div>
        <div className="relative shrink-0">
          <div
            ref={tileRef}
            role="img"
            aria-label={`Number to match: ${two(request.number)}`}
            className={cn(
              "rounded-3 border-2 font-mono leading-none font-semibold tabular-nums transition-[border-color,background-color,color,opacity] duration-300",
              status === "expired" && "opacity-50",
            )}
            style={{
              fontSize: size,
              paddingInline: Math.round(size * 0.32),
              paddingBlock: Math.round(size * 0.2),
              color: settled ? "var(--nm-tone)" : "var(--nm-accent)",
              borderColor:
                "color-mix(in oklab, var(--nm-tone) 40%, transparent)",
              backgroundColor:
                "color-mix(in oklab, var(--nm-tone) 9%, transparent)",
            }}
          >
            {two(request.number)}
          </div>
          <AnimatePresence initial={false}>
            {status === "approved" ? (
              <motion.span
                key="ok"
                aria-hidden
                className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-success text-[var(--bg-1)]"
                initial={{ scale: motionSafe ? 0.4 : 1, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        scale: { ...springs.recoil, delay: 0.32 },
                        opacity: { duration: durations.fast, delay: 0.32 },
                      }
                    : { duration: durations.fast }
                }
              >
                <svg viewBox="0 0 16 16" className="size-3.5">
                  <path
                    d="M3.5 8.5l3 3 6-7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );

  const detail = (icon: React.ReactNode, text: string) => (
    <li className="flex min-w-0 items-center gap-2 text-[12px] leading-4 text-ink-2">
      <span
        aria-hidden
        className="flex size-4 shrink-0 items-center justify-center text-ink-3"
      >
        {icon}
      </span>
      <span className="truncate" title={text}>
        {text}
      </span>
    </li>
  );

  const outcome =
    status === "approved"
      ? {
          icon: <CircleCheck className="size-4" />,
          title: "Sign-in approved",
          text: "You're signed in on the other screen. You can put your phone down.",
        }
      : status === "blocked"
        ? {
            icon: <ShieldX className="size-4" />,
            title: "Request blocked",
            text: `${two(chosen ?? 0)} didn't match the sign-in screen, so we stopped it. If that wasn't you, change your password.`,
          }
        : status === "denied"
          ? {
              icon: <ShieldX className="size-4" />,
              title: "Sign-in stopped",
              text: "Thanks for telling us. If someone else tried, change your password now.",
            }
          : {
              icon: <TimerOff className="size-4" />,
              title: "Request expired",
              text: "Nobody answered in time. Sign in again on the other screen if it was you.",
            };

  // The phone keeps its choices in place through every outcome — the line's
  // end stays put — and swaps only the words above them, in one cell sized
  // by the longer of the two.
  const phone = (
    <section
      ref={phoneRef}
      aria-labelledby={ids.phone}
      className={cn(
        "relative mx-auto w-full max-w-[18rem] rounded-[30px] border bg-surface-2 p-1.5 shadow-raised",
        frame,
      )}
    >
      <div className="relative flex flex-col overflow-hidden rounded-[24px] bg-card text-card-foreground">
        <div className="flex h-6 items-center justify-between px-5 pt-1 font-mono text-[10px] text-ink-3 tabular-nums">
          <span>{timeOf(request.time, timeZone)}</span>
          <span aria-hidden className="h-3.5 w-14 rounded-full bg-surface-2" />
          <span aria-hidden className="flex items-end gap-px">
            <span className="h-1 w-0.5 rounded-full bg-ink-3" />
            <span className="h-1.5 w-0.5 rounded-full bg-ink-3" />
            <span className="h-2 w-0.5 rounded-full bg-ink-3" />
          </span>
        </div>
        <div className="flex items-center gap-2 border-b border-hairline px-4 pt-2 pb-2.5">
          {mark}
          <span className="flex min-w-0 flex-col">
            <span
              id={ids.phone}
              className="truncate text-[13px] leading-4 font-semibold"
            >
              {appName}
            </span>
            <span className="text-[11px] leading-4 text-ink-3">
              Sign-in request
            </span>
          </span>
        </div>
        <div className="flex flex-col gap-3 px-4 pt-3 pb-4">
          <div className="grid">
            <motion.div
              className="flex min-w-0 flex-col gap-2 [grid-area:1/1]"
              inert={settled}
              initial={false}
              animate={{ opacity: settled ? 0 : 1 }}
              transition={{ duration: durations.fast }}
            >
              <h3 className="text-[15px] leading-5 font-semibold">
                Are you trying to sign in?
              </h3>
              <ul role="list" className="flex flex-col gap-1.5">
                {detail(<Laptop className="size-3.5" />, request.device)}
                {detail(<MapPin className="size-3.5" />, request.place)}
                {detail(
                  <Clock className="size-3.5" />,
                  `${timeOf(request.time, timeZone)} · ${request.account}`,
                )}
              </ul>
            </motion.div>
            <AnimatePresence initial={false}>
              {settled ? (
                <motion.div
                  key={`out-${status}`}
                  className="flex min-w-0 flex-col gap-1.5 [grid-area:1/1]"
                  {...swap}
                >
                  <span className="flex items-center gap-2">
                    <motion.span
                      aria-hidden
                      className="flex size-7 shrink-0 items-center justify-center rounded-full"
                      style={{
                        color: tone,
                        backgroundColor: `color-mix(in oklab, ${tone} 14%, transparent)`,
                      }}
                      initial={{
                        scale: motionSafe && status === "approved" ? 0.5 : 1,
                      }}
                      animate={{ scale: 1 }}
                      transition={
                        motionSafe && status === "approved"
                          ? { ...springs.recoil, delay: 0.3 }
                          : { duration: 0 }
                      }
                    >
                      {outcome.icon}
                    </motion.span>
                    <h3
                      ref={setOutcomeNode}
                      tabIndex={-1}
                      className={cn(
                        "rounded-1 text-[15px] leading-5 font-semibold",
                        FOCUS,
                      )}
                    >
                      {outcome.title}
                    </h3>
                  </span>
                  <p
                    role={status === "blocked" ? "alert" : undefined}
                    className="text-[12px] leading-4 text-pretty text-ink-2"
                  >
                    {outcome.text}
                  </p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
          <p className="text-[12px] leading-4 text-ink-3">
            {chosen === null
              ? "Tap the number shown on your other screen."
              : `You chose ${two(chosen)}.`}
          </p>
          <div
            role="group"
            aria-label="Choose the number on your other screen"
            className="grid grid-cols-3 gap-2"
          >
            {choices.map((n, i) => {
              const picked = chosen === n;
              return (
                <button
                  key={n}
                  ref={(node) => {
                    if (node) choiceRefs.current.set(n, node);
                    else choiceRefs.current.delete(n);
                  }}
                  type="button"
                  tabIndex={i === active ? 0 : -1}
                  aria-disabled={disabled || settled || undefined}
                  aria-pressed={settled ? picked : undefined}
                  onFocus={() => setActive(i)}
                  onKeyDown={(event) => onChoiceKey(event, i)}
                  onClick={() => choose(n)}
                  className={cn(
                    "flex h-14 items-center justify-center rounded-3 border font-mono text-[22px] font-semibold tabular-nums transition-[background-color,border-color,color,opacity,transform] duration-200",
                    FOCUS,
                    picked
                      ? "border-[color-mix(in_oklab,var(--nm-tone)_60%,transparent)] bg-[color-mix(in_oklab,var(--nm-tone)_12%,transparent)] text-[var(--nm-tone)]"
                      : "border-hairline-strong bg-surface-1 text-foreground",
                    !settled &&
                      !disabled &&
                      "hover:border-[color-mix(in_oklab,var(--nm-accent)_55%,transparent)] hover:bg-[color-mix(in_oklab,var(--nm-accent)_8%,transparent)] active:scale-[0.97]",
                    settled && !picked && "opacity-40",
                    (disabled || settled) && "cursor-default",
                  )}
                >
                  {two(n)}
                </button>
              );
            })}
          </div>
          {status === "blocked" || status === "denied" ? (
            <a
              href={secureHref}
              className={cn(
                "inline-flex h-8 items-center justify-center rounded-2 bg-danger px-3 text-[13px] font-medium text-destructive-foreground transition-opacity hover:opacity-90",
                FOCUS,
              )}
            >
              Change your password
            </a>
          ) : (
            <button
              type="button"
              onClick={deny}
              aria-disabled={disabled || settled || undefined}
              tabIndex={settled ? -1 : undefined}
              className={cn(
                "inline-flex h-8 items-center justify-center rounded-2 text-[13px] font-medium text-danger transition-[background-color,opacity] hover:bg-[color-mix(in_oklab,var(--danger)_8%,transparent)]",
                FOCUS,
                settled && "invisible",
              )}
            >
              No, it&apos;s not me
            </button>
          )}
        </div>
        <span aria-hidden className="relative block h-0.5 bg-hairline">
          <span
            ref={barRef}
            className={cn(
              "absolute inset-0 origin-left bg-[var(--nm-accent)] transition-opacity duration-300",
              status !== "waiting" && "opacity-0",
            )}
          />
        </span>
      </div>
    </section>
  );

  const drawn = line ? halves(line) : null;
  const strokeTone =
    line?.kind === "match" ? "var(--success)" : "var(--danger)";

  return (
    <div
      ref={rootRef}
      className={cn("@container relative w-full", className)}
      style={vars}
    >
      <div
        className={cn(
          "flex flex-col gap-4",
          layout === "overlap"
            ? "@min-[36rem]:grid @min-[36rem]:grid-cols-[minmax(0,1fr)_6rem_10rem] @min-[36rem]:items-center @min-[36rem]:gap-0"
            : "@min-[36rem]:grid @min-[36rem]:items-center @min-[36rem]:gap-8",
          layout === "split" &&
            "@min-[36rem]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]",
          layout === "mirror" &&
            "@min-[36rem]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]",
        )}
      >
        <div
          className={cn(
            "min-w-0",
            layout === "overlap" &&
              "@min-[36rem]:col-start-1 @min-[36rem]:col-end-3 @min-[36rem]:row-start-1",
            layout === "mirror" && "@min-[36rem]:order-2",
          )}
        >
          {laptop}
        </div>
        <div
          className={cn(
            "min-w-0",
            layout === "overlap" &&
              "relative z-10 @min-[36rem]:col-start-2 @min-[36rem]:col-end-4 @min-[36rem]:row-start-1",
            layout === "mirror" && "@min-[36rem]:order-1",
          )}
        >
          {phone}
        </div>
      </div>

      {drawn && line ? (
        <svg
          aria-hidden
          width={line.w}
          height={line.h}
          viewBox={`0 0 ${line.w} ${line.h}`}
          className="pointer-events-none absolute top-0 left-0 z-20 overflow-hidden"
        >
          {[drawn.fromA, drawn.fromB].map((d, i) => (
            <motion.path
              key={`${round}-${i}-${line.kind}`}
              d={d}
              fill="none"
              stroke={strokeTone}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray={
                !motionSafe && line.kind === "miss" ? "4 6" : undefined
              }
              initial={
                motionSafe
                  ? { pathLength: 0, opacity: 1 }
                  : { pathLength: 1, opacity: 0 }
              }
              animate={
                !motionSafe
                  ? { pathLength: 1, opacity: line.kind === "miss" ? 0.6 : 1 }
                  : line.kind === "match"
                    ? { pathLength: 1, opacity: 1 }
                    : { pathLength: [0, 0.82, 0.5], opacity: [1, 1, 0.35] }
              }
              transition={
                !motionSafe
                  ? { duration: durations.base }
                  : line.kind === "match"
                    ? springs.glide
                    : { duration: 0.75, times: [0, 0.5, 1], ease: easings.move }
              }
            />
          ))}
          {[line.a, line.b].map((p, i) => (
            <motion.circle
              key={`${round}-end-${i}`}
              cx={p.x}
              cy={p.y}
              r={3.5}
              fill={strokeTone}
              initial={{ scale: motionSafe ? 0 : 1 }}
              animate={{ scale: 1 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
              style={{ originX: 0.5, originY: 0.5 }}
            />
          ))}
          {line.kind === "match" ? (
            <motion.circle
              key={`${round}-meet`}
              cx={drawn.mid.x}
              cy={drawn.mid.y}
              r={5}
              fill="var(--success)"
              stroke="var(--bg-1)"
              strokeWidth={2}
              initial={{ scale: motionSafe ? 0 : 1 }}
              animate={{ scale: 1 }}
              transition={
                motionSafe ? { ...springs.recoil, delay: 0.3 } : { duration: 0 }
              }
              style={{ originX: 0.5, originY: 0.5 }}
            />
          ) : null}
        </svg>
      ) : null}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
