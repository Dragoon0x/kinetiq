"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ArrowRight,
  KeyRound,
  LoaderCircle,
  Mail,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type OrgDiscoveryMethod = "sso" | "password" | "code";

export type OrgDiscoveryOrg = {
  id: string;
  /** The company's name, shown on the badge. */
  name: string;
  /** Email domains that belong to it, lower case, e.g. "basinworks.io". */
  domains: string[];
  /** How its people may sign in. Single sign-on first when it is allowed. */
  methods: OrgDiscoveryMethod[];
  /** The sign-in page the button continues to, e.g. "Basinworks ID". */
  provider?: string;
  /** Any CSS colour for the drawn mark. Defaults to a hue seeded from the id. */
  tint?: string;
};

export type OrgDiscoveryContinue = {
  email: string;
  method: "sso" | "password";
  /** The recognised company, or null for an unknown domain. */
  org: OrgDiscoveryOrg | null;
  /** Only for the password method. */
  password?: string;
};

export type OrgDiscoveryBadgeStyle = "chip" | "tag" | "mark";
export type OrgDiscoveryDensity = "compact" | "cozy" | "roomy";

export type OrgDiscoveryProps = {
  /** Companies with their own sign-in, found by email domain. @default defaultOrgDiscoveryOrgs */
  orgs?: OrgDiscoveryOrg[];
  /** Looks a domain up somewhere else; resolve null for unknown. A rejection falls back quietly to the password. @default matches `orgs` */
  lookup?: (domain: string) => Promise<OrgDiscoveryOrg | null>;
  /** Quiet time after typing before a domain is looked up, ms. @default 280 */
  lookupDelay?: number;
  /** Controlled email. */
  value?: string;
  /** Initial email when uncontrolled. @default "" */
  defaultValue?: string;
  /** Fires from every keystroke in the email field. */
  onValueChange?: (email: string) => void;
  /** The main button was pressed. Return a promise to hold it busy; a rejection keeps the step with its message. */
  onContinue?: (details: OrgDiscoveryContinue) => void | Promise<void>;
  /** "Email me a sign-in code" or "Use a password instead" was pressed. */
  onUseOtherMethod?: (method: "code" | "password", email: string) => void;
  /** "Forgot password?" was pressed. */
  onForgotPassword?: (email: string) => void;
  /** Fires when the recognised company changes, from the lookup or the keystroke that changed it. */
  onOrgChange?: (org: OrgDiscoveryOrg | null) => void;
  /** A message from the host about the last attempt, shown under the field it concerns. */
  error?: string;
  /** Your product's name. @default "Waylight" */
  productName?: string;
  /** The heading. @default "Sign in to {productName}" */
  title?: string;
  /** How the lifted domain looks: a pill with the mark and name, a tag with an SSO segment, or the mark alone. @default "chip" */
  badgeStyle?: OrgDiscoveryBadgeStyle;
  /** Field height, gaps and type size. @default "cozy" */
  density?: OrgDiscoveryDensity;
  /** The wash, the tether under the domain, the main button and links, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Show the explanatory side panel when there is room (40rem of container). @default true */
  showAside?: boolean;
  /** "Create an account" was pressed under the form. */
  onCreateAccount?: () => void;
  /** Focus the email field on mount. @default false */
  autoFocus?: boolean;
  /** Nothing can be typed or pressed. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const hueTint = (hue: number) =>
  `oklch(from var(--accent-bright) 0.72 0.1 ${hue})`;

/** Three companies with their own sign-in; Coldbrook also allows passwords. */
export const defaultOrgDiscoveryOrgs: OrgDiscoveryOrg[] = [
  {
    id: "basinworks",
    name: "Basinworks",
    domains: ["basinworks.io", "basinworks.co"],
    methods: ["sso"],
    provider: "Basinworks ID",
    tint: hueTint(178),
  },
  {
    id: "coldbrook",
    name: "Coldbrook",
    domains: ["coldbrook.co", "coldbrookbank.co"],
    methods: ["sso", "password"],
    provider: "Coldbrook Access",
    tint: hueTint(232),
  },
  {
    id: "gaugeworks",
    name: "Gaugeworks",
    domains: ["gaugeworks.dev"],
    methods: ["sso", "code"],
    provider: "Gaugeworks Login",
    tint: hueTint(64),
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

/** The main button's fill: the accent, a touch deeper so white reads on it. */
const FILL = "color-mix(in oklab, var(--od-accent) 86%, black)";
/** Ink on that fill: dark on a light accent, near white on a deep one. */
const ON_ACCENT = `oklch(from ${FILL} clamp(0.18, (0.7 - l) * 100, 0.99) 0.02 h)`;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const r2 = (v: number) => Math.round(v * 100) / 100;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};

const tintOf = (org: OrgDiscoveryOrg) =>
  org.tint ?? hueTint(hash(org.id) % 360);

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const EMAIL = /^[^\s@]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

/** Splits an address where the domain starts, keeping the typed text. */
const split = (email: string) => {
  const at = email.lastIndexOf("@");
  if (at < 0) return { before: email, raw: "", domain: "" };
  const raw = email.slice(at + 1);
  return {
    before: email.slice(0, at + 1),
    raw,
    domain: raw.trim().toLowerCase(),
  };
};

const matchLocal = (orgs: OrgDiscoveryOrg[], domain: string) =>
  orgs.find((o) => o.domains.some((d) => d.toLowerCase() === domain)) ?? null;

const DENSITY: Record<
  OrgDiscoveryDensity,
  { field: number; text: string; gap: string; pad: string; title: string }
> = {
  compact: {
    field: 38,
    text: "text-[13px]",
    gap: "gap-3",
    pad: "p-5",
    title: "text-[17px] leading-6",
  },
  cozy: {
    field: 42,
    text: "text-[14px]",
    gap: "gap-4",
    pad: "p-6",
    title: "text-[19px] leading-7",
  },
  roomy: {
    field: 46,
    text: "text-[15px]",
    gap: "gap-5",
    pad: "p-7",
    title: "text-[21px] leading-7",
  },
};

type Lookup = {
  state: "found" | "none" | "failed";
  org: OrgDiscoveryOrg | null;
};
type Badge = { org: OrgDiscoveryOrg; seq: number };
type Rect = { x: number; y: number; w: number; h: number };

/* ----------------------------------------------------------------------- */
/*                               Small parts                                */
/* ----------------------------------------------------------------------- */

function OrgMark({
  org,
  size,
  round = false,
}: {
  org: OrgDiscoveryOrg;
  size: number;
  round?: boolean;
}) {
  const tint = tintOf(org);
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center font-semibold",
        round ? "rounded-full" : "rounded-[4px]",
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(8, Math.round(size * 0.5)),
        backgroundColor: tint,
        color: `oklch(from ${tint} 0.26 0.05 h)`,
      }}
    >
      {org.name.charAt(0).toUpperCase()}
    </span>
  );
}

