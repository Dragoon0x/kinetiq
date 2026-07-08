import type { Metadata } from "next";

import { CodeBlock } from "@/components/docs/code-block";
import {
  GuideP,
  GuideSection,
  GuideShell,
  GuideTable,
} from "@/components/docs/guide-shell";
import { CalibrationStrip } from "@/components/home/calibration-strip";

export const metadata: Metadata = {
  title: "The Motion Language",
  description: "Five springs, one tween scale, and when to use which.",
};

export default function MotionLanguageGuide() {
  return (
    <GuideShell slug="motion-language">
      <GuideSection title="Five springs, deliberately few">
        <GuideP>
          Most motion systems hand you infinite dials and hope you develop
          taste. Kinetiq ships five springs, each with a documented damping
          ratio — the number that defines its personality — and every
          component in the library draws from the same set. That constraint is
          the point: when everything speaks the same physics, compositions
          feel machined from one piece.
        </GuideP>
        <CalibrationStrip />
        <GuideTable
          head={["Calibration", "ζ", "Settles", "Assignment"]}
          rows={[
            ["flick", "0.99", "~120ms", "Press states, tick draws, focus. Confirms."],
            ["snap", "0.83", "~300ms", "Toggles, tabs, menus — one crisp overshoot. Switches."],
            ["glide", "0.98", "~450ms", "Layout shifts, reorders, morphs. Moves."],
            ["drift", "1.00", "~800ms", "Large surfaces, ambient settle. Breathes."],
            ["recoil", "0.53", "~700ms", "Toasts, stamps, landings — two bounces. Celebrates."],
          ]}
        />
        <GuideP>
          The rule of thumb reads like a sentence: flick confirms, snap
          switches, glide moves, drift breathes, recoil celebrates. If you can
          say which verb your interaction is, you know which spring it takes.
        </GuideP>
      </GuideSection>

      <GuideSection title="Physics for space, tweens for surface">
        <GuideP>
          Springs drive anything with spatial meaning — position, scale,
          rotation. Properties without physical mass (opacity, color, blur,
          clip paths) use the tween scale instead: five durations and four
          easings, and that is the whole vocabulary.
        </GuideP>
        <CodeBlock
          lang="ts"
          filename="lib/motion.ts"
          code={`import { springs, durations, easings } from "@/lib/motion";

// Spatial: a spring with a name, never raw numbers
<motion.div animate={{ x: 240 }} transition={springs.glide} />

// Surface: a tween from the scale
<motion.div
  animate={{ opacity: 1 }}
  transition={{ duration: durations.base, ease: easings.enter }}
/>`}
        />
        <GuideP>
          Exits are the one place springs are banned. A spring on the way out
          reads as indecision — leaving should be an act, not a negotiation.
          Exits run as tweens at 0.6× their enter duration with the exit
          easing, which accelerates away instead of landing softly.
        </GuideP>
      </GuideSection>

      <GuideSection title="Why damping ratio is the identity">
        <GuideP>
          Stiffness and damping look independent, but perception collapses
          them into one quality: how the settle feels. That quality is the
          damping ratio, ζ. Two springs with the same ζ at different
          stiffness are the same character at different tempos — which is why
          the Spring Bench in the Playground prints ζ next to everything you
          try. Tune by personality first, tempo second.
        </GuideP>
      </GuideSection>
    </GuideShell>
  );
}
