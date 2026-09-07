import { catalogComponents } from "@/content/manifest";
import {
  catalogStats,
  indexCard,
  OG_SIZE,
  renderCard,
} from "@/lib/og-template";

const card = () =>
  indexCard({
    eyebrow: ["INDEX", `${catalogComponents.length} INSTRUMENTS`],
    title: "Components",
    tagline:
      "Animated React components that share one physics vocabulary. Five calibrated springs, one install command each.",
    path: "/components",
    stats: catalogStats(),
  });

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt =
  "Kinetiq components: animated React components that share one physics vocabulary, five calibrated springs.";

export default function Image() {
  return renderCard(card());
}
