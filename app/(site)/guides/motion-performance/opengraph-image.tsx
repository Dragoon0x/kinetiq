import { guideBySlug, guides } from "@/content/guides";
import { guideCard, homeCard, OG_SIZE, renderCard } from "@/lib/og-template";

const SLUG = "motion-performance";
const guide = guideBySlug(SLUG);

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = guide
  ? `${guide.title}, chapter ${guides.indexOf(guide) + 1} of the Kinetiq field manual: ${guide.tagline}`
  : "Kinetiq guide";

export default function Image() {
  return renderCard(
    guide ? guideCard(guide, guides.indexOf(guide) + 1) : homeCard(),
  );
}
