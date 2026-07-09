import Link from "next/link";

import { demos } from "@/components/docs/demos";
import { SpecimenPlate } from "@/components/lab/specimen-plate";
import { catalogBlocks, catalogComponents } from "@/content/manifest";

/**
 * Signature specimens on the exhibit floor — visually striking but light to
 * mount, so the landing page stays fast. The heavy showpieces (ledger's 10k
 * rows, the canvas fields) live one click away on their own pages.
 */
const FEATURED = [
  "segmented-control",
  "radial-bars",
  "heart-tap",
  "zoetrope",
  "caliper-slider",
  "gyro-card",
  "flapboard",
  "status-seal",
];

/**
 * The exhibit floor: a curated set of live specimens. Six demos keep the
 * home page fast; the index pages carry the full catalog.
 */
export function DemoWall() {
  const items = [...catalogComponents, ...catalogBlocks]
    .filter((item) => FEATURED.includes(item.name) && demos[item.name])
    .sort(
      (a, b) => FEATURED.indexOf(a.name) - FEATURED.indexOf(b.name),
    );

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {items.map((item) => {
        const Demo = demos[item.name];
        if (!Demo) return null;
        const kind = item.type === "registry:block" ? "blocks" : "components";
        return (
          <div key={item.name} className="group/wall relative min-w-0">
            <SpecimenPlate
              serial={item.meta?.serial ?? "KQ-000"}
              label={item.name.replace(/-/g, "/").toUpperCase()}
              minHeight={300}
            >
              <Demo />
            </SpecimenPlate>
            <Link
              href={`/${kind}/${item.name}`}
              className="text-ink-3 hover:text-cobalt-bright mt-2 inline-flex items-center gap-1 px-1 font-mono text-[11px] tracking-wide uppercase transition-colors"
            >
              Open specimen →
            </Link>
          </div>
        );
      })}
    </div>
  );
}
