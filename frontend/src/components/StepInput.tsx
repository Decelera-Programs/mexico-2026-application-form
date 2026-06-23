import React, { useState, useRef, useEffect } from 'react';
import type { FlowStep } from '../../../shared/types';

const COMMAND_DEFS = [
  { cmd: '/ask',     desc: 'Pregunta algo sobre Decelera' },
  { cmd: '/correct', desc: 'Editar una respuesta anterior' },
  { cmd: '/restart', desc: 'Empezar de cero' },
  { cmd: '/summary', desc: 'Ver un resumen de tus respuestas' },
  { cmd: '/help',    desc: 'Mostrar los comandos disponibles' },
];
const KNOWN_COMMANDS = COMMAND_DEFS.map(c => c.cmd);
const isKnownCommand = (v: string) => {
  const t = v.trim().toLowerCase();
  return KNOWN_COMMANDS.includes(t) || t.startsWith('/ask ');
};

function CommandPicker({ query, onSelect }: { query: string; onSelect: (cmd: string) => void }) {
  const matches = COMMAND_DEFS.filter(c => c.cmd.startsWith(query.toLowerCase()));
  if (!matches.length) return null;
  return (
    <div style={{
      position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, right: 0,
      background: '#fff', border: '1.5px solid rgba(45,56,82,0.1)',
      borderRadius: 14, boxShadow: '0 6px 24px rgba(45,56,82,0.13)',
      overflow: 'hidden', zIndex: 20,
    }}>
      {matches.map((c, i) => (
        <button
          key={c.cmd}
          onMouseDown={e => { e.preventDefault(); onSelect(c.cmd); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%',
            padding: '11px 16px', background: 'none', border: 'none', cursor: 'pointer',
            textAlign: 'left', fontFamily: 'var(--font-body)',
            borderBottom: i < matches.length - 1 ? '1px solid rgba(45,56,82,0.06)' : 'none',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#F4F4F4')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <code style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-night)', fontFamily: 'monospace', minWidth: 72 }}>{c.cmd}</code>
          <span style={{ fontSize: 13, color: 'var(--color-cloud)' }}>{c.desc}</span>
        </button>
      ))}
    </div>
  );
}

interface InputProps {
  step: FlowStep;
  onSubmit: (answer: unknown) => void;
  disabled?: boolean;
}

const inputBase: React.CSSProperties = {
  width: '100%',
  padding: '11px 18px',
  border: '1.5px solid rgba(45,56,82,0.12)',
  borderRadius: 999,
  fontSize: 15,
  fontFamily: 'var(--font-body)',
  color: 'var(--color-night)',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
};

function SendIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" stroke="none" />
    </svg>
  );
}

