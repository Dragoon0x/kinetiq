"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type DownloadTrayState = "idle" | "pending" | "success" | "error";

export type DownloadTraySize = "sm" | "md" | "lg";

/** The spring the tray slides out and shuts on. */
export type DownloadTraySpring = "glide" | "snap" | "recoil";

/** How progress is drawn along the tray's lip. */
export type DownloadTrayProgress = "line" | "ticks" | "bytes";

export type DownloadTrayProps = {
  /** The file's size in bytes: the readout's total and the size stamped when the tray shuts. */
  bytes: number;
  /** The file's name, shown under the button at rest and spoken when the download starts. */
  fileName?: string;
  /** A short type tag before the size, such as "PDF". */
  kind?: string;
  /** Formats a byte count. @default decimal units with one place: "8.4 MB" */
  formatBytes?: (bytes: number) => string;
  /** Starts the download. A returned promise holds the tray open near the end until it settles. */
  onDownload?: () => Promise<unknown> | unknown;
  /** A press or Escape during the download cancelled it. */
  onCancel?: () => void;
  /** Controlled state. Omit it and the press, the progress and the promise drive the tray. */
  state?: DownloadTrayState;
  /** Every change of state — the press, the finish, a cancel, the promise, a hold — with the rejection on error. */
  onStateChange?: (state: DownloadTrayState, error?: unknown) => void;
  /** Controlled progress from your own transfer, 0 to 1. Omit it to simulate from `duration`. */
  value?: number;
  /** How long the simulated download takes, in ms. @default 2400 */
  duration?: number;
  /** The spring the tray slides out and shuts on: glide slides, snap clicks out with one overshoot, recoil bounces. @default "glide" */
  tray?: DownloadTraySpring;
  /** How progress is drawn along the tray's lip: a line, a row of ticks, or a line with the bytes received. @default "line" */
  progress?: DownloadTrayProgress;
  /** @default "md" */
  size?: DownloadTraySize;
  /** The idle label. @default "Download" */
  label?: string;
  /** The label during the download, when a press cancels. @default "Cancel" */
  cancelLabel?: string;
  /** The label once the file is in. @default "Downloaded" */
  successLabel?: string;
  /** The label after a failure, when a press tries again. @default "Retry" */
  retryLabel?: string;
  /** The word stamped beside the size when the tray shuts. @default "Saved" */
  savedLabel?: string;
  /** What failed, shown under the button. A rejection's own message replaces it. @default "Download failed" */
  errorLabel?: string;
  /** How long Downloaded holds before the button resets, in ms. 0 keeps it. @default 0 */
  successHold?: number;
  /** How long a failure holds before the button resets, in ms. 0 keeps it until retried. @default 0 */
  errorHold?: number;
  /** The arrow, the check and the progress on the lip. @default "var(--accent-bright)" */
  accent?: string;
  /** Play the arrow landing in the tray and the tray shutting. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Geometry = {
  button: number;
  well: number;
  font: number;
  icon: number;
  pad: number;
  gap: number;
};

const GEOMETRY: Record<DownloadTraySize, Geometry> = {
  sm: { button: 36, well: 24, font: 13, icon: 14, pad: 12, gap: 6 },
  md: { button: 40, well: 28, font: 14, icon: 16, pad: 14, gap: 8 },
  lg: { button: 48, well: 32, font: 15, icon: 18, pad: 18, gap: 10 },
};

const TICKS = 14;
/** The tray sits this far in from the button's sides, like a drawer under a desk. */
const TRAY_INSET = 6;
/** Where a simulated download waits while the promise is still out. */
const WAIT_AT = 0.96;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as { then?: unknown }).then === "function";

const messageOf = (error: unknown): string | null => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return null;
};

const UNITS: [number, string][] = [
  [1e9, "GB"],
  [1e6, "MB"],
  [1e3, "kB"],
];

/** Decimal units, one place, the same on the server and in the browser. */
const unitOf = (total: number) =>
  UNITS.find(([size]) => total >= size) ?? ([1, "B"] as [number, string]);
const defaultBytes = (n: number) => {
  const [size, unit] = unitOf(n);
  return size === 1 ? `${Math.round(n)} B` : `${(n / size).toFixed(1)} ${unit}`;
};

