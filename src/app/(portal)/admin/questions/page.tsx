import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canAdminister, canApprove } from "@/lib/rbac";
import { allQuestions, BID_FIELD_LABEL, VENDOR_TYPE_LABEL } from "@/lib/rfq/questionnaire";
import { QuestionAdmin } from "@/components/QuestionAdmin";

export default async function QuestionsPage() {
  const user = await requireUser();
  // Purchasing owns the questionnaire, so approvers get in too.
  if (!canApprove(user.role) && !canAdminister(user.role)) redirect("/rfq");

  const questions = await allQuestions();

  // How many suppliers have answered each, which decides whether it can be
  // deleted or only retired.
  const counts = await prisma.bidAnswer.groupBy({
    by: ["questionKey"],
    _count: { _all: true },
  });
  const countByKey = new Map<string, number>(
    counts.map((c) => [c.questionKey, Number(c._count._all)]),
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Purchasing</p>
        <h1 className="page-title mt-2">Launch data sheet</h1>
        <p className="mt-2 text-sm text-charcoal/60">
          The questions suppliers answer when quoting. Each one appears only for the vendor types you choose, so a
          label printer is not asked about filling capacity.
        </p>
      </div>

      <QuestionAdmin
        vendorTypeLabels={VENDOR_TYPE_LABEL}
        questions={questions.map((q) => ({
          id: q.id,
          key: q.key,
          label: q.label,
          type: q.type,
          source: q.source,
          bidFieldLabel: q.bidField ? BID_FIELD_LABEL[q.bidField] : null,
          options: q.options,
          unit: q.unit,
          help: q.help,
          required: q.required,
          vendorTypes: q.vendorTypes,
          sortOrder: q.sortOrder,
          isActive: q.isActive,
          answerCount: countByKey.get(q.key) ?? 0,
        }))}
      />
    </div>
  );
}
