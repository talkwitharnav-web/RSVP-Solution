import { NextRequest, NextResponse } from "next/server";
import { initDb, pool } from "@/lib/db";
import { generateSlug } from "@/lib/slug";
import { broadcastDbChanged } from "@/lib/ws-broadcast";
import { requireSender } from "@/lib/auth";
import { isAcceptedImageDataUrl, isAcceptedImageDataUrlSize } from "@/lib/image-upload";
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
  MAX_QUESTIONS,
  MAX_QUESTION_LABEL_LENGTH,
} from "@/lib/validation";
import type { RsvpQuestion } from "@/lib/types";

const VALID_KINDS = ["external_link", "hosted_template", "custom_card", "designed_template"];

/**
 * Trims the ad hoc question list down to something bounded. Previously the
 * body's `questions` array was stored verbatim after only an Array.isArray
 * check, so a direct API call could persist thousands of questions (or a
 * single question with a multi-megabyte label) into the JSONB column, and
 * every guest loading the RSVP form would then have to render all of it.
 */
function sanitizeQuestions(raw: unknown): RsvpQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_QUESTIONS).flatMap((item, index) => {
    if (typeof item !== "object" || item === null) return [];
    const q = item as Record<string, unknown>;
    const label = boundedText(q.label, MAX_QUESTION_LABEL_LENGTH);
    if (!label) return [];
    return [
      {
        id: boundedText(q.id, 64) || `q${index}`,
        label,
        type: q.type === "boolean" ? "boolean" : "text",
        required: q.required === true,
      } satisfies RsvpQuestion,
    ];
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireSender();
  if (!auth.ok) return auth.response;

  if (bodyTooLarge(req, MEDIA_BODY_LIMIT)) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  await initDb();
  const body = await req.json();

  const kind = VALID_KINDS.includes(body.kind) ? body.kind : "hosted_template";
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

  const questions: RsvpQuestion[] = kind === "hosted_template" ? sanitizeQuestions(body.questions) : [];

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

  // Slugs are random, so a collision against the UNIQUE constraint is
  // vanishingly unlikely -- but "vanishingly unlikely" used to surface as an
  // unhandled 500 rather than a retry. Try a few fresh slugs before giving up.
  let slug: string | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateSlug();
    try {
      const result = await pool.query(
        `INSERT INTO events (slug, kind, title, host_name, description, event_date, location, external_url, questions, card_image_url, design_config, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING slug`,
        [candidate, ...insertValues],
      );
      slug = result.rows[0].slug;
      break;
    } catch (err) {
      const isSlugCollision =
        err instanceof Error && "code" in err && (err as { code?: string }).code === "23505";
      if (!isSlugCollision) throw err;
    }
  }

  if (!slug) {
    return NextResponse.json({ error: "Could not generate a unique link. Please try again." }, { status: 500 });
  }

  broadcastDbChanged("events");
  return NextResponse.json({ slug }, { status: 201 });
}
