import { Router, Request, Response } from 'express';
import type { FlowConfig } from '../../../shared/types';
import { createSession, getSession, updateSessionAnswer, updateAttioIds, patchSessionAnswer, resetSession } from '../services/sessionService';
import { resolveNextStep, interpolateQuestion, getStep, buildHistory } from '../services/flowEngine';
import { syncSessionToAttio } from '../services/attioService';
import { askDecelera, chatFormTurn } from '../services/aiService';

import flowConfig from '../../../shared/flow-config.json';

const flow = flowConfig as FlowConfig;
const router = Router();

// ---- Hard stop evaluation (runs on completion) ----

interface HardStop {
  reason: string;
  message: string;
}

function evaluateHardStops(answers: Record<string, unknown>): HardStop | null {
  // Brazil incorporation
  if (answers.incorporation_location === 'Brasil') {
    return {
      reason: 'brazil_incorporation',
      message: 'Gracias por compartir tu proyecto. Esta ronda estamos enfocados en empresas constituidas fuera de Brasil, así que no encaja en este momento. Te tendremos en el radar para futuras convocatorias. ¡Mucha suerte construyendo! ✨',
    };
  }

  // No LATAM operation
  const ops = (answers.operations_location as string[] | undefined) ?? [];
  const LATAM_MARKETS = ['México', 'Colombia', 'Chile', 'Argentina', 'Perú', 'Uruguay', 'Centroamérica & Caribe', 'Otro LATAM'];
  const hasLatam = ops.some(o => LATAM_MARKETS.includes(o));
  if (!hasLatam && ops.length > 0) {
    return {
      reason: 'no_latam_operation',
      message: 'Gracias por compartir tu proyecto. Esta ronda estamos enfocados en equipos operando en LATAM, así que no encaja en este momento. Te tendremos en el radar para futuras convocatorias. ¡Mucha suerte! ✨',
    };
  }

  // Pre-2023
  const year = Number(answers.company_start_year);
  if (!isNaN(year) && year < 2023) {
    return {
      reason: 'pre_2023',
      message: 'Gracias por compartir tu proyecto. Esta ronda estamos enfocados en empresas que hayan empezado a operar en 2023 o después, así que no encaja en este momento. Te tendremos en el radar para futuras convocatorias. ¡Mucha suerte! ✨',
    };
  }

  // Equity too diluted
  if (answers.founding_equity === '<40%') {
    return {
      reason: 'low_equity',
      message: 'Gracias por compartir tu proyecto. Para Decelera es importante que el equipo fundador mantenga al menos un 40% del equity, así que no encaja en este momento. Te tendremos en el radar para futuras convocatorias. ¡Mucha suerte! ✨',
    };
  }

  // Beyond seed
  if (answers.total_raised === '>€2.5M') {
    return {
      reason: 'beyond_seed',
      message: 'Gracias por compartir tu proyecto. Esta ronda estamos enfocados en startups en etapa pre-seed/early-seed, así que no encaja en este momento. Te tendremos en el radar para futuras convocatorias. ¡Mucha suerte! ✨',
    };
  }

  // Net burn too high
  if (answers.net_burn === '>€100k') {
    return {
      reason: 'high_burn',
      message: 'Gracias por compartir tu proyecto. En esta etapa buscamos startups con un burn más contenido, así que no encaja en este momento. Te tendremos en el radar para futuras convocatorias. ¡Mucha suerte! ✨',
    };
  }

  // Runway too long (doesn't need to raise now)
  if (answers.runway === '12+ meses') {
    return {
      reason: 'long_runway',
      message: 'Gracias por compartir tu proyecto. Para este programa buscamos startups que estén activamente levantando ronda ahora mismo, así que no encaja en este momento. Te tendremos en el radar para futuras convocatorias. ¡Mucha suerte! ✨',
    };
  }

  // Valuation too low
  const valuation = Number(answers.pre_money_valuation);
  if (!isNaN(valuation) && valuation > 0 && valuation < 10_000_000) {
    return {
      reason: 'low_valuation',
      message: 'Gracias por compartir tu proyecto. Esta ronda estamos enfocados en empresas con valoraciones pre-money de €10M o más, así que no encaja en este momento. Te tendremos en el radar para futuras convocatorias. ¡Mucha suerte! ✨',
    };
  }

  return null;
}

