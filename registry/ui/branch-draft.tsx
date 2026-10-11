"use client";

import * as React from "react";

import { motion } from "motion/react";

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

type DraftTag = "h1" | "h2" | "h3" | "p" | "div" | "span";
export type BranchDraftTrigger = "mount" | "inView" | "manual";

export type BranchDraftStep = {
  /** The words the headline settles on at this pause (or the opening, for the first step). */
  text: string;
  /** The other continuations it weighs here. */
  alternates?: string[];
  /** Final weights for [text, ...alternates], 0 to 1; seeded when left out, with `text` the strongest. */
  weights?: number[];
};

export type BranchDraftProps = {
  /** The headline: an opening, then each pause's chosen words and alternates. */
  steps?: BranchDraftStep[];
  /** The element the headline renders as. @default "h2" */
  as?: DraftTag;
  /** How many continuations fan out at each pause, the chosen one included (2 to 5). @default 3 */
  candidates?: number;
  /** Speed of the whole draft, 0.5 (deliberate) to 2 (brisk). @default 1 */
  pace?: number;
  /** How faint a ghost continuation is before it is chosen, 0 to 1. @default 0.45 */
  ghostOpacity?: number;
  /** The ghosts' colour, any CSS colour. @default "var(--accent-bright)" */
  ghostColor?: string;
  /** Show each ghost's weight beside it. @default true */
  showWeights?: boolean;
  /** Degrees each ghost turns more than the one above it. @default 3 */
  fan?: number;
  /** Let the visitor choose: arrows pick, Tab or Enter accepts, a click takes one. @default false */
  interactive?: boolean;
  /** Write the headline again after a pause. @default true */
  loop?: boolean;
  /** How long the finished headline holds before it is written again, ms. @default 2600 */
  hold?: number;
  /** When writing starts: on mount, when first on screen, or only on `replayKey`. @default "inView" */
  trigger?: BranchDraftTrigger;
  /** Wait before writing starts, ms. @default 0 */
  delay?: number;
  /** Change it to write the headline again from the start. */
  replayKey?: string | number;
  /** Fires as each pause settles, with the step's index and the words chosen. */
  onStep?: (index: number, chosen: string) => void;
  /** Fires when the headline is written, with its full text. */
  onComplete?: (text: string) => void;
  /** Sets the type (size, weight) and places the headline. */
  className?: string;
};

const DEFAULT_STEPS: BranchDraftStep[] = [
  { text: "Ship the release" },
  {
    text: " on a Friday",
    alternates: [" before lunch", " without a meeting", " in one pass"],
  },
  {
    text: " and sleep fine.",
    alternates: [" and mean it.", " for once.", ", calmly."],
  },
];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Option = { text: string; weight: number; scripted: boolean };

/** One pause's options in fan order, with final weights that sum to 1. */
function optionsOf(
  step: BranchDraftStep,
  count: number,
  index: number,
): Option[] {
  const all = [step.text, ...(step.alternates ?? [])].slice(
    0,
    Math.max(1, count),
  );
  const rand = lcg(hash(all.join("|")) + index * 977);
  const raw = all.map((_, i) => {
    const given = step.weights?.[i];
    if (given !== undefined) return clamp(given, 0.001, 1);
    return i === 0 ? 0.5 + rand() * 0.3 : 0.1 + rand() * 0.35;
  });
  // The scripted words are the strongest unless the host says otherwise.
  if (step.weights === undefined) {
    const best = Math.max(...raw.slice(1), 0);
    if ((raw[0] ?? 0) <= best) raw[0] = best + 0.12;
  }
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  const options = all.map((text, i) => ({
    text,
    weight: r2((raw[i] ?? 0) / sum),
    scripted: i === 0,
  }));
  // A seeded place in the fan, so the strongest is not always on top.
  const at = all.length > 1 ? (index * 2 + 1) % all.length : 0;
  const first = options.shift();
  if (first) options.splice(at, 0, first);
  return options;
}

