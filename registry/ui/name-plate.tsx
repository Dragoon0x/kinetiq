"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ImageUp, RotateCcw, TriangleAlert } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  usePointerFine,
  usePointerTilt,
} from "@/registry/hooks/use-pointer-tilt";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type NamePlateFinish = "brass" | "slate" | "paper";
export type NamePlateDensity = "compact" | "cozy" | "roomy";
export type NamePlateStatus = "ready" | "loading" | "error";
export type NamePlateAvatarKind = "initials" | "upload";

/** One swatch behind the initials. `value` is a CSS colour; a pigment at a fixed lightness reads the same in both themes. */
export type NamePlateColour = { id: string; label: string; value: string };

export type NamePlatePronoun = { id: string; label: string };

export type NamePlateValue = {
  name: string;
  /** Without its @. */
  handle: string;
  /** Ids of the chosen pronoun chips, in the order they were pressed. */
  pronouns: string[];
  bio: string;
  /** Initials on a colour, or a photo to be added later. */
  avatar: NamePlateAvatarKind;
  /** The id of the colour behind the initials. */
  colour: string;
};

export type NamePlateField = keyof NamePlateValue;
export type NamePlateChange = { field: NamePlateField };

/** What a handle check comes back with. Suggestions are only read when the handle is taken. */
export type NamePlateHandleResult =
  { available: true } | { available: false; suggestions?: string[] };

/** Looks a handle up. The signal aborts when the handle changes again or the surface unmounts. */
export type NamePlateCheck = (
  handle: string,
  context: { name: string; signal: AbortSignal },
) => Promise<NamePlateHandleResult>;

export type NamePlateHandleState =
  "idle" | "invalid" | "checking" | "free" | "taken" | "failed";

export type NamePlateProps = {
  /** The plate's finish: brass, slate or paper, all drawn from tokens. @default "brass" */
  finish?: NamePlateFinish;
  /** Whether the plate leans toward a fine pointer hovering it. @default true */
  tilt?: boolean;
  /** Control heights, type size and spacing of the form. @default "cozy" */
  density?: NamePlateDensity;
  /** The swatches offered behind the initials, in order. @default defaultNamePlateColours */
  colours?: NamePlateColour[];
  /** The optional pronoun chips. @default defaultNamePlatePronouns */
  pronounOptions?: NamePlatePronoun[];
  /** Characters the bio may use before it runs over. @default 120 */
  bioBudget?: number;
  /** Controlled profile. */
  value?: NamePlateValue;
  /** Initial profile when uncontrolled. @default defaultNamePlateValue */
  defaultValue?: NamePlateValue;
  /** Fires from every keystroke, chip and swatch, with the whole profile and the field that changed. */
  onChange?: (value: NamePlateValue, change: NamePlateChange) => void;
  /** Looks up whether a handle is free. @default defaultCheckHandle, a simulator with a list of taken names */
  checkHandle?: NamePlateCheck;
  /** How long typing must pause before a handle is looked up, in ms. @default 350 */
  checkDelay?: number;
  /** A handle check settled: free, taken (with suggestions) or failed. */
  onHandleCheck?: (
    handle: string,
    state: Extract<NamePlateHandleState, "free" | "taken" | "failed">,
    suggestions: string[],
  ) => void;
  /** Continue was pressed with a name, a free handle and a bio within budget. */
  onSubmit?: (value: NamePlateValue) => void;
  /** Whether the step has arrived: a skeleton while loading, and when the availability service failed, the form stays editable with a retry in the handle row. @default "ready" */
  status?: NamePlateStatus;
  /** "Try again" was pressed after the availability service failed. */
  onRetry?: () => void;
  /** The heading. @default "Set up your profile" */
  title?: string;
  /** The small line over the title, and the plate's maker's mark. @default "Coldbrook" */
  eyebrow?: string;
  /** The submit button's text. @default "Continue" */
  submitLabel?: string;
  /** Height of the surface in px; the form scrolls inside it. @default 540 */
  height?: number;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Read only: nothing can be typed, pressed or chosen. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** Pigments: a hue from a token at a fixed lightness, so white initials read on every one in both themes. */
export const defaultNamePlateColours: NamePlateColour[] = [
  {
    id: "cobalt",
    label: "Cobalt",
    value: "oklch(from var(--accent-bright) 0.56 0.17 h)",
  },
  {
    id: "signal",
    label: "Signal",
    value: "oklch(from var(--signal) 0.6 0.16 h)",
  },
  {
    id: "moss",
    label: "Moss",
    value: "oklch(from var(--success) 0.55 0.12 h)",
  },
  { id: "amber", label: "Amber", value: "oklch(from var(--warn) 0.62 0.14 h)" },
  { id: "clay", label: "Clay", value: "oklch(from var(--danger) 0.56 0.16 h)" },
  { id: "ink", label: "Ink", value: "oklch(from var(--ink) 0.4 0.02 h)" },
];

export const defaultNamePlatePronouns: NamePlatePronoun[] = [
  { id: "she", label: "she/her" },
  { id: "he", label: "he/him" },
  { id: "they", label: "they/them" },
  { id: "ask", label: "ask me" },
];

/** Handles the default simulator reports as taken. */
export const defaultNamePlateTaken: string[] = [
  "mara",
  "mara.l",
  "tomas",
  "ines",
  "kenji",
  "priya",
  "sam",
  "alex",
  "admin",
  "coldbrook",
  "support",
  "help",
  "team",
];

/** Mara Lind, joining Coldbrook's field-ops team; her first choice of handle is already taken. */
export const defaultNamePlateValue: NamePlateValue = {
  name: "Mara Lind",
  handle: "mara",
  pronouns: ["she"],
  bio: "Field ops at Coldbrook. Maps, meters and the odd pump house.",
  avatar: "initials",
  colour: "cobalt",
};

const HANDLE_RE = /^[a-z0-9][a-z0-9._]*$/;
const HANDLE_MIN = 3;
const HANDLE_MAX = 20;
const CHECK_MS = 560;

/** Why a handle cannot be looked up, or null when it is well formed. */
export function validateHandle(handle: string): string | null {
  if (handle.length === 0) return null;
  if (handle.length < HANDLE_MIN) return `At least ${HANDLE_MIN} characters.`;
  if (handle.length > HANDLE_MAX) return `At most ${HANDLE_MAX} characters.`;
  if (!HANDLE_RE.test(handle)) {
    return "Letters, numbers, dots and underscores; start with a letter or number.";
  }
  return null;
}

/** Up to three free handles built from the name and the one that was taken. */
export function suggestHandles(
  handle: string,
  name: string,
  taken: string[],
): string[] {
  const parts = name
    .toLowerCase()
    .split(/\s+/)
    .map((p) => p.replace(/[^a-z0-9]/g, ""))
    .filter((p) => p.length > 0);
  const first = parts[0] ?? handle;
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  const digits = String(
    10 + ([...handle].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 89),
  );
  const seeds = [
    last ? `${first}.${last}` : null,
    last ? `${first}${last}` : null,
    last ? `${first}_${last.slice(0, 1)}` : null,
    `${handle}.cb`,
    `${handle}${digits}`,
  ];
  const out: string[] = [];
  for (const seed of seeds) {
    if (!seed || seed === handle || out.includes(seed)) continue;
    if (validateHandle(seed) !== null || taken.includes(seed)) continue;
    out.push(seed);
    if (out.length === 3) break;
  }
  return out;
}

/**
 * The default lookup: waits a beat, then reports a handle from
 * `defaultNamePlateTaken` as taken with suggestions, and any other as free.
 * Aborting clears the timer and rejects.
 */
export const defaultCheckHandle: NamePlateCheck = (handle, { name, signal }) =>
  new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onAbort = () => {
      if (timer !== null) clearTimeout(timer);
      reject(new Error("The handle check was cancelled."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(
        defaultNamePlateTaken.includes(handle)
          ? {
              available: false,
              suggestions: suggestHandles(handle, name, defaultNamePlateTaken),
            }
          : { available: true },
      );
    }, CHECK_MS);
  });

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const BUTTON =
  "inline-flex items-center justify-center gap-1.5 rounded-2 border border-hairline text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground";

