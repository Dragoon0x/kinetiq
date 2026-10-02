"use client";

import * as React from "react";

import {
  Camera,
  Check,
  LoaderCircle,
  MessageSquare,
  Paperclip,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
  type Variants,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type FeedbackFaces = "five" | "three" | "two";
export type FeedbackDock = "right" | "left" | "bottom";
export type FeedbackSteps = "guided" | "single" | "quick";

export type FeedbackShot = {
  /** Names the attachment, e.g. "Route planner". */
  name: string;
  /** An image from the host's own capture. Without it, a drawn sketch of the page stands in. */
  src?: string;
};

export type FeedbackDraft = {
  /** 1 to the number of faces, or null before a face is chosen. */
  rating: number | null;
  message: string;
  screenshot: FeedbackShot | null;
};

export type FeedbackPrompts = {
  /** Asked after a low rating. */
  low: string;
  /** Asked after a middling rating, or before one in the single layout. */
  mid: string;
  /** Asked after a high rating. */
  high: string;
};

export type FeedbackWidgetProps = {
  /** Controlled: the panel is open. */
  open?: boolean;
  /** Initial open state when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires from the tab, the close button, Escape or a finished send. */
  onOpenChange?: (open: boolean) => void;
  /** Controlled draft: rating, message, screenshot. */
  value?: FeedbackDraft;
  /** Initial draft when uncontrolled. @default emptyFeedback */
  defaultValue?: FeedbackDraft;
  /** Fires from the face, keystroke or attachment that changed the draft, and with an empty one after a send. */
  onValueChange?: (draft: FeedbackDraft) => void;
  /** Sends the feedback; `scale` is how many faces were offered. Return a promise to hold Send pending; a rejection's message is shown. */
  onSubmit?: (
    feedback: FeedbackDraft & { scale: number },
  ) => void | Promise<void>;
  /** Takes the screenshot. Without it, a drawn sketch of the page is attached. */
  onCapture?: () => FeedbackShot | Promise<FeedbackShot>;
  /** How many faces: five (Very bad to Great), three, or two. @default "five" */
  faces?: FeedbackFaces;
  /** The edge the tab sits on. @default "right" */
  dock?: FeedbackDock;
  /** Faces first and the rest after a choice, everything at once, or faces only (a choice sends). @default "guided" */
  steps?: FeedbackSteps;
  /** The panel's question and accessible name. @default "How is it going?" */
  title?: string;
  /** What the text box asks after a low, middling or high rating. */
  prompts?: Partial<FeedbackPrompts>;
  /** The text box's hint. @default "A sentence or two is plenty." */
  placeholder?: string;
  /** The longest message, in characters. @default 280 */
  maxLength?: number;
  /** Offer to attach a screenshot. @default true */
  screenshot?: boolean;
  /** The tab's word. @default "Feedback" */
  tabLabel?: string;
  /** What the tab says once the note is in. @default "Thanks" */
  sentLabel?: string;
  /** How long the tab says thanks, in ms. @default 1600 */
  thanksHold?: number;
  /** Dock to the viewport instead of the page given as children. @default false */
  fixed?: boolean;
  /** The page the widget docks to. */
  children?: React.ReactNode;
  /** The panel's accessible name when it should differ from the title. */
  label?: string;
  /** Play the face pops and the panel's swish. Off unless asked for. @default false */
  sound?: boolean;
  /** Shows the tab but takes no input. */
  disabled?: boolean;
  className?: string;
};

export const defaultFeedbackPrompts: FeedbackPrompts = {
  low: "What went wrong?",
  mid: "What would make it better?",
  high: "What's working for you?",
};

export const emptyFeedback: FeedbackDraft = {
  rating: null,
  message: "",
  screenshot: null,
};

export type FeedbackFace = {
  /** The face's name, as the rating reads aloud and in the caption. */
  label: string;
  /** -1 (miserable) to 1 (delighted): the mouth's curve and the pigment. */
  mood: number;
};

/** The faces each scale offers, worst first; a rating is a 1-based index into one. */
export const feedbackScales: Readonly<
  Record<FeedbackFaces, readonly FeedbackFace[]>
> = {
  five: [
    { label: "Very bad", mood: -1 },
    { label: "Bad", mood: -0.5 },
    { label: "Okay", mood: 0 },
    { label: "Good", mood: 0.5 },
    { label: "Great", mood: 1 },
  ],
  three: [
    { label: "Bad", mood: -1 },
    { label: "Okay", mood: 0 },
    { label: "Great", mood: 1 },
  ],
  two: [
    { label: "Not good", mood: -1 },
    { label: "Good", mood: 1 },
  ],
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** A status token's hue and chroma at a fixed lightness: pigment, the same in both themes. */
const pigment = (mood: number, lightness: number) => {
  const token =
    mood <= -0.3 ? "--danger" : mood >= 0.3 ? "--success" : "--warn";
  return `oklch(from var(${token}) ${lightness} c h)`;
};

const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error && error.message
    ? error.message
    : typeof error === "string" && error
      ? error
      : fallback;

/** A timeout that waits while the page is hidden and carries on when it is back. */
function useHeldTimer(active: boolean, ms: number, onDone: () => void) {
  const done = React.useRef(onDone);
  React.useEffect(() => {
    done.current = onDone;
  });
  React.useEffect(() => {
    if (!active) return;
    let left = Math.max(0, ms);
    let started = 0;
    let id = 0;
    const arm = () => {
      started = performance.now();
      id = window.setTimeout(() => done.current(), left);
    };
    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(id);
        left = Math.max(0, left - (performance.now() - started));
      } else {
        arm();
      }
    };
    if (!document.hidden) arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, ms]);
}

/* --------------------------------- faces -------------------------------- */

/**
 * A face drawn from its mood. `wake` (0 asleep, 1 awake) carries the mouth
 * from a hint of its curve to the whole of it, squints a happy face's eyes,
 * raises a miserable one's brows, and brings the pigment up from grey.
 */
