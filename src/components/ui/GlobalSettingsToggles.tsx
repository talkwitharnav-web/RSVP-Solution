"use client";

import { useEffect, useState } from "react";
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
 * shows it only once logged in, and everywhere else (sender dashboard,
 * editor, receiver pages) gets the trimmed "basic" popover -- pool/listener
 * internals aren't meaningful outside the admin console.
 */
export function GlobalSettingsToggles() {
  const pathname = usePathname();
  const [hasAdminSession, setHasAdminSession] = useState(false);

  const isAdminGateway = pathname === "/";
  const isAdminDb = pathname?.startsWith("/admin/db") ?? false;

  useEffect(() => {
    if (!isAdminGateway) return;
    fetch("/api/session")
      .then((res) => res.json())
      .then((session) => setHasAdminSession(!!session.admin))
      .catch(() => {});
  }, [isAdminGateway]);

  let health: React.ReactNode;
  if (isAdminDb) {
    health = <HealthPin showDbSize detailLevel="full" />;
  } else if (isAdminGateway) {
    health = hasAdminSession ? <HealthPin /> : undefined;
  } else {
    health = <HealthPin />;
  }

  return <SettingsToggles health={health} />;
}
