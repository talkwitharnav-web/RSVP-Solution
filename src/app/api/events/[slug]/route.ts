import { NextRequest, NextResponse } from "next/server";
import { initDb, pool } from "@/lib/db";
import { requireAdmin, requireSender } from "@/lib/auth";
import { broadcastDbChanged } from "@/lib/ws-broadcast";
import { isAcceptedImageDataUrl, isAcceptedImageDataUrlSize } from "@/lib/image-upload";
import { parseGuestCategories } from "@/lib/guest-categories";
import { sanitizeDesignConfig } from "@/lib/design-types";
import { DESIGN_PALETTES } from "@/lib/design-palettes";
import { DESIGN_FONT_PAIRS } from "@/lib/design-fonts";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  await initDb();
  const { slug } = await params;

  const result = await pool.query(`SELECT * FROM events WHERE slug = $1`, [slug]);
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json(result.rows[0]);
}

/**
 * Lets a sender edit an invitation they own -- title/host/description/date/
 * location and (for custom_card events) the card image itself. Gated on
 * actually owning the event, not just being logged in as some sender, since
 * requireSender alone would let any sender account edit any other sender's
 * card by guessing/reusing a slug.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireSender();
  if (!auth.ok) return auth.response;

  await initDb();
  const { slug } = await params;
  const body = await req.json();

  const existing = await pool.query(`SELECT * FROM events WHERE slug = $1`, [slug]);
  if (existing.rows.length === 0) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const event = existing.rows[0];
  if (event.created_by !== auth.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const title = String(body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  let cardImageUrl = event.card_image_url;
  if (event.kind === "custom_card" && body.cardImageUrl !== undefined) {
    const candidate = String(body.cardImageUrl ?? "").trim();
    if (!candidate) {
      return NextResponse.json({ error: "Card image is required" }, { status: 400 });
    }
    if (!isAcceptedImageDataUrl(candidate)) {
      return NextResponse.json(
        { error: "Card image must be PNG, JPEG, WebP, GIF, or AVIF" },
        { status: 400 },
      );
    }
    if (!isAcceptedImageDataUrlSize(candidate)) {
      return NextResponse.json({ error: "Card image is too large — please choose one under 5MB" }, { status: 400 });
    }
    cardImageUrl = candidate;
  }

  // Guest categories apply "no matter how the RSVP was created" -- undefined
  // means the editor didn't touch this field (e.g. an external_link event
  // that never shows the field), so the existing value is kept rather than
  // silently reset to the default pair.
  const guestCategories =
    body.guestCategories !== undefined
      ? parseGuestCategories(String(body.guestCategories ?? ""))
      : event.guest_categories;

  // design_config edits apply only to designed_template events -- undefined
  // means the editor didn't touch it, same "don't clobber on partial save"
  // rule as guestCategories above. Re-validated through the same sanitizer
  // as creation (not trusted as already-valid just because it round-tripped
  // from this same app), since a direct API call could send anything.
  let designConfig = event.design_config;
  if (event.kind === "designed_template" && body.designConfig !== undefined) {
    const sanitized = sanitizeDesignConfig(
      body.designConfig,
      DESIGN_PALETTES.map((p) => p.id),
      DESIGN_FONT_PAIRS.map((f) => f.id),
    );
    if (!sanitized) {
      return NextResponse.json({ error: "Invalid design configuration" }, { status: 400 });
    }
    designConfig = sanitized;
  }

  // Publishing only ever goes false -> true through this route -- an
  // ordinary content save (handleSave in EventEditor) never sends
  // `published` at all, so the existing value is kept; explicitly sending
  // `published: false` is intentionally ignored rather than silently
  // un-publishing an already-shared link (there's no "unpublish" feature --
  // a link already handed out keeps working through any number of edits).
  const published = body.published === true ? true : event.published;

  const result = await pool.query(
    `UPDATE events
     SET title = $1, host_name = $2, description = $3, event_date = $4, location = $5, card_image_url = $6, guest_categories = $7, published = $8, design_config = $9
     WHERE slug = $10
     RETURNING *`,
    [
      title,
      body.hostName || null,
      body.description || null,
      body.eventDate || null,
      body.location || null,
      cardImageUrl,
      JSON.stringify(guestCategories),
      published,
      designConfig ? JSON.stringify(designConfig) : null,
      slug,
    ],
  );

  broadcastDbChanged("events");
  return NextResponse.json(result.rows[0]);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  await initDb();
  const { slug } = await params;

  const result = await pool.query(`DELETE FROM events WHERE slug = $1 RETURNING slug`, [slug]);
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  broadcastDbChanged("events");
  return NextResponse.json({ message: "Event deleted successfully" });
}
