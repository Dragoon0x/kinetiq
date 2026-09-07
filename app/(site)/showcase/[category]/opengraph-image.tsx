import { categoryBySlug, itemsByCategory } from "@/content/categories";
import { catalogComponents } from "@/content/manifest";
import { showcaseBySlug } from "@/content/showcases";
import { homeCard, OG_SIZE, renderCard, showcaseCard } from "@/lib/og-template";

export const size = OG_SIZE;
export const contentType = "image/png";

type Params = { params: Promise<{ category: string }> };

const countOf = (slug: string) =>
  itemsByCategory(catalogComponents).find((g) => g.category.slug === slug)
    ?.items.length ?? 0;

export async function generateImageMetadata({ params }: Params) {
  const { category: slug } = await params;
  const showcase = showcaseBySlug(slug);
  const category = categoryBySlug(slug);
  return [
    {
      id: "card",
      size: OG_SIZE,
      contentType: "image/png",
      alt:
        showcase && category
          ? `${category.label} showcase, Kinetiq: ${showcase.headline}`
          : "Kinetiq",
    },
  ];
}

export default async function Image({ params }: Params) {
  const { category: slug } = await params;
  const showcase = showcaseBySlug(slug);
  const category = categoryBySlug(slug);
  return renderCard(
    showcase && category
      ? showcaseCard(showcase, category, countOf(slug))
      : homeCard(),
  );
}
