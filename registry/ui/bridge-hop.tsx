"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BridgeStage = {
  id: string;
  label: string;
  /** One short line under the rail when the stage is read. */
  detail?: string;
  /** Printed truncated beside the detail. */
  hash?: string;
};

export type BridgeChain = {
  name: string;
  /** Short ticker under the chain's name. */
  ticker: string;
};

export type BridgeHopProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The hop's nodes, source to destination. @default locked / attested / relayed / minted */
  stages?: BridgeStage[];
  /** How many stages have completed; `stages.length` means arrived. @default 0 */
  stage?: number;
  from: BridgeChain;
  to: BridgeChain;
  /** The sum crossing. */
  amount: number;
  /** Formats the amount and the destination balance. */
  format?: (value: number) => string;
  /** Ticker printed after each amount. @default "BSN" */
  asset?: string;
  /** The destination's balance; it rolls up when the transfer arrives. */
  destinationBalance?: number;
  /** Stops the token on the stage in flight and marks it failed. @default false */
  failed?: boolean;
  /** Visible caption. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  /** Fires from the hover or focus that changed the read-out. */
  onStageFocus?: (id: string) => void;
  /** Fires once, from the effect that sees the last stage complete. */
  onArrive?: () => void;
  className?: string;
  "aria-label"?: string;
};

const MONEY = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number): string => MONEY.format(value);

const DEFAULT_STAGES: BridgeStage[] = [
  { id: "locked", label: "Locked", detail: "Held on the source chain" },
  { id: "attested", label: "Attested", detail: "Signed by the guard set" },
  { id: "relayed", label: "Relayed", detail: "Carried to the destination" },
  { id: "minted", label: "Minted", detail: "Issued to the recipient" },
];

/**
 * The token is 24px and the rail is padded by half of that, so the puck can sit
 * centred on either end of the hop without a pixel past the edge.
 */
const PUCK = 24;

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const shorten = (hash: string): string =>
  hash.length > 13 ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : hash;

/** Digits roll to their new value on `snap`; keyed from the right so the units
 *  column keeps its identity when the balance gains a digit. */