type Phase =
  | "idle"
  | "opening"
  | "rest"
  | "fan"
  | "weigh"
  | "decide"
  | "set"
  | "done"
  | "clear";

type Anchor = {
  x: number;
  y: number;
  h: number;
  room: number;
  /** The fan hangs from the start of a line, where a leading space vanishes. */
  wrapped: boolean;
};

type GhostProps = {
  option: Option;
  k: number;
  phase: Phase;
  chosen: boolean;
  shown: number;
  ghostOpacity: number;
  ghostColor: string;
  showWeights: boolean;
  fan: number;
  strong: number;
  pace: number;
  motionSafe: boolean;
  anchor: Anchor;
  interactive: boolean;
  onPick: () => void;
  onTake: () => void;
};

/** One ghost continuation, hinged at the caret. */
function Ghost({
  option,
  k,
  phase,
  chosen,
  shown,
  ghostOpacity,
  ghostColor,
  showWeights,
  fan,
  strong,
  pace,
  motionSafe,
  anchor,
  interactive,
  onPick,
  onTake,
}: GhostProps) {
  const deciding = phase === "decide" || phase === "set";
  const setting = phase === "set";
  const lose = deciding && !chosen;
  const drop = `${r2(k * 0.92)}em`;
  const turn = r2(k * fan);
  // Reduced motion: the ghosts stand stacked where they are and only fade;
  // the weight still shifts, because which one wins is the information.
  const target = setting
    ? {
        opacity: 0,
        y: motionSafe ? "0em" : drop,
        rotate: 0,
        fontWeight: strong,
      }
    : lose
      ? {
          opacity: 0,
          y: motionSafe ? `${r2(k * 0.92 + 0.25)}em` : drop,
          rotate: motionSafe ? turn : 0,
          fontWeight: 300,
        }
      : {
          opacity: chosen && deciding ? 1 : clamp(ghostOpacity, 0, 1),
          y: drop,
          rotate: motionSafe ? turn : 0,
          fontWeight: chosen && deciding ? strong : 320,
        };
  const slow = 1 / clamp(pace, 0.25, 4);
  const transition = !motionSafe
    ? { duration: durations.fast }
    : setting
      ? {
          ...springs.glide,
          opacity: {
            duration: durations.base * slow,
            ease: easings.exit,
            delay: 0.18 * slow,
          },
          fontWeight: { duration: durations.slow * slow, ease: easings.enter },
        }
      : lose
        ? exitFor(durations.base)
        : {
            ...springs.snap,
            delay: phase === "fan" ? k * cascade(4) : 0,
            opacity: {
              duration: durations.base * slow,
              ease: easings.enter,
              delay: phase === "fan" ? k * cascade(4) : 0,
            },
            fontWeight: { ...springs.glide },
          };
  return (
    <motion.span
      aria-hidden
      initial={{
        opacity: 0,
        y: motionSafe ? "0em" : drop,
        rotate: 0,
        fontWeight: 320,
      }}
      animate={target}
      transition={transition}
      onPointerEnter={interactive ? onPick : undefined}
      onClick={interactive ? onTake : undefined}
      className={cn(
        "absolute top-0 left-0 inline-flex items-baseline gap-[0.3em] whitespace-nowrap",
        interactive
          ? "pointer-events-auto cursor-pointer"
          : "pointer-events-none",
      )}
      style={{
        left: anchor.x,
        top: anchor.y,
        lineHeight: `${anchor.h}px`,
        maxWidth: Math.max(40, anchor.room),
        color: ghostColor,
        originX: 0,
        originY: 0.5,
      }}
    >
      <span className="min-w-0 overflow-clip whitespace-pre">
        {anchor.wrapped ? option.text.trimStart() : option.text}
      </span>
      {showWeights ? (
        <span className="shrink-0 font-mono text-[0.32em] font-normal tracking-normal tabular-nums opacity-80">
          {shown.toFixed(2)}
        </span>
      ) : null}
    </motion.span>
  );
}

