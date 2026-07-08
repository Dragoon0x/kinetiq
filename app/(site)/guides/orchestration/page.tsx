import type { Metadata } from "next";

import { CodeBlock } from "@/components/docs/code-block";
import {
  GuideP,
  GuideSection,
  GuideShell,
} from "@/components/docs/guide-shell";

export const metadata: Metadata = {
  title: "Orchestration",
  description: "The 600ms budget, cascades, and enter/exit asymmetry.",
};

export default function OrchestrationGuide() {
  return (
    <GuideShell slug="orchestration">
      <GuideSection title="The 600ms budget">
        <GuideP>
          A choreographed sequence — a list cascading in, a grid assembling —
          gets six hundred milliseconds, total. Under the budget, stagger
          reads as craft. Over it, the same stagger reads as lag, because the
          user finished perceiving the change before the interface finished
          performing it.
        </GuideP>
        <GuideP>
          The consequence: the interval between items cannot be a constant.
          Five items at 60ms feels deliberate; forty items at 60ms takes two
          and a half seconds. The cascade helper derives the interval from
          the count and clamps it, so dense lists tighten automatically.
        </GuideP>
        <CodeBlock
          lang="ts"
          filename="lib/motion.ts"
          code={`/** Stagger interval under the 600ms choreography budget. */
export const cascade = (count: number): number =>
  Math.min(0.06, Math.max(0.02, 0.6 / Math.max(count - 1, 1)));

// 5 items  → 60ms apart (300ms total)
// 24 items → 26ms apart (~600ms total)
// 48 items → 20ms apart (clamped floor — still under a second)`}
        />
      </GuideSection>

      <GuideSection title="Enter with physics, exit with intent">
        <GuideP>
          Entrances are arrivals: they carry momentum, so they take springs
          and a short directional offset — eight to sixteen pixels from
          wherever the element conceptually comes from, never a long slide.
          Scale-ins start at 0.96, never zero; things grow into place, they
          don&apos;t inflate from nothing.
        </GuideP>
        <GuideP>
          Exits are decisions. They run as tweens at 0.6× the enter duration
          with an easing that accelerates away, and when a group leaves, the
          exit cascade runs at half the enter interval in reverse. Leaving
          fast and together is how an interface says it meant to.
        </GuideP>
        <CodeBlock
          lang="tsx"
          filename="pattern.tsx"
          code={`<motion.li
  initial={{ opacity: 0, y: 8 }}
  animate={{
    opacity: 1,
    y: 0,
    transition: { ...springs.glide, delay: i * cascade(items.length) },
  }}
  exit={{ opacity: 0, transition: exitFor(durations.base) }}
/>`}
        />
      </GuideSection>

      <GuideSection title="Two rules that keep choreography honest">
        <GuideP>
          One spatial axis per element: a card may rise, or slide, or scale —
          not all three. Compound motion is for gyroscopes, not list items.
        </GuideP>
        <GuideP>
          Stagger from attention, not from index zero: when a user acts on
          the third item, the cascade radiates from the third item. The
          Cascade Bench in the Playground has a &quot;clicked&quot; origin
          mode precisely so you can feel the difference.
        </GuideP>
      </GuideSection>
    </GuideShell>
  );
}
