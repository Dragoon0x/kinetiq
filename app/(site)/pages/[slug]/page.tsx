import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ComponentDocPage } from "@/components/docs/component-page";
import { catalogPages, itemBySlug } from "@/content/manifest";

export const dynamicParams = false;

export function generateStaticParams() {
  return catalogPages.map((page) => ({ slug: page.name }));
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

export default async function PageDocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = itemBySlug(slug);
  if (!item || item.type !== "registry:page" || item.draft) notFound();
  return <ComponentDocPage item={item} kind="pages" />;
}
