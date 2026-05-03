import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Cinzel,
  EB_Garamond,
  Bebas_Neue,
  IM_Fell_DW_Pica,
} from "next/font/google";
import { TooltipProvider } from "./components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ─── Expedition 33 typography stack ──────────────────────────────────
// The Belle Époque vocabulary is layered: classical Roman caps for
// titles (Cinzel), period serif for body (Garamond), industrial sans
// for numeric HUD labels (Bebas Neue), and a distressed serif for
// flavor / marginalia (IM Fell). The mix is what makes the look read
// as "antique journal" rather than generic fantasy.

// Display face for headings ("PLAYERS", "INITIATIVE", "SOUNDBOARD").
const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// Body face for prose, list items, table cells. Warm period serif.
const ebGaramond = EB_Garamond({
  variable: "--font-garamond",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// HUD labels and numeric readouts. Tall, condensed, industrial.
const bebasNeue = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin"],
  weight: ["400"],
});

// Marginalia / footers. Distressed turn-of-century printer face.
const imFell = IM_Fell_DW_Pica({
  variable: "--font-imfell",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Daggor",
  description: "Online DnD Battlemap",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} ${ebGaramond.variable} ${bebasNeue.variable} ${imFell.variable} antialiased`}
      >
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
