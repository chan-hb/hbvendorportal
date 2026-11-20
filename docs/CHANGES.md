# Huda Beauty vendor portal: what was built and why

The written record of this project. Not a changelog of commits, but the decisions behind the code,
the things that were deliberately not done, and what is still outstanding.

Read this before making significant changes. Several things look odd until you know why.

---

## What the portal is

A supplier-facing web app integrated with Dynamics 365 Finance and Operations. Two halves:

**Trade agreements.** Suppliers submit a price against an item. Huda Beauty approves, rejects or
requests a change. Approved prices sync back to D365 and are marked as created in the ERP.

**Sourcing (RFQ).** Buyers raise a request for quotation, invite suppliers, collect quotations with
tiered pricing and a launch data sheet, compare them against a weighted score, and award.

Running on Azure Container Apps, with Azure Database for PostgreSQL, Microsoft Graph for email and
Microsoft Entra for staff sign-in.

---

## Decisions worth knowing before you change anything

### Scoring is deterministic, not a language model

A buyer has to defend an award to the supplier who lost. Every number in `src/lib/rfq/scoring.ts` is
reproducible, and the full breakdown is shown on screen. The award form asks for a reason, and says
so more pointedly when the buyer overrides the suggestion.

Four criteria, equally weighted by default: price, lead time, capacity, minimum order quantity. A
weight of zero removes a criterion entirely.

An unstated figure scores zero rather than being ignored, otherwise leaving a field blank would be
an advantage.

Price is compared at the **launch quantity**, not the full year. That is what is actually being
committed to. The full year price is shown as its own column so the volume conversation is visible.
Capacity splits evenly between the two volumes: half launch speed, half whether a year's worth is
achievable inside a year. **That 50/50 split was a judgement call, not a specification.**

Track record (win rate) was removed on request. The win-rate calculation went with it.

### Vendor scoping is enforced server side, every time

A vendor's `vendorId` is stamped onto every query in `src/lib/agreements.ts`, `trade-agreements.ts`,
`rfq/service.ts` and `agreements-history.ts`. A crafted URL returns nothing rather than someone
else's pricing. Do not add a query that reads these tables without going through those functions.

An item is supplied by exactly one vendor, taken from the default vendor column on the D365 item
master. Submission is refused if the item's default vendor is not the submitting vendor.

### Deletion refuses more than it allows

What is blocked matters more than what is permitted:

- An agreement already created in D365 cannot be deleted. Removing it here would not remove the
  price from the ERP, and the two would then disagree.
- An awarded RFQ cannot be deleted. Bidders have been emailed the outcome.
- A local item used by an RFQ cannot be deleted.
- A user who appears on any record cannot be deleted. Deactivation blocks sign-in and keeps their
  name on what they approved, which is what an audit trail needs.

Each delete requires the reference typed back rather than a one-click confirm. The friction is
deliberate.

### The launch data sheet does not ask anything twice

Four questions in every section of the template are already captured on the quotation: supplier
name, incoterms, MOQ, and weekly capacity or lead time. Those are `QUOTATION` source questions,
shown filled and read-only. Two answers to the same question would disagree, and only one of them
feeds the scoring.

Consequence: secondary packaging and labels genuinely only add "additional comments" beyond what the
quotation already captures. That is what the template asks, not an error.

Questions live in a database table, editable by approvers and administrators. A question's `key` is
immutable because answers are stored against it. A question with answers can only be retired, not
deleted.

**Making a question required applies immediately, including to open RFQs.** A supplier who was
complete yesterday can become incomplete today and be blocked from award.

### Quantities are whole numbers, prices are not

Every quantity column is an integer. A unit price of 1.2345 is normal; a minimum order of 1.2345 is
not. Decimals are refused rather than rounded, because quietly turning 10,500.6 into 10,501 would be
worse than refusing it.

### Sync is checkpointed, and that is not optional

The item master runs to hundreds of thousands of rows. `src/lib/d365/` streams pages rather than
buffering, writes each page with one `jsonb_to_recordset` statement rather than per-row upserts, and
**checkpoints after every page**.

That last point is load-bearing. A platform timeout kills the function without warning, so a resume
point written only on a clean stop is never written at all, and the run restarts from page one
forever. This was a real bug, and the fix is the reason syncs complete.

