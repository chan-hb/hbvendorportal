import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isInternal } from "@/lib/rbac";
import { buildPriceListWorkbook } from "@/lib/pricelist/excel";

export const maxDuration = 60;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // A vendor always gets their own list. Staff may request one for any vendor,
  // which is how a buyer sends a supplier a starting file.
  const requested = new URL(req.url).searchParams.get("vendorId");
  const vendorId = isInternal(session.user.role) ? requested : session.user.vendorId;
  if (!vendorId) return NextResponse.json({ error: "No vendor selected" }, { status: 400 });

  try {
    const buffer = await buildPriceListWorkbook(vendorId);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="price-list-${new Date().toISOString().slice(0, 10)}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
