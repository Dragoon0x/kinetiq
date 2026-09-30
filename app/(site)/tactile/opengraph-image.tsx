import { categoryOf } from "@/content/categories";
import { catalogComponents } from "@/content/manifest";
import { TACTILE_VERBS } from "@/content/tactile";
import { indexCard, OG_SIZE, renderCard } from "@/lib/og-template";

const tactile = catalogComponents.filter((c) => categoryOf(c) === "tactile");
const noun = tactile.length === 1 ? "COMPONENT" : "COMPONENTS";

const card = () =>
  indexCard({
    eyebrow: ["TACTILE", `${tactile.length} ${noun}`],
    title: "Components you can feel.",
    tagline:
      "Pressed, held, dragged, thrown and turned. Every one with its own physics, sound, and live tweaks.",
    path: "/tactile",
    accent: "sky",
    stats: [
      { value: String(tactile.length), label: noun },
      { value: String(TACTILE_VERBS.length), label: "VERBS" },
      { value: "5", label: "SPRINGS" },
    ],
  });

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt =
  "Kinetiq Tactile: components you can feel, pressed, held, dragged, thrown and turned, each with physics, sound and live tweaks.";

export default function Image() {
  return renderCard(card());
}
