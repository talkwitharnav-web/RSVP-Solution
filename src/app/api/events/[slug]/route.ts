import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { initDb, pool } from "@/lib/db";
import { requireSender } from "@/lib/auth";
import { verifySessionToken, ADMIN_SESSION_COOKIE_NAME, SENDER_SESSION_COOKIE_NAME } from "@/lib/session";
import { broadcastDbChanged } from "@/lib/ws-broadcast";
import { isAcceptedImageDataUrl, isAcceptedImageDataUrlSize } from "@/lib/image-upload";
import { parseGuestCategories } from "@/lib/guest-categories";
import { sanitizeDesignConfig } from "@/lib/design-types";
import { DESIGN_FONT_PAIRS } from "@/lib/design-fonts";
import {
  bodyTooLarge,
  boundedText,
  optionalBoundedText,
  MEDIA_BODY_LIMIT,
  MAX_TITLE_LENGTH,
  MAX_SHORT_TEXT_LENGTH,
  MAX_LONG_TEXT_LENGTH,
  MAX_URL_LENGTH,
} from "@/lib/validation";

/**
 * Public read of one event. Mirrors the gate on the /receiver/[slug] page
 * itself: an unpublished draft is only visible to the sender who owns it.
 * Without this the publish gate was page-level only -- anyone holding a slug
 * could read the full draft straight from the API, which is exactly what
 * publishing is supposed to prevent.
 */
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

  const event = result.rows[0];
  if (!event.published) {
    const cookieStore = await cookies();
    const session = verifySessionToken(cookieStore.get(SENDER_SESSION_COOKIE_NAME)?.value);
    const isOwner = session?.type === "sender" && session.userId === event.created_by;
    // Same 404 (not 403) an unknown slug gets, so this can't be used to
    // confirm that a given slug exists but hasn't been published yet.
    if (!isOwner) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
  }

  // created_by is the owning sender's user id -- internal, and of no use to
  // a guest rendering the invitation.
  const publicEvent = { ...event };
  delete publicEvent.created_by;
  return NextResponse.json(publicEvent);
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

  if (bodyTooLarge(req, MEDIA_BODY_LIMIT)) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

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

  const title = boundedText(body.title, MAX_TITLE_LENGTH);
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  // Every field below follows the same rule: a key absent from the body means
  // "the caller wasn't editing this," so the existing value is kept. This
  // used to overwrite host_name/description/event_date/location
  // unconditionally, which meant the Publish button (which sends only
  // { title, published: true }) silently wiped all four of them from the row.
  const hostName =
    body.hostName !== undefined ? optionalBoundedText(body.hostName, MAX_SHORT_TEXT_LENGTH) : event.host_name;
  const description =
    body.description !== undefined ? optionalBoundedText(body.description, MAX_LONG_TEXT_LENGTH) : event.description;
  const location =
    body.location !== undefined ? optionalBoundedText(body.location, MAX_SHORT_TEXT_LENGTH) : event.location;
  const eventDate = body.eventDate !== undefined ? body.eventDate || null : event.event_date;

  // external_link events could previously never change their target URL --
  // it was set once at creation and had no edit path at all. Same http(s)
  // validation as creation, since this value is rendered as a real <a href>
  // on the public guest page.
  let externalUrl = event.external_url;
  if (event.kind === "external_link" && body.externalUrl !== undefined) {
    const candidate = boundedText(body.externalUrl, MAX_URL_LENGTH);
    if (!candidate) {
      return NextResponse.json({ error: "External URL is required" }, { status: 400 });
    }
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      return NextResponse.json({ error: "External URL must be a valid http(s) link" }, { status: 400 });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return NextResponse.json({ error: "External URL must be a valid http(s) link" }, { status: 400 });
    }
    externalUrl = candidate;
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
    designConfig = sanitizeDesignConfig(
      body.designConfig,
      DESIGN_FONT_PAIRS.map((f) => f.id),
      event.design_config?.fontPairId ?? DESIGN_FONT_PAIRS[0].id,
    );
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
     SET title = $1, host_name = $2, description = $3, event_date = $4, location = $5, card_image_url = $6, guest_categories = $7, published = $8, design_config = $9, external_url = $10
     WHERE slug = $11
     RETURNING *`,
    [
      title,
      hostName,
      description,
      eventDate,
      location,
      cardImageUrl,
      JSON.stringify(guestCategories),
      published,
      designConfig ? JSON.stringify(designConfig) : null,
      externalUrl,
      slug,
    ],
  );

  broadcastDbChanged("events");
  return NextResponse.json(result.rows[0]);
}

/**
 * Deletes an invitation -- an admin (Access DB's RSVP Links table) or the
 * owning sender (the invitation gallery's own delete button) can do this.
 * A sender-authenticated caller is ownership-checked the same way PUT above
 * is, so a sender account can't delete another sender's invitation by
 * guessing/reusing a slug; an admin session bypasses the ownership check
 * entirely, matching every other admin-gated mutation in Access DB.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const cookieStore = await cookies();
  const adminSession = verifySessionToken(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  const isAdmin = adminSession?.type === "admin";

  await initDb();
  const { slug } = await params;

  if (!isAdmin) {
    const auth = await requireSender();
    if (!auth.ok) return auth.response;

    const existing = await pool.query(`SELECT created_by FROM events WHERE slug = $1`, [slug]);
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    if (existing.rows[0].created_by !== auth.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await pool.query(`DELETE FROM events WHERE slug = $1 RETURNING slug`, [slug]);
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  broadcastDbChanged("events");
  return NextResponse.json({ message: "Event deleted successfully" });
}
