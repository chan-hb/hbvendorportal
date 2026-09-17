"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { saveIntegrationAction } from "@/app/actions/integration";
import type { ActionState } from "@/app/actions/agreements";

export type IntegrationValues = {
  tenantId: string;
  clientId: string;
  secretSet: boolean;
  resourceUrl: string;
  scopeOverride: string;
  vendorEntity: string;
  itemEntity: string;
  tradeAgreementEntity: string;
  pushEntity: string;
  legalEntities: string;
  pageSize: number;
  incrementalEnabled: boolean;
  modifiedDateField: string;
  itemFilter: string;
  tradeAgreementFilter: string;
  timeBudgetSeconds: number;
  cronEnabled: boolean;
};

export function IntegrationForm({ values }: { values: IntegrationValues }) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveIntegrationAction, null);

  return (
    <form action={formAction} className="space-y-6 p-5">
      {state?.error ? (
        <p className="border border-[#A32B2B]/30 bg-[#FBEAEA] px-4 py-3 text-sm text-[#A32B2B]">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p className="border border-[#2C6B44]/25 bg-[#EAF4EE] px-4 py-3 text-sm text-[#2C6B44]">{state.ok}</p>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <Text name="tenantId" label="Entra tenant ID" defaultValue={values.tenantId} required />
        <Text name="clientId" label="Application (client) ID" defaultValue={values.clientId} required />
        <div className="md:col-span-2">
          <label className="field-label" htmlFor="clientSecret">Client secret</label>
          <input
            id="clientSecret"
            name="clientSecret"
            type="password"
            className="input"
            placeholder={values.secretSet ? "Stored. Leave blank to keep it." : "Paste the secret value"}
            autoComplete="new-password"
          />
          <p className="mt-1 text-xs text-charcoal/55">
            Encrypted with AES-256-GCM before it is written to the database and never sent back to the browser.
          </p>
        </div>
        <Text
          name="resourceUrl"
          label="Environment URL"
          defaultValue={values.resourceUrl}
          placeholder="https://hb-prod.operations.dynamics.com"
          required
        />
        <Text
          name="scopeOverride"
          label="Scope override (optional)"
          defaultValue={values.scopeOverride}
          placeholder="Defaults to <environment URL>/.default"
        />
      </div>

      <div>
        <p className="eyebrow">Entities</p>
        <p className="mt-1 text-xs text-charcoal/55">
          Entity names vary between environments and extensions. Change them here rather than in code.
        </p>
        <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <Text name="vendorEntity" label="Vendor master entity" defaultValue={values.vendorEntity} required />
          <Text name="itemEntity" label="Item master entity" defaultValue={values.itemEntity} required />
          <Text
            name="tradeAgreementEntity"
            label="Trade agreement entity"
            defaultValue={values.tradeAgreementEntity}
            required
          />
          <Text name="pushEntity" label="Write-back entity" defaultValue={values.pushEntity} required />
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <Text
          name="legalEntities"
          label="Legal entities (comma separated dataAreaId)"
          defaultValue={values.legalEntities}
          placeholder="hb01, hb02, hbus"
          required
        />
        <div>
          <label className="field-label" htmlFor="pageSize">Page size</label>
          <input id="pageSize" name="pageSize" type="number" min={100} max={10000} className="input" defaultValue={values.pageSize} />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="cronEnabled" defaultChecked={values.cronEnabled} className="h-4 w-4 accent-pink" />
            Run the daily scheduled refresh
          </label>
        </div>
      </div>

      <div>
        <p className="eyebrow">Volume</p>
        <p className="mt-1 text-xs text-charcoal/55">
          Page size is rows per HTTP request, not a limit on the total pulled. Dynamics 365 caps it server
          side, so raising it past the cap has no effect. Large entities are streamed page by page and
          checkpointed, so a run that hits the time budget resumes rather than starting over.
        </p>
        <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="field-label" htmlFor="timeBudgetSeconds">Time budget (seconds)</label>
            <input
              id="timeBudgetSeconds"
              name="timeBudgetSeconds"
              type="number"
              min={30}
              max={290}
              className="input"
              defaultValue={values.timeBudgetSeconds}
            />
            <p className="mt-1 text-xs text-charcoal/55">
              Must be below your function timeout, or the run is killed before it can checkpoint.
            </p>
          </div>
          <Text
            name="modifiedDateField"
            label="Modified date field"
            defaultValue={values.modifiedDateField}
            required
          />
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="incrementalEnabled"
                defaultChecked={values.incrementalEnabled}
                className="h-4 w-4 accent-pink"
              />
              Daily runs pull only what changed
            </label>
          </div>
        </div>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <Text
            name="itemFilter"
            label="Extra item filter (OData)"
            defaultValue={values.itemFilter}
            placeholder="PrimaryVendorAccountNumber ne ''"
          />
          <Text
            name="tradeAgreementFilter"
            label="Extra trade agreement filter (OData)"
            defaultValue={values.tradeAgreementFilter}
          />
        </div>
      </div>

      <SubmitButton>Save settings</SubmitButton>
    </form>
  );
}

function Text({
  name,
  label,
  defaultValue,
  placeholder,
  required,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={name}>{label}</label>
      <input id={name} name={name} className="input" defaultValue={defaultValue} placeholder={placeholder} required={required} />
    </div>
  );
}
