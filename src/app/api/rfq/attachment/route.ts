import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { isInternal } from "@/lib/rbac";

/** Serves an RFQ attachment, but only to someone entitled to see that RFQ. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "No attachment specified" }, { status: 400 });

  const attachment = await prisma.rfqAttachment.findUnique({
    where: { id },
    include: { rfq: { select: { id: true, invitations: { select: { vendorId: true } } } } },
  });
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed =
    isInternal(session.user.role) ||
    attachment.rfq.invitations.some((i) => i.vendorId === session.user.vendorId);
  if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(attachment.data), {
    headers: {
      "Content-Type": attachment.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${attachment.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
