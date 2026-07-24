import type { Metadata } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

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
      className={`${bricolage.variable} ${plusJakarta.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
