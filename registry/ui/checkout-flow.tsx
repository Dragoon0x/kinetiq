"use client";

import * as React from "react";

import {
  ChevronDown,
  ChevronLeft,
  LoaderCircle,
  Lock,
  Pencil,
  RotateCcw,
  ShoppingBag,
  TriangleAlert,
} from "lucide-react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type Variants,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/* --------------------------------- types --------------------------------- */

export type CheckoutStepsStyle = "slide" | "stack";
export type CheckoutSummaryStyle = "side" | "bar" | "off";
export type CheckoutCardFormat = "groups" | "mask" | "plain";
export type CheckoutState = "idle" | "pending" | "confirmed" | "error";
export type CheckoutStatus = "ready" | "loading" | "error";
export type CheckoutArtKind =
  "mug" | "cone" | "beans" | "cloth" | "carafe" | "tumbler";

export type CheckoutItem = {
  id: string;
  name: string;
  /** "Ember · 12 oz" */
  variant?: string;
  /** One unit's price in the currency's major unit. */
  price: number;
  quantity: number;
  /** A 40px square thumbnail. Defaults to the drawn `art`. */
  image?: React.ReactNode;
  /** A drawn thumbnail: the kind of thing and its colour (any CSS colour). */
  art?: { kind: CheckoutArtKind; tint: string };
};

export type CheckoutDeliveryOption = {
  id: string;
  label: string;
  /** Working days from `now` until it arrives (or is ready). */
  days: number;
  price: number;
  /** A quieter line after the date: "Basin Lane, Dublin 7". */
  note?: string;
  /** "Arrives" or "Ready". @default "Arrives" */
  verb?: string;
};

export type CheckoutAddress = {
  name: string;
  email: string;
  line1: string;
  line2: string;
  city: string;
  postcode: string;
  country: string;
};

export type CheckoutCard = {
  /** Digits only. */
  number: string;
  name: string;
  /** Digits only: MMYY. */
  expiry: string;
  cvc: string;
};

export type CheckoutValues = {
  address: CheckoutAddress;
  /** The chosen delivery option's id. */
  delivery: string;
  card: CheckoutCard;
  /** Bill the delivery address. */
  billingSame: boolean;
};

export type CheckoutFlowProps = {
  /** What is being bought. @default defaultCheckoutItems */
  items?: CheckoutItem[];
  /** How it can get there. @default defaultDeliveryOptions */
  deliveryOptions?: CheckoutDeliveryOption[];
  /** Controlled answers. */
  value?: CheckoutValues;
  /** Initial answers when uncontrolled. @default defaultCheckoutValues */
  defaultValue?: CheckoutValues;
  /** Fires from the keystroke or choice that changed an answer, with every answer. */
  onValueChange?: (values: CheckoutValues) => void;
  /** Controlled step: 0 address, 1 delivery, 2 payment, 3 review. */
  step?: number;
  /** Initial step when uncontrolled. @default 0 */
  defaultStep?: number;
  /** Fires from Continue, Back, Edit or the step bar with the step asked for. */
  onStepChange?: (step: number) => void;
  /** A Continue was held, with the step and the fields that need attention. */
  onInvalid?: (step: number, fields: string[]) => void;
  /** Place order was pressed. Return a promise to hold it pending; resolve with an order id to show it, reject to show why. */
  onPlaceOrder?: (
    values: CheckoutValues,
    total: number,
  ) => void | Promise<{ orderId?: string } | void>;
  /** Controlled place-order state. */
  state?: CheckoutState;
  /** Fires as the order goes pending, confirmed or refused. */
  onStateChange?: (state: CheckoutState) => void;
  /** Continue shopping was pressed on the confirmation. */
  onContinueShopping?: () => void;
  /** The moment delivery dates and card expiry count from. Never read from the clock during render. @default 2 Oct 2026, 09:30 UTC */
  now?: Date | number;
  /** One step at a time sliding by direction, or every step stacked as sections that fold. @default "slide" */
  steps?: CheckoutStepsStyle;
  /** The order summary: a sticky column beside the form, a bar that opens over it, or only on the review. @default "side" */
  summary?: CheckoutSummaryStyle;
  /** How the card number formats as it is typed: spaced groups, a guide whose bullets fill, or plain digits. @default "groups" */
  format?: CheckoutCardFormat;
  /** Formats an amount for display. @default euros */
  formatPrice?: (amount: number) => string;
  /** A test card the payment step offers to fill in one press, for sandbox checkouts. Leave it out in production. */
  testCard?: CheckoutCard;
  /** The countries offered for delivery. @default defaultCountries */
  countries?: string[];
  /** The heading and accessible name. @default "Checkout" */
  title?: string;
  /** The final button's words. @default "Place order" */
  placeLabel?: string;
  /** The final button while the order is placed. @default "Placing order…" */
  pendingLabel?: string;
  /** Loading draws placeholders; error offers Retry. @default "ready" */
  status?: CheckoutStatus;
  /** The Retry button of the error state. */
  onRetry?: () => void;
  /** The region's accessible name when it should differ from the title. */
  label?: string;
  /** Play the steps, the choices and the confirmation. Off unless asked for. @default false */
  sound?: boolean;
  /** Shows the checkout but takes no input. */
  disabled?: boolean;
  className?: string;
};

/* -------------------------------- helpers -------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const cents = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const RING_WITHIN =
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring";

const EURO = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});
const euro = (amount: number) => EURO.format(cents(amount));

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

const isPromise = <T,>(v: unknown): v is Promise<T> =>
  !!v && typeof (v as { then?: unknown }).then === "function";

const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error && error.message
    ? error.message
    : typeof error === "string" && error
      ? error
      : fallback;

/** The checksum every card number carries in its last digit. */
function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return digits.length > 0 && sum % 10 === 0;
}

const onlyDigits = (s: string) => s.replace(/\D/g, "");
const MASK = "•••• •••• •••• ••••";

const numberText = (digits: string, format: CheckoutCardFormat) =>
  format === "plain" ? digits : (digits.match(/.{1,4}/g) ?? []).join(" ");

const expiryText = (digits: string) =>
  digits.length <= 2 ? digits : `${digits.slice(0, 2)} / ${digits.slice(2)}`;

/** Where the caret goes in formatted text: just after its nth digit. */
function caretAfter(text: string, n: number): number {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (/\d/.test(text[i] ?? "")) seen += 1;
    if (seen === n) return i + 1;
  }
  return text.length;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const DAY_MS = 86_400_000;
const addWorkdays = (ms: number, n: number) => {
  let t = ms;
  let left = n;
  while (left > 0) {
    t += DAY_MS;
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) left -= 1;
  }
  return t;
};
const dayOf = (ms: number) => {
  const d = new Date(ms);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSTCODE = /^[a-z0-9][a-z0-9 -]{1,8}[a-z0-9]$/i;

/* ---------------------------------- art ---------------------------------- */

const EMBER = "oklch(0.62 0.13 42)";
const SLATE = "oklch(0.5 0.035 248)";
const KRAFT = "oklch(0.74 0.06 70)";
const KRAFT_DARK = "oklch(0.62 0.06 65)";
const CLAY = "oklch(0.8 0.035 70)";
const COFFEE = "oklch(0.33 0.045 52)";

/** Small drawn thumbnails for the default items: no files, no network. */
function Art({ kind, tint }: { kind: CheckoutArtKind; tint: string }) {
  let body: React.ReactNode;
  switch (kind) {
    case "mug":
      body = (
        <>
          <path
            d="M33 18c7 0 7 13 0 13"
            fill="none"
            stroke={tint}
            strokeWidth={3.4}
            strokeLinecap="round"
          />
          <rect x={11} y={12} width={22} height={28} rx={3} fill={tint} />
          <rect x={11} y={34} width={22} height={6} rx={2.5} fill={CLAY} />
          <rect
            x={27}
            y={12}
            width={6}
            height={28}
            fill="black"
            opacity={0.1}
          />
          <ellipse cx={22} cy={12} rx={11} ry={2.4} fill={tint} />
          <ellipse
            cx={22}
            cy={12.4}
            rx={8.6}
            ry={1.6}
            fill="black"
            opacity={0.3}
          />
        </>
      );
      break;
    case "beans":
      body = (
        <>
          <path d="M13 13h22l2 27H11z" fill={KRAFT} />
          <rect x={13} y={9} width={22} height={5} rx={1} fill={KRAFT_DARK} />
          <rect x={15} y={21} width={18} height={12} rx={1.5} fill={tint} />
          <ellipse
            cx={24}
            cy={27}
            rx={3.4}
            ry={4.6}
            fill={COFFEE}
            transform="rotate(-24 24 27)"
          />
        </>
      );
      break;
    case "cone":
      body = (
        <>
          <rect x={14} y={33} width={20} height={4} rx={2} fill={tint} />
          <path d="M9 13h30l-9 20H18z" fill={tint} />
          <ellipse cx={24} cy={13} rx={15} ry={2.6} fill={tint} />
          <ellipse
            cx={24}
            cy={13.3}
            rx={12.4}
            ry={1.7}
            fill="black"
            opacity={0.3}
          />
        </>
      );
      break;
    case "cloth":
      body = (
        <>
          <rect x={8} y={26} width={32} height={11} rx={2} fill={tint} />
          <rect x={10} y={17} width={28} height={10} rx={2} fill={tint} />
          <rect
            x={10}
            y={17}
            width={28}
            height={10}
            rx={2}
            fill="white"
            opacity={0.18}
          />
        </>
      );
      break;
    case "carafe":
      body = (
        <>
          <path
            d="M20 7h8v9c6 3 9 8 9 14 0 6-5 10-13 10s-13-4-13-10c0-6 3-11 9-14z"
            className="fill-ink-3/15 stroke-ink-3/50"
            strokeWidth={1}
          />
          <rect x={19} y={13} width={10} height={4} rx={1} fill={tint} />
        </>
      );
      break;
    default:
      body = (
        <>
          <path d="M14 11h20l-2.5 29h-15z" fill={tint} />
          <ellipse cx={24} cy={11} rx={10} ry={1.8} fill={tint} />
        </>
      );
  }
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="block size-full">
      {body}
    </svg>
  );
}

