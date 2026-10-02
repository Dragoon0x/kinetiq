"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
  type Transition,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PricingCycle = "monthly" | "yearly";
export type PricingPlinthSize = "sm" | "md" | "lg";

export type PricingPlan = {
  id: string;
  name: string;
  /** One line on who the plan is for. Shown on wide layouts. */
  blurb?: string;
  /** The price per month, billed monthly. */
  monthly: number;
  /** The price per month, billed yearly. */
  yearly: number;
  /** What the plan includes, in the order they check in. */
  features: string[];
};

export type PricingPlinthProps = {
  /** The plans, left to right. @default defaultPricingPlans */
  plans?: PricingPlan[];
  /** Controlled: the chosen plan's id, or null for none. */
  value?: string | null;
  /** Initial plan when uncontrolled. @default the second plan */
  defaultValue?: string | null;
  /** Fires from the press or the key that chose a plan, with its id. */
  onValueChange?: (id: string) => void;
  /** Controlled billing cycle. */
  cycle?: PricingCycle;
  /** Initial billing cycle when uncontrolled. @default "monthly" */
  defaultCycle?: PricingCycle;
  /** Fires from the switch that changed it, with the new cycle. */
  onCycleChange?: (cycle: PricingCycle) => void;
  /** The Continue button, with the chosen plan and cycle. */
  onConfirm?: (id: string, cycle: PricingCycle) => void;
  /** How high the chosen plan rises on its plinth, in px (hover rises 30% of it). @default 14 */
  rise?: number;
  /** How strong the light on the chosen plan is, 0 to 1; 0 puts the spotlight out. @default 0.7 */
  spotlight?: number;
  /** Delay between the odometer's wheels as prices re-roll, in ms. @default 40 */
  stagger?: number;
  /** The heading, and the plans' accessible name. @default "Plans" */
  title?: string;
  /** @default "Monthly" */
  monthlyLabel?: string;
  /** @default "Yearly" */
  yearlyLabel?: string;
  /** The tag that swings in for yearly billing; an empty string hides it. @default "Save N%", the best saving */
  saveLabel?: string;
  /** The Continue button's text for a plan. @default "Continue with {name}" */
  actionLabel?: (plan: PricingPlan) => string;
  /** ISO 4217 code the prices are in. @default "USD" */
  currency?: string;
  /** Locale the prices are written in. @default "en-US" */
  locale?: string;
  /** The prices' type scale. @default "md" */
  size?: PricingPlinthSize;
  /** The light, the chosen ring and the ticks, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Play the switch's click, the plinth's snap and the saving's chime. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

export const defaultPricingPlans: PricingPlan[] = [
  {
    id: "sketch",
    name: "Sketch",
    blurb: "For one person finding their feet.",
    monthly: 0,
    yearly: 0,
    features: ["3 projects", "Shared links", "7-day history", "Community help"],
  },
  {
    id: "studio",
    name: "Studio",
    blurb: "For a small team shipping every week.",
    monthly: 20,
    yearly: 16,
    features: [
      "Unlimited projects",
      "Review mode",
      "90-day history",
      "Priority sync",
    ],
  },
  {
    id: "atelier",
    name: "Atelier",
    blurb: "For studios with clients to answer to.",
    monthly: 45,
    yearly: 36,
    features: [
      "Client portals",
      "Full history",
      "SSO and audit log",
      "A named contact",
    ],
  },
];

const PRICE_SIZE: Record<PricingPlinthSize, string> = {
  sm: "text-xl @lg/plinth:text-2xl",
  md: "text-2xl @lg/plinth:text-4xl",
  lg: "text-3xl @lg/plinth:text-5xl",
};

/** One wheel's row, in em: the window and every digit on the drum. */
const ROW = 1.15;
const DRUM = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
/** Room above the columns for the lamp, the cone and the rise. */
const HEADROOM = 40;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const mod10 = (v: number) => ((v % 10) + 10) % 10;

type Wheel = {
  key: string;
  digit: number | null;
  char: string;
  /** Which wheel this is, from the left: its place in the re-roll's stagger. */
  order: number;
};

/**
 * A price as tokens: digits become wheels keyed by their place from the
 * right, so "$9" to "$16" keeps the units wheel and grows a tens wheel;
 * everything else (the symbol, a separator) is static, keyed by itself.
 */
function tokensOf(text: string): Wheel[] {
  const chars = [...text];
  let place = chars.filter((c) => c >= "0" && c <= "9").length;
  const total = place;
  const seen = new Map<string, number>();
  return chars.map((c) => {
    if (c >= "0" && c <= "9") {
      place -= 1;
      return {
        key: `d${place}`,
        digit: Number(c),
        char: c,
        order: total - 1 - place,
      };
    }
    const n = seen.get(c) ?? 0;
    seen.set(c, n + 1);
    return { key: `s${c}${n}`, digit: null, char: c, order: -1 };
  });
}

/**
 * One odometer wheel. Its turn is a continuous number: the strip shows it
 * modulo ten, so a wheel only ever rolls forward, and a re-roll goes round
 * once more before it settles on its digit.
 */
function DigitWheel({
  digit,
  spin,
  delay,
  motionSafe,
}: {
  digit: number;
  spin: number;
  delay: number;
  motionSafe: boolean;
}) {
  const turn = useMotionValue(digit);
  const y = useTransform(turn, (t) => `${r3(-mod10(t) * ROW)}em`);
  const seen = React.useRef({ digit, spin });
  const anim = React.useRef<AnimationPlaybackControls | null>(null);

  React.useEffect(() => {
    const s = seen.current;
    if (s.digit === digit && s.spin === spin) return;
    const reroll = s.spin !== spin;
    seen.current = { digit, spin };
    anim.current?.stop();
    const now = turn.get();
    const base = Math.round(now);
    const ahead = mod10(digit - mod10(base));
    if (!motionSafe) {
      turn.jump(base + ahead);
      return;
    }
    anim.current = animate(turn, base + ahead + (reroll ? 10 : 0), {
      ...springs.glide,
      delay,
    });
  }, [digit, spin, delay, motionSafe, turn]);

  React.useEffect(
    () => () => {
      anim.current?.stop();
    },
    [],
  );

  return (
    <span className="relative block h-[1.15em] w-[1ch] overflow-clip [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)]">
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        style={{ y }}
      >
        {DRUM.map((d, i) => (
          <span
            key={i}
            className="block h-[1.15em] text-center leading-[1.15em]"
          >
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

function Odometer({
  text,
  stagger,
  motionSafe,
}: {
  text: string;
  stagger: number;
  motionSafe: boolean;
}) {
  // A changed price is a re-roll: every wheel goes round, not just the
  // wheels whose digit moved.
  const [shown, setShown] = React.useState(text);
  const [spin, setSpin] = React.useState(0);
  if (shown !== text) {
    setShown(text);
    setSpin((s) => s + 1);
  }
  const tokens = tokensOf(text);
  return (
    <span
      aria-hidden
      className="inline-flex items-start leading-[1.15em] tabular-nums"
    >
      <AnimatePresence initial={false}>
        {tokens.map((t) => {
          if (t.digit === null) {
            return (
              <span key={t.key} className="block h-[1.15em]">
                {t.char}
              </span>
            );
          }
          const delay = (t.order * Math.max(0, stagger)) / 1000;
          return (
            <motion.span
              key={t.key}
              className="block overflow-clip"
              initial={motionSafe ? { width: "0ch", opacity: 0 } : false}
              animate={{ width: "1ch", opacity: 1 }}
              exit={
                motionSafe
                  ? { width: "0ch", opacity: 0, transition: exitFor() }
                  : { opacity: 0, transition: { duration: 0 } }
              }
              transition={motionSafe ? springs.glide : { duration: 0 }}
            >
              <DigitWheel
                digit={t.digit}
                spin={spin}
                delay={delay}
                motionSafe={motionSafe}
              />
            </motion.span>
          );
        })}
      </AnimatePresence>
    </span>
  );
}

/** A feature row whose tick draws on the flick spring when its plan is chosen. */
function FeatureRow({
  text,
  on,
  delay,
  accent,
  motionSafe,
  appear = false,
}: {
  text: string;
  on: boolean;
  delay: number;
  accent: string;
  motionSafe: boolean;
  /** Draw the tick in when the row arrives, not only when `on` changes. */
  appear?: boolean;
}) {
  return (
    <li
      className="flex items-center gap-2 text-xs leading-5"
      style={{ "--tick": accent } as React.CSSProperties}
    >
      <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0">
        <motion.circle
          cx={8}
          cy={8}
          r={7}
          strokeWidth={1}
          initial={false}
          animate={{ opacity: on ? 1 : 0.55 }}
          transition={{ duration: durations.base, delay: on ? delay : 0 }}
          className={
            on
              ? "fill-[color-mix(in_oklab,var(--tick)_18%,transparent)] stroke-transparent"
              : "fill-none stroke-hairline-strong"
          }
        />
        <motion.path
          d="M4.6 8.3 L7 10.6 L11.4 5.6"
          fill="none"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-(--tick)"
          initial={appear ? { pathLength: 0, opacity: 0 } : false}
          animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
          transition={
            on
              ? motionSafe
                ? {
                    pathLength: { ...springs.flick, delay },
                    opacity: { duration: durations.blink, delay },
                  }
                : { duration: durations.fast }
              : exitFor(durations.fast)
          }
        />
      </svg>
      <span
        className={cn(
          "min-w-0 truncate transition-colors duration-200",
          on ? "text-foreground" : "text-ink-3",
        )}
      >
        {text}
      </span>
    </li>
  );
}

type ColumnProps = {
  plan: PricingPlan;
  index: number;
  chosen: boolean;
  anyChosen: boolean;
  price: string;
  priceSentence: string;
  notes: Record<PricingCycle, string>;
  cycle: PricingCycle;
  rise: number;
  light: number;
  accent: string;
  size: PricingPlinthSize;
  stagger: number;
  focusable: boolean;
  motionSafe: boolean;
  disabled: boolean;
  setNode: (id: string, node: HTMLDivElement | null) => void;
  onChoose: (index: number, event: React.SyntheticEvent) => void;
  onKey: (index: number, event: React.KeyboardEvent<HTMLDivElement>) => void;
};

/**
 * One plan on its plinth. `lifted` carries the card and grows the plinth
 * under it together, so the plan rises from the floor rather than floating
 * off it; `hovered` raises the card alone, a little.
 */
function PlanColumn({
  plan,
  index,
  chosen,
  anyChosen,
  price,
  priceSentence,
  notes,
  cycle,
  rise,
  light,
  accent,
  size,
  stagger,
  focusable,
  motionSafe,
  disabled,
  setNode,
  onChoose,
  onKey,
}: ColumnProps) {
  const uid = React.useId();
  const nameId = `${uid}-name`;
  const descId = `${uid}-desc`;
  const [hover, setHover] = React.useState(false);
  const lifted = useMotionValue(chosen ? 1 : 0);
  const hovered = useMotionValue(0);
  const back = useMotionValue(anyChosen && !chosen ? 1 : 0);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());

  React.useEffect(() => {
    const run = (key: string, c: AnimationPlaybackControls) => {
      anims.current.get(key)?.stop();
      anims.current.set(key, c);
    };
    const t: Transition = motionSafe
      ? springs.glide
      : { duration: durations.fast, ease: easings.enter };
    run("lifted", animate(lifted, chosen ? 1 : 0, t));
    run("back", animate(back, anyChosen && !chosen ? 1 : 0, t));
  }, [chosen, anyChosen, motionSafe, lifted, back]);

  React.useEffect(() => {
    const c = animate(hovered, hover && !chosen && !disabled ? 1 : 0, {
      ...springs.snap,
    });
    return () => c.stop();
  }, [hover, chosen, disabled, hovered]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const travel = motionSafe ? rise : 0;
  const cardY = useTransform(
    [lifted, hovered] as MotionValue<number>[],
    ([l = 0, h = 0]: number[]) => r2(-travel * (l + 0.3 * h * (1 - l))),
  );
  const cardScale = useTransform(back, (b) =>
    motionSafe ? r2(1 - 0.04 * b) : 1,
  );
  const plinthTop = useTransform(lifted, (l) => r2(-travel * l));
  const wash = useTransform(lifted, (l) => r2(clamp01(l) * light));
  const topGlow = useTransform(
    lifted,
    (l) =>
      `color-mix(in oklab, ${accent} ${Math.round(clamp01(l) * (18 + 52 * light))}%, var(--bg-2))`,
  );

  return (
    <div className="relative flex min-w-0 flex-col">
      <motion.div
        ref={(node) => setNode(plan.id, node)}
        role="radio"
        aria-checked={chosen}
        aria-labelledby={nameId}
        aria-describedby={descId}
        aria-disabled={disabled || undefined}
        tabIndex={focusable && !disabled ? 0 : -1}
        onClick={(event) => onChoose(index, event)}
        onKeyDown={(event) => onKey(index, event)}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setHover(true);
        }}
        onPointerLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        className={cn(
          "relative z-[1] mx-1 flex flex-1 flex-col rounded-3 border bg-card p-2.5 text-left transition-[border-color,color,box-shadow] duration-200 outline-none select-none @lg/plinth:mx-1.5 @lg/plinth:p-4",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
          chosen
            ? "text-foreground"
            : anyChosen
              ? "border-hairline text-ink-2 hover:border-hairline-strong"
              : "border-hairline text-foreground hover:border-hairline-strong",
        )}
        style={{
          y: cardY,
          scale: cardScale,
          originX: 0.5,
          originY: 1,
          borderColor: chosen
            ? `color-mix(in oklab, ${accent} 55%, transparent)`
            : undefined,
          boxShadow: chosen
            ? `inset 0 1px 0 color-mix(in oklab, ${accent} ${Math.round(20 + 50 * light)}%, transparent), 0 10px 24px -14px color-mix(in oklab, ${accent} ${Math.round(30 + 40 * light)}%, transparent)`
            : undefined,
        }}
      >
        {/* Where the spotlight lands: a pool of light on the card's head. */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{
            opacity: wash,
            background: `radial-gradient(120% 60% at 50% 0%, color-mix(in oklab, ${accent} 16%, transparent), transparent 72%)`,
          }}
        />
        <span
          id={nameId}
          className="relative truncate text-xs font-medium @lg/plinth:text-sm"
        >
          {plan.name}
        </span>
        {plan.blurb ? (
          <span className="mt-0.5 hidden text-xs leading-4 text-ink-3 @lg/plinth:line-clamp-2">
            {plan.blurb}
          </span>
        ) : null}
        <span className="mt-1.5 flex items-baseline gap-1 @lg/plinth:mt-3">
          <span
            className={cn(
              "font-mono font-medium tracking-tight",
              PRICE_SIZE[size] ?? PRICE_SIZE.md,
            )}
          >
            <Odometer text={price} stagger={stagger} motionSafe={motionSafe} />
          </span>
          <span className="text-[11px] text-ink-3">/mo</span>
        </span>
        <span className="mt-0.5 hidden h-4 text-[11px] leading-4 text-ink-3 @lg/plinth:grid">
          {(["monthly", "yearly"] as const).map((c) => (
            <motion.span
              key={c}
              aria-hidden
              className="col-start-1 row-start-1 truncate"
              initial={false}
              animate={{ opacity: c === cycle ? 1 : 0 }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              {notes[c]}
            </motion.span>
          ))}
        </span>
        <span id={descId} className="sr-only">
          {priceSentence}. Includes {plan.features.join(", ")}.
        </span>
        <ul
          aria-hidden
          className="mt-3 hidden flex-col gap-1 border-t border-hairline pt-3 @lg/plinth:flex"
        >
          {plan.features.map((f, i) => (
            <FeatureRow
              key={f}
              text={f}
              on={chosen}
              delay={0.08 + i * cascade(plan.features.length)}
              accent={accent}
              motionSafe={motionSafe}
            />
          ))}
        </ul>
      </motion.div>
      {/* The plinth: a top face in front of the card's foot, then the block.
          Its riser grows with the lift so card and plinth rise together. */}
      <div aria-hidden className="relative h-4 @lg/plinth:h-5">
        <motion.div
          className="absolute inset-x-0 bottom-0 flex flex-col overflow-clip rounded-b-1 border-x border-b border-hairline"
          style={{ top: plinthTop }}
        >
          <motion.span
            className="block h-1.5 shrink-0 [clip-path:polygon(3%_0,97%_0,100%_100%,0_100%)]"
            style={{ background: topGlow }}
          />
          <span className="block flex-1 bg-linear-to-b from-surface-2 to-surface-1" />
        </motion.div>
      </div>
    </div>
  );
}

/**
 * A pricing table where the plan you pick rises to meet you. Three plans
 * stand on plinths along a floor; choosing one lifts it on the glide spring
 * as its plinth grows under it, a spotlight pans across to it from above on
 * the same spring, the others step back, and the chosen plan's features
 * check in one after another, each tick drawn on the flick spring.
 *
 * The Monthly/Yearly switch re-rolls every price on an odometer: each digit
 * is a wheel that goes round once more and settles on its new digit on
 * glide, the wheels a beat apart, and a "save" tag swings in on its string
 * on the recoil spring. The plans are a real radiogroup — arrow keys move
 * and choose, Home and End jump, Space and Enter choose — and so is the
 * switch. Under reduced motion nothing rises, pans or spins: the light and
 * the ring cross-fade to the chosen plan, wheels land on their digits, the
 * tag fades, and the prices still change.
 */
export function PricingPlinth({
  plans = defaultPricingPlans,
  value,
  defaultValue,
  onValueChange,
  cycle,
  defaultCycle = "monthly",
  onCycleChange,
  onConfirm,
  rise = 14,
  spotlight = 0.7,
  stagger = 40,
  title = "Plans",
  monthlyLabel = "Monthly",
  yearlyLabel = "Yearly",
  saveLabel,
  actionLabel = (plan) => `Continue with ${plan.name}`,
  currency = "USD",
  locale = "en-US",
  size = "md",
  accent = "var(--accent-bright)",
  sound = false,
  disabled = false,
  className,
}: PricingPlinthProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const yearlyNoteId = `${uid}-saving`;
  const lift = Math.max(0, Math.min(28, rise));
  const light = clamp01(spotlight);
  const n = Math.max(1, plans.length);

  const [ownValue, setOwnValue] = React.useState<string | null>(
    defaultValue === undefined
      ? ((plans[1] ?? plans[0])?.id ?? null)
      : defaultValue,
  );
  const chosenId = value === undefined ? ownValue : value;
  const chosenIndex = plans.findIndex((p) => p.id === chosenId);
  const chosen = chosenIndex >= 0 ? plans[chosenIndex] : undefined;
  const [ownCycle, setOwnCycle] = React.useState<PricingCycle>(defaultCycle);
  const billing = cycle ?? ownCycle;
  const yearly = billing === "yearly";

  const money = React.useMemo(() => {
    const whole = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    });
    const cents = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return (v: number) => (Number.isInteger(v) ? whole : cents).format(v);
  }, [locale, currency]);

  const best = plans.reduce(
    (m, p) =>
      p.monthly > 0
        ? Math.max(m, Math.round((1 - p.yearly / p.monthly) * 100))
        : m,
    0,
  );
  const tag = saveLabel ?? (best > 0 ? `Save ${best}%` : "");

  const priceOf = (p: PricingPlan) => (yearly ? p.yearly : p.monthly);
  const sentenceOf = (p: PricingPlan) => {
    const v = priceOf(p);
    if (v === 0) return "Free";
    return yearly
      ? `${money(v)} a month, billed yearly at ${money(r2(v * 12))}`
      : `${money(v)} a month, billed monthly`;
  };

  // The narrow feature list draws its ticks in when the plan changes, not on
  // the first render.
  const [appeared, setAppeared] = React.useState(false);
  const [firstId] = React.useState(chosenId);
  if (!appeared && chosenId !== firstId) setAppeared(true);

  // Spoken once per change, from the plan and cycle just shown.
  const [spoken, setSpoken] = React.useState("");
  const [seen, setSeen] = React.useState(`${chosenId}|${billing}`);
  if (seen !== `${chosenId}|${billing}`) {
    setSeen(`${chosenId}|${billing}`);
    setSpoken(chosen ? `${chosen.name}, ${sentenceOf(chosen)}` : "");
  }

  const slot = useMotionValue(Math.max(0, chosenIndex));
  const beam = useMotionValue(chosen ? 1 : 0);
  const rootRef = React.useRef<HTMLElement | null>(null);
  const nodes = React.useRef(new Map<string, HTMLDivElement>());
  const cycleNodes = React.useRef(new Map<PricingCycle, HTMLButtonElement>());
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());

  // The spotlight pans to the chosen plan on glide; under reduced motion it
  // goes out and comes up again where the plan is.
  const shownIndex = React.useRef(chosenIndex);
  React.useEffect(() => {
    if (shownIndex.current === chosenIndex) return;
    shownIndex.current = chosenIndex;
    const stop = (key: string) => anims.current.get(key)?.stop();
    if (chosenIndex < 0) {
      stop("slot");
      const c = animate(beam, 0, exitFor());
      anims.current.set("beam", c);
      return;
    }
    if (motionSafe && beam.get() > 0.05) {
      anims.current.get("slot")?.stop();
      anims.current.set("slot", animate(slot, chosenIndex, springs.glide));
      anims.current.get("beam")?.stop();
      anims.current.set(
        "beam",
        animate(beam, 1, { duration: durations.base, ease: easings.enter }),
      );
      return;
    }
    stop("slot");
    slot.jump(chosenIndex);
    beam.jump(0);
    anims.current.get("beam")?.stop();
    anims.current.set(
      "beam",
      animate(beam, 1, { duration: durations.base, ease: easings.enter }),
    );
  }, [chosenIndex, motionSafe, slot, beam]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const setNode = React.useCallback(
    (id: string, node: HTMLDivElement | null) => {
      if (node) nodes.current.set(id, node);
      else nodes.current.delete(id);
    },
    [],
  );

  const panOf = (el: Element | null | undefined) => {
    const rect = el?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const choose = (index: number, focus: boolean) => {
    const plan = plans[index];
    if (!plan || disabled) return;
    const node = nodes.current.get(plan.id);
    if (focus) node?.focus({ preventScroll: true });
    if (plan.id === chosenId) return;
    if (value === undefined) setOwnValue(plan.id);
    onValueChange?.(plan.id);
    audio.play("snap", {
      pitch: r2(0.92 + 0.1 * index),
      gain: 0.5,
      pan: panOf(node),
    });
  };

  const onPlanKey = (
    index: number,
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    const last = plans.length - 1;
    let to = -1;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        to = index >= last ? 0 : index + 1;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        to = index <= 0 ? last : index - 1;
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = last;
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        choose(index, false);
        return;
      default:
        return;
    }
    event.preventDefault();
    choose(to, true);
  };

  const setBilling = (next: PricingCycle, focus: boolean) => {
    if (disabled) return;
    const node = cycleNodes.current.get(next);
    if (focus) node?.focus({ preventScroll: true });
    if (next === billing) return;
    if (cycle === undefined) setOwnCycle(next);
    onCycleChange?.(next);
    const pan = panOf(node);
    audio.play("click", {
      pitch: next === "yearly" ? 1.08 : 0.94,
      gain: 0.5,
      pan,
    });
    if (next === "yearly" && tag) {
      audio.play("chime", {
        pitch: r2(1 + Math.min(0.5, best / 100)),
        gain: 0.32,
        pan,
      });
    }
  };

  const onCycleKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const k = event.key;
    if (
      [
        "ArrowRight",
        "ArrowDown",
        "ArrowLeft",
        "ArrowUp",
        "Home",
        "End",
      ].includes(k)
    ) {
      event.preventDefault();
      const next: PricingCycle =
        k === "Home"
          ? "monthly"
          : k === "End"
            ? "yearly"
            : billing === "monthly"
              ? "yearly"
              : "monthly";
      setBilling(next, true);
    }
  };

  const coneLeft = useTransform(
    slot,
    (s) =>
      `calc((100% - ${n - 1} * var(--gap)) / ${n} * ${r3(s + 0.5)} + ${r3(s)} * var(--gap))`,
  );
  const coneOpacity = useTransform(beam, (b) => r2(b * light));

  const snapT: Transition = motionSafe
    ? springs.snap
    : { duration: durations.fast };
  const swing: Transition = yearly
    ? motionSafe
      ? { rotate: springs.recoil, opacity: { duration: durations.fast } }
      : { duration: durations.base }
    : exitFor(durations.base);

  return (
    <article
      ref={rootRef}
      aria-labelledby={titleId}
      className={cn(
        "@container/plinth w-full max-w-4xl",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="flex h-8 items-center justify-between gap-3">
        <h3
          id={titleId}
          className="min-w-0 truncate text-sm font-medium text-foreground"
        >
          {title}
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          {tag ? (
            // The tag hangs from a pin 8px down the header: swinging in from
            // 24 degrees, its far corner still clears the component's top.
            <span aria-hidden className="relative block h-8">
              <motion.span
                className="relative top-2 flex flex-col items-center"
                style={{ originX: 0.5, originY: 0 }}
                initial={false}
                animate={
                  yearly
                    ? { rotate: 0, opacity: 1 }
                    : { rotate: motionSafe ? -24 : 0, opacity: 0 }
                }
                transition={swing}
              >
                <span className="block size-1 rounded-full bg-ink-3" />
                <span className="block h-1 w-px bg-ink-3" />
                <span
                  className="relative block rounded-1 py-0.5 pr-1.5 pl-3 text-[10px] leading-3 font-medium whitespace-nowrap"
                  style={{
                    color: accent,
                    background: `color-mix(in oklab, ${accent} 16%, var(--bg-1))`,
                    boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${accent} 35%, transparent)`,
                  }}
                >
                  <span className="absolute top-1/2 left-1 block size-1 -translate-y-1/2 rounded-full bg-background" />
                  {tag}
                </span>
              </motion.span>
            </span>
          ) : null}
          <div
            role="radiogroup"
            aria-label="Billing"
            className="relative grid h-8 grid-cols-2 rounded-full border border-hairline bg-surface-2 p-0.5"
          >
            <motion.span
              aria-hidden
              className="absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-2px)] rounded-full border border-hairline-strong bg-card"
              initial={false}
              animate={{ x: yearly ? "100%" : "0%" }}
              transition={snapT}
            />
            {(["monthly", "yearly"] as const).map((c) => {
              const on = c === billing;
              return (
                <button
                  key={c}
                  ref={(node) => {
                    if (node) cycleNodes.current.set(c, node);
                    else cycleNodes.current.delete(c);
                  }}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-describedby={
                    c === "yearly" && tag ? yearlyNoteId : undefined
                  }
                  tabIndex={on ? 0 : -1}
                  disabled={disabled}
                  onClick={() => setBilling(c, false)}
                  onKeyDown={onCycleKey}
                  className={cn(
                    "relative z-[1] flex h-full cursor-pointer items-center justify-center rounded-full px-3 text-xs transition-colors outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    "disabled:cursor-not-allowed",
                    on ? "text-foreground" : "text-ink-3 hover:text-ink-2",
                  )}
                >
                  {c === "monthly" ? monthlyLabel : yearlyLabel}
                </button>
              );
            })}
            {tag ? (
              <span id={yearlyNoteId} className="sr-only">
                {tag}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative mt-3 [--gap:4px] @lg/plinth:mt-4 @lg/plinth:[--gap:12px]">
        {/* The light: a lamp, its cone and the pool on the floor, all on
            one column position that pans on glide. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-clip"
        >
          <motion.div
            className="absolute inset-y-0 -translate-x-1/2"
            style={{
              left: coneLeft,
              width: `calc((100% - ${n - 1} * var(--gap)) / ${n} * 1.3)`,
              opacity: coneOpacity,
            }}
          >
            <span className="absolute top-0 left-1/2 block h-1 w-6 -translate-x-1/2 rounded-b-1 bg-ink-3/50" />
            <span
              className="absolute inset-x-0 top-1 bottom-0 block [mask-image:linear-gradient(to_right,transparent,black_32%,black_68%,transparent)] [clip-path:polygon(42%_0,58%_0,100%_100%,0_100%)]"
              style={{
                background: `linear-gradient(to bottom, color-mix(in oklab, ${accent} 60%, transparent), color-mix(in oklab, ${accent} 24%, transparent) ${HEADROOM}px, color-mix(in oklab, ${accent} 9%, transparent) ${HEADROOM * 4}px, transparent)`,
              }}
            />
            <span
              className="absolute inset-x-0 -bottom-2 block h-6"
              style={{
                background: `radial-gradient(closest-side, color-mix(in oklab, ${accent} 40%, transparent), transparent)`,
              }}
            />
          </motion.div>
          <span className="absolute inset-x-0 bottom-0 block h-px bg-hairline-strong" />
        </div>

        <div
          role="radiogroup"
          aria-labelledby={titleId}
          aria-disabled={disabled || undefined}
          className="relative grid gap-(--gap)"
          style={{
            gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
            paddingTop: HEADROOM,
          }}
        >
          {plans.map((plan, i) => (
            <PlanColumn
              key={plan.id}
              plan={plan}
              index={i}
              chosen={i === chosenIndex}
              anyChosen={chosenIndex >= 0}
              price={money(priceOf(plan))}
              priceSentence={sentenceOf(plan)}
              notes={{
                monthly: plan.monthly === 0 ? "Free, always" : "Billed monthly",
                yearly:
                  plan.yearly === 0
                    ? "Free, always"
                    : `${money(r2(plan.yearly * 12))} billed yearly`,
              }}
              cycle={billing}
              rise={lift}
              light={light}
              accent={accent}
              size={size}
              stagger={stagger}
              focusable={chosenIndex >= 0 ? i === chosenIndex : i === 0}
              motionSafe={motionSafe}
              disabled={disabled}
              setNode={setNode}
              onChoose={(index) => choose(index, false)}
              onKey={onPlanKey}
            />
          ))}
        </div>
      </div>

      {/* Narrow: the chosen plan's features, under the floor. */}
      {chosen ? (
        <div className="mt-4 @lg/plinth:hidden">
          <p className="text-[11px] leading-4 text-ink-3">
            {chosen.name} includes
          </p>
          <ul key={chosen.id} aria-hidden className="mt-2 flex flex-col gap-1">
            {chosen.features.map((f, i) => (
              <FeatureRow
                key={f}
                text={f}
                on
                appear={appeared}
                delay={0.08 + i * cascade(chosen.features.length)}
                accent={accent}
                motionSafe={motionSafe}
              />
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 @lg/plinth:mt-5 @lg/plinth:flex-row @lg/plinth:items-center @lg/plinth:justify-between">
        <p className="min-w-0 truncate text-xs text-ink-2">
          {chosen ? `${chosen.name} · ${sentenceOf(chosen)}` : "Choose a plan"}
        </p>
        <button
          type="button"
          disabled={disabled || !chosen}
          onClick={() => {
            if (chosen) onConfirm?.(chosen.id, billing);
          }}
          className={cn(
            "inline-grid h-9 shrink-0 cursor-pointer items-center rounded-2 px-4 text-sm font-medium text-primary-foreground transition-[filter] outline-none hover:brightness-110",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          style={{ background: "var(--primary)" }}
        >
          {plans.map((p) => (
            <span
              key={p.id}
              aria-hidden={p.id !== chosen?.id}
              className={cn(
                "col-start-1 row-start-1 text-center",
                p.id !== chosen?.id && "invisible",
              )}
            >
              {actionLabel(p)}
            </span>
          ))}
          {!chosen ? (
            <span className="col-start-1 row-start-1 text-center">
              Continue
            </span>
          ) : null}
        </button>
      </div>
      <span aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </article>
  );
}
