# Phase 2 financial reliability

Apply `backend/config/migrations/20261013_financial_reliability.sql` in Supabase before deploying. Fresh schemas include the same table in `database.sql`. The backend must use `SUPABASE_SERVICE_ROLE_KEY`; the ledger denies direct anonymous/authenticated database access. Existing batches, expenses and stock are unchanged. No harvest, sale or inventory history is backfilled.

## Authenticated API

All routes require the existing Bearer JWT and scope every read/write to its owner.

- `GET /sales?batch_id=<optional UUID>` lists harvest/sale records.
- `POST /sales` creates a record.
- `PUT /sales/:id` replaces editable fields on an owned record, including completing an unsold harvest with a sale.
- `DELETE /sales/:id` removes an erroneous owned record.
- `GET /reports/financial?from=YYYY-MM-DD&to=YYYY-MM-DD&batch_id=<optional UUID>` returns dated recorded sales, expenses, their difference, and monthly totals. Dates are inclusive; omitted dates select all history. Explicit pagination avoids Supabase's default row cap.

Example create body:

```json
{
  "batch_id": "00000000-0000-0000-0000-000000000001",
  "harvest_date": "2026-10-13",
  "pig_count": 2,
  "total_weight_kg": 180,
  "sale_date": "2026-10-13",
  "revenue": 32400,
  "buyer": "Local buyer",
  "notes": "Actual total proceeds"
}
```

An unsold harvest has both `sale_date` and `revenue` null. A sale needs both fields, allows zero proceeds and cannot precede harvest. Quantities must be positive. Sale amounts are actual total proceeds, never inferred from a per-kg reference. A record can represent a partial harvest; for distinct sales split the harvested quantities into separate records. Edits replace the entire record; concurrent edits use last-write-wins. This is an editable operational ledger, not an immutable accounting journal.

## UI and accounting basis

Analytics preserves the existing card styling and adds harvest entry/history/editing. Actual sales and recorded expenses use transaction dates and batch filters. Monthly recorded profit is sales minus dated expense entries, with year-month keys; no revenue is distributed across months. Months without records are omitted. No entries shows an explicit empty state; database errors show unavailable, not zero.

Recorded profit excludes costs never entered in expenses and is not complete accounting profit. Enter purchases/costs once through the expense ledger. The displayed feed consumption valuation uses current stock prices and is explicitly an estimate; it is not added to recorded profit. Vaccine cost is unavailable because free-text dosage does not reliably specify doses and historical dose costs are absent. They may overlap manual expense entries and are excluded from the value-minus-recorded-cost estimate too. Standing pig value uses active batches' total current weight, with unavailable shown when any selected active batch lacks a usable weight/price. It is current value, not period sales.

Harvest entries deliberately do not mutate operational pig counts, pig rows, batch status or standing weights. Update those separately after harvest; no quantity reconciliation against the mutable batch count is claimed. Batch deletion is restricted while harvest/sale records reference it, preserving financial history.

Purchase history and inventory movements are deferred. Existing stock flows replace balances and usage does not atomically debit stock. A reliable future ledger needs transactional stock/purchase/expense integration and explicit opening balances, without converting old balances into invented purchases.

## Verification

No automated tests run by request. Verify JavaScript with `node --check`, build the frontend with `npm run build`, and run `git diff --check`. Database migration and live authenticated API behavior require a configured Supabase deployment; local static checks do not validate SQL execution.
