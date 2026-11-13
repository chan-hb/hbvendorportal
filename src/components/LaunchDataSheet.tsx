"use client";

import type { Question } from "@/lib/rfq/questionnaire";

/**
 * The launch data sheet section of the quotation.
 *
 * Questions marked as coming from the quotation are shown filled and read-only
 * rather than asked again. That keeps the sheet looking like the template a
 * buyer recognises, without two answers to the same question that can
 * disagree with each other.
 */
export function LaunchDataSheet({
  section,
  questions,
  answers,
  derived,
  readOnly,
}: {
  section: string;
  questions: Question[];
  answers: Record<string, string>;
  /** Quotation values, keyed by the question's bidField. */
  derived: Record<string, string>;
  readOnly?: boolean;
}) {
  const asked = questions.filter((q) => q.source === "ANSWER");
  const echoed = questions.filter((q) => q.source === "QUOTATION");

  return (
    <section className="space-y-5">
      <div>
        <p className="eyebrow">Launch data sheet</p>
        <p className="mt-1 text-xs text-charcoal/55">
          The {section} section. These answers are needed before the business can be placed, so it is worth
          completing them now rather than being chased later.
        </p>
      </div>

      {echoed.length > 0 ? (
        <div className="rounded-field border border-line bg-blush/60 p-4">
          <p className="field-label">Taken from your quotation above</p>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {echoed.map((q) => (
              <div key={q.key} className="flex justify-between gap-3 text-sm">
                <dt className="text-charcoal/60">{q.label}</dt>
                <dd className="font-medium text-charcoal">
                  {(q.bidField ? derived[q.bidField] : "")?.trim() || "Not yet entered"}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        {asked.map((q) => {
          const name = `answer_${q.key}`;
          const value = answers[q.key] ?? "";
          const wide = q.type === "LONGTEXT";

          return (
            <div key={q.key} className={wide ? "sm:col-span-2" : undefined}>
              <label
                className={`field-label${q.required ? " field-label-required" : ""}`}
                htmlFor={name}
              >
                {q.label}
                {q.unit ? ` (${q.unit})` : ""}
              </label>

              {q.type === "LONGTEXT" ? (
                <textarea
                  id={name}
                  name={name}
                  rows={3}
                  className="input"
                  defaultValue={value}
                  required={q.required ?? false}
                  disabled={readOnly}
                />
              ) : q.type === "CHOICE" ? (
                <select
                  id={name}
                  name={name}
                  className="input"
                  defaultValue={value}
                  required={q.required ?? false}
                  disabled={readOnly}
                >
                  <option value="">Choose one</option>
                  {q.options?.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : q.type === "YESNO" ? (
                <select
                  id={name}
                  name={name}
                  className="input"
                  defaultValue={value}
                  required={q.required ?? false}
                  disabled={readOnly}
                >
                  <option value="">Choose one</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              ) : (
                <input
                  id={name}
                  name={name}
                  type={q.type === "NUMBER" ? "number" : "text"}
                  min={q.type === "NUMBER" ? 0 : undefined}
                  className="input"
                  defaultValue={value}
                  required={q.required ?? false}
                  disabled={readOnly}
                />
              )}

              {q.help ? <p className="mt-1 text-xs text-charcoal/55">{q.help}</p> : null}
            </div>
          );
        })}
      </div>

      {asked.length === 0 ? (
        <p className="text-sm text-charcoal/60">
          Nothing further is needed for this section beyond what you have already entered above.
        </p>
      ) : null}
    </section>
  );
}

/** Read-only rendering, for the buyer's view of a submitted quotation. */
export function LaunchDataSheetSummary({
  questions,
  answers,
  derived,
}: {
  questions: Question[];
  answers: Record<string, string>;
  derived: Record<string, string>;
}) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {questions.map((q) => {
        const value = q.source === "QUOTATION" ? (q.bidField ? derived[q.bidField] : "") : answers[q.key];
        return (
          <div key={q.key} className={q.type === "LONGTEXT" ? "sm:col-span-2" : undefined}>
            <dt className="field-label">{q.label}{q.unit ? ` (${q.unit})` : ""}</dt>
            <dd className="text-sm text-charcoal">
              {value?.trim() ? value : <span className="text-charcoal/40">Not answered</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
