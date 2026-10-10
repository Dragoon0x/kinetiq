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
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type StampCycleInk = "cobalt" | "vermilion" | "moss" | "carbon";
export type StampCycleFrame = "none" | "box" | "pill";
export type StampCycleTrigger = "mount" | "inView" | "hover" | "manual";
export type StampCycleElement =
  "span" | "div" | "p" | "h1" | "h2" | "h3" | "h4" | "strong" | "em";

export type StampCycleProps = {
  /** The words stamped into the slot, one after another. */
  words: string[];
  /** Controlled: which word is stamped. */
  index?: number;
  /** The first word when uncontrolled. @default 0 */
  defaultIndex?: number;
  /** Fires from the timer or the press that stamped a new word, with its index. */
  onIndexChange?: (index: number) => void;
  /** Rest between automatic stamps, ms. @default 2400 */
  interval?: number;
  /** A named token ink, or any CSS colour. @default "cobalt" */
  ink?: StampCycleInk | (string & {});
  /** How firmly the stamp lands, 0 to 1: squash, ink coverage, ring and speed. @default 0.6 */
  press?: number;
  /** How much of the rubber's grain shows in the ink, 0 (flat ink) to 1. @default 0.5 */
  texture?: number;
  /** The largest tilt a word may land at, degrees; each word's is seeded. @default 2.5 */
  tilt?: number;
  /** A border printed around the word with the same ink. @default "box" */
  frame?: StampCycleFrame;
  /** The ring of displaced ink at contact, and the faint residue it leaves. @default true */
  ring?: boolean;
  /** When the automatic cycle runs. @default "inView" */
  trigger?: StampCycleTrigger;
  /** One pass through the words, resting on the last. @default false */
  once?: boolean;
  /** Wait after the trigger before the first stamp, ms. @default 500 */
  delay?: number;
  /** Hold the automatic cycle. @default false */
  paused?: boolean;
  /** Hover and keyboard focus hold the cycle so the word can be read. @default true */
  pauseOnHover?: boolean;
  /** The slot is a button: pressing it stamps the next word. @default true */
  interactive?: boolean;
  /** A thock when the visitor stamps. Off unless asked for. @default false */
  sound?: boolean;
  /** The root element. @default "span" */
  as?: StampCycleElement;
  /** A `once` pass has stamped its last word. */
  onComplete?: () => void;
  className?: string;
};

const INKS: Record<StampCycleInk, string> = {
  cobalt: "var(--accent-bright)",
  vermilion: "var(--danger)",
  moss: "var(--success)",
  carbon: "var(--ink)",
};

/** Holding the stamp down this long leans on it with everything it adds, ms. */
const HOLD = 450;
/** How much a held press adds to the firmness. */
const LEAN = 0.35;
/** The last stretch of a lowered stamp's fall, ms. */
const DROP = 70;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const mod = (v: number, n: number) => ((v % n) + n) % n;
/** A firm press slams; a light one floats down a little longer. */
const descentOf = (firm: number) => Math.round(150 + (1 - firm) * 60);
/** The faint ring a stamp leaves behind, stronger for a firm press. */
const residueOf = (firm: number) => r2(0.3 + 0.3 * firm);

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

const grains = new Map<string, string>();

/**
 * The rubber's grain as an alpha mask: fractal noise whose holes open as the
 * press lightens (the threshold) and sharpen as `texture` rises (the slope).
 * Pure and memoised, so the server and the client print the same impression.
 */
function grainOf(seed: number, firm: number, texture: number, scale = 1) {
  const key = `${seed}:${r2(firm)}:${r2(texture)}:${scale}`;
  const hit = grains.get(key);
  if (hit) return hit;
  const slope = r2(2 + 10 * texture);
  const offset = r2(1 + slope * (0.4 + 0.3 * firm));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='80'><filter id='g' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='${r2(0.62 / scale)} ${r2(0.8 / scale)}' numOctaves='3' seed='${seed}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -${slope} 0 0 0 ${offset}'/></filter><rect width='100%' height='100%' filter='url(#g)'/></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  grains.set(key, url);
  return url;
}

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Imp = {
  /** New for every stamp, so the same word twice is two impressions. */
  n: number;
  index: number;
  firm: number;
  /** The stamp's fall before contact, ms. */
  descent: number;
  /** Stamped by the visitor: heard and announced. */
  manual: boolean;
  /** Already on the paper when the slot arrived: no print, no ring burst. */
  still: boolean;
};

