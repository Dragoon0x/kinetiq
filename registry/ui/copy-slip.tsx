"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/** Why a copy did not happen. */
export type CopySlipFailure = "insecure" | "blocked" | "unavailable";

export type CopySlipProps = {
  /** What is copied, and shown in the field. */
  value: string;
  /** Names the field. The button is named by its word plus this: "Copy Payment link". */
  label: string;
  /** How high the slip is lobbed, 0 to 1: 0 slides it straight along the row, 1 uses all the room above it. @default 0.8 */
  arc?: number;
  /** How light the paper is, 0 to 1: a stiff card thrown straight, or a slip that hangs, tilts and flutters. @default 0.5 */
  slip?: number;
  /** Seconds the clip stays shut and the button says Copied. @default 2 */
  hold?: number;
  /** Print the copied text on the slip; off draws ruled lines, for values that should not fly past a shared screen. @default true */
  showText?: boolean;
  /** Fires once the clipboard has taken the value. */
  onCopy?: (value: string) => void;
  /** Fires when the clipboard refused, with why. */
  onCopyError?: (reason: CopySlipFailure) => void;
  /** Writes the text. Defaults to the system clipboard's `writeText`. */
  writer?: (text: string) => Promise<void>;
  /** Play the paper and the clip. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Phase = "idle" | "copied" | "failed";

type Outcome = { ok: true } | { ok: false; reason: CopySlipFailure };

type Path = {
  /** Slip centre at launch and at the clip, in the root's own coordinates. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** The quadratic control point's height: it sets the arc. */
  cy: number;
  /** Slip width at launch, and the scale that fits it under the clip. */
  width: number;
  end: number;
};

type Attempt = {
  run: number;
  outcome: Outcome | null;
  arrived: boolean;
  done: boolean;
};

const SLIP_HEIGHT = 22;
/** The sheet's width inside the 24px clipboard glyph. */
const SHEET_WIDTH = 9;
/** Degrees. Keeps a long slip's corners inside the field row at launch. */
const MAX_TILT = 10;
/** A writer that has not answered by now is treated as a refusal. */
const PATIENCE = 3000;
const NO_BREAK_SPACE = "\u00a0";

const REASONS: Record<CopySlipFailure, string> = {
  insecure: "Copying needs a secure (https) page.",
  blocked: "The browser blocked the clipboard.",
  unavailable: "The clipboard did not take it.",
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** At rest the (invisible) slip sits at the box's own top-left corner. */
const REST: Path = {
  x0: 60,
  y0: SLIP_HEIGHT / 2,
  x1: 60,
  y1: SLIP_HEIGHT / 2,
  cy: SLIP_HEIGHT / 2,
  width: 120,
  end: 1,
};

function reasonOf(error: unknown): CopySlipFailure {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name: unknown }).name)
      : "";
  return name === "NotAllowedError" || name === "SecurityError"
    ? "blocked"
    : "unavailable";
}

/**
 * A copy field whose Copy button is a clipboard with its clip standing open.
 * Pressed, a paper slip carrying the text lifts off the start of the value
 * and flies in an arc over the row into the clipboard, shrinking to fit under
 * the clip; the frame it arrives, the clip clamps shut on `snap` — one crisp
 * overshoot, because a clamp is a switch — and the glyph takes the landing on
 * `recoil`. The button says Copied until the clip opens again, `hold`
 * seconds later.
 *
 * The flight is one progress value on a near-linear tween, with x linear in
 * it and y a quadratic curve, so the slip travels as a real throw does; its
 * position, size, tilt and fade all derive from that one value and are
 * rounded before they reach a style. The arc's height is measured from the
 * room above the row inside the component, so the slip never leaves its box.
 *
 * The write starts on the press, while the slip is in the air, and the slip
 * only goes in if the clipboard took it: an unanswered write holds the slip at
 * the clip's mouth, and a refused one (an insecure page, a denied permission)
 * bounces it back out on `recoil`, leaves the clip open, selects the text so
 * one keystroke copies it, and says why in words. Under reduced motion there
 * is no flight: the sheet appears and the clip shows shut, and the words and
 * the sounds are the same.
 */
