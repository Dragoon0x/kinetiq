"use client";

import * as React from "react";

import { Anchor, Hammer, Star, Waves } from "lucide-react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;

/** Crest stage geometry, px. */
const SHIELD_W = 148;
const SHIELD_H = 164;
const STAGE_H = 194;
const FIELD_INSET = 8;
const BORDURE_INSET = 11;

/** The ribbon overlaps the shield's lower field, wider than the shield. */
const RIBBON_W = 168;
const RIBBON_H = 26;
const RIBBON_TOP = 134;

/** Charge glyph box and its impact ring. */
const CHARGE_SIZE = 42;
const RING_D = 58;
const SWEEP_W = 26;

/** How far the shield drops from above before settling on `springs.recoil`. */
const SHIELD_DROP = 46;
/** The charge starts oversized and shrinks in on `springs.flick`. */
const STAMP_START_SCALE = 1.6;
/** The field wipe's fixed duration — a tween, never a spring. */
const WIPE_S = 0.4;
/** The finishing light sweep across the whole crest. */
const SWEEP_S = 0.6;
/** How long the "crest struck" caption holds before it clears. */
const CAPTION_MS = 1600;

/** Six fixed spark vectors fired from the crest's centre. No Math.random. */
const SPARK_COUNT = 6;
const SPARK_SPREAD = 26;
const SPARKS = Array.from({ length: SPARK_COUNT }, (_, i) => {
  const angle = (i / SPARK_COUNT) * TAU - TAU / 4;
  return {
    dx: Math.cos(angle) * SPARK_SPREAD,
    dy: Math.sin(angle) * SPARK_SPREAD,
  };
});

const SHEEN =
  "linear-gradient(115deg, transparent 0%, oklch(1 0 0 / 0.05) 22%, oklch(1 0 0 / 0.55) 50%, oklch(1 0 0 / 0.05) 78%, transparent 100%)";

/** Four shield silhouettes, each a fixed clip-path. */
const SHAPES = [
  {
    word: "heraldic",
    clip: "polygon(0% 0%, 100% 0%, 100% 55%, 50% 100%, 0% 55%)",
  },
  { word: "round", clip: "circle(50% at 50% 50%)" },
  {
    word: "kite",
    clip: "polygon(50% 0%, 100% 18%, 82% 75%, 50% 100%, 18% 75%, 0% 18%)",
  },
  {
    word: "banner",
    clip: "polygon(0% 0%, 100% 0%, 100% 82%, 50% 68%, 0% 82%)",
  },
] as const;

/** Four field patterns, painted from the two-tone pair at render time. */
const FIELD_WORDS = ["solid", "per pale", "chevron", "bordure"] as const;

/** Four charge glyphs, cycled by index — never a stored component reference. */
const CHARGE_WORDS = ["anchor", "hammer", "star", "wave"] as const;

/** Five fixed two-tone combinations. CSS transitions carry every colour
 * change — motion never interpolates these color-mix()/var() strings. */
const COLOUR_PAIRS = [
  {
    blazon: "azure and or",
    primary: "var(--primary)",
    secondary: "var(--warn)",
  },
  {
    blazon: "gules and argent",
    primary: "var(--danger)",
    secondary: "var(--ink-3)",
  },
  { blazon: "sable and or", primary: "var(--ink-2)", secondary: "var(--warn)" },
  {
    blazon: "vert and argent",
    primary: "var(--success)",
    secondary: "var(--ink-3)",
  },
  {
    blazon: "purpure and or",
    primary: "color-mix(in oklab, var(--primary) 55%, var(--danger) 45%)",
    secondary: "var(--warn)",
  },
] as const;

/** `SHAPES[0]` etc. are literal-index tuple reads — always defined — so this
 * guards every variable-indexed lookup without a raw fallback at each call. */
const shapeAt = (i: number) => SHAPES[i] ?? SHAPES[0];
const fieldWordAt = (i: number) => FIELD_WORDS[i] ?? FIELD_WORDS[0];
const chargeWordAt = (i: number) => CHARGE_WORDS[i] ?? CHARGE_WORDS[0];
const colourAt = (i: number) => COLOUR_PAIRS[i] ?? COLOUR_PAIRS[0];