function Face({
  mood,
  wake,
  className,
}: {
  mood: number;
  wake: MotionValue<number>;
  className?: string;
}) {
  const fill = useTransform(
    wake,
    (w) =>
      `color-mix(in oklab, ${pigment(mood, 0.82)} ${Math.round(clamp01(w) * 100)}%, var(--bg-2))`,
  );
  const ink = useTransform(
    wake,
    (w) =>
      `color-mix(in oklab, ${pigment(mood, 0.3)} ${Math.round(clamp01(w) * 100)}%, var(--ink-3))`,
  );
  const mouth = useTransform(wake, (w) => {
    const k = mood * 6 * (0.35 + 0.65 * clamp01(w));
    const end = r2(27 - k * 0.35);
    return `M 13 ${end} Q 20 ${r2(27 + k)} 27 ${end}`;
  });
  const eye = useTransform(wake, (w) =>
    r2(2.6 - 1.15 * Math.max(0, mood) * clamp01(w)),
  );
  const brows = useTransform(wake, (w) =>
    r2(clamp01((-mood - 0.4) / 0.6) * clamp01(w)),
  );
  return (
    <svg aria-hidden viewBox="0 0 40 40" className={className}>
      <motion.circle
        cx={20}
        cy={20}
        r={18.25}
        strokeWidth={1.5}
        className="stroke-hairline-strong"
        style={{ fill }}
      />
      <motion.g style={{ stroke: ink, fill: ink }}>
        <motion.ellipse cx={14} cy={16.5} rx={2.1} ry={eye} stroke="none" />
        <motion.ellipse cx={26} cy={16.5} rx={2.1} ry={eye} stroke="none" />
        <motion.path
          d={mouth}
          fill="none"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
        <motion.path
          d="M 10.6 12.4 L 16.2 10.4 M 23.8 10.4 L 29.4 12.4"
          fill="none"
          strokeWidth={1.8}
          strokeLinecap="round"
          style={{ opacity: brows }}
        />
      </motion.g>
    </svg>
  );
}

function FaceButton({
  face,
  index,
  count,
  selected,
  awake,
  tabbable,
  motionSafe,
  disabled,
  busy,
  onKeyDown,
  onChoose,
  onHover,
  onFocusChange,
  bind,
}: {
  face: FeedbackFace;
  index: number;
  count: number;
  selected: boolean;
  awake: boolean;
  tabbable: boolean;
  motionSafe: boolean;
  disabled: boolean;
  /** Held while a send is on its way: still focusable, not choosable. */
  busy: boolean;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onChoose: () => void;
  onHover: (on: boolean) => void;
  onFocusChange: (on: boolean) => void;
  bind: (node: HTMLButtonElement | null) => void;
}) {
  const wake = useMotionValue(awake ? 1 : 0);
  React.useEffect(() => {
    const c = animate(
      wake,
      awake ? 1 : 0,
      motionSafe ? springs.snap : { duration: durations.fast },
    );
    return () => c.stop();
  }, [awake, motionSafe, wake]);

  return (
    <button
      ref={bind}
      type="button"
      role="radio"
      data-face={index}
      aria-checked={selected}
      aria-label={`${face.label}, ${index + 1} of ${count}`}
      tabIndex={tabbable ? 0 : -1}
      disabled={disabled}
      aria-disabled={busy || undefined}
      onKeyDown={onKeyDown}
      onFocus={() => onFocusChange(true)}
      onBlur={() => onFocusChange(false)}
      onClick={(event) => {
        // A pointer's choice arrives through the row's tap; a click with
        // no pointer behind it is Space or Enter.
        if (event.detail === 0) onChoose();
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") onHover(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") onHover(false);
      }}
      className={cn(
        "grid size-11 shrink-0 cursor-pointer place-items-center rounded-full disabled:cursor-not-allowed @min-[40rem]:size-12",
        FOCUS,
      )}
    >
      <motion.span
        className="block size-9 @min-[40rem]:size-10"
        initial={false}
        animate={{ scale: selected ? 1.12 : 1 }}
        transition={
          !motionSafe
            ? { duration: 0 }
            : selected
              ? springs.recoil
              : springs.glide
        }
      >
        <Face mood={face.mood} wake={wake} className="size-full" />
      </motion.span>
    </button>
  );
}

/* ------------------------------- the sketch ------------------------------ */

/** A drawn stand-in for a screenshot of the page: chrome, a list, a map, rows. */
function Sketch({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 160 100"
      preserveAspectRatio="none"
      className={className}
    >
      <rect width={160} height={100} className="fill-background" />
      <rect width={160} height={12} className="fill-ink-3/15" />
      <rect
        x={6}
        y={4}
        width={22}
        height={4}
        rx={2}
        className="fill-ink-3/45"
      />
      <rect
        x={128}
        y={3.5}
        width={26}
        height={5}
        rx={2.5}
        className="fill-cobalt-bright/45"
      />
      <rect
        x={6}
        y={18}
        width={44}
        height={76}
        rx={3}
        className="fill-ink-3/10"
      />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect
          key={i}
          x={10}
          y={24 + i * 13}
          width={[30, 24, 33, 21, 27][i]}
          height={4}
          rx={2}
          className="fill-ink-3/35"
        />
      ))}
      <rect
        x={56}
        y={18}
        width={98}
        height={48}
        rx={3}
        className="fill-cobalt-bright/12"
      />
      <path
        d="M66 56 L84 40 L102 47 L122 30 L144 36"
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-cobalt-bright/70"
      />
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={56}
          y={72 + i * 8}
          width={[90, 70, 82][i]}
          height={4}
          rx={2}
          className="fill-ink-3/30"
        />
      ))}
    </svg>
  );
}

