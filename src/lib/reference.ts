import { prisma } from "@/lib/prisma";

/** TA-2026-000042. Sequential per calendar year. */
export async function nextReference(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `TA-${year}-`;
  const last = await prisma.agreement.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });
  const n = last ? Number(last.reference.slice(prefix.length)) + 1 : 1;
  return prefix + String(n).padStart(6, "0");
}
