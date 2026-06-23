import React, { useState, useEffect, useRef } from 'react';
import { createSession, loadSession, saveDraft, submitApplication } from './hooks/useApi';
import { Confetti } from './components/Confetti';

// ── Types ────────────────────────────────────────────────────────────────────

type FieldType = 'text' | 'email' | 'url' | 'number' | 'textarea' | 'select' | 'multiselect' | 'boolean';

interface FieldDef {
  id: string;
  label: string;
  hint?: string;
  type: FieldType;
  required: boolean;
  options?: string[];
  placeholder?: string;
  maxLength?: number;
  condition?: { field: string; value: unknown };
}

interface BlockDef {
  id: string;
  label: string;
  description: string;
  fields: FieldDef[];
}

type AppState = 'loading' | 'form' | 'complete' | 'declined' | 'error';

// ── Form definition ──────────────────────────────────────────────────────────

const BLOCKS: BlockDef[] = [
  {
    id: 'identity',
    label: 'Identidad',
    description: 'Primero lo básico — quién eres y qué estás construyendo.',
    fields: [
      { id: 'startup_name',      label: '¿Cómo se llama tu startup?', type: 'text',  required: true,  placeholder: 'Nombre de tu startup' },
      { id: 'founder_full_name', label: 'Tu nombre completo',          type: 'text',  required: true,  placeholder: 'Nombre y apellidos' },
      { id: 'founder_email',     label: 'Email profesional', hint: 'Por aquí te contactaremos si avanzas en el proceso.', type: 'email', required: true, placeholder: 'tu@startup.com' },
    ],
  },
  {
    id: 'company',
    label: 'La empresa',
    description: 'El producto, el mercado, y el insight que lo fundamenta.',
    fields: [
      { id: 'problem',          label: '¿Qué problema central estás resolviendo?', hint: 'Máximo tres líneas.', type: 'textarea', required: true, maxLength: 500 },
      { id: 'demo_url',         label: 'URL que mejor muestra lo que estás construyendo', hint: 'Demo, producto, MVP o landing.', type: 'url', required: false, placeholder: 'https://' },
      { id: 'industry_insight', label: 'Algo sobre tu industria que los grandes incumbentes no entienden ni ignoran', hint: '1–2 frases. Tu insight más potente como founder.', type: 'textarea', required: true, maxLength: 400 },
      {
        id: 'defensibility', required: true,
        label: 'Un competidor levanta €100M mañana para matarte. ¿Qué es lo único que no puede comprar ni copiar en 12 meses?',
        type: 'select',
        options: [
          'Data moat — datos propios/exclusivos/longitudinales que mejoran con el uso',
          'Network effects — efectos de red',
          'Deep integration / switching costs elevados',
          'Ventaja técnica difícil de replicar',
          'Regulación / licencias',
          'Brand / GTM',
          'Ninguno claramente todavía',
        ],
      },
      {
        id: 'third_party_dependence', required: true,
        label: '¿Qué tan dependiente es tu valor core de APIs de terceros (OpenAI, AWS, etc.)?',
        type: 'select',
        options: [
          'Independiente — los usamos para tareas no-core, el core es nuestro',
          'Híbrido — mejoramos modelos de terceros con nuestros datos / fine-tuning',
          'Dependiente — somos una capa superior / UX sobre APIs existentes',
        ],
      },
      { id: 'sector',           required: true, label: 'Sector',            type: 'select', options: ['AI/ML', 'FinTech', 'HealthTech', 'EdTech', 'Climate', 'Cybersec', 'SaaS B2B', 'Deep Tech', 'Consumer', 'Otro'] },
      { id: 'business_model',   required: true, label: 'Modelo de negocio', type: 'select', options: ['B2B', 'B2C', 'B2B2C', 'Marketplace', 'SaaS', 'Otro'] },
      { id: 'potential_clients', required: true, label: '¿Aproximadamente cuántos clientes potenciales hay en tu mercado objetivo?', type: 'number', placeholder: 'ej. 50000' },
      {
        id: 'why_now_select', required: true,
        label: '¿Por qué es posible este negocio ahora?',
        hint: '¿Qué tailwind externo está acelerando más tu mercado?',
        type: 'select',
        options: [
          'Nuevo compliance regulatorio obligatorio — compradores legalmente forzados a adoptar',
          'Desequilibrio extremo oferta/demanda',
          'GenAI / automatización a gran escala — reducción de costes 10x o nueva capacidad',
          'Platform shift (ej. on-prem → cloud)',
          'Ninguno / crecimiento general',
        ],
      },
      { id: 'why_now_validation', required: true, label: 'Explícalo en un par de líneas', hint: 'Si puedes citar la ley, tecnología o dato de mercado que lo valida, mejor.', type: 'textarea', maxLength: 400 },
    ],
  },
  {
    id: 'founders',
    label: 'Los founders',
    description: '¿Quién hay detrás? Este bloque vale 35 puntos de la evaluación.',
    fields: [
      { id: 'technical_cofounder',       required: true, label: '¿Hay un co-founder técnico full-time en el equipo?', type: 'boolean' },
      { id: 'number_of_founders',        required: true, label: '¿Cuántos founders full-time hay?',                   type: 'select', options: ['1', '2', '3', '4', '4+'] },
      { id: 'founder_linkedin',          required: false, label: 'LinkedIn del equipo fundador', hint: 'El tuyo y el de los co-founders. Siempre lo miramos.', type: 'url', placeholder: 'https://linkedin.com/in/...' },
      {
        id: 'team_milestone', required: true,
        label: '¿Cuál es el milestone colectivo más relevante del equipo?',
        type: 'select',
        options: [
          'Serial founder, exit >€10M',
          'Serial founder, exit <€10M',
          'Serial founder, sin exit',
          'Early employee (<20) en un unicornio / scale-up',
          'PhD o investigador senior en el área',
          'Senior corporativo, 10+ años en el sector',
          'Founder por primera vez',
        ],
      },
      { id: 'team_milestone_detail', required: true, label: 'Cuéntanos más sobre ese milestone', hint: '¿Founder por primera vez? Lo más impresionante que hayas construido, hackeado u organizado en los últimos 3 años sin presupuesto.', type: 'textarea', maxLength: 600 },
      { id: 'sector_experience',     required: true, label: '¿Cuántos años de experiencia acumulada tiene el equipo en este sector?', type: 'select', options: ['0–2 años', '2–5 años', '6–12 años', '12+ años'] },
      {
        id: 'most_significant_milestone', required: true,
        label: 'Desde el lanzamiento, ¿cuál es el milestone más significativo que habéis logrado?',
        type: 'select',
        options: [
          'MVP construido y lanzado sin funding externo ni devs de terceros',
          'Convencimos a un senior Tier-1 de dejar su trabajo por salario mínimo',
          '3+ LOIs o pilotos firmados antes de tener producto terminado',
          '€5k+ MRR (o uso equivalente) en las primeras 12 semanas del lanzamiento',
          'Ninguno todavía',
        ],
      },
    ],
  },
  {
    id: 'traction',
    label: 'Tracción',
    description: 'Números, no narrativa. 30 puntos en juego.',
    fields: [
      { id: 'north_star',          required: true, label: 'North Star metric y su valor actual', hint: 'ej. €18k MRR, 45k MAUs, 1.2k DAUs', type: 'text', placeholder: 'ej. €18k MRR' },
      { id: 'mom_growth',          required: true, label: 'Crecimiento MoM promedio (últimos 3 meses)',  type: 'select', options: ['>20%', '10–20%', '5–10%', '<5% o N/A — construyendo / pivotando'] },
      { id: 'net_burn',            required: true, label: 'Net burn mensual promedio (últimos 3 meses)', type: 'select', options: ['<€10k', '€10–25k', '€25–50k', '€50–100k', '>€100k'] },
      { id: 'churn',               required: true, label: 'Churn mensual promedio (últimos 3 meses)',    type: 'select', options: ['<2%', '2–5%', '5–10%', '>10%'] },
      { id: 'acquisition_channel', required: true, label: '¿Cómo estáis adquiriendo clientes?',         type: 'select', options: ['>80% orgánico (word-of-mouth / SEO / loops)', '50–80% orgánico, el resto paid', '<50% orgánico — heavy ads / sales'] },
    ],
  },
  {
    id: 'equity',
    label: 'Equity & ronda',
    description: 'Estructura legal y estado del fundraising.',
    fields: [
      { id: 'incorporation_location', required: true,  label: '¿Dónde está constituida tu empresa?',                            type: 'select',      options: ['España', 'Portugal', 'Francia', 'Italia', 'UK', 'UE', 'LATAM', 'Brasil', 'Otro'] },
      { id: 'operations_location',    required: true,  label: '¿Dónde opera la empresa?', hint: 'Selecciona todos los que apliquen.', type: 'multiselect', options: ['México', 'Colombia', 'Chile', 'Argentina', 'Perú', 'Uruguay', 'Centroamérica & Caribe', 'USA', 'Brasil', 'Otro LATAM', 'Europa'] },
      { id: 'company_start_year',     required: true,  label: '¿En qué año empezó a operar la empresa?',                        type: 'number',      placeholder: 'ej. 2024' },
      { id: 'founding_equity',        required: true,  label: '¿Qué % del equity está en manos del equipo fundador (incluyendo option pool)?', type: 'select', options: ['>80%', '60–80%', '40–60%', '<40%'] },
      { id: 'total_raised',           required: true,  label: '¿Cuánto habéis levantado hasta la fecha, excluyendo la ronda actual?', hint: 'Equity, notas, SAFEs.', type: 'select', options: ['<€500k', '€500k–1.5M', '€1.5M–2.5M', '>€2.5M'] },
      { id: 'round_size',             required: true,  label: 'Tamaño total de la ronda actual (€)',                             type: 'number',      placeholder: 'ej. 1000000' },
      { id: 'round_committed',        required: true,  label: '¿Cuánto de la ronda está comprometido?',                         type: 'select',      options: ['0–25%', '25–50%', '50–75%', '75%+'] },
      { id: 'pre_money_valuation',    required: true,  label: 'Valoración pre-money o cap (€)',                                  type: 'number',      placeholder: 'ej. 5000000' },
      { id: 'runway',                 required: true,  label: 'Runway actual',                                                   type: 'select',      options: ['0–2 meses', '2–5 meses', '6–12 meses', '12+ meses'] },
      { id: 'pitch_deck_url',         required: false, label: 'Link al pitch deck', hint: 'Google Drive, Dropbox, Docsend o similar (PDF).', type: 'url', placeholder: 'https://...' },
    ],
  },
  {
    id: 'wrap',
    label: 'Cierre',
    description: 'Casi terminamos. Solo un minuto más.',
    fields: [
      { id: 'how_heard',            required: true,  label: '¿Cómo nos encontraste?',                    type: 'select', options: ['LinkedIn', 'Referral', 'Evento', 'Prensa', 'Otro'] },
      { id: 'referral_name',        required: true,  label: '¿Quién te refirió?',                        type: 'text',   placeholder: 'Nombre de quien te recomendó', condition: { field: 'how_heard', value: 'Referral' } },
      { id: 'network_contact',      required: true,  label: '¿Conoces a alguien de la red de Decelera?', hint: 'Mentor, founder del portfolio o LP.', type: 'boolean' },
      { id: 'network_contact_name', required: true,  label: '¿Quién es y cuál es vuestra relación?',     type: 'text',   placeholder: 'ej. María García — mentor del portfolio', condition: { field: 'network_contact', value: true } },
      { id: 'additional_comments',  required: false, label: '¿Algo más que quieras compartir?',          hint: 'Opcional.', type: 'textarea', maxLength: 800 },
    ],
  },
];