function Thumb({
  shot,
  className,
}: {
  shot: FeedbackShot;
  className?: string;
}) {
  return shot.src ? (
    // A host's capture is any image; it is shown as given.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={shot.src} alt="" className={cn("object-cover", className)} />
  ) : (
    <Sketch className={className} />
  );
}

/* --------------------------------- fold ---------------------------------- */

/**
 * The sent note, folded in half: the lower half turns up over the upper one
 * about the crease on glide, showing its back, while the note's box closes
 * to the half that is left.
 */
function FoldNote({
  children,
  back,
  motionSafe,
  onFolded,
}: {
  children: React.ReactNode;
  /** What the outside of the folded note shows. */
  back?: React.ReactNode;
  motionSafe: boolean;
  onFolded: () => void;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [h, setH] = React.useState(0);
  const turn = useMotionValue(0);

  React.useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(() => {
      const next = node.offsetHeight;
      setH((prev) => (prev > 0 ? prev : next));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);

  React.useEffect(() => {
    if (h <= 0) return;
    if (!motionSafe) {
      onFolded();
      return;
    }
    const c = animate(turn, 180, {
      ...springs.glide,
      // The panel closes in around the note first; then it folds.
      delay: 0.22,
      onComplete: onFolded,
    });
    return () => c.stop();
  }, [h, motionSafe, onFolded, turn]);

  // The box follows the flap's shadow on the page: it closes as the lower
  // half rises, and stays at half once the flap is over the top.
  const height = useTransform(turn, (t) =>
    h > 0
      ? r2(h / 2 + (h / 2) * Math.max(0, Math.cos((t * Math.PI) / 180)))
      : "auto",
  );
  const half = r2(h / 2);

  return (
    <motion.div
      className="relative"
      style={{ height: h > 0 ? height : "auto", perspective: 700 }}
    >
      <div
        ref={setNode}
        style={h > 0 ? { clipPath: "inset(0 0 50% 0)" } : undefined}
      >
        {children}
      </div>
      {h > 0 ? (
        <motion.div
          aria-hidden
          className="absolute inset-x-0"
          style={{
            top: half,
            height: half,
            rotateX: turn,
            originY: 0,
            transformStyle: "preserve-3d",
          }}
        >
          <div className="absolute inset-0 overflow-clip [backface-visibility:hidden]">
            <div style={{ marginTop: -half }}>{children}</div>
          </div>
          <div className="absolute inset-0 [transform:rotateX(180deg)] rounded-t-3 border border-hairline-strong bg-surface-2 [backface-visibility:hidden]">
            <span className="absolute inset-x-3 bottom-0 h-px bg-hairline-strong" />
            <span className="absolute inset-0 flex items-center justify-center gap-2 text-[12px] text-ink-2">
              {back}
            </span>
          </div>
        </motion.div>
      ) : null}
    </motion.div>
  );
}

/** A box whose height glides to its content's measured height. */
function Measured({
  children,
  motionSafe,
  className,
}: {
  children: React.ReactNode;
  motionSafe: boolean;
  className?: string;
}) {
  const height = useMotionValue(-1);
  const style = useTransform(height, (v) => (v < 0 ? "auto" : v));
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!node) return;
    let running: AnimationPlaybackControls | null = null;
    const ro = new ResizeObserver(() => {
      const next = node.offsetHeight;
      const now = height.get();
      if (now < 0 || !motionSafe) {
        running?.stop();
        height.jump(next);
        return;
      }
      if (Math.abs(now - next) < 0.5) return;
      running?.stop();
      running = animate(height, next, {
        ...springs.glide,
        velocity: height.getVelocity(),
      });
    });
    ro.observe(node);
    return () => {
      ro.disconnect();
      running?.stop();
      if (height.get() >= 0) height.jump(node.offsetHeight);
    };
  }, [node, motionSafe, height]);

  return (
    <motion.div
      style={{ height: style }}
      className={cn(
        "relative overflow-clip [overflow-clip-margin:6px]",
        className,
      )}
    >
      <div ref={setNode}>{children}</div>
    </motion.div>
  );
}

/* -------------------------------- widget --------------------------------- */

type Phase = "idle" | "sending" | "error" | "folding" | "tucking" | "thanks";

type Capture = { key: number; x: number; y: number; w: number; h: number };

/**
 * A feedback widget docked to the edge of a page. Its tab opens a small
 * panel: a row of drawn faces that wake as the pointer or focus reaches them
 * — the mouth curving into its mood on snap, the pigment rising from grey —
 * and the chosen one lands on recoil. Press and slide along the row to scrub
 * through them. Then a short text box whose question answers the mood, an
 * optional screenshot that flashes the page and flies its frame down into the
 * panel on glide, and Send.
 *
 * Sent, the note folds: its lower half turns up over the upper one about the
 * crease, the folded note tucks itself into the tab on the exit ease, and the
 * tab lands on recoil with a check and a thank-you before it is a tab again.
 *
 * The tab is a button that controls a dialog; the faces are a radio group
 * (arrows move and choose, except in the quick layout where a choice sends,
 * so there arrows only move and Space or Enter chooses); Tab stays inside the
 * panel, Escape closes it and focus goes back to the tab. Under reduced
 * motion the panel fades where it sits, faces wake by colour without a
 * spring, the capture fades in and a sent note is a short line that fades
 * out, while every state still shows.
 */
