import type { Metadata } from "next";
import Script from "next/script";
import {
  Bricolage_Grotesque,
  Plus_Jakarta_Sans,
  Playfair_Display,
  Inter,
  Merriweather,
  Open_Sans,
  Yellowtail,
  Lato,
  Cormorant_Garamond,
  Montserrat,
  Crimson_Text,
  Raleway,
  Libre_Caslon_Text,
  Source_Sans_3,
  Dancing_Script,
  Allura,
  Alex_Brush,
  Nunito_Sans,
  Great_Vibes,
  Mulish,
  Parisienne,
  Karla,
  Pacifico,
  Quicksand,
  Baloo_2,
  Nunito,
  Fredoka,
  Comfortaa,
  Luckiest_Guy,
  Poppins,
  Bungee,
  Work_Sans,
  Cormorant,
  Jost,
  Abril_Fatface,
  Lora,
  Cinzel,
  EB_Garamond,
  Marcellus,
  Prata,
  Space_Grotesk,
  IBM_Plex_Sans,
  Sora,
  Manrope,
  Outfit,
  Figtree,
  Unbounded,
  DM_Sans,
  Amatic_SC,
  Berkshire_Swash,
  Philosopher,
} from "next/font/google";
import { GlobalSettingsToggles } from "@/components/ui/GlobalSettingsToggles";
import { SessionWatcher } from "@/components/ui/SessionWatcher";
import { ToastProvider } from "@/components/ui/Toast";
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
// fixed 30 pairs they pick from instead, each statically imported here
// exactly like the app's own two fonts above.
const playfairDisplay = Playfair_Display({ variable: "--font-design-editorial-display", subsets: ["latin"], preload: false });
const interFont = Inter({ variable: "--font-design-editorial-body", subsets: ["latin"], preload: false });
const merriweather = Merriweather({ variable: "--font-design-classic-display", subsets: ["latin"], weight: ["700"], preload: false });
const openSans = Open_Sans({ variable: "--font-design-classic-body", subsets: ["latin"], preload: false });
const yellowtail = Yellowtail({ variable: "--font-design-playful-display", subsets: ["latin"], weight: "400", preload: false });
const lato = Lato({ variable: "--font-design-playful-body", subsets: ["latin"], weight: ["400", "700"], preload: false });

const cormorantGaramond = Cormorant_Garamond({ variable: "--font-design-garamond-display", subsets: ["latin"], weight: ["600"], preload: false });
const montserrat = Montserrat({ variable: "--font-design-garamond-body", subsets: ["latin"], preload: false });
const crimsonText = Crimson_Text({ variable: "--font-design-crimson-display", subsets: ["latin"], weight: ["600"], preload: false });
const raleway = Raleway({ variable: "--font-design-crimson-body", subsets: ["latin"], preload: false });
const libreCaslonText = Libre_Caslon_Text({ variable: "--font-design-librecaslon-display", subsets: ["latin"], weight: ["700"], preload: false });
const sourceSans3 = Source_Sans_3({ variable: "--font-design-librecaslon-body", subsets: ["latin"], preload: false });

const dancingScript = Dancing_Script({ variable: "--font-design-dancing-display", subsets: ["latin"], preload: false });
const latoBody2 = Lato({ variable: "--font-design-dancing-body", subsets: ["latin"], weight: ["400", "700"], preload: false });
const allura = Allura({ variable: "--font-design-allura-display", subsets: ["latin"], weight: "400", preload: false });
const plusJakartaBody2 = Plus_Jakarta_Sans({ variable: "--font-design-allura-body", subsets: ["latin"], preload: false });
const alexBrush = Alex_Brush({ variable: "--font-design-alexbrush-display", subsets: ["latin"], weight: "400", preload: false });
const nunitoSans = Nunito_Sans({ variable: "--font-design-alexbrush-body", subsets: ["latin"], preload: false });
const greatVibes = Great_Vibes({ variable: "--font-design-greatvibes-display", subsets: ["latin"], weight: "400", preload: false });
const mulish = Mulish({ variable: "--font-design-greatvibes-body", subsets: ["latin"], preload: false });
const parisienne = Parisienne({ variable: "--font-design-parisienne-display", subsets: ["latin"], weight: "400", preload: false });
const karla = Karla({ variable: "--font-design-parisienne-body", subsets: ["latin"], preload: false });

const pacifico = Pacifico({ variable: "--font-design-pacifico-display", subsets: ["latin"], weight: "400", preload: false });
const quicksand = Quicksand({ variable: "--font-design-pacifico-body", subsets: ["latin"], preload: false });
const baloo2 = Baloo_2({ variable: "--font-design-baloo-display", subsets: ["latin"], preload: false });
const nunito = Nunito({ variable: "--font-design-baloo-body", subsets: ["latin"], preload: false });
const fredoka = Fredoka({ variable: "--font-design-fredoka-display", subsets: ["latin"], preload: false });
const comfortaa = Comfortaa({ variable: "--font-design-fredoka-body", subsets: ["latin"], preload: false });
const luckiestGuy = Luckiest_Guy({ variable: "--font-design-luckiestguy-display", subsets: ["latin"], weight: "400", preload: false });
const poppins = Poppins({ variable: "--font-design-luckiestguy-body", subsets: ["latin"], weight: ["400", "600"], preload: false });
const bungee = Bungee({ variable: "--font-design-bungee-display", subsets: ["latin"], weight: "400", preload: false });
const workSans = Work_Sans({ variable: "--font-design-bungee-body", subsets: ["latin"], preload: false });

