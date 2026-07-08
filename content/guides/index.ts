export type GuideMeta = {
  slug: string;
  serial: string;
  title: string;
  tagline: string;
};

export const guides: GuideMeta[] = [
  {
    slug: "motion-language",
    serial: "KG-01",
    title: "The Motion Language",
    tagline: "Five springs, one tween scale, and when to use which.",
  },
  {
    slug: "orchestration",
    serial: "KG-02",
    title: "Orchestration",
    tagline: "The 600ms budget, cascades, and enter/exit asymmetry.",
  },
  {
    slug: "reduced-motion",
    serial: "KG-03",
    title: "Reduced Motion Is a First-Class State",
    tagline: "The degradation policy, and how to test it in one click.",
  },
  {
    slug: "motion-performance",
    serial: "KG-04",
    title: "Motion Performance",
    tagline: "Transforms over layout, FLIP, and SSR-safe mounting.",
  },
];

export const guideBySlug = (slug: string) => guides.find((g) => g.slug === slug);
