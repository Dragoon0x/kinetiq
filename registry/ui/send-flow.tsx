"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SendRecipient = {
  id: string;
  name: string;
  /** Shown under the name and spoken with it. */
  handle: string;
  /** Any CSS colour — pass a theme token so both themes read. */
  tint: string;
};

export type SendStep = "who" | "amount" | "review" | "sent";

export type SendFlowProps = {
  ref?: React.Ref<HTMLElement>;
  /** Who can be paid. Faces are drawn from initials — no images. */
  recipients: SendRecipient[];
  /** Controlled step. */
  step?: SendStep;
  /** Initial step for uncontrolled usage. @default "who" */
  defaultStep?: SendStep;
  onStepChange?: (step: SendStep) => void;
  /** Controlled payee id; `""` means nothing is chosen. */
  recipientId?: string;
  /** Initial payee id for uncontrolled usage. */
  defaultRecipientId?: string;
  onRecipientChange?: (id: string) => void;
  /** Controlled amount in major units. */
  amount?: number;
  /** Initial amount for uncontrolled usage. @default 0 */
  defaultAmount?: number;
  onAmountChange?: (amount: number) => void;
  /** Quick amounts offered under the field. @default [20, 50, 100] */
  presets?: number[];
  /** Ceiling for the amount; over it the flow refuses to go on. */
  balance?: number;
  /** Money formatter — the flow never invents a currency. */
  format?: (value: number) => string;
  /** Fires from the confirm press, once the figure has landed. */
  onSend?: (payment: { recipientId: string; amount: number }) => void;
  /** Names the card for assistive technology. @default "Send money" */
  label?: string;
  className?: string;
};

const ORDER: SendStep[] = ["who", "amount", "review"];

/**
 * Slack inside the clipped panel box. The height animation needs
 * `overflow-hidden`, and without this a focus ring at `outline-offset-2` on a
 * full-width control would be sliced off by the clip; the matching negative
 * margin keeps the panel's own edges flush with the card's.
 */
const PANEL_PAD = 4;

const STEP_NAMES: Record<SendStep, string> = {
  who: "Payee",
  amount: "Amount",
  review: "Review",
  sent: "Sent",
};

/** Explicit locale: the server and the first client render must agree. */
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const defaultFormat = (value: number) => MONEY.format(value);

/** Two initials at most; a one-word name keeps one. */
const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "?";

/** Digits and at most one point, at most two of them past it. */
const sanitize = (raw: string) => {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const [whole = "", ...rest] = cleaned.split(".");
  if (rest.length === 0) return whole.slice(0, 9);
  return `${whole.slice(0, 9)}.${rest.join("").slice(0, 2)}`;
};

function Face({ person, size }: { person: SendRecipient; size: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
        size,
      )}
      style={{
        color: person.tint,
        // Opaque, so the disc reads as a disc on any surface beneath it.
        backgroundColor: `color-mix(in oklab, ${person.tint} 20%, var(--card))`,
      }}
    >
      {initialsOf(person.name)}
    </span>
  );
}

function Check({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-4 shrink-0", className)}
    >
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>
  );
}