function RollDigits({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        const key = value.length - index;
        if (digit < 0) {
          return (
            <span key={key} className="inline-block">
              {char}
            </span>
          );
        }
        return (
          <span
            key={key}
            className="relative inline-block h-[1.2em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.2em] items-center justify-center"
                >
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * One chain to another, in steps. Two chain cards sit over a hop whose rail
 * carries a node per stage, and a single token puck crosses it: each completed
 * stage slides the puck to the next node on `glide`, because a bridge transfer
 * is a position changing rather than a switch flipping. The rail itself never
 * fills — the only thing that travels is the token.
 *
 * The rail's width is measured with a ResizeObserver and the puck moves by `x`
 * in pixels off that measurement, so the travel is a transform and the puck can
 * never overhang its rail at any width. While a stage is in flight the puck
 * breathes on `drift` between exactly two keyframes, and it stops the moment
 * the transfer settles, fails, or the tab goes to the background. Arrival is
 * the one place that celebrates: the puck lands on `recoil` and the destination
 * balance rolls up at the same beat.
 *
 * The stages are an ordered list of real buttons with a roving tabindex — Left
 * and Right step, Home and End jump — and focus is the keyboard equal of hover,
 * writing the same read-out under the rail. Under reduced motion the puck does
 * not travel or breathe; it takes its position outright, the checks appear
 * already drawn, and nothing bounces.
 */
export function BridgeHop({
  ref,
  stages = DEFAULT_STAGES,
  stage = 0,
  from,
  to,
  amount,
  format = defaultFormat,
  asset = "BSN",
  destinationBalance,
  failed = false,
  label,
  onStageFocus,
  onArrive,
  className,
  "aria-label": ariaLabel,
}: BridgeHopProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const count = Math.max(1, stages.length);
  const done = Math.max(0, Math.min(count, Math.round(stage)));
  const arrived = done >= count;
  const flightIndex = arrived ? -1 : done;

  const [rail, attachRail] = React.useState<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState(0);

  React.useEffect(() => {
    if (!rail || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setWidth(rail.clientWidth));
    observer.observe(rail);
    return () => observer.disconnect();
  }, [rail]);

  // Resting places along the rail: the source edge before anything completes,
  // each node's centre as its stage lands, and the far edge on arrival — so the
  // last hop is the one that carries the token onto the destination.
  const fraction = done <= 0 ? 0 : arrived ? 1 : (done - 0.5) / count;

  // The token's x is seeded through a motion value rather than animated from a
  // measurement: the first ResizeObserver reading would otherwise read as a
  // stage change and slide the token across the rail on load. A resize places
  // it; only a real change of stage animates.
  const puckX = useMotionValue(0);
  const placed = React.useRef({ fraction: -1, width: 0 });

  React.useEffect(() => {
    if (width <= 0) return;
    const target = fraction * width - PUCK / 2;
    const previous = placed.current;
    placed.current = { fraction, width };
    if (previous.width > 0 && previous.fraction !== fraction) {
      const controls = animate(
        puckX,
        target,
        motionSafe
          ? arrived
            ? springs.recoil
            : springs.glide
          : { duration: 0 },
      );
      return () => controls.stop();
    }
    puckX.set(target);
  }, [fraction, width, puckX, motionSafe, arrived]);

  const arrivedRef = React.useRef(arrived);
  const onArriveRef = React.useRef(onArrive);
  React.useEffect(() => {
    onArriveRef.current = onArrive;
  });
  // Stages land as a prop, so this effect is the only observer of the arrival.
  // It writes no state — it reports what it saw.
  React.useEffect(() => {
    if (arrivedRef.current === arrived) return;
    arrivedRef.current = arrived;
    if (arrived) onArriveRef.current?.();
  }, [arrived]);

  const [read, setRead] = React.useState<number | null>(null);
  const buttons = React.useRef<(HTMLButtonElement | null)[]>([]);
  const readIndex = read ?? Math.min(done, count - 1);
  const activeStage = stages[readIndex];

  const focusStage = (index: number) => {
    const clamped = Math.min(count - 1, Math.max(0, index));
    const next = stages[clamped];
    if (!next) return;
    setRead(clamped);
    buttons.current[clamped]?.focus();
    onStageFocus?.(next.id);
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusStage(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusStage(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusStage(0);
        break;
      case "End":
        event.preventDefault();
        focusStage(count - 1);
        break;
      default:
        break;
    }
  };

  const breathing = motionSafe && visible && !arrived && !failed && done > 0;

  const stageWord = arrived
    ? "arrived"
    : failed
      ? "failed"
      : done === 0
        ? "waiting"
        : (stages[done - 1]?.label.toLowerCase() ?? "moving");

  const detail = activeStage
    ? [
        activeStage.label,
        activeStage.detail,
        activeStage.hash && shorten(activeStage.hash),
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : ariaLabel}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {label ? (
          <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
            {label}
          </span>
        ) : null}
        <span className="shrink-0 rounded-full border border-hairline px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {done}/{count}
        </span>
      </div>

      <div className="flex items-stretch gap-2">
        <div className="min-w-0 flex-1 rounded-2 border border-hairline-strong bg-surface-2 p-2">
          <span className="block truncate text-[11px] font-medium">
            {from.name}
          </span>
          <span className="block font-mono text-[10px] text-ink-3">
            {from.ticker}
          </span>
          <span className="mt-1 block font-mono text-xs text-ink-2 tabular-nums">
            −{format(amount)}
          </span>
        </div>

        <svg
          viewBox="0 0 16 16"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4 shrink-0 self-center text-ink-3"
        >
          <path d="M2.5 8h11M9.5 4l4 4-4 4" />
        </svg>

        <div
          className={cn(
            "min-w-0 flex-1 rounded-2 border p-2 transition-colors",
            arrived
              ? "border-success/50 bg-surface-2"
              : "border-hairline-strong bg-surface-2",
          )}
        >
          <span className="block truncate text-[11px] font-medium">
            {to.name}
          </span>
          <span className="block font-mono text-[10px] text-ink-3">
            {to.ticker}
          </span>
          <span
            className={cn(
              "mt-1 flex font-mono text-xs font-medium tabular-nums transition-colors",
              arrived ? "text-success" : "text-foreground",
            )}
          >
            {destinationBalance === undefined ? (
              <span className="text-ink-3">—</span>
            ) : (
              <RollDigits
                value={format(destinationBalance)}
                motionSafe={motionSafe}
              />
            )}
          </span>
        </div>
      </div>

      <div>
        {/* The rail is inset by half a puck, so the token can rest centred on
            either end without a pixel past the container. */}
        <div ref={attachRail} className="relative mx-3 h-7">
          <span
            aria-hidden
            className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-hairline-strong"
          />

          <ol
            role="list"
            aria-label="Bridge stages"
            className="absolute inset-0 flex items-center"
          >
            {stages.map((item, index) => {
              const isDone = index < done;
              const isFlight = index === flightIndex;
              const isFailed = failed && isFlight;
              const state = isDone
                ? "done"
                : isFailed
                  ? "failed"
                  : isFlight
                    ? "in progress"
                    : "waiting";
              return (
                <li
                  key={item.id}
                  className="flex flex-1 justify-center"
                  aria-current={isFlight && !failed ? "step" : undefined}
                >
                  <button
                    ref={(node) => {
                      buttons.current[index] = node;
                    }}
                    type="button"
                    tabIndex={index === readIndex ? 0 : -1}
                    aria-label={`${item.label}, ${state}`}
                    onFocus={() => {
                      setRead(index);
                      onStageFocus?.(item.id);
                    }}
                    onBlur={() => setRead(null)}
                    onPointerEnter={() => {
                      setRead(index);
                      onStageFocus?.(item.id);
                    }}
                    onPointerLeave={() => setRead(null)}
                    onKeyDown={(event) => handleKeyDown(event, index)}
                    className={cn(
                      "relative z-10 grid size-5 shrink-0 cursor-pointer place-items-center rounded-full border-2 bg-surface-1 transition-colors outline-none",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      isFailed
                        ? "border-danger"
                        : isDone
                          ? "border-cobalt-bright bg-cobalt-bright"
                          : isFlight
                            ? "border-cobalt-bright"
                            : "border-hairline-strong",
                    )}
                  >
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-3 text-primary-foreground"
                    >
                      {/* The tick draws on `flick` — the acknowledgement that
                          this stage is behind the token, not ahead of it. */}
                      <motion.path
                        d="M3.6 8.4 6.4 11.2 12.4 4.8"
                        pathLength={1}
                        initial={false}
                        animate={{ pathLength: isDone ? 1 : 0 }}
                        transition={
                          motionSafe ? springs.flick : { duration: 0 }
                        }
                      />
                    </svg>
                    {isFailed ? (
                      <span
                        aria-hidden
                        className="absolute size-1.5 rounded-full bg-danger"
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ol>

          <motion.span
            aria-hidden
            className={cn(
              "absolute top-1/2 left-0 z-20 grid size-6 -translate-y-1/2 place-items-center rounded-full border-2 border-surface-1 font-mono text-[9px] font-medium transition-colors",
              failed
                ? "bg-danger text-destructive-foreground"
                : arrived
                  ? "bg-success text-primary-foreground"
                  : "bg-cobalt-bright text-primary-foreground",
            )}
            style={{ x: puckX }}
            initial={false}
            animate={{ scale: breathing ? [1, 1.12] : 1 }}
            transition={
              breathing
                ? { ...springs.drift, repeat: Infinity, repeatType: "reverse" }
                : { duration: durations.fast, ease: easings.enter }
            }
          >
            {asset.slice(0, 1)}
          </motion.span>
        </div>

        <div className="mx-3 mt-1 flex">
          {stages.map((item, index) => (
            <span
              key={item.id}
              title={item.label}
              className={cn(
                "min-w-0 flex-1 truncate px-0.5 text-center text-[10px] transition-colors",
                index === readIndex ? "text-foreground" : "text-ink-3",
              )}
            >
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <p
        aria-live="polite"
        className="flex min-w-0 border-t border-hairline pt-3 font-mono text-[11px] text-ink-3"
      >
        <span className="truncate">{detail}</span>
      </p>

      <span
        role="progressbar"
        aria-label={`Bridge from ${from.name} to ${to.name}`}
        aria-valuemin={0}
        aria-valuemax={count}
        aria-valuenow={done}
        aria-valuetext={`${done} of ${count} stages, ${stageWord}`}
        className="sr-only"
      />

      <span role="status" className="sr-only">
        {failed
          ? `Transfer stopped on ${stages[flightIndex]?.label ?? "the hop"}.`
          : arrived
            ? `Arrived on ${to.name}.`
            : ""}
      </span>
    </div>
  );
}