const PLATE_TILT = 6;
const PLATE_PERSPECTIVE = 900;

const r3 = (v: number) => Number(v.toFixed(3));

/** Lower case, no spaces, no leading @: what a handle field keeps of a paste. */
export const normaliseHandle = (raw: string): string =>
  raw.replace(/^@+/, "").replace(/\s+/g, "").toLowerCase();

/** The first letters of the first and last words, up to two. */
export const initialsOf = (name: string): string => {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
};

type Finish = {
  /** The plate's face. */
  plate: string;
  /** Its rim. */
  edge: string;
  /** Engraved text. */
  ink: string;
  /** The light catching the engraving's lower edge. */
  hi: string;
  /** Placeholder text and the maker's mark. */
  dim: string;
  /** The corner rivets. */
  rivet: string;
  /** The shadow the plate casts. */
  shadow: string;
};

/**
 * Finishes are pigments, not textures: hues from tokens at fixed lightness,
 * so a brass plate is brass in both themes while the card around it changes.
 */
const FINISHES: Record<NamePlateFinish, Finish> = {
  brass: {
    plate:
      "linear-gradient(135deg, oklch(from var(--warn) 0.78 0.11 h) 0%, oklch(from var(--warn) 0.66 0.12 h) 58%, oklch(from var(--warn) 0.72 0.11 h) 100%)",
    edge: "oklch(from var(--warn) 0.5 0.1 h)",
    ink: "oklch(from var(--warn) 0.3 0.06 h)",
    hi: "oklch(from var(--warn) 0.9 0.07 h / 0.7)",
    dim: "oklch(from var(--warn) 0.42 0.07 h / 0.75)",
    rivet: "oklch(from var(--warn) 0.5 0.09 h)",
    shadow: "oklch(from var(--warn) 0.3 0.06 h / 0.45)",
  },
  slate: {
    plate:
      "linear-gradient(135deg, oklch(from var(--accent) 0.34 0.03 h) 0%, oklch(from var(--accent) 0.26 0.03 h) 100%)",
    edge: "oklch(from var(--accent) 0.44 0.04 h)",
    ink: "oklch(from var(--accent) 0.93 0.02 h)",
    hi: "oklch(0 0 0 / 0.55)",
    dim: "oklch(from var(--accent) 0.72 0.03 h)",
    rivet: "oklch(from var(--accent) 0.5 0.04 h)",
    shadow: "oklch(0 0 0 / 0.5)",
  },
  paper: {
    plate: "var(--bg-0)",
    edge: "var(--hairline-strong)",
    ink: "var(--ink)",
    hi: "color-mix(in oklab, var(--bg-2) 70%, transparent)",
    dim: "var(--ink-3)",
    rivet: "var(--hairline-strong)",
    shadow: "color-mix(in oklab, var(--ink) 22%, transparent)",
  },
};

const DENSITY: Record<
  NamePlateDensity,
  {
    control: string;
    text: string;
    label: string;
    gap: string;
    pad: string;
    chip: string;
    swatch: string;
    area: string;
  }
> = {
  compact: {
    control: "h-8",
    text: "text-[13px]",
    label: "text-[11px]",
    gap: "gap-3",
    pad: "px-3 py-3",
    chip: "h-6 px-2 text-[11px]",
    swatch: "size-7",
    area: "min-h-[4.5rem] py-1.5",
  },
  cozy: {
    control: "h-9",
    text: "text-sm",
    label: "text-xs",
    gap: "gap-4",
    pad: "px-4 py-4",
    chip: "h-7 px-2.5 text-xs",
    swatch: "size-8",
    area: "min-h-[5rem] py-2",
  },
  roomy: {
    control: "h-10",
    text: "text-[15px]",
    label: "text-[13px]",
    gap: "gap-5",
    pad: "px-5 py-5",
    chip: "h-8 px-3 text-[13px]",
    swatch: "size-9",
    area: "min-h-[5.5rem] py-2.5",
  },
};

