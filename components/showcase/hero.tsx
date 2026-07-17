"use client";

import { demos } from "@/components/docs/demos";
import { FocusText } from "@/registry/ui/focus-text";
import { GradientTitle } from "@/registry/ui/gradient-title";
import { Wavefield } from "@/registry/ui/wavefield";

/**
 * A showcase hero is the category demonstrating itself — exactly one live
 * instrument per page. `stage` reuses the instrument's own demo, so it stays
 * generic. `backdrop` and `headline` need tuned props and a bespoke frame, so
 * each is wired explicitly here; both fall back to nothing rather than guess.
 */

/** `stage` — the instrument in its own framed stage, as its demo ships. */
export function HeroStage({ slug }: { slug: string }) {
  const Demo = demos[slug];
  return Demo ? <Demo /> : null;
}

/** `backdrop` — an ambient field painting behind the copy. Decorative, inert. */
export function HeroBackdrop({ slug }: { slug: string }) {
  if (slug === "wavefield") {
    return (
      <Wavefield
        variant="contour"
        density={0.5}
        speed={0.35}
        opacity={0.35}
        className="pointer-events-none absolute inset-0"
      />
    );
  }
  return null;
}

/**
 * `headline` — the instrument IS the h1, carrying the showcase's own copy, so
 * the heading stays real text for assistive tech and search rather than an
 * sr-only stand-in beside a decorative graphic.
 */
export function HeroHeadline({
  slug,
  text,
  className,
}: {
  slug: string;
  text: string;
  className?: string;
}) {
  if (slug === "focus-text") {
    return (
      <FocusText as="h1" by="word" className={className}>
        {text}
      </FocusText>
    );
  }
  if (slug === "gradient-title") {
    return (
      <GradientTitle as="h1" className={className}>
        {text}
      </GradientTitle>
    );
  }
  return <h1 className={className}>{text}</h1>;
}
