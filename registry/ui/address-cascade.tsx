"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  ChevronDown,
  CircleCheck,
  Globe,
  MapPin,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type AddressFieldKey =
  "street" | "street2" | "city" | "region" | "postcode";

export type AddressOption = { code: string; name: string };

/** Columns of six a line takes in the grid layout. */
export type AddressSpan = 2 | 3 | 4 | 6;

/**
 * One line of a country's form. A key keeps its input when the country
 * changes, so a line both countries ask for glides to its new place instead
 * of being retyped.
 */
export type AddressField = {
  key: AddressFieldKey;
  /** "ZIP code", "Postal code", "Prefecture". */
  label: string;
  placeholder?: string;
  /** Empty is flagged on submit. @default true */
  required?: boolean;
  /** Width in the grid layout, in columns of six. @default 6 */
  span?: AddressSpan;
  /** Choices for a select line (states, provinces, prefectures); a text line otherwise. */
  options?: AddressOption[];
  /** Shapes typed text is set into on blur, A a letter and 9 a digit: "A9A 9A9". The first that fits wins. */
  masks?: string[];
  /** A regular expression the finished text must match. */
  pattern?: string;
  /** What to say when it does not: "Use the form A1A 1A1". */
  hint?: string;
  /** The browser's autofill token for the line. */
  autoComplete?: string;
};

export type AddressCountry = {
  /** "CA". */
  code: string;
  name: string;
  /** The lines, in the order the country's form asks for them. */
  fields: AddressField[];
  /** How the address prints, one template per line: "{city}, {region} {postcode}". {region} prints the code, {regionName} the name. */
  format: string[];
};

export type AddressValue = {
  /** The chosen country's code, or null before one is picked. */
  country: string | null;
  street: string;
  street2: string;
  city: string;
  region: string;
  postcode: string;
};

export type AddressSuggestion = {
  id: string;
  /** The country it belongs to; it is offered only there. */
  country: string;
  street: string;
  street2?: string;
  city: string;
  /** A region code, where the country has one. */
  region?: string;
  postcode: string;
};

export type AddressChange = {
  /** Which line changed; "suggestion" when every line was filled at once. */
  field: "country" | "suggestion" | AddressFieldKey;
  from: string | null;
  to: string | null;
};

export type AddressLayout = "stack" | "grid";
export type AddressDensity = "compact" | "cozy" | "roomy";
export type AddressStatus = "ready" | "loading" | "error";

