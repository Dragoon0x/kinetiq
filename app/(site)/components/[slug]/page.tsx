import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ComponentDocPage } from "@/components/docs/component-page";
import { catalogComponents, itemBySlug } from "@/content/manifest";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMeta } from "@/lib/seo";
import { breadcrumbLd, softwareLd } from "@/lib/structured-data";

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
  return pageMeta({
    title: item.title,
    description: item.description,
    path: `/components/${slug}`,
    keywords: [item.meta?.serial ?? "", ...item.keywords].filter(Boolean),
  });
}

export default async function ComponentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = itemBySlug(slug);
  if (!item || item.type !== "registry:ui" || item.draft) notFound();
  return (
    <>
      <JsonLd
        data={[
          softwareLd(item, "components"),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Components", path: "/components" },
            { name: item.title, path: `/components/${slug}` },
          ]),
        ]}
      />
      <ComponentDocPage item={item} kind="components" />
    </>
  );
}
