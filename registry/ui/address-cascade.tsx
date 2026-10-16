"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  LoaderCircle,
  MapPin,
  PencilLine,
  Search,
  TriangleAlert,
  X,
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

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type CascadeField = {
  id: string;
  label: string;
  /** The browser's autofill token: "address-line1", "postal-code"… */
  autoComplete?: string;
  /** "full" takes the whole row; "half" shares it. @default "half" */
  span?: "full" | "half";
  /** Not required to submit. @default false */
  optional?: boolean;
  placeholder?: string;
};

/** One looked-up address: what the list shows, and the value for each field. */
export type CascadeSuggestion = {
  id: string;
  /** The first line: "14 Fernworks Row". */
  label: string;
  /** The second line: "Coldbrook CK4 2LT". */
  detail: string;
  /** Field id to value. Fields it leaves out are cleared. */
  values: Record<string, string>;
};

export type CascadeValues = Record<string, string>;
export type CascadeFieldStyle = "boxed" | "line" | "filled";

export type AddressCascadeProps = {
  /** The fields under the search, in reading order. @default defaultCascadeFields */
  fields?: CascadeField[];
  /** The addresses the search looks through when there is no `onSuggest`. @default defaultCascadeSuggestions */
  suggestions?: CascadeSuggestion[];
  /** Looks addresses up for a query. Return them or a promise of them; a rejection falls back to manual entry. @default filters `suggestions` */
  onSuggest?: (
    query: string,
  ) => CascadeSuggestion[] | Promise<CascadeSuggestion[]>;
  /** Controlled field values. */
  value?: CascadeValues;
  /** Initial field values when uncontrolled. @default {} */
  defaultValue?: CascadeValues;
  /** Fires with every value after an edit, a pick or a manual fallback. */
  onValueChange?: (values: CascadeValues) => void;
  /** Fires for each field that changed, with its new value and every value. */
  onChange?: (fieldId: string, value: string, values: CascadeValues) => void;
  /** A suggestion was chosen. */
  onPick?: (suggestion: CascadeSuggestion) => void;
  /** The form was submitted with every required field filled. Return a promise to show it saving. */
  onSubmit?: (values: CascadeValues) => void | Promise<unknown>;
  /** Pretend latency for the built-in lookup, ms. @default 0 */
  lookupDelay?: number;
  /** A lookup slower than this shows the spinner, ms. @default 250 */
  spinnerDelay?: number;
  /** Characters typed before a lookup runs. @default 2 */
  minQuery?: number;
  /** Field look: bordered boxes, an underline, or tinted wells. @default "boxed" */
  fieldStyle?: CascadeFieldStyle;
  /** Columns at wide widths, 1 to 3; narrow forms always take one. @default 2 */
  columns?: number;
  /** Time between one field filling and the next, ms. @default 70 */
  staggerSpeed?: number;
  /** The landing wash, the check and the spinner: any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The heading. @default "Delivery address" */
  title?: string;
  /** The submit button's words. @default "Save address" */
  submitLabel?: string;
  /** Tallest the form grows before it scrolls inside, px. @default 560 */
  maxHeight?: number;
  /** Fields and search are read-only and Save does nothing; the form dims. @default false */
  disabled?: boolean;
  /** Classes for the outer form. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

export const defaultCascadeFields: CascadeField[] = [
  {
    id: "line1",
    label: "Address line 1",
    autoComplete: "address-line1",
    span: "full",
  },
  {
    id: "line2",
    label: "Address line 2",
    autoComplete: "address-line2",
    span: "full",
    optional: true,
    placeholder: "Flat, floor or building",
  },
  { id: "city", label: "Town or city", autoComplete: "address-level2" },
  {
    id: "region",
    label: "County",
    autoComplete: "address-level1",
    optional: true,
  },
  { id: "postcode", label: "Postcode", autoComplete: "postal-code" },
  { id: "country", label: "Country", autoComplete: "country-name" },
];

const place = (
  id: string,
  label: string,
  detail: string,
  values: Partial<Record<string, string>>,
): CascadeSuggestion => ({
  id,
  label,
  detail,
  values: {
    line1: "",
    line2: "",
    city: "",
    region: "",
    postcode: "",
    country: "Northmere",
    ...values,
  } as Record<string, string>,
});

export const defaultCascadeSuggestions: CascadeSuggestion[] = [
  place("fr-14", "14 Fernworks Row", "Coldbrook CK4 2LT", {
    line1: "14 Fernworks Row",
    city: "Coldbrook",
    region: "Ashvale",
    postcode: "CK4 2LT",
  }),
  place("fr-22-3", "Flat 3, 22 Fernworks Row", "Coldbrook CK4 2LU", {
    line1: "22 Fernworks Row",
    line2: "Flat 3",
    city: "Coldbrook",
    region: "Ashvale",
    postcode: "CK4 2LU",
  }),
  place("fr-140", "140 Fernworks Row", "Coldbrook CK4 2LZ", {
    line1: "140 Fernworks Row",
    city: "Coldbrook",
    region: "Ashvale",
    postcode: "CK4 2LZ",
  }),
  place("frd-14", "14 Fernworks Road", "Basinworks BW1 8QA", {
    line1: "14 Fernworks Road",
    city: "Basinworks",
    region: "Lowfen",
    postcode: "BW1 8QA",
  }),
  place("fl-8", "Fieldline House, 8 Quarry Street", "Coldbrook CK1 5RT", {
    line1: "8 Quarry Street",
    line2: "Fieldline House",
    city: "Coldbrook",
    region: "Ashvale",
    postcode: "CK1 5RT",
  }),
  place("gl-2", "2 Gauge Lane", "Waylight WY7 1DE", {
    line1: "2 Gauge Lane",
    city: "Waylight",
    region: "Saltmarsh",
    postcode: "WY7 1DE",
  }),
  place("bt-31", "31 Basin Terrace", "Basinworks BW2 4HN", {
    line1: "31 Basin Terrace",
    city: "Basinworks",
    region: "Lowfen",
    postcode: "BW2 4HN",
  }),
  place("my-1", "The Old Pump Room, Mill Yard", "Waylight WY3 9AB", {
    line1: "Mill Yard",
    line2: "The Old Pump Room",
    city: "Waylight",
    region: "Saltmarsh",
    postcode: "WY3 9AB",
  }),
];

/**
 * The built-in lookup: every word typed must appear in the address, and
 * addresses that start with the query come first. At most five.
 */
export function filterCascadeSuggestions(
  query: string,
  suggestions: CascadeSuggestion[] = defaultCascadeSuggestions,
): CascadeSuggestion[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored = suggestions
    .map((s) => {
      const hay = `${s.label} ${s.detail}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return null;
      const at = hay.indexOf(words[0] ?? "");
      return { s, score: at === 0 ? 0 : at + 1 };
    })
    .filter((x): x is { s: CascadeSuggestion; score: number } => x !== null)
    .sort((a, b) => a.score - b.score);
  return scored.slice(0, 5).map((x) => x.s);
}

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const STYLE: Record<
  CascadeFieldStyle,
  { input: string; overlay: string; check: string }
> = {
  boxed: {
    input:
      "rounded-2 border border-input bg-card px-3 focus-visible:border-(--ac-accent)",
    overlay: "inset-px px-3",
    check: "right-2.5",
  },
  line: {
    input:
      "rounded-none border-0 border-b border-input bg-transparent px-0.5 focus-visible:border-(--ac-accent)",
    overlay: "inset-x-0 top-0 bottom-px px-0.5",
    check: "right-0.5",
  },
  filled: {
    input:
      "rounded-2 border border-transparent bg-surface-2 px-3 focus-visible:border-(--ac-accent) focus-visible:bg-card",
    overlay: "inset-px px-3",
    check: "right-2.5",
  },
};

/** The run of the label the query matched, marked. */
function Marked({ text, query }: { text: string; query: string }) {
  const word = query.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const at = word ? text.toLowerCase().indexOf(word) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-[3px] bg-[color-mix(in_oklab,var(--ac-accent)_20%,transparent)] text-foreground">
        {text.slice(at, at + word.length)}
      </mark>
      {text.slice(at + word.length)}
    </>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Field                                  */
/* ----------------------------------------------------------------------- */

type Landing = { n: number; delay: number };

/**
 * One field. When a cascade reaches it, the value slides down into place on
 * `snap` as an overlay drawn exactly over the input's own text — the input
 * keeps the real value throughout and takes over when the overlay lands —
 * while a wash of the accent fades and a check pops and goes.
 */
function Field({
  field,
  value,
  error,
  fieldStyle,
  land,
  motionSafe,
  disabled,
  inputRef,
  errorId,
  onValue,
}: {
  field: CascadeField;
  value: string;
  error: string | undefined;
  fieldStyle: CascadeFieldStyle;
  land: Landing | null;
  motionSafe: boolean;
  disabled: boolean;
  inputRef: (node: HTMLInputElement | null) => void;
  errorId: string;
  onValue: (value: string) => void;
}) {
  const id = React.useId();
  const s = STYLE[fieldStyle] ?? STYLE.boxed;
  // The cascade this field has finished landing. Starting at the current one
  // means a field that mounts mid-cascade simply shows its value.
  const [landed, setLanded] = React.useState(land?.n ?? 0);
  const landing = land !== null && land.n > landed;
  const delay = land?.delay ?? 0;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5",
        field.span === "full" && "col-span-full",
      )}
    >
      <label htmlFor={id} className="text-[12px] font-medium text-ink-2">
        {field.label}
        {field.optional ? (
          <span className="font-normal text-ink-3"> (optional)</span>
        ) : null}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          name={field.id}
          value={value}
          autoComplete={field.autoComplete}
          placeholder={landing ? undefined : field.placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          aria-required={field.optional ? undefined : true}
          readOnly={disabled}
          onFocus={() => {
            // A field the visitor reaches mid-cascade lands at once.
            if (land && landing) setLanded(land.n);
          }}
          onChange={(event) => {
            const next = event.currentTarget.value;
            if (land && landing) setLanded(land.n);
            onValue(next);
          }}
          className={cn(
            "h-9 w-full text-[13px] text-foreground transition-colors placeholder:text-ink-3",
            "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            s.input,
            error &&
              "border-[color-mix(in_oklab,var(--danger)_70%,transparent)]",
            landing && "text-transparent caret-transparent",
          )}
        />
        <AnimatePresence initial={false}>
          {land && land.n > 0 ? (
            <motion.span
              key={`wash-${land.n}`}
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0",
                fieldStyle === "line" ? "rounded-none" : "rounded-2",
              )}
              style={{
                backgroundColor:
                  "color-mix(in oklab, var(--ac-accent) 16%, transparent)",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                duration: 0.9,
                delay,
                times: [0, 0.12, 1],
                ease: easings.enter,
              }}
            />
          ) : null}
        </AnimatePresence>
        {landing && land ? (
          <motion.span
            key={`value-${land.n}`}
            aria-hidden
            className={cn(
              "pointer-events-none absolute flex items-center overflow-hidden text-[13px] whitespace-pre text-foreground",
              s.overlay,
            )}
            initial={{ y: motionSafe ? -distances.step : 0, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{
              y: motionSafe
                ? { ...springs.snap, delay }
                : { duration: 0, delay },
              opacity: { duration: durations.fast, delay },
            }}
            onAnimationComplete={() => setLanded(land.n)}
          >
            {value}
          </motion.span>
        ) : null}
        {land && land.n > 0 && value ? (
          <motion.span
            key={`check-${land.n}`}
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1/2 -mt-2 flex size-4 items-center justify-center rounded-full text-background",
              s.check,
            )}
            style={{ backgroundColor: "var(--ac-accent)" }}
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: 1, opacity: 0 }}
            transition={{
              scale: motionSafe
                ? { ...springs.snap, delay: delay + 0.06 }
                : { duration: 0, delay },
              opacity: { duration: durations.slow, delay: delay + 1 },
            }}
          >
            <Check className="size-2.5" strokeWidth={3} />
          </motion.span>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="text-[11.5px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

type Lookup = "idle" | "searching" | "done" | "error";

/**
 * An address form under a search line. The search is a combobox that looks
 * addresses up as you type (two characters, debounced), shows a quiet spinner
 * only when a lookup is slow, marks the run it matched, and always ends with
 * "Enter it manually". Choosing a suggestion closes the list on the exit ease
 * and fills the fields one after another from top to bottom, `staggerSpeed`
 * apart: each value slides down into its field on `snap`, a wash of the accent
 * fades behind it and a check pops and goes. A failed lookup falls back to
 * manual entry with what was typed in the first line.
 *
 * Fields are real inputs with autofill tokens and labels; the grid reflows
 * from `columns` across to one as the form narrows; required fields say what
 * is missing on submit and the first takes focus.
 */
export function AddressCascade({
  fields = defaultCascadeFields,
  suggestions = defaultCascadeSuggestions,
  onSuggest,
  value,
  defaultValue = {},
  onValueChange,
  onChange,
  onPick,
  onSubmit,
  lookupDelay = 0,
  spinnerDelay = 250,
  minQuery = 2,
  fieldStyle = "boxed",
  columns = 2,
  staggerSpeed = 70,
  accent = "var(--accent-bright)",
  title = "Delivery address",
  submitLabel = "Save address",
  maxHeight = 560,
  disabled = false,
  className,
}: AddressCascadeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const searchId = `${uid}-search`;
  const listId = `${uid}-list`;
  const cols = Math.min(3, Math.max(1, Math.round(columns)));

  const [own, setOwn] = React.useState<CascadeValues>(defaultValue);
  const values = value ?? own;
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [lookup, setLookup] = React.useState<Lookup>("idle");
  const [spinner, setSpinner] = React.useState(false);
  const [results, setResults] = React.useState<CascadeSuggestion[]>([]);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [cascadeN, setCascadeN] = React.useState(0);
  const [filled, setFilled] = React.useState<string[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submit, setSubmit] = React.useState<
    "idle" | "pending" | "done" | "failed"
  >("idle");
  const [announcement, setAnnouncement] = React.useState("");

  const seq = React.useRef(0);
  const debounce = React.useRef<number | null>(null);
  const spinTimer = React.useRef<number | null>(null);
  const delayTimer = React.useRef<number | null>(null);
  const inputs = React.useRef(new Map<string, HTMLInputElement>());
  const search = React.useRef<HTMLInputElement | null>(null);
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const alive = React.useRef(true);

  const clearTimers = () => {
    for (const t of [debounce, spinTimer, delayTimer]) {
      if (t.current !== null) window.clearTimeout(t.current);
      t.current = null;
    }
  };
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const t of [debounce, spinTimer, delayTimer]) {
        if (t.current !== null) window.clearTimeout(t.current);
        t.current = null;
      }
    };
  }, []);

  const setValues = (next: CascadeValues, changed: string[]) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    for (const id of changed) onChange?.(id, next[id] ?? "", next);
    if (submit !== "idle" && submit !== "pending") setSubmit("idle");
  };

  const runLookup = (q: string) => {
    const mine = (seq.current += 1);
    setLookup("searching");
    if (spinTimer.current !== null) window.clearTimeout(spinTimer.current);
    spinTimer.current = window.setTimeout(() => {
      if (seq.current === mine) setSpinner(true);
    }, spinnerDelay);
    const ask = (): Promise<CascadeSuggestion[]> => {
      if (onSuggest) {
        try {
          return Promise.resolve(onSuggest(q));
        } catch (error) {
          return Promise.reject(error);
        }
      }
      return new Promise((resolve) => {
        if (lookupDelay <= 0) resolve(filterCascadeSuggestions(q, suggestions));
        else
          delayTimer.current = window.setTimeout(
            () => resolve(filterCascadeSuggestions(q, suggestions)),
            lookupDelay,
          );
      });
    };
    ask().then(
      (list) => {
        if (!alive.current || seq.current !== mine) return;
        if (spinTimer.current !== null) window.clearTimeout(spinTimer.current);
        setSpinner(false);
        setResults(list.slice(0, 6));
        setLookup("done");
        setOpen(true);
        setActive(0);
        setAnnouncement(
          list.length
            ? `${list.length} ${list.length === 1 ? "address" : "addresses"} found. Arrow down to choose.`
            : `No addresses match ${q}. Enter it manually is available.`,
        );
      },
      () => {
        if (!alive.current || seq.current !== mine) return;
        if (spinTimer.current !== null) window.clearTimeout(spinTimer.current);
        setSpinner(false);
        setLookup("error");
        setOpen(false);
        setResults([]);
        const firstId = fields[0]?.id;
        const typed = q.trim();
        const carried = Boolean(firstId && !values[firstId] && typed);
        if (firstId && carried) {
          setCascadeN((n) => n + 1);
          setFilled([firstId]);
          setValues({ ...values, [firstId]: typed }, [firstId]);
        }
        setNotice(
          carried
            ? "Address lookup isn’t answering. What you typed is in the first line; fill in the rest below."
            : "Address lookup isn’t answering. Enter the address below.",
        );
        setAnnouncement("Address lookup failed. Enter the address manually.");
      },
    );
  };

  const onQuery = (next: string) => {
    setQuery(next);
    setNotice(null);
    clearTimers();
    seq.current += 1;
    if (next.trim().length < minQuery) {
      setOpen(false);
      setResults([]);
      setLookup("idle");
      setSpinner(false);
      return;
    }
    debounce.current = window.setTimeout(() => {
      debounce.current = null;
      runLookup(next.trim());
    }, 160);
  };

  const pick = (s: CascadeSuggestion) => {
    setOpen(false);
    clearTimers();
    seq.current += 1;
    setLookup("idle");
    setSpinner(false);
    setQuery(`${s.label}, ${s.detail}`);
    setNotice(null);
    setErrors({});
    const next = { ...values };
    const changed: string[] = [];
    for (const f of fields) {
      const v = s.values[f.id] ?? "";
      if ((values[f.id] ?? "") !== v) changed.push(f.id);
      next[f.id] = v;
    }
    setCascadeN((n) => n + 1);
    setFilled(
      fields.filter((f) => (s.values[f.id] ?? "") !== "").map((f) => f.id),
    );
    setValues(next, changed);
    onPick?.(s);
    const count = fields.filter((f) => s.values[f.id]).length;
    setAnnouncement(
      `Filled ${count} ${count === 1 ? "field" : "fields"} from ${s.label}.`,
    );
  };

  const goManual = () => {
    setOpen(false);
    clearTimers();
    seq.current += 1;
    setLookup("idle");
    setSpinner(false);
    const firstId = fields[0]?.id;
    const typed = query.trim();
    if (firstId && typed && !values[firstId]) {
      setCascadeN((n) => n + 1);
      setFilled([firstId]);
      setValues({ ...values, [firstId]: typed }, [firstId]);
    }
    const target = firstId ? inputs.current.get(firstId) : undefined;
    if (target) focusInForm(target);
    setAnnouncement("Enter the address in the fields below.");
  };

  /** Focus a field and bring it into view inside the form — never the page. */
  const focusInForm = (node: HTMLInputElement) => {
    node.focus({ preventScroll: true });
    const box = formRef.current;
    if (!box) return;
    const top =
      node.getBoundingClientRect().top - box.getBoundingClientRect().top;
    if (top < 40 || top > box.clientHeight - 60)
      box.scrollTo({
        top: Math.max(0, box.scrollTop + top - 48),
        behavior: motionSafe ? "smooth" : "auto",
      });
  };

  const options = results.length + 1; // the manual escape is always last
  const activeId =
    open && active < results.length
      ? `${uid}-opt-${results[active]?.id ?? ""}`
      : open
        ? `${uid}-opt-manual`
        : undefined;

  const submitForm = async () => {
    if (disabled || submit === "pending") return;
    const missing: Record<string, string> = {};
    for (const f of fields)
      if (!f.optional && !(values[f.id] ?? "").trim())
        missing[f.id] = `Add the ${f.label.toLowerCase()}.`;
    setErrors(missing);
    const first = fields.find((f) => missing[f.id]);
    if (first) {
      const node = inputs.current.get(first.id);
      if (node) focusInForm(node);
      const n = Object.keys(missing).length;
      setAnnouncement(
        `${n} ${n === 1 ? "field needs" : "fields need"} filling in.`,
      );
      return;
    }
    setSubmit("pending");
    try {
      await onSubmit?.(values);
      if (!alive.current) return;
      setSubmit("done");
      setAnnouncement("Address saved.");
    } catch {
      if (!alive.current) return;
      setSubmit("failed");
      setAnnouncement("Not saved. Try again.");
    }
  };

  const filledOrder = fields.filter((f) => filled.includes(f.id));

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "@container flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        maxHeight,
        ["--ac-accent" as string]: accent,
        ["--ac-cols" as string]: cols,
      }}
    >
      <header className="flex items-center gap-2.5 border-b border-hairline px-4 pt-3.5 pb-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-2 bg-surface-2">
          <MapPin aria-hidden className="size-4 text-ink-2" />
        </span>
        <div className="flex min-w-0 flex-col">
          <h2 id={titleId} className="text-sm font-semibold">
            {title}
          </h2>
          <p className="text-[12px] text-ink-3">
            Search once; the fields fill themselves.
          </p>
        </div>
      </header>

      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submitForm();
        }}
        className="flex flex-1 [scrollbar-width:thin] flex-col gap-4 overflow-y-auto overscroll-contain px-4 pt-4 pb-4"
      >
        <div className="relative flex flex-col gap-1.5">
          <label
            htmlFor={searchId}
            className="text-[12px] font-medium text-ink-2"
          >
            Find an address
          </label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
            />
            <input
              ref={search}
              id={searchId}
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeId}
              aria-busy={lookup === "searching" || undefined}
              autoComplete="off"
              spellCheck={false}
              readOnly={disabled}
              value={query}
              placeholder="Street or postcode"
              onChange={(event) => {
                const next = event.currentTarget.value;
                onQuery(next);
              }}
              onBlur={() => setOpen(false)}
              onKeyDown={(event) => {
                if (disabled) return;
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  if (!open) {
                    if (lookup === "done" || query.trim().length >= minQuery) {
                      setOpen(true);
                      setActive(event.key === "ArrowDown" ? 0 : options - 1);
                    }
                    return;
                  }
                  setActive(
                    (a) =>
                      (a + (event.key === "ArrowDown" ? 1 : -1) + options) %
                      options,
                  );
                } else if (event.key === "Enter") {
                  if (open) {
                    event.preventDefault();
                    const s = results[active];
                    if (s) pick(s);
                    else goManual();
                  }
                } else if (event.key === "Escape") {
                  if (open) {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpen(false);
                  } else if (query) {
                    event.preventDefault();
                    event.stopPropagation();
                    onQuery("");
                  }
                } else if (event.key === "Home" && open) {
                  event.preventDefault();
                  setActive(0);
                } else if (event.key === "End" && open) {
                  event.preventDefault();
                  setActive(options - 1);
                }
              }}
              className={cn(
                "h-10 w-full rounded-2 border border-input bg-surface-1 pr-16 pl-9 text-[13.5px] text-foreground placeholder:text-ink-3",
                "outline-none focus-visible:border-(--ac-accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              )}
            />
            <span className="absolute inset-y-0 right-2 flex items-center gap-1">
              {spinner ? (
                <span className="inline-flex items-center gap-1 text-ink-3">
                  <LoaderCircle
                    aria-hidden
                    className="size-3.5 text-(--ac-accent) motion-safe:animate-spin"
                  />
                  <span className="sr-only">Searching</span>
                </span>
              ) : null}
              {query ? (
                <button
                  type="button"
                  aria-label="Clear the search"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onQuery("");
                    search.current?.focus();
                  }}
                  className={cn(
                    "grid size-6 place-items-center rounded-1 text-ink-3 hover:bg-surface-2 hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              ) : null}
            </span>
          </div>

          <AnimatePresence>
            {open ? (
              <motion.ul
                key="list"
                id={listId}
                role="listbox"
                aria-label="Addresses"
                className="absolute inset-x-0 top-full z-30 mt-1 flex max-h-72 flex-col overflow-y-auto overscroll-contain rounded-2 border border-hairline-strong bg-popover p-1 shadow-[0_14px_32px_color-mix(in_oklab,black_20%,transparent)]"
                initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{
                  y: motionSafe ? springs.snap : { duration: 0 },
                  opacity: { duration: durations.fast },
                }}
              >
                {results.length === 0 ? (
                  <li
                    aria-hidden
                    className="px-2.5 pt-2 pb-1 text-[12.5px] text-ink-3"
                  >
                    No addresses match “{query.trim()}”.
                  </li>
                ) : null}
                {results.map((s, i) => (
                  <li
                    key={s.id}
                    id={`${uid}-opt-${s.id}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseMove={() => setActive(i)}
                    onClick={() => pick(s)}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-[calc(var(--radius-2)-2px)] px-2.5 py-2",
                      i === active
                        ? "bg-[color-mix(in_oklab,var(--ac-accent)_12%,transparent)]"
                        : "",
                    )}
                  >
                    <MapPin
                      aria-hidden
                      className="mt-0.5 size-3.5 shrink-0 text-ink-3"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[13px] text-foreground">
                        <Marked text={s.label} query={query} />
                      </span>
                      <span className="text-[11.5px] text-ink-3">
                        {s.detail}
                      </span>
                    </span>
                  </li>
                ))}
                <li
                  id={`${uid}-opt-manual`}
                  role="option"
                  aria-selected={active >= results.length}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setActive(results.length)}
                  onClick={goManual}
                  className={cn(
                    "mt-1 flex cursor-pointer items-center gap-2.5 rounded-[calc(var(--radius-2)-2px)] border-t border-hairline px-2.5 py-2 text-[12.5px] text-ink-2",
                    active >= results.length &&
                      "bg-[color-mix(in_oklab,var(--ac-accent)_12%,transparent)] text-foreground",
                  )}
                >
                  <PencilLine aria-hidden className="size-3.5 shrink-0" />
                  Enter it manually
                </li>
              </motion.ul>
            ) : null}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {notice ? (
              <motion.p
                key="notice"
                role="alert"
                initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{
                  y: motionSafe ? springs.snap : { duration: 0 },
                  opacity: { duration: durations.fast },
                }}
                className="flex items-start gap-1.5 text-[12px] leading-snug text-ink-2"
              >
                <TriangleAlert
                  aria-hidden
                  className="mt-0.5 size-3.5 shrink-0 text-warn"
                />
                {notice}
              </motion.p>
            ) : (
              <p className="text-[11.5px] text-ink-3">
                Can’t find it?{" "}
                <button
                  type="button"
                  onClick={goManual}
                  className={cn(
                    "rounded-1 text-ink-2 underline decoration-hairline-strong underline-offset-2 hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  Enter it manually
                </button>
              </p>
            )}
          </AnimatePresence>
        </div>

        <fieldset className="grid grid-cols-1 gap-x-3 gap-y-3.5 @min-[30rem]:grid-cols-[repeat(var(--ac-cols),minmax(0,1fr))]">
          <legend className="sr-only">Address</legend>
          {fields.map((f) => {
            const order = filledOrder.findIndex((x) => x.id === f.id);
            return (
              <Field
                key={f.id}
                field={f}
                value={values[f.id] ?? ""}
                error={errors[f.id]}
                fieldStyle={fieldStyle}
                land={
                  order >= 0
                    ? { n: cascadeN, delay: (order * staggerSpeed) / 1000 }
                    : null
                }
                motionSafe={motionSafe}
                disabled={disabled}
                errorId={`${uid}-err-${f.id}`}
                inputRef={(node) => {
                  if (node) inputs.current.set(f.id, node);
                  else inputs.current.delete(f.id);
                }}
                onValue={(v) => {
                  if (errors[f.id] && v.trim())
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next[f.id];
                      return next;
                    });
                  setValues({ ...values, [f.id]: v }, [f.id]);
                }}
              />
            );
          })}
        </fieldset>

        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-hairline pt-3.5">
          <p
            className={cn(
              "mr-auto flex min-w-0 items-center gap-1.5 text-[12px]",
              submit === "failed" ? "text-danger" : "text-ink-3",
            )}
          >
            {submit === "failed" ? (
              <>
                <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
                Not saved. Try again.
              </>
            ) : submit === "done" ? (
              <>
                <Check aria-hidden className="size-3.5 shrink-0 text-success" />
                Saved
              </>
            ) : Object.keys(errors).length ? (
              `${Object.keys(errors).length} to fill in`
            ) : (
              "We only ship within Northmere."
            )}
          </p>
          <button
            type="submit"
            aria-busy={submit === "pending" || undefined}
            aria-disabled={disabled || undefined}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-2 bg-(--ac-accent) px-4 text-[13px] font-medium text-background transition-opacity hover:opacity-90",
              FOCUS_RING,
            )}
          >
            {submit === "pending" ? (
              <LoaderCircle
                aria-hidden
                className="size-3.5 motion-safe:animate-spin"
              />
            ) : null}
            {submit === "pending" ? "Saving…" : submitLabel}
          </button>
        </div>
      </form>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
