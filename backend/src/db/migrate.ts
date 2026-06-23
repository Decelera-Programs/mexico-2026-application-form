import { pool } from './index';

const migration = `
  CREATE TABLE IF NOT EXISTS application_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id TEXT NOT NULL,
    flow_version TEXT NOT NULL,
    current_step_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress'
      CHECK (status IN ('in_progress', 'completed', 'abandoned')),
    answers JSONB NOT NULL DEFAULT '{}',
    attio_person_id TEXT,
    attio_company_id TEXT,
    attio_deal_id TEXT,
    synced_to_attio BOOLEAN NOT NULL DEFAULT FALSE,
    hard_stop TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS answer_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES application_sessions(id) ON DELETE CASCADE,
    step_id TEXT NOT NULL,
    answer JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE OR REPLACE FUNCTION update_updated_at_column()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$ language 'plpgsql';

  DROP TRIGGER IF EXISTS update_sessions_updated_at ON application_sessions;
  CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON application_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  ALTER TABLE application_sessions ADD COLUMN IF NOT EXISTS sync_attempts INTEGER NOT NULL DEFAULT 0;

  CREATE INDEX IF NOT EXISTS idx_sessions_status ON application_sessions(status);
  CREATE INDEX IF NOT EXISTS idx_sessions_synced ON application_sessions(synced_to_attio) WHERE synced_to_attio = FALSE;
  CREATE INDEX IF NOT EXISTS idx_answer_log_session ON answer_log(session_id);
`;

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Running database migration...');
    await client.query(migration);
    console.log('✅ Migration complete');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
