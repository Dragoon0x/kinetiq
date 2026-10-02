import { homeCard, OG_SIZE, renderCard } from "@/lib/og-template";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt =
  "Kinetiq — Motion, calibrated. Animated React components on five calibrated springs; copy the source, own the code.";

// The counts are read from the catalog at build time and printed as the
// site prints them (1,229), so every release carries the real numbers.
export default function Image() {
  return renderCard(homeCard());
}