/**
 * A simulated transfer's shape: time in, progress out, with a seeded
 * network wobble that never runs backwards (its slope stays above 0.3).
 */
const wobble = (u: number) =>
  clamp01(u + 0.035 * Math.sin(6 * Math.PI * u) * (1 - u));

function Tick({
  index,
  progress,
  danger,
  accent,
}: {
  index: number;
  progress: MotionValue<number>;
  danger: MotionValue<number>;
  accent: string;
}) {
  const lit = useTransform(progress, (p) => clamp01((p * TICKS - index) * 3));
  const scaleY = useTransform(lit, (l) => r2(0.45 + 0.55 * l));
  const color = useTransform(
    [lit, danger] as MotionValue<number>[],
    ([l = 0, d = 0]: number[]) =>
      `color-mix(in oklab, color-mix(in oklab, var(--danger) ${Math.round(d * 100)}%, ${accent}) ${Math.round(l * 100)}%, var(--hairline-strong))`,
  );
  return (
    <motion.span
      className="h-1.5 w-0.5 rounded-b-full"
      style={{ scaleY, originY: 0, backgroundColor: color }}
    />
  );
}

const ArrowGlyph = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path
      d="M8 2.5V12M3.8 7.9L8 12.1L12.2 7.9"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

type Word = "download" | "cancel" | "done" | "retry";
const wordOf = (s: DownloadTrayState): Word =>
  s === "pending"
    ? "cancel"
    : s === "success"
      ? "done"
      : s === "error"
        ? "retry"
        : "download";

type Api = {
  enter: (to: DownloadTrayState, from: DownloadTrayState) => void;
  simulate: () => () => void;
  finished: () => void;
  settled: (ticket: number) => void;
  failed: (ticket: number, error: unknown) => void;
  onProgress: (p: number) => void;
  reset: () => void;
};

/**
 * A download button with a well under it. At rest the well carries the
 * file's caption; a tray waits hidden behind the button's bottom edge, the
 * well clipping it, so it can only slide out from under the button. A press
 * dips the arrow and drops it under gravity through the label row and out
 * of the button, while the tray slides out on the `tray` spring to catch it;
 * the arrow lands with a squash on recoil and the download's progress is
 * drawn along the tray's lip — a line, a row of ticks, or a line with the
 * bytes received. At 100% the tray slides shut, the size is stamped into
 * the caption, and the arrow rises back into its slot and flips over into a
 * check. Pressing during the download cancels it and pulls the arrow back
 * up out of the tray.
 *
 * Progress is the host's `value`, or simulated over `duration` with a
 * seeded network wobble that waits near the end while an `onDownload`
 * promise is still out. The button keeps the width of its longest label;
 * Escape cancels; the tray is a progressbar while it is out; each change is
 * spoken once. Under reduced motion nothing falls or slides: the arrow and
 * the tray fade, the lip still fills, and the check cross-fades in.
 */
