import type { Metadata } from "next";

import { CodeBlock } from "@/components/docs/code-block";
import {
  GuideP,
  GuideSection,
  GuideShell,
  GuideTable,
} from "@/components/docs/guide-shell";

export const metadata: Metadata = {
  title: "Reduced Motion Is a First-Class State",
  description: "The degradation policy, and how to test it in one click.",
};

export default function ReducedMotionGuide() {
  return (
    <GuideShell slug="reduced-motion">
      <GuideSection title="A policy, not a patch">
        <GuideP>
          Reduced motion is usually an afterthought — a media query bolted on
          before launch. In Kinetiq it is a designed state: every category of
          animation has a documented fallback, decided when the component was
          designed, not discovered when someone complained.
        </GuideP>
        <GuideTable
          head={["Category", "Full motion", "Reduced"]}
          rows={[
            ["enters / exits", "spring + directional offset", "opacity fade, fast"],
            ["discrete state", "travel + overshoot", "instant position, color tween only"],
            [
              "direct manipulation",
              "1:1 tracking + inertia + settle",
              "1:1 tracking kept — inertia and settle removed",
            ],
            ["autoplay loops", "continuous", "static, or ≤1Hz opacity pulse"],
            ["scroll-linked", "scrubbed transforms", "final state, opacity only"],
            ["number rolls", "rolling digits", "instant value + brief highlight"],
            ["morphs", "shared-element rect morph", "plain centered fade"],
          ]}
        />
        <GuideP>
          Two distinctions carry most of the weight. Dragging keeps 1:1
          tracking because tracking is input, not decoration — removing it
          would break the interaction, not calm it. And progress indicators
          keep filling because progress is information; only the flourish
          around it goes.
        </GuideP>
      </GuideSection>

      <GuideSection title="One hook decides">
        <GuideP>
          No component reads the media query itself. Everything asks
          useMotionSafe, which combines the OS preference with an optional
          app-level override — so the policy has exactly one enforcement
          point.
        </GuideP>
        <CodeBlock
          lang="tsx"
          filename="hooks/use-motion-safe.ts"
          code={`const motionSafe = useMotionSafe();

<motion.div
  animate={{ x: open ? 240 : 0 }}
  transition={motionSafe ? springs.snap : { duration: 0 }}
/>`}
        />
      </GuideSection>

      <GuideSection title="Test it in one click">
        <GuideP>
          The header carries an RM · TEST switch. Flip it and this entire
          site — every demo, every page transition — drops into its reduced
          pathway with a banner confirming the state. If a fallback ever
          feels broken rather than calm, that is a bug, and it is visible to
          anyone in one click. Policies you can&apos;t inspect don&apos;t
          survive contact with shipping.
        </GuideP>
      </GuideSection>
    </GuideShell>
  );
}
