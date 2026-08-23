-- Apply once to the remote D1 database after 0004.
-- A nullable linked asset id keeps existing assets in simple running-balance mode.
ALTER TABLE assets ADD COLUMN card_payment_asset_id TEXT;
