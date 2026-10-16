"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import { CreditCard, Landmark, Plus, TriangleAlert, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type FailedChargeBandStyle = "edge" | "wash" | "outline";
export type FailedChargeTone = "soft" | "strong" | "mono";

export type FailedChargeInvoice = {
  id: string;
  /** As printed: "INV-2026-10". */
  number: string;
  amount: number;
  /** What the charge was for, in a word or two: "October". */
  label: string;
};

export type FailedChargeMethod = {
  id: string;
  /**
   * As it reads mid-sentence: "card ending 4417", "Coldbrook Bank account
   * ending 0921". Its first letter is raised where it starts a line.
   */
  label: string;
  kind: "card" | "bank";
};

/**
 * What the update form hands over: a saved method, or a new card's fields.
 * Pass a new card straight to your payment provider; never store it.
 */
export type FailedChargeChoice =
  | { kind: "saved"; method: FailedChargeMethod }
  | { kind: "new"; number: string; expiry: string; code: string };

type Async<T> = void | Promise<T>;

export type FailedChargeProps = {
  /** The invoice that failed. @default INV-2026-10, $284.00, October */
  invoice?: FailedChargeInvoice;
  /** The method the charge was tried on. @default card ending 4417 */
  method?: FailedChargeMethod;
  /** Other saved methods to choose from in the update. @default a bank account ending 0921 */
  methods?: FailedChargeMethod[];
  /** Days the account stays active after the first failure. @default 7 */
  graceDays?: number;
  /** When the charge first failed, in ms. @default Oct 15 2026 */
  failedAt?: number;
  /** The moment grace is counted at, in ms. @default Oct 17 2026, 14:00 UTC */
  now?: number;
  /** Why the first attempt failed. @default "The card was declined." */
  reason?: string;
  /** Controlled count of failed attempts; two or more shows the grace days. */
  attempts?: number;
  /** Initial failed attempts when uncontrolled. @default 1 */
  defaultAttempts?: number;
  /** Retry was pressed (or a new method was saved). Resolve when paid; reject with the reason. */
  onRetry?: (methodId: string) => Async<unknown>;
  /** The update form was submitted. Resolve with the method to retry on; reject to say why. */
  onUpdateMethod?: (
    choice: FailedChargeChoice,
  ) => Async<FailedChargeMethod | void>;
  /** Controlled: whether the banner is showing. */
  open?: boolean;
  /** Initial visibility when uncontrolled. @default true */
  defaultOpen?: boolean;
  /** The banner folded away: dismissed by the reader, or paid. */
  onDismiss?: (why: "user" | "paid") => void;
  /** Controlled: whether the update form is open. */
  expanded?: boolean;
  /** Initial form state when uncontrolled. @default false */
  defaultExpanded?: boolean;
  /** Fires from Update card, Cancel or Escape with the new state. */
  onExpandedChange?: (open: boolean) => void;
  /** How long "Payment received" stays before the banner folds, in ms. @default 1600 */
  foldDelay?: number;
  /** Where the colour sits. @default "edge" */
  bandStyle?: FailedChargeBandStyle;
  /** Corner radius in px. @default 10 */
  cornerRadius?: number;
  /** How loud the colour is. @default "soft" */
  tone?: FailedChargeTone;
  /** The product that stays active through the grace days. @default "Fernworks" */
  account?: string;
  /** How money is written. @default Intl USD */
  formatMoney?: (amount: number) => string;
  /** Classes for the region that holds the banner. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;

export const defaultFailedChargeInvoice: FailedChargeInvoice = {
  id: "inv-2026-10",
  number: "INV-2026-10",
  amount: 284,
  label: "October",
};

export const defaultFailedChargeMethod: FailedChargeMethod = {
  id: "card-4417",
  label: "card ending 4417",
  kind: "card",
};

export const defaultFailedChargeMethods: FailedChargeMethod[] = [
  {
    id: "bank-0921",
    label: "Coldbrook Bank account ending 0921",
    kind: "bank",
  },
];

const DEFAULT_FAILED_AT = Date.UTC(2026, 9, 15, 9);
const DEFAULT_NOW = Date.UTC(2026, 9, 17, 14);
const NEW_CARD = "new-card";

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const defaultMoney = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
/** Raises a label's first letter where it starts a line; never lowers a name. */
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "Insufficient funds." from "insufficient funds" — one sentence, one stop. */
const sentence = (s: string) => {
  const t = s.trim();
  if (!t) return t;
  const head = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(head) ? head : `${head}.`;
};

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
const dayLabel = (ms: number) => {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}`;
};
const startOfDay = (ms: number) => Math.floor(ms / DAY) * DAY;

const groupCard = (digits: string) =>
  digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
const formatExpiry = (digits: string) =>
  digits.length <= 2 ? digits : `${digits.slice(0, 2)} / ${digits.slice(2, 4)}`;

/**
 * The band's colour comes from one hue variable — danger while the charge
 * is failing, success once it lands — so the turn from red to green is a
 * plain colour transition on every part at once. Filled parts are pigment
 * (the hue at a fixed lightness) so they read the same in either theme;
 * the glyph and text keep the token.
 */
const TONES: Record<FailedChargeTone, Record<string, string>> = {
  soft: {
    "--fc-band": "oklch(from var(--fc-hue) 0.72 0.1 h)",
    "--fc-bg": "color-mix(in oklab, var(--fc-hue) 7%, var(--card))",
    "--fc-line": "color-mix(in oklab, var(--fc-hue) 26%, var(--hairline))",
    "--fc-chip": "color-mix(in oklab, var(--fc-hue) 14%, transparent)",
    "--fc-glyph": "var(--fc-hue)",
    "--fc-sweep": "color-mix(in oklab, var(--fc-hue) 12%, transparent)",
  },
  strong: {
    "--fc-band": "oklch(from var(--fc-hue) 0.62 c h)",
    "--fc-bg": "color-mix(in oklab, var(--fc-hue) 13%, var(--card))",
    "--fc-line": "color-mix(in oklab, var(--fc-hue) 50%, transparent)",
    "--fc-chip": "oklch(from var(--fc-hue) 0.62 c h)",
    "--fc-glyph": "var(--primary-foreground)",
    "--fc-sweep": "color-mix(in oklab, var(--fc-hue) 20%, transparent)",
  },
  mono: {
    "--fc-band": "oklch(from var(--fc-hue) 0.66 0.12 h)",
    "--fc-bg": "var(--card)",
    "--fc-line": "var(--hairline-strong)",
    "--fc-chip": "var(--bg-2)",
    "--fc-glyph": "var(--fc-hue)",
    "--fc-sweep": "color-mix(in oklab, var(--foreground) 6%, transparent)",
  },
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

type Phase = "failed" | "retrying" | "paid";
type FieldErrors = Partial<Record<"number" | "expiry" | "code", string>>;

/**
 * An in-app banner for a payment that didn't go through, fixable in place.
 * It names the invoice, the amount, the method and why it failed; Retry
 * tries the charge again and Update card opens a short form under the
 * message — a saved method, or a new card — that saves and retries in one
 * go. After a second failure it counts down the grace days left.
 *
 * The signature is sweep, turn, fold. While a retry is pending a tinted
 * fill sweeps across the banner behind the words on a long decelerating
 * tween; when the charge lands the sweep completes on `springs.glide`, the
 * band turns from muted red to green — one hue variable, so every part
 * changes together — the glyph becomes a check drawn on `springs.flick`,
 * and after `foldDelay` the banner folds itself away, its height running to
 * nothing on glide while it fades on the exit ease. A refusal drains the
 * sweep on the exit ease and simply states the reason: no shake, no
 * bounce, because a failure is not an event.
 *
 * The message is a polite live region, so retrying, received and declined
 * are each spoken once. Every control is a button; the form is a labelled
 * radiogroup of methods (arrows move) and real inputs with inline errors,
 * Enter submits and Escape closes it, returning focus to Update card. Under
 * reduced motion the sweep is a still, faint fill, the colour still turns
 * and the fold is a fade.
 */
export function FailedCharge({
  invoice = defaultFailedChargeInvoice,
  method: methodProp = defaultFailedChargeMethod,
  methods = defaultFailedChargeMethods,
  graceDays = 7,
  failedAt = DEFAULT_FAILED_AT,
  now = DEFAULT_NOW,
  reason: reasonProp = "The card was declined.",
  attempts: attemptsProp,
  defaultAttempts = 1,
  onRetry,
  onUpdateMethod,
  open: openProp,
  defaultOpen = true,
  onDismiss,
  expanded: expandedProp,
  defaultExpanded = false,
  onExpandedChange,
  foldDelay = 1600,
  bandStyle = "edge",
  cornerRadius = 10,
  tone = "soft",
  account = "Fernworks",
  formatMoney = defaultMoney,
  className,
}: FailedChargeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const formId = `${uid}-form`;

  /* -------------------------------- state -------------------------------- */

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const open = openProp ?? ownOpen;
  const [ownExpanded, setOwnExpanded] = React.useState(defaultExpanded);
  const expanded = expandedProp ?? ownExpanded;
  const [ownAttempts, setOwnAttempts] = React.useState(defaultAttempts);
  const attempts = attemptsProp ?? ownAttempts;
  const [phase, setPhase] = React.useState<Phase>("failed");
  const [reason, setReason] = React.useState(reasonProp);
  const [method, setMethod] = React.useState(methodProp);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const run = React.useRef(0);
  const sweepRun = React.useRef<AnimationPlaybackControls[]>([]);
  const foldTimer = React.useRef(0);

  // Shown again after a fold, the banner starts from the failure.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && phase === "paid") setPhase("failed");
  }

  // A host that hands over a new method or reason starts from them.
  const [seen, setSeen] = React.useState({ m: methodProp, r: reasonProp });
  if (seen.m !== methodProp || seen.r !== reasonProp) {
    setSeen({ m: methodProp, r: reasonProp });
    setMethod(methodProp);
    setReason(reasonProp);
  }

  const saved = [method, ...methods.filter((m) => m.id !== method.id)];
  const [choice, setChoice] = React.useState<string>(
    methods[0]?.id ?? NEW_CARD,
  );
  const [card, setCard] = React.useState({ number: "", expiry: "", code: "" });
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});

  const graceStart = startOfDay(failedAt);
  const graceEnd = graceStart + graceDays * DAY;
  const used = clamp(
    Math.floor((startOfDay(now) - graceStart) / DAY),
    0,
    graceDays,
  );
  const left = graceDays - used;
  const repeated = attempts >= 2;

  /* -------------------------------- sweep -------------------------------- */

  const sweep = useMotionValue(0);
  const halt = React.useCallback(() => {
    for (const c of sweepRun.current) c.stop();
    sweepRun.current = [];
  }, []);
  React.useEffect(
    () => () => {
      halt();
      window.clearTimeout(foldTimer.current);
    },
    [halt],
  );

  /* ------------------------------- actions ------------------------------- */

  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const updateRef = React.useRef<HTMLButtonElement | null>(null);

  const setExpanded = (next: boolean) => {
    if (expandedProp === undefined) setOwnExpanded(next);
    onExpandedChange?.(next);
  };

  const fold = (why: "user" | "paid") => {
    window.clearTimeout(foldTimer.current);
    // Focus inside a banner that is leaving would fall to the page; park it
    // on the region that stays.
    const wrap = wrapRef.current;
    if (wrap && wrap.contains(document.activeElement)) {
      wrap.focus({ preventScroll: true });
    }
    if (openProp === undefined) setOwnOpen(false);
    onDismiss?.(why);
  };

  const retry = (on: FailedChargeMethod = method) => {
    if (phase !== "failed") return;
    const id = ++run.current;
    halt();
    setPhase("retrying");
    setFormError(null);
    if (motionSafe) {
      sweep.jump(0);
      // Long and decelerating: it never claims to be done before it is.
      sweepRun.current = [
        animate(sweep, 0.86, { duration: 2.6, ease: easings.enter }),
      ];
    } else {
      sweep.jump(1);
    }
    const land = () => {
      if (run.current !== id) return;
      halt();
      sweepRun.current = [
        animate(sweep, 1, motionSafe ? springs.glide : { duration: 0 }),
      ];
      // Retry and Update leave with the failure; focus inside them would
      // fall to the page, so it waits on the region until the fold.
      const wrap = wrapRef.current;
      if (wrap && wrap.contains(document.activeElement)) {
        wrap.focus({ preventScroll: true });
      }
      setPhase("paid");
      foldTimer.current = window.setTimeout(
        () => fold("paid"),
        Math.max(0, foldDelay),
      );
    };
    const refuse = (why: unknown) => {
      if (run.current !== id) return;
      halt();
      // The sweep drains through its exit; nothing bounces on a refusal.
      const message =
        why instanceof Error && why.message
          ? why.message
          : "The charge was declined again.";
      setReason(message);
      setPhase("failed");
      if (attemptsProp === undefined) setOwnAttempts((a) => a + 1);
    };
    const result = onRetry?.(on.id);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).then(land, refuse);
    } else {
      land();
    }
  };

  const validate = (): FieldErrors => {
    const out: FieldErrors = {};
    const digits = card.number.replace(/\D/g, "");
    if (digits.length < 12 || digits.length > 19)
      out.number = "Enter the full card number.";
    const exp = card.expiry.replace(/\D/g, "");
    const month = Number(exp.slice(0, 2));
    const year = 2000 + Number(exp.slice(2, 4));
    const nowDate = new Date(now);
    const thisMonth = nowDate.getUTCFullYear() * 12 + nowDate.getUTCMonth();
    if (
      exp.length !== 4 ||
      month < 1 ||
      month > 12 ||
      year * 12 + (month - 1) < thisMonth
    )
      out.expiry = "Enter a future expiry as MM / YY.";
    const code = card.code.replace(/\D/g, "");
    if (code.length < 3 || code.length > 4)
      out.code = "Enter the 3 or 4 digit code.";
    return out;
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || phase !== "failed") return;
    let picked: FailedChargeChoice;
    if (choice === NEW_CARD) {
      const errors = validate();
      setFieldErrors(errors);
      const first = (["number", "expiry", "code"] as const).find(
        (k) => errors[k],
      );
      if (first) {
        event.currentTarget
          .querySelector<HTMLInputElement>(`[data-fc-field="${first}"]`)
          ?.focus();
        return;
      }
      picked = {
        kind: "new",
        number: card.number.replace(/\D/g, ""),
        expiry: card.expiry,
        code: card.code,
      };
    } else {
      const m = saved.find((x) => x.id === choice) ?? method;
      picked = { kind: "saved", method: m };
    }
    const fallback: FailedChargeMethod =
      picked.kind === "saved"
        ? picked.method
        : {
            id: `card-${picked.number.slice(-4)}`,
            label: `card ending ${picked.number.slice(-4)}`,
            kind: "card",
          };
    const go = (m: FailedChargeMethod | void) => {
      const next = m ?? fallback;
      setSaving(false);
      setMethod(next);
      setCard({ number: "", expiry: "", code: "" });
      setExpanded(false);
      // Focus would leave with the form; keep it on the banner's Retry path.
      updateRef.current?.focus({ preventScroll: true });
      retry(next);
    };
    const result = onUpdateMethod?.(picked);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setSaving(true);
      setFormError(null);
      (result as Promise<FailedChargeMethod | void>).then(
        go,
        (why: unknown) => {
          setSaving(false);
          setFormError(
            why instanceof Error && why.message
              ? why.message
              : "That method couldn't be saved.",
          );
        },
      );
    } else {
      go(undefined);
    }
  };

  const closeForm = () => {
    setExpanded(false);
    setFieldErrors({});
    setFormError(null);
    const t = updateRef.current;
    if (t?.isConnected) t.focus({ preventScroll: true });
  };

  const methodKeys = (event: React.KeyboardEvent, index: number) => {
    const ids = [...saved.map((m) => m.id), NEW_CARD];
    let next = -1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight")
      next = (index + 1) % ids.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft")
      next = (index - 1 + ids.length) % ids.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = ids.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const id = ids[next];
    if (!id) return;
    setChoice(id);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLElement>("[role=radio]")
      [next]?.focus();
  };

  /* -------------------------------- render ------------------------------- */

  const paid = phase === "paid";
  const amount = formatMoney(invoice.amount);
  const title = paid
    ? `Payment received. ${amount} paid with ${method.label}.`
    : phase === "retrying"
      ? `Trying ${method.label} again…`
      : repeated
        ? `Declined again. ${sentence(reason)}`
        : `Your ${invoice.label} payment of ${amount} didn't go through.`;
  const detail = paid
    ? `${invoice.number} is settled. Thank you.`
    : repeated || phase === "retrying"
      ? `${invoice.number} · ${amount} · ${upperFirst(method.label)}`
      : `${sentence(reason)} ${invoice.number} · ${upperFirst(method.label)}`;

  const hue = paid ? "var(--success)" : "var(--danger)";
  const radius = clamp(cornerRadius, 0, 24);
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-[12px] font-medium whitespace-nowrap transition-[background-color,opacity,translate] active:translate-y-px",
    FOCUS,
  );

  const field = (
    key: "number" | "expiry" | "code",
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement>,
    format: (digits: string) => string,
    max: number,
  ) => (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] leading-4 text-ink-2">{label}</span>
      <input
        {...props}
        data-fc-field={key}
        value={card[key]}
        aria-invalid={fieldErrors[key] ? true : undefined}
        aria-describedby={fieldErrors[key] ? `${uid}-${key}-error` : undefined}
        onChange={(event) => {
          const digits = event.currentTarget.value
            .replace(/\D/g, "")
            .slice(0, max);
          setCard((c) => ({ ...c, [key]: format(digits) }));
          if (fieldErrors[key])
            setFieldErrors((e) => ({ ...e, [key]: undefined }));
        }}
        className={cn(
          "h-8 w-full min-w-0 rounded-2 border bg-background px-2.5 font-mono text-[12px] text-foreground tabular-nums placeholder:text-ink-3",
          FOCUS,
          fieldErrors[key] ? "border-danger" : "border-input",
        )}
      />
      {fieldErrors[key] ? (
        <span
          id={`${uid}-${key}-error`}
          className="text-[11px] leading-4 text-danger"
        >
          {fieldErrors[key]}
        </span>
      ) : null}
    </label>
  );

  const form = (
    <form
      id={formId}
      noValidate
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          closeForm();
        }
      }}
      className="flex flex-col gap-3 border-t border-[var(--fc-line)] px-3.5 pt-3 pb-3.5 @min-[34rem]:pl-[3.625rem]"
    >
      <div
        role="radiogroup"
        aria-label="Pay with"
        className="flex flex-col gap-1.5"
      >
        {[...saved, null].map((m, i) => {
          const id = m ? m.id : NEW_CARD;
          const checked = choice === id;
          const failedOne = m?.id === method.id;
          const Icon = !m ? Plus : m.kind === "bank" ? Landmark : CreditCard;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => setChoice(id)}
              onKeyDown={(event) => methodKeys(event, i)}
              className={cn(
                "relative flex h-9 min-w-0 items-center gap-2.5 rounded-2 border px-2.5 text-left text-[12px] transition-colors",
                FOCUS,
                checked
                  ? "border-transparent text-foreground"
                  : "border-hairline text-ink-2 hover:border-hairline-strong",
              )}
            >
              {checked ? (
                <motion.span
                  layoutId={`${uid}-method`}
                  aria-hidden
                  className="absolute -inset-px rounded-[inherit] border-2 border-foreground/70"
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "relative flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                  checked ? "border-foreground" : "border-hairline-strong",
                )}
              >
                {checked ? (
                  <span className="size-1.5 rounded-full bg-foreground" />
                ) : null}
              </span>
              <Icon
                aria-hidden
                className="relative size-3.5 shrink-0 text-ink-3"
              />
              <span className="relative min-w-0 flex-1 truncate">
                {m ? upperFirst(m.label) : "Add a card"}
              </span>
              {failedOne ? (
                <span className="relative shrink-0 font-mono text-[10px] text-danger uppercase">
                  Declined
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {choice === NEW_CARD ? (
          <motion.div
            key="card"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{
              height: 0,
              opacity: 0,
              transition: exitFor(durations.fast),
            }}
            transition={
              motionSafe
                ? {
                    height: springs.glide,
                    opacity: { duration: durations.base },
                  }
                : { duration: 0 }
            }
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-2 p-px @min-[34rem]:grid-cols-[minmax(0,1fr)_6rem_5rem]">
              <div className="col-span-2 @min-[34rem]:col-span-1">
                {field(
                  "number",
                  "Card number",
                  {
                    inputMode: "numeric",
                    autoComplete: "cc-number",
                    placeholder: "0000 0000 0000 0000",
                  },
                  groupCard,
                  19,
                )}
              </div>
              {field(
                "expiry",
                "Expiry",
                {
                  inputMode: "numeric",
                  autoComplete: "cc-exp",
                  placeholder: "MM / YY",
                },
                formatExpiry,
                4,
              )}
              {field(
                "code",
                "Security code",
                {
                  inputMode: "numeric",
                  autoComplete: "cc-csc",
                  placeholder: "123",
                },
                (d) => d,
                4,
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {formError ? (
        <p
          role="alert"
          className="flex items-start gap-2 text-[12px] leading-4 text-danger"
        >
          <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          aria-disabled={saving || undefined}
          aria-busy={saving || undefined}
          className={cn(
            button,
            "bg-foreground text-background hover:opacity-90",
          )}
        >
          {saving ? "Saving…" : `Save and pay ${amount}`}
        </button>
        <button
          type="button"
          onClick={closeForm}
          className={cn(
            button,
            "font-normal text-ink-2 hover:bg-[color-mix(in_oklab,var(--foreground)_6%,transparent)] hover:text-foreground",
          )}
        >
          Cancel
        </button>
      </div>
    </form>
  );

  const banner = (
    <motion.div
      key="banner"
      className="overflow-hidden"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={
        motionSafe
          ? {
              height: 0,
              opacity: 0,
              transition: {
                height: springs.glide,
                opacity: exitFor(durations.base),
              },
            }
          : { opacity: 0, transition: { duration: durations.base } }
      }
      transition={
        motionSafe
          ? { height: springs.glide, opacity: { duration: durations.base } }
          : { duration: 0 }
      }
    >
      <div
        data-fc-banner=""
        className={cn(
          "relative overflow-hidden border transition-[background-color,border-color] duration-500",
          bandStyle === "wash" && "border-[var(--fc-line)] bg-[var(--fc-bg)]",
          bandStyle === "edge" && "border-hairline bg-card",
          bandStyle === "outline" &&
            "border-[color-mix(in_oklab,var(--fc-hue)_48%,transparent)] bg-card",
        )}
        style={{ borderRadius: radius }}
      >
        <AnimatePresence initial={false}>
          {phase !== "failed" ? (
            <motion.span
              key="sweep"
              aria-hidden
              className="absolute inset-0 bg-[var(--fc-sweep)] transition-[background-color] duration-500"
              style={{ scaleX: sweep, originX: 0 }}
              initial={{ opacity: motionSafe ? 1 : 0.6 }}
              animate={{ opacity: motionSafe ? 1 : 0.6 }}
              exit={{ opacity: 0, transition: exitFor(durations.base) }}
            />
          ) : null}
        </AnimatePresence>
        {bandStyle === "edge" ? (
          <span
            aria-hidden
            className="absolute top-0 bottom-0 left-0 w-1 bg-[var(--fc-band)] transition-[background-color] duration-500"
          />
        ) : null}

        <div className="relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-3.5 py-3 @min-[34rem]:grid-cols-[auto_minmax(0,1fr)_auto_auto] @min-[34rem]:items-center">
          <span
            aria-hidden
            className="col-start-1 row-start-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--fc-chip)] text-[var(--fc-glyph)] transition-[background-color,color] duration-500"
          >
            <AnimatePresence initial={false} mode="popLayout">
              {paid ? (
                <motion.svg
                  key="check"
                  viewBox="0 0 16 16"
                  className="size-4"
                  fill="none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: durations.fast }}
                >
                  <motion.path
                    d="M 3.5 8.4 L 6.6 11.4 L 12.5 4.8"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={motionSafe ? { pathLength: 0 } : false}
                    animate={{ pathLength: 1 }}
                    transition={
                      motionSafe
                        ? { ...springs.flick, delay: 0.12 }
                        : { duration: 0 }
                    }
                  />
                </motion.svg>
              ) : (
                <motion.span
                  key="alert"
                  className="flex"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                >
                  <TriangleAlert className="size-4" />
                </motion.span>
              )}
            </AnimatePresence>
          </span>

          <div className="col-start-2 row-start-1 flex min-w-0 flex-col gap-0.5">
            <p
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="text-[13px] leading-5 font-medium text-foreground"
            >
              {title}
              <span className="sr-only"> {detail}</span>
            </p>
            <p
              aria-hidden
              className="text-[12px] leading-4 text-pretty text-ink-3"
              title={detail}
            >
              {detail}
            </p>
            {repeated && !paid ? (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span aria-hidden className="flex items-center gap-[3px]">
                  {Array.from({ length: graceDays }, (_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-1.5 w-2.5 rounded-full",
                        i < used
                          ? "bg-[var(--fc-band)]"
                          : "bg-[color-mix(in_oklab,var(--foreground)_14%,transparent)]",
                      )}
                    />
                  ))}
                </span>
                <span className="text-[11px] leading-4 text-ink-2">
                  {plural(left, "grace day")} of {graceDays} left. {account}{" "}
                  stays active until {dayLabel(graceEnd)}.
                </span>
              </div>
            ) : null}
          </div>

          {!paid ? (
            <div className="col-span-2 col-start-2 row-start-2 flex flex-wrap items-center gap-2 @min-[34rem]:col-span-1 @min-[34rem]:col-start-3 @min-[34rem]:row-start-1">
              <button
                type="button"
                onClick={() => {
                  // Busy buttons stay focusable, so the guard lives here.
                  if (!saving) retry();
                }}
                aria-disabled={phase === "retrying" || saving || undefined}
                aria-busy={phase === "retrying" || undefined}
                className={cn(
                  button,
                  "bg-foreground text-background hover:opacity-90",
                )}
              >
                {phase === "retrying" ? "Retrying…" : "Retry"}
              </button>
              <button
                ref={updateRef}
                type="button"
                aria-expanded={expanded}
                aria-controls={expanded ? formId : undefined}
                onClick={() => {
                  if (expanded) closeForm();
                  else setExpanded(true);
                }}
                className={cn(
                  button,
                  "border border-[var(--fc-line)] bg-[color-mix(in_oklab,var(--card)_70%,transparent)] text-foreground hover:bg-card",
                )}
              >
                Update {method.kind === "bank" ? "method" : "card"}
              </button>
            </div>
          ) : null}

          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => fold("user")}
            className={cn(
              "col-start-3 row-start-1 inline-flex size-8 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-[color-mix(in_oklab,var(--foreground)_6%,transparent)] hover:text-foreground @min-[34rem]:col-start-4",
              FOCUS,
            )}
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        <AnimatePresence initial={false}>
          {expanded && !paid ? (
            <motion.div
              key="form"
              className="relative overflow-hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{
                height: 0,
                opacity: 0,
                transition: exitFor(durations.base),
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
              {form}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );

  return (
    <div
      ref={wrapRef}
      tabIndex={-1}
      role="region"
      aria-label="Payment problem"
      className={cn("@container w-full outline-none", className)}
      style={
        {
          "--fc-hue": hue,
          ...TONES[tone in TONES ? tone : "soft"],
        } as React.CSSProperties
      }
    >
      <AnimatePresence initial={false}>{open ? banner : null}</AnimatePresence>
    </div>
  );
}
