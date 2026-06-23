import React, { useState, useEffect, useRef } from 'react';
import type { FlowStep, ApplicationSession } from '../../shared/types';
import { startSession, submitAnswer, correctAnswer, getFlowStep, restartSession, chatMessage, chatFormAnswer } from './hooks/useApi';
import { ChatBubble, TypingIndicator } from './components/ChatBubble';
import { Confetti } from './components/Confetti';
import { StepInput } from './components/StepInput';
import { Mascot } from './components/Mascot';

interface Message {
  id: string;
  type: 'bot' | 'user';
  text: string;
  html?: string;
}

interface AnswerHistoryItem {
  stepId: string;
  question: string;
  answer: unknown;
  displayAnswer: string;
}

type AppState = 'loading' | 'welcome' | 'chat' | 'complete' | 'declined' | 'error';
type CorrectionState = 'idle' | 'selecting' | 'entering';

const CORRECTION_SELECT_STEP: FlowStep = {
  id: '__correction_select__',
  type: 'text',
  question: '',
  placeholder: 'Escribe el número…',
  required: true,
};

// ── Block definitions ────────────────────────────────────────────────────────

const BLOCKS: { label: string; count: number }[] = [
  { label: 'Identidad',      count: 3  },
  { label: 'La empresa',     count: 10 },
  { label: 'Los founders',   count: 7  },
  { label: 'Tracción',       count: 5  },
  { label: 'Equity & ronda', count: 10 },
  { label: 'Cierre',         count: 4  },
];

const TOTAL_STEPS = BLOCKS.reduce((s, b) => s + b.count, 0);

const STEP_TO_BLOCK: Record<string, number> = {
  // Block 0: Identidad
  startup_name: 0, founder_full_name: 0, founder_email: 0,

  // Block 1: La empresa
  section_company: 1, problem: 1, demo_url: 1, industry_insight: 1,
  defensibility: 1, third_party_dependence: 1, sector: 1, business_model: 1,
  potential_clients: 1, why_now_select: 1, why_now_validation: 1,

  // Block 2: Los founders
  section_founders: 2, technical_cofounder: 2, number_of_founders: 2,
  founder_linkedin: 2, team_milestone: 2, team_milestone_detail: 2,
  sector_experience: 2, most_significant_milestone: 2,

  // Block 3: Tracción
  section_traction: 3, north_star: 3, mom_growth: 3, net_burn: 3,
  churn: 3, acquisition_channel: 3,

  // Block 4: Equity & ronda
  section_equity: 4, incorporation_location: 4, operations_location: 4,
  company_start_year: 4, founding_equity: 4, total_raised: 4,
  round_size: 4, round_committed: 4, pre_money_valuation: 4,
  runway: 4, pitch_deck_url: 4,

  // Block 5: Cierre
  section_wrap: 5, how_heard: 5, referral_name: 5,
  network_contact: 5, network_contact_name: 5, additional_comments: 5,
};

// ── Welcome copy ─────────────────────────────────────────────────────────────

const INTRO_HTML = `¡Hola! Soy <strong>Paco</strong>, tu guía para la aplicación a <strong>Decelera LATAM 2026</strong> 🌎🚀<br><br>Somos un fondo founder-first — ofrecemos hasta <strong>$1M en initial funding</strong>, $1M reservado para follow-on, y una <strong>residencia 100% sponsored de 7 días</strong> en México para encontrar nuestras próximas startups.<br><br>Son <strong>5 pasos</strong>, unos 15 minutos. Puedes corregir tus respuestas en cualquier momento escribiendo <code>/correct</code>.`;

const GDPR_HTML = `Antes de empezar, una nota sobre tus datos 🔒<br><br><strong>Protección de datos</strong><br><br>La información de este formulario se gestiona bajo el marco "Decelera LATAM 2026 Application" en cumplimiento del RGPD y las leyes de protección de datos aplicables. Tienes derecho a acceder, corregir, eliminar u oponerte al tratamiento de tus datos. Para más detalles, visita nuestra <a href="https://www.deceleraamericas.ventures" target="_blank" style="color:var(--color-sea);text-decoration:underline">web</a> o escríbenos a hola@decelera.com.`;

// ── Main component ───────────────────────────────────────────────────────────

