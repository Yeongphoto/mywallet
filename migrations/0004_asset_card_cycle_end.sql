-- Apply once to the remote D1 database after 0003.
-- A nullable end day preserves the simple running-balance mode for existing assets.
ALTER TABLE assets ADD COLUMN card_cycle_end_day INTEGER;
