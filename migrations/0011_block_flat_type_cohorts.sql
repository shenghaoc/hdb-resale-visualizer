-- Preserve the transaction cohort behind each canonical flat type so the
-- runtime can keep prices, sample size, recency, floor area, and models on the
-- same evidence basis.
ALTER TABLE blocks ADD COLUMN flat_type_cohorts_json TEXT;
