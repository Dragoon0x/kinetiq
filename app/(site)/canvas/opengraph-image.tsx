import { liveCanvasSets } from "@/content/canvas";
import { categoryOf } from "@/content/categories";
import { catalogComponents } from "@/content/manifest";
import { formatCount, indexCard, OG_SIZE, renderCard } from "@/lib/og-template";

const canvas = catalogComponents.filter((c) => categoryOf(c) === "canvas");
const noun = canvas.length === 1 ? "PIECE" : "PIECES";

const card = () =>
  indexCard({
    eyebrow: ["CANVAS", `${formatCount(canvas.length)} ${noun}`],
    title: "Motion you can see, touch and keep.",
    tagline:
      "Visual components and 3D scenes, text that arrives and settles, micro-interactions with real physics and living backgrounds.",
    path: "/canvas",
    accent: "violet",
    stats: [
      { value: formatCount(canvas.length), label: noun },
      { value: String(liveCanvasSets(canvas).length), label: "SETS" },
      { value: "5", label: "SPRINGS" },
    ],
  });

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt =
  "Kinetiq Canvas: original visual components, 3D scenes, animated text, micro-interactions and living backgrounds for React.";

// The counts are read from the catalog at build time, so every release
// carries the real numbers.
export default function Image() {
  return renderCard(card());
}
