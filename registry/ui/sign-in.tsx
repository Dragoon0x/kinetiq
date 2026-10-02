"use client";

import * as React from "react";

import {
  ArrowLeft,
  Building2,
  Check,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  LoaderCircle,
  Mail,
  TriangleAlert,
} from "lucide-react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SignInStep = "email" | "method" | "code" | "password" | "welcome";
/** What follows the email: a choice of method, a code, or a password. */
export type SignInSteps = "choose" | "code" | "password";
export type SignInProviderIcon = "building" | "fingerprint" | "key";
export type SignInProvider = {
  id: string;
  /** The button's text: say what it does, e.g. "Continue with SSO". Never a company. */
  label: string;
  icon?: SignInProviderIcon;
};
/** Who signed in, as the host knows them. */
export type SignInAccount = { email?: string; name?: string };
/** The brand panel beside the form from 640px wide. */
export type SignInAside = {
  heading: string;
  body: string;
  points: string[];
  /** Shown from 960px wide. */
  quote?: { text: string; by: string };
};

export type SignInProps = {
  /** What follows the email: a choice of method, straight to a code, or straight to a password. @default "choose" */
  steps?: SignInSteps;
  /** How far a refused field shakes, in px; 0 for no shake. @default 8 */
  shake?: number;
  /** How many characters the sign-in code has, 4 to 8. @default 6 */
  cells?: number;
  /** The product's name, in the heading and the accessible name. @default "Fernworks" */
  brand?: string;
  /** The product's mark, 32px. @default the brand's initial on a tile */
  mark?: React.ReactNode;
  /** Single sign-on buttons above the email field; an empty list hides them. @default defaultSignInProviders */
  providers?: SignInProvider[];
  /** The brand panel beside the form from 640px wide; null for none. @default defaultSignInAside */
  aside?: SignInAside | null;
  /** Controlled email address. */
  email?: string;
  /** @default "" */
  defaultEmail?: string;
  /** Fires as the email is typed. */
  onEmailChange?: (email: string) => void;
  /** Controlled step. */
  step?: SignInStep;
  /** @default "email" */
  defaultStep?: SignInStep;
  /** Fires from the press or key that moved the flow, before the new step shows. */
  onStepChange?: (step: SignInStep) => void;
  /** Checks the email before the next step; reject to refuse it with your message. */
  onEmailSubmit?: (email: string) => void | Promise<void>;
  /** Sends the code (and its link); called again by Resend. */
  onSendCode?: (email: string) => void | Promise<void>;
  /** Checks a complete code; reject to refuse it, resolve with the account to welcome it by name. */
  onVerifyCode?: (
    email: string,
    code: string,
  ) => void | Promise<SignInAccount | void>;
  /** Checks a password, the same way. */
  onVerifyPassword?: (
    email: string,
    password: string,
  ) => void | Promise<SignInAccount | void>;
  /** Runs a single sign-on button, the same way. */
  onProvider?: (providerId: string) => void | Promise<SignInAccount | void>;
  /** Fires the moment a sign-in is accepted, with the account. */
  onSuccess?: (account: SignInAccount) => void;
  /** The "Forgot password?" link on the password step. */
  onForgotPassword?: (email: string) => void;
  /** The "Create an account" link under the email step. */
  onCreateAccount?: () => void;
  /** Play a click on presses, a buzz on a refusal and a chime as the welcome lands. Off unless asked for. @default false */
  sound?: boolean;
  /** Shows the card but takes no input. */
  disabled?: boolean;
  /** The group's accessible name. @default "Sign in to {brand}" */
  label?: string;
  className?: string;
};

export const defaultSignInProviders: SignInProvider[] = [
  { id: "sso", label: "Continue with SSO", icon: "building" },
  { id: "passkey", label: "Use a passkey", icon: "fingerprint" },
];

export const defaultSignInAside: SignInAside = {
  heading: "Field notes for teams that grow things.",
  body: "Plans, plots and harvests in one shared notebook.",
  points: [
    "Offline on site, synced when you are back",
    "Photos, readings and tasks on one timeline",
    "Every change signed and kept",
  ],
  quote: {
    text: "We stopped losing a season's notes to a wet clipboard.",
    by: "Ines Calloway, Basinworks Growers",
  },
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** How long a verified code shows its green before the welcome takes over, s. */
const BEAT = 0.24;

type Busy =
  | null
  | "email"
  | "send"
  | "code"
  | "password"
  | "resend"
  | `provider:${string}`;
type Field = "email" | "code" | "password" | "provider";
type Problem = { on: Field; text: string; n: number };
type Box = { x: number; y: number; w: number; h: number; r: number };

const r2 = (v: number) => Math.round(v * 100) / 100;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function hash(n: number): number {
  let h = Math.imul(n + 0x632b, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** A seeded field of dots for the brand panel: the same on server and client. */
const DOTS = Array.from({ length: 96 }, (_, i) => {
  const col = i % 12;
  const row = Math.floor(i / 12);
  const h = hash(i);
  return {
    cx: 8 + col * 16,
    cy: 8 + row * 16,
    r: r2(0.8 + (h % 5) * 0.35),
    o: r2(0.12 + ((h >>> 5) % 7) * 0.07),
  };
});

const maskEmail = (email: string) => {
  const at = email.indexOf("@");
  if (at < 1) return email;
  return `${email.charAt(0)}•••${email.slice(at)}`;
};

const nameOf = (account: SignInAccount) => {
  const first = account.name?.trim().split(/\s+/)[0];
  if (first) return first;
  const local = account.email?.split("@")[0]?.split(/[._-]/)[0] ?? "";
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "";
};

const initialsOf = (account: SignInAccount) => {
  const words = account.name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length > 0) {
    return words
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("");
  }
  const local = account.email?.split("@")[0] ?? "";
  return local.slice(0, 2).toUpperCase() || "•";
};

const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error && error.message
    ? error.message
    : typeof error === "string" && error
      ? error
      : fallback;

function ProviderIcon({ icon }: { icon?: SignInProviderIcon }) {
  const cls = "size-4 shrink-0";
  if (icon === "fingerprint")
    return <Fingerprint aria-hidden className={cls} />;
  if (icon === "key") return <KeyRound aria-hidden className={cls} />;
  return <Building2 aria-hidden className={cls} />;
}

/** A height that glides to its content's measured height; clips only up and down. */
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
        height.set(h);
        return;
      }
      if (Math.abs(now - h) < 0.5) return;
      running?.stop();
      running = animate(height, h, springs.glide);
    });
    ro.observe(node);
    return () => {
      ro.disconnect();
      running?.stop();
      if (height.get() >= 0) height.set(node.offsetHeight);
    };
  }, [node, motionSafe, height]);

  return (
    <motion.div
      style={{ height: style }}
      className="relative overflow-x-visible overflow-y-clip [overflow-clip-margin:6px]"
    >
      <div ref={setNode}>{children}</div>
    </motion.div>
  );
}

