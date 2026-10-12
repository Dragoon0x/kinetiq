"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  ChevronRight,
  RotateCcw,
  Settings,
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

export type PrimerKind = "camera" | "location" | "notifications";
export type PrimerDecision = "granted" | "denied";
/** Permission id to the system's answer; a missing id is undecided. */
export type PrimerDecisions = Record<string, PrimerDecision>;
export type PrimerStatus = "ready" | "loading" | "error";
export type PrimerIllustration = "line" | "filled";
export type PrimerDialogStyle = "sheet" | "centre";
export type PrimerAccent = "cobalt" | "success" | "ink";

/** What the ready card shows once a permission is granted. */
export type PrimerPreview =
  | { kind: "capture"; caption: string; detail: string }
  | { kind: "place"; name: string; distance: string; detail: string }
  | { kind: "notice"; title: string; body: string; when: string };

export type PrimerPermission = {
  id: string;
  /** Picks the illustration and the preview's shape. */
  kind: PrimerKind;
  /** The primer's heading, e.g. "Use the camera". */
  title: string;
  /** The feature it unlocks, e.g. "Photo evidence". */
  feature: string;
  /** Why the app asks, in plain language. */
  reason: string;
  /** What still works, and what does not, if it is declined. */
  ifDeclined: string;
  /** The mock system dialog's question and its small print. */
  systemTitle: string;
  systemBody: string;
  /** The way back after a denial, one step per line. */
  settingsSteps: string[];
  preview: PrimerPreview;
};

export type PrimerChangeReason = "dot" | "key" | "next" | "notNow";