Daily runs are incremental against `ModifiedDateTime`. Only a deliberate full refresh reads
everything.

### Email goes out as a named person

Microsoft Graph, sending as a real mailbox, with a copy landing in that mailbox's Sent Items so a
buyer can see what went to a supplier. Not a no-reply address.

`src/lib/mail/` is a provider layer: Graph when configured, Resend as a fallback, and logging to the
console when neither is. Nothing throws. A failed notification is recorded as an event on the RFQ
and never rolls back the action that triggered it.

### Authentication

Email and password for suppliers, Microsoft sign-in for Huda Beauty staff. Sessions are JWT, not
database rows, because the Credentials provider cannot use adapter sessions. Role and vendor are read
from the database on every request, so deactivating someone takes effect immediately.

Passwords are hashed with scrypt from Node's standard library rather than bcrypt or argon2. Neither
of those ships as pure JavaScript, and native modules are a common cause of a build that works
locally and fails on deploy. Cost parameters are stored with each hash so they can be raised later.

Twelve character minimum, no composition rules. Length helps; symbol requirements mostly produce
predictable substitutions and get written on notes.

### Vendor purchase orders are read live at sign-in, not synced

A vendor lands on `/home` after signing in (the nav calls it Home). It shows their open purchase
orders and their completed ones (received or invoiced, never open or cancelled), each paginated ten
to a page, plus delivered quantity over time. `/purchase-orders` redirects there. Vendor-facing
pages do not name Dynamics 365; staff-only pages still do.

The data comes from D365 each time they sign in (and when they open the page,
if the last pull is over fifteen minutes old), rather than from the nightly sync. Per vendor it is
small, two years of orders at most, so it is pulled whole and swapped in. No checkpoints needed.

Three entities, all configurable on the integration page: `PurchaseOrderHeadersV2` for which orders
belong to the vendor, `PurchaseOrderLinesV2` for SKU, name and quantity, and `ProductReceiptLinesV2`
for delivered quantity. The standard line entity has **no delivered quantity**, which is why receipts
are read at all. They also carry the real receipt date, so the chart shows when goods actually
arrived rather than when they were due.

**PO numbers are only unique within a company.** Some entities use a plain `PO000nnnn` sequence, so
every match is on `dataAreaId` and number together.

Only SKU, name, ordered quantity and delivered quantity are kept per line, with the order number,
date and status needed to group them. Fill rate counts completed orders only; open orders are mostly
not due yet and would read as under-delivery that has not happened. Lines with no item number
(services, procurement categories) are left out.

### Staff analytics are computed on read, from what the portal already stores

The dashboard has an Insights section for all Huda Beauty staff: approval funnel, time to decision,
a price change radar, supplier response rates and quote spread. Administrators also get
`/admin/analytics`: sync health by run, failures grouped by error, and the most active vendors and
staff. Everything comes from `src/lib/analytics.ts`, recomputed on each page load for a 30 day,
90 day or 12 month range. There is no reporting table and nothing to keep in step.

Definitions worth knowing:

- **Time to decision** pairs each approval, rejection or change request with the submission just
  before it, so a resubmission is timed from the resubmission, not the first attempt.
- **Price change** compares against the live price snapshotted at submission, same currency only.
- **Most active** counts actions: price submissions, quotes and RFQs opened for vendors; decisions,
  RFQs raised and awards for staff. The portal stores only each user's *last* sign-in, so sign-in
  frequency cannot be shown without a new login log.
- **Failures** include problems still waiting to be fixed (agreements that could not go live,
  purchase order refreshes that failed) whatever the range. A RUNNING sync with no heartbeat for
  fifteen minutes is shown as stalled.

Charts are hand-drawn SVG with a validated colour set (pink, violet, teal); status colours always
carry an icon and label. Every chart has a table view or text equivalent.

---

## Things that will catch you out

**`APP_ENCRYPTION_KEY` must never change.** It encrypts the stored D365 client secret. Rotating it
makes that secret unreadable and the integration has to be reconfigured.

**The Graph client secret expires**, usually within a year or two. All portal email then stops with
a 401 and the cause will not be obvious months later. Diarise the expiry date.

**`AUTH_URL` must match the browsed address exactly, with no trailing slash.** A slash produces
doubled slashes in constructed URLs and surfaces as `MissingCSRF`. It also builds the links inside
password reset emails.

