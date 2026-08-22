-- Apply once after 0001. This only strengthens idempotency metadata.
ALTER TABLE operation_results ADD COLUMN request_hash TEXT NOT NULL DEFAULT '';
