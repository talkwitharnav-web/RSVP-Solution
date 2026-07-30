import { NextRequest, NextResponse } from "next/server";
import { initDb, pool } from "@/lib/db";
import { requireSender } from "@/lib/auth";
import type { SenderEventSummary } from "@/lib/types";

const PAGE_SIZE = 12;

export async function GET(req: NextRequest) {
  const auth = await requireSender();
  if (!auth.ok) return auth.response;

  await initDb();
  const requestedOffset = Number(req.nextUrl.searchParams.get("offset"));
  const offset = Number.isSafeInteger(requestedOffset) && requestedOffset > 0
    ? Math.min(requestedOffset, 1000)
    : 0;
  const result = await pool.query<SenderEventSummary>(
        `SELECT id, slug, kind, title, guest_categories, published,
          CASE WHEN card_image_url IS NULL THEN NULL ELSE md5(card_image_url) END AS card_image_version
     FROM events
     WHERE created_by = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [auth.userId, PAGE_SIZE + 1, offset],
  );
  const hasMore = result.rows.length > PAGE_SIZE;
  const events = result.rows.slice(0, PAGE_SIZE);

  return NextResponse.json({
    events,
    nextOffset: hasMore ? offset + events.length : null,
  });
}
