ALTER TABLE daily_digest_candidates ADD COLUMN quality_evidence_version TEXT;
ALTER TABLE daily_digest_candidates ADD COLUMN quality_evidence_state TEXT;
ALTER TABLE daily_digest_candidates ADD COLUMN quality_integrity_class TEXT;
ALTER TABLE daily_digest_candidates ADD COLUMN quality_item_count INTEGER;
ALTER TABLE daily_digest_candidates ADD COLUMN quality_topic_count INTEGER;
ALTER TABLE daily_digest_candidates ADD COLUMN quality_core_topic_count INTEGER;
ALTER TABLE daily_digest_candidates ADD COLUMN quality_dominant_topic_share_bps INTEGER;
ALTER TABLE daily_digest_candidates ADD COLUMN quality_topic_counts_json TEXT;
