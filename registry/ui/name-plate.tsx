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
  Anchor,
  Check,
  Compass,
  Flame,
  Hammer,
  Leaf,
  LoaderCircle,
  Mountain,
  Pencil,
  RotateCcw,
  TriangleAlert,
  Truck,
  Waves,
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

export type NamePlateValue = {
  /** The workspace's name, as people will see it. */
  name: string;
  /** The address slug after the prefix: "harbour-ops". */
  address: string;
  /** The chosen icon's id. */
  icon: string;
  /** The chosen colour's id. */
  color: string;
};

export type NamePlateIcon = {
  id: string;
  /** Its accessible name: "Anchor". */
  label: string;
  /** A 16px glyph drawn in currentColor. */
  icon: React.ComponentType<{ className?: string }>;
};

export type NamePlateColor = {
  id: string;
  /** Its accessible name: "Harbour blue". */
  label: string;
  /** Any CSS colour; pigment reads best at a middle lightness. */
  value: string;
};

export type NamePlateStyle = "enamel" | "brass" | "timber";
export type NamePlateAvailability = "available" | "taken";

export type NamePlateProps = {
  /** Controlled: the name, address, icon and colour. */
  value?: NamePlateValue;
  /** Initial value when uncontrolled. @default defaultNamePlateValue */
  defaultValue?: NamePlateValue;
  /** Fires from the field, chip or radio that changed it, with the whole value. */
  onChange?: (value: NamePlateValue) => void;
  /** Create was pressed with a valid value. Return a promise to show it working; a rejection keeps every field and shows why. */
  onCreate?: (value: NamePlateValue) => void | Promise<unknown>;
  /** The icons on offer. @default defaultNamePlateIcons (8) */
  icons?: NamePlateIcon[];
  /** The colours on offer. @default defaultNamePlateColors (6) */
  colors?: NamePlateColor[];
  /** What comes before the address. @default "fieldline.app/" */
  addressPrefix?: string;
  /** Addresses already in use, checked as you type. @default defaultNamePlateTaken */
  takenAddresses?: string[];
  /** Asks the host whether an address is free; sync or a promise. Overrides `takenAddresses`. */
  checkAddress?: (
    slug: string,
  ) => NamePlateAvailability | Promise<NamePlateAvailability>;
  /** The plate: an enamel sign in the colour, an engraved brass plate with a colour inlay, or a timber board with a painted panel. @default "enamel" */
  plateStyle?: NamePlateStyle;
  /** How lively the plate's pendulum is, 0 to 1: from barely moving to several decaying swings. @default 0.6 */
  swingAmount?: number;
  /** The form's accent: the chosen icon, the primary button and the rail's nail. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The preview sidebar's sections. @default ["Inbox", "Jobs", "Crews", "Reports"] */
  nav?: string[];
  /** The longest name allowed. @default 32 */
  maxLength?: number;
  /** The tallest the step grows before its body scrolls, px. @default 560 */
  maxHeight?: number;
  /** Nothing can be changed or created. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultNamePlateIcons: NamePlateIcon[] = [
  { id: "anchor", label: "Anchor", icon: Anchor },
  { id: "truck", label: "Truck", icon: Truck },
  { id: "leaf", label: "Leaf", icon: Leaf },
  { id: "hammer", label: "Hammer", icon: Hammer },
  { id: "compass", label: "Compass", icon: Compass },
  { id: "flame", label: "Flame", icon: Flame },
  { id: "mountain", label: "Mountain", icon: Mountain },
  { id: "waves", label: "Waves", icon: Waves },
];

/** Each colour is a token's hue at a fixed lightness, so it reads in both themes. */
export const defaultNamePlateColors: NamePlateColor[] = [
  {
    id: "harbour",
    label: "Harbour blue",
    value: "oklch(from var(--accent-bright) 0.56 0.15 h)",
  },
  {
    id: "kelp",
    label: "Kelp green",
    value: "oklch(from var(--success) 0.58 0.12 h)",
  },
  {
    id: "beacon",
    label: "Beacon amber",
    value: "oklch(from var(--warn) 0.66 0.14 h)",
  },
  {
    id: "brick",
    label: "Brick red",
    value: "oklch(from var(--danger) 0.56 0.17 h)",
  },
  {
    id: "heather",
    label: "Heather",
    value: "oklch(from var(--accent-bright) 0.56 0.14 320)",
  },
  { id: "slate", label: "Slate", value: "oklch(from var(--ink-3) 0.5 0.03 h)" },
];

export const defaultNamePlateTaken: string[] = [
  "harbour-ops",
  "harbour",
  "ops",
  "basinworks",
  "fieldline",
  "admin",
];

export const defaultNamePlateValue: NamePlateValue = {
  name: "",
  address: "",
  icon: "anchor",
  color: "harbour",
};

const DEFAULT_NAV = ["Inbox", "Jobs", "Crews", "Reports"];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const r2 = (v: number) => Math.round(v * 100) / 100;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** The address a name would get: lowercase ASCII, dashes between words. */
export function slugifyName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
}

