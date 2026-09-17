"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { runSyncAction, testConnectionAction } from "@/app/actions/sync";
import type { ActionState } from "@/app/actions/agreements";

export function SyncControls({ legalEntities }: { legalEntities: string[] }) {
  const [state, formAction] = useActionState<ActionState, FormData>(runSyncAction, null);
  const [testState, testAction] = useActionState<ActionState, FormData>(
    async () => testConnectionAction(),
    null,
  );
  const [fullRefresh, setFullRefresh] = useState(false);
  const [entity, setEntity] = useState("");

  const message = state ?? testState;

  // Every refresh form carries the same two options.
  const options = (
    <>
      {fullRefresh ? <input type="hidden" name="fullRefresh" value="on" /> : null}
      {entity ? <input type="hidden" name="onlyDataAreaId" value={entity} /> : null}
    </>
  );

  return (
    <div className="space-y-4 p-5">
      {message?.error ? (
        <p className="border border-[#A32B2B]/30 bg-[#FBEAEA] px-4 py-3 text-sm text-[#A32B2B]">{message.error}</p>
      ) : null}
      {message?.ok ? (
        <p className="border border-[#2C6B44]/25 bg-[#EAF4EE] px-4 py-3 text-sm text-[#2C6B44]">{message.ok}</p>
      ) : null}

      <div className="flex flex-wrap items-end gap-5 border-b border-line pb-4">
        <div>
          <label className="field-label" htmlFor="entity">Limit to one legal entity</label>
          <select
            id="entity"
            className="input max-w-[220px]"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
          >
            <option value="">All configured entities</option>
            {legalEntities.map((code) => (
              <option key={code} value={code}>{code.toUpperCase()}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-pink"
            checked={fullRefresh}
            onChange={(e) => setFullRefresh(e.target.checked)}
          />
          Read everything, not just what changed
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <form action={testAction}>
          <SubmitButton className="btn-ghost">Test connection</SubmitButton>
        </form>
        <form action={formAction}>
          <input type="hidden" name="scope" value="vendors" />
          {options}
          <SubmitButton className="btn-ghost">Refresh vendors</SubmitButton>
        </form>
        <form action={formAction}>
          <input type="hidden" name="scope" value="items" />
          {options}
          <SubmitButton className="btn-ghost">Refresh items</SubmitButton>
        </form>
        <form action={formAction}>
          <input type="hidden" name="scope" value="tradeAgreements" />
          {options}
          <SubmitButton className="btn-ghost">Refresh trade agreements</SubmitButton>
        </form>
        <form action={formAction}>
          <input type="hidden" name="scope" value="push" />
          <SubmitButton className="btn-dark">Push approved to D365</SubmitButton>
        </form>
        <form action={formAction}>
          <input type="hidden" name="scope" value="all" />
          {options}
          <SubmitButton>Run everything now</SubmitButton>
        </form>
      </div>

      <p className="text-xs text-charcoal/55">
        Run vendors before items, because items resolve their default vendor against that table. A full read
        of a large item master will not finish in one go: it stops at the time budget, records where it got
        to, and carries on from there the next time you press the same button. Repeat until the sync position
        table above shows complete.
      </p>
    </div>
  );
}
