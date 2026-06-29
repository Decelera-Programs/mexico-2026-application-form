import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createSession, loadSession, submitApplication, saveDraft } from './hooks/useApi';
import { Confetti } from './components/Confetti';
import { supabase } from './supabaseClient';

// ── Types ────────────────────────────────────────────────────────────────────

type FieldType = 'text' | 'email' | 'url' | 'number' | 'year' | 'textarea' | 'select' | 'multiselect' | 'boolean' | 'file-url';

interface FieldDef {
  id: string;
  label: string;
  hint?: string;
  type: FieldType;
  required: boolean;
  options?: string[];
  placeholder?: string;
  maxLength?: number;
  condition?: { field: string; value: unknown; operator?: 'eq' | 'not_eq' };
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
    label: 'Before you start',
    description: 'Who you are and what you\'re building.',
    fields: [
      { id: 'startup_name',      label: 'What\'s the name of your startup?', type: 'text',  required: true,  placeholder: 'Your startup name' },
      { id: 'founder_full_name', label: 'Your full name',                    type: 'text',  required: true,  placeholder: 'First and last name' },
      { id: 'founder_email',     label: 'Professional email', hint: 'We\'ll reach out here if you move forward.', type: 'email', required: true, placeholder: 'you@startup.com' },
    ],
  },
  {
    id: 'company',
    label: 'The company',
    description: 'Signal-first. Market and product insight.',
    fields: [
      { id: 'problem',          label: 'In three lines max, what core problem are you solving?', type: 'textarea', required: true, maxLength: 500 },
      { id: 'company_website',  label: 'Company website', hint: 'We use this to match your company in our CRM. Skip if you don\'t have one yet.', type: 'url', required: false, placeholder: 'https://' },
      { id: 'demo_url',         label: 'Pick one URL that best shows what you\'re building.', hint: 'Demo, product, MVP or landing page.', type: 'url', required: true, placeholder: 'https://' },
      { id: 'industry_insight', label: 'Tell us something about your industry that big incumbents don\'t understand or ignore.', hint: '1–2 sentences. Your strongest insight revealer as a founder.', type: 'textarea', required: true, maxLength: 400 },
      {
        id: 'defensibility', required: true,
        label: 'A competitor raises €100M tomorrow to kill your startup. What\'s the one thing they can\'t buy or copy in 12 months?',
        type: 'multiselect',
        options: [
          'Data moat — proprietary/exclusive/longitudinal data improving with use',
          'Network effects',
          'Deep integration / high switching costs',
          'Hard-to-replicate technical edge',
          'Regulation / licenses',
          'Brand / GTM',
          'None clearly yet',
        ],
      },
      {
        id: 'third_party_dependence', required: true,
        label: 'How dependent is your core value on third-party APIs (OpenAI, AWS, etc.)?',
        type: 'select',
        options: [
          'Independent — used for non-core tasks, the core is ours',
          'Hybrid — we enhance third-party models with our own data / fine-tuning',
          'Dependent — a superior layer / UX on top of existing APIs',
        ],
      },
      {
        id: 'sector', required: true, label: 'Which sector(s)?', type: 'multiselect',
        options: ['AI / ML', 'FinTech', 'HealthTech', 'EdTech', 'ClimateTech', 'DeepTech', 'Web3 & Blockchain', 'AgriTech', 'InsurTech', 'IndustrialTech', 'MarketingTech', 'FoodTech', 'TransportTech', 'E-Commerce', 'Social Innovation', 'Circular Economy', 'Impact & Social Enterprises', 'AR/VR/XR', 'Advanced Materials', 'Retail', 'SpaceTech', 'TravelTech', 'Other'],
      },
      {
        id: 'business_model', required: true, label: 'How would you describe your business model? Select all that apply.', type: 'multiselect',
        options: ['B2B', 'B2C', 'SaaS', 'Marketplace', 'Usage-based', 'Transaction-based', 'Enterprise / Contracts', 'Licensing', 'Hardware', 'Advertising', 'Consulting', 'Other'],
      },
      {
        id: 'why_now_select', required: true,
        label: 'Why is this business possible now? Which external tailwind is accelerating your market most?',
        type: 'select',
        options: [
          'New mandated compliance — buyers now legally forced to adopt',
          'Extreme supply/demand imbalance',
          'Generative AI / large-scale automation — 10x cost cut or new capability',
          'Platform shift, e.g. on-prem → cloud',
          'None / general growth',
        ],
      },
      { id: 'why_now_validation', required: true, label: 'Explain that in a couple of lines.', hint: 'If you can cite the law, technology or market data that validates it, do.', type: 'textarea', maxLength: 400, condition: { field: 'why_now_select', value: 'None / general growth', operator: 'not_eq' } },
      { id: 'potential_clients', required: true, label: 'Roughly how many potential clients are in your target market?', type: 'number', placeholder: 'e.g. 50000' },
    ],
  },
  {
    id: 'founders',
    label: 'The founders',
    description: 'Who\'s behind it? This block is worth 35 points.',
    fields: [
      { id: 'technical_cofounder',  required: true,  label: 'Do you have a technical co-founder?', type: 'boolean' },
      { id: 'number_of_founders',   required: true,  label: 'How many full-time founders are on the team?', type: 'select', options: ['1', '2', '3', '4', '4+'] },
      { id: 'founder_linkedin',     required: true,  label: 'LinkedIn profile(s)', hint: 'Yours and your co-founders\'. We always check.', type: 'url', placeholder: 'https://linkedin.com/in/...' },
      {
        id: 'team_milestone', required: true,
        label: 'What is the team\'s most relevant collective milestone? Select all that apply.',
        type: 'multiselect',
        options: [
          'Serial founder, exit >€10M',
          'Serial founder, exit <€10M',
          'Serial founder, no exit',
          'Early employee (<20) at a unicorn / scale-up',
          'PhD or senior researcher in the area',
          'Senior corporate, 10y+ in sector',
          'First-time founder',
        ],
      },
      { id: 'team_milestone_detail',        required: true, label: 'Tell us more about that milestone.', hint: 'Give us context: what did you build, what was the outcome, what did you learn? First-time founder? Tell us the most impressive thing you\'ve shipped or organized with limited resources.', type: 'textarea', maxLength: 600 },
      { id: 'sector_experience',            required: true, label: 'How many years of cumulative experience does the team have in this specific sector?', type: 'select', options: ['0–2 years', '2–5 years', '6–12 years', '12+ years'] },
      {
        id: 'most_significant_milestone', required: true,
        label: 'Since launch, what is your most significant milestone? Select all that apply.',
        type: 'multiselect',
        options: [
          'Built and launched the MVP with no external funding / 3rd-party devs',
          'Convinced a Tier-1 senior to leave their job for min salary',
          'Secured 3+ LOIs or pilots before a finished product',
          '€5k+ MRR (or equivalent usage) within 12 weeks of launch',
          'None yet',
        ],
      },
    ],
  },
  {
    id: 'traction',
    label: 'Traction',
    description: 'Numbers, not narrative. 30 points.',
    fields: [
      { id: 'north_star',          required: true, label: 'Describe your traction.', type: 'textarea', maxLength: 600 },
      { id: 'mom_growth',          required: true, label: 'Average MoM growth over the last 3 months?',           type: 'select', options: ['>20%', '10–20%', '5–10%', '<5% or N/A — building / pivoting'] },
      { id: 'net_burn',            required: true, label: 'Average monthly net burn over the last 3 months? (€)', type: 'select', options: ['<€10k', '€10–25k', '€25–50k', '€50–100k', '>€100k'] },
      { id: 'churn',               required: true, label: 'Average monthly churn over the last 3 months?',        type: 'select', options: ['<2%', '2–5%', '5–10%', '>10%'] },
      { id: 'acquisition_channel', required: true, label: 'How are you acquiring clients?',                       type: 'select', options: ['>80% organic — word-of-mouth / SEO / loops', '50–80% organic, rest paid', '<50% organic — heavy ads / sales'] },
    ],
  },
  {
    id: 'equity',
    label: 'Equity & the round',
    description: 'Legal structure and fundraising status. Hard stops evaluated on submit.',
    fields: [
      { id: 'incorporation_location', required: true,  label: 'Where is your company incorporated?', type: 'select', options: ['Mexico', 'Colombia', 'Chile', 'Argentina', 'Peru', 'Uruguay', 'Central America & Caribbean', 'Brazil', 'Cayman Islands', 'LATAM', 'U.S.A.', 'E.U.', 'Other'] },
      { id: 'operations_location', required: true, label: 'Where does the company operate? Select all that apply.', type: 'multiselect', options: ['Mexico', 'Colombia', 'Chile', 'Argentina', 'Peru', 'Uruguay', 'Central America & Caribbean', 'Brazil', 'Other LATAM', 'USA', 'Europe'] },
      { id: 'company_start_year',     required: true,  label: 'What year did the company start operating?', type: 'year', placeholder: '20XX' },
      { id: 'founding_equity',        required: true,  label: 'How much equity is held by the founding team, including the option pool?', type: 'select', options: ['>80%', '60–80%', '40–60%', '<40%'] },
      { id: 'total_raised',           required: true,  label: 'Total raised to date, excluding the current round.', hint: 'Equity, notes, SAFEs.', type: 'select', options: ['<€500k', '€500k–1.5M', '€1.5M–2.5M', '>€2.5M'] },
      { id: 'round_size',             required: true,  label: 'What is the total size of your current round? (€)', type: 'number', placeholder: 'e.g. 1000000' },
      { id: 'round_committed',        required: true,  label: 'How much of the round is committed?', type: 'select', options: ['0–25%', '25–50%', '50–75%', '75%+'] },
      { id: 'pre_money_valuation',    required: true,  label: 'What is the pre-money valuation (or cap)? (€)', type: 'number', placeholder: 'e.g. 5000000' },
      { id: 'runway',                 required: true,  label: 'What is your current runway?', type: 'select', options: ['0–2 months', '2–5 months', '6–12 months', '12+ months'] },
      { id: 'pitch_deck_url',         required: true,  label: 'Pitch deck', hint: 'Upload a PDF or paste a link (Google Drive, Dropbox, Docsend…). Make sure it\'s not password protected.', type: 'file-url', placeholder: 'https://...' },
    ],
  },
  {
    id: 'wrap',
    label: 'Wrap-up',
    description: 'Almost done. One more minute.',
    fields: [
      { id: 'how_heard',            required: true,  label: 'How did you hear about us?', type: 'select', options: ['LinkedIn', 'Referral', 'Event', 'Press', 'Other'] },
      { id: 'referral_name',        required: true,  label: 'Who referred you?', type: 'text', placeholder: 'Name of the person who referred you', condition: { field: 'how_heard', value: 'Referral' } },
      { id: 'network_contact',      required: true,  label: 'Do you know anyone in the Decelera network?', hint: 'A mentor, portfolio founder or LP.', type: 'boolean' },
      { id: 'network_contact_name', required: true,  label: 'Who is it and what\'s your relationship?', type: 'text', placeholder: 'e.g. María García — portfolio mentor', condition: { field: 'network_contact', value: true } },
      { id: 'additional_comments',  required: true,  label: 'What challenge would you like to work on at Decelera?', type: 'textarea', maxLength: 800 },
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
  sbMuted:     'rgba(255,255,255,0.55)',
  sbPending:   'rgba(255,255,255,0.45)',
  sbFoot:      'rgba(255,255,255,0.28)',
  inputBorder: 'rgba(45,56,82,0.18)',
};

// ── Validation ────────────────────────────────────────────────────────────────

function validateFieldValue(field: FieldDef, v: unknown): string | null {
  const isEmpty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
  if (isEmpty) return field.required ? (
    field.type === 'file-url' ? 'Please upload a PDF or paste a link.' :
    Array.isArray(v) || field.type === 'multiselect' ? 'Please select at least one option.' :
    'This field is required.'
  ) : null;

  const s = String(v);
  if (field.type === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim()))
      return 'Please enter a valid email address (e.g. you@startup.com).';
  }
  if (field.type === 'url' || field.type === 'file-url') {
    try { new URL(s.trim().startsWith('http') ? s.trim() : `https://${s.trim()}`); }
    catch { return 'Please enter a valid URL (e.g. https://yourstartup.com).'; }
  }
  if (field.type === 'number') {
    if (isNaN(Number(s)) || s.trim() === '')
      return 'Please enter a valid number.';
  }
  if (field.type === 'year') {
    if (!/^20\d{2}$/.test(s.trim()))
      return 'Please enter a valid year (e.g. 2023).';
  }
  return null;
}