function formatError(slug: string): string | null {
  if (slug.length === 0) return "Choose an address";
  if (slug.length < 3) return "Use at least 3 characters";
  if (slug.length > 30) return "Use at most 30 characters";
  if (!/^[a-z]/.test(slug)) return "Start with a letter";
  if (/[^a-z0-9-]/.test(slug)) return "Use only a–z, 0–9 and dashes";
  if (/--|-$/.test(slug)) return "No double or trailing dashes";
  return null;
}

/** A spring at unit mass from a stiffness and a damping ratio. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

type Check = {
  slug: string;
  state: "idle" | "checking" | "available" | "taken";
};

/* ----------------------------------------------------------------------- */
/*                                 The plate                                */
/* ----------------------------------------------------------------------- */

function PlateFace({
  plateStyle,
  color,
  name,
  Icon,
  motionSafe,
  width,
}: {
  plateStyle: NamePlateStyle;
  color: string;
  name: string;
  Icon: React.ComponentType<{ className?: string }> | undefined;
  motionSafe: boolean;
  width: number;
}) {
  // The type steps down to the plate's width, so a long name never spills;
  // words keep their letters together and wrap whole.
  const room = width - (plateStyle === "timber" ? 64 : 40);
  const size = Math.round(
    clamp(room / (Math.max(8, name.length) * 0.58), 13, 21),
  );
  const words = name.split(/(\s+)/);
  const starts = words.map((_, i) => words.slice(0, i).join("").length);
  const letters = (
    <span
      className="block max-w-full font-semibold"
      style={{ fontSize: size, lineHeight: 1.15 }}
    >
      {words.map((word, w) => {
        const start = starts[w] ?? 0;
        if (/^\s+$/.test(word)) return <span key={`s${w}`}> </span>;
        return (
          <span
            key={`w${w}`}
            className={cn(
              "inline-block max-w-full",
              word.length > 12 ? "break-all" : "whitespace-nowrap",
            )}
          >
            {Array.from(word).map((ch, i) => (
              <motion.span
                key={`${start + i}-${ch}`}
                className="inline-block"
                initial={{
                  y: motionSafe ? -3 : 0,
                  opacity: motionSafe ? 0 : 1,
                }}
                animate={{ y: 0, opacity: 1 }}
                transition={
                  motionSafe
                    ? {
                        y: springs.flick,
                        opacity: { duration: durations.blink },
                      }
                    : { duration: 0 }
                }
              >
                {ch}
              </motion.span>
            ))}
          </span>
        );
      })}
    </span>
  );
  const tint = {
    transition: "background-color 400ms, color 400ms, border-color 400ms",
  };

  if (plateStyle === "brass") {
    const brass = "oklch(from var(--warn) 0.8 0.09 h)";
    return (
      <div
        className="relative flex flex-col items-center gap-1 overflow-clip rounded-2 border px-5 pt-3.5 pb-4 text-center"
        style={{
          ...tint,
          backgroundColor: brass,
          backgroundImage:
            "linear-gradient(160deg, color-mix(in oklab, white 34%, transparent), transparent 45%, color-mix(in oklab, black 10%, transparent))",
          borderColor: `color-mix(in oklab, ${brass} 62%, black)`,
          color: `color-mix(in oklab, ${brass} 30%, black)`,
          textShadow: `0 1px 0 color-mix(in oklab, white 45%, transparent)`,
        }}
      >
        {[
          "top-1.5 left-1.5",
          "top-1.5 right-1.5",
          "bottom-2.5 left-1.5",
          "bottom-2.5 right-1.5",
        ].map((at) => (
          <span
            key={at}
            className={cn(
              "absolute flex size-2 items-center justify-center rounded-full",
              at,
            )}
            style={{
              backgroundColor: `color-mix(in oklab, ${brass} 78%, black)`,
            }}
          >
            <span
              className="h-px w-1.5 rotate-45"
              style={{
                backgroundColor: `color-mix(in oklab, ${brass} 45%, black)`,
              }}
            />
          </span>
        ))}
        {Icon ? <Icon className="size-4 opacity-80" /> : null}
        {letters}
        <span
          className="absolute inset-x-0 bottom-0 h-1.5"
          style={{ ...tint, backgroundColor: color }}
        />
      </div>
    );
  }

  if (plateStyle === "timber") {
    const wood = "oklch(from var(--warn) 0.6 0.075 h)";
    return (
      <div
        className="relative rounded-2 border p-2"
        style={{
          backgroundColor: wood,
          backgroundImage: `repeating-linear-gradient(176deg, transparent 0 7px, color-mix(in oklab, ${wood} 82%, black) 7px 8px, transparent 8px 13px), linear-gradient(180deg, color-mix(in oklab, white 12%, transparent), transparent)`,
          borderColor: `color-mix(in oklab, ${wood} 55%, black)`,
        }}
      >
        <span
          className="absolute top-1/2 left-1 size-1 -translate-y-1/2 rounded-full"
          style={{ backgroundColor: `color-mix(in oklab, ${wood} 40%, black)` }}
        />
        <span
          className="absolute top-1/2 right-1 size-1 -translate-y-1/2 rounded-full"
          style={{ backgroundColor: `color-mix(in oklab, ${wood} 40%, black)` }}
        />
        <div
          className="mx-1 flex flex-col items-center gap-1 rounded-1 px-3 pt-2.5 pb-3 text-center"
          style={{
            ...tint,
            backgroundColor: color,
            color: `oklch(from ${color} 0.96 0.03 h)`,
            boxShadow: `inset 0 1px 2px color-mix(in oklab, black 25%, transparent)`,
          }}
        >
          {Icon ? <Icon className="size-4 opacity-90" /> : null}
          {letters}
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex flex-col items-center gap-1 rounded-3 border-2 px-5 pt-3.5 pb-4 text-center"
      style={{
        ...tint,
        backgroundColor: color,
        backgroundImage:
          "linear-gradient(170deg, color-mix(in oklab, white 22%, transparent), transparent 50%)",
        borderColor: `color-mix(in oklab, ${color} 68%, black)`,
        color: `oklch(from ${color} 0.97 0.02 h)`,
        boxShadow: `inset 0 0 0 3px ${color}, inset 0 0 0 4px color-mix(in oklab, white 62%, transparent)`,
      }}
    >
      {Icon ? <Icon className="size-4 opacity-90" /> : null}
      {letters}
    </div>
  );
}

/**
 * The sign and its two cords, hung from one nail. The whole hanger rotates
 * about the nail (origin at its top centre), so cords and plate swing as one
 * body. Its angle is a single spring value: the entrance tilts it and slides
 * it in, and every keystroke, colour or icon change is an impulse — angular
 * velocity handed to the same pendulum spring.
 */
function Hanger({
  plateStyle,
  color,
  name,
  Icon,
  motionSafe,
  swingAmount,
  impulse,
  narrow,
}: {
  plateStyle: NamePlateStyle;
  color: string;
  name: string;
  Icon: React.ComponentType<{ className?: string }> | undefined;
  motionSafe: boolean;
  swingAmount: number;
  impulse: { n: number; v: number };
  narrow: boolean;
}) {
  const s = clamp(swingAmount, 0, 1);
  const angle = useMotionValue(motionSafe ? -38 * s - 4 : 0);
  const x = useMotionValue(motionSafe ? -150 : 0);
  const opacity = useMotionValue(motionSafe ? 1 : 0);
  const swing = React.useRef<AnimationPlaybackControls | null>(null);
  const pendulum = React.useMemo(() => spring(70, lerp(0.62, 0.1, s)), [s]);

  const kick = React.useCallback(
    (dv: number) => {
      if (!motionSafe) return;
      const v = angle.getVelocity() + dv;
      swing.current?.stop();
      swing.current = animate(angle.get(), 0, {
        ...pendulum,
        velocity: v,
        onUpdate: (a) => angle.set(r2(a)),
      });
    },
    [angle, motionSafe, pendulum],
  );

  // The entrance: slid in along the rail on glide while the angle falls to
  // rest on the pendulum spring. Plain numbers into the values, since the
  // hanger has only just mounted.
  React.useEffect(() => {
    if (!motionSafe) {
      const c = animate(opacity.get(), 1, {
        duration: durations.base,
        onUpdate: (v) => opacity.set(r2(v)),
      });
      return () => c.stop();
    }
    const slide = animate(x.get(), 0, {
      ...springs.glide,
      onUpdate: (v) => x.set(r2(v)),
    });
    swing.current = animate(angle.get(), 0, {
      ...pendulum,
      onUpdate: (a) => angle.set(r2(a)),
    });
    return () => {
      slide.stop();
      swing.current?.stop();
    };
    // The entrance runs once per hanging; later changes arrive as impulses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seen = React.useRef(impulse.n);
  React.useEffect(() => {
    if (impulse.n === seen.current) return;
    seen.current = impulse.n;
    kick(impulse.v * s);
  }, [impulse, kick, s]);

  React.useEffect(() => () => swing.current?.stop(), []);

  const width = narrow ? 168 : 184;
  return (
    <motion.div
      aria-hidden
      className="absolute top-0 left-1/2"
      style={{ x, opacity, marginLeft: -width / 2, width }}
    >
      <motion.div
        className="flex flex-col items-center"
        style={{ rotate: angle, originX: 0.5, originY: 0 }}
        onPointerEnter={(event) => {
          // A hand passing the plate nudges it the way the hand is going.
          if (event.pointerType !== "mouse") return;
          const box = event.currentTarget.getBoundingClientRect();
          const from = event.clientX < box.left + box.width / 2 ? 1 : -1;
          kick(from * 70 * s);
        }}
      >
        <svg
          viewBox="0 0 100 26"
          className="block h-[26px] w-full"
          preserveAspectRatio="none"
        >
          <path
            d="M50 1 L18 25 M50 1 L82 25"
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth={1.4}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
          />
        </svg>
        <div className="-mt-0.5 w-full drop-shadow-[0_8px_10px_color-mix(in_oklab,black_22%,transparent)]">
          <PlateFace
            plateStyle={plateStyle}
            color={color}
            name={name}
            Icon={Icon}
            motionSafe={motionSafe}
            width={width}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The step                                  */
/* ----------------------------------------------------------------------- */

type Creating = { state: "idle" | "busy" | "done" | "failed"; reason?: string };

/**
 * The workspace-creation step. Type a name and its letters are set onto a
 * plate that swings into the preview sidebar on a pendulum spring — slid
 * along the rail on glide, tilted, and falling through a few decaying swings
 * to hang from its nail — while the address forms beneath the name, each
 * new letter dropping in on flick. Every keystroke nudges the plate, and a
 * new colour re-tints it with a bigger push.
 *
 * The address is checked live: its format at once, its availability after a
 * pause in typing (a list, or the host's own check), and a taken address
 * offers alternatives that fill it in one press. Icons and colours are
 * radiogroups the arrows move through. Create may return a promise; a failed
 * create keeps every field and says why. Under 40rem the plate hangs above
 * the form. Under reduced motion the plate hangs still and fades in, and the
 * letters appear without dropping; every check and state still shows.
 */
export function NamePlate({
  value,
  defaultValue = defaultNamePlateValue,
  onChange,
  onCreate,
  icons = defaultNamePlateIcons,
  colors = defaultNamePlateColors,
  addressPrefix = "fieldline.app/",
  takenAddresses = defaultNamePlateTaken,
  checkAddress,
  plateStyle = "enamel",
  swingAmount = 0.6,
  accent = "var(--accent-bright)",
  nav = DEFAULT_NAV,
  maxLength = 32,
  maxHeight = 560,
  disabled = false,
  className,
}: NamePlateProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const ids = {
    title: `${uid}-title`,
    name: `${uid}-name`,
    nameHint: `${uid}-name-hint`,
    address: `${uid}-address`,
    addressMsg: `${uid}-address-msg`,
    icon: `${uid}-icon`,
    color: `${uid}-color`,
  };
  const ink = `oklch(from ${accent} 0.53 0.17 h)`;
  const pigment = `oklch(from ${accent} 0.64 0.16 h)`;

  const [own, setOwn] = React.useState<NamePlateValue>(() => ({
    ...defaultValue,
  }));
  const val = value ?? own;
  const followsAtFirst =
    val.address === "" || val.address === slugifyName(val.name);
  const following = React.useRef(followsAtFirst);
  const [editing, setEditing] = React.useState(!followsAtFirst);
  const [section, setSection] = React.useState<HTMLElement | null>(null);
  const [narrow, setNarrow] = React.useState(false);
  React.useLayoutEffect(() => {
    if (!section) return;
    const measure = () => setNarrow(section.clientWidth < 640);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(section);
    return () => ro.disconnect();
  }, [section]);
  const [impulse, setImpulse] = React.useState({ n: 0, v: 0 });
  const [check, setCheck] = React.useState<Check>({ slug: "", state: "idle" });
  const [creating, setCreating] = React.useState<Creating>({ state: "idle" });
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [addressInput, setAddressInput] =
    React.useState<HTMLInputElement | null>(null);
  const focusAddress = React.useRef(false);
  const request = React.useRef(0);
  const say = (text: string) => setSaid((x) => ({ n: x.n + 1, text }));

  const write = (next: NamePlateValue) => {
    if (value === undefined) setOwn(next);
    onChange?.(next);
    if (creating.state === "failed" || creating.state === "done") {
      setCreating({ state: "idle" });
    }
  };
  const push = (v: number) => setImpulse((i) => ({ n: i.n + 1, v }));

  const slug = val.address;
  const fmtError = slug ? formatError(slug) : null;
  const checkable = !!slug && !fmtError;

  // The host's check and list are read when a check runs, not as effect
  // inputs: an inline function or array from the host would otherwise
  // restart the check on every render.
  const asker = React.useRef({ checkAddress, takenAddresses });
  React.useEffect(() => {
    asker.current = { checkAddress, takenAddresses };
  });
  const takenKey = takenAddresses.join("|");

  // Availability: after a pause in typing, and only the newest answer counts.
  React.useEffect(() => {
    if (!checkable) return;
    const n = ++request.current;
    const t = window.setTimeout(() => {
      setCheck({ slug, state: "checking" });
      const settle = (answer: NamePlateAvailability) => {
        if (n !== request.current) return;
        setCheck({ slug, state: answer });
        setSaid((x) => ({
          n: x.n + 1,
          text:
            answer === "available"
              ? `${addressPrefix}${slug} is free.`
              : `${addressPrefix}${slug} is taken. Alternatives are offered.`,
        }));
      };
      try {
        const { checkAddress: ask, takenAddresses: taken } = asker.current;
        const out = ask
          ? ask(slug)
          : taken.includes(slug)
            ? "taken"
            : "available";
        if (typeof out === "string") settle(out);
        else out.then(settle, () => settle("taken"));
      } catch {
        settle("taken");
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [slug, checkable, takenKey, addressPrefix]);

  const avail: Check["state"] = !checkable
    ? "idle"
    : check.slug === slug
      ? check.state
      : "checking";

  const alternatives = React.useMemo(() => {
    if (avail !== "taken") return [];
    const words = val.name.trim().split(/\s+/).filter(Boolean);
    const initials = words.map((w) => w.charAt(0).toLowerCase()).join("");
    const raw = [
      `${slug}-team`,
      `${slug}-hq`,
      `${slug}-${val.icon}`,
      initials.length >= 2 ? `${initials}-crew` : "",
      `${slug}-2`,
    ];
    return raw
      .map((r) => r.slice(0, 30))
      .filter((r, i, a) => r && a.indexOf(r) === i && !formatError(r))
      .filter((r) => !takenAddresses.includes(r))
      .slice(0, 3);
  }, [avail, slug, val.name, val.icon, takenAddresses]);

  React.useEffect(() => {
    if (focusAddress.current && addressInput) {
      focusAddress.current = false;
      addressInput.focus();
      const end = addressInput.value.length;
      addressInput.setSelectionRange(end, end);
    }
  }, [addressInput]);

  /* ------------------------------- actions ------------------------------ */

  const setName = (name: string) => {
    const next = { ...val, name };
    if (following.current) next.address = slugifyName(name);
    write(next);
    if (nameError && name.trim()) setNameError(null);
    if (name.length > val.name.length) push(name.length % 2 ? 42 : -42);
    else if (name.length < val.name.length) push(-24);
  };

  const setAddress = (address: string, by: "typing" | "pick" | "match") => {
    following.current = by === "match";
    write({ ...val, address });
    if (by === "pick") say(`Using ${addressPrefix}${address}.`);
  };

  const editAddress = () => {
    if (disabled) return;
    following.current = false;
    focusAddress.current = true;
    setEditing(true);
  };

  const matchName = () => {
    setEditing(false);
    setAddress(slugifyName(val.name), "match");
  };

  const pick = (key: "icon" | "color", id: string) => {
    if (disabled || val[key] === id) return;
    write({ ...val, [key]: id });
    push(key === "color" ? 150 : -120);
  };

  const create = () => {
    if (disabled || creating.state === "busy") return;
    if (!val.name.trim()) {
      setNameError("Give the workspace a name");
      say("Give the workspace a name.");
      return;
    }
    if (fmtError || !slug) {
      say(`Address: ${fmtError ?? "Choose an address"}.`);
      return;
    }
    if (avail !== "available") {
      say(
        avail === "taken"
          ? "That address is taken. Pick one of the alternatives."
          : "Still checking the address.",
      );
      return;
    }
    const result = onCreate?.(val);
    const done = () => {
      setCreating({ state: "done" });
      push(90);
      say(`${val.name.trim()} is ready at ${addressPrefix}${slug}.`);
    };
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setCreating({ state: "busy" });
      say(`Creating ${val.name.trim()}.`);
      (result as Promise<unknown>).then(done, (error: unknown) => {
        const reason =
          error instanceof Error && error.message
            ? error.message
            : "Something went wrong on our side";
        setCreating({ state: "failed", reason });
        say(
          `Could not create the workspace: ${reason}. Your details are kept.`,
        );
      });
    } else done();
  };

  /* ------------------------------ radiogroups --------------------------- */

  const roving = (
    event: React.KeyboardEvent,
    list: { id: string }[],
    current: string,
    key: "icon" | "color",
    group: string,
  ) => {
    const at = Math.max(
      0,
      list.findIndex((x) => x.id === current),
    );
    const last = list.length - 1;
    const to =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? at === last
          ? 0
          : at + 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? at === 0
            ? last
            : at - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1;
    if (to === -1) return;
    event.preventDefault();
    const next = list[to];
    if (!next) return;
    pick(key, next.id);
    const root = (event.currentTarget as HTMLElement).closest(
      `[data-name-plate-group="${group}"]`,
    );
    root
      ?.querySelector<HTMLElement>(
        `[data-name-plate-option="${CSS.escape(next.id)}"]`,
      )
      ?.focus();
  };

  /* ------------------------------- render ------------------------------- */

  const color =
    colors.find((c) => c.id === val.color)?.value ??
    colors[0]?.value ??
    "var(--accent-bright)";
  const Icon = icons.find((i) => i.id === val.icon)?.icon ?? icons[0]?.icon;
  const named = val.name.trim().length > 0;
  const created = creating.state === "done";

  const statusLine = (() => {
    if (!slug)
      return {
        tone: "text-ink-3",
        icon: null,
        text: "Your address appears as you type the name",
      };
    if (fmtError)
      return { tone: "text-danger", icon: "x" as const, text: fmtError };
    if (avail === "checking")
      return { tone: "text-ink-3", icon: "spin" as const, text: "Checking…" };
    if (avail === "taken")
      return {
        tone: "text-danger",
        icon: "x" as const,
        text: `${slug} is taken`,
      };
    if (avail === "available")
      return {
        tone: "text-success",
        icon: "check" as const,
        text: `${slug} is free`,
      };
    return { tone: "text-ink-3", icon: null, text: "" };
  })();

  const rail = (narrow: boolean) => (
    <div className={cn("relative w-full", narrow ? "h-[150px]" : "h-[176px]")}>
      <span
        aria-hidden
        className="absolute inset-x-4 top-3 h-1 rounded-full bg-hairline-strong"
      />
      <span
        aria-hidden
        className="absolute top-2 left-1/2 z-10 size-3 -translate-x-1/2 rounded-full border-2 border-card"
        style={{ backgroundColor: ink }}
      />
      <div className="absolute inset-x-0 top-3.5 bottom-0">
        <AnimatePresence initial={false}>
          {named ? (
            <motion.div
              key="hanger"
              className="absolute inset-0"
              exit={{
                opacity: 0,
                x: motionSafe ? -distances.shift * 3 : 0,
                transition: exitFor(),
              }}
            >
              <Hanger
                plateStyle={plateStyle}
                color={color}
                name={val.name.trim()}
                Icon={Icon}
                motionSafe={motionSafe}
                swingAmount={swingAmount}
                impulse={impulse}
                narrow={narrow}
              />
            </motion.div>
          ) : (
            <motion.div
              key="ghost"
              aria-hidden
              className="absolute top-0 left-1/2 flex w-[168px] -translate-x-1/2 flex-col items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: durations.fast } }}
            >
              <svg
                viewBox="0 0 100 26"
                className="block h-[26px] w-full"
                preserveAspectRatio="none"
              >
                <path
                  d="M50 1 L18 25 M50 1 L82 25"
                  fill="none"
                  stroke="var(--hairline-strong)"
                  strokeWidth={1.4}
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <span className="-mt-0.5 flex h-16 w-full items-center justify-center rounded-3 border-2 border-dashed border-hairline-strong text-[12px] text-ink-3">
                Your sign here
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  const switcher = (
    <div className="flex items-center gap-2 rounded-2 border border-hairline bg-card px-2 py-1.5">
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-2 text-primary-foreground"
        style={{ backgroundColor: color, transition: "background-color 400ms" }}
      >
        {Icon ? <Icon className="size-3.5" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-foreground">
          {named ? val.name.trim() : "Untitled workspace"}
        </span>
        <span className="block truncate font-mono text-[10px] text-ink-3">
          {addressPrefix}
          {slug || "…"}
        </span>
      </span>
      <AnimatePresence initial={false}>
        {created ? (
          <motion.span
            key="made"
            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
            initial={{ opacity: 0, scale: motionSafe ? 0.6 : 1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? {
                    scale: springs.recoil,
                    opacity: { duration: durations.fast },
                  }
                : { duration: durations.fast }
            }
          >
            <svg viewBox="0 0 16 16" className="size-3">
              <motion.path
                d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: motionSafe ? 0 : 1 }}
                animate={{ pathLength: 1 }}
                transition={
                  motionSafe
                    ? { ...springs.flick, delay: 0.1 }
                    : { duration: 0 }
                }
              />
            </svg>
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );

  const preview = (
    <div
      className="relative flex flex-col gap-3 overflow-clip rounded-3 border border-hairline bg-surface-1 p-3"
      aria-hidden
    >
      {rail(false)}
      {switcher}
      <ul className="flex flex-col gap-0.5">
        {nav.map((item, i) => (
          <li
            key={item}
            className={cn(
              "flex h-7 items-center gap-2 rounded-2 px-2 text-[12px]",
              i === 0 ? "bg-surface-2 text-foreground" : "text-ink-3",
            )}
          >
            <span
              className="size-1.5 rounded-full"
              style={{
                backgroundColor: i === 0 ? color : "var(--hairline-strong)",
                transition: "background-color 400ms",
              }}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );

  const inputBox =
    "flex h-9 items-center rounded-2 border bg-card text-[13px] text-foreground transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring focus-within:outline-solid";

  return (
    <section
      ref={setSection}
      aria-labelledby={ids.title}
      className={cn(
        "@container/name-plate flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ maxHeight }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <h2 id={ids.title} className="truncate text-sm font-semibold">
            Name your workspace
          </h2>
          <p className="truncate text-[11px] text-ink-3">
            You can change all of this later
          </p>
        </div>
      </header>

      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
        <div className="grid grid-cols-1 gap-4 p-4 @min-[40rem]/name-plate:grid-cols-[minmax(0,1fr)_15rem]">
          {narrow ? (
            <div
              aria-hidden
              className="rounded-3 border border-hairline bg-surface-1 @min-[40rem]/name-plate:hidden"
            >
              {rail(true)}
            </div>
          ) : null}

          <form
            noValidate
            className="flex min-w-0 flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={ids.name}
                className="text-[12px] font-medium text-foreground"
              >
                Workspace name
              </label>
              <div
                className={cn(
                  inputBox,
                  nameError ? "border-danger" : "border-hairline-strong",
                )}
              >
                <input
                  id={ids.name}
                  value={val.name}
                  maxLength={maxLength}
                  placeholder="Harbour Ops"
                  autoComplete="off"
                  readOnly={disabled || creating.state === "busy"}
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={ids.nameHint}
                  onChange={(e) => {
                    const next = e.currentTarget.value;
                    setName(next);
                  }}
                  className="h-full min-w-0 flex-1 rounded-2 bg-transparent px-3 outline-none placeholder:text-ink-3"
                />
                <span className="pr-3 font-mono text-[10px] text-ink-3 tabular-nums">
                  {val.name.length}/{maxLength}
                </span>
              </div>
              <p
                id={ids.nameHint}
                className={cn(
                  "text-[11px]",
                  nameError ? "text-danger" : "text-ink-3",
                )}
              >
                {nameError ?? "What your crew will see in the sidebar."}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor={editing ? ids.address : undefined}
                  id={`${ids.address}-label`}
                  className="text-[12px] font-medium text-foreground"
                >
                  Address
                </label>
                {editing &&
                val.name.trim() &&
                slug !== slugifyName(val.name) ? (
                  <button
                    type="button"
                    onClick={matchName}
                    className={cn(
                      "rounded-1 text-[11px] text-cobalt-bright hover:underline",
                      FOCUS,
                    )}
                  >
                    Match name
                  </button>
                ) : null}
              </div>
              {editing ? (
                <div
                  className={cn(
                    inputBox,
                    fmtError || avail === "taken"
                      ? "border-danger"
                      : "border-hairline-strong",
                  )}
                >
                  <span className="shrink-0 pl-3 font-mono text-[12px] text-ink-3">
                    {addressPrefix}
                  </span>
                  <input
                    ref={setAddressInput}
                    id={ids.address}
                    value={slug}
                    maxLength={30}
                    autoComplete="off"
                    spellCheck={false}
                    readOnly={disabled || creating.state === "busy"}
                    aria-invalid={
                      fmtError || avail === "taken" ? true : undefined
                    }
                    aria-describedby={ids.addressMsg}
                    onChange={(e) => {
                      const next = e.currentTarget.value.toLowerCase();
                      setAddress(next, "typing");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape" && val.name.trim()) {
                        // Ours: back to following the name.
                        e.preventDefault();
                        matchName();
                      }
                    }}
                    className="h-full min-w-0 flex-1 bg-transparent pr-3 font-mono text-[12px] outline-none"
                  />
                </div>
              ) : (
                <div className="flex h-9 items-center gap-2 rounded-2 border border-dashed border-hairline-strong px-3">
                  <span className="sr-only">
                    {addressPrefix}
                    {slug || "not set yet"}
                  </span>
                  <span
                    aria-hidden
                    className="flex min-w-0 flex-1 items-center overflow-clip font-mono text-[12px] whitespace-nowrap"
                  >
                    <span aria-hidden className="shrink-0 text-ink-3">
                      {addressPrefix}
                    </span>
                    <span aria-hidden className="truncate text-foreground">
                      {Array.from(slug).map((ch, i) => (
                        <motion.span
                          key={`${i}-${ch}`}
                          className="inline-block"
                          initial={{
                            y: motionSafe ? -distances.nudge : 0,
                            opacity: motionSafe ? 0 : 1,
                          }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={
                            motionSafe
                              ? {
                                  y: springs.flick,
                                  opacity: { duration: durations.blink },
                                }
                              : { duration: 0 }
                          }
                        >
                          {ch}
                        </motion.span>
                      ))}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={editAddress}
                    aria-label="Edit address"
                    className={cn(
                      "-mr-1.5 inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                      FOCUS,
                    )}
                  >
                    <Pencil aria-hidden className="size-3.5" />
                  </button>
                </div>
              )}
              <p
                id={ids.addressMsg}
                className={cn(
                  "flex h-4 items-center gap-1.5 text-[11px]",
                  statusLine.tone,
                )}
              >
                <span
                  className="grid size-3.5 shrink-0 place-items-center"
                  aria-hidden
                >
                  <AnimatePresence initial={false}>
                    {statusLine.icon ? (
                      <motion.span
                        key={statusLine.icon}
                        className="[grid-area:1/1]"
                        initial={{ opacity: 0, scale: motionSafe ? 0.5 : 1 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={
                          motionSafe
                            ? {
                                scale: springs.snap,
                                opacity: { duration: durations.fast },
                              }
                            : { duration: durations.fast }
                        }
                      >
                        {statusLine.icon === "spin" ? (
                          <LoaderCircle className="size-3.5 motion-safe:animate-spin" />
                        ) : statusLine.icon === "check" ? (
                          <Check className="size-3.5" />
                        ) : (
                          <X className="size-3.5" />
                        )}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </span>
                <span className="truncate">{statusLine.text}</span>
              </p>
              <AnimatePresence initial={false}>
                {alternatives.length > 0 ? (
                  <motion.div
                    key="alts"
                    className="flex flex-wrap items-center gap-1.5"
                    initial={{
                      opacity: 0,
                      y: motionSafe ? -distances.nudge : 0,
                    }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe
                        ? {
                            y: springs.snap,
                            opacity: { duration: durations.fast },
                          }
                        : { duration: durations.fast }
                    }
                  >
                    <span className="text-[11px] text-ink-3">Try</span>
                    {alternatives.map((alt) => (
                      <button
                        key={alt}
                        type="button"
                        aria-label={`Use ${alt}`}
                        onClick={() => {
                          setEditing(true);
                          setAddress(alt, "pick");
                        }}
                        className={cn(
                          "inline-flex h-7 max-w-full items-center rounded-full border border-hairline-strong px-2.5 font-mono text-[11px] text-foreground transition-colors hover:bg-surface-2",
                          FOCUS,
                        )}
                      >
                        <span className="truncate">{alt}</span>
                      </button>
                    ))}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <div className="flex flex-col gap-1.5">
              <p
                id={ids.icon}
                className="text-[12px] font-medium text-foreground"
              >
                Icon
              </p>
              <div
                role="radiogroup"
                aria-labelledby={ids.icon}
                data-name-plate-group="icon"
                className="flex flex-wrap gap-1.5"
              >
                {icons.map((ic) => {
                  const on = ic.id === val.icon;
                  const Glyph = ic.icon;
                  return (
                    <button
                      key={ic.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={ic.label}
                      tabIndex={on ? 0 : -1}
                      data-name-plate-option={ic.id}
                      onClick={() => pick("icon", ic.id)}
                      onKeyDown={(e) =>
                        roving(e, icons, val.icon, "icon", "icon")
                      }
                      className={cn(
                        "inline-flex size-9 items-center justify-center rounded-2 border transition-colors",
                        on
                          ? "text-foreground"
                          : "border-hairline text-ink-3 hover:bg-surface-2 hover:text-foreground",
                        FOCUS,
                      )}
                      style={
                        on
                          ? {
                              borderColor: pigment,
                              backgroundColor: `color-mix(in oklab, ${pigment} 14%, transparent)`,
                            }
                          : undefined
                      }
                    >
                      <Glyph className="size-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <p
                id={ids.color}
                className="text-[12px] font-medium text-foreground"
              >
                Colour
              </p>
              <div
                role="radiogroup"
                aria-labelledby={ids.color}
                data-name-plate-group="color"
                className="flex flex-wrap gap-2"
              >
                {colors.map((c) => {
                  const on = c.id === val.color;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={c.label}
                      title={c.label}
                      tabIndex={on ? 0 : -1}
                      data-name-plate-option={c.id}
                      onClick={() => pick("color", c.id)}
                      onKeyDown={(e) =>
                        roving(e, colors, val.color, "color", "color")
                      }
                      className={cn(
                        "relative inline-flex size-8 items-center justify-center rounded-full",
                        FOCUS,
                      )}
                    >
                      <motion.span
                        aria-hidden
                        className="absolute inset-0 rounded-full border-2"
                        style={{ borderColor: c.value }}
                        initial={false}
                        animate={{ scale: on ? 1 : 0.6, opacity: on ? 1 : 0 }}
                        transition={
                          motionSafe
                            ? springs.snap
                            : { duration: durations.fast }
                        }
                      />
                      <span
                        aria-hidden
                        className="size-5 rounded-full shadow-[inset_0_0_0_1px_color-mix(in_oklab,black_14%,transparent)]"
                        style={{ backgroundColor: c.value }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <AnimatePresence initial={false}>
              {creating.state === "failed" ? (
                <motion.div
                  key="failed"
                  className="flex items-start gap-2 rounded-2 border border-danger/30 bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] px-3 py-2 text-[12px] text-danger"
                  initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.base, ease: easings.enter }}
                >
                  <TriangleAlert
                    aria-hidden
                    className="mt-0.5 size-3.5 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    Could not create the workspace: {creating.reason}. Your
                    details are kept.
                  </span>
                </motion.div>
              ) : created ? (
                <motion.div
                  key="done"
                  className="flex items-start gap-2 rounded-2 border border-success/30 bg-[color-mix(in_oklab,var(--success)_8%,transparent)] px-3 py-2 text-[12px] text-success"
                  initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.base, ease: easings.enter }}
                >
                  <Check aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 break-words">
                    {val.name.trim()} is ready at {addressPrefix}
                    {slug}
                  </span>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="submit"
                aria-disabled={
                  disabled || creating.state === "busy" || created || undefined
                }
                aria-busy={creating.state === "busy" || undefined}
                className={cn(
                  "inline-flex h-9 min-w-[10.5rem] items-center justify-center gap-1.5 rounded-2 px-4 text-xs font-medium text-primary-foreground transition-opacity aria-disabled:opacity-60",
                  FOCUS,
                )}
                style={{ backgroundColor: ink }}
              >
                {creating.state === "busy" ? (
                  <>
                    <LoaderCircle
                      aria-hidden
                      className="size-3.5 motion-safe:animate-spin"
                    />
                    Creating
                  </>
                ) : creating.state === "failed" ? (
                  <>
                    <RotateCcw aria-hidden className="size-3.5" />
                    Try again
                  </>
                ) : created ? (
                  <>
                    <Check aria-hidden className="size-3.5" />
                    Created
                  </>
                ) : (
                  "Create workspace"
                )}
              </button>
            </div>
          </form>

          {narrow ? null : (
            <div className="hidden @min-[40rem]/name-plate:block">
              {preview}
            </div>
          )}
        </div>
      </div>

      <p className="sr-only">
        Preview: {named ? val.name.trim() : "untitled"},{" "}
        {icons.find((i) => i.id === val.icon)?.label ?? "no"} icon,{" "}
        {colors.find((c) => c.id === val.color)?.label ?? "default colour"}.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </section>
  );
}