/**
 * A headline that writes itself out loud. The opening arrives word by word
 * on the cascade; at each pause the candidate continuations fan down from
 * the caret like cards hinged there, each opening on the snap spring, faint,
 * with a small weight beside it. The weights flicker while it thinks, then
 * converge: the strongest gains real typographic weight and full ink on the
 * glide spring while the others thin, fade and drop away; the chosen words
 * swing up into the line and set in solid ink where they belong in the flow,
 * so they wrap like any text. Then the caret moves on to the next pause.
 *
 * With `interactive`, the visitor weighs instead: the arrows (or the pointer)
 * pick a ghost, which gains the weight, and Tab, Enter or a click accepts
 * it. The final box is reserved from the first render, so nothing below the
 * headline moves; the full headline is read once from an sr-only copy.
 */
export function BranchDraft({
  steps = DEFAULT_STEPS,
  as = "h2",
  candidates = 3,
  pace = 1,
  ghostOpacity = 0.45,
  ghostColor = "var(--accent-bright)",
  showWeights = true,
  fan = 3,
  interactive = false,
  loop = true,
  hold = 2600,
  trigger = "inView",
  delay = 0,
  replayKey,
  onStep,
  onComplete,
  className,
}: BranchDraftProps) {
  const motionSafe = useMotionSafe();
  const Tag = as;
  const hintId = React.useId();
  const count = clamp(Math.round(candidates), 2, 5);
  const list = steps.length ? steps : DEFAULT_STEPS;
  const opening = list[0]?.text ?? "";

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [stepAt, setStepAt] = React.useState(1);
  const [committed, setCommitted] = React.useState<string[]>([]);
  const [chosen, setChosen] = React.useState(0);
  const [shown, setShown] = React.useState<number[]>([]);
  const [anchor, setAnchor] = React.useState<Anchor>({
    x: 0,
    y: 0,
    h: 0,
    room: 0,
    wrapped: false,
  });
  const [strong, setStrong] = React.useState(600);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [run, setRun] = React.useState(0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const anchorRef = React.useRef<HTMLSpanElement | null>(null);
  const timers = React.useRef<number[]>([]);
  const onScreen = React.useRef(false);
  const waiting = React.useRef(false);
  const latest = React.useRef({
    onStep,
    onComplete,
    pace,
    hold,
    loop,
    list,
    count,
  });
  React.useEffect(() => {
    latest.current = { onStep, onComplete, pace, hold, loop, list, count };
  });

  const options = React.useMemo(
    () =>
      stepAt < list.length
        ? optionsOf(list[stepAt] as BranchDraftStep, count, stepAt)
        : [],
    [list, stepAt, count],
  );

  // The sizer reserves the longest the headline could ever be.
  const longest = React.useMemo(
    () =>
      list
        .map((s, i) =>
          i === 0
            ? s.text
            : [s.text, ...(s.alternates ?? []).slice(0, count - 1)].reduce(
                (a, b) => (b.length > a.length ? b : a),
                "",
              ),
        )
        .join(""),
    [list, count],
  );
  const written = opening + committed.join("");
  // What it will say: the words accepted so far, then the script's.
  const spoken =
    written +
    list
      .slice(committed.length + 1)
      .map((s) => s.text)
      .join("");

  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };
  const later = (ms: number, fn: () => void) => {
    const slow = 1 / clamp(latest.current.pace, 0.25, 4);
    timers.current.push(window.setTimeout(fn, Math.round(ms * slow)));
  };

  /** Where the caret is, measured in the moment the fan opens. */
  const measure = () => {
    const root = rootRef.current;
    const mark = anchorRef.current;
    if (!root || !mark) return;
    const r = root.getBoundingClientRect();
    const a = mark.getBoundingClientRect();
    const style = getComputedStyle(root);
    const size = parseFloat(style.fontSize) || 16;
    const line = parseFloat(style.lineHeight) || size * 1.2;
    let x = a.left - r.left;
    let y = a.top - r.top;
    let wrapped = x < 1;
    // Past 60% of the line, the next words would wrap: hang the fan from
    // the start of the next line, where they will be set.
    if (x > r.width * 0.6) {
      x = 0;
      y += line;
      wrapped = true;
    }
    setAnchor({
      x: r2(x),
      y: r2(y),
      h: r2(a.height || size),
      room: r2(r.width - x),
      wrapped,
    });
    const weight = parseFloat(style.fontWeight);
    if (Number.isFinite(weight)) setStrong(weight);
  };

  /** Opens the fan at step i, then weighs and settles it unless the visitor holds it. */
  const pause = (i: number) => {
    const s = latest.current;
    if (i >= s.list.length) {
      setPhase("done");
      return;
    }
    setStepAt(i);
    const opts = optionsOf(s.list[i] as BranchDraftStep, s.count, i);
    const top = Math.max(
      0,
      opts.findIndex((o) => o.scripted),
    );
    setChosen(top);
    // Weights start level, as nothing has been decided.
    setShown(opts.map(() => r2(1 / opts.length)));
    measure();
    setPhase("fan");
    setSaid((p) => ({
      n: p.n + 1,
      text: `Next words: ${opts.map((o) => o.text.trim()).join("; ")}.`,
    }));
    const rand = lcg(hash(opts.map((o) => o.text).join("")) + 31);
    later(420, () => {
      setPhase("weigh");
      for (let t = 0; t < 5; t += 1) {
        later(110 * t, () => {
          setShown(
            opts.map((o) =>
              r2(
                clamp(
                  o.weight + (rand() - 0.5) * 0.3 * (1 - t / 5),
                  0.01,
                  0.99,
                ),
              ),
            ),
          );
        });
      }
      later(620, () => {
        setShown(opts.map((o) => o.weight));
        setPhase("decide");
        later(520, () => settle(i, top));
      });
    });
  };

  /** The chosen words swing into the line and set in ink. */
  const settle = (i: number, pick: number) => {
    const s = latest.current;
    const opts = optionsOf(s.list[i] as BranchDraftStep, s.count, i);
    const option = opts[pick] ?? opts[0];
    if (!option) return;
    clearTimers();
    setChosen(pick);
    setPhase("set");
    later(260, () => {
      setCommitted((c) => [...c.slice(0, i - 1), option.text]);
      s.onStep?.(i, option.text);
      setSaid((p) => ({ n: p.n + 1, text: `Chose “${option.text.trim()}”.` }));
      later(420, () => {
        if (i + 1 < s.list.length) {
          setPhase("rest");
          later(260, () => pause(i + 1));
        } else {
          setPhase("done");
          const full =
            (s.list[0]?.text ?? "") +
            [...committedRef.current.slice(0, i - 1), option.text].join("");
          s.onComplete?.(full);
          if (s.loop) {
            later(Math.max(400, s.hold), () => {
              // Off screen or hidden, the next pass waits to be seen.
              if (!onScreen.current || document.hidden) {
                waiting.current = true;
                return;
              }
              setPhase("clear");
              later(220, () => begin());
            });
          }
        }
      });
    });
  };

  const committedRef = React.useRef<string[]>([]);
  /** Where the draft is, for picking it up again after a pause off screen. */
  const live = React.useRef({ phase: "idle" as Phase, stepAt: 1, chosen: 0 });
  const suspended = React.useRef(false);
  React.useEffect(() => {
    committedRef.current = committed;
    live.current = { phase, stepAt, chosen };
  });

  /** Writes from the start: the opening, word by word, then the first pause. */
  const begin = () => {
    clearTimers();
    setCommitted([]);
    setStepAt(1);
    setPhase("opening");
    setRun((n) => n + 1);
    const first = latest.current.list[0]?.text ?? "";
    const words = first.split(/(\s+)/).filter((w) => w.trim()).length;
    later(260 + words * 70, () => {
      setPhase("rest");
      later(240, () => pause(1));
    });
  };

  const start = () => {
    clearTimers();
    const wait = Math.max(0, delay);
    if (wait > 0) timers.current.push(window.setTimeout(begin, wait));
    else begin();
  };
  const startRef = React.useRef(start);
  React.useEffect(() => {
    startRef.current = start;
  });

  // Triggers: each effect cleans up what it began, so a rehearsal remount
  // simply starts again.
  React.useEffect(() => {
    if (trigger !== "mount") return;
    startRef.current();
    return clearTimers;
  }, [trigger]);

  // Watching the screen serves every trigger: inView starts here, and a
  // looping headline only writes again where it can be seen.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let begun = false;
    // Off screen or hidden, the draft stops where it is (what is already
    // moving finishes); seen again, it picks up from the start of that beat.
    const resume = () => {
      if (!onScreen.current || document.hidden) {
        const at = live.current.phase;
        if (at !== "idle" && at !== "done" && timers.current.length) {
          clearTimers();
          suspended.current = true;
        }
        return;
      }
      if (suspended.current) {
        suspended.current = false;
        const { phase: at, stepAt: step, chosen: pick } = live.current;
        if (at === "opening" || at === "clear") begin();
        else if (at === "set") settle(step, pick);
        else if (at === "rest") pause(committedRef.current.length + 1);
        else pause(step);
        return;
      }
      if (!waiting.current) return;
      waiting.current = false;
      setPhase("clear");
      later(220, () => begin());
    };
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        onScreen.current = Boolean(entry?.isIntersecting);
        if (trigger === "inView" && onScreen.current && !begun) {
          begun = true;
          startRef.current();
        } else resume();
      },
      { threshold: 0.3 },
    );
    watcher.observe(root);
    document.addEventListener("visibilitychange", resume);
    return () => {
      watcher.disconnect();
      document.removeEventListener("visibilitychange", resume);
      clearTimers();
    };
    // `begin` and `later` read only refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  const lastReplay = React.useRef(replayKey);
  React.useEffect(() => {
    if (lastReplay.current === replayKey) return;
    lastReplay.current = replayKey;
    startRef.current();
  }, [replayKey]);

  React.useEffect(() => clearTimers, []);

  const fanOpen =
    phase === "fan" ||
    phase === "weigh" ||
    phase === "decide" ||
    phase === "set";

  const pick = (k: number, by: "key" | "pointer" = "key") => {
    if (!interactive || !fanOpen || phase === "set") return;
    clearTimers();
    setChosen(k);
    setPhase("decide");
    const opts = options;
    setShown(
      opts.map((o, j) =>
        j === k ? Math.max(o.weight, 0.7) : r2(o.weight * 0.6),
      ),
    );
    setSaid((p) => ({
      n: p.n + 1,
      text: `${opts[k]?.text.trim() ?? ""}, ${k + 1} of ${opts.length}.`,
    }));
    // A choice left alone is taken: soon for a pointer, given time for keys.
    const at = stepAt;
    later(by === "key" ? 6000 : 2400, () => settle(at, k));
  };
  const take = (k: number) => {
    if (!interactive || !fanOpen || phase === "set") return;
    settle(stepAt, k);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || !fanOpen || phase === "set") return;
    const n = options.length;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      pick((chosen + 1) % n);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      pick((chosen - 1 + n) % n);
    } else if (
      (event.key === "Tab" && !event.shiftKey) ||
      event.key === "Enter"
    ) {
      // Tab accepts only while words are on offer; otherwise it moves on.
      event.preventDefault();
      take(chosen);
    }
  };

  const words = opening.split(/(\s+)/);
  // Room below the last line for the fan: its drop, plus how far the far
  // end of the lowest ghost swings down (about six em out).
  const gap =
    (count - 1) * 0.92 +
    0.45 +
    6 * Math.sin((clamp((count - 1) * fan, 0, 30) * Math.PI) / 180);

  return (
    <div
      ref={rootRef}
      role={interactive ? "group" : undefined}
      aria-roledescription={interactive ? "draft headline" : undefined}
      aria-describedby={interactive ? hintId : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={onKeyDown}
      className={cn(
        "group/branch-draft relative grid overflow-clip",
        interactive &&
          "rounded-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
      style={{ paddingBottom: `${r2(gap)}em` }}
    >
      <Tag className="col-start-1 row-start-1 m-0">
        <span className="sr-only">{spoken}</span>
        <span aria-hidden>
          {phase === "idle" || !motionSafe || run <= 1 ? (
            // The first pass keeps the opening it was served with; later
            // passes write it in again word by word.
            <motion.span
              animate={{ opacity: phase === "clear" ? 0 : 1 }}
              transition={exitFor(durations.base)}
            >
              {opening}
            </motion.span>
          ) : (
            <motion.span
              key={run}
              animate={{ opacity: phase === "clear" ? 0 : 1 }}
              transition={exitFor(durations.base)}
            >
              {words.map((w, i) =>
                w.trim() ? (
                  <motion.span
                    key={i}
                    className="inline-block"
                    initial={{ opacity: 0, y: distances.nudge }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      ...springs.glide,
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                        delay: i * 0.035,
                      },
                      delay: i * 0.035,
                    }}
                  >
                    {w}
                  </motion.span>
                ) : (
                  <React.Fragment key={i}>{w}</React.Fragment>
                ),
              )}
            </motion.span>
          )}
          {committed.map((text, i) => (
            <motion.span
              key={`${run}-${i}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: phase === "clear" ? 0 : 1 }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              {text}
            </motion.span>
          ))}
          <span ref={anchorRef} className="inline-block w-0">
            {"​"}
          </span>
          <motion.span
            className="ml-[0.04em] inline-block h-[0.9em] w-[0.07em] translate-y-[0.12em] rounded-full bg-cobalt-bright"
            animate={
              phase === "done" && motionSafe
                ? { opacity: [1, 0, 1, 0, 1, 0, 1] }
                : { opacity: phase === "clear" ? 0 : 1 }
            }
            transition={
              phase === "done" && motionSafe
                ? { duration: 2.4, ease: "linear" }
                : { duration: durations.fast }
            }
          />
        </span>
      </Tag>
      {/* The reserved box: the longest the headline could ever be. */}
      <Tag
        aria-hidden
        className="invisible col-start-1 row-start-1 m-0 select-none"
      >
        {longest}
        <span className="ml-[0.04em] inline-block w-[0.07em]" />
      </Tag>
      {fanOpen
        ? options.map((option, k) => (
            <Ghost
              key={`${run}-${stepAt}-${k}`}
              option={option}
              k={k}
              phase={phase}
              chosen={k === chosen}
              shown={shown[k] ?? option.weight}
              ghostOpacity={ghostOpacity}
              ghostColor={ghostColor}
              showWeights={showWeights}
              fan={fan}
              strong={strong}
              pace={pace}
              motionSafe={motionSafe}
              anchor={anchor}
              interactive={interactive}
              onPick={() => pick(k, "pointer")}
              onTake={() => take(k)}
            />
          ))
        : null}
      {interactive ? (
        <span id={hintId} className="sr-only">
          At each pause, the arrow keys choose the next words and Tab or Enter
          accepts them.
        </span>
      ) : null}
      <span aria-live="polite" className="sr-only">
        <span key={said.n}>{interactive ? said.text : ""}</span>
      </span>
    </div>
  );
}