const cormorantEvening = Cormorant({ variable: "--font-design-evening-display", subsets: ["latin"], weight: ["600"], preload: false });
const jostBody = Jost({ variable: "--font-design-evening-body", subsets: ["latin"], preload: false });
const cormorantGaramond2 = Cormorant_Garamond({ variable: "--font-design-cormorant-display", subsets: ["latin"], weight: ["500"], preload: false });
const jost = Jost({ variable: "--font-design-cormorant-body", subsets: ["latin"], preload: false });
const abrilFatface = Abril_Fatface({ variable: "--font-design-abril-display", subsets: ["latin"], weight: "400", preload: false });
const lora = Lora({ variable: "--font-design-abril-body", subsets: ["latin"], preload: false });
const cinzel = Cinzel({ variable: "--font-design-cinzel-display", subsets: ["latin"], preload: false });
const ebGaramond = EB_Garamond({ variable: "--font-design-cinzel-body", subsets: ["latin"], preload: false });
const marcellus = Marcellus({ variable: "--font-design-marcellus-display", subsets: ["latin"], weight: "400", preload: false });
const poppinsBody = Poppins({ variable: "--font-design-marcellus-body", subsets: ["latin"], weight: ["400"], preload: false });
const prata = Prata({ variable: "--font-design-prata-display", subsets: ["latin"], weight: "400", preload: false });
const mulishBody2 = Mulish({ variable: "--font-design-prata-body", subsets: ["latin"], preload: false });

const spaceGrotesk = Space_Grotesk({ variable: "--font-design-spacegrotesk-display", subsets: ["latin"], preload: false });
const ibmPlexSans = IBM_Plex_Sans({ variable: "--font-design-spacegrotesk-body", subsets: ["latin"], weight: ["400"], preload: false });
const sora = Sora({ variable: "--font-design-sora-display", subsets: ["latin"], preload: false });
const manrope = Manrope({ variable: "--font-design-sora-body", subsets: ["latin"], preload: false });
const outfit = Outfit({ variable: "--font-design-outfit-display", subsets: ["latin"], preload: false });
const figtree = Figtree({ variable: "--font-design-outfit-body", subsets: ["latin"], preload: false });
const unbounded = Unbounded({ variable: "--font-design-unbounded-display", subsets: ["latin"], preload: false });
const dmSans = DM_Sans({ variable: "--font-design-unbounded-body", subsets: ["latin"], preload: false });

const amaticSC = Amatic_SC({ variable: "--font-design-amaticsc-display", subsets: ["latin"], weight: ["700"], preload: false });
const workSansBody2 = Work_Sans({ variable: "--font-design-amaticsc-body", subsets: ["latin"], preload: false });
const berkshireSwash = Berkshire_Swash({ variable: "--font-design-berkshire-display", subsets: ["latin"], weight: "400", preload: false });
const nunitoBody2 = Nunito({ variable: "--font-design-berkshire-body", subsets: ["latin"], preload: false });
const philosopher = Philosopher({ variable: "--font-design-philosopher-display", subsets: ["latin"], weight: ["700"], preload: false });
const karlaBody2 = Karla({ variable: "--font-design-philosopher-body", subsets: ["latin"], preload: false });

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
      className={[
        bricolage.variable,
        plusJakarta.variable,
        playfairDisplay.variable,
        interFont.variable,
        merriweather.variable,
        openSans.variable,
        yellowtail.variable,
        lato.variable,
        cormorantGaramond.variable,
        montserrat.variable,
        crimsonText.variable,
        raleway.variable,
        libreCaslonText.variable,
        sourceSans3.variable,
        dancingScript.variable,
        latoBody2.variable,
        allura.variable,
        plusJakartaBody2.variable,
        alexBrush.variable,
        nunitoSans.variable,
        greatVibes.variable,
        mulish.variable,
        parisienne.variable,
        karla.variable,
        pacifico.variable,
        quicksand.variable,
        baloo2.variable,
        nunito.variable,
        fredoka.variable,
        comfortaa.variable,
        luckiestGuy.variable,
        poppins.variable,
        bungee.variable,
        workSans.variable,
        cormorantEvening.variable,
        jostBody.variable,
        cormorantGaramond2.variable,
        jost.variable,
        abrilFatface.variable,
        lora.variable,
        cinzel.variable,
        ebGaramond.variable,
        marcellus.variable,
        poppinsBody.variable,
        prata.variable,
        mulishBody2.variable,
        spaceGrotesk.variable,
        ibmPlexSans.variable,
        sora.variable,
        manrope.variable,
        outfit.variable,
        figtree.variable,
        unbounded.variable,
        dmSans.variable,
        amaticSC.variable,
        workSansBody2.variable,
        berkshireSwash.variable,
        nunitoBody2.variable,
        philosopher.variable,
        karlaBody2.variable,
        "h-full antialiased",
      ].join(" ")}
      suppressHydrationWarning
    >
      <head>
        <Script
          id="rsvp-preferences-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Mounted once here rather than per page -- a failure has to be
            able to surface from anywhere, including the guest pages and the
            design editor, which previously had no notification host at all. */}
        <ToastProvider>
          <GlobalSettingsToggles />
          <SessionWatcher />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
