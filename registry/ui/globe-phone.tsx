"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound, type LoopHandle } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PhoneCountry = {
  /** ISO 3166 alpha-2 code, e.g. "GB". The country's value. */
  code: string;
  name: string;
  /** Calling code without the plus, e.g. "44". */
  dial: string;
  /** The national number's shape: `#` is a digit, anything else is printed. */
  pattern: string;
  /** Where the globe turns to, in degrees. */
  lat: number;
  lon: number;
  /** Another name search should find it by. */
  alias?: string;
};

export type GlobePhoneProps = {
  /** What the number is for. The visible label, and the input's accessible name. @default "Phone number" */
  label?: string;
  /** Controlled national number: digits only, without the country code. */
  value?: string;
  /** Initial number when uncontrolled. @default "" */
  defaultValue?: string;
  /** Fires with the digits and the full international number on every edit. */
  onValueChange?: (value: string, international: string) => void;
  /** Controlled country, by code. */
  country?: string;
  /** Initial country when uncontrolled. @default "GB" */
  defaultCountry?: string;
  /** Fires from the list, the throw or the arrow key that chose a country. */
  onCountryChange?: (code: string) => void;
  /** The countries on offer. @default thirty, from Argentina to the United States */
  countries?: PhoneCountry[];
  /** How fast the globe turns to a country, 0.3 to 1.5. @default 1 */
  spin?: number;
  /** Draw the graticule: meridians and parallels every 30°. @default true */
  grid?: boolean;
  /** Format the number for its country as it is typed. Off keeps bare digits. @default true */
  format?: boolean;
  /** The form field name. A hidden input carries the international number under it. */
  name?: string;
  /** Helper text under the field. */
  hint?: string;
  /** What is wrong, in a sentence, from the host. Shown under the field and announced once. */
  error?: string | null;
  required?: boolean;
  /** Play the globe's whir and the ticks. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

export const PHONE_COUNTRIES: PhoneCountry[] = [
  {
    code: "AR",
    name: "Argentina",
    dial: "54",
    pattern: "## ####-####",
    lat: -34.6,
    lon: -64,
  },
  {
    code: "AU",
    name: "Australia",
    dial: "61",
    pattern: "### ### ###",
    lat: -25,
    lon: 134,
  },
  {
    code: "BR",
    name: "Brazil",
    dial: "55",
    pattern: "(##) #####-####",
    lat: -10,
    lon: -52,
  },
  {
    code: "CA",
    name: "Canada",
    dial: "1",
    pattern: "(###) ###-####",
    lat: 56,
    lon: -106,
  },
  {
    code: "CN",
    name: "China",
    dial: "86",
    pattern: "### #### ####",
    lat: 35,
    lon: 104,
  },
  {
    code: "CO",
    name: "Colombia",
    dial: "57",
    pattern: "### ### ####",
    lat: 4.5,
    lon: -74,
  },
  {
    code: "EG",
    name: "Egypt",
    dial: "20",
    pattern: "### ### ####",
    lat: 26.8,
    lon: 30.8,
  },
  {
    code: "FR",
    name: "France",
    dial: "33",
    pattern: "# ## ## ## ##",
    lat: 46.6,
    lon: 2.4,
  },
  {
    code: "DE",
    name: "Germany",
    dial: "49",
    pattern: "### ########",
    lat: 51,
    lon: 10,
  },
  {
    code: "IS",
    name: "Iceland",
    dial: "354",
    pattern: "### ####",
    lat: 64.9,
    lon: -18.6,
  },
  {
    code: "IN",
    name: "India",
    dial: "91",
    pattern: "##### #####",
    lat: 22,
    lon: 79,
  },
  {
    code: "ID",
    name: "Indonesia",
    dial: "62",
    pattern: "###-####-####",
    lat: -2.5,
    lon: 118,
  },
  {
    code: "IE",
    name: "Ireland",
    dial: "353",
    pattern: "## ### ####",
    lat: 53.4,
    lon: -8,
  },
  {
    code: "IT",
    name: "Italy",
    dial: "39",
    pattern: "### ### ####",
    lat: 42.8,
    lon: 12.5,
  },
  {
    code: "JP",
    name: "Japan",
    dial: "81",
    pattern: "##-####-####",
    lat: 36.2,
    lon: 138,
  },
  {
    code: "KE",
    name: "Kenya",
    dial: "254",
    pattern: "### ######",
    lat: 0.2,
    lon: 37.9,
  },
  {
    code: "MX",
    name: "Mexico",
    dial: "52",
    pattern: "## #### ####",
    lat: 23.6,
    lon: -102.5,
  },
  {
    code: "NL",
    name: "Netherlands",
    dial: "31",
    pattern: "# ########",
    lat: 52.2,
    lon: 5.3,
  },
  {
    code: "NZ",
    name: "New Zealand",
    dial: "64",
    pattern: "## ### ####",
    lat: -41,
    lon: 174,
  },
  {
    code: "NG",
    name: "Nigeria",
    dial: "234",
    pattern: "### ### ####",
    lat: 9,
    lon: 8,
  },
  {
    code: "PL",
    name: "Poland",
    dial: "48",
    pattern: "### ### ###",
    lat: 52,
    lon: 19,
  },
  {
    code: "SG",
    name: "Singapore",
    dial: "65",
    pattern: "#### ####",
    lat: 1.35,
    lon: 103.8,
  },
  {
    code: "ZA",
    name: "South Africa",
    dial: "27",
    pattern: "## ### ####",
    lat: -29,
    lon: 24,
  },
  {
    code: "KR",
    name: "South Korea",
    dial: "82",
    pattern: "##-####-####",
    lat: 36.5,
    lon: 127.8,
  },
  {
    code: "ES",
    name: "Spain",
    dial: "34",
    pattern: "### ## ## ##",
    lat: 40,
    lon: -3.7,
  },
  {
    code: "SE",
    name: "Sweden",
    dial: "46",
    pattern: "##-### ## ##",
    lat: 62,
    lon: 15,
  },
  {
    code: "TR",
    name: "Türkiye",
    dial: "90",
    pattern: "### ### ## ##",
    lat: 39,
    lon: 35,
    alias: "Turkey",
  },
  {
    code: "AE",
    name: "United Arab Emirates",
    dial: "971",
    pattern: "## ### ####",
    lat: 24,
    lon: 54,
    alias: "UAE",
  },
  {
    code: "GB",
    name: "United Kingdom",
    dial: "44",
    pattern: "#### ######",
    lat: 54,
    lon: -2,
    alias: "Britain UK",
  },
  {
    code: "US",
    name: "United States",
    dial: "1",
    pattern: "(###) ###-####",
    lat: 39,
    lon: -98,
    alias: "USA America",
  },
];

/*
 * Land, hand-simplified to a few degrees: each outline is lon, lat pairs. At
 * a globe 136px across one degree is under a pixel, so this is as much
 * coastline as the eye can use. The last two are seas drawn back over land.
 */
const LAND: number[][] = [
  // North America
  [
    -166, 68.5, -156, 71.3, -141, 69.7, -128, 70.2, -115, 68.5, -104, 68, -95,
    68.5, -88, 68.5, -86, 66.5, -90, 64, -94, 61, -93.5, 58.7, -88, 56.5, -82.5,
    55.1, -82, 52.8, -80.5, 51.3, -79, 54.5, -77, 56.8, -78, 59, -77.8, 62.3,
    -73, 62.2, -69.5, 59.5, -65.5, 59.8, -61.5, 56.5, -57.5, 53.5, -56, 52,
    -59.5, 50.2, -66.5, 50, -64.5, 48.5, -64.2, 46.4, -61, 45.5, -65.8, 43.6,
    -70.2, 43.6, -70.2, 41.7, -73.8, 40.6, -75.5, 37.8, -75.7, 35.3, -78.5,
    33.8, -81.3, 31.3, -80, 26.8, -80.4, 25.2, -81.8, 26.5, -83, 29.1, -86,
    30.4, -89.2, 30.2, -89.3, 29, -92.5, 29.6, -94.8, 29.3, -97.4, 27, -97.8,
    22.2, -96.2, 19.2, -94.8, 18.4, -91.2, 18.7, -90.4, 20.9, -87, 21.5, -88.2,
    16, -84, 15.8, -83.5, 11, -81.2, 8.8, -77.3, 8.5, -79.8, 7.3, -82.9, 8.2,
    -85.8, 10.8, -87.5, 13.1, -91.5, 14, -94, 16, -96.5, 15.7, -101, 17.3,
    -105.4, 20.5, -105.8, 22.7, -109, 25.8, -111.2, 28.4, -114.8, 31.8, -113,
    29.3, -111.5, 26.3, -110.2, 24.2, -109.5, 23.1, -111, 24.3, -112.2, 26.1,
    -114.1, 27.9, -115.9, 30.3, -117.1, 32.5, -118.5, 34, -120.6, 34.6, -122.5,
    37.7, -124.3, 42, -124.1, 46.3, -124.7, 48.4, -125.6, 50.2, -128.5, 52.6,
    -130.4, 54.6, -134.5, 57.8, -139.8, 59.8, -146.5, 61, -151.5, 59.6, -156.5,
    56.8, -163.5, 54.8, -157.5, 58.7, -162, 59.5, -165.3, 62.3, -161, 64.4,
    -166.5, 65, -164, 66.6, -166.3, 68.6,
  ],
  // Baffin Island
  [
    -65, 62.3, -61.8, 66.6, -67.5, 69.7, -72.5, 71.6, -78, 72.9, -86, 73.4, -90,
    71.8, -85.8, 70, -81.3, 69.2, -80.5, 68.8, -74, 67.5, -73.3, 65.5, -78,
    64.3, -77, 62.9, -72, 62.6,
  ],
  // The western Arctic islands
  [
    -125, 72.2, -118, 74.2, -114, 73.2, -106, 73.5, -101, 72.5, -101.5, 69.4,
    -107, 68.8, -114, 68.3, -118, 69.2, -123.5, 70.2,
  ],
  // The northern Arctic islands
  [
    -92, 74.5, -80, 74.5, -78, 76.6, -75, 78.5, -68, 80.2, -62, 81.9, -70, 82.9,
    -85, 82.7, -93, 81.1, -97, 79.5, -104, 79, -110, 77.8, -118, 76.5, -110,
    75.5, -100, 75.7, -95, 75,
  ],
  // Greenland
  [
    -73, 78.2, -66, 81, -54, 82.4, -35, 83.6, -21, 82.4, -17.5, 80, -19, 77,
    -20, 74.5, -22, 72.3, -22.5, 70.3, -26, 68.5, -32.5, 68.2, -37.5, 65.8,
    -40.5, 64.5, -42.5, 61.5, -44, 60, -46.5, 60.9, -49.7, 62.5, -51.5, 64.5,
    -53.5, 66.5, -53.8, 68.7, -51.5, 69.8, -54.5, 70.8, -55.7, 72.5, -58.3,
    75.5, -61, 76.2, -66.5, 76.1, -71.5, 77.4,
  ],
  // Iceland
  [
    -22.5, 63.9, -24, 65.5, -22.4, 66.4, -18.1, 66.2, -14.6, 66.3, -13.5, 65.2,
    -14.9, 64.3, -18.5, 63.4,
  ],
  // South America
  [
    -77.3, 8.5, -75.5, 10.6, -71.9, 12.3, -71.4, 10.9, -68, 10.6, -62.2, 10.6,
    -60.5, 8.4, -57.1, 6.1, -52.9, 5.5, -51, 4.1, -50, 1.8, -48.5, -0.8, -44.6,
    -2.7, -41.5, -2.9, -38.5, -3.8, -35.2, -5.5, -35, -8.9, -37.2, -12.7, -38.9,
    -15.7, -39.3, -17.8, -40.9, -21.9, -42, -22.9, -44.5, -23.3, -47.8, -25.4,
    -48.6, -28.4, -50.2, -30.8, -52.3, -33.1, -53.4, -34, -55, -34.9, -57.8,
    -34.5, -57.3, -36.3, -57.6, -38.2, -62.2, -38.8, -62.3, -40.8, -65, -40.9,
    -64.3, -42.4, -63.6, -42.7, -65.3, -44.8, -67.3, -45.8, -65.9, -47.8, -68.5,
    -50.3, -69.2, -51.6, -68.4, -52.4, -70, -53.8, -71.4, -54.2, -73.5, -52.9,
    -75.2, -50.2, -74.5, -47.8, -75.6, -46.6, -73.9, -43.6, -73.6, -41.5, -73.4,
    -39, -73.6, -37.2, -71.7, -33.4, -71.5, -30, -70.4, -26.2, -70.3, -23.5,
    -70.3, -18.4, -71.4, -17.6, -75.2, -15.3, -76.3, -13.7, -77.2, -12, -78.7,
    -8.7, -79.9, -6.7, -81.2, -5.5, -80.3, -3.5, -80.9, -2.2, -80.3, -0.4,
    -80.1, 0.8, -78.9, 1.4, -77.6, 3.8, -77.3, 6.6, -77.9, 7.2,
  ],
  // Eurasia
  [
    -5.6, 36, -8.9, 37, -9.5, 38.8, -8.9, 41.9, -9.2, 43.2, -8, 43.7, -1.8,
    43.4, -1.2, 46, -2.5, 47.3, -4.7, 48.4, -1.6, 49.7, 1.6, 50.9, 3.5, 51.5,
    4.8, 53, 8.5, 53.6, 8.2, 55.6, 8.1, 57, 10.6, 57.7, 10.5, 56.2, 12.4, 55.6,
    12.2, 54.2, 14.2, 53.9, 18.5, 54.8, 21.2, 55.3, 21, 56.8, 24.2, 57.2, 23.4,
    59, 28, 59.5, 30, 59.9, 26.5, 60.4, 22.4, 60.2, 21.4, 61.5, 21.6, 63.3, 25,
    65.1, 25.5, 65.7, 22.2, 65.7, 21.2, 64.5, 19, 63.5, 17.4, 62.3, 17.1, 61,
    18.8, 59.8, 16.5, 57.4, 16, 56.2, 14.3, 55.5, 12.8, 55.6, 12.5, 56.8, 11.8,
    58.4, 10.8, 59.1, 9.5, 58.9, 8, 58, 5.7, 58.5, 5, 60.4, 5.1, 62, 6.5, 62.7,
    10, 64.2, 12.7, 66.1, 14.5, 67.8, 16.5, 69, 19, 70, 23.5, 70.8, 28, 71.1,
    31, 70.4, 33.5, 69.3, 36.5, 69, 41, 67.7, 40.3, 66.3, 44, 66.2, 44.2, 68.3,
    50, 68, 54, 68.8, 58.5, 68.8, 63, 69.4, 67, 69.5, 69, 73, 73, 72.5, 75.8,
    72.5, 80, 73.6, 86.5, 74.6, 88, 75.4, 95, 76.2, 101, 76.9, 104.3, 77.7, 107,
    77, 112, 76.5, 113.6, 75.6, 113, 73.8, 118.5, 73.5, 124, 73.6, 127, 73.5,
    129.5, 72.2, 133, 71.5, 139, 71.5, 141, 72.8, 146, 72.2, 150.5, 71.3, 156,
    71, 160, 69.7, 164, 69.6, 168.5, 70, 172, 69.8, 176, 69.8, 180, 68.9, 184,
    67.2, 187.5, 66.4, 190, 66.1, 187, 64.4, 182, 65.3, 179, 62.3, 175, 62, 171,
    60.2, 166, 59.8, 163, 58.4, 163.3, 56.1, 162, 54.8, 160.2, 53.3, 158, 51.7,
    156.7, 51, 156, 53.5, 155.6, 56.4, 156.8, 57.6, 158.5, 58, 161.8, 60.3,
    159.7, 61.6, 155, 59.2, 151.3, 59.3, 145.8, 59.4, 142.3, 59, 138.5, 56.6,
    137, 54.2, 140.3, 53.3, 141.4, 52.2, 140.5, 50, 140.3, 48.2, 138.5, 46.9,
    136, 44.1, 133, 42.8, 131.2, 42.6, 129.7, 41, 128, 39.3, 129.4, 37, 129.2,
    35.3, 126.6, 34.4, 126.2, 36.8, 126.1, 37.7, 124.8, 38, 124.6, 39.6, 121.6,
    39, 121.1, 40.8, 119, 39.2, 117.6, 38.7, 118.9, 37.4, 122.5, 37.4, 120.6,
    36.1, 119.3, 35, 120.9, 32.6, 121.9, 31, 121.5, 29.3, 120.5, 27.5, 119.6,
    25.9, 118, 24.5, 116, 22.9, 113.6, 22.2, 111.5, 21.5, 110.4, 20.3, 109.7,
    21.5, 108.3, 21.6, 106.8, 20.3, 105.7, 19, 106.5, 17.5, 108.8, 15.4, 109.3,
    12.6, 108.9, 11.3, 106.8, 10.4, 105, 8.6, 104.8, 10.3, 103.2, 10.8, 102.4,
    12.2, 100.9, 12.7, 100, 13.4, 100, 12.2, 99.2, 9.3, 100.3, 8.3, 100.6, 6.4,
    101.8, 5.5, 103.4, 4.3, 103.5, 2.2, 104.2, 1.4, 103.4, 1.3, 101.3, 2.9,
    100.3, 5.5, 98.3, 8.2, 98.7, 11.3, 97.8, 14.9, 97.6, 16.5, 95.4, 15.8, 94.3,
    16.4, 94.2, 18.8, 92.3, 20.7, 91.8, 22.4, 90.5, 22.2, 88.3, 21.6, 86.9,
    20.8, 85.1, 19.5, 82.3, 17, 80.3, 15.6, 80.2, 13.2, 79.9, 10.3, 78.2, 8.9,
    77.5, 8.1, 76.5, 9.3, 75.5, 11.7, 74.6, 14.5, 73.3, 17.3, 72.8, 19.9, 72.6,
    21.3, 70.5, 20.8, 69, 22.3, 70.3, 22.9, 68.4, 23.6, 67.4, 24.4, 66.6, 25.4,
    64.4, 25.3, 61.6, 25.2, 58.9, 25.5, 57.3, 25.8, 56.4, 27.1, 54.5, 26.6,
    52.5, 27.6, 51.3, 28.1, 50.2, 29.9, 48.9, 30.4, 48, 30, 48.4, 28.5, 49.5,
    27.1, 50.2, 26.2, 50.8, 24.8, 51.3, 26.1, 51.6, 25.2, 51.6, 24.2, 52.6,
    24.2, 54.3, 24.3, 55.8, 25.3, 56.3, 26.3, 56.4, 24.9, 57.4, 23.8, 58.8,
    23.5, 59.8, 22.4, 58.9, 21.1, 58.5, 20.4, 57.8, 19.1, 56.8, 18.7, 55.4,
    17.7, 53.6, 16.7, 52.2, 15.9, 50.1, 15.1, 48.7, 14, 46.6, 13.4, 45, 12.8,
    43.5, 12.7, 43.2, 13.9, 42.8, 15.3, 42.6, 16.6, 41.8, 17.8, 40.8, 19.7,
    39.2, 21.3, 38.9, 22.4, 37.8, 24.4, 36.6, 26, 35.6, 27.5, 34.8, 28.1, 34.9,
    29.5, 34.3, 28, 33.6, 28.3, 32.6, 29.9, 33, 31.1, 34.2, 31.3, 34.9, 32.8,
    35.6, 34.2, 35.8, 35.8, 36.2, 36.6, 35.2, 36.6, 34, 36.2, 32.5, 36.1, 30.6,
    36.7, 29.1, 36.6, 27.4, 37, 27.2, 38.3, 26.3, 39.2, 26.6, 40.3, 26.1, 40.6,
    25, 40.9, 23.8, 40.6, 22.9, 40.4, 23.5, 39.3, 22.8, 37.9, 23, 36.5, 21.7,
    36.9, 21.1, 38.3, 20.2, 39.6, 19.4, 40.5, 19.5, 41.8, 18.4, 42.5, 17, 43.2,
    15.4, 44.1, 14.4, 45.1, 13.6, 45.7, 12.4, 45.4, 12.3, 44.4, 13.5, 43.6,
    14.4, 42.3, 16.2, 41.8, 17.9, 40.7, 18.5, 40.1, 17, 39.9, 16.6, 38.8, 15.8,
    38, 15.7, 40, 14.8, 40.6, 13.6, 41.2, 12.2, 41.8, 11.1, 42.5, 10.4, 43.6, 9,
    44.4, 7.7, 43.8, 6.2, 43.1, 4.8, 43.4, 3.1, 43.1, 3.2, 41.9, 1.1, 41.1, 0.1,
    39.9, -0.2, 38.8, -0.8, 37.6, -2.1, 36.7, -4.4, 36.7,
  ],
  // Africa
  [
    32.4, 31.3, 30, 31.3, 28, 31, 25.2, 31.6, 23, 32.6, 20.1, 32.3, 19.6, 30.5,
    18.2, 30.8, 15.6, 31.8, 15.2, 32.4, 13.1, 32.9, 11.1, 33.3, 10.3, 34.3,
    11.1, 35.2, 10.9, 36.9, 9.8, 37.3, 8.6, 36.9, 7, 37.1, 3.2, 36.8, 1, 36.5,
    -1.2, 35.7, -2.9, 35.3, -5.3, 35.9, -6.3, 34.9, -6.8, 34, -8.5, 33.3, -9.6,
    31.9, -9.8, 29.6, -11.2, 28.2, -13, 27.6, -14.5, 26.1, -15.8, 23.8, -16.9,
    21.9, -17, 20.8, -16.3, 19.3, -16.5, 16.5, -17.4, 14.8, -16.7, 12.4, -15.2,
    11, -13.8, 9.9, -12.9, 8.3, -11.4, 6.9, -9.7, 5.5, -7.6, 4.4, -5.2, 5.1,
    -2.5, 4.8, 0, 5.6, 1.6, 6.2, 4.4, 6.4, 5.5, 5.3, 6.4, 4.3, 8.3, 4.6, 9.5,
    3.8, 9.8, 2.5, 9.4, 0.8, 8.8, -0.8, 10, -2.9, 11.8, -4.6, 12.3, -6.2, 13.2,
    -8.9, 13.1, -11.7, 12.2, -14.8, 11.8, -17.4, 13.4, -20.8, 14.5, -22.9, 15.2,
    -27, 16.5, -28.6, 17.9, -31.3, 18.4, -34, 20, -34.8, 22.5, -34, 25.6, -33.9,
    28, -32.7, 30, -31.2, 31.3, -29.4, 32.6, -27.2, 32.9, -25.9, 35.5, -24.1,
    35.5, -22.1, 34.7, -19.9, 36.7, -18.2, 39.4, -16.4, 40.7, -14.7, 40.5,
    -10.8, 39.4, -8.3, 39.3, -6.3, 38.8, -5.2, 40, -3.4, 41.6, -1.7, 43.5, 0.3,
    46, 2.3, 48.2, 4.6, 49.8, 7.8, 51.2, 11.1, 51.3, 11.9, 49.4, 11.4, 47.3,
    11.2, 45, 10.4, 43.4, 11.5, 42.8, 12.6, 41.6, 13.9, 40.2, 15.7, 38.9, 17.8,
    37.4, 19.3, 37.1, 21.2, 36.2, 22.5, 35.6, 23.9, 34.9, 25.5, 34, 26.9, 33.3,
    28.2, 32.6, 29.9,
  ],
  // Madagascar
  [
    49.3, -12, 50.4, -15.4, 49.6, -17.4, 48.6, -20.6, 47.1, -24.9, 45.2, -25.5,
    43.7, -23.4, 43.3, -21.6, 44.4, -19, 44, -16.9, 45.6, -15.8, 47.8, -14,
  ],
  // Great Britain
  [
    -5.7, 50.1, -3, 50.6, 1.4, 51.2, 1.7, 52.7, 0.2, 53.5, -0.3, 54.3, -1.6,
    55.6, -2.5, 56.2, -1.8, 57.6, -3.4, 58.6, -5, 58.6, -6.2, 57.5, -5.6, 56,
    -4.9, 55, -3, 54.9, -3.3, 53.9, -3, 53.4, -4.6, 53.3, -4.2, 52.4, -5.2,
    51.8, -3.5, 51.4,
  ],
  // Ireland
  [
    -6, 52.2, -6.1, 53.9, -5.7, 54.7, -7.2, 55.3, -8.5, 54.6, -10, 54.2, -9.8,
    53.3, -10.3, 52, -9.5, 51.6, -8.2, 51.8,
  ],
  // Honshu, Shikoku and Kyushu
  [
    129.8, 33.2, 131, 31.3, 132, 33.8, 134.6, 33.8, 136.8, 34.3, 139, 34.8,
    140.9, 35.7, 141, 38.3, 142, 39.6, 141.4, 41.4, 140, 40.7, 139.9, 39.2,
    138.9, 37.9, 137.3, 37.4, 136.7, 36.5, 133.1, 35.6, 131, 34.5,
  ],
  // Hokkaido
  [
    140, 41.5, 141.2, 41.8, 143.2, 42, 145.5, 43.3, 145.2, 44.3, 141.8, 45.5,
    141.4, 43.4, 140, 42.6,
  ],
  // Sri Lanka
  [79.9, 6.2, 81.8, 7.3, 81.2, 8.6, 80.2, 9.8, 79.8, 8],
  // Taiwan
  [120.1, 23, 120.9, 22, 121.9, 24.9, 121.5, 25.3, 120.5, 24.4],
  // Sumatra
  [
    95.3, 5.6, 97.5, 5.2, 100.4, 2.2, 104, -1, 106, -3.1, 105.8, -5.8, 104.5,
    -5.9, 102.3, -4, 100.3, -1, 98.7, 1.8,
  ],
  // Java
  [
    105.2, -6.8, 108.3, -6.2, 111, -6.4, 114.6, -7.7, 114.4, -8.7, 110.5, -8.2,
    106.4, -7.4,
  ],
  // Borneo
  [
    109, 1.5, 109.6, -1, 110.2, -2.9, 114.5, -4, 116.5, -3, 117.5, 0, 117.8,
    1.7, 118.9, 5, 117, 7, 115.4, 5, 113, 3.2, 111, 1.5,
  ],
  // New Guinea
  [
    131, -1.3, 135, -3.3, 138, -1.6, 141, -2.6, 145.8, -4.9, 147.5, -6.2, 147.8,
    -8, 150, -10.3, 146, -8.3, 143.3, -9, 141, -9.2, 138, -8.3, 137.8, -5.3,
    134, -4, 132, -2.5,
  ],
  // Luzon
  [
    120.6, 18.5, 122.3, 18.4, 121.8, 16, 122, 14, 123.9, 12.9, 120.6, 13.9,
    120.3, 16,
  ],
  // Mindanao
  [122, 7, 125.4, 6, 126.6, 7.3, 125.5, 9.8, 123.6, 8.3],
  // Australia
  [
    113.5, -22, 114, -26.5, 115, -30, 115, -33.6, 117.5, -35, 121, -33.8, 124,
    -33, 126, -32.3, 129, -31.7, 131.5, -31.5, 134, -32.8, 135.8, -34.8, 137.8,
    -33, 138, -35.6, 140, -37.6, 143.5, -38.8, 146.3, -39.1, 148, -37.8, 150,
    -37.2, 151.5, -33.5, 153, -31, 153.5, -28, 153, -25, 150.8, -22.5, 149,
    -20.5, 146.2, -18.8, 145.3, -15, 143.5, -14, 142.5, -10.7, 141.5, -13,
    141.6, -16.5, 140.5, -17.5, 139, -16.8, 136.5, -15.5, 136.9, -12.2, 135.5,
    -12, 132.5, -11.3, 130.2, -12.3, 129.5, -14.8, 127, -14, 125, -15.5, 122.2,
    -17.5, 121.4, -19.4, 118.5, -20.3, 116.7, -20.6, 114.2, -21.8,
  ],
  // Tasmania
  [144.6, -40.7, 148.3, -40.9, 148, -43.2, 146, -43.6],
  // New Zealand, North Island
  [
    172.7, -34.4, 174.6, -36, 175.9, -37.4, 178.5, -37.7, 177, -39.3, 176,
    -41.3, 174.8, -41.3, 173.8, -39.2, 174.6, -37.5,
  ],
  // New Zealand, South Island
  [
    172.7, -40.5, 174.3, -41.7, 173.2, -43.4, 171.2, -44.4, 169, -46.6, 166.5,
    -46, 167, -44.7, 170.3, -43,
  ],
  // Cuba
  [
    -84.9, 21.9, -80.5, 23.1, -76.5, 21.3, -74.2, 20.2, -77.5, 19.9, -80.2,
    21.7,
  ],
  // Hispaniola
  [-74.4, 19.9, -72, 19.9, -68.4, 18.6, -71.3, 17.7, -74.4, 18.4],
];
const SEAS: number[][] = [
  // The Black Sea
  [
    27.9, 42, 28.6, 43.4, 29.7, 45.3, 31.5, 46.6, 33.5, 44.6, 36.5, 45.3, 38.3,
    44.3, 41.6, 41.6, 39, 41.1, 36, 41.7, 33.3, 42, 31, 41.2, 29, 41.2,
  ],
  // The Caspian Sea
  [
    47, 44.9, 49.2, 46.4, 51.8, 47.1, 53.1, 46.7, 52.8, 45.3, 51, 44.5, 52.8,
    41.8, 53.9, 40.2, 53.9, 37.3, 50.9, 36.8, 49, 37.8, 49.4, 40.2, 48, 42,
    47.5, 43.1,
  ],
];

/** Antarctica: a ring round the pole, and the pole itself to close it. */
const ANTARCTICA: number[] = (() => {
  const out: number[] = [];
  for (let lon = -180; lon <= 180; lon += 15) {
    out.push(lon, -70 + (2.5 * Math.round(Math.sin(lon * 0.05) * 100)) / 100);
  }
  out.push(180, -90, -180, -90);
  return out;
})();

type Ring = { lam: Float64Array; sinP: Float64Array; cosP: Float64Array };

const DEG = Math.PI / 180;
const FALLBACK = PHONE_COUNTRIES[0] as PhoneCountry;

/** Outlines sampled to 3° at most, with each point's latitude trig done once. */
function prepare(flat: number[]): Ring {
  const pts: [number, number][] = [];
  const n = flat.length / 2;
  for (let i = 0; i < n; i += 1) {
    const a0 = flat[i * 2] ?? 0;
    const b0 = flat[i * 2 + 1] ?? 0;
    const j = (i + 1) % n;
    const a1 = flat[j * 2] ?? 0;
    const b1 = flat[j * 2 + 1] ?? 0;
    const steps = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(a1 - a0), Math.abs(b1 - b0)) / 3),
    );
    for (let k = 0; k < steps; k += 1) {
      pts.push([a0 + ((a1 - a0) * k) / steps, b0 + ((b1 - b0) * k) / steps]);
    }
  }
  const lam = new Float64Array(pts.length);
  const sinP = new Float64Array(pts.length);
  const cosP = new Float64Array(pts.length);
  pts.forEach(([lon, lat], i) => {
    lam[i] = lon * DEG;
    sinP[i] = Math.sin(lat * DEG);
    cosP[i] = Math.cos(lat * DEG);
  });
  return { lam, sinP, cosP };
}