// ── Brand palette ─────────────────────────────────────────────────────────────

const C = {
  navy:        '#1C2840',
  gold:        '#FFB950',
  water:       '#1FD0EF',
  night:       '#2D3852',
  cloud:       '#B9C1D4',
  bg:          '#FAFAF9',
  white:       '#FFFFFF',
  error:       '#e53e3e',
  green:       '#4ade80',
  sbDivider:   'rgba(255,255,255,0.08)',
  sbMuted:     'rgba(255,255,255,0.32)',
  sbPending:   'rgba(255,255,255,0.22)',
  sbFoot:      'rgba(255,255,255,0.28)',
  inputBorder: 'rgba(45,56,82,0.18)',
};

// ── Validation ────────────────────────────────────────────────────────────────

function validateBlock(block: BlockDef, answers: Record<string, unknown>): Record<string, string> {
  const errs: Record<string, string> = {};
  for (const f of block.fields) {
    if (f.condition) {
      if (answers[f.condition.field] !== f.condition.value) continue;
    }
    if (!f.required) continue;
    const v = answers[f.id];
    if (v === undefined || v === null || v === '') errs[f.id] = 'Este campo es obligatorio.';
    else if (Array.isArray(v) && v.length === 0)  errs[f.id] = 'Selecciona al menos una opción.';
  }
  return errs;
}

