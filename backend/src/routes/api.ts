import { Router, Request, Response } from 'express';
import { createSession, getSession, bulkPatchAnswers, completeSession, updateAttioIds } from '../services/sessionService';
import { syncSessionToAttio } from '../services/attioService';

const router = Router();

// ── Hard stop evaluation ─────────────────────────────────────────────────────

interface HardStop { reason: string; message: string }

function evaluateHardStops(answers: Record<string, unknown>): HardStop | null {
  if (answers.incorporation_location === 'Brasil') {
    return { reason: 'brazil_incorporation', message: 'Gracias por compartir tu proyecto. Esta ronda estamos enfocados en empresas constituidas fuera de Brasil, así que no encaja en este momento. Te tendremos en el radar para futuras convocatorias. ¡Mucha suerte construyendo! ✨' };
  }
  const ops = (answers.operations_location as string[] | undefined) ?? [];
  const LATAM = ['México', 'Colombia', 'Chile', 'Argentina', 'Perú', 'Uruguay', 'Centroamérica & Caribe', 'Otro LATAM'];
  if (ops.length > 0 && !ops.some(o => LATAM.includes(o))) {
    return { reason: 'no_latam_operation', message: 'Gracias por compartir tu proyecto. Esta ronda estamos enfocados en equipos operando en LATAM, así que no encaja en este momento. Te tendremos en el radar para futuras convocatorias. ¡Mucha suerte! ✨' };
  }
  const year = Number(answers.company_start_year);
  if (!isNaN(year) && year > 1990 && year < 2023) {
    return { reason: 'pre_2023', message: 'Gracias por compartir tu proyecto. Esta ronda estamos enfocados en empresas que hayan empezado a operar en 2023 o después, así que no encaja en este momento. Te tendremos en el radar para futuras convocatorias. ¡Mucha suerte! ✨' };
  }
  if (answers.founding_equity === '<40%') {
    return { reason: 'low_equity', message: 'Gracias por compartir tu proyecto. Para Decelera es importante que el equipo fundador mantenga al menos un 40% del equity, así que no encaja en este momento. Te tendremos en el radar para futuras convocatorias. ¡Mucha suerte! ✨' };
  }
  if (answers.total_raised === '>€2.5M') {
    return { reason: 'beyond_seed', message: 'Gracias por compartir tu proyecto. Esta ronda estamos enfocados en startups en etapa pre-seed/early-seed, así que no encaja en este momento. Te tendremos en el radar para futuras convocatorias. ¡Mucha suerte! ✨' };
  }
  if (answers.net_burn === '>€100k') {
    return { reason: 'high_burn', message: 'Gracias por compartir tu proyecto. En esta etapa buscamos startups con un burn más contenido, así que no encaja en este momento. Te tendremos en el radar para futuras convocatorias. ¡Mucha suerte! ✨' };
  }
  if (answers.runway === '12+ meses') {
    return { reason: 'long_runway', message: 'Gracias por compartir tu proyecto. Para este programa buscamos startups que estén activamente levantando ronda ahora mismo, así que no encaja en este momento. Te tendremos en el radar para futuras convocatorias. ¡Mucha suerte! ✨' };
  }
  const val = Number(answers.pre_money_valuation);
  if (!isNaN(val) && val > 0 && val < 10_000_000) {
    return { reason: 'low_valuation', message: 'Gracias por compartir tu proyecto. Esta ronda estamos enfocados en empresas con valoraciones pre-money de €10M o más, así que no encaja en este momento. Te tendremos en el radar para futuras convocatorias. ¡Mucha suerte! ✨' };
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
    await completeSession(req.params.id, answers, hardStop?.reason ?? null);

    if (!hardStop) {
      const attioResult = await syncSessionToAttio(answers);
      if (attioResult.ok) {
        await updateAttioIds(
          req.params.id,
          attioResult.data.personId,
          attioResult.data.companyId,
          attioResult.data.dealId
        );
        console.log(`Session ${req.params.id} synced to Attio — deal: ${attioResult.data.dealId}`);
      } else {
        console.warn(`Attio sync deferred for session ${req.params.id}: ${attioResult.error}`);
      }
    }

    const successMessage = '¡Recibido! El equipo de Decelera revisará tu aplicación y te contactaremos en los próximos días. Respira, continúa construyendo y mantente atento/a al email. 🚀';

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
