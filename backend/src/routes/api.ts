import { Router, Request, Response } from 'express';
import { createSession, getSession, bulkPatchAnswers, completeSession, updateAttioIds } from '../services/sessionService';
import { syncSessionToAttio } from '../services/attioService';

const router = Router();

// ── Hard stop evaluation ─────────────────────────────────────────────────────

interface HardStop { reason: string; message: string }

const DECLINE = (reason: string) =>
  `Thanks for sharing your project. This round we're focused on ${reason}, so it isn't the right fit right now. We'll keep you on our radar for future calls. Best of luck. ✨`;

function evaluateHardStops(answers: Record<string, unknown>): HardStop | null {
  if (answers.incorporation_location === 'Brazil') {
    return { reason: 'brazil_incorporation', message: DECLINE('companies incorporated outside Brazil') };
  }
  const ops = (answers.operations_location as string[] | undefined) ?? [];
  const LATAM = ['Mexico', 'Colombia', 'Chile', 'Argentina', 'Peru', 'Uruguay', 'Central America & Caribbean', 'Other LATAM'];
  if (ops.length > 0 && !ops.some(o => LATAM.includes(o))) {
    return { reason: 'no_latam_operation', message: DECLINE('teams operating in LATAM') };
  }
  const year = Number(answers.company_start_year);
  if (!isNaN(year) && year > 1990 && year < 2023) {
    return { reason: 'pre_2023', message: DECLINE('companies that started operating in 2023 or later') };
  }
  if (answers.founding_equity === '<40%') {
    return { reason: 'low_equity', message: DECLINE('teams where founders hold at least 40% of the equity') };
  }
  if (answers.total_raised === '>€2.5M') {
    return { reason: 'beyond_seed', message: DECLINE('pre-seed and early-seed startups') };
  }
  if (answers.net_burn === '>€100k') {
    return { reason: 'high_burn', message: DECLINE('startups with a contained burn at this stage') };
  }
  if (answers.runway === '12+ months') {
    return { reason: 'long_runway', message: DECLINE('startups actively raising right now') };
  }
  const val = Number(answers.pre_money_valuation);
  if (!isNaN(val) && val > 0 && val < 10_000_000) {
    return { reason: 'low_valuation', message: DECLINE('companies with a pre-money valuation of €10M or above') };
  }
  return null;
}

// ── Routes ───────────────────────────────────────────────────────────────────

// Create or reuse session
router.post('/sessions', async (_req: Request, res: Response) => {
  try {
    const session = await createSession('decelera-latam26-application-v2', '3.0.0', 'identity');
    res.json({ session });
  } catch (err) {
    console.error('POST /sessions:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Load session (returns answers for form restoration)
router.get('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const session = await getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ session, answers: session.answers, currentBlock: session.currentStepId });
  } catch (err) {
    console.error('GET /sessions/:id:', err);
    res.status(500).json({ error: 'Failed to load session' });
  }
});

// Save draft (auto-save when navigating between blocks)
router.patch('/sessions/:id/draft', async (req: Request, res: Response) => {
  try {
    const session = await getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.status === 'completed') return res.json({ ok: true });

    const { answers, currentBlock } = req.body as {
      answers: Record<string, unknown>;
      currentBlock: string;
    };
    if (!answers || !currentBlock) return res.status(400).json({ error: 'answers and currentBlock required' });

    await bulkPatchAnswers(req.params.id, answers, currentBlock);
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /sessions/:id/draft:', err);
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

// Final submit
router.post('/sessions/:id/submit', async (req: Request, res: Response) => {
  try {
    const session = await getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.status === 'completed') {
      return res.json({ ok: true, isDeclined: !!session.answers.__hard_stop, alreadySubmitted: true });
    }

    const { answers } = req.body as { answers: Record<string, unknown> };
    if (!answers) return res.status(400).json({ error: 'answers required' });

    const hardStop = evaluateHardStops(answers);
    const wasNewlyCompleted = await completeSession(req.params.id, answers, hardStop?.reason ?? null);

    if (!wasNewlyCompleted) {
      return res.json({ ok: true, isDeclined: !!session.answers.__hard_stop, alreadySubmitted: true });
    }

    const attioResult = await syncSessionToAttio(answers, !!hardStop);
    if (attioResult.ok) {
      await updateAttioIds(
        req.params.id,
        attioResult.data.personId,
        attioResult.data.companyId,
        attioResult.data.dealId
      );
      console.log(`Session ${req.params.id} synced to Attio — deal: ${attioResult.data.dealId}${hardStop ? ' [Not qualified]' : ''}`);
    } else {
      console.warn(`Attio sync deferred for session ${req.params.id}: ${attioResult.error}`);
    }

    const successMessage = 'Thanks for applying to Decelera LATAM 2026. The investment team reviews every application — you\'ll hear from us within 7 days. Questions: hola@decelera.com';

    res.json({
      ok: true,
      isDeclined: !!hardStop,
      message: hardStop?.message ?? successMessage,
    });
  } catch (err) {
    console.error('POST /sessions/:id/submit:', err);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

export default router;
