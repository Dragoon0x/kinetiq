import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Martian_Mono } from "next/font/google";

import { Providers } from "@/components/providers";
import { JsonLd } from "@/components/seo/json-ld";
import { author, siteConfig } from "@/lib/site-config";
import { personLd, websiteLd } from "@/lib/structured-data";
import { themeScript } from "@/lib/theme-script";

import "./globals.css";

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  axes: ["wdth"],
  // Optional: on a slow first visit the size-adjusted fallback holds the
  // layout and LCP fires on first paint; the webfont wins every visit after.
  display: "optional",
});

const mono = Martian_Mono({
  subsets: ["latin"],
  variable: "--font-martian-mono",
  axes: ["wdth"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  authors: [{ name: author.name, url: author.url }],
  creator: `${author.name} (${author.handle})`,
  publisher: `${author.name} (${author.handle})`,
  category: "technology",
  keywords: [
    "React components",
    "animation library",
    "motion design",
    "spring animation",
    "shadcn registry",
    "Tailwind",
    "TypeScript",
    "UI kit",
    "design system",
    "MCP server",
  ],
  // Pages state their own canonical, card copy and description through
  // lib/seo.ts; what lives here is only what every page shares.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    url: siteConfig.url,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
  twitter: {
    card: "summary_large_image",
    site: author.x,
    creator: author.x,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#10131a" },
    { media: "(prefers-color-scheme: light)", color: "#fafafc" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${sans.variable} ${mono.variable} bg-background font-sans text-foreground antialiased`}
      >
        <Providers>{children}</Providers>
        <JsonLd data={[websiteLd(), personLd()]} />
      </body>
    </html>
  );
}