**The middleware matcher excludes anything with a file extension.** Files in `public/` are served
from the root, so without that exclusion a signed-out visitor gets redirected to the login page
instead of the image, and logos appear broken. This cost several rounds of debugging.

**Entity and field names in D365 vary by environment.** `src/lib/d365/mappers.ts` tries a list of
candidate keys per field rather than hardcoding one shape. Adding a name to an array is usually the
whole fix. Entity names are configurable in the admin UI, not in code.

**Prisma types are generated at build time.** A relation used in a page but missing from the query's
`include` compiles locally and fails in CI. This happened twice. Check the include before adding a
property read.

---

## Known gaps

**No attachments on bids.** RFQs have them, quotations do not.

**No reminders to vendors** who have not responded as a closing date approaches.

**Nothing closes an RFQ automatically** at its closing date. Late submissions are blocked but the
status stays OPEN until someone acts.

**An award creates nothing in D365.** If the winning price should flow into the trade agreement
approval workflow, that link is unbuilt and would be a small piece of work given both halves exist.

**No rate limiting on sign-in**, and no record of failed attempts beyond the per-account counter
used for lockout.

**Security headers were built and then reverted** on request. CSP, HSTS, `X-Frame-Options` and
`nosniff` are not present. The package still exists if wanted.

**Sampling lead time is captured but not scored**, by decision. Raw material lead time and shift
count are also unscored and arguably more revealing than the headline lead time that is scored.

**No X++ artefacts are deployed.** `xpp/` contains the staging table, data entity and posting
service for the D365 side. They are source files, not a deployable model, and need building in
Visual Studio. Until then, approved agreements cannot sync back.

---

## Open questions

- Should the capacity score split 50/50 between launch and full year, or favour one?
- Should price be compared at launch or full year volume?
- Do secondary packaging and labels need more data sheet questions than the template provides?
- Should payment terms count towards the score? Ninety days is worth real money against forty five.
- Should a vendor blocked for purchase in D365 lose portal access automatically? Currently
  `isBlocked` is synced and shown but access is governed separately.
- Vendor accounts are matched on account number alone across legal entities. Correct if numbering is
  shared, wrong if the same number means different suppliers in different companies.

---

## Operational notes

**Deployment** is GitHub Actions to Azure Container Apps. Images are tagged by commit SHA, so
rollback is redeploying an older tag. Rolling back the image does not roll back the schema.

**The schema is applied at startup** by `scripts/start.mjs`, not during the build. A build machine
has no business reaching the production database, and a build that needs it will happily succeed
against nothing.

**Min replicas is 1, not 0.** Every cold start runs `prisma db push` before accepting traffic, which
lands on whoever is first through the door after a quiet period. Scaling to zero is viable with
`SKIP_DB_PUSH` set and schema changes applied deliberately.

**Keep the time budget below the platform request timeout.** Container Apps ingress closes an idle
request after a few minutes. 180 seconds is the configured default.

**The portal installs as an app.** `src/app/manifest.ts` (served as `/manifest.webmanifest`),
the PNG icons in `public/icons/` and the service worker `public/sw.js` are what make Chrome and Edge
offer "Install app". The worker caches nothing a signed-in user sees: it only stores
`public/offline.html` and shows it when a page navigation fails with no connection. Bump `VERSION`
in `sw.js` when the offline page or icons change. These paths all have a file extension, which the
middleware matcher lets through for signed-out visitors; keep it that way, or install breaks. The
icons were generated from `public/HBBrandLogo.jpg`, a 300 pixel image, so the 512 pixel ones are
upscaled; replace them with a larger master when one is available.

---

## First-time setup, in order

1. Database, with the Azure services firewall rule enabled.
2. Container app with its secrets and environment variables.
3. GitHub connection and first deploy.
4. `POST /api/bootstrap` with the `CRON_SECRET` as a bearer token, for the first administrator
   password. Refuses to run once any account has one.
5. RFQ settings: sender address, legal entity, unit, standard quantity breaks. Send the test email.
6. D365 integration: credentials, entity names, legal entities. Refresh vendors, then items, then
   trade agreements, in that order.
7. Logic App for the nightly sync. Container Apps has no scheduler.
