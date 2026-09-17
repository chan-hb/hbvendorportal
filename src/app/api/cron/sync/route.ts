import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSync } from "@/lib/d365/run-sync";
import { SETTINGS_ID } from "@/lib/d365/config";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily scheduled refresh, wired up in vercel.json (02:00 UTC).
 * Vercel sends `Authorization: Bearer <CRON_SECRET>`; the same header works
 * for a manual curl if you need to force a run.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  if (secret && header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const settings = await prisma.integrationSetting.findUnique({ where: { id: SETTINGS_ID } });
  if (!settings?.cronEnabled) {
    return NextResponse.json({ skipped: true, reason: "Scheduled refresh is switched off" });
  }

  // The schedule can be narrowed with ?scope=items&entity=hb01 so a very large
  // pull is spread over several invocations rather than one long one.
  const { searchParams } = new URL(req.url);
  const scope = (searchParams.get("scope") as Parameters<typeof runSync>[0]) ?? "all";
  const onlyDataAreaId = searchParams.get("entity") ?? undefined;

  try {
    const result = await runSync(scope, "cron", "vercel-cron", { onlyDataAreaId });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
