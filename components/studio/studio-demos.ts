import type { TactileModule } from "@/components/tactile/demo-module";

/**
 * One dynamic import per piece, so /studio ships none of them up front: a
 * card loads its own demo when it comes near the viewport. This map is the
 * only thing the Studio gallery imports — never components/docs/demos.tsx,
 * which would pull every demo in the catalogue into the page.
 */
export const STUDIO_DEMOS: Record<string, () => Promise<TactileModule>> = {};
