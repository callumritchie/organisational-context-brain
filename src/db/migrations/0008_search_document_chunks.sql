ALTER TABLE search_documents ADD COLUMN IF NOT EXISTS chunk_index integer NOT NULL DEFAULT 0;
ALTER TABLE search_documents ADD COLUMN IF NOT EXISTS chunk_start_offset integer NOT NULL DEFAULT 0;
ALTER TABLE search_documents ADD COLUMN IF NOT EXISTS chunk_end_offset integer;

UPDATE search_documents SET chunk_end_offset = length(body) WHERE chunk_end_offset IS NULL;

ALTER TABLE search_documents ALTER COLUMN chunk_end_offset SET NOT NULL;

ALTER TABLE search_documents DROP CONSTRAINT IF EXISTS search_documents_chunk_index_check;
ALTER TABLE search_documents ADD CONSTRAINT search_documents_chunk_index_check CHECK (chunk_index >= 0);
ALTER TABLE search_documents DROP CONSTRAINT IF EXISTS search_documents_chunk_offsets_check;
ALTER TABLE search_documents ADD CONSTRAINT search_documents_chunk_offsets_check
  CHECK (chunk_start_offset >= 0 AND chunk_end_offset >= chunk_start_offset);

CREATE UNIQUE INDEX IF NOT EXISTS search_documents_content_chunk_idx
  ON search_documents (content_version_id, resource_id, chunk_index)
  WHERE content_version_id IS NOT NULL;

COMMENT ON COLUMN search_documents.chunk_start_offset IS 'Inclusive character offset in the source-version body.';
COMMENT ON COLUMN search_documents.chunk_end_offset IS 'Exclusive character offset in the source-version body.';