export function FeedbackWidget({
  open,
  defaultOpen = false,
  onOpenChange,
  value,
  defaultValue,
  onValueChange,
  onSubmit,
  onCapture,
  faces = "five",
  dock = "right",
  steps = "guided",
  title = "How is it going?",
  prompts,
  placeholder = "A sentence or two is plenty.",
  maxLength = 280,
  screenshot = true,
  tabLabel = "Feedback",
  sentLabel = "Thanks",
  thanksHold = 1600,
  fixed = false,
  children,
  label,
  sound = false,
  disabled = false,
  className,
}: FeedbackWidgetProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const panelId = `${uid}-panel`;
  const titleId = `${uid}-title`;
  const promptId = `${uid}-prompt`;
  const counterId = `${uid}-counter`;
  const asks = { ...defaultFeedbackPrompts, ...prompts };
  const scale = feedbackScales[faces] ?? feedbackScales.five;
  const count = scale.length;
  const limit = Math.max(1, Math.round(maxLength));

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const isOpen = open ?? ownOpen;
  const [ownDraft, setOwnDraft] = React.useState<FeedbackDraft>(
    () => defaultValue ?? emptyFeedback,
  );
  const draft = value ?? ownDraft;
  const rating =
    draft.rating !== null && draft.rating >= 1 && draft.rating <= count
      ? Math.round(draft.rating)
      : null;
  const chosen = rating === null ? null : scale[rating - 1];

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [failure, setFailure] = React.useState<string | null>(null);
  const [hover, setHover] = React.useState<number | null>(null);
  const [focusAt, setFocusAt] = React.useState<number | null>(null);
  const [exitMode, setExitMode] = React.useState<"close" | "instant">("close");
  const [capturing, setCapturing] = React.useState(false);
  const [capture, setCapture] = React.useState<Capture | null>(null);
  const [flash, setFlash] = React.useState(0);
  const [thumb, setThumb] = React.useState<HTMLElement | null>(null);
  const [panelNode, setPanelNode] = React.useState<HTMLElement | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const tabRef = React.useRef<HTMLButtonElement | null>(null);
  const faceNodes = React.useRef(new Map<number, HTMLButtonElement>());
  const latest = React.useRef(draft);
  const focusPanel = React.useRef(false);
  const timers = React.useRef<number[]>([]);
  const alive = React.useRef(true);
  const seq = React.useRef(0);

  const tabBump = useMotionValue(0);
  const tuckX = useMotionValue(0);
  const tuckY = useMotionValue(0);
  const tuckScale = useMotionValue(1);
  const tuckOpacity = useMotionValue(1);
  const fx = useMotionValue(0);
  const fy = useMotionValue(0);
  const fw = useMotionValue(0);
  const fh = useMotionValue(0);

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const panOf = (el: Element | null | undefined) => {
    const rect = el?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const setDraft = (next: FeedbackDraft) => {
    latest.current = next;
    if (value === undefined) setOwnDraft(next);
    onValueChange?.(next);
  };

  const requestOpen = (next: boolean, how: "close" | "instant" = "close") => {
    if (next === isOpen) return;
    setExitMode(how);
    if (next) {
      focusPanel.current = true;
      if (phase === "thanks") setPhase("idle");
    } else if (rootRef.current?.contains(document.activeElement)) {
      tabRef.current?.focus({ preventScroll: true });
    }
    if (how !== "instant") {
      audio.play("swish", {
        pitch: next ? 1.1 : 0.88,
        gain: 0.3,
        pan: panOf(tabRef.current),
      });
    }
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  /* -------------------------------- sending -------------------------------- */

  const send = async () => {
    if (disabled || phase === "sending" || phase === "folding") return;
    if (phase === "tucking") return;
    const d = latest.current;
    const r =
      d.rating !== null && d.rating >= 1 && d.rating <= count
        ? Math.round(d.rating)
        : null;
    if (r === null) {
      setFailure("Pick a face first.");
      faceNodes.current.get(0)?.focus();
      return;
    }
    setFailure(null);
    setPhase("sending");
    say("Sending.");
    try {
      await onSubmit?.({ ...d, rating: r, scale: count });
      if (!alive.current) return;
      // The form is about to become the note: focus waits on the dialog
      // itself, so closing can hand it back to the tab.
      if (panelNode && panelNode.contains(document.activeElement)) {
        panelNode.focus({ preventScroll: true });
      }
      setPhase("folding");
      say(`Sent. ${sentLabel}.`);
      audio.play("swish", {
        pitch: 1.25,
        gain: 0.28,
        pan: panOf(tabRef.current),
      });
    } catch (error) {
      if (!alive.current) return;
      setPhase("error");
      setFailure(messageOf(error, "That didn't send. Try again."));
    }
  };

  /** The note is in the tab: the panel goes, the tab says thanks. */
  const landInTab = () => {
    setPhase("thanks");
    setDraft(emptyFeedback);
    requestOpen(false, "instant");
    audio.play("pop", { pitch: 1.3, gain: 0.5, pan: panOf(tabRef.current) });
    if (motionSafe) {
      animate(tabBump, 0, {
        ...springs.recoil,
        velocity: dock === "left" ? 260 : -260,
      });
    }
  };

  const onFolded = React.useCallback(() => {
    // Under reduced motion the "Sent" line holds instead (the timer below).
    if (!motionSafe) return;
    setPhase("tucking");
  }, [motionSafe]);

  /* --------------------------------- faces --------------------------------- */

  const choose = (i: number) => {
    if (disabled || phase === "sending" || phase === "folding") return;
    const face = scale[i];
    if (!face) return;
    const next = { ...latest.current, rating: i + 1 };
    setDraft(next);
    setFailure(null);
    if (phase === "error") setPhase("idle");
    say(`Rated ${face.label}.`);
    audio.play("pop", {
      pitch: r2(semitones((i - (count - 1) / 2) * 2)),
      gain: 0.55,
      pan: panOf(faceNodes.current.get(i)),
    });
    if (steps === "quick") {
      // A beat so the choice is seen before it leaves.
      timers.current.push(
        window.setTimeout(() => {
          if (alive.current) void send();
        }, 320),
      );
    }
  };

  const faceAt = (clientX: number) => {
    let best = -1;
    let gap = Infinity;
    for (const [i, node] of faceNodes.current) {
      const r = node.getBoundingClientRect();
      const d = Math.abs(clientX - (r.left + r.width / 2));
      if (d < gap) {
        gap = d;
        best = i;
      }
    }
    return best;
  };

  const scrub = useDrag({
    axis: "x",
    threshold: 4,
    disabled:
      disabled ||
      phase === "sending" ||
      phase === "folding" ||
      phase === "tucking",
    onMove: ({ point }) => {
      const i = faceAt(point.x);
      setHover((h) => (h === i ? h : i));
    },
    onEnd: ({ point }) => {
      const i = faceAt(point.x);
      setHover(null);
      if (i >= 0) choose(i);
    },
    onCancel: () => setHover(null),
    onTap: (event) => {
      const i = faceAt(event.clientX);
      if (i >= 0) choose(i);
    },
  });

  const onFaceKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    i: number,
  ) => {
    const to =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (i + 1) % count
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (i - 1 + count) % count
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? count - 1
              : -1;
    if (to < 0) return;
    event.preventDefault();
    faceNodes.current.get(to)?.focus();
    // In the quick layout a choice sends, so arrows only move there.
    if (steps !== "quick") choose(to);
  };

  /* ------------------------------- screenshot ------------------------------ */

  const takeShot = async () => {
    if (disabled || capturing || phase === "sending") return;
    let shot: FeedbackShot = { name: "Screenshot of this page" };
    if (onCapture) {
      setCapturing(true);
      try {
        shot = await onCapture();
      } catch (error) {
        if (!alive.current) return;
        setCapturing(false);
        setFailure(messageOf(error, "The screenshot didn't work. Try again."));
        return;
      }
      if (!alive.current) return;
      setCapturing(false);
    }
    setDraft({ ...latest.current, screenshot: shot });
    say("Screenshot attached.");
    audio.play("pop", { pitch: 1.6, gain: 0.32, pan: panOf(rootRef.current) });
    const root = rootRef.current;
    if (!motionSafe || !root) return;
    seq.current += 1;
    setFlash(seq.current);
    const w = root.clientWidth;
    const h = root.clientHeight;
    setCapture({ key: seq.current, x: 8, y: 8, w: w - 16, h: h - 16 });
  };

  const removeShot = () => {
    if (disabled || phase === "sending") return;
    setDraft({ ...latest.current, screenshot: null });
    setCapture(null);
    say("Screenshot removed.");
  };

  /* -------------------------------- effects -------------------------------- */

  React.useEffect(() => {
    latest.current = draft;
  });

  React.useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    return () => {
      alive.current = false;
      for (const t of pending) window.clearTimeout(t);
    };
  }, []);

  // The frame flies from the page to the thumbnail once the thumbnail is in.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!capture || !thumb || !root) return;
    const box = root.getBoundingClientRect();
    const t = thumb.getBoundingClientRect();
    // jump, not set: a spring would read a set as a fling.
    fx.jump(capture.x);
    fy.jump(capture.y);
    fw.jump(capture.w);
    fh.jump(capture.h);
    const to = {
      x: r2(t.left - box.left - root.clientLeft),
      y: r2(t.top - box.top - root.clientTop),
    };
    const runs = [
      animate(fx, to.x, springs.glide),
      animate(fy, to.y, springs.glide),
      animate(fh, r2(t.height), springs.glide),
      animate(fw, r2(t.width), {
        ...springs.glide,
        onComplete: () =>
          setCapture((c) => (c && c.key === capture.key ? null : c)),
      }),
    ];
    return () => {
      for (const r of runs) r.stop();
    };
  }, [capture, thumb, fx, fy, fw, fh]);

  // The folded note tucks into the tab: toward its centre, small, gone.
  React.useEffect(() => {
    if (phase !== "tucking") return;
    const tab = tabRef.current;
    const panel = panelNode;
    if (!tab || !panel) {
      landInTab();
      return;
    }
    const p = panel.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    const ease = { duration: 0.34, ease: easings.exit };
    const runs = [
      animate(tuckX, r2(t.left + t.width / 2 - (p.left + p.width / 2)), ease),
      animate(tuckY, r2(t.top + t.height / 2 - (p.top + p.height / 2)), ease),
      animate(tuckScale, 0.2, ease),
      animate(tuckOpacity, 0, {
        ...ease,
        onComplete: () => landInTab(),
      }),
    ];
    return () => {
      for (const r of runs) r.stop();
    };
    // Runs once per tuck; landInTab is read from that render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, panelNode]);

  // A panel that opens again starts whole.
  React.useEffect(() => {
    if (!isOpen) return;
    tuckX.jump(0);
    tuckY.jump(0);
    tuckScale.jump(1);
    tuckOpacity.jump(1);
  }, [isOpen, tuckX, tuckY, tuckScale, tuckOpacity]);

  // Reduced motion: the "Sent" line holds, then the panel goes.
  useHeldTimer(phase === "folding" && !motionSafe, 900, () => {
    setPhase("thanks");
    setDraft(emptyFeedback);
    requestOpen(false, "close");
  });
  useHeldTimer(phase === "thanks", thanksHold, () => setPhase("idle"));

  // Focus goes into a panel the visitor opened, once it has arrived.
  React.useEffect(() => {
    if (!panelNode || !focusPanel.current) return;
    focusPanel.current = false;
    const at = rating === null ? 0 : rating - 1;
    const face = faceNodes.current.get(at) ?? faceNodes.current.get(0);
    (face ?? panelNode).focus({ preventScroll: true });
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelNode]);

  const bindPanel = React.useCallback((node: HTMLElement | null) => {
    setPanelNode(node);
  }, []);
  const bindThumb = React.useCallback((node: HTMLElement | null) => {
    setThumb(node);
  }, []);
  const bindFace = (i: number) => (node: HTMLButtonElement | null) => {
    if (node) faceNodes.current.set(i, node);
    else faceNodes.current.delete(i);
  };

  /* ---------------------------------- view --------------------------------- */

  const onPanelKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      // Handled here, where focus is; the page must not also see it.
      event.preventDefault();
      event.stopPropagation();
      requestOpen(false);
      return;
    }
    if (event.key !== "Tab") return;
    const panel = event.currentTarget;
    const items = Array.from(
      panel.querySelectorAll<HTMLElement>(
        "button:not([disabled]):not([tabindex='-1']), textarea:not([disabled]), [tabindex='0']",
      ),
    ).filter((el) => el.getClientRects().length > 0);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const mood = chosen?.mood ?? 0;
  const prompt =
    chosen === null || chosen === undefined
      ? asks.mid
      : mood <= -0.3
        ? asks.low
        : mood >= 0.3
          ? asks.high
          : asks.mid;
  const showRest =
    steps === "single" || (steps === "guided" && rating !== null);
  const left = limit - draft.message.length;
  const sending = phase === "sending";
  const shown = hover ?? focusAt ?? (rating === null ? null : rating - 1);
  const tabbable = rating === null ? (focusAt ?? 0) : rating - 1;

  const side = dock === "bottom" ? "bottom" : dock;
  const off = motionSafe ? distances.shift : 0;
  const panelVariants: Variants = {
    hidden: (mode: "close" | "instant") =>
      mode === "instant"
        ? { opacity: 0, transition: { duration: 0 } }
        : {
            opacity: 0,
            x: side === "right" ? off : side === "left" ? -off : 0,
            y: side === "bottom" ? off : 0,
            scale: motionSafe ? 0.96 : 1,
            transition: exitFor(durations.base),
          },
    shown: {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      transition: {
        opacity: { duration: durations.base, ease: easings.enter },
        x: motionSafe ? springs.glide : { duration: 0 },
        y: motionSafe ? springs.glide : { duration: 0 },
        scale: motionSafe ? springs.glide : { duration: 0 },
      },
    },
  };

  const note = (
    <div className="flex items-start gap-3 rounded-3 border border-hairline-strong bg-surface-2 p-3">
      <NoteFace mood={mood} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground">
          {chosen?.label ?? "Feedback"}
        </p>
        {draft.message.trim() ? (
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-4 text-ink-2">
            “{draft.message.trim()}”
          </p>
        ) : null}
        {draft.screenshot ? (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-3">
            <Paperclip aria-hidden className="size-3 shrink-0" />
            Screenshot
          </p>
        ) : null}
      </div>
    </div>
  );

  const form = (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
      className="flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          id={titleId}
          className="pt-1 text-[14px] leading-5 font-semibold text-foreground"
        >
          {title}
        </h2>
        <button
          type="button"
          aria-label="Close feedback"
          onClick={() => requestOpen(false)}
          className={cn(
            "-mt-0.5 -mr-1.5 inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>

      <div className="flex flex-col items-center gap-1">
        <div
          role="radiogroup"
          aria-labelledby={titleId}
          {...scrub}
          onPointerLeave={() => setHover(null)}
          className={cn(
            "flex w-full touch-pan-y items-center select-none",
            count >= 5 ? "justify-between" : "justify-center gap-6",
          )}
        >
          {scale.map((face, i) => (
            <FaceButton
              key={`${faces}-${i}`}
              face={face}
              index={i}
              count={count}
              selected={rating === i + 1}
              awake={shown === i || rating === i + 1}
              tabbable={tabbable === i}
              motionSafe={motionSafe}
              disabled={disabled}
              busy={sending}
              bind={bindFace(i)}
              onKeyDown={(event) => onFaceKey(event, i)}
              onChoose={() => choose(i)}
              onHover={(on) => setHover((h) => (on ? i : h === i ? null : h))}
              onFocusChange={(on) =>
                setFocusAt((f) => (on ? i : f === i ? null : f))
              }
            />
          ))}
        </div>
        <span aria-hidden className="grid h-4 text-[12px] leading-4">
          {[...scale.map((f) => f.label), "Pick a face"].map((text, i) => {
            const on = shown === null ? i === count : shown === i;
            return (
              <motion.span
                key={`${faces}-${text}`}
                className={cn(
                  "col-start-1 row-start-1 text-center",
                  i === count ? "text-ink-3" : "text-ink-2",
                )}
                initial={false}
                animate={{ opacity: on ? 1 : 0 }}
                transition={{ duration: durations.fast, ease: easings.enter }}
              >
                {text}
              </motion.span>
            );
          })}
        </span>
      </div>

      {steps === "quick" ? (
        <p className="text-center text-[12px] text-ink-3">
          Choosing a face sends it.
        </p>
      ) : null}

      <Measured motionSafe={motionSafe}>
        <AnimatePresence initial={false}>
          {showRest ? (
            <motion.div
              key="rest"
              className="flex flex-col gap-3 pt-1"
              initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                opacity: { duration: durations.base, ease: easings.enter },
                y: motionSafe ? springs.snap : { duration: 0 },
              }}
            >
              <div className="flex flex-col gap-1.5">
                <label
                  id={promptId}
                  htmlFor={`${uid}-message`}
                  className="grid text-[12px] font-medium text-ink-2"
                >
                  {[asks.low, asks.mid, asks.high].map((text, i) => (
                    <motion.span
                      key={i}
                      aria-hidden={text !== prompt || undefined}
                      className="col-start-1 row-start-1"
                      initial={false}
                      animate={{ opacity: text === prompt ? 1 : 0 }}
                      transition={{ duration: durations.fast }}
                    >
                      {text}
                    </motion.span>
                  ))}
                </label>
                <div className="relative">
                  <textarea
                    id={`${uid}-message`}
                    rows={3}
                    maxLength={limit}
                    value={draft.message}
                    placeholder={placeholder}
                    disabled={disabled}
                    // Read-only, not disabled, while sending: a control that
                    // disables itself drops the keyboard's focus.
                    readOnly={sending}
                    aria-disabled={sending || undefined}
                    aria-describedby={counterId}
                    onChange={(event) =>
                      setDraft({
                        ...latest.current,
                        message: event.currentTarget.value.slice(0, limit),
                      })
                    }
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        (event.metaKey || event.ctrlKey)
                      ) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                    className={cn(
                      "block w-full resize-none rounded-2 border border-input bg-background px-3 pt-2 pb-5 text-[13px] leading-5 text-foreground transition-colors placeholder:text-ink-3 hover:border-hairline-strong disabled:opacity-60",
                      FOCUS,
                    )}
                  />
                  <span
                    id={counterId}
                    className={cn(
                      "pointer-events-none absolute right-2.5 bottom-1.5 font-mono text-[10px] tabular-nums",
                      left <= limit * 0.1 ? "text-warn" : "text-ink-3",
                    )}
                  >
                    <span aria-hidden>{left}</span>
                    <span className="sr-only">
                      {left === 1
                        ? "1 character left"
                        : `${left} characters left`}
                    </span>
                  </span>
                </div>
              </div>

              <AnimatePresence initial={false}>
                {failure ? (
                  <motion.p
                    key="failure"
                    role="alert"
                    className="flex items-start gap-1.5 text-[12px] leading-4 text-danger"
                    initial={{
                      opacity: 0,
                      y: motionSafe ? -distances.nudge : 0,
                    }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{
                      duration: durations.base,
                      ease: easings.enter,
                    }}
                  >
                    <TriangleAlert
                      aria-hidden
                      className="mt-px size-3.5 shrink-0"
                    />
                    {failure}
                  </motion.p>
                ) : null}
              </AnimatePresence>

              <div className="flex items-center justify-between gap-2">
                {screenshot ? (
                  draft.screenshot ? (
                    <div className="relative shrink-0 pt-1.5 pr-1.5">
                      <motion.span
                        ref={bindThumb}
                        title={draft.screenshot.name}
                        className="block h-9 w-14 overflow-clip rounded-1 border border-hairline-strong"
                        // The flying frame hands over to it in one frame;
                        // without the flight it fades in where it sits.
                        initial={{ opacity: 0 }}
                        animate={{ opacity: capture ? 0 : 1 }}
                        transition={{
                          duration: motionSafe ? 0 : durations.base,
                          ease: easings.enter,
                        }}
                      >
                        <Thumb shot={draft.screenshot} className="size-full" />
                      </motion.span>
                      <button
                        type="button"
                        aria-label={`Remove ${draft.screenshot.name}`}
                        disabled={disabled}
                        aria-disabled={sending || undefined}
                        onClick={removeShot}
                        className={cn(
                          "absolute top-0 right-0 inline-flex size-5 items-center justify-center rounded-full border border-hairline-strong bg-card text-ink-2 shadow-[0_1px_3px_color-mix(in_oklab,black_16%,transparent)] transition-colors hover:text-foreground",
                          FOCUS,
                        )}
                      >
                        <X aria-hidden className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={disabled}
                      aria-disabled={sending || capturing || undefined}
                      onClick={() => void takeShot()}
                      className={cn(
                        "-ml-2 inline-flex h-8 min-w-0 items-center gap-1.5 rounded-2 px-2 text-[12px] text-ink-2 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:opacity-60",
                        FOCUS,
                      )}
                    >
                      {capturing ? (
                        <LoaderCircle
                          aria-hidden
                          className={cn(
                            "size-4 shrink-0",
                            motionSafe && "animate-spin",
                          )}
                        />
                      ) : (
                        <Camera aria-hidden className="size-4 shrink-0" />
                      )}
                      <span className="truncate">
                        {capturing ? "Capturing…" : "Add screenshot"}
                      </span>
                    </button>
                  )
                ) : (
                  <span />
                )}
                <button
                  type="submit"
                  aria-disabled={sending || undefined}
                  disabled={disabled}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center justify-center rounded-2 bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60",
                    FOCUS,
                    sending && "cursor-progress",
                  )}
                >
                  <span className="grid">
                    {["Send", "Sending…"].map((text) => {
                      const on = (text === "Send") !== sending;
                      return (
                        <span
                          key={text}
                          aria-hidden={!on || undefined}
                          className={cn(
                            "col-start-1 row-start-1 flex items-center justify-center gap-1.5 whitespace-nowrap",
                            on ? "visible" : "invisible",
                          )}
                        >
                          {text === "Sending…" ? (
                            <LoaderCircle
                              aria-hidden
                              className={cn(
                                "size-3.5",
                                motionSafe && "animate-spin",
                              )}
                            />
                          ) : null}
                          {text}
                        </span>
                      );
                    })}
                  </span>
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Measured>
      {!showRest && failure ? (
        <p role="alert" className="text-center text-[12px] text-danger">
          {failure}
        </p>
      ) : null}
    </form>
  );

  const folding = phase === "folding" || phase === "tucking";
  const thanks = phase === "thanks";

  return (
    <div
      ref={rootRef}
      className={cn(
        "@container isolate",
        fixed
          ? "pointer-events-none fixed inset-0 z-50"
          : "relative w-full overflow-clip",
        className,
      )}
    >
      {fixed ? null : children}

      <div className="pointer-events-none absolute inset-0">
        {motionSafe && flash > 0 ? (
          <motion.div
            key={flash}
            aria-hidden
            className="absolute inset-0 bg-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.55, 0] }}
            transition={{
              duration: 0.38,
              times: [0, 0.18, 1],
              ease: "easeOut",
            }}
          />
        ) : null}

        <motion.button
          ref={tabRef}
          type="button"
          aria-expanded={isOpen}
          aria-controls={isOpen ? panelId : undefined}
          aria-label={thanks ? `${tabLabel}: ${sentLabel}` : tabLabel}
          disabled={disabled}
          onClick={() => {
            if (folding) return;
            requestOpen(!isOpen);
          }}
          style={dock === "bottom" ? { y: tabBump } : { x: tabBump }}
          className={cn(
            "pointer-events-auto absolute z-10 flex items-center justify-center gap-1.5 border border-hairline-strong text-[12px] font-medium shadow-[0_2px_10px_color-mix(in_oklab,black_12%,transparent)] transition-[translate,background-color,color] duration-150 disabled:cursor-not-allowed disabled:opacity-60",
            FOCUS,
            thanks
              ? "bg-[oklch(from_var(--success)_0.82_c_h)] text-[oklch(from_var(--success)_0.3_c_h)]"
              : isOpen
                ? "bg-cobalt-wash text-cobalt-bright"
                : "bg-card text-foreground hover:bg-surface-2",
            dock === "right" &&
              "top-1/2 right-0 h-28 w-8 -translate-y-1/2 flex-col rounded-l-2 border-r-0",
            dock === "left" &&
              "top-1/2 left-0 h-28 w-8 -translate-y-1/2 flex-col rounded-r-2 border-l-0",
            dock === "bottom" &&
              "right-4 bottom-0 h-8 rounded-t-2 border-b-0 px-3",
            // The hover pull travels, so it is left out under reduced motion.
            motionSafe &&
              (dock === "right"
                ? "enabled:hover:-translate-x-1"
                : dock === "left"
                  ? "enabled:hover:translate-x-1"
                  : "enabled:hover:-translate-y-1"),
          )}
        >
          {thanks ? (
            <Check aria-hidden className="size-3.5 shrink-0" />
          ) : (
            <MessageSquare aria-hidden className="size-3.5 shrink-0" />
          )}
          <span
            className={cn(
              "grid whitespace-nowrap",
              dock !== "bottom" && "rotate-180 [writing-mode:vertical-rl]",
            )}
          >
            {[tabLabel, sentLabel].map((text) => (
              <span
                key={text}
                aria-hidden
                className={cn(
                  "col-start-1 row-start-1 text-center",
                  (text === sentLabel) === thanks ? "visible" : "invisible",
                )}
              >
                {text}
              </span>
            ))}
          </span>
        </motion.button>

        <AnimatePresence initial={false} custom={exitMode}>
          {isOpen ? (
            <motion.div
              key="panel"
              custom={exitMode}
              variants={panelVariants}
              initial="hidden"
              animate="shown"
              exit="hidden"
              style={{
                originX: dock === "left" ? 0 : 1,
                originY: dock === "bottom" ? 1 : 0.5,
              }}
              className={cn(
                "pointer-events-auto absolute z-20 flex flex-col",
                dock === "right" &&
                  "inset-y-3 right-11 my-auto h-fit max-h-[calc(100%-1.5rem)] w-[min(20rem,calc(100%-3.5rem))] @min-[64rem]:w-[21.25rem]",
                dock === "left" &&
                  "inset-y-3 left-11 my-auto h-fit max-h-[calc(100%-1.5rem)] w-[min(20rem,calc(100%-3.5rem))] @min-[64rem]:w-[21.25rem]",
                dock === "bottom" &&
                  "right-3 bottom-11 max-h-[calc(100%-3.5rem)] w-[min(20rem,calc(100%-1.5rem))] @min-[64rem]:w-[21.25rem]",
              )}
            >
              <motion.div
                ref={bindPanel}
                id={panelId}
                role="dialog"
                aria-labelledby={label ? undefined : titleId}
                aria-label={label}
                tabIndex={-1}
                onKeyDown={onPanelKey}
                style={{
                  x: tuckX,
                  y: tuckY,
                  scale: tuckScale,
                  opacity: tuckOpacity,
                }}
                className="flex w-full flex-col overflow-clip rounded-3 border border-hairline-strong bg-card text-foreground shadow-[0_12px_32px_color-mix(in_oklab,black_18%,transparent)] outline-none"
              >
                <div className="[scrollbar-width:thin] overflow-x-clip overflow-y-auto overscroll-contain p-4">
                  <Measured motionSafe={motionSafe}>
                    <AnimatePresence initial={false} mode="popLayout">
                      {folding ? (
                        <motion.div
                          key="note"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{
                            duration: durations.base,
                            ease: easings.enter,
                          }}
                        >
                          {motionSafe ? (
                            <FoldNote
                              motionSafe={motionSafe}
                              onFolded={onFolded}
                              back={
                                <>
                                  <NoteFace mood={mood} className="size-5" />
                                  {sentLabel}
                                </>
                              }
                            >
                              {note}
                            </FoldNote>
                          ) : (
                            <p className="flex items-center gap-2 py-2 text-[13px] text-foreground">
                              <Check
                                aria-hidden
                                className="size-4 text-success"
                              />
                              Sent. {sentLabel}.
                            </p>
                          )}
                        </motion.div>
                      ) : (
                        <motion.div
                          key="form"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{
                            opacity: 0,
                            transition: exitFor(durations.fast),
                          }}
                          transition={{
                            duration: durations.base,
                            ease: easings.enter,
                          }}
                        >
                          {form}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Measured>
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {capture && draft.screenshot ? (
          <motion.div
            aria-hidden
            className="absolute top-0 left-0 z-30 overflow-clip rounded-2 border border-hairline-strong shadow-[0_8px_24px_color-mix(in_oklab,black_20%,transparent)]"
            style={{ x: fx, y: fy, width: fw, height: fh }}
          >
            <Thumb shot={draft.screenshot} className="size-full" />
          </motion.div>
        ) : null}
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/** The chosen face on the sent note, awake. */
function NoteFace({ mood, className }: { mood: number; className?: string }) {
  const wake = useMotionValue(1);
  return (
    <Face
      mood={mood}
      wake={wake}
      className={cn("size-8 shrink-0", className)}
    />
  );
}
