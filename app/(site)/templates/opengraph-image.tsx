import { catalogBlocks, catalogTemplates } from "@/content/manifest";
import { indexCard, OG_SIZE, renderCard } from "@/lib/og-template";

const card = () =>
  indexCard({
    eyebrow: ["INDEX", `${catalogTemplates.length} SITES`],
    title: "Templates",
    tagline:
      "Complete sites, navbar through footer, assembled end to end from shipped sections with no page-local markup.",
    path: "/templates",
    accent: "amber",
    stats: [
      { value: String(catalogTemplates.length), label: "SITES" },
      { value: String(catalogBlocks.length), label: "SECTIONS TO DRAW ON" },
      { value: "5", label: "SPRINGS" },
    ],
  });

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt =
  "Kinetiq templates: complete landing sites assembled end to end from shipped sections.";

export default function Image() {
  return renderCard(card());
}
