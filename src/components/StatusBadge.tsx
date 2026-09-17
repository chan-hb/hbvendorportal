import type { AgreementStatus } from "@prisma/client";
import { STATUS_CLASS, STATUS_LABEL } from "@/lib/format";

export function StatusBadge({ status }: { status: AgreementStatus }) {
  return <span className={`badge ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function ErpBadge({ created }: { created: boolean }) {
  return created ? (
    <span className="badge border-[#2C6B44]/25 bg-[#EAF4EE] text-[#2C6B44]">In ERP</span>
  ) : (
    <span className="badge border-line bg-cloud text-charcoal/60">Not in ERP</span>
  );
}
