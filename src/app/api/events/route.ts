import { NextRequest, NextResponse } from "next/server";
import { initDb, pool } from "@/lib/db";
import { generateSlug } from "@/lib/slug";
import { broadcastDbChanged } from "@/lib/ws-broadcast";
import { requireSender } from "@/lib/auth";
import { isAcceptedImageDataUrl, isAcceptedImageDataUrlSize } from "@/lib/image-upload";
import { sanitizeDesignConfig } from "@/lib/design-types";
import { DESIGN_PALETTES } from "@/lib/design-palettes";
import { DESIGN_FONT_PAIRS } from "@/lib/design-fonts";
import type { RsvpQuestion } from "@/lib/types";

const VALID_KINDS = ["external_link", "hosted_template", "custom_card", "designed_template"];

export async function POST(req: NextRequest) {
  const auth = await requireSender();
  if (!auth.ok) return auth.response;

  await initDb();
  const body = await req.json();

  const kind = VALID_KINDS.includes(body.kind) ? body.kind : "hosted_template";
  const title = String(body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (kind === "external_link") {
    const externalUrl = String(body.externalUrl ?? "").trim();
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

  let designConfig = null;
  if (kind === "designed_template") {
    designConfig = sanitizeDesignConfig(
      body.designConfig,
      DESIGN_PALETTES.map((p) => p.id),
      DESIGN_FONT_PAIRS.map((f) => f.id),
    );
    if (!designConfig) {
      return NextResponse.json({ error: "A palette, font pair, and card design are required" }, { status: 400 });
    }
  }

  const questions: RsvpQuestion[] =
    kind === "hosted_template" && Array.isArray(body.questions) ? body.questions : [];

  const slug = generateSlug();

  const result = await pool.query(
    `INSERT INTO events (slug, kind, title, host_name, description, event_date, location, external_url, questions, card_image_url, design_config, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING slug`,
    [
      slug,
      kind,
      title,
      body.hostName ?? null,
      body.description ?? null,
      body.eventDate ?? null,
      body.location ?? null,
      kind === "external_link" ? body.externalUrl : null,
      JSON.stringify(questions),
      kind === "custom_card" ? body.cardImageUrl : null,
      designConfig ? JSON.stringify(designConfig) : null,
      auth.userId,
    ],
  );

  broadcastDbChanged("events");
  return NextResponse.json({ slug: result.rows[0].slug }, { status: 201 });
}