const cap = (word: string): string =>
  word.replace(/(^|\s)\w/g, (m) => m.toUpperCase());

/** The field's paint, clipped to the current shape by its parent. A pure
 * lookup returning the rendered elements, never a component reference. */
function fieldNode(
  index: number,
  primary: string,
  secondary: string,
  shapeClip: string,
): React.JSX.Element {
  switch (index % 4) {
    case 1:
      // Per pale — split down the middle.
      return (
        <>
          <span
            className="absolute inset-y-0 left-0 w-1/2 transition-colors duration-300"
            style={{ backgroundColor: primary }}
          />
          <span
            className="absolute inset-y-0 right-0 w-1/2 transition-colors duration-300"
            style={{ backgroundColor: secondary }}
          />
        </>
      );
    case 2:
      // Chevron — a primary band over the secondary field.
      return (
        <>
          <span
            className="absolute inset-0 transition-colors duration-300"
            style={{ backgroundColor: secondary }}
          />
          <span
            className="absolute inset-0 transition-colors duration-300"
            style={{
              backgroundColor: primary,
              clipPath:
                "polygon(0% 100%, 50% 42%, 100% 100%, 100% 78%, 50% 58%, 0% 78%)",
            }}
          />
        </>
      );
    case 3:
      // Bordure — a secondary edge around a primary inner field, the same
      // shape nested smaller, matching the house shield/field inset idiom.
      return (
        <>
          <span
            className="absolute inset-0 transition-colors duration-300"
            style={{ backgroundColor: secondary }}
          />
          <span
            className="absolute transition-colors duration-300"
            style={{
              inset: BORDURE_INSET,
              clipPath: shapeClip,
              backgroundColor: primary,
            }}
          />
        </>
      );
    default:
      return (
        <span
          className="absolute inset-0 transition-colors duration-300"
          style={{ backgroundColor: primary }}
        />
      );
  }
}

/** The charge glyph, cycling through a fixed set by index. A pure lookup
 * returning the rendered element, never a component reference. */
function chargeGlyph(
  index: number,
  className: string,
  style: React.CSSProperties,
): React.JSX.Element {
  switch (index % 4) {
    case 1:
      return <Hammer aria-hidden className={className} style={style} />;
    case 2:
      return <Star aria-hidden className={className} style={style} />;
    case 3:
      return <Waves aria-hidden className={className} style={style} />;
    default:
      return <Anchor aria-hidden className={className} style={style} />;
  }
}

type Phase = "idle" | "assembling";

export type GuildCrestProps = {
  /** The guild whose name rides the ribbon. @default an invented harbour guild */
  name?: string;
  /** Fires once, right as the finished crest is struck, with its blazon. */
  onStrike?: (blazon: string) => void;
  className?: string;
};

/**
 * A heraldic crest that assembles itself from parts, one layer at a time.
 * The shield shape, field pattern, charge, and banner ribbon are all
 * independently cycled by four small buttons, drawing from fixed option
 * tables and a fixed two-tone colour pair — colour rides CSS transitions,
 * never motion interpolation. Pressing "Assemble the crest" runs the set
 * piece: the shield drops and settles on `springs.recoil`, the field wipes
 * across it on a tween, the charge stamps on from an oversized scale on
 * `springs.flick` with a small ring, the ribbon unfurls from its centre on
 * `springs.snap` as the guild name fades in, and a final sweep with six fixed
 * sparks closes it out under a mono "crest struck" caption — each layer
 * waits for the one before it to settle, because the sequencing is the
 * ceremony and a crest that appears all at once is just an image. Once
 * struck, cycling any single part re-runs only that part's own layer
 * entrance rather than the whole build.
 * Reduced motion: pressing assemble shows the finished crest immediately
 * with the caption — no drop, wipe, stamp, unfurl, sweep, or sparks — and
 * cycling a part swaps it instantly.
 */
