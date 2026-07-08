import type { Metadata } from "next";
import { Instrument_Sans, Martian_Mono } from "next/font/google";

import { Providers } from "@/components/providers";
import { siteConfig } from "@/lib/site-config";
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
        className={`${sans.variable} ${mono.variable} bg-background text-foreground font-sans antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
