"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { importPriceList, parsePriceListWorkbook } from "@/lib/pricelist/excel";
import type { ActionState } from "./agreements";

export type ImportState =
  | (ActionState & { created?: string[]; rejected?: { rowNumber: number; itemNumber: string; reason: string }[] })
  | null;

export async function uploadPriceListAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const user = await requireUser();
  if (user.role !== "VENDOR" || !user.vendorId) return { error: "Only vendor users can upload a price list" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload" };
  if (file.size > 8_000_000) return { error: "That file is larger than 8 MB" };
  if (!/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
    return { error: "Upload the .xlsx file you downloaded, not a CSV or PDF" };
  }

  try {
    const { rows, problems } = parsePriceListWorkbook(Buffer.from(await file.arrayBuffer()));

    if (rows.length === 0) {
      return {
        error:
          problems.length > 0
            ? "Nothing could be read from that file. See the problems below."
            : "No rows had a new price filled in, so there was nothing to submit.",
        rejected: problems,
      };
    }

    const { created, rejected } = await importPriceList(
      { id: user.id, email: user.email, role: user.role, vendorId: user.vendorId },
      rows,
    );

    revalidatePath("/agreements");

    return {
      ok:
        created.length > 0
          ? `${created.length} price${created.length === 1 ? "" : "s"} submitted for approval.`
          : "Nothing was submitted.",
      created,
      rejected: [...problems, ...rejected],
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