function BadgeFace({
  org,
  badgeStyle,
}: {
  org: OrgDiscoveryOrg;
  badgeStyle: OrgDiscoveryBadgeStyle;
}) {
  if (badgeStyle === "mark") {
    return (
      <span className="flex size-[26px] items-center justify-center">
        <OrgMark org={org} size={18} />
      </span>
    );
  }
  if (badgeStyle === "tag") {
    return (
      <span className="flex h-[22px] items-stretch whitespace-nowrap">
        <span className="flex items-center gap-1.5 pr-2 pl-1">
          <OrgMark org={org} size={14} />
          <span className="text-[11.5px] font-medium text-foreground">
            {org.name}
          </span>
        </span>
        <span className="flex items-center border-l border-hairline px-1.5 font-mono text-[9px] tracking-[0.08em] text-[color:var(--od-accent)] uppercase">
          SSO
        </span>
      </span>
    );
  }
  return (
    <span className="flex h-[22px] items-center gap-1.5 pr-2.5 pl-1 whitespace-nowrap">
      <OrgMark org={org} size={14} round />
      <span className="text-[11.5px] font-medium text-foreground">
        {org.name}
      </span>
    </span>
  );
}

/** A small invented product mark: a waypoint with a beam leaving it. */
function ProductMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 28 28"
      width={size}
      height={size}
      className="shrink-0"
    >
      <rect width={28} height={28} rx={8} className="fill-foreground" />
      <circle cx={10} cy={18} r={3.2} className="fill-background" />
      <path
        d="M12.5 15.5 L21 7"
        strokeWidth={2.4}
        strokeLinecap="round"
        className="stroke-background"
        opacity={0.75}
      />
      <circle cx={21} cy={7} r={1.6} className="fill-background" />
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