// ---- Routes ----

router.post('/sessions', async (_req: Request, res: Response) => {
  try {
    const session = await createSession(flow.id, flow.version, flow.startStep);
    const firstStep = getStep(flow, flow.startStep);
    res.json({ session, step: firstStep, welcomeMessage: flow.welcomeMessage });
  } catch (err) {
    console.error('POST /sessions error:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

router.get('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const session = await getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const step = getStep(flow, session.currentStepId);
    if (!step) return res.status(404).json({ error: 'Step not found' });

    const interpolated = {
      ...step,
      question: interpolateQuestion(step.question, session.answers),
    };

    const history = buildHistory(flow, session.answers);
    res.json({ session, step: interpolated, history });
  } catch (err) {
    console.error('GET /sessions/:id error:', err);
    res.status(500).json({ error: 'Failed to load session' });
  }
});

router.post('/sessions/:id/answer', async (req: Request, res: Response) => {
  try {
    const session = await getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.status === 'completed') {
      return res.status(400).json({ error: 'Session already completed' });
    }

    const { stepId, answer } = req.body as { stepId: string; answer: unknown };

    if (stepId !== session.currentStepId) {
      return res.status(400).json({ error: 'Step mismatch — reload the form' });
    }

    const currentStep = getStep(flow, stepId);
    if (!currentStep) return res.status(404).json({ error: 'Step not found' });

    const updatedAnswers = { ...session.answers, [stepId]: answer };
    const nextStepId = resolveNextStep(currentStep, updatedAnswers);
    const isComplete = nextStepId === null;

    // Evaluate hard stops on completion
    let hardStop: HardStop | null = null;
    let completionMessage = flow.completionMessage;
    let isDeclined = false;

    if (isComplete) {
      hardStop = evaluateHardStops(updatedAnswers);
      if (hardStop) {
        completionMessage = hardStop.message;
        isDeclined = true;
      }
    }

    const updatedSession = await updateSessionAnswer(
      session.id,
      stepId,
      answer,
      nextStepId,
      isComplete,
      hardStop?.reason ?? null
    );

    if (isComplete && !isDeclined) {
      const attioResult = await syncSessionToAttio(updatedAnswers);
      if (attioResult.ok) {
        await updateAttioIds(
          session.id,
          attioResult.data.personId,
          attioResult.data.companyId,
          attioResult.data.dealId
        );
        console.log(`Session ${session.id} synced to Attio — deal: ${attioResult.data.dealId}`);
      } else {
        console.warn(`Attio sync deferred for session ${session.id}: ${attioResult.error}`);
      }
    }

    const nextStep = nextStepId ? getStep(flow, nextStepId) : null;
    const interpolatedNextStep = nextStep
      ? { ...nextStep, question: interpolateQuestion(nextStep.question, updatedAnswers) }
      : null;

    res.json({
      session: updatedSession,
      nextStep: interpolatedNextStep,
      isComplete,
      isDeclined,
      completionMessage: isComplete ? completionMessage : undefined,
    });
  } catch (err) {
    console.error('POST /sessions/:id/answer error:', err);
    res.status(500).json({ error: 'Failed to save answer' });
  }
});

router.post('/sessions/:id/reset', async (req: Request, res: Response) => {
  try {
    const session = await getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    await resetSession(req.params.id, flow.startStep);
    const firstStep = getStep(flow, flow.startStep);
    res.json({ ok: true, step: firstStep });
  } catch (err) {
    console.error('POST /sessions/:id/reset error:', err);
    res.status(500).json({ error: 'Failed to reset session' });
  }
});

router.patch('/sessions/:id/answer', async (req: Request, res: Response) => {
  try {
    const { stepId, answer } = req.body as { stepId: string; answer: unknown };
    const session = await getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (!stepId) return res.status(400).json({ error: 'stepId required' });
    await patchSessionAnswer(req.params.id, stepId, answer);
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /sessions/:id/answer error:', err);
    res.status(500).json({ error: 'Failed to update answer' });
  }
});

router.get('/flow/steps/:stepId', (req: Request, res: Response) => {
  const step = getStep(flow, req.params.stepId);
  if (!step) return res.status(404).json({ error: 'Step not found' });
  res.json(step);
});

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message, currentQuestion, answeredCount } = req.body as {
      message: string;
      currentQuestion?: string;
      answeredCount?: number;
    };
    if (!message) return res.status(400).json({ error: 'message required' });
    const reply = await askDecelera(message, { currentQuestion, answeredCount });
    res.json({ reply });
  } catch (err) {
    console.error('POST /chat error:', err);
    res.status(500).json({ error: 'AI service unavailable' });
  }
});

