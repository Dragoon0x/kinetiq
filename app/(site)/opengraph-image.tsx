import { homeCard, OG_SIZE, renderCard } from "@/lib/og-template";

/*
 * The home page's card. It lives beside the page rather than only at the
 * root: a page that states its own Open Graph block (as the home page does,
 * for its full title) replaces the inherited one wholesale, image included,
 * and file-based images survive only from their own segment.
 */
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt =
  "Kinetiq — Motion, calibrated. Animated React components on five calibrated springs; copy the source, own the code.";

export default function Image() {
  return renderCard(homeCard());
}