/**
 * A sign-in step that finds a company's own sign-in from the email domain.
 * As you type, the domain is looked up; once it is recognised, a wash
 * appears behind the domain's own letters in the field — measured from a
 * hidden mirror of the text — and lifts off it, rising onto the field's top
 * edge and growing into a badge with the company's mark on `springs.glide`,
 * its shadow swelling in flight and settling as it lands. A faint underline
 * stays under the domain, tethering it. The main button's words roll to
 * "Continue with single sign-on" on `springs.snap` and the password folds
 * away to its measured height on `springs.glide`. Change the address and the
 * badge drops back into the field, onto where the domain now starts.
 *
 * It is a real form: the field announces the change once, unknown domains
 * keep the password and code options, failed lookups fall back quietly, and
 * errors stay on the field they concern. Under reduced motion nothing
 * travels — the badge fades in and out at its resting place.
 */
export function OrgDiscovery({
  orgs = defaultOrgDiscoveryOrgs,
  lookup,
  lookupDelay = 280,
  value,
  defaultValue = "",
  onValueChange,
  onContinue,
  onUseOtherMethod,
  onForgotPassword,
  onOrgChange,
  onCreateAccount,
  error,
  productName = "Waylight",
  title,
  badgeStyle = "chip",
  density = "cozy",
  accent = "var(--accent-bright)",
  showAside = true,
  autoFocus = false,
  disabled = false,
  className,
}: OrgDiscoveryProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const d = DENSITY[density] ?? DENSITY.cozy;
  const emailId = `${uid}-email`;
  const passwordId = `${uid}-password`;

  const [own, setOwn] = React.useState(defaultValue);
  const email = value ?? own;
  const { before, raw, domain } = split(email);
  const validDomain = DOMAIN.test(domain);

  const [results, setResults] = React.useState<Record<string, Lookup>>({});
  const current = validDomain ? results[domain] : undefined;
  const pending = validDomain && !current;
  const org = current?.state === "found" ? current.org : null;
  const failed = current?.state === "failed";

  const [password, setPassword] = React.useState("");
  const [preferPassword, setPreferPassword] = React.useState<string | null>(
    null,
  );
  const sso =
    Boolean(org) &&
    !(org && preferPassword === org.id && org.methods.includes("password"));
  const [submitting, setSubmitting] = React.useState(false);
  const [localError, setLocalError] = React.useState<{
    field: "email" | "password";
    message: string;
  } | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const [badge, setBadge] = React.useState<Badge | null>(null);
  const dropping = badge !== null && badge.org.id !== org?.id;

  const fieldRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const passwordRef = React.useRef<HTMLInputElement | null>(null);
  const submitRef = React.useRef<HTMLButtonElement | null>(null);
  const domainSpan = React.useRef<HTMLSpanElement | null>(null);
  const measureBadge = React.useRef<HTMLSpanElement | null>(null);
  const lookupRef = React.useRef(lookup);
  const reported = React.useRef<string | null>(null);
  const seq = React.useRef(0);
  const placed = React.useRef(false);
  /** True while a badge rests on the edge, so a resize can re-seat it. */
  const resting = React.useRef(false);

  React.useEffect(() => {
    lookupRef.current = lookup;
  });

  // The flying badge: one box whose place and size are motion values, a wash
  // layer and a badge layer cross-fading inside it.
  const bx = useMotionValue(0);
  const by = useMotionValue(0);
  const bw = useMotionValue(0);
  const bh = useMotionValue(0);
  const face = useMotionValue(0);
  const shown = useMotionValue(0);
  const lift = useMotionValue(0);
  const washOpacity = useTransform([face, shown], ([f, s]) =>
    r2((1 - (f as number)) * (s as number)),
  );
  const faceOpacity = useTransform([face, shown], ([f, s]) =>
    r2((f as number) * (s as number)),
  );
  const shadow = useTransform(
    lift,
    (l) =>
      `0 ${r2(1 + l * 7)}px ${r2(2 + l * 14)}px color-mix(in oklab, var(--foreground) ${Math.round(8 + l * 14)}%, transparent)`,
  );
  const tetherX = useMotionValue(0);
  const tetherW = useMotionValue(0);
  const tetherO = useMotionValue(0);
  const tetherOpacity = useTransform(tetherO, (o) => r2(o * 0.55));

  // Looks the domain up once the typing pauses. Stale answers are dropped by
  // sequence, and every timer dies with the keystroke that replaced it.
  React.useEffect(() => {
    if (!validDomain || results[domain]) return;
    const mine = ++seq.current;
    const settle = (next: Lookup) => {
      if (mine !== seq.current) return;
      setResults((r) => ({ ...r, [domain]: next }));
      const id = next.org?.id ?? null;
      if (id !== reported.current) {
        reported.current = id;
        onOrgChange?.(next.org);
        const found = next.org;
        if (found) {
          setAnnouncement(
            `${found.name} found. ${
              found.methods.includes("sso")
                ? "Continue with single sign-on."
                : ""
            }`.trim(),
          );
          setBadge((b) => ({ org: found, seq: (b?.seq ?? 0) + 1 }));
        } else {
          setAnnouncement("Password and code options are back.");
        }
      }
    };
    const t = window.setTimeout(() => {
      const ask = lookupRef.current;
      if (!ask) {
        const found = matchLocal(orgs, domain);
        settle({ state: found ? "found" : "none", org: found });
        return;
      }
      ask(domain).then(
        (found) => settle({ state: found ? "found" : "none", org: found }),
        () => settle({ state: "failed", org: null }),
      );
    }, lookupDelay);
    return () => window.clearTimeout(t);
    // onOrgChange is read when the answer lands; it never restarts a lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, validDomain, results, orgs, lookupDelay]);

  /** Where the domain's letters sit inside the field, as a box. */
  const domainRect = React.useCallback((): Rect | null => {
    const field = fieldRef.current;
    const input = inputRef.current;
    const span = domainSpan.current;
    if (!field || !input || !span) return null;
    const padding = parseFloat(getComputedStyle(input).paddingLeft) || 12;
    const lineH = 20;
    const x = input.offsetLeft + padding + span.offsetLeft - input.scrollLeft;
    const w = Math.max(10, span.offsetWidth);
    const maxX = field.clientWidth - 8;
    return {
      x: r2(Math.min(maxX - 10, x) - 3),
      y: r2((field.clientHeight - lineH) / 2),
      w: r2(Math.min(w, maxX - x) + 6),
      h: lineH,
    };
  }, []);

  /** Where the badge rests: straddling the field's top edge, at the right. */
  const restRect = React.useCallback((): Rect | null => {
    const field = fieldRef.current;
    const probe = measureBadge.current;
    if (!field || !probe) return null;
    const w = Math.min(probe.offsetWidth, field.clientWidth - 24);
    const h = probe.offsetHeight;
    return {
      x: r2(field.clientWidth - 10 - w),
      y: r2(-Math.round(h / 2) - 1),
      w: r2(w),
      h,
    };
  }, []);

  // The tether follows the domain as the address is edited or scrolled.
  React.useEffect(() => {
    const input = inputRef.current;
    const place = () => {
      const r = domainRect();
      if (!r) return;
      tetherX.set(r.x + 3);
      tetherW.set(Math.max(0, r.w - 6));
      if (resting.current) {
        const rest = restRect();
        if (rest) {
          bx.set(rest.x);
          by.set(rest.y);
          bw.set(rest.w);
          bh.set(rest.h);
        }
      }
    };
    place();
    input?.addEventListener("scroll", place, { passive: true });
    const ro = new ResizeObserver(place);
    if (fieldRef.current) ro.observe(fieldRef.current);
    return () => {
      input?.removeEventListener("scroll", place);
      ro.disconnect();
    };
  }, [email, domainRect, restRect, tetherW, tetherX, bx, by, bw, bh]);

  // The lift and the drop. Everything is written from one plain number, so
  // the flight never waits on a value bound to a box that has only just
  // mounted, and an interrupted flight resumes from where the box is.
  React.useEffect(() => {
    if (!badge) return;
    const field = fieldRef.current;
    if (!field) return;
    let controls: AnimationPlaybackControls | null = null;
    const wash = domainRect();
    const rest = restRect();
    if (!wash || !rest) return;
    const here: Rect = placed.current
      ? { x: bx.get(), y: by.get(), w: bw.get(), h: bh.get() }
      : wash;
    const target = dropping ? wash : rest;
    const write = (r: Rect) => {
      bx.set(r2(r.x));
      by.set(r2(r.y));
      bw.set(r2(r.w));
      bh.set(r2(r.h));
    };
    resting.current = false;
    const finish = () => {
      if (dropping) {
        placed.current = false;
        shown.set(0);
        lift.set(0);
        setBadge((b) => (b && b.seq === badge.seq ? null : b));
      } else {
        resting.current = true;
        tetherO.set(1);
      }
    };
    if (!motionSafe) {
      write(rest);
      face.set(1);
      lift.set(0);
      placed.current = true;
      tetherO.set(dropping ? 0 : 1);
      controls = animate(shown.get(), dropping ? 0 : 1, {
        duration: durations.fast,
        ease: easings.enter,
        onUpdate: (v) => shown.set(r2(v)),
        onComplete: finish,
      });
      return () => controls?.stop();
    }
    const startFace = face.get();
    const startLift = lift.get();
    if (!placed.current) {
      write(wash);
      face.set(0);
      shown.set(0);
    }
    placed.current = true;
    tetherO.set(0);
    const startShown = shown.get();
    controls = animate(0, 1, {
      ...springs.glide,
      onUpdate: (p) => {
        const t = clamp01(p);
        write({
          x: lerp(here.x, target.x, p),
          y: lerp(here.y, target.y, p),
          w: lerp(here.w, target.w, t),
          h: lerp(here.h, target.h, t),
        });
        // The wash shows first, then the badge's face comes up through it;
        // a drop fades the face as it falls and the wash as it lands.
        if (dropping) {
          face.set(r2(lerp(startFace, 0, clamp01(t * 1.6))));
          shown.set(r2(lerp(startShown, 0, clamp01((t - 0.55) / 0.45))));
        } else {
          shown.set(r2(lerp(startShown, 1, clamp01(t * 4))));
          face.set(r2(lerp(startFace, 1, clamp01((t - 0.2) / 0.5))));
        }
        // Lifted off the surface mid-flight, settled at either end.
        lift.set(r2(lerp(startLift, 0, t) + Math.sin(Math.PI * t) * 1));
      },
      onComplete: () => {
        write(target);
        lift.set(0);
        finish();
      },
    });
    return () => controls?.stop();
    // Re-measured on every flight; the rects are read when it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [badge?.seq, dropping, motionSafe, badgeStyle]);

  const report = (next: OrgDiscoveryOrg | null) => {
    const id = next?.id ?? null;
    if (id === reported.current) return;
    reported.current = id;
    onOrgChange?.(next);
  };

  const setEmail = (next: string) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    setLocalError(null);
    const nextDomain = split(next).domain;
    if (org && !org.domains.some((dd) => dd.toLowerCase() === nextDomain)) {
      report(null);
      setAnnouncement(
        `${org.name} single sign-on no longer applies. Password and code options are back.`,
      );
    }
    // A failed lookup is tried again the next time its domain is typed.
    setResults((r) => {
      let changed = false;
      const out: Record<string, Lookup> = {};
      for (const [k, v] of Object.entries(r)) {
        if (v.state === "failed" && k !== nextDomain) changed = true;
        else out[k] = v;
      }
      return changed ? out : r;
    });
  };

  const usePassword = () => {
    if (!org) return;
    setPreferPassword(org.id);
    setAnnouncement("Password sign-in.");
    onUseOtherMethod?.("password", email);
    window.requestAnimationFrame(() => passwordRef.current?.focus());
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled || submitting) return;
    if (!EMAIL.test(email.trim())) {
      setLocalError({
        field: "email",
        message: "Enter your work email, like name@company.com.",
      });
      inputRef.current?.focus();
      return;
    }
    const method = sso ? "sso" : "password";
    if (method === "password" && !password) {
      setLocalError({ field: "password", message: "Enter your password." });
      passwordRef.current?.focus();
      return;
    }
    setLocalError(null);
    setAnnouncement(
      method === "sso" && org
        ? `Opening ${org.provider ?? org.name}.`
        : "Signing in.",
    );
    const result = onContinue?.({
      email: email.trim(),
      method,
      org,
      password: method === "password" ? password : undefined,
    });
    if (result && typeof (result as Promise<void>).then === "function") {
      setSubmitting(true);
      (result as Promise<void>).then(
        () => setSubmitting(false),
        (reason: unknown) => {
          setSubmitting(false);
          const message =
            reason instanceof Error && reason.message
              ? reason.message
              : "That didn’t work. Try again.";
          setLocalError({
            field: method === "password" ? "password" : "email",
            message,
          });
          setAnnouncement(message);
        },
      );
    }
  };

  const errorFor = (field: "email" | "password") => {
    if (localError?.field === field) return localError.message;
    if (!error || localError) return undefined;
    return (sso ? "email" : "password") === field ? error : undefined;
  };
  const emailError = errorFor("email");
  const passwordError = errorFor("password");

  const heading = title ?? `Sign in to ${productName}`;
  const provider = org?.provider ?? org?.name ?? "";
  const canCode = !org || org.methods.includes("code");
  const otherPassword = Boolean(org?.methods.includes("password"));
  const shownOrg = badge?.org ?? null;

  const enterSection = {
    initial: { height: 0, opacity: 0 },
    animate: { height: "auto", opacity: 1 },
    exit: { height: 0, opacity: 0, transition: exitFor(durations.base) },
    transition: motionSafe
      ? {
          height: springs.glide,
          opacity: { duration: durations.base, ease: easings.enter },
        }
      : { duration: 0 },
  } as const;

  const linkClass = cn(
    "rounded-1 text-[12px] font-medium text-[color:var(--od-accent)] underline-offset-2 hover:underline",
    FOCUS,
  );

  const form = (
    <form
      noValidate
      onSubmit={submit}
      aria-labelledby={`${uid}-title`}
      className={cn("flex min-w-0 flex-col", d.gap, d.pad)}
    >
      <div className="flex flex-col gap-1">
        <span
          className={cn(
            "flex items-center gap-2",
            showAside && "@min-[40rem]:hidden",
          )}
        >
          <ProductMark size={22} />
          <span className="text-[13px] font-semibold">{productName}</span>
        </span>
        <h2
          id={`${uid}-title`}
          className={cn(
            "mt-2 font-semibold",
            showAside && "@min-[40rem]:mt-0",
            d.title,
          )}
        >
          {heading}
        </h2>
        <p className="text-[12.5px] leading-5 text-ink-2">
          Use your work email. If your company signs in its own way, we’ll take
          you there.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={emailId}
          className="text-[12px] leading-4 font-medium text-ink-2"
        >
          Work email
        </label>
        <div
          ref={fieldRef}
          className={cn(
            "relative rounded-2 border bg-surface-0 transition-colors",
            emailError
              ? "border-danger"
              : "border-input focus-within:border-[color-mix(in_oklab,var(--od-accent)_60%,var(--input))]",
            "focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-ring focus-within:outline-solid",
          )}
          style={{ height: d.field }}
        >
          {/* A hidden copy of the text, in the field's own type, so the
              domain's letters can be found to the pixel. */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none invisible absolute top-0 left-0 font-sans whitespace-pre",
              d.text,
            )}
          >
            {before}
            <span ref={domainSpan}>{raw}</span>
          </span>
          <span
            ref={measureBadge}
            aria-hidden
            className="pointer-events-none invisible absolute top-0 left-0 inline-flex border"
          >
            {shownOrg ? (
              <BadgeFace org={shownOrg} badgeStyle={badgeStyle} />
            ) : null}
          </span>

          {shownOrg ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 z-20"
              style={{ x: bx, y: by, width: bw, height: bh }}
            >
              <motion.span
                className="absolute inset-0 rounded-1 bg-[color-mix(in_oklab,var(--od-accent)_20%,transparent)]"
                style={{ opacity: washOpacity }}
              />
              <motion.span
                className={cn(
                  "absolute inset-0 flex items-center overflow-hidden border border-hairline-strong bg-popover",
                  badgeStyle === "chip" ? "rounded-full" : "rounded-2",
                )}
                style={{ opacity: faceOpacity, boxShadow: shadow }}
              >
                <BadgeFace org={shownOrg} badgeStyle={badgeStyle} />
              </motion.span>
            </motion.span>
          ) : null}

          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 z-0",
              (!org || dropping) && "hidden",
            )}
          >
            <motion.span
              className="absolute top-1/2 left-0 h-[1.5px] rounded-full bg-[color:var(--od-accent)]"
              style={{
                x: tetherX,
                width: tetherW,
                y: 10,
                opacity: tetherOpacity,
              }}
            />
          </span>

          <input
            ref={inputRef}
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete="username"
            spellCheck={false}
            autoFocus={autoFocus}
            disabled={disabled}
            value={email}
            placeholder="name@company.com"
            aria-invalid={emailError ? true : undefined}
            aria-describedby={`${uid}-email-note${emailError ? ` ${uid}-email-error` : ""}`}
            onChange={(event) => {
              const next = event.currentTarget.value;
              setEmail(next);
            }}
            className={cn(
              "relative z-10 size-full rounded-2 bg-transparent pr-10 pl-3 font-sans text-foreground outline-none placeholder:text-ink-3 disabled:cursor-not-allowed",
              d.text,
            )}
          />

          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-3 z-10 flex -translate-y-1/2 items-center gap-[3px]"
          >
            {pending
              ? [0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="size-[4px] rounded-full bg-ink-3"
                    initial={{ opacity: 0.3 }}
                    animate={
                      motionSafe ? { opacity: [0.3, 1, 0.3] } : { opacity: 0.6 }
                    }
                    transition={
                      motionSafe
                        ? {
                            duration: 0.9,
                            ease: easings.move,
                            repeat: Infinity,
                            delay: i * 0.15,
                          }
                        : { duration: 0 }
                    }
                  />
                ))
              : null}
          </span>
        </div>
        <span id={`${uid}-email-note`} className="sr-only">
          {org ? `${org.name} uses single sign-on through ${provider}.` : ""}
        </span>
        <AnimatePresence initial={false}>
          {emailError ? (
            <motion.p
              key="email-error"
              id={`${uid}-email-error`}
              role="alert"
              {...enterSection}
              className="flex items-start gap-1.5 overflow-hidden text-[12px] leading-4 text-danger"
            >
              <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
              {emailError}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      {/* The two ways on share one place: the section that leaves folds to
          nothing while the one that arrives unfolds, so the card glides. */}
      <div className="flex flex-col">
        <AnimatePresence initial={false}>
          {sso && org ? (
            <motion.div key="sso" {...enterSection} className="overflow-hidden">
              <div className="flex items-start gap-3 rounded-3 border border-hairline bg-surface-1 p-3">
                <OrgMark org={org} size={28} />
                <p className="text-[12.5px] leading-5 text-ink-2">
                  <span className="font-medium text-foreground">
                    {org.name}
                  </span>{" "}
                  signs in with {provider}. You’ll continue on its page and come
                  straight back.
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="password"
              {...enterSection}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-1.5 pb-0.5">
                <span className="flex items-center justify-between gap-2">
                  <label
                    htmlFor={passwordId}
                    className="text-[12px] leading-4 font-medium text-ink-2"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => onForgotPassword?.(email)}
                    disabled={disabled}
                    className={linkClass}
                  >
                    Forgot password?
                  </button>
                </span>
                <input
                  ref={passwordRef}
                  id={passwordId}
                  type="password"
                  autoComplete="current-password"
                  disabled={disabled}
                  value={password}
                  aria-invalid={passwordError ? true : undefined}
                  aria-describedby={
                    passwordError ? `${uid}-password-error` : undefined
                  }
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setPassword(next);
                    setLocalError(null);
                  }}
                  className={cn(
                    "w-full rounded-2 border bg-surface-0 px-3 text-foreground transition-colors placeholder:text-ink-3 disabled:cursor-not-allowed",
                    "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
                    passwordError ? "border-danger" : "border-input",
                    d.text,
                  )}
                  style={{ height: d.field }}
                />
                {passwordError ? (
                  <p
                    id={`${uid}-password-error`}
                    role="alert"
                    className="flex items-start gap-1.5 text-[12px] leading-4 text-danger"
                  >
                    <TriangleAlert
                      aria-hidden
                      className="mt-px size-3.5 shrink-0"
                    />
                    {passwordError}
                  </p>
                ) : failed ? (
                  <p className="text-[11.5px] leading-4 text-ink-3">
                    Couldn’t check for company sign-in. You can still use your
                    password.
                  </p>
                ) : null}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-col gap-2.5">
        <button
          ref={submitRef}
          type="submit"
          aria-disabled={disabled || submitting || undefined}
          aria-busy={submitting || undefined}
          className={cn(
            "relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-2 px-4 text-[13.5px] font-medium transition-[filter] hover:brightness-110",
            FOCUS,
            (disabled || submitting) && "cursor-default opacity-80",
          )}
          style={{
            height: d.field,
            backgroundColor: FILL,
            color: ON_ACCENT,
          }}
        >
          <span className="relative grid h-5 flex-1 items-center justify-items-center overflow-hidden [grid-template-areas:'a']">
            <motion.span
              aria-hidden={sso || undefined}
              className="flex items-center gap-2 whitespace-nowrap [grid-area:a]"
              initial={false}
              animate={{
                y: sso && motionSafe ? -14 : 0,
                opacity: sso ? 0 : 1,
              }}
              transition={
                motionSafe ? springs.snap : { duration: durations.fast }
              }
            >
              {submitting && !sso ? (
                <LoaderCircle
                  aria-hidden
                  className={cn("size-4", motionSafe && "animate-spin")}
                />
              ) : null}
              {submitting && !sso ? "Signing in…" : "Sign in"}
              {!submitting ? (
                <ArrowRight aria-hidden className="size-4" />
              ) : null}
            </motion.span>
            <motion.span
              aria-hidden={!sso || undefined}
              className="flex max-w-full items-center gap-2 [grid-area:a]"
              initial={false}
              animate={{
                y: !sso && motionSafe ? 14 : 0,
                opacity: sso ? 1 : 0,
              }}
              transition={
                motionSafe ? springs.snap : { duration: durations.fast }
              }
            >
              {org ? (
                submitting && sso ? (
                  <LoaderCircle
                    aria-hidden
                    className={cn(
                      "size-4 shrink-0",
                      motionSafe && "animate-spin",
                    )}
                  />
                ) : (
                  <OrgMark org={org} size={16} />
                )
              ) : null}
              <span className="truncate">
                {submitting && sso ? (
                  `Opening ${provider}…`
                ) : (
                  <>
                    <span className="hidden @min-[25rem]:inline">
                      Continue with single sign-on
                    </span>
                    <span className="@min-[25rem]:hidden">
                      Continue with SSO
                    </span>
                  </>
                )}
              </span>
            </motion.span>
          </span>
        </button>

        {sso && otherPassword ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.base, ease: easings.enter }}
            className="flex justify-center"
          >
            <button
              type="button"
              onClick={usePassword}
              disabled={disabled}
              className={linkClass}
            >
              Use a password instead
            </button>
          </motion.div>
        ) : org && !sso && org.methods.includes("sso") ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => {
                setPreferPassword(null);
                window.requestAnimationFrame(() => submitRef.current?.focus());
                setAnnouncement("Single sign-on.");
              }}
              disabled={disabled}
              className={linkClass}
            >
              Use single sign-on instead
            </button>
          </div>
        ) : null}

        {!sso && canCode ? (
          <>
            <div
              aria-hidden
              className="flex items-center gap-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            >
              <span className="h-px flex-1 bg-hairline" />
              or
              <span className="h-px flex-1 bg-hairline" />
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                if (!EMAIL.test(email.trim())) {
                  setLocalError({
                    field: "email",
                    message:
                      "Enter your work email first, like name@company.com.",
                  });
                  inputRef.current?.focus();
                  return;
                }
                onUseOtherMethod?.("code", email.trim());
              }}
              className={cn(
                "inline-flex w-full items-center justify-center gap-2 rounded-2 border border-input bg-card px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60",
                FOCUS,
              )}
              style={{ height: d.field - 4 }}
            >
              <Mail aria-hidden className="size-4 text-ink-2" />
              Email me a sign-in code
            </button>
          </>
        ) : null}
      </div>

      <p className="text-center text-[12px] text-ink-3">
        New to {productName}?{" "}
        <button
          type="button"
          onClick={() => onCreateAccount?.()}
          disabled={disabled}
          className={linkClass}
        >
          Create an account
        </button>
      </p>
    </form>
  );

  return (
    <div
      className={cn("@container relative w-full text-foreground", className)}
      style={{ "--od-accent": accent } as React.CSSProperties}
    >
      <div
        className={cn(
          "mx-auto grid w-full max-w-[56rem] overflow-hidden rounded-4 border border-hairline bg-card",
          showAside
            ? "grid-cols-1 @min-[40rem]:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]"
            : "grid-cols-1",
        )}
      >
        {showAside ? (
          <aside className="hidden flex-col justify-between gap-6 border-r border-hairline bg-surface-1 p-6 @min-[40rem]:flex">
            <div className="flex flex-col gap-4">
              <span className="flex items-center gap-2">
                <ProductMark />
                <span className="text-[14px] font-semibold">{productName}</span>
              </span>
              <div className="flex flex-col gap-1.5">
                <p className="text-[15px] leading-5 font-semibold">
                  One address, the right door
                </p>
                <p className="text-[12.5px] leading-5 text-ink-2">
                  Teams whose company signs in its own way go straight to that
                  page. Everyone else uses a password or a one-time code.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                Single sign-on
              </span>
              <ul role="list" className="flex flex-col gap-1.5">
                {orgs
                  .filter((o) => o.methods.includes("sso"))
                  .slice(0, 4)
                  .map((o) => (
                    <li
                      key={o.id}
                      className={cn(
                        "flex items-center gap-2 text-[12px] transition-colors",
                        org?.id === o.id ? "text-foreground" : "text-ink-2",
                      )}
                    >
                      <OrgMark org={o} size={16} />
                      <span className="shrink-0">{o.name}</span>
                      <span className="min-w-0 truncate font-mono text-[10.5px] text-ink-3">
                        @{o.domains[0] ?? ""}
                      </span>
                    </li>
                  ))}
              </ul>
              <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
                <KeyRound aria-hidden className="size-3" />
                Passwords never leave this page.
              </span>
            </div>
          </aside>
        ) : null}
        {form}
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
