export type LabMeta = {
  slug: string;
  serial: string;
  title: string;
  tagline: string;
  /** The one thing the lab teaches. */
  aha: string;
};

export const labs: LabMeta[] = [
  {
    slug: "spring",
    serial: "KL-01",
    title: "Spring Bench",
    tagline: "Stiffness pulls, damping resists, mass carries.",
    aha: "A spring's personality is its damping ratio — the same ζ at higher stiffness is the same character at a faster tempo.",
  },
  {
    slug: "easing",
    serial: "KL-02",
    title: "Easing Bench",
    tagline: "Curves are velocity in disguise.",
    aha: "Perceived speed is the derivative at the endpoints — ease-out feels faster at the same duration.",
  },
  {
    slug: "cascade",
    serial: "KL-03",
    title: "Cascade Bench",
    tagline: "Choreography under a 600ms budget.",
    aha: "Past the budget, choreography reads as lag — the interval must shrink as the count grows.",
  },
  {
    slug: "keyframes",
    serial: "KL-04",
    title: "Keyframe Bench",
    tagline: "Sequences on a dopesheet.",
    aha: "A doubled key is a hold — and holds create anticipation.",
  },
  {
    slug: "gestures",
    serial: "KL-05",
    title: "Gesture Bench",
    tagline: "Fling it and see where it was going.",
    aha: "A good fling animates to where the gesture was going, not where it ended.",
  },
  {
    slug: "layout",
    serial: "KL-06",
    title: "Layout Bench",
    tagline: "FLIP: expensive layout, impersonated by cheap transforms.",
    aha: "You never animated width — layout animation is transforms doing an impression of layout.",
  },
  {
    slug: "scroll",
    serial: "KL-07",
    title: "Scroll Bench",
    tagline: "Linked scrubs. Triggered fires once.",
    aha: "Scroll-linked maps progress to a value and reverses; scroll-triggered fires a timed animation once.",
  },
];

export const labBySlug = (slug: string) => labs.find((l) => l.slug === slug);