/** Labels stacked in one grid cell, so the button keeps the widest. */
function Swap({
  shown,
  labels,
}: {
  shown: string;
  labels: Record<string, React.ReactNode>;
}) {
  return (
    <span className="inline-grid items-center">
      {Object.entries(labels).map(([key, node]) => (
        <span
          key={key}
          aria-hidden={key !== shown || undefined}
          className={cn(
            "col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 transition-opacity",
            key === shown ? "opacity-100" : "opacity-0",
          )}
        >
          {node}
        </span>
      ))}
    </span>
  );
}

function Spinner({ motionSafe }: { motionSafe: boolean }) {
  return (
    <LoaderCircle
      aria-hidden
      className={cn("size-4 shrink-0", motionSafe && "animate-spin")}
    />
  );
}

type CodeFieldProps = {
  id: string;
  value: string;
  cells: number;
  label: string;
  describedBy: string;
  invalid: boolean;
  pending: boolean;
  verified: boolean;
  disabled: boolean;
  motionSafe: boolean;
  jolt: MotionValue<number>;
  bind: (node: HTMLInputElement | null) => void;
  onValue: (value: string) => void;
};

/**
 * One real input over the drawn cells: typing, paste, autofill and Backspace
 * stay native, and the cells only draw what the input holds.
 */
function CodeField({
  id,
  value,
  cells,
  label,
  describedBy,
  invalid,
  pending,
  verified,
  disabled,
  motionSafe,
  jolt,
  bind,
  onValue,
}: CodeFieldProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const cellNodes = React.useRef<(HTMLSpanElement | null)[]>([]);
  const [caret, setCaret] = React.useState(0);
  const [focused, setFocused] = React.useState(false);
  const ringX = useMotionValue(0);
  const ringW = useMotionValue(0);
  const placed = React.useRef(false);
  const active = Math.min(cells - 1, Math.max(0, caret));

  const sync = () => {
    const el = inputRef.current;
    if (el) setCaret(el.selectionStart ?? el.value.length);
  };

  // The ring slides to the cell the next character lands in.
  React.useLayoutEffect(() => {
    const node = cellNodes.current[active];
    if (!node) return;
    const x = node.offsetLeft;
    const w = node.offsetWidth;
    if (!placed.current || !motionSafe) {
      placed.current = true;
      ringX.jump(x);
      ringW.jump(w);
      return;
    }
    const a = animate(ringX, x, springs.snap);
    const b = animate(ringW, w, springs.snap);
    return () => {
      a.stop();
      b.stop();
    };
  }, [active, cells, motionSafe, ringX, ringW]);

  return (
    <motion.div className="relative" style={{ x: jolt }}>
      <div aria-hidden className="flex gap-1.5">
        {Array.from({ length: cells }, (_, i) => {
          const char = value[i] ?? "";
          return (
            <span
              key={i}
              ref={(node) => {
                cellNodes.current[i] = node;
              }}
              className={cn(
                "relative grid h-12 max-w-12 min-w-0 flex-1 place-items-center overflow-clip rounded-2 border bg-background font-mono text-[20px] text-foreground tabular-nums transition-colors",
                verified
                  ? "border-success text-success"
                  : invalid
                    ? "border-danger"
                    : "border-input",
              )}
              style={verified ? { transitionDelay: `${i * 40}ms` } : undefined}
            >
              <AnimatePresence initial={false}>
                {char ? (
                  <motion.span
                    key={char}
                    className="col-start-1 row-start-1"
                    initial={{
                      opacity: 0,
                      y: motionSafe ? 6 : 0,
                      scale: motionSafe ? 0.8 : 1,
                    }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{
                      y: motionSafe ? springs.snap : { duration: 0 },
                      scale: motionSafe ? springs.snap : { duration: 0 },
                      opacity: { duration: durations.fast },
                    }}
                  >
                    {char}
                  </motion.span>
                ) : null}
              </AnimatePresence>
              {pending && motionSafe ? (
                <motion.span
                  className="absolute inset-0 bg-cobalt-wash"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{
                    duration: 0.9,
                    ease: easings.move,
                    repeat: Infinity,
                    delay: i * 0.08,
                  }}
                />
              ) : null}
            </span>
          );
        })}
      </div>
      <motion.span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-0 left-0 h-12 rounded-2 border-2 transition-opacity",
          invalid ? "border-danger" : "border-cobalt-bright",
          focused && !pending && !verified && value.length < cells
            ? "opacity-100"
            : "opacity-0",
        )}
        style={{ x: ringX, width: ringW }}
      />
      <input
        ref={(node) => {
          inputRef.current = node;
          bind(node);
        }}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        spellCheck={false}
        aria-label={label}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        readOnly={pending || verified}
        value={value}
        onChange={(event) => {
          const next = event.currentTarget.value
            .replace(/\D/g, "")
            .slice(0, cells);
          onValue(next);
          setCaret(
            Math.min(
              next.length,
              event.currentTarget.selectionStart ?? next.length,
            ),
          );
        }}
        onSelect={sync}
        onKeyUp={sync}
        onFocus={() => {
          setFocused(true);
          sync();
        }}
        onBlur={() => setFocused(false)}
        onPointerUp={(event) => {
          // A press on a cell puts the caret there; on a filled cell it
          // selects that digit, so the next one typed replaces it.
          const el = event.currentTarget;
          const x = event.clientX;
          let i = cellNodes.current.findIndex((node) => {
            const r = node?.getBoundingClientRect();
            return !!r && x >= r.left - 3 && x <= r.right + 3;
          });
          if (i === -1) i = el.value.length;
          i = Math.min(i, el.value.length);
          if (i < el.value.length) el.setSelectionRange(i, i + 1);
          else el.setSelectionRange(i, i);
          setCaret(i);
        }}
        className={cn(
          "absolute inset-0 h-12 w-full cursor-text rounded-2 bg-transparent text-[16px] text-transparent caret-transparent selection:bg-transparent disabled:cursor-not-allowed",
          FOCUS,
        )}
      />
    </motion.div>
  );
}

