import type { NextConfig } from "next";
import { networkInterfaces } from "os";

/**
 * Every non-internal IPv4 address this machine can be reached at from the
 * local network. Virtual adapters (WSL, Hyper-V's Default Switch) and
 * link-local 169.254.x addresses are skipped -- they're real addresses but
 * nothing on the actual Wi-Fi routes to them.
 */
function lanAddresses(): string[] {
  const found: string[] = [];
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    if (/WSL|Default Switch|Bluetooth|Loopback|vEthernet/i.test(name)) continue;
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      if (entry.address.startsWith("169.254.")) continue;
      found.push(entry.address);
    }
  }
  return found;
}

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  /**
   * Without this, loading the app from this machine's LAN address serves the
   * page HTML fine (200) but Next blocks every /_next/* chunk and the HMR
   * socket as a cross-origin dev request -- so the browser gets markup with
   * no JavaScript and renders a blank screen. That looks exactly like "LAN
   * is broken" when the server and the firewall are both fine.
   *
   * Addresses are detected at startup rather than hardcoded, so a DHCP lease
   * change doesn't silently break LAN testing again; the private-range
   * wildcards cover the address changing while the server is already up.
   *
   * Development-only -- no effect on a production build, and it does not
   * weaken the localhost-only admin gate, which is enforced per-request by
   * client IP in src/proxy.ts and requireAdmin().
   */
  allowedDevOrigins: [...lanAddresses(), "192.168.*.*", "10.*.*.*", "172.16.*.*"],

  /**
   * Hides the floating Next.js dev-tools badge. It sits in the bottom-left
   * corner, which is exactly where the design editor puts "Create Invitation"
   * and the sender dashboard puts "Log Out", so it covered a primary button on
   * two different screens. Dev-only UI -- it never rendered in a production
   * build, so switching it off costs nothing but the dev overlay.
   */
  devIndicators: false,
};

export default nextConfig;
