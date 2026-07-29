import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySessionToken, SENDER_SESSION_COOKIE_NAME } from "@/lib/session";
import DesignEditor from "./DesignEditor";

/**
 * Creation-mode editor.
 *
 * Gated server-side, matching how /create/design/[slug] gates the ongoing
 * editor. Without this the page rendered for anyone: a logged-out visitor
 * could build an entire card and only discover the problem when saving
 * failed with a bare "Unauthorized" -- and since nothing is persisted until
 * that first save, the whole design was lost with it. POST /api/events was
 * always correctly sender-gated, so this was a workflow and data-loss
 * problem rather than a security hole.
 */
export default async function CreateDesignPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SENDER_SESSION_COOKIE_NAME)?.value);
  if (session?.type !== "sender") redirect("/sender/login");

  return <DesignEditor />;
}