// ── Field components ──────────────────────────────────────────────────────────

interface FieldInputProps {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
}

function FieldWrapper({ field, error, children }: { field: FieldDef; error?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <label style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500, color: C.night, lineHeight: 1.45 }}>
        {field.label}
        {field.required && <span style={{ color: C.gold, marginLeft: 4 }}>*</span>}
      </label>
      {field.hint && <p style={{ margin: 0, fontSize: 13, color: C.cloud, fontFamily: 'var(--font-body)', lineHeight: 1.55 }}>{field.hint}</p>}
      {children}
      {error && <p style={{ margin: 0, fontSize: 12, color: C.error, fontFamily: 'var(--font-body)' }}>{error}</p>}
    </div>
  );
}

function baseInput(hasError: boolean, focused: boolean): React.CSSProperties {
  return {
    width: '100%', boxSizing: 'border-box', padding: '11px 14px',
    fontFamily: 'var(--font-body)', fontSize: 15, color: C.night, background: C.white,
    border: `1.5px solid ${hasError ? C.error : focused ? C.navy : C.inputBorder}`,
    borderRadius: 10, outline: 'none', transition: 'border-color 0.15s',
  };
}

function TextField({ field, value, onChange, error }: FieldInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <FieldWrapper field={field} error={error}>
      <input
        type={field.type as 'text' | 'email' | 'url'}
        value={(value as string) ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={field.placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={baseInput(!!error, focused)}
      />
    </FieldWrapper>
  );
}

function NumberField({ field, value, onChange, error }: FieldInputProps) {
  const [focused, setFocused] = useState(false);
  const raw = value !== undefined && value !== null ? String(value) : '';
  return (
    <FieldWrapper field={field} error={error}>
      <input
        type="text" inputMode="numeric"
        value={raw}
        onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); onChange(v === '' ? '' : Number(v)); }}
        placeholder={field.placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={baseInput(!!error, focused)}
      />
    </FieldWrapper>
  );
}

