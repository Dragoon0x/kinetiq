import { OG_SIZE, ogCard } from "@/lib/og-template";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Kinetiq — Motion, calibrated.";

export default async function Image() {
  return ogCard({
    serial: "KINETIQ",
    title: "Motion, calibrated.",
    tagline: "Every component on the same five springs.",
  });
}
