"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { addAttachmentAction, removeAttachmentAction } from "@/app/actions/rfq";
import type { ActionState } from "@/app/actions/agreements";

type Attachment = { id: string; filename: string; sizeBytes: number; uploadedBy: string; createdAt: string };

export function RfqAttachments({
  rfqId,
  attachments,
  canEdit,
}: {
  rfqId: string;
  attachments: Attachment[];
  canEdit: boolean;
}) {
  const [state, addAction] = useActionState<ActionState, FormData>(addAttachmentAction, null);
  const [, removeAction] = useActionState<ActionState, FormData>(removeAttachmentAction, null);

  return (
    <div className="space-y-4 p-5">
      {attachments.length === 0 ? (
        <p className="text-sm text-charcoal/60">No brief attached.</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-4 py-2">
              <div className="min-w-0">
                <a
                  href={`/api/rfq/attachment?id=${a.id}`}
                  className="text-sm font-medium text-pink hover:underline"
                >
                  {a.filename}
                </a>
                <p className="text-xs text-charcoal/55">
                  {(a.sizeBytes / 1024 / 1024).toFixed(2)} MB . {a.uploadedBy}
                </p>
              </div>
              {canEdit ? (
                <form action={removeAction}>
                  <input type="hidden" name="rfqId" value={rfqId} />
                  <input type="hidden" name="id" value={a.id} />
                  <button className="text-xs font-bold uppercase tracking-[0.1em] text-pink hover:underline">
                    Remove
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <form action={addAction} className="space-y-3 border-t border-line pt-4">
          <input type="hidden" name="rfqId" value={rfqId} />
          {state?.error ? <p className="text-sm text-[#A32B2B]">{state.error}</p> : null}
          {state?.ok ? <p className="text-sm text-[#2C6B44]">{state.ok}</p> : null}
          <div>
            <label className="field-label" htmlFor="brief">Add a file</label>
            <input id="brief" name="brief" type="file" multiple className="input" />
            <p className="mt-1 text-xs text-charcoal/55">
              Up to 8 MB each. Files added now are not resent to vendors already invited, so tell them separately
              if the brief has changed.
            </p>
          </div>
          <SubmitButton className="btn-ghost">Attach</SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
