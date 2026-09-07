import { guides } from "@/content/guides";
import { catalogComponents } from "@/content/manifest";
import { indexCard, OG_SIZE, renderCard } from "@/lib/og-template";

const card = () =>
  indexCard({
    eyebrow: ["FIELD MANUAL", `${guides.length} CHAPTERS`],
    title: "The field manual.",
    tagline:
      "The reasoning behind the calibrations. Read these and the whole library stops being arbitrary.",
    path: "/guides",
    stats: [
      { value: String(guides.length), label: "CHAPTERS" },
      { value: "5", label: "SPRINGS" },
      { value: String(catalogComponents.length), label: "INSTRUMENTS COVERED" },
    ],
  });

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt =
  "The Kinetiq field manual: the reasoning behind the calibrations, in four chapters.";

export default function Image() {
  return renderCard(card());
}
