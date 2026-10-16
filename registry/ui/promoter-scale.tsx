"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, RotateCcw, TriangleAlert, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ------------------------------------------------------------------------- */
/*                                   Types                                    */
/* ------------------------------------------------------------------------- */

export type PromoterSegment = "tiles" | "bars" | "dots";
export type PromoterPalette = "status" | "tonal" | "quiet";
export type PromoterSendState = "idle" | "sending" | "sent" | "failed";

export type PromoterBand = {
  id: string;
  /** What the band is called: "Passive". */
  label: string;
  /** Lowest score in the band. */
  from: number;
  /** Highest score in the band. */
  to: number;
  /** Any CSS colour; overrides the palette's for this band. */
  colour?: string;
};

export type PromoterFollowUp = {
  /** The one question asked of this band. */
  question: string;
  placeholder?: string;
  /** Quick reasons offered as toggles above the field. */
  chips?: string[];
};

export type PromoterAnswer = {
  score: number;
  band: PromoterBand;
  comment: string;
  reasons: string[];
};

export type PromoterScaleProps = {
  /** How the scale is drawn: equal tiles, bars rising left to right, or discs. @default "tiles" */
  segmentStyle?: PromoterSegment;
  /** Band colours: danger, warn and success as pigment; the accent at three depths; or quiet greys with promoters in the accent. @default "status" */
  bandPalette?: PromoterPalette;
  /** Corner radius of segments, ticks, chip, field and buttons, px. @default 8 */
  cornerRadius?: number;
  /** The question over the scale. */
  question?: string;
  /** Score bands, low to high. @default defaultPromoterBands */
  bands?: PromoterBand[];
  /** The follow-up for each band, keyed by band id. @default defaultPromoterFollowUps */
  followUps?: Record<string, PromoterFollowUp>;
  /** Controlled score, or null. */
  value?: number | null;
  /** Initial score when uncontrolled. @default null */
  defaultValue?: number | null;
  /** Fires as the score changes (a click, an arrow or a number key). */
  onValueChange?: (score: number | null) => void;
  /** A score was confirmed and its follow-up opened. */
  onScore?: (score: number, band: PromoterBand) => void;
  /** Send was pressed. Return a promise to show sending; a rejection shows the failed state with the answer kept. */
  onSubmit?: (answer: PromoterAnswer) => void | Promise<unknown>;
  /** The survey was dismissed. */
  onDismiss?: () => void;
  /** Words under the low end. @default "Not likely" */
  lowLabel?: string;
  /** Words under the high end. @default "Very likely" */
  highLabel?: string;
  /** Top of the scale. @default 10 */
  max?: number;
  /** Controlled send state, for a host that tracks delivery itself. */
  sendState?: PromoterSendState;
  /** The survey can be read but not answered. @default false */
  disabled?: boolean;
  /** Classes for the survey's outer box. */
  className?: string;
};

/* ------------------------------------------------------------------------- */
/*                               Seeded defaults                              */
/* ------------------------------------------------------------------------- */

export const defaultPromoterBands: PromoterBand[] = [
  { id: "detractor", label: "Detractor", from: 0, to: 6 },
  { id: "passive", label: "Passive", from: 7, to: 8 },
  { id: "promoter", label: "Promoter", from: 9, to: 10 },
];

export const defaultPromoterFollowUps: Record<string, PromoterFollowUp> = {
  detractor: {
    question: "What's the one thing we should fix first?",
    placeholder: "Tell us what went wrong",
    chips: ["Delivery", "Plant health", "Price", "Support"],
  },
  passive: {
    question: "What would have made it a 10?",
    placeholder: "One thing is plenty",
  },
  promoter: {
    question: "What do you tell people about Fernworks?",
    placeholder: "In your own words",
  },
};

const QUESTION =
  "How likely are you to recommend Fernworks to a friend or colleague?";