export default function App() {
  const [appState, setAppState]                   = useState<AppState>('loading');
  const [messages, setMessages]                   = useState<Message[]>([]);
  const [session, setSession]                     = useState<ApplicationSession | null>(null);
  const [currentStep, setCurrentStep]             = useState<FlowStep | null>(null);
  const [isTyping, setIsTyping]                   = useState(false);
  const [isSubmitting, setIsSubmitting]           = useState(false);
  const [consentReady, setConsentReady]           = useState(false);
  const [answerHistory, setAnswerHistory]         = useState<AnswerHistoryItem[]>([]);
  const [aiMode, setAiMode]                       = useState(false);
  const [correctionState, setCorrectionState]     = useState<CorrectionState>('idle');
  const [correctionStep, setCorrectionStep]       = useState<FlowStep | null>(null);
  const [correctionStepId, setCorrectionStepId]   = useState<string | null>(null);
  const [confirmingRestart, setConfirmingRestart] = useState(false);
  const [savedFlash, setSavedFlash]               = useState(false);
  const [inputKey, setInputKey]                   = useState(0);
  const bottomRef      = useRef<HTMLDivElement>(null);
  const isRestoringRef = useRef(false);
  const initRan        = useRef(false);

  const currentBlockIndex: number = (() => {
    if (appState === 'complete' || appState === 'declined') return BLOCKS.length;
    if (!currentStep) return 0;
    return STEP_TO_BLOCK[currentStep.id] ?? 0;
  })();

  useEffect(() => {
    if (appState !== 'chat') return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [appState]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: isRestoringRef.current ? 'instant' : 'smooth' });
    isRestoringRef.current = false;
  }, [messages, isTyping, consentReady]);

  useEffect(() => {
    (async () => {
      if (initRan.current) return;
      initRan.current = true;
      try {
        const savedId = localStorage.getItem('decelera_mex26_session_id');

        if (savedId) {
          try {
            const res = await fetch(`/api/sessions/${savedId}`);
            if (res.ok) {
              const data = await res.json();
              if (data.session.status === 'completed') {
                setAppState('complete');
                return;
              }

              type HistoryEntry = { stepId: string; question: string; answer: unknown; type: string };
              const restored: Message[] = [
                { id: 'w-intro', type: 'bot', text: '', html: INTRO_HTML },
                { id: 'w-gdpr',  type: 'bot', text: '', html: GDPR_HTML  },
              ];
              for (const entry of (data.history ?? []) as HistoryEntry[]) {
                restored.push({ id: `bot-${entry.stepId}`, type: 'bot', text: entry.question });
                if (entry.type !== 'statement' && entry.answer !== null && entry.answer !== undefined) {
                  const display = Array.isArray(entry.answer)
                    ? (entry.answer as unknown[]).join(', ')
                    : typeof entry.answer === 'boolean' ? (entry.answer ? 'Sí' : 'No')
                    : String(entry.answer);
                  if (display) restored.push({ id: `user-${entry.stepId}`, type: 'user', text: display });
                }
              }
              const restoredHistory: AnswerHistoryItem[] = (data.history ?? [])
                .filter((e: HistoryEntry) => e.type !== 'statement' && e.answer !== null && e.answer !== undefined)
                .map((e: HistoryEntry) => {
                  const d = Array.isArray(e.answer)
                    ? (e.answer as unknown[]).join(', ')
                    : typeof e.answer === 'boolean' ? (e.answer ? 'Sí' : 'No')
                    : String(e.answer);
                  return { stepId: e.stepId, question: e.question, answer: e.answer, displayAnswer: d };
                });
              const n = restoredHistory.length;
              restored.push({ id: 'w-back', type: 'bot', text: `¡Bienvenido/a de nuevo! 👋 Tienes ${n} pregunta${n !== 1 ? 's' : ''} respondida${n !== 1 ? 's' : ''} — seguimos donde lo dejaste.` });
              restored.push({ id: 'bot-current', type: 'bot', text: data.step.question });
              isRestoringRef.current = true;
              setMessages(restored);
              setAnswerHistory(restoredHistory);
              setSession(data.session);
              setCurrentStep(data.step);
              setAppState('chat');
              return;
            }
          } catch {
            // fall through to new session
          }
        }

        const data = await startSession();
        localStorage.setItem('decelera_mex26_session_id', data.session.id);
        setSession(data.session);
        setCurrentStep(data.step);
        setAppState('welcome');
        setIsTyping(true);

        await delay(700);
        setMessages([{ id: 'w-intro', type: 'bot', text: '', html: INTRO_HTML }]);
        await delay(2400);
        setMessages(prev => [...prev, { id: 'w-gdpr', type: 'bot', text: '', html: GDPR_HTML }]);
        setIsTyping(false);
        setConsentReady(true);

      } catch {
        setAppState('error');
      }
    })();
  }, []);

  function addBotMessage(text: string) {
    setMessages(prev => [...prev, { id: `bot-${Date.now()}`, type: 'bot', text }]);
  }
  function addUserMessage(text: string) {
    setMessages(prev => [...prev, { id: `user-${Date.now()}`, type: 'user', text }]);
  }

  async function handleConsentChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.checked || !currentStep) return;
    setConsentReady(false);
    setIsTyping(true);
    await delay(typingDelay(currentStep.question));
    setIsTyping(false);
    setMessages(prev => [...prev, { id: 'bot-first', type: 'bot', text: currentStep.question }]);
    setAppState('chat');
  }

  async function handleRestartConfirm(confirmed: boolean) {
    setConfirmingRestart(false);
    if (!confirmed) {
      addUserMessage('No, continuar');
      setIsTyping(true);
      await delay(500);
      setIsTyping(false);
      addBotMessage('De acuerdo, continuamos donde lo dejamos 👍');
      return;
    }
    addUserMessage('Sí, empezar de cero');
    setIsTyping(true);
    try {
      const result = await restartSession(session!.id);
      setAnswerHistory([]);
      setCorrectionState('idle');
      setCorrectionStep(null);
      setCorrectionStepId(null);
      setCurrentStep(result.step);
      await delay(700);
      setIsTyping(false);
      addBotMessage('¡De acuerdo! Empezamos de cero 🔄');
      await delay(typingDelay(result.step.question));
      setIsTyping(true);
      await delay(typingDelay(result.step.question));
      setIsTyping(false);
      addBotMessage(result.step.question);
    } catch {
      setIsTyping(false);
      addBotMessage('Algo salió mal. Inténtalo de nuevo.');
    }
  }

  async function enterCorrectionMode() {
    if (answerHistory.length === 0) {
      setIsTyping(true);
      await delay(600);
      setIsTyping(false);
      addBotMessage('No hay respuestas previas que corregir todavía.');
      return;
    }
    const listHtml = answerHistory
      .map((item, i) => {
        const q = item.question.length > 55 ? item.question.slice(0, 52) + '…' : item.question;
        return `<b>${i + 1}.</b> ${q} → <em>${item.displayAnswer}</em>`;
      })
      .join('<br>');
    setIsTyping(true);
    await delay(800);
    setIsTyping(false);
    setMessages(prev => [...prev, {
      id: `bot-correct-${Date.now()}`,
      type: 'bot', text: '',
      html: `¿Qué respuesta quieres corregir?<br><br>${listHtml}<br><br>Escribe el número:`,
    }]);
    setCorrectionState('selecting');
  }

  async function handleAnswer(answer: unknown) {
    if (!session || isSubmitting) return;

    // Correction: selecting a question number
    if (correctionState === 'selecting') {
      const raw = String(answer).trim();
      addUserMessage(raw);
      const num = parseInt(raw, 10);
      if (isNaN(num) || num < 1 || num > answerHistory.length) {
        setIsTyping(true);
        await delay(500);
        setIsTyping(false);
        addBotMessage(`Escribe un número entre 1 y ${answerHistory.length}.`);
        return;
      }
      const item = answerHistory[num - 1];
      setIsTyping(true);
      let step: FlowStep;
      try {
        step = await getFlowStep(item.stepId);
      } catch {
        setIsTyping(false);
        addBotMessage('No pude cargar esa pregunta. Inténtalo de nuevo.');
        return;
      }
      await delay(700);
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: `bot-correct-q-${Date.now()}`,
        type: 'bot', text: '',
        html: `${item.question}<br><br>Tu respuesta actual: <em>${item.displayAnswer}</em><br><br>¿Cuál es la correcta?`,
      }]);
      setCorrectionStep(step);
      setCorrectionStepId(item.stepId);
      setCorrectionState('entering');
      return;
    }

    // Correction: submitting corrected answer
    if (correctionState === 'entering' && correctionStepId && correctionStep) {
      setIsSubmitting(true);
      const displayAnswer = formatAnswerForDisplay(answer, correctionStep);
      if (displayAnswer) addUserMessage(displayAnswer);
      try {
        await correctAnswer(session.id, correctionStepId, answer);
        setAnswerHistory(prev => prev.map(item =>
          item.stepId === correctionStepId ? { ...item, answer, displayAnswer } : item
        ));
        setIsTyping(true);
        await delay(700);
        setIsTyping(false);
        addBotMessage('✓ ¡Actualizado! Continuamos donde lo dejamos.');
        if (currentStep) {
          setIsTyping(true);
          await delay(typingDelay(currentStep.question));
          setIsTyping(false);
          addBotMessage(currentStep.question);
        }
      } catch {
        addBotMessage('Algo salió mal. Inténtalo de nuevo.');
      } finally {
        setIsSubmitting(false);
        setCorrectionState('idle');
        setCorrectionStep(null);
        setCorrectionStepId(null);
      }
      return;
    }

    // Free-form question / /ask command
    if (typeof answer === 'string') {
      const t = answer.trim();
      const isAskCmd = t.toLowerCase().startsWith('/ask ');
      const isQuestion = t.endsWith('?') && !t.startsWith('/');
      if (isAskCmd || isQuestion) {
        const q = isAskCmd ? t.slice(5).trim() : t;
        if (!q) return;
        addUserMessage(t);
        setIsTyping(true);
        try {
          const reply = await chatMessage(q, currentStep?.question, answerHistory.length);
          addBotMessage(reply);
        } catch {
          addBotMessage('No pude conectar con el asistente ahora mismo. Continúa con el formulario.');
        } finally {
          setIsTyping(false);
          setInputKey(k => k + 1);
        }
        return;
      }
    }

    // Slash commands
    if (typeof answer === 'string' && answer.trim().startsWith('/')) {
      const cmd = answer.trim().toLowerCase();
      addUserMessage(answer.trim());
      if (cmd === '/correct') {
        await enterCorrectionMode();
      } else if (cmd === '/restart') {
        setIsTyping(true);
        await delay(600);
        setIsTyping(false);
        addBotMessage('¿Estás seguro de que quieres empezar de cero? Perderás todas tus respuestas.');
        setConfirmingRestart(true);
      } else if (cmd === '/help') {
        setIsTyping(true);
        await delay(500);
        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: `bot-help-${Date.now()}`, type: 'bot', text: '', html:
            `<b>Comandos disponibles:</b><br><br>` +
            `<b>/ask [pregunta]</b> — Pregunta algo sobre Decelera<br>` +
            `<b>/correct</b> — Editar una respuesta anterior<br>` +
            `<b>/restart</b> — Empezar de cero<br>` +
            `<b>/summary</b> — Ver un resumen de tus respuestas<br>` +
            `<b>/help</b> — Mostrar esta ayuda`,
        }]);
      } else if (cmd === '/summary') {
        setIsTyping(true);
        await delay(600);
        setIsTyping(false);
        if (answerHistory.length === 0) {
          addBotMessage('Aún no has respondido ninguna pregunta.');
        } else {
          const html = answerHistory
            .map((item, i) => {
              const q = item.question.length > 55 ? item.question.slice(0, 52) + '…' : item.question;
              return `<b>${i + 1}. ${q}</b><br>${item.displayAnswer}`;
            })
            .join('<br><br>');
          setMessages(prev => [...prev, {
            id: `bot-summary-${Date.now()}`, type: 'bot', text: '', html:
              `<b>Resumen de tus respuestas:</b><br><br>${html}`,
          }]);
        }
      } else {
        setIsTyping(true);
        await delay(500);
        setIsTyping(false);
        addBotMessage('Comando no reconocido. Escribe /help para ver los disponibles.');
      }
      return;
    }

    // Normal answer submission
    if (!currentStep) return;
    setIsSubmitting(true);

    const displayAnswer = formatAnswerForDisplay(answer, currentStep);
    if (displayAnswer) addUserMessage(displayAnswer);

    try {
      const result = await submitAnswer(session.id, currentStep.id, answer);
      setSession(result.session);

      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);

      if (currentStep.type !== 'statement' && answer !== null && answer !== undefined && displayAnswer) {
        setAnswerHistory(prev => [...prev, {
          stepId: currentStep.id,
          question: currentStep.question,
          answer,
          displayAnswer,
        }]);
      }

      if (result.isComplete) {
        setIsTyping(true);
        await delay(typingDelay(result.completionMessage ?? ''));
        setIsTyping(false);
        addBotMessage(result.completionMessage ?? '');
        setAppState(result.isDeclined ? 'declined' : 'complete');
        localStorage.removeItem('decelera_mex26_session_id');
        return;
      }

      if (result.nextStep) {
        setIsTyping(true);
        await delay(typingDelay(result.nextStep.question));
        setIsTyping(false);
        setCurrentStep(result.nextStep);
        addBotMessage(result.nextStep.question);
      }
    } catch {
      addBotMessage('Algo salió mal guardando tu respuesta. Por favor, inténtalo de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAiMessage(text: string) {
    const t = text.trim();
    if (!t) return;
    if (t.startsWith('/') || t.endsWith('?')) return handleAnswer(t);
    if (!session || !currentStep || isSubmitting) return;

    setIsSubmitting(true);
    addUserMessage(t);
    setIsTyping(true);

    try {
      const result = await chatFormAnswer(session.id, t);

      if (!result.isAnswer) {
        await delay(400);
        setIsTyping(false);
        addBotMessage(result.ackMessage);
        return;
      }

      await delay(400);
      setIsTyping(false);
      addBotMessage(result.ackMessage);

      setSession(result.session!);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);

      if (currentStep.type !== 'statement' && result.extractedValue !== null && result.extractedValue !== undefined) {
        const displayAnswer = formatAnswerForDisplay(result.extractedValue, currentStep);
        if (displayAnswer) {
          setAnswerHistory(prev => [...prev, {
            stepId: currentStep.id,
            question: currentStep.question,
            answer: result.extractedValue,
            displayAnswer,
          }]);
        }
      }

      if (result.isComplete) {
        setIsTyping(true);
        await delay(typingDelay(result.completionMessage ?? ''));
        setIsTyping(false);
        addBotMessage(result.completionMessage ?? '');
        setAppState(result.isDeclined ? 'declined' : 'complete');
        localStorage.removeItem('decelera_mex26_session_id');
        return;
      }

      if (result.nextStep) {
        setIsTyping(true);
        await delay(typingDelay(result.nextStep.question));
        setIsTyping(false);
        setCurrentStep(result.nextStep);
        addBotMessage(result.nextStep.question);
      }
    } catch {
      setIsTyping(false);
      addBotMessage('Algo salió mal. Por favor, inténtalo de nuevo.');
    } finally {
      setIsSubmitting(false);
      setInputKey(k => k + 1);
    }
  }

  // ── Render: loading / error ────────────────────────────────────────────────

  if (appState === 'loading') {
    return (
      <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <LoadingDots />
      </div>
    );
  }

  if (appState === 'error') {
    return (
      <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <div style={{ textAlign: 'center', color: 'var(--color-cloud)', fontFamily: 'var(--font-body)' }}>
          <p>No se pudo cargar el formulario.</p>
          <p style={{ fontSize: 13, marginTop: 6 }}>Recarga la página o inténtalo más tarde.</p>
        </div>
      </div>
    );
  }

  const activeStep =
    correctionState === 'entering' && correctionStep ? correctionStep
    : correctionState === 'selecting' ? CORRECTION_SELECT_STEP
    : currentStep;

  // ── Sidebar palette ───────────────────────────────────────────────────────

  const SB = {
    bg:           '#1C2840',
    divider:      'rgba(255,255,255,0.07)',
    textDone:     'rgba(255,255,255,0.32)',
    textPending:  'rgba(255,255,255,0.28)',
    textCurrent:  '#FFFFFF',
    iconDone:     '#4ade80',
    accentBg:     'rgba(255,184,80,0.10)',
    accentBorder: '#FFB950',
    footerText:   'rgba(255,255,255,0.30)',
    linkHover:    'rgba(255,255,255,0.55)',
  } as const;

  const isFinished = appState === 'complete' || appState === 'declined';

  return (
    <div style={{ display: 'flex', height: '100dvh', width: '100%' }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className="app-sidebar"
        style={{
          width: 232, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          background: SB.bg, overflowY: 'auto',
        }}
      >
        {/* Brand header */}
        <div style={{ padding: '22px 18px 16px', flexShrink: 0 }}>
          <img
            src="https://images.squarespace-cdn.com/content/v1/67811e8fe702fd5553c65249/c5500619-9712-4b9b-83ee-a697212735ae/Disen%CC%83o+sin+ti%CC%81tulo+%2840%29.png"
            alt="Decelera"
            style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', display: 'block', border: '2px solid rgba(255,255,255,0.12)' }}
          />
          <div style={{ fontFamily: 'Taviraj, serif', fontWeight: 200, fontSize: 17, color: '#FFFFFF', marginTop: 12, letterSpacing: '0.01em', lineHeight: 1.15 }}>
            Decelera Ventures
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: SB.footerText, marginTop: 3, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            {isFinished ? (appState === 'declined' ? '✗ No encaja ahora' : '✓ Aplicación enviada') : 'LATAM 2026'}
          </div>
        </div>

        <div style={{ height: 1, background: SB.divider, margin: '0 18px 8px', flexShrink: 0 }} />

        {/* Block list */}
        <div style={{ flex: 1, padding: '4px 0 8px' }}>
          {BLOCKS.map((block, idx) => {
            const isDone    = isFinished || idx < currentBlockIndex;
            const isCurrent = !isFinished && idx === currentBlockIndex;
            const answered  = answerHistory.filter(a => STEP_TO_BLOCK[a.stepId] === idx).length;

            return (
              <div
                key={idx}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '9px 14px 9px 16px', marginBottom: 1,
                  borderLeft: `3px solid ${isCurrent ? SB.accentBorder : 'transparent'}`,
                  background: isCurrent ? SB.accentBg : 'transparent',
                  transition: 'background 0.2s',
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                  background: isDone ? SB.iconDone : isCurrent ? SB.accentBorder : 'transparent',
                  border: (isDone || isCurrent) ? 'none' : `1.5px solid rgba(255,255,255,0.2)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isDone ? (
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6l2.5 2.5 4.5-4.5" stroke="#1C2840" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : !isCurrent ? (
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-body)', fontWeight: 500 }}>{idx + 1}</span>
                  ) : null}
                </div>

                <div>
                  <div style={{
                    fontFamily: 'var(--font-body)', fontSize: 13,
                    fontWeight: isCurrent ? 500 : 400,
                    color: isDone ? SB.textDone : isCurrent ? SB.textCurrent : SB.textPending,
                    lineHeight: 1.4,
                  }}>
                    {block.label}
                  </div>
                  {isCurrent && (
                    <div style={{ fontSize: 11, color: 'rgba(255,184,80,0.7)', marginTop: 2 }}>
                      {answered} / {block.count} preguntas
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 18px 20px', borderTop: `1px solid ${SB.divider}`, flexShrink: 0 }}>
          {savedFlash && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#4ade80', fontFamily: 'var(--font-body)', marginBottom: 10, animation: 'fadeSlideIn 0.2s ease-out' }}>
              ✓ Guardado
            </div>
          )}
          <div style={{ fontSize: 11, color: SB.footerText, fontFamily: 'var(--font-body)', marginBottom: 12 }}>
            {answerHistory.length} / {TOTAL_STEPS} preguntas respondidas
          </div>

          <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{
              height: '100%',
              width: `${Math.round((answerHistory.length / TOTAL_STEPS) * 100)}%`,
              background: 'linear-gradient(90deg, #FFB950, #FF8C42)',
              borderRadius: 2, transition: 'width 0.4s ease',
            }} />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <a href="https://www.deceleraamericas.ventures" target="_blank" rel="noopener noreferrer"
              style={{ color: SB.footerText, display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = SB.linkHover)}
              onMouseLeave={e => (e.currentTarget.style.color = SB.footerText)}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </a>
            <a href="https://www.linkedin.com/company/decelera/posts/?feedView=all" target="_blank" rel="noopener noreferrer"
              style={{ color: SB.footerText, display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = SB.linkHover)}
              onMouseLeave={e => (e.currentTarget.style.color = SB.footerText)}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </a>
          </div>
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#FAFAF9' }}>

        {/* Mobile top bar */}
        <div
          className="mobile-block-bar"
          style={{
            display: 'none', alignItems: 'center', gap: 10,
            padding: '10px 16px', borderBottom: '1px solid rgba(28,40,64,0.1)',
            background: SB.bg, flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {BLOCKS.map((_, idx) => {
              const isDone    = isFinished || idx < currentBlockIndex;
              const isCurrent = !isFinished && idx === currentBlockIndex;
              return (
                <div key={idx} style={{
                  width: isCurrent ? 22 : 7, height: 7, borderRadius: 4,
                  background: isDone ? '#4ade80' : isCurrent ? '#FFB950' : 'rgba(255,255,255,0.2)',
                  transition: 'width 0.3s',
                }} />
              );
            })}
          </div>
          {currentBlockIndex >= 0 && currentBlockIndex < BLOCKS.length && (
            <span style={{ fontSize: 13, fontFamily: 'var(--font-body)', fontWeight: 500, color: '#fff' }}>
              {BLOCKS[currentBlockIndex].label}
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-body)' }}>
            {answerHistory.length}/{TOTAL_STEPS}
          </span>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 0 16px' }}>
          <div style={{ maxWidth: 860, margin: '0 auto', padding: 'var(--chat-padding)', display: 'flex', gap: 'var(--chat-gap)', alignItems: 'flex-start' }}>

            <div className="mascot-col" style={{ flexShrink: 0, position: 'sticky', bottom: '24px', alignSelf: 'flex-end' }}>
              <Mascot size={96} animating={isTyping} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              {messages.map((msg, i) => {
                const isLast = i === messages.length - 1;
                const prevMsg = messages[i - 1];
                const showDivider = msg.type === 'bot' && prevMsg?.type === 'bot';
                return (
                <React.Fragment key={msg.id}>
                  {showDivider && (
                    <div style={{ height: 1, background: 'rgba(45,56,82,0.08)', margin: '-12px 0 16px' }} />
                  )}
                  {msg.html ? (
                  <ChatBubble type={msg.type} isNew={isLast}>
                    <div dangerouslySetInnerHTML={{ __html: msg.html }} />
                    {consentReady && isLast && (
                      <label style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        cursor: 'pointer', marginTop: 18, fontFamily: 'var(--font-body)',
                        fontSize: 13, color: '#8896AE', lineHeight: 1.55,
                      }}>
                        <input
                          type="checkbox"
                          onChange={handleConsentChange}
                          style={{ flexShrink: 0, accentColor: 'var(--color-sea)', width: 16, height: 16, marginTop: 2 }}
                        />
                        He leído y acepto los términos de protección de datos.
                      </label>
                    )}
                  </ChatBubble>
                  ) : (
                    <ChatBubble message={msg.text} type={msg.type} isNew={isLast} />
                  )}
                </React.Fragment>
                );
              })}
              {isTyping && <TypingIndicator />}
              <div ref={bottomRef} />
            </div>
          </div>
        </div>

        {/* Input area */}
        {appState === 'chat' && (
          <div style={{
            borderTop: '1px solid rgba(28,40,64,0.09)',
            background: '#FFFFFF', padding: '12px 0 16px', flexShrink: 0,
          }}>
            <div style={{ maxWidth: 860, margin: '0 auto', padding: 'var(--input-padding)' }}>
              {confirmingRestart ? (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => handleRestartConfirm(true)}
                    style={{ flex: 1, padding: '12px 0', borderRadius: 999, fontSize: 15, fontFamily: 'var(--font-body)', cursor: 'pointer', border: 'none', background: SB.bg, color: '#fff', fontWeight: 500 }}
                  >
                    Sí, empezar de cero
                  </button>
                  <button
                    onClick={() => handleRestartConfirm(false)}
                    style={{ flex: 1, padding: '12px 0', borderRadius: 999, fontSize: 15, fontFamily: 'var(--font-body)', cursor: 'pointer', border: '1.5px solid rgba(28,40,64,0.12)', background: '#fff', color: '#1a2133' }}
                  >
                    No, continuar
                  </button>
                </div>
              ) : activeStep ? (
                <>
                  {aiMode
                    ? <AiInput key={inputKey} onSubmit={handleAiMessage} disabled={isSubmitting || isTyping} />
                    : <StepInput key={inputKey} step={activeStep} onSubmit={handleAnswer} disabled={isSubmitting || isTyping} />
                  }
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                    <p style={{ margin: 0, fontSize: 11, color: '#B0BCCF', fontFamily: 'var(--font-body)' }}>
                      {aiMode
                        ? 'Modo IA — escribe con tus propias palabras'
                        : <>Escribe <code style={{ fontFamily: 'monospace', fontSize: 11 }}>/</code> para ver los comandos</>
                      }
                    </p>
                    <button
                      onClick={() => setAiMode(m => !m)}
                      style={{
                        padding: '3px 10px', borderRadius: 999,
                        border: `1.5px solid ${aiMode ? '#1C2840' : 'rgba(28,40,64,0.18)'}`,
                        background: aiMode ? '#1C2840' : 'transparent',
                        color: aiMode ? '#fff' : '#8896AE',
                        fontSize: 11, fontFamily: 'var(--font-body)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s',
                      }}
                    >
                      ✦ IA
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}

        {appState === 'complete' && (
          <>
            <Confetti />
            <div style={{ padding: '20px 0 32px', textAlign: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: 'Taviraj, serif', fontWeight: 200, fontSize: 18, color: '#8896AE', letterSpacing: '0.04em' }}>
                Breathe. Focus. Grow.
              </span>
              <div style={{
                margin: '24px auto 0', maxWidth: 640, borderRadius: 16,
                overflow: 'hidden', aspectRatio: '16/9',
                boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
              }}>
                <iframe
                  src="https://www.youtube.com/embed/Zkg_Av73SZ8"
                  title="Decelera LATAM 2026"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                />
              </div>
            </div>
          </>
        )}

        {appState === 'declined' && (
          <div style={{ padding: '20px 0 32px', textAlign: 'center', flexShrink: 0 }}>
            <span style={{ fontFamily: 'Taviraj, serif', fontWeight: 200, fontSize: 18, color: '#8896AE', letterSpacing: '0.04em' }}>
              Gracias por tu tiempo.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function LoadingDots() {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{
          width: 8, height: 8, borderRadius: '50%',
          background: 'var(--color-cloud)', display: 'inline-block',
          animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
    </div>
  );
}

function AiInput({ onSubmit, disabled }: { onSubmit: (text: string) => void; disabled: boolean }) {
  const [text, setText] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    if (!text.trim() || disabled) return;
    onSubmit(text.trim());
    setText('');
    if (taRef.current) taRef.current.style.height = 'auto';
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
      <textarea
        ref={taRef}
        value={text}
        onChange={onChange}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder="Escribe tu respuesta libremente…"
        rows={1}
        style={{
          flex: 1, padding: '12px 16px', borderRadius: 14,
          border: '1.5px solid rgba(28,40,64,0.15)',
          fontFamily: 'var(--font-body)', fontSize: 'var(--chat-font)',
          resize: 'none', outline: 'none', background: '#fff',
          color: '#1a2133', lineHeight: 1.5, overflow: 'hidden',
        }}
      />
      <button
        onClick={submit}
        disabled={disabled || !text.trim()}
        style={{
          width: 44, height: 44, borderRadius: '50%',
          border: 'none', background: '#1C2840', color: '#fff',
          cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/>
        </svg>
      </button>
    </div>
  );
}

function formatAnswerForDisplay(answer: unknown, step: FlowStep): string {
  if (answer === null || answer === undefined) return '';
  if (Array.isArray(answer)) return answer.join(', ');
  if (typeof answer === 'boolean') return answer ? 'Sí' : 'No';
  return String(answer);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function typingDelay(text: string) {
  return Math.min((text.length / 580) * 1000, 2500);
}
