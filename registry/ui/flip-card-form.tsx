"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CardFormValue = {
  /** Digits only, up to 16. */
  number: string;
  name: string;
  /** Digits only, MMYY. */
  expiry: string;
  /** Digits only, 3 or 4. */
  cvc: string;
};

export type FlipCardFormProps = {
  /** Controlled values. */
  value?: CardFormValue;
  /** Initial values for uncontrolled usage. */
  defaultValue?: CardFormValue;
  onValueChange?: (value: CardFormValue) => void;
  /** Fires on submit with the current values. */
  onSubmit?: (value: CardFormValue) => void;
  /** Fires when the preview turns over, so a page can narrate the side. */
  onSideChange?: (side: "front" | "back") => void;
  /** Submit button copy. @default "Save card" */
  submitLabel?: string;
  className?: string;
};

const EMPTY: CardFormValue = { number: "", name: "", expiry: "", cvc: "" };

const digits = (raw: string, max: number): string =>
  raw.replace(/\D/g, "").slice(0, max);

const clean = (raw: CardFormValue): CardFormValue => ({
  number: digits(raw.number, 16),
  name: raw.name.replace(/\s+/g, " ").slice(0, 26),
  expiry: digits(raw.expiry, 4),
  cvc: digits(raw.cvc, 4),
});

const groupNumber = (value: string): string =>
  (value.match(/.{1,4}/g) ?? []).join(" ");

const showExpiry = (value: string): string =>
  value.length > 2 ? `${value.slice(0, 2)}/${value.slice(2)}` : value;

/**
 * Invented networks — the mark is drawn, never fetched, so the preview carries
 * no assets and no other company's identity.
 */
const BRANDS: { id: string; prefix: RegExp }[] = [
  { id: "waylight", prefix: /^4/ },
  { id: "fieldline", prefix: /^5[1-5]/ },
  { id: "gaugeworks", prefix: /^3[47]/ },
  { id: "coldbrook", prefix: /^6/ },
];

const STROKE = {
  stroke: "currentColor",
  strokeWidth: 2.5,
  strokeLinecap: "round",
  fill: "none",
} as const;

const MARKS: Record<string, React.ReactNode> = {
  waylight: (
    <>
      <circle cx="10" cy="8" r="6" fill="currentColor" fillOpacity="0.9" />
      <circle cx="18" cy="8" r="6" fill="currentColor" fillOpacity="0.45" />
    </>
  ),
  fieldline: <path d="M5 4.5h18M5 8h11M5 11.5h6" {...STROKE} />,
  gaugeworks: (
    <>
      <path d="M19 3.6a6 6 0 1 0 0 8.8" {...STROKE} />
      <circle cx="14" cy="8" r="1.8" fill="currentColor" />
    </>
  ),
  coldbrook: <path d="M9 3l-4 10M15 3l-4 10M21 3l-4 10" {...STROKE} />,
  blank: <path d="M5 4.5h18v7H5z" {...STROKE} strokeWidth={2} />,
};

function BrandMark({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 28 16" aria-hidden className="h-4 w-7">
      {MARKS[id] ?? MARKS.blank}
    </svg>
  );
}

/** The contact plate, drawn from tokens so it reads in both themes. */
function ChipMark() {
  return (
    <svg viewBox="0 0 28 20" aria-hidden className="h-5 w-7">
      <path
        d="M4 1h20a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V4a3 3 0 0 1 3-3z"
        fill="color-mix(in oklab, var(--warn) 62%, transparent)"
      />
      <path
        d="M10 1v18M18 1v18M1 7h26M1 13h26"
        stroke="color-mix(in oklab, var(--bg-0) 45%, transparent)"
        strokeWidth="1.25"
      />
    </svg>
  );
}

const LABEL = "mb-1.5 block text-xs font-medium text-ink-2";
const INPUT =
  "h-9 w-full min-w-0 rounded-2 border border-input bg-surface-1 px-3 text-sm text-foreground outline-none placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const FACE_LABEL =
  "font-mono text-[9px] tracking-[0.14em] text-ink-3 uppercase";
const FACE =
  "absolute inset-0 flex flex-col justify-between overflow-hidden rounded-3 border border-hairline-strong text-ink";

