import { catalogComponents } from "@/content/manifest";
import { SHOWCASES } from "@/content/showcases";
import { indexCard, OG_SIZE, renderCard } from "@/lib/og-template";

const card = () =>
  indexCard({
    eyebrow: ["SHOWCASES", `${SHOWCASES.length} ROOMS`],
    title: "Each category, staged.",
    tagline:
      "The instruments running together rather than listed apart: one room per category, live.",
    path: "/showcase",
    accent: "coral",
    stats: [
      { value: String(SHOWCASES.length), label: "ROOMS" },
      { value: String(catalogComponents.length), label: "INSTRUMENTS" },
      { value: "5", label: "SPRINGS" },
    ],
  });

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt =
  "Kinetiq showcases: each category of the catalog staged as a scene, the instruments running together.";

export default function Image() {
  return renderCard(card());
}
