"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  usePresence,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
  type TactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PaperSlipTone = "info" | "success" | "warn" | "danger";

export type PaperSlipNotice = {
  id: string;
  title: string;
  body?: string;
  /** @default "info" */
  tone?: PaperSlipTone;
};

export type PaperSlipPaper = "white" | "cream" | "thermal";

export type PaperSlipProps = {
  /** Every notice, oldest first. The newest stands at the printer's slot. */
  notices: PaperSlipNotice[];
  /** Fires the moment a slip tears, from the pull or the key that tore it. */
  onDismiss?: (id: string) => void;
  /** The list's name, printed on the printer. @default "Notifications" */
  label?: string;
  /** How far the loose end of the paper rolls toward you, 0 to 1. @default 0.4 */
  curl?: number;
  /** Paper feed rate, and how fast a torn slip falls, 0.5 to 2. @default 1 */
  speed?: number;
  /** The paper stock and its ink. @default "thermal" */
  paper?: PaperSlipPaper;
  /** How many slips stand on the paper at once, 2 to 6. @default 4 */
  max?: number;
  /** The print head, the tear and the flutter. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Entry = "still" | "print" | "reveal";

type Stock = {
  paper: string;
  ink: string;
  faint: string;
  perf: string;
  perfStrong: string;
  fibre: string;
  sheen?: string;
};

// Paper is a physical object: fixed pigments, so a slip is the same paper on
// a light page and a dark one.
const STOCKS: Record<PaperSlipPaper, Stock> = {
  white: {
    paper: "oklch(0.975 0.004 95)",
    ink: "oklch(0.24 0.012 260)",
    faint: "oklch(0.52 0.012 260)",
    perf: "oklch(0.82 0.008 95)",
    perfStrong: "oklch(0.6 0.01 95)",
    fibre: "oklch(0.8 0.008 95)",
  },
  cream: {
    paper: "oklch(0.945 0.036 88)",
    ink: "oklch(0.3 0.035 55)",
    faint: "oklch(0.52 0.04 60)",
    perf: "oklch(0.8 0.05 80)",
    perfStrong: "oklch(0.58 0.06 70)",
    fibre: "oklch(0.78 0.05 80)",
  },
  thermal: {
    paper: "oklch(0.958 0.008 250)",
    ink: "oklch(0.4 0.03 265)",
    faint: "oklch(0.58 0.02 265)",
    perf: "oklch(0.82 0.012 250)",
    perfStrong: "oklch(0.6 0.02 250)",
    fibre: "oklch(0.78 0.012 250)",
    sheen:
      "linear-gradient(112deg, transparent 32%, oklch(1 0 0 / 0.6) 44%, transparent 56%)",
  },
};

/**
 * A hairline and a soft shadow that follow the serrated edges (a filter on
 * the masked paper's parent), so white paper still reads on a white page.
 */
const PAPER_EDGE =
  "drop-shadow(0 0 0.5px oklch(0.25 0.02 260 / 0.5)) drop-shadow(0 1px 1.5px oklch(0.2 0.02 260 / 0.2))";

/** A two-colour till prints warnings and alerts in its second, red ink. */
const RED_INK = "oklch(0.52 0.19 27)";

const TONES: Record<PaperSlipTone, { word: string; stub: string }> = {
  info: { word: "Notice", stub: "Note" },
  success: { word: "Done", stub: "Done" },
  warn: { word: "Warning", stub: "Check" },
  danger: { word: "Alert", stub: "Alert" },
};

/** Serrated ends: the cut each slip took against the tear bar. */
const TEETH_DOWN =
  "conic-gradient(from -45deg at 50% 100%, transparent, black 1deg 89deg, transparent 90deg) 50% 0 / 8px 100%";
const TEETH_UP =
  "conic-gradient(from 135deg at 50% 0, transparent, black 1deg 89deg, transparent 90deg) 50% 0 / 8px 100%";

/** Finger travel that tears a slip, and the perforation's give, in px. */
const TEAR = 64;
const GIVE = 36;
const GAP_AT_TEAR = rubberband(TEAR, GIVE);
/** One printed line: the feed advances in these. */
const LINE = 8;
/** Paper fed per second at speed 1. */
const FEED = 240;
const FIBRES = 14;
/** The printer's height, in px: the slot is its top edge. */
const PRINTER = 60;
const FEED_CLIP = "inset(-800px -40px 0px -40px)";
/** How recently the visitor pressed something for an arrival to be theirs. */
const HEARD_WITHIN = 2500;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const stop = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

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

type Fibre = {
  /** Across the slip, 0 to 100. */
  x: number;
  /** How far it leans as it stretches, in the same units. */
  slant: number;
  /** The share of the tear gap it survives. */
  breaks: number;
  /** Its hair once broken, in px. */
  hair: number;
  bend: number;
};

function fibresOf(id: string): Fibre[] {
  const rand = lcg(hash(`${id}:fibres`));
  return Array.from({ length: FIBRES }, (_, i) => ({
    x: r2(3 + ((i + 0.2 + rand() * 0.6) / FIBRES) * 94),
    slant: r2((rand() - 0.5) * 3),
    breaks: r2(0.42 + rand() * 0.63),
    hair: r2(1.4 + rand() * 3),
    bend: r2((rand() < 0.5 ? -1 : 1) * (0.4 + rand() * 0.8)),
  }));
}

/** A short broken fibre: a hair that curls as it leaves its edge. */
const hairPath = (x: number, y: number, len: number, bend: number) =>
  `M${r2(x)} ${r2(y)}Q${r2(x + bend * 0.5)} ${r2(y + len * 0.6)} ${r2(x + bend)} ${r2(y + len)}`;

/** The feed moves a line at a time: a quick step, then a hold. */
const lineEase = (lines: number) => (t: number) => {
  const x = clamp01(t) * lines;
  const k = Math.floor(x);
  const f = Math.min(1, (x - k) * 2.4);
  return Math.min(1, (k + f * f * (3 - 2 * f)) / lines);
};

/**
 * When the visitor last pressed something on the page. An arrival is the
 * host's doing; it is only heard when a press of the visitor's came just
 * before it — a Send button, a key — never when a timer pushes it alone.
 */
function useVisitorPress() {
  const last = React.useRef(-Infinity);
  React.useEffect(() => {
    const mark = () => {
      last.current = performance.now();
    };
    const onKey = (event: KeyboardEvent) => {
      if (["Enter", " ", "Delete", "Backspace"].includes(event.key)) mark();
    };
    document.addEventListener("pointerdown", mark, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", mark, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, []);
  return React.useCallback(
    (within: number) => performance.now() - last.current < within,
    [],
  );
}

function Glyph({ tone }: { tone: PaperSlipTone }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      className="size-3 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {tone === "success" ? (
        <path d="M2.5 6.3 5 8.6 9.6 3.6" />
      ) : tone === "warn" ? (
        <>
          <path d="M6 1.6 10.8 10H1.2Z" />
          <path d="M6 4.8v2.4M6 8.6v.1" />
        </>
      ) : tone === "danger" ? (
        <>
          <circle cx={6} cy={6} r={4.6} />
          <path d="m4.2 4.2 3.6 3.6m0-3.6L4.2 7.8" />
        </>
      ) : (
        <>
          <circle cx={6} cy={6} r={4.6} />
          <path d="M6 5.4v3M6 3.6v.1" />
        </>
      )}
    </svg>
  );
}

type SlipProps = {
  notice: PaperSlipNotice;
  entry: Entry;
  stock: Stock;
  curl: number;
  speed: number;
  focusable: boolean;
  motionSafe: boolean;
  disabled: boolean;
  audio: TactileSound;
  heard: (within: number) => boolean;
  hintId: string;
  isListed: (id: string) => boolean;
  rootRect: () => DOMRect | null;
  feedStart: () => () => void;
  setNode: (id: string, node: HTMLElement | null) => void;
  onFocus: (id: string) => void;
  onKeyMove: (id: string, key: string) => void;
  /** A slip is going: focus leaves it, and a tear is reported. */
  onLeave: (id: string, report: boolean) => void;
};

function Slip(props: SlipProps) {
  const { notice, stock, motionSafe } = props;
  const tone = notice.tone ?? "info";
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const bodyId = `${uid}-body`;
  const [isPresent, safeToRemove] = usePresence();
  const fibres = React.useMemo(() => fibresOf(notice.id), [notice.id]);
  const serial = String((hash(notice.id) % 9000) + 1000);
  const red = tone === "warn" || tone === "danger";

  // The lane: its height is the paper that has come out of the slot.
  const lane = useMotionValue<string>(props.entry === "print" ? "0px" : "auto");
  // While it feeds, whatever is still inside the printer is cut at the slot:
  // the lane's bottom edge is the slot line. At rest nothing clips, so a torn
  // body falls in front of the printer, not into it.
  const slot = useMotionValue<string>(
    props.entry === "print" ? FEED_CLIP : "none",
  );
  const laneOpacity = useMotionValue(props.entry === "reveal" ? 0 : 1);
  const laneY = useMotionValue(
    props.entry === "reveal" && motionSafe ? -distances.step : 0,
  );
  const z = useMotionValue(1);
  const curlAmount = useMotionValue(
    props.entry === "print" ? Math.min(1.2, props.curl + 0.35) : props.curl,
  );
  const bodyY = useMotionValue(0);
  const bodyX = useMotionValue(0);
  const bodyRotate = useMotionValue(0);
  const bodyTilt = useMotionValue(0);
  const bodyOpacity = useMotionValue(1);
  const stubOpacity = useMotionValue(1);
  const stubKick = useMotionValue(0);
  const torn = useMotionValue(0);
  const fray = useMotionValue(0);
  const broken = useMotionValue(0);
  const lean = useMotionValue(0);

  const articleRef = React.useRef<HTMLElement | null>(null);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const whir = React.useRef<LoopHandle | null>(null);
  const tear = React.useRef({
    torn: false,
    gap: 0,
    raw: 0,
    flying: false,
    /** Torn by the host's removal: nothing to report back. */
    quiet: false,
  });
  const landed = React.useRef(false);
  const onLanded = React.useRef<(() => void) | null>(null);
  const lastRaw = React.useRef(0);
  const latest = React.useRef(props);
  React.useEffect(() => {
    latest.current = props;
  });

  const run = (...controls: AnimationPlaybackControls[]) => {
    // Finished controls are harmless to stop again; only the recent ones
    // can still be running.
    runs.current = [...runs.current.slice(-16), ...controls];
  };
  const halt = React.useCallback(() => {
    for (const c of runs.current) c.stop();
    runs.current = [];
  }, []);

  const panOf = () => {
    const rect = articleRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  /** The pull, in px of finger travel, drawn onto the perforation. */
  const pullTo = (raw: number, audible: boolean) => {
    const t = tear.current;
    lastRaw.current = raw;
    if (t.torn) {
      bodyY.set(r2(t.gap + raw - t.raw));
      return;
    }
    const gap = raw >= 0 ? rubberband(raw, GIVE) : rubberband(raw, 6);
    const ratio = Math.max(0, gap) / GAP_AT_TEAR;
    const ln = lean.get();
    bodyY.set(r2(gap));
    bodyRotate.set(r2(ln * 3 * Math.min(1, ratio)));
    let mask = broken.get();
    fibres.forEach((f, i) => {
      if (ratio * (1 + ln * ((f.x - 50) / 50) * 0.4) >= f.breaks) {
        mask |= 1 << i;
      }
    });
    if (mask !== broken.get()) broken.set(mask);
    if (raw >= TEAR) tearNow(raw, audible);
  };

  const tearNow = (raw: number, audible: boolean) => {
    const t = tear.current;
    if (t.torn) return;
    t.torn = true;
    t.gap = bodyY.get();
    t.raw = raw;
    torn.set(1);
    broken.set((1 << FIBRES) - 1);
    if (motionSafe) {
      // The fibres let go all at once and spring back to either edge; the
      // stub, suddenly slack, kicks up a pixel.
      fray.set(1);
      stubKick.set(-1.5);
      run(
        animate(fray, 0, springs.recoil),
        animate(stubKick, 0, springs.recoil),
      );
    }
    if (audible) {
      props.audio.play("paper", {
        pitch: r2(0.85 + Math.min(0.5, raw / 400)),
        gain: 0.6,
        pan: panOf(),
      });
    }
    latest.current.onLeave(notice.id, !t.quiet);
  };

  const landedNow = () => {
    landed.current = true;
    tear.current.flying = false;
    const next = onLanded.current;
    onLanded.current = null;
    if (next) {
      next();
      return;
    }
    // The host kept the notice: the slip is printed back where it was.
    if (latest.current.isListed(notice.id)) restore();
  };

  /** Off it goes: falling out of the component, swaying and turning over. */
  const flutter = (velocity: number, audible: boolean) => {
    const t = tear.current;
    if (t.flying) return;
    t.flying = true;
    landed.current = false;
    z.set(40);
    const root = latest.current.rootRect();
    const body = bodyRef.current?.getBoundingClientRect();
    const fall = root && body ? Math.max(48, root.bottom - body.top + 12) : 480;
    const v = Math.max(420, velocity);
    const pace = Math.sqrt(clamp(latest.current.speed, 0.5, 2));
    const duration = r2(clamp(0.25 + fall / (v + 700), 0.5, 1.1) / pace);
    if (audible) {
      props.audio.play("swish", {
        pitch: r2(0.8 + Math.min(0.6, v / 3000)),
        gain: 0.4,
        pan: panOf(),
      });
    }
    if (!motionSafe) {
      run(
        animate(bodyOpacity, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: landedNow,
        }),
      );
      return;
    }
    const dir = lean.get() >= 0 ? 1 : -1;
    const r0 = bodyRotate.get();
    run(
      animate(bodyY, r2(bodyY.get() + fall), {
        duration,
        ease: easings.exit,
        onComplete: landedNow,
      }),
      animate(bodyX, [0, dir * 14, -dir * 5, dir * 24], {
        duration,
        ease: easings.move,
      }),
      animate(
        bodyRotate,
        [r0, r2(r0 + dir * 9), r2(r0 - dir * 4), r2(r0 + dir * 16)],
        { duration, ease: easings.move },
      ),
      animate(bodyTilt, [0, 28, -12, 44], { duration, ease: easings.move }),
      animate(bodyOpacity, [1, 1, 0], { duration, times: [0, 0.65, 1] }),
    );
  };

  /** The keyboard's tear, and the host's: the same pull, driven. */
  const autoTear = (audible: boolean, quiet = false) => {
    const t = tear.current;
    if (t.torn || t.flying) return;
    t.quiet = quiet;
    halt();
    z.set(40);
    if (!motionSafe) {
      pullTo(TEAR, audible);
      flutter(700, audible);
      return;
    }
    run(
      animate(Math.max(0, lastRaw.current), TEAR, {
        duration: 0.24,
        ease: [0.55, 0, 0.9, 0.55],
        onUpdate: (raw) => pullTo(raw, audible),
        onComplete: () => {
          pullTo(TEAR, audible);
          flutter(700, audible);
        },
      }),
    );
  };

  /** Printed back: fresh paper, whole fibres, where it stood. */
  const restore = () => {
    halt();
    const t = tear.current;
    t.torn = false;
    t.flying = false;
    t.quiet = false;
    t.gap = 0;
    t.raw = 0;
    lastRaw.current = 0;
    torn.set(0);
    broken.set(0);
    fray.set(0);
    bodyY.set(0);
    bodyX.set(0);
    bodyRotate.set(0);
    bodyTilt.set(0);
    z.set(1);
    bodyOpacity.set(0);
    run(
      animate(bodyOpacity, 1, {
        duration: durations.base,
        ease: easings.enter,
      }),
    );
  };

  const springBack = (velocity: number) => {
    const gap = bodyY.get();
    if (gap > 6) {
      props.audio.play("paper", { pitch: 1.3, gain: 0.18, pan: panOf() });
    }
    if (!motionSafe) {
      run(
        animate(bodyY, 0, { duration: durations.fast, ease: easings.enter }),
        animate(bodyRotate, 0, { duration: durations.fast }),
      );
    } else {
      // The body moved slower than the finger (the perforation gave less and
      // less), so it takes back the finger's speed scaled by that give.
      const give = 0.55 / Math.pow((lastRaw.current * 0.55) / GIVE + 1, 2);
      run(
        animate(bodyY, 0, { ...springs.snap, velocity: velocity * give }),
        animate(bodyRotate, 0, springs.snap),
      );
    }
    lastRaw.current = 0;
    z.set(1);
  };

  const drag = useDrag({
    axis: "y",
    threshold: 3,
    disabled: props.disabled || !isPresent,
    onStart: ({ point, offset }) => {
      halt();
      const rect = articleRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0 && !tear.current.torn) {
        const x = point.x - offset.x;
        lean.set(
          r2(clamp((x - rect.left - rect.width / 2) / (rect.width / 2), -1, 1)),
        );
      }
      z.set(40);
    },
    onMove: ({ offset }) => pullTo(offset.y, true),
    onEnd: ({ velocity }) => {
      const t = tear.current;
      if (!t.torn && velocity.y > 200) {
        // A flick tears if the pull it throws would have reached the tear.
        if (project(lastRaw.current, velocity.y, 0.99) >= TEAR) {
          pullTo(TEAR, true);
        }
      }
      if (tear.current.torn) flutter(velocity.y, true);
      else springBack(velocity.y);
    },
    onCancel: () => {
      if (tear.current.torn) flutter(0, true);
      else springBack(0);
    },
    onTap: (event) => {
      if (tear.current.torn) return;
      props.audio.play("paper", {
        pitch: 1.4,
        gain: 0.12,
        pan: panFrom(event.clientX, null),
      });
      if (!motionSafe) return;
      bodyY.set(3);
      run(animate(bodyY, 0, springs.snap));
    },
  });

  // Printed: the lane opens a line at a time, pushing the older slips up,
  // while the housing chatters and the whir steps with each line. A re-run
  // (StrictMode) carries on from wherever the paper had got to.
  React.useEffect(() => {
    if (props.entry !== "print") return;
    const node = articleRef.current;
    const natural = node ? node.offsetHeight : 0;
    const shown = lane.get() === "auto" ? natural : parseFloat(lane.get());
    if (!node || natural <= 0 || shown >= natural - 0.5) {
      lane.set("auto");
      slot.set("none");
      return;
    }
    const current = latest.current;
    if (!current.motionSafe) {
      lane.set("auto");
      slot.set("none");
      curlAmount.set(current.curl);
      laneOpacity.set(0);
      const fade = animate(laneOpacity, 1, {
        duration: durations.base,
        ease: easings.enter,
      });
      return () => fade.stop();
    }
    const pace = clamp(current.speed, 0.5, 2);
    const from = shown / natural;
    const lines = Math.max(3, Math.round(natural / LINE));
    const end = current.feedStart();
    if (current.heard(HEARD_WITHIN)) {
      whir.current = current.audio.start("whir", {
        pitch: r2(0.8 + 0.3 * pace),
        gain: 0.45,
      });
    }
    let step = -1;
    const feed = animate(from, 1, {
      duration: r2((natural * (1 - from)) / (FEED * pace)),
      ease: lineEase(lines),
      onUpdate: (p) => {
        lane.set(`${Math.round(p * natural)}px`);
        const at = Math.floor(p * lines);
        if (at !== step) {
          step = at;
          whir.current?.set({ gain: at % 2 ? 0.5 : 0.25 });
        }
      },
      onComplete: () => {
        lane.set("auto");
        slot.set("none");
        end();
        whir.current?.stop();
        whir.current = null;
        const settle = animate(curlAmount, latest.current.curl, springs.drift);
        runs.current.push(settle);
      },
    });
    return () => {
      feed.stop();
      end();
      whir.current?.stop();
      whir.current = null;
    };
    // Mount only: a slip is printed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Revealed when a newer slip left: it comes down into view from above.
  React.useEffect(() => {
    if (props.entry !== "reveal") return;
    const safe = latest.current.motionSafe;
    const fade = animate(laneOpacity, 1, {
      duration: durations.base,
      ease: easings.enter,
    });
    if (!safe) {
      laneY.set(0);
      return () => fade.stop();
    }
    const drop = animate(laneY, 0, springs.glide);
    return () => {
      fade.stop();
      drop.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new curl from the host is taken on the glide spring.
  const curlSeen = React.useRef(props.curl);
  React.useEffect(() => {
    if (curlSeen.current === props.curl) return;
    curlSeen.current = props.curl;
    if (!motionSafe) curlAmount.set(props.curl);
    else run(animate(curlAmount, props.curl, springs.glide));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.curl]);

  // Leaving. Torn: the lane closes once the body has fallen. Pushed out by a
  // newer slip: it lifts off the top. Taken away by the host with no tear:
  // it tears itself.
  React.useEffect(() => {
    if (isPresent) return;
    let live = true;
    const done = () => {
      if (live) safeToRemove?.();
    };
    const close = () => {
      if (!live) return;
      const node = articleRef.current;
      const from = node ? node.offsetHeight : 0;
      const safe = latest.current.motionSafe;
      run(
        animate(stubOpacity, 0, {
          duration: durations.fast,
          ease: easings.exit,
        }),
      );
      if (!safe || from <= 0) {
        lane.set("0px");
        done();
        return;
      }
      run(
        animate(from, 0, {
          ...springs.glide,
          onUpdate: (h) => lane.set(`${Math.max(0, Math.round(h))}px`),
          onComplete: done,
        }),
      );
    };
    const t = tear.current;
    if (t.torn) {
      if (landed.current) close();
      else onLanded.current = close;
    } else if (latest.current.isListed(notice.id)) {
      latest.current.onLeave(notice.id, false);
      const safe = latest.current.motionSafe;
      run(
        animate(laneOpacity, 0, exitFor(durations.base)),
        ...(safe
          ? [animate(laneY, -distances.step, exitFor(durations.base))]
          : []),
      );
      const timer = window.setTimeout(done, durations.base * 600 + 20);
      return () => {
        live = false;
        window.clearTimeout(timer);
      };
    } else {
      onLanded.current = close;
      autoTear(latest.current.heard(HEARD_WITHIN), true);
    }
    return () => {
      live = false;
      onLanded.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent]);

  React.useEffect(
    () => () => {
      halt();
      whir.current?.stop();
      whir.current = null;
    },
    [halt],
  );

  const stubTurn = useTransform(curlAmount, (c) => r2(-c * 52));
  const stubShade = useTransform(
    curlAmount,
    (c) =>
      `linear-gradient(to bottom, oklch(1 0 0 / ${r2(0.6 * clamp01(c))}) 0%, transparent 42%, oklch(0.25 0.02 260 / ${r2(0.22 * clamp01(c))}) 100%)`,
  );
  const sideShade = useTransform(curlAmount, (c) => {
    const a = r2(0.1 * clamp01(c));
    return `linear-gradient(90deg, oklch(0.25 0.02 260 / ${a}) 0%, transparent 16%, transparent 84%, oklch(0.25 0.02 260 / ${a}) 100%)`;
  });

  const gapPath = useTransform(
    [bodyY, torn, fray, broken, lean] as MotionValue<number>[],
    ([g = 0, t = 0, fr = 0, mask = 0, ln = 0]: number[]) => {
      let d = "";
      fibres.forEach((f, i) => {
        const gi = Math.max(0, g * (1 + ln * ((f.x - 50) / 50) * 0.4));
        const snapped = t > 0.5 || (mask & (1 << i)) !== 0;
        if (!snapped) {
          if (gi < 0.4) return;
          d += `M${r2(f.x)} 0L${r2(f.x + f.slant * Math.min(1, gi / 6))} ${r2(gi)}`;
          return;
        }
        const len =
          t > 0.5
            ? f.hair * Math.max(0.3, 1 + fr * 1.6)
            : Math.min(f.hair, gi / 2);
        if (len < 0.3) return;
        d += hairPath(f.x, 0, len, f.bend);
        if (t <= 0.5) d += hairPath(f.x + f.slant, gi, -len, -f.bend);
      });
      return d;
    },
  );
  const bodyHairs = useTransform(
    [torn, fray] as MotionValue<number>[],
    ([t = 0, fr = 0]: number[]) => {
      if (t <= 0.5) return "";
      return fibres
        .map((f) =>
          hairPath(
            f.x + f.slant,
            8,
            -f.hair * 0.8 * Math.max(0.3, 1 + fr * 1.6),
            -f.bend,
          ),
        )
        .join("");
    },
  );

  const leaving = !isPresent;
  const word = TONES[tone];

  return (
    <motion.li
      className="relative w-full shrink-0"
      style={{ height: lane, zIndex: z, clipPath: slot }}
    >
      <motion.article
        ref={(node: HTMLElement | null) => {
          articleRef.current = node;
          props.setNode(notice.id, node);
        }}
        tabIndex={props.focusable && !leaving ? 0 : -1}
        aria-labelledby={titleId}
        aria-describedby={
          notice.body ? `${bodyId} ${props.hintId}` : props.hintId
        }
        aria-disabled={props.disabled || undefined}
        aria-hidden={leaving || undefined}
        onFocus={() => props.onFocus(notice.id)}
        onKeyDown={(event) => {
          if (leaving) return;
          const key = event.key;
          if (key === "Delete" || key === "Backspace") {
            event.preventDefault();
            if (!event.repeat && !props.disabled) autoTear(true);
            return;
          }
          if (
            key === "ArrowUp" ||
            key === "ArrowDown" ||
            key === "Home" ||
            key === "End"
          ) {
            event.preventDefault();
            props.onKeyMove(notice.id, key);
          }
        }}
        {...drag}
        className={cn(
          "group/paper-slip pointer-events-auto relative mx-auto block w-[calc(100%-3rem)] touch-pan-x pt-1.5 outline-none select-none [-webkit-touch-callout:none]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          props.disabled
            ? "cursor-not-allowed"
            : "cursor-grab active:cursor-grabbing",
        )}
        style={{ color: stock.ink, opacity: laneOpacity, y: laneY }}
      >
        <motion.div
          className="relative h-5"
          style={{
            rotateX: stubTurn,
            transformPerspective: 420,
            originY: 1,
            y: stubKick,
            opacity: stubOpacity,
          }}
        >
          <span
            aria-hidden
            className="absolute inset-0"
            style={{ filter: PAPER_EDGE }}
          >
            <span
              className="absolute inset-0"
              style={{
                background: stock.paper,
                mask: TEETH_UP,
                WebkitMask: TEETH_UP,
              }}
            >
              <motion.span
                className="absolute inset-0"
                style={{ background: stubShade }}
              />
            </span>
          </span>
          <span
            aria-hidden
            className="absolute inset-x-1 bottom-0 border-b border-dotted border-(--perf) transition-colors group-hover/paper-slip:border-(--perf-strong)"
            style={
              {
                "--perf": stock.perf,
                "--perf-strong": stock.perfStrong,
              } as React.CSSProperties
            }
          />
          <span className="relative flex h-full items-center justify-between gap-2 px-3 pt-0.5 font-mono text-[9px] leading-none tracking-[0.12em] uppercase">
            <span
              aria-hidden
              className="truncate tabular-nums"
              title={`№ ${serial} · ${word.stub}`}
              style={{ color: red ? RED_INK : stock.faint }}
            >
              № {serial} · {word.stub}
            </span>
            <button
              type="button"
              tabIndex={-1}
              disabled={props.disabled || leaving}
              aria-label={`Tear off ${notice.title}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => autoTear(true)}
              className={cn(
                "-mr-1 inline-flex h-4 shrink-0 cursor-pointer items-center gap-0.5 rounded-1 px-1 outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
                "disabled:cursor-not-allowed",
              )}
              style={{ color: stock.faint }}
            >
              Tear
              <svg
                aria-hidden
                viewBox="0 0 8 8"
                className="size-2"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.2}
                strokeLinecap="round"
              >
                <path d="M4 1v5.2M1.8 4.2 4 6.4l2.2-2.2" />
              </svg>
            </button>
          </span>
        </motion.div>

        <motion.svg
          aria-hidden
          viewBox="0 0 100 24"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 top-[26px] h-6 w-full overflow-visible"
          style={{ opacity: stubOpacity }}
        >
          <motion.path
            d={gapPath}
            fill="none"
            stroke={stock.fibre}
            strokeWidth={0.8}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </motion.svg>

        <motion.div
          ref={bodyRef}
          className="relative"
          style={{
            y: bodyY,
            x: bodyX,
            rotate: bodyRotate,
            rotateX: bodyTilt,
            transformPerspective: 520,
            originX: 0.5,
            originY: 0,
            opacity: bodyOpacity,
          }}
        >
          <svg
            aria-hidden
            viewBox="0 0 100 8"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-x-0 bottom-full h-2 w-full overflow-visible"
          >
            <motion.path
              d={bodyHairs}
              fill="none"
              stroke={stock.fibre}
              strokeWidth={0.8}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              filter: PAPER_EDGE,
            }}
          >
            <span
              className="absolute inset-0"
              style={{
                background: stock.paper,
                mask: TEETH_DOWN,
                WebkitMask: TEETH_DOWN,
              }}
            >
              <motion.span
                className="absolute inset-0"
                style={{ background: sideShade }}
              />
              {stock.sheen ? (
                <span
                  className="absolute inset-0"
                  style={{ background: stock.sheen }}
                />
              ) : null}
            </span>
          </span>
          <div className="relative flex flex-col gap-1 px-3 pt-2 pb-4 font-mono">
            <p
              id={titleId}
              className="flex min-w-0 items-center gap-1.5 text-[11px] leading-4 font-semibold tracking-[0.04em] uppercase"
              style={red ? { color: RED_INK } : undefined}
            >
              <Glyph tone={tone} />
              <span className="sr-only">{word.word}: </span>
              <span className="truncate" title={notice.title}>
                {notice.title}
              </span>
            </p>
            {notice.body ? (
              <p
                id={bodyId}
                className="line-clamp-3 text-[11px] leading-4"
                title={notice.body}
              >
                {notice.body}
              </p>
            ) : null}
          </div>
        </motion.div>
      </motion.article>
    </motion.li>
  );
}

type Book = {
  key: string;
  ids: string[];
  titles: Record<string, string>;
  entry: Record<string, Entry>;
  said: { n: number; polite: string; assertive: string };
};

const spoken = (n: PaperSlipNotice) => {
  const word = TONES[n.tone ?? "info"].word;
  return `${word}: ${stop(n.title)}${n.body ? ` ${stop(n.body)}` : ""}`;
};

/**
 * A notifier that prints. Every notice is a slip of till paper standing out
 * of a printer's slot, newest at the slot; a new one feeds out a line at a
 * time — the lane opening under it pushes the older slips up — while the
 * print head chatters and the loose end of the paper curls toward you.
 *
 * Pull a slip down to tear it off: the body is held by its perforation and
 * gives less the further you pull, leaning toward the side you grabbed, while
 * seeded paper fibres stretch across the gap and snap one by one. Past the
 * tear the last fibres spring apart on the recoil spring, the body comes free
 * under the finger, and let go it flutters out of the component — falling on
 * the exit ease, swaying, turning over — while the older slips drop down into
 * its place on the glide spring. A flick tears; a short pull springs back.
 *
 * Slips are articles in a list with one tab stop: Up and Down move, Delete
 * tears (the same pull, driven), and every stub carries a Tear button for
 * assistive technology. Under reduced motion a print and a tear are fades;
 * the paper still follows a pulling finger.
 */
export function PaperSlip({
  notices,
  onDismiss,
  label = "Notifications",
  curl = 0.4,
  speed = 1,
  paper = "thermal",
  max = 4,
  sound = false,
  disabled = false,
  className,
}: PaperSlipProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const heard = useVisitorPress();
  const hintId = React.useId();
  const stock = STOCKS[paper] ?? STOCKS.thermal;
  const count = clamp(Math.round(Number.isFinite(max) ? max : 4), 2, 6);
  const bend = clamp01(Number.isFinite(curl) ? curl : 0.4);
  const pace = clamp(Number.isFinite(speed) ? speed : 1, 0.5, 2);

  const list = React.useMemo(() => {
    const seen = new Set<string>();
    return notices.filter((n) => !seen.has(n.id) && (seen.add(n.id), true));
  }, [notices]);
  const visible = list.slice(-count);
  const earlier = list.length - visible.length;
  const ids = list.map((n) => n.id);
  const key = `${count}|${ids.join("|")}`;

  const [book, setBook] = React.useState<Book>(() => ({
    key,
    ids,
    titles: Object.fromEntries(list.map((n) => [n.id, n.title])),
    entry: Object.fromEntries(visible.map((n) => [n.id, "still" as Entry])),
    said: { n: 0, polite: "", assertive: "" },
  }));
  if (book.key !== key) {
    const known = new Set(book.ids);
    const now = new Set(ids);
    const entry: Record<string, Entry> = {};
    for (const n of visible) {
      entry[n.id] = book.entry[n.id] ?? (known.has(n.id) ? "reveal" : "print");
    }
    const arrived = list.filter((n) => !known.has(n.id));
    const gone = book.ids.filter((id) => !now.has(id));
    const newest = arrived[arrived.length - 1];
    const polite: string[] = [];
    let assertive = "";
    if (gone.length > 0) {
      polite.push(
        `Torn off: ${stop(gone.map((id) => book.titles[id] ?? "a slip").join(", "))}`,
      );
    }
    if (newest) {
      const text = `Printed. ${spoken(newest)}`;
      if (newest.tone === "danger") assertive = text;
      else polite.push(text);
    }
    setBook({
      key,
      ids,
      titles: Object.fromEntries(list.map((n) => [n.id, n.title])),
      entry,
      said:
        polite.length > 0 || assertive
          ? { n: book.said.n + 1, polite: polite.join(" "), assertive }
          : book.said,
    });
  }

  const [focusId, setFocusId] = React.useState<string | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const nodes = React.useRef(new Map<string, HTMLElement>());
  const listed = React.useRef(new Set(ids));
  // Before any passive effect: a leaving slip asks this in its own effect,
  // and children's effects run before their parent's.
  React.useLayoutEffect(() => {
    listed.current = new Set(ids);
  });

  // The printer: its housing chatters and its lamp glows while any slip feeds.
  const shake = useMotionValue(0);
  const lamp = useMotionValue(0);
  const feeding = React.useRef(0);
  const chatter = React.useRef<AnimationPlaybackControls | null>(null);
  const glow = React.useRef<AnimationPlaybackControls | null>(null);
  const feedStart = React.useCallback(() => {
    feeding.current += 1;
    if (feeding.current === 1) {
      glow.current?.stop();
      glow.current = animate(lamp, 1, { duration: durations.fast });
      if (motionSafe) {
        chatter.current?.stop();
        chatter.current = animate(shake, [0, 0.6, -0.3, 0.45, 0], {
          duration: r2(0.11 / pace),
          ease: "linear",
          repeat: Infinity,
        });
      }
    }
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      feeding.current = Math.max(0, feeding.current - 1);
      if (feeding.current > 0) return;
      chatter.current?.stop();
      chatter.current = null;
      shake.set(0);
      glow.current?.stop();
      glow.current = animate(lamp, 0, { duration: durations.slow });
    };
  }, [lamp, motionSafe, pace, shake]);
  React.useEffect(
    () => () => {
      chatter.current?.stop();
      glow.current?.stop();
    },
    [],
  );
  const lampColor = useTransform(
    lamp,
    (v) =>
      `color-mix(in oklab, oklch(0.8 0.16 75) ${Math.round(v * 100)}%, oklch(0.72 0.14 155))`,
  );
  const lampHalo = useTransform(lamp, (v) =>
    v < 0.02
      ? "none"
      : `0 0 ${r2(6 * v)}px oklch(0.8 0.16 75 / ${r2(0.8 * v)})`,
  );

  const tabStop =
    focusId && visible.some((n) => n.id === focusId)
      ? focusId
      : (visible[visible.length - 1]?.id ?? null);

  const onLeave = (id: string, report: boolean) => {
    const order = visible.map((n) => n.id);
    const i = order.indexOf(id);
    const rest = order.filter((other) => other !== id);
    const neighbour =
      (i < 0 ? rest[rest.length - 1] : (rest[i] ?? rest[i - 1])) ?? null;
    const root = rootRef.current;
    const held = nodes.current.get(id);
    if (root && held && held.contains(document.activeElement)) {
      if (neighbour) {
        setFocusId(neighbour);
        nodes.current.get(neighbour)?.focus({ preventScroll: true });
      } else {
        root.focus({ preventScroll: true });
      }
    }
    if (report) onDismiss?.(id);
  };

  const onKeyMove = (id: string, keyName: string) => {
    const order = visible.map((n) => n.id);
    const i = order.indexOf(id);
    if (i < 0) return;
    const to =
      keyName === "ArrowUp"
        ? i - 1
        : keyName === "ArrowDown"
          ? i + 1
          : keyName === "Home"
            ? 0
            : order.length - 1;
    const target = order[clamp(to, 0, order.length - 1)];
    if (!target) return;
    setFocusId(target);
    nodes.current.get(target)?.focus({ preventScroll: true });
  };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={label}
      tabIndex={-1}
      className={cn(
        "relative isolate h-104 w-full max-w-72 overflow-clip rounded-3 outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled && "opacity-60",
        className,
      )}
    >
      {/* The printer, under the paper: a torn slip falls in front of it. */}
      <motion.div
        className="absolute inset-x-0 bottom-0 rounded-3 border border-hairline-strong bg-surface-2"
        style={{
          height: PRINTER,
          y: shake,
          boxShadow: "var(--edge-highlight)",
        }}
      >
        <span
          aria-hidden
          className="absolute top-0 left-1/2 h-1.5 w-[calc(100%-2rem)] -translate-x-1/2 rounded-b-1"
          style={{
            background: "color-mix(in oklab, var(--bg-0) 25%, black)",
          }}
        />
        <span
          aria-hidden
          className="absolute top-1.5 left-1/2 h-1 w-[calc(100%-2.75rem)] -translate-x-1/2 bg-ink-3/55"
          style={{ mask: TEETH_UP, WebkitMask: TEETH_UP }}
        />
        <span
          aria-hidden
          className="absolute bottom-2 left-2 size-1.5 rounded-full bg-ink-3/25"
        />
        <span
          aria-hidden
          className="absolute right-2 bottom-2 size-1.5 rounded-full bg-ink-3/25"
        />
        <span className="absolute inset-x-0 top-2.5 bottom-0 flex items-center justify-between gap-3 px-5">
          <span
            className="min-w-0 truncate font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase"
            title={label}
          >
            {label}
          </span>
          <span className="flex shrink-0 items-center gap-2 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase tabular-nums">
            <motion.span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ background: lampColor, boxShadow: lampHalo }}
            />
            {visible.length} on paper
          </span>
        </span>
      </motion.div>

      {/* The paper: the whole box, so a slip can be pulled down over the
          printer; its top edge fades, so a tall stack runs off it. */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          maskImage: "linear-gradient(to bottom, transparent, black 28px)",
        }}
      >
        <ol
          aria-label={label}
          className="absolute inset-x-0 flex flex-col"
          style={{ bottom: PRINTER }}
        >
          <AnimatePresence initial={false}>
            {visible.map((n) => (
              <Slip
                key={n.id}
                notice={n}
                entry={book.entry[n.id] ?? "still"}
                stock={stock}
                curl={bend}
                speed={pace}
                focusable={tabStop === n.id}
                motionSafe={motionSafe}
                disabled={disabled}
                audio={audio}
                heard={heard}
                hintId={hintId}
                isListed={(id) => listed.current.has(id)}
                rootRect={() =>
                  rootRef.current?.getBoundingClientRect() ?? null
                }
                feedStart={feedStart}
                setNode={(id, node) => {
                  if (node) nodes.current.set(id, node);
                  else nodes.current.delete(id);
                }}
                onFocus={setFocusId}
                onKeyMove={onKeyMove}
                onLeave={onLeave}
              />
            ))}
          </AnimatePresence>
        </ol>
        {list.length === 0 ? (
          <p
            className="absolute inset-x-0 text-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            style={{ bottom: PRINTER + 12 }}
          >
            Nothing printed
          </p>
        ) : null}
      </div>
      {earlier > 0 ? (
        <p className="absolute inset-x-0 top-1 z-20 flex justify-center">
          <span className="rounded-full border border-hairline bg-surface-1 px-2 font-mono text-[9px] leading-4 tracking-[0.08em] text-ink-3 uppercase tabular-nums">
            +{earlier} earlier
          </span>
        </p>
      ) : null}

      <p id={hintId} className="sr-only">
        Pull a slip down past its perforation to tear it off, or press Delete.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        <span key={book.said.n}>{book.said.polite}</span>
      </p>
      <p aria-live="assertive" className="sr-only">
        <span key={book.said.n}>{book.said.assertive}</span>
      </p>
    </div>
  );
}