/** Procedural card art: a cobalt corner light, a signal glow, a brushed body. */
const FRONT_ART = [
  "radial-gradient(120% 120% at 8% 4%, color-mix(in oklab, var(--accent-bright) 42%, transparent), transparent 62%)",
  "radial-gradient(90% 90% at 96% 100%, color-mix(in oklab, var(--signal) 22%, transparent), transparent 68%)",
  "linear-gradient(146deg, var(--bg-2), var(--bg-1))",
].join(", ");
const BACK_ART = "linear-gradient(146deg, var(--bg-2), var(--bg-1))";
const MAG_BAND = "color-mix(in oklab, var(--ink) 82%, transparent)";
const PANEL = "color-mix(in oklab, var(--ink) 12%, var(--bg-0))";
const FADE = { duration: durations.base, ease: easings.enter };
const SWAP = { duration: durations.fast, ease: easings.enter };

/**
 * A card form whose preview is the feedback. Typing writes straight onto the
 * face; focusing the security code turns the whole card over on `snap` — one
 * crisp overshoot, the way a card actually flips in the hand — and blurring
 * turns it home. The rotation is a real `rotateY` with both faces carrying
 * `backfaceVisibility: "hidden"` inline: a utility class for that is easy to
 * assume and easy to miss, and without it the two faces print through each
 * other and the flip reads as a flat smear.
 *
 * The brand mark cross-fades as the number's prefix resolves — a tween, since
 * nothing is travelling — and the number groups itself into fours as it lands.
 *
 * The inputs are real, carry `cc-number`, `cc-name`, `cc-exp` and `cc-csc`, so
 * a password manager fills them, and the whole preview is `aria-hidden`: it
 * repeats what the fields already say, and a live region narrates the side.
 * Under reduced motion the card swaps faces instead of turning.
 */
