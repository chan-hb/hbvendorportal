import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPurchaseOrderRefreshState, startPurchaseOrderRefresh } from "@/lib/d365/purchase-orders";

export const dynamic = "force-dynamic";

/**
 * Refresh state for the signed-in vendor's purchase orders.
 *
 * The vendor is always taken from the session, never from the request, so one
 * supplier cannot trigger or watch another's refresh.
 */
async function vendorFromSession() {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || user.role !== "VENDOR" || !user.vendorId) return null;
  return user.vendorId;
}

function shape(state: Awaited<ReturnType<typeof getPurchaseOrderRefreshState>>) {
  return {
    status: state?.status ?? "IDLE",
    stage: state?.stage ?? null,
    startedAt: state?.startedAt?.toISOString() ?? null,
    lastSuccessAt: state?.lastSuccessAt?.toISOString() ?? null,
    orderCount: state?.orderCount ?? 0,
    lineCount: state?.lineCount ?? 0,
    error: state?.status === "FAILED" ? state.error : null,
  };
}

export async function GET() {
  const vendorId = await vendorFromSession();
  if (!vendorId) return NextResponse.json({ error: "Not available" }, { status: 403 });
  return NextResponse.json(shape(await getPurchaseOrderRefreshState(vendorId)));
}

/** Starts a refresh unless one is running or the data is under 15 minutes old. `?force=1` skips the age check. */
export async function POST(req: Request) {
  const vendorId = await vendorFromSession();
  if (!vendorId) return NextResponse.json({ error: "Not available" }, { status: 403 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  await startPurchaseOrderRefresh(vendorId, { force });
  return NextResponse.json(shape(await getPurchaseOrderRefreshState(vendorId)));
}