/* ------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* ------------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Fills are pigment: a token's hue at a fixed lightness, the same in both themes. */
function paletteFor(palette: PromoterPalette, index: number, count: number) {
  const t = count <= 1 ? 1 : index / (count - 1);
  if (palette === "tonal") {
    const l = (0.82 - t * 0.3).toFixed(3);
    return `oklch(from var(--accent-bright) ${l} ${(0.09 + t * 0.08).toFixed(3)} h)`;
  }
  if (palette === "quiet") {
    if (index === count - 1)
      return "oklch(from var(--accent-bright) 0.6 0.16 h)";
    return `oklch(from var(--ink-3) ${(0.74 - t * 0.2).toFixed(3)} 0.012 h)`;
  }
  const status = [
    "oklch(from var(--danger) 0.64 0.17 h)",
    "oklch(from var(--warn) 0.79 0.14 h)",
    "oklch(from var(--success) 0.66 0.14 h)",
  ];
  return status[Math.round(t * (status.length - 1))] ?? status[0]!;
}

/** Ink on a fill: dark on light pigments, white on deep ones. */
const inkOn = (palette: PromoterPalette, index: number, count: number) => {
  const t = count <= 1 ? 1 : index / (count - 1);
  if (palette === "status") return index === 1 ? "dark" : "light";
  if (palette === "tonal") return t < 0.5 ? "dark" : "light";
  return index === count - 1 ? "light" : t < 0.5 ? "dark" : "light";
};

/* ------------------------------------------------------------------------- */
/*                                  Segment                                   */
/* ------------------------------------------------------------------------- */

/**
 * One step of the scale. Its fill sweeps in on snap after `delay` — the wave
 * — in the colour of the band the score sits in; the numeral turns to the
 * ink that reads on that fill a beat later.
 */
