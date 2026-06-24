import { getUnsyncedSessions, updateAttioIds, incrementSyncAttempts } from './sessionService';
import { syncSessionToAttio } from './attioService';

const MAX_ATTEMPTS = 5;

export async function runRetryWorker(): Promise<void> {
  let sessions;
  try {
    sessions = await getUnsyncedSessions(MAX_ATTEMPTS);
  } catch (err) {
    console.error('[RetryWorker] Failed to fetch unsynced sessions:', err);
    return;
  }

  if (sessions.length === 0) return;

  console.log(`[RetryWorker] ${sessions.length} session(s) pending Attio sync`);

  for (const session of sessions) {
    const declined = !!session.hardStop;
    const result = await syncSessionToAttio(session.answers, declined, session.hardStop ?? null);

    if (result.ok) {
      await updateAttioIds(
        session.id,
        result.data.personId,
        result.data.companyId,
        result.data.dealId
      );
      console.log(`[RetryWorker] ✅ Session ${session.id} synced — deal: ${result.data.dealId}${declined ? ' [Not qualified]' : ''}`);
    } else {
      await incrementSyncAttempts(session.id);
      console.warn(`[RetryWorker] ⚠️  Session ${session.id} failed (attempt ${session.syncedToAttio}): ${result.error}`);
    }
  }
}

export function startRetryWorker(intervalMs = 60_000): NodeJS.Timeout {
  console.log(`[RetryWorker] Starting — interval: ${intervalMs / 1000}s`);
  runRetryWorker().catch(console.error);
  return setInterval(() => runRetryWorker().catch(console.error), intervalMs);
}
