import { labs } from "@/content/labs";
import { indexCard, OG_SIZE, renderCard } from "@/lib/og-template";

const card = () =>
  indexCard({
    eyebrow: ["PLAYGROUND", `${labs.length} BENCHES`],
    title: "Learn motion by operating it.",
    tagline:
      "Benches with live parameters, traces, and code that mirrors the stage. Springs, easing, cascades, gestures, layout, scroll.",
    path: "/playground",
    accent: "sky",
    stats: [
      { value: String(labs.length), label: "BENCHES" },
      { value: "5", label: "SPRINGS" },
      { value: "600", label: "MS CASCADE BUDGET" },
    ],
  });

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt =
  "The Kinetiq playground: learn motion by operating it, on benches with live parameters, traces, and mirrored code.";

export default function Image() {
  return renderCard(card());
}
