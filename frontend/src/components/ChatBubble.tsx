import React from 'react';

interface ChatBubbleProps {
  message?: string;
  children?: React.ReactNode;
  type: 'bot' | 'user';
  isNew?: boolean;
}

export function ChatBubble({ message, children, type, isNew = false }: ChatBubbleProps) {
  if (type === 'bot') {
    return (
      <div
        style={{
          marginBottom: 28,
          animation: isNew ? 'fadeSlideIn 0.28s ease-out' : 'none',
          fontSize: 'var(--chat-font)',
          lineHeight: 1.75,
          fontFamily: 'var(--font-body)',
          color: '#1a2133',
          whiteSpace: 'pre-line',
        }}
      >
        {children ?? message}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        marginBottom: 28,
        animation: isNew ? 'fadeSlideIn 0.28s ease-out' : 'none',
      }}
    >
      <div style={{
        maxWidth: '68%',
        padding: '10px 16px',
        borderRadius: '18px 4px 18px 18px',
        background: '#EEF0F5',
        color: '#1a2133',
        fontSize: 'var(--chat-font)',
        lineHeight: 1.65,
        fontFamily: 'var(--font-body)',
        whiteSpace: 'pre-line',
      }}>
        {children ?? message}
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 5, marginBottom: 28, paddingTop: 4 }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 7, height: 7, borderRadius: '50%',
          background: '#B0BCCF', display: 'inline-block',
          animation: `bounce 1.2s ease-in-out ${i * 0.18}s infinite`,
        }} />
      ))}
    </div>
  );
}
