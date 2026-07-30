"use client";

import { usePathname } from "next/navigation";
import { SettingsToggles } from "@/components/ui/SettingsToggles";
import { HealthPin } from "@/components/ui/HealthPin";

/**
 * Single global mount of the Settings pill (UI size, accessibility, theme,
 * health) so it shows up on every page -- including the editor and receiver
 * routes, which previously had no way to reach these controls at all since
 * each page used to mount its own SettingsToggles individually. Health
 * detail varies by context: the admin DB page gets the full technical
 * popover (pool stats, live listener count, disk size), the admin gateway
 * and sender-facing pages get the trimmed
 * "basic" popover, and guests get no health pin at all -- server latency is
 * the host's problem, not something a guest opening an invitation can act
 * on or should be shown.
 */
export function GlobalSettingsToggles() {
  const pathname = usePathname();

  const isAdminGateway = pathname === "/";
  const isAdminDb = pathname?.startsWith("/admin/db") ?? false;
  const isReceiver = pathname?.startsWith("/receiver/") ?? false;

  let health: React.ReactNode;
  if (isReceiver) {
    // Guests get theme/size/accessibility, but nothing about server health.
    health = undefined;
  } else if (isAdminDb) {
    health = <HealthPin showDbSize detailLevel="full" />;
  } else if (isAdminGateway) {
    health = <HealthPin />;
  } else {
    health = <HealthPin />;
  }

  return <SettingsToggles health={health} />;
}
