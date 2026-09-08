"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SwapAsset = {
  /** Ticker. Also the card's identity, so a flip moves the card it belongs to. */
  symbol: string;
  /** Full name, printed beside the ticker. */
  name: string;
  /** Wallet balance held in this asset. */
  balance: number;
};

export type SwapPairProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The pair in its base order: index 0 pays while `inverted` is false. */
  assets: [SwapAsset, SwapAsset];
  /** Units of `assets[1]` per one of `assets[0]`. Inverted when the pair flips. */
  rate: number;
  /** Controlled pay amount, always denominated in the paying asset. */
  amount?: number;
  /** Initial pay amount for uncontrolled usage. @default 0 */
  defaultAmount?: number;
  /** Fires from the keystroke, the Max press, or the flip that rebased it. */
  onAmountChange?: (amount: number) => void;
  /** Controlled direction; true pays `assets[1]`. */
  inverted?: boolean;
  /** Initial direction for uncontrolled usage. @default false */
  defaultInverted?: boolean;
  /** Fires from the flip press. */
  onInvertedChange?: (inverted: boolean) => void;
  /** Formats every figure the card prints. */
  format?: (value: number, symbol: string) => string;
  /** Share of the receive figure quoted as the network fee. @default 0.003 */
  feeRate?: number;
  /** Visible heading. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/** Explicit locales keep the server's string and the client's identical. */
const grouped = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fine = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

/**
 * Large sums read in cents; a rate under a thousand keeps the digits that
 * actually move, which for a pair rate is the fourth and the sixth.
 */
const defaultFormat = (value: number) =>
  (Math.abs(value) >= 1000 ? grouped : fine).format(value);

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * A figure whose digits roll to their new value on `snap` — one crisp
 * overshoot, the same physics as any other indicator changing position. The
 * column is ten faces tall, so a `y` of one tenth of its height is one digit.
 *
 * It is hidden from assistive technology: the card prints the same figures in
 * plain text and speaks them in one sentence, and a screen reader should never
 * have to wade through ten faces per column.
 */
function RollingFigure({
  value,
  motionSafe,
  className,
}: {
  value: string;
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex items-center tabular-nums", className)}
    >
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when the
        // figure gains or loses a digit, and only the new column mounts.
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

/** Plain, lossless text for the editable field — never a grouped string. */
const plain = (value: number) => String(Number(value.toFixed(6)));

/** Keeps a decimal field usable: one dot, digits, nothing else. */
const sanitize = (raw: string) => {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot < 0) return cleaned;
  return (
    cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "")
  ).slice(0, 20);
};

/** Milliseconds of quiet before the live region reads the settled figures. */
const SETTLE_MS = 600;

const CHIP_TONES = [
  "bg-cobalt-wash text-cobalt-bright",
  "bg-surface-0 text-ink-2",
] as const;

/**
 * Two fields, one direction, and a control that reverses it. Pressing the flip
 * turns its arrow a half turn on `snap` while the two asset cards trade places
 * as a FLIP with `layout` on `glide` — a layout shift glides, and the same two
 * cards must travel rather than blink out of one slot and into the other. The
 * amounts travel with their cards, so what you were about to receive becomes
 * what you now pay, and the rate inverts and rolls its digits on `snap`.
 *
 * The pay field is a real decimal input and the receive field is an `<output>`
 * bound to it, so the second figure reads as the result rather than as a
 * second thing to fill in. Over balance the card turns danger and says so in
 * words, and still computes the receive figure — refusing to show it would hide
 * the reason. Under reduced motion the cards swap slots instantly and the
 * arrow's glyph turns over without rotating, because which way the trade runs
 * is the information, not the travel.
 */
