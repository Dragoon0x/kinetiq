import {
  catalogStats,
  indexCard,
  OG_SIZE,
  renderCard,
} from "@/lib/og-template";

const card = () =>
  indexCard({
    eyebrow: ["MCP SERVER", "MODEL CONTEXT PROTOCOL"],
    title: "Connect any AI agent.",
    tagline:
      "Search, read, install, and the motion vocabulary, exposed as tools over a complete machine catalog. Live or offline.",
    path: "/mcp",
    accent: "mint",
    stats: catalogStats(),
  });

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt =
  "Kinetiq MCP server: connect any AI agent to the catalog with search, read, install, and motion-vocabulary tools.";

export default function Image() {
  return renderCard(card());
}
