import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ComponentDocPage } from "@/components/docs/component-page";
import { catalogBlocks, itemBySlug } from "@/content/manifest";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMeta } from "@/lib/seo";
import { breadcrumbLd, softwareLd } from "@/lib/structured-data";

export const dynamicParams = false;

export function generateStaticParams() {
  return catalogBlocks.map((block) => ({ slug: block.name }));
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
    path: `/blocks/${slug}`,
    keywords: [item.meta?.serial ?? "", ...item.keywords].filter(Boolean),
  });
}

export default async function BlockPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = itemBySlug(slug);
  if (!item || item.type !== "registry:block" || item.draft) notFound();
  return (
    <>
      <JsonLd
        data={[
          softwareLd(item, "blocks"),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Blocks", path: "/blocks" },
            { name: item.title, path: `/blocks/${slug}` },
          ]),
        ]}
      />
      <ComponentDocPage item={item} kind="blocks" />
    </>
  );
}
