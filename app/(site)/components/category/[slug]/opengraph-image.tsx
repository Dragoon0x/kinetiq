import { categoryBySlug, itemsByCategory } from "@/content/categories";
import { catalogComponents } from "@/content/manifest";
import { categoryCard, homeCard, OG_SIZE, renderCard } from "@/lib/og-template";

export const size = OG_SIZE;
export const contentType = "image/png";

type Params = { params: Promise<{ slug: string }> };

const countOf = (slug: string) =>
  itemsByCategory(catalogComponents).find((g) => g.category.slug === slug)
    ?.items.length ?? 0;

export async function generateImageMetadata({ params }: Params) {
  const { slug } = await params;
  const category = categoryBySlug(slug);
  return [
    {
      id: "card",
      size: OG_SIZE,
      contentType: "image/png",
      alt: category
        ? `${category.label} components, Kinetiq: ${category.blurb}`
        : "Kinetiq",
    },
  ];
}

export default async function Image({ params }: Params) {
  const { slug } = await params;
  const category = categoryBySlug(slug);
  return renderCard(
    category ? categoryCard(category, countOf(slug)) : homeCard(),
  );
}
