import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ComponentDocPage } from "@/components/docs/component-page";
import { catalogComponents, itemBySlug } from "@/content/manifest";

export const dynamicParams = false;

export function generateStaticParams() {
  return catalogComponents.map((component) => ({ slug: component.name }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = itemBySlug(slug);
  if (!item) return {};
  return { title: item.title, description: item.description };
}

export default async function ComponentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = itemBySlug(slug);
  if (!item || item.type !== "registry:ui" || item.draft) notFound();
  return <ComponentDocPage item={item} kind="components" />;
}
