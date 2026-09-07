import {
  catalogStats,
  indexCard,
  OG_SIZE,
  renderCard,
} from "@/lib/og-template";

const card = () =>
  indexCard({
    eyebrow: ["EXPLORE", "LIVE GALLERY"],
    title: "Every instrument, live.",
    tagline:
      "The whole catalog in one gallery. Filter by category or keyword and run any specimen in place.",
    path: "/explore",
    accent: "sky",
    stats: catalogStats(),
  });

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt =
  "Kinetiq explore: every instrument in one live gallery, filterable by category and keyword.";

export default function Image() {
  return renderCard(card());
}