const sendBtn: React.CSSProperties = {
  width: 44, height: 44, borderRadius: '50%',
  background: 'var(--color-night)', color: '#fff',
  border: 'none', cursor: 'pointer', flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

export function StepInput({ step, onSubmit, disabled }: InputProps) {
  const [value, setValue] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const filterRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setValue('');
    setSelected([]);
    setFilter('');
    const target = (step.type === 'select' || step.type === 'multiselect') ? filterRef : inputRef;
    setTimeout(() => target.current?.focus(), 300);
  }, [step.id]);

  function handleSubmit() {
    if (step.type === 'multiselect') {
      if (step.required && selected.length === 0) return;
      onSubmit(selected);
    } else if (step.type === 'boolean') {
      return;
    } else {
      if (step.required && !value.trim()) return;
      const v = value.trim();
      if (v.startsWith('/') && !isKnownCommand(v)) return;
      if (step.type === 'number' && !isKnownCommand(v) && isNaN(Number(v))) return;
      onSubmit(v || null);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && step.type !== 'textarea') {
      e.preventDefault();
      handleSubmit();
    }
  }

  // ---- Statement ----
  if (step.type === 'statement') {
    return (
      <button
        onClick={() => onSubmit(null)}
        disabled={disabled}
        style={{
          padding: '12px 28px',
          background: 'var(--color-night)', color: '#fff',
          border: 'none', borderRadius: 999, fontSize: 15,
          fontFamily: 'var(--font-body)', cursor: 'pointer', fontWeight: 500,
        }}
      >
        Continuar →
      </button>
    );
  }

  // ---- Boolean ----
  if (step.type === 'boolean') {
    return (
      <div style={{ display: 'flex', gap: 10 }}>
        {(['Sí', 'No'] as const).map((opt) => (
          <button
            key={opt}
            disabled={disabled}
            onClick={() => onSubmit(opt === 'Sí')}
            style={{
              flex: 1, padding: '12px 0',
              border: '1.5px solid rgba(45,56,82,0.12)',
              borderRadius: 999, fontSize: 15,
              fontFamily: 'var(--font-body)', background: '#fff',
              color: 'var(--color-night)', cursor: 'pointer',
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'var(--color-water)'; b.style.borderColor = 'var(--color-water)'; }}
            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = '#fff'; b.style.borderColor = 'rgba(45,56,82,0.12)'; }}
          >
            {opt}
          </button>
        ))}
      </div>
    );
  }

  // ---- Select ----
  if (step.type === 'select') {
    const filtered = filter
      ? (step.options ?? []).filter(o => o.toLowerCase().includes(filter.toLowerCase()))
      : (step.options ?? []);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
          {filter.trim().startsWith('/') && !isKnownCommand(filter.trim()) && (
            <CommandPicker query={filter.trim()} onSelect={cmd => { setFilter(cmd); onSubmit(cmd); }} />
          )}
          <input
            ref={filterRef}
            value={filter}
            onChange={e => setFilter(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (isKnownCommand(filter.trim())) onSubmit(filter.trim());
                else if (filtered.length === 1) onSubmit(filtered[0]);
              }
            }}
            placeholder="Filtrar opciones…"
            disabled={disabled}
            style={{ ...inputBase, flex: 1 }}
            onFocus={e => (e.target.style.borderColor = 'var(--color-night)')}
            onBlur={e => (e.target.style.borderColor = 'rgba(45,56,82,0.12)')}
          />
          {isKnownCommand(filter.trim()) && (
            <button onClick={() => onSubmit(filter.trim())} disabled={disabled} style={sendBtn}>
              <SendIcon />
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
          {filtered.map((opt) => (
            <button
              key={opt}
              disabled={disabled}
              onClick={() => onSubmit(opt)}
              style={{
                width: '100%', padding: '11px 20px',
                border: '1.5px solid rgba(45,56,82,0.12)',
                borderRadius: 999, textAlign: 'left',
                fontSize: 15, fontFamily: 'var(--font-body)',
                background: '#fff', color: 'var(--color-night)',
                cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'var(--color-water)'; b.style.borderColor = 'var(--color-water)'; }}
              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = '#fff'; b.style.borderColor = 'rgba(45,56,82,0.12)'; }}
            >
              {opt}
            </button>
          ))}
          {filtered.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--color-cloud)', fontFamily: 'var(--font-body)', padding: '4px 8px', margin: 0 }}>
              Sin resultados
            </p>
          )}
        </div>
      </div>
    );
  }

  // ---- Multiselect ----
  if (step.type === 'multiselect') {
    function toggle(opt: string) {
      setSelected((prev) =>
        prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]
      );
    }
    const filteredMulti = filter
      ? (step.options ?? []).filter(o => o.toLowerCase().includes(filter.toLowerCase()))
      : (step.options ?? []);
    return (
      <div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, position: 'relative' }}>
          {filter.trim().startsWith('/') && !isKnownCommand(filter.trim()) && (
            <CommandPicker query={filter.trim()} onSelect={cmd => { setFilter(cmd); onSubmit(cmd); }} />
          )}
          <input
            ref={filterRef}
            value={filter}
            onChange={e => setFilter(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && isKnownCommand(filter.trim())) {
                e.preventDefault();
                onSubmit(filter.trim());
              }
            }}
            placeholder="Filtrar opciones…"
            disabled={disabled}
            style={{ ...inputBase, flex: 1 }}
            onFocus={e => (e.target.style.borderColor = 'var(--color-night)')}
            onBlur={e => (e.target.style.borderColor = 'rgba(45,56,82,0.12)')}
          />
          {isKnownCommand(filter.trim()) && (
            <button onClick={() => onSubmit(filter.trim())} disabled={disabled} style={sendBtn}>
              <SendIcon />
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, maxHeight: 160, overflowY: 'auto' }}>
          {filteredMulti.map((opt) => {
            const isSelected = selected.includes(opt);
            return (
              <button
                key={opt}
                disabled={disabled}
                onClick={() => toggle(opt)}
                style={{
                  padding: '8px 16px',
                  border: `1.5px solid ${isSelected ? 'var(--color-night)' : 'rgba(45,56,82,0.12)'}`,
                  borderRadius: 999, fontSize: 14,
                  fontFamily: 'var(--font-body)',
                  background: isSelected ? 'var(--color-night)' : '#fff',
                  color: isSelected ? '#fff' : 'var(--color-night)',
                  cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
                }}
              >
                {isSelected ? '✓ ' : ''}{opt}
              </button>
            );
          })}
        </div>
        <button
          disabled={disabled || (step.required ? selected.length === 0 : false)}
          onClick={handleSubmit}
          style={{
            padding: '12px 28px', background: 'var(--color-night)',
            color: '#fff', border: 'none', borderRadius: 999,
            fontSize: 15, fontFamily: 'var(--font-body)', cursor: 'pointer',
          }}
        >
          Continuar →
        </button>
      </div>
    );
  }

  // ---- Textarea ----
  if (step.type === 'textarea') {
    const charsLeft = step.maxLength !== undefined ? step.maxLength - value.length : null;
    const counterColor =
      charsLeft === null ? 'var(--color-cloud)'
      : charsLeft <= 20 ? '#e53e3e'
      : charsLeft <= 50 ? '#dd6b20'
      : 'var(--color-cloud)';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          placeholder={step.placeholder}
          disabled={disabled}
          maxLength={step.maxLength}
          style={{ ...inputBase, borderRadius: 18, resize: 'none', minHeight: 96, overflow: 'hidden' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {charsLeft !== null ? (
            <span style={{ fontSize: 12, color: counterColor, fontFamily: 'var(--font-body)', paddingLeft: 4, transition: 'color 0.2s' }}>
              {charsLeft} restantes
            </span>
          ) : <span />}
          <button
            disabled={disabled || (step.required ? !value.trim() : false)}
            onClick={handleSubmit}
            style={sendBtn}
          >
            <SendIcon />
          </button>
        </div>
      </div>
    );
  }

  // ---- Text / email / url / number ----
  const trimmed = value.trim();
  const showPicker = trimmed.startsWith('/') && !isKnownCommand(trimmed);
  const isUnknownCommand = trimmed.startsWith('/') && !isKnownCommand(trimmed) && !COMMAND_DEFS.some(c => c.cmd.startsWith(trimmed.toLowerCase()));
  const isInvalidNumber = step.type === 'number' && trimmed !== '' && !isKnownCommand(trimmed) && isNaN(Number(trimmed));
  const submitDisabled = disabled || isInvalidNumber || isUnknownCommand || (step.required ? !trimmed : false);
  const hint = isUnknownCommand
    ? `Comando no reconocido. Disponibles: ${KNOWN_COMMANDS.join(', ')}`
    : isInvalidNumber ? 'Escribe un número válido' : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'relative' }}>
      {showPicker && <CommandPicker query={trimmed} onSelect={cmd => { setValue(cmd); onSubmit(cmd); }} />}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={step.type === 'email' ? 'email' : 'text'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          placeholder={step.placeholder}
          disabled={disabled}
          style={{ ...inputBase, flex: 1 }}
          onFocus={(e) => (e.target.style.borderColor = 'var(--color-night)')}
          onBlur={(e) => (e.target.style.borderColor = 'rgba(45,56,82,0.12)')}
        />
        <button disabled={submitDisabled} onClick={handleSubmit} style={sendBtn}>
          <SendIcon />
        </button>
      </div>
      {hint && (
        <span style={{ fontSize: 12, color: '#e53e3e', fontFamily: 'var(--font-body)', paddingLeft: 6 }}>
          {hint}
        </span>
      )}
    </div>
  );
}
