"use client";

import * as React from "react";

/** One instrument as the catalog lists it — the film never invents a name. */
export type CatalogEntry = {
  name: string;
  title: string;
  serial: string;
  tagline: string;
};

export type Catalog = {
  /** Every published component, in serial order. */
  components: CatalogEntry[];
  counts: {
    instruments: number;
    assemblies: number;
    pages: number;
    categories: number;
  };
};

const CatalogContext = React.createContext<Catalog | null>(null);

/** The real catalog, read from content/manifest on the server. */
export function CatalogProvider({
  catalog,
  children,
}: {
  catalog: Catalog;
  children: React.ReactNode;
}) {
  return (
    <CatalogContext.Provider value={catalog}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog(): Catalog {
  const catalog = React.useContext(CatalogContext);
  if (!catalog) throw new Error("useCatalog outside the film");
  return catalog;
}

/** An instrument by slug, straight from the catalog. */
export function useEntry(name: string): CatalogEntry {
  const { components } = useCatalog();
  return (
    components.find((entry) => entry.name === name) ?? {
      name,
      title: name,
      serial: "KQ-000",
      tagline: "",
    }
  );
}

/** "KQ-1097 · GEL/SWITCH" — the specimen label the site prints on every card. */
export const specimen = (entry: CatalogEntry): string =>
  `${entry.serial} · ${entry.name.replace("-", "/").toUpperCase()}`;