/* -------------------------------- defaults ------------------------------- */

const DEFAULT_NOW = Date.UTC(2026, 9, 2, 9, 30);

export const defaultCheckoutItems: CheckoutItem[] = [
  {
    id: "field-mug-ember-12",
    name: "Field Mug",
    variant: "Ember · 12 oz",
    price: 32,
    quantity: 1,
    art: { kind: "mug", tint: EMBER },
  },
  {
    id: "house-beans",
    name: "Coldbrook House Beans",
    variant: "250 g · whole bean",
    price: 9.5,
    quantity: 2,
    art: { kind: "beans", tint: SLATE },
  },
];

export const defaultDeliveryOptions: CheckoutDeliveryOption[] = [
  { id: "standard", label: "Standard", days: 3, price: 4.95 },
  { id: "express", label: "Express", days: 1, price: 9.95 },
  {
    id: "collect",
    label: "Collect from the studio",
    days: 2,
    price: 0,
    verb: "Ready",
    note: "Basin Lane, Dublin 7",
  },
];

export const defaultCountries = [
  "Ireland",
  "Netherlands",
  "Belgium",
  "France",
  "Germany",
  "Portugal",
];

export const defaultCheckoutValues: CheckoutValues = {
  address: {
    name: "Maeve Corrigan",
    email: "maeve@fernworks.ie",
    line1: "14 Basin Lane",
    line2: "",
    city: "Dublin 7",
    postcode: "D07 X2F7",
    country: "Ireland",
  },
  delivery: "standard",
  card: { number: "", name: "", expiry: "", cvc: "" },
  billingSame: true,
};

/** A blank checkout, for products that start from nothing. */
const BLANK: CheckoutValues = {
  address: {
    name: "",
    email: "",
    line1: "",
    line2: "",
    city: "",
    postcode: "",
    country: "",
  },
  delivery: "",
  card: { number: "", name: "", expiry: "", cvc: "" },
  billingSame: true,
};

const STEPS = ["Address", "Delivery", "Payment", "Review"] as const;
const REVIEW = 3;

type FieldId =
  | "name"
  | "email"
  | "line1"
  | "line2"
  | "city"
  | "postcode"
  | "country"
  | "delivery"
  | "number"
  | "holder"
  | "expiry"
  | "cvc";

const STEP_FIELDS: FieldId[][] = [
  ["name", "email", "line1", "line2", "city", "postcode", "country"],
  ["delivery"],
  ["number", "holder", "expiry", "cvc"],
  [],
];

const FIELD_LABEL: Record<FieldId, string> = {
  name: "Full name",
  email: "Email",
  line1: "Address",
  line2: "Apartment, suite",
  city: "Town or city",
  postcode: "Postcode",
  country: "Country",
  delivery: "Delivery",
  number: "Card number",
  holder: "Name on card",
  expiry: "Expiry",
  cvc: "Security code",
};

function problemsOf(
  v: CheckoutValues,
  now: number,
  deliveryIds: string[],
): Partial<Record<FieldId, string>> {
  const p: Partial<Record<FieldId, string>> = {};
  const a = v.address;
  if (!a.name.trim()) p.name = "Enter the name to deliver to.";
  if (!a.email.trim()) p.email = "Enter an email for the receipt.";
  else if (!EMAIL.test(a.email.trim())) {
    p.email = "That doesn't look like an email address.";
  }
  if (!a.line1.trim()) p.line1 = "Enter the street address.";
  if (!a.city.trim()) p.city = "Enter a town or city.";
  if (!a.postcode.trim()) p.postcode = "Enter a postcode.";
  else if (!POSTCODE.test(a.postcode.trim()))
    p.postcode = "Check the postcode.";
  if (!a.country.trim()) p.country = "Choose a country.";
  if (!deliveryIds.includes(v.delivery)) {
    p.delivery = "Choose how it gets to you.";
  }
  const c = v.card;
  if (!c.number) p.number = "Enter the card number.";
  else if (c.number.length < 16) p.number = "Card numbers here have 16 digits.";
  else if (!luhn(c.number)) {
    p.number = "Check the card number; its digits don't add up.";
  }
  if (!c.name.trim()) p.holder = "Enter the name on the card.";
  if (c.expiry.length < 4) p.expiry = "Enter the expiry as MM / YY.";
  else {
    const mm = Number(c.expiry.slice(0, 2));
    const yy = Number(c.expiry.slice(2, 4));
    const d = new Date(now);
    const cy = d.getUTCFullYear() % 100;
    const cm = d.getUTCMonth() + 1;
    if (mm < 1 || mm > 12) p.expiry = "Months run from 01 to 12.";
    else if (yy < cy || (yy === cy && mm < cm)) {
      p.expiry = "This card has expired.";
    }
  }
  if (c.cvc.length < 3) p.cvc = "Enter the 3 or 4 digits on the back.";
  return p;
}

/* ------------------------------- primitives ------------------------------ */

const DIGITS = Array.from({ length: 10 }, (_, n) => n);