export function DownloadTray({
  bytes,
  fileName,
  kind,
  formatBytes,
  onDownload,
  onCancel,
  state,
  onStateChange,
  value,
  duration = 2400,
  tray = "glide",
  progress = "line",
  size = "md",
  label = "Download",
  cancelLabel = "Cancel",
  successLabel = "Downloaded",
  retryLabel = "Retry",
  savedLabel = "Saved",
  errorLabel = "Download failed",
  successHold = 0,
  errorHold = 0,
  accent = "var(--accent-bright)",
  sound = false,
  disabled = false,
  className,
}: DownloadTrayProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const captionId = `${uid}-caption`;
  const g = GEOMETRY[size] ?? GEOMETRY.md;
  const total = Math.max(0, bytes);
  const fmt = formatBytes ?? defaultBytes;
  const sizeText = fmt(total);
  const traySpring = springs[tray] ?? springs.glide;
  const lineHeight = r2(g.font * 1.25);
  // From the arrow's slot in the button to the middle of the tray.
  const drop = r2(g.button / 2 + g.well / 2);
  const iconLeft = 1 + g.pad;

  const [own, setOwn] = React.useState<DownloadTrayState>("idle");
  const current = state ?? own;
  const [failure, setFailure] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState("");
  const [pct, setPct] = React.useState(0);

  const out = current === "pending";
  const prog = useMotionValue(0);
  const simU = useMotionValue(0);
  const trayY = useMotionValue(out ? 0 : -g.well);
  const trayOpacity = useMotionValue(1);
  const nudge = useMotionValue(0);
  const fall = useMotionValue(out ? 1 : 0);
  const iconOpacity = useMotionValue(out ? 0 : 1);
  const caught = useMotionValue(out ? 1 : 0);
  const squash = useMotionValue(1);
  const flip = useMotionValue(current === "success" ? 1 : 0);
  const cross = useMotionValue(out ? 1 : 0);
  const danger = useMotionValue(0);
  const flash = useMotionValue(0);
  const stampV = useMotionValue(1);

  const startWord = wordOf(current);
  const downloadO = useMotionValue(startWord === "download" ? 1 : 0);
  const downloadY = useMotionValue(0);
  const cancelO = useMotionValue(startWord === "cancel" ? 1 : 0);
  const cancelY = useMotionValue(0);
  const doneO = useMotionValue(startWord === "done" ? 1 : 0);
  const doneY = useMotionValue(0);
  const retryO = useMotionValue(startWord === "retry" ? 1 : 0);
  const retryY = useMotionValue(0);
  const words: Record<
    Word,
    { o: MotionValue<number>; y: MotionValue<number> }
  > = {
    download: { o: downloadO, y: downloadY },
    cancel: { o: cancelO, y: cancelY },
    done: { o: doneO, y: doneY },
    retry: { o: retryO, y: retryY },
  };

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef(new Set<number>());
  const api = React.useRef<Api | null>(null);
  const shown = React.useRef<DownloadTrayState>(current);
  const shownWord = React.useRef<Word>(startWord);
  const armed = React.useRef(false);
  const runs = React.useRef(0);
  const mounted = React.useRef(false);
  /** A promise from onDownload that has not settled yet. */
  const outstanding = React.useRef(false);
  const shownPct = React.useRef(0);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };
  const chirp = (tone: "plip" | "thock", pitch: number, gain: number) => {
    if (!armed.current) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    audio.play(tone, {
      pitch: r2(pitch),
      gain,
      pan: rect ? panFrom(rect.left + iconLeft, null) : 0,
    });
  };

  const move = (next: DownloadTrayState, error?: unknown) => {
    if (state === undefined) setOwn(next);
    onStateChange?.(next, error);
  };

  /** The label in one grid cell trades places with the next: no reflow. */
  const swapWord = (to: Word, down = false, delay = 0) => {
    const from = shownWord.current;
    if (to === from) return;
    shownWord.current = to;
    const a = words[from];
    const b = words[to];
    if (!motionSafe) {
      a.y.jump(0);
      b.y.jump(0);
      run(`o-${from}`, animate(a.o, 0, { duration: durations.fast }));
      run(
        `o-${to}`,
        animate(b.o, 1, { duration: durations.fast, delay: delay + 0.06 }),
      );
      return;
    }
    const step = down ? distances.step : -distances.step;
    run(
      `y-${from}`,
      animate(a.y, step, { duration: durations.fast, ease: easings.exit }),
    );
    run(
      `o-${from}`,
      animate(a.o, 0, { duration: durations.fast, ease: easings.exit }),
    );
    b.y.jump(-step);
    // The outgoing word is mostly gone before this one arrives.
    run(`y-${to}`, animate(b.y, 0, { ...springs.snap, delay: delay + 0.06 }));
    run(
      `o-${to}`,
      animate(b.o, 1, {
        duration: durations.base,
        ease: easings.enter,
        delay: delay + 0.06,
      }),
    );
  };

  const slideTray = (open: boolean, delay = 0) => {
    if (!motionSafe) {
      // Nothing slides: the tray fades where it will sit.
      trayY.jump(0);
      if (open) trayOpacity.jump(0);
      run(
        "trayOpacity",
        animate(trayOpacity, open ? 1 : 0, {
          duration: durations.base,
          delay,
          onComplete: () => {
            if (!open) trayY.jump(-g.well);
          },
        }),
      );
      return;
    }
    trayOpacity.jump(1);
    run("trayY", animate(trayY, open ? 0 : -g.well, { ...traySpring, delay }));
  };

  /** The tray's arrow hands over to the slot's, which is pulled back up. */
  const pullBack = () => {
    caught.jump(0);
    iconOpacity.jump(1);
    fall.jump(motionSafe ? 1 : 0);
    if (motionSafe) run("fall", animate(fall, 0, springs.snap));
    else {
      iconOpacity.jump(0);
      run("icon", animate(iconOpacity, 1, { duration: durations.base }));
    }
    run(
      "cross",
      animate(cross, 0, { duration: durations.fast, ease: easings.exit }),
    );
    later(motionSafe ? 260 : 0, () => chirp("plip", 0.8, 0.45));
  };

  const enter = (to: DownloadTrayState, from: DownloadTrayState) => {
    switch (to) {
      case "pending": {
        swapWord("cancel", true);
        const fromDone = flip.get() > 0.01;
        const wait = fromDone && motionSafe ? 0.14 : 0;
        if (fromDone) {
          run(
            "flip",
            animate(
              flip,
              0,
              motionSafe ? springs.flick : { duration: durations.fast },
            ),
          );
        }
        prog.jump(0);
        simU.jump(0);
        caught.jump(0);
        danger.jump(0);
        flash.jump(0);
        setPct(0);
        shownPct.current = 0;
        slideTray(true, wait);
        run(
          "cross",
          animate(cross, 1, {
            duration: durations.base,
            ease: easings.enter,
            delay: wait + (motionSafe ? 0.16 : 0),
          }),
        );
        if (!motionSafe) {
          run(
            "icon",
            animate(iconOpacity, 0, { duration: durations.fast, delay: wait }),
          );
          run(
            "caught",
            animate(caught, 1, { duration: durations.base, delay: wait }),
          );
        } else {
          // A dip, then a fall under gravity: the exit ease is position
          // going with the square of time. It lands where the tray is by
          // then, wherever its spring has got to.
          fall.jump(0);
          run(
            "nudge",
            animate(nudge, [nudge.get(), -2, 0], {
              duration: 0.34,
              times: [0, 0.24, 1],
              ease: "easeOut",
              delay: wait,
            }),
          );
          run(
            "fall",
            animate(fall, 1, {
              duration: 0.26,
              ease: easings.exit,
              delay: wait + 0.08,
              onComplete: () => {
                iconOpacity.jump(0);
                caught.jump(1);
                squash.jump(0.72);
                run("squash", animate(squash, 1, springs.recoil));
                chirp("plip", 1.2, 0.5);
              },
            }),
          );
        }
        setSaid(`Downloading${fileName ? ` ${fileName}` : ""}, ${sizeText}.`);
        return;
      }
      case "success": {
        run(
          "prog",
          animate(prog, 1, { duration: durations.fast, ease: easings.enter }),
        );
        run(
          "flash",
          animate(flash, [0, 1, 0], {
            duration: durations.slow,
            times: [0, 0.3, 1],
            ease: "easeOut",
          }),
        );
        const shut = motionSafe ? 0.16 : 0;
        slideTray(false, shut);
        run(
          "cross",
          animate(cross, 0, { duration: durations.fast, ease: easings.exit }),
        );
        swapWord("done", false, motionSafe ? 0.2 : 0);
        later(Math.round((shut + 0.2) * 1000), () => chirp("thock", 1, 0.6));
        // The arrow comes back up into its slot and turns over into a check.
        fall.jump(0);
        if (motionSafe) {
          nudge.jump(distances.step);
          iconOpacity.jump(0);
          run(
            "nudge",
            animate(nudge, 0, { ...springs.glide, delay: shut + 0.16 }),
          );
          run(
            "icon",
            animate(iconOpacity, 1, {
              duration: durations.base,
              ease: easings.enter,
              delay: shut + 0.16,
            }),
          );
          run("flip", animate(flip, 1, { ...springs.snap, delay: shut + 0.3 }));
          stampV.jump(0);
          run(
            "stamp",
            animate(stampV, 1, { ...springs.recoil, delay: shut + 0.22 }),
          );
        } else {
          caught.jump(0);
          stampV.jump(1);
          run("flip", animate(flip, 1, { duration: durations.base }));
          run("icon", animate(iconOpacity, 1, { duration: durations.base }));
        }
        setSaid(`${successLabel}. ${sizeText} ${savedLabel.toLowerCase()}.`);
        return;
      }
      case "error": {
        run(
          "danger",
          animate(danger, 1, { duration: durations.fast, ease: easings.enter }),
        );
        if (from === "pending") pullBack();
        slideTray(false, motionSafe ? 0.12 : 0);
        run(
          "prog",
          animate(prog, 0, {
            duration: durations.base,
            ease: easings.exit,
            delay: 0.12,
          }),
        );
        swapWord("retry");
        later(motionSafe ? 320 : 0, () => chirp("thock", 0.75, 0.5));
        setSaid("");
        return;
      }
      case "idle": {
        swapWord("download");
        if (from === "pending") {
          // Cancelled: the arrow is pulled back up, the lip drains, the
          // tray shuts.
          pullBack();
          run(
            "prog",
            animate(prog, 0, { duration: durations.base, ease: easings.exit }),
          );
          slideTray(false, motionSafe ? 0.08 : 0);
          setSaid("Download cancelled.");
        } else {
          run(
            "flip",
            animate(
              flip,
              0,
              motionSafe ? springs.snap : { duration: durations.fast },
            ),
          );
          setSaid("");
        }
        armed.current = false;
        return;
      }
    }
  };

  const simulate = () => {
    // Time runs linearly; the transfer's own shape rides on it. While a
    // promise is still out it waits just short of the end.
    const total = Math.max(0.2, duration / 1000);
    const u0 = simU.get();
    const controls = animate(simU, 1, {
      duration: (1 - u0) * total,
      ease: "linear",
      onUpdate: (u) => {
        const p = wobble(u);
        prog.set(outstanding.current ? Math.min(WAIT_AT, p) : p);
      },
      onComplete: () => api.current?.finished(),
    });
    return () => controls.stop();
  };

  /** The simulated transfer has run its course. */
  const finished = () => {
    if (shown.current !== "pending") return;
    if (outstanding.current) {
      run("prog", animate(prog, 0.985, { duration: 8, ease: easings.enter }));
      return;
    }
    move("success");
  };

  const settled = (ticket: number) => {
    if (ticket !== runs.current || !mounted.current) return;
    outstanding.current = false;
    if (shown.current !== "pending") return;
    // The file is in: whatever the simulation says, the lip runs out now,
    // and the simulation stops writing to it.
    simU.stop();
    run(
      "prog",
      animate(prog, 1, {
        duration: Math.max(0.15, (1 - prog.get()) * 0.8),
        ease: easings.enter,
        onComplete: () => {
          if (shown.current === "pending") move("success");
        },
      }),
    );
  };

  const failed = (ticket: number, error: unknown) => {
    if (ticket !== runs.current || !mounted.current) return;
    outstanding.current = false;
    setFailure(messageOf(error));
    move("error", error);
  };

  const onProgress = (p: number) => {
    // Spoken progress moves in 5% steps, never per frame.
    const step = Math.floor(clamp01(p) * 20) * 5;
    if (step !== shownPct.current) {
      shownPct.current = step;
      setPct(step);
    }
  };

  const reset = () => move("idle");

  React.useEffect(() => {
    api.current = {
      enter,
      simulate,
      finished,
      settled,
      failed,
      onProgress,
      reset,
    };
  });

  React.useEffect(() => {
    const from = shown.current;
    if (from === current) return;
    shown.current = current;
    api.current?.enter(current, from);
  }, [current]);

  const simulating = current === "pending" && value === undefined;
  React.useEffect(() => {
    if (!simulating) return;
    return api.current?.simulate();
  }, [simulating]);

  // A host's own progress: followed on glide, and the lip arriving at the
  // end is the finish, reported from that moment rather than from here.
  React.useEffect(() => {
    if (value === undefined || current !== "pending") return;
    const to = clamp01(value);
    const controls = animate(prog, to, {
      ...(motionSafe ? springs.glide : { duration: durations.fast }),
      onComplete: () => {
        if (to >= 1 && !outstanding.current) api.current?.finished();
      },
    });
    return () => controls.stop();
  }, [value, current, prog, motionSafe]);

  React.useEffect(
    () => prog.on("change", (p) => api.current?.onProgress(p)),
    [prog],
  );

  // A size change moves the hidden tray's rest position.
  React.useEffect(() => {
    if (shown.current !== "pending") trayY.jump(-g.well);
  }, [g.well, trayY]);

  // Holds count only while the page is visible.
  const hold =
    current === "success" ? successHold : current === "error" ? errorHold : 0;
  React.useEffect(() => {
    if (hold <= 0) return;
    let left = hold;
    let started = performance.now();
    let id = 0;
    const start = () => {
      started = performance.now();
      id = window.setTimeout(() => api.current?.reset(), left);
    };
    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(id);
        left = Math.max(0, left - (performance.now() - started));
      } else {
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hold, current]);

  React.useEffect(() => {
    mounted.current = true;
    const running = anims.current;
    const pending = timers.current;
    return () => {
      mounted.current = false;
      for (const c of running.values()) c.stop();
      running.clear();
      for (const id of pending) window.clearTimeout(id);
      pending.clear();
    };
  }, []);

  const start = () => {
    armed.current = true;
    const ticket = ++runs.current;
    setFailure(null);
    outstanding.current = false;
    let result: unknown;
    try {
      result = onDownload?.();
    } catch (error) {
      setFailure(messageOf(error));
      move("pending");
      move("error", error);
      return;
    }
    if (isThenable(result)) {
      outstanding.current = true;
      result.then(
        () => api.current?.settled(ticket),
        (error: unknown) => api.current?.failed(ticket, error),
      );
    }
    move("pending");
  };

  const cancel = () => {
    runs.current += 1;
    outstanding.current = false;
    onCancel?.();
    move("idle");
  };

  const onClick = () => {
    if (disabled) return;
    if (current === "pending") cancel();
    else start();
  };

  const errorText = failure ?? errorLabel;
  const word =
    current === "pending"
      ? cancelLabel
      : current === "success"
        ? successLabel
        : current === "error"
          ? retryLabel
          : label;
  const spoken =
    current === "error"
      ? `${errorText.replace(/[.!?]+$/, "")}. Press to retry.`
      : said;

  const iconY = useTransform(
    [nudge, fall, trayY] as MotionValue<number>[],
    ([l = 0, f = 0, t = 0]: number[]) => r2(l + f * (drop + t)),
  );
  const arrowTurn = useTransform(flip, (f) => (motionSafe ? r2(f * 180) : 0));
  const checkTurn = useTransform(flip, (f) =>
    motionSafe ? r2(f * 180 - 180) : 0,
  );
  const arrowFace = useTransform(flip, (f) =>
    motionSafe ? 1 : r2(1 - clamp01(f)),
  );
  const checkFace = useTransform(flip, (f) =>
    motionSafe ? 1 : r2(clamp01(f)),
  );
  const crossScale = useTransform(cross, (c) =>
    motionSafe ? r2(0.6 + 0.4 * c) : 1,
  );
  const lipColor = useTransform(
    danger,
    (d) =>
      `color-mix(in oklab, var(--danger) ${Math.round(d * 100)}%, ${accent})`,
  );
  const lipClip = useTransform(
    prog,
    (p) => `inset(0 ${r2(100 - clamp01(p) * 100)}% 0 0)`,
  );
  const flashOpacity = useTransform(flash, (f) => r2(f * 0.6));
  /** Bytes received, in the total's own unit so the readout never jumps units. */
  const received = (share: number) => {
    if (formatBytes) return fmt(share * total);
    const [unit, name] = unitOf(total);
    return unit === 1
      ? `${Math.round(share * total)} B`
      : `${((share * total) / unit).toFixed(1)} ${name}`;
  };
  const readout = useTransform(prog, (p) => {
    const share = clamp01(p);
    if (progress !== "bytes") return `${Math.round(share * 100)}%`;
    return `${received(share).replace(/ \S+$/, "")} / ${sizeText}`;
  });
  const spread = useTransform(squash, (k) => r2(2 - k));
  const stampScale = useTransform(stampV, (v) =>
    motionSafe ? r2(1 + (1 - v) * 0.35) : 1,
  );
  const stampOpacity = useTransform(stampV, (v) => r2(clamp01(v * 3)));

  const wordCell = "col-start-1 row-start-1 whitespace-nowrap";
  const meta = [kind, sizeText].filter(Boolean).join(" · ");

  return (
    <span
      className={cn(
        "relative inline-flex max-w-full shrink-0 flex-col align-middle",
        disabled && "opacity-50",
        className,
      )}
    >
      <motion.button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label={
          current === "idle" && fileName ? `${word} ${fileName}` : word
        }
        aria-describedby={captionId}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === "Escape" && current === "pending") {
            event.preventDefault();
            cancel();
          }
        }}
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse" || !motionSafe) return;
          if (current !== "pending")
            run("nudge", animate(nudge, 1.5, springs.flick));
        }}
        onPointerLeave={() => run("nudge", animate(nudge, 0, springs.flick))}
        onPointerDown={(event) => {
          if (disabled || !motionSafe || current === "pending") return;
          if (event.pointerType === "mouse" && event.button !== 0) return;
          run("nudge", animate(nudge, 3, springs.flick));
        }}
        className={cn(
          "group/download-tray relative z-10 inline-flex max-w-full touch-manipulation items-center rounded-3 border border-hairline-strong bg-secondary font-medium text-secondary-foreground outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
        style={{
          height: g.button,
          paddingInline: g.pad,
          gap: g.gap,
          fontSize: g.font,
          lineHeight: `${lineHeight}px`,
        }}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 rounded-[inherit] bg-current opacity-0 transition-opacity",
            !disabled && "group-hover/download-tray:opacity-[0.05]",
          )}
        />
        {/* The arrow's slot. The arrow itself is drawn over the button so
            it can fall out of it. */}
        <span
          aria-hidden
          className="shrink-0"
          style={{ width: g.icon, height: g.icon }}
        />
        <span aria-hidden className="relative grid min-w-0">
          {[label, cancelLabel, successLabel, retryLabel].map((w, i) => (
            <span key={i} className={cn(wordCell, "invisible")}>
              {w}
            </span>
          ))}
          {(["download", "cancel", "done", "retry"] as Word[]).map((key) => (
            <motion.span
              key={key}
              className={cn(wordCell, "text-left")}
              style={{ opacity: words[key].o, y: words[key].y }}
            >
              {key === "download"
                ? label
                : key === "cancel"
                  ? cancelLabel
                  : key === "done"
                    ? successLabel
                    : retryLabel}
            </motion.span>
          ))}
        </span>
      </motion.button>

      <span className="relative overflow-clip" style={{ height: g.well }}>
        <span
          id={captionId}
          className={cn(
            "absolute inset-0 grid place-items-center px-2 text-[11px] leading-none transition-opacity duration-150",
            // Hidden under the tray, and gone while a fading tray would let
            // it read through.
            out && "opacity-0",
          )}
        >
          {current === "success" ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="text-success">{savedLabel}</span>
              <span aria-hidden className="text-ink-3">
                ·
              </span>
              <motion.span
                className="font-mono text-foreground tabular-nums"
                style={{ scale: stampScale, opacity: stampOpacity }}
              >
                {sizeText}
              </motion.span>
            </span>
          ) : current === "error" ? (
            <span className="max-w-full truncate text-danger" title={errorText}>
              {errorText}
            </span>
          ) : (
            <span className="flex max-w-full min-w-0 items-center gap-1.5 text-ink-3">
              {fileName ? (
                <span className="min-w-0 truncate" title={fileName}>
                  {fileName}
                </span>
              ) : null}
              {fileName && meta ? (
                <span aria-hidden className="shrink-0">
                  ·
                </span>
              ) : null}
              <span className="shrink-0 font-mono tabular-nums">{meta}</span>
            </span>
          )}
        </span>

        <motion.span
          role={out ? "progressbar" : undefined}
          aria-label={out ? "Download progress" : undefined}
          aria-valuemin={out ? 0 : undefined}
          aria-valuemax={out ? 100 : undefined}
          aria-valuenow={out ? pct : undefined}
          aria-valuetext={
            out
              ? progress === "bytes"
                ? `${received(pct / 100)} of ${sizeText}`
                : `${pct} percent`
              : undefined
          }
          aria-hidden={out ? undefined : true}
          className="absolute top-0 bottom-0 overflow-clip rounded-b-2 border border-t-0 border-hairline-strong bg-surface-1 shadow-[inset_0_6px_6px_-6px_color-mix(in_oklab,black_28%,transparent)]"
          style={{
            left: TRAY_INSET,
            right: TRAY_INSET,
            y: trayY,
            opacity: trayOpacity,
          }}
        >
          {/* The lip: a track, the progress along it, and a flash at 100%. */}
          <span aria-hidden className="absolute inset-x-0 top-0 h-0.5">
            {progress === "ticks" ? (
              <span className="absolute inset-x-1.5 top-0 flex justify-between">
                {Array.from({ length: TICKS }, (_, i) => (
                  <Tick
                    key={i}
                    index={i}
                    progress={prog}
                    danger={danger}
                    accent={accent}
                  />
                ))}
              </span>
            ) : (
              <>
                <span className="absolute inset-0 bg-hairline-strong" />
                <motion.span
                  className="absolute inset-0"
                  style={{ backgroundColor: lipColor, clipPath: lipClip }}
                />
              </>
            )}
            <motion.span
              className="absolute inset-x-0 top-0 h-2"
              style={{
                opacity: flashOpacity,
                background: `linear-gradient(to bottom, ${accent}, transparent)`,
              }}
            />
          </span>
          {/* The arrow, once caught, rides in the tray. */}
          <motion.span
            aria-hidden
            className="absolute flex items-center justify-center"
            style={{
              left: iconLeft - TRAY_INSET - 1,
              top: (g.well - g.icon) / 2,
              width: g.icon,
              height: g.icon,
              color: accent,
              opacity: caught,
              scaleY: squash,
              scaleX: spread,
              originY: 1,
            }}
          >
            <ArrowGlyph size={g.icon} />
          </motion.span>
          <motion.span
            aria-hidden
            className="absolute top-0 bottom-0 flex items-center font-mono text-[11px] text-ink-2 tabular-nums"
            style={{ right: 8 }}
          >
            {readout}
          </motion.span>
        </motion.span>
      </span>

      {/* Drawn over the button: the arrow that falls, flips and comes back,
          and the cross that stands in its slot while the file is coming. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute z-20"
        style={{
          left: iconLeft,
          top: (g.button - g.icon) / 2,
          width: g.icon,
          height: g.icon,
          y: iconY,
          opacity: iconOpacity,
          color: accent,
        }}
      >
        <motion.span
          className="absolute inset-0 flex items-center justify-center [backface-visibility:hidden]"
          style={{
            rotateX: arrowTurn,
            transformPerspective: 120,
            opacity: arrowFace,
          }}
        >
          <ArrowGlyph size={g.icon} />
        </motion.span>
        <motion.span
          className="absolute inset-0 flex items-center justify-center [backface-visibility:hidden]"
          style={{
            rotateX: checkTurn,
            transformPerspective: 120,
            opacity: checkFace,
          }}
        >
          <svg width={g.icon} height={g.icon} viewBox="0 0 16 16" fill="none">
            <path
              d="M3.2 8.6L6.6 11.8L12.8 4.6"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </motion.span>
      </motion.span>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute z-20 flex items-center justify-center text-ink-2"
        style={{
          left: iconLeft,
          top: (g.button - g.icon) / 2,
          width: g.icon,
          height: g.icon,
          opacity: cross,
          scale: crossScale,
        }}
      >
        <svg width={g.icon} height={g.icon} viewBox="0 0 16 16" fill="none">
          <path
            d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </svg>
      </motion.span>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </span>
  );
}
