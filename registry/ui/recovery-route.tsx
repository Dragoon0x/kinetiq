"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import {
  Check,
  KeyRound,
  LifeBuoy,
  LoaderCircle,
  LockKeyhole,
  Mail,
  RotateCcw,
  TriangleAlert,
  UserRound,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type RecoveryKind = "code" | "email" | "contact" | "support";

export type RecoveryMethod = {
  id: string;
  /** Which way back in this is; picks the icon and the steps. */
  kind: RecoveryKind;
  label: string;
  /** One line under the label. */
  detail?: string;
  /** How long it takes, as the card says it: "Instant", "~5 min". */
  wait: string;
  /** The same wait in minutes, for "Expected by …". */
  waitMinutes?: number;
  /** Who or where it goes: a masked address or a contact's name. */
  target?: string;
  /** Titles for the steps, in order, replacing the defaults. */
  steps?: string[];
  /** Whether it is set up. @default true */
  available?: boolean;
  /** Why it is not set up, shown on the greyed card. */
  reason?: string;
};

export type RecoveryInput = {
  /** Which step was submitted, from 0. */
  stage: number;
  code?: string;
  message?: string;
};

export type RecoveryAccount = { name: string; email: string };
export type RecoveryRouteStyle = "curve" | "dotted" | "metro";
export type RecoveryDensity = "compact" | "cozy" | "roomy";
export type RecoveryTone = "calm" | "warm" | "plain";
export type RecoveryStatus = "ready" | "loading" | "error";

