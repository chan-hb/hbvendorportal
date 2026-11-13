"use client";

import { useActionState, useState } from "react";
import type { QuestionType, RfqVendorType } from "@prisma/client";
import { SubmitButton } from "@/components/SubmitButton";
import {
  createQuestionAction,
  deleteQuestionAction,
  toggleQuestionAction,
  updateQuestionAction,
} from "@/app/actions/questions";
import type { ActionState } from "@/app/actions/agreements";

type Row = {
  id: string;
  key: string;
  label: string;
  type: QuestionType;
  source: "ANSWER" | "QUOTATION";
  bidFieldLabel: string | null;
  options: string[];
  unit: string | null;
  help: string | null;
  required: boolean;
  vendorTypes: RfqVendorType[];
  sortOrder: number;
  isActive: boolean;
  answerCount: number;
};

const TYPE_LABEL: Record<QuestionType, string> = {
  TEXT: "Short text",
  LONGTEXT: "Long text",
  NUMBER: "Number",
  YESNO: "Yes or no",
  CHOICE: "Multiple choice",
};

export function QuestionAdmin({
  questions,
  vendorTypeLabels,
}: {
  questions: Row[];
  vendorTypeLabels: Record<RfqVendorType, string>;
}) {
  const [createState, createAction] = useActionState<ActionState, FormData>(createQuestionAction, null);
  const [updateState, updateAction] = useActionState<ActionState, FormData>(updateQuestionAction, null);
  const [toggleState, toggleAction] = useActionState<ActionState, FormData>(toggleQuestionAction, null);
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(deleteQuestionAction, null);
  const [editing, setEditing] = useState<string | null>(null);
  const [newType, setNewType] = useState<QuestionType>("TEXT");

  const types = Object.keys(vendorTypeLabels) as RfqVendorType[];
  const message = updateState ?? toggleState ?? deleteState;

  return (
    <div className="space-y-6">
      {message?.error ? <p className="alert-error">{message.error}</p> : null}
      {message?.ok ? <p className="alert-ok">{message.ok}</p> : null}

      <section className="panel">
        <header className="border-b border-line px-5 py-4">
          <h2 className="section-title">Add a question</h2>
          <p className="mt-1 text-xs text-charcoal/60">
            Appears on the quotation form for whichever vendor types you tick. Suppliers must answer the
            required ones before an RFQ can be awarded.
          </p>
        </header>

        <form action={createAction} className="space-y-5 p-5">
          {createState?.error ? <p className="alert-error">{createState.error}</p> : null}
          {createState?.ok ? <p className="alert-ok">{createState.ok}</p> : null}

          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="field-label field-label-required" htmlFor="label">Question</label>
              <input id="label" name="label" className="input" required placeholder="Number of shifts" />
            </div>

            <div>
              <label className="field-label field-label-required" htmlFor="type">Answer type</label>
              <select
                id="type"
                name="type"
                className="input"
                value={newType}
                onChange={(e) => setNewType(e.target.value as QuestionType)}
              >
                {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label" htmlFor="unit">Unit</label>
              <input id="unit" name="unit" className="input" placeholder="days" />
            </div>

            {newType === "CHOICE" ? (
              <div className="md:col-span-2">
                <label className="field-label field-label-required" htmlFor="options">Options</label>
                <input id="options" name="options" className="input" placeholder="Automated, Semi automated, Manual" />
                <p className="mt-1 text-xs text-charcoal/55">Comma separated, at least two.</p>
              </div>
            ) : null}

            <div className="md:col-span-2">
              <label className="field-label" htmlFor="help">Help text</label>
              <input id="help" name="help" className="input" placeholder="Shown under the field" />
            </div>

            <div>
              <label className="field-label" htmlFor="sortOrder">Position</label>
              <input id="sortOrder" name="sortOrder" type="number" min={0} max={9999} className="input" defaultValue={100} />
              <p className="mt-1 text-xs text-charcoal/55">Lower appears first.</p>
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" name="required" defaultChecked className="h-4 w-4 accent-pink" />
                Must be answered before awarding
              </label>
            </div>
          </div>

          <fieldset>
            <legend className="field-label field-label-required">Appears for</legend>
            <div className="flex flex-wrap gap-2">
              {types.map((t) => (
                <label key={t} className="chip cursor-pointer">
                  <input type="checkbox" name="vendorTypes" value={t} className="mr-2 h-3.5 w-3.5 accent-pink" />
                  {vendorTypeLabels[t]}
                </label>
              ))}
            </div>
          </fieldset>

          <SubmitButton>Add question</SubmitButton>
        </form>
      </section>

      <section className="panel">
        <header className="border-b border-line px-5 py-4">
          <h2 className="section-title">Questions</h2>
          <p className="mt-1 text-xs text-charcoal/60">
            Questions marked as coming from the quotation are filled automatically and shown read-only, so
            nothing is asked twice. Those cannot be edited here.
          </p>
        </header>

        <div className="divide-y divide-line">
          {questions.map((q) => (
            <div key={q.id} className={`px-5 py-4 ${q.isActive ? "" : "bg-cloud/40"}`}>
              {editing === q.id && q.source === "ANSWER" ? (
                <form action={updateAction} className="space-y-4">
                  <input type="hidden" name="id" value={q.id} />

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="field-label">Question</label>
                      <input name="label" className="input" defaultValue={q.label} required />
                    </div>
                    <div>
                      <label className="field-label">Unit</label>
                      <input name="unit" className="input" defaultValue={q.unit ?? ""} />
                    </div>
                    <div>
                      <label className="field-label">Position</label>
                      <input name="sortOrder" type="number" className="input" defaultValue={q.sortOrder} />
                    </div>
                    {q.type === "CHOICE" ? (
                      <div className="md:col-span-2">
                        <label className="field-label">Options</label>
                        <input name="options" className="input" defaultValue={q.options.join(", ")} />
                      </div>
                    ) : null}
                    <div className="md:col-span-2">
                      <label className="field-label">Help text</label>
                      <input name="help" className="input" defaultValue={q.help ?? ""} />
                    </div>
                  </div>

                  <fieldset>
                    <legend className="field-label">Appears for</legend>
                    <div className="flex flex-wrap gap-2">
                      {types.map((t) => (
                        <label key={t} className="chip cursor-pointer">
                          <input
                            type="checkbox"
                            name="vendorTypes"
                            value={t}
                            defaultChecked={q.vendorTypes.includes(t)}
                            className="mr-2 h-3.5 w-3.5 accent-pink"
                          />
                          {vendorTypeLabels[t]}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="required" defaultChecked={q.required} className="h-4 w-4 accent-pink" />
                    Must be answered before awarding
                  </label>

                  <div className="flex flex-wrap gap-3">
                    <SubmitButton>Save</SubmitButton>
                    <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-charcoal">
                      {q.label}
                      {q.unit ? <span className="text-charcoal/55"> ({q.unit})</span> : null}
                    </p>
                    <p className="mt-1 text-xs text-charcoal/55">
                      {TYPE_LABEL[q.type]}
                      {q.source === "QUOTATION" ? ` . filled from ${q.bidFieldLabel ?? "the quotation"}` : ""}
                      {q.source === "ANSWER" && q.required ? " . required" : ""}
                      {q.answerCount > 0 ? ` . ${q.answerCount} answer${q.answerCount === 1 ? "" : "s"}` : ""}
                      {` . position ${q.sortOrder}`}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {q.vendorTypes.map((t) => (
                        <span key={t} className="badge state-quiet">{vendorTypeLabels[t]}</span>
                      ))}
                      {!q.isActive ? <span className="badge state-waiting">Retired</span> : null}
                      {q.source === "QUOTATION" ? <span className="badge state-pending">From quotation</span> : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {q.source === "ANSWER" ? (
                      <button
                        type="button"
                        onClick={() => setEditing(q.id)}
                        className="text-xs font-bold uppercase tracking-[0.1em] text-pink hover:underline"
                      >
                        Edit
                      </button>
                    ) : null}

                    <form action={toggleAction}>
                      <input type="hidden" name="id" value={q.id} />
                      <button className="text-xs font-bold uppercase tracking-[0.1em] text-charcoal/60 hover:text-pink">
                        {q.isActive ? "Retire" : "Restore"}
                      </button>
                    </form>

                    {q.answerCount === 0 ? (
                      <form action={deleteAction}>
                        <input type="hidden" name="id" value={q.id} />
                        <button className="text-xs font-bold uppercase tracking-[0.1em] text-[#A32B2B] hover:underline">
                          Delete
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
