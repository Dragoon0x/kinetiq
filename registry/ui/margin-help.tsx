"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MarginHelpKind = "text" | "email" | "select" | "textarea";

export type MarginHelpHelp = {
  /** One or two sentences: what the field is for, where the answer lives. */
  text: string;
  /** A filled-in answer, shown on a mono plate. */
  example?: string;
  /** Somewhere to read more. */
  link?: { label: string; href: string };
};

export type MarginHelpField = {
  /** The key in the values record. */
  id: string;
  label: string;
  /** @default "text" */
  kind?: MarginHelpKind;
  /** Submit refuses an empty answer. @default false */
  required?: boolean;
  placeholder?: string;
  /** Select kind: the choices. */
  options?: string[];
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  /** The error for this answer, or null when it is fine. Runs after the required check. */
  validate?: (value: string, values: Record<string, string>) => string | null;
  /** What the rail shows beside this field. Omit it and the rail stays empty. */
  help?: MarginHelpHelp;
};

export type MarginHelpCardStyle = "card" | "note" | "margin";
export type MarginHelpStatus = "ready" | "loading" | "error";

export type MarginHelpProps = {
  /** The form, in order. @default defaultMarginHelpFields */
  fields?: MarginHelpField[];
  /** Controlled answers, by field id. */
  value?: Record<string, string>;
  /** Initial answers when uncontrolled. @default defaultMarginHelpValues */
  defaultValue?: Record<string, string>;
  /** Fires from the keystroke or choice that changed an answer, with every answer and the field's id. */
  onChange?: (values: Record<string, string>, fieldId: string) => void;
  /** Fires when Send is pressed with every answer valid. Return a promise to hold the button until it settles. */
  onSubmit?: (values: Record<string, string>) => void | Promise<unknown>;
  /** Fires when the field the rail follows changes. */
  onFieldFocus?: (fieldId: string) => void;
  /** A help link was followed. Call `event.preventDefault()` to handle it yourself. */
  onHelpLink?: (
    fieldId: string,
    link: { label: string; href: string },
    event: React.MouseEvent<HTMLAnchorElement>,
  ) => void;
  /** Controlled: whether the help rail shows. */
  showHelp?: boolean;
  /** Initial rail state when uncontrolled. @default true */
  defaultShowHelp?: boolean;
  /** Fires from the Help switch. */
  onShowHelpChange?: (show: boolean) => void;
  /** The help rail's width in px. @default 240 */
  railWidth?: number;
  /** A raised card with a notch, a tinted note with an accent edge, or a bare margin note. @default "card" */
  cardStyle?: MarginHelpCardStyle;
  /** How the card lands beside a field, 0 to 1: 0 glides in without overshoot, 1 lands with two bounces. @default 0.35 */
  springiness?: number;
  /** Links, the focused label, the note's edge and Send — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The form's heading and accessible name. @default "Wholesale account" */
  heading?: string;
  /** The line under the heading. @default "Coldbrook Roasters · step 2 of 3" */
  subheading?: string;
  /** @default "Send application" */
  submitLabel?: string;
  /** Whether the form has loaded. @default "ready" */
  status?: MarginHelpStatus;
  /** "Try again" was pressed after the form failed to load. */
  onRetry?: () => void;
  /** The form's height in px; the fields and rail scroll inside it. @default 540 */
  height?: number;
  /** Nothing can be typed or sent. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const digits = (v: string) => v.replace(/[\s-]/g, "");

/** A café applying for a Coldbrook wholesale account, step 2 of 3. */
export const defaultMarginHelpFields: MarginHelpField[] = [
  {
    id: "business",
    label: "Business name",
    required: true,
    autoComplete: "organization",
    placeholder: "As registered",
    help: {
      text: "The legal name on your registration, which may differ from the name over the door.",
      example: "Halden Street Roasters Ltd",
      link: { label: "Find your registered name", href: "#registered-name" },
    },
  },
  {
    id: "taxId",
    label: "Tax number",
    required: true,
    inputMode: "numeric",
    placeholder: "9 digits",
    validate: (v) =>
      /^\d{9}$/.test(digits(v))
        ? null
        : "Use the 9 digits from your registration letter",
    help: {
      text: "Nine digits, printed under your business name on the registration letter. Spaces are fine.",
      example: "482 117 093",
      link: { label: "Where to find it", href: "#tax-number" },
    },
  },
  {
    id: "email",
    label: "Orders email",
    kind: "email",
    required: true,
    autoComplete: "email",
    placeholder: "orders@yourcafe.com",
    validate: (v) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
        ? null
        : "Use an address like orders@yourcafe.com",
    help: {
      text: "Delivery slots and invoices go here. A shared inbox means nobody misses a drop.",
      example: "orders@haldenstreet.co",
    },
  },
  {
    id: "volume",
    label: "Weekly volume",
    kind: "select",
    required: true,
    options: ["Under 5 kg", "5–20 kg", "20–50 kg", "Over 50 kg"],
    help: {
      text: "Sets your price tier. You can change it after the first month without a new application.",
      example: "Most cafés start at 5–20 kg.",
      link: { label: "See the price tiers", href: "#price-tiers" },
    },
  },
  {
    id: "po",
    label: "Purchase order reference",
    placeholder: "If your accounts team uses one",
  },
  {
    id: "delivery",
    label: "Delivery notes",
    kind: "textarea",
    placeholder: "Gate codes, access, hours",
    help: {
      text: "Anything the driver needs: gate codes, step-free access, hours to avoid.",
      example: "Rear door on Mill Lane, buzzer 2. Before 9am please.",
    },
  },
];

export const defaultMarginHelpValues: Record<string, string> = {
  business: "Halden Street Roasters",
  taxId: "482 117 09",
  email: "",
  volume: "5–20 kg",
  po: "",
  delivery: "",
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

/** Below this container width the help folds into a line under each field. */
const WIDE_MIN = 640;

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FIELD_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-ring";

const r1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

const listWords = (words: string[]) =>
  words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

/**
 * The card's landing, between the two calibrated springs it can be: glide
 * (settles without overshoot) at 0 and recoil (two visible bounces) at 1.
 */
const landing = (s: number) => {
  const t = clamp(s, 0, 1);
  return {
    type: "spring" as const,
    stiffness: r1(lerp(springs.glide.stiffness, springs.recoil.stiffness, t)),
    damping: r1(lerp(springs.glide.damping, springs.recoil.damping, t)),
    mass: 1,
  };
};

function errorOf(
  field: MarginHelpField,
  values: Record<string, string>,
): string | null {
  const v = values[field.id] ?? "";
  if (v.trim() === "") {
    return field.required ? `${field.label} is required` : null;
  }
  return field.validate ? field.validate(v, values) : null;
}

/** A number whose digits roll toward the direction it moved, on snap. */
function Rolling({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const [seen, setSeen] = React.useState(value);
  const [dir, setDir] = React.useState(1);
  if (seen !== value) {
    setDir(value > seen ? 1 : -1);
    setSeen(value);
  }
  return (
    <span
      aria-hidden
      className="relative inline-flex h-4 justify-center overflow-clip tabular-nums"
      style={{ width: `${String(value).length}ch` }}
    >
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.span
          key={value}
          custom={dir}
          className="inline-block leading-4"
          variants={{
            enter: (d: number) => ({ opacity: 0, y: motionSafe ? d * 8 : 0 }),
            shown: { opacity: 1, y: 0 },
            leave: (d: number) => ({
              opacity: 0,
              y: motionSafe ? -d * 8 : 0,
              transition: exitFor(durations.fast),
            }),
          }}
          initial="enter"
          animate="shown"
          exit="leave"
          transition={
            motionSafe
              ? { y: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The form                                 */
/* ----------------------------------------------------------------------- */

/**
 * A form with a help rail. Each field can carry a short explanation, an
 * example and a link; focusing the field glides its help card down the rail
 * until the card sits level with it, on a spring whose landing is
 * `springiness` — from glide, which settles without overshoot, to recoil,
 * which lands with two bounces. The card's content cross-fades in one cell
 * while its measured height glides, and its notch slides along the edge so
 * it always points at the field, even when the card is held at the bottom
 * of the form. A field without help leaves the rail empty. An error opens
 * as a band at the top of the card on snap, as well as under the field.
 *
 * Every answer's help is its field's description, so the rail describes the
 * focused field to assistive technology without a live region; the help
 * link is reachable in the tab order right after its field, and Escape on
 * the link goes back to the field. The Help switch hides the rail (its
 * width glides away) and below a 40rem container the help becomes an
 * expandable line under each field. Under reduced motion the card fades
 * out at one field and in at the next, without travel.
 */
export function MarginHelp({
  fields = defaultMarginHelpFields,
  value,
  defaultValue,
  onChange,
  onSubmit,
  onFieldFocus,
  onHelpLink,
  showHelp,
  defaultShowHelp = true,
  onShowHelpChange,
  railWidth = 240,
  cardStyle = "card",
  springiness = 0.35,
  accent = "var(--accent-bright)",
  heading = "Wholesale account",
  subheading = "Coldbrook Roasters · step 2 of 3",
  submitLabel = "Send application",
  status = "ready",
  onRetry,
  height = 540,
  disabled = false,
  className,
}: MarginHelpProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const headingId = `${uid}-heading`;
  const ready = status === "ready";
  const locked = disabled || !ready;
  const rail = Math.round(clamp(railWidth, 160, 400));

  const [own, setOwn] = React.useState<Record<string, string>>(
    () => defaultValue ?? defaultMarginHelpValues,
  );
  const values = value ?? own;
  const [ownHelp, setOwnHelp] = React.useState(defaultShowHelp);
  const helpOn = showHelp ?? ownHelp;

  const firstHelped = fields.find((f) => f.help)?.id ?? fields[0]?.id ?? "";
  const [active, setActive] = React.useState<string>(firstHelped);
  const [shown, setShown] = React.useState<string>(firstHelped);
  const [touched, setTouched] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [attempted, setAttempted] = React.useState(false);
  const [sending, setSending] = React.useState<
    "idle" | "pending" | "sent" | "failed"
  >("idle");
  const [open, setOpen] = React.useState<ReadonlySet<string>>(() => new Set());
  const [focusAsk, setFocusAsk] = React.useState<{
    selector: string;
    n: number;
  } | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const activeField = fields.find((f) => f.id === active);
  const shownField = fields.find((f) => f.id === shown);
  const visible = !!activeField?.help;
  const errors = new Map(fields.map((f) => [f.id, errorOf(f, values)]));
  const showError = (f: MarginHelpField) =>
    (touched.has(f.id) || attempted) && !!errors.get(f.id);
  const required = fields.filter((f) => f.required);
  const done = required.filter((f) => !errors.get(f.id)).length;

  /* ------------------------------- refs --------------------------------- */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const formRef = React.useRef<HTMLDivElement | null>(null);
  const railRef = React.useRef<HTMLDivElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const cardBodyRef = React.useRef<HTMLDivElement | null>(null);
  const measureRef = React.useRef<() => void>(() => {});
  const alive = React.useRef(false);
  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const target = React.useRef<{ y: number; notch: number } | null>(null);

  const y = useMotionValue(0);
  const notch = useMotionValue(36);
  const cardH = useMotionValue<number | "auto">("auto");
  const cardO = useMotionValue(1);
  const cardShift = useMotionValue(0);

  React.useEffect(() => {
    alive.current = true;
    const list = runs;
    return () => {
      alive.current = false;
      for (const c of list.current) c.stop();
      list.current = [];
    };
  }, []);

  // After every commit the card is placed again: the focused field may have
  // moved (an error line opened above it), or the card grown.
  React.useLayoutEffect(() => {
    measureRef.current = () => {
      const railEl = railRef.current;
      const form = formRef.current;
      const card = cardRef.current;
      if (!railEl || !form || !card) return;
      const row = form.querySelector<HTMLElement>(
        `[data-mh-field="${CSS.escape(active)}"]`,
      );
      const control = row?.querySelector<HTMLElement>("[data-mh-control]");
      if (!row || !control) return;
      const rb = railEl.getBoundingClientRect();
      // Screen rects, divided back to layout space if an ancestor is scaled.
      const k = rb.height / (railEl.offsetHeight || 1) || 1;
      const rowTop = (row.getBoundingClientRect().top - rb.top) / k;
      const cb = control.getBoundingClientRect();
      const pointAt = (cb.top - rb.top + cb.height / 2) / k;
      const h = card.offsetHeight;
      const room = railEl.offsetHeight;
      const ty = r1(clamp(rowTop, 0, Math.max(0, room - h - 4)));
      const tn = r1(clamp(pointAt - ty, 14, Math.max(14, h - 14)));
      const prev = target.current;
      if (prev && prev.y === ty && prev.notch === tn) return;
      target.current = { y: ty, notch: tn };
      for (const c of runs.current) c.stop();
      if (!prev || !motionSafe || cardO.get() < 0.05) {
        y.jump(ty);
        notch.jump(tn);
        runs.current = [];
        return;
      }
      const spring = landing(springiness);
      runs.current = [animate(y, ty, spring), animate(notch, tn, spring)];
    };
    measureRef.current();
  });

  // Fade the card in or out as the focused field has help or not; under
  // reduced motion a move is a fade out here and in there.
  React.useEffect(() => {
    const c = animate(cardO, visible ? 1 : 0, {
      duration: visible ? durations.base : durations.fast,
      ease: visible ? easings.enter : easings.exit,
    });
    const s = animate(cardShift, visible || !motionSafe ? 0 : distances.nudge, {
      duration: durations.base,
      ease: easings.enter,
    });
    return () => {
      c.stop();
      s.stop();
    };
  }, [visible, motionSafe, cardO, cardShift]);

  React.useEffect(() => {
    if (motionSafe || !visible) return;
    const c = animate(cardO, [0.2, 1], {
      duration: durations.fast,
      ease: easings.enter,
    });
    return () => c.stop();
  }, [active, motionSafe, visible, cardO]);

  // The card's height follows its content on glide; the rail follows the
  // form's size. Both re-place the card.
  React.useEffect(() => {
    const body = cardBodyRef.current;
    const form = formRef.current;
    if (!body || !form) return;
    let first = true;
    let run: AnimationPlaybackControls | null = null;
    const ro = new ResizeObserver(() => {
      const h = body.offsetHeight;
      run?.stop();
      if (first || !motionSafe) {
        cardH.jump(h);
        first = false;
      } else {
        run = animate(cardH, h, springs.glide);
      }
      measureRef.current();
    });
    ro.observe(body);
    ro.observe(form);
    return () => {
      ro.disconnect();
      run?.stop();
    };
  }, [cardH, motionSafe, status]);

  React.useEffect(() => {
    if (!focusAsk) return;
    rootRef.current
      ?.querySelector<HTMLElement>(focusAsk.selector)
      ?.focus({ preventScroll: false });
  }, [focusAsk]);

  /* ------------------------------ actions ------------------------------- */

  const railShows = () =>
    helpOn && (rootRef.current?.offsetWidth ?? 0) >= WIDE_MIN;

  const activate = (id: string) => {
    if (id === active) return;
    setActive(id);
    const f = fields.find((x) => x.id === id);
    if (f?.help) setShown(id);
    onFieldFocus?.(id);
  };

  const ask = (selector: string) =>
    setFocusAsk((f) => ({ selector, n: (f?.n ?? 0) + 1 }));

  const setAnswer = (id: string, text: string) => {
    if (locked) return;
    const next = { ...values, [id]: text };
    if (value === undefined) setOwn(next);
    onChange?.(next, id);
    if (sending === "sent" || sending === "failed") setSending("idle");
  };

  const setHelp = (on: boolean) => {
    if (showHelp === undefined) setOwnHelp(on);
    onShowHelpChange?.(on);
    say(on ? "Help shown beside the form." : "Help hidden.");
  };

  const controlSelector = (id: string) =>
    `[data-mh-field="${CSS.escape(id)}"] [data-mh-control]`;

  const submit = () => {
    if (locked || sending === "pending") return;
    setAttempted(true);
    const bad = fields.filter((f) => errors.get(f.id));
    if (bad.length > 0) {
      say(
        `${plural(bad.length, "answer needs", "answers need")} fixing: ${listWords(bad.map((f) => f.label))}.`,
      );
      const first = bad[0];
      if (first) ask(controlSelector(first.id));
      return;
    }
    const result = onSubmit?.(values);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setSending("pending");
      say("Sending your application.");
      (result as Promise<unknown>).then(
        () => {
          if (!alive.current) return;
          setSending("sent");
          say("Application sent. We'll reply within two working days.");
        },
        () => {
          if (!alive.current) return;
          setSending("failed");
          say("It didn't send. Your answers are kept.");
        },
      );
    } else {
      setSending("sent");
      say("Application sent. We'll reply within two working days.");
    }
  };

  /** Tab from a field goes to its help link; Shift+Tab into the previous one's. */
  const onFieldKeyDown = (
    event: React.KeyboardEvent<HTMLElement>,
    f: MarginHelpField,
    index: number,
  ) => {
    if (event.key !== "Tab" || !railShows()) return;
    if (!event.shiftKey && f.help?.link) {
      event.preventDefault();
      rootRef.current
        ?.querySelector<HTMLElement>(`[data-mh-link="${CSS.escape(f.id)}"]`)
        ?.focus();
      return;
    }
    const prev = fields[index - 1];
    if (event.shiftKey && prev?.help?.link) {
      event.preventDefault();
      activate(prev.id);
      ask(`[data-mh-link="${CSS.escape(prev.id)}"]`);
    }
  };

  const onLinkKeyDown = (
    event: React.KeyboardEvent<HTMLAnchorElement>,
    f: MarginHelpField,
  ) => {
    const index = fields.findIndex((x) => x.id === f.id);
    if (event.key === "Escape") {
      // Ours: back to the field, and the stage stays open.
      event.preventDefault();
      ask(controlSelector(f.id));
    } else if (event.key === "Tab") {
      event.preventDefault();
      if (event.shiftKey) {
        ask(controlSelector(f.id));
        return;
      }
      const next = fields[index + 1];
      if (next) {
        activate(next.id);
        ask(controlSelector(next.id));
      } else ask("[data-mh-submit]");
    }
  };

  /* ------------------------------- render ------------------------------- */

  const helpBody = (f: MarginHelpField, where: "rail" | "inline") => {
    const help = f.help;
    if (!help) return null;
    const err = showError(f) ? errors.get(f.id) : null;
    return (
      <div className="flex flex-col gap-2">
        {where === "rail" ? (
          <AnimatePresence initial={false}>
            {err ? (
              <motion.div
                key="error"
                className="overflow-hidden"
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
                        height: springs.snap,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
              >
                <p className="flex items-start gap-1.5 rounded-2 bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] px-2 py-1.5 text-[12px] leading-4 text-danger">
                  <TriangleAlert
                    aria-hidden
                    className="mt-px size-3.5 shrink-0"
                  />
                  {err}
                </p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        ) : null}
        {where === "rail" ? (
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {f.label}
          </p>
        ) : null}
        <p className="text-[13px] leading-5 text-foreground">{help.text}</p>
        {help.example ? (
          <p className="rounded-2 border border-hairline bg-card px-2 py-1.5 font-mono text-[11px] leading-4 break-words text-ink-2">
            <span className="text-ink-3">e.g. </span>
            {help.example}
          </p>
        ) : null}
        {help.link ? (
          <a
            href={help.link.href}
            data-mh-link={where === "rail" ? f.id : undefined}
            onKeyDown={
              where === "rail" ? (event) => onLinkKeyDown(event, f) : undefined
            }
            onClick={(event) => {
              if (help.link) onHelpLink?.(f.id, help.link, event);
            }}
            className={cn(
              "w-fit rounded-1 text-[12px] leading-5 font-medium text-(--mh-accent) underline-offset-2 hover:underline",
              FOCUS_RING,
            )}
          >
            {help.link.label}
            <ArrowUpRight
              aria-hidden
              className="ml-0.5 inline size-3.5 align-[-3px]"
            />
          </a>
        ) : null}
      </div>
    );
  };

  const fieldRow = (f: MarginHelpField, index: number) => {
    const kind = f.kind ?? "text";
    const ctrlId = `${uid}-${f.id}`;
    const errId = `${uid}-${f.id}-error`;
    const descId = `${uid}-${f.id}-desc`;
    const err = showError(f) ? errors.get(f.id) : null;
    const isOpen = open.has(f.id);
    const describedBy =
      [f.help ? descId : null, err ? errId : null].filter(Boolean).join(" ") ||
      undefined;
    const common = {
      id: ctrlId,
      "data-mh-control": "",
      disabled: locked,
      "aria-invalid": err ? true : undefined,
      "aria-describedby": describedBy,
      "aria-required": f.required || undefined,
      onBlur: () => setTouched((t) => (t.has(f.id) ? t : new Set(t).add(f.id))),
      onKeyDown: (event: React.KeyboardEvent<HTMLElement>) =>
        onFieldKeyDown(event, f, index),
    };
    const box = cn(
      "w-full rounded-2 border bg-surface-1 text-[13px] text-foreground transition-colors placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-60",
      err ? "border-danger/70" : "border-hairline-strong",
      FIELD_RING,
    );
    const v = values[f.id] ?? "";

    return (
      <div
        key={f.id}
        data-mh-field={f.id}
        onFocus={() => activate(f.id)}
        className="group/margin-help-field relative flex flex-col gap-1.5"
      >
        <div className="flex items-baseline justify-between gap-2">
          <label
            htmlFor={ctrlId}
            className="text-[12px] font-medium text-foreground transition-colors group-focus-within/margin-help-field:text-(--mh-accent)"
          >
            {f.label}
          </label>
          {!f.required ? (
            <span className="text-[11px] text-ink-3">Optional</span>
          ) : null}
        </div>
        {kind === "select" ? (
          <div className="relative">
            <select
              {...common}
              value={v}
              onChange={(event) => setAnswer(f.id, event.currentTarget.value)}
              className={cn(box, "h-9 appearance-none pr-8 pl-3")}
            >
              {v === "" ? <option value="">Choose…</option> : null}
              {(f.options ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-3"
            />
          </div>
        ) : kind === "textarea" ? (
          <textarea
            {...common}
            value={v}
            rows={3}
            placeholder={f.placeholder}
            onChange={(event) => setAnswer(f.id, event.currentTarget.value)}
            className={cn(box, "resize-none px-3 py-2 leading-5")}
          />
        ) : (
          <input
            {...common}
            type={kind === "email" ? "email" : "text"}
            value={v}
            placeholder={f.placeholder}
            autoComplete={f.autoComplete}
            inputMode={f.inputMode}
            spellCheck={kind === "email" ? false : undefined}
            onChange={(event) => setAnswer(f.id, event.currentTarget.value)}
            className={cn(box, "h-9 px-3")}
          />
        )}
        {err ? (
          <p
            id={errId}
            className="flex items-center gap-1.5 text-[12px] text-danger"
          >
            <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
            {err}
          </p>
        ) : null}
        {f.help ? (
          <>
            <span hidden id={descId}>
              {f.help.text}
              {f.help.example ? ` Example: ${f.help.example}.` : ""}
            </span>
            <div
              className={cn(
                "flex flex-col",
                helpOn && "@min-[40rem]/margin-help:hidden",
              )}
            >
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`${uid}-${f.id}-inline`}
                onClick={() =>
                  setOpen((o) => {
                    const n = new Set(o);
                    if (n.has(f.id)) n.delete(f.id);
                    else n.add(f.id);
                    return n;
                  })
                }
                className={cn(
                  "inline-flex h-6 w-fit items-center gap-1 rounded-1 text-[12px] text-ink-2 transition-colors hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                What&apos;s this?
                <motion.span
                  aria-hidden
                  className="inline-flex"
                  initial={false}
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                >
                  <ChevronDown className="size-3.5" />
                </motion.span>
              </button>
              <motion.div
                id={`${uid}-${f.id}-inline`}
                className="overflow-hidden"
                initial={false}
                animate={{
                  height: isOpen ? "auto" : 0,
                  opacity: isOpen ? 1 : 0,
                }}
                transition={
                  motionSafe
                    ? {
                        height: springs.glide,
                        opacity: { duration: durations.base },
                      }
                    : { duration: durations.fast }
                }
                inert={!isOpen}
              >
                <div className="mt-1.5 rounded-2 border-l-2 border-(--mh-accent) bg-surface-1 py-2 pr-2 pl-3">
                  {helpBody(f, "inline")}
                </div>
              </motion.div>
            </div>
          </>
        ) : null}
      </div>
    );
  };

  const cardSkin =
    cardStyle === "note"
      ? "rounded-2 border-l-2 border-(--mh-accent) bg-[color-mix(in_oklab,var(--mh-accent)_7%,var(--card))]"
      : cardStyle === "margin"
        ? "border-l border-hairline-strong"
        : "rounded-3 border border-hairline bg-popover shadow-[0_8px_22px_color-mix(in_oklab,black_11%,transparent)]";

  const notchSkin =
    cardStyle === "note"
      ? "-top-[4px] -left-[4px] size-2 rotate-45 bg-(--mh-accent)"
      : cardStyle === "margin"
        ? "top-0 -left-4 h-px w-3 bg-(--mh-accent)"
        : "-top-[5px] -left-[5px] size-2.5 rotate-45 border-b border-l border-hairline bg-popover";

  const banner =
    sending === "sent" ? (
      <motion.div
        key="sent"
        className="flex items-start gap-2 rounded-3 border border-[color-mix(in_oklab,var(--success)_35%,transparent)] bg-[color-mix(in_oklab,var(--success)_8%,var(--card))] px-3 py-2.5 text-[12px] text-foreground"
        initial={{ opacity: 0, y: motionSafe ? -distances.step : 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          motionSafe
            ? { y: springs.recoil, opacity: { duration: durations.fast } }
            : { duration: durations.fast }
        }
      >
        <Check aria-hidden className="mt-px size-3.5 shrink-0 text-success" />
        Application sent. We&apos;ll reply within two working days.
      </motion.div>
    ) : sending === "failed" ? (
      <div className="flex items-start gap-2 rounded-3 border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_7%,var(--card))] px-3 py-2.5 text-[12px] text-danger">
        <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
        It didn&apos;t send. Your answers are kept; try again.
      </div>
    ) : null;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={headingId}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container/margin-help flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--mh-accent" as string]: accent,
      }}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-[8rem] flex-1">
          <p id={headingId} className="truncate text-sm font-semibold">
            {heading}
          </p>
          <p className="truncate text-[11px] text-ink-3">{subheading}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={helpOn}
          disabled={!ready}
          onClick={() => setHelp(!helpOn)}
          className={cn(
            "hidden h-8 shrink-0 items-center gap-2 rounded-full border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50 @min-[40rem]/margin-help:inline-flex",
            FOCUS_RING,
          )}
        >
          Help
          <span
            aria-hidden
            className={cn(
              "relative h-4 w-7 rounded-full transition-colors",
              helpOn
                ? "bg-(--mh-accent)"
                : "bg-surface-2 ring-1 ring-hairline-strong ring-inset",
            )}
          >
            <motion.span
              className="absolute top-0.5 left-0.5 size-3 rounded-full bg-white shadow-sm"
              initial={false}
              animate={{ x: helpOn ? 12 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            />
          </span>
        </button>
      </header>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">This form didn&apos;t load.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      ) : (
        <form
          noValidate
          aria-labelledby={headingId}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
            <div className="flex">
              <div
                ref={formRef}
                className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-4"
              >
                {banner}
                {status === "loading"
                  ? [0, 1, 2, 3].map((i) => (
                      <div key={i} aria-hidden className="flex flex-col gap-2">
                        <span className="h-2.5 w-24 rounded-full bg-surface-2" />
                        <span className="h-9 w-full rounded-2 bg-surface-2 motion-safe:animate-pulse" />
                      </div>
                    ))
                  : fields.map((f, i) => fieldRow(f, i))}
              </div>
              <motion.aside
                aria-label="Help"
                inert={!helpOn || undefined}
                initial={false}
                animate={{ width: helpOn ? rail : 0 }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
                className={cn(
                  "relative hidden shrink-0 overflow-hidden @min-[40rem]/margin-help:block",
                  cardStyle !== "margin" &&
                    "border-l border-hairline bg-surface-1/60",
                )}
              >
                <div
                  ref={railRef}
                  className="relative h-full py-4"
                  style={{ width: rail }}
                >
                  <motion.div
                    ref={cardRef}
                    className={cn(
                      "absolute top-0",
                      cardStyle === "margin" ? "left-5" : "left-3",
                    )}
                    style={{
                      y,
                      width: rail - (cardStyle === "margin" ? 32 : 24),
                      opacity: cardO,
                      x: cardShift,
                    }}
                  >
                    <div className={cn("relative", cardSkin)}>
                      {/* The travel and the turn live on separate elements:
                          a rotate on the same node would turn the travel
                          too, sending the notch off at 45°. */}
                      <motion.span
                        aria-hidden
                        className="absolute top-0 left-0"
                        style={{ y: notch }}
                      >
                        <span className={cn("absolute", notchSkin)} />
                      </motion.span>
                      <motion.div
                        className="overflow-hidden"
                        style={{ height: cardH }}
                      >
                        <div
                          ref={cardBodyRef}
                          className={cn(
                            "grid",
                            cardStyle === "margin" ? "py-1 pl-3" : "p-3",
                          )}
                        >
                          <AnimatePresence initial={false}>
                            {shownField?.help && ready ? (
                              <motion.div
                                key={shownField.id}
                                className="[grid-area:1/1]"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{
                                  opacity: 0,
                                  transition: exitFor(durations.fast),
                                }}
                                transition={{
                                  duration: durations.base,
                                  ease: easings.enter,
                                  delay: motionSafe ? durations.blink : 0,
                                }}
                              >
                                {helpBody(shownField, "rail")}
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    </div>
                  </motion.div>
                </div>
              </motion.aside>
            </div>
          </div>

          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline px-4 py-3">
            <p className="inline-flex items-center gap-1 text-[12px] text-ink-2">
              <span className="font-mono font-medium text-foreground">
                <Rolling value={done} motionSafe={motionSafe} />
              </span>
              <span aria-hidden>of {required.length} required done</span>
              <span className="sr-only">
                {done} of {required.length} required answers done
              </span>
            </p>
            <button
              type="submit"
              data-mh-submit=""
              aria-disabled={locked || sending === "pending" || undefined}
              aria-busy={sending === "pending" || undefined}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-2 px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-90 aria-disabled:opacity-50",
                FOCUS_RING,
              )}
              style={{
                backgroundColor: "oklch(from var(--mh-accent) 0.52 c h)",
              }}
            >
              {sending === "pending" ? (
                <motion.span
                  aria-hidden
                  className="size-3 rounded-full border-2 border-white/40 border-t-white"
                  animate={motionSafe ? { rotate: 360 } : { rotate: 0 }}
                  transition={
                    motionSafe
                      ? { duration: 0.8, ease: "linear", repeat: Infinity }
                      : { duration: 0 }
                  }
                />
              ) : null}
              {sending === "pending" ? "Sending…" : submitLabel}
            </button>
          </footer>
        </form>
      )}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
