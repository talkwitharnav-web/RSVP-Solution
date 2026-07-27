import { NextRequest, NextResponse } from "next/server";
import { initDb, pool } from "@/lib/db";
import { generateSlug } from "@/lib/slug";
import { broadcastDbChanged } from "@/lib/ws-broadcast";
import { requireSender } from "@/lib/auth";
import { isAcceptedImageDataUrl } from "@/lib/image-upload";
import type { RsvpQuestion } from "@/lib/types";

const VALID_KINDS = ["external_link", "hosted_template", "custom_card"];

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
  if (kind === "external_link" && !String(body.externalUrl ?? "").trim()) {
    return NextResponse.json({ error: "External URL is required" }, { status: 400 });
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
  }

  const questions: RsvpQuestion[] =
    kind === "hosted_template" && Array.isArray(body.questions) ? body.questions : [];

  const slug = generateSlug();

  const result = await pool.query(
    `INSERT INTO events (slug, kind, title, host_name, description, event_date, location, external_url, questions, card_image_url, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
      auth.userId,
    ],
  );

  broadcastDbChanged("events");
  return NextResponse.json({ slug: result.rows[0].slug }, { status: 201 });
}
