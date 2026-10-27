import type { AgreementStatus } from "@prisma/client";
import { STATUS_CLASS, STATUS_LABEL } from "@/lib/format";

export function StatusBadge({ status }: { status: AgreementStatus }) {
  return <span className={`badge ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function ErpBadge({ created }: { created: boolean }) {
  return created ? (
    <span className="badge state-done">In ERP</span>
  ) : (
    <span className="badge state-quiet">Not in ERP</span>
  );
}
