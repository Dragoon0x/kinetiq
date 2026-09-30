"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type VaultPasswordDoor = "steel" | "brass" | "matte";

export type VaultRule = {
  id: string;
  /** Short enough for one line beside a bolt, e.g. "A number". */
  label: string;
  test: (value: string) => boolean;
};

export type VaultPasswordProps = {
  /** What the password is for. The visible label, and the input's accessible name. @default "Password" */
  label?: string;
  /** Controlled password. */
  value?: string;
  /** Initial password when uncontrolled. @default "" */
  defaultValue?: string;
  /** Fires with the new password on every edit. */
  onValueChange?: (value: string) => void;
  /** How many rules the door enforces, taken in order, 3 to 6: one bolt each. @default 4 */
  rules?: number;
  /** The rules to take them from. @default 12+ characters, lowercase, uppercase, a number, a symbol, not a common password */
  checks?: VaultRule[];
  /** The metal of the door, its frame and the peephole shutter. @default "steel" */
  door?: VaultPasswordDoor;
  /** Spin the wheel before the latch drops, once every bolt is home. @default true */
  spin?: boolean;
  /** Fires from the edit that shot the last bolt home (true) or pulled one back from a locked door (false). */
  onLockedChange?: (locked: boolean) => void;
  /** The form field name. */
  name?: string;
  /** Helper text under the field. */
  hint?: string;
  /** What is wrong, in a sentence, from the host. Shown under the field and announced once. */
  error?: string | null;
  placeholder?: string;
  /** @default "new-password" */
  autoComplete?: string;
  required?: boolean;
  /** Play the bolts, the wheel and the shutter. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const MOST = 6;

const COMMON = new Set([
  "password",
  "passw",
  "qwerty",
  "qwertyuiop",
  "letmein",
  "iloveyou",
  "welcome",
  "admin",
  "administrator",
  "monkey",
  "dragon",
  "sunshine",
  "princess",
  "football",
  "baseball",
  "master",
  "login",
  "abc",
  "trustno",
  "secret",
  "changeme",
  "default",
]);
const RUNS = [
  "0123456789",
  "abcdefghijklmnopqrstuvwxyz",
  "qwertyuiop",
  "asdfghjkl",
];

/** A common password: a known word under its digits and symbols, one character over and over, or a straight run. */
function isCommon(value: string) {
  const lower = value.toLowerCase();
  const letters = lower.replace(/[^a-z]/g, "");
  if (letters.length > 0 && COMMON.has(letters)) return true;
  if (/^(.)\1*$/u.test(lower)) return true;
  return RUNS.some(
    (run) =>
      run.includes(lower) || (letters.length >= 6 && run.includes(letters)),
  );
}

export const VAULT_RULES: VaultRule[] = [
  {
    id: "length",
    label: "12 or more characters",
    test: (v) => [...v].length >= 12,
  },
  { id: "lower", label: "A lowercase letter", test: (v) => /\p{Ll}/u.test(v) },
  { id: "upper", label: "An uppercase letter", test: (v) => /\p{Lu}/u.test(v) },
  { id: "number", label: "A number", test: (v) => /\p{N}/u.test(v) },
  {
    id: "symbol",
    label: "A symbol",
    test: (v) => /[^\p{L}\p{N}\s]/u.test(v),
  },
  {
    id: "common",
    label: "Not a common password",
    // Judged once there is enough of it to judge.
    test: (v) => [...v].length >= 8 && !isCommon(v),
  },
];

type Metal = {
  frameHi: string;
  frameLo: string;
  faceHi: string;
  faceLo: string;
  part: string;
  edge: string;
};

// Pigments, not text tokens: a door is an object, and must be the same metal
// on a light page and a dark one.
const METALS: Record<VaultPasswordDoor, Metal> = {
  steel: {
    frameHi: "oklch(0.74 0.01 250)",
    frameLo: "oklch(0.5 0.012 250)",
    faceHi: "oklch(0.92 0.005 250)",
    faceLo: "oklch(0.7 0.01 250)",
    part: "oklch(0.95 0.004 250)",
    edge: "oklch(0.42 0.014 250)",
  },
  brass: {
    frameHi: "oklch(0.68 0.09 78)",
    frameLo: "oklch(0.46 0.07 68)",
    faceHi: "oklch(0.9 0.09 90)",
    faceLo: "oklch(0.7 0.11 80)",
    part: "oklch(0.93 0.07 92)",
    edge: "oklch(0.42 0.07 64)",
  },
  matte: {
    frameHi: "oklch(0.42 0.01 260)",
    frameLo: "oklch(0.27 0.01 260)",
    faceHi: "oklch(0.52 0.012 260)",
    faceLo: "oklch(0.36 0.012 260)",
    part: "oklch(0.7 0.01 260)",
    edge: "oklch(0.2 0.01 260)",
  },
};
const CAVITY = "oklch(0.18 0.01 260)";
const LAMP_ON = "oklch(from var(--success) 0.8 c h)";
const LENS = "oklch(0.26 0.03 250)";

/** Door geometry in viewBox units (120 across), centred on C. */
const C = 60;
const SEAM = 48.5;
const DOOR = 46;
const BOLT_IN = 26;
const BOLT_LEN = 14;
const TRAVEL = 12;
const SPOKES = 5;

const r2 = (v: number) => Math.round(v * 100) / 100;
const RIVETS = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2 + Math.PI / 16;
  return { x: r2(C + 42 * Math.cos(a)), y: r2(C + 42 * Math.sin(a)) };
});
const SPOKE_ENDS = Array.from({ length: SPOKES }, (_, i) => {
  const a = ((-90 + (i * 360) / SPOKES) * Math.PI) / 180;
  return {
    x1: r2(C + 8 * Math.cos(a)),
    y1: r2(C + 8 * Math.sin(a)),
    x2: r2(C + 25 * Math.cos(a)),
    y2: r2(C + 25 * Math.sin(a)),
  };
});