const HANDLE_WORD: Record<NamePlateHandleState, string> = {
  idle: "Pick a handle.",
  invalid: "",
  checking: "Checking…",
  free: "is free.",
  taken: "is taken.",
  failed: "Couldn’t check availability.",
};

/* ----------------------------------------------------------------------- */
/*                                 Engraving                                */
/* ----------------------------------------------------------------------- */

/**
 * Text set one glyph at a time. A glyph that is typed lands on `snap`: it
 * drops the last few pixels into the plate and settles; one that is erased
 * fades on an exit tween. Glyphs present on the first render never animate.
 */
function Engrave({
  text,
  placeholder,
  motionSafe,
  className,
}: {
  text: string;
  placeholder: string;
  motionSafe: boolean;
  className?: string;
}) {
  const glyphs = [...text];
  const empty = glyphs.length === 0;
  return (
    <span
      aria-hidden
      className={cn("inline-flex max-w-full overflow-hidden", className)}
      style={{
        color: empty ? "var(--np-dim)" : "var(--np-ink)",
        textShadow: "0 1px 0 var(--np-hi)",
      }}
    >
      <AnimatePresence initial={false}>
        {empty ? (
          <motion.span
            key="placeholder"
            className="truncate"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.base, ease: easings.enter }}
          >
            {placeholder}
          </motion.span>
        ) : (
          glyphs.map((ch, i) => (
            <motion.span
              key={i}
              className="inline-block whitespace-pre"
              initial={
                motionSafe
                  ? { opacity: 0, y: -distances.nudge, scale: 1.18 }
                  : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? {
                      ...springs.snap,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: 0 }
              }
            >
              {ch === " " ? " " : ch}
            </motion.span>
          ))
        )}
      </AnimatePresence>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Avatar                                  */
/* ----------------------------------------------------------------------- */

/**
 * Initials on a colour. A newly chosen colour fills the circle from its
 * centre on `glide` over the old one, which fades once it is covered; the
 * upload placeholder is a dashed ring with no fill.
 */
function Avatar({
  initials,
  colour,
  fillKey,
  upload,
  motionSafe,
  className,
  textClassName,
}: {
  initials: string;
  colour: string;
  fillKey: string;
  upload: boolean;
  motionSafe: boolean;
  className?: string;
  textClassName?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2",
        upload && "border border-dashed border-hairline-strong bg-transparent",
        className,
      )}
    >
      <AnimatePresence initial={false}>
        {upload ? null : (
          <motion.span
            key={fillKey}
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{ background: colour }}
            initial={
              motionSafe
                ? { clipPath: "circle(0% at 50% 50%)", opacity: 1 }
                : { opacity: 0 }
            }
            animate={
              motionSafe
                ? { clipPath: "circle(72% at 50% 50%)", opacity: 1 }
                : { opacity: 1 }
            }
            exit={{
              opacity: 0,
              transition: { ...exitFor(durations.base), delay: durations.base },
            }}
            transition={
              motionSafe ? springs.glide : { duration: durations.fast }
            }
          />
        )}
      </AnimatePresence>
      <span
        className={cn(
          "relative font-semibold tracking-tight select-none",
          upload ? "text-ink-3" : "text-white",
          textClassName,
        )}
        style={
          upload
            ? undefined
            : {
                textShadow:
                  "0 1px 1px color-mix(in oklab, black 30%, transparent)",
              }
        }
      >
        {upload ? (
          <ImageUp aria-hidden className="size-[55%] min-h-3 min-w-3" />
        ) : initials.length > 0 ? (
          initials
        ) : (
          <span
            aria-hidden
            className="block size-1.5 rounded-full bg-white opacity-70"
          />
        )}
      </span>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Handle mark                               */
/* ----------------------------------------------------------------------- */

/**
 * The ring beside the handle. It spins while a lookup is out, then turns
 * solid and a tick draws inside it on `flick` when the handle is free, or a
 * cross when it is taken. A dot marks a handle that cannot be checked.
 */