const LAND_RINGS = [...LAND, ANTARCTICA].map(prepare);
const SEA_RINGS = SEAS.map(prepare);

/** Graticule lines, sampled every 6°: meridians and parallels 30° apart. */
const GRID_LINES: Ring[] = (() => {
  const lines: Ring[] = [];
  const line = (pts: [number, number][]) => {
    const lam = new Float64Array(pts.length);
    const sinP = new Float64Array(pts.length);
    const cosP = new Float64Array(pts.length);
    pts.forEach(([lon, lat], i) => {
      lam[i] = lon * DEG;
      sinP[i] = Math.sin(lat * DEG);
      cosP[i] = Math.cos(lat * DEG);
    });
    lines.push({ lam, sinP, cosP });
  };
  for (let lon = -180; lon < 180; lon += 30) {
    const pts: [number, number][] = [];
    for (let lat = -84; lat <= 84; lat += 6) pts.push([lon, lat]);
    line(pts);
  }
  for (const lat of [-60, -30, 0, 30, 60]) {
    const pts: [number, number][] = [];
    for (let lon = -180; lon <= 180; lon += 6) pts.push([lon, lat]);
    line(pts);
  }
  return lines;
})();

/** The drawing: a 120-unit box with the globe's disc inside it. */
const VIEW = 120;
const CX = 60;
const R = 54;

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clampLat = (v: number) => Math.max(-70, Math.min(70, v));

