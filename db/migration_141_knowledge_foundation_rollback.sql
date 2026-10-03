-- migration_141_knowledge_foundation_rollback.sql
BEGIN;
DROP TRIGGER IF EXISTS trg_knowledge_chunks_tsv ON knowledge_chunks;
DROP FUNCTION IF EXISTS knowledge_chunks_tsv_trigger();
DROP TABLE IF EXISTS knowledge_chunks;
DROP TABLE IF EXISTS knowledge_document_versions;
DROP TRIGGER IF EXISTS trg_knowledge_documents_updated_at ON knowledge_documents;
DROP FUNCTION IF EXISTS update_knowledge_documents_updated_at();
DROP TABLE IF EXISTS knowledge_documents;
COMMIT;
NOTIFY pgrst, 'reload schema';