function Segment({
  n,
  max,
  look,
  filled,
  delay,
  colour,
  ink,
  radius,
  layoutId,
  motionSafe,
  hovered,
}: {
  n: number;
  max: number;
  look: PromoterSegment;
  filled: boolean;
  delay: number;
  colour: string;
  ink: "dark" | "light";
  radius: number;
  layoutId: string | undefined;
  motionSafe: boolean;
  hovered: boolean;
}) {
  const t = max <= 0 ? 1 : n / max;
  const fillT = motionSafe
    ? { ...springs.snap, delay }
    : { duration: durations.fast, delay: 0 };
  const inkClass = filled
    ? ink === "dark"
      ? "text-[oklch(from_var(--ink)_0.24_0.02_h)]"
      : "text-white"
    : "text-foreground";
  if (look === "bars") {
    return (
      <span className="flex h-full w-full flex-col items-center justify-end gap-1">
        <motion.span
          layoutId={layoutId}
          className={cn(
            "relative block w-full overflow-hidden",
            hovered && !filled ? "bg-hairline-strong" : "bg-surface-2",
          )}
          style={{
            height: `${Math.round(30 + t * 70)}%`,
            borderRadius: Math.min(radius, 10),
          }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        >
          <motion.span
            aria-hidden
            className="absolute inset-0 origin-bottom"
            style={{
              backgroundColor: colour,
              transition: "background-color 200ms linear",
            }}
            initial={false}
            animate={{ scaleY: filled ? 1 : 0 }}
            transition={fillT}
          />
        </motion.span>
        <span className="font-mono text-[11px] leading-none text-ink-2 tabular-nums">
          {n}
        </span>
      </span>
    );
  }
  const isDot = look === "dots";
  return (
    <motion.span
      layoutId={layoutId}
      className={cn(
        "relative flex items-center justify-center overflow-hidden",
        isDot ? "aspect-square w-full max-w-10" : "size-full",
        "border",
        filled
          ? "border-transparent"
          : hovered
            ? "border-hairline-strong bg-surface-2"
            : "border-hairline bg-surface-1",
      )}
      style={{ borderRadius: isDot ? 999 : radius }}
      transition={motionSafe ? springs.glide : { duration: 0 }}
    >
      <motion.span
        aria-hidden
        className={cn(
          "absolute inset-0",
          isDot ? "origin-center" : "origin-left",
        )}
        style={{
          backgroundColor: colour,
          transition: "background-color 200ms linear",
        }}
        initial={false}
        animate={isDot ? { scale: filled ? 1 : 0 } : { scaleX: filled ? 1 : 0 }}
        transition={fillT}
      />
      <span
        className={cn(
          "relative font-mono text-[13px] font-medium tabular-nums transition-colors duration-150",
          inkClass,
        )}
        style={{
          transitionDelay:
            filled && motionSafe ? `${Math.round(delay * 1000 + 60)}ms` : "0ms",
        }}
      >
        {n}
      </span>
    </motion.span>
  );
}

/* ------------------------------------------------------------------------- */
/*                                 The survey                                 */
/* ------------------------------------------------------------------------- */

type Phase = "ask" | "follow" | "done" | "dismissed";

/**
 * A promoter score survey: zero to ten, then the one question that fits the
 * band the answer falls in.
 *
 * Picking a score fills the segments from zero up to it in a quick wave, each
 * fill sweeping in on snap a few milliseconds after the last, every one in
 * the picked band's colour; lowering the score drains from the top. A beat
 * later the scale shrinks into a summary chip — its segments travel on glide
 * into the chip's mini ticks — while the follow-up written for that band
 * slides in from 16px. The chip is a button that brings the scale back.
 *
 * The scale is a real radio group: arrows and Home/End move the score (the
 * wave follows), number keys pick one (1 then 0 is ten), and Enter, Space or
 * a click confirms it. Sending, thanked and failed states are covered, and
 * the card's height is measured and glides between them. Under reduced
 * motion the fill and every swap are short cross-fades; the score, its band
 * and every state still show.
 */
export function PromoterScale({
  segmentStyle = "tiles",
  bandPalette = "status",
  cornerRadius = 8,
  question = QUESTION,
  bands = defaultPromoterBands,
  followUps = defaultPromoterFollowUps,
  value,
  defaultValue = null,
  onValueChange,
  onScore,
  onSubmit,
  onDismiss,
  lowLabel = "Not likely",
  highLabel = "Very likely",
  max = 10,
  sendState,
  disabled = false,
  className,
}: PromoterScaleProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const qId = `${uid}-q`;
  const fuId = `${uid}-fu`;
  const top = Math.max(1, Math.round(max));
  const radius = clamp(cornerRadius, 0, 24);

  /* --------------------------------- state -------------------------------- */

  const [own, setOwn] = React.useState<number | null>(defaultValue);
  const score = value !== undefined ? value : own;
  const [phase, setPhase] = React.useState<Phase>("ask");
  const [beforeDismiss, setBeforeDismiss] = React.useState<Phase>("ask");
  const [comment, setComment] = React.useState("");
  const [reasons, setReasons] = React.useState<string[]>([]);
  const [ownSend, setOwnSend] = React.useState<PromoterSendState>("idle");
  const send = sendState ?? ownSend;
  const [hover, setHover] = React.useState<number | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (t: string) => setSaid((s) => ({ n: s.n + 1, text: t }));
  const [focusAsk, setFocusAsk] = React.useState<{
    key: string;
    n: number;
  } | null>(null);
  const ask = (key: string) =>
    setFocusAsk((f) => ({ key, n: (f?.n ?? 0) + 1 }));

  // The wave runs from where the score was to where it is.
  const [wave, setWave] = React.useState({
    from: score ?? -1,
    to: score ?? -1,
  });
  if ((score ?? -1) !== wave.to) setWave({ from: wave.to, to: score ?? -1 });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [inner, setInner] = React.useState<HTMLDivElement | null>(null);
  const [boxH, setBoxH] = React.useState<number | null>(null);
  const digit = React.useRef<{ n: number; t: number } | null>(null);
  const advance = React.useRef(0);

  const bandOf = React.useCallback(
    (s: number | null) =>
      s === null
        ? null
        : (bands.find((b) => s >= b.from && s <= b.to) ??
          bands[bands.length - 1] ??
          null),
    [bands],
  );
  const band = bandOf(score);
  const bandIndex = band ? bands.indexOf(band) : -1;
  const colourOf = (b: PromoterBand | null) => {
    if (!b) return "var(--hairline-strong)";
    const i = bands.indexOf(b);
    return b.colour ?? paletteFor(bandPalette, i, bands.length);
  };
  const fill = colourOf(band);
  const ink = band ? inkOn(bandPalette, bandIndex, bands.length) : "dark";
  const follow = band ? followUps[band.id] : undefined;

  /* -------------------------------- effects ------------------------------- */

  React.useEffect(() => {
    if (!inner) return;
    const ro = new ResizeObserver(() => setBoxH(inner.offsetHeight));
    ro.observe(inner);
    return () => ro.disconnect();
  }, [inner]);

  React.useEffect(() => {
    if (!focusAsk) return;
    const node = rootRef.current?.querySelector<HTMLElement>(
      `[data-ps-focus="${CSS.escape(focusAsk.key)}"]`,
    );
    node?.focus({ preventScroll: true });
  }, [focusAsk]);

  React.useEffect(() => () => window.clearTimeout(advance.current), []);

  /* -------------------------------- actions ------------------------------- */

  const setScore = (s: number) => {
    const next = clamp(Math.round(s), 0, top);
    if (next !== score) {
      if (value === undefined) setOwn(next);
      onValueChange?.(next);
      const b = bandOf(next);
      say(`${next}${b ? `, ${b.label.toLowerCase()}` : ""}.`);
    }
    ask(`seg:${next}`);
    return next;
  };

  const confirm = (s: number) => {
    if (disabled) return;
    const next = clamp(Math.round(s), 0, top);
    if (next !== score) {
      if (value === undefined) setOwn(next);
      onValueChange?.(next);
    }
    const b = bandOf(next);
    if (!b) return;
    onScore?.(next, b);
    window.clearTimeout(advance.current);
    // The wave lands first; then the scale gathers into its chip.
    advance.current = window.setTimeout(
      () => {
        setPhase("follow");
        if (sendState === undefined) setOwnSend("idle");
        ask("comment");
      },
      motionSafe ? 260 : 0,
    );
    setReasons([]);
    say(
      `${next}, ${b.label.toLowerCase()}. ${followUps[b.id]?.question ?? ""}`,
    );
  };

  const backToScale = () => {
    window.clearTimeout(advance.current);
    setPhase("ask");
    ask(`seg:${score ?? 0}`);
    say("Change your score.");
  };

  const submit = () => {
    if (disabled || score === null || !band || send === "sending") return;
    const answer: PromoterAnswer = {
      score,
      band,
      comment: comment.trim(),
      reasons,
    };
    const result = onSubmit?.(answer);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      if (sendState === undefined) setOwnSend("sending");
      say("Sending.");
      (result as Promise<unknown>).then(
        () => {
          if (sendState === undefined) setOwnSend("sent");
          setPhase("done");
          ask("thanks");
          say("Sent. Thank you.");
        },
        () => {
          if (sendState === undefined) setOwnSend("failed");
          say("That didn't send. Your answer is still here.");
        },
      );
    } else {
      if (sendState === undefined) setOwnSend("sent");
      setPhase("done");
      ask("thanks");
      say("Sent. Thank you.");
    }
  };

  // A host that tracks delivery moves the survey on its word.
  const [seenSend, setSeenSend] = React.useState(send);
  if (seenSend !== send) {
    setSeenSend(send);
    if (send === "sent" && phase === "follow") setPhase("done");
  }

  const dismiss = () => {
    window.clearTimeout(advance.current);
    setBeforeDismiss(phase === "dismissed" ? "ask" : phase);
    setPhase("dismissed");
    onDismiss?.();
    ask("undo");
    say("Survey dismissed.");
  };

  const undoDismiss = () => {
    setPhase(beforeDismiss);
    ask(
      beforeDismiss === "follow"
        ? "comment"
        : beforeDismiss === "done"
          ? "thanks"
          : `seg:${score ?? 0}`,
    );
  };

  const onScaleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    // With nothing chosen yet, arrows move from the radio that has focus,
    // as any radio group does.
    const focused = Number(
      (e.target as HTMLElement).getAttribute("data-ps-focus")?.slice(4) ?? 0,
    );
    const at = score ?? (Number.isFinite(focused) ? focused : 0);
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        e.preventDefault();
        setScore(at + 1);
        return;
      case "ArrowLeft":
      case "ArrowDown":
        e.preventDefault();
        setScore(at - 1);
        return;
      case "Home":
        e.preventDefault();
        setScore(0);
        return;
      case "End":
        e.preventDefault();
        setScore(top);
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        confirm(at);
        return;
      default:
        break;
    }
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      const n = Number(e.key);
      const now = e.timeStamp;
      const prev = digit.current;
      // 1 then 0 inside the window is ten.
      if (prev && prev.n === 1 && n === 0 && now - prev.t < 600 && top >= 10) {
        digit.current = null;
        setScore(10);
        return;
      }
      digit.current = { n, t: now };
      if (n <= top) setScore(n);
    }
  };

  /* -------------------------------- render -------------------------------- */

  const segs = Array.from({ length: top + 1 }, (_, i) => i);
  const rising = wave.to >= wave.from;
  const span = Math.max(1, Math.abs(wave.to - wave.from));
  // A quick wave: the whole run inside about a quarter second.
  const stepS = Math.min(0.03, 0.26 / span);
  const delayOf = (i: number) => {
    if (!motionSafe) return 0;
    if (rising)
      return i > wave.from && i <= wave.to ? (i - wave.from - 1) * stepS : 0;
    return i > wave.to && i <= wave.from ? (wave.from - i) * stepS : 0;
  };
  const shared = motionSafe && phase !== "dismissed";
  const layoutIdOf = (i: number) => (shared ? `${uid}-seg-${i}` : undefined);
  const wide = top <= 10;

  const scale = (
    <motion.div
      key="scale"
      className="flex flex-col gap-2.5 @min-[34rem]/promoter-scale:gap-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{ duration: durations.base, ease: easings.enter }}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          id={qId}
          className="text-[14px] leading-5 font-semibold text-pretty text-foreground @min-[34rem]/promoter-scale:text-[15px]"
        >
          {question}
        </p>
        <button
          type="button"
          aria-label="Dismiss survey"
          onClick={dismiss}
          className={cn(
            "-mt-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
          )}
          style={{ borderRadius: Math.min(radius, 8) }}
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div
        role="radiogroup"
        aria-labelledby={qId}
        aria-describedby={`${uid}-hint`}
        aria-disabled={disabled || undefined}
        onKeyDown={onScaleKey}
        onPointerLeave={() => setHover(null)}
        className={cn(
          "grid gap-1 @min-[34rem]/promoter-scale:gap-1.5",
          wide
            ? "grid-cols-6 @min-[34rem]/promoter-scale:grid-cols-11"
            : "grid-cols-6",
        )}
      >
        {segs.map((i) => {
          const b = bandOf(i);
          const on = score === i;
          const filled = score !== null && i <= score;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${i}${b ? `, ${b.label.toLowerCase()}` : ""}`}
              tabIndex={on || (score === null && i === 0) ? 0 : -1}
              data-ps-focus={`seg:${i}`}
              disabled={disabled}
              onClick={() => confirm(i)}
              onPointerEnter={(e) => {
                if (e.pointerType !== "touch") setHover(i);
              }}
              className={cn(
                "relative flex items-center justify-center disabled:opacity-50",
                segmentStyle === "bars"
                  ? "h-11 @min-[34rem]/promoter-scale:h-12"
                  : segmentStyle === "dots"
                    ? ""
                    : "h-9 @min-[34rem]/promoter-scale:h-10",
                FOCUS_RING,
              )}
              style={{ borderRadius: segmentStyle === "dots" ? 999 : radius }}
            >
              <Segment
                n={i}
                max={top}
                look={segmentStyle}
                filled={filled}
                delay={delayOf(i)}
                colour={fill}
                ink={ink}
                radius={radius}
                layoutId={layoutIdOf(i)}
                motionSafe={motionSafe}
                hovered={hover !== null && i <= hover && !filled}
              />
            </button>
          );
        })}
      </div>
      <div className="flex h-7 items-center justify-between gap-2 text-[11px] text-ink-3">
        <span>
          <span className="font-mono tabular-nums">0</span> · {lowLabel}
        </span>
        {score !== null ? (
          <button
            type="button"
            onClick={() => confirm(score)}
            disabled={disabled}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50",
              FOCUS_RING,
            )}
            style={{
              borderRadius: Math.min(radius, 8),
              boxShadow: `inset 0 0 0 1px ${fill}`,
            }}
          >
            Continue with {score}
          </button>
        ) : null}
        <span>
          {highLabel} · <span className="font-mono tabular-nums">{top}</span>
        </span>
      </div>
    </motion.div>
  );

  const chip =
    score !== null && band ? (
      <button
        type="button"
        data-ps-focus="chip"
        onClick={backToScale}
        disabled={disabled || phase === "done"}
        aria-label={`Score ${score}, ${band.label.toLowerCase()}. ${phase === "done" ? "Sent" : "Change score"}`}
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1.5 border border-hairline bg-surface-1 pr-2 pl-1.5 text-[12px] transition-colors enabled:hover:bg-surface-2 @min-[34rem]/promoter-scale:gap-2 @min-[34rem]/promoter-scale:pr-2.5",
          FOCUS_RING,
        )}
        style={{ borderRadius: Math.min(radius, 16) }}
      >
        <span
          className="flex h-5 min-w-5 items-center justify-center px-1 font-mono text-[12px] font-semibold tabular-nums"
          style={{
            backgroundColor: fill,
            color:
              ink === "dark" ? "oklch(from var(--ink) 0.24 0.02 h)" : "white",
            borderRadius: Math.min(radius, 6),
          }}
        >
          {score}
        </span>
        <span aria-hidden className="flex h-3 items-end gap-[2px]">
          {segs.map((i) => (
            <motion.span
              key={i}
              layoutId={layoutIdOf(i)}
              className="block w-[2px] @min-[34rem]/promoter-scale:w-[3px]"
              style={{
                height:
                  segmentStyle === "bars"
                    ? `${Math.round(40 + (i / top) * 60)}%`
                    : "100%",
                backgroundColor: i <= score ? fill : "var(--hairline-strong)",
                borderRadius: Math.min(radius, 2),
              }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            />
          ))}
        </span>
        <span className="font-medium text-foreground">{band.label}</span>
      </button>
    ) : null;

  const reasonChips = follow?.chips?.length ? (
    <div
      role="group"
      aria-label="Quick reasons"
      className="-mx-1 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-1 py-0.5 @min-[34rem]/promoter-scale:flex-wrap"
    >
      {follow.chips.map((c) => {
        const on = reasons.includes(c);
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            disabled={disabled || send === "sending"}
            onClick={() =>
              setReasons((r) =>
                r.includes(c) ? r.filter((x) => x !== c) : [...r, c],
              )
            }
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1 border px-2.5 text-[12px] transition-colors disabled:opacity-50",
              on
                ? "border-transparent text-foreground"
                : "border-hairline text-ink-2 hover:bg-surface-2",
              FOCUS_RING,
            )}
            style={{
              borderRadius: Math.min(radius, 14),
              backgroundColor: on
                ? `color-mix(in oklab, ${fill} 22%, transparent)`
                : undefined,
            }}
          >
            {on ? <Check aria-hidden className="size-3" /> : null}
            {c}
          </button>
        );
      })}
    </div>
  ) : null;

  const busy = send === "sending";
  const failed = send === "failed";

  const followUp = (
    <motion.div
      key="follow"
      className="flex flex-col gap-2.5"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) {
          e.preventDefault();
          e.stopPropagation();
          backToScale();
        }
      }}
      initial={{ opacity: 0, x: motionSafe ? distances.shift : 0 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{
        opacity: {
          duration: durations.base,
          ease: easings.enter,
          delay: motionSafe ? 0.06 : 0,
        },
        x: motionSafe ? { ...springs.glide, delay: 0.06 } : { duration: 0 },
      }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {chip}
        <p
          id={fuId}
          className="order-last min-w-0 basis-full text-[14px] leading-5 font-medium text-foreground @min-[34rem]/promoter-scale:order-none @min-[34rem]/promoter-scale:flex-1 @min-[34rem]/promoter-scale:basis-0"
        >
          {follow?.question ?? "Anything to add?"}
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={submit}
            aria-disabled={disabled || busy || undefined}
            className={cn(
              "inline-flex h-8 items-center px-1.5 text-[12px] text-ink-3 transition-colors hover:text-foreground aria-disabled:opacity-50 @min-[34rem]/promoter-scale:px-2",
              FOCUS_RING,
            )}
            style={{ borderRadius: Math.min(radius, 8) }}
          >
            Skip
          </button>
          <button
            type="button"
            aria-label="Dismiss survey"
            onClick={dismiss}
            className={cn(
              "inline-flex size-7 items-center justify-center text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground @min-[34rem]/promoter-scale:size-8",
              FOCUS_RING,
            )}
            style={{ borderRadius: Math.min(radius, 8) }}
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      </div>
      {reasonChips}
      <div className="flex items-end gap-2">
        <label htmlFor={`${uid}-comment`} className="sr-only">
          {follow?.question ?? "Anything to add?"}
        </label>
        <textarea
          id={`${uid}-comment`}
          data-ps-focus="comment"
          rows={1}
          value={comment}
          disabled={disabled}
          readOnly={busy}
          aria-describedby={failed ? `${uid}-err` : undefined}
          placeholder={follow?.placeholder ?? ""}
          onChange={(e) => {
            const next = e.currentTarget.value;
            setComment(next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          className={cn(
            "[field-sizing:content] max-h-20 min-w-0 flex-1 resize-none border border-input bg-card px-3 py-2 text-[13px] leading-5 text-foreground placeholder:text-ink-3 disabled:opacity-60 @min-[34rem]/promoter-scale:[min-height:3.5rem]",
            "outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring focus-visible:outline-solid",
          )}
          style={{ borderRadius: Math.min(radius, 12) }}
        />
        <button
          type="button"
          onClick={submit}
          aria-disabled={disabled || busy || undefined}
          aria-busy={busy || undefined}
          aria-label={busy ? "Sending" : failed ? "Try sending again" : "Send"}
          className={cn(
            "relative inline-flex h-9 shrink-0 items-center gap-1.5 px-3 text-[12px] font-medium text-white transition-opacity hover:opacity-90",
            busy && "cursor-progress",
            FOCUS_RING,
          )}
          style={{
            borderRadius: Math.min(radius, 10),
            backgroundColor: "oklch(from var(--accent-bright) 0.52 0.17 h)",
          }}
        >
          {busy ? (
            <span
              aria-hidden
              className="size-3.5 rounded-full border-2 border-white/40 border-t-white motion-safe:animate-spin"
            />
          ) : failed ? (
            <RotateCcw aria-hidden className="size-3.5" />
          ) : (
            <ArrowUp aria-hidden className="size-3.5" />
          )}
          <span className="hidden @min-[34rem]/promoter-scale:inline">
            {busy ? "Sending" : failed ? "Try again" : "Send"}
          </span>
        </button>
      </div>
      {failed ? (
        <p
          id={`${uid}-err`}
          className="flex items-center gap-1.5 text-[12px] text-danger"
        >
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          That didn&apos;t send. Your answer is still here.
        </p>
      ) : null}
    </motion.div>
  );

  const thanks = (
    <motion.div
      key="done"
      className="flex flex-wrap items-center gap-x-3 gap-y-2"
      initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{
        opacity: { duration: durations.base, ease: easings.enter },
        y: motionSafe ? springs.glide : { duration: 0 },
      }}
    >
      {chip}
      <p
        data-ps-focus="thanks"
        tabIndex={-1}
        className="flex min-w-0 flex-1 basis-56 items-center gap-2 text-[14px] leading-5 text-foreground outline-none"
      >
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: "oklch(from var(--success) 0.66 0.14 h)" }}
        >
          <svg aria-hidden viewBox="0 0 16 16" className="size-3.5">
            <motion.path
              d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
              fill="none"
              stroke="white"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: motionSafe ? 0 : 1 }}
              animate={{ pathLength: 1 }}
              transition={
                motionSafe ? { ...springs.flick, delay: 0.12 } : { duration: 0 }
              }
            />
          </svg>
        </span>
        Thanks — it goes straight to the Fernworks team.
      </p>
    </motion.div>
  );

  const dismissed = (
    <motion.div
      key="dismissed"
      className="flex items-center justify-between gap-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{ duration: durations.base }}
    >
      <p className="text-[13px] text-ink-2">
        We won&apos;t ask again this month.
      </p>
      <button
        type="button"
        data-ps-focus="undo"
        onClick={undoDismiss}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 border border-hairline px-3 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
          FOCUS_RING,
        )}
        style={{ borderRadius: Math.min(radius, 8) }}
      >
        <RotateCcw aria-hidden className="size-3.5" />
        Undo
      </button>
    </motion.div>
  );

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label="Recommend Fernworks"
      className={cn(
        "@container/promoter-scale w-full border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ borderRadius: Math.min(radius + 8, 24) }}
    >
      <p id={`${uid}-hint`} className="sr-only">
        Arrow keys or a number choose a score; 1 then 0 is ten. Enter confirms
        it.
      </p>
      <motion.div
        initial={false}
        animate={{ height: boxH ?? "auto" }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
        style={{ overflow: "clip", overflowClipMargin: 6 }}
      >
        <div ref={setInner} className="p-3 @min-[34rem]/promoter-scale:p-4">
          <AnimatePresence mode="popLayout" initial={false}>
            {phase === "ask"
              ? scale
              : phase === "follow"
                ? followUp
                : phase === "done"
                  ? thanks
                  : dismissed}
          </AnimatePresence>
        </div>
      </motion.div>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
