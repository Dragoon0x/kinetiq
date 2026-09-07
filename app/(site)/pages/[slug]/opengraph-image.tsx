import { itemBySlug } from "@/content/manifest";
import {
  homeCard,
  itemAlt,
  itemCard,
  OG_SIZE,
  renderCard,
} from "@/lib/og-template";

export const size = OG_SIZE;
export const contentType = "image/png";

type Params = { params: Promise<{ slug: string }> };

/** One card per item, with alt text that names it. */
export async function generateImageMetadata({ params }: Params) {
  const { slug } = await params;
  const item = itemBySlug(slug);
  return [
    {
      id: "card",
      size: OG_SIZE,
      contentType: "image/png",
      alt: item ? itemAlt(item, "pages") : "Kinetiq",
    },
  ];
}

export default async function Image({ params }: Params) {
  const { slug } = await params;
  const item = itemBySlug(slug);
  return renderCard(item ? itemCard(item, "pages") : homeCard());
}
