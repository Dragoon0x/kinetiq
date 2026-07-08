import { itemBySlug } from "@/content/manifest";
import { OG_SIZE, ogCard } from "@/lib/og-template";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Kinetiq block";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = itemBySlug(slug);
  return ogCard({
    serial: item?.meta?.serial ?? "KB",
    title: item?.title ?? "Kinetiq",
    tagline: item?.tagline ?? "Motion, calibrated.",
  });
}
