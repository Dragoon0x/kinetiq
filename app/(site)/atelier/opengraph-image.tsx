import { ATELIER_SETS } from "@/content/atelier";
import { categoryOf } from "@/content/categories";
import { catalogComponents } from "@/content/manifest";
import { indexCard, OG_SIZE, renderCard } from "@/lib/og-template";

const atelier = catalogComponents.filter((c) => categoryOf(c) === "atelier");
const noun = atelier.length === 1 ? "PIECE" : "PIECES";

const card = () =>
  indexCard({
    eyebrow: ["ATELIER", `${atelier.length} ${noun}`],
    title: "Everyday interface, made by hand.",
    tagline:
      "Loaders, widgets, notices, fields, menus, device frames, keepsakes and backdrops, each finished to the last frame.",
    path: "/atelier",
    accent: "amber",
    stats: [
      { value: String(atelier.length), label: noun },
      { value: String(ATELIER_SETS.length), label: "SETS" },
      { value: "5", label: "SPRINGS" },
    ],
  });

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt =
  "Kinetiq Atelier: everyday interface made by hand, loaders, widgets, notices, fields, menus, device frames, keepsakes and backdrops.";

export default function Image() {
  return renderCard(card());
}