/**
 * A sign-in card. Email first, with single sign-on buttons above it; then,
 * by `steps`, a choice of method, a code or a password slides in from the
 * right on the glide spring while the card's height glides to the new step.
 * The code is one real input drawn as `cells` boxes: a ring slides on snap
 * to the cell the next digit lands in, each digit lands on snap, a paste
 * fills them all, and a full code verifies itself under a wave of light.
 *
 * A refused field shakes on a symmetric tween (never a spring) by `shake`
 * px and says why; a wrong code clears and takes focus back. An accepted
 * sign-in turns the button that finished it into the welcome's avatar — it
 * glides from the button's box to a circle while the welcome fades in.
 *
 * Every step is a real form: Enter submits, Escape goes back a step, and
 * focus moves to each step's first field as it arrives. Under reduced motion
 * steps cross-fade in place, nothing shakes or morphs, and errors, codes and
 * the welcome still show.
 */
export function SignIn({
  steps = "choose",
  shake = 8,
  cells: cellsProp = 6,
  brand = "Fernworks",
  mark,
  providers = defaultSignInProviders,
  aside = defaultSignInAside,
  email: emailProp,
  defaultEmail = "",
  onEmailChange,
  step: stepProp,
  defaultStep = "email",
  onStepChange,
  onEmailSubmit,
  onSendCode,
  onVerifyCode,
  onVerifyPassword,
  onProvider,
  onSuccess,
  onForgotPassword,
  onCreateAccount,
  sound = false,
  disabled = false,
  label,
  className,
}: SignInProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const cells = Math.min(8, Math.max(4, Math.round(cellsProp)));
  const amplitude = Math.max(0, Math.min(24, shake));

  const [ownEmail, setOwnEmail] = React.useState(defaultEmail);
  const email = emailProp ?? ownEmail;
  const [ownStep, setOwnStep] = React.useState<SignInStep>(defaultStep);
  const step = stepProp ?? ownStep;

  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [reveal, setReveal] = React.useState(false);
  const [busy, setBusy] = React.useState<Busy>(null);
  const [problem, setProblem] = React.useState<Problem | null>(null);
  const [verified, setVerified] = React.useState(false);
  const [resent, setResent] = React.useState(false);
  const [account, setAccount] = React.useState<SignInAccount | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // Which way the panels slide is decided in the render that changes step.
  const order = (s: SignInStep) =>
    s === "email"
      ? 0
      : s === "method"
        ? 1
        : s === "welcome"
          ? 9
          : steps === "choose"
            ? 2
            : 1;
  const [seen, setSeen] = React.useState({ step, dir: 1 });
  if (seen.step !== step) {
    setSeen({ step, dir: order(step) >= order(seen.step) ? 1 : -1 });
  }
  const dir = seen.dir;

  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const timers = React.useRef(new Set<number>());
  const alive = React.useRef(true);
  const wantFocus = React.useRef(false);
  const [arrival, setArrival] = React.useState<HTMLElement | null>(null);
  const arrive = React.useCallback((node: HTMLElement | null) => {
    if (node) setArrival(node);
  }, []);
  const morphFrom = React.useRef<Box | null>(null);
  const byVisitor = React.useRef(false);
  const [avatar, setAvatar] = React.useState<HTMLSpanElement | null>(null);

  const jolt = useMotionValue(0);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const mw = useMotionValue(0);
  const mh = useMotionValue(0);
  const mr = useMotionValue(6);
  const morphT = useMotionValue(0);
  const flying = useMotionValue(0);
  const avatarOpacity = useTransform(flying, (f) => 1 - f);
  const fadeLabel = useTransform(morphT, (t) => r2(Math.max(0, 1 - t * 4)));
  const fadeInitials = useTransform(morphT, (t) =>
    r2(Math.min(1, Math.max(0, (t - 0.45) * 2.5))),
  );
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const play = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      if (alive.current) fn();
    }, ms);
    timers.current.add(t);
  };

  const click = (pitch = 1) => audio.play("click", { pitch, gain: 0.5 });

  const go = (next: SignInStep, focus = true) => {
    wantFocus.current = focus;
    setProblem(null);
    if (stepProp === undefined) setOwnStep(next);
    onStepChange?.(next);
  };

  const refuse = (on: Field, text: string) => {
    setProblem((p) => ({ on, text, n: (p?.n ?? 0) + 1 }));
    audio.play("buzz", { pitch: 1, gain: 0.45 });
    if (motionSafe && amplitude > 0) {
      const a = amplitude;
      jolt.jump(0);
      play(
        "jolt",
        animate(jolt, [0, -a, a, -0.6 * a, 0.6 * a, -0.25 * a, 0], {
          duration: 0.42,
          ease: easings.move,
        }),
      );
    }
  };

  /** Runs a callback that may or may not return a promise. */
  const settle = async <T,>(
    fn: (() => T | Promise<T>) | undefined,
  ): Promise<T | undefined> => {
    if (!fn) return undefined;
    return await fn();
  };

  const boxOf = (el: Element | null | undefined): Box | null => {
    const card = cardRef.current;
    if (!card || !el) return null;
    const a = card.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    return {
      x: r2(b.left - a.left),
      y: r2(b.top - a.top),
      w: r2(b.width),
      h: r2(b.height),
      r: 6,
    };
  };

  const succeed = (who: SignInAccount | void, from: Element | null) => {
    const signedIn: SignInAccount = {
      email: who?.email ?? (email || undefined),
      name: who?.name,
    };
    setAccount(signedIn);
    onSuccess?.(signedIn);
    const box = motionSafe ? boxOf(from) : null;
    morphFrom.current = box;
    if (box) {
      // The first frame of the welcome already shows the button where it was.
      byVisitor.current = true;
      mx.jump(box.x);
      my.jump(box.y);
      mw.jump(box.w);
      mh.jump(box.h);
      mr.jump(box.r);
      morphT.jump(0);
      flying.jump(1);
    } else {
      audio.play("chime", { pitch: 1, gain: 0.5 });
    }
    const first = nameOf(signedIn);
    say(`Signed in. Welcome back${first ? `, ${first}` : ""}.`);
    go("welcome", true);
  };

  const submitEmail = async () => {
    if (disabled || busy) return;
    click(1);
    const value = email.trim();
    if (!value) {
      refuse("email", "Enter your work email.");
      return;
    }
    if (!EMAIL.test(value)) {
      refuse("email", "That doesn't look like an email address.");
      return;
    }
    setBusy(steps === "code" ? "send" : "email");
    try {
      await settle(onEmailSubmit && (() => onEmailSubmit(value)));
      if (steps === "code")
        await settle(onSendCode && (() => onSendCode(value)));
    } catch (error) {
      if (!alive.current) return;
      setBusy(null);
      refuse("email", messageOf(error, "We couldn't find that account."));
      return;
    }
    if (!alive.current) return;
    setBusy(null);
    if (steps === "choose") go("method");
    else if (steps === "code") {
      setCode("");
      say(`Code sent to ${maskEmail(value)}.`);
      go("code");
    } else go("password");
  };

  const chooseCode = async () => {
    if (disabled || busy) return;
    click(1.1);
    setBusy("send");
    try {
      await settle(onSendCode && (() => onSendCode(email)));
    } catch (error) {
      if (!alive.current) return;
      setBusy(null);
      refuse(
        step === "password" ? "password" : "provider",
        messageOf(error, "We couldn't send a code. Try again."),
      );
      return;
    }
    if (!alive.current) return;
    setBusy(null);
    setCode("");
    say(`Code sent to ${maskEmail(email)}.`);
    go("code");
  };

  const verifyCode = async (value: string, from: Element | null) => {
    if (disabled || busy || verified) return;
    if (value.length < cells) {
      refuse("code", `Enter all ${cells} digits.`);
      return;
    }
    setBusy("code");
    let who: SignInAccount | void = undefined;
    try {
      who = await settle(onVerifyCode && (() => onVerifyCode(email, value)));
    } catch (error) {
      if (!alive.current) return;
      setBusy(null);
      refuse("code", messageOf(error, "That code didn't match."));
      // The cells clear once the shake has said so, and take focus back.
      later(
        () => {
          setCode("");
          window.requestAnimationFrame(() => {
            const input = document.getElementById(`${uid}-code`);
            if (input instanceof HTMLInputElement) {
              input.focus();
              input.setSelectionRange(0, 0);
            }
          });
        },
        motionSafe ? 420 : 0,
      );
      return;
    }
    if (!alive.current) return;
    setBusy(null);
    setVerified(true);
    later(
      () => {
        setVerified(false);
        succeed(who, from);
      },
      motionSafe ? BEAT * 1000 : 0,
    );
  };

  const verifyPassword = async (from: HTMLButtonElement | null) => {
    if (disabled || busy) return;
    click(1);
    if (!password) {
      refuse("password", "Enter your password.");
      return;
    }
    setBusy("password");
    let who: SignInAccount | void = undefined;
    try {
      who = await settle(
        onVerifyPassword && (() => onVerifyPassword(email, password)),
      );
    } catch (error) {
      if (!alive.current) return;
      setBusy(null);
      setPassword("");
      refuse("password", messageOf(error, "That password didn't match."));
      return;
    }
    if (!alive.current) return;
    setBusy(null);
    succeed(who, from);
  };

  const runProvider = async (p: SignInProvider, from: HTMLButtonElement) => {
    if (disabled || busy) return;
    click(1.05);
    setBusy(`provider:${p.id}`);
    let who: SignInAccount | void = undefined;
    try {
      who = await settle(onProvider && (() => onProvider(p.id)));
    } catch (error) {
      if (!alive.current) return;
      setBusy(null);
      refuse("provider", messageOf(error, "That sign-in was cancelled."));
      return;
    }
    if (!alive.current) return;
    setBusy(null);
    succeed(who, from);
  };

  const resend = async () => {
    if (disabled || busy) return;
    click(1.2);
    setBusy("resend");
    try {
      await settle(onSendCode && (() => onSendCode(email)));
    } catch (error) {
      if (!alive.current) return;
      setBusy(null);
      refuse("code", messageOf(error, "We couldn't send another code."));
      return;
    }
    if (!alive.current) return;
    setBusy(null);
    setResent(true);
    say(`Another code sent to ${maskEmail(email)}.`);
    later(() => setResent(false), 4000);
  };

  const back = () => {
    if (disabled || busy) return;
    click(0.85);
    setReveal(false);
    if (step === "code" || step === "password") {
      go(steps === "choose" ? "method" : "email");
    } else {
      go("email");
    }
  };

  const startOver = () => {
    if (disabled) return;
    click(0.85);
    setAccount(null);
    setCode("");
    setPassword("");
    morphFrom.current = null;
    flying.jump(0);
    go("email");
  };

  // Focus follows the flow: each step's first control, once it exists.
  React.useEffect(() => {
    if (!arrival || !wantFocus.current) return;
    if (!arrival.isConnected) return;
    wantFocus.current = false;
    arrival.focus({ preventScroll: true });
  }, [arrival]);

  // The button that finished the sign-in flies into the welcome's avatar.
  // Its target is read each frame, so a card that re-centres as its height
  // glides still lands the flight exactly on the avatar. Armed by the press
  // and cleared only on landing: a re-run (StrictMode) starts it again.
  React.useLayoutEffect(() => {
    const from = morphFrom.current;
    if (!avatar || !from || step !== "welcome") return;
    const track = () => {
      const to = boxOf(avatar);
      if (!to) return;
      const k = morphT.get();
      mx.set(r2(lerp(from.x, to.x, k)));
      my.set(r2(lerp(from.y, to.y, k)));
      mw.set(r2(lerp(from.w, to.w, k)));
      mh.set(r2(lerp(from.h, to.h, k)));
      mr.set(r2(lerp(from.r, to.h / 2, k)));
    };
    const off = morphT.on("change", track);
    morphT.jump(0);
    flying.jump(1);
    track();
    const controls = animate(morphT, 1, {
      ...springs.glide,
      onComplete: () => {
        track();
        morphFrom.current = null;
        flying.set(0);
        if (byVisitor.current) audio.play("chime", { pitch: 1, gain: 0.5 });
        byVisitor.current = false;
      },
    });
    return () => {
      off();
      controls.stop();
    };
    // The flight reads the latest geometry itself; it restarts only for a new avatar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatar, step]);

  React.useEffect(() => {
    alive.current = true;
    const waiting = timers.current;
    const running = anims.current;
    return () => {
      alive.current = false;
      for (const t of waiting) window.clearTimeout(t);
      waiting.clear();
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  /* -------------------------------- panels -------------------------------- */

  const errorId = `${uid}-error`;
  const shown = (on: Field) => (problem?.on === on ? problem : null);

  const primary = cn(
    "inline-flex h-10 w-full items-center justify-center rounded-2 bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-[filter,opacity]",
    "enabled:not-aria-disabled:hover:brightness-110 disabled:opacity-50 aria-disabled:cursor-default",
    FOCUS,
  );
  const secondary = cn(
    "inline-flex h-10 w-full items-center justify-center gap-2 rounded-2 border border-hairline-strong bg-background px-4 text-[13px] font-medium text-foreground transition-colors",
    "enabled:not-aria-disabled:hover:bg-surface-2 disabled:opacity-50 aria-disabled:cursor-default",
    FOCUS,
  );
  const link = cn(
    "rounded-1 text-[12px] text-cobalt-bright underline-offset-2 enabled:hover:underline disabled:opacity-50",
    FOCUS,
  );

  const errorLine = (on: Field) => {
    const p = shown(on);
    return (
      <AnimatePresence initial={false}>
        {p ? (
          <motion.p
            key={p.n}
            id={errorId}
            role="alert"
            className="flex items-start gap-1.5 pt-1.5 text-[12px] leading-4 text-danger"
            initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              y: motionSafe ? springs.snap : { duration: 0 },
              opacity: { duration: durations.fast },
            }}
          >
            <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
            {p.text}
          </motion.p>
        ) : null}
      </AnimatePresence>
    );
  };

  const heading = (title: string, line?: React.ReactNode) => (
    <div className="grid gap-1">
      <h2 className="text-[18px] leading-6 font-semibold tracking-[-0.01em] text-foreground">
        {title}
      </h2>
      {line ? <p className="text-[13px] leading-5 text-ink-2">{line}</p> : null}
    </div>
  );

  const backChip = (
    <button
      type="button"
      disabled={disabled}
      onClick={back}
      aria-label={`Back, change email from ${email || "this address"}`}
      className={cn(
        "inline-flex h-7 max-w-full items-center gap-1.5 justify-self-start rounded-full border border-hairline pr-2.5 pl-2 text-[12px] text-ink-2 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground",
        FOCUS,
      )}
    >
      <ArrowLeft aria-hidden className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate" title={email}>
        {email || "Back"}
      </span>
    </button>
  );

  const emailInvalid = !!shown("email");
  const passwordInvalid = !!shown("password");

  let panel: React.ReactNode;
  if (step === "email") {
    panel = (
      <div className="grid gap-5">
        {heading(`Sign in to ${brand}`, "Welcome back. Use your work email.")}
        {providers.length > 0 ? (
          <motion.div
            className="grid gap-2"
            style={{ x: shown("provider") ? jolt : 0 }}
          >
            {providers.map((p) => {
              const mine = busy === `provider:${p.id}`;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={disabled}
                  aria-disabled={(!!busy && !mine) || undefined}
                  onClick={(event) => void runProvider(p, event.currentTarget)}
                  className={secondary}
                >
                  {mine ? (
                    <Spinner motionSafe={motionSafe} />
                  ) : (
                    <ProviderIcon icon={p.icon} />
                  )}
                  <span className="truncate">{p.label}</span>
                </button>
              );
            })}
            {errorLine("provider")}
          </motion.div>
        ) : null}
        {providers.length > 0 ? (
          <div
            aria-hidden
            className="flex items-center gap-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            <span className="h-px flex-1 bg-hairline" />
            or
            <span className="h-px flex-1 bg-hairline" />
          </div>
        ) : null}
        <form
          noValidate
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submitEmail();
          }}
        >
          <div className="grid gap-1.5">
            <label
              htmlFor={`${uid}-email`}
              className="text-[12px] font-medium text-ink-2"
            >
              Work email
            </label>
            <motion.div style={{ x: emailInvalid ? jolt : 0 }}>
              <input
                ref={arrive}
                id={`${uid}-email`}
                type="email"
                inputMode="email"
                autoComplete="username"
                spellCheck={false}
                placeholder="you@company.com"
                disabled={disabled}
                readOnly={!!busy}
                value={email}
                aria-invalid={emailInvalid || undefined}
                aria-describedby={emailInvalid ? errorId : undefined}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  if (emailProp === undefined) setOwnEmail(next);
                  onEmailChange?.(next);
                  if (problem) setProblem(null);
                }}
                className={cn(
                  "h-10 w-full rounded-2 border bg-background px-3 text-[14px] text-foreground transition-colors placeholder:text-ink-3 disabled:opacity-50",
                  FOCUS,
                  emailInvalid ? "border-danger" : "border-input",
                )}
              />
              {errorLine("email")}
            </motion.div>
          </div>
          <button
            type="submit"
            disabled={disabled}
            aria-disabled={!!busy || undefined}
            className={primary}
          >
            <Swap
              shown={busy === "email" || busy === "send" ? "busy" : "idle"}
              labels={{
                idle: steps === "code" ? "Email me a code" : "Continue",
                busy: (
                  <>
                    <Spinner motionSafe={motionSafe} />
                    {steps === "code" ? "Sending…" : "Checking…"}
                  </>
                ),
              }}
            />
          </button>
        </form>
        <p className="text-center text-[12px] text-ink-3">
          New to {brand}?{" "}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onCreateAccount?.()}
            className={link}
          >
            Create an account
          </button>
        </p>
      </div>
    );
  } else if (step === "method") {
    const options = [
      {
        id: "code" as const,
        icon: <Mail aria-hidden className="size-4 shrink-0" />,
        title: "Email me a code",
        line: `A ${cells}-digit code and a link, to ${maskEmail(email)}`,
      },
      {
        id: "password" as const,
        icon: <KeyRound aria-hidden className="size-4 shrink-0" />,
        title: "Use my password",
        line: "The one you set for this account",
      },
    ];
    panel = (
      <div className="grid gap-5">
        {backChip}
        {heading("How do you want to sign in?")}
        <motion.div
          className="grid gap-2"
          style={{ x: shown("provider") ? jolt : 0 }}
        >
          {options.map((o, i) => {
            const mine = o.id === "code" && busy === "send";
            return (
              <button
                key={o.id}
                ref={i === 0 ? arrive : undefined}
                type="button"
                disabled={disabled}
                aria-disabled={(!!busy && !mine) || undefined}
                onClick={() => {
                  if (o.id === "code") void chooseCode();
                  else if (!busy) {
                    click(1.1);
                    go("password");
                  }
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-3 border border-hairline-strong bg-background p-3 text-left transition-colors",
                  "enabled:not-aria-disabled:hover:border-cobalt-bright/60 enabled:not-aria-disabled:hover:bg-surface-2 disabled:opacity-50",
                  FOCUS,
                )}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-2 bg-cobalt-wash text-cobalt-bright">
                  {mine ? <Spinner motionSafe={motionSafe} /> : o.icon}
                </span>
                <span className="grid min-w-0 gap-0.5">
                  <span className="text-[13px] font-medium text-foreground">
                    {o.title}
                  </span>
                  <span
                    className="truncate text-[12px] text-ink-3"
                    title={o.line}
                  >
                    {o.line}
                  </span>
                </span>
              </button>
            );
          })}
          {errorLine("provider")}
        </motion.div>
      </div>
    );
  } else if (step === "code") {
    const codeInvalid = !!shown("code");
    panel = (
      <form
        noValidate
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          const button = event.currentTarget.querySelector(
            "button[type=submit]",
          );
          void verifyCode(code, button);
        }}
      >
        {backChip}
        {heading(
          "Check your email",
          <>
            Enter the {cells}-digit code we sent to{" "}
            <span className="text-foreground">{maskEmail(email)}</span>, or open
            the link in that email on this device.
          </>,
        )}
        <div className="grid gap-1.5">
          <span
            id={`${uid}-code-hint`}
            className="text-[12px] font-medium text-ink-2"
          >
            Sign-in code
          </span>
          <CodeField
            id={`${uid}-code`}
            value={code}
            cells={cells}
            label={`${cells}-digit code`}
            describedBy={
              codeInvalid ? `${uid}-code-hint ${errorId}` : `${uid}-code-hint`
            }
            invalid={codeInvalid}
            pending={busy === "code"}
            verified={verified}
            disabled={disabled}
            motionSafe={motionSafe}
            jolt={jolt}
            bind={arrive}
            onValue={(next) => {
              setCode(next);
              if (problem) setProblem(null);
              if (next.length === cells && next !== code) {
                const form = cardRef.current?.querySelector(
                  `[data-sign-in-verify="${uid}"]`,
                );
                void verifyCode(next, form ?? null);
              }
            }}
          />
          {errorLine("code")}
        </div>
        <button
          type="submit"
          data-sign-in-verify={uid}
          disabled={disabled}
          aria-disabled={!!busy || verified || undefined}
          className={primary}
        >
          <Swap
            shown={verified ? "done" : busy === "code" ? "busy" : "idle"}
            labels={{
              idle: "Verify",
              busy: (
                <>
                  <Spinner motionSafe={motionSafe} />
                  Verifying…
                </>
              ),
              done: (
                <>
                  <Check aria-hidden className="size-4 shrink-0" />
                  Verified
                </>
              ),
            }}
          />
        </button>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-[12px] text-ink-3">
            {resent ? (
              <span className="inline-flex items-center gap-1 text-success">
                <Check aria-hidden className="size-3.5" />
                Sent again
              </span>
            ) : (
              <>
                Didn&apos;t get it?{" "}
                <button
                  type="button"
                  disabled={disabled}
                  aria-disabled={!!busy || undefined}
                  onClick={() => void resend()}
                  className={link}
                >
                  {busy === "resend" ? "Sending…" : "Resend"}
                </button>
              </>
            )}
          </p>
          <button
            type="button"
            disabled={disabled}
            aria-disabled={!!busy || undefined}
            onClick={() => {
              if (busy) return;
              click(1.1);
              go("password");
            }}
            className={link}
          >
            Use password instead
          </button>
        </div>
      </form>
    );
  } else if (step === "password") {
    panel = (
      <form
        noValidate
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          const button = event.currentTarget.querySelector<HTMLButtonElement>(
            "button[type=submit]",
          );
          void verifyPassword(button);
        }}
      >
        {backChip}
        {heading("Enter your password")}
        <input
          type="email"
          autoComplete="username"
          value={email}
          readOnly
          hidden
        />
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor={`${uid}-password`}
              className="text-[12px] font-medium text-ink-2"
            >
              Password
            </label>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onForgotPassword?.(email)}
              className={link}
            >
              Forgot password?
            </button>
          </div>
          <motion.div
            className="relative"
            style={{ x: passwordInvalid ? jolt : 0 }}
          >
            <input
              ref={arrive}
              id={`${uid}-password`}
              type={reveal ? "text" : "password"}
              autoComplete="current-password"
              spellCheck={false}
              disabled={disabled}
              readOnly={!!busy}
              value={password}
              aria-invalid={passwordInvalid || undefined}
              aria-describedby={passwordInvalid ? errorId : undefined}
              onChange={(event) => {
                setPassword(event.currentTarget.value);
                if (problem) setProblem(null);
              }}
              className={cn(
                "h-10 w-full rounded-2 border bg-background pr-11 pl-3 text-[14px] text-foreground transition-colors disabled:opacity-50",
                FOCUS,
                passwordInvalid ? "border-danger" : "border-input",
              )}
            />
            <button
              type="button"
              aria-label="Show password"
              aria-pressed={reveal}
              disabled={disabled}
              onClick={() => setReveal((r) => !r)}
              className={cn(
                "absolute top-1 right-1 grid size-8 place-items-center rounded-2 text-ink-3 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground",
                FOCUS,
              )}
            >
              {reveal ? (
                <EyeOff aria-hidden className="size-4" />
              ) : (
                <Eye aria-hidden className="size-4" />
              )}
            </button>
          </motion.div>
          {errorLine("password")}
        </div>
        <button
          type="submit"
          disabled={disabled}
          aria-disabled={!!busy || undefined}
          className={primary}
        >
          <Swap
            shown={busy === "password" ? "busy" : "idle"}
            labels={{
              idle: "Sign in",
              busy: (
                <>
                  <Spinner motionSafe={motionSafe} />
                  Signing in…
                </>
              ),
            }}
          />
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-disabled={!!busy || undefined}
          onClick={() => void chooseCode()}
          className={cn(link, "justify-self-center")}
        >
          {busy === "send" ? "Sending a code…" : "Email me a code instead"}
        </button>
      </form>
    );
  } else {
    const person = account ?? { email: email || undefined };
    const first = nameOf(person);
    panel = (
      <div className="grid justify-items-center gap-4 py-4 text-center">
        <motion.span
          ref={setAvatar}
          aria-hidden
          className="grid size-16 place-items-center rounded-full bg-primary text-[20px] font-semibold text-primary-foreground"
          style={{ opacity: avatarOpacity }}
        >
          {initialsOf(person)}
        </motion.span>
        <div className="grid gap-1">
          <h2
            ref={arrive}
            tabIndex={-1}
            className="text-[18px] leading-6 font-semibold text-foreground outline-none"
          >
            Welcome back{first ? `, ${first}` : ""}
          </h2>
          <p className="text-[13px] text-ink-2">
            {person.email ? (
              <>
                Signed in as{" "}
                <span className="text-foreground">{person.email}</span>
              </>
            ) : (
              "Signed in with single sign-on"
            )}
          </p>
        </div>
        <p className="inline-flex items-center gap-2 font-mono text-[11px] text-ink-3">
          <Check aria-hidden className="size-3.5 text-success" />
          Opening your {brand} workspace
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={startOver}
          className={link}
        >
          Not you? Use another account
        </button>
      </div>
    );
  }

  const pipCount = steps === "choose" ? 3 : 2;
  const pipAt = Math.min(pipCount, order(step) === 9 ? pipCount : order(step));
  const who = account ?? { email: email || undefined };

  return (
    <div
      role="group"
      aria-label={label ?? `Sign in to ${brand}`}
      className={cn("@container w-full", disabled && "opacity-60", className)}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        if (step === "email" || step === "welcome" || disabled || busy) return;
        // Escape goes back a step, here where focus is.
        event.preventDefault();
        back();
      }}
    >
      <div className="grid overflow-clip rounded-4 border border-hairline bg-card text-foreground @min-[40rem]:grid-cols-2 @min-[60rem]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {aside ? (
          <div className="relative isolate hidden flex-col justify-between gap-8 overflow-clip bg-cobalt-wash p-8 @min-[40rem]:flex">
            <svg
              aria-hidden
              viewBox="0 0 192 128"
              className="absolute -top-6 -right-8 -z-10 w-[70%] [mask-image:linear-gradient(to_bottom_left,black,transparent_75%)] text-cobalt-bright"
            >
              {DOTS.map((d, i) => (
                <circle
                  key={i}
                  cx={d.cx}
                  cy={d.cy}
                  r={d.r}
                  fill="currentColor"
                  opacity={d.o}
                />
              ))}
            </svg>
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-2 bg-primary text-[14px] font-semibold text-primary-foreground">
                {mark ?? brand.charAt(0)}
              </span>
              <span className="text-[14px] font-semibold">{brand}</span>
            </div>
            <div className="grid gap-4">
              <p className="text-[22px] leading-7 font-semibold tracking-[-0.01em] text-foreground @min-[60rem]:text-[26px] @min-[60rem]:leading-8">
                {aside.heading}
              </p>
              <p className="text-[13px] leading-5 text-ink-2">{aside.body}</p>
              <ul role="list" className="grid gap-2">
                {aside.points.map((p) => (
                  <li
                    key={p}
                    className="flex items-start gap-2 text-[13px] leading-5 text-ink-2"
                  >
                    <Check
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-cobalt-bright"
                    />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            {aside.quote ? (
              <figure className="hidden gap-2 border-l-2 border-cobalt-bright/40 pl-3 @min-[60rem]:grid">
                <blockquote className="text-[13px] leading-5 text-foreground">
                  “{aside.quote.text}”
                </blockquote>
                <figcaption className="text-[12px] text-ink-3">
                  {aside.quote.by}
                </figcaption>
              </figure>
            ) : (
              <span />
            )}
          </div>
        ) : null}

        <div
          ref={cardRef}
          className={cn(
            "relative p-5 @min-[24rem]:p-6 @min-[40rem]:flex @min-[40rem]:items-center @min-[40rem]:p-8",
            !aside && "@min-[40rem]:col-span-2",
          )}
        >
          <div className="mx-auto grid w-full max-w-sm gap-6">
            <div className="flex items-center justify-between gap-3">
              <span
                aria-hidden
                className="grid size-8 place-items-center rounded-2 bg-primary text-[14px] font-semibold text-primary-foreground"
              >
                {mark ?? brand.charAt(0)}
              </span>
              <span aria-hidden className="flex items-center gap-1.5">
                {Array.from({ length: pipCount }, (_, i) => (
                  <motion.span
                    key={i}
                    className={cn(
                      "h-1.5 rounded-full transition-colors",
                      i <= pipAt ? "bg-cobalt-bright" : "bg-hairline-strong",
                    )}
                    initial={false}
                    animate={{ width: i === pipAt ? 20 : 6 }}
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ))}
              </span>
            </div>
            <Measured motionSafe={motionSafe}>
              <AnimatePresence initial={false} mode="popLayout" custom={dir}>
                <motion.div
                  key={step}
                  custom={dir}
                  variants={{
                    enter: (d: number) => ({
                      opacity: 0,
                      x:
                        motionSafe && step !== "welcome"
                          ? d * distances.shift
                          : 0,
                    }),
                    center: { opacity: 1, x: 0 },
                    leave: (d: number) => ({
                      opacity: 0,
                      x:
                        motionSafe && step !== "welcome"
                          ? -d * distances.shift
                          : 0,
                      transition: exitFor(durations.fast),
                    }),
                  }}
                  initial="enter"
                  animate="center"
                  exit="leave"
                  transition={{
                    x: motionSafe ? springs.glide : { duration: 0 },
                    // The old panel is nearly gone before the new one shows,
                    // so the two never read as one tangle mid-slide.
                    opacity: {
                      duration: durations.base,
                      delay: 0.06,
                      ease: easings.enter,
                    },
                  }}
                >
                  {panel}
                </motion.div>
              </AnimatePresence>
            </Measured>
          </div>

          {step === "welcome" ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 z-10 grid place-items-center overflow-clip bg-primary text-primary-foreground"
              style={{
                x: mx,
                y: my,
                width: mw,
                height: mh,
                borderRadius: mr,
                opacity: flying,
              }}
            >
              <motion.span
                className="col-start-1 row-start-1"
                style={{ opacity: fadeLabel }}
              >
                <Check className="size-4" />
              </motion.span>
              <motion.span
                className="col-start-1 row-start-1 text-[20px] font-semibold"
                style={{ opacity: fadeInitials }}
              >
                {initialsOf(who)}
              </motion.span>
            </motion.span>
          ) : null}
        </div>
      </div>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