export function GuildCrest({
  name = "IRONTIDE GUILD",
  onStrike,
  className,
}: GuildCrestProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [shapeIndex, setShapeIndex] = React.useState(0);
  const [fieldIndex, setFieldIndex] = React.useState(0);
  const [chargeIndex, setChargeIndex] = React.useState(0);
  const [colourIndex, setColourIndex] = React.useState(0);

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [assembled, setAssembled] = React.useState(false);
  const [chargeRingKey, setChargeRingKey] = React.useState(0);
  const [sweepKey, setSweepKey] = React.useState(0);
  const [sparkKey, setSparkKey] = React.useState(0);
  const [struckCaption, setStruckCaption] = React.useState(false);
  const [announce, setAnnounce] = React.useState("");

  const phaseRef = React.useRef<Phase>("idle");
  const onStrikeRef = React.useRef(onStrike);
  React.useEffect(() => {
    onStrikeRef.current = onStrike;
  }, [onStrike]);

  const shieldY = useMotionValue<number>(-SHIELD_DROP);
  const shieldOpacity = useMotionValue<number>(0);
  const wipeProgress = useMotionValue<number>(0);
  const chargeScale = useMotionValue<number>(STAMP_START_SCALE);
  const chargeOpacity = useMotionValue<number>(0);
  const ribbonScaleX = useMotionValue<number>(0);
  const nameOpacity = useMotionValue<number>(0);

  const shieldYAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const shieldOpacityAnim = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );
  const wipeAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const chargeScaleAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const chargeOpacityAnim = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );
  const ribbonAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const nameOpacityAnim = React.useRef<ReturnType<typeof animate> | null>(null);

  const captionTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (captionTimer.current !== null)
        window.clearTimeout(captionTimer.current);
      shieldYAnim.current?.stop();
      shieldOpacityAnim.current?.stop();
      wipeAnim.current?.stop();
      chargeScaleAnim.current?.stop();
      chargeOpacityAnim.current?.stop();
      ribbonAnim.current?.stop();
      nameOpacityAnim.current?.stop();
    };
  }, []);

  const wipeClip = useTransform(wipeProgress, (p) => {
    const hidden = Math.max(0, Math.min(100, (1 - p) * 100));
    return `inset(0% ${hidden}% 0% 0%)`;
  });

  const shape = shapeAt(shapeIndex);
  const fieldWord = fieldWordAt(fieldIndex);
  const chargeWord = chargeWordAt(chargeIndex);
  const colour = colourAt(colourIndex);
  const blazon = `${shape.word} · ${fieldWord} · ${chargeWord} · ${colour.blazon}`;

  const rimBg = `color-mix(in oklab, ${colour.primary} 42%, var(--card) 58%)`;
  const chargeStyle: React.CSSProperties = {
    color: colour.secondary,
    filter: "drop-shadow(0 1px 1.5px oklch(0 0 0 / 0.35))",
  };

  const flashCaption = () => {
    setStruckCaption(true);
    if (captionTimer.current !== null)
      window.clearTimeout(captionTimer.current);
    captionTimer.current = window.setTimeout(() => {
      captionTimer.current = null;
      setStruckCaption(false);
    }, CAPTION_MS);
  };

  const handleAssemble = () => {
    if (phaseRef.current === "assembling") return;
    const struckBlazon = blazon;

    if (!motionSafe) {
      shieldY.jump(0);
      shieldOpacity.jump(1);
      wipeProgress.jump(1);
      chargeScale.jump(1);
      chargeOpacity.jump(1);
      ribbonScaleX.jump(1);
      nameOpacity.jump(1);
      setAssembled(true);
      flashCaption();
      setAnnounce("Crest struck.");
      onStrikeRef.current?.(struckBlazon);
      return;
    }

    phaseRef.current = "assembling";
    setPhase("assembling");
    setAssembled(true);
    setAnnounce("Assembling the crest.");

    shieldYAnim.current?.stop();
    shieldOpacityAnim.current?.stop();
    wipeAnim.current?.stop();
    chargeScaleAnim.current?.stop();
    chargeOpacityAnim.current?.stop();
    ribbonAnim.current?.stop();
    nameOpacityAnim.current?.stop();

    // Stage 1 — the shield drops and settles.
    shieldY.set(-SHIELD_DROP);
    shieldOpacity.set(0);
    shieldOpacityAnim.current = animate(shieldOpacity, 1, {
      duration: durations.fast,
      ease: easings.enter,
    });
    shieldYAnim.current = animate(shieldY, 0, {
      ...springs.recoil,
      onComplete: () => {
        // Stage 2 — the field wipes across it.
        wipeProgress.set(0);
        wipeAnim.current = animate(wipeProgress, 1, {
          duration: WIPE_S,
          ease: easings.move,
          onComplete: () => {
            // Stage 3 — the charge stamps on.
            chargeScale.set(STAMP_START_SCALE);
            chargeOpacity.set(0);
            chargeOpacityAnim.current = animate(chargeOpacity, 1, {
              duration: durations.fast,
              ease: easings.enter,
            });
            chargeScaleAnim.current = animate(chargeScale, 1, {
              ...springs.flick,
              onComplete: () => {
                setChargeRingKey((k) => k + 1);

                // Stage 4 — the ribbon unfurls, the name fades in.
                ribbonScaleX.set(0);
                nameOpacity.set(0);
                nameOpacityAnim.current = animate(nameOpacity, 1, {
                  duration: durations.base,
                  ease: easings.enter,
                });
                ribbonAnim.current = animate(ribbonScaleX, 1, {
                  ...springs.snap,
                  onComplete: () => {
                    // Stage 5 — sweep, sparks, and the struck caption.
                    setSweepKey((k) => k + 1);
                    setSparkKey((k) => k + 1);
                    flashCaption();
                    setAnnounce("Crest struck.");
                    phaseRef.current = "idle";
                    setPhase("idle");
                    onStrikeRef.current?.(struckBlazon);
                  },
                });
              },
            });
          },
        });
      },
    });
  };

  const cycleGuard = !assembled || phase === "assembling";

  const handleCycleShape = () => {
    if (cycleGuard) return;
    const next = (shapeIndex + 1) % SHAPES.length;
    setShapeIndex(next);
    setAnnounce(`Shield shape: ${shapeAt(next).word}.`);
    if (!motionSafe) return;
    shieldYAnim.current?.stop();
    shieldOpacityAnim.current?.stop();
    shieldY.set(-SHIELD_DROP);
    shieldOpacity.set(0);
    shieldOpacityAnim.current = animate(shieldOpacity, 1, {
      duration: durations.fast,
      ease: easings.enter,
    });
    shieldYAnim.current = animate(shieldY, 0, springs.recoil);
  };

  const handleCycleField = () => {
    if (cycleGuard) return;
    const next = (fieldIndex + 1) % FIELD_WORDS.length;
    setFieldIndex(next);
    setAnnounce(`Field pattern: ${fieldWordAt(next)}.`);
    if (!motionSafe) return;
    wipeAnim.current?.stop();
    wipeProgress.set(0);
    wipeAnim.current = animate(wipeProgress, 1, {
      duration: WIPE_S,
      ease: easings.move,
    });
  };

  const handleCycleCharge = () => {
    if (cycleGuard) return;
    const next = (chargeIndex + 1) % CHARGE_WORDS.length;
    setChargeIndex(next);
    setAnnounce(`Charge: ${chargeWordAt(next)}.`);
    if (!motionSafe) return;
    chargeScaleAnim.current?.stop();
    chargeOpacityAnim.current?.stop();
    chargeScale.set(STAMP_START_SCALE);
    chargeOpacity.set(0);
    chargeOpacityAnim.current = animate(chargeOpacity, 1, {
      duration: durations.fast,
      ease: easings.enter,
    });
    chargeScaleAnim.current = animate(chargeScale, 1, {
      ...springs.flick,
      onComplete: () => setChargeRingKey((k) => k + 1),
    });
  };

  const handleCycleColour = () => {
    if (cycleGuard) return;
    const next = (colourIndex + 1) % COLOUR_PAIRS.length;
    setColourIndex(next);
    setAnnounce(`Colours: ${colourAt(next).blazon}.`);
  };

  const assembleDisabled = phase === "assembling";

  return (
    <div
      className={cn(
        "flex w-full max-w-md flex-col items-center gap-4 rounded-4 border border-hairline bg-surface-1 p-6",
        className,
      )}
    >
      <div
        role="img"
        aria-label={`${name} crest: ${blazon}`}
        className="relative"
        style={{ width: SHIELD_W, height: STAGE_H }}
      >
        <div aria-hidden className="contents">
          {/* THE SHIELD — layers 1 (shape/rim), 2 (field, wipe-revealed),
              and 3 (charge, stamped on) all live on this one node so a
              re-trigger only ever touches the layer that changed. */}
          <motion.div
            className="absolute top-0 left-0"
            style={{
              width: SHIELD_W,
              height: SHIELD_H,
              y: shieldY,
              opacity: shieldOpacity,
            }}
          >
            <span
              className="absolute inset-0 transition-colors duration-300"
              style={{
                clipPath: shape.clip,
                backgroundColor: rimBg,
                boxShadow: "var(--edge-highlight)",
              }}
            />
            <span
              className="absolute overflow-hidden"
              style={{
                inset: FIELD_INSET,
                clipPath: shape.clip,
              }}
            >
              <motion.span
                className="absolute inset-0"
                style={{ clipPath: wipeClip }}
              >
                {fieldNode(
                  fieldIndex,
                  colour.primary,
                  colour.secondary,
                  shape.clip,
                )}
              </motion.span>
            </span>

            <motion.div
              className="absolute top-[42%] left-1/2 flex items-center justify-center"
              style={{
                width: CHARGE_SIZE,
                height: CHARGE_SIZE,
                marginLeft: -(CHARGE_SIZE / 2),
                marginTop: -(CHARGE_SIZE / 2),
                scale: chargeScale,
                opacity: chargeOpacity,
              }}
            >
              {chargeGlyph(
                chargeIndex,
                "size-7 transition-colors duration-300",
                chargeStyle,
              )}
            </motion.div>

            {motionSafe && chargeRingKey > 0 && (
              <motion.span
                key={chargeRingKey}
                aria-hidden
                className="pointer-events-none absolute rounded-full"
                style={{
                  left: "50%",
                  top: "42%",
                  width: RING_D,
                  height: RING_D,
                  marginLeft: -(RING_D / 2),
                  marginTop: -(RING_D / 2),
                  border: `2px solid ${colour.secondary}`,
                }}
                initial={{ scale: 0.6, opacity: 0.9 }}
                animate={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: durations.slow, ease: easings.exit }}
              />
            )}
          </motion.div>

          {/* THE RIBBON — layer 4, unfurling from its centre. */}
          <motion.div
            className="absolute left-1/2"
            style={{
              top: RIBBON_TOP,
              width: RIBBON_W,
              height: RIBBON_H,
              marginLeft: -(RIBBON_W / 2),
              scaleX: ribbonScaleX,
            }}
          >
            <span
              aria-hidden
              className="absolute inset-0 overflow-hidden rounded-1 shadow-raised"
            >
              <span
                className="absolute inset-y-0 left-0 w-1/2 transition-colors duration-300"
                style={{ backgroundColor: colour.primary }}
              />
              <span
                className="absolute inset-y-0 right-0 w-1/2 transition-colors duration-300"
                style={{ backgroundColor: colour.secondary }}
              />
            </span>
            <motion.span
              className="absolute inset-0 flex items-center justify-center px-2 text-center font-mono text-[10px] font-semibold tracking-[0.12em] whitespace-nowrap uppercase"
              style={{
                opacity: nameOpacity,
                color: "var(--primary-foreground)",
              }}
            >
              {name}
            </motion.span>
          </motion.div>

          {/* The finishing sweep — crosses the whole crest, shield to ribbon. */}
          {motionSafe && sweepKey > 0 && (
            <motion.span
              key={sweepKey}
              className="pointer-events-none absolute top-0"
              style={{
                height: RIBBON_TOP + RIBBON_H,
                width: SWEEP_W,
                transform: "skewX(-20deg)",
                background: SHEEN,
              }}
              initial={{ left: -(SWEEP_W + 14) }}
              animate={{ left: SHIELD_W + 14 }}
              transition={{ duration: SWEEP_S, ease: easings.move }}
            />
          )}

          {motionSafe && sparkKey > 0 && (
            <span
              key={sparkKey}
              className="pointer-events-none absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2"
            >
              {SPARKS.map((s, i) => (
                <motion.span
                  key={i}
                  className="absolute size-1 rounded-full"
                  style={{ background: colour.secondary }}
                  initial={{ x: 0, y: 0, opacity: 1 }}
                  animate={{ x: s.dx, y: s.dy, opacity: 0 }}
                  transition={{ duration: durations.slow, ease: easings.exit }}
                />
              ))}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <div className="relative h-4 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={blazon}
              className="block text-center font-mono text-[11px] tracking-[0.04em] text-ink-3"
              initial={motionSafe ? { opacity: 0, y: 4 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={
                motionSafe
                  ? { opacity: 0, y: -4, transition: exitFor(durations.base) }
                  : { opacity: 0, transition: { duration: 0 } }
              }
              transition={
                motionSafe
                  ? { duration: durations.base, ease: easings.enter }
                  : { duration: 0 }
              }
            >
              {blazon}
            </motion.span>
          </AnimatePresence>
        </div>

        <div className="relative h-4 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            {struckCaption ? (
              <motion.span
                key="struck"
                className="block text-center font-mono text-[11px] font-semibold tracking-[0.1em] text-ink-2 uppercase"
                initial={motionSafe ? { opacity: 0, y: 4 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={
                  motionSafe
                    ? { opacity: 0, y: -4, transition: exitFor(durations.base) }
                    : { opacity: 0, transition: { duration: 0 } }
                }
                transition={
                  motionSafe
                    ? { duration: durations.base, ease: easings.enter }
                    : { duration: 0 }
                }
              >
                crest struck
              </motion.span>
            ) : !assembled ? (
              <span
                key="hint"
                className="block text-center text-label text-ink-3"
              >
                awaiting assembly
              </span>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button
          type="button"
          aria-label={`Shield shape, ${shape.word}. Press to change.`}
          onClick={handleCycleShape}
          disabled={cycleGuard}
          className={cn(
            "rounded-2 border border-hairline-strong bg-surface-2 px-2 py-1 text-label text-ink-2 transition-colors outline-none",
            "hover:border-hairline-strong hover:text-ink",
            "disabled:pointer-events-none disabled:opacity-40",
            "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          )}
        >
          Shape · {cap(shape.word)}
        </button>
        <button
          type="button"
          aria-label={`Field pattern, ${fieldWord}. Press to change.`}
          onClick={handleCycleField}
          disabled={cycleGuard}
          className={cn(
            "rounded-2 border border-hairline-strong bg-surface-2 px-2 py-1 text-label text-ink-2 transition-colors outline-none",
            "hover:border-hairline-strong hover:text-ink",
            "disabled:pointer-events-none disabled:opacity-40",
            "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          )}
        >
          Field · {cap(fieldWord)}
        </button>
        <button
          type="button"
          aria-label={`Charge, ${chargeWord}. Press to change.`}
          onClick={handleCycleCharge}
          disabled={cycleGuard}
          className={cn(
            "rounded-2 border border-hairline-strong bg-surface-2 px-2 py-1 text-label text-ink-2 transition-colors outline-none",
            "hover:border-hairline-strong hover:text-ink",
            "disabled:pointer-events-none disabled:opacity-40",
            "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          )}
        >
          Charge · {cap(chargeWord)}
        </button>
        <button
          type="button"
          aria-label={`Colours, ${colour.blazon}. Press to change.`}
          onClick={handleCycleColour}
          disabled={cycleGuard}
          className={cn(
            "rounded-2 border border-hairline-strong bg-surface-2 px-2 py-1 text-label text-ink-2 transition-colors outline-none",
            "hover:border-hairline-strong hover:text-ink",
            "disabled:pointer-events-none disabled:opacity-40",
            "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          )}
        >
          Colour · {cap(colour.blazon)}
        </button>
      </div>

      <button
        type="button"
        aria-label="Assemble the crest"
        onClick={handleAssemble}
        disabled={assembleDisabled}
        className={cn(
          "rounded-2 bg-primary px-4 py-1.5 font-mono text-xs font-semibold tracking-wide text-primary-foreground uppercase shadow-raised transition-[filter] outline-none",
          "hover:brightness-110 active:brightness-95",
          "disabled:pointer-events-none disabled:opacity-50",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
        )}
      >
        {assembled ? "Re-strike" : "Assemble"}
      </button>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