function validateAll(answers: Record<string, unknown>): Record<string, string> {
  const errs: Record<string, string> = {};
  for (const block of BLOCKS) {
    for (const f of block.fields) {
      if (f.condition) {
        const v = answers[f.condition.field];
        const matches = v === f.condition.value;
        const visible = f.condition.operator === 'not_eq' ? (v !== undefined && v !== null && v !== '' && !matches) : matches;
        if (!visible) continue;
      }
      const msg = validateFieldValue(f, answers[f.id]);
      if (msg) errs[f.id] = msg;
    }
  }
  return errs;
}

// ── Field components ──────────────────────────────────────────────────────────

interface FieldInputProps {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  onBlur?: () => void;
  onCommit?: (v: unknown) => void;
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

function TextField({ field, value, onChange, onBlur, error }: FieldInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <FieldWrapper field={field} error={error}>
      <input
        type="text"
        value={(value as string) ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={field.placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); onBlur?.(); }}
        style={baseInput(!!error, focused)}
      />
    </FieldWrapper>
  );
}

function NumberField({ field, value, onChange, onBlur, error }: FieldInputProps) {
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
        onBlur={() => { setFocused(false); onBlur?.(); }}
        style={baseInput(!!error, focused)}
      />
    </FieldWrapper>
  );
}