router.post('/sessions/:id/chat-answer', async (req: Request, res: Response) => {
  try {
    const session = await getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.status === 'completed') {
      return res.status(400).json({ error: 'Session already completed' });
    }

    const { message } = req.body as { message: string };
    if (!message?.trim()) return res.status(400).json({ error: 'message required' });

    const currentStep = getStep(flow, session.currentStepId);
    if (!currentStep) return res.status(404).json({ error: 'Step not found' });

    const totalDataFields = Object.values(flow.steps).filter(s => s.type !== 'statement').length;
    const answeredCount   = Object.keys(session.answers).length;

    const result = await chatFormTurn(
      message.trim(),
      {
        id:       currentStep.id,
        question: interpolateQuestion(currentStep.question, session.answers),
        type:     currentStep.type,
        options:  currentStep.options,
      },
      session.answers,
      { answered: answeredCount, total: totalDataFields }
    );

    if (!result.isAnswer) {
      return res.json({ isAnswer: false, ackMessage: result.ackMessage });
    }

    const updatedAnswers = { ...session.answers, [currentStep.id]: result.extractedValue };
    let nextStepId = resolveNextStep(currentStep, updatedAnswers);
    let isComplete = nextStepId === null;

    let hardStop: HardStop | null = null;
    let completionMessage = flow.completionMessage;
    let isDeclined = false;

    if (isComplete) {
      hardStop = evaluateHardStops(updatedAnswers);
      if (hardStop) {
        completionMessage = hardStop.message;
        isDeclined = true;
      }
    }

    let updatedSession = await updateSessionAnswer(
      session.id,
      currentStep.id,
      result.extractedValue,
      nextStepId,
      isComplete,
      hardStop?.reason ?? null
    );

    // Auto-advance through statement steps in AI mode
    let nextStep = nextStepId ? getStep(flow, nextStepId) : null;
    while (nextStep?.type === 'statement') {
      const afterId = resolveNextStep(nextStep, updatedAnswers);
      updatedSession = await updateSessionAnswer(session.id, nextStep.id, null, afterId, afterId === null);
      isComplete = afterId === null;
      nextStepId = afterId;
      nextStep   = afterId ? getStep(flow, afterId) : null;
    }

    if (isComplete && !isDeclined) {
      const attioResult = await syncSessionToAttio(updatedAnswers);
      if (attioResult.ok) {
        await updateAttioIds(session.id, attioResult.data.personId, attioResult.data.companyId, attioResult.data.dealId);
      }
    }

    const interpolatedNextStep = nextStep
      ? { ...nextStep, question: interpolateQuestion(nextStep.question, updatedAnswers) }
      : null;

    res.json({
      isAnswer:          true,
      ackMessage:        result.ackMessage,
      extractedField:    currentStep.id,
      extractedValue:    result.extractedValue,
      session:           updatedSession,
      nextStep:          interpolatedNextStep,
      isComplete,
      isDeclined,
      completionMessage: isComplete ? completionMessage : undefined,
    });
  } catch (err) {
    console.error('POST /sessions/:id/chat-answer error:', err);
    res.status(500).json({ error: 'AI service unavailable' });
  }
});

router.get('/flow', (_req: Request, res: Response) => {
  res.json({
    id: flow.id,
    version: flow.version,
    title: flow.title,
    totalSteps: Object.keys(flow.steps).filter(
      (id) => flow.steps[id].type !== 'statement'
    ).length,
  });
});

export default router;
