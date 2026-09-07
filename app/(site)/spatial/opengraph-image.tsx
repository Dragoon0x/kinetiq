import { categoryOf } from "@/content/categories";
import { SPATIAL_COLLECTIONS } from "@/content/collections";
import { catalogComponents } from "@/content/manifest";
import { indexCard, OG_SIZE, renderCard } from "@/lib/og-template";

const spatial = catalogComponents.filter((c) => categoryOf(c) === "spatial");

const card = () =>
  indexCard({
    eyebrow: ["THE SPATIAL WING", `${spatial.length} INSTRUMENTS`],
    title: "Depth as a material.",
    tagline:
      "Objects, cameras, surfaces, volumetrics, and mechanisms. Every one live, every one on the same springs.",
    path: "/spatial",
    accent: "violet",
    stats: [
      { value: String(spatial.length), label: "INSTRUMENTS" },
      { value: String(SPATIAL_COLLECTIONS.length), label: "HALLS" },
      { value: "5", label: "SPRINGS" },
    ],
  });

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt =
  "The Kinetiq spatial wing: depth as a material, with objects, cameras, surfaces, volumetrics, and mechanisms, live.";

export default function Image() {
  return renderCard(card());
}