export function FlipCardForm({
  value,
  defaultValue,
  onValueChange,
  onSubmit,
  onSideChange,
  submitLabel = "Save card",
  className,
}: FlipCardFormProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const ids = {
    number: `${uid}-number`,
    name: `${uid}-name`,
    expiry: `${uid}-expiry`,
    cvc: `${uid}-cvc`,
  };

  const [uncontrolled, setUncontrolled] = React.useState<CardFormValue>(() =>
    clean(defaultValue ?? EMPTY),
  );
  const isControlled = value !== undefined;
  const current = isControlled ? clean(value) : uncontrolled;

  const [flipped, setFlipped] = React.useState(false);

  const markId =
    BRANDS.find((brand) => brand.prefix.test(current.number))?.id ?? "blank";

  const patch = (next: Partial<CardFormValue>) => {
    const merged = clean({ ...current, ...next });
    if (!isControlled) setUncontrolled(merged);
    onValueChange?.(merged);
  };

  const flip = (next: boolean) => {
    if (next === flipped) return;
    setFlipped(next);
    onSideChange?.(next ? "back" : "front");
  };

  /**
   * Backspacing a separator would re-format straight back and trap the caret,
   * so when a deletion leaves the digits intact, take the digit that separator
   * was standing in front of. The DOM value is put back by hand because a
   * rejected keystroke never changes state, and nothing would re-render.
   */
  const handleGrouped = (
    event: React.ChangeEvent<HTMLInputElement>,
    key: "number" | "expiry",
    max: number,
    show: (raw: string) => string,
  ) => {
    const node = event.currentTarget;
    const typed = node.value;
    const shown = show(current[key]);
    let next = digits(typed, max);
    if (typed.length < shown.length && next === current[key]) {
      next = next.slice(0, -1);
    }
    const nextShown = show(next);
    if (node.value !== nextShown) {
      node.value = nextShown;
      node.setSelectionRange(nextShown.length, nextShown.length);
    }
    if (next === current[key]) return;
    patch(key === "number" ? { number: next } : { expiry: next });
  };

  const faceNumber = groupNumber(current.number.padEnd(16, "•"));

  return (
    <div className={cn("flex w-full flex-col gap-4", className)}>
      {/* The preview repeats the fields, so it is hidden from assistive tech;
          the live region below carries the one thing the fields do not say. */}
      <div
        aria-hidden
        className="relative w-full"
        style={{ perspective: 1000, aspectRatio: "1.9" }}
      >
        <motion.div
          initial={false}
          animate={{ rotateY: motionSafe && flipped ? 180 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
          className="absolute inset-0"
          style={{ transformStyle: "preserve-3d" }}
        >
          <motion.div
            initial={false}
            animate={{ opacity: motionSafe || !flipped ? 1 : 0 }}
            transition={SWAP}
            className={cn(FACE, "p-4")}
            style={{ backfaceVisibility: "hidden", backgroundImage: FRONT_ART }}
          >
            <div className="flex items-start justify-between gap-3">
              <ChipMark />
              <span className="relative block h-4 w-7 text-ink">
                <AnimatePresence initial={false}>
                  <motion.span
                    key={markId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={FADE}
                    className="absolute inset-0"
                  >
                    <BrandMark id={markId} />
                  </motion.span>
                </AnimatePresence>
              </span>
            </div>

            <p className="truncate font-mono text-sm tracking-[0.02em] text-ink tabular-nums">
              {faceNumber}
            </p>

            <div className="flex items-end justify-between gap-3">
              <span className="min-w-0">
                <span className={cn(FACE_LABEL, "block")}>Cardholder</span>
                <span className="block truncate text-xs font-medium text-ink uppercase">
                  {current.name || "Your name"}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className={cn(FACE_LABEL, "block")}>Expires</span>
                <span className="block font-mono text-xs text-ink tabular-nums">
                  {showExpiry(current.expiry.padEnd(4, "•"))}
                </span>
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={false}
            animate={{ opacity: motionSafe || flipped ? 1 : 0 }}
            transition={SWAP}
            className={cn(FACE, "py-4")}
            style={{
              backfaceVisibility: "hidden",
              // The back face carries its own half-turn, so its content reads
              // the right way round once the parent has turned.
              transform: motionSafe ? "rotateY(180deg)" : undefined,
              backgroundImage: BACK_ART,
            }}
          >
            <div className="h-8 w-full" style={{ background: MAG_BAND }} />
            <div className="flex items-center gap-2 px-4">
              <span
                className="h-7 flex-1 rounded-1"
                style={{ background: PANEL }}
              />
              <span className="flex h-7 w-14 shrink-0 items-center justify-center rounded-1 bg-surface-0 font-mono text-xs text-ink tabular-nums">
                {current.cvc.padEnd(3, "•")}
              </span>
            </div>
            <span className={cn(FACE_LABEL, "px-4")}>
              Security code · back of card
            </span>
          </motion.div>
        </motion.div>
      </div>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit?.(current);
        }}
        className="flex flex-col gap-3"
      >
        <div>
          <label htmlFor={ids.number} className={LABEL}>
            Card number
          </label>
          <input
            id={ids.number}
            name="cardnumber"
            type="text"
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="0000 0000 0000 0000"
            value={groupNumber(current.number)}
            onChange={(event) =>
              handleGrouped(event, "number", 16, groupNumber)
            }
            className={cn(INPUT, "font-mono tabular-nums")}
          />
        </div>

        <div>
          <label htmlFor={ids.name} className={LABEL}>
            Name on card
          </label>
          <input
            id={ids.name}
            name="ccname"
            type="text"
            autoComplete="cc-name"
            placeholder="As printed"
            value={current.name}
            onChange={(event) => patch({ name: event.currentTarget.value })}
            className={INPUT}
          />
        </div>

        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor={ids.expiry} className={LABEL}>
              Expiry
            </label>
            <input
              id={ids.expiry}
              name="ccmonth"
              type="text"
              inputMode="numeric"
              autoComplete="cc-exp"
              placeholder="MM/YY"
              value={showExpiry(current.expiry)}
              onChange={(event) =>
                handleGrouped(event, "expiry", 4, showExpiry)
              }
              className={cn(INPUT, "font-mono tabular-nums")}
            />
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor={ids.cvc} className={LABEL}>
              Security code
            </label>
            <input
              id={ids.cvc}
              name="cvc"
              type="text"
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder="123"
              value={current.cvc}
              onChange={(event) =>
                patch({ cvc: digits(event.currentTarget.value, 4) })
              }
              onFocus={() => flip(true)}
              onBlur={() => flip(false)}
              className={cn(INPUT, "font-mono tabular-nums")}
            />
          </div>
        </div>

        <button
          type="submit"
          className="mt-1 inline-flex h-9 w-full items-center justify-center rounded-2 bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {submitLabel}
        </button>
      </form>

      <span role="status" className="sr-only">
        {flipped
          ? "Showing the back of the card"
          : "Showing the front of the card"}
      </span>
    </div>
  );
}