function FileUrlField({ field, value, onChange, onBlur, onCommit, error }: FieldInputProps) {
  const [urlFocused, setUrlFocused]     = useState(false);
  const [dragging, setDragging]         = useState(false);
  const [uploading, setUploading]       = useState(false);
  const [uploadAttempt, setUploadAttempt] = useState(0);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [uploadError, setUploadError]   = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const url = (value as string) ?? '';

  async function uploadWithRetry(file: File, path: string, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      setUploadAttempt(attempt);
      const { data, error: err } = await supabase.storage
        .from('pitch-decks')
        .upload(path, file, { upsert: attempt > 1 });
      if (!err && data) return { data, error: null };
      if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 1000 * attempt));
    }
    return { data: null, error: new Error('Upload failed after 3 attempts') };
  }

  async function handleFile(file: File) {
    if (!file.type.includes('pdf')) { setUploadError('Only PDF files are accepted.'); return; }
    if (file.size > 50 * 1024 * 1024) { setUploadError('File must be under 50 MB.'); return; }
    setUploadError(null);
    setUploading(true);
    setUploadAttempt(1);
    const ext = file.name.split('.').pop();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { data, error: err } = await uploadWithRetry(file, path);
    setUploading(false);
    setUploadAttempt(0);
    if (err || !data) {
      setUploadError('Upload failed after 3 attempts. Please try again or paste a link below.');
      return;
    }
    const { data: pub } = supabase.storage.from('pitch-decks').getPublicUrl(data.path);
    onChange(pub.publicUrl);
    setUploadedName(file.name);
    // Persist immediately so URL survives browser close
    onCommit?.(pub.publicUrl);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files?.[0]; if (f) handleFile(f);
  }

  const dropZoneStyle: React.CSSProperties = {
    width: '100%', padding: '32px 24px', borderRadius: 10, boxSizing: 'border-box',
    border: `1.5px solid ${dragging ? C.navy : C.inputBorder}`,
    background: dragging ? 'rgba(28,40,64,0.04)' : C.white,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 8, cursor: uploading ? 'default' : 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
  };

  return (
    <FieldWrapper field={field} error={uploadError ?? error}>
      {/* Drop zone */}
      <input ref={inputRef} type="file" accept="application/pdf" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

      {uploadedName ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{
            flex: 1, padding: '11px 14px', borderRadius: 10,
            background: C.white, border: `1.5px solid ${C.water}`,
            fontSize: 14, color: C.night, display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.water} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{uploadedName}</span>
          </div>
          <button type="button" onClick={() => { setUploadedName(null); onChange(''); if (inputRef.current) inputRef.current.value = ''; }}
            style={{ background: 'none', border: 'none', color: C.cloud, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px' }}>
            ×
          </button>
        </div>
      ) : (
        <div
          style={dropZoneStyle}
          onClick={() => !uploading && inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {uploading ? (
            <>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.cloud} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              <span style={{ fontSize: 13, color: C.cloud, fontFamily: 'var(--font-body)' }}>
                {uploadAttempt > 1 ? `Retrying… (attempt ${uploadAttempt}/3)` : 'Uploading…'}
              </span>
            </>
          ) : (
            <>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={C.cloud} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <span style={{ fontSize: 14, color: C.night, fontFamily: 'var(--font-body)', fontWeight: 500 }}>
                Drop your deck here or <span style={{ color: C.navy, textDecoration: 'underline' }}>browse</span>
              </span>
              <span style={{ fontSize: 12, color: C.cloud, fontFamily: 'var(--font-body)' }}>PDF only · max 50 MB</span>
            </>
          )}
        </div>
      )}

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.10)' }} />
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', letterSpacing: 1, fontFamily: 'var(--font-body)' }}>OR PASTE A LINK</span>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.10)' }} />
      </div>

      {/* URL input */}
      <input
        type="text" inputMode="url"
        value={uploadedName ? '' : url}
        placeholder={field.placeholder}
        disabled={!!uploadedName}
        onChange={e => { setUploadedName(null); onChange(e.target.value.trim()); }}
        onFocus={() => setUrlFocused(true)}
        onBlur={() => { setUrlFocused(false); onBlur?.(); }}
        style={{ ...baseInput(!!(uploadError ?? error), urlFocused), opacity: uploadedName ? 0.35 : 1 }}
      />
    </FieldWrapper>
  );
}

