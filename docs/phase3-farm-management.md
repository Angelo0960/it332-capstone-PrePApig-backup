# Phase 3 farm management

Apply `backend/config/migrations/20261013_phase3_farm_management.sql` after the existing migrations before deploying the backend. This migration creates empty ledgers and preference storage and adds optional farm profile fields. It does not seed users, credentials or historical records. Configure the existing backend connection with `SUPABASE_SERVICE_ROLE_KEY`: new tables enable RLS without public policies, and all HTTP routes require JWT authentication and scope queries to the authenticated owner. The migration also adds a non-partial notification deduplication index so PostgREST can infer the scheduled reminder upsert conflict target.

The Farm navigation item opens settings; its links reach mortality, health/treatment history and the dedicated expense screen. Profile settings are also linked from the Home profile dialog. Expenses use the existing `/expenses` routes, including edit and delete; expense edits now validate dates, amounts and batch ownership.

Mortality is a batch-level ledger. An insert locks the batch and reduces its remaining `pig_count` atomically, rejecting deaths above the remaining count. Delete is a correction that restores the count. Updates are disallowed. No individual pig is selected or marked dead, and existing individual pig rows are retained. Batches referenced by either new ledger cannot be deleted until those records are removed. Health history records conditions, treatment, medication/dosage, practitioner, outcome and notes without inventing past observations.

Authenticated API routes:

- `GET/POST /management/mortality`, `DELETE /management/mortality/:id`
- `GET/POST /management/treatments`, `DELETE /management/treatments/:id`
- `GET /management/settings`
- `PUT /management/settings/profile` (editable profile/farm fields only)
- `PUT /management/settings/notifications` (three boolean preferences)
- `GET /management/backup`
- `POST /management/backup/validate`

Feed and vaccination switches control future scheduled in-app and push reminders. Push can be disabled separately, preserving in-app reminders. Missing preference rows use the prior enabled behavior. Browser permission and a registered device remain necessary for push delivery. Changes do not erase existing notifications.

Exports include owner-scoped batches, pigs, feed records/stocks, vaccination records/stocks, expenses, mortality, treatments, profile, stored preferences and notifications. Every dataset is paginated; database errors fail the whole export. There is no invented preference row when none is stored. Passwords, authentication secrets, device tokens, files and inferred historical data are excluded. Live reads are not a transactional snapshot.

Validation checks the envelope, dataset presence, row IDs, duplicate IDs, ownership, batch references and core fields in new ledgers/expenses/preferences. It is not a full restore compatibility check or a verification of historical accuracy. There is no import/restore endpoint. The UI limits validation input to 900 KB to fit the existing backend 1 MB request limit; downloading larger exports remains supported.

Verification for this change uses Node syntax checks, the frontend production build and `git diff --check`. Automated tests are intentionally not run. Applying the migration and authenticated live database/browser verification require the deployment environment and are not implied by these static checks.