function HandleMark({
  state,
  motionSafe,
}: {
  state: NamePlateHandleState;
  motionSafe: boolean;
}) {
  const ring =
    state === "checking"
      ? "border-hairline-strong border-t-cobalt-bright"
      : state === "free"
        ? "border-success"
        : state === "taken"
          ? "border-danger"
          : state === "invalid" || state === "failed"
            ? "border-warn"
            : "border-hairline-strong";
  const draw = (delay = 0) =>
    motionSafe ? { ...springs.flick, delay } : { duration: 0 };
  return (
    <span
      aria-hidden
      className="relative flex size-4 shrink-0 items-center justify-center"
    >
      <span
        className={cn(
          "absolute inset-0 rounded-full border-[1.5px] transition-colors duration-200",
          ring,
          state === "checking" && motionSafe && "animate-spin",
        )}
      />
      <AnimatePresence initial={false}>
        {state === "free" ? (
          <motion.svg
            key="free"
            viewBox="0 0 16 16"
            className="size-3 text-success"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          >
            <motion.path
              d="M4.2 8.4 6.9 11 11.8 5.4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={motionSafe ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={draw()}
            />
          </motion.svg>
        ) : null}
        {state === "taken" ? (
          <motion.svg
            key="taken"
            viewBox="0 0 16 16"
            className="size-3 text-danger"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          >
            <motion.path
              d="M5 5 11 11"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              initial={motionSafe ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={draw()}
            />
            <motion.path
              d="M11 5 5 11"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              initial={motionSafe ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={draw(durations.blink)}
            />
          </motion.svg>
        ) : null}
        {state === "invalid" || state === "failed" ? (
          <motion.span
            key="warn"
            className="block size-1.5 rounded-full bg-warn"
            initial={motionSafe ? { scale: 0, opacity: 0 } : { opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={draw()}
          />
        ) : null}
      </AnimatePresence>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Plate                                  */
/* ----------------------------------------------------------------------- */

type PlateProps = {
  name: string;
  handle: string;
  pronouns: string;
  initials: string;
  colour: string;
  fillKey: string;
  upload: boolean;
  finish: NamePlateFinish;
  eyebrow: string;
  tiltOn: boolean;
  motionSafe: boolean;
  stamped: boolean;
  describedBy: string;
};

/**
 * The plate itself: a bevelled card with four rivets, the avatar, the name
 * engraved on the first line and the handle in mono on the second. It leans
 * up to six degrees toward a fine pointer on the sprung tilt and settles when
 * the pointer leaves; the Engraved stamp lands on `recoil` after Continue.
 */
function Plate({
  name,
  handle,
  pronouns,
  initials,
  colour,
  fillKey,
  upload,
  finish,
  eyebrow,
  tiltOn,
  motionSafe,
  stamped,
  describedBy,
}: PlateProps) {
  const tilt = usePointerTilt({ maxTilt: PLATE_TILT, disabled: !tiltOn });
  const f = FINISHES[finish];
  const shownName = name.trim();
  return (
    <div
      role="img"
      aria-label={`Name plate preview: ${shownName || "no name yet"}, @${handle || "no handle yet"}${pronouns ? `, ${pronouns}` : ""}.`}
      aria-describedby={describedBy}
      className="relative w-full [perspective:900px]"
    >
      <motion.div
        {...tilt.handlers}
        className="@container relative aspect-[1.72] w-full overflow-hidden rounded-3 border"
        style={{
          rotateX: tilt.rotateX,
          rotateY: tilt.rotateY,
          transformPerspective: PLATE_PERSPECTIVE,
          background: f.plate,
          borderColor: f.edge,
          boxShadow: `inset 0 1px 0 ${f.hi}, inset 0 -1px 0 color-mix(in oklab, black 22%, transparent), 0 18px 36px -20px ${f.shadow}`,
          ["--np-ink" as string]: f.ink,
          ["--np-hi" as string]: f.hi,
          ["--np-dim" as string]: f.dim,
        }}
      >
        {[
          "top-2 left-2",
          "top-2 right-2",
          "bottom-2 left-2",
          "bottom-2 right-2",
        ].map((pos) => (
          <span
            key={pos}
            aria-hidden
            className={cn("absolute size-1.5 rounded-full", pos)}
            style={{
              background: f.rivet,
              boxShadow: `inset 0 1px 1px color-mix(in oklab, black 35%, transparent), 0 1px 0 ${f.hi}`,
            }}
          />
        ))}

        <div className="absolute inset-x-[7%] top-[9%] flex items-center justify-between">
          <span
            className="font-mono text-[clamp(8px,2.6cqw,10px)] tracking-[0.14em] uppercase"
            style={{ color: "var(--np-dim)" }}
          >
            {eyebrow}
          </span>
          <AnimatePresence>
            {stamped ? (
              <motion.span
                key="stamp"
                className="rounded-1 border px-1.5 py-0.5 font-mono text-[clamp(8px,2.6cqw,10px)] tracking-[0.14em] uppercase"
                style={{
                  color: "var(--np-ink)",
                  borderColor: "var(--np-ink)",
                  rotate: -3,
                }}
                initial={
                  motionSafe ? { opacity: 0, scale: 0.5 } : { opacity: 0 }
                }
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe ? springs.recoil : { duration: durations.fast }
                }
              >
                Engraved
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="absolute inset-x-[7%] top-[30%] flex items-center gap-[4cqw]">
          <Avatar
            initials={initials}
            colour={colour}
            fillKey={fillKey}
            upload={upload}
            motionSafe={motionSafe}
            className="size-[clamp(36px,17cqw,64px)]"
            textClassName="text-[clamp(13px,6.4cqw,24px)]"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-[1.2cqw]">
            <Engrave
              text={shownName}
              placeholder="Your name"
              motionSafe={motionSafe}
              className="text-[clamp(16px,7.4cqw,28px)] leading-none font-semibold tracking-tight"
            />
            <span
              className="inline-flex max-w-full items-baseline font-mono text-[clamp(10px,3.6cqw,13px)] leading-none"
              style={{ color: handle ? "var(--np-ink)" : "var(--np-dim)" }}
            >
              <span aria-hidden style={{ textShadow: "0 1px 0 var(--np-hi)" }}>
                @
              </span>
              <Engrave
                text={handle}
                placeholder="handle"
                motionSafe={motionSafe}
              />
            </span>
          </div>
        </div>

        <div
          className="absolute inset-x-[7%] bottom-[9%] flex items-center justify-between border-t pt-[2.4cqw] font-mono text-[clamp(8px,2.6cqw,10px)] tracking-[0.14em] uppercase"
          style={{
            color: "var(--np-dim)",
            borderColor: "color-mix(in oklab, var(--np-ink) 28%, transparent)",
          }}
        >
          <span className="truncate">{pronouns || "Member"}</span>
          <span className="shrink-0">Est. 2026</span>
        </div>
      </motion.div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Previews                                 */
/* ----------------------------------------------------------------------- */

function Previews({
  name,
  handle,
  initials,
  colour,
  fillKey,
  upload,
  pronouns,
  motionSafe,
  dens,
}: {
  name: string;
  handle: string;
  initials: string;
  colour: string;
  fillKey: string;
  upload: boolean;
  pronouns: string;
  motionSafe: boolean;
  dens: (typeof DENSITY)[NamePlateDensity];
}) {
  const shownName = name.trim() || "Your name";
  const shownHandle = handle || "handle";
  const avatar = (size: string, text: string) => (
    <Avatar
      initials={initials}
      colour={colour}
      fillKey={fillKey}
      upload={upload}
      motionSafe={motionSafe}
      className={size}
      textClassName={text}
    />
  );
  const row = "flex min-w-0 items-start gap-2.5";
  const eyebrow =
    "w-14 shrink-0 pt-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase";
  return (
    <div
      role="group"
      aria-label="How the plate appears"
      className={cn("flex flex-col divide-y divide-hairline", dens.label)}
    >
      <div className={cn(row, "pb-2.5")}>
        <span className={eyebrow}>Comment</span>
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {avatar("size-5", "text-[9px]")}
          <p className="min-w-0 flex-1 leading-snug">
            <span className="font-medium text-foreground">{shownName}</span>{" "}
            <span className="text-ink-3">@{shownHandle} &middot; 2m</span>
            <br />
            <span className="text-ink-2">
              On it. The chamber is clear, closing the ticket.
            </span>
          </p>
        </div>
      </div>
      <div className={cn(row, "items-center py-2.5")}>
        <span className={eyebrow}>List</span>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {avatar("size-6", "text-[10px]")}
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium text-foreground">{shownName}</span>
            <span className="ml-1.5 font-mono text-ink-3">@{shownHandle}</span>
          </span>
          <span className="shrink-0 text-ink-3">{pronouns || "Field ops"}</span>
        </div>
      </div>
      <div className={cn(row, "items-center pt-2.5")}>
        <span className={eyebrow}>Mention</span>
        <p className="min-w-0 flex-1 truncate text-ink-2">
          Thanks{" "}
          <span className="inline-flex items-center gap-1 rounded-full bg-cobalt-wash px-1.5 py-px align-baseline font-medium text-cobalt-bright">
            {avatar("size-3.5", "text-[7px]")}@{shownHandle}
          </span>{" "}
          for the valve survey.
        </p>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Skeleton                                 */
/* ----------------------------------------------------------------------- */

function Skeleton({ dens }: { dens: (typeof DENSITY)[NamePlateDensity] }) {
  const bar = (w: string, h = "h-3") => (
    <span
      className={cn(
        "block rounded-1 bg-surface-2 motion-safe:animate-pulse",
        w,
        h,
      )}
    />
  );
  return (
    <div
      aria-hidden
      className={cn(
        "grid grid-cols-1 @min-[40rem]:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]",
        dens.gap,
        dens.pad,
      )}
    >
      <div
        className={cn("order-2 flex flex-col @min-[40rem]:order-1", dens.gap)}
      >
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            {bar(i % 2 ? "w-16" : "w-24", "h-2.5")}
            {bar("w-full", i === 3 ? "h-16" : dens.control)}
          </div>
        ))}
        <div className="flex gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              className={cn(
                "block rounded-full bg-surface-2 motion-safe:animate-pulse",
                dens.swatch,
              )}
              style={{ animationDelay: `${i * 70}ms` }}
            />
          ))}
        </div>
      </div>
      <div className="order-1 flex flex-col gap-3 @min-[40rem]:order-2">
        <span className="block aspect-[1.72] w-full rounded-3 bg-surface-2 motion-safe:animate-pulse" />
        {bar("w-full", "h-8")}
        {bar("w-full", "h-8")}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type CheckResult =
  | { state: "free" }
  | { state: "taken"; suggestions: string[] }
  | { state: "failed" };

/**
 * A profile-setup step that engraves a name plate. The form on the left
 * (display name, handle, pronoun chips, a bio with a budget, and a swatch row
 * for the initials' colour or a photo placeholder) drives the plate on the
 * right: each letter typed lands in the brass on `springs.snap`, the handle
 * follows in mono on a second line, and a chosen colour floods the initials'
 * circle from its centre on `springs.glide`. Under a fine pointer the plate
 * leans toward it by a few degrees on the sprung tilt and swings level when
 * the pointer leaves.
 *
 * The handle is looked up once typing pauses: the ring beside it spins, then
 * turns solid as a tick draws on `springs.flick` for a free handle or a cross
 * for a taken one, with suggestions cascading in to press. A lookup that
 * fails leaves the field editable and offers Retry; so does `status:
 * "error"`, when the availability service itself is down. Continue stamps
 * Engraved on the plate on `springs.recoil`. Below the plate three previews
 * show the same name in a comment, a list and a mention.
 *
 * The form is native: Tab moves between fields, the pronoun chips are
 * toggles, and the swatches are one radio group where arrows choose. Every
 * outcome is announced. Under reduced motion nothing lands, spins or tilts:
 * glyphs appear, the ring changes colour, the circle cross-fades, and every
 * state is still reached.
 */
export function NamePlate({
  finish = "brass",
  tilt = true,
  density = "cozy",
  colours = defaultNamePlateColours,
  pronounOptions = defaultNamePlatePronouns,
  bioBudget = 120,
  value,
  defaultValue = defaultNamePlateValue,
  onChange,
  checkHandle = defaultCheckHandle,
  checkDelay = 350,
  onHandleCheck,
  onSubmit,
  status = "ready",
  onRetry,
  title = "Set up your profile",
  eyebrow = "Coldbrook",
  submitLabel = "Continue",
  height = 540,
  label,
  disabled = false,
  className,
}: NamePlateProps) {
  const motionSafe = useMotionSafe();
  const pointerFine = usePointerFine();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const nameId = `${uid}-name`;
  const handleId = `${uid}-handle`;
  const handleHintId = `${uid}-handle-hint`;
  const bioId = `${uid}-bio`;
  const bioHintId = `${uid}-bio-hint`;
  const plateHintId = `${uid}-plate-hint`;

  const [own, setOwn] = React.useState<NamePlateValue>(defaultValue);
  const current = value ?? own;
  const ready = status === "ready";
  const inert = disabled || status === "loading";
  const dens = DENSITY[density];

  const [check, setCheck] = React.useState<{
    for: string;
    result: CheckResult | null;
  }>({ for: "", result: null });
  const [retry, setRetry] = React.useState(0);
  const [stamped, setStamped] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");

  const swatchNodes = React.useRef(new Map<string, HTMLButtonElement>());
  // The latest lookup and name, read when a debounced check fires, so a host
  // that passes a new function each render never restarts the check.
  const checkRef = React.useRef<NamePlateCheck>(checkHandle);
  const nameRef = React.useRef(current.name);
  const reportRef = React.useRef(onHandleCheck);
  React.useEffect(() => {
    checkRef.current = checkHandle;
    nameRef.current = current.name;
    reportRef.current = onHandleCheck;
  });

  /* -------------------------------- data ------------------------------- */

  const name = current.name;
  const handle = current.handle;
  const initials = initialsOf(name);
  const swatch = colours.find((c) => c.id === current.colour) ?? colours[0];
  const colourValue = swatch?.value ?? "var(--ink-3)";
  const fillKey = swatch?.id ?? "none";
  const upload = current.avatar === "upload";
  const pronounText = pronounOptions
    .filter((p) => current.pronouns.includes(p.id))
    .map((p) => p.label)
    .join(", ");
  const bioUsed = [...current.bio].length;
  const bioLeft = bioBudget - bioUsed;

  const handleReason = validateHandle(handle);
  const handleState: NamePlateHandleState =
    status === "error"
      ? "failed"
      : handle.length === 0
        ? "idle"
        : handleReason !== null
          ? "invalid"
          : check.for !== handle || check.result === null
            ? "checking"
            : check.result.state;
  const suggestions =
    handleState === "taken" && check.result?.state === "taken"
      ? check.result.suggestions
      : [];

  const canSubmit =
    ready &&
    !inert &&
    name.trim().length > 0 &&
    handleState === "free" &&
    bioLeft >= 0;

  /* ---------------------------- handle lookup --------------------------- */

  React.useEffect(() => {
    if (status !== "ready") return;
    if (handle.length === 0 || validateHandle(handle) !== null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      checkRef
        .current(handle, { name: nameRef.current, signal: controller.signal })
        .then(
          (res) => {
            if (controller.signal.aborted) return;
            if (res.available) {
              setCheck({ for: handle, result: { state: "free" } });
              setAnnouncement(`@${handle} is free.`);
              reportRef.current?.(handle, "free", []);
            } else {
              const list = (res.suggestions ?? [])
                .map(normaliseHandle)
                .filter((s) => s.length > 0 && s !== handle)
                .slice(0, 4);
              setCheck({
                for: handle,
                result: { state: "taken", suggestions: list },
              });
              setAnnouncement(
                `@${handle} is taken.${list.length ? ` Try ${list.map((s) => `@${s}`).join(", ")}.` : ""}`,
              );
              reportRef.current?.(handle, "taken", list);
            }
          },
          () => {
            if (controller.signal.aborted) return;
            setCheck({ for: handle, result: { state: "failed" } });
            setAnnouncement(`Couldn't check whether @${handle} is free.`);
            reportRef.current?.(handle, "failed", []);
          },
        );
    }, checkDelay);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [handle, status, retry, checkDelay]);

  /* ------------------------------- changes ----------------------------- */

  const patch = (part: Partial<NamePlateValue>, field: NamePlateField) => {
    if (inert) return;
    const next = { ...current, ...part };
    if (value === undefined) setOwn(next);
    onChange?.(next, { field });
    setStamped(false);
  };

  const retryCheck = () => {
    if (status === "error") {
      onRetry?.();
      return;
    }
    setCheck({ for: "", result: null });
    setRetry((n) => n + 1);
    setAnnouncement(`Checking @${handle} again.`);
  };

  const togglePronoun = (id: string, labelText: string) => {
    const on = current.pronouns.includes(id);
    patch(
      {
        pronouns: on
          ? current.pronouns.filter((p) => p !== id)
          : [...current.pronouns, id],
      },
      "pronouns",
    );
    setAnnouncement(`${labelText} ${on ? "removed" : "added"}.`);
  };

  const chooseColour = (c: NamePlateColour) => {
    patch({ colour: c.id, avatar: "initials" }, "colour");
    setAnnouncement(`Avatar colour ${c.label}.`);
  };

  const chooseUpload = () => {
    patch({ avatar: "upload" }, "avatar");
    setAnnouncement("Photo placeholder chosen; add a photo later.");
  };

  const submit = () => {
    if (!canSubmit) return;
    onSubmit?.(current);
    setStamped(true);
    setAnnouncement(`Plate engraved for ${name.trim()}, @${handle}.`);
  };

  /* -------------------------- swatch radio group ------------------------ */

  const radioKeys = [...colours.map((c) => c.id), "upload"];
  const checkedKey = upload ? "upload" : (swatch?.id ?? "upload");
  const onRadioKey = (event: React.KeyboardEvent, key: string) => {
    const i = radioKeys.indexOf(key);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      to = (i + 1) % radioKeys.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      to = (i - 1 + radioKeys.length) % radioKeys.length;
    } else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = radioKeys.length - 1;
    else return;
    event.preventDefault();
    const target = radioKeys[to];
    if (!target) return;
    swatchNodes.current.get(target)?.focus();
    if (target === "upload") chooseUpload();
    else {
      const c = colours.find((x) => x.id === target);
      if (c) chooseColour(c);
    }
  };

  /* ------------------------------- render ------------------------------ */

  const tiltOn = tilt && motionSafe && pointerFine && !disabled;
  const step = cascade(Math.max(suggestions.length, 2));
  const input = cn(
    "w-full rounded-2 border border-hairline-strong bg-surface-0 text-foreground transition-colors placeholder:text-ink-3 hover:border-border disabled:cursor-not-allowed disabled:opacity-60",
    dens.control,
    dens.text,
    "px-3",
    FOCUS_RING,
  );
  const fieldLabel = cn("font-medium text-ink-2", dens.label);

  const hintTone =
    handleState === "free"
      ? "text-success"
      : handleState === "taken"
        ? "text-danger"
        : handleState === "invalid" || handleState === "failed"
          ? "text-warn"
          : "text-ink-3";

  return (
    <div
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
      <header className="flex shrink-0 items-end justify-between gap-3 border-b border-hairline px-4 pt-3 pb-2.5">
        <div className="flex min-w-0 flex-col">
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {eyebrow} &middot; Profile
          </span>
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Step 2 of 3
        </span>
      </header>

      <p id={plateHintId} className="sr-only">
        The plate follows the form as you type.
      </p>

      {status === "loading" ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <Skeleton dens={dens} />
        </div>
      ) : (
        <form
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div
            className={cn(
              "grid grid-cols-1 [grid-template-areas:'plate'_'fields'_'previews'] @min-[40rem]:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] @min-[40rem]:grid-rows-[auto_1fr] @min-[40rem]:[grid-template-areas:'fields_plate'_'fields_previews']",
              dens.gap,
              dens.pad,
            )}
          >
            {/* ------------------------------ fields ------------------------------ */}
            <fieldset
              disabled={inert}
              className={cn(
                "flex min-w-0 flex-col [grid-area:fields]",
                dens.gap,
              )}
            >
              <legend className="sr-only">Profile</legend>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={nameId} className={fieldLabel}>
                  Display name
                </label>
                <input
                  id={nameId}
                  type="text"
                  autoComplete="name"
                  maxLength={40}
                  placeholder="Your name"
                  value={name}
                  onChange={(event) =>
                    patch({ name: event.target.value }, "name")
                  }
                  className={input}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={handleId} className={fieldLabel}>
                  Handle
                </label>
                <div className="relative">
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute top-0 bottom-0 left-3 flex items-center font-mono text-ink-3",
                      dens.text,
                    )}
                  >
                    @
                  </span>
                  <input
                    id={handleId}
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={HANDLE_MAX + 1}
                    placeholder="handle"
                    value={handle}
                    aria-describedby={handleHintId}
                    aria-invalid={
                      handleState === "taken" || handleState === "invalid"
                        ? true
                        : undefined
                    }
                    onChange={(event) =>
                      patch(
                        { handle: normaliseHandle(event.target.value) },
                        "handle",
                      )
                    }
                    className={cn(input, "pr-9 pl-7 font-mono")}
                  />
                  <span className="absolute top-0 right-3 bottom-0 flex items-center">
                    <HandleMark state={handleState} motionSafe={motionSafe} />
                  </span>
                </div>
                <div
                  id={handleHintId}
                  className={cn(
                    "flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1.5",
                    dens.label,
                  )}
                >
                  <span
                    className={cn("transition-colors duration-200", hintTone)}
                  >
                    {handleState === "invalid" ? (
                      handleReason
                    ) : handleState === "idle" ||
                      handleState === "checking" ||
                      handleState === "failed" ? (
                      HANDLE_WORD[handleState]
                    ) : (
                      <>
                        <span className="font-mono">@{handle}</span>{" "}
                        {HANDLE_WORD[handleState]}
                      </>
                    )}
                  </span>
                  {handleState === "failed" ? (
                    <button
                      type="button"
                      onClick={retryCheck}
                      className={cn(BUTTON, "h-6 px-2 text-[11px]", FOCUS_RING)}
                    >
                      <RotateCcw aria-hidden className="size-3" />
                      Try again
                    </button>
                  ) : null}
                  <AnimatePresence initial={false}>
                    {suggestions.map((s, i) => (
                      <motion.button
                        key={s}
                        type="button"
                        onClick={() => {
                          patch({ handle: s }, "handle");
                          setAnnouncement(`Handle set to @${s}.`);
                        }}
                        initial={{
                          opacity: 0,
                          y: motionSafe ? distances.nudge : 0,
                        }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={{
                          y: motionSafe
                            ? { ...springs.snap, delay: r3(i * step) }
                            : { duration: 0 },
                          opacity: {
                            duration: durations.base,
                            ease: easings.enter,
                            delay: motionSafe ? r3(i * step) : 0,
                          },
                        }}
                        className={cn(
                          "inline-flex h-6 items-center rounded-full border border-hairline-strong px-2 font-mono text-[11px] text-ink-2 transition-colors hover:bg-cobalt-wash hover:text-cobalt-bright",
                          FOCUS_RING,
                        )}
                      >
                        @{s}
                      </motion.button>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className={fieldLabel}>
                  Pronouns{" "}
                  <span className="font-normal text-ink-3">optional</span>
                </span>
                <div
                  role="group"
                  aria-label="Pronouns"
                  className="flex flex-wrap gap-1.5"
                >
                  {pronounOptions.map((p) => {
                    const on = current.pronouns.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => togglePronoun(p.id, p.label)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border transition-colors",
                          dens.chip,
                          on
                            ? "border-[color-mix(in_oklab,var(--accent-bright)_35%,transparent)] bg-cobalt-wash text-cobalt-bright"
                            : "border-hairline-strong text-ink-2 hover:bg-surface-2 hover:text-foreground",
                          FOCUS_RING,
                        )}
                      >
                        <motion.span
                          aria-hidden
                          className="flex items-center justify-center overflow-hidden"
                          initial={false}
                          animate={{ width: on ? 12 : 0, opacity: on ? 1 : 0 }}
                          transition={
                            motionSafe
                              ? {
                                  ...springs.snap,
                                  opacity: { duration: durations.fast },
                                }
                              : { duration: 0 }
                          }
                        >
                          <svg viewBox="0 0 14 14" className="size-3 shrink-0">
                            <motion.path
                              d="M3 7.4 5.8 10 11 4.2"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              initial={false}
                              animate={{ pathLength: on ? 1 : 0 }}
                              transition={
                                motionSafe ? springs.flick : { duration: 0 }
                              }
                            />
                          </svg>
                        </motion.span>
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor={bioId} className={fieldLabel}>
                    Bio
                  </label>
                  <span
                    id={bioHintId}
                    className={cn(
                      "font-mono text-[11px] tabular-nums transition-colors duration-200",
                      bioLeft < 0
                        ? "text-danger"
                        : bioLeft <= 12
                          ? "text-warn"
                          : "text-ink-3",
                    )}
                  >
                    {bioLeft < 0 ? `${-bioLeft} over` : `${bioLeft} left`}
                  </span>
                </div>
                <textarea
                  id={bioId}
                  rows={3}
                  placeholder="A line or two about what you do."
                  value={current.bio}
                  aria-describedby={bioHintId}
                  aria-invalid={bioLeft < 0 ? true : undefined}
                  onChange={(event) => {
                    const next = event.target.value;
                    const left = bioBudget - [...next].length;
                    if (left < 0 && bioLeft >= 0) {
                      setAnnouncement(`Bio is ${-left} over budget.`);
                    } else if (left >= 0 && bioLeft < 0) {
                      setAnnouncement("Bio is within budget.");
                    }
                    patch({ bio: next }, "bio");
                  }}
                  className={cn(
                    input,
                    "h-auto resize-none py-2 leading-snug",
                    dens.area,
                  )}
                />
                <span
                  aria-hidden
                  className="block h-px w-full overflow-hidden rounded-full bg-hairline"
                >
                  <motion.span
                    className={cn(
                      "block h-full w-full origin-left",
                      bioLeft < 0 ? "bg-danger" : "bg-cobalt-bright",
                    )}
                    initial={false}
                    animate={{
                      scaleX: Math.min(1, bioUsed / Math.max(1, bioBudget)),
                    }}
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className={fieldLabel}>Avatar</span>
                <div
                  role="radiogroup"
                  aria-label="Avatar"
                  className="flex flex-wrap items-center gap-2"
                >
                  {colours.map((c) => {
                    const checked = checkedKey === c.id;
                    return (
                      <button
                        key={c.id}
                        ref={(node) => {
                          if (node) swatchNodes.current.set(c.id, node);
                          else swatchNodes.current.delete(c.id);
                        }}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        aria-label={c.label}
                        title={c.label}
                        tabIndex={checked ? 0 : -1}
                        onClick={() => chooseColour(c)}
                        onKeyDown={(event) => onRadioKey(event, c.id)}
                        className={cn(
                          "relative flex shrink-0 items-center justify-center rounded-full",
                          dens.swatch,
                          FOCUS_RING,
                        )}
                      >
                        <span
                          aria-hidden
                          className="absolute inset-0 rounded-full"
                          style={{ background: c.value }}
                        />
                        <motion.span
                          aria-hidden
                          className="absolute -inset-[3px] rounded-full border-2"
                          style={{ borderColor: c.value }}
                          initial={false}
                          animate={{
                            opacity: checked ? 1 : 0,
                            scale: checked ? 1 : 0.8,
                          }}
                          transition={
                            motionSafe
                              ? {
                                  ...springs.snap,
                                  opacity: { duration: durations.fast },
                                }
                              : { duration: 0 }
                          }
                        />
                        <span
                          aria-hidden
                          className="relative text-[11px] font-semibold text-white"
                          style={{
                            textShadow:
                              "0 1px 1px color-mix(in oklab, black 30%, transparent)",
                          }}
                        >
                          {initials || "·"}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    ref={(node) => {
                      if (node) swatchNodes.current.set("upload", node);
                      else swatchNodes.current.delete("upload");
                    }}
                    type="button"
                    role="radio"
                    aria-checked={checkedKey === "upload"}
                    tabIndex={checkedKey === "upload" ? 0 : -1}
                    onClick={chooseUpload}
                    onKeyDown={(event) => onRadioKey(event, "upload")}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border border-dashed pr-3 pl-1 transition-colors",
                      dens.chip,
                      checkedKey === "upload"
                        ? "border-cobalt-bright text-cobalt-bright"
                        : "border-hairline-strong text-ink-2 hover:bg-surface-2 hover:text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    <span className="flex size-5 items-center justify-center rounded-full bg-surface-2">
                      <ImageUp aria-hidden className="size-3" />
                    </span>
                    Upload a photo
                  </button>
                </div>
              </div>

              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className={cn("text-ink-3", dens.label)}>
                  {!ready
                    ? "Handles can’t be checked right now."
                    : name.trim().length === 0
                      ? "Add a name to engrave."
                      : handleState !== "free"
                        ? "A free handle is needed to continue."
                        : bioLeft < 0
                          ? "Shorten the bio to continue."
                          : stamped
                            ? "Saved."
                            : "Everything on the plate is yours to change."}
                </span>
                <button
                  type="submit"
                  aria-disabled={!canSubmit || undefined}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-2 border px-3 font-medium transition-colors",
                    dens.control,
                    dens.text,
                    canSubmit
                      ? "border-transparent bg-primary text-primary-foreground hover:opacity-90"
                      : "cursor-not-allowed border-hairline bg-surface-1 text-ink-3",
                    FOCUS_RING,
                  )}
                >
                  {submitLabel}
                  <ArrowRight aria-hidden className="size-3.5" />
                </button>
              </div>
            </fieldset>

            {/* ------------------------------ plate ------------------------------- */}
            <div className="min-w-0 [grid-area:plate]">
              {status === "error" ? (
                <div
                  role="alert"
                  className="mb-3 flex items-center gap-2 rounded-2 border border-[color-mix(in_oklab,var(--warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--warn)_10%,transparent)] px-2.5 py-2 text-xs text-foreground"
                >
                  <TriangleAlert
                    aria-hidden
                    className="size-3.5 shrink-0 text-warn"
                  />
                  <span className="min-w-0 flex-1">
                    The availability service didn&apos;t answer. Keep editing;
                    handles are checked once it is back.
                  </span>
                  {onRetry ? (
                    <button
                      type="button"
                      onClick={onRetry}
                      className={cn(
                        BUTTON,
                        "h-6 shrink-0 bg-card px-2 text-[11px]",
                        FOCUS_RING,
                      )}
                    >
                      <RotateCcw aria-hidden className="size-3" />
                      Try again
                    </button>
                  ) : null}
                </div>
              ) : null}
              <Plate
                name={name}
                handle={handle}
                pronouns={pronounText}
                initials={initials}
                colour={colourValue}
                fillKey={fillKey}
                upload={upload}
                finish={finish}
                eyebrow={eyebrow}
                tiltOn={tiltOn}
                motionSafe={motionSafe}
                stamped={stamped}
                describedBy={plateHintId}
              />
            </div>

            {/* ----------------------------- previews ----------------------------- */}
            <div className="min-w-0 self-start [grid-area:previews]">
              <Previews
                name={name}
                handle={handle}
                initials={initials}
                colour={colourValue}
                fillKey={fillKey}
                upload={upload}
                pronouns={pronounText}
                motionSafe={motionSafe}
                dens={dens}
              />
            </div>
          </div>
        </form>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
