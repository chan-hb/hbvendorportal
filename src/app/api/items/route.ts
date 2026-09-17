import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

/** Type-ahead for the item picker. Read only, scoped to active items. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const dataAreaId = searchParams.get("dataAreaId") ?? undefined;

  // A vendor only ever sees items where they are the default vendor.
  const vendorScope =
    session.user.role === "VENDOR"
      ? { primaryVendorId: session.user.vendorId ?? "__none__" }
      : {};

  const items = await prisma.item.findMany({
    where: {
      isActive: true,
      ...vendorScope,
      ...(dataAreaId ? { dataAreaId } : {}),
      ...(q
        ? {
            OR: [
              { itemNumber: { contains: q, mode: "insensitive" } },
              { productName: { contains: q, mode: "insensitive" } },
              { searchName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: { itemNumber: true, productName: true, unit: true, dataAreaId: true, primaryVendorCode: true },
    orderBy: { itemNumber: "asc" },
    take: 25,
  });

  return NextResponse.json({ items });
}
