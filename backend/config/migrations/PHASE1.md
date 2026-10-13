# Phase 1 deployment

Apply `20261013_phase1_correctness.sql` in Supabase after the existing owner and stock migrations and before deploying the backend. It is transactional and safe to rerun. It creates the service-role-only batch creation RPC and removes defaults for new feed/vaccine prices. Existing costs, including zeros, are preserved because their meaning cannot be inferred safely. The backend needs `SUPABASE_SERVICE_ROLE_KEY` to invoke the RPC; no credentials are supplied by this change. A missing migration fails batch creation instead of leaving a partial batch.

Empty legacy batches are read as empty; review and repair them explicitly. Reads never generate pigs. Financial totals and profits are unavailable when a used feed/vaccine price or dosage is missing. Recorded zero prices remain valid. Current stock prices are estimates for historical consumption, not historical purchase costs. Protobuf stock price fields now have optional presence; consumers must distinguish omitted values from recorded zero.

Manual reminder endpoints require `Authorization: Bearer <INTERNAL_REMINDER_TOKEN>`, independent of user JWTs. Configure a private token of at least 32 characters on the server and internal caller only. Without it, endpoints are disabled (503). Scheduled reminders continue through the existing scheduler.

Pig prices retain the scraper cache and in-flight request deduplication. Public reads allow 60 requests per IP per minute; AI analysis allows 5 per authenticated user per 10 minutes. Limits are process-local; multiple replicas require a shared gateway limit. Location payloads are bounded.
