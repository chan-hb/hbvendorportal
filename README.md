# Huda Beauty vendor portal

Supplier-facing portal for trade agreements and sourcing, integrated with Dynamics 365 Finance and
Operations.

- **Trade agreements** submitted by suppliers, approved by Huda Beauty, synced back to D365
- **RFQ** with quantity-break pricing, attached briefs, bid comparison and a scored suggestion
- **Price history** across both D365 and portal-approved changes
- **Excel round trip** so suppliers can update prices in a spreadsheet
- **Item and vendor master** mirrored from D365, with items creatable locally before they exist there

---

## Getting oriented

| If you want to | Read |
| --- | --- |
| Deploy this on Azure | `AZURE-DEPLOY.md` |
| Set up email | `IT-REQUEST.md`, then forward it to your Entra administrator |
| Build the D365 side | `xpp/README.md` |

---

## Access model

| Who | How they get in | What they see |
| --- | --- | --- |
| Anyone on a domain in `HB_DOMAINS` | Email and password, or Microsoft SSO | Everything |
| Address in `HB_ADMIN_EMAILS` | As above | Everything, plus admin pages |
| Address on a registered vendor domain | Email and password | Their own vendor's records only |
| Address in the allow-list | Email and password | Their own vendor's records only |
| Anyone else | Refused | Nothing |

Accounts are created deliberately by an administrator, or automatically when a contact is
allow-listed or a provisional supplier is added. Everyone sets their own password through an emailed
link, and a temporary password can be issued by hand when email is unavailable.

Vendor scoping is enforced server side in `src/lib/agreements.ts` and the equivalent RFQ and price
history services. A crafted URL returns nothing rather than another supplier's pricing.

---

## Layout

```
prisma/schema.prisma      data model
scripts/start.mjs         applies the schema, then starts the server
src/auth.ts               credentials and Microsoft sign-in
src/lib/access.ts         who is allowed in, and as what
src/lib/accounts.ts       account creation, password set-up and reset, mail sender identity
src/lib/password.ts       hashing, strength rules, single-use tokens
src/lib/agreements.ts     scoping, submission and approval
src/lib/rfq/              RFQ service, scoring, notifications
src/lib/pricelist/        Excel export and import
src/lib/mail/             Graph, Resend and log providers
src/lib/d365/             OData client, mappers, sync, checkpointing
src/app/(portal)/         the signed-in application
xpp/                      X++ artefacts for D365
```

---

## Running it locally

Optional. Everything can be done through the hosted app.

```bash
cp .env.example .env.local     # fill in the values
npm install
npm run db:push
npm run db:seed                # prints an administrator password
npm run dev
```

Without mail credentials, messages are written to the console instead of being sent, which is enough
to exercise every flow.

---

## Two things to keep an eye on

**The Graph client secret expires**, usually within a year or two. When it does, all portal email
stops with an authentication error and the cause will not be obvious months later. Diarise it.

**`APP_ENCRYPTION_KEY` must never change.** It encrypts the stored D365 client secret. Rotating it
makes that secret unreadable and the integration has to be reconfigured.
