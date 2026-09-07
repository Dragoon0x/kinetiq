import { labBySlug } from "@/content/labs";
import { homeCard, labCard, OG_SIZE, renderCard } from "@/lib/og-template";

export const size = OG_SIZE;
export const contentType = "image/png";

type Params = { params: Promise<{ lab: string }> };

export async function generateImageMetadata({ params }: Params) {
  const { lab: slug } = await params;
  const lab = labBySlug(slug);
  return [
    {
      id: "card",
      size: OG_SIZE,
      contentType: "image/png",
      alt: lab
        ? `${lab.title}, a Kinetiq playground bench: ${lab.tagline}`
        : "Kinetiq",
    },
  ];
}

export default async function Image({ params }: Params) {
  const { lab: slug } = await params;
  const lab = labBySlug(slug);
  return renderCard(lab ? labCard(lab) : homeCard());
}
