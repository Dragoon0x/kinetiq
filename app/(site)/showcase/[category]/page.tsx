import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CategoryShowcase } from "@/components/showcase/category-showcase";
import { categoryBySlug, categoryOf } from "@/content/categories";
import { catalogComponents } from "@/content/manifest";
import { SHOWCASES, assertShowcases, showcaseBySlug } from "@/content/showcases";

export const dynamicParams = false;

export function generateStaticParams() {
  // Runs once at build: a showcase pointing at a renamed or recategorised
  // instrument would silently render an empty hero, so fail loudly here.
  assertShowcases(catalogComponents);
  return SHOWCASES.map((showcase) => ({ category: showcase.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: slug } = await params;
  const showcase = showcaseBySlug(slug);
  const category = categoryBySlug(slug);
  if (!showcase || !category) return {};
  return {
    title: `${category.label} showcase`,
    description: showcase.deck,
  };
}

export default async function ShowcasePage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: slug } = await params;
  const showcase = showcaseBySlug(slug);
  const category = categoryBySlug(slug);
  if (!showcase || !category) notFound();

  const items = catalogComponents.filter(
    (component) => categoryOf(component) === category.slug,
  );
  if (items.length === 0) notFound();

  return (
    <CategoryShowcase showcase={showcase} category={category} items={items} />
  );
}
