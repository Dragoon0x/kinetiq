import {
  DocsSidebar,
  type SidebarGroup,
} from "@/components/chrome/docs-sidebar";
import { itemsByCategory } from "@/content/categories";
import {
  assertSpatialCollections,
  itemsByCollection,
} from "@/content/collections";
import { catalogBlocks, catalogComponents } from "@/content/manifest";

function catalogGroups(): SidebarGroup[] {
  // Fails the build loudly if a spatial instrument lacks a collection.
  assertSpatialCollections(catalogComponents);

  const componentGroups: SidebarGroup[] = itemsByCategory(
    catalogComponents,
  ).flatMap(({ category, items }) => {
    // The Spatial wing navigates by collection, not as one giant category.
    if (category.slug === "spatial") {
      return itemsByCollection(items).map(({ collection, items: members }) => ({
        heading: `Spatial · ${collection.label}`,
        href: `/components/category/spatial#${collection.slug}`,
        items: members.map((c) => ({
          href: `/components/${c.name}`,
          label: c.title,
          serial: c.meta?.serial,
        })),
      }));
    }
    return [
      {
        heading: category.label,
        href: `/components/category/${category.slug}`,
        items: items.map((c) => ({
          href: `/components/${c.name}`,
          label: c.title,
          serial: c.meta?.serial,
        })),
      },
    ];
  });

  const blocksGroup: SidebarGroup = {
    heading: "Blocks",
    href: "/blocks",
    items: catalogBlocks.map((b) => ({
      href: `/blocks/${b.name}`,
      label: b.title,
      serial: b.meta?.serial,
    })),
  };

  return [...componentGroups, blocksGroup];
}

/** Sidebar + content shell shared by the components and blocks sections. */
export function DocsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-7xl px-6">
      <DocsSidebar groups={catalogGroups()} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
