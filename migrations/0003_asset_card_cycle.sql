-- Apply once to the remote D1 database before deploying asset payment-cycle settings.
-- Nullable fields preserve the existing simple running-balance behavior for every asset.
ALTER TABLE assets ADD COLUMN card_cycle_start_day INTEGER;
ALTER TABLE assets ADD COLUMN card_payment_day INTEGER;