function TextareaField({ field, value, onChange, error }: FieldInputProps) {
  const [focused, setFocused] = useState(false);
  const text = (value as string) ?? '';
  const ref  = useRef<HTMLTextAreaElement>(null);
  function resize() {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.max(100, ta.scrollHeight) + 'px';
  }
  return (
    <FieldWrapper field={field} error={error}>
      <textarea
        ref={ref} value={text}
        onChange={e => { onChange(e.target.value); setTimeout(resize, 0); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        rows={4} maxLength={field.maxLength}
        style={{ ...baseInput(!!error, focused), resize: 'vertical', minHeight: 100, lineHeight: 1.65 }}
      />
      {field.maxLength && (
        <p style={{ margin: 0, textAlign: 'right', fontSize: 12, fontFamily: 'var(--font-body)', color: text.length > field.maxLength * 0.9 ? C.gold : C.cloud }}>
          {text.length} / {field.maxLength}
        </p>
      )}
    </FieldWrapper>
  );
}

function SelectField({ field, value, onChange, error }: FieldInputProps) {
  const selected = value as string | undefined;
  return (
    <FieldWrapper field={field} error={error}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {field.options!.map(opt => {
          const on = selected === opt;
          return (
            <button key={opt} type="button" onClick={() => onChange(on ? '' : opt)}
              style={{
                textAlign: 'left', padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.5,
                border: `1.5px solid ${on ? C.navy : C.inputBorder}`,
                background: on ? C.navy : C.white, color: on ? C.white : C.night,
                transition: 'all 0.12s',
              }}
              onMouseEnter={e => { if (!on) (e.currentTarget as HTMLButtonElement).style.borderColor = C.water; }}
              onMouseLeave={e => { if (!on) (e.currentTarget as HTMLButtonElement).style.borderColor = C.inputBorder; }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </FieldWrapper>
  );
}

function MultiSelectField({ field, value, onChange, error }: FieldInputProps) {
  const sel: string[] = (value as string[]) ?? [];
  function toggle(opt: string) {
    onChange(sel.includes(opt) ? sel.filter(s => s !== opt) : [...sel, opt]);
  }
  return (
    <FieldWrapper field={field} error={error}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {field.options!.map(opt => {
          const on = sel.includes(opt);
          return (
            <button key={opt} type="button" onClick={() => toggle(opt)}
              style={{
                padding: '8px 16px', borderRadius: 999, cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: 13,
                border: `1.5px solid ${on ? C.navy : C.inputBorder}`,
                background: on ? C.navy : C.white, color: on ? C.white : C.night,
                transition: 'all 0.12s',
              }}
            >
              {on && <span style={{ marginRight: 5 }}>✓</span>}{opt}
            </button>
          );
        })}
      </div>
    </FieldWrapper>
  );
}

function BooleanField({ field, value, onChange, error }: FieldInputProps) {
  const val = value as boolean | undefined;
  return (
    <FieldWrapper field={field} error={error}>
      <div style={{ display: 'flex', gap: 10 }}>
        {([true, false] as const).map(opt => {
          const on = val === opt;
          return (
            <button key={String(opt)} type="button" onClick={() => onChange(opt)}
              style={{
                flex: 1, padding: '14px 0', borderRadius: 12, cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500,
                border: `1.5px solid ${on ? C.navy : C.inputBorder}`,
                background: on ? C.navy : C.white, color: on ? C.white : C.night,
                transition: 'all 0.12s',
              }}
            >
              {opt ? 'Sí' : 'No'}
            </button>
          );
        })}
      </div>
    </FieldWrapper>
  );
}

function FieldInput(props: FieldInputProps) {
  switch (props.field.type) {
    case 'textarea':    return <TextareaField    {...props} />;
    case 'select':      return <SelectField      {...props} />;
    case 'multiselect': return <MultiSelectField {...props} />;
    case 'boolean':     return <BooleanField     {...props} />;
    case 'number':      return <NumberField      {...props} />;
    default:            return <TextField        {...props} />;
  }
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ currentBlock, visitedBlocks, onNavigate, answers, isFinished, isDeclined }: {
  currentBlock: number;
  visitedBlocks: Set<number>;
  onNavigate: (idx: number) => void;
  answers: Record<string, unknown>;
  isFinished: boolean;
  isDeclined: boolean;
}) {
  const allRequired = BLOCKS.flatMap(b => b.fields).filter(f => f.required);
  const answered = allRequired.filter(f => {
    if (f.condition && answers[f.condition.field] !== f.condition.value) return false;
    const v = answers[f.id];
    return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
  }).length;
  const pct = Math.round((answered / allRequired.length) * 100);

  return (
    <aside style={{ width: 244, flexShrink: 0, display: 'flex', flexDirection: 'column', background: C.navy, overflowY: 'auto' }}>
      <div style={{ padding: '24px 20px 18px', flexShrink: 0 }}>
        <img
          src="https://images.squarespace-cdn.com/content/v1/67811e8fe702fd5553c65249/c5500619-9712-4b9b-83ee-a697212735ae/Disen%CC%83o+sin+ti%CC%81tulo+%2840%29.png"
          alt="Decelera"
          style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.12)' }}
        />
        <div style={{ fontFamily: 'Taviraj, serif', fontWeight: 200, fontSize: 17, color: '#fff', marginTop: 14, letterSpacing: '0.01em', lineHeight: 1.15 }}>
          Decelera Ventures
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: C.sbFoot, marginTop: 3, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {isFinished ? (isDeclined ? '✗ No encaja ahora' : '✓ Enviada') : 'LATAM 2026'}
        </div>
      </div>

      <div style={{ height: 1, background: C.sbDivider, margin: '0 20px 6px', flexShrink: 0 }} />

      <nav style={{ flex: 1, padding: '4px 0 8px' }}>
        {BLOCKS.map((block, idx) => {
          const isDone    = isFinished || (visitedBlocks.has(idx) && idx < currentBlock);
          const isCurrent = !isFinished && idx === currentBlock;
          const canClick  = isFinished || visitedBlocks.has(idx);
          return (
            <button
              key={block.id} type="button" disabled={!canClick}
              onClick={() => canClick && onNavigate(idx)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', padding: '10px 18px',
                background: isCurrent ? 'rgba(255,184,80,0.10)' : 'transparent',
                borderLeft: `3px solid ${isCurrent ? C.gold : 'transparent'}`,
                border: isCurrent ? `0 0 0 3px ${C.gold}` : 'none',
                borderLeftWidth: '3px',
                borderLeftStyle: 'solid',
                borderLeftColor: isCurrent ? C.gold : 'transparent',
                borderTop: 'none', borderRight: 'none', borderBottom: 'none',
                cursor: canClick ? 'pointer' : 'default',
                textAlign: 'left', transition: 'background 0.15s',
              }}
            >
              <div style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isDone ? C.green : isCurrent ? C.gold : 'transparent',
                border: (isDone || isCurrent) ? 'none' : '1.5px solid rgba(255,255,255,0.2)',
              }}>
                {isDone
                  ? <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-4.5" stroke="#1C2840" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  : <span style={{ fontSize: 10, color: isCurrent ? C.navy : 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>{idx + 1}</span>
                }
              </div>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: isCurrent ? 500 : 400, color: isDone ? C.sbMuted : isCurrent ? '#fff' : C.sbPending, lineHeight: 1.4 }}>
                {block.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div style={{ padding: '14px 20px 22px', borderTop: `1px solid ${C.sbDivider}`, flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: C.sbFoot, fontFamily: 'var(--font-body)', marginBottom: 10 }}>
          {answered} / {allRequired.length} campos completados
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${C.gold}, #FF8C42)`, borderRadius: 2, transition: 'width 0.4s ease' }} />
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <a href="https://www.deceleraamericas.ventures" target="_blank" rel="noopener noreferrer"
            style={{ color: C.sbFoot, display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
            onMouseLeave={e => (e.currentTarget.style.color = C.sbFoot)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </a>
          <a href="https://www.linkedin.com/company/decelera/" target="_blank" rel="noopener noreferrer"
            style={{ color: C.sbFoot, display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
            onMouseLeave={e => (e.currentTarget.style.color = C.sbFoot)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          </a>
        </div>
      </div>
    </aside>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [appState, setAppState]           = useState<AppState>('loading');
  const [sessionId, setSessionId]         = useState<string | null>(null);
  const [currentBlock, setCurrentBlock]   = useState(0);
  const [visitedBlocks, setVisitedBlocks] = useState<Set<number>>(new Set([0]));
  const [answers, setAnswers]             = useState<Record<string, unknown>>({});
  const [errors, setErrors]               = useState<Record<string, string>>({});
  const [submitting, setSubmitting]       = useState(false);
  const [resultMsg, setResultMsg]         = useState('');
  const scrollRef                         = useRef<HTMLDivElement>(null);
  const initRan                           = useRef(false);

  const isLast     = currentBlock === BLOCKS.length - 1;
  const isFinished = appState === 'complete' || appState === 'declined';
  const block      = BLOCKS[currentBlock];

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    (async () => {
      try {
        const savedId = localStorage.getItem('decelera_mex26_session_id');
        if (savedId) {
          const data = await loadSession(savedId);
          if (data) {
            if (data.session.status === 'completed') { setAppState('complete'); return; }
            setSessionId(savedId);
            setAnswers(data.answers ?? {});
            const idx = BLOCKS.findIndex(b => b.id === data.currentBlock);
            if (idx >= 0) {
              setCurrentBlock(idx);
              const v = new Set<number>();
              for (let i = 0; i <= idx; i++) v.add(i);
              setVisitedBlocks(v);
            }
            setAppState('form');
            return;
          }
        }
        const data = await createSession();
        localStorage.setItem('decelera_mex26_session_id', data.session.id);
        setSessionId(data.session.id);
        setAppState('form');
      } catch {
        setAppState('error');
      }
    })();
  }, []);

  useEffect(() => {
    if (appState !== 'form') return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [appState]);

  function setAnswer(id: string, v: unknown) {
    setAnswers(prev => ({ ...prev, [id]: v }));
    if (errors[id]) setErrors(prev => { const n = { ...prev }; delete n[id]; return n; });
  }

  function scrollTop() { scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }

  async function navigateTo(idx: number) {
    if (idx === currentBlock) return;
    if (sessionId) saveDraft(sessionId, answers, BLOCKS[currentBlock].id).catch(() => {});
    setErrors({});
    setCurrentBlock(idx);
    setVisitedBlocks(prev => new Set([...prev, idx]));
    scrollTop();
  }

  async function handleNext() {
    const errs = validateBlock(block, answers);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const firstId = Object.keys(errs)[0];
      document.getElementById(`field-${firstId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setErrors({});
    const next = currentBlock + 1;
    if (sessionId) saveDraft(sessionId, answers, BLOCKS[next]?.id ?? block.id).catch(() => {});
    setCurrentBlock(next);
    setVisitedBlocks(prev => new Set([...prev, next]));
    scrollTop();
  }

  function handlePrev() {
    setErrors({});
    setCurrentBlock(prev => prev - 1);
    scrollTop();
  }

  async function handleSubmit() {
    const errs = validateBlock(block, answers);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const firstId = Object.keys(errs)[0];
      document.getElementById(`field-${firstId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!sessionId) return;
    setSubmitting(true);
    try {
      const result = await submitApplication(sessionId, answers);
      setResultMsg(result.message);
      localStorage.removeItem('decelera_mex26_session_id');
      setAppState(result.isDeclined ? 'declined' : 'complete');
    } catch {
      setErrors({ __form: 'Algo salió mal al enviar. Inténtalo de nuevo.' });
    } finally {
      setSubmitting(false);
    }
  }

  // Loading
  if (appState === 'loading') {
    return (
      <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ display: 'flex', gap: 7 }}>
          {[0, 1, 2].map(i => (
            <span key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: C.cloud, display: 'inline-block', animation: `bounce 1.2s ${i * 0.2}s ease-in-out infinite` }} />
          ))}
        </div>
      </div>
    );
  }

  // Error
  if (appState === 'error') {
    return (
      <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', color: C.cloud }}>
          <p style={{ fontSize: 16, margin: '0 0 8px' }}>No se pudo cargar el formulario.</p>
          <p style={{ fontSize: 13, margin: 0 }}>Recarga la página o inténtalo más tarde.</p>
        </div>
      </div>
    );
  }

  // Complete
  if (appState === 'complete') {
    return (
      <div style={{ display: 'flex', height: '100dvh' }}>
        <Confetti />
        <Sidebar currentBlock={BLOCKS.length} visitedBlocks={new Set(BLOCKS.map((_, i) => i))} onNavigate={() => {}} answers={answers} isFinished isDeclined={false} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: C.bg, padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 20 }}>🎉</div>
          <h1 style={{ fontFamily: 'Taviraj, serif', fontWeight: 200, fontSize: 32, color: C.navy, margin: '0 0 16px', letterSpacing: '-0.01em' }}>
            ¡Aplicación enviada!
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: '#6B7A99', maxWidth: 520, lineHeight: 1.75, margin: '0 0 36px' }}>
            {resultMsg}
          </p>
          <p style={{ fontFamily: 'Taviraj, serif', fontWeight: 200, fontSize: 18, color: C.cloud, letterSpacing: '0.04em', margin: 0 }}>
            Breathe. Focus. Grow.
          </p>
        </div>
      </div>
    );
  }

  // Declined
  if (appState === 'declined') {
    return (
      <div style={{ display: 'flex', height: '100dvh' }}>
        <Sidebar currentBlock={BLOCKS.length} visitedBlocks={new Set(BLOCKS.map((_, i) => i))} onNavigate={() => {}} answers={answers} isFinished isDeclined />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: C.bg, padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>🙏</div>
          <h1 style={{ fontFamily: 'Taviraj, serif', fontWeight: 200, fontSize: 30, color: C.navy, margin: '0 0 16px' }}>
            Gracias por compartir tu proyecto
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: '#6B7A99', maxWidth: 520, lineHeight: 1.75, margin: '0 0 32px' }}>
            {resultMsg}
          </p>
          <p style={{ fontFamily: 'Taviraj, serif', fontWeight: 200, fontSize: 17, color: C.cloud, letterSpacing: '0.04em', margin: 0 }}>
            Breathe. Focus. Grow.
          </p>
        </div>
      </div>
    );
  }

  // Form
  const visibleFields = block.fields.filter(f => !f.condition || answers[f.condition.field] === f.condition.value);

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
      <Sidebar
        currentBlock={currentBlock}
        visitedBlocks={visitedBlocks}
        onNavigate={navigateTo}
        answers={answers}
        isFinished={isFinished}
        isDeclined={false}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>

        {/* Header */}
        <div style={{ borderBottom: '1px solid rgba(45,56,82,0.09)', background: C.white, flexShrink: 0, padding: '0 40px' }}>
          <div style={{ maxWidth: 680, margin: '0 auto', padding: '22px 0', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div>
              <h1 style={{ fontFamily: 'Taviraj, serif', fontWeight: 300, fontSize: 26, color: C.navy, margin: '0 0 4px', letterSpacing: '-0.01em' }}>
                {block.label}
              </h1>
              <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 14, color: C.cloud }}>
                {block.description}
              </p>
            </div>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: C.cloud, flexShrink: 0, marginLeft: 24 }}>
              Paso {currentBlock + 1} de {BLOCKS.length}
            </span>
          </div>
        </div>

        {/* Scrollable content */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '36px 40px 120px' }}>
          <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 36 }}>
            {visibleFields.map(field => (
              <div key={field.id} id={`field-${field.id}`}>
                <FieldInput
                  field={field}
                  value={answers[field.id]}
                  onChange={v => setAnswer(field.id, v)}
                  error={errors[field.id]}
                />
              </div>
            ))}
            {errors.__form && (
              <p style={{ margin: 0, fontSize: 14, color: C.error, fontFamily: 'var(--font-body)', padding: '12px 16px', background: 'rgba(229,62,62,0.06)', borderRadius: 8 }}>
                {errors.__form}
              </p>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div style={{ borderTop: '1px solid rgba(45,56,82,0.09)', background: C.white, padding: '16px 40px', flexShrink: 0 }}>
          <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="button" onClick={handlePrev} disabled={currentBlock === 0}
              style={{
                padding: '11px 22px', borderRadius: 10, fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
                border: `1.5px solid ${currentBlock === 0 ? 'rgba(45,56,82,0.08)' : C.inputBorder}`,
                background: 'transparent', color: currentBlock === 0 ? C.cloud : C.night,
                cursor: currentBlock === 0 ? 'default' : 'pointer', transition: 'all 0.12s',
              }}
            >
              ← Anterior
            </button>

            {isLast ? (
              <button
                type="button" onClick={handleSubmit} disabled={submitting}
                style={{
                  padding: '12px 28px', borderRadius: 10, fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 600,
                  border: 'none', cursor: submitting ? 'wait' : 'pointer',
                  background: submitting ? C.cloud : C.navy, color: '#fff',
                  boxShadow: submitting ? 'none' : '0 2px 12px rgba(28,40,64,0.2)', transition: 'background 0.15s',
                }}
              >
                {submitting ? 'Enviando…' : 'Enviar aplicación →'}
              </button>
            ) : (
              <button
                type="button" onClick={handleNext}
                style={{
                  padding: '12px 28px', borderRadius: 10, fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500,
                  border: 'none', cursor: 'pointer', background: C.navy, color: '#fff',
                  boxShadow: '0 2px 12px rgba(28,40,64,0.2)', transition: 'background 0.15s',
                }}
                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = C.night)}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = C.navy)}
              >
                Siguiente →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
