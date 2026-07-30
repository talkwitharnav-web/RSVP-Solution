import { NextRequest, NextResponse } from "next/server";
import { initDb, pool } from "@/lib/db";
import { generateSlug } from "@/lib/slug";
import { broadcastDbChanged } from "@/lib/ws-broadcast";
import { requireSender } from "@/lib/auth";
import { isAcceptedImageDataUrl, isAcceptedImageDataUrlSize } from "@/lib/image-upload";
import { sanitizeDesignConfig } from "@/lib/design-types";
import { DESIGN_FONT_PAIRS } from "@/lib/design-fonts";
import { EventQuotaError, assertSenderEventQuota, lockSenderEventQuota } from "@/lib/event-quota";
import { rateLimitByIdentifier } from "@/lib/rate-limit";
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
import type { RsvpQuestion } from "@/lib/types";

const VALID_KINDS = ["external_link", "custom_card", "designed_template"];

export async function POST(req: NextRequest) {
  const auth = await requireSender();
  if (!auth.ok) return auth.response;

  const limited = rateLimitByIdentifier("event-create", auth.userId, 20, 60 * 60 * 1000);
  if (limited) return limited;

  if (bodyTooLarge(req, MEDIA_BODY_LIMIT)) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  await initDb();
  const body = await req.json();

  const kind = VALID_KINDS.includes(body.kind) ? body.kind : "custom_card";
  const title = boundedText(body.title, MAX_TITLE_LENGTH);
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  let externalUrl: string | null = null;
  if (kind === "external_link") {
    externalUrl = boundedText(body.externalUrl, MAX_URL_LENGTH);
    if (!externalUrl) {
      return NextResponse.json({ error: "External URL is required" }, { status: 400 });
    }
    // Only http(s) is allowed -- this URL is rendered as a real <a href> on
    // the public guest page (GuestEventView), so an unvalidated scheme
    // (e.g. javascript:) would let a sender's stored value execute in a
    // guest's browser the moment they click "RSVP now".
    let parsed: URL;
    try {
      parsed = new URL(externalUrl);
    } catch {
      return NextResponse.json({ error: "External URL must be a valid http(s) link" }, { status: 400 });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return NextResponse.json({ error: "External URL must be a valid http(s) link" }, { status: 400 });
    }
  }
  if (kind === "custom_card") {
    const cardImageUrl = String(body.cardImageUrl ?? "").trim();
    if (!cardImageUrl) {
      return NextResponse.json({ error: "Card image is required" }, { status: 400 });
    }
    if (!isAcceptedImageDataUrl(cardImageUrl)) {
      return NextResponse.json(
        { error: "Card image must be PNG, JPEG, WebP, GIF, or AVIF" },
        { status: 400 },
      );
    }
    if (!isAcceptedImageDataUrlSize(cardImageUrl)) {
      return NextResponse.json({ error: "Card image is too large — please choose one under 5MB" }, { status: 400 });
    }
  }

  // Only an event title is required to create a designed_template invitation
  // -- palette/font/canvas all have safe defaults, per explicit user
  // instruction that there should be no other requirement to create or save.
  let designConfig = null;
  if (kind === "designed_template") {
    designConfig = sanitizeDesignConfig(
      body.designConfig,
      DESIGN_FONT_PAIRS.map((f) => f.id),
      DESIGN_FONT_PAIRS[0].id,
    );
  }

  // No creation UI currently sets ad hoc questions for any kind, but the
  // sanitizer/column stay in place -- see RsvpQuestion/RsvpForm.
  const questions: RsvpQuestion[] = [];

  const insertValues = [
    kind,
    title,
    optionalBoundedText(body.hostName, MAX_SHORT_TEXT_LENGTH),
    optionalBoundedText(body.description, MAX_LONG_TEXT_LENGTH),
    body.eventDate || null,
    optionalBoundedText(body.location, MAX_SHORT_TEXT_LENGTH),
    externalUrl,
    JSON.stringify(questions),
    kind === "custom_card" ? body.cardImageUrl : null,
    designConfig ? JSON.stringify(designConfig) : null,
    auth.userId,
  ];

  // Serialize quota-affecting writes per sender. The assertion runs after
  // the proposed insert and rolls the whole transaction back if either the
  // event-count or stored-byte ceiling would be crossed.
  let slug: string | null = null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockSenderEventQuota(client, auth.userId);

    // Slugs are random, so a collision is vanishingly unlikely. ON CONFLICT
    // avoids aborting the transaction, allowing a clean retry under the same
    // quota lock.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = generateSlug();
      const result = await client.query(
        `INSERT INTO events (slug, kind, title, host_name, description, event_date, location, external_url, questions, card_image_url, design_config, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (slug) DO NOTHING
         RETURNING slug`,
        [candidate, ...insertValues],
      );
      if (result.rows[0]?.slug) {
        slug = result.rows[0].slug;
        break;
      }
    }

    if (!slug) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Could not generate a unique link. Please try again." }, { status: 500 });
    }

    await assertSenderEventQuota(client, auth.userId);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error instanceof EventQuotaError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.reason === "storage" ? 413 : 409 },
      );
    }
    throw error;
  } finally {
    client.release();
  }

  broadcastDbChanged("events", slug);
  return NextResponse.json({ slug }, { status: 201 });
}