/** One digit as a column of 0–9 that rolls to its value on snap. */
function Digit({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  return (
    <span
      className="relative inline-block overflow-clip"
      style={{ height: "1.2em", lineHeight: "1.2em" }}
    >
      <span className="invisible">0</span>
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={false}
        animate={{ y: `${-value * 10}%` }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        {DIGITS.map((n) => (
          <span
            key={n}
            className="block"
            style={{ height: "1.2em", lineHeight: "1.2em" }}
          >
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/** A figure whose digits roll, keyed from the right so the units stay put. */
function Roll({
  text,
  motionSafe,
  className,
}: {
  text: string;
  motionSafe: boolean;
  className?: string;
}) {
  const chars = [...text];
  return (
    <span
      className={cn("inline-grid justify-items-end tabular-nums", className)}
    >
      <span className="sr-only">{text}</span>
      <span
        aria-hidden
        className="col-start-1 row-start-1 inline-flex whitespace-pre"
        style={{ lineHeight: "1.2em" }}
      >
        {chars.map((ch, i) => {
          const fromRight = chars.length - i;
          return ch >= "0" && ch <= "9" ? (
            <Digit
              key={`d${fromRight}`}
              value={Number(ch)}
              motionSafe={motionSafe}
            />
          ) : (
            <span key={`c${fromRight}${ch}`} className="inline-block">
              {ch}
            </span>
          );
        })}
      </span>
    </span>
  );
}

/** A box whose height glides to its content's measured height. */
function Measured({
  children,
  motionSafe,
}: {
  children: React.ReactNode;
  motionSafe: boolean;
}) {
  const height = useMotionValue(-1);
  const style = useTransform(height, (h) => (h < 0 ? "auto" : h));
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!node) return;
    let running: AnimationPlaybackControls | null = null;
    const ro = new ResizeObserver(() => {
      const h = node.offsetHeight;
      const now = height.get();
      if (now < 0 || !motionSafe) {
        running?.stop();
        height.jump(h);
        return;
      }
      if (Math.abs(now - h) < 0.5) return;
      running?.stop();
      running = animate(height, h, {
        ...springs.glide,
        velocity: height.getVelocity(),
      });
    });
    ro.observe(node);
    return () => {
      ro.disconnect();
      // A re-run finishes the glide where it should end rather than freezing it.
      running?.stop();
      if (height.get() >= 0) height.jump(node.offsetHeight);
    };
  }, [node, motionSafe, height]);

  return (
    <motion.div
      style={{ height: style }}
      className="relative overflow-clip [overflow-clip-margin:6px]"
    >
      <div ref={setNode} className="relative">
        {children}
      </div>
    </motion.div>
  );
}

function Message({
  id,
  text,
  motionSafe,
}: {
  id: string;
  text: string | null;
  motionSafe: boolean;
}) {
  return (
    <AnimatePresence initial={false}>
      {text ? (
        <motion.p
          key="message"
          id={id}
          className="flex items-center gap-1.5 text-[12px] leading-4 text-danger"
          initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={{
            opacity: { duration: durations.base, ease: easings.enter },
            y: motionSafe ? springs.snap : { duration: 0 },
          }}
        >
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          {text}
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}

type TextFieldProps = {
  id: string;
  field: FieldId;
  label: string;
  value: string;
  error: string | null;
  hint?: React.ReactNode;
  optional?: boolean;
  motionSafe: boolean;
  className?: string;
  input: React.InputHTMLAttributes<HTMLInputElement> & {
    ref?: React.Ref<HTMLInputElement>;
  };
  /** Drawn over the input, behind its text: a mask guide. */
  overlay?: React.ReactNode;
};

function TextField({
  id,
  field,
  label,
  value,
  error,
  hint,
  optional,
  motionSafe,
  className,
  input,
  overlay,
}: TextFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[12px] font-medium text-ink-2">
        {label}
        {optional ? (
          <span className="font-normal text-ink-3"> · optional</span>
        ) : null}
      </label>
      <div
        className={cn(
          "relative flex h-9 items-center rounded-2 border bg-background transition-colors",
          RING_WITHIN,
          error
            ? "border-danger/70"
            : "border-input hover:border-hairline-strong",
        )}
      >
        {overlay}
        <input
          id={id}
          data-field={field}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...input}
          className={cn(
            "relative h-full w-full min-w-0 bg-transparent px-3 text-[13px] text-foreground outline-none placeholder:text-ink-3",
            input.className,
          )}
        />
      </div>
      {hint ? (
        <div id={hintId} className="text-[12px] leading-4 text-ink-3">
          {hint}
        </div>
      ) : null}
      <Message id={errorId} text={error} motionSafe={motionSafe} />
    </div>
  );
}

/* -------------------------------- step bar ------------------------------- */

function StepBar({
  uid,
  current,
  furthest,
  done,
  confirmed,
  motionSafe,
  disabled,
  onJump,
}: {
  uid: string;
  current: number;
  furthest: number;
  done: boolean[];
  confirmed: boolean;
  motionSafe: boolean;
  disabled: boolean;
  onJump: (i: number, el: Element | null) => void;
}) {
  return (
    <nav aria-label="Checkout steps">
      <ol className="flex gap-1">
        {STEPS.map((title, i) => {
          const isDone = confirmed || (done[i] === true && i !== current);
          const isCurrent = !confirmed && i === current;
          const reachable =
            !confirmed && !disabled && i !== current && i <= furthest;
          const word = isDone
            ? "done"
            : isCurrent
              ? "current step"
              : i <= furthest
                ? "not finished"
                : "not started";
          return (
            <li
              key={title}
              className={cn(
                "min-w-0",
                isCurrent
                  ? "flex-1"
                  : "w-8 shrink-0 @min-[40rem]/co:w-auto @min-[40rem]/co:flex-1",
              )}
            >
              <button
                type="button"
                aria-label={`Step ${i + 1}, ${title}, ${word}`}
                aria-current={isCurrent ? "step" : undefined}
                aria-disabled={!reachable || undefined}
                onClick={(event) => {
                  if (reachable) onJump(i, event.currentTarget);
                }}
                className={cn(
                  "relative flex h-8 w-full items-center justify-center gap-1.5 rounded-full px-1.5 text-[12px] transition-colors",
                  FOCUS,
                  reachable ? "hover:bg-surface-2" : "cursor-default",
                )}
              >
                {isCurrent ? (
                  <motion.span
                    layoutId={`${uid}-step`}
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-cobalt-wash"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <span
                  aria-hidden
                  className={cn(
                    "relative grid size-5 shrink-0 place-items-center rounded-full font-mono text-[10px] leading-none tabular-nums transition-colors",
                    isDone
                      ? "bg-cobalt-bright text-primary-foreground"
                      : isCurrent
                        ? "border border-cobalt-bright text-cobalt-bright"
                        : "border border-hairline-strong text-ink-3",
                  )}
                >
                  {isDone ? (
                    <svg
                      viewBox="0 0 20 20"
                      className="size-5 fill-none stroke-current"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <motion.path
                        d="M6 10.4 8.7 13 14 7.4"
                        initial={motionSafe ? { pathLength: 0 } : false}
                        animate={{ pathLength: 1 }}
                        transition={springs.flick}
                      />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "relative truncate",
                    isCurrent
                      ? "font-medium text-foreground"
                      : "hidden text-ink-2 @min-[40rem]/co:inline",
                  )}
                >
                  {title}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* -------------------------------- card face ------------------------------ */

type FacePart = "number" | "holder" | "expiry" | "cvc";

/**
 * A generic card, drawn above the payment fields: no network, an accent
 * slab. Every digit typed drops into its slot from 4px on flick, and an
 * outline travels to the part of the face the focused field writes, on snap.
 */
function CardFace({
  uid,
  card,
  focus,
  motionSafe,
}: {
  uid: string;
  card: CheckoutCard;
  focus: FacePart | null;
  motionSafe: boolean;
}) {
  const ring = (part: FacePart) =>
    focus === part ? (
      <motion.span
        layoutId={`${uid}-face`}
        aria-hidden
        className="absolute -inset-1 rounded-2 border border-white/70"
        transition={motionSafe ? springs.snap : { duration: 0 }}
      />
    ) : null;
  const drop = motionSafe
    ? {
        initial: { y: -distances.nudge, opacity: 0 },
        transition: springs.flick,
      }
    : { initial: { opacity: 0 }, transition: { duration: durations.fast } };
  const mm = card.expiry.slice(0, 2);
  const yy = card.expiry.slice(2, 4);
  return (
    <div
      aria-hidden
      className="relative aspect-[1.586] w-full overflow-clip rounded-3 bg-[linear-gradient(135deg,oklch(0.45_0.13_262),oklch(0.3_0.1_282))] p-[6%] text-white shadow-[0_12px_28px_color-mix(in_oklab,black_22%,transparent)] select-none"
    >
      <span className="pointer-events-none absolute -top-1/3 -right-1/4 size-[80%] rounded-full bg-white/8" />
      <span className="pointer-events-none absolute -bottom-1/2 -left-1/4 size-[90%] rounded-full bg-white/5" />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          <span className="relative h-6 w-8 rounded-1 bg-[oklch(0.84_0.08_85)]">
            <span className="absolute inset-x-0 top-1/2 h-px bg-black/20" />
            <span className="absolute inset-y-0 left-1/2 w-px bg-black/20" />
          </span>
          <span className="relative flex items-center gap-1 rounded-1 px-1 font-mono text-[10px] tracking-[0.08em] text-white/80">
            {ring("cvc")}
            CVC{" "}
            <span className="tracking-[0.2em]">
              {card.cvc ? "•".repeat(card.cvc.length) : "···"}
            </span>
          </span>
        </div>
        <div className="relative w-fit">
          {ring("number")}
          <span className="flex gap-[0.6em] font-mono text-[16px] leading-6 tracking-[0.04em] tabular-nums">
            {[0, 1, 2, 3].map((g) => (
              <span key={g} className="flex">
                {[0, 1, 2, 3].map((k) => {
                  const i = g * 4 + k;
                  const d = card.number[i];
                  return (
                    <span
                      key={k}
                      className="relative inline-grid w-[0.62em] justify-items-center"
                    >
                      <AnimatePresence initial={false}>
                        <motion.span
                          key={d ?? "dot"}
                          className={cn(
                            "col-start-1 row-start-1",
                            d ? "text-white" : "text-white/40",
                          )}
                          initial={drop.initial}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ opacity: 0, transition: { duration: 0.06 } }}
                          transition={drop.transition}
                        >
                          {d ?? "•"}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                  );
                })}
              </span>
            ))}
          </span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <span className="relative min-w-0 flex-1">
            {ring("holder")}
            <span className="block font-mono text-[8px] tracking-[0.1em] text-white/60 uppercase">
              Card holder
            </span>
            <span className="block truncate text-[12px] font-medium tracking-[0.06em] uppercase">
              {card.name.trim() || (
                <span className="text-white/45">Your name</span>
              )}
            </span>
          </span>
          <span className="relative shrink-0 text-right">
            {ring("expiry")}
            <span className="block font-mono text-[8px] tracking-[0.1em] text-white/60 uppercase">
              Expires
            </span>
            <span className="block font-mono text-[12px] tabular-nums">
              <span className={mm ? "" : "text-white/45"}>
                {mm.padEnd(2, "M") || "MM"}
              </span>
              /
              <span className={yy ? "" : "text-white/45"}>
                {yy.padEnd(2, "Y") || "YY"}
              </span>
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- summary -------------------------------- */

type Totals = {
  sub: number;
  ship: number;
  total: number;
  vat: number;
  count: number;
};

function SummaryBody({
  items,
  totals,
  shipLabel,
  money,
  motionSafe,
}: {
  items: CheckoutItem[];
  totals: Totals;
  shipLabel: string;
  money: (amount: number) => string;
  motionSafe: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <ul role="list" className="flex flex-col gap-2.5">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-3">
            <span className="relative size-10 shrink-0">
              <span className="block size-10 overflow-clip rounded-2 bg-surface-2">
                {it.image ??
                  (it.art ? (
                    <Art kind={it.art.kind} tint={it.art.tint} />
                  ) : null)}
              </span>
              <span className="absolute -top-1.5 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-ink-2 px-1 font-mono text-[10px] text-background tabular-nums">
                <span className="sr-only">Quantity </span>
                {it.quantity}
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block truncate text-[12px] font-medium text-foreground"
                title={it.name}
              >
                {it.name}
              </span>
              {it.variant ? (
                <span className="block truncate text-[11px] text-ink-3">
                  {it.variant}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 text-[12px] text-foreground tabular-nums">
              {money(cents(it.price * it.quantity))}
            </span>
          </li>
        ))}
      </ul>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t border-hairline pt-3 text-[12px]">
        <dt className="text-ink-2">Subtotal</dt>
        <dd className="text-right text-foreground">
          <Roll text={money(totals.sub)} motionSafe={motionSafe} />
        </dd>
        <dt className="min-w-0 truncate text-ink-2">{shipLabel}</dt>
        <dd className="text-right text-foreground">
          <Roll
            text={totals.ship === 0 ? "Free" : money(totals.ship)}
            motionSafe={motionSafe}
          />
        </dd>
        <dt className="pt-1 text-[13px] font-medium text-foreground">Total</dt>
        <dd className="pt-1 text-right text-[15px] font-semibold text-foreground">
          <Roll text={money(totals.total)} motionSafe={motionSafe} />
        </dd>
      </dl>
      <p className="text-[11px] text-ink-3">
        Includes {money(totals.vat)} VAT.
      </p>
    </div>
  );
}

function SummaryBar({
  uid,
  totals,
  motionSafe,
  money,
  children,
  className,
}: {
  uid: string;
  totals: Totals;
  motionSafe: boolean;
  money: (amount: number) => string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const panelId = `${uid}-summary-panel`;
  return (
    <div
      className={cn("rounded-3 border border-hairline bg-surface-1", className)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-11 w-full items-center gap-2 rounded-3 px-3 text-left text-[13px] text-foreground",
          FOCUS,
        )}
      >
        <ShoppingBag aria-hidden className="size-4 shrink-0 text-ink-3" />
        <span className="min-w-0 truncate">
          {open ? "Hide" : "Show"} order summary
        </span>
        <motion.span
          aria-hidden
          className="flex size-4 shrink-0 items-center justify-center text-ink-3"
          initial={false}
          animate={{ rotate: open ? 180 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        >
          <ChevronDown className="size-4" />
        </motion.span>
        <span className="ml-auto shrink-0 font-semibold">
          <Roll text={money(totals.total)} motionSafe={motionSafe} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="panel"
            id={panelId}
            role="region"
            aria-label="Order summary"
            className="overflow-clip"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0, transition: exitFor() }}
            transition={
              motionSafe
                ? {
                    height: springs.glide,
                    opacity: { duration: durations.base },
                  }
                : { duration: 0 }
            }
          >
            <div className="border-t border-hairline px-3 py-3">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* --------------------------------- flow --------------------------------- */

type FlowApi = { shake: () => void };

/**
 * A checkout in four steps beside a sticky order summary. A step bar shows
 * where you are — its pill slides to the current stop on snap and reached
 * stops draw a check on flick — and the steps either swap one at a time,
 * sliding 16px by direction on snap inside a box that glides to each
 * panel's measured height (`steps="slide"`), or stand as sections that fold
 * to a summary line as you finish them (`steps="stack"`). A Continue the step
 * cannot take shakes its head on a short tween, never a spring, and every
 * field says why.
 *
 * Delivery options carry dates counted from `now`; the selection travels
 * between them on snap and the summary's figures roll. The payment step
 * draws a generic card that fills as you type — each digit drops into its
 * slot on flick, an outline travels to the part the focused field writes —
 * while the number formats live as `format` says. The review's Place order
 * holds pending while `onPlaceOrder` works, then the button itself becomes
 * the confirmation: a shared layout carries its box out to the panel's on
 * glide, a check draws, and the order number lands on recoil.
 *
 * Every step is a real form (Enter continues), delivery is a native radio
 * group, the summary bar a disclosure, and each new step's heading takes
 * focus as it arrives. Under reduced motion panels cross-fade in place, the
 * refusal does not shake, digits appear without dropping and the morph is a
 * cross-fade — every state still shows and is announced.
 */
export function CheckoutFlow({
  items = defaultCheckoutItems,
  deliveryOptions = defaultDeliveryOptions,
  value,
  defaultValue,
  onValueChange,
  step,
  defaultStep = 0,
  onStepChange,
  onInvalid,
  onPlaceOrder,
  state,
  onStateChange,
  onContinueShopping,
  now,
  steps = "slide",
  summary = "side",
  format = "groups",
  formatPrice,
  testCard,
  countries = defaultCountries,
  title = "Checkout",
  placeLabel = "Place order",
  pendingLabel = "Placing order…",
  status = "ready",
  onRetry,
  label,
  sound = false,
  disabled = false,
  className,
}: CheckoutFlowProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const money = formatPrice ?? euro;
  const nowMs =
    now === undefined
      ? DEFAULT_NOW
      : typeof now === "number"
        ? now
        : now.getTime();

  const [ownValues, setOwnValues] = React.useState<CheckoutValues>(
    () =>
      defaultValue ??
      (items === defaultCheckoutItems ? defaultCheckoutValues : BLANK),
  );
  const values = value ?? ownValues;
  const [ownStep, setOwnStep] = React.useState(() =>
    clamp(Math.round(defaultStep), 0, REVIEW),
  );
  const current = clamp(Math.round(step ?? ownStep), 0, REVIEW);
  const [ownPhase, setOwnPhase] = React.useState<CheckoutState>("idle");
  const phase = state ?? ownPhase;
  const confirmed = phase === "confirmed";
  const pending = phase === "pending";

  const [attempted, setAttempted] = React.useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const [touched, setTouched] = React.useState<ReadonlySet<FieldId>>(
    () => new Set(),
  );
  const [returning, setReturning] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [orderId, setOrderId] = React.useState<string | null>(null);
  const [faceFocus, setFaceFocus] = React.useState<FacePart | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // The step on screen and the direction it came from, read in render.
  const [shown, setShown] = React.useState(current);
  const [dir, setDir] = React.useState(1);
  const [furthest, setFurthest] = React.useState(current);
  if (shown !== current) {
    setDir(current > shown ? 1 : -1);
    setShown(current);
    setSaid((s) => ({
      n: s.n + 1,
      text: `Step ${current + 1} of 4, ${STEPS[current] ?? ""}.`,
    }));
  }
  if (current > furthest) setFurthest(current);

  const deliveryIds = deliveryOptions.map((d) => d.id);
  const problems = problemsOf(values, nowMs, deliveryIds);
  const errorsAt = (i: number) =>
    (STEP_FIELDS[i] ?? []).filter((f) => problems[f] !== undefined);
  const validAt = (i: number) => errorsAt(i).length === 0;
  const shownError = (f: FieldId, i: number) =>
    problems[f] && (attempted.has(i) || touched.has(f))
      ? (problems[f] ?? null)
      : null;

  const option = deliveryOptions.find((d) => d.id === values.delivery);
  const sub = cents(items.reduce((a, it) => a + it.price * it.quantity, 0));
  const ship = cents(option?.price ?? 0);
  const total = cents(sub + ship);
  const totals: Totals = {
    sub,
    ship,
    total,
    vat: cents((total * 23) / 123),
    count: items.reduce((a, it) => a + it.quantity, 0),
  };
  const dateOf = (o: CheckoutDeliveryOption) =>
    `${o.verb ?? "Arrives"} ${dayOf(addWorkdays(nowMs, o.days))}`;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const numberRef = React.useRef<HTMLInputElement | null>(null);
  const expiryRef = React.useRef<HTMLInputElement | null>(null);
  const caret = React.useRef<{ el: "number" | "expiry"; at: number } | null>(
    null,
  );
  const focusNext = React.useRef<string | null>(null);
  const focusField = React.useRef<FieldId | null>(null);
  const alive = React.useRef(true);
  const api = React.useRef<FlowApi | null>(null);
  const [arrived, setArrived] = React.useState<{
    key: string;
    node: HTMLElement;
  } | null>(null);
  const shakeX = useMotionValue(0);
  const pressing = React.useRef(false);

  const panOf = (el: Element | null | undefined) => {
    const r = el?.getBoundingClientRect();
    return r ? panFrom(r.left + r.width / 2, null) : 0;
  };
  const focusInside = () =>
    !!rootRef.current?.contains(document.activeElement ?? null);

  /* --------------------------- the visitor's moves -------------------------- */

  const update = (next: CheckoutValues) => {
    if (disabled || pending || confirmed) return;
    if (value === undefined) setOwnValues(next);
    onValueChange?.(next);
    if (phase === "error") {
      setFailure(null);
      if (state === undefined) setOwnPhase("idle");
      onStateChange?.("idle");
    }
  };
  const setAddress = (patch: Partial<CheckoutAddress>) =>
    update({ ...values, address: { ...values.address, ...patch } });
  const setCard = (patch: Partial<CheckoutCard>) =>
    update({ ...values, card: { ...values.card, ...patch } });

  const goTo = (to: number, el?: Element | null) => {
    const target = clamp(to, 0, REVIEW);
    if (target === current) return;
    if (focusInside()) focusNext.current = `step-${target}`;
    audio.play("click", {
      pitch: target > current ? 1.12 : 0.88,
      gain: 0.4,
      pan: panOf(el ?? rootRef.current),
    });
    if (step === undefined) setOwnStep(target);
    onStepChange?.(target);
  };

  const hold = (i: number, el?: Element | null) => {
    const errs = errorsAt(i);
    setAttempted((a) => (a.has(i) ? a : new Set(a).add(i)));
    audio.play("click", { pitch: 0.62, gain: 0.4, pan: panOf(el) });
    api.current?.shake();
    const names = errs.map((f) => FIELD_LABEL[f]).join(", ");
    say(
      `${plural(errs.length, "field")} ${errs.length === 1 ? "needs" : "need"} attention: ${names}.`,
    );
    const first = errs[0];
    if (first) focusField.current = first;
    onInvalid?.(i, errs);
  };

  const next = (el?: Element | null) => {
    if (disabled || pending || confirmed) return;
    if (current >= REVIEW) {
      void place(el ?? null);
      return;
    }
    if (!validAt(current)) {
      hold(current, el);
      return;
    }
    const to = returning ? REVIEW : current + 1;
    if (to === REVIEW) setReturning(false);
    goTo(to, el);
  };

  const back = (el?: Element | null) => {
    if (disabled || pending || current === 0) return;
    setReturning(false);
    goTo(current - 1, el);
  };

  const jump = (i: number, el: Element | null) => {
    if (disabled || pending || confirmed || i === current || i > furthest)
      return;
    if (i < current) {
      setReturning(false);
      goTo(i, el);
      return;
    }
    for (let k = current; k < i; k += 1) {
      if (validAt(k)) continue;
      if (k === current) hold(k, el);
      else goTo(k, el);
      return;
    }
    goTo(i, el);
  };

  const edit = (i: number, el: Element | null) => {
    if (disabled || pending) return;
    setReturning(true);
    goTo(i, el);
  };

  const setPhase = (p: CheckoutState) => {
    if (state === undefined) setOwnPhase(p);
    onStateChange?.(p);
  };

  const place = async (el: Element | null) => {
    if (disabled || pending || confirmed) return;
    for (let k = 0; k < REVIEW; k += 1) {
      if (validAt(k)) continue;
      setAttempted((a) => (a.has(k) ? a : new Set(a).add(k)));
      say(`${STEPS[k]} needs attention before you place the order.`);
      onInvalid?.(k, errorsAt(k));
      setReturning(true);
      goTo(k, el);
      return;
    }
    const hadFocus = focusInside();
    setFailure(null);
    setPhase("pending");
    say(pendingLabel);
    audio.play("click", { pitch: 1.05, gain: 0.45, pan: panOf(el) });
    const fallback = `FW-${20000 + (hash(JSON.stringify(values)) % 9000)}`;
    let id = fallback;
    try {
      const r = onPlaceOrder?.(values, total);
      if (isPromise<{ orderId?: string } | void>(r)) {
        const answer = await r;
        if (answer && typeof answer === "object" && answer.orderId) {
          id = answer.orderId;
        }
      }
    } catch (error) {
      if (!alive.current) return;
      const message = messageOf(
        error,
        "The order didn't go through. Try again.",
      );
      setFailure(message);
      setPhase("error");
      say(message);
      return;
    }
    if (!alive.current) return;
    if (hadFocus || focusInside()) focusNext.current = "done";
    setOrderId(id);
    setPhase("confirmed");
    audio.play("chime", { gain: 0.5, pan: panOf(el) });
    say(`Order ${id} confirmed. ${option ? dateOf(option) : ""}.`);
  };

  /* --------------------------- card formatting --------------------------- */

  const onNumberChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const el = event.currentTarget;
    const raw = el.value;
    const at = el.selectionStart ?? raw.length;
    const before = onlyDigits(raw.slice(0, at)).length;
    const digits = onlyDigits(raw).slice(0, 16);
    caret.current = {
      el: "number",
      at: caretAfter(
        numberText(digits, format),
        Math.min(before, digits.length),
      ),
    };
    setCard({ number: digits });
  };

  /** Backspace over a space takes the digit before it, as people expect. */
  const onNumberKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (format === "plain") return;
    const el = event.currentTarget;
    const at = el.selectionStart ?? 0;
    if (at !== el.selectionEnd) return;
    const text = el.value;
    if (event.key === "Backspace" && at > 0 && text[at - 1] === " ") {
      event.preventDefault();
      const n = onlyDigits(text.slice(0, at)).length;
      const digits = values.card.number;
      const nextDigits = digits.slice(0, n - 1) + digits.slice(n);
      caret.current = {
        el: "number",
        at: caretAfter(numberText(nextDigits, format), n - 1),
      };
      setCard({ number: nextDigits });
    }
  };

  const onExpiryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const el = event.currentTarget;
    const raw = el.value;
    const at = el.selectionStart ?? raw.length;
    let before = onlyDigits(raw.slice(0, at)).length;
    let digits = onlyDigits(raw).slice(0, 4);
    // A first digit that can't start a month is a month on its own: 4 → 04.
    if (digits.length >= 1 && Number(digits[0]) > 1) {
      digits = `0${digits}`.slice(0, 4);
      before += 1;
    }
    caret.current = {
      el: "expiry",
      at: caretAfter(expiryText(digits), Math.min(before, digits.length)),
    };
    setCard({ expiry: digits });
  };

  React.useLayoutEffect(() => {
    const c = caret.current;
    if (!c) return;
    caret.current = null;
    const el = c.el === "number" ? numberRef.current : expiryRef.current;
    if (el && document.activeElement === el) el.setSelectionRange(c.at, c.at);
  });

  /* -------------------------------- effects -------------------------------- */

  React.useEffect(() => {
    alive.current = true;
    const release = () => {
      pressing.current = false;
    };
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    return () => {
      alive.current = false;
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
    };
  }, []);

  React.useEffect(() => {
    api.current = {
      shake: () => {
        if (!motionSafe) return;
        // A refusal shakes its head on a tween: five keys, no spring, no bounce.
        void animate(shakeX, [0, -7, 6, -4, 2, 0], {
          duration: 0.32,
          ease: "easeInOut",
        });
      },
    };
  });

  /** Brings a node inside the root into view without scrolling the page. */
  const reveal = React.useCallback((node: HTMLElement) => {
    const root = rootRef.current;
    if (!root || root.scrollHeight <= root.clientHeight) return;
    const box = root.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    if (r.top < box.top + 8) {
      root.scrollTo({ top: root.scrollTop + r.top - box.top - 12 });
    } else if (r.bottom > box.bottom - 8) {
      root.scrollTo({ top: root.scrollTop + r.bottom - box.bottom + 12 });
    }
  }, []);

  // Focus follows the panel the visitor moved to, once that panel exists.
  React.useEffect(() => {
    if (!arrived || !arrived.node.isConnected) return;
    if (focusNext.current !== arrived.key) return;
    focusNext.current = null;
    arrived.node.focus({ preventScroll: true });
    reveal(arrived.node);
  }, [arrived, reveal]);

  // A held Continue sends focus to the first field that needs attention.
  React.useEffect(() => {
    const id = focusField.current;
    const root = rootRef.current;
    if (!id || !root) return;
    focusField.current = null;
    const controls = Array.from(
      root.querySelectorAll<HTMLElement>(`[data-field="${id}"]`),
    );
    const el =
      controls.find((c) => (c as HTMLInputElement).checked) ?? controls[0];
    if (!el) return;
    el.focus({ preventScroll: true });
    reveal(el);
  });

  const bindHeading = React.useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const key = node.dataset.panel ?? "";
    setArrived((a) => (a && a.node === node ? a : { key, node }));
  }, []);

  /* --------------------------------- view ---------------------------------- */

  const done = STEPS.map((_, i) =>
    i < REVIEW ? validAt(i) && i < furthest : confirmed,
  );
  const busy = pending;

  const heading = (i: number, text: string, sub?: string) => (
    <div>
      <h3
        ref={bindHeading}
        data-panel={`step-${i}`}
        tabIndex={-1}
        className="text-[15px] font-semibold text-foreground outline-none"
      >
        {text}
      </h3>
      {sub ? <p className="mt-0.5 text-[12px] text-ink-3">{sub}</p> : null}
    </div>
  );

  const a = values.address;
  const fid = (f: FieldId) => `${uid}-${f}`;
  // A field left by pressing a button says why only once the press is over:
  // a message arriving mid-press would move the button out from under it,
  // and the click would never land.
  const blur = (f: FieldId) => {
    const mark = () => setTouched((t) => (t.has(f) ? t : new Set(t).add(f)));
    if (!pressing.current) {
      mark();
      return;
    }
    const later = () => {
      window.removeEventListener("pointerup", later);
      window.removeEventListener("pointercancel", later);
      window.setTimeout(mark, 0);
    };
    window.addEventListener("pointerup", later);
    window.addEventListener("pointercancel", later);
  };

  const addressFields = (
    <div className="grid gap-3 @min-[24rem]/panel:grid-cols-2">
      <TextField
        id={fid("name")}
        field="name"
        label="Full name"
        value={a.name}
        error={shownError("name", 0)}
        motionSafe={motionSafe}
        input={{
          autoComplete: "shipping name",
          onChange: (e) => setAddress({ name: e.currentTarget.value }),
          onBlur: () => blur("name"),
        }}
      />
      <TextField
        id={fid("email")}
        field="email"
        label="Email"
        value={a.email}
        error={shownError("email", 0)}
        motionSafe={motionSafe}
        input={{
          type: "email",
          inputMode: "email",
          autoComplete: "email",
          spellCheck: false,
          onChange: (e) => setAddress({ email: e.currentTarget.value }),
          onBlur: () => blur("email"),
        }}
      />
      <TextField
        id={fid("line1")}
        field="line1"
        label="Address"
        value={a.line1}
        error={shownError("line1", 0)}
        motionSafe={motionSafe}
        input={{
          autoComplete: "shipping address-line1",
          onChange: (e) => setAddress({ line1: e.currentTarget.value }),
          onBlur: () => blur("line1"),
        }}
      />
      <TextField
        id={fid("line2")}
        field="line2"
        label="Apartment, suite"
        optional
        value={a.line2}
        error={null}
        motionSafe={motionSafe}
        input={{
          autoComplete: "shipping address-line2",
          onChange: (e) => setAddress({ line2: e.currentTarget.value }),
        }}
      />
      <TextField
        id={fid("city")}
        field="city"
        label="Town or city"
        value={a.city}
        error={shownError("city", 0)}
        motionSafe={motionSafe}
        input={{
          autoComplete: "shipping address-level2",
          onChange: (e) => setAddress({ city: e.currentTarget.value }),
          onBlur: () => blur("city"),
        }}
      />
      <TextField
        id={fid("postcode")}
        field="postcode"
        label="Postcode"
        value={a.postcode}
        error={shownError("postcode", 0)}
        motionSafe={motionSafe}
        input={{
          autoComplete: "shipping postal-code",
          autoCapitalize: "characters",
          spellCheck: false,
          className: "uppercase",
          onChange: (e) => setAddress({ postcode: e.currentTarget.value }),
          onBlur: () => blur("postcode"),
        }}
      />
      <div className="flex min-w-0 flex-col gap-1.5 @min-[24rem]/panel:col-span-2">
        <label
          htmlFor={fid("country")}
          className="text-[12px] font-medium text-ink-2"
        >
          Country
        </label>
        <div
          className={cn(
            "relative h-9 rounded-2 border bg-background transition-colors",
            RING_WITHIN,
            shownError("country", 0)
              ? "border-danger/70"
              : "border-input hover:border-hairline-strong",
          )}
        >
          <select
            id={fid("country")}
            data-field="country"
            value={a.country}
            autoComplete="shipping country-name"
            aria-invalid={shownError("country", 0) ? true : undefined}
            aria-describedby={
              shownError("country", 0) ? `${fid("country")}-error` : undefined
            }
            onChange={(e) => setAddress({ country: e.currentTarget.value })}
            className="h-full w-full appearance-none rounded-2 bg-transparent pr-8 pl-3 text-[13px] text-foreground outline-none"
          >
            <option value="" disabled>
              Choose a country
            </option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-3"
          />
        </div>
        <Message
          id={`${fid("country")}-error`}
          text={shownError("country", 0)}
          motionSafe={motionSafe}
        />
      </div>
    </div>
  );

  const deliveryError = shownError("delivery", 1);
  const deliveryFields = (
    <div className="flex flex-col gap-1.5">
      <div
        role="radiogroup"
        aria-label="Delivery"
        aria-invalid={deliveryError ? true : undefined}
        aria-describedby={
          deliveryError ? `${fid("delivery")}-error` : undefined
        }
        className="flex flex-col gap-2"
      >
        {deliveryOptions.map((o, i) => {
          const on = values.delivery === o.id;
          return (
            <label
              key={o.id}
              className={cn(
                "relative flex cursor-pointer items-center gap-3 rounded-3 border px-3 py-2.5 transition-colors",
                RING_WITHIN,
                on
                  ? "border-cobalt-bright/60"
                  : deliveryError
                    ? "border-danger/60 hover:border-danger"
                    : "border-hairline hover:border-hairline-strong",
              )}
            >
              {on ? (
                <motion.span
                  layoutId={`${uid}-delivery`}
                  aria-hidden
                  className="absolute inset-0 rounded-3 bg-cobalt-wash"
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}
              <input
                type="radio"
                name={fid("delivery")}
                value={o.id}
                data-field="delivery"
                checked={on}
                onChange={(e) => {
                  audio.play("click", {
                    pitch: r2(0.94 + i * 0.1),
                    gain: 0.45,
                    pan: panOf(e.currentTarget.parentElement),
                  });
                  update({ ...values, delivery: o.id });
                }}
                className="sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "relative grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
                  on ? "border-cobalt-bright" : "border-hairline-strong",
                )}
              >
                <motion.span
                  className="size-2 rounded-full bg-cobalt-bright"
                  initial={false}
                  animate={{ scale: on ? 1 : 0 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              </span>
              <span className="relative min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-foreground">
                  {o.label}
                </span>
                <span className="block truncate text-[12px] text-ink-3">
                  {dateOf(o)}
                  {o.note ? ` · ${o.note}` : ""}
                </span>
              </span>
              <span className="relative shrink-0 text-[13px] text-foreground tabular-nums">
                {o.price === 0 ? "Free" : money(o.price)}
              </span>
            </label>
          );
        })}
      </div>
      <Message
        id={`${fid("delivery")}-error`}
        text={deliveryError}
        motionSafe={motionSafe}
      />
    </div>
  );

  const card = values.card;
  const numberShown = numberText(card.number, format);
  const paymentFields = (
    <div className="grid gap-4 @min-[44rem]/panel:grid-cols-[17rem_minmax(0,1fr)] @min-[44rem]/panel:items-start">
      <div className="w-full max-w-[17rem]">
        <CardFace
          uid={uid}
          card={card}
          focus={faceFocus}
          motionSafe={motionSafe}
        />
      </div>
      <div className="grid gap-3 @min-[24rem]/panel:grid-cols-2">
        <TextField
          id={fid("number")}
          field="number"
          label="Card number"
          className="@min-[24rem]/panel:col-span-2"
          value={numberShown}
          error={shownError("number", 2)}
          motionSafe={motionSafe}
          hint={
            testCard ? (
              <button
                type="button"
                onClick={() => {
                  update({ ...values, card: { ...testCard } });
                  setTouched((t) => {
                    const n = new Set(t);
                    for (const f of STEP_FIELDS[2] ?? []) n.add(f);
                    return n;
                  });
                }}
                className={cn(
                  "rounded-1 text-cobalt-bright underline-offset-2 hover:underline",
                  FOCUS,
                )}
              >
                Use the test card
              </button>
            ) : undefined
          }
          overlay={
            format === "mask" ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-[13px] whitespace-pre text-ink-3"
              >
                <span className="invisible">{numberShown}</span>
                {MASK.slice(numberShown.length)}
              </span>
            ) : null
          }
          input={{
            ref: numberRef,
            inputMode: "numeric",
            autoComplete: "cc-number",
            spellCheck: false,
            placeholder:
              format === "mask"
                ? undefined
                : format === "plain"
                  ? "0000000000000000"
                  : "0000 0000 0000 0000",
            className: "font-mono tabular-nums",
            onChange: onNumberChange,
            onKeyDown: onNumberKey,
            onFocus: () => setFaceFocus("number"),
            onBlur: () => {
              setFaceFocus(null);
              blur("number");
            },
          }}
        />
        <TextField
          id={fid("holder")}
          field="holder"
          label="Name on card"
          className="@min-[24rem]/panel:col-span-2"
          value={card.name}
          error={shownError("holder", 2)}
          motionSafe={motionSafe}
          input={{
            autoComplete: "cc-name",
            spellCheck: false,
            onChange: (e) => setCard({ name: e.currentTarget.value }),
            onFocus: () => setFaceFocus("holder"),
            onBlur: () => {
              setFaceFocus(null);
              blur("holder");
            },
          }}
        />
        <TextField
          id={fid("expiry")}
          field="expiry"
          label="Expiry"
          value={expiryText(card.expiry)}
          error={shownError("expiry", 2)}
          motionSafe={motionSafe}
          input={{
            ref: expiryRef,
            inputMode: "numeric",
            autoComplete: "cc-exp",
            placeholder: "MM / YY",
            className: "font-mono tabular-nums",
            onChange: onExpiryChange,
            onFocus: () => setFaceFocus("expiry"),
            onBlur: () => {
              setFaceFocus(null);
              blur("expiry");
            },
          }}
        />
        <TextField
          id={fid("cvc")}
          field="cvc"
          label="Security code"
          value={card.cvc}
          error={shownError("cvc", 2)}
          motionSafe={motionSafe}
          input={{
            inputMode: "numeric",
            autoComplete: "cc-csc",
            placeholder: "123",
            className: "font-mono tabular-nums",
            onChange: (e) =>
              setCard({ cvc: onlyDigits(e.currentTarget.value).slice(0, 4) }),
            onFocus: () => setFaceFocus("cvc"),
            onBlur: () => {
              setFaceFocus(null);
              blur("cvc");
            },
          }}
        />
        <label
          className={cn(
            "flex cursor-pointer items-center justify-between gap-3 rounded-3 border border-hairline px-3 py-2 @min-[24rem]/panel:col-span-2",
            RING_WITHIN,
          )}
        >
          <span className="text-[12px] text-ink-2">
            Bill the delivery address
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={values.billingSame}
            onChange={(e) =>
              update({ ...values, billingSame: e.currentTarget.checked })
            }
            className="sr-only"
          />
          <span
            aria-hidden
            className={cn(
              "relative h-5 w-9 shrink-0 rounded-full transition-colors",
              values.billingSame ? "bg-cobalt-bright" : "bg-ink-3/35",
            )}
          >
            <motion.span
              className="absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow-[0_1px_2px_color-mix(in_oklab,black_25%,transparent)]"
              initial={false}
              animate={{ x: values.billingSame ? 16 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            />
          </span>
        </label>
      </div>
    </div>
  );

  const summaryOf = (i: number): string => {
    if (i === 0) {
      return [a.name, a.line1, a.city, a.postcode]
        .filter((s) => s.trim())
        .join(", ");
    }
    if (i === 1) {
      return option
        ? `${option.label} · ${dateOf(option)} · ${option.price === 0 ? "Free" : money(option.price)}`
        : "";
    }
    if (i === 2) {
      return card.number.length >= 4
        ? `Card ending ${card.number.slice(-4)}${card.expiry.length === 4 ? ` · exp ${card.expiry.slice(0, 2)}/${card.expiry.slice(2)}` : ""}`
        : "";
    }
    return "";
  };

  const placeButton = (wide: boolean) => {
    const labels = [`${placeLabel} · ${money(total)}`, pendingLabel];
    return (
      <motion.button
        layoutId={motionSafe ? `${uid}-place` : undefined}
        type={wide ? "submit" : "button"}
        aria-busy={busy || undefined}
        aria-disabled={busy || undefined}
        onClick={wide ? undefined : (e) => void place(e.currentTarget)}
        style={{ borderRadius: 9999 }}
        className={cn(
          "inline-flex h-11 w-full items-center justify-center bg-primary px-4 text-[14px] font-medium text-primary-foreground transition-colors hover:bg-primary/90",
          busy && "cursor-progress",
          FOCUS,
        )}
      >
        <span className="grid">
          {labels.map((text, k) => {
            const on = (k === 1) === busy;
            return (
              <span
                key={k}
                aria-hidden={!on || undefined}
                className={cn(
                  "col-start-1 row-start-1 flex items-center justify-center gap-1.5 whitespace-nowrap",
                  on ? "visible" : "invisible",
                )}
              >
                {k === 1 ? (
                  <LoaderCircle
                    aria-hidden
                    className={cn("size-4", motionSafe && "animate-spin")}
                  />
                ) : (
                  <Lock aria-hidden className="size-3.5" />
                )}
                {text}
              </span>
            );
          })}
        </span>
      </motion.button>
    );
  };

  const failureRow = (
    <AnimatePresence initial={false}>
      {failure ? (
        <motion.div
          key="failure"
          role="alert"
          className="flex items-start gap-2 rounded-2 border border-danger/40 bg-danger/8 px-3 py-2 text-[13px] text-danger"
          initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={{ duration: durations.base, ease: easings.enter }}
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{failure}</span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  const reviewBody = () => {
    const gap = cascade(3);
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col divide-y divide-hairline rounded-3 border border-hairline">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="flex items-start gap-3 px-3 py-2.5"
              initial={
                motionSafe ? { opacity: 0, y: distances.step } : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              transition={{
                y: motionSafe
                  ? { ...springs.snap, delay: 0.04 + i * gap }
                  : { duration: 0 },
                opacity: {
                  duration: durations.base,
                  ease: easings.enter,
                  delay: (motionSafe ? 0.04 : 0) + i * gap,
                },
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  {i === 0 ? "Ship to" : STEPS[i]}
                </p>
                <p
                  className="truncate text-[13px] text-foreground"
                  title={summaryOf(i)}
                >
                  {summaryOf(i) || <span className="text-ink-3">Not set</span>}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Edit ${STEPS[i]?.toLowerCase()}`}
                disabled={disabled || busy}
                onClick={(e) => edit(i, e.currentTarget)}
                className={cn(
                  "-mr-1.5 inline-flex h-7 shrink-0 items-center gap-1 rounded-2 px-2 text-[12px] text-cobalt-bright transition-colors enabled:hover:bg-cobalt-wash disabled:opacity-50",
                  FOCUS,
                )}
              >
                <Pencil aria-hidden className="size-3.5" />
                Edit
              </button>
            </motion.div>
          ))}
        </div>
        {summary === "off" ? (
          <div className="rounded-3 border border-hairline p-3">
            <SummaryBody
              items={items}
              totals={totals}
              shipLabel={option ? `Delivery · ${option.label}` : "Delivery"}
              money={money}
              motionSafe={motionSafe}
            />
          </div>
        ) : null}
        <p className="text-[11px] leading-4 text-ink-3">
          Placing the order pays {money(total)} with the card ending{" "}
          {card.number.slice(-4) || "····"} and agrees to the Fernworks terms of
          sale.
        </p>
        {failureRow}
      </div>
    );
  };

  const bodyOf = (i: number) =>
    i === 0
      ? addressFields
      : i === 1
        ? deliveryFields
        : i === 2
          ? paymentFields
          : reviewBody();

  const subOf = (i: number) =>
    i === 0
      ? "Where it goes, and where the receipt goes."
      : i === 1
        ? "Dates count working days from today."
        : i === 2
          ? "Your card is charged when you place the order."
          : "Check everything once more.";

  const primaryText =
    current >= REVIEW
      ? null
      : returning
        ? "Back to review"
        : current === REVIEW - 1
          ? "Review order"
          : "Continue";

  const variants: Variants = {
    enter: (d: number) =>
      motionSafe ? { opacity: 0, x: d * distances.shift } : { opacity: 0 },
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({
      ...(motionSafe
        ? { opacity: 0, x: -d * distances.shift }
        : { opacity: 0 }),
      transition: exitFor(motionSafe ? durations.base : durations.fast),
    }),
  };

  const slideFlow = (
    <form
      noValidate
      aria-labelledby={titleId}
      onSubmit={(e) => {
        e.preventDefault();
        next((e.nativeEvent as SubmitEvent).submitter ?? null);
      }}
      className="flex flex-col gap-4"
    >
      <fieldset disabled={disabled || busy} className="contents">
        <motion.div style={{ x: shakeX }}>
          <Measured motionSafe={motionSafe}>
            <AnimatePresence initial={false} mode="popLayout" custom={dir}>
              <motion.div
                key={current}
                custom={dir}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  x: springs.snap,
                  opacity: {
                    duration: motionSafe ? durations.base : durations.fast,
                    ease: easings.enter,
                  },
                }}
                className="@container/panel flex flex-col gap-4"
              >
                {heading(current, STEPS[current] ?? "", subOf(current))}
                {bodyOf(current)}
              </motion.div>
            </AnimatePresence>
          </Measured>
        </motion.div>
      </fieldset>
      <div className="flex items-center gap-2 border-t border-hairline pt-3">
        {current > 0 ? (
          <button
            type="button"
            onClick={(e) => back(e.currentTarget)}
            disabled={disabled || busy}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1 rounded-2 pr-3 pl-2 text-[13px] text-ink-2 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:opacity-50",
              FOCUS,
            )}
          >
            <ChevronLeft aria-hidden className="size-4" />
            Back
          </button>
        ) : null}
        {primaryText ? (
          <button
            type="submit"
            disabled={disabled}
            className={cn(
              "ml-auto inline-flex h-9 flex-1 items-center justify-center rounded-2 bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 @min-[30rem]/co:flex-none",
              FOCUS,
            )}
          >
            <span className="grid">
              {["Continue", "Review order", "Back to review"].map((text) => (
                <span
                  key={text}
                  aria-hidden={text !== primaryText || undefined}
                  className={cn(
                    "col-start-1 row-start-1 text-center whitespace-nowrap",
                    text === primaryText ? "visible" : "invisible",
                  )}
                >
                  {text}
                </span>
              ))}
            </span>
          </button>
        ) : (
          <div className="ml-auto w-full @min-[30rem]/co:w-auto @min-[30rem]/co:min-w-64">
            {placeButton(true)}
          </div>
        )}
      </div>
    </form>
  );

  const stackFlow = (
    <ol className="flex flex-col gap-2">
      {STEPS.map((title, i) => {
        const isCurrent = i === current;
        const isDone = done[i] === true && !isCurrent;
        const reachable = !disabled && !busy && i <= furthest && !isCurrent;
        return (
          <li
            key={title}
            className={cn(
              "rounded-3 border transition-colors",
              isCurrent ? "border-hairline-strong bg-card" : "border-hairline",
              !isCurrent && i > furthest && "opacity-60",
            )}
          >
            <div className="flex items-center gap-3 px-3 py-2.5">
              <span
                aria-hidden
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full font-mono text-[11px] tabular-nums",
                  isDone
                    ? "bg-cobalt-bright text-primary-foreground"
                    : isCurrent
                      ? "border border-cobalt-bright text-cobalt-bright"
                      : "border border-hairline-strong text-ink-3",
                )}
              >
                {isDone ? (
                  <svg
                    viewBox="0 0 20 20"
                    className="size-5 fill-none stroke-current"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <motion.path
                      d="M6 10.4 8.7 13 14 7.4"
                      initial={motionSafe ? { pathLength: 0 } : false}
                      animate={{ pathLength: 1 }}
                      transition={springs.flick}
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <div className="min-w-0 flex-1">
                {isCurrent ? (
                  heading(i, title, subOf(i))
                ) : (
                  <>
                    <p className="text-[13px] font-medium text-foreground">
                      {title}
                    </p>
                    {isDone && summaryOf(i) ? (
                      <p
                        className="truncate text-[12px] text-ink-3"
                        title={summaryOf(i)}
                      >
                        {summaryOf(i)}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
              {reachable ? (
                <button
                  type="button"
                  aria-label={`Edit ${title.toLowerCase()}`}
                  onClick={(e) =>
                    i < current
                      ? edit(i, e.currentTarget)
                      : jump(i, e.currentTarget)
                  }
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center gap-1 rounded-2 px-2 text-[12px] text-cobalt-bright transition-colors hover:bg-cobalt-wash",
                    FOCUS,
                  )}
                >
                  <Pencil aria-hidden className="size-3.5" />
                  Edit
                </button>
              ) : null}
            </div>
            <AnimatePresence initial={false}>
              {isCurrent ? (
                <motion.div
                  key="body"
                  className="overflow-clip [overflow-clip-margin:6px]"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{
                    height: 0,
                    opacity: 0,
                    transition: motionSafe
                      ? {
                          height: springs.glide,
                          opacity: exitFor(durations.fast),
                        }
                      : { duration: 0 },
                  }}
                  transition={
                    motionSafe
                      ? {
                          height: springs.glide,
                          opacity: { duration: durations.base },
                        }
                      : { duration: 0 }
                  }
                >
                  <form
                    noValidate
                    aria-label={title}
                    onSubmit={(e) => {
                      e.preventDefault();
                      next((e.nativeEvent as SubmitEvent).submitter ?? null);
                    }}
                    className="px-3 pb-3"
                  >
                    <fieldset disabled={disabled || busy} className="contents">
                      <motion.div
                        style={{ x: shakeX }}
                        className="@container/panel flex flex-col gap-4"
                      >
                        {bodyOf(i)}
                        {i < REVIEW ? (
                          <div className="flex justify-end">
                            <button
                              type="submit"
                              className={cn(
                                "inline-flex h-9 w-full items-center justify-center rounded-2 bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 @min-[24rem]/panel:w-auto",
                                FOCUS,
                              )}
                            >
                              {returning
                                ? "Back to review"
                                : i === REVIEW - 1
                                  ? "Review order"
                                  : "Continue"}
                            </button>
                          </div>
                        ) : null}
                      </motion.div>
                    </fieldset>
                    {i === REVIEW ? (
                      // Outside the fieldset: pending must not disable the
                      // button that holds focus while the order is placed.
                      <div className="pt-3">{placeButton(false)}</div>
                    ) : null}
                  </form>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </li>
        );
      })}
    </ol>
  );

  const shipLabel = option ? `Delivery · ${option.label}` : "Delivery";
  const confirmation = (
    <motion.div
      key="done"
      layoutId={motionSafe ? `${uid}-place` : undefined}
      style={{ borderRadius: 12 }}
      className="flex flex-col items-start gap-4 border border-success/30 bg-success/8 p-5"
      initial={motionSafe ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={
        motionSafe
          ? { layout: springs.glide, opacity: { duration: durations.base } }
          : { duration: durations.fast }
      }
    >
      <motion.span
        aria-hidden
        className="grid size-11 place-items-center rounded-full bg-[oklch(from_var(--success)_0.82_c_h)]"
        initial={motionSafe ? { scale: 0.6, opacity: 0 } : { opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={
          motionSafe
            ? {
                scale: { ...springs.recoil, delay: 0.18 },
                opacity: { duration: durations.fast, delay: 0.18 },
              }
            : { duration: durations.fast }
        }
      >
        <svg
          viewBox="0 0 24 24"
          className="size-6 fill-none stroke-[oklch(from_var(--success)_0.32_c_h)]"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <motion.path
            d="M6.5 12.4 10.3 16 17.6 8.4"
            initial={motionSafe ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={{ ...springs.flick, delay: 0.3 }}
          />
        </svg>
      </motion.span>
      <div className="flex flex-col gap-1">
        <h3
          ref={bindHeading}
          data-panel="done"
          tabIndex={-1}
          className="text-[16px] font-semibold text-foreground outline-none"
        >
          Order{" "}
          <motion.span
            className="inline-block font-mono text-[15px] tabular-nums"
            initial={
              motionSafe ? { y: -distances.step, opacity: 0 } : { opacity: 0 }
            }
            animate={{ y: 0, opacity: 1 }}
            transition={
              motionSafe
                ? {
                    y: { ...springs.recoil, delay: 0.26 },
                    opacity: { duration: durations.fast, delay: 0.26 },
                  }
                : { duration: durations.fast }
            }
          >
            {orderId ?? "FW-20000"}
          </motion.span>{" "}
          confirmed
        </h3>
        {[
          option ? `${dateOf(option)} · ${option.label}` : "",
          `A receipt is on its way to ${a.email || "your inbox"}.`,
          `${plural(totals.count, "item")} · ${money(total)} paid with the card ending ${card.number.slice(-4) || "····"}.`,
        ]
          .filter(Boolean)
          .map((line, i) => (
            <motion.p
              key={i}
              className="text-[13px] text-ink-2"
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: durations.base,
                ease: easings.enter,
                delay: (motionSafe ? 0.34 : 0) + i * cascade(3),
              }}
            >
              {line}
            </motion.p>
          ))}
      </div>
      <button
        type="button"
        onClick={() => onContinueShopping?.()}
        className={cn(
          "inline-flex h-9 items-center rounded-2 border border-hairline-strong bg-card px-3 text-[13px] text-foreground transition-colors hover:bg-surface-2",
          FOCUS,
        )}
      >
        Continue shopping
      </button>
    </motion.div>
  );

  let main: React.ReactNode;
  if (status === "loading") {
    main = (
      <div aria-hidden className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <span className="h-3 w-24 rounded-1 bg-ink-3/15" />
            <span
              className={cn(
                "h-9 rounded-2 bg-ink-3/10",
                motionSafe && "animate-pulse",
              )}
            />
          </div>
        ))}
      </div>
    );
  } else if (status === "error") {
    main = (
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-[13px] text-foreground">
          The checkout didn&apos;t load.
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={onRetry}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[13px] text-foreground transition-colors enabled:hover:bg-surface-2",
            FOCUS,
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Retry
        </button>
      </div>
    );
  } else {
    main = (
      <AnimatePresence initial={false} mode="popLayout">
        {confirmed ? (
          confirmation
        ) : (
          <motion.div
            key="flow"
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          >
            {steps === "stack" ? stackFlow : slideFlow}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  const side = summary === "side";
  const summaryBody = (
    <SummaryBody
      items={items}
      totals={totals}
      shipLabel={shipLabel}
      money={money}
      motionSafe={motionSafe}
    />
  );

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      aria-busy={status === "loading" || busy || undefined}
      onPointerDownCapture={() => {
        pressing.current = true;
      }}
      className={cn(
        "@container/co relative isolate w-full [scrollbar-width:thin] overflow-x-clip overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        className={cn(
          "grid gap-4 p-4 @min-[40rem]/co:gap-6 @min-[40rem]/co:p-5",
          side &&
            "@min-[40rem]/co:grid-cols-[minmax(0,1fr)_15rem] @min-[64rem]/co:grid-cols-[minmax(0,1fr)_20rem]",
        )}
      >
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2
              id={titleId}
              className="text-[15px] font-semibold text-foreground"
            >
              {title}
            </h2>
            <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2 text-[11px] text-ink-2">
              <Lock aria-hidden className="size-3" />
              Secure
            </span>
          </div>
          {status === "ready" && summary !== "off" ? (
            <SummaryBar
              uid={uid}
              totals={totals}
              motionSafe={motionSafe}
              money={money}
              className={side ? "@min-[40rem]/co:hidden" : undefined}
            >
              {summaryBody}
            </SummaryBar>
          ) : null}
          {/* Stacked, the sections are the step bar: numbered, checked, editable. */}
          {status === "ready" && (steps === "slide" || confirmed) ? (
            <StepBar
              uid={uid}
              current={current}
              furthest={furthest}
              done={done}
              confirmed={confirmed}
              motionSafe={motionSafe}
              disabled={disabled || busy}
              onJump={jump}
            />
          ) : null}
          {main}
        </div>
        {side && status === "ready" ? (
          <aside
            aria-label="Order summary"
            className="hidden self-start rounded-3 border border-hairline bg-surface-1 p-4 @min-[40rem]/co:sticky @min-[40rem]/co:top-5 @min-[40rem]/co:block"
          >
            <h3 className="mb-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Order summary
            </h3>
            {summaryBody}
          </aside>
        ) : null}
      </div>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