function YearField({ field, value, onChange, onBlur, error }: FieldInputProps) {
  const [focused, setFocused] = useState(false);
  const raw = value !== undefined && value !== null ? String(value) : '';
  return (
    <FieldWrapper field={field} error={error}>
      <input
        type="text" inputMode="numeric" maxLength={4}
        value={raw}
        onChange={e => {
          const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
          onChange(v);
        }}
        placeholder={field.placeholder ?? '20XX'}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); onBlur?.(); }}
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
    const ta = ref.current; if (!ta) return;
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
              {opt ? 'Yes' : 'No'}
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
    case 'year':        return <YearField        {...props} />;
    case 'file-url':    return <FileUrlField     {...props} />;
    default:            return <TextField        {...props} />;
  }
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ activeBlock, answers, isFinished, isDeclined, onBlockClick }: {
  activeBlock: number;
  answers: Record<string, unknown>;
  isFinished: boolean;
  isDeclined: boolean;
  onBlockClick: (idx: number) => void;
}) {
  const allRequired = BLOCKS.flatMap(b => b.fields).filter(f => f.required);
  const answered = allRequired.filter(f => {
    if (f.condition && answers[f.condition.field] !== f.condition.value) return false;
    const v = answers[f.id];
    return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
  }).length;
  const pct = Math.round((answered / allRequired.length) * 100);

  return (
    <aside style={{ width: 232, flexShrink: 0, display: 'flex', flexDirection: 'column', background: C.navy, position: 'sticky', top: 0, height: '100dvh', overflowY: 'auto' }}>
      <div style={{ padding: '24px 20px 18px', flexShrink: 0 }}>
        <img
          src="https://images.squarespace-cdn.com/content/v1/67811e8fe702fd5553c65249/c5500619-9712-4b9b-83ee-a697212735ae/Disen%CC%83o+sin+ti%CC%81tulo+%2840%29.png"
          alt="Decelera"
          style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', background: '#ffffff', border: '2px solid rgba(255,255,255,0.12)' }}
        />
        <div style={{ fontFamily: 'Taviraj, serif', fontWeight: 200, fontSize: 17, color: '#fff', marginTop: 14, letterSpacing: '0.01em', lineHeight: 1.15 }}>
          Decelera Ventures
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: '#fff', marginTop: 3, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {isFinished ? (isDeclined ? '✗ Not a fit right now' : '✓ Submitted') : 'Mexico 2026'}
        </div>
      </div>

      <div style={{ height: 1, background: C.sbDivider, margin: '0 20px 6px' }} />

      <nav style={{ flex: 1, padding: '4px 0 8px' }}>
        {BLOCKS.map((block, idx) => {
          const isCurrent = !isFinished && idx === activeBlock;
          const blockComplete = block.fields
            .filter(f => f.required)
            .filter(f => !f.condition || answers[f.condition.field] === f.condition.value)
            .every(f => { const v = answers[f.id]; return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0); });
          const isDone = isFinished || blockComplete;
          return (
            <button
              key={block.id} type="button"
              onClick={() => onBlockClick(idx)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', padding: '10px 18px',
                background: isCurrent ? 'rgba(255,184,80,0.10)' : 'transparent',
                borderLeft: `3px solid ${isCurrent ? C.gold : 'transparent'}`,
                borderTop: 'none', borderRight: 'none', borderBottom: 'none',
                cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s',
              }}
            >
              <div style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isDone ? 'rgba(31,208,239,0.12)' : isCurrent ? C.gold : 'transparent',
                border: isDone ? '1.5px solid rgba(31,208,239,0.4)' : isCurrent ? 'none' : '1.5px solid rgba(255,255,255,0.2)',
              }}>
                {isDone
                  ? <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-4.5" stroke="#1FD0EF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  : <span style={{ fontSize: 10, color: isCurrent ? C.navy : 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>{idx === 0 ? '·' : idx}</span>
                }
              </div>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: isCurrent ? 500 : 400, color: isDone ? C.sbMuted : isCurrent ? '#fff' : C.sbPending }}>
                {block.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div style={{ padding: '14px 20px 22px', borderTop: `1px solid ${C.sbDivider}`, flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: '#fff', fontFamily: 'var(--font-body)', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{answered} / {allRequired.length} fields completed</span>
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>✓ progress saved</span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${C.gold}, #FF8C42)`, borderRadius: 2, transition: 'width 0.4s ease' }} />
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <a href="https://www.deceleraamericas.ventures" target="_blank" rel="noopener noreferrer"
            style={{ color: '#fff', display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
            onMouseLeave={e => (e.currentTarget.style.color = '#fff')}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </a>
          <a href="https://www.linkedin.com/company/decelera/" target="_blank" rel="noopener noreferrer"
            style={{ color: '#fff', display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
            onMouseLeave={e => (e.currentTarget.style.color = '#fff')}
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
  const [appState, setAppState]     = useState<AppState>('loading');
  const [sessionId, setSessionId]   = useState<string | null>(null);
  const [answers, setAnswers]       = useState<Record<string, unknown>>({});
  const [errors, setErrors]         = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [activeBlock, setActiveBlock] = useState(0);

  const blockRefs      = useRef<(HTMLElement | null)[]>([]);
  const scrollRef      = useRef<HTMLDivElement>(null);
  const initRan        = useRef(false);
  const answersRef     = useRef<Record<string, unknown>>({});
  const autoSaveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFinished = appState === 'complete' || appState === 'declined';

  // Init
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
            setAppState('form');
            if (data.currentBlock) {
              const idx = BLOCKS.findIndex(b => b.id === data.currentBlock);
              if (idx > 0) {
                setTimeout(() => {
                  blockRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
              }
            }
            return;
          }
        }
        const data = await createSession();
        localStorage.setItem('decelera_mex26_session_id', data.session.id);
        setSessionId(data.session.id);
        setAppState('form');
      } catch { setAppState('error'); }
    })();
  }, []);

  // Track which block is in view via IntersectionObserver
  useEffect(() => {
    if (appState !== 'form') return;
    const observers: IntersectionObserver[] = [];
    blockRefs.current.forEach((el, idx) => {
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveBlock(idx); },
        { root: scrollRef.current, threshold: 0.25 }
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach(o => o.disconnect());
  }, [appState]);

  // Keep answersRef in sync for use in callbacks without stale closure issues
  useEffect(() => { answersRef.current = answers; }, [answers]);

  // Save immediately when the visible block changes (user scrolled to a new section)
  useEffect(() => {
    if (appState !== 'form' || !sessionId) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    saveDraft(sessionId, answersRef.current, BLOCKS[activeBlock]?.id ?? 'identity').catch(() => {});
  }, [activeBlock, appState, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save draft 3s after last answer change
  useEffect(() => {
    if (appState !== 'form' || !sessionId) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      saveDraft(sessionId, answersRef.current, BLOCKS[activeBlock]?.id ?? 'identity').catch(() => {});
    }, 3000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [answers, appState, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Warn on unload
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

  function persistNow(extraAnswers: Record<string, unknown>) {
    if (!sessionId) return;
    const merged = { ...answersRef.current, ...extraAnswers };
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    saveDraft(sessionId, merged, BLOCKS[activeBlock]?.id ?? 'identity').catch(() => {});
  }

  const scrollToBlock = useCallback((idx: number) => {
    const el = blockRefs.current[idx];
    if (!el || !scrollRef.current) return;
    const containerTop = scrollRef.current.getBoundingClientRect().top;
    const elTop = el.getBoundingClientRect().top;
    scrollRef.current.scrollBy({ top: elTop - containerTop - 32, behavior: 'smooth' });
  }, []);

  async function handleSubmit() {
    const errs = validateAll(answers);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      // Scroll to first error
      const firstBlockIdx = BLOCKS.findIndex(b => b.fields.some(f => errs[f.id]));
      if (firstBlockIdx >= 0) {
        scrollToBlock(firstBlockIdx);
        setTimeout(() => {
          const firstId = BLOCKS[firstBlockIdx].fields.find(f => errs[f.id])?.id;
          if (firstId) document.getElementById(`field-${firstId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 400);
      }
      return;
    }
    if (!sessionId) return;
    setSubmitting(true);
    try {
      const result = await submitApplication(sessionId, answers);
      localStorage.removeItem('decelera_mex26_session_id');
      setAppState(result.isDeclined ? 'declined' : 'complete');
    } catch {
      setErrors({ __form: 'Something went wrong. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading ─────────────────────────────────────────────────────────────────

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

  // ── Complete / Declined ─────────────────────────────────────────────────────

  if (appState === 'complete' || appState === 'declined') {
    const fmt = (n: unknown) => n ? `€${Number(n).toLocaleString('en-US')}` : '—';
    const arr = (v: unknown) => Array.isArray(v) && v.length ? (v as string[]).join(', ') : (v as string | undefined) ?? '—';
    const str = (v: unknown) => (v as string | undefined) ?? '—';

    const rows: [string, React.ReactNode][] = [
      ['Founder',          str(answers.founder_full_name)],
      ['Email',            str(answers.founder_email)],
      ['Sector',           arr(answers.sector)],
      ['Business model',   arr(answers.business_model)],
      ['Incorporated in',  str(answers.incorporation_location)],
      ['Operations',       arr(answers.operations_location)],
      ['Started operating',str(answers.company_start_year)],
      ['Founding equity',  str(answers.founding_equity)],
      ['Total raised',     str(answers.total_raised)],
      ['Current round',    fmt(answers.round_size)],
      ['Pre-money val.',   fmt(answers.pre_money_valuation)],
      ['Monthly burn',     str(answers.net_burn)],
      ['Runway',           str(answers.runway)],
      ['How heard',        str(answers.how_heard)],
      ['Pitch deck',       answers.pitch_deck_url
        ? <a href={str(answers.pitch_deck_url)} target="_blank" rel="noreferrer" style={{ color: C.water, textDecoration: 'none', wordBreak: 'break-all' }}>{str(answers.pitch_deck_url)}</a>
        : '—'],
    ];

    return (
      <div style={{ display: 'flex', height: '100dvh' }}>
        {appState === 'complete' && <Confetti />}
        <Sidebar activeBlock={BLOCKS.length} answers={answers} isFinished isDeclined={appState === 'declined'} onBlockClick={() => {}} />
        <div style={{ flex: 1, overflowY: 'auto', background: C.bg, padding: '48px 32px' }}>
          <div style={{ maxWidth: 620, margin: '0 auto' }}>
            <h1 style={{ fontFamily: 'Taviraj, serif', fontWeight: 200, fontSize: 34, color: C.navy, margin: '0 0 6px', letterSpacing: '-0.01em' }}>
              Thanks for applying!
            </h1>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: '#6B7A99', margin: '0 0 32px' }}>
              {str(answers.startup_name)} · Here's what we received.
            </p>

            <div style={{ background: '#fff', border: `1px solid ${C.inputBorder}`, borderRadius: 12, overflow: 'hidden' }}>
              {rows.map(([label, value], i) => (
                <div key={label} style={{
                  display: 'grid', gridTemplateColumns: '160px 1fr',
                  padding: '12px 20px',
                  borderTop: i > 0 ? `1px solid ${C.inputBorder}` : undefined,
                  background: i % 2 === 0 ? '#fff' : '#FAFBFC',
                }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#9AA3B8', fontWeight: 500 }}>{label}</span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: C.night, wordBreak: 'break-word' }}>{value}</span>
                </div>
              ))}
            </div>

            <p style={{ fontFamily: 'Taviraj, serif', fontWeight: 200, fontSize: 17, color: C.cloud, letterSpacing: '0.04em', margin: '36px 0 0', textAlign: 'center' }}>
              Breathe. Focus. Grow.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
      <Sidebar
        activeBlock={activeBlock}
        answers={answers}
        isFinished={isFinished}
        isDeclined={false}
        onBlockClick={scrollToBlock}
      />

      {/* Scrollable content */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', background: C.bg }}>
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '56px 40px 80px' }}>

          {BLOCKS.map((block, bIdx) => {
            const visibleFields = block.fields.filter(f => {
            if (!f.condition) return true;
            const v = answers[f.condition.field];
            const matches = v === f.condition.value;
            return f.condition.operator === 'not_eq' ? (v !== undefined && v !== null && v !== '' && !matches) : matches;
          });
            return (
              <section
                key={block.id}
                ref={el => { blockRefs.current[bIdx] = el; }}
                style={{ marginBottom: 80 }}
              >
                {/* Block header */}
                <div style={{ marginBottom: 32 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 12, color: '#fff', fontFamily: 'var(--font-body)', fontWeight: 600 }}>{bIdx === 0 ? '·' : bIdx}</span>
                    </div>
                    <h2 style={{ margin: 0, fontFamily: 'Taviraj, serif', fontWeight: 200, fontSize: 24, color: C.navy, letterSpacing: '-0.01em' }}>
                      {block.label}
                    </h2>
                  </div>
                  <p style={{ margin: '0 0 0 40px', fontFamily: 'var(--font-body)', fontSize: 14, color: C.cloud, lineHeight: 1.6 }}>
                    {block.description}
                  </p>
                  <div style={{ marginTop: 20, height: 1, background: 'rgba(45,56,82,0.10)' }} />
                </div>

                {/* Fields */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                  {visibleFields.map(field => (
                    <div key={field.id} id={`field-${field.id}`}>
                      <FieldInput
                        field={field}
                        value={answers[field.id]}
                        onChange={v => setAnswer(field.id, v)}
                        onBlur={() => {
                          const msg = validateFieldValue(field, answers[field.id]);
                          setErrors(prev => msg ? { ...prev, [field.id]: msg } : (() => { const n = { ...prev }; delete n[field.id]; return n; })());
                        }}
                        onCommit={field.id === 'pitch_deck_url' ? (v) => persistNow({ pitch_deck_url: v }) : undefined}
                        error={errors[field.id]}
                      />
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

          {/* Submit */}
          <div style={{ borderTop: '1px solid rgba(45,56,82,0.10)', paddingTop: 40 }}>
            {errors.__form && (
              <p style={{ margin: '0 0 20px', fontSize: 14, color: C.error, fontFamily: 'var(--font-body)', padding: '12px 16px', background: 'rgba(229,62,62,0.06)', borderRadius: 8 }}>
                {errors.__form}
              </p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 13, color: C.cloud, maxWidth: 340, lineHeight: 1.6 }}>
                By submitting you confirm the information is accurate and accept our privacy policy.
              </p>
              <button
                type="button" onClick={handleSubmit} disabled={submitting}
                style={{
                  padding: '14px 36px', borderRadius: 12, fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 600,
                  border: 'none', cursor: submitting ? 'wait' : 'pointer',
                  background: submitting ? C.cloud : C.navy, color: '#fff',
                  boxShadow: submitting ? 'none' : '0 4px 16px rgba(28,40,64,0.22)',
                  transition: 'all 0.15s', flexShrink: 0, marginLeft: 24,
                }}
                onMouseEnter={e => { if (!submitting) (e.currentTarget as HTMLButtonElement).style.background = C.night; }}
                onMouseLeave={e => { if (!submitting) (e.currentTarget as HTMLButtonElement).style.background = C.navy; }}
              >
                {submitting ? 'Submitting…' : 'Submit application →'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