type Intent = {
  seq: number;
  index: number;
  firm: number;
  descent: number;
  manual: boolean;
};

const FRAMES: Record<StampCycleFrame, string> = {
  none: "px-[0.06em]",
  box: "rounded-[0.12em] border-[0.075em] border-current px-[0.34em] py-[0.05em]",
  pill: "rounded-full border-[0.075em] border-current px-[0.55em] py-[0.05em]",
};
// The frame's padding and border would make the line taller; the impression
// gives that height back so the sentence keeps its leading.
const FRAME_MARGIN: Record<StampCycleFrame, string> = {
  none: "",
  box: "-my-[0.125em]",
  pill: "-my-[0.125em]",
};
const RING_SHAPE: Record<StampCycleFrame, string> = {
  none: "rounded-[0.3em]",
  box: "rounded-[0.22em]",
  pill: "rounded-full",
};

type ImpressionProps = {
  imp: Imp;
  word: string;
  current: boolean;
  motionSafe: boolean;
  ink: string;
  texture: number;
  tilt: number;
  frame: StampCycleFrame;
  ring: boolean;
  bind: (node: HTMLSpanElement | null) => void;
  onGone: (n: number) => void;
};

function Impression({
  imp,
  word,
  current,
  motionSafe,
  ink,
  texture,
  tilt,
  frame,
  ring,
  bind,
  onGone,
}: ImpressionProps) {
  // Everything a hand-held stamp varies, seeded by the word and the stamp.
  const look = React.useMemo(() => {
    const rand = lcg(hash(`${word}:${imp.n}`));
    const angle = r2((rand() * 2 - 1) * tilt);
    const rock = rand() < 0.5 ? -1 : 1;
    // The ink prints from the edge the stamp rocked onto first.
    const sweep = Math.round(rock < 0 ? 84 + rand() * 12 : 264 + rand() * 12);
    const seed = 1 + Math.floor(rand() * 600);
    return { angle, rock, sweep, seed };
  }, [word, imp.n, tilt]);

  const grain =
    texture > 0 ? grainOf(look.seed, imp.firm, clamp01(texture)) : null;
  // Displaced ink is spatter, not a second border: the same grain, thresholded
  // so only a sparse scatter of it survives.
  const ringGrain = grainOf(look.seed + 7, 0, 1, 0.7);

  const inkOpacity = useMotionValue(imp.still ? 1 : 0);
  const front = useMotionValue(imp.still ? 130 : -20);
  const turn = useMotionValue(look.angle);
  const ringScale = useMotionValue(1);
  const ringOpacity = useMotionValue(
    imp.still && ring ? residueOf(imp.firm) : 0,
  );
  const lift = useMotionValue(0);

  const mask = useTransform(front, (p) => {
    if (p >= 129) return grain ?? "none";
    const edge = `linear-gradient(${look.sweep}deg, black ${r2(p - 18)}%, transparent ${r2(p)}%)`;
    return grain ? `${grain}, ${edge}` : edge;
  });
  const y = useTransform(lift, (l) => r2(-distances.nudge * l));
  const scale = useTransform(lift, (l) => r2(1 + 0.03 * l));
  const opacity = useTransform(lift, (l) => r2(1 - l));
  const rotate = useTransform([turn, lift], ([a = 0, l = 0]: number[]) =>
    r2(a + look.rock * 1.5 * l),
  );
  const blur = useTransform(lift, (l) =>
    l > 0.01 ? `blur(${r2(l * 1.4)}px)` : "none",
  );

  const latest = React.useRef({ motionSafe, ring, onGone });
  React.useLayoutEffect(() => {
    latest.current = { motionSafe, ring, onGone };
  });

  // Contact: the ink lands in a blink and prints across from the first edge
  // down, the impression rocks to its tilt on recoil, and displaced ink rings
  // it and settles to a residue. Restarted from scratch if an effect re-runs.
  React.useEffect(() => {
    if (imp.still) return;
    const { motionSafe: full, ring: withRing } = latest.current;
    const runs: AnimationPlaybackControls[] = [];
    inkOpacity.jump(0);
    front.jump(full ? -20 : 130);
    turn.jump(look.angle);
    ringScale.jump(1);
    ringOpacity.jump(0);
    const timer = window.setTimeout(
      () => {
        if (!full) {
          runs.push(
            animate(inkOpacity, 1, {
              duration: durations.base,
              ease: easings.enter,
            }),
          );
          if (withRing) {
            runs.push(
              animate(ringOpacity, residueOf(imp.firm), {
                duration: durations.base,
                ease: easings.enter,
              }),
            );
          }
          return;
        }
        runs.push(
          animate(inkOpacity, 1, {
            duration: durations.blink,
            ease: easings.enter,
          }),
          animate(front, 130, {
            duration: 0.1 + (1 - imp.firm) * 0.06,
            ease: easings.enter,
          }),
        );
        turn.jump(r2(look.angle + look.rock * 1.4 * imp.firm));
        runs.push(animate(turn, look.angle, springs.recoil));
        if (withRing) {
          ringScale.jump(0.92);
          ringOpacity.jump(r2(0.6 + 0.4 * imp.firm));
          runs.push(
            animate(ringScale, 1.06, {
              duration: durations.slow,
              ease: easings.enter,
            }),
            animate(ringOpacity, residueOf(imp.firm), {
              duration: durations.page,
              ease: easings.enter,
            }),
          );
        }
      },
      full ? imp.descent : 0,
    );
    return () => {
      window.clearTimeout(timer);
      for (const run of runs) run.stop();
    };
  }, [
    imp.still,
    imp.descent,
    imp.firm,
    look,
    inkOpacity,
    front,
    turn,
    ringScale,
    ringOpacity,
  ]);

  // The lift-off: the stamp takes its old word away as the new one lands.
  // Exits never spring.
  React.useEffect(() => {
    if (current) return;
    const { motionSafe: full } = latest.current;
    const run = animate(lift, 1, {
      duration: full ? durations.slow * 0.6 : durations.fast,
      ease: easings.exit,
      onComplete: () => latest.current.onGone(imp.n),
    });
    return () => run.stop();
  }, [current, imp.n, lift]);

  return (
    <motion.span
      ref={bind}
      aria-hidden={current ? undefined : true}
      className={cn(
        "inline-block whitespace-nowrap",
        current ? "relative" : "pointer-events-none absolute start-0 top-0",
        FRAME_MARGIN[frame],
      )}
      style={{
        y: motionSafe ? y : 0,
        scale: motionSafe ? scale : 1,
        rotate,
        opacity,
        filter: motionSafe ? blur : "none",
      }}
    >
      {ring ? (
        <motion.span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -inset-[0.12em] border-[0.09em]",
            RING_SHAPE[frame],
          )}
          style={{
            scale: ringScale,
            opacity: ringOpacity,
            borderColor: `color-mix(in oklab, ${ink} 55%, transparent)`,
            maskImage: ringGrain,
            maskSize: "5em 2.5em",
          }}
        />
      ) : null}
      <motion.span
        className={cn("relative block", FRAMES[frame])}
        style={{
          color: ink,
          opacity: inkOpacity,
          textShadow: `0 0 0.035em color-mix(in oklab, ${ink} 60%, transparent)`,
          maskImage: mask,
          maskSize: grain ? "9em 4.5em, 100% 100%" : "100% 100%",
          maskRepeat: grain ? "repeat, no-repeat" : "no-repeat",
          maskComposite: "intersect",
        }}
      >
        {word}
      </motion.span>
    </motion.span>
  );
}

