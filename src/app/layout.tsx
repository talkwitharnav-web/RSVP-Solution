import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Plus_Jakarta_Sans,
  Playfair_Display,
  Inter,
  Merriweather,
  Open_Sans,
  Yellowtail,
  Lato,
} from "next/font/google";
import { GlobalSettingsToggles } from "@/components/ui/GlobalSettingsToggles";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

// Curated font-pair presets for the "designed_template" invitation designer
// (src/lib/design-fonts.ts) -- next/font/google resolves and subsets fonts
// at build time, so a sender can't type in an arbitrary Google Font name at
// runtime (see "custom rsvp card designer.md" section 4); these are the
// fixed pairs they pick from instead, each statically imported here exactly
// like the app's own two fonts above.
const playfairDisplay = Playfair_Display({ variable: "--font-design-editorial-display", subsets: ["latin"] });
const interFont = Inter({ variable: "--font-design-editorial-body", subsets: ["latin"] });
const merriweather = Merriweather({ variable: "--font-design-classic-display", subsets: ["latin"], weight: ["700"] });
const openSans = Open_Sans({ variable: "--font-design-classic-body", subsets: ["latin"] });
const yellowtail = Yellowtail({ variable: "--font-design-playful-display", subsets: ["latin"], weight: "400" });
const lato = Lato({ variable: "--font-design-playful-body", subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "RSVP",
  description: "Create and share RSVPs with a link.",
};

// Applies the persisted theme/UI-size/accessibility prefs before paint, so
// there's no flash of the wrong settings (localStorage isn't available
// during server render). Same mechanism as the reference project's own
// layout.tsx init script.
const themeInitScript = `
(function () {
  try {
    var theme = localStorage.getItem("theme");
    if (theme === "dark" || theme === "light") {
      document.documentElement.setAttribute("data-theme", theme);
    }
    var uiSize = localStorage.getItem("uiSize");
    if (uiSize === "small" || uiSize === "big") {
      document.documentElement.setAttribute("data-ui-size", uiSize);
    }
    var contrast = localStorage.getItem("contrast");
    if (contrast === "high") {
      document.documentElement.setAttribute("data-contrast", "high");
    }
    var motion = localStorage.getItem("motion");
    if (motion === "reduced") {
      document.documentElement.setAttribute("data-motion", "reduced");
    }
    var focus = localStorage.getItem("focus");
    if (focus === "enhanced") {
      document.documentElement.setAttribute("data-focus", "enhanced");
    }
    var cvd = localStorage.getItem("cvd");
    if (cvd === "deuteranopia" || cvd === "protanopia" || cvd === "tritanopia") {
      document.documentElement.setAttribute("data-cvd", cvd);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${plusJakarta.variable} ${playfairDisplay.variable} ${interFont.variable} ${merriweather.variable} ${openSans.variable} ${yellowtail.variable} ${lato.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <GlobalSettingsToggles />
        {children}
      </body>
    </html>
  );
}