const angleOf = (i: number, count: number) => r2(-90 + (i * 360) / count);

/**
 * One bolt and its linkage arm, in the bolt's own frame (the group is turned
 * to the bolt's angle, so travel is along x): the arm is rebuilt from the
 * bolt's travel every frame, so it stays pinned to the hub while the bolt
 * slides.
 */
function DoorBolt({
  angle,
  travel,
  metal,
}: {
  angle: number;
  travel: MotionValue<number>;
  metal: Metal;
}) {
  const x = useTransform(travel, (p) => r2(p * TRAVEL));
  const arm = useTransform(
    travel,
    (p) =>
      `M ${C + 11.6} ${C - 2.9} L ${r2(C + BOLT_IN + 1 + p * TRAVEL)} ${C}`,
  );
  return (
    <g transform={`rotate(${angle} ${C} ${C})`}>
      <motion.path
        d={arm}
        fill="none"
        stroke={metal.edge}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <motion.rect
        x={C + BOLT_IN}
        y={C - 3.8}
        width={BOLT_LEN}
        height={7.6}
        rx={2}
        fill={metal.part}
        stroke={metal.edge}
        strokeWidth={0.9}
        style={{ x }}
      />
    </g>
  );
}

/**
 * The list's small bolt, riding the same value as its bolt on the door: it
 * slides across a seam, not along a track, so it never reads as a switch.
 */