export type RecoveryRouteProps = {
  /** The ways back in. @default defaultRecoveryMethods */
  methods?: RecoveryMethod[];
  /** The locked account. @default defaultRecoveryAccount */
  account?: RecoveryAccount;
  /** The clock every "expected by" is counted from, epoch ms. @default defaultRecoveryNow */
  now?: number;
  /** Controlled chosen method. */
  value?: string | null;
  /** Initial chosen method when uncontrolled. @default null */
  defaultValue?: string | null;
  /** Fires with the id from the press or arrow that chose a method. */
  onValueChange?: (id: string) => void;
  /** Fires with the method from the press or arrow that chose it. */
  onChoose?: (method: RecoveryMethod) => void;
  /** A step was submitted. A promise holds its button; a rejection keeps the step with its message. */
  onSubmit?: (
    method: RecoveryMethod,
    input: RecoveryInput,
  ) => void | Promise<void>;
  /** "Contact support" was pressed. */
  onContactSupport?: () => void;
  /** Whether the methods have loaded. @default "ready" */
  status?: RecoveryStatus;
  /** "Try again" was pressed after loading failed. */
  onRetry?: () => void;
  /** The route: a smooth curve, round dots, or an orthogonal metro line. @default "curve" */
  routeStyle?: RecoveryRouteStyle;
  /** Card padding, gaps and type size. @default "cozy" */
  density?: RecoveryDensity;
  /** The route, your node, the chosen card's edge and the buttons: cobalt, amber or ink. @default "calm" */
  tone?: RecoveryTone;
  /** Writes an expected time. @default UTC, "today 09:35" or "Thu 09:30" */
  formatTime?: (at: number, now: number) => string;
  /** The heading. @default "Locked out of {email}?" */
  title?: string;
  /** Tallest the panel grows before its body scrolls, px. @default 560 */
  maxHeight?: number;
  /** Nothing can be chosen or submitted. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** Monday 12 October 2026, 09:30 UTC. */
export const defaultRecoveryNow = Date.UTC(2026, 9, 12, 9, 30);

export const defaultRecoveryAccount: RecoveryAccount = {
  name: "Mara Okafor",
  email: "mara@fieldline.io",
};

export const defaultRecoveryMethods: RecoveryMethod[] = [
  {
    id: "backup",
    kind: "code",
    label: "Backup code",
    detail: "One of the ten you saved",
    wait: "Instant",
    waitMinutes: 0,
  },
  {
    id: "email",
    kind: "email",
    label: "Recovery email",
    detail: "A link to m••••@coldbrook.co",
    target: "m••••@coldbrook.co",
    wait: "~5 min",
    waitMinutes: 5,
  },
  {
    id: "contact",
    kind: "contact",
    label: "Trusted contact",
    detail: "Ana Ferreira confirms it’s you",
    target: "Ana Ferreira",
    wait: "Up to 24 h",
    waitMinutes: 24 * 60,
  },
  {
    id: "support",
    kind: "support",
    label: "Support review",
    detail: "We check your identity by hand",
    wait: "2–3 days",
    waitMinutes: 3 * 24 * 60,
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const r2 = (v: number) => Math.round(v * 100) / 100;

const TONE: Record<RecoveryTone, string> = {
  calm: "var(--accent-bright)",
  warm: "var(--warn)",
  plain: "var(--foreground)",
};

/** A filled button in the tone, deep enough for white, with ink that adapts. */
const FILL = "color-mix(in oklab, var(--rr-tone) 86%, black)";
const ON_FILL = `oklch(from ${FILL} clamp(0.18, (0.7 - l) * 100, 0.99) 0.02 h)`;

const ICON: Record<RecoveryKind, typeof KeyRound> = {
  code: KeyRound,
  email: Mail,
  contact: UserRound,
  support: LifeBuoy,
};

const DENSITY: Record<
  RecoveryDensity,
  { card: string; text: string; gap: string; pad: string }
> = {
  compact: {
    card: "px-2.5 py-2",
    text: "text-[12.5px]",
    gap: "gap-1.5",
    pad: "p-4",
  },
  cozy: { card: "px-3 py-2.5", text: "text-[13px]", gap: "gap-2", pad: "p-5" },
  roomy: {
    card: "px-3.5 py-3.5",
    text: "text-[14px]",
    gap: "gap-2.5",
    pad: "p-6",
  },
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** UTC on both sides of hydration, so the words never differ. */
export const recoveryTime = (at: number, now: number): string => {
  const a = new Date(at);
  const n = new Date(now);
  const hhmm = `${String(a.getUTCHours()).padStart(2, "0")}:${String(
    a.getUTCMinutes(),
  ).padStart(2, "0")}`;
  const sameDay =
    a.getUTCFullYear() === n.getUTCFullYear() &&
    a.getUTCMonth() === n.getUTCMonth() &&
    a.getUTCDate() === n.getUTCDate();
  return sameDay ? `today ${hhmm}` : `${DAYS[a.getUTCDay()] ?? ""} ${hhmm}`;
};

type Step = {
  title: string;
  body: string;
  /** What this step asks for; null is a step you only read. */
  action: "code" | "send" | "resend" | "message" | "wait" | null;
  button?: string;
  /** The input's label. */
  field?: string;
};

const stepsFor = (method: RecoveryMethod, email: string): Step[] => {
  const t = method.target;
  const base: Step[] =
    method.kind === "code"
      ? [
          {
            title: "Find your backup codes",
            body: "You saved ten when you turned on two-step sign-in.",
            action: null,
          },
          {
            title: "Enter one code",
            body: "Each code works once.",
            action: "code",
            button: "Use code",
            field: "Backup code",
          },
        ]
      : method.kind === "email"
        ? [
            {
              title: "Send a link",
              body: `To ${t ?? "your recovery address"}. It works for 30 minutes.`,
              action: "send",
              button: "Send link",
            },
            {
              title: "Open it on this device",
              body: "The link signs you in and asks for a new password.",
              action: "resend",
              button: "Resend link",
            },
          ]
        : method.kind === "contact"
          ? [
              {
                title: `Ask ${t ?? "your contact"}`,
                body: "They get a request in their app with a short code.",
                action: "send",
                button: "Send request",
              },
              {
                title: "Enter the code they read to you",
                body: "It lasts 15 minutes.",
                action: "code",
                button: "Check code",
                field: "Code from your contact",
              },
            ]
          : [
              {
                title: "Tell us what happened",
                body: "Anything that helps us know it’s you: devices, places, recent payments.",
                action: "message",
                button: "Request review",
                field: "What happened",
              },
              {
                title: "We check it by hand",
                body: `We’ll write to ${email} with the outcome.`,
                action: "wait",
              },
            ];
  return base.map((s, i) => ({ ...s, title: method.steps?.[i] ?? s.title }));
};

const firstAction = (steps: Step[]) => {
  const i = steps.findIndex((s) => s.action !== null);
  return i < 0 ? 0 : i;
};

/** Formats a backup code as it is typed: xxxx-xxxx. */
const shapeCode = (raw: string) => {
  const clean = raw
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase()
    .slice(0, 8);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
};

type Geometry = {
  wide: boolean;
  width: number;
  height: number;
  /** Your node's centre. */
  cy: number;
  anchors: Record<string, number>;
};

/** The route from you to a method's notch, in the route column's space. */
const routePath = (
  style: RecoveryRouteStyle,
  g: Geometry,
  ey: number,
): string => {
  const y = r2(ey);
  if (!g.wide) {
    // Down the gutter, then an elbow into the card.
    if (style === "metro") {
      return `M14 -12 V${r2(y - 8)} Q14 ${y} 22 ${y} H${g.width}`;
    }
    return `M14 -12 V${r2(y - 14)} C14 ${r2(y - 4)} 18 ${y} ${g.width} ${y}`;
  }
  const sx = 42;
  const sy = r2(g.cy);
  const ex = g.width;
  if (style === "metro") {
    const dy = y - sy;
    if (Math.abs(dy) < 1) return `M${sx} ${sy} H${ex}`;
    const mx = r2(sx + (ex - sx) * 0.42);
    const rad = Math.min(9, Math.abs(dy) / 2);
    const s = Math.sign(dy);
    return `M${sx} ${sy} H${r2(mx - rad)} Q${mx} ${sy} ${mx} ${r2(sy + s * rad)} V${r2(y - s * rad)} Q${mx} ${y} ${r2(mx + rad)} ${y} H${ex}`;
  }
  const mx = r2((sx + ex) / 2);
  return `M${sx} ${sy} C${mx} ${sy} ${mx} ${y} ${ex} ${y}`;
};

/* ----------------------------------------------------------------------- */
/*                               Small parts                                */
/* ----------------------------------------------------------------------- */

function YouNode({ initials }: { initials: string }) {
  return (
    <span
      aria-hidden
      className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[10px] font-semibold text-ink-2 ring-2 ring-[color-mix(in_oklab,var(--rr-tone)_55%,transparent)] ring-offset-2 ring-offset-card"
    >
      {initials}
      <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-card">
        <LockKeyhole className="size-2.5 text-[color:var(--rr-tone)]" />
      </span>
    </span>
  );
}

function StepMark({
  index,
  state,
  motionSafe,
}: {
  index: number;
  state: "done" | "current" | "later" | "note";
  motionSafe: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] tabular-nums transition-colors",
        state === "done" &&
          "bg-[color-mix(in_oklab,var(--success)_18%,transparent)] text-success",
        state === "current" &&
          "bg-[color-mix(in_oklab,var(--rr-tone)_16%,transparent)] text-[color:var(--rr-tone)] ring-1 ring-[color-mix(in_oklab,var(--rr-tone)_50%,transparent)]",
        (state === "later" || state === "note") && "bg-surface-2 text-ink-3",
      )}
    >
      {state === "done" ? (
        <svg viewBox="0 0 16 16" className="size-3">
          <motion.path
            d="M3.5 8.5l3 3 6-7"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: motionSafe ? 0 : 1 }}
            animate={{ pathLength: 1 }}
            transition={motionSafe ? springs.flick : { duration: 0 }}
          />
        </svg>
      ) : (
        index + 1
      )}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

/**
 * An account recovery chooser drawn as a map: you on one side, the ways
 * back in on the other — backup code, recovery email, trusted contact,
 * support review — each saying how long it takes. Faint dotted branches show
 * every way that is open.
 *
 * Choosing a method draws the route from you to its card: the path is
 * revealed along its own length by a mask whose stroke runs 0→1 on
 * `springs.glide`, a small traveller rides the leading point, and the card's
 * notch answers with a ring that pops on `springs.snap`. The route is
 * measured from the cards, so it lands on the notch at any width, and below
 * 44rem of container it runs down a gutter beside the list. The steps slide
 * in from the side the choice came from, under an honest wait — "by Thu
 * 09:30", counted from `now`.
 *
 * The methods are a real radio group (arrows choose and skip the ones not
 * set up, which stay readable with their reason). Every step submits through
 * `onSubmit`; a rejection keeps the step and what was typed. Under reduced
 * motion the route appears whole, the steps cross-fade, and the checks and
 * waits still show.
 */
export function RecoveryRoute({
  methods = defaultRecoveryMethods,
  account = defaultRecoveryAccount,
  now = defaultRecoveryNow,
  value,
  defaultValue = null,
  onValueChange,
  onChoose,
  onSubmit,
  onContactSupport,
  status = "ready",
  onRetry,
  routeStyle = "curve",
  density = "cozy",
  tone = "calm",
  formatTime = recoveryTime,
  title,
  maxHeight = 560,
  disabled = false,
  className,
}: RecoveryRouteProps) {
  const motionSafe = useMotionSafe();
  const rawId = React.useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const d = DENSITY[density] ?? DENSITY.cozy;

  const [own, setOwn] = React.useState<string | null>(defaultValue);
  const chosenId = value === undefined ? own : value;
  const chosen =
    methods.find((m) => m.id === chosenId && m.available !== false) ?? null;
  const usable = methods.filter((m) => m.available !== false);
  const focusId = chosen?.id ?? usable[0]?.id ?? null;

  const [progress, setProgress] = React.useState<Record<string, number>>({});
  const [finished, setFinished] = React.useState<Record<string, boolean>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [texts, setTexts] = React.useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = React.useState("");
  const [geo, setGeo] = React.useState<Geometry | null>(null);
  const [seen, setSeen] = React.useState(false);
  const [arrived, setArrived] = React.useState<string | null>(null);
  /** -1 when the new choice sits above the last one, 1 below. */
  const [direction, setDirection] = React.useState(1);
  /** The route being let go of: it retracts toward you as the new one draws. */
  const [leaving, setLeaving] = React.useState<{
    d: string;
    key: number;
  } | null>(null);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const routeColRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const stepsRef = React.useRef<HTMLDivElement | null>(null);
  const routeRef = React.useRef<SVGPathElement | null>(null);
  const cardRefs = React.useRef(new Map<string, HTMLDivElement>());
  /** The step state focus was last placed for. */
  const placedFor = React.useRef({ progress, finished });

  const draw = useMotionValue(0);
  const tx = useMotionValue(0);
  const ty = useMotionValue(0);
  const travellerOpacity = useTransform(draw, (v) =>
    v <= 0.02 || v >= 0.98 ? 0 : 1,
  );

  // The route's geometry, measured from the cards themselves.
  React.useEffect(() => {
    const col = routeColRef.current;
    const list = listRef.current;
    if (!col || !list) return;
    const measure = () => {
      const anchors: Record<string, number> = {};
      for (const [id, el] of cardRefs.current) {
        anchors[id] = r2(el.offsetTop + el.offsetHeight / 2);
      }
      const width = col.offsetWidth;
      const height = list.offsetHeight;
      setGeo((g) => {
        const next: Geometry = {
          wide: width > 60,
          width,
          height,
          cy: r2(height / 2),
          anchors,
        };
        if (
          g &&
          g.wide === next.wide &&
          g.width === next.width &&
          g.height === next.height &&
          Object.keys(anchors).every((k) => g.anchors[k] === anchors[k])
        ) {
          return g;
        }
        return next;
      });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(col);
    ro.observe(list);
    for (const el of cardRefs.current.values()) ro.observe(el);
    return () => ro.disconnect();
  }, [methods, density, status]);

  // The first route waits until the map is actually on screen.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || seen) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true);
        io.disconnect();
      }
    });
    io.observe(root);
    return () => io.disconnect();
  }, [seen]);

  const hasGeo = geo !== null;
  // Draw the route: one plain number on glide, written to the mask's stroke
  // and to the traveller riding its leading point.
  React.useEffect(() => {
    if (!chosen || !hasGeo || !seen) return;
    const id = chosen.id;
    const place = (v: number) => {
      draw.set(v);
      const path = routeRef.current;
      if (!path) return;
      const length = path.getTotalLength();
      const pt = path.getPointAtLength(Math.min(1, Math.max(0, v)) * length);
      tx.set(r2(pt.x));
      ty.set(r2(pt.y));
    };
    if (!motionSafe) {
      place(1);
      const t = window.setTimeout(() => setArrived(id), 0);
      return () => window.clearTimeout(t);
    }
    place(0);
    const controls = animate(0, 1, {
      ...springs.glide,
      onUpdate: place,
      onComplete: () => {
        place(1);
        setArrived(id);
      },
    });
    return () => {
      // A re-run finishes the stroke rather than leaving it half drawn.
      controls.stop();
      place(1);
    };
  }, [chosen, hasGeo, seen, motionSafe, draw, tx, ty]);

  // The control that was pressed leaves with its step and focus falls to
  // the page: it moves to the next step's own control once that has
  // arrived, or to the panel itself.
  React.useEffect(() => {
    const last = placedFor.current;
    if (last.progress === progress && last.finished === finished) return;
    placedFor.current = { progress, finished };
    const lost =
      !document.activeElement || document.activeElement === document.body;
    const region = stepsRef.current;
    if (!lost || !region) return;
    const next = region.querySelector<HTMLElement>("[data-rr-action]");
    (next ?? region).focus({ preventScroll: true });
  }, [progress, finished]);

  const choose = (method: RecoveryMethod, from: "pointer" | "key") => {
    if (disabled || method.available === false || status !== "ready") return;
    if (method.id === chosenId) return;
    const prev = methods.findIndex((m) => m.id === chosenId);
    const next = methods.findIndex((m) => m.id === method.id);
    setDirection(prev < 0 || next > prev ? 1 : -1);
    setArrived(null);
    if (motionSafe && routeD) {
      setLeaving((l) => ({ d: routeD, key: (l?.key ?? 0) + 1 }));
    }
    if (value === undefined) setOwn(method.id);
    onValueChange?.(method.id);
    onChoose?.(method);
    setAnnouncement(`${method.label}. ${waitPhrase(method)}.`);
    if (from === "pointer") {
      // On a narrow card the steps sit under the list: bring them up.
      window.requestAnimationFrame(() => {
        const scroller = scrollRef.current;
        const steps = stepsRef.current;
        if (!scroller || !steps || geo?.wide) return;
        const over =
          steps.getBoundingClientRect().top -
          scroller.getBoundingClientRect().bottom +
          96;
        if (over > 0) {
          scroller.scrollBy({
            top: over,
            behavior: motionSafe ? "smooth" : "auto",
          });
        }
      });
    }
  };

  const waitPhrase = (method: RecoveryMethod) => {
    const m = method.waitMinutes;
    if (m === 0) return "No wait";
    if (m !== undefined && m < 60) return `About ${m} minutes`;
    return `Expected wait ${method.wait.toLowerCase()}`;
  };

  const waitLine = (method: RecoveryMethod) => {
    const m = method.waitMinutes;
    if (m === 0) return "No wait · about a minute of your time";
    if (m === undefined) return `Expected wait: ${method.wait}`;
    const by = formatTime(now + m * 60_000, now);
    if (m < 60) return `Expected wait: about ${m} minutes · by ${by}`;
    return `Expected wait: ${method.wait.toLowerCase().replace("~", "about ")} · by ${by}`;
  };

  const onGroupKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (usable.length === 0) return;
    const at = Math.max(
      0,
      usable.findIndex((m) => m.id === focusId),
    );
    let target: RecoveryMethod | undefined;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      target = usable[(at + 1) % usable.length];
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      target = usable[(at - 1 + usable.length) % usable.length];
    } else if (event.key === "Home") target = usable[0];
    else if (event.key === "End") target = usable[usable.length - 1];
    else if (event.key === " " || event.key === "Enter") {
      const current = usable[at];
      if (current) {
        event.preventDefault();
        choose(current, "key");
      }
      return;
    } else return;
    event.preventDefault();
    if (!target) return;
    choose(target, "key");
    cardRefs.current.get(target.id)?.focus();
  };

  const submit = (method: RecoveryMethod, steps: Step[]) => {
    if (disabled || busy) return;
    const stage = progress[method.id] ?? firstAction(steps);
    const step = steps[stage];
    if (!step || step.action === null || step.action === "wait") return;
    const typed = texts[method.id] ?? "";
    const input: RecoveryInput = { stage };
    if (step.action === "code") {
      const clean = typed.replace(/[^a-z0-9]/gi, "");
      if (clean.length < 6) {
        setErrors((e) => ({ ...e, [method.id]: "Enter the whole code." }));
        return;
      }
      input.code = typed;
    }
    if (step.action === "message") {
      if (typed.trim().length < 12) {
        setErrors((e) => ({
          ...e,
          [method.id]: "A sentence or two helps us check it’s you.",
        }));
        return;
      }
      input.message = typed.trim();
    }
    setErrors((e) => {
      if (!(method.id in e)) return e;
      const next = { ...e };
      delete next[method.id];
      return next;
    });
    const advance = () => {
      const last = stage >= steps.length - 1;
      const following = steps[stage + 1];
      if (step.action === "resend") {
        setAnnouncement("Link sent again.");
        return;
      }
      if (!last) {
        setProgress((p) => ({ ...p, [method.id]: stage + 1 }));
        setTexts((t) => ({ ...t, [method.id]: "" }));
        setAnnouncement(
          `Step ${stage + 1} done. Next: ${following?.title ?? ""}.`,
        );
      } else {
        setFinished((f) => ({ ...f, [method.id]: true }));
        setAnnouncement(
          method.kind === "code" || method.kind === "contact"
            ? "You’re back in."
            : "Done.",
        );
      }
    };
    const result = onSubmit?.(method, input);
    if (result && typeof (result as Promise<void>).then === "function") {
      setBusy(method.id);
      (result as Promise<void>).then(
        () => {
          setBusy(null);
          advance();
        },
        (reason: unknown) => {
          setBusy(null);
          const message =
            reason instanceof Error && reason.message
              ? reason.message
              : "That didn’t go through. Try again.";
          setErrors((e) => ({ ...e, [method.id]: message }));
          setAnnouncement(message);
        },
      );
    } else {
      advance();
    }
  };

  const toneVar = TONE[tone] ?? TONE.calm;
  const heading = title ?? `Locked out of ${account.email}?`;
  const initials = account.name
    .split(/\s+/)
    .map((p) => p.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const routeD =
    chosen && geo
      ? routePath(routeStyle, geo, geo.anchors[chosen.id] ?? 0)
      : "";

  /* ----------------------------- the steps ----------------------------- */

  const renderSteps = (method: RecoveryMethod) => {
    const steps = stepsFor(method, account.email);
    const stage = progress[method.id] ?? firstAction(steps);
    const done = Boolean(finished[method.id]);
    const error = errors[method.id];
    const pending = busy === method.id;
    const step = cascade(steps.length + 2);
    const typed = texts[method.id] ?? "";
    const errorId = `${uid}-${method.id}-error`;
    const fieldId = `${uid}-${method.id}-field`;
    const enter = (i: number) =>
      motionSafe
        ? {
            initial: { opacity: 0, y: distances.nudge },
            animate: { opacity: 1, y: 0 },
            transition: {
              y: { ...springs.glide, delay: 0.08 + i * step },
              opacity: {
                duration: durations.base,
                ease: easings.enter,
                delay: 0.08 + i * step,
              },
            },
          }
        : {
            initial: { opacity: 0 },
            animate: { opacity: 1 },
            transition: { duration: durations.fast },
          };

    return (
      <motion.div
        key={method.id}
        initial={
          motionSafe
            ? { opacity: 0, x: direction * distances.shift }
            : { opacity: 0 }
        }
        animate={{ opacity: 1, x: 0 }}
        transition={
          motionSafe
            ? {
                x: springs.glide,
                opacity: { duration: durations.base, ease: easings.enter },
              }
            : { duration: durations.fast }
        }
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-0.5">
          <h3 className="text-[14px] leading-5 font-semibold">
            {method.label}
          </h3>
          <p className="flex items-center gap-1.5 font-mono text-[10.5px] leading-4 text-ink-2">
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-[var(--rr-tone)]"
            />
            {waitLine(method)}
          </p>
        </div>
        <ol role="list" className="flex flex-col gap-3">
          {steps.map((s, i) => {
            const state: "done" | "current" | "later" | "note" =
              done || i < stage
                ? s.action === null
                  ? "note"
                  : "done"
                : i === stage
                  ? "current"
                  : "later";
            const active = !done && i === stage;
            return (
              <motion.li
                key={i}
                {...enter(i)}
                aria-current={active ? "step" : undefined}
                className="flex gap-2.5"
              >
                <StepMark index={i} state={state} motionSafe={motionSafe} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span
                    className={cn(
                      "text-[13px] leading-5 font-medium",
                      state === "later" ? "text-ink-3" : "text-foreground",
                    )}
                  >
                    {s.title}
                  </span>
                  <span className="text-[12px] leading-4 text-ink-2">
                    {s.body}
                  </span>
                  {active && (s.action === "code" || s.action === "message") ? (
                    <div className="mt-1.5 flex flex-col gap-1.5">
                      <label htmlFor={fieldId} className="sr-only">
                        {s.field}
                      </label>
                      {s.action === "code" ? (
                        <input
                          id={fieldId}
                          data-rr-action=""
                          value={typed}
                          inputMode="text"
                          autoComplete="one-time-code"
                          spellCheck={false}
                          placeholder="xxxx-xxxx"
                          disabled={disabled}
                          aria-invalid={error ? true : undefined}
                          aria-describedby={error ? errorId : undefined}
                          onChange={(event) => {
                            const next = shapeCode(event.currentTarget.value);
                            setTexts((t) => ({ ...t, [method.id]: next }));
                            if (error) {
                              setErrors((e) => {
                                const copy = { ...e };
                                delete copy[method.id];
                                return copy;
                              });
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              submit(method, steps);
                            }
                          }}
                          className={cn(
                            "h-9 w-full max-w-[13rem] rounded-2 border bg-surface-0 px-2.5 font-mono text-[13px] tracking-[0.06em] text-foreground placeholder:text-ink-3",
                            "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
                            error ? "border-danger" : "border-input",
                          )}
                        />
                      ) : (
                        <textarea
                          id={fieldId}
                          data-rr-action=""
                          value={typed}
                          rows={3}
                          disabled={disabled}
                          placeholder="I lost my phone on the train on Friday…"
                          aria-invalid={error ? true : undefined}
                          aria-describedby={error ? errorId : undefined}
                          onChange={(event) => {
                            const next = event.currentTarget.value;
                            setTexts((t) => ({ ...t, [method.id]: next }));
                          }}
                          className={cn(
                            "w-full resize-none rounded-2 border bg-surface-0 px-2.5 py-2 text-[13px] leading-5 text-foreground placeholder:text-ink-3",
                            "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
                            error ? "border-danger" : "border-input",
                          )}
                        />
                      )}
                    </div>
                  ) : null}
                  {active && error ? (
                    <motion.p
                      id={errorId}
                      role="alert"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      transition={
                        motionSafe
                          ? {
                              height: springs.glide,
                              opacity: { duration: durations.fast },
                            }
                          : { duration: 0 }
                      }
                      className="flex items-start gap-1.5 overflow-hidden text-[12px] leading-4 text-danger"
                    >
                      <TriangleAlert
                        aria-hidden
                        className="mt-px size-3.5 shrink-0"
                      />
                      {error}
                    </motion.p>
                  ) : null}
                  {active && s.button ? (
                    <span className="mt-1.5 flex">
                      <button
                        type="button"
                        data-rr-action=""
                        onClick={() => submit(method, steps)}
                        aria-disabled={disabled || pending || undefined}
                        aria-busy={pending || undefined}
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-[12.5px] font-medium transition-[filter] hover:brightness-110",
                          FOCUS,
                          (disabled || pending) && "cursor-default opacity-80",
                        )}
                        style={{ backgroundColor: FILL, color: ON_FILL }}
                      >
                        {pending ? (
                          <LoaderCircle
                            aria-hidden
                            className={cn(
                              "size-3.5",
                              motionSafe && "animate-spin",
                            )}
                          />
                        ) : null}
                        {pending ? "Checking…" : s.button}
                      </button>
                    </span>
                  ) : null}
                </div>
              </motion.li>
            );
          })}
        </ol>
        {done && (method.kind === "code" || method.kind === "contact") ? (
          <motion.p
            {...enter(steps.length)}
            className="flex items-center gap-2 rounded-2 bg-[color-mix(in_oklab,var(--success)_12%,transparent)] px-3 py-2 text-[12.5px] text-success"
          >
            <Check aria-hidden className="size-4 shrink-0" />
            You’re back in. Set a new password next.
          </motion.p>
        ) : null}
      </motion.div>
    );
  };

  /* ---------------------------- the surface ---------------------------- */

  return (
    <div
      ref={rootRef}
      className={cn("@container relative w-full text-foreground", className)}
      style={{ "--rr-tone": toneVar } as React.CSSProperties}
    >
      <div
        className="mx-auto flex w-full max-w-[60rem] flex-col overflow-hidden rounded-4 border border-hairline bg-card"
        style={{ maxHeight }}
      >
        <header
          className={cn(
            "flex shrink-0 flex-col gap-0.5 border-b border-hairline",
            d.pad,
            "pb-4",
          )}
        >
          <h2 className="text-[17px] leading-6 font-semibold break-words">
            {heading}
          </h2>
          <p className="text-[12.5px] leading-5 text-ink-2">
            Choose the way back in. Each one says how long it takes.
          </p>
        </header>

        <div
          ref={scrollRef}
          className={cn(
            "flex flex-1 [scrollbar-width:thin] flex-col gap-5 overflow-y-auto overscroll-contain",
            d.pad,
          )}
        >
          {status === "error" ? (
            <div
              role="alert"
              className="flex flex-col items-start gap-3 rounded-3 border border-hairline bg-surface-1 p-4"
            >
              <span className="flex items-center gap-2 text-[13px] text-danger">
                <TriangleAlert aria-hidden className="size-4 shrink-0" />
                Couldn’t load your ways back in.
              </span>
              <button
                type="button"
                onClick={() => onRetry?.()}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-input bg-card px-3 text-[12px] font-medium transition-colors hover:bg-surface-2",
                  FOCUS,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Try again
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-y-0 @min-[44rem]:grid-cols-[7rem_minmax(0,15rem)_minmax(0,1fr)] @min-[44rem]:gap-x-0">
              <div className="col-span-2 flex items-center gap-2.5 pb-3 @min-[44rem]:hidden">
                <span className="flex w-7 justify-center">
                  <YouNode initials={initials} />
                </span>
                <span className="flex min-w-0 flex-col pl-1">
                  <span className="truncate text-[12.5px] font-medium">
                    You
                  </span>
                  <span className="truncate font-mono text-[10.5px] text-ink-3">
                    {account.email}
                  </span>
                </span>
              </div>

              <div ref={routeColRef} aria-hidden className="relative">
                {geo ? (
                  <svg
                    width={geo.width}
                    height={geo.height}
                    viewBox={`0 0 ${geo.width} ${geo.height}`}
                    className="absolute top-0 left-0 overflow-visible"
                  >
                    <defs>
                      <mask
                        id={`${uid}-reveal`}
                        maskUnits="userSpaceOnUse"
                        x={-20}
                        y={-20}
                        width={geo.width + 40}
                        height={geo.height + 40}
                      >
                        {routeD ? (
                          <motion.path
                            d={routeD}
                            fill="none"
                            stroke="white"
                            strokeWidth={12}
                            strokeLinecap="round"
                            style={{ pathLength: draw }}
                          />
                        ) : null}
                      </mask>
                      {leaving ? (
                        <mask
                          id={`${uid}-leave`}
                          maskUnits="userSpaceOnUse"
                          x={-20}
                          y={-20}
                          width={geo.width + 40}
                          height={geo.height + 40}
                        >
                          <motion.path
                            key={leaving.key}
                            d={leaving.d}
                            fill="none"
                            stroke="white"
                            strokeWidth={12}
                            strokeLinecap="round"
                            initial={{ pathLength: 1 }}
                            animate={{ pathLength: 0 }}
                            transition={{
                              duration: durations.base,
                              ease: easings.exit,
                            }}
                            onAnimationComplete={() =>
                              setLeaving((l) =>
                                l && l.key === leaving.key ? null : l,
                              )
                            }
                          />
                        </mask>
                      ) : null}
                    </defs>
                    {usable.map((m) => (
                      <path
                        key={m.id}
                        d={routePath(routeStyle, geo, geo.anchors[m.id] ?? 0)}
                        fill="none"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeDasharray="0.5 5"
                        className="stroke-hairline-strong"
                      />
                    ))}
                    {leaving ? (
                      <motion.g
                        key={leaving.key}
                        mask={`url(#${uid}-leave)`}
                        initial={{ opacity: 1 }}
                        animate={{ opacity: 0 }}
                        transition={{
                          duration: durations.base,
                          ease: easings.exit,
                        }}
                      >
                        <path
                          d={leaving.d}
                          fill="none"
                          stroke="var(--rr-tone)"
                          strokeWidth={
                            routeStyle === "metro"
                              ? 4
                              : routeStyle === "dotted"
                                ? 3
                                : 2
                          }
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeDasharray={
                            routeStyle === "dotted" ? "0.1 6" : undefined
                          }
                        />
                      </motion.g>
                    ) : null}
                    {routeD ? (
                      <g mask={`url(#${uid}-reveal)`}>
                        <path
                          ref={routeRef}
                          d={routeD}
                          fill="none"
                          stroke="var(--rr-tone)"
                          strokeWidth={
                            routeStyle === "metro"
                              ? 4
                              : routeStyle === "dotted"
                                ? 3
                                : 2
                          }
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeDasharray={
                            routeStyle === "dotted" ? "0.1 6" : undefined
                          }
                        />
                        {routeStyle === "metro" ? (
                          <path
                            d={routeD}
                            fill="none"
                            strokeWidth={1.2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="stroke-card"
                          />
                        ) : null}
                      </g>
                    ) : null}
                    {routeD && motionSafe ? (
                      <motion.circle
                        cx={tx}
                        cy={ty}
                        r={4}
                        stroke="var(--rr-tone)"
                        strokeWidth={2}
                        className="fill-card"
                        style={{ opacity: travellerOpacity }}
                      />
                    ) : null}
                  </svg>
                ) : null}
                {geo?.wide ? (
                  <span
                    className="absolute left-2 flex flex-col items-center gap-1"
                    style={{ top: r2(geo.cy - 16) }}
                  >
                    <YouNode initials={initials} />
                    <span className="font-mono text-[9.5px] tracking-[0.08em] text-ink-3 uppercase">
                      You
                    </span>
                  </span>
                ) : null}
              </div>

              <div
                ref={listRef}
                role="radiogroup"
                aria-label="Ways back in"
                aria-busy={status === "loading" || undefined}
                onKeyDown={onGroupKey}
                className={cn("relative flex flex-col", d.gap)}
              >
                {status === "loading"
                  ? [0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={cn(
                          "flex items-center gap-3 rounded-3 border border-hairline bg-surface-1",
                          d.card,
                        )}
                      >
                        <span className="size-7 rounded-2 bg-surface-2" />
                        <span className="flex flex-1 flex-col gap-1.5">
                          <span className="h-2.5 w-1/2 rounded-full bg-surface-2" />
                          <span className="h-2 w-3/4 rounded-full bg-surface-2/70" />
                        </span>
                      </span>
                    ))
                  : methods.map((method) => {
                      const Icon = ICON[method.kind] ?? KeyRound;
                      const off = method.available === false;
                      const checked = chosen?.id === method.id;
                      const reasonId = `${uid}-${method.id}-reason`;
                      return (
                        <div
                          key={method.id}
                          ref={(node) => {
                            if (node) cardRefs.current.set(method.id, node);
                            else cardRefs.current.delete(method.id);
                          }}
                          role="radio"
                          aria-checked={checked}
                          aria-disabled={off || disabled || undefined}
                          aria-describedby={reasonId}
                          tabIndex={!off && method.id === focusId ? 0 : -1}
                          data-rr-method={method.id}
                          onClick={() => choose(method, "pointer")}
                          className={cn(
                            "relative flex cursor-pointer items-center gap-3 rounded-3 border text-left transition-[background-color,border-color] duration-150 select-none",
                            d.card,
                            FOCUS,
                            checked
                              ? "border-[color-mix(in_oklab,var(--rr-tone)_55%,transparent)] bg-[color-mix(in_oklab,var(--rr-tone)_7%,var(--card))]"
                              : "border-hairline bg-surface-1 hover:border-hairline-strong",
                            off &&
                              "cursor-not-allowed bg-transparent opacity-60 hover:border-hairline",
                          )}
                        >
                          {/* The notch the route lands on. */}
                          <span
                            aria-hidden
                            className="absolute top-1/2 -left-[5px] flex size-[9px] -translate-y-1/2 items-center justify-center rounded-full border border-hairline-strong bg-card"
                          >
                            <motion.span
                              className="size-[5px] rounded-full bg-[var(--rr-tone)]"
                              initial={false}
                              animate={{
                                scale: checked && arrived === method.id ? 1 : 0,
                              }}
                              transition={
                                motionSafe ? springs.snap : { duration: 0 }
                              }
                            />
                          </span>
                          {checked && arrived === method.id && motionSafe ? (
                            <motion.span
                              aria-hidden
                              className="pointer-events-none absolute top-1/2 -left-[11px] size-[21px] -translate-y-1/2 rounded-full border-2 border-[var(--rr-tone)]"
                              initial={{ scale: 0.4, opacity: 0.9 }}
                              animate={{ scale: 1.2, opacity: 0 }}
                              transition={{
                                duration: durations.slow,
                                ease: easings.enter,
                              }}
                            />
                          ) : null}
                          <span
                            aria-hidden
                            className={cn(
                              "flex size-7 shrink-0 items-center justify-center rounded-2 transition-colors",
                              checked
                                ? "bg-[color-mix(in_oklab,var(--rr-tone)_16%,transparent)] text-[color:var(--rr-tone)]"
                                : "bg-surface-2 text-ink-2",
                            )}
                          >
                            <Icon className="size-3.5" />
                          </span>
                          <span
                            className={cn(
                              "flex min-w-0 flex-1 flex-col",
                              d.text,
                            )}
                          >
                            <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                              <span className="truncate leading-5 font-medium">
                                {method.label}
                              </span>
                              <span className="shrink-0 font-mono text-[10.5px] text-ink-2 tabular-nums">
                                {method.wait}
                              </span>
                            </span>
                            <span
                              id={reasonId}
                              className="truncate text-[11.5px] leading-4 text-ink-3"
                              title={off ? method.reason : method.detail}
                            >
                              {off
                                ? `Not set up · ${method.reason ?? "add it in Settings"}`
                                : method.detail}
                            </span>
                          </span>
                        </div>
                      );
                    })}
              </div>

              <div
                ref={stepsRef}
                role="region"
                tabIndex={-1}
                aria-label={chosen ? `${chosen.label} steps` : "Steps"}
                className={cn(
                  "col-span-2 rounded-2 pt-5 @min-[44rem]:col-span-1 @min-[44rem]:pt-0 @min-[44rem]:pl-6",
                  FOCUS,
                )}
              >
                {chosen && status === "ready" ? (
                  renderSteps(chosen)
                ) : (
                  <div className="flex h-full flex-col items-start justify-center gap-1.5 rounded-3 border border-dashed border-hairline-strong p-4">
                    <span className="text-[13px] font-medium">
                      Pick a way back in
                    </span>
                    <span className="text-[12px] leading-4 text-ink-3">
                      The quickest is a backup code. If you have none, a
                      recovery email takes a few minutes.
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <p className="border-t border-hairline pt-3 text-[12px] text-ink-3">
            None of these work?{" "}
            <button
              type="button"
              onClick={() => onContactSupport?.()}
              className={cn(
                "rounded-1 font-medium text-[color:var(--rr-tone)] underline-offset-2 hover:underline",
                FOCUS,
              )}
            >
              Contact support
            </button>
          </p>
        </div>
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