/**
 * Orthographic outline of a ring for a view centred on (lon0, lat0). Points
 * on the far side are pulled onto the limb, so a coast that runs round the
 * back follows the edge of the disc instead of crossing the front; a ring
 * with nothing on the near side is left out.
 */
function outline(ring: Ring, lon0: number, sinL: number, cosL: number): string {
  const { lam, sinP, cosP } = ring;
  let d = "";
  let seen = false;
  for (let i = 0; i < lam.length; i += 1) {
    const l = (lam[i] ?? 0) - lon0;
    const cp = cosP[i] ?? 0;
    const sp = sinP[i] ?? 0;
    const cl = Math.cos(l);
    let x = cp * Math.sin(l);
    let y = cosL * sp - sinL * cp * cl;
    const z = sinL * sp + cosL * cp * cl;
    if (z >= 0) seen = true;
    else {
      const h = Math.hypot(x, y) || 1;
      x /= h;
      y /= h;
    }
    d += `${i === 0 ? "M" : "L"}${r1(CX + R * x)} ${r1(CX - R * y)}`;
  }
  return seen ? `${d}Z` : "";
}

/** The visible runs of an open line, each its own subpath. */
function visibleRuns(
  ring: Ring,
  lon0: number,
  sinL: number,
  cosL: number,
): string {
  const { lam, sinP, cosP } = ring;
  let d = "";
  let pen = false;
  for (let i = 0; i < lam.length; i += 1) {
    const l = (lam[i] ?? 0) - lon0;
    const cp = cosP[i] ?? 0;
    const sp = sinP[i] ?? 0;
    const cl = Math.cos(l);
    const z = sinL * sp + cosL * cp * cl;
    if (z < 0) {
      pen = false;
      continue;
    }
    const x = cp * Math.sin(l);
    const y = cosL * sp - sinL * cp * cl;
    d += `${pen ? "L" : "M"}${r1(CX + R * x)} ${r1(CX - R * y)}`;
    pen = true;
  }
  return d;
}

