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
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SettleState = "idle" | "pending" | "success" | "error";

export type SettleButtonSize = "sm" | "md" | "lg";

export type SettleButtonProps = {
  /** What is owed, in major units — dollars, not cents. */
  amount: number;
  /** ISO 4217 code: sets the sign, the separators and how many places roll. @default "USD" */
  currency?: string;
  /** The formatting locale. @default the currency's home: USD en-US, EUR de-DE, GBP en-GB, JPY ja-JP, otherwise en-US */
  locale?: string;
  /** Formats the amount for the label and the spoken text; every digit in it becomes a wheel. @default Intl.NumberFormat in `locale` */
  format?: (amount: number) => string;
  /** Takes the payment. A returned promise holds the meter short of zero until it settles. */
  onPay?: () => Promise<unknown> | unknown;
  /** Controlled state. Omit it and the press and the promise drive the button. */
  state?: SettleState;
  /** Every change of state — the press, the promise, a hold running out — with the rejection on error. */
  onStateChange?: (state: SettleState, error?: unknown) => void;
  /** How fast the amount runs down, 0.5 to 2 times. @default 1 */
  speed?: number;
  /** How hard the check is stamped, 0 to 1: 0 only draws it, 1 slams it down with an ink ring. @default 0.6 */
  stamp?: number;
  /** The word before the amount. @default "Pay" */
  label?: string;
  /** The word while the payment is in flight. @default "Paying" */
  pendingLabel?: string;
  /** The word once paid. @default "Paid" */
  paidLabel?: string;
  /** The word after a failure, when a press tries again. @default "Retry" */
  retryLabel?: string;
  /** What failed, spoken and shown as the button's title. A rejection's own message replaces it. @default "Payment declined" */
  errorLabel?: string;
  /** How long Paid holds before the amount rolls back up, in ms. 0 keeps it paid. @default 0 */
  successHold?: number;
  /** How long the failure tint holds, in ms. 0 keeps it until the next press. @default 2400 */
  errorHold?: number;
  /** @default "md" */
  size?: SettleButtonSize;
  /** The unpaid face. @default "var(--primary)" */
  accent?: string;
  /** The paid colour that sweeps in behind the digits. @default the success hue as a fixed-lightness pigment */
  fill?: string;
  /** Play a tick as each digit reaches zero, the stamp and the decline. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Geometry = { height: number; font: number; pad: number; gap: number };

const GEOMETRY: Record<SettleButtonSize, Geometry> = {
  sm: { height: 36, font: 13, pad: 14, gap: 16 },
  md: { height: 44, font: 14, pad: 16, gap: 20 },
  lg: { height: 52, font: 15, pad: 20, gap: 24 },
};

const HOME: Record<string, string> = {
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
  JPY: "ja-JP",
};

/** How much of the fold each character takes, staggered left to right. */
const FOLD_STEP = 0.14;
const FOLD_TIME = 0.6;

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

type Slot =
  | { kind: "digit"; d: number; ghost: boolean }
  | { kind: "char"; ch: string; ghostWith: number | null };

/**
 * The formatted amount as slots: every digit a wheel, everything else
 * static. Digits above the ones place may dim to ghost zeros; a separator
 * between two such digits dims with the digit on its right.
 */
function template(text: string, fraction: number): Slot[] {
  const chars = Array.from(text);
  const total = chars.filter((c) => c >= "0" && c <= "9").length;
  let seen = 0;
  const slots: Slot[] = chars.map((ch) => {
    if (ch >= "0" && ch <= "9") {
      const place = total - 1 - seen;
      seen += 1;
      return { kind: "digit", d: Number(ch), ghost: place > fraction };
    }
    return { kind: "char", ch, ghostWith: null };
  });
  slots.forEach((slot, i) => {
    const left = slots[i - 1];
    const right = slots[i + 1];
    if (
      slot.kind === "char" &&
      left?.kind === "digit" &&
      right?.kind === "digit" &&
      right.ghost
    ) {
      slot.ghostWith = i + 1;
    }
  });
  return slots;
}

type Geo = { w: number; slots: { x0: number; x1: number }[] };

/** How far the fill's front has carried one slot, 0 to 1. */
const rollOf = (geo: Geo | null, i: number, p: number) => {
  const slot = geo?.slots[i];
  if (!geo || !slot) return 0;
  const front = p * geo.w;
  return clamp01((front - slot.x0) / Math.max(1, slot.x1 - slot.x0));
};

/** One slot's share of the fold: the cascade runs left to right. */
const foldOf = (f: number, i: number, n: number) =>
  clamp01(f * (1 + (n - 1) * FOLD_STEP) - i * FOLD_STEP);

function Wheel({
  index,
  count,
  digit,
  ghost,
  geo,
  progress,
  fold,
  lineHeight,
  motionSafe,
}: {
  index: number;
  count: number;
  digit: number;
  ghost: boolean;
  geo: Geo | null;
  progress: MotionValue<number>;
  fold: MotionValue<number>;
  lineHeight: number;
  motionSafe: boolean;
}) {
  // Each wheel rolls only its own digit's worth as the front crosses it:
  // never a blur, always legible. Under reduced motion it swaps instead.
  const y = useTransform(progress, (p) => {
    const roll = rollOf(geo, index, p);
    const pos = motionSafe ? digit * (1 - roll) : roll >= 0.5 ? 0 : digit;
    return r2(-pos * lineHeight);
  });
  const opacity = useTransform(
    [progress, fold] as MotionValue<number>[],
    ([p = 0, f = 0]: number[]) =>
      r2(
        (ghost ? 1 - 0.66 * rollOf(geo, index, p) : 1) *
          (1 - foldOf(f, index, count)),
      ),
  );
  const rotateX = useTransform(fold, (f) =>
    motionSafe ? r2(-90 * foldOf(f, index, count)) : 0,
  );
  return (
    <motion.span
      data-slot=""
      className="relative inline-block overflow-clip text-center"
      style={{
        height: lineHeight,
        width: "1ch",
        opacity,
        rotateX,
        transformPerspective: 240,
      }}
    >
      <motion.span className="flex flex-col" style={{ y }}>
        {Array.from({ length: 10 }, (_, d) => (
          <span key={d} style={{ height: lineHeight }}>
            {d}
          </span>
        ))}
      </motion.span>
    </motion.span>
  );
}

function Glyph({
  index,
  count,
  ch,
  ghostWith,
  geo,
  progress,
  fold,
  lineHeight,
  motionSafe,
}: {
  index: number;
  count: number;
  ch: string;
  ghostWith: number | null;
  geo: Geo | null;
  progress: MotionValue<number>;
  fold: MotionValue<number>;
  lineHeight: number;
  motionSafe: boolean;
}) {
  const opacity = useTransform(
    [progress, fold] as MotionValue<number>[],
    ([p = 0, f = 0]: number[]) =>
      r2(
        (ghostWith === null ? 1 : 1 - 0.66 * rollOf(geo, ghostWith, p)) *
          (1 - foldOf(f, index, count)),
      ),
  );
  const rotateX = useTransform(fold, (f) =>
    motionSafe ? r2(-90 * foldOf(f, index, count)) : 0,
  );
  return (
    <motion.span
      data-slot=""
      className="inline-block whitespace-pre"
      style={{
        height: lineHeight,
        opacity,
        rotateX,
        transformPerspective: 240,
      }}
    >
      {ch}
    </motion.span>
  );
}

type Word = "pay" | "paying" | "paid" | "retry";
const WORDS: Word[] = ["pay", "paying", "paid", "retry"];
const wordOf = (s: SettleState): Word =>
  s === "pending"
    ? "paying"
    : s === "success"
      ? "paid"
      : s === "error"
        ? "retry"
        : "pay";

type Api = {
  enter: (to: SettleState, from: SettleState) => void;
  approach: () => () => void;
  foldIn: () => void;
  rollIn: (delay?: number) => void;
  onProgress: (p: number) => void;
  paid: (ticket: number) => void;
  declined: (ticket: number, error: unknown) => void;
  reset: () => void;
};

/**
 * A pay button laid out like a checkout bar: the word on the left, the
 * amount on the right on an odometer — a wheel per digit, mono and tabular,
 * separators and sign standing still, so nothing ever shifts. A press sends
 * a fill in the paid colour sweeping in from the left behind the text, and
 * as its front crosses each digit that wheel rolls down to zero, the leading
 * ones dimming to ghost zeros. The front closes in on the last digit
 * exponentially and holds there while `onPay`'s promise is pending — the
 * last cent belongs to the payment. Resolved, it runs through, the
 * characters fold away left to right, "Pay" rolls to "Paid", and a check is
 * stamped where the last digit stood, landing on the recoil spring with an
 * ink ring as strong as `stamp`. Declined, the fill retreats on glide, every
 * wheel rolls back up to the amount and the face tints to danger.
 *
 * It is a real button whose name is one sentence ("Pay $1,284.50"); in
 * flight and once paid it stays focusable but is aria-disabled, and each
 * change is spoken once. Controlled through `state`, or uncontrolled with the
 * promise. Under reduced motion the fill still sweeps — it is the progress —
 * while each digit swaps to zero as it is passed, the fold is a fade and the
 * check appears without the bounce.
 */
export function SettleButton({
  amount,
  currency = "USD",
  locale,
  format,
  onPay,
  state,
  onStateChange,
  speed = 1,
  stamp = 0.6,
  label = "Pay",
  pendingLabel = "Paying",
  paidLabel = "Paid",
  retryLabel = "Retry",
  errorLabel = "Payment declined",
  successHold = 0,
  errorHold = 2400,
  size = "md",
  accent = "var(--primary)",
  fill = "oklch(from var(--success) 0.55 c h)",
  sound = false,
  disabled = false,
  className,
}: SettleButtonProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const g = GEOMETRY[size] ?? GEOMETRY.md;
  const pace = Math.min(4, Math.max(0.25, speed));
  const force = clamp01(stamp);
  const lineHeight = r2(g.font * 1.3);
  const where = locale ?? HOME[currency.toUpperCase()] ?? "en-US";

  const formatter = React.useMemo(() => {
    try {
      return new Intl.NumberFormat(where, { style: "currency", currency });
    } catch {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      });
    }
  }, [where, currency]);
  const fraction = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const text = format ? format(amount) : formatter.format(amount);
  const slots = React.useMemo(() => template(text, fraction), [text, fraction]);
  const lastDigit = slots.reduce(
    (at, slot, i) => (slot.kind === "digit" ? i : at),
    -1,
  );
  const shape = `${text}|${size}`;

  const [own, setOwn] = React.useState<SettleState>("idle");
  const current = state ?? own;
  const [failure, setFailure] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState("");
  const [geo, setGeo] = React.useState<Geo | null>(null);

  const progress = useMotionValue(current === "success" ? 1 : 0);
  const fold = useMotionValue(current === "success" ? 1 : 0);
  const stampV = useMotionValue(current === "success" ? 1 : 0);
  const draw = useMotionValue(current === "success" ? 1 : 0);
  const stampOut = useMotionValue(1);
  const ink = useMotionValue(0);
  const press = useMotionValue(1);
  const startWord = wordOf(current);
  const payO = useMotionValue(startWord === "pay" ? 1 : 0);
  const payY = useMotionValue(0);
  const payingO = useMotionValue(startWord === "paying" ? 1 : 0);
  const payingY = useMotionValue(0);
  const paidO = useMotionValue(startWord === "paid" ? 1 : 0);
  const paidY = useMotionValue(0);
  const retryO = useMotionValue(startWord === "retry" ? 1 : 0);
  const retryY = useMotionValue(0);
  const words: Record<
    Word,
    { o: MotionValue<number>; y: MotionValue<number> }
  > = {
    pay: { o: payO, y: payY },
    paying: { o: payingO, y: payingY },
    paid: { o: paidO, y: paidY },
    retry: { o: retryO, y: retryY },
  };

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const amountRef = React.useRef<HTMLSpanElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef(new Set<number>());
  const api = React.useRef<Api | null>(null);
  const shown = React.useRef<SettleState>(current);
  const shownShape = React.useRef(shape);
  const shownWord = React.useRef<Word>(startWord);
  const armed = React.useRef(false);
  const runs = React.useRef(0);
  const mounted = React.useRef(false);
  const zeroed = React.useRef(0);

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
  const pan = (x?: number) => {
    const rect = buttonRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + (x ?? rect.width / 2), null) : 0;
  };
  const chirp = (
    tone: "tick" | "chime" | "buzz",
    pitch: number,
    gain: number,
    x?: number,
  ) => {
    if (armed.current) {
      audio.play(tone, { pitch: r2(pitch), gain, pan: pan(x) });
    }
  };

  const move = (next: SettleState, error?: unknown) => {
    if (state === undefined) setOwn(next);
    onStateChange?.(next, error);
  };

  /** The word in one grid cell trades places with the next: no reflow. */
  const swapWord = (to: Word, down = false, delay = 0) => {
    const from = shownWord.current;
    if (to === from) return;
    shownWord.current = to;
    const out = words[from];
    const into = words[to];
    if (!motionSafe) {
      out.y.jump(0);
      into.y.jump(0);
      run(`o-${from}`, animate(out.o, 0, { duration: durations.fast }));
      run(
        `o-${to}`,
        animate(into.o, 1, { duration: durations.fast, delay: delay + 0.06 }),
      );
      return;
    }
    const step = down ? distances.step : -distances.step;
    run(
      `y-${from}`,
      animate(out.y, step, { duration: durations.fast, ease: easings.exit }),
    );
    run(
      `o-${from}`,
      animate(out.o, 0, { duration: durations.fast, ease: easings.exit }),
    );
    into.y.jump(-step);
    // The outgoing word is mostly gone before this one arrives.
    run(
      `y-${to}`,
      animate(into.y, 0, { ...springs.snap, delay: delay + 0.06 }),
    );
    run(
      `o-${to}`,
      animate(into.o, 1, {
        duration: durations.base,
        ease: easings.enter,
        delay: delay + 0.06,
      }),
    );
  };

  /** Where the front waits while the promise is out: at the last digit. */
  const holdAt = () => {
    const last = geo?.slots[lastDigit];
    if (!geo || !last) return 0.86;
    return clamp01((last.x0 - 1) / geo.w);
  };

  const approach = () => {
    // Exponential: quick through the big digits, slow as it closes on the
    // last one, and it never takes that one on its own.
    const target = holdAt();
    const from = progress.get();
    if (from >= target) return () => {};
    const tau = 0.5 / pace;
    const k = 1 - Math.exp(-5);
    const controls = animate(progress, target, {
      duration: 5 * tau * ((target - from) / Math.max(0.01, target)),
      ease: (t: number) => (1 - Math.exp(-5 * t)) / k,
    });
    return () => controls.stop();
  };

  const foldIn = () => {
    if (shown.current !== "success") return;
    swapWord("paid");
    const last = geo?.slots[lastDigit];
    const x = last ? (last.x0 + last.x1) / 2 : undefined;
    stampOut.jump(1);
    if (!motionSafe) {
      // A cross-fade: the figures go, the check comes, nothing moves.
      run("fold", animate(fold, 1, { duration: durations.base }));
      draw.jump(1);
      stampV.jump(0);
      run("stamp", animate(stampV, 1, { duration: durations.slow }));
      chirp("chime", 1.1, 0.5, x);
      return;
    }
    run("fold", animate(fold, 1, { duration: FOLD_TIME, ease: easings.exit }));
    stampV.jump(0);
    draw.jump(0);
    ink.jump(0);
    const at = FOLD_TIME * 0.55;
    run("stamp", animate(stampV, 1, { ...springs.recoil, delay: at }));
    run("draw", animate(draw, 1, { ...springs.flick, delay: at + 0.04 }));
    if (force > 0) {
      run(
        "ink",
        animate(ink, 1, { duration: 0.55, ease: easings.enter, delay: at }),
      );
    }
    later(Math.round(at * 1000), () => chirp("chime", 1.1, 0.5, x));
  };

  /** Back from zero: the characters stand up and the amount rolls up. */
  const rollIn = (delay = 0) => {
    zeroed.current = 0;
    run(
      "progress",
      animate(
        progress,
        0,
        motionSafe
          ? { ...springs.glide, delay }
          : { duration: durations.base, delay },
      ),
    );
  };

  const enter = (to: SettleState, from: SettleState) => {
    // "Paid" waits for the fold; every other word changes with the state.
    if (to !== "success") swapWord(wordOf(to), to === "error");
    switch (to) {
      case "pending":
        zeroed.current = 0;
        setSaid(`${pendingLabel} ${text}.`);
        return;
      case "success": {
        // The front runs through the last digit, then the fold.
        const at = progress.get();
        run(
          "progress",
          animate(progress, 1, {
            duration: Math.max(0.25, ((1 - at) * 1.1) / pace),
            ease: easings.enter,
            onComplete: () => api.current?.foldIn(),
          }),
        );
        setSaid(`${paidLabel} ${text}.`);
        return;
      }
      case "error":
        run(
          "progress",
          animate(
            progress,
            0,
            motionSafe ? springs.glide : { duration: durations.base },
          ),
        );
        chirp("buzz", 1, 0.45);
        setSaid("");
        return;
      case "idle":
        if (from === "success") {
          run(
            "stampOut",
            animate(stampOut, 0, {
              duration: durations.fast,
              ease: easings.exit,
            }),
          );
          run(
            "fold",
            animate(fold, 0, {
              duration: motionSafe ? FOLD_TIME * 0.7 : durations.base,
              ease: easings.enter,
            }),
          );
          rollIn(motionSafe ? 0.3 : 0);
        } else if (progress.get() > 0) {
          rollIn();
        }
        armed.current = false;
        setSaid("");
        return;
    }
  };

  const onProgress = (p: number) => {
    // A tick as each wheel lands on zero, pitched down the row.
    let landed = 0;
    let lastX = 0;
    slots.forEach((slot, i) => {
      if (slot.kind !== "digit") return;
      if (rollOf(geo, i, p) >= 0.98) {
        landed += 1;
        const at = geo?.slots[i];
        if (at) lastX = (at.x0 + at.x1) / 2;
      }
    });
    if (landed > zeroed.current && shown.current !== "error") {
      chirp("tick", semitones(-landed), 0.4, lastX);
    }
    zeroed.current = landed;
  };

  const paid = (ticket: number) => {
    if (ticket !== runs.current || !mounted.current) return;
    move("success");
  };
  const declined = (ticket: number, error: unknown) => {
    if (ticket !== runs.current || !mounted.current) return;
    setFailure(messageOf(error));
    move("error", error);
  };
  const reset = () => move("idle");

  React.useEffect(() => {
    api.current = {
      enter,
      approach,
      foldIn,
      rollIn,
      onProgress,
      paid,
      declined,
      reset,
    };
  });

  React.useEffect(() => {
    const from = shown.current;
    if (from === current) return;
    shown.current = current;
    api.current?.enter(current, from);
  }, [current]);

  // A new amount at rest rolls up from zeros; mid-payment it waits.
  React.useEffect(() => {
    if (shownShape.current === shape) return;
    shownShape.current = shape;
    if (shown.current === "idle") {
      progress.jump(1);
      api.current?.rollIn(fold.get() > 0.01 ? 0.3 : 0);
    }
  }, [shape, progress, fold]);

  React.useEffect(() => {
    if (current !== "pending") return;
    return api.current?.approach();
  }, [current, geo]);

  React.useEffect(
    () => progress.on("change", (p) => api.current?.onProgress(p)),
    [progress],
  );

  // The slots are measured once the button is on the page and whenever the
  // amount or the size changes it: the fill's front is in pixels.
  React.useEffect(() => {
    const button = buttonRef.current;
    const holder = amountRef.current;
    if (!button || !holder) return;
    const measure = () => {
      const base = holder.offsetLeft;
      const next: Geo = {
        w: button.offsetWidth,
        slots: Array.from(
          holder.querySelectorAll<HTMLElement>("[data-slot]"),
        ).map((el) => ({
          x0: r2(base + el.offsetLeft),
          x1: r2(base + el.offsetLeft + el.offsetWidth),
        })),
      };
      setGeo((prev) =>
        prev &&
        prev.w === next.w &&
        prev.slots.length === next.slots.length &&
        prev.slots.every(
          (s, i) => s.x0 === next.slots[i]?.x0 && s.x1 === next.slots[i]?.x1,
        )
          ? prev
          : next,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(button);
    return () => observer.disconnect();
  }, [shape]);

  // Holds count only while the page is visible.
  const hold =
    current === "success" ? successHold : current === "error" ? errorHold : 0;
  React.useEffect(() => {
    if (hold <= 0) return;
    let left = hold + (current === "success" ? 1200 : 0);
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

  const pay = () => {
    armed.current = true;
    const ticket = ++runs.current;
    setFailure(null);
    let result: unknown;
    try {
      result = onPay?.();
    } catch (error) {
      setFailure(messageOf(error));
      move("pending");
      move("error", error);
      return;
    }
    move("pending");
    if (isThenable(result)) {
      result.then(
        () => api.current?.paid(ticket),
        (error: unknown) => api.current?.declined(ticket, error),
      );
    } else {
      move("success");
    }
  };

  const busy = current === "pending" || current === "success";
  const errorText = failure ?? errorLabel;
  const word =
    current === "pending"
      ? pendingLabel
      : current === "success"
        ? paidLabel
        : current === "error"
          ? retryLabel
          : label;
  const spoken =
    current === "error"
      ? `${errorText.replace(/[.!?]+$/, "")}. ${text} not charged. Press to retry.`
      : said;

  const fillClip = useTransform(
    progress,
    (p) => `inset(0 ${r2(100 - clamp01(p) * 100)}% 0 0)`,
  );
  const edgeX = useTransform(progress, (p) =>
    r2(clamp01(p) * (geo?.w ?? 0) - 1),
  );
  const edgeOpacity = useTransform(progress, (p) =>
    p > 0.004 && p < 0.996 ? 0.45 : 0,
  );
  const last = geo?.slots[lastDigit];
  const checkSize = Math.round(g.font * 1.15);
  const stampScale = useTransform(stampV, (v) =>
    motionSafe ? r2(1 + (1 - v) * 0.9 * force) : 1,
  );
  const stampRotate = useTransform(stampV, (v) =>
    motionSafe ? r2((1 - v) * -14 * force) : 0,
  );
  const stampOpacity = useTransform(
    [stampV, stampOut] as MotionValue<number>[],
    ([v = 0, o = 1]: number[]) => r2(clamp01(v * 4) * o),
  );
  const inkScale = useTransform(ink, (k) => r2(0.6 + 1.4 * k));
  const inkOpacity = useTransform(
    [ink, stampOut] as MotionValue<number>[],
    ([k = 0, o = 1]: number[]) =>
      k <= 0 || k >= 1 ? 0 : r2(0.5 * force * (1 - k) * o),
  );

  const face =
    current === "error" ? "oklch(from var(--danger) 0.55 c h)" : accent;
  const wordCell = "col-start-1 row-start-1 whitespace-nowrap";

  return (
    <span
      className={cn(
        "relative inline-flex max-w-full shrink-0 align-middle",
        className,
      )}
    >
      <motion.button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label={`${word} ${text}`}
        aria-disabled={busy || undefined}
        aria-busy={current === "pending" || undefined}
        title={current === "error" ? errorText : undefined}
        onClick={() => {
          if (disabled || busy) return;
          pay();
        }}
        onPointerDown={(event) => {
          if (disabled || busy || !motionSafe) return;
          if (event.pointerType === "mouse" && event.button !== 0) return;
          run("press", animate(press, 0.98, springs.flick));
        }}
        onPointerUp={() => run("press", animate(press, 1, springs.snap))}
        onPointerLeave={() => run("press", animate(press, 1, springs.snap))}
        onPointerCancel={() => run("press", animate(press, 1, springs.snap))}
        className={cn(
          "group/settle-button relative inline-flex max-w-full touch-manipulation items-center justify-between overflow-clip rounded-3 font-medium text-primary-foreground outline-none select-none",
          "transition-[background-color] duration-300",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed opacity-50"
            : busy
              ? "cursor-default"
              : "cursor-pointer",
        )}
        style={{
          height: g.height,
          paddingInline: g.pad,
          gap: g.gap,
          fontSize: g.font,
          lineHeight: `${lineHeight}px`,
          backgroundColor: face,
          scale: press,
        }}
      >
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundColor: fill, clipPath: fillClip }}
        />
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-current"
          style={{ x: edgeX, opacity: edgeOpacity }}
        />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 bg-current opacity-0 transition-opacity",
            !disabled && !busy && "group-hover/settle-button:opacity-[0.08]",
          )}
        />

        <span aria-hidden className="relative grid">
          {[label, pendingLabel, paidLabel, retryLabel].map((w, i) => (
            <span key={i} className={cn(wordCell, "invisible")}>
              {w}
            </span>
          ))}
          {WORDS.map((key) => (
            <motion.span
              key={key}
              className={wordCell}
              style={{ opacity: words[key].o, y: words[key].y }}
            >
              {key === "pay"
                ? label
                : key === "paying"
                  ? pendingLabel
                  : key === "paid"
                    ? paidLabel
                    : retryLabel}
            </motion.span>
          ))}
        </span>

        <span
          ref={amountRef}
          aria-hidden
          className="relative inline-flex items-center font-mono tabular-nums"
        >
          {slots.map((slot, i) =>
            slot.kind === "digit" ? (
              <Wheel
                key={`${shape}-${i}`}
                index={i}
                count={slots.length}
                digit={slot.d}
                ghost={slot.ghost}
                geo={geo}
                progress={progress}
                fold={fold}
                lineHeight={lineHeight}
                motionSafe={motionSafe}
              />
            ) : (
              <Glyph
                key={`${shape}-${i}`}
                index={i}
                count={slots.length}
                ch={slot.ch}
                ghostWith={slot.ghostWith}
                geo={geo}
                progress={progress}
                fold={fold}
                lineHeight={lineHeight}
                motionSafe={motionSafe}
              />
            ),
          )}
        </span>

        {/* The check is stamped where the last digit stood. */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-1/2 flex items-center justify-center"
          style={{
            left: r2((last ? (last.x0 + last.x1) / 2 : 0) - checkSize),
            width: checkSize * 2,
            height: checkSize * 2,
            marginTop: -checkSize,
          }}
        >
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-current"
            style={{ scale: inkScale, opacity: inkOpacity }}
          />
          <motion.svg
            width={checkSize}
            height={checkSize}
            viewBox="0 0 16 16"
            fill="none"
            style={{
              scale: stampScale,
              rotate: stampRotate,
              opacity: stampOpacity,
            }}
          >
            <motion.path
              d="M3 8.6L6.4 12L13 4.6"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pathLength: draw }}
            />
          </motion.svg>
        </motion.span>
      </motion.button>
      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </span>
  );
}
