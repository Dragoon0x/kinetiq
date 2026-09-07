import {
  catalogStats,
  indexCard,
  OG_SIZE,
  renderCard,
} from "@/lib/og-template";

const card = () =>
  indexCard({
    eyebrow: ["FOR AI AGENTS", "REGISTRY ACCESS"],
    title: "Built to be installed by agents.",
    tagline:
      "Endpoints, item shape, and install flows for coding agents. One URL per item, one command to add it.",
    path: "/agents",
    accent: "mint",
    stats: catalogStats(),
  });

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt =
  "Kinetiq for AI agents: programmatic registry access, item shape, and install flows for coding agents.";

export default function Image() {
  return renderCard(card());
}
