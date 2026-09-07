import { sectionFamilyOf } from "@/content/block-categories";
import { catalogBlocks } from "@/content/manifest";
import { indexCard, OG_SIZE, renderCard } from "@/lib/og-template";

const families = new Set(catalogBlocks.map((b) => sectionFamilyOf(b)?.slug));

const card = () =>
  indexCard({
    eyebrow: ["INDEX", `${catalogBlocks.length} ASSEMBLIES`],
    title: "Blocks",
    tagline:
      "Complete landing sections and composed instruments, every one built from the catalog and installed as source.",
    path: "/blocks",
    stats: [
      { value: String(catalogBlocks.length), label: "SECTIONS" },
      { value: String(families.size), label: "FAMILIES" },
      { value: "5", label: "SPRINGS" },
    ],
  });

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt =
  "Kinetiq blocks: complete landing sections and composed instruments built from the catalog.";

export default function Image() {
  return renderCard(card());
}
