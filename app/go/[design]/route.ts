import { NextResponse } from "next/server";
import {
  factoryRedirectUrl,
  isQrDesign,
} from "@/lib/qr-designs";
import { getScanStore } from "@/lib/scans";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ design: string }> },
) {
  const { design } = await context.params;
  if (!isQrDesign(design)) {
    return Response.json(
      { error: "Unknown QR design" },
      {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  try {
    await getScanStore().recordScan(design, Date.now());
  } catch {
    // A transient counter failure should not block a visitor from Factory.
  }

  return NextResponse.redirect(factoryRedirectUrl(design), {
    headers: { "Cache-Control": "no-store" },
  });
}
