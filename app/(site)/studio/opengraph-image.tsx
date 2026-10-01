import { categoryOf } from "@/content/categories";
import { catalogComponents } from "@/content/manifest";
import { STUDIO_SETS } from "@/content/studio";
import { indexCard, OG_SIZE, renderCard } from "@/lib/og-template";

const studio = catalogComponents.filter((c) => categoryOf(c) === "studio");
const noun = studio.length === 1 ? "PIECE" : "PIECES";

const card = () =>
  indexCard({
    eyebrow: ["STUDIO", `${studio.length} ${noun}`],
    title: "From the smallest press to the whole screen.",
    tagline:
      "Toggles, buttons, cards and containers with deep APIs, and complete AI, workspace, data, flow, commerce and app-screen surfaces.",
    path: "/studio",
    accent: "mint",
    stats: [
      { value: String(studio.length), label: noun },
      { value: String(STUDIO_SETS.length), label: "SETS" },
      { value: "5", label: "SPRINGS" },
    ],
  });

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt =
  "Kinetiq Studio: product interface from the smallest press to the whole screen, micro-interactions and complete app surfaces.";

export default function Image() {
  return renderCard(card());
}
