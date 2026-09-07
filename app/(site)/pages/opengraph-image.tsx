import { catalogPages } from "@/content/manifest";
import { pageFamilyOf } from "@/content/page-categories";
import { indexCard, OG_SIZE, renderCard } from "@/lib/og-template";

const families = new Set(catalogPages.map((p) => pageFamilyOf(p)?.slug));

const card = () =>
  indexCard({
    eyebrow: ["INDEX", `${catalogPages.length} PAGES`],
    title: "Pages",
    tagline:
      "Whole pages, assembled from shipped sections: auth, onboarding, editorial, and every way a request can fail.",
    path: "/pages",
    accent: "mint",
    stats: [
      { value: String(catalogPages.length), label: "PAGES" },
      { value: String(families.size), label: "FAMILIES" },
      { value: "5", label: "SPRINGS" },
    ],
  });

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt =
  "Kinetiq pages: whole page compositions, from auth and onboarding to every way a request can fail.";

export default function Image() {
  return renderCard(card());
}
