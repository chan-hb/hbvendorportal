import { z } from "zod";

export const agreementInput = z.object({
  dataAreaId: z.string().min(1, "Choose a legal entity"),
  itemNumber: z.string().min(1, "Choose an item"),
  currency: z.string().length(3, "Use a 3 letter currency code").toUpperCase(),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  unit: z.string().optional(),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date().optional().nullable(),
  notes: z.string().max(2000).optional(),
}).refine((v) => !v.toDate || v.toDate >= v.fromDate, {
  message: "The to date cannot be before the from date",
  path: ["toDate"],
});

export type AgreementInput = z.infer<typeof agreementInput>;

export const decisionInput = z.object({
  agreementId: z.string().min(1),
  decision: z.enum(["APPROVE", "REJECT", "REQUEST_CHANGE"]),
  comment: z.string().max(2000).optional(),
}).refine((v) => v.decision === "APPROVE" || (v.comment && v.comment.trim().length >= 3), {
  message: "Add a comment explaining the decision",
  path: ["comment"],
});

export const integrationInput = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().optional(), // blank keeps the stored value
  resourceUrl: z.string().url("Use the full https URL of the D365 environment"),
  scopeOverride: z.string().optional(),
  vendorEntity: z.string().min(1),
  itemEntity: z.string().min(1),
  tradeAgreementEntity: z.string().min(1),
  pushEntity: z.string().min(1),
  legalEntities: z.string(), // comma separated in the form
  pageSize: z.coerce.number().int().min(100).max(10000),
  incrementalEnabled: z.coerce.boolean(),
  modifiedDateField: z.string().min(1),
  itemFilter: z.string().optional(),
  tradeAgreementFilter: z.string().optional(),
  timeBudgetSeconds: z.coerce.number().int().min(10).max(290),
  cronEnabled: z.coerce.boolean(),
});
