"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  useVelocity,
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
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type WishTagSize = "sm" | "md" | "lg";

export type WishTagProps = {
  /** Controlled state: true is on the list. */
  pressed?: boolean;
  /** Initial state when uncontrolled; true is on the list. @default false */
  defaultPressed?: boolean;
  /** Fires from the press that changed it, with true for saved. */
  onPressedChange?: (saved: boolean) => void;
  /** The amount the tag prints. @default 129 */
  price?: number;
  /** How the price is printed. @default whole pounds, en-GB */
  format?: (price: number) => string;
  /** Items on the list without this one; the counter shows one more while this is saved. @default 12 */
  count?: number;
  /** Show the list counter. @default true */
  showCount?: boolean;
  /** The word after the counter's number. @default "saved" */
  countLabel?: string;
  /** Text while not saved; also the accessible name then. @default "Save" */
  saveLabel?: string;
  /** Text while saved; also the accessible name then. @default "On your list" */
  savedLabel?: string;
  /** Icon only: a round button whose accessible name is still the label, with the counter beside it. @default false */
  compact?: boolean;
  /** How loosely the tag swings, 0 to 1: stiff and soon still, or long, lazy swings. @default 0.5 */
  swing?: number;
  /** From the eyelet to the tag's hole, in px. @default 12 */
  stringLength?: number;
  /** Button height 32, 40 or 48 px, with the tag scaled to match. @default "md" */
  size?: WishTagSize;
  /** The tag's paper. Any CSS colour. @default a manila pigment from --warn at a fixed lightness */
  tagColor?: string;
  /** The saved tint, the tick and the counter's bump. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Paper as the tag swings home, pop as the counter bumps, a snip as it is cut. Off unless asked for. @default false */
  sound?: boolean;
  /** @default false */
  disabled?: boolean;
  className?: string;
};

const PAPER = "oklch(from var(--warn) 0.92 0.05 h)";
const INK = "oklch(from var(--warn) 0.3 0.04 h)";

const defaultFormat = (n: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
  }).format(n);

const SIZES: Record<
  WishTagSize,
  {
    k: number;
    box: string;
    square: string;
    icon: number;
    /** A row as tall as the button, for the counter beside a compact one. */
    row: string;
    /** The eyelet, in from the button's bottom-right corner. */
    right: number;
    bottom: number;
  }