export function CopySlip({
  value,
  label,
  arc = 0.8,
  slip = 0.5,
  hold = 2,
  showText = true,
  onCopy,
  onCopyError,
  writer,
  sound = false,
  disabled = false,
  className,
}: CopySlipProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const labelId = React.useId();
  const wordId = React.useId();

  const [phase, setPhase] = React.useState<Phase>("idle");
  // Counts phase changes, so the first render shows its word without a fade.
  const [changes, setChanges] = React.useState(0);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [spoken, setSpoken] = React.useState({ text: "", n: 0 });
  const [messageNode, setMessageNode] = React.useState<HTMLDivElement | null>(
    null,
  );
  const [messageHeight, setMessageHeight] = React.useState(0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const textRef = React.useRef<HTMLSpanElement | null>(null);
  const glyphRef = React.useRef<SVGSVGElement | null>(null);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const watchdog = React.useRef<number | null>(null);
  const attempt = React.useRef<Attempt>({
    run: 0,
    outcome: null,
    arrived: false,
    done: true,
  });
  const flying = React.useRef(false);
  const alive = React.useRef(true);
  const holdClock = React.useRef({
    timer: null as number | null,
    remaining: 0,
    started: 0,
    run: 0,
  });

  const path = useMotionValue<Path>(REST);
  const progress = useMotionValue(0);
  const fade = useMotionValue(0);
  const sheet = useMotionValue(0);
  const clamp = useMotionValue(0);
  const kick = useMotionValue(1);

  const s = clamp01(slip);

  const halt = React.useCallback(() => {
    for (const c of running.current) c.stop();
    running.current = [];
    if (watchdog.current !== null) window.clearTimeout(watchdog.current);
    watchdog.current = null;
    const clock = holdClock.current;
    if (clock.timer !== null) window.clearTimeout(clock.timer);
    clock.timer = null;
    clock.remaining = 0;
  }, []);

  const changePhase = (next: Phase) => {
    setPhase(next);
    setChanges((n) => n + 1);
  };

  // A live region repeats nothing it already holds; a trailing no-break space
  // on every other sentence lets a second "copied" be heard too.
  const say = (text: string) => setSpoken((prev) => ({ text, n: prev.n + 1 }));

  const reopen = (run: number) => {
    if (!alive.current || attempt.current.run !== run) return;
    holdClock.current.timer = null;
    holdClock.current.remaining = 0;
    if (motionSafe) running.current.push(animate(clamp, 0, springs.snap));
    else clamp.set(0);
    running.current.push(
      animate(sheet, 0, { duration: durations.base, ease: easings.exit }),
    );
    changePhase("idle");
  };

  const startHold = (run: number) => {
    const clock = holdClock.current;
    clock.run = run;
    clock.remaining = Math.round(Math.max(0.5, hold) * 1000);
    clock.started = performance.now();
    clock.timer = window.setTimeout(
      () => latest.current.reopen(run),
      clock.remaining,
    );
  };

  const glyphPan = () => {
    const box = glyphRef.current?.getBoundingClientRect();
    return box ? panFrom(box.left + box.width / 2, null) : 0;
  };

  const selectValue = () => {
    const node = textRef.current;
    const selection = window.getSelection();
    if (!node || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const finish = (run: number, outcome: Outcome) => {
    const a = attempt.current;
    if (!alive.current || a.run !== run || a.done) return;
    a.done = true;
    flying.current = false;
    if (watchdog.current !== null) window.clearTimeout(watchdog.current);
    watchdog.current = null;
    const pan = glyphPan();

    if (outcome.ok) {
      fade.set(0);
      sheet.set(1);
      if (motionSafe) {
        kick.set(0.92);
        running.current.push(
          animate(clamp, 1, springs.snap),
          animate(kick, 1, springs.recoil),
        );
      } else {
        clamp.set(1);
      }
      audio.play("snap", { pitch: 0.8, gain: 0.55, pan });
      changePhase("copied");
      say(`${label.replace(/\.$/, "")} copied.`);
      startHold(run);
      onCopy?.(value);
      return;
    }

    if (motionSafe) {
      // Refused at the door: the slip rebounds back up its own arc and
      // fades, so it never looks as if it went in.
      running.current.push(
        animate(progress, 0.78, springs.recoil),
        animate(fade, 0, { duration: durations.base, ease: easings.exit }),
      );
    } else {
      fade.set(0);
    }
    audio.play("shrug", { gain: 0.4, pan });
    selectValue();
    const apple = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
    const sentence = `${REASONS[outcome.reason]} The text is selected; press ${apple ? "⌘C" : "Ctrl+C"} to copy it.`;
    setFailure(sentence);
    changePhase("failed");
    say(`Not copied. ${sentence}`);
    onCopyError?.(outcome.reason);
  };

  // Landings and the hold clock fire after the press that started them;
  // they reach the current props through here, not the press's own render.
  const latest = React.useRef({ finish, reopen });
  React.useEffect(() => {
    latest.current = { finish, reopen };
  });

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      halt();
    };
  }, [halt]);

  // The hold is a clock a visitor is meant to see: it stops while the page is
  // hidden and runs out its remainder when the page comes back.
  React.useEffect(() => {
    const onVisibility = () => {
      const clock = holdClock.current;
      if (document.hidden) {
        if (clock.timer === null) return;
        window.clearTimeout(clock.timer);
        clock.timer = null;
        clock.remaining = Math.max(
          0,
          clock.remaining - (performance.now() - clock.started),
        );
      } else if (clock.remaining > 0 && clock.timer === null) {
        const run = clock.run;
        clock.started = performance.now();
        clock.timer = window.setTimeout(
          () => latest.current.reopen(run),
          clock.remaining,
        );
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // The reason line is measured, never reserved: its height follows its words.
  React.useEffect(() => {
    if (!messageNode) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setMessageHeight(Math.round(entry.contentRect.height));
    });
    observer.observe(messageNode);
    return () => observer.disconnect();
  }, [messageNode]);

  const write = (): Promise<Outcome> => {
    const clipboard =
      typeof navigator === "undefined" ? undefined : navigator.clipboard;
    const send =
      writer ??
      (clipboard?.writeText
        ? (text: string) => clipboard.writeText(text)
        : null);
    if (!send) {
      return Promise.resolve({
        ok: false,
        reason: window.isSecureContext === false ? "insecure" : "unavailable",
      });
    }
    try {
      return send(value).then(
        (): Outcome => ({ ok: true }),
        (error: unknown): Outcome => ({ ok: false, reason: reasonOf(error) }),
      );
    } catch (error) {
      return Promise.resolve({ ok: false, reason: reasonOf(error) });
    }
  };

  /** The slip has reached the clip (or, with no flight, the press is over). */
  const arrive = (run: number) => {
    const a = attempt.current;
    if (a.run !== run) return;
    a.arrived = true;
    if (a.outcome) {
      latest.current.finish(run, a.outcome);
      return;
    }
    watchdog.current = window.setTimeout(
      () => latest.current.finish(run, { ok: false, reason: "unavailable" }),
      PATIENCE,
    );
  };

  const copy = () => {
    if (disabled || flying.current) return;
    halt();
    const run = attempt.current.run + 1;
    attempt.current = { run, outcome: null, arrived: false, done: false };
    // The write goes first, inside the press, where the clipboard allows it.
    write().then((outcome) => {
      const a = attempt.current;
      if (a.run !== run) return;
      a.outcome = outcome;
      if (a.arrived) latest.current.finish(run, outcome);
    });

    // A press while shut starts over: the clip opens and the old sheet leaves.
    if (clamp.get() > 0.01 || sheet.get() > 0.01) {
      if (motionSafe) running.current.push(animate(clamp, 0, springs.flick));
      else clamp.set(0);
      running.current.push(
        animate(sheet, 0, { duration: durations.fast, ease: easings.exit }),
      );
    }
    if (phase !== "idle") changePhase("idle");
    setFailure(null);

    const root = rootRef.current?.getBoundingClientRect();
    const text = textRef.current?.getBoundingClientRect();
    const glyph = glyphRef.current?.getBoundingClientRect();
    if (!motionSafe || !root || !text || !glyph) {
      arrive(run);
      return;
    }

    const width = Math.round(
      Math.max(56, Math.min(text.width + 14, 150, root.width * 0.5)),
    );
    const x0 = r2(text.left - root.left - 7 + width / 2);
    const y0 = r2(text.top - root.top + text.height / 2);
    const x1 = r2(glyph.left - root.left + glyph.width / 2);
    const y1 = r2(glyph.top - root.top + glyph.height / 2 + 1);
    // The room above the row inside the box, less the slip's own half-height
    // at the top of the arc (it has begun to shrink by then) and what its
    // flutter can lift a corner by there.
    const end = SHEET_WIDTH / width;
    const peakScale = lerp(1, end, 0.25);
    const lift =
      (width / 2) * peakScale * Math.sin((MAX_TILT * 0.3 * s * Math.PI) / 180);
    const headroom = Math.max(
      0,
      Math.min(y0, y1) - (SLIP_HEIGHT / 2) * peakScale - lift - 1,
    );
    const top = Math.min(y0, y1) - clamp01(arc) * headroom;
    path.set({
      x0,
      y0,
      x1,
      y1,
      cy: r2(2 * top - (y0 + y1) / 2),
      width,
      end: r3(end),
    });
    progress.set(0);
    flying.current = true;

    const pan = panFrom(text.left + 24, null);
    audio.play("paper", { pitch: 1.1, gain: 0.32, pan });
    audio.play("swish", {
      pitch: r2(0.85 + 0.4 * clamp01(arc)),
      gain: 0.38,
      pan,
    });
    running.current.push(
      animate(fade, 1, { duration: durations.blink, ease: easings.enter }),
      animate(progress, 1, {
        duration: r2(0.36 + 0.24 * s),
        // A stiff card is thrown and keeps its speed; a light slip hangs as
        // it leaves, then glides in.
        ease: [
          r3(lerp(0.25, 0.5, s)),
          r3(lerp(0.3, 0.05, s)),
          r3(lerp(0.55, 0.35, s)),
          1,
        ],
        onComplete: () => arrive(run),
      }),
    );
  };

  const x = useTransform(() => {
    const g = path.get();
    const t = progress.get();
    return r2(lerp(g.x0, g.x1, t) - g.width / 2);
  });
  const y = useTransform(() => {
    const g = path.get();
    const t = progress.get();
    const u = 1 - t;
    return r2(u * u * g.y0 + 2 * u * t * g.cy + t * t * g.y1 - SLIP_HEIGHT / 2);
  });
  // Shrinks late, as it reaches the clip, so it reads as travelling first.
  const scale = useTransform(() => {
    const g = path.get();
    const t = clamp01(progress.get());
    return r3(lerp(1, g.end, t * t));
  });
  // The slip leans along its heading, as light paper does, plus a flutter
  // that grows with `slip`; both die away as it goes under the clip.
  const rotate = useTransform(() => {
    const g = path.get();
    const t = progress.get();
    const dx = g.x1 - g.x0;
    const dy = 2 * (1 - t) * (g.cy - g.y0) + 2 * t * (g.y1 - g.cy);
    const heading =
      dx === 0 && dy === 0 ? 0 : (Math.atan2(dy, dx) * 180) / Math.PI;
    const flutter = MAX_TILT * 0.6 * s * Math.sin(t * Math.PI * 3) * (1 - t);
    // It leaves the text lying flat and only leans once it is off it.
    const ramp = Math.min(1, t / 0.2);
    const tilt =
      (heading * lerp(0.1, 0.3, s) + flutter) * ramp * (1 - t * t * t);
    return r2(Math.max(-MAX_TILT, Math.min(MAX_TILT, tilt)));
  });
  const slipWidth = useTransform(() => path.get().width);
  // The clip is a lever hinged at its lower left: open, it lifts out of its
  // notch and tips up; shut, it sits in the notch on the sheet. Motion writes
  // an SVG child's transform as CSS, so these are transform values with the
  // origin at the hinge, not an SVG transform string (which CSS would reject
  // and silently drop).
  const clipLift = useTransform(clamp, (c) => r2(-1.75 * (1 - c)));
  const clipTilt = useTransform(clamp, (c) => r2(-10 * (1 - c)));

  const word =
    phase === "copied" ? "Copied" : phase === "failed" ? "Failed" : "Copy";
  const spokenText =
    spoken.n % 2 === 1 ? `${spoken.text}${NO_BREAK_SPACE}` : spoken.text;

  return (
    <div
      ref={rootRef}
      className={cn("relative flex w-full min-w-0 flex-col", className)}
    >
      <span
        id={labelId}
        className={cn(
          "pb-2 text-xs font-medium",
          disabled ? "text-ink-3" : "text-ink-2",
        )}
      >
        {label}
      </span>
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex h-10 min-w-0 flex-1 items-center rounded-2 border border-input bg-surface-2 px-3",
            disabled && "opacity-50",
          )}
        >
          <span
            ref={textRef}
            title={value}
            className="truncate font-mono text-xs text-foreground select-all"
          >
            {value}
          </span>
        </div>
        <motion.button
          type="button"
          aria-labelledby={`${wordId} ${labelId}`}
          disabled={disabled}
          onClick={copy}
          whileTap={motionSafe ? { scale: 0.97 } : undefined}
          transition={springs.flick}
          className={cn(
            "inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-2 border border-hairline-strong bg-card px-3 text-sm font-medium transition-colors outline-none select-none enabled:hover:bg-surface-2",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            phase === "copied"
              ? "text-success"
              : phase === "failed"
                ? "text-danger"
                : "text-foreground",
          )}
        >
          <motion.svg
            ref={glyphRef}
            aria-hidden
            viewBox="0 0 24 24"
            className="size-6 shrink-0"
            style={{ scale: kick }}
          >
            {/* The board, with shoulders either side of the clip's notch. */}
            <path
              d="M15.5 4.5H17a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h1.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
            {/* The slip, landed: its top edge tucked under the clip. */}
            <motion.g style={{ opacity: sheet }}>
              <rect
                x={7.5}
                y={5.5}
                width={SHEET_WIDTH}
                height={13.5}
                rx={0.75}
                fill="currentColor"
                fillOpacity={0.16}
              />
              <path
                d="M9.5 10.5h5M9.5 13h5M9.5 15.5h3"
                stroke="currentColor"
                strokeWidth={1}
                strokeLinecap="round"
              />
            </motion.g>
            <motion.g
              style={{ y: clipLift, rotate: clipTilt, originX: 0, originY: 1 }}
            >
              <rect
                x={8.5}
                y={2.5}
                width={7}
                height={4}
                rx={1.25}
                fill="currentColor"
              />
            </motion.g>
          </motion.svg>
          {/* One cell, sized by the longest word, so the button never resizes. */}
          <span className="grid">
            <span aria-hidden className="invisible col-start-1 row-start-1">
              Copied
            </span>
            <span aria-hidden className="invisible col-start-1 row-start-1">
              Failed
            </span>
            <motion.span
              key={word}
              id={wordId}
              className="col-start-1 row-start-1 text-center"
              initial={changes === 0 ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            >
              {word}
            </motion.span>
          </span>
        </motion.button>
      </div>

      <motion.div
        className="overflow-clip"
        initial={false}
        animate={{ height: messageHeight }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      >
        <div ref={setMessageNode}>
          {failure ? (
            <p className="pt-2 text-xs text-danger">{failure}</p>
          ) : null}
        </div>
      </motion.div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-clip [contain:paint]"
      >
        <motion.div
          className="absolute top-0 left-0 flex items-center rounded-1 border border-hairline-strong bg-card px-1.5"
          style={{
            x,
            y,
            scale,
            rotate,
            width: slipWidth,
            height: SLIP_HEIGHT,
            opacity: fade,
            boxShadow:
              "0 4px 10px -4px color-mix(in oklab, black 40%, transparent)",
          }}
        >
          {showText ? (
            <span className="truncate font-mono text-xs leading-none text-ink-2">
              {value}
            </span>
          ) : (
            <span className="flex w-full flex-col gap-1">
              <span className="h-px w-full bg-ink-3/60" />
              <span className="h-px w-3/5 bg-ink-3/60" />
            </span>
          )}
        </motion.div>
      </div>

      <span role="status" className="sr-only">
        {spokenText}
      </span>
    </div>
  );
}
