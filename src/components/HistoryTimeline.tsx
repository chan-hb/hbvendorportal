import type { HistoryAction, Role } from "@prisma/client";
import { dateTime } from "@/lib/format";

const ACTION_LABEL: Record<HistoryAction, string> = {
  CREATED: "Draft created",
  SUBMITTED: "Submitted for approval",
  RESUBMITTED: "Resubmitted after change request",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CHANGE_REQUESTED: "Change requested",
  WITHDRAWN: "Withdrawn",
  ERP_SYNC_SUCCEEDED: "Created in Dynamics 365",
  ERP_SYNC_FAILED: "Dynamics 365 sync failed",
};

const ACCENT: Partial<Record<HistoryAction, string>> = {
  APPROVED: "bg-[#2C6B44]",
  REJECTED: "bg-[#A32B2B]",
  CHANGE_REQUESTED: "bg-nude",
  ERP_SYNC_FAILED: "bg-[#A32B2B]",
  ERP_SYNC_SUCCEEDED: "bg-[#2C6B44]",
};

export function HistoryTimeline({
  entries,
}: {
  entries: {
    id: string;
    action: HistoryAction;
    comment: string | null;
    actorEmail: string;
    actorRole: Role;
    createdAt: Date;
  }[];
}) {
  if (entries.length === 0) {
    return <p className="px-5 py-8 text-sm text-charcoal/60">No activity recorded yet.</p>;
  }

  return (
    <ol className="relative px-5 py-5">
      <span className="absolute left-[26px] top-6 bottom-6 w-px bg-line" aria-hidden />
      {entries.map((e) => (
        <li key={e.id} className="relative flex gap-4 py-3">
          <span
            className={`relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${ACCENT[e.action] ?? "bg-pink"}`}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-charcoal">
              {ACTION_LABEL[e.action]}
            </p>
            <p className="mt-0.5 text-xs text-charcoal/60">
              {e.actorEmail} . {dateTime(e.createdAt)}
            </p>
            {e.comment ? <p className="mt-2 text-sm text-charcoal/80">{e.comment}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
