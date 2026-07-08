import type { Metadata } from "next";

import { CodeBlock } from "@/components/docs/code-block";
import {
  GuideP,
  GuideSection,
  GuideShell,
} from "@/components/docs/guide-shell";

export const metadata: Metadata = {
  title: "Motion Performance",
  description: "Transforms over layout, FLIP, and SSR-safe mounting.",
};

export default function MotionPerformanceGuide() {
  return (
    <GuideShell slug="motion-performance">
      <GuideSection title="Animate the compositor, not the layout engine">
        <GuideP>
          Transforms and opacity are the two properties browsers can animate
          without recomputing layout or repainting — they run on the
          compositor thread and stay smooth even while React is busy.
          Width, height, top, and left invalidate layout on every frame.
          The entire Kinetiq catalog animates transforms and opacity;
          anything that looks like a size change is an impersonation.
        </GuideP>
      </GuideSection>

      <GuideSection title="FLIP: the impersonation technique">
        <GuideP>
          When a card moves between a list and a grid, its width really does
          change — but not frame by frame. FLIP measures the element before
          the change (First), lets CSS place it instantly (Last), applies the
          inverse transform so it appears not to have moved (Invert), then
          springs the transform to identity (Play). The expensive layout
          happens once; the sixty frames in between are cheap transforms.
        </GuideP>
        <CodeBlock
          lang="tsx"
          filename="flip.tsx"
          code={`// motion's layout prop does the measure/invert/play dance for you
<motion.div layout transition={springs.glide} />

// Never this — layout thrash on every frame:
<motion.div animate={{ width: open ? 480 : 240 }} />`}
        />
        <GuideP>
          The Layout Bench in the Playground has an X-ray mode that draws
          each card&apos;s old bounding box during a transition — watch it
          once and FLIP stops being magic.
        </GuideP>
      </GuideSection>

      <GuideSection title="SSR-safe mounting">
        <GuideP>
          Server-rendered pages paint before React hydrates, which creates
          two traps. First: anything measured or randomized must not differ
          between server and client render — Kinetiq derives &quot;random&quot;
          rotations from content hashes and defers measurement to effects
          inside fixed-height frames, so nothing shifts. Second: entrance
          animations that start at opacity zero on the server leave a blank
          page for slow connections; gate them on mount or use whileInView so
          content is visible-first, animated-second.
        </GuideP>
        <CodeBlock
          lang="tsx"
          filename="ssr-pattern.tsx"
          code={`// Deterministic "randomness" — same on server and client
const rotation = (hash(file.name) % 7) - 3;

// Visible first, animated on arrival
<motion.section
  initial={false}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, margin: "-10%" }}
/>`}
        />
      </GuideSection>
    </GuideShell>
  );
}