export type AddressCascadeProps = {
  /** The countries offered, each with its lines and print format. @default defaultAddressCountries */
  countries?: AddressCountry[];
  /** Addresses the street line offers as it is typed; picking one fills every line. @default defaultAddressSuggestions */
  suggestions?: AddressSuggestion[];
  /** Controlled address. */
  value?: AddressValue;
  /** Initial address when uncontrolled. @default defaultAddressValue */
  defaultValue?: AddressValue;
  /** Fires from every keystroke, pick and fill, with the whole address and what changed. */
  onChange?: (value: AddressValue, change: AddressChange) => void;
  /** The form was submitted and every line passed, with the address and its printed lines. */
  onSubmit?: (value: AddressValue, lines: string[]) => void;
  /** Every line in one column, or short lines sharing a row from a 26rem container. @default "grid" */
  layout?: AddressLayout;
  /** Show the address as the country prints it, beside the form. @default true */
  preview?: boolean;
  /** Line heights, type size and spacing. @default "cozy" */
  density?: AddressDensity;
  /** Whether the country list has arrived. @default "ready" */
  status?: AddressStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Shipping address" */
  title?: string;
  /** The submit button's text. @default "Save address" */
  submitLabel?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the lines scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be typed, picked or submitted. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const opts = (spec: string): AddressOption[] =>
  spec.split("|").map((pair) => {
    const cut = pair.indexOf(" ");
    return { code: pair.slice(0, cut), name: pair.slice(cut + 1) };
  });

const US_STATES = opts(
  "AL Alabama|AK Alaska|AZ Arizona|AR Arkansas|CA California|CO Colorado|CT Connecticut|DE Delaware|DC District of Columbia|FL Florida|GA Georgia|HI Hawaii|ID Idaho|IL Illinois|IN Indiana|IA Iowa|KS Kansas|KY Kentucky|LA Louisiana|ME Maine|MD Maryland|MA Massachusetts|MI Michigan|MN Minnesota|MS Mississippi|MO Missouri|MT Montana|NE Nebraska|NV Nevada|NH New Hampshire|NJ New Jersey|NM New Mexico|NY New York|NC North Carolina|ND North Dakota|OH Ohio|OK Oklahoma|OR Oregon|PA Pennsylvania|RI Rhode Island|SC South Carolina|SD South Dakota|TN Tennessee|TX Texas|UT Utah|VT Vermont|VA Virginia|WA Washington|WV West Virginia|WI Wisconsin|WY Wyoming",
);

const CA_PROVINCES = opts(
  "AB Alberta|BC British Columbia|MB Manitoba|NB New Brunswick|NL Newfoundland and Labrador|NS Nova Scotia|NT Northwest Territories|NU Nunavut|ON Ontario|PE Prince Edward Island|QC Quebec|SK Saskatchewan|YT Yukon",
);

const AU_STATES = opts(
  "ACT Australian Capital Territory|NSW New South Wales|NT Northern Territory|QLD Queensland|SA South Australia|TAS Tasmania|VIC Victoria|WA Western Australia",
);

const JP_PREFECTURES = opts(
  "01 Hokkaido|02 Aomori|03 Iwate|04 Miyagi|05 Akita|06 Yamagata|07 Fukushima|08 Ibaraki|09 Tochigi|10 Gunma|11 Saitama|12 Chiba|13 Tokyo|14 Kanagawa|15 Niigata|16 Toyama|17 Ishikawa|18 Fukui|19 Yamanashi|20 Nagano|21 Gifu|22 Shizuoka|23 Aichi|24 Mie|25 Shiga|26 Kyoto|27 Osaka|28 Hyogo|29 Nara|30 Wakayama|31 Tottori|32 Shimane|33 Okayama|34 Hiroshima|35 Yamaguchi|36 Tokushima|37 Kagawa|38 Ehime|39 Kochi|40 Fukuoka|41 Saga|42 Nagasaki|43 Kumamoto|44 Oita|45 Miyazaki|46 Kagoshima|47 Okinawa",
);

const street = (
  label = "Street address",
  placeholder = "14 Coldbrook Avenue",
): AddressField => ({
  key: "street",
  label,
  placeholder,
  autoComplete: "address-line1",
});

const street2 = (label = "Apartment, suite, unit"): AddressField => ({
  key: "street2",
  label,
  placeholder: "Optional",
  required: false,
  autoComplete: "address-line2",
});

const city = (
  label: string,
  span: AddressSpan,
  placeholder?: string,
): AddressField => ({
  key: "city",
  label,
  span,
  placeholder,
  autoComplete: "address-level2",
});

const region = (
  label: string,
  options: AddressOption[],
  span: AddressSpan,
): AddressField => ({
  key: "region",
  label,
  options,
  span,
  autoComplete: "address-level1",
});

const postcode = (
  label: string,
  masks: string[],
  pattern: string,
  hint: string,
  span: AddressSpan,
  placeholder: string,
): AddressField => ({
  key: "postcode",
  label,
  masks,
  pattern,
  hint,
  span,
  placeholder,
  autoComplete: "postal-code",
});

/** Seven countries Basinworks ships to, each with its own lines and order. */
export const defaultAddressCountries: AddressCountry[] = [
  {
    code: "US",
    name: "United States",
    fields: [
      street(),
      street2(),
      city("City", 2),
      region("State", US_STATES, 2),
      postcode(
        "ZIP code",
        ["99999", "99999-9999"],
        "^\\d{5}(-\\d{4})?$",
        "Use the form 12345 or 12345-6789.",
        2,
        "97209",
      ),
    ],
    format: ["{street}", "{street2}", "{city}, {region} {postcode}"],
  },
  {
    code: "CA",
    name: "Canada",
    fields: [
      street(),
      street2("Unit"),
      city("City", 2),
      region("Province", CA_PROVINCES, 2),
      postcode(
        "Postal code",
        ["A9A 9A9"],
        "^[A-Z]\\d[A-Z] \\d[A-Z]\\d$",
        "Use the form A1A 1A1.",
        2,
        "M5V 2T6",
      ),
    ],
    format: ["{street}", "{street2}", "{city} {region}  {postcode}"],
  },
  {
    code: "GB",
    name: "United Kingdom",
    fields: [
      street("Street address", "7 Coldbrook Lane"),
      street2("Address line 2"),
      city("Town or city", 3),
      postcode(
        "Postcode",
        ["AA99 9AA", "A99 9AA", "A9 9AA", "AA9 9AA", "A9A 9AA", "AA9A 9AA"],
        "^[A-Z]{1,2}\\d[A-Z\\d]? \\d[A-Z]{2}$",
        "Use the form SW1A 1AA.",
        3,
        "EC1A 1BB",
      ),
    ],
    format: ["{street}", "{street2}", "{city}", "{postcode}"],
  },
  {
    code: "DE",
    name: "Germany",
    fields: [
      street("Street and number", "Fieldlinestrasse 9"),
      street2("Address line 2"),
      postcode(
        "Postcode",
        ["99999"],
        "^\\d{5}$",
        "Use five digits, like 10115.",
        2,
        "10115",
      ),
      city("City", 4),
    ],
    format: ["{street}", "{street2}", "{postcode} {city}"],
  },
  {
    code: "JP",
    name: "Japan",
    fields: [
      postcode(
        "Postal code",
        ["999-9999"],
        "^\\d{3}-\\d{4}$",
        "Use the form 100-0001.",
        2,
        "100-0001",
      ),
      region("Prefecture", JP_PREFECTURES, 4),
      city("City or ward", 6, "Chiyoda-ku"),
      street("Street and block", "1-7-2 Basinmachi"),
      street2("Building and room"),
    ],
    format: ["{postcode}", "{regionName} {city}", "{street}", "{street2}"],
  },
  {
    code: "AU",
    name: "Australia",
    fields: [
      street("Street address", "18 Fernmoor Street"),
      street2(),
      city("Suburb", 2),
      region("State", AU_STATES, 2),
      postcode(
        "Postcode",
        ["9999"],
        "^\\d{4}$",
        "Use four digits, like 3065.",
        2,
        "3065",
      ),
    ],
    format: ["{street}", "{street2}", "{city} {region} {postcode}"],
  },
  {
    code: "NL",
    name: "Netherlands",
    fields: [
      street("Street and number", "Coldbrookstraat 12"),
      street2("Address line 2"),
      postcode(
        "Postcode",
        ["9999 AA"],
        "^\\d{4} [A-Z]{2}$",
        "Use the form 1234 AB.",
        2,
        "1012 AB",
      ),
      city("City", 4),
    ],
    format: ["{street}", "{street2}", "{postcode}  {city}"],
  },
];

/** Fifteen seeded addresses, two or three per country, offered from the street line. */
export const defaultAddressSuggestions: AddressSuggestion[] = [
  {
    id: "us-1",
    country: "US",
    street: "14 Coldbrook Avenue",
    city: "Portland",
    region: "OR",
    postcode: "97209",
  },
  {
    id: "us-2",
    country: "US",
    street: "880 Basin Street",
    street2: "Suite 4",
    city: "New Orleans",
    region: "LA",
    postcode: "70112",
  },
  {
    id: "us-3",
    country: "US",
    street: "2300 Fernmoor Drive",
    city: "Austin",
    region: "TX",
    postcode: "78704",
  },
  {
    id: "ca-1",
    country: "CA",
    street: "41 Gaugeworks Road",
    city: "Toronto",
    region: "ON",
    postcode: "M5V 2T6",
  },
  {
    id: "ca-2",
    country: "CA",
    street: "1180 Rue Fieldline",
    street2: "App. 3",
    city: "Montreal",
    region: "QC",
    postcode: "H2Y 1C6",
  },
  {
    id: "gb-1",
    country: "GB",
    street: "7 Coldbrook Lane",
    city: "London",
    postcode: "EC1A 1BB",
  },
  {
    id: "gb-2",
    country: "GB",
    street: "22 Basin Wharf",
    street2: "Flat 2",
    city: "Bristol",
    postcode: "BS1 4DJ",
  },
  {
    id: "de-1",
    country: "DE",
    street: "Fieldlinestrasse 9",
    city: "Berlin",
    postcode: "10115",
  },
  {
    id: "de-2",
    country: "DE",
    street: "Basinweg 3",
    city: "Munich",
    postcode: "80331",
  },
  {
    id: "jp-1",
    country: "JP",
    street: "1-7-2 Basinmachi",
    street2: "Fernmoor Building 4F",
    city: "Chiyoda-ku",
    region: "13",
    postcode: "100-0001",
  },
  {
    id: "jp-2",
    country: "JP",
    street: "3-14 Coldbrook-cho",
    city: "Kita-ku",
    region: "27",
    postcode: "530-0001",
  },
  {
    id: "au-1",
    country: "AU",
    street: "18 Fernmoor Street",
    city: "Fitzroy",
    region: "VIC",
    postcode: "3065",
  },
  {
    id: "au-2",
    country: "AU",
    street: "5 Gaugeworks Place",
    city: "Sydney",
    region: "NSW",
    postcode: "2000",
  },
  {
    id: "nl-1",
    country: "NL",
    street: "Coldbrookstraat 12",
    city: "Amsterdam",
    postcode: "1012 AB",
  },
  {
    id: "nl-2",
    country: "NL",
    street: "Basinkade 5",
    street2: "2e verdieping",
    city: "Rotterdam",
    postcode: "3011 AA",
  },
];

/** The United States picked, every line still blank. */
export const defaultAddressValue: AddressValue = {
  country: "US",
  street: "",
  street2: "",
  city: "",
  region: "",
  postcode: "",
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const CONTROL =
  "w-full min-w-0 rounded-2 border border-hairline-strong bg-surface-1 text-foreground transition-colors placeholder:text-ink-3 hover:border-border";

const FIELD_KEYS: AddressFieldKey[] = [
  "street",
  "street2",
  "city",
  "region",
  "postcode",
];

const DENSITY: Record<
  AddressDensity,
  {
    control: string;
    px: string;
    text: string;
    label: string;
    gap: string;
    pad: string;
    option: string;
  }
> = {
  compact: {
    control: "h-8",
    px: "px-2.5",
    text: "text-[13px]",
    label: "text-[11px]",
    gap: "gap-x-2.5 gap-y-2.5",
    pad: "px-3 py-3",
    option: "min-h-7 py-1",
  },
  cozy: {
    control: "h-9",
    px: "px-3",
    text: "text-sm",
    label: "text-xs",
    gap: "gap-x-3 gap-y-3",
    pad: "px-4 py-4",
    option: "min-h-8 py-1",
  },
  roomy: {
    control: "h-10",
    px: "px-3.5",
    text: "text-sm",
    label: "text-xs",
    gap: "gap-x-4 gap-y-4",
    pad: "px-5 py-5",
    option: "min-h-9 py-1.5",
  },
};

const SPAN: Record<AddressSpan, string> = {
  2: "@min-[26rem]:col-span-2",
  3: "@min-[26rem]:col-span-3",
  4: "@min-[26rem]:col-span-4",
  6: "@min-[26rem]:col-span-6",
};

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const noopSubscribe = () => () => {};

const isKey = (k: string): k is AddressFieldKey =>
  (FIELD_KEYS as string[]).includes(k);

/** Sets raw text into one shape, or null when it does not fit. */
const fitMask = (mask: string, raw: string): string | null => {
  const chars = raw.replace(/[\s-]/g, "").toUpperCase().split("");
  let out = "";
  let i = 0;
  for (const m of mask) {
    if (m === "A" || m === "9") {
      const c = chars[i];
      if (c === undefined) return null;
      if (m === "A" ? !/[A-Z]/.test(c) : !/[0-9]/.test(c)) return null;
      out += c;
      i += 1;
    } else {
      out += m;
    }
  }
  return i === chars.length ? out : null;
};

/** The postcode as the country writes it: "k1a0b1" becomes "K1A 0B1". Text that fits no shape is left as typed. */
export const formatPostcode = (field: AddressField, raw: string): string => {
  const trimmed = raw.trim();
  for (const mask of field.masks ?? []) {
    const fitted = fitMask(mask, trimmed);
    if (fitted !== null) return fitted;
  }
  return trimmed;
};

/** The lines that are empty or malformed for a country, with what to say under each. */
export const validateAddress = (
  country: AddressCountry,
  value: AddressValue,
): Partial<Record<AddressFieldKey, string>> => {
  const issues: Partial<Record<AddressFieldKey, string>> = {};
  for (const field of country.fields) {
    const text = value[field.key].trim();
    if (text === "") {
      if (field.required !== false)
        issues[field.key] = `${field.label} is needed.`;
      continue;
    }
    if (field.pattern && !new RegExp(field.pattern).test(text)) {
      issues[field.key] =
        field.hint ?? `${field.label} is not in the right form.`;
    }
  }
  return issues;
};

type Token =
  "street" | "street2" | "city" | "region" | "regionName" | "postcode";
type Part = { text: string } | { token: Token };

const TOKENS: Token[] = [
  "street",
  "street2",
  "city",
  "region",
  "regionName",
  "postcode",
];

const parseFormat = (line: string): Part[] => {
  const parts: Part[] = [];
  const re = /\{(\w+)\}/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) parts.push({ text: line.slice(last, m.index) });
    const name = m[1] ?? "";
    if ((TOKENS as string[]).includes(name))
      parts.push({ token: name as Token });
    else parts.push({ text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push({ text: line.slice(last) });
  return parts;
};

const keyOfToken = (token: Token): AddressFieldKey =>
  token === "regionName" ? "region" : token;

const tokenText = (
  token: Token,
  country: AddressCountry,
  value: AddressValue,
): string => {
  if (token === "regionName") {
    const field = country.fields.find((f) => f.key === "region");
    return (
      field?.options?.find((o) => o.code === value.region)?.name ?? value.region
    );
  }
  return value[token];
};

/** What a line's key is: lines that carry the city keep one identity across countries, so they glide rather than swap. */
const lineKey = (parts: Part[], index: number): string => {
  const tokens = parts.flatMap((p) => ("token" in p ? [p.token] : []));
  if (tokens.some((t) => t === "city")) return "city";
  return tokens[0] ?? `text-${index}`;
};

/** The address as the country prints it, blank lines dropped, the country last. */
export const formatAddress = (
  country: AddressCountry,
  value: AddressValue,
): string[] => {
  const lines: string[] = [];
  for (const template of country.format) {
    const parts = parseFormat(template);
    const text = parts
      .map((p) => ("text" in p ? p.text : tokenText(p.token, country, value)))
      .join("")
      .replace(/\s+,/g, ",")
      .replace(/ {3,}/g, "  ")
      .trim();
    if (text !== "" && text !== ",") lines.push(text);
  }
  lines.push(country.name.toUpperCase());
  return lines;
};

/* ----------------------------------------------------------------------- */
/*                                 Landing                                  */
/* ----------------------------------------------------------------------- */

/**
 * The text a suggestion put into a line, arriving over the (hidden) real
 * value: a tint washes through and the words settle from a nudge below on
 * glide, each line a beat after the last.
 */
function Landing({
  text,
  delay,
  padClass,
}: {
  text: string;
  delay: number;
  padClass: string;
}) {
  return (
    <>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2 bg-cobalt-wash"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: durations.slow, delay, ease: easings.enter }}
      />
      <motion.span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-nowrap",
          padClass,
        )}
        initial={{ opacity: 0, y: distances.nudge }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          ...springs.glide,
          delay,
          opacity: { duration: durations.fast, delay },
        }}
      >
        <span className="truncate">{text}</span>
      </motion.span>
    </>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Picker                                  */
/* ----------------------------------------------------------------------- */

type PickerProps = {
  id: string;
  listId: string;
  fieldKey: string;
  value: string;
  options: AddressOption[];
  placeholder: string;
  open: boolean;
  activeId: string | undefined;
  labelledBy: string;
  describedBy: string | undefined;
  invalid: boolean;
  disabled: boolean;
  landing: number | null;
  motionSafe: boolean;
  sizeClass: string;
  padClass: string;
  anchorRef: (node: HTMLButtonElement | null) => void;
  onToggle: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
};

/** A select-only combobox: the button keeps focus, the list at the root follows aria-activedescendant. */
function Picker({
  id,
  listId,
  fieldKey,
  value,
  options,
  placeholder,
  open,
  activeId,
  labelledBy,
  describedBy,
  invalid,
  disabled,
  landing,
  motionSafe,
  sizeClass,
  padClass,
  anchorRef,
  onToggle,
  onKeyDown,
  onFocus,
  onBlur,
}: PickerProps) {
  const chosen = options.find((o) => o.code === value);
  return (
    <button
      ref={anchorRef}
      id={id}
      type="button"
      role="combobox"
      data-key={fieldKey}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      aria-activedescendant={open ? activeId : undefined}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onToggle();
      }}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        CONTROL,
        sizeClass,
        padClass,
        "relative flex items-center justify-between gap-2 text-left",
        invalid && "border-danger hover:border-danger",
        open && "border-border",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        FOCUS_RING,
      )}
    >
      <span
        className={cn(
          "min-w-0 truncate",
          !chosen && "text-ink-3",
          landing !== null && "text-transparent",
        )}
      >
        {chosen?.name ?? placeholder}
      </span>
      <motion.span
        aria-hidden
        className="flex shrink-0 text-ink-3"
        initial={false}
        animate={{ rotate: open ? 180 : 0 }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        <ChevronDown className="size-3.5" />
      </motion.span>
      {landing !== null && chosen ? (
        <Landing text={chosen.name} delay={landing} padClass={padClass} />
      ) : null}
    </button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Preview                                  */
/* ----------------------------------------------------------------------- */

function Preview({
  country,
  value,
  motionSafe,
  compact,
}: {
  country: AddressCountry | null;
  value: AddressValue;
  motionSafe: boolean;
  compact: boolean;
}) {
  const lines = country
    ? country.format.map((template, i) => {
        const parts = parseFormat(template);
        return { key: lineKey(parts, i), parts };
      })
    : [];
  // Two lines with the same identity would fight over one key.
  const seen = new Set<string>();
  for (const line of lines) {
    while (seen.has(line.key)) line.key = `${line.key}+`;
    seen.add(line.key);
  }
  const step = cascade(lines.length + 1);
  const labelOf = (token: Token) =>
    country?.fields.find((f) => f.key === keyOfToken(token))?.label ??
    keyOfToken(token);

  return (
    <div
      className={cn(
        "flex flex-col",
        compact ? "gap-1.5" : "gap-2.5",
        !compact && "rounded-3 border border-hairline bg-surface-1 p-4",
      )}
    >
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        As printed{country ? ` in ${country.name}` : ""}
      </p>
      {!country ? (
        <p className="text-xs text-ink-3">
          Pick a country to see how it lays out.
        </p>
      ) : (
        <div
          aria-label="Address preview"
          className={cn(
            "relative flex flex-col font-mono text-[13px]",
            compact ? "leading-5" : "leading-6",
          )}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {lines.map((line, i) => (
              <motion.div
                key={line.key}
                layout={motionSafe ? "position" : false}
                initial={
                  motionSafe
                    ? { opacity: 0, x: -distances.nudge }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{
                  layout: springs.glide,
                  x: motionSafe
                    ? { ...springs.glide, delay: r3(i * step) }
                    : { duration: 0 },
                  opacity: { duration: durations.base, ease: easings.enter },
                }}
                className="truncate whitespace-pre"
              >
                {line.parts.map((part, j) =>
                  "text" in part ? (
                    <span key={j}>{part.text}</span>
                  ) : tokenText(part.token, country, value).trim() !== "" ? (
                    <span key={j}>{tokenText(part.token, country, value)}</span>
                  ) : (
                    <span key={j} className="text-ink-3">
                      {labelOf(part.token)}
                    </span>
                  ),
                )}
              </motion.div>
            ))}
            <motion.div
              key="country"
              layout={motionSafe ? "position" : false}
              transition={{ layout: springs.glide }}
              className="truncate text-ink-2"
            >
              {country.name.toUpperCase()}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

type PopKind = "country" | "region" | "street";

type Pop = {
  kind: PopKind;
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
};

type PopOption = { id: string; label: string; sub?: string };

type Landed = { seq: number; keys: AddressFieldKey[]; step: number };

/**
 * An address form that takes the shape of its country. A listbox at the top
 * picks the country; the lines below are rebuilt for it — the right labels,
 * placeholders and postcode shape, a state or province select where there
 * is one, a prefecture for Japan, none for Britain — and every line that
 * survives the change glides to its new place on `springs.glide` while
 * leavers fade on the exit ease and newcomers arrive in a short cascade.
 * Focus stays on the line it was on, even after the line moved.
 *
 * The street line is a combobox over seeded addresses; picking one fills
 * every line at once, each one's text landing a beat after the last on
 * glide under a wash of the accent. A postcode is set into the country's
 * shape on blur (k1a0b1 becomes K1A 0B1) and checked against its pattern;
 * what fails is said under the line in a message that slides in on glide.
 * Beside the form a preview prints the address as that country does, its
 * lines rearranging on glide when the country changes.
 *
 * The country and region pickers are select-only comboboxes (arrows,
 * Home/End, type-ahead, Enter picks, Escape closes); the street list takes
 * arrows and Enter without leaving the field. Submit focuses the first line
 * that needs attention or lands a Saved stamp on `springs.recoil`. Under
 * reduced motion lines swap in place, filled text appears at once and the
 * preview re-stacks without travelling — every line, message and
 * announcement is still reached.
 */
export function AddressCascade({
  countries = defaultAddressCountries,
  suggestions = defaultAddressSuggestions,
  value,
  defaultValue = defaultAddressValue,
  onChange,
  onSubmit,
  layout = "grid",
  preview = true,
  density = "cozy",
  status = "ready",
  onRetry,
  title = "Shipping address",
  submitLabel = "Save address",
  label,
  height = 540,
  disabled = false,
  className,
}: AddressCascadeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const formId = `${uid}-form`;
  const listId = `${uid}-list`;
  const countryId = `${uid}-country`;
  const countryLabelId = `${uid}-country-label`;

  const [own, setOwn] = React.useState<AddressValue>(defaultValue);
  const current = value ?? own;
  const ready = status === "ready";
  const inert = disabled || !ready;
  const dens = DENSITY[density];

  const [touched, setTouched] = React.useState<
    Partial<Record<AddressFieldKey, true>>
  >({});
  const [submitted, setSubmitted] = React.useState(false);
  const [pop, setPop] = React.useState<Pop | null>(null);
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [landing, setLanding] = React.useState<Landed | null>(null);
  const [saved, setSaved] = React.useState(0);
  const [announcement, setAnnouncement] = React.useState("");
  // False for the server render and hydration, so the Saved stamp and the
  // popovers (which only ever mount later) are the only things that animate in.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const popRef = React.useRef<HTMLDivElement | null>(null);
  const anchors = React.useRef(new Map<PopKind, HTMLElement>());
  const fieldNodes = React.useRef(new Map<string, HTMLElement>());
  const focusKey = React.useRef<string | null>(null);
  const blurTimer = React.useRef<number | null>(null);
  const landTimer = React.useRef<number | null>(null);
  const savedTimer = React.useRef<number | null>(null);
  const typeRef = React.useRef({ text: "", at: 0 });

  /* -------------------------------- data ------------------------------- */

  const country = countries.find((c) => c.code === current.country) ?? null;
  const fields = country?.fields ?? [];
  const regionField = fields.find((f) => f.key === "region") ?? null;
  const issues = country ? validateAddress(country, current) : {};
  const issueKeys = Object.keys(issues).filter(isKey);
  const filled = fields.filter((f) => current[f.key].trim() !== "").length;
  const step = cascade(Math.max(fields.length, 2));

  const query = current.street.trim().toLowerCase();
  const matches = country
    ? suggestions
        .filter(
          (s) =>
            s.country === country.code &&
            (query === "" ||
              s.street.toLowerCase().includes(query) ||
              s.city.toLowerCase().includes(query)),
        )
        .slice(0, 6)
    : [];

  const optionsFor = (kind: PopKind): PopOption[] =>
    kind === "country"
      ? countries.map((c) => ({ id: c.code, label: c.name }))
      : kind === "region"
        ? (regionField?.options ?? []).map((o) => ({
            id: o.code,
            label: o.name,
          }))
        : matches.map((s) => ({
            id: s.id,
            label: s.street,
            sub: [s.street2, s.city, s.region, s.postcode]
              .filter(Boolean)
              .join(", "),
          }));

  const popOptions = pop ? optionsFor(pop.kind) : [];
  const active = clamp(activeIdx, 0, Math.max(popOptions.length - 1, 0));
  const activeId =
    pop && popOptions[active] ? `${uid}-opt-${active}` : undefined;

  /* ------------------------------- timers ------------------------------ */

  React.useEffect(
    () => () => {
      for (const t of [blurTimer, landTimer, savedTimer]) {
        if (t.current !== null) window.clearTimeout(t.current);
      }
    },
    [],
  );

  /* ------------------------------- changes ----------------------------- */

  const commit = (next: AddressValue, change: AddressChange) => {
    if (value === undefined) setOwn(next);
    onChange?.(next, change);
  };

  const setField = (key: AddressFieldKey, text: string) => {
    if (inert) return;
    commit(
      { ...current, [key]: text },
      { field: key, from: current[key], to: text },
    );
  };

  const setCountry = (code: string) => {
    if (inert || code === current.country) return;
    const next = countries.find((c) => c.code === code);
    if (!next) return;
    commit(
      { ...current, country: code, region: "", postcode: "" },
      { field: "country", from: current.country, to: code },
    );
    setTouched({});
    setSubmitted(false);
    setAnnouncement(
      `${next.name}. ${next.fields.length} lines: ${next.fields
        .map((f) => f.label)
        .join(", ")}.`,
    );
  };

  const fill = (id: string) => {
    const s = suggestions.find((x) => x.id === id);
    const c = countries.find((x) => x.code === s?.country);
    if (!s || !c || inert) return;
    const next: AddressValue = {
      country: s.country,
      street: s.street,
      street2: s.street2 ?? "",
      city: s.city,
      region: s.region ?? "",
      postcode: s.postcode,
    };
    commit(next, { field: "suggestion", from: current.street, to: s.street });
    setTouched({});
    setSubmitted(false);
    const keys = c.fields
      .map((f) => f.key)
      .filter((k) => next[k].trim() !== "");
    if (motionSafe) {
      const landStep = cascade(keys.length);
      setLanding((l) => ({ seq: (l?.seq ?? 0) + 1, keys, step: landStep }));
      if (landTimer.current !== null) window.clearTimeout(landTimer.current);
      landTimer.current = window.setTimeout(
        () => {
          landTimer.current = null;
          setLanding(null);
        },
        Math.round((keys.length - 1) * landStep * 1000) + 520,
      );
    }
    setAnnouncement(
      `Filled from ${s.street}, ${s.city}: ${keys.length} ${keys.length === 1 ? "line" : "lines"}.`,
    );
  };

  const touch = (key: AddressFieldKey) => {
    setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
  };

  const blurPostcode = () => {
    const field = fields.find((f) => f.key === "postcode");
    if (!field) return;
    const shaped = formatPostcode(field, current.postcode);
    if (shaped !== current.postcode) setField("postcode", shaped);
    touch("postcode");
  };

  const shownIssue = (key: AddressFieldKey) =>
    touched[key] || submitted ? issues[key] : undefined;

  /* ------------------------------- submit ------------------------------ */

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (inert || !country) return;
    setPop(null);
    setSubmitted(true);
    const first = issueKeys[0];
    if (first) {
      fieldNodes.current.get(first)?.focus({ preventScroll: false });
      setAnnouncement(
        `${issueKeys.length} ${issueKeys.length === 1 ? "line needs" : "lines need"} attention: ${issueKeys
          .map((k) => fields.find((f) => f.key === k)?.label ?? k)
          .join(", ")}.`,
      );
      return;
    }
    const lines = formatAddress(country, current);
    onSubmit?.(current, lines);
    setSaved((n) => n + 1);
    if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => {
      savedTimer.current = null;
      setSaved(0);
    }, 2200);
    setAnnouncement(`Address saved: ${lines.join(", ")}.`);
  };

  /* ------------------------------- popover ----------------------------- */

  const measure = (kind: PopKind): Pop | null => {
    const root = rootRef.current;
    const anchor = anchors.current.get(kind);
    if (!root || !anchor) return null;
    const rr = root.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    const width = Math.round(
      clamp(
        kind === "country" ? ar.width : Math.max(ar.width, 220),
        160,
        rr.width - 16,
      ),
    );
    const left = Math.round(clamp(ar.left - rr.left, 8, rr.width - width - 8));
    const below = rr.bottom - ar.bottom - 8;
    const above = ar.top - rr.top - 8;
    if (below >= 150 || below >= above) {
      return {
        kind,
        left,
        width,
        top: Math.round(ar.bottom - rr.top + 4),
        maxHeight: Math.round(clamp(below - 4, 64, 248)),
      };
    }
    return {
      kind,
      left,
      width,
      bottom: Math.round(rr.bottom - ar.top + 4),
      maxHeight: Math.round(clamp(above - 4, 64, 248)),
    };
  };

  const openPop = (kind: PopKind, at: number) => {
    if (inert) return;
    const next = measure(kind);
    if (!next) return;
    setActiveIdx(Math.max(0, at));
    setPop(next);
  };

  const closePop = () => setPop(null);

  const pick = (kind: PopKind, id: string) => {
    if (kind === "country") setCountry(id);
    else if (kind === "region") {
      setField("region", id);
      touch("region");
      const name = regionField?.options?.find((o) => o.code === id)?.name;
      if (name) setAnnouncement(`${regionField?.label ?? "Region"}: ${name}.`);
    } else fill(id);
    setPop(null);
  };

  const pickActive = () => {
    const option = popOptions[active];
    if (pop && option) pick(pop.kind, option.id);
  };

  const popKind = pop?.kind ?? null;
  React.useEffect(() => {
    if (!popKind) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popRef.current?.contains(target)) return;
      if (anchors.current.get(popKind)?.contains(target)) return;
      setPop(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [popKind]);

  React.useEffect(() => {
    if (!popKind) return;
    document
      .getElementById(`${uid}-opt-${active}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [popKind, active, uid]);

  /* ------------------------------ keyboard ----------------------------- */

  // Letters typed within 600ms of each other (by the events' own clock)
  // build one prefix; a pause starts a new one.
  const typeAhead = (
    options: PopOption[],
    char: string,
    from: number,
    now: number,
  ) => {
    const buf =
      now - typeRef.current.at < 600 ? typeRef.current.text + char : char;
    typeRef.current = { text: buf.toLowerCase(), at: now };
    const start = buf.length === 1 ? from + 1 : from;
    for (let n = 0; n < options.length; n += 1) {
      const i = (start + n) % options.length;
      if (options[i]?.label.toLowerCase().startsWith(typeRef.current.text)) {
        return i;
      }
    }
    return -1;
  };

  const pickerKey = (
    kind: "country" | "region",
    event: React.KeyboardEvent,
    selected: string,
  ) => {
    if (inert) return;
    const options = optionsFor(kind);
    const open = pop?.kind === kind;
    const at = Math.max(
      0,
      options.findIndex((o) => o.id === selected),
    );
    const { key } = event;
    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      if (!open) openPop(kind, at);
      else
        setActiveIdx(
          clamp(active + (key === "ArrowDown" ? 1 : -1), 0, options.length - 1),
        );
      return;
    }
    if (key === "Home" || key === "End") {
      if (!open) return;
      event.preventDefault();
      setActiveIdx(key === "Home" ? 0 : options.length - 1);
      return;
    }
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      if (open) pickActive();
      else openPop(kind, at);
      return;
    }
    if (key === "Escape") {
      if (!open) return;
      event.preventDefault();
      closePop();
      return;
    }
    if (key === "Tab") {
      if (open) closePop();
      return;
    }
    if (key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const hit = typeAhead(options, key, open ? active : at, event.timeStamp);
      if (hit < 0) return;
      event.preventDefault();
      if (!open) openPop(kind, hit);
      else setActiveIdx(hit);
    }
  };

  const streetKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const open = pop?.kind === "street";
    const { key } = event;
    if (key === "ArrowDown") {
      if (!open) {
        if (matches.length === 0) return;
        event.preventDefault();
        openPop("street", 0);
      } else {
        event.preventDefault();
        setActiveIdx(clamp(active + 1, 0, matches.length - 1));
      }
      return;
    }
    if (key === "ArrowUp") {
      if (!open) return;
      event.preventDefault();
      setActiveIdx(clamp(active - 1, 0, matches.length - 1));
      return;
    }
    if (key === "Enter") {
      if (!open) return;
      event.preventDefault();
      pickActive();
      return;
    }
    if (key === "Escape") {
      if (!open) return;
      event.preventDefault();
      closePop();
      return;
    }
    if (key === "Tab" && open) closePop();
  };

  /* -------------------------------- focus ------------------------------ */

  const register =
    (key: string, kind?: PopKind) => (node: HTMLElement | null) => {
      if (node) {
        fieldNodes.current.set(key, node);
        if (kind) anchors.current.set(kind, node);
      } else {
        fieldNodes.current.delete(key);
        if (kind) anchors.current.delete(kind);
      }
    };

  const onFieldFocus = (key: string) => {
    if (blurTimer.current !== null) window.clearTimeout(blurTimer.current);
    blurTimer.current = null;
    focusKey.current = key;
  };

  // A line that is moved in the DOM loses focus for an instant; the key is
  // only forgotten once a blur has outlived the commit that caused it.
  const onFieldBlur = () => {
    if (blurTimer.current !== null) window.clearTimeout(blurTimer.current);
    blurTimer.current = window.setTimeout(() => {
      blurTimer.current = null;
      focusKey.current = null;
    }, 0);
  };

  const orderKey = fields.map((f) => f.key).join(",");
  React.useLayoutEffect(() => {
    const want = focusKey.current;
    if (!want) return;
    const keys = orderKey === "" ? [] : orderKey.split(",");
    const activeEl = document.activeElement as HTMLElement | null;
    const node = fieldNodes.current.get(want);
    if (node && keys.includes(want)) {
      if (activeEl !== node) node.focus({ preventScroll: true });
      return;
    }
    // The line it was on is gone: the first line that remains takes it.
    const activeKey = activeEl?.dataset.key ?? "";
    if (keys.includes(activeKey)) return;
    const next = keys
      .map((k) => fieldNodes.current.get(k))
      .find((n): n is HTMLElement => !!n);
    next?.focus({ preventScroll: true });
  }, [orderKey]);

  /* ------------------------------- render ------------------------------ */

  const renderField = (field: AddressField, i: number) => {
    const key = field.key;
    const issue = shownIssue(key);
    const inputId = `${uid}-${key}`;
    const labelId = `${inputId}-label`;
    const msgId = `${inputId}-msg`;
    const landAt =
      landing && landing.keys.includes(key)
        ? r3(landing.keys.indexOf(key) * landing.step)
        : null;
    const span = SPAN[layout === "grid" ? (field.span ?? 6) : 6];
    const isStreet = key === "street";
    const streetOpen = isStreet && pop?.kind === "street";
    return (
      <motion.div
        key={key}
        layout={motionSafe}
        initial={
          motionSafe ? { opacity: 0, y: distances.step } : { opacity: 0 }
        }
        animate={{ opacity: 1, y: 0 }}
        exit={{
          opacity: 0,
          pointerEvents: "none",
          transition: exitFor(durations.fast),
        }}
        transition={{
          layout: springs.glide,
          y: motionSafe
            ? { ...springs.glide, delay: r3(i * step) }
            : { duration: 0 },
          opacity: { duration: durations.base, ease: easings.enter },
        }}
        className={cn("relative flex min-w-0 flex-col gap-1.5", span)}
      >
        <label
          id={labelId}
          htmlFor={inputId}
          className={cn(
            "relative flex items-baseline gap-1.5 font-medium text-ink-2",
            dens.label,
          )}
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={field.label}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
              className="truncate"
            >
              {field.label}
            </motion.span>
          </AnimatePresence>
          {field.required === false ? (
            <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              optional
            </span>
          ) : null}
        </label>
        <div className="relative">
          {field.options ? (
            <Picker
              id={inputId}
              listId={listId}
              fieldKey={key}
              value={current[key]}
              options={field.options}
              placeholder={
                field.placeholder ?? `Choose a ${field.label.toLowerCase()}`
              }
              open={pop?.kind === "region"}
              activeId={pop?.kind === "region" ? activeId : undefined}
              labelledBy={labelId}
              describedBy={issue ? msgId : undefined}
              invalid={!!issue}
              disabled={inert}
              landing={landAt}
              motionSafe={motionSafe}
              sizeClass={cn(dens.control, dens.text)}
              padClass={dens.px}
              anchorRef={register(key, "region")}
              onToggle={() => {
                if (pop?.kind === "region") closePop();
                else
                  openPop(
                    "region",
                    Math.max(
                      0,
                      (field.options ?? []).findIndex(
                        (o) => o.code === current.region,
                      ),
                    ),
                  );
              }}
              onKeyDown={(event) => pickerKey("region", event, current.region)}
              onFocus={() => onFieldFocus(key)}
              onBlur={onFieldBlur}
            />
          ) : (
            <>
              <input
                ref={register(key, isStreet ? "street" : undefined)}
                id={inputId}
                data-key={key}
                type="text"
                value={current[key]}
                placeholder={field.placeholder}
                autoComplete={isStreet ? "off" : (field.autoComplete ?? "off")}
                autoCorrect="off"
                spellCheck={false}
                disabled={inert}
                role={isStreet ? "combobox" : undefined}
                aria-autocomplete={isStreet ? "list" : undefined}
                aria-expanded={isStreet ? streetOpen : undefined}
                aria-controls={streetOpen ? listId : undefined}
                aria-activedescendant={streetOpen ? activeId : undefined}
                aria-invalid={!!issue || undefined}
                aria-describedby={issue ? msgId : undefined}
                onChange={(event) => {
                  const text = event.target.value;
                  setField(key, text);
                  if (isStreet) {
                    if (text.trim() === "") closePop();
                    else if (pop?.kind !== "street") openPop("street", 0);
                    else setActiveIdx(0);
                  }
                }}
                onKeyDown={isStreet ? streetKey : undefined}
                onFocus={() => onFieldFocus(key)}
                onBlur={() => {
                  onFieldBlur();
                  if (key === "postcode") blurPostcode();
                  else touch(key);
                  if (isStreet) closePop();
                }}
                className={cn(
                  CONTROL,
                  dens.control,
                  dens.px,
                  dens.text,
                  issue && "border-danger hover:border-danger",
                  inert && "cursor-not-allowed",
                  landAt !== null && "text-transparent",
                  FOCUS_RING,
                )}
              />
              {landAt !== null ? (
                <Landing
                  text={current[key]}
                  delay={landAt}
                  padClass={dens.px}
                />
              ) : null}
            </>
          )}
        </div>
        <AnimatePresence initial={false}>
          {issue ? (
            <motion.p
              key="issue"
              id={msgId}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{
                height: 0,
                opacity: 0,
                transition: exitFor(durations.fast),
              }}
              transition={{
                height: motionSafe ? springs.glide : { duration: 0 },
                opacity: { duration: durations.fast, ease: easings.enter },
              }}
              className="overflow-hidden text-[11px] leading-4 text-danger"
            >
              {issue}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </motion.div>
    );
  };

  const countryPicker = (
    <div className="flex flex-col gap-1.5">
      <p
        id={countryLabelId}
        className={cn("font-medium text-ink-2", dens.label)}
      >
        Country
      </p>
      <Picker
        id={countryId}
        listId={listId}
        fieldKey="country"
        value={current.country ?? ""}
        options={countries.map((c) => ({ code: c.code, name: c.name }))}
        placeholder="Choose a country"
        open={pop?.kind === "country"}
        activeId={pop?.kind === "country" ? activeId : undefined}
        labelledBy={countryLabelId}
        describedBy={undefined}
        invalid={submitted && !country}
        disabled={inert}
        landing={null}
        motionSafe={motionSafe}
        sizeClass={cn(dens.control, dens.text)}
        padClass={dens.px}
        anchorRef={(node) => {
          if (node) anchors.current.set("country", node);
          else anchors.current.delete("country");
        }}
        onToggle={() => {
          if (pop?.kind === "country") closePop();
          else
            openPop(
              "country",
              Math.max(
                0,
                countries.findIndex((c) => c.code === current.country),
              ),
            );
        }}
        onKeyDown={(event) =>
          pickerKey("country", event, current.country ?? "")
        }
        onFocus={() => undefined}
        onBlur={() => undefined}
      />
    </div>
  );

  const skeleton = (
    <div aria-hidden className={cn("flex flex-col", dens.gap, dens.pad)}>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <span
            className="h-3 rounded-1 bg-surface-2 motion-safe:animate-pulse"
            style={{
              width: 56 + ((i * 29) % 48),
              animationDelay: `${i * 90}ms`,
            }}
          />
          <span
            className={cn(
              "rounded-2 bg-surface-2 motion-safe:animate-pulse",
              dens.control,
            )}
            style={{ animationDelay: `${i * 90}ms` }}
          />
        </div>
      ))}
    </div>
  );

  const prompt =
    countries.length === 0 ? (
      <div className="flex flex-col items-center gap-2 rounded-3 border border-dashed border-hairline-strong px-6 py-8 text-center">
        <Globe aria-hidden className="size-5 text-ink-3" />
        <p className="text-sm text-foreground">No countries to ship to yet.</p>
        <p className="text-xs text-ink-3">
          Shipping regions are set by a workspace admin.
        </p>
      </div>
    ) : (
      <div className="flex flex-col items-center gap-2 rounded-3 border border-dashed border-hairline-strong px-6 py-8 text-center">
        <MapPin aria-hidden className="size-5 text-ink-3" />
        <p className="text-sm text-foreground">
          Pick a country to lay out the address.
        </p>
        <p className="text-xs text-ink-3">
          The lines, their order and the postcode shape follow it.
        </p>
        <button
          type="button"
          onClick={() => {
            anchors.current.get("country")?.focus();
            openPop("country", 0);
          }}
          className={cn(
            "mt-1 inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
            FOCUS_RING,
          )}
        >
          Choose a country
        </button>
      </div>
    );

  const showPreview = preview && ready;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
        <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
          {title}
        </p>
        {ready && country ? (
          <p className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {filled} of {fields.length} lines
          </p>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col @min-[40rem]:flex-row">
        {status === "error" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The country list didn&apos;t load.
            </p>
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
        ) : status === "loading" ? (
          <div className="min-h-0 flex-1 overflow-hidden">{skeleton}</div>
        ) : (
          <form
            id={formId}
            noValidate
            onSubmit={handleSubmit}
            onScroll={closePop}
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain",
              dens.gap,
              dens.pad,
            )}
          >
            {countries.length > 0 ? countryPicker : null}
            {!country ? (
              prompt
            ) : (
              <div
                className={cn(
                  "relative grid grid-cols-1 @min-[26rem]:grid-cols-6",
                  dens.gap,
                )}
              >
                <AnimatePresence initial={false} mode="popLayout">
                  {fields.map((field, i) => renderField(field, i))}
                </AnimatePresence>
              </div>
            )}
          </form>
        )}

        {showPreview ? (
          <aside
            aria-label="Printed preview"
            className={cn(
              "shrink-0 border-t border-hairline @min-[40rem]:w-60 @min-[40rem]:border-t-0 @min-[40rem]:border-l",
              "max-h-36 overflow-y-auto overscroll-contain px-4 py-3 @min-[40rem]:max-h-none @min-[40rem]:p-4",
            )}
          >
            <div className="hidden @min-[40rem]:block">
              <Preview
                country={country}
                value={current}
                motionSafe={motionSafe}
                compact={false}
              />
            </div>
            <div className="@min-[40rem]:hidden">
              <Preview
                country={country}
                value={current}
                motionSafe={motionSafe}
                compact
              />
            </div>
          </aside>
        ) : null}
      </div>

      {ready ? (
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-hairline px-4 py-2.5">
          <p className="min-w-0 truncate text-[11px] text-ink-3">
            {!country
              ? "Choose a country first."
              : submitted && issueKeys.length > 0
                ? `${issueKeys.length} ${issueKeys.length === 1 ? "line needs" : "lines need"} attention.`
                : `${fields.find((f) => f.key === "postcode")?.label ?? "Postcode"} is checked for ${country.name}.`}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <AnimatePresence>
              {saved > 0 && live ? (
                <motion.span
                  key={saved}
                  role="img"
                  aria-label="Saved"
                  initial={
                    motionSafe
                      ? { opacity: 0, scale: 0.6, y: distances.nudge }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.recoil,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                  className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--success)_14%,transparent)] py-1 pr-2.5 pl-2 text-[11px] font-medium text-success"
                >
                  <CircleCheck aria-hidden className="size-3.5" />
                  Saved
                </motion.span>
              ) : null}
            </AnimatePresence>
            <button
              type="submit"
              form={formId}
              aria-disabled={inert || !country || undefined}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-xs font-medium transition-colors",
                inert || !country
                  ? "cursor-not-allowed bg-surface-2 text-ink-3"
                  : "bg-primary text-primary-foreground hover:opacity-90",
                FOCUS_RING,
              )}
            >
              <Check aria-hidden className="size-3.5" />
              {submitLabel}
            </button>
          </div>
        </footer>
      ) : null}

      <AnimatePresence>
        {pop && popOptions.length > 0 ? (
          <motion.div
            key={pop.kind}
            ref={popRef}
            id={listId}
            role="listbox"
            aria-label={
              pop.kind === "country"
                ? "Countries"
                : pop.kind === "region"
                  ? (regionField?.label ?? "Region")
                  : "Suggested addresses"
            }
            initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { ...springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
            style={{
              left: pop.left,
              width: pop.width,
              top: pop.top,
              bottom: pop.bottom,
              maxHeight: pop.maxHeight,
            }}
            className="absolute z-20 flex flex-col overflow-y-auto overscroll-contain rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_14px_34px_-14px_color-mix(in_oklab,black_45%,transparent)]"
          >
            {popOptions.map((option, i) => {
              const selectedId =
                pop.kind === "country"
                  ? current.country
                  : pop.kind === "region"
                    ? current.region
                    : null;
              const isActive = i === active;
              const isSelected =
                pop.kind === "street" ? isActive : option.id === selectedId;
              return (
                <div
                  key={option.id}
                  id={`${uid}-opt-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  // Keeps focus (and the caret) where it was on a pick.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(pop.kind, option.id)}
                  onPointerMove={() => {
                    if (!isActive) setActiveIdx(i);
                  }}
                  className={cn(
                    "relative flex cursor-pointer items-center gap-2 rounded-2 px-2.5",
                    dens.option,
                    dens.text,
                    isActive ? "text-foreground" : "text-ink-2",
                  )}
                >
                  {isActive ? (
                    <motion.span
                      aria-hidden
                      layoutId={motionSafe ? `${uid}-hl` : undefined}
                      transition={springs.snap}
                      className="absolute inset-0 rounded-2 bg-surface-2"
                    />
                  ) : null}
                  <span className="relative flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate">{option.label}</span>
                    {option.sub ? (
                      <span className="truncate text-[11px] text-ink-3">
                        {option.sub}
                      </span>
                    ) : null}
                  </span>
                  {pop.kind !== "street" && option.id === selectedId ? (
                    <Check
                      aria-hidden
                      className="relative size-3.5 shrink-0 text-cobalt-bright"
                    />
                  ) : null}
                </div>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