function RuleGlyph({ travel }: { travel: MotionValue<number> }) {
  const x = useTransform(travel, (p) => r2(p * 7));
  const tint = useTransform(travel, (p) =>
    p > 0.5 ? "var(--accent-bright)" : "var(--ink-3)",
  );
  return (
    <svg
      aria-hidden
      viewBox="0 0 18 10"
      className="h-2.5 w-[18px] shrink-0 overflow-visible"
    >
      <rect
        x={11}
        y={0.5}
        width={1.5}
        height={9}
        rx={0.75}
        className="fill-ink-3/50"
      />
      <motion.rect
        x={0.5}
        y={3}
        width={9}
        height={4}
        rx={1.5}
        style={{ x, fill: tint }}
      />
    </svg>
  );
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * A new-password field beside a vault door seen from the inside, its
 * boltwork showing. Each strength rule drives one bolt round the door's rim:
 * meeting the rule shoots the bolt across the seam into the frame on the snap
 * spring, with a thock as it hits its stop, and breaking it pulls the bolt
 * back on glide. When every bolt is home the wheel spins on the drift spring,
 * clicking as its spokes pass, and the latch turns in the hub on flick as the
 * lamp lights. The show/hide control is a peephole whose metal shutter swings
 * aside on its pivot.
 *
 * The field is a native password input with its label, hint and error wired
 * up; the rules are a real list, each one saying whether it is met; a polite
 * status speaks one sentence each time a rule's state changes, never per
 * keystroke. Under reduced motion the bolts, latch and shutter take their
 * states without travel and the wheel stays still; the list and the sounds
 * still answer.
 */
export function VaultPassword({
  label = "Password",
  value,
  defaultValue = "",
  onValueChange,
  rules = 4,
  checks = VAULT_RULES,
  door = "steel",
  spin = true,
  onLockedChange,
  name,
  hint,
  error,
  placeholder,
  autoComplete = "new-password",
  required = false,
  sound = false,
  disabled = false,
  className,
}: VaultPasswordProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const safeId = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const inputId = `${uid}-input`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const rulesId = `${uid}-rules`;
  const frameId = `vault-frame-${safeId}`;
  const faceId = `vault-face-${safeId}`;
  const metal = METALS[door] ?? METALS.steel;
  const active = checks.slice(
    0,
    Math.min(MOST, Math.max(1, Math.round(rules))),
  );
  const count = active.length;

  const [own, setOwn] = React.useState(defaultValue);
  const controlled = value !== undefined;
  const text = value ?? own;
  const metOf = (v: string) => active.map((r) => r.test(v));
  const met = metOf(text);
  const metCount = met.filter(Boolean).length;
  const locked = count > 0 && metCount === count;
  const metKey = `${count}:${met.map((m) => (m ? 1 : 0)).join("")}`;

  const [revealed, setRevealed] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [seenError, setSeenError] = React.useState(error ?? null);
  if ((error ?? null) !== seenError) {
    setSeenError(error ?? null);
    if (error) setSaid((s) => ({ n: s.n + 1, text: error }));
  }

  const [bolts] = React.useState(() =>
    Array.from({ length: MOST }, (_, i) => motionValue(met[i] ? 1 : 0)),
  );
  const shown = React.useRef<number[]>(bolts.map((b) => b.get()));
  const lockShown = React.useRef(locked);
  const armed = React.useRef<boolean[]>(
    Array.from({ length: MOST }, () => false),
  );
  const wheel = useMotionValue(0);
  const dog = useMotionValue(locked ? 1 : 0);
  const shutter = useMotionValue(0);
  const spoke = React.useRef<number | null>(null);
  const spun = React.useRef(false);
  const counted = React.useRef(count);

  const doorRef = React.useRef<SVGSVGElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  const intent = React.useRef<{ audible: boolean } | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, Math.max(0, Math.round(ms))));
  };

  React.useEffect(() => {
    counted.current = count;
  });

  /** A bolt's place on screen, for its stereo position. */
  const panOf = (i: number) => {
    const rect = doorRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const a = (angleOf(i, counted.current) * Math.PI) / 180;
    return panFrom(rect.left + rect.width * (0.5 + 0.42 * Math.cos(a)), null);
  };

  const latch = (audible: boolean) => {
    if (audible) audio.play("thock", { pitch: 0.62, gain: 0.7 });
    if (!motionSafe) {
      anims.current.get("dog")?.stop();
      dog.set(1);
      return;
    }
    run("dog", animate(dog, 1, springs.flick));
  };

  const lockUp = (audible: boolean) => {
    if (!motionSafe || !spin) {
      latch(audible);
      return;
    }
    spoke.current = audible ? Math.floor(wheel.get() / (360 / SPOKES)) : null;
    spun.current = true;
    // A heavy wheel given a turn and a quarter: the drift spring, no bounce.
    run(
      "wheel",
      animate(wheel, wheel.get() + 450, {
        ...springs.drift,
        onComplete: () => {
          spoke.current = null;
          if (lockShown.current) latch(audible);
        },
      }),
    );
  };

  const unlock = (audible: boolean) => {
    if (audible) audio.play("click", { pitch: 0.55, gain: 0.5 });
    spoke.current = null;
    if (!motionSafe) {
      anims.current.get("dog")?.stop();
      anims.current.get("wheel")?.stop();
      dog.set(0);
      return;
    }
    run("dog", animate(dog, 0, springs.flick));
    // The wheel only winds back a spin it made.
    if (spun.current) {
      spun.current = false;
      run("wheel", animate(wheel, wheel.get() - 360, springs.glide));
    }
  };

  // The bolts follow the rules, whoever changed the password. An edit the
  // visitor made leaves an intent behind, so a host that clears the field
  // moves the bolts in silence.
  React.useEffect(() => {
    const audible = Boolean(intent.current?.audible);
    intent.current = null;
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    const unlocking = !locked && lockShown.current;
    if (unlocking) {
      lockShown.current = false;
      unlock(audible);
    }
    let homing = false;
    for (let i = 0; i < MOST; i += 1) {
      const bolt = bolts[i];
      if (!bolt) continue;
      const target = i < count && met[i] ? 1 : 0;
      if (shown.current[i] === target) continue;
      shown.current[i] = target;
      armed.current[i] = audible && target === 1;
      if (target === 1) homing = true;
      else if (audible) {
        audio.play("click", { pitch: 0.72, gain: 0.45, pan: panOf(i) });
      }
      if (!motionSafe) {
        anims.current.get(`bolt-${i}`)?.stop();
        bolt.set(target);
      } else if (target === 1) {
        run(`bolt-${i}`, animate(bolt, 1, springs.snap));
      } else {
        run(
          `bolt-${i}`,
          animate(bolt, 0, { ...springs.glide, delay: unlocking ? 0.08 : 0 }),
        );
      }
    }
    if (locked && !lockShown.current) {
      lockShown.current = true;
      // The last bolt lands first; then the wheel.
      if (homing && motionSafe) later(200, () => lockUp(audible));
      else lockUp(audible);
    }
    // Only the rules' states move the door; the helpers read refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metKey]);

  // A bolt's thock is heard as it reaches its stop, read from its own value.
  React.useEffect(() => {
    const offs = bolts.map((bolt, i) =>
      bolt.on("change", (p) => {
        if (armed.current[i] && p >= 0.96) {
          armed.current[i] = false;
          audio.play("thock", {
            pitch: r2(0.9 + i * 0.07),
            gain: 0.6,
            pan: panOf(i),
          });
        }
      }),
    );
    const offWheel = wheel.on("change", (w) => {
      if (spoke.current === null) return;
      const at = Math.floor(w / (360 / SPOKES));
      if (at !== spoke.current) {
        spoke.current = at;
        audio.play("click", { pitch: 1.35, gain: 0.3 });
      }
    });
    return () => {
      for (const off of offs) off();
      offWheel();
    };
  }, [bolts, wheel, audio]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const next = event.target.value;
    const before = met;
    const after = metOf(next);
    const changed = after
      .map((m, i) => (m !== before[i] ? i : -1))
      .filter((i) => i >= 0);
    // Only an edit that moves a bolt leaves permission to sound; a host that
    // clears the field later must not inherit it.
    if (changed.length > 0) intent.current = { audible: true };
    if (!controlled) setOwn(next);
    onValueChange?.(next);
    if (changed.length === 0) return;
    const k = after.filter(Boolean).length;
    const wasLocked = before.filter(Boolean).length === count;
    const nowLocked = k === count;
    if (nowLocked !== wasLocked) onLockedChange?.(nowLocked);
    let sentence: string;
    if (nowLocked) {
      sentence = `All ${plural(count, "rule", "rules")} met. The vault is locked.`;
    } else if (changed.length === 1) {
      const i = changed[0] as number;
      const rule = active[i];
      const state = after[i] ? "met" : "no longer met";
      sentence = `${rule?.label ?? "A rule"}: ${state}. ${k} of ${plural(count, "rule", "rules")} met.`;
    } else {
      sentence = `${k} of ${plural(count, "rule", "rules")} met.`;
    }
    setSaid((s) => ({ n: s.n + 1, text: sentence }));
  };

  const toggle = () => {
    if (disabled) return;
    const next = !revealed;
    setRevealed(next);
    audio.play("click", { pitch: next ? 1.1 : 0.9, gain: 0.45 });
    if (!motionSafe) {
      anims.current.get("shutter")?.stop();
      shutter.set(next ? 1 : 0);
      return;
    }
    run("shutter", animate(shutter, next ? 1 : 0, springs.snap));
  };

  const wheelStyle = { rotate: wheel, originX: 0.5, originY: 0.5 };
  const dogTurn = useTransform(dog, (d) => r2(d * 90));
  const lamp = useTransform(
    dog,
    (d) =>
      `color-mix(in oklab, ${LAMP_ON} ${Math.round(Math.min(1, Math.max(0, d)) * 100)}%, ${CAVITY})`,
  );
  const glow = useTransform(dog, (d) => r2(Math.min(1, Math.max(0, d)) * 0.45));
  const shutterTurn = useTransform(shutter, (s) => r2(s * 80));

  const describedBy = [hint ? hintId : "", rulesId, error ? errorId : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cn(
        "@container w-full max-w-[34rem]",
        disabled && "opacity-50",
        className,
      )}
    >
      <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 gap-y-2.5 @[30rem]:grid-cols-[9rem_minmax(0,1fr)] @[30rem]:gap-x-5">
        <div className="col-span-2 flex flex-col gap-1.5 @[30rem]:col-span-1 @[30rem]:col-start-2">
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-foreground"
          >
            {label}
          </label>
          <div className="relative">
            <input
              id={inputId}
              type={revealed ? "text" : "password"}
              name={name}
              value={text}
              onChange={onChange}
              placeholder={placeholder}
              autoComplete={autoComplete}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required={required}
              disabled={disabled}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy || undefined}
              className={cn(
                "block h-10 w-full min-w-0 rounded-3 border bg-surface-1 pr-11 pl-3 text-sm text-foreground transition-colors outline-none placeholder:text-ink-3",
                "focus-visible:border-cobalt-bright focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                "disabled:cursor-not-allowed",
                error ? "border-danger" : "border-input",
              )}
            />
            <button
              type="button"
              aria-pressed={revealed}
              aria-controls={inputId}
              aria-label="Show password"
              disabled={disabled}
              onClick={toggle}
              className={cn(
                "absolute top-1 right-1 inline-flex size-8 items-center justify-center rounded-2 text-ink-3 transition-colors outline-none",
                "hover:bg-surface-2 hover:text-ink-2",
                "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring focus-visible:outline-solid",
                "disabled:cursor-not-allowed",
              )}
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="size-[22px] overflow-visible"
              >
                <circle
                  cx={13}
                  cy={13}
                  r={6.6}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.4}
                />
                <circle cx={13} cy={13} r={4.4} fill={LENS} />
                <circle
                  cx={11.6}
                  cy={11.6}
                  r={1.3}
                  fill="white"
                  opacity={0.75}
                />
                <motion.g
                  style={{ rotate: shutterTurn, originX: 0.5, originY: 0.5 }}
                >
                  {/* Invisible, so the group's box is centred on the pivot. */}
                  <rect
                    x={-4.4}
                    y={-6.4}
                    width={22.8}
                    height={24.8}
                    fill="none"
                  />
                  <path
                    d="M 7 6 L 13 13"
                    stroke={metal.edge}
                    strokeWidth={2.2}
                    strokeLinecap="round"
                  />
                  <circle
                    cx={13}
                    cy={13}
                    r={5.3}
                    fill={metal.part}
                    stroke={metal.edge}
                    strokeWidth={1}
                  />
                  <circle cx={7} cy={6} r={1.5} fill={metal.edge} />
                </motion.g>
              </svg>
            </button>
          </div>
        </div>

        <svg
          ref={doorRef}
          aria-hidden
          viewBox="0 0 120 120"
          className="col-start-1 row-start-2 size-26 self-center @[30rem]:row-span-3 @[30rem]:row-start-1 @[30rem]:size-36"
        >
          <defs>
            <linearGradient id={frameId} x1={0} y1={0} x2={1} y2={1}>
              <stop offset={0} stopColor={metal.frameHi} />
              <stop offset={1} stopColor={metal.frameLo} />
            </linearGradient>
            <radialGradient id={faceId} cx={0.38} cy={0.34} r={0.72}>
              <stop offset={0} stopColor={metal.faceHi} />
              <stop offset={1} stopColor={metal.faceLo} />
            </radialGradient>
          </defs>
          <rect
            x={2}
            y={2}
            width={116}
            height={116}
            rx={16}
            fill={`url(#${frameId})`}
            stroke={metal.edge}
            strokeWidth={1}
          />
          {active.map((rule, i) => (
            <g
              key={rule.id}
              transform={`rotate(${angleOf(i, count)} ${C} ${C})`}
            >
              <rect
                x={C + SEAM - 0.5}
                y={C - 5}
                width={9}
                height={10}
                rx={2}
                fill={CAVITY}
              />
            </g>
          ))}
          <circle cx={C} cy={C} r={SEAM} fill={CAVITY} />
          <circle
            cx={C}
            cy={C}
            r={DOOR}
            fill={`url(#${faceId})`}
            stroke={metal.edge}
            strokeWidth={1}
          />
          <circle
            cx={C}
            cy={C}
            r={37.5}
            fill="none"
            stroke={metal.edge}
            strokeWidth={0.6}
            opacity={0.45}
          />
          {RIVETS.map((p) => (
            <circle
              key={`${p.x}-${p.y}`}
              cx={p.x}
              cy={p.y}
              r={1.1}
              fill={metal.edge}
              opacity={0.55}
            />
          ))}
          {active.map((rule, i) => {
            const travel = bolts[i];
            return travel ? (
              <DoorBolt
                key={rule.id}
                angle={angleOf(i, count)}
                travel={travel}
                metal={metal}
              />
            ) : null;
          })}
          <motion.g style={wheelStyle}>
            <circle cx={C} cy={C} r={29.5} fill="none" />
            {SPOKE_ENDS.map((s) => (
              <g key={`${s.x2}-${s.y2}`}>
                <line
                  x1={s.x1}
                  y1={s.y1}
                  x2={s.x2}
                  y2={s.y2}
                  stroke={metal.edge}
                  strokeWidth={3.2}
                  strokeLinecap="round"
                />
                <circle
                  cx={s.x2}
                  cy={s.y2}
                  r={3.4}
                  fill={metal.part}
                  stroke={metal.edge}
                  strokeWidth={1}
                />
              </g>
            ))}
            <circle
              cx={C}
              cy={C}
              r={10}
              fill={metal.part}
              stroke={metal.edge}
              strokeWidth={1}
            />
          </motion.g>
          <g transform={`translate(${C} ${C})`}>
            <motion.g style={{ rotate: dogTurn, originX: 0.5, originY: 0.5 }}>
              <circle r={5} fill={metal.faceLo} stroke={metal.edge} />
              <rect x={-1} y={-4} width={2} height={8} rx={1} fill={CAVITY} />
            </motion.g>
          </g>
          <motion.circle
            cx={105}
            cy={15}
            r={6}
            style={{ fill: LAMP_ON, opacity: glow }}
          />
          <motion.circle
            cx={105}
            cy={15}
            r={3.4}
            stroke={metal.edge}
            strokeWidth={1}
            style={{ fill: lamp }}
          />
        </svg>

        <ul
          id={rulesId}
          aria-label="Password rules"
          className="col-start-2 row-start-2 grid content-center gap-x-4 gap-y-1 self-center @[30rem]:grid-cols-2"
        >
          {active.map((rule, i) => {
            const travel = bolts[i];
            return (
              <li
                key={rule.id}
                className={cn(
                  "flex min-w-0 items-center gap-2 text-xs leading-4 transition-colors",
                  met[i] ? "text-foreground" : "text-ink-3",
                )}
              >
                {travel ? <RuleGlyph travel={travel} /> : null}
                <span className="truncate" title={rule.label}>
                  {rule.label}
                </span>
                <span className="sr-only">
                  {met[i] ? ", met" : ", not met yet"}
                </span>
              </li>
            );
          })}
        </ul>

        {hint || error ? (
          <div className="col-span-2 row-start-3 grid text-xs leading-4 @[30rem]:col-span-1 @[30rem]:col-start-2">
            {hint ? (
              <p
                id={hintId}
                aria-hidden={error ? true : undefined}
                className={cn(
                  "col-start-1 row-start-1 text-ink-3 transition-opacity",
                  error ? "opacity-0" : "opacity-100",
                )}
              >
                {hint}
              </p>
            ) : null}
            <p
              id={errorId}
              className={cn(
                "col-start-1 row-start-1 text-danger transition-opacity",
                error ? "opacity-100" : "opacity-0",
              )}
            >
              {error}
            </p>
          </div>
        ) : null}
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