> = {
  sm: {
    k: 0.85,
    box: "h-8 gap-1.5 pl-2.5 pr-7 text-xs",
    square: "size-8",
    icon: 14,
    row: "h-8",
    right: 11,
    bottom: 6,
  },
  md: {
    k: 1,
    box: "h-10 gap-2 pl-3 pr-8 text-sm",
    square: "size-10",
    icon: 16,
    row: "h-10",
    right: 13,
    bottom: 7,
  },
  lg: {
    k: 1.15,
    box: "h-12 gap-2.5 pl-3.5 pr-9 text-[15px]",
    square: "size-12",
    icon: 18,
    row: "h-12",
    right: 15,
    bottom: 8,
  },
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

type Intent = { to: boolean; until: number; pan: number };

/**
 * A save-to-list toggle that hangs a price tag on the button. Saving swings
 * a paper tag in from above the frame on a string threaded through its hole:
 * a real pendulum about the button's eyelet, its damping and period set by
 * `swing` (the house recoil in the middle of the range), and the tag hinged
 * at its hole so it dangles a beat behind the string. The label becomes
 * "On your list", the counter rolls up one and bumps on recoil as the tag
 * first comes taut. Removing snips the string: the stub curls back into the
 * eyelet and the tag drops out of the frame on an ease-in fall, and the
 * counter rolls down without a bump. Hovering nudges a hanging tag.
 *
 * It is a `<button>` with `aria-pressed` (pressed is saved); Space and Enter
 * toggle it, and a polite live region says what changed and the new count.
 * The tag is drawn inside the component's own box and clipped by it. Under
 * reduced motion the tag fades in hanging still and fades out, and the
 * counter cross-fades.
 */
export function WishTag({
  pressed,
  defaultPressed = false,
  onPressedChange,
  price = 129,
  format = defaultFormat,
  count = 12,
  showCount = true,
  countLabel = "saved",
  saveLabel = "Save",
  savedLabel = "On your list",
  compact = false,
  swing = 0.5,
  stringLength = 12,
  size = "md",
  tagColor = PAPER,
  accent = "var(--accent-bright)",
  sound = false,
  disabled = false,
  className,
}: WishTagProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const s = SIZES[size] ?? SIZES.md;
  const loose = clamp01(swing);

  const [own, setOwn] = React.useState(defaultPressed);
  const saved = pressed ?? own;
  const label = saved ? savedLabel : saveLabel;
  const base = Math.max(0, Math.round(count));
  const total = base + (saved ? 1 : 0);

  // What the live region says is frozen in the render that flips the state,
  // and only for a change the visitor asked for and the host accepted.
  const [asked, setAsked] = React.useState<boolean | null>(null);
  const [heard, setHeard] = React.useState({ saved, words: "" });
  if (heard.saved !== saved) {
    const tally = showCount ? `, ${total} ${countLabel}` : "";
    setHeard({
      saved,
      words:
        asked === saved
          ? `${saved ? "Added to your list" : "Removed from your list"}${tally}`
          : heard.words,
    });
    if (asked !== null) setAsked(null);
  }
  // The counter rolls the way the number went.
  const [roll, setRoll] = React.useState({ total, dir: 1 });
  if (roll.total !== total)
    setRoll({ total, dir: total > roll.total ? 1 : -1 });

  // The tag, in px: its width follows the printed price, so a long price
  // gets a long tag, and the same text always makes the same tag.
  const text = format(price);
  const k = s.k;
  const L = Math.max(4, stringLength);
  const tw = r2(Math.max(30, text.length * 6.6 + 14) * k);
  const th = r2(26 * k);
  const chamfer = r2(5 * k);
  const holeY = r2(L + 4.6 * k);
  const holeR = r2(1.7 * k);
  const cutY = r2(L * 0.5);
  const half = r2(tw / 2);
  const boxW = r2(tw + 8);
  const boxH = r2(L + th + 4);
  /** How far below the button the hanging tag reaches. */
  const hang = Math.ceil(L + th + 4 - s.bottom);
  /** How far right of the button the hanging tag reaches. */
  const reach = Math.max(0, Math.ceil(half + 3 - s.right));
  const front = { x: r2(0.9 * k), y: r2(holeY - holeR * 0.8) };
  const back = { x: r2(-0.9 * k), y: r2(holeY + holeR * 0.8) };
  const fallBy = Math.ceil(boxH + hang + 24);

  const stiffness = lerp(520, 200, loose);
  const ratio = lerp(0.72, 0.3, loose);
  const startAngle = r2(lerp(-120, -165, loose));

  const angle = useMotionValue(0);
  const presence = useMotionValue(saved ? 1 : 0);
  const detached = useMotionValue(0);
  const frozen = useMotionValue(0);
  const spin = useMotionValue(0);
  const fallY = useMotionValue(0);
  const stub = useMotionValue(1);
  const snip = useMotionValue(0);
  const bump = useMotionValue(1);
  const mark = useMotionValue(saved ? 1 : 0);

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const timers = React.useRef<number[]>([]);
  const intent = React.useRef<Intent | null>(null);
  const shown = React.useRef(saved);

  const halt = React.useCallback(() => {
    for (const a of running.current) a.stop();
    running.current = [];
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);
  const run = (...controls: AnimationPlaybackControls[]) => {
    running.current.push(...controls);
  };
  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, Math.max(0, Math.round(ms))));
  };

  const pendulum = () => spring(stiffness, ratio);

  /** Hangs the tag, or cuts it down. */
  const perform = (toSaved: boolean, pan: number | null) => {
    halt();
    if (!motionSafe) {
      angle.jump(0);
      detached.jump(0);
      fallY.jump(0);
      spin.jump(0);
      stub.jump(1);
      mark.jump(toSaved ? 1 : 0);
      run(
        animate(presence, toSaved ? 1 : 0, {
          duration: durations.base,
          ease: easings.enter,
        }),
      );
      if (!toSaved) {
        run(animate(snip, [0, 1, 0], { duration: durations.slow }));
      }
      if (pan !== null) {
        audio.play("paper", {
          pitch: toSaved ? 1 : 1.5,
          gain: toSaved ? 0.5 : 0.3,
          pan,
        });
      }
      return;
    }
    run(animate(mark, toSaved ? 1 : 0, springs.snap));
    if (toSaved) {
      detached.jump(0);
      fallY.jump(0);
      spin.jump(0);
      stub.jump(1);
      presence.jump(1);
      angle.jump(startAngle);
      run(animate(angle, 0, pendulum()));
      // The tag first comes taut where the swing crosses the bottom: a
      // quarter of the damped period, less the phase the damping takes.
      const omega = Math.sqrt(stiffness);
      const lean = Math.sqrt(1 - ratio * ratio);
      const taut = (Math.PI - Math.atan2(lean, ratio)) / (omega * lean);
      later(taut * 1000, () => {
        run(animate(bump, 1, { ...springs.recoil, velocity: 3.2 }));
        if (pan === null) return;
        audio.play("paper", { pitch: 1, gain: 0.5, pan });
        later(40, () => audio.play("pop", { pitch: 1.1, gain: 0.45, pan }));
      });
      return;
    }
    // Snipped halfway: what is above the cut stays on the eyelet and swings
    // back to rest; what is below falls in the page's frame, not the swing's.
    const a = angle.get();
    const v = angle.getVelocity();
    frozen.jump(a);
    detached.jump(1);
    run(
      animate(angle, 0, springs.snap),
      animate(stub, 0, { duration: 0.22, ease: easings.enter }),
      animate(snip, [0, 1, 0], { duration: 0.3, ease: "easeOut" }),
      animate(spin, (v >= 0 ? 1 : -1) * lerp(8, 18, loose), {
        duration: 0.42,
        ease: easings.exit,
      }),
      animate(fallY, fallBy, {
        duration: 0.42,
        ease: easings.exit,
        onComplete: () => {
          presence.jump(0);
          detached.jump(0);
          fallY.jump(0);
          spin.jump(0);
        },
      }),
    );
    if (pan !== null) audio.play("paper", { pitch: 1.6, gain: 0.32, pan });
  };

  // Every change of state — a press or the host — runs the same tag; only a
  // change the visitor asked for is heard.
  React.useEffect(() => {
    if (shown.current === saved) return;
    shown.current = saved;
    const it = intent.current;
    const audible = !!it && it.to === saved && performance.now() < it.until;
    if (audible) intent.current = null;
    perform(saved, audible && it ? it.pan : null);
    // Runs on a change of state only; perform reads the latest props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  React.useEffect(() => halt, [halt]);

  const press = (at: number, clientX: number | null) => {
    if (disabled) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    const x = clientX ?? (rect ? rect.left + rect.width / 2 : 0);
    const pan = panFrom(x, null);
    const next = !saved;
    // The event's own timestamp is on the same clock as performance.now().
    intent.current = { to: next, until: at + 1500, pan };
    setAsked(next);
    if (pressed === undefined) setOwn(next);
    onPressedChange?.(next);
  };

  const nudge = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== "mouse" || disabled || !motionSafe) return;
    if (!shown.current || detached.get() > 0.5) return;
    const rect = event.currentTarget.getBoundingClientRect();
    // Pushed away from the side the hand came in from.
    const fromLeft = event.clientX < rect.left + rect.width / 2;
    const push = lerp(70, 240, loose) * (fromLeft ? -1 : 1);
    run(animate(angle, 0, { ...pendulum(), velocity: push }));
  };

  // The tag hangs from its hole, so it lags the string: the faster the
  // swing, the further it trails.
  const velocity = useVelocity(angle);
  const dangle = useTransform(velocity, (v) =>
    r2(Math.max(-14, Math.min(14, -v * 0.018 * (0.6 + loose)))),
  );
  const fallen = useTransform(
    [angle, detached, frozen, spin] as MotionValue<number>[],
    ([a = 0, d = 0, f = 0, sp = 0]: number[]) => r2(d > 0.5 ? f + sp : a),
  );
  const stubPath = useTransform(stub, (t) => {
    const f = 0.5 * clamp01(t);
    if (f < 0.01) return "";
    return `M 0 0 L ${r2(front.x * f)} ${r2(front.y * f)} M 0 0 L ${r2(back.x * f)} ${r2(back.y * f)}`;
  });
  const snipScale = useTransform(snip, (t) => r2(0.6 + 0.6 * t));
  const check = useTransform(mark, (m) => {
    const t = clamp01(m);
    const p = (a: number, b: number) => r2(lerp(a, b, t));
    return `M ${p(3, 3.4)} ${p(8, 8.4)} L ${p(13, 6.4)} ${p(8, 11.4)} M ${p(8, 6.4)} ${p(3, 11.4)} L ${p(8, 12.6)} ${p(13, 4.4)}`;
  });

  const tagOutline = [
    `M ${r2(-half + chamfer)} ${L}`,
    `L ${r2(half - chamfer)} ${L}`,
    `L ${half} ${r2(L + chamfer)}`,
    `L ${half} ${r2(L + th - 2)}`,
    `Q ${half} ${r2(L + th)} ${r2(half - 2)} ${r2(L + th)}`,
    `L ${r2(-half + 2)} ${r2(L + th)}`,
    `Q ${-half} ${r2(L + th)} ${-half} ${r2(L + th - 2)}`,
    `L ${-half} ${r2(L + chamfer)}`,
    "Z",
    `M ${-holeR} ${holeY} A ${holeR} ${holeR} 0 1 0 ${holeR} ${holeY} A ${holeR} ${holeR} 0 1 0 ${-holeR} ${holeY} Z`,
  ].join(" ");
  const viewBox = `${r2(-boxW / 2)} 0 ${boxW} ${boxH}`;

  const counter = showCount ? (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
      <motion.span
        aria-hidden
        className="grid h-5 min-w-5 place-items-center overflow-clip rounded-full bg-surface-2 px-1.5 font-mono text-[11px] text-foreground tabular-nums"
        style={{ scale: bump }}
      >
        <AnimatePresence initial={false} custom={roll.dir}>
          <motion.span
            key={roll.total}
            custom={roll.dir}
            className="col-start-1 row-start-1"
            variants={{
              enter: (dir: number) => ({
                opacity: 0,
                y: motionSafe ? dir * distances.step : 0,
              }),
              rest: { opacity: 1, y: 0 },
              leave: (dir: number) => ({
                opacity: 0,
                y: motionSafe ? -dir * distances.step : 0,
              }),
            }}
            initial="enter"
            animate="rest"
            exit="leave"
            transition={
              motionSafe
                ? {
                    y: springs.snap,
                    opacity: { duration: durations.fast, ease: easings.enter },
                  }
                : { duration: durations.fast }
            }
          >
            {roll.total}
          </motion.span>
        </AnimatePresence>
      </motion.span>
      <span aria-hidden>{countLabel}</span>
      <span className="sr-only">{`${total} ${countLabel}`}</span>
    </span>
  ) : null;

  return (
    <div
      className={cn(
        "relative inline-flex overflow-clip p-1",
        compact ? "flex-row items-start gap-2" : "flex-col items-start",
        className,
      )}
      style={{
        paddingRight: 4 + reach,
        paddingBottom: compact ? 4 + hang : 4,
      }}
    >
      <span className="relative inline-flex">
        <motion.button
          ref={buttonRef}
          type="button"
          aria-pressed={saved}
          aria-label={compact ? label : undefined}
          disabled={disabled}
          onClick={(event) => {
            // Space, Enter and assistive technology arrive with no pointer
            // behind them; they pan from the button's middle.
            press(event.timeStamp, event.detail === 0 ? null : event.clientX);
          }}
          onPointerEnter={nudge}
          whileTap={motionSafe && !disabled ? { scale: 0.97 } : undefined}
          transition={springs.flick}
          className={cn(
            "relative inline-flex shrink-0 items-center justify-center rounded-full border font-medium whitespace-nowrap transition-colors outline-none select-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
            compact ? s.square : s.box,
            saved
              ? "text-foreground"
              : "border-hairline-strong bg-surface-1 text-ink-2 enabled:hover:bg-surface-2 enabled:hover:text-foreground",
          )}
          style={
            saved
              ? {
                  borderColor: `color-mix(in oklab, ${accent} 45%, transparent)`,
                  backgroundColor: `color-mix(in oklab, ${accent} 12%, transparent)`,
                }
              : undefined
          }
        >
          <svg
            aria-hidden
            width={s.icon}
            height={s.icon}
            viewBox="0 0 16 16"
            className="block shrink-0"
          >
            <motion.path
              d={check}
              fill="none"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ stroke: saved ? accent : "currentColor" }}
            />
          </svg>
          {compact ? null : (
            <span className="grid text-left">
              {[false, true].map((state) => {
                const active = state === saved;
                return (
                  <motion.span
                    key={String(state)}
                    aria-hidden={active ? undefined : true}
                    className="col-start-1 row-start-1"
                    initial={false}
                    animate={
                      active
                        ? {
                            opacity: 1,
                            y: motionSafe ? [distances.nudge, 0] : 0,
                          }
                        : {
                            opacity: 0,
                            y: motionSafe ? -distances.nudge : 0,
                          }
                    }
                    transition={
                      active
                        ? {
                            opacity: {
                              duration: durations.fast,
                              delay: 0.03,
                              ease: easings.enter,
                            },
                            y: springs.snap,
                          }
                        : exitFor(durations.blink)
                    }
                  >
                    {state ? savedLabel : saveLabel}
                  </motion.span>
                );
              })}
            </span>
          )}
        </motion.button>

        {/* The eyelet and everything that hangs from it. */}
        <span
          aria-hidden
          className="pointer-events-none absolute size-0"
          style={{ right: s.right, bottom: s.bottom }}
        >
          <svg
            width={8}
            height={8}
            viewBox="-4 -4 8 8"
            className="absolute -top-1 -left-1 block overflow-visible"
          >
            <circle
              r={r2(2.3 * k)}
              strokeWidth={1}
              className="fill-background stroke-ink-3"
            />
          </svg>
          <motion.span
            className="absolute top-0 block"
            style={{
              left: -boxW / 2,
              width: boxW,
              height: boxH,
              rotate: angle,
              originX: 0.5,
              originY: 0,
              opacity: presence,
            }}
          >
            <svg
              width={boxW}
              height={boxH}
              viewBox={viewBox}
              className="block overflow-visible"
            >
              <motion.path
                d={stubPath}
                fill="none"
                strokeWidth={0.9}
                strokeLinecap="round"
                className="stroke-ink-2"
              />
              <circle r={r2(1.3 * k)} className="fill-ink-2" />
              <motion.path
                d={`M -2 ${r2(cutY - 2)} L 2 ${r2(cutY + 2)} M 2 ${r2(cutY - 2)} L -2 ${r2(cutY + 2)}`}
                fill="none"
                strokeWidth={1}
                strokeLinecap="round"
                className="stroke-foreground"
                style={{
                  opacity: snip,
                  scale: snipScale,
                  originX: 0.5,
                  originY: 0.5,
                }}
              />
            </svg>
          </motion.span>
          <motion.span
            className="absolute top-0 block"
            style={{ left: -boxW / 2, y: fallY, opacity: presence }}
          >
            <motion.span
              className="block"
              style={{
                width: boxW,
                height: boxH,
                rotate: fallen,
                originX: 0.5,
                originY: 0,
              }}
            >
              <svg
                width={boxW}
                height={boxH}
                viewBox={viewBox}
                className="block overflow-visible"
              >
                <path
                  d={`M ${r2(back.x * 0.5)} ${r2(back.y * 0.5)} L ${back.x} ${back.y}`}
                  fill="none"
                  strokeWidth={0.9}
                  strokeLinecap="round"
                  className="stroke-ink-2"
                />
                <motion.g
                  style={{
                    rotate: dangle,
                    originX: 0.5,
                    originY: r2((holeY - L) / th),
                  }}
                >
                  <path
                    d={tagOutline}
                    fillRule="evenodd"
                    strokeWidth={0.8}
                    style={{
                      fill: tagColor,
                      stroke: `color-mix(in oklab, ${tagColor} 70%, black)`,
                    }}
                  />
                  <text
                    x={0}
                    y={r2(L + (chamfer + th) / 2 + 3.8 * k)}
                    textAnchor="middle"
                    className="font-mono"
                    style={{ fill: INK, fontSize: r2(10.5 * k) }}
                  >
                    {text}
                  </text>
                </motion.g>
                <path
                  d={`M ${r2(front.x * 0.5)} ${r2(front.y * 0.5)} L ${front.x} ${front.y}`}
                  fill="none"
                  strokeWidth={0.9}
                  strokeLinecap="round"
                  className="stroke-ink-2"
                />
              </svg>
            </motion.span>
          </motion.span>
        </span>
      </span>

      {compact ? (
        counter ? (
          <span className={cn("flex items-center", s.row)}>{counter}</span>
        ) : null
      ) : (
        // The strip the tag hangs into; the counter shares it, so it is
        // never empty room held for a state.
        <span className="flex items-start pt-1.5" style={{ height: hang }}>
          {counter}
        </span>
      )}
      <span aria-live="polite" aria-atomic className="sr-only">
        {heard.words}
      </span>
    </div>
  );
}