/**
 * A rotating word that is stamped into its slot. Each change is one beat: the
 * old impression lifts off with the stamp that made it, the slot's width
 * springs to the new word on glide so the sentence glides rather than jumps,
 * the stamp's shadow falls and sharpens, and at contact the ink lands in a
 * blink and prints across the word from the edge the stamp rocked onto first —
 * the slot squashes and recovers on recoil while the impression settles to its
 * seeded tilt and a ring of displaced ink spreads around it and fades to a
 * residue. The ink carries the rubber's grain: a firm press prints solid, a
 * light one patchy and dry.
 *
 * The slot is a real button whose name is the current word. Pressing it
 * lowers the stamp, and letting go brings it down on the next word; holding
 * leans on the stamp and prints firmer. Enter and Space stamp through the
 * native click. Hover and focus hold the automatic cycle; stamps the visitor
 * makes are announced, automatic ones are not. Under reduced motion the words
 * cross-fade at their tilt with the residue already printed.
 */
export function StampCycle({
  words,
  index,
  defaultIndex = 0,
  onIndexChange,
  interval = 2400,
  ink = "cobalt",
  press = 0.6,
  texture = 0.5,
  tilt = 2.5,
  frame = "box",
  ring = true,
  trigger = "inView",
  once = false,
  delay = 500,
  paused = false,
  pauseOnHover = true,
  interactive = true,
  sound = false,
  as = "span",
  onComplete,
  className,
}: StampCycleProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const count = words.length;
  const firmness = clamp01(press);
  const inkColour = INKS[ink as StampCycleInk] ?? ink;
  const shape = FRAMES[frame] ? frame : "box";

  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [said, setSaid] = React.useState("");

  const [own, setOwn] = React.useState(defaultIndex);
  const shown = count > 0 ? mod(Math.round(index ?? own), count) : 0;
  const [intent, setIntent] = React.useState<Intent | null>(null);

  // The impressions on the paper, derived from the shown word as it changes:
  // the newest is the current one, older ones are lifting off.
  const [track, setTrack] = React.useState(() => ({
    shown,
    seq: 0,
    imps: [
      {
        n: 0,
        index: shown,
        firm: firmness,
        descent: 0,
        manual: false,
        still: true,
      },
    ] as Imp[],
  }));
  let imps = track.imps;
  if (track.shown !== shown) {
    const fresh =
      intent && intent.index === shown && intent.seq !== track.seq
        ? intent
        : null;
    const last = imps[imps.length - 1];
    imps = [
      ...imps.slice(-2),
      {
        n: (last?.n ?? 0) + 1,
        index: shown,
        firm: fresh?.firm ?? firmness,
        descent: fresh?.descent ?? descentOf(firmness),
        manual: fresh?.manual ?? false,
        still: false,
      },
    ];
    setTrack({ shown, seq: fresh?.seq ?? track.seq, imps });
  }
  const latestImp = imps[imps.length - 1];
  const prevImp = imps[imps.length - 2];

  const slotWidth = useMotionValue(-1);
  const shadowScale = useMotionValue(1);
  const shadowOpacity = useMotionValue(0);
  const squashX = useMotionValue(1);
  const squashY = useMotionValue(1);
  const width = useTransform(slotWidth, (w) => (w < 0 ? "auto" : `${r2(w)}px`));

  const nodes = React.useRef(new Map<number, HTMLSpanElement>());
  const beatRuns = React.useRef<AnimationPlaybackControls[]>([]);
  const shadowRuns = React.useRef<AnimationPlaybackControls[]>([]);
  const beatTimer = React.useRef<number | null>(null);
  const sayTimer = React.useRef<number | null>(null);
  const refusal = React.useRef<number | null>(null);
  const lowered = React.useRef(false);
  const pressAt = React.useRef<number | null>(null);
  const pan = React.useRef(0);
  const seq = React.useRef(0);
  const beats = React.useRef(0);
  const api = React.useRef<{
    beat: () => void;
    auto: () => void;
    stop: () => void;
  } | null>(null);

  const stopShadow = () => {
    for (const run of shadowRuns.current) run.stop();
    shadowRuns.current = [];
  };

  const stopBeat = () => {
    for (const run of beatRuns.current) run.stop();
    beatRuns.current = [];
    if (beatTimer.current !== null) window.clearTimeout(beatTimer.current);
    beatTimer.current = null;
  };

  const commit = (next: number, meta: Omit<Intent, "index" | "seq">) => {
    seq.current += 1;
    // Any stamp, the visitor's included, restarts the full interval.
    beats.current += 1;
    setIntent({ ...meta, index: next, seq: seq.current });
    if (index === undefined) setOwn(next);
    onIndexChange?.(next);
  };

  /** The visitor's stamp: the next word, as firm as they pressed. */
  const stamp = (firm: number, descent: number) => {
    if (count < 2) return;
    commit((shown + 1) % count, { firm, descent, manual: true });
    // A host that refuses the change leaves the stamp hanging: lift it.
    if (refusal.current !== null) window.clearTimeout(refusal.current);
    refusal.current = window.setTimeout(() => {
      refusal.current = null;
      if (lowered.current) raise();
    }, descent + 60);
  };

  /** The stamp comes down and hovers just above the paper. */
  const lower = () => {
    if (!motionSafe) return;
    lowered.current = true;
    stopShadow();
    if (shadowOpacity.get() < 0.01) shadowScale.jump(1.14);
    shadowRuns.current = [
      animate(shadowScale, 1.05, { duration: 0.16, ease: easings.exit }),
      animate(shadowOpacity, 0.4, { duration: 0.16, ease: easings.exit }),
    ];
  };

  /** The stamp is lifted away with nothing printed. */
  const raise = () => {
    lowered.current = false;
    stopShadow();
    shadowRuns.current = [
      animate(shadowScale, 1.14, {
        duration: durations.fast,
        ease: easings.exit,
      }),
      animate(shadowOpacity, 0, {
        duration: durations.fast,
        ease: easings.exit,
        // At rest the shadow keeps the slot's own size.
        onComplete: () => shadowScale.jump(1),
      }),
    ];
  };

  const contact = (imp: Imp) => {
    beatTimer.current = null;
    squashY.jump(r2(1 - 0.065 * imp.firm));
    squashX.jump(r2(1 + 0.022 * imp.firm));
    stopShadow();
    beatRuns.current.push(
      animate(squashY, 1, springs.recoil),
      animate(squashX, 1, springs.recoil),
    );
    shadowRuns.current = [
      animate(shadowOpacity, 0, {
        duration: durations.slow,
        ease: easings.exit,
        onComplete: () => shadowScale.jump(1),
      }),
      animate(shadowScale, 1.1, {
        duration: durations.slow,
        ease: easings.exit,
      }),
    ];
    if (imp.manual) {
      audio.play("thock", {
        pitch: r2(0.9 + 0.25 * imp.firm),
        gain: r2(0.4 + 0.3 * imp.firm),
        pan: pan.current,
      });
      say(words[imp.index] ?? "");
    }
  };

  /**
   * The word the visitor stamped, spoken once it has landed. The region sits
   * inside the host's sentence, so it empties again soon after: a heading's
   * name must not keep a second copy of the word.
   */
  const say = (word: string) => {
    if (sayTimer.current !== null) window.clearTimeout(sayTimer.current);
    setSaid(word);
    sayTimer.current = window.setTimeout(() => {
      sayTimer.current = null;
      setSaid("");
    }, 1500);
  };

  /** One beat of the slot: room is made, the stamp falls, contact. */
  const beat = () => {
    const imp = latestImp;
    if (!imp || imp.still) return;
    stopBeat();
    const node = nodes.current.get(imp.n);
    const prevNode = prevImp ? nodes.current.get(prevImp.n) : undefined;
    if (!motionSafe) {
      slotWidth.jump(-1);
      lowered.current = false;
      stopShadow();
      shadowOpacity.jump(0);
      if (imp.manual) {
        audio.play("thock", {
          pitch: r2(0.9 + 0.25 * imp.firm),
          gain: 0.5,
          pan: pan.current,
        });
        say(words[imp.index] ?? "");
      }
      return;
    }
    if (node && prevNode) {
      const current = slotWidth.get();
      slotWidth.jump(r2(current >= 0 ? current : prevNode.offsetWidth));
      beatRuns.current.push(
        animate(slotWidth, node.offsetWidth, {
          ...springs.glide,
          onComplete: () => slotWidth.jump(-1),
        }),
      );
    }
    stopShadow();
    if (!lowered.current) {
      shadowScale.jump(1.14);
      shadowOpacity.jump(0);
    }
    lowered.current = false;
    const fall = imp.descent / 1000;
    shadowRuns.current = [
      animate(shadowScale, 1, { duration: fall, ease: easings.exit }),
      animate(shadowOpacity, 0.5, { duration: fall, ease: easings.exit }),
    ];
    beatTimer.current = window.setTimeout(() => contact(imp), imp.descent);
  };

  const auto = () => {
    if (count < 2) return;
    const next = (shown + 1) % count;
    commit(next, {
      firm: firmness,
      descent: descentOf(firmness),
      manual: false,
    });
    if (once && next === count - 1) onComplete?.();
  };

  // Before the beat effect below, so a new impression's beat finds it.
  React.useLayoutEffect(() => {
    api.current = {
      beat,
      auto,
      stop: () => {
        stopBeat();
        stopShadow();
        if (sayTimer.current !== null) window.clearTimeout(sayTimer.current);
        if (refusal.current !== null) window.clearTimeout(refusal.current);
      },
    };
  });

  React.useLayoutEffect(() => {
    api.current?.beat();
  }, [latestImp?.n]);

  React.useEffect(() => () => api.current?.stop(), []);

  const armed = trigger === "hover" ? hovered || focused : trigger !== "manual";
  const held = pauseOnHover && trigger !== "hover" && (hovered || focused);
  const finished = once && shown >= count - 1;
  const running =
    onScreen && !hidden && armed && !held && !paused && count > 1 && !finished;

  React.useEffect(() => {
    if (!running) return;
    const wait = beats.current === 0 ? delay : interval;
    const timer = window.setTimeout(
      () => api.current?.auto(),
      Math.max(0, wait),
    );
    return () => window.clearTimeout(timer);
  }, [running, shown, delay, interval]);

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  const bindImp = (n: number) => (node: HTMLSpanElement | null) => {
    if (node) nodes.current.set(n, node);
    else nodes.current.delete(n);
  };

  const gone = React.useCallback((n: number) => {
    setTrack((t) => ({ ...t, imps: t.imps.filter((imp) => imp.n !== n) }));
  }, []);

  const slotClass = cn(
    "relative inline-block align-baseline",
    interactive &&
      "cursor-pointer touch-manipulation rounded-1 [text-transform:inherit] outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid",
  );

  const slotChildren = (
    <>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -inset-x-[0.16em] -inset-y-[0.14em]"
        style={{
          scale: shadowScale,
          opacity: shadowOpacity,
          background:
            "radial-gradient(closest-side, color-mix(in oklab, black 34%, transparent), transparent)",
        }}
      />
      <motion.span
        className="relative inline-block"
        style={{ scaleX: squashX, scaleY: squashY }}
      >
        {imps.map((imp) => (
          <Impression
            key={imp.n}
            imp={imp}
            word={words[imp.index] ?? ""}
            current={imp.n === latestImp?.n}
            motionSafe={motionSafe}
            ink={inkColour}
            texture={texture}
            tilt={Math.max(0, tilt)}
            frame={shape}
            ring={ring}
            bind={bindImp(imp.n)}
            onGone={gone}
          />
        ))}
      </motion.span>
    </>
  );

  return React.createElement(
    as,
    {
      ref: bindRoot,
      className: cn("inline", className),
      onPointerEnter: (event: React.PointerEvent) => {
        if (event.pointerType === "mouse") setHovered(true);
      },
      onPointerLeave: () => setHovered(false),
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
    },
    interactive ? (
      <motion.button
        type="button"
        aria-describedby={hintId}
        className={slotClass}
        style={{ width }}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          pressAt.current = event.timeStamp;
          pan.current = panFrom(event.clientX, event.currentTarget);
          lower();
        }}
        onPointerUp={(event) => {
          const at = pressAt.current;
          if (at === null) return;
          pressAt.current = null;
          const lean = Math.min(1, (event.timeStamp - at) / HOLD);
          const firm = clamp01(firmness + LEAN * lean);
          stamp(firm, lowered.current ? DROP : descentOf(firm));
        }}
        onPointerLeave={() => {
          if (pressAt.current === null) return;
          pressAt.current = null;
          raise();
        }}
        onPointerCancel={() => {
          if (pressAt.current === null) return;
          pressAt.current = null;
          raise();
        }}
        onClick={(event) => {
          // Pointer presses arrive through pointerup. A click with no pointer
          // behind it — Enter, Space, assistive technology — is a full stamp.
          if (event.detail !== 0) return;
          pan.current = 0;
          stamp(firmness, descentOf(firmness));
        }}
      >
        {slotChildren}
      </motion.button>
    ) : (
      <motion.span className={slotClass} style={{ width }}>
        {slotChildren}
      </motion.span>
    ),
    interactive ? (
      // Hidden, not visually hidden: a description is still read, but it
      // must not join the text of the sentence the slot sits in.
      <span id={hintId} hidden>
        Press to stamp the next word
      </span>
    ) : null,
    <span role="status" className="sr-only">
      {said}
    </span>,
  );
}