export type PermissionPrimerProps = {
  /** How the illustration is drawn: hairline strokes that draw in, or filled shapes that fade in. @default "line" */
  illustration?: PrimerIllustration;
  /** Where the mock system dialog appears: a sheet rising from the foot, or a card in the centre. @default "sheet" */
  dialogStyle?: PrimerDialogStyle;
  /** The colour of the illustration, the Continue button and a granted dot. @default "cobalt" */
  accent?: PrimerAccent;
  /** The permissions the primer walks through, in carousel order. @default defaultPrimerPermissions */
  permissions?: PrimerPermission[];
  /** Controlled: the id of the permission shown. */
  value?: string;
  /** Initial permission when uncontrolled. @default the first permission */
  defaultValue?: string;
  /** The carousel moved, from a dot, an arrow key, Next or Not now. */
  onChange?: (
    id: string,
    permission: PrimerPermission,
    reason: PrimerChangeReason,
  ) => void;
  /** Controlled: each permission's answer so far. */
  decisions?: PrimerDecisions;
  /** Initial answers when uncontrolled; an id already granted opens on its ready card. @default defaultPrimerDecisions */
  defaultDecisions?: PrimerDecisions;
  /** Fires with every answer so far after one lands. */
  onDecisionsChange?: (decisions: PrimerDecisions) => void;
  /** The system answered: the primer has already settled into its granted or denied state. */
  onDecide?: (permission: PrimerPermission, decision: PrimerDecision) => void;
  /** Continue was pressed and the mock system dialog is up. Return the system's answer, or a promise of it, and the dialog presses that button itself; return nothing and the viewer answers in the mock. @default the viewer answers */
  onAsk?: (
    permission: PrimerPermission,
  ) => PrimerDecision | Promise<PrimerDecision> | void;
  /** Not now was pressed; the carousel moves on to the next permission. */
  onNotNow?: (permission: PrimerPermission) => void;
  /** Open settings was pressed after a denial. */
  onOpenSettings?: (permission: PrimerPermission) => void;
  /** The app's name, as the mock system dialog prints it. @default "Basinworks Field" */
  appName?: string;
  /** Whether the permissions and their state have arrived. @default "ready" */
  status?: PrimerStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Before we ask" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the primer scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be asked, answered or moved. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** The three permissions Basinworks Field asks a crew for on first run. */
export const defaultPrimerPermissions: PrimerPermission[] = [
  {
    id: "camera",
    kind: "camera",
    title: "Use the camera",
    feature: "Photo evidence",
    reason:
      "Attach a photo to each job sheet, so the office can sign it off without a second site visit.",
    ifDeclined:
      "Job sheets still work. Photos would have to be added later, from the office.",
    systemTitle: "would like to access the camera",
    systemBody:
      "Photos are attached to your job sheets and are not uploaded until you submit.",
    settingsSteps: ["Open Settings", "Find Basinworks Field", "Turn Camera on"],
    preview: {
      kind: "capture",
      caption: "Job sheet BF-2041",
      detail: "Riser swap, Coldbrook depot",
    },
  },
  {
    id: "location",
    kind: "location",
    title: "Share your location",
    feature: "Nearest jobs first",
    reason:
      "Jobs sort by how far they are from you, and site check-in happens on its own when you arrive.",
    ifDeclined:
      "Jobs stay in list order and you check in by hand at each site.",
    systemTitle: "would like to use your location",
    systemBody:
      "Your location is used while the app is open, to order jobs and check you in.",
    settingsSteps: [
      "Open Settings",
      "Privacy, then Location",
      "Basinworks Field: While using",
    ],
    preview: {
      kind: "place",
      name: "Coldbrook depot",
      distance: "0.4 km",
      detail: "Check-in ready",
    },
  },
  {
    id: "notifications",
    kind: "notifications",
    title: "Allow notifications",
    feature: "Job alerts",
    reason:
      "Hear when a job is handed to you, or when the office signs off a sheet.",
    ifDeclined:
      "Changes still show in the app. Nothing arrives while it is closed.",
    systemTitle: "would like to send you notifications",
    systemBody: "Notifications may include alerts, sounds and icon badges.",
    settingsSteps: [
      "Open Settings",
      "Notifications",
      "Basinworks Field: Allow",
    ],
    preview: {
      kind: "notice",
      title: "Basinworks Field",
      body: "Riser swap at Coldbrook depot is now yours.",
      when: "now",
    },
  },
];

/** Nothing answered yet. */
export const defaultPrimerDecisions: PrimerDecisions = {};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const ACCENTS: Record<PrimerAccent, { colour: string; onColour: string }> = {
  cobalt: { colour: "var(--accent)", onColour: "var(--primary-foreground)" },
  success: { colour: "var(--success)", onColour: "var(--primary-foreground)" },
  ink: { colour: "var(--ink)", onColour: "var(--bg-0)" },
};

/** How long a pressed system button stays lit before the dialog goes. */
const PRESS_MS = 220;

const KIND_WORD: Record<PrimerKind, string> = {
  camera: "the camera",
  location: "your location",
  notifications: "notifications",
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const r3 = (v: number) => Number(v.toFixed(3));

const noopSubscribe = () => () => {};

const decisionWord = (d: PrimerDecision | undefined) =>
  d === "granted" ? "granted" : d === "denied" ? "denied" : "not yet asked";

/* ----------------------------------------------------------------------- */
/*                               Illustration                               */
/* ----------------------------------------------------------------------- */

type ShapeProps = {
  d: string;
  draw: boolean;
  fill?: string;
  delay?: number;
  dashed?: boolean;
  thin?: boolean;
};

function Shape({ d, draw, fill, delay = 0, dashed, thin }: ShapeProps) {
  // A drawn-in path takes over stroke-dasharray, so a dashed guide line
  // fades in instead and keeps its dashes.
  const trace = draw && !dashed;
  return (
    <motion.path
      d={d}
      fill={fill ?? "none"}
      stroke="currentColor"
      strokeWidth={thin ? 1.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dashed ? "3 4" : undefined}
      initial={
        trace ? { pathLength: 0, opacity: 0.4 } : draw ? { opacity: 0 } : false
      }
      animate={trace ? { pathLength: 1, opacity: 1 } : { opacity: 1 }}
      transition={
        trace
          ? {
              pathLength: { ...springs.glide, delay },
              opacity: { duration: durations.fast, delay },
            }
          : draw
            ? { duration: durations.base, delay, ease: easings.enter }
            : { duration: 0 }
      }
    />
  );
}

function Illustration({
  kind,
  style,
  motionSafe,
}: {
  kind: PrimerKind;
  style: PrimerIllustration;
  motionSafe: boolean;
}) {
  const filled = style === "filled";
  // Hairline shapes draw themselves in; filled ones have nothing to draw, so
  // the whole picture fades instead.
  const draw = motionSafe && !filled;
  const wash = filled ? "var(--pp-wash)" : undefined;
  const solid = filled ? "var(--pp-accent)" : undefined;
  const card = filled ? "var(--card)" : undefined;
  return (
    <motion.svg
      aria-hidden
      viewBox="0 0 96 96"
      className="size-full text-(--pp-accent)"
      initial={motionSafe && filled ? { opacity: 0, scale: 0.94 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={
        motionSafe && filled
          ? { ...springs.glide, opacity: { duration: durations.base } }
          : { duration: 0 }
      }
    >
      {kind === "camera" ? (
        <>
          <Shape
            draw={draw}
            fill={wash}
            d="M24 34h11l5-7h16l5 7h11a6 6 0 0 1 6 6v28a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6V40a6 6 0 0 1 6-6Z"
          />
          <Shape
            draw={draw}
            fill={solid}
            delay={0.08}
            d="M48 42a12 12 0 1 1 0 24 12 12 0 0 1 0-24Z"
          />
          <Shape
            draw={draw}
            fill={card}
            delay={0.14}
            d="M48 49a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"
          />
          <Shape
            draw={draw}
            fill={solid}
            delay={0.18}
            d="M69 41a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"
          />
        </>
      ) : kind === "location" ? (
        <>
          <Shape
            draw={draw}
            delay={0.16}
            dashed
            thin
            d="M30 86c0-2 8-4 18-4s18 2 18 4"
          />
          <Shape
            draw={draw}
            fill={wash}
            d="M48 80S26 59 26 40a22 22 0 0 1 44 0c0 19-22 40-22 40Z"
          />
          <Shape
            draw={draw}
            fill={solid}
            delay={0.1}
            d="M48 32a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z"
          />
        </>
      ) : (
        <>
          <Shape
            draw={draw}
            delay={0.14}
            dashed
            thin
            d="M20 32a28 28 0 0 0-6 16"
          />
          <Shape
            draw={draw}
            delay={0.14}
            dashed
            thin
            d="M76 32a28 28 0 0 1 6 16"
          />
          <Shape
            draw={draw}
            fill={wash}
            d="M48 16a4 4 0 0 1 4 4v2.5c9 2.5 15 11 15 21.5v10l6 7H23l6-7V44c0-10.5 6-19 15-21.5V20a4 4 0 0 1 4-4Z"
          />
          <Shape
            draw={draw}
            fill={solid}
            delay={0.1}
            d="M41 68a7 7 0 0 0 14 0"
          />
        </>
      )}
    </motion.svg>
  );
}

function Badge({
  decision,
  fresh,
  motionSafe,
}: {
  decision: PrimerDecision;
  fresh: boolean;
  motionSafe: boolean;
}) {
  const animate = fresh && motionSafe;
  const granted = decision === "granted";
  return (
    <motion.span
      aria-hidden
      className={cn(
        "absolute -right-1 -bottom-1 flex size-7 items-center justify-center rounded-full border-2 border-card",
        granted
          ? "bg-(--pp-accent) text-(--pp-on-accent)"
          : "bg-danger text-primary-foreground",
      )}
      initial={animate ? { scale: 0.4, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={
        animate
          ? { ...springs.recoil, opacity: { duration: durations.fast } }
          : { duration: 0 }
      }
    >
      {granted ? (
        <svg viewBox="0 0 16 16" className="size-3.5">
          <motion.path
            d="M3.5 8.5 6.6 11.5 12.5 5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={animate ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={
              animate ? { ...springs.flick, delay: 0.1 } : { duration: 0 }
            }
          />
        </svg>
      ) : (
        <X className="size-3.5" strokeWidth={2.4} />
      )}
    </motion.span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Previews                                 */
/* ----------------------------------------------------------------------- */

function Preview({ preview }: { preview: PrimerPreview }) {
  if (preview.kind === "capture") {
    const corner =
      "absolute size-4 border-(--pp-accent) opacity-80 border-solid";
    return (
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-3 border border-hairline bg-surface-0">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_55%_40%,color-mix(in_oklab,var(--pp-accent)_14%,transparent),transparent_60%)]"
        />
        <span
          aria-hidden
          className={cn(corner, "top-3 left-3 border-t-2 border-l-2")}
        />
        <span
          aria-hidden
          className={cn(corner, "top-3 right-3 border-t-2 border-r-2")}
        />
        <span
          aria-hidden
          className={cn(corner, "bottom-3 left-3 border-b-2 border-l-2")}
        />
        <span
          aria-hidden
          className={cn(corner, "right-3 bottom-3 border-r-2 border-b-2")}
        />
        <span
          aria-hidden
          className="absolute bottom-3 left-1/2 size-5 -translate-x-1/2 rounded-full border-2 border-(--pp-accent) bg-card"
        />
        <div className="absolute top-3 left-8 flex flex-col">
          <span className="text-[12px] font-medium text-foreground">
            {preview.caption}
          </span>
          <span className="text-[11px] text-ink-3">{preview.detail}</span>
        </div>
        <span className="absolute right-8 bottom-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Ready
        </span>
      </div>
    );
  }
  if (preview.kind === "place") {
    return (
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-3 border border-hairline bg-surface-0">
        <div
          aria-hidden
          className="absolute inset-0 [background-image:linear-gradient(var(--hairline)_1px,transparent_1px),linear-gradient(90deg,var(--hairline)_1px,transparent_1px)] [background-size:22px_22px] opacity-70"
        />
        <svg
          aria-hidden
          viewBox="0 0 160 100"
          className="absolute inset-0 size-full text-ink-3"
          preserveAspectRatio="none"
        >
          <path
            d="M0 62C30 58 44 70 70 66S110 44 160 48"
            fill="none"
            stroke="currentColor"
            strokeWidth={6}
            strokeOpacity={0.18}
          />
          <path
            d="M96 0C92 24 104 40 90 100"
            fill="none"
            stroke="currentColor"
            strokeWidth={4}
            strokeOpacity={0.14}
          />
        </svg>
        <span
          aria-hidden
          className="absolute top-[38%] left-[58%] -translate-x-1/2 -translate-y-full"
        >
          <svg viewBox="0 0 24 30" className="size-6 text-(--pp-accent)">
            <path
              d="M12 29S2 17 2 11a10 10 0 0 1 20 0c0 6-10 18-10 18Z"
              fill="currentColor"
            />
            <circle cx="12" cy="11" r="3.5" fill="var(--card)" />
          </svg>
        </span>
        <div className="absolute bottom-3 left-3 flex items-baseline gap-2 rounded-2 border border-hairline bg-card px-2 py-1">
          <span className="text-[12px] font-medium text-foreground">
            {preview.name}
          </span>
          <span className="font-mono text-[11px] text-ink-2 tabular-nums">
            {preview.distance}
          </span>
        </div>
        <span className="absolute top-3 right-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {preview.detail}
        </span>
      </div>
    );
  }
  return (
    <div className="flex w-full items-start gap-3 rounded-3 border border-hairline bg-surface-0 p-3">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-2 bg-(--pp-accent) text-(--pp-on-accent)"
      >
        <svg viewBox="0 0 24 24" className="size-4.5">
          <path
            d="M12 4a1.5 1.5 0 0 1 1.5 1.5V6c3 1 5 4 5 7.5V17l2 2.5H3.5L5.5 17v-3.5C5.5 10 7.5 7 10.5 6v-.5A1.5 1.5 0 0 1 12 4Z"
            fill="currentColor"
          />
        </svg>
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[12px] font-semibold text-foreground">
            {preview.title}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-ink-3">
            {preview.when}
          </span>
        </div>
        <span className="text-[12px] leading-snug text-ink-2">
          {preview.body}
        </span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Buttons                                 */
/* ----------------------------------------------------------------------- */

type ActionButtonProps = {
  kind: "primary" | "ghost";
  motionSafe: boolean;
  disabled: boolean;
  onPress: () => void;
  children: React.ReactNode;
  nodeRef?: React.Ref<HTMLButtonElement>;
  className?: string;
};

function ActionButton({
  kind,
  motionSafe,
  disabled,
  onPress,
  children,
  nodeRef,
  className,
}: ActionButtonProps) {
  return (
    <motion.button
      ref={nodeRef}
      type="button"
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onPress();
      }}
      whileTap={motionSafe && !disabled ? { scale: 0.97 } : undefined}
      transition={springs.flick}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-3 px-3 text-[13px] font-medium transition-colors",
        kind === "primary"
          ? "bg-(--pp-accent) text-(--pp-on-accent) hover:bg-[color-mix(in_oklab,var(--pp-accent)_88%,var(--ink))]"
          : "border border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
        disabled && "cursor-not-allowed opacity-60",
        FOCUS_RING,
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Ask = {
  id: string;
  /** open: the viewer answers in the mock. waiting: the host is answering. pressed: a button is lit and the dialog is about to go. */
  phase: "open" | "waiting" | "pressed";
  answer: PrimerDecision | null;
};

/**
 * A primer screen shown before a mobile app's system permission prompt, so
 * the real one is never a surprise. Each permission is a slide: a drawn
 * illustration of the camera, a map pin or a bell (hairline shapes draw
 * themselves in on `springs.glide`, filled ones fade), the plain reason the app
 * asks, what still works if the answer is no, and Continue and Not now.
 * Continue raises a mock system dialog on `springs.snap`, a sheet from the
 * foot or a card in the centre; the viewer answers in it, or the host answers
 * through `onAsk` and the matching button presses itself. A grant stamps a
 * badge on the illustration on `springs.recoil` with a check that draws on
 * `springs.flick`, and the primer settles into its ready card: a sample
 * capture, place or notice gliding in. A denial stamps a cross and lays out
 * the way back through Settings, one step at a time in a `cascade`. Dots
 * under the title are the carousel; the slides glide between them.
 *
 * The dots are a tablist with one tab stop (Left/Right, Home/End move; the
 * slide follows), the buttons are buttons, and the mock dialog is a modal
 * dialog that holds Tab and gives focus back when it goes; Escape puts the
 * question away without an answer. Under reduced motion nothing draws,
 * slides or pops: the slides, the dialog and the badge cross-fade in place,
 * and every answer is still announced.
 */
export function PermissionPrimer({
  illustration = "line",
  dialogStyle = "sheet",
  accent = "cobalt",
  permissions = defaultPrimerPermissions,
  value,
  defaultValue,
  onChange,
  decisions,
  defaultDecisions = defaultPrimerDecisions,
  onDecisionsChange,
  onDecide,
  onAsk,
  onNotNow,
  onOpenSettings,
  appName = "Basinworks Field",
  status = "ready",
  onRetry,
  title = "Before we ask",
  label,
  height = 540,
  disabled = false,
  className,
}: PermissionPrimerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const panelId = `${uid}-panel`;
  const dialogTitleId = `${uid}-dialog-title`;
  const dialogBodyId = `${uid}-dialog-body`;

  const [ownId, setOwnId] = React.useState<string | undefined>(defaultValue);
  const [ownDecisions, setOwnDecisions] =
    React.useState<PrimerDecisions>(defaultDecisions);
  const [ask, setAsk] = React.useState<Ask | null>(null);
  // The answers that landed on this surface, so a permission that arrived
  // already granted settles without the stamp.
  const [fresh, setFresh] = React.useState<PrimerDecisions>({});
  const [announcement, setAnnouncement] = React.useState("");
  const [focusReq, setFocusReq] = React.useState(0);
  // False for the server render and hydration, so the first slide never
  // slides in; true for slides that mount later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const current = decisions ?? ownDecisions;
  const ready = status === "ready";
  const inert = disabled || !ready;

  const n = permissions.length;
  const requestedId = value ?? ownId;
  const foundIndex = permissions.findIndex((p) => p.id === requestedId);
  const index = foundIndex >= 0 ? foundIndex : 0;
  const permission = permissions[index];
  const decision = permission ? current[permission.id] : undefined;

  // Which way the next slide travels: forward for a later permission.
  const [slideDir, setSlideDir] = React.useState(1);
  const timer = React.useRef<number | null>(null);
  const askSeq = React.useRef(0);
  const mounted = React.useRef(false);
  const returnTo = React.useRef<HTMLElement | null>(null);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const allowRef = React.useRef<HTMLButtonElement | null>(null);
  const primaryRef = React.useRef<HTMLButtonElement | null>(null);
  const dotNodes = React.useRef(new Map<string, HTMLButtonElement>());
  // What a timer sees when it lands an answer: the answers and permissions
  // as of the last commit, never a stale closure.
  const latest = React.useRef({ current, permissions });
  React.useLayoutEffect(() => {
    latest.current = { current, permissions };
  });

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  /* ------------------------------ carousel ----------------------------- */

  const go = (to: number, reason: PrimerChangeReason) => {
    const target = permissions[clamp(to, 0, n - 1)];
    if (!target || target.id === permission?.id) return;
    setSlideDir(to > index ? 1 : -1);
    if (value === undefined) setOwnId(target.id);
    onChange?.(target.id, target, reason);
    const at = permissions.indexOf(target);
    setAnnouncement(
      `${target.title}. ${at + 1} of ${n}, ${decisionWord(current[target.id])}.`,
    );
    if (reason === "key") dotNodes.current.get(target.id)?.focus();
  };

  const onDotKey = (event: React.KeyboardEvent) => {
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      to = index - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = n - 1;
    else return;
    event.preventDefault();
    if (inert) return;
    go(to, "key");
  };

  /* ------------------------------- asking ------------------------------ */

  const land = (id: string, answer: PrimerDecision) => {
    const { current: base, permissions: list } = latest.current;
    const target = list.find((p) => p.id === id);
    const next: PrimerDecisions = { ...base, [id]: answer };
    if (decisions === undefined) setOwnDecisions(next);
    onDecisionsChange?.(next);
    if (target) onDecide?.(target, answer);
    setFresh((f) => ({ ...f, [id]: answer }));
    setAsk(null);
    if (target) {
      setAnnouncement(
        answer === "granted"
          ? `${target.title}: granted. ${target.feature} is on.`
          : `${target.title}: denied. ${target.feature} stays off until you turn ${KIND_WORD[target.kind]} on in Settings.`,
      );
    }
    setFocusReq((s) => s + 1);
  };

  /** Lights the system button the answer chose, then lets the dialog go. */
  const press = (id: string, answer: PrimerDecision) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setAsk((a) => (a && a.id === id ? { ...a, phase: "pressed", answer } : a));
    const wait = motionSafe ? PRESS_MS : 0;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      land(id, answer);
    }, wait);
  };

  const cancelAsk = (why: string) => {
    askSeq.current += 1;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setAsk(null);
    setAnnouncement(why);
    setFocusReq((s) => s + 1);
  };

  const askNow = () => {
    if (inert || !permission || ask) return;
    returnTo.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const seq = askSeq.current + 1;
    askSeq.current = seq;
    const id = permission.id;
    const result = onAsk?.(permission);
    if (result === undefined) {
      setAsk({ id, phase: "open", answer: null });
      setAnnouncement(
        `The system asks: ${appName} ${permission.systemTitle}. Allow or don't allow.`,
      );
      return;
    }
    setAsk({ id, phase: "waiting", answer: null });
    setAnnouncement(`Asking the system for ${KIND_WORD[permission.kind]}.`);
    Promise.resolve(result).then(
      (answer) => {
        if (!mounted.current || seq !== askSeq.current) return;
        press(id, answer);
      },
      () => {
        if (!mounted.current || seq !== askSeq.current) return;
        cancelAsk("The system didn't answer. You can try again.");
      },
    );
  };

  const notNow = () => {
    if (inert || !permission) return;
    onNotNow?.(permission);
    if (index + 1 < n) go(index + 1, "notNow");
    else {
      setAnnouncement(
        `Not now. ${permission.feature} stays off; you can turn it on later from Settings.`,
      );
    }
  };

  // Focus lands on Allow when the dialog opens, and on the slide's first
  // button once it has gone, or back where Continue was pressed from.
  React.useEffect(() => {
    if (!ask) return;
    const raf = window.requestAnimationFrame(() => {
      allowRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [ask]);

  React.useLayoutEffect(() => {
    if (focusReq === 0) return;
    const back = returnTo.current;
    returnTo.current = null;
    const target =
      primaryRef.current ?? (back && back.isConnected ? back : null);
    target?.focus({ preventScroll: true });
  }, [focusReq]);

  const onDialogKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (ask?.phase === "pressed") return;
      cancelAsk("Question put away. Continue when you are ready.");
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const nodes = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    );
    if (nodes.length === 0) {
      event.preventDefault();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (
      event.shiftKey &&
      (active === first || !dialogRef.current.contains(active))
    ) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  /* ------------------------------- render ------------------------------ */

  const palette = ACCENTS[accent] ?? ACCENTS.cobalt;
  const dialogOpen = ask !== null;
  const stepDelay = cascade(permission?.settingsSteps.length ?? 1);

  // Variants take the direction from `custom`, so a slide on its way out
  // follows the move that replaced it, not the one that brought it in.
  const slideVariants = {
    enter: (d: number) => ({
      x: motionSafe ? d * distances.shift : 0,
      opacity: 0,
    }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({
      x: motionSafe ? -d * distances.step : 0,
      opacity: 0,
      transition: exitFor(durations.fast),
    }),
  };

  const renderPrimer = (p: PrimerPermission) => (
    <>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-[0.08em] text-(--pp-accent) uppercase">
          {p.feature}
        </span>
        <h3 className="text-[17px] leading-tight font-semibold text-foreground">
          {p.title}
        </h3>
        <p className="text-[13px] leading-snug text-ink-2">{p.reason}</p>
      </div>
      <div className="flex flex-col gap-1 border-l-2 border-hairline-strong pl-3">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          If you decline
        </span>
        <p className="text-[12px] leading-snug text-ink-3">{p.ifDeclined}</p>
      </div>
      <div className="mt-auto flex flex-col gap-2 pt-2 @min-[40rem]:flex-row-reverse @min-[40rem]:justify-start">
        <ActionButton
          kind="primary"
          motionSafe={motionSafe}
          disabled={inert}
          onPress={askNow}
          nodeRef={primaryRef}
          className="@min-[40rem]:min-w-32"
        >
          Continue
          <ChevronRight aria-hidden className="size-4" />
        </ActionButton>
        <ActionButton
          kind="ghost"
          motionSafe={motionSafe}
          disabled={inert}
          onPress={notNow}
          className="@min-[40rem]:min-w-28"
        >
          Not now
        </ActionButton>
      </div>
    </>
  );

  const renderGranted = (p: PrimerPermission, isFresh: boolean) => (
    <>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-[0.08em] text-(--pp-accent) uppercase">
          {isFresh ? "Granted" : "Already on"}
        </span>
        <h3 className="text-[17px] leading-tight font-semibold text-foreground">
          {p.feature} is on
        </h3>
        <p className="text-[13px] leading-snug text-ink-2">
          {isFresh
            ? `You can change this any time in Settings. Here is what ${KIND_WORD[p.kind]} unlocks:`
            : `${appName} already has ${KIND_WORD[p.kind]}. Nothing to ask.`}
        </p>
      </div>
      <motion.div
        initial={
          isFresh && motionSafe ? { y: distances.shift, opacity: 0 } : false
        }
        animate={{ y: 0, opacity: 1 }}
        transition={
          isFresh && motionSafe
            ? {
                ...springs.glide,
                delay: 0.12,
                opacity: { duration: durations.base, delay: 0.12 },
              }
            : { duration: 0 }
        }
      >
        <Preview preview={p.preview} />
      </motion.div>
      <div className="mt-auto flex flex-col gap-2 pt-2 @min-[40rem]:flex-row-reverse @min-[40rem]:justify-start">
        {index + 1 < n ? (
          <ActionButton
            kind="primary"
            motionSafe={motionSafe}
            disabled={inert}
            onPress={() => go(index + 1, "next")}
            nodeRef={primaryRef}
            className="@min-[40rem]:min-w-32"
          >
            Next
            <ChevronRight aria-hidden className="size-4" />
          </ActionButton>
        ) : (
          <p className="self-center text-[12px] text-ink-3 @min-[40rem]:self-auto">
            Nothing more to ask.
          </p>
        )}
      </div>
    </>
  );

  const renderDenied = (p: PrimerPermission, isFresh: boolean) => (
    <>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-[0.08em] text-danger uppercase">
          Denied
        </span>
        <h3 className="text-[17px] leading-tight font-semibold text-foreground">
          {p.feature} is off
        </h3>
        <p className="text-[13px] leading-snug text-ink-2">
          The system has the answer now, so the app cannot ask again. To turn it
          on later:
        </p>
      </div>
      <ol className="flex flex-col gap-1.5">
        {p.settingsSteps.map((step, i) => (
          <motion.li
            key={step}
            className="flex items-center gap-2.5 text-[13px] text-foreground"
            initial={
              isFresh && motionSafe ? { x: distances.step, opacity: 0 } : false
            }
            animate={{ x: 0, opacity: 1 }}
            transition={
              isFresh && motionSafe
                ? {
                    ...springs.glide,
                    delay: r3(0.1 + i * stepDelay),
                    opacity: {
                      duration: durations.base,
                      delay: r3(0.1 + i * stepDelay),
                      ease: easings.enter,
                    },
                  }
                : { duration: 0 }
            }
          >
            <span
              aria-hidden
              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-[10px] text-ink-2 tabular-nums"
            >
              {i + 1}
            </span>
            <span className="min-w-0 truncate">{step}</span>
          </motion.li>
        ))}
      </ol>
      <div className="mt-auto flex flex-col gap-2 pt-2 @min-[40rem]:flex-row-reverse @min-[40rem]:justify-start">
        <ActionButton
          kind="primary"
          motionSafe={motionSafe}
          disabled={inert}
          onPress={() => {
            onOpenSettings?.(p);
            setAnnouncement(`Opening Settings for ${KIND_WORD[p.kind]}.`);
          }}
          nodeRef={primaryRef}
          className="@min-[40rem]:min-w-32"
        >
          <Settings aria-hidden className="size-4" />
          Open settings
        </ActionButton>
        {index + 1 < n ? (
          <ActionButton
            kind="ghost"
            motionSafe={motionSafe}
            disabled={inert}
            onPress={() => go(index + 1, "next")}
            className="@min-[40rem]:min-w-28"
          >
            Later
          </ActionButton>
        ) : null}
      </div>
    </>
  );

  return (
    <div
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
        ["--pp-accent" as string]: palette.colour,
        ["--pp-on-accent" as string]: palette.onColour,
        ["--pp-wash" as string]: `color-mix(in oklab, ${palette.colour} 14%, transparent)`,
      }}
    >
      <div
        inert={dialogOpen || undefined}
        className="flex min-h-0 flex-1 flex-col"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2.5">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          {ready && n > 0 ? (
            <div className="flex shrink-0 items-center gap-2.5">
              <span
                aria-hidden
                className="hidden font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[24rem]:inline"
              >
                {index + 1} of {n}
              </span>
              <div
                role="tablist"
                aria-label="Permissions"
                className="flex items-center gap-1.5"
              >
                {permissions.map((p, i) => {
                  const d = current[p.id];
                  const active = i === index;
                  return (
                    <button
                      key={p.id}
                      ref={(node) => {
                        if (node) dotNodes.current.set(p.id, node);
                        else dotNodes.current.delete(p.id);
                      }}
                      type="button"
                      role="tab"
                      id={`${uid}-tab-${p.id}`}
                      aria-selected={active}
                      aria-controls={active ? panelId : undefined}
                      aria-label={`${p.title}, ${decisionWord(d)}`}
                      tabIndex={active ? 0 : -1}
                      onClick={() => {
                        if (!inert) go(i, "dot");
                      }}
                      onKeyDown={onDotKey}
                      className={cn(
                        "flex h-5 items-center rounded-full px-0.5",
                        inert ? "cursor-default" : "cursor-pointer",
                        FOCUS_RING,
                      )}
                    >
                      <motion.span
                        aria-hidden
                        layout={motionSafe}
                        transition={springs.snap}
                        className={cn(
                          "block h-2 rounded-full transition-colors duration-200",
                          active ? "w-5" : "w-2",
                          d === "granted"
                            ? "bg-(--pp-accent)"
                            : d === "denied"
                              ? "bg-danger"
                              : active
                                ? "bg-ink-2"
                                : "bg-hairline-strong",
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </header>

        <div className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain border-t border-hairline">
          {status === "loading" ? (
            <div aria-hidden className="flex flex-col gap-4 p-4">
              <div className="flex justify-center py-2">
                <span className="size-24 rounded-full bg-surface-2 motion-safe:animate-pulse" />
              </div>
              <div className="flex flex-col gap-2">
                <span className="h-2.5 w-20 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
                <span
                  className="h-4 w-2/3 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                  style={{ animationDelay: "90ms" }}
                />
                <span
                  className="h-3 w-full rounded-1 bg-surface-2 motion-safe:animate-pulse"
                  style={{ animationDelay: "180ms" }}
                />
                <span
                  className="h-3 w-5/6 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                  style={{ animationDelay: "270ms" }}
                />
              </div>
              <div className="flex flex-col gap-2 pt-4">
                <span
                  className="h-9 rounded-3 bg-surface-2 motion-safe:animate-pulse"
                  style={{ animationDelay: "360ms" }}
                />
                <span
                  className="h-9 rounded-3 bg-surface-1 motion-safe:animate-pulse"
                  style={{ animationDelay: "450ms" }}
                />
              </div>
            </div>
          ) : status === "error" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
              <TriangleAlert aria-hidden className="size-5 text-danger" />
              <p className="text-sm text-foreground">
                The feature&apos;s state didn&apos;t load.
              </p>
              <p className="text-[12px] text-ink-3">
                Nothing has been asked of the system.
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
          ) : !permission ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-8 text-center">
              <p className="text-sm text-ink-2">Nothing to ask.</p>
              <p className="text-[12px] text-ink-3">
                {appName} works without any permissions.
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false} mode="popLayout" custom={slideDir}>
              <motion.div
                key={permission.id}
                id={panelId}
                role="tabpanel"
                aria-labelledby={`${uid}-tab-${permission.id}`}
                custom={slideDir}
                variants={slideVariants}
                initial={live ? "enter" : false}
                animate="center"
                exit="exit"
                transition={
                  motionSafe
                    ? {
                        ...springs.glide,
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                        },
                      }
                    : { duration: durations.fast }
                }
                className="flex min-h-full w-full flex-col gap-4 p-4 @min-[40rem]:grid @min-[40rem]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] @min-[40rem]:gap-x-6"
              >
                <div className="flex shrink-0 items-center justify-center py-1 @min-[40rem]:items-start @min-[40rem]:pt-4">
                  <div className="relative size-28 @min-[40rem]:size-36">
                    <Illustration
                      key={`${permission.id}-${illustration}`}
                      kind={permission.kind}
                      style={illustration}
                      motionSafe={motionSafe}
                    />
                    {decision ? (
                      <Badge
                        decision={decision}
                        fresh={fresh[permission.id] === decision}
                        motionSafe={motionSafe}
                      />
                    ) : null}
                  </div>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-4">
                  {decision === "granted"
                    ? renderGranted(
                        permission,
                        fresh[permission.id] === "granted",
                      )
                    : decision === "denied"
                      ? renderDenied(
                          permission,
                          fresh[permission.id] === "denied",
                        )
                      : renderPrimer(permission)}
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>

      <AnimatePresence>
        {ask && permission ? (
          <motion.div
            key="scrim"
            aria-hidden
            className="absolute inset-0 z-20 bg-[color-mix(in_oklab,var(--ink)_30%,transparent)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast }}
          />
        ) : null}
        {ask && permission ? (
          <div
            key="dialog-layer"
            className={cn(
              "pointer-events-none absolute inset-0 z-30 flex",
              dialogStyle === "sheet"
                ? "items-end p-2"
                : "items-center justify-center p-4",
            )}
          >
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={dialogTitleId}
              aria-describedby={dialogBodyId}
              onKeyDown={onDialogKeyDown}
              initial={
                motionSafe
                  ? dialogStyle === "sheet"
                    ? { y: "110%", opacity: 1 }
                    : { scale: 0.92, opacity: 0 }
                  : { opacity: 0 }
              }
              animate={
                motionSafe
                  ? dialogStyle === "sheet"
                    ? { y: 0, opacity: 1 }
                    : { scale: 1, opacity: 1 }
                  : { opacity: 1 }
              }
              exit={
                motionSafe && dialogStyle === "sheet"
                  ? {
                      y: "110%",
                      opacity: 1,
                      transition: exitFor(durations.base),
                    }
                  : { opacity: 0, transition: exitFor(durations.fast) }
              }
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className={cn(
                "pointer-events-auto flex flex-col overflow-hidden rounded-4 border border-hairline-strong bg-popover text-foreground shadow-[0_18px_40px_-16px_color-mix(in_oklab,black_50%,transparent)]",
                dialogStyle === "sheet"
                  ? "w-full"
                  : "w-full max-w-[18rem] @min-[40rem]:max-w-xs",
              )}
            >
              {dialogStyle === "sheet" ? (
                <span
                  aria-hidden
                  className="mx-auto mt-2 h-1 w-9 rounded-full bg-hairline-strong"
                />
              ) : null}
              <div className="flex flex-col items-center gap-1.5 px-5 pt-4 pb-4 text-center">
                <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  System
                </p>
                <p
                  id={dialogTitleId}
                  className="text-[15px] leading-snug font-semibold"
                >
                  &ldquo;{appName}&rdquo; {permission.systemTitle}
                </p>
                <p
                  id={dialogBodyId}
                  className="text-[12px] leading-snug text-ink-2"
                >
                  {permission.systemBody}
                </p>
                <AnimatePresence>
                  {ask.phase === "waiting" ? (
                    <motion.p
                      key="waiting"
                      className="mt-1 flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={{ duration: durations.fast }}
                    >
                      <span
                        aria-hidden
                        className="size-1.5 rounded-full bg-(--pp-accent) motion-safe:animate-pulse"
                      />
                      Waiting for the system
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </div>
              <div className="grid grid-cols-2 border-t border-hairline-strong">
                {(["denied", "granted"] as const).map((answer, i) => {
                  const lit = ask.phase === "pressed" && ask.answer === answer;
                  const locked = ask.phase !== "open";
                  return (
                    <motion.button
                      key={answer}
                      ref={answer === "granted" ? allowRef : undefined}
                      type="button"
                      aria-disabled={locked || undefined}
                      onClick={() => {
                        if (!locked) press(ask.id, answer);
                      }}
                      animate={{
                        backgroundColor: lit
                          ? "color-mix(in oklab, var(--pp-accent) 18%, transparent)"
                          : "rgba(0,0,0,0)",
                      }}
                      transition={
                        motionSafe
                          ? { duration: durations.blink }
                          : { duration: 0 }
                      }
                      className={cn(
                        "h-11 text-[14px] transition-colors",
                        i === 0 && "border-r border-hairline-strong",
                        answer === "granted"
                          ? "font-semibold text-(--pp-accent)"
                          : "text-foreground",
                        locked && !lit && "opacity-60",
                        !locked && "hover:bg-surface-2",
                        "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                      )}
                    >
                      {answer === "granted" ? "Allow" : "Don't allow"}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
