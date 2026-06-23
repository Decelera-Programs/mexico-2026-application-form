import type { ApplicationSession } from '../../../shared/types';

const API = '/api';

export interface SessionData {
  session: ApplicationSession;
  answers: Record<string, unknown>;
  currentBlock: string;
}

export interface SubmitResult {
  ok: boolean;
  isDeclined: boolean;
  message: string;
  alreadySubmitted?: boolean;
}

export async function createSession(): Promise<SessionData> {
  const res = await fetch(`${API}/sessions`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to create session');
  const data = await res.json();
  return { session: data.session, answers: data.session.answers ?? {}, currentBlock: data.session.currentStepId ?? 'identity' };
}

export async function loadSession(id: string): Promise<SessionData | null> {
  const res = await fetch(`${API}/sessions/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to load session');
  return res.json();
}

export async function saveDraft(
  sessionId: string,
  answers: Record<string, unknown>,
  currentBlock: string
): Promise<void> {
  await fetch(`${API}/sessions/${sessionId}/draft`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers, currentBlock }),
  });
}

export async function submitApplication(
  sessionId: string,
  answers: Record<string, unknown>
): Promise<SubmitResult> {
  const res = await fetch(`${API}/sessions/${sessionId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) throw new Error('Submit failed');
  return res.json();
}
