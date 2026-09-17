"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { uploadPriceListAction, type ImportState } from "@/app/actions/pricelist";

/**
 * Excel round trip. Suppliers keep prices in a spreadsheet regardless, so the
 * export carries the current price for reference and the import turns each
 * changed row into a normal request for approval.
 */
export function PriceListUpload() {
  const [state, formAction] = useActionState<ImportState, FormData>(uploadPriceListAction, null);

  return (
    <div className="space-y-5 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <a href="/api/price-list/export" className="btn-ghost">Download current price list</a>
        <p className="text-xs text-charcoal/55">
          Includes every item you supply and the price in force today.
        </p>
      </div>

      <form action={formAction} className="space-y-3 border-t border-line pt-5">
        {state?.error ? (
          <p className="border border-[#A32B2B]/30 bg-[#FBEAEA] px-4 py-3 text-sm text-[#A32B2B]">{state.error}</p>
        ) : null}
        {state?.ok ? (
          <p className="border border-[#2C6B44]/25 bg-[#EAF4EE] px-4 py-3 text-sm text-[#2C6B44]">{state.ok}</p>
        ) : null}

        <div>
          <label className="field-label" htmlFor="file">Upload your updated file</label>
          <input id="file" name="file" type="file" accept=".xlsx,.xlsm,.xls" className="input" required />
          <p className="mt-1 text-xs text-charcoal/55">
            Only rows with a new price are submitted. Everything else is left alone.
          </p>
        </div>

        <SubmitButton>Upload and submit for approval</SubmitButton>
      </form>

      {state?.created && state.created.length > 0 ? (
        <div className="border border-[#2C6B44]/25 bg-[#EAF4EE] p-4">
          <p className="field-label">Submitted</p>
          <p className="text-sm text-charcoal/80">{state.created.join(", ")}</p>
        </div>
      ) : null}

      {state?.rejected && state.rejected.length > 0 ? (
        <div className="border border-[#A32B2B]/30 bg-[#FBEAEA] p-4">
          <p className="field-label">Rows that could not be submitted</p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-[0.1em] text-charcoal/60">
                <th className="py-1 text-left">Row</th>
                <th className="py-1 text-left">Item</th>
                <th className="py-1 text-left">Reason</th>
              </tr>
            </thead>
            <tbody>
              {state.rejected.map((r, i) => (
                <tr key={i} className="border-t border-[#A32B2B]/15">
                  <td className="py-1.5 pr-3">{r.rowNumber || "-"}</td>
                  <td className="py-1.5 pr-3">{r.itemNumber || "-"}</td>
                  <td className="py-1.5">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-charcoal/60">
            Fix these in the spreadsheet and upload again. Rows that went through are not affected.
          </p>
        </div>
      ) : null}
    </div>
  );
}
