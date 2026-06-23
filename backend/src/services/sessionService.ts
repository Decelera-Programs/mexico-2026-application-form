import { pool } from '../db';
import type { ApplicationSession } from '../../../shared/types';

function rowToSession(row: Record<string, unknown>): ApplicationSession {
  return {
    id: row.id as string,
    flowId: row.flow_id as string,
    flowVersion: row.flow_version as string,
    currentStepId: row.current_step_id as string,
    status: row.status as ApplicationSession['status'],
    answers: row.answers as Record<string, unknown>,
    attioPersonId: row.attio_person_id as string | undefined,
    attioCompanyId: row.attio_company_id as string | undefined,
    syncedToAttio: row.synced_to_attio as boolean,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

export async function createSession(
  flowId: string,
  flowVersion: string,
  startStepId: string
): Promise<ApplicationSession> {
  const result = await pool.query(
    `INSERT INTO application_sessions (flow_id, flow_version, current_step_id)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [flowId, flowVersion, startStepId]
  );
  return rowToSession(result.rows[0]);
}

export async function getSession(id: string): Promise<ApplicationSession | null> {
  const result = await pool.query(
    'SELECT * FROM application_sessions WHERE id = $1',
    [id]
  );
  if (result.rows.length === 0) return null;
  return rowToSession(result.rows[0]);
}

export async function updateSessionAnswer(
  sessionId: string,
  stepId: string,
  answer: unknown,
  nextStepId: string | null,
  isComplete: boolean,
  hardStop?: string | null
): Promise<ApplicationSession> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO answer_log (session_id, step_id, answer) VALUES ($1, $2, $3)`,
      [sessionId, stepId, JSON.stringify(answer)]
    );

    const result = await client.query(
      `UPDATE application_sessions
       SET answers = answers || $1::jsonb,
           current_step_id = $2,
           status = $3,
           hard_stop = COALESCE($5, hard_stop),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [
        JSON.stringify({ [stepId]: answer }),
        nextStepId ?? stepId,
        isComplete ? 'completed' : 'in_progress',
        sessionId,
        hardStop ?? null,
      ]
    );

    await client.query('COMMIT');
    return rowToSession(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateAttioIds(
  sessionId: string,
  attioPersonId?: string,
  attioCompanyId?: string,
  attioDealId?: string
): Promise<void> {
  await pool.query(
    `UPDATE application_sessions
     SET attio_person_id = COALESCE($1, attio_person_id),
         attio_company_id = COALESCE($2, attio_company_id),
         attio_deal_id = COALESCE($3, attio_deal_id),
         synced_to_attio = TRUE,
         updated_at = NOW()
     WHERE id = $4`,
    [attioPersonId ?? null, attioCompanyId ?? null, attioDealId ?? null, sessionId]
  );
}

export async function getUnsyncedSessions(maxAttempts = 5): Promise<ApplicationSession[]> {
  const result = await pool.query(
    `SELECT * FROM application_sessions
     WHERE synced_to_attio = FALSE
       AND status = 'completed'
       AND (hard_stop IS NULL OR hard_stop = '')
       AND sync_attempts < $1
     ORDER BY created_at ASC
     LIMIT 50`,
    [maxAttempts]
  );
  return result.rows.map(rowToSession);
}

export async function incrementSyncAttempts(sessionId: string): Promise<void> {
  await pool.query(
    `UPDATE application_sessions SET sync_attempts = sync_attempts + 1 WHERE id = $1`,
    [sessionId]
  );
}

export async function resetSession(sessionId: string, startStepId: string): Promise<void> {
  await pool.query(
    `UPDATE application_sessions
     SET answers         = '{}'::jsonb,
         current_step_id = $1,
         status          = 'in_progress',
         synced_to_attio = FALSE,
         hard_stop       = NULL,
         sync_attempts   = 0,
         updated_at      = NOW()
     WHERE id = $2`,
    [startStepId, sessionId]
  );
}

export async function patchSessionAnswer(sessionId: string, stepId: string, answer: unknown): Promise<void> {
  await pool.query(
    `UPDATE application_sessions
     SET answers         = jsonb_set(answers, ARRAY[$1::text], $2::jsonb),
         synced_to_attio = FALSE,
         sync_attempts   = 0,
         updated_at      = NOW()
     WHERE id = $3`,
    [stepId, JSON.stringify(answer), sessionId]
  );
}

export async function bulkPatchAnswers(
  sessionId: string,
  answers: Record<string, unknown>,
  currentBlockId: string
): Promise<void> {
  await pool.query(
    `UPDATE application_sessions
     SET answers         = answers || $1::jsonb,
         current_step_id = $2,
         updated_at      = NOW()
     WHERE id = $3`,
    [JSON.stringify(answers), currentBlockId, sessionId]
  );
}

export async function completeSession(
  sessionId: string,
  answers: Record<string, unknown>,
  hardStop: string | null
): Promise<void> {
  await pool.query(
    `UPDATE application_sessions
     SET answers         = answers || $1::jsonb,
         current_step_id = 'complete',
         status          = 'completed',
         hard_stop       = $2,
         updated_at      = NOW()
     WHERE id = $3`,
    [JSON.stringify(answers), hardStop, sessionId]
  );
}