export function SwapPair({
  ref,
  assets,
  rate,
  amount,
  defaultAmount = 0,
  onAmountChange,
  inverted,
  defaultInverted = false,
  onInvertedChange,
  format = defaultFormat,
  feeRate = 0.003,
  label,
  className,
  "aria-label": ariaLabel,
}: SwapPairProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const payId = `${baseId}-pay`;
  const receiveId = `${baseId}-receive`;
  const noteId = `${baseId}-note`;

  const [uncontrolledAmount, setUncontrolledAmount] =
    React.useState(defaultAmount);
  const amountControlled = amount !== undefined;
  const payAmount = amountControlled ? amount : uncontrolledAmount;

  const [uncontrolledInverted, setUncontrolledInverted] =
    React.useState(defaultInverted);
  const invertedControlled = inverted !== undefined;
  const isInverted = invertedControlled ? inverted : uncontrolledInverted;

  const payAsset = assets[isInverted ? 1 : 0];
  const receiveAsset = assets[isInverted ? 0 : 1];
  // A rate of zero would make the pair unreadable in one direction, so the
  // card falls back to 1 rather than printing an infinity at the viewer.
  const baseRate = rate > 0 ? rate : 1;
  const activeRate = isInverted ? 1 / baseRate : baseRate;

  const gross = payAmount * activeRate;
  const fee = gross * Math.max(0, feeRate);
  const overBalance = payAmount > payAsset.balance;

  // The field keeps its own text so a half-typed "1." survives the keystroke,
  // and re-seeds itself whenever the committed amount arrives from elsewhere —
  // a flip, a Max press, or a controlling parent.
  const [draft, setDraft] = React.useState(() => ({
    text: plain(payAmount),
    value: payAmount,
  }));
  if (draft.value !== payAmount) {
    setDraft({ text: plain(payAmount), value: payAmount });
  }

  const commitAmount = (next: number) => {
    if (!amountControlled) setUncontrolledAmount(next);
    onAmountChange?.(next);
  };

  const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const text = sanitize(event.target.value);
    const parsed = Number(text);
    const next = text === "" || Number.isNaN(parsed) ? 0 : parsed;
    setDraft({ text, value: next });
    if (next !== payAmount) commitAmount(next);
  };

  const flip = () => {
    const next = !isInverted;
    if (!invertedControlled) setUncontrolledInverted(next);
    // The numbers follow the pair: what you were about to receive is what you
    // now pay, so a second flip lands back on the figure you started with.
    commitAmount(Number(gross.toFixed(6)));
    onInvertedChange?.(next);
  };

  const rateText = format(activeRate, receiveAsset.symbol);
  const sentence = `Paying ${format(payAmount, payAsset.symbol)} ${payAsset.symbol}, receiving ${format(gross, receiveAsset.symbol)} ${receiveAsset.symbol}. One ${payAsset.symbol} is ${rateText} ${receiveAsset.symbol}.`;

  // A live region that spoke every keystroke would babble, so the announcement
  // waits for the field to go quiet and then reads the settled pair.
  const [announced, setAnnounced] = React.useState("");
  React.useEffect(() => {
    const timer = window.setTimeout(() => setAnnounced(sentence), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [sentence]);

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const rows = [
    { asset: payAsset, paying: true },
    { asset: receiveAsset, paying: false },
  ];

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : ariaLabel}
      className={cn("flex w-full flex-col gap-3", className)}
    >
      {label ? (
        <span id={labelId} className="text-sm font-semibold text-foreground">
          {label}
        </span>
      ) : null}

      <div className="relative flex flex-col gap-1.5">
        {rows.map(({ asset, paying }) => {
          const tone = CHIP_TONES[assets.indexOf(asset) === 0 ? 0 : 1];
          return (
            <motion.div
              key={asset.symbol}
              layout={motionSafe}
              transition={springs.glide}
              className={cn(
                "flex flex-col gap-2 rounded-3 border p-3 transition-colors",
                paying && overBalance
                  ? "border-danger/50 bg-surface-1"
                  : "border-hairline bg-surface-1",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor={paying ? payId : receiveId}
                  className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                >
                  {paying ? "You pay" : "You receive"}
                </label>
                <span className="flex items-center gap-1.5">
                  {/* Both readings share one grid cell so the danger note
                      replaces the balance without changing the row's height. */}
                  <span className="grid">
                    <motion.span
                      aria-hidden={paying && overBalance}
                      className="col-start-1 row-start-1 text-right font-mono text-[11px] text-ink-3 tabular-nums"
                      animate={{ opacity: paying && overBalance ? 0 : 1 }}
                      transition={fade}
                    >
                      {format(asset.balance, asset.symbol)}
                    </motion.span>
                    <motion.span
                      id={paying ? noteId : undefined}
                      aria-hidden={!(paying && overBalance)}
                      className="col-start-1 row-start-1 text-right font-mono text-[11px] font-medium text-danger"
                      animate={{ opacity: paying && overBalance ? 1 : 0 }}
                      transition={fade}
                    >
                      Over balance
                    </motion.span>
                  </span>
                  {paying ? (
                    <button
                      type="button"
                      onClick={() => commitAmount(asset.balance)}
                      aria-label={`Pay maximum, ${format(asset.balance, asset.symbol)} ${asset.symbol}`}
                      className="flex h-5 items-center rounded-1 px-1 font-mono text-[10px] font-medium tracking-[0.08em] text-cobalt-bright uppercase transition-colors outline-none hover:bg-cobalt-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      Max
                    </button>
                  ) : (
                    <span aria-hidden className="h-5 w-px" />
                  )}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {paying ? (
                  <input
                    id={payId}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    spellCheck={false}
                    value={draft.text}
                    onChange={handleInput}
                    aria-invalid={overBalance || undefined}
                    aria-describedby={overBalance ? noteId : undefined}
                    className="h-8 min-w-0 flex-1 rounded-1 bg-transparent font-mono text-lg text-foreground tabular-nums outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  />
                ) : (
                  <output
                    id={receiveId}
                    htmlFor={payId}
                    className="flex h-8 min-w-0 flex-1 items-center overflow-hidden font-mono text-lg text-ink-2"
                  >
                    <RollingFigure
                      value={format(gross, asset.symbol)}
                      motionSafe={motionSafe}
                    />
                    <span className="sr-only">
                      {format(gross, asset.symbol)} {asset.symbol}
                    </span>
                  </output>
                )}

                <span className="flex h-8 shrink-0 items-center gap-2 rounded-full border border-hairline bg-surface-2 py-1 pr-3 pl-1">
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full font-mono text-[10px] font-semibold",
                      tone,
                    )}
                  >
                    {asset.symbol.slice(0, 2)}
                  </span>
                  <span className="text-[13px] font-medium text-foreground">
                    {asset.symbol}
                  </span>
                </span>
              </div>
            </motion.div>
          );
        })}

        {/* The control sits on the seam by centring over the whole stack, so it
            never depends on a hard-coded offset that a wider card would break. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <button
            type="button"
            onClick={flip}
            aria-label={`Pay ${receiveAsset.name}, receive ${payAsset.name}`}
            className="pointer-events-auto flex size-8 items-center justify-center rounded-full border border-hairline-strong bg-surface-0 text-ink-2 shadow-raised transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-cobalt-wash"
          >
            <motion.span
              aria-hidden
              className="flex size-4 items-center justify-center"
              initial={false}
              animate={{ rotate: isInverted ? 180 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4 shrink-0"
              >
                <path d="M8 3v10M4.5 9.5 8 13l3.5-3.5" />
              </svg>
            </motion.span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border pt-2.5 font-mono text-[11px] text-ink-3">
        <span className="flex min-w-0 items-center gap-1">
          <span>1 {payAsset.symbol} =</span>
          <RollingFigure
            value={rateText}
            motionSafe={motionSafe}
            className="text-foreground"
          />
          <span>{receiveAsset.symbol}</span>
        </span>
        <span className="tabular-nums">
          Network fee {format(fee, receiveAsset.symbol)} {receiveAsset.symbol}
        </span>
      </div>

      <span role="status" className="sr-only">
        {announced}
      </span>
    </div>
  );
}