/** The payee step: a radio group with a roving tabindex over its own rows. */
function PayeeList({
  recipients,
  chosenId,
  onChoose,
}: {
  recipients: SendRecipient[];
  chosenId: string;
  onChoose: (id: string) => void;
}) {
  const rowRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const hasChoice = recipients.some((person) => person.id === chosenId);

  const focusRow = (next: number) => {
    const clamped = Math.min(recipients.length - 1, Math.max(0, next));
    rowRefs.current[clamped]?.focus();
    const person = recipients[clamped];
    if (person) onChoose(person.id);
  };

  const handleKeyDown = (event: React.KeyboardEvent, row: number) => {
    const moves: Record<string, number> = {
      ArrowDown: row + 1,
      ArrowRight: row + 1,
      ArrowUp: row - 1,
      ArrowLeft: row - 1,
      Home: 0,
      End: recipients.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    focusRow(target);
  };

  return (
    <div role="radiogroup" aria-label="Payee" className="flex flex-col gap-1">
      {recipients.map((person, row) => {
        const active = person.id === chosenId;
        return (
          <button
            key={person.id}
            ref={(node) => {
              rowRefs.current[row] = node;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active || (!hasChoice && row === 0) ? 0 : -1}
            onClick={() => onChoose(person.id)}
            onKeyDown={(event) => handleKeyDown(event, row)}
            className={cn(
              "flex h-11 items-center gap-2.5 rounded-2 border px-2 text-left transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active
                ? "border-cobalt-bright bg-cobalt-wash"
                : "border-transparent hover:bg-accent",
            )}
          >
            <Face person={person} size="size-7" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm leading-tight font-medium">
                {person.name}
              </span>
              <span className="truncate font-mono text-[10px] leading-tight text-ink-3">
                {person.handle}
              </span>
            </span>
            <motion.span
              aria-hidden
              className="shrink-0 text-cobalt-bright"
              initial={false}
              animate={{ opacity: active ? 1 : 0 }}
              transition={{ duration: durations.fast }}
            >
              <Check />
            </motion.span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Three steps for one payment. Panels cross-slide by direction — out to
 * `distances.shift` on the exit ease, in from the other side on `glide`, ζ0.98,
 * one settle and no bounce, because a panel is a surface moving rather than a
 * switch flipping — and the card's height is measured by a ResizeObserver on the
 * live panel and animated to that exact number, so no step is padded out to the
 * tallest one.
 *
 * The review step is where the physics carries the meaning. The amount figure
 * lands on `recoil`: a motion value runs 0 to 1, the figure's scale and opacity
 * are transforms of it, and the confirm button is inert until that animation's
 * `onComplete` arms it. You cannot press send before the figure you are sending
 * has stopped moving.
 *
 * Recipients are a radio group with a roving tabindex — arrows step without
 * wrapping, Home and End jump, Space chooses — the amount is a real numeric
 * input, and a refused Next keeps its place and says why rather than vanishing.
 * Under reduced motion panels cross-fade, the figure fades, and the button arms
 * on the tween instead: the rule survives without a bouncing number.
 */
export function SendFlow({
  ref,
  recipients,
  step,
  defaultStep = "who",
  onStepChange,
  recipientId,
  defaultRecipientId = "",
  onRecipientChange,
  amount,
  defaultAmount = 0,
  onAmountChange,
  presets = [20, 50, 100],
  balance,
  format = defaultFormat,
  onSend,
  label = "Send money",
  className,
}: SendFlowProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const hintId = `${baseId}-hint`;
  const reasonId = `${baseId}-reason`;

  const [ownStep, setOwnStep] = React.useState<SendStep>(defaultStep);
  const currentStep = step ?? ownStep;
  const [ownRecipient, setOwnRecipient] =
    React.useState<string>(defaultRecipientId);
  const chosenId = recipientId ?? ownRecipient;
  const [ownAmount, setOwnAmount] = React.useState<number>(defaultAmount);
  const value = amount ?? ownAmount;

  const [direction, setDirection] = React.useState(1);
  const [armed, setArmed] = React.useState(false);

  // The landing that arms the confirm button. Reduced motion runs the same
  // sequence on a tween, so the rule holds without a figure that bounces.
  const land = useMotionValue(0);
  const landScale = useTransform(land, [0, 1], [0.94, 1]);

  // The typed text is its own state so "50." survives a keystroke, and it is
  // re-seeded during render whenever the committed value moves underneath it.
  const [entry, setEntry] = React.useState(() => ({
    text: defaultAmount > 0 ? String(defaultAmount) : "",
    from: defaultAmount,
  }));
  if (entry.from !== value) {
    setEntry({ text: value > 0 ? String(value) : "", from: value });
  }

  const chosen = recipients.find((person) => person.id === chosenId) ?? null;
  const index = ORDER.indexOf(currentStep);
  const overBalance = balance !== undefined && value > balance;

  const blockedReason =
    currentStep === "who" && !chosen
      ? "Choose a payee first"
      : currentStep === "amount" && value <= 0
        ? "Enter an amount"
        : currentStep === "amount" && overBalance
          ? "That is more than the balance"
          : null;

  // Direction is decided by the handler that moved the step and kept in state,
  // never derived during render — the panels must know which way they travelled.
  const goTo = (next: SendStep) => {
    const rank = (name: SendStep) =>
      name === "sent" ? ORDER.length : ORDER.indexOf(name);
    setDirection(rank(next) >= rank(currentStep) ? 1 : -1);
    setArmed(false);
    // Wound back here rather than in the effect: an effect runs after paint,
    // which would show the figure already landed for a frame on a second visit.
    land.set(0);
    if (step === undefined) setOwnStep(next);
    onStepChange?.(next);
  };

  const setAmount = (next: number, text: string) => {
    setEntry({ text, from: next });
    if (amount === undefined) setOwnAmount(next);
    onAmountChange?.(next);
  };

  const choose = (id: string) => {
    if (recipientId === undefined) setOwnRecipient(id);
    onRecipientChange?.(id);
  };

  // Height comes from the panel's own measurement, taken in the observer's
  // callback — the effect body never sets state, and nothing reserves a row.
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);

  React.useEffect(() => {
    const node = panelRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const last = entries[entries.length - 1];
      if (!last) return;
      setHeight(
        last.borderBoxSize?.[0]?.blockSize ?? last.contentRect.height ?? null,
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (currentStep !== "review") return;
    land.set(0);
    const controls = animate(land, 1, {
      ...(motionSafe
        ? springs.recoil
        : { duration: durations.base, ease: easings.enter }),
      onComplete: () => setArmed(true),
    });
    return () => controls.stop();
  }, [currentStep, motionSafe, land]);

  const panelTransition = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };
  const slide = motionSafe ? distances.shift : 0;

  const summary =
    currentStep === "sent"
      ? `Sent ${format(value)}${chosen ? ` to ${chosen.name}` : ""}`
      : `Step ${index + 1} of ${ORDER.length}, ${STEP_NAMES[currentStep]}`;

  const primary =
    currentStep === "sent"
      ? { text: "Start another", act: () => goTo("who") }
      : currentStep === "review"
        ? {
            text: `Send ${format(value)}`,
            act: () => {
              if (!armed || !chosen) return;
              goTo("sent");
              onSend?.({ recipientId: chosen.id, amount: value });
            },
          }
        : {
            text: "Next",
            act: () => {
              if (blockedReason) return;
              goTo(currentStep === "who" ? "amount" : "review");
            },
          };

  const primaryBlocked =
    currentStep === "review" ? !armed : Boolean(blockedReason);

  return (
    <section
      ref={ref}
      aria-labelledby={labelId}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <h3 id={labelId} className="truncate text-sm font-medium">
          {label}
        </h3>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {currentStep === "sent"
            ? "Sent"
            : `${index + 1} / ${ORDER.length} ${STEP_NAMES[currentStep]}`}
        </span>
      </header>

      <div aria-hidden className="flex items-center gap-1">
        {ORDER.map((name, segment) => (
          <span
            key={name}
            className="h-1 flex-1 overflow-hidden rounded-full bg-hairline-strong"
          >
            <motion.span
              className="block h-full origin-left rounded-full bg-cobalt-bright"
              initial={false}
              animate={{
                scaleX: currentStep === "sent" || segment <= index ? 1 : 0,
              }}
              transition={
                motionSafe
                  ? springs.snap
                  : { duration: durations.fast, ease: easings.enter }
              }
            />
          </span>
        ))}
      </div>

      <p role="status" className="sr-only">
        {summary}
      </p>
      {/* The reason a refused control is refused, spoken rather than drawn, so
          the button can keep its place instead of disappearing. */}
      <span id={reasonId} className="sr-only">
        {currentStep === "review" && !armed
          ? "Waiting for the amount to settle"
          : (blockedReason ?? "")}
      </span>

      <motion.div
        className="-m-1 overflow-hidden p-1"
        initial={false}
        animate={{ height: height === null ? "auto" : height + PANEL_PAD * 2 }}
        transition={panelTransition}
      >
        <div ref={panelRef} className="relative">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: slide * direction }}
              animate={{ opacity: 1, x: 0 }}
              exit={{
                opacity: 0,
                x: -slide * direction,
                transition: exitFor(),
              }}
              transition={panelTransition}
              className="flex flex-col gap-2"
            >
              {currentStep === "who" ? (
                <PayeeList
                  recipients={recipients}
                  chosenId={chosenId}
                  onChoose={choose}
                />
              ) : null}

              {currentStep === "amount" ? (
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor={`${baseId}-amount`}
                    className="text-xs font-medium text-ink-2"
                  >
                    Amount{chosen ? ` for ${chosen.name}` : ""}
                  </label>
                  <input
                    id={`${baseId}-amount`}
                    value={entry.text}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    aria-describedby={hintId}
                    onChange={(event) => {
                      const text = sanitize(event.target.value);
                      const parsed = Number.parseFloat(text);
                      setAmount(Number.isFinite(parsed) ? parsed : 0, text);
                    }}
                    className={cn(
                      "h-11 w-full rounded-2 border border-input bg-surface-0 px-3 font-mono text-lg tabular-nums transition-colors outline-none",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      overBalance && "border-danger text-danger",
                    )}
                  />
                  <div className="flex items-center gap-1.5">
                    {presets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        aria-pressed={value === preset}
                        onClick={() => setAmount(preset, String(preset))}
                        className={cn(
                          "flex h-8 flex-1 items-center justify-center rounded-2 border border-hairline font-mono text-xs tabular-nums transition-colors outline-none",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                          value === preset
                            ? "border-cobalt-bright bg-cobalt-wash text-foreground"
                            : "text-ink-2 hover:bg-accent",
                        )}
                      >
                        {format(preset)}
                      </button>
                    ))}
                  </div>
                  <p
                    id={hintId}
                    className={cn(
                      "font-mono text-[10px] tracking-[0.08em] uppercase",
                      overBalance ? "text-danger" : "text-ink-3",
                    )}
                  >
                    {blockedReason ??
                      (balance !== undefined
                        ? `Balance ${format(balance)}`
                        : "Ready to review")}
                  </p>
                </div>
              ) : null}

              {currentStep === "review" ? (
                <div className="flex flex-col gap-3 py-1">
                  <div className="flex items-center gap-2.5">
                    {chosen ? <Face person={chosen} size="size-8" /> : null}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                        To
                      </span>
                      <span className="truncate text-sm leading-tight font-medium">
                        {chosen ? chosen.name : "No payee"}
                      </span>
                    </span>
                  </div>
                  <motion.p
                    className="font-mono text-3xl leading-none font-semibold tabular-nums"
                    style={
                      motionSafe
                        ? { opacity: land, scale: landScale }
                        : { opacity: land }
                    }
                  >
                    {format(value)}
                  </motion.p>
                </div>
              ) : null}

              {currentStep === "sent" ? (
                <div className="flex items-center gap-2.5 py-1">
                  <motion.span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
                    initial={motionSafe ? { scale: 0.6 } : { opacity: 0 }}
                    animate={motionSafe ? { scale: 1 } : { opacity: 1 }}
                    transition={
                      motionSafe ? springs.recoil : { duration: durations.fast }
                    }
                  >
                    <Check />
                  </motion.span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-mono text-lg leading-tight font-semibold tabular-nums">
                      {format(value)}
                    </span>
                    <span className="truncate text-xs leading-tight text-ink-3">
                      {chosen ? `Sent to ${chosen.name}` : "Sent"}
                    </span>
                  </span>
                </div>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      <div className="flex items-center gap-2">
        {currentStep !== "who" && currentStep !== "sent" ? (
          <button
            type="button"
            onClick={() => goTo(currentStep === "review" ? "amount" : "who")}
            className={cn(
              "flex h-9 items-center rounded-2 border border-hairline-strong px-3 text-sm font-medium transition-colors outline-none hover:bg-accent",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            Back
          </button>
        ) : null}
        <motion.button
          type="button"
          aria-disabled={primaryBlocked || undefined}
          aria-describedby={primaryBlocked ? reasonId : undefined}
          onClick={primary.act}
          initial={false}
          animate={{
            opacity: primaryBlocked ? 0.45 : 1,
            scale: motionSafe && primaryBlocked ? 0.98 : 1,
          }}
          transition={motionSafe ? springs.flick : { duration: durations.fast }}
          className={cn(
            "flex h-9 flex-1 items-center justify-center rounded-2 bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            primaryBlocked ? "cursor-not-allowed" : "hover:bg-primary/90",
          )}
        >
          <span className="truncate">{primary.text}</span>
        </motion.button>
      </div>
    </section>
  );
}
