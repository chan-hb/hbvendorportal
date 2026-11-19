import { requireVendor } from "@/lib/session";
import { vendorPurchaseOrders } from "@/lib/purchase-orders";
import { getPurchaseOrderRefreshState } from "@/lib/d365/purchase-orders";
import { PurchaseOrdersView } from "@/components/PurchaseOrdersView";

export const dynamic = "force-dynamic";

/** Vendor Home: their purchase orders. Vendor only; staff land on the dashboard. */
export default async function HomePage() {
  const user = await requireVendor();

  const [data, state] = await Promise.all([
    vendorPurchaseOrders(user.vendorId),
    getPurchaseOrderRefreshState(user.vendorId),
  ]);

  return (
    <PurchaseOrdersView
      data={data}
      initial={{
        status: state?.status ?? "IDLE",
        stage: state?.stage ?? null,
        startedAt: state?.startedAt?.toISOString() ?? null,
        lastSuccessAt: state?.lastSuccessAt?.toISOString() ?? null,
        orderCount: state?.orderCount ?? 0,
        lineCount: state?.lineCount ?? 0,
        error: null,
      }}
    />
  );
}