/** The shortest-way target: `to` shifted by whole turns to lie nearest `from`. */
const nearestTurn = (to: number, from: number) =>
  to + 360 * Math.round((from - to) / 360);

/** Angular distance between two places, in degrees. */
function between(aLon: number, aLat: number, bLon: number, bLat: number) {
  const c =
    Math.sin(aLat * DEG) * Math.sin(bLat * DEG) +
    Math.cos(aLat * DEG) * Math.cos(bLat * DEG) * Math.cos((aLon - bLon) * DEG);
  return Math.acos(Math.max(-1, Math.min(1, c))) / DEG;
}

const digitsOf = (text: string) => text.replace(/\D/g, "");
const needOf = (c: PhoneCountry) => (c.pattern.match(/#/g) ?? []).length;

/** Digits poured into a country's pattern, stopping after the last digit. */
function shape(digits: string, pattern: string): string {
  let out = "";
  let i = 0;
  for (const ch of pattern) {
    if (i >= digits.length) break;
    if (ch === "#") {
      out += digits[i];
      i += 1;
    } else out += ch;
  }
  return out + digits.slice(i);
}

/** Where the caret goes: just after the `count`th digit of `text`. */
function caretAfter(text: string, count: number): number {
  if (count <= 0) {
    const first = text.search(/\d/);
    return first === -1 ? text.length : first;
  }
  let seen = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (/\d/.test(text[i] ?? "")) {
      seen += 1;
      if (seen === count) return i + 1;
    }
  }
  return text.length;
}

const fold = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** One digit of the dial code: an odometer strip that rolls to its digit. */
function DialSlot({
  digit,
  width,
}: {
  digit: MotionValue<number>;
  width: MotionValue<number>;
}) {
  const y = useTransform(digit, (d) => r2(-d * 20));
  const w = useTransform(width, (v) => `${r2(Math.max(0, v))}ch`);
  return (
    <motion.span
      className="relative inline-block h-5 overflow-clip"
      style={{ width: w }}
    >
      <motion.span
        className="absolute top-0 left-0 flex flex-col"
        style={{ y }}
      >
        {Array.from({ length: 10 }, (_, d) => (
          <span key={d} className="block h-5 leading-5">
            {d}
          </span>
        ))}
      </motion.span>
    </motion.span>
  );
}

/**
 * A phone number field whose country picker is a small globe. Choosing a
 * country turns the globe to it, the short way round, on a spring derived
 * from drift and scaled by `spin`, and the country's pin drops onto the
 * centre on recoil; the dial code rolls to the new one digit by digit on
 * glide. The globe can be thrown: it turns 1:1 under a horizontal drag and a
 * release comes to rest on the country nearest where the throw would stop.
 * The number formats for its country as it is typed, keeping the caret after
 * the same digit.
 *
 * The globe is a button that opens a searchable list — a combobox and a
 * listbox — whose highlight previews each country on the globe; Left and
 * Right on the globe turn it to the next country west or east. The number is
 * a native tel input with its label, hint and error, and a hidden input
 * carries the international form. Under reduced motion the globe and the
 * dial code change without travel, and the list appears without a glide.
 */
export function GlobePhone({
  label = "Phone number",
  value,
  defaultValue = "",
  onValueChange,
  country,
  defaultCountry = "GB",
  onCountryChange,
  countries = PHONE_COUNTRIES,
  spin = 1,
  grid = true,
  format = true,
  name,
  hint,
  error,
  required = false,
  sound = false,
  disabled = false,
  className,
}: GlobePhoneProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const safeId = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const inputId = `${uid}-input`;
  const labelId = `${uid}-label`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const dialId = `${uid}-dial`;
  const listId = `${uid}-list`;
  const moveHintId = `${uid}-globe-hint`;
  const oceanId = `globe-ocean-${safeId}`;
  const shadeId = `globe-shade-${safeId}`;
  const clipId = `globe-clip-${safeId}`;
  const pace = Math.min(1.5, Math.max(0.3, spin));

  const byCode = (code: string | undefined) =>
    countries.find((c) => c.code === code);
  const [ownCountry, setOwnCountry] = React.useState(defaultCountry);
  const chosen = byCode(country ?? ownCountry) ?? countries[0] ?? FALLBACK;
  const [own, setOwn] = React.useState(() => digitsOf(defaultValue));
  const controlled = value !== undefined;
  const need = needOf(chosen);
  const digits = digitsOf(value ?? own).slice(0, need);
  const shown = format ? shape(digits, chosen.pattern) : digits;
  const international = digits ? `+${chosen.dial}${digits}` : "";

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [shortAt, setShortAt] = React.useState<string | null>(null);
  const [check, setCheck] = React.useState(0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const [seenError, setSeenError] = React.useState(error ?? null);
  if ((error ?? null) !== seenError) {
    setSeenError(error ?? null);
    if (error) setSaid((s) => ({ n: s.n + 1, text: error }));
  }

  const q = fold(query.trim()).replace(/^\+/, "");
  // Names that start with what was typed come first, then any that hold it.
  const rank = (c: PhoneCountry) => {
    const names = [fold(c.name), ...fold(c.alias ?? "").split(" ")];
    if (c.code.toLowerCase() === q || c.dial === q) return 0;
    if (names.some((n) => n && n.startsWith(q))) return 1;
    if (c.dial.startsWith(q)) return 2;
    if (names.some((n) => n.includes(q))) return 3;
    return 4;
  };
  const matches = q
    ? countries
        .map((c) => ({ c, r: rank(c) }))
        .filter((m) => m.r < 4)
        .sort((a, b) => a.r - b.r)
        .map((m) => m.c)
    : countries;
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));
  const activeCountry = matches[activeIndex];

  const lon0 = useMotionValue(chosen.lon);
  const lat0 = useMotionValue(clampLat(chosen.lat));
  const pin = useMotionValue(1);
  const [slots] = React.useState(() =>
    Array.from({ length: 3 }, (_, i) => {
      const d = chosen.dial[i];
      return {
        digit: motionValue(d === undefined ? 0 : Number(d)),
        width: motionValue(d === undefined ? 0 : 1),
      };
    }),
  );

  const globeRef = React.useRef<HTMLButtonElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  const loop = React.useRef<LoopHandle | null>(null);
  const ticking = React.useRef(false);
  const lastLon = React.useRef(chosen.lon);
  const dragFrom = React.useRef(0);
  const degPerPx = React.useRef(1);
  const caret = React.useRef<number | null>(null);
  const turnedTo = React.useRef(chosen.code);
  const rolledTo = React.useRef(chosen.dial);
  const pendingFocus = React.useRef(false);
  const measured = React.useRef<ResizeObserver | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  const api = React.useRef<{ settled: () => void } | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };
  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, Math.max(0, Math.round(ms))));
  };

  // The globe's spring is drift's, scaled: stiffness by pace², damping by
  // pace, so the damping ratio stays at 1 and only the speed changes.
  const turning = {
    type: "spring" as const,
    stiffness: springs.drift.stiffness * pace * pace,
    damping: springs.drift.damping * pace,
    mass: springs.drift.mass,
  };

  const hush = () => {
    loop.current?.stop();
    loop.current = null;
    ticking.current = false;
  };

  const voice = () => {
    if (!loop.current) {
      loop.current = audio.start("whir", { pitch: r2(0.7 * pace), gain: 0 });
    }
    ticking.current = true;
  };

  /** Turns the globe to a place; with a voice when the visitor turned it. */
  const turnTo = (
    target: PhoneCountry,
    options: { audible: boolean; velocity?: number; land?: boolean },
  ) => {
    const toLon = nearestTurn(target.lon, lon0.get());
    const toLat = clampLat(target.lat);
    if (!motionSafe) {
      // No spin to wait for: a whir a drag started stops with the jump.
      halt("lon");
      halt("lat");
      hush();
      lon0.set(toLon);
      lat0.set(toLat);
      lastLon.current = toLon;
      pin.set(1);
      return;
    }
    if (options.audible) voice();
    if (options.land !== false) pin.set(0);
    run(
      "lon",
      animate(lon0, toLon, {
        ...turning,
        velocity: options.velocity ?? lon0.getVelocity(),
        onComplete: () => api.current?.settled(),
      }),
    );
    run("lat", animate(lat0, toLat, turning));
  };

  const settled = () => {
    hush();
    if (!motionSafe) return;
    run("pin", animate(pin, 1, springs.recoil));
  };

  /** The dial code's slots roll to a new code, left to right. */
  const roll = (dial: string, audible: boolean) => {
    const step = cascade(3);
    slots.forEach((slot, i) => {
      const d = dial[i];
      if (!motionSafe) {
        halt(`w-${i}`);
        halt(`d-${i}`);
        slot.width.set(d === undefined ? 0 : 1);
        if (d !== undefined) slot.digit.set(Number(d));
        return;
      }
      run(
        `w-${i}`,
        animate(slot.width, d === undefined ? 0 : 1, springs.glide),
      );
      if (d === undefined) return;
      const delay = i * step;
      run(
        `d-${i}`,
        animate(slot.digit, Number(d), { ...springs.glide, delay }),
      );
      if (audible) {
        later((delay + 0.22) * 1000, () =>
          audio.play("tick", { pitch: r2(0.9 + Number(d) * 0.03), gain: 0.4 }),
        );
      }
    });
  };

  const choose = (next: PhoneCountry, velocity?: number) => {
    if (disabled) return;
    const changed = next.code !== chosen.code;
    turnedTo.current = next.code;
    turnTo(next, { audible: true, velocity });
    if (next.dial !== rolledTo.current) {
      rolledTo.current = next.dial;
      roll(next.dial, true);
    }
    if (!changed) return;
    if (country === undefined) setOwnCountry(next.code);
    onCountryChange?.(next.code);
    // A controlled host answers on its own schedule; once it has, a host that
    // refused the country gets the globe turned back to its own.
    if (country !== undefined)
      React.startTransition(() => setCheck((c) => c + 1));
    say(`${next.name}, +${next.dial}.`);
    // A number longer than the new country allows is cut to fit, and the
    // host hears about it from the same choice.
    const cut = digits.slice(0, needOf(next));
    if (cut !== digits) {
      if (!controlled) setOwn(cut);
      onValueChange?.(cut, cut ? `+${next.dial}${cut}` : "");
    }
  };

  // What the host says the country is. A choice made here has already turned
  // the globe and rolled the code; anything else does both in silence.
  React.useEffect(() => {
    if (turnedTo.current !== chosen.code) {
      turnedTo.current = chosen.code;
      turnTo(chosen, { audible: false });
    }
    if (rolledTo.current !== chosen.dial) {
      rolledTo.current = chosen.dial;
      roll(chosen.dial, false);
    }
    // Only the chosen country moves the globe here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen.code, chosen.dial, check]);

  React.useEffect(() => {
    api.current = { settled };
  });

  // Ticks as listed countries pass under the centre, while the visitor turns it.
  React.useEffect(
    () =>
      lon0.on("change", (now) => {
        const before = lastLon.current;
        lastLon.current = now;
        if (!ticking.current) return;
        const speed = Math.abs(lon0.getVelocity());
        loop.current?.set({
          pitch: r2(Math.min(2.4, (0.6 + speed / 260) * pace)),
          gain: r2(Math.min(0.7, speed / 500)),
        });
        const lo = Math.min(before, now);
        const hi = Math.max(before, now);
        if (hi - lo < 1e-3) return;
        for (const c of countries) {
          const at = c.lon + 360 * Math.ceil((lo - c.lon) / 360);
          if (at > lo && at <= hi) {
            audio.play("tick", { pitch: 1.2, gain: 0.28 });
            break;
          }
        }
      }),
    [lon0, audio, countries, pace],
  );

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
      for (const c of running.values()) c.stop();
      running.clear();
      loop.current?.stop();
      loop.current = null;
    };
  }, []);

  // A hidden page stops the whir and lets the globe finish where it is going.
  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) hush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // The caret goes back after the same digit once the reformatted text lands.
  React.useLayoutEffect(() => {
    const at = caret.current;
    const node = inputRef.current;
    caret.current = null;
    if (at === null || !node || document.activeElement !== node) return;
    node.setSelectionRange(at, at);
  });

  const report = (next: string, caretDigits: number | null) => {
    const cut = next.slice(0, need);
    if (caretDigits !== null) {
      const text = format ? shape(cut, chosen.pattern) : cut;
      caret.current = caretAfter(text, Math.min(caretDigits, cut.length));
    }
    if (cut === digits) {
      // Nothing changed, so nothing re-renders: React puts the old text
      // back after this handler, and the caret is set after that.
      const at = caret.current;
      const node = inputRef.current;
      caret.current = null;
      if (at !== null && node)
        queueMicrotask(() => node.setSelectionRange(at, at));
      return;
    }
    if (!controlled) setOwn(cut);
    onValueChange?.(cut, cut ? `+${chosen.dial}${cut}` : "");
  };

  const onInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const node = event.target;
    const before = node.value.slice(
      0,
      node.selectionStart ?? node.value.length,
    );
    report(digitsOf(node.value), digitsOf(before).length);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled || !format) return;
    const node = event.currentTarget;
    const start = node.selectionStart ?? 0;
    const end = node.selectionEnd ?? 0;
    if (start !== end) return;
    // Deleting over a space or a bracket would only bring it straight back:
    // the digit beyond it goes instead.
    if (
      event.key === "Backspace" &&
      start > 0 &&
      /\D/.test(node.value[start - 1] ?? "")
    ) {
      const k = digitsOf(node.value.slice(0, start)).length;
      if (k === 0) return;
      event.preventDefault();
      report(digits.slice(0, k - 1) + digits.slice(k), k - 1);
    } else if (event.key === "Delete" && /\D/.test(node.value[start] ?? "")) {
      const k = digitsOf(node.value.slice(0, start)).length;
      if (k >= digits.length) return;
      event.preventDefault();
      report(digits.slice(0, k) + digits.slice(k + 1), k);
    }
  };

  const openList = () => {
    if (disabled || open) return;
    setQuery("");
    setActive(
      Math.max(
        0,
        countries.findIndex((c) => c.code === chosen.code),
      ),
    );
    setOpen(true);
  };

  /** Closes the list; unless something was chosen, the globe turns back. */
  const closeList = (then: "globe" | "input" | null, revert = true) => {
    setOpen(false);
    if (revert) turnTo(chosen, { audible: false, land: false });
    if (then === "globe") globeRef.current?.focus({ preventScroll: true });
    // The number field comes back with this close; it takes focus when it
    // arrives, in its ref.
    else if (then === "input") pendingFocus.current = true;
  };

  const bindInput = React.useCallback((node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (node && pendingFocus.current) {
      pendingFocus.current = false;
      node.focus({ preventScroll: true });
    }
  }, []);

  const preview = (index: number) => {
    const next = matches[index];
    setActive(index);
    if (!next) return;
    turnTo(next, { audible: true, land: false });
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (list && row) {
      if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
      else if (
        row.offsetTop + row.offsetHeight >
        list.scrollTop + list.clientHeight
      ) {
        list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
      }
    }
  };

  const pick = (next: PhoneCountry) => {
    closeList("input", false);
    choose(next);
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const n = matches.length;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (n) preview(Math.min(n - 1, activeIndex + 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        if (n) preview(Math.max(0, activeIndex - 1));
        return;
      case "PageDown":
        event.preventDefault();
        if (n) preview(Math.min(n - 1, activeIndex + 4));
        return;
      case "PageUp":
        event.preventDefault();
        if (n) preview(Math.max(0, activeIndex - 4));
        return;
      case "Enter":
        event.preventDefault();
        if (activeCountry) pick(activeCountry);
        return;
      case "Escape":
        // Handled here, where focus is: the page must not also see it.
        event.preventDefault();
        event.stopPropagation();
        closeList("globe");
        return;
      case "Tab":
        event.preventDefault();
        closeList(event.shiftKey ? "globe" : "input");
        return;
    }
  };

  // A press anywhere outside closes the list and turns the globe back.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && root.contains(event.target))
        return;
      setOpen(false);
      turnTo(chosen, { audible: false, land: false });
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
    // Bound while open, to the country chosen when it opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** The next listed country to the east (1) or west (-1) of the chosen one. */
  const step = (dir: 1 | -1) => {
    const east = [...countries].sort((a, b) => a.lon - b.lon);
    const at = east.findIndex((c) => c.code === chosen.code);
    const next = east[(at + dir + east.length) % east.length];
    if (next) choose(next);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: () => {
      halt("lon");
      halt("lat");
      const rect = globeRef.current?.getBoundingClientRect();
      const radius = rect ? (rect.width / 2) * (R / CX) : R;
      degPerPx.current = 1 / (radius * DEG);
      dragFrom.current = lon0.get();
      voice();
    },
    onMove: ({ offset }) => {
      lon0.set(r2(dragFrom.current - offset.x * degPerPx.current));
    },
    onEnd: ({ velocity }) => {
      const spinRate = -velocity.x * degPerPx.current;
      const rest = project(lon0.get(), spinRate, 0.996);
      const lat = lat0.get();
      let best = chosen;
      let bestD = Infinity;
      for (const c of countries) {
        const d = between(rest, lat, c.lon, c.lat);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      choose(best, spinRate);
    },
    onCancel: () => {
      turnTo(chosen, { audible: false, land: false });
    },
    onTap: () => openList(),
  });

  // The column's height is measured, so opening the list glides the card's
  // content instead of jumping it, and nothing is held open for a state.
  const bindMeasure = React.useCallback((node: HTMLDivElement | null) => {
    measured.current?.disconnect();
    measured.current = null;
    if (!node) return;
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.observe(node);
    measured.current = observer;
  }, []);

  const bindSearch = React.useCallback((node: HTMLInputElement | null) => {
    node?.focus({ preventScroll: true });
  }, []);

  const view = useTransform(
    [lon0, lat0] as MotionValue<number>[],
    ([lo = 0, la = 0]: number[]) => {
      const l0 = lo * DEG;
      const sinL = Math.sin(la * DEG);
      const cosL = Math.cos(la * DEG);
      let land = "";
      for (const ring of LAND_RINGS) land += outline(ring, l0, sinL, cosL);
      let seas = "";
      for (const ring of SEA_RINGS) seas += outline(ring, l0, sinL, cosL);
      let lines = "";
      if (grid) {
        for (const ring of GRID_LINES)
          lines += visibleRuns(ring, l0, sinL, cosL);
      }
      let dots = "";
      for (const c of countries) {
        const l = (c.lon - lo) * DEG;
        const p = c.lat * DEG;
        const z = sinL * Math.sin(p) + cosL * Math.cos(p) * Math.cos(l);
        if (z < 0.05) continue;
        const x = r1(CX + R * Math.cos(p) * Math.sin(l));
        const y = r1(
          CX - R * (cosL * Math.sin(p) - sinL * Math.cos(p) * Math.cos(l)),
        );
        dots += `M${r1(x - 1.1)} ${y}a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0 -2.2 0`;
      }
      return { land, seas, lines, dots };
    },
  );
  const landPath = useTransform(view, (v) => v.land);
  const seaPath = useTransform(view, (v) => v.seas);
  const gridPath = useTransform(view, (v) => v.lines);
  const dotPath = useTransform(view, (v) => v.dots);
  const marker = useTransform(
    [lon0, lat0] as MotionValue<number>[],
    ([lo = 0, la = 0]: number[]) => {
      const l = (chosen.lon - lo) * DEG;
      const p = chosen.lat * DEG;
      const sinL = Math.sin(la * DEG);
      const cosL = Math.cos(la * DEG);
      const z = sinL * Math.sin(p) + cosL * Math.cos(p) * Math.cos(l);
      return {
        x: r1(CX + R * Math.cos(p) * Math.sin(l)),
        y: r1(CX - R * (cosL * Math.sin(p) - sinL * Math.cos(p) * Math.cos(l))),
        on: z > 0 ? 1 : 0,
      };
    },
  );
  const markerX = useTransform(marker, (m) => m.x);
  const markerY = useTransform(marker, (m) => m.y);
  const markerOn = useTransform(marker, (m) => m.on);
  const ringR = useTransform(pin, (p) => r2(Math.max(0, 2 + 4 * p)));
  const ringOpacity = useTransform(pin, (p) =>
    r2(Math.max(0, Math.min(1, p)) * 0.8),
  );
  const dotR = useTransform(pin, (p) => r2(Math.max(0.8, 1.2 + 1.3 * p)));

  // Said on blur for a number that is short for its country; typing, or a
  // country the number fits, puts it away.
  const shortText =
    shortAt !== null && shortAt === digits && digits.length < need
      ? `That's ${digits.length} of the ${need} digits a +${chosen.dial} number needs.`
      : null;
  const errorText = error || shortText;
  const describedBy = [dialId, hint ? hintId : "", errorText ? errorId : ""]
    .filter(Boolean)
    .join(" ");
  const placeholder = format
    ? shape("0123456789012345".slice(0, need), chosen.pattern)
    : "0123456789012345".slice(0, need);

  return (
    <div
      ref={rootRef}
      className={cn(
        "@container w-full max-w-[34rem]",
        disabled && "opacity-50",
        className,
      )}
    >
      {/* Below 20rem the globe sits above the field, so the number keeps
          the whole width instead of scrolling out of a narrow box. */}
      <div className="flex flex-col items-center gap-3 @[20rem]:flex-row @[22rem]:gap-4 @[30rem]:gap-5">
        <button
          ref={globeRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-label={`Country: ${chosen.name}, +${chosen.dial}`}
          aria-describedby={moveHintId}
          disabled={disabled}
          onClick={(event) => {
            // A pointer press arrives through the drag's tap; a click with no
            // pointer behind it (Enter, Space, assistive technology) opens.
            if (event.detail === 0) openList();
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              openList();
            } else if (
              event.key === "ArrowRight" ||
              event.key === "ArrowLeft"
            ) {
              event.preventDefault();
              step(event.key === "ArrowRight" ? 1 : -1);
            }
          }}
          {...drag}
          className={cn(
            "group/globe-phone relative size-22 shrink-0 cursor-grab touch-pan-y rounded-full outline-none select-none active:cursor-grabbing @[22rem]:size-26 @[30rem]:size-34",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "disabled:cursor-not-allowed",
          )}
        >
          <svg
            aria-hidden
            viewBox={`0 0 ${VIEW} ${VIEW}`}
            className="block size-full"
          >
            <defs>
              <radialGradient id={oceanId} cx={0.4} cy={0.36} r={0.7}>
                <stop offset={0} stopColor="oklch(0.66 0.1 238)" />
                <stop offset={1} stopColor="oklch(0.46 0.1 250)" />
              </radialGradient>
              <radialGradient id={shadeId} cx={0.42} cy={0.38} r={0.62}>
                <stop
                  offset={0.55}
                  stopColor="oklch(0.2 0.04 255)"
                  stopOpacity={0}
                />
                <stop
                  offset={1}
                  stopColor="oklch(0.2 0.04 255)"
                  stopOpacity={0.5}
                />
              </radialGradient>
              <clipPath id={clipId}>
                <circle cx={CX} cy={CX} r={R} />
              </clipPath>
            </defs>
            <circle cx={CX} cy={CX} r={R} fill={`url(#${oceanId})`} />
            <g clipPath={`url(#${clipId})`}>
              {grid ? (
                <motion.path
                  d={gridPath}
                  fill="none"
                  stroke="oklch(0.95 0.02 240 / 0.3)"
                  strokeWidth={0.6}
                />
              ) : null}
              <motion.path
                d={landPath}
                fill="oklch(0.83 0.09 138)"
                stroke="oklch(0.68 0.09 142)"
                strokeWidth={0.5}
                strokeLinejoin="round"
              />
              <motion.path d={seaPath} fill="oklch(0.58 0.1 242)" />
              <motion.path d={dotPath} fill="oklch(0.36 0.06 150)" />
              <motion.g style={{ opacity: markerOn }}>
                <motion.circle
                  cx={markerX}
                  cy={markerY}
                  r={ringR}
                  fill="none"
                  strokeWidth={1.4}
                  style={{
                    stroke: "var(--accent-bright)",
                    opacity: ringOpacity,
                  }}
                />
                <motion.circle
                  cx={markerX}
                  cy={markerY}
                  r={dotR}
                  stroke="white"
                  strokeWidth={0.8}
                  style={{ fill: "var(--accent-bright)" }}
                />
              </motion.g>
              {open ? (
                <path
                  d={`M${CX} ${CX - 6}v4M${CX} ${CX + 2}v4M${CX - 6} ${CX}h4M${CX + 2} ${CX}h4`}
                  stroke="white"
                  strokeOpacity={0.75}
                  strokeWidth={1}
                  strokeLinecap="round"
                />
              ) : null}
              <circle cx={CX} cy={CX} r={R} fill={`url(#${shadeId})`} />
              <ellipse
                cx={42}
                cy={34}
                rx={16}
                ry={10}
                fill="white"
                opacity={0.14}
              />
            </g>
            <circle
              cx={CX}
              cy={CX}
              r={R}
              fill="none"
              strokeWidth={1}
              className="stroke-hairline-strong"
            />
          </svg>
          <span
            aria-hidden
            className="absolute right-0.5 bottom-0.5 flex size-6 items-center justify-center rounded-full border border-hairline-strong bg-popover text-ink-2 transition-colors group-hover/globe-phone:text-foreground @[30rem]:right-1.5 @[30rem]:bottom-1.5"
          >
            <svg
              viewBox="0 0 16 16"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4.5 6.5 8 10l3.5-3.5" />
            </svg>
          </span>
        </button>

        <motion.div
          className="w-full min-w-0 flex-1 overflow-clip p-1"
          initial={false}
          animate={{ height: height === null ? "auto" : height + 8 }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        >
          <div ref={bindMeasure}>
            {open ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: durations.fast, ease: easings.enter }}
                className="flex flex-col gap-1.5 rounded-3 border border-hairline-strong bg-popover p-1.5"
              >
                <input
                  ref={bindSearch}
                  type="text"
                  role="combobox"
                  aria-expanded
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={
                    activeCountry
                      ? `${uid}-opt-${activeCountry.code}`
                      : undefined
                  }
                  aria-label="Search countries"
                  placeholder="Search countries"
                  autoComplete="off"
                  spellCheck={false}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onSearchKeyDown}
                  className={cn(
                    "h-8 w-full min-w-0 rounded-2 border border-input bg-surface-1 px-2.5 text-sm text-foreground outline-none placeholder:text-ink-3",
                    "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
                  )}
                />
                <ul
                  ref={listRef}
                  id={listId}
                  role="listbox"
                  aria-label="Countries"
                  className="relative max-h-34 overflow-y-auto overscroll-contain"
                >
                  {matches.map((c, i) => {
                    const isActive = i === activeIndex;
                    const isChosen = c.code === chosen.code;
                    return (
                      <li
                        key={c.code}
                        id={`${uid}-opt-${c.code}`}
                        data-index={i}
                        role="option"
                        aria-selected={isChosen}
                        onPointerMove={(event) => {
                          if (
                            event.pointerType === "mouse" &&
                            i !== activeIndex
                          )
                            preview(i);
                        }}
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() => pick(c)}
                        className={cn(
                          "flex h-8 cursor-pointer items-center gap-2.5 rounded-2 px-2 text-sm",
                          isActive ? "bg-cobalt-wash" : "",
                          isChosen ? "text-cobalt-bright" : "text-foreground",
                        )}
                      >
                        <span className="hidden w-6 shrink-0 font-mono text-[10px] tracking-[0.06em] text-ink-3 @[22rem]:inline">
                          {c.code}
                        </span>
                        <span
                          className="min-w-0 flex-1 truncate"
                          title={c.name}
                        >
                          {c.name}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-ink-3 tabular-nums">
                          +{c.dial}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {matches.length === 0 ? (
                  <p role="status" className="px-2 pb-1 text-xs text-ink-3">
                    No country matches “{query.trim()}”.
                  </p>
                ) : null}
              </motion.div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label
                  id={labelId}
                  htmlFor={inputId}
                  className="text-sm font-medium text-foreground"
                >
                  {label}
                </label>
                <div
                  className={cn(
                    "flex h-11 min-w-0 items-center rounded-3 border bg-surface-1 transition-colors",
                    "has-[input:focus-visible]:border-cobalt-bright has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring has-[input:focus-visible]:outline-solid",
                    errorText ? "border-danger" : "border-input",
                  )}
                >
                  <span
                    aria-hidden
                    className="flex h-full shrink-0 items-center gap-1.5 border-r border-hairline pr-2.5 pl-3 font-mono text-sm text-foreground"
                  >
                    <span className="hidden text-[10px] tracking-[0.06em] text-ink-3 @[22rem]:inline">
                      {chosen.code}
                    </span>
                    <span className="inline-flex items-center tabular-nums">
                      +
                      {slots.map((slot, i) => (
                        <DialSlot
                          key={i}
                          digit={slot.digit}
                          width={slot.width}
                        />
                      ))}
                    </span>
                  </span>
                  {/* The ring is the box's, round the code and the number
                      together; the input itself draws none. */}
                  <input
                    ref={bindInput}
                    id={inputId}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    value={shown}
                    placeholder={placeholder}
                    required={required}
                    disabled={disabled}
                    aria-invalid={errorText ? true : undefined}
                    aria-describedby={describedBy}
                    onChange={onInput}
                    onKeyDown={onInputKeyDown}
                    onBlur={() => {
                      const short = digits.length > 0 && digits.length < need;
                      setShortAt(short ? digits : null);
                      if (short && !error) {
                        say(
                          `That's ${digits.length} of the ${need} digits a +${chosen.dial} number needs.`,
                        );
                      }
                    }}
                    className="h-full w-full min-w-0 bg-transparent px-3 font-mono text-sm text-foreground tabular-nums outline-none placeholder:text-ink-3 disabled:cursor-not-allowed"
                  />
                </div>
                {hint || errorText ? (
                  <div className="grid text-xs leading-4">
                    {hint ? (
                      <p
                        id={hintId}
                        aria-hidden={errorText ? true : undefined}
                        className={cn(
                          "col-start-1 row-start-1 text-ink-3 transition-opacity",
                          errorText ? "opacity-0" : "opacity-100",
                        )}
                      >
                        {hint}
                      </p>
                    ) : null}
                    <p
                      id={errorId}
                      className={cn(
                        "col-start-1 row-start-1 text-danger transition-opacity",
                        errorText ? "opacity-100" : "opacity-0",
                      )}
                    >
                      {errorText}
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      <span id={dialId} className="sr-only">
        {`Country code +${chosen.dial}, ${chosen.name}.`}
      </span>
      <span id={moveHintId} className="sr-only">
        Press Enter to search countries, or Left and Right to turn the globe to
        the next country.
      </span>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
      {name ? <input type="hidden" name={name} value={international} /> : null}
    </div>
  );
}
