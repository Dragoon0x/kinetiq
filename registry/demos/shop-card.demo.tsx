"use client";

import * as React from "react";

import { ShopCard, type ShopProduct } from "@/registry/ui/shop-card";

/** A procedural still life: a lit body over a hard horizon. No assets. */
const plate = (hue: number, chroma: number, at: string): React.ReactNode => {
  const body = `oklch(0.7 ${chroma} ${hue})`;
  const ground = `oklch(0.38 ${chroma * 0.7} ${hue})`;
  return (
    <span
      className="block size-full"
      style={{
        backgroundImage: [
          `radial-gradient(48% 40% at ${at}, oklch(0.94 ${chroma * 0.6} ${hue}), transparent 72%)`,
          `linear-gradient(158deg, ${body} 0%, ${body} 58%, ${ground} 58.4%, ${ground} 100%)`,
        ].join(", "),
      }}
    />
  );
};

/** The second view is the same object, turned into the light. */
const views = (
  hue: number,
  chroma: number,
): [React.ReactNode, React.ReactNode] => [
  plate(hue, chroma, "72% 24%"),
  plate(hue + 26, chroma, "24% 68%"),
];

const PRODUCTS: ShopProduct[] = [
  {
    id: "can",
    title: "Watering can",
    price: 48,
    variants: [
      { id: "1l", label: "1 L" },
      { id: "2l", label: "2 L", price: 58 },
    ],
    art: views(166, 0.1),
  },
  {
    id: "mister",
    title: "Fern mister",
    price: 26,
    variants: [
      { id: "brass", label: "Brass" },
      { id: "steel", label: "Steel", price: 22 },
    ],
    art: views(82, 0.09),
  },
  {
    id: "apron",
    title: "Potting apron",
    price: 64,
    variants: [
      { id: "s", label: "S" },
      { id: "m", label: "M" },
      { id: "l", label: "L", price: 68 },
    ],
    art: views(268, 0.12),
  },
];

const money = (value: number) => `$${value.toFixed(0)}`;

export function ShopCardDemo() {
  const [last, setLast] = React.useState("Hover or tab a card");
  const [likes, setLikes] = React.useState<Record<string, boolean>>({
    mister: true,
  });

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PRODUCTS.map((product) => (
          <ShopCard
            key={product.id}
            product={product}
            href={`#${product.id}`}
            format={money}
            liked={likes[product.id] ?? false}
            onLikedChange={(liked) => {
              setLikes((prev) => ({ ...prev, [product.id]: liked }));
              setLast(`${liked ? "Saved" : "Unsaved"} ${product.title}`);
            }}
            onAdd={(variantId) =>
              setLast(`Added ${product.title} · ${variantId}`)
            }
          />
        ))}
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">Fernworks</span> · {last}
      </p>
    </div>
  );
}
