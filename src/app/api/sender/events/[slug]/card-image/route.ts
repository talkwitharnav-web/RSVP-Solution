import { NextResponse } from "next/server";
import { requireSender } from "@/lib/auth";
import { pool } from "@/lib/db";
import { isAcceptedImageDataUrl, isAcceptedImageDataUrlSize } from "@/lib/image-upload";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireSender();
  if (!auth.ok) return auth.response;

  const { slug } = await params;
  const result = await pool.query<{ card_image_url: string | null }>(
    `SELECT card_image_url FROM events WHERE slug = $1 AND created_by = $2`,
    [slug, auth.userId],
  );
  const dataUrl = result.rows[0]?.card_image_url;
  if (!dataUrl || !isAcceptedImageDataUrl(dataUrl) || !isAcceptedImageDataUrlSize(dataUrl)) {
    return NextResponse.json({ error: "Card image not found" }, { status: 404 });
  }

  const match = /^data:([^;]+);base64,([a-zA-Z0-9+/]*={0,2})$/.exec(dataUrl);
  if (!match) {
    return NextResponse.json({ error: "Card image not found" }, { status: 404 });
  }

  const imageBytes = Buffer.from(match[2], "base64");
  if (imageBytes.byteLength === 0) {
    return NextResponse.json({ error: "Card image not found" }, { status: 404 });
  }
  return new Response(new Uint8Array(imageBytes), {
    headers: {
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Length": String(imageBytes.byteLength),
      "Content-Type": match[1].toLowerCase(),
      "X-Content-Type-Options": "nosniff",
    },
  });
}