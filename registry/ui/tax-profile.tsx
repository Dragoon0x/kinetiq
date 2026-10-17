"use client";

import * as React from "react";

import { animate, AnimatePresence, motion } from "motion/react";
import {
  BadgeCheck,
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  Info,
  LoaderCircle,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type TaxFieldStyle = "boxed" | "line" | "filled";
export type TaxPreviewStyle = "classic" | "modern" | "compact";
export type TaxStatus = "ready" | "loading" | "error";

export type TaxAddress = {
  line1: string;
  line2: string;
  city: string;
  postalCode: string;
  /** Country code from `countries`. */
  country: string;
};

export type TaxIdValue = {
  /** Country code; its prefix leads the number. */
  country: string;
  /** The digits as typed; spaces and a repeated prefix are ignored. */
  number: string;
};

export type TaxCountry = { code: string; name: string };

export type TaxSeller = {
  name: string;
  lines: string[];
  taxId: string;
  email: string;
};

export type TaxProfileValues = {
  company: string;
  taxId: TaxIdValue;
  email: string;
  address: TaxAddress;
  reference: string;
};

export type TaxLookupResult =
  | { state: "valid"; taxId: string; name: string; city?: string }
  | { state: "not-found"; taxId: string }
  | { state: "unreachable"; taxId: string }
  | { state: "invalid"; taxId: string; reason: string };

export type TaxProfileProps = {
  /** How the inputs are drawn: bordered boxes, an underline only, or soft filled wells. @default "boxed" */
  fieldStyle?: TaxFieldStyle;
  /** The invoice header preview: seller left and title right, a large title with two blocks, or one tight strip. @default "classic" */
  previewStyle?: TaxPreviewStyle;
  /** Any CSS colour: focus edges, the checking pulse, the landing wash and the invoice rule. @default "var(--accent-bright)" */
  accent?: string;
  /** The legal company name the form starts with. @default "" */
  company?: string;
  /** The billing address the form starts with. @default defaultTaxAddress */
  address?: TaxAddress;
  /** The tax ID the form starts with. @default { country: "GB", number: "" } */
  taxId?: TaxIdValue;
  /** The billing email the form starts with. @default "billing@fernworks.studio" */
  email?: string;
  /** The purchase order reference the form starts with. @default "" */
  reference?: string;
  /** Controlled form values; when set, the props above are ignored. */
  values?: TaxProfileValues;
  /** Fires from every edit (and from a registry fill), with all the values. */
  onValuesChange?: (values: TaxProfileValues) => void;
  /** Countries for the tax ID prefix and the address. @default defaultTaxCountries */
  countries?: TaxCountry[];
  /** Who issues the invoices, shown in the preview. @default defaultTaxSeller */
  seller?: TaxSeller;
  /** The invoice number in the preview. @default "INV-2026-0418" */
  invoiceNumber?: string;
  /** The current time, ms; the preview's issue date. Never read from the clock. @default 17 Oct 2026 */
  now?: number;
  /** Looks a full tax ID up (e.g. "GB204718369"). @default a seeded registry of four companies */
  lookup?: (taxId: string) => Promise<TaxLookupResult>;
  /** How long the default lookup takes, ms. @default 900 */
  checkDelay?: number;
  /** Fires with every check outcome: valid, not found, unreachable or invalid. */
  onValidate?: (result: TaxLookupResult) => void;
  /** Save was pressed with valid values; return a promise to show Saving… and its outcome. */
  onSave?: (values: TaxProfileValues) => void | Promise<void>;
  /** Cancel was pressed; an uncontrolled form also returns to its last saved values. */
  onCancel?: () => void;
  /** Whether the saved details have arrived. @default "ready" */
  status?: TaxStatus;
  /** "Try again" was pressed after the details failed to load. */
  onRetry?: () => void;
  /** Height of the surface, px; its body scrolls inside. @default 540 */
  height?: number;
  /** Nothing can be edited or saved. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultTaxCountries: TaxCountry[] = [
  { code: "GB", name: "United Kingdom" },
  { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" },
  { code: "PT", name: "Portugal" },
  { code: "NL", name: "Netherlands" },
  { code: "FR", name: "France" },
];

export const defaultTaxAddress: TaxAddress = {
  line1: "Unit 4, Kiln Yard",
  line2: "",
  city: "Portbridge",
  postalCode: "PB4 2LW",
  country: "GB",
};

export const defaultTaxSeller: TaxSeller = {
  name: "Waylight Labs Ltd",
  lines: ["12 Tidewater Row", "Portbridge PB1 7QA", "United Kingdom"],
  taxId: "GB 418 207 554",
  email: "accounts@waylight.studio",
};

/** Numbers the default lookup knows. Any other well-formed one is not found. */
export const defaultTaxRegistry: Record<
  string,
  { name: string; city: string }
> = {
  GB204718369: { name: "Fernworks Studio Ltd", city: "Portbridge" },
  IE318405627: { name: "Coldbrook Analytics Ltd", city: "Kilmore" },
  DE582039173: { name: "Gaugeworks GmbH", city: "Talheim" },
  PT506172845: { name: "Basinworks Lda.", city: "Vale Fundo" },
};

/** Friday 17 October 2026, 10:00 UTC. */
export const defaultTaxNow = Date.UTC(2026, 9, 17, 10, 0);

const DEFAULT_TAX_ID: TaxIdValue = { country: "GB", number: "" };

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

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
const dateOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCFullYear()}`;
};

/** Digits only, with a typed-in prefix for the chosen country dropped. */
const digitsOf = (raw: string, country: string) => {
  let s = raw.toUpperCase().replace(/[\s.\-]/g, "");
  if (s.startsWith(country)) s = s.slice(country.length);
  return s.replace(/\D/g, "").slice(0, 9);
};
/** The ninth digit checks the first eight, weighted 3,1,3,1… */
const checksumOk = (d: string) => {
  if (!/^\d{9}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(d[i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(d[8]);
};
const grouped = (country: string, d: string) =>
  `${country} ${d.replace(/(\d{3})(?=\d)/g, "$1 ")}`.trim();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type FieldKey =
  | "company"
  | "taxId"
  | "email"
  | "line1"
  | "line2"
  | "city"
  | "postalCode"
  | "country"
  | "reference";

const ORDER: FieldKey[] = [
  "company",
  "taxId",
  "email",
  "line1",
  "line2",
  "city",
  "postalCode",
  "country",
  "reference",
];

function validate(v: TaxProfileValues): Partial<Record<FieldKey, string>> {
  const out: Partial<Record<FieldKey, string>> = {};
  if (!v.company.trim()) out.company = "Enter the company's legal name.";
  const d = digitsOf(v.taxId.number, v.taxId.country);
  if (d.length > 0 && d.length < 9)
    out.taxId = `Enter all 9 digits after ${v.taxId.country}.`;
  else if (d.length === 9 && !checksumOk(d))
    out.taxId = "This number fails its check digit. Look for a typo.";
  if (!v.email.trim()) out.email = "Enter where invoices should go.";
  else if (!EMAIL.test(v.email.trim()))
    out.email = "That doesn't look like an email address.";
  if (!v.address.line1.trim()) out.line1 = "Enter the street address.";
  if (!v.address.city.trim()) out.city = "Enter the town or city.";
  if (v.address.postalCode.trim().length < 3)
    out.postalCode = "Enter the postal code.";
  return out;
}

const defaultLookup =
  (delay: number) =>
  (taxId: string): Promise<TaxLookupResult> =>
    new Promise((resolve) => {
      window.setTimeout(() => {
        const hit = defaultTaxRegistry[taxId];
        if (hit) resolve({ state: "valid", taxId, ...hit });
        else if (/^[A-Z]{2}99/.test(taxId))
          resolve({ state: "unreachable", taxId });
        else resolve({ state: "not-found", taxId });
      }, delay);
    });

/* ----------------------------------------------------------------------- */
/*                                Form parts                                */
/* ----------------------------------------------------------------------- */

const inputClass = (style: TaxFieldStyle, invalid: boolean) =>
  cn(
    "h-9 w-full min-w-0 text-[13px] text-foreground transition-colors placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-60",
    FOCUS_RING,
    style === "boxed" &&
      "rounded-2 border bg-card px-3 focus-visible:border-(--tp-accent)",
    style === "line" &&
      "rounded-none border-0 border-b bg-transparent px-0.5 focus-visible:border-(--tp-accent)",
    style === "filled" &&
      "rounded-2 border border-transparent bg-surface-2 px-3 focus-visible:bg-card",
    invalid ? "border-danger" : style === "filled" ? "" : "border-input",
  );

function Field({
  id,
  label,
  optional,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label
        htmlFor={id}
        className="text-[12px] font-medium text-foreground select-none"
      >
        {label}
        {optional ? (
          <span className="font-normal text-ink-3"> · optional</span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p
          id={`${id}-msg`}
          className="flex items-start gap-1 text-[11px] leading-4 text-danger"
        >
          <CircleAlert aria-hidden className="mt-px size-3 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <div id={`${id}-msg`} className="text-[11px] leading-4 text-ink-3">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The form                                  */
/* ----------------------------------------------------------------------- */

type Check = {
  key: string;
  checking: boolean;
  result: TaxLookupResult | null;
};
type Said = { n: number; text: string };
type Flight = {
  n: number;
  name: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  scale: number;
};
type SaveState = "idle" | "saving" | "saved" | "failed";

/**
 * A billing-details form with a live invoice header beside it. Every field is
 * a labelled native input in reading order with its error inline. Typing a
 * well-formed tax ID runs a checking pulse along the field's lower edge while
 * the number is looked up; a registered number fills the legal name, which
 * lifts out of the note under the field and glides across into the invoice
 * header on springs.glide, landing with a flick and a wash of the accent.
 * Numbers that are not found or a registry that does not answer keep the
 * entry with a note; a failed check digit is an inline error. On a narrow
 * container the preview folds away behind a toggle. Under reduced motion the
 * pulse holds still and the name cross-fades into place.
 */
export function TaxProfile({
  fieldStyle = "boxed",
  previewStyle = "classic",
  accent = "var(--accent-bright)",
  company = "",
  address = defaultTaxAddress,
  taxId = DEFAULT_TAX_ID,
  email = "billing@fernworks.studio",
  reference = "",
  values,
  onValuesChange,
  countries = defaultTaxCountries,
  seller = defaultTaxSeller,
  invoiceNumber = "INV-2026-0418",
  now = defaultTaxNow,
  lookup,
  checkDelay = 900,
  onValidate,
  onSave,
  onCancel,
  status = "ready",
  onRetry,
  height = 540,
  disabled = false,
  className,
}: TaxProfileProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const id = (k: string) => `${uid}-${k}`;
  const titleId = id("title");
  const previewId = id("preview");
  const formId = id("form");
  const ready = status === "ready";
  const locked = disabled || !ready;

  /* ------------------------------ values -------------------------------- */

  const [own, setOwn] = React.useState<TaxProfileValues>(() => ({
    company,
    taxId,
    email,
    address,
    reference,
  }));
  const v = values ?? own;
  const [saved, setSaved] = React.useState<TaxProfileValues>(v);

  const write = (next: TaxProfileValues) => {
    if (values === undefined) setOwn(next);
    onValuesChange?.(next);
  };

  // Async answers (a lookup, a save) act on what the form holds when they
  // land, not on what it held when they were asked.
  const latest = React.useRef({
    v,
    write,
    onValidate,
    lookup,
    checkDelay,
    motionSafe,
  });
  React.useEffect(() => {
    latest.current = { v, write, onValidate, lookup, checkDelay, motionSafe };
  });

  const setTop = <K extends "company" | "email" | "reference">(
    key: K,
    value: string,
  ) => write({ ...v, [key]: value });
  const setAddr = (key: keyof TaxAddress, value: string) =>
    write({ ...v, address: { ...v.address, [key]: value } });

  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /* ------------------------------ checking ------------------------------ */

  const country = v.taxId.country;
  const digits = digitsOf(v.taxId.number, country);
  const full = `${country}${digits}`;
  const complete = digits.length === 9;
  const formatOk = complete && checksumOk(digits);
  const [retry, setRetry] = React.useState(0);
  const [check, setCheck] = React.useState<Check>({
    key: "",
    checking: false,
    result: null,
  });
  const current = check.key === full ? check : null;
  const checking = !!current?.checking;
  const result = current?.result ?? null;
  const verified = result?.state === "valid";

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const taxInputRef = React.useRef<HTMLInputElement | null>(null);
  const headerNameRef = React.useRef<HTMLSpanElement | null>(null);
  const ghostRef = React.useRef<HTMLSpanElement | null>(null);
  const [flight, setFlight] = React.useState<Flight | null>(null);
  const [landed, setLanded] = React.useState(0);
  const [filled, setFilled] = React.useState<{
    name: string;
    previous: string;
  } | null>(null);
  const flightN = React.useRef(0);

  /** Fills the name from the registry, and sends it across if it can be seen. */
  const fillFromRegistry = (name: string) => {
    const { v: cur, write: put, motionSafe: moving } = latest.current;
    const previous = cur.company;
    const root = rootRef.current;
    const from = taxInputRef.current;
    const to = headerNameRef.current;
    const canFly =
      moving &&
      !!root &&
      !!from &&
      !!to &&
      (to.checkVisibility?.({ visibilityProperty: true }) ??
        to.getClientRects().length > 0);
    flightN.current += 1;
    const n = flightN.current;
    if (canFly && root && from && to) {
      const r = root.getBoundingClientRect();
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      setFlight({
        n,
        name,
        from: {
          x: Math.round(a.left - r.left + 22),
          y: Math.round(a.bottom - r.top + 6),
        },
        to: { x: Math.round(b.left - r.left), y: Math.round(b.top - r.top) },
        scale: 0.8,
      });
    } else {
      setFlight(null);
      setLanded(n);
    }
    if (previous.trim() !== name) {
      setFilled({ name, previous });
      put({ ...cur, company: name });
    } else {
      setFilled(null);
    }
  };

  React.useEffect(() => {
    if (!complete || !formatOk || status !== "ready") return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setCheck({ key: full, checking: true, result: null });
      const run =
        latest.current.lookup ?? defaultLookup(latest.current.checkDelay);
      const settle = (r: TaxLookupResult) => {
        if (cancelled) return;
        setCheck({ key: full, checking: false, result: r });
        latest.current.onValidate?.(r);
        if (r.state === "valid") {
          fillFromRegistry(r.name);
          say(`Tax ID checked: registered to ${r.name}.`);
        } else if (r.state === "not-found") {
          say("No registered company found. The name will print as entered.");
        } else if (r.state === "unreachable") {
          say("The registry did not answer. Your entry is kept.");
        } else {
          say(r.reason);
        }
      };
      run(full).then(settle, () =>
        settle({ state: "unreachable", taxId: full }),
      );
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // The check is keyed by the number: it runs again only when the number
    // (or a retry) changes; everything else it needs is read from refs.
  }, [full, complete, formatOk, retry, status]);

  // The name travels from under the field into the invoice header.
  React.useEffect(() => {
    const el = ghostRef.current;
    if (!flight || !el) return;
    const n = flight.n;
    const controls = animate(
      el,
      {
        x: [flight.from.x, flight.to.x],
        y: [flight.from.y, flight.to.y],
        scale: [flight.scale, 1],
        opacity: [1, 1],
      },
      {
        x: springs.glide,
        y: springs.glide,
        scale: springs.glide,
        opacity: { duration: 0 },
        onComplete: () => {
          setLanded(n);
          setFlight((f) => (f && f.n === n ? null : f));
        },
      },
    );
    return () => controls.stop();
  }, [flight]);

  const headerHidden = flight !== null && landed !== flight.n;

  /* -------------------------------- errors ------------------------------ */

  const errors = validate(v);
  const [touched, setTouched] = React.useState<Partial<Record<FieldKey, true>>>(
    {},
  );
  const [submitted, setSubmitted] = React.useState(false);
  // A failed check digit is certain the moment the ninth digit lands, so it
  // shows at once; everything else waits until the field is left.
  const shown = (k: FieldKey) =>
    touched[k] || submitted || (k === "taxId" && complete && !formatOk)
      ? errors[k]
      : undefined;
  const touch = (k: FieldKey) =>
    setTouched((t) => (t[k] ? t : { ...t, [k]: true }));

  const nodes = React.useRef(new Map<FieldKey, HTMLElement>());
  const bind = (k: FieldKey) => (node: HTMLElement | null) => {
    if (node) nodes.current.set(k, node);
    else nodes.current.delete(k);
  };

  /* -------------------------------- save -------------------------------- */

  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const saveTimer = React.useRef(0);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      window.clearTimeout(saveTimer.current);
    };
  }, []);

  const same = (a: TaxProfileValues, b: TaxProfileValues) =>
    JSON.stringify(a) === JSON.stringify(b);
  const dirty = !same(v, saved);

  const save = () => {
    if (locked || saveState === "saving") return;
    setSubmitted(true);
    const bad = ORDER.filter((k) => errors[k]);
    if (bad.length) {
      const first = bad[0];
      if (first) nodes.current.get(first)?.focus();
      say(
        `${bad.length} ${bad.length === 1 ? "field needs" : "fields need"} attention.`,
      );
      return;
    }
    const snapshot = v;
    const done = () => {
      if (!alive.current) return;
      setSaved(snapshot);
      setSaveState("saved");
      say(`Saved. Invoices are billed to ${snapshot.company}.`);
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        if (alive.current) setSaveState("idle");
      }, 1800);
    };
    let out: unknown;
    try {
      out = onSave?.(snapshot);
    } catch {
      setSaveState("failed");
      say("Did not save. Try again.");
      return;
    }
    if (out && typeof (out as PromiseLike<void>).then === "function") {
      setSaveState("saving");
      Promise.resolve(out as PromiseLike<void>).then(done, () => {
        if (!alive.current) return;
        setSaveState("failed");
        say("Did not save. Try again.");
      });
    } else done();
  };

  const cancel = () => {
    if (disabled) return;
    if (values === undefined) setOwn(saved);
    setTouched({});
    setSubmitted(false);
    setFilled(null);
    onCancel?.();
    say("Changes cancelled.");
  };

  /* ------------------------------ preview ------------------------------- */

  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [focusField, setFocusField] = React.useState<FieldKey | null>(null);
  const countryName = (code: string) =>
    countries.find((c) => c.code === code)?.name ?? code;
  const issued = dateOf(now);
  const due = dateOf(now + 14 * 86_400_000);

  const lit = (k: FieldKey | FieldKey[]) =>
    focusField !== null &&
    (Array.isArray(k) ? k.includes(focusField) : k === focusField);
  const litClass = (k: FieldKey | FieldKey[]) =>
    cn(
      "-mx-1 rounded-1 px-1 transition-colors duration-200",
      lit(k) && "bg-[color-mix(in_oklab,var(--tp-accent)_14%,transparent)]",
    );
  const gap = (w: string) => (
    <span
      aria-hidden
      className={cn(
        "inline-block h-2 rounded-full bg-[oklch(0.88_0.008_85)] align-middle",
        w,
      )}
    />
  );

  const companyLine = (
    <span
      className={cn(
        "relative inline-block max-w-full",
        litClass("company"),
        headerHidden && "opacity-0",
      )}
    >
      <span ref={headerNameRef} className="block truncate">
        {v.company.trim() ? (
          <motion.span
            key={`n${landed}`}
            className="inline-block origin-left"
            initial={
              landed > 0
                ? motionSafe
                  ? { scale: 1.06 }
                  : { opacity: 0 }
                : false
            }
            animate={{ scale: 1, opacity: 1 }}
            transition={
              motionSafe
                ? { scale: springs.flick }
                : { duration: durations.base }
            }
          >
            {v.company}
          </motion.span>
        ) : (
          gap("w-32")
        )}
      </span>
      {landed > 0 && motionSafe ? (
        <motion.span
          key={`w${landed}`}
          aria-hidden
          className="pointer-events-none absolute -inset-x-1 inset-y-0 rounded-1 bg-(--tp-accent)"
          initial={{ opacity: 0.22 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: easings.enter, delay: 0.05 }}
        />
      ) : null}
    </span>
  );

  const verifiedBadge = (
    <AnimatePresence initial={false}>
      {verified ? (
        <motion.span
          key="ok"
          className="ml-1.5 inline-flex h-4 items-center gap-0.5 rounded-full bg-[oklch(0.9_0.07_158)] px-1.5 align-middle text-[9px] font-medium tracking-[0.04em] text-[oklch(0.34_0.09_158)] uppercase"
          initial={{ opacity: 0, scale: motionSafe ? 0.7 : 1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={
            motionSafe
              ? { scale: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          <BadgeCheck aria-hidden className="size-2.5" />
          Verified
        </motion.span>
      ) : null}
    </AnimatePresence>
  );

  const billed = (
    <div className="flex min-w-0 flex-col gap-0.5 text-[11px] leading-4">
      <p className="text-[9px] font-medium tracking-[0.12em] text-[oklch(0.52_0.02_258)] uppercase">
        Billed to
      </p>
      <p className="text-[15px] leading-5 font-semibold">{companyLine}</p>
      <p className={litClass("line1")}>
        {v.address.line1.trim() ? v.address.line1 : gap("w-28")}
      </p>
      {v.address.line2.trim() ? (
        <p className={litClass("line2")}>{v.address.line2}</p>
      ) : null}
      <p className={litClass(["city", "postalCode", "country"])}>
        {v.address.city.trim() || v.address.postalCode.trim() ? (
          <>
            {v.address.city} {v.address.postalCode}
          </>
        ) : (
          gap("w-24")
        )}
        {" · "}
        {countryName(v.address.country)}
      </p>
      <p className={cn("mt-1 tabular-nums", litClass("taxId"))}>
        <span className="text-[oklch(0.52_0.02_258)]">VAT </span>
        {digits ? grouped(country, digits) : gap("w-20")}
        {verifiedBadge}
      </p>
      <p className={litClass("email")}>
        {v.email.trim() ? v.email : gap("w-28")}
      </p>
      {v.reference.trim() ? (
        <p className={litClass("reference")}>PO {v.reference}</p>
      ) : null}
    </div>
  );

  const from = (
    <div className="flex min-w-0 flex-col gap-0.5 text-[11px] leading-4">
      <p className="text-[12px] font-semibold">{seller.name}</p>
      {seller.lines.map((l) => (
        <p key={l} className="text-[oklch(0.45_0.02_258)]">
          {l}
        </p>
      ))}
      <p className="text-[oklch(0.45_0.02_258)] tabular-nums">
        VAT {seller.taxId}
      </p>
    </div>
  );

  const meta = (
    <div className="flex flex-col gap-0.5 text-[11px] leading-4 tabular-nums">
      <p>
        <span className="text-[oklch(0.52_0.02_258)]">No. </span>
        {invoiceNumber}
      </p>
      <p>
        <span className="text-[oklch(0.52_0.02_258)]">Issued </span>
        {issued}
      </p>
      <p>
        <span className="text-[oklch(0.52_0.02_258)]">Due </span>
        {due}
      </p>
    </div>
  );

  const paper =
    previewStyle === "modern" ? (
      <div className="flex flex-col gap-3">
        <p className="text-[24px] leading-7 font-semibold tracking-[-0.01em]">
          Invoice
        </p>
        <div className="flex flex-wrap gap-1.5">
          {[invoiceNumber, `Issued ${issued}`, `Due ${due}`].map((t) => (
            <span
              key={t}
              className="inline-flex h-5 items-center rounded-full border border-[oklch(0.86_0.01_85)] px-2 text-[10px] tabular-nums"
            >
              {t}
            </span>
          ))}
        </div>
        <span
          aria-hidden
          className="h-0.5 w-10 rounded-full"
          style={{ backgroundColor: "var(--tp-accent)" }}
        />
        {billed}
        <div className="border-t border-[oklch(0.88_0.008_85)] pt-2.5">
          <p className="mb-1 text-[9px] font-medium tracking-[0.12em] text-[oklch(0.52_0.02_258)] uppercase">
            From
          </p>
          {from}
        </div>
      </div>
    ) : previewStyle === "compact" ? (
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-[oklch(0.88_0.008_85)] pb-2">
          <p className="text-[11px] font-semibold tracking-[0.14em] uppercase">
            Invoice{" "}
            <span className="font-normal tracking-normal text-[oklch(0.45_0.02_258)] normal-case tabular-nums">
              {invoiceNumber}
            </span>
          </p>
          <p className="text-[10px] text-[oklch(0.45_0.02_258)] tabular-nums">
            {issued} → {due}
          </p>
        </div>
        {billed}
        <p className="text-[10px] text-[oklch(0.52_0.02_258)]">
          From {seller.name} · VAT {seller.taxId}
        </p>
      </div>
    ) : (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {from}
          <div className="flex flex-col items-end gap-1 text-right">
            <p
              className="text-[12px] font-semibold tracking-[0.2em] uppercase"
              style={{ color: "var(--tp-accent-ink)" }}
            >
              Invoice
            </p>
            <div className="text-right [&_p]:text-right">{meta}</div>
          </div>
        </div>
        <span
          aria-hidden
          className="h-px w-full"
          style={{ backgroundColor: "var(--tp-accent)" }}
        />
        {billed}
      </div>
    );

  /* ----------------------------- tax id note ---------------------------- */

  const taxError = shown("taxId");
  const taxNote: React.ReactNode = (() => {
    if (taxError) return null;
    if (checking)
      return (
        <span className="inline-flex items-center gap-1 text-ink-2">
          {motionSafe ? null : (
            <LoaderCircle aria-hidden className="size-3 shrink-0" />
          )}
          Checking the registry…
        </span>
      );
    if (result?.state === "valid")
      return (
        <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 text-foreground">
          <CircleCheck aria-hidden className="size-3 shrink-0 text-success" />
          Registered to <span className="font-medium">{result.name}</span>
          {result.city ? (
            <span className="text-ink-3">· {result.city}</span>
          ) : null}
          {filled &&
          filled.name === v.company &&
          filled.previous.trim() !== "" ? (
            <button
              type="button"
              onClick={() => {
                write({ ...v, company: filled.previous });
                setFilled(null);
                say(`Name restored to ${filled.previous}.`);
              }}
              className={cn(
                "ml-1 rounded-1 text-[11px] text-ink-2 underline underline-offset-2 hover:text-foreground",
                FOCUS_RING,
              )}
            >
              Undo name
            </button>
          ) : null}
        </span>
      );
    if (result?.state === "not-found")
      return (
        <span className="inline-flex items-start gap-1 text-ink-2">
          <Info aria-hidden className="mt-px size-3 shrink-0" />
          No registered company found. It will print as entered.
        </span>
      );
    if (result?.state === "unreachable")
      return (
        <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-ink-2">
          <TriangleAlert aria-hidden className="size-3 shrink-0 text-warn" />
          The registry did not answer. Your entry is kept.
          <button
            type="button"
            onClick={() => setRetry((r) => r + 1)}
            className={cn(
              "rounded-1 text-[11px] text-foreground underline underline-offset-2",
              FOCUS_RING,
            )}
          >
            Check again
          </button>
        </span>
      );
    return `9 digits after ${country}. Checked as you type.`;
  })();

  const edge = taxError
    ? "danger"
    : verified
      ? "success"
      : result?.state === "unreachable"
        ? "warn"
        : "none";

  /* -------------------------------- render ------------------------------ */

  const inp = (k: FieldKey) => inputClass(fieldStyle, !!shown(k));
  const described = (k: FieldKey) =>
    shown(k) ? `${id(k)}-msg` : k === "taxId" ? `${id(k)}-msg` : undefined;
  const common = (k: FieldKey) => ({
    id: id(k),
    ref: bind(k),
    disabled: locked,
    "aria-invalid": shown(k) ? true : undefined,
    "aria-describedby": described(k),
    onFocus: () => setFocusField(k),
    onBlur: () => {
      touch(k);
      setFocusField((f) => (f === k ? null : f));
    },
  });

  const form = (
    <form
      id={formId}
      noValidate
      aria-labelledby={titleId}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="grid min-w-0 grid-cols-1 gap-x-3 gap-y-3.5 @min-[22rem]:grid-cols-2"
    >
      <Field
        id={id("company")}
        label="Legal company name"
        error={shown("company")}
        className="@min-[22rem]:col-span-2"
      >
        <input
          {...common("company")}
          type="text"
          autoComplete="organization"
          value={v.company}
          placeholder="As registered"
          onChange={(e) => {
            const value = e.currentTarget.value;
            setTop("company", value);
          }}
          className={inp("company")}
        />
      </Field>

      <Field
        id={id("taxId")}
        label="VAT number"
        error={taxError}
        hint={taxNote}
        className="@min-[22rem]:col-span-2"
      >
        <div
          role="group"
          aria-labelledby={id("taxId-label")}
          aria-busy={checking || undefined}
          className="flex min-w-0 items-stretch gap-2"
        >
          <span id={id("taxId-label")} className="sr-only">
            VAT number, country and digits
          </span>
          <select
            aria-label="Tax ID country"
            value={country}
            disabled={locked}
            onChange={(e) => {
              const value = e.currentTarget.value;
              write({ ...v, taxId: { ...v.taxId, country: value } });
            }}
            className={cn(
              inputClass(fieldStyle, false),
              "w-[4.75rem] shrink-0 font-mono",
              fieldStyle === "line" ? "pr-1" : "px-2",
            )}
          >
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
          <div className="relative min-w-0 flex-1">
            <input
              {...common("taxId")}
              ref={(node) => {
                taxInputRef.current = node;
                bind("taxId")(node);
              }}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              value={v.taxId.number}
              placeholder="204 718 369"
              onChange={(e) => {
                const value = e.currentTarget.value;
                write({ ...v, taxId: { ...v.taxId, number: value } });
                const d = digitsOf(value, country);
                if (d.length === 9 && d !== digits && !checksumOk(d)) {
                  const reason =
                    "This number fails its check digit. Look for a typo.";
                  onValidate?.({
                    state: "invalid",
                    taxId: `${country}${d}`,
                    reason,
                  });
                  say(reason);
                }
              }}
              className={cn(
                inp("taxId"),
                "pr-8 font-mono tracking-[0.04em] tabular-nums",
                edge === "success" && "border-success",
                edge === "warn" && "border-warn",
              )}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-2.5 flex -translate-y-1/2 items-center"
            >
              {verified ? (
                <CircleCheck className="size-4 text-success" />
              ) : checking && !motionSafe ? (
                <LoaderCircle className="size-4 text-ink-3" />
              ) : null}
            </span>
            {/* The checking pulse: a soft band of the accent travelling
                along the lower edge while the registry is asked. */}
            {checking ? (
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden",
                  fieldStyle === "line" ? "" : "rounded-b-2",
                )}
              >
                {motionSafe ? (
                  <motion.span
                    className="absolute inset-y-0 left-0 w-1/3 rounded-full"
                    style={{
                      backgroundImage:
                        "linear-gradient(90deg, transparent, var(--tp-accent), transparent)",
                    }}
                    initial={{ x: "-100%" }}
                    animate={{ x: "300%" }}
                    transition={{
                      duration: 1.1,
                      ease: easings.move,
                      repeat: Infinity,
                    }}
                  />
                ) : (
                  <span className="absolute inset-0 bg-[color-mix(in_oklab,var(--tp-accent)_55%,transparent)]" />
                )}
              </span>
            ) : null}
          </div>
        </div>
      </Field>

      <Field
        id={id("email")}
        label="Billing email"
        error={shown("email")}
        className="@min-[22rem]:col-span-2"
      >
        <input
          {...common("email")}
          type="email"
          autoComplete="email"
          value={v.email}
          placeholder="accounts@company.com"
          onChange={(e) => {
            const value = e.currentTarget.value;
            setTop("email", value);
          }}
          className={inp("email")}
        />
      </Field>

      <Field
        id={id("line1")}
        label="Address"
        error={shown("line1")}
        className="@min-[22rem]:col-span-2"
      >
        <input
          {...common("line1")}
          type="text"
          autoComplete="address-line1"
          value={v.address.line1}
          onChange={(e) => {
            const value = e.currentTarget.value;
            setAddr("line1", value);
          }}
          className={inp("line1")}
        />
      </Field>
      <Field
        id={id("line2")}
        label="Address line 2"
        optional
        className="@min-[22rem]:col-span-2"
      >
        <input
          {...common("line2")}
          type="text"
          autoComplete="address-line2"
          value={v.address.line2}
          onChange={(e) => {
            const value = e.currentTarget.value;
            setAddr("line2", value);
          }}
          className={inp("line2")}
        />
      </Field>
      <Field id={id("city")} label="Town or city" error={shown("city")}>
        <input
          {...common("city")}
          type="text"
          autoComplete="address-level2"
          value={v.address.city}
          onChange={(e) => {
            const value = e.currentTarget.value;
            setAddr("city", value);
          }}
          className={inp("city")}
        />
      </Field>
      <Field
        id={id("postalCode")}
        label="Postal code"
        error={shown("postalCode")}
      >
        <input
          {...common("postalCode")}
          type="text"
          autoComplete="postal-code"
          value={v.address.postalCode}
          onChange={(e) => {
            const value = e.currentTarget.value;
            setAddr("postalCode", value);
          }}
          className={cn(inp("postalCode"), "uppercase")}
        />
      </Field>
      <Field
        id={id("country")}
        label="Country"
        className="@min-[22rem]:col-span-2"
      >
        <select
          {...common("country")}
          autoComplete="country"
          value={v.address.country}
          onChange={(e) => {
            const value = e.currentTarget.value;
            setAddr("country", value);
          }}
          className={inp("country")}
        >
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field
        id={id("reference")}
        label="Purchase order"
        optional
        hint="Printed under the address when set."
        className="@min-[22rem]:col-span-2"
      >
        <input
          {...common("reference")}
          type="text"
          value={v.reference}
          placeholder="PO-0000"
          onChange={(e) => {
            const value = e.currentTarget.value;
            setTop("reference", value);
          }}
          className={inp("reference")}
        />
      </Field>
    </form>
  );

  const preview = (
    <div
      className={cn(
        "order-first grid min-w-0 @min-[44rem]:sticky @min-[44rem]:top-0 @min-[44rem]:order-none @min-[44rem]:self-start",
        "@min-[44rem]:visible! @min-[44rem]:grid-rows-[1fr]!",
        previewOpen ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]",
        motionSafe &&
          "transition-[grid-template-rows,visibility] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
      )}
    >
      <div className="overflow-hidden" style={{ minHeight: 0 }}>
        <section
          id={previewId}
          aria-label="Invoice preview"
          className="rounded-3 border border-[oklch(0.88_0.008_85)] bg-[oklch(0.985_0.004_85)] p-4 text-[oklch(0.26_0.02_258)] shadow-[0_1px_2px_oklch(0.2_0.02_258/0.06),0_10px_28px_-12px_oklch(0.2_0.02_258/0.22)] dark:bg-[oklch(0.94_0.006_85)]"
        >
          {paper}
        </section>
        <p className="mt-2 hidden text-[11px] text-ink-3 @min-[44rem]:block">
          Updates as you type. The highlighted line is the field you are in.
        </p>
      </div>
    </div>
  );

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-xs transition-colors",
    FOCUS_RING,
  );

  const errorCount = ORDER.filter((k) => errors[k]).length;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container relative grid w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--tp-accent" as string]: accent,
        ["--tp-accent-ink" as string]: `oklch(from ${accent} 0.5 0.15 h)`,
      }}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-0 flex-1 basis-40">
          <p id={titleId} className="truncate text-sm font-semibold">
            Billing details
          </p>
          <p className="truncate text-[11px] text-ink-3">
            Printed on every invoice from {seller.name}
          </p>
        </div>
        <button
          type="button"
          aria-expanded={previewOpen}
          aria-controls={previewId}
          onClick={() => setPreviewOpen((o) => !o)}
          className={cn(
            button,
            "border border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground @min-[44rem]:hidden",
          )}
        >
          {previewOpen ? (
            <EyeOff aria-hidden className="size-3.5" />
          ) : (
            <Eye aria-hidden className="size-3.5" />
          )}
          {previewOpen ? "Hide preview" : "Preview invoice"}
        </button>
      </header>

      {status === "error" ? (
        <div className="flex flex-col items-center-safe justify-center-safe gap-3 overflow-y-auto p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm">Billing details did not load.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                button,
                "border border-hairline text-foreground hover:bg-surface-2",
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      ) : status === "loading" ? (
        <div
          aria-busy="true"
          className="grid content-start gap-4 overflow-y-auto p-4 @min-[44rem]:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]"
        >
          <p className="sr-only">Loading billing details.</p>
          <div className="flex flex-col gap-4">
            {[0.7, 1, 0.85, 0.9, 0.6].map((w, i) => (
              <div key={i} className="flex flex-col gap-2">
                <span className="h-2.5 w-24 rounded-full bg-surface-2" />
                <span
                  className="h-9 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                  style={{ width: `${w * 100}%` }}
                />
              </div>
            ))}
          </div>
          <div className="hidden h-56 rounded-3 bg-surface-2 motion-safe:animate-pulse @min-[44rem]:block" />
        </div>
      ) : (
        <div className="[scrollbar-width:thin] overflow-y-auto overscroll-contain">
          <div className="grid gap-4 p-4 @min-[44rem]:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] @min-[44rem]:gap-5">
            {form}
            {preview}
          </div>
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline px-4 py-2.5">
        <p className="min-w-0 text-[12px] text-ink-3">
          {saveState === "saving"
            ? "Saving…"
            : saveState === "saved"
              ? "Saved"
              : saveState === "failed"
                ? "Did not save"
                : submitted && errorCount > 0
                  ? `${errorCount} ${errorCount === 1 ? "field needs" : "fields need"} attention`
                  : dirty
                    ? "Unsaved changes"
                    : "No changes"}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={cancel}
            aria-disabled={disabled || undefined}
            className={cn(
              button,
              "text-ink-2 hover:bg-surface-2 hover:text-foreground",
            )}
          >
            Cancel
          </button>
          <button
            type="submit"
            form={formId}
            aria-disabled={locked || undefined}
            aria-busy={saveState === "saving" || undefined}
            className={cn(
              button,
              "bg-primary font-medium text-primary-foreground hover:opacity-90",
              locked && "cursor-not-allowed opacity-60",
            )}
          >
            {saveState === "saved" ? (
              <CircleCheck aria-hidden className="size-3.5" />
            ) : null}
            {saveState === "saving"
              ? "Saving"
              : saveState === "saved"
                ? "Saved"
                : saveState === "failed"
                  ? "Try again"
                  : "Save details"}
          </button>
        </div>
      </footer>

      {/* The registered name in flight, drawn over everything in the
          component's own coordinates. */}
      {flight ? (
        <span
          ref={ghostRef}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-40 rounded-1 border border-[oklch(0.86_0.01_85)] bg-[oklch(0.985_0.004_85)] px-1 text-[15px] leading-5 font-semibold whitespace-nowrap opacity-0 shadow-[0_8px_22px_-8px_color-mix(in_oklab,var(--tp-accent)_60%,transparent)]"
          style={{ color: "var(--tp-accent-ink)", transformOrigin: "0 0" }}
        >
          {flight.name}
        </span>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
