import React, { useState } from 'react';

const COLORS = ['#1FD0EF', '#2D3852', '#FFB950', '#FF6B6B', '#51CF66', '#A78BFA', '#FB923C', '#F472B6'];

interface Particle {
  id: number; left: number; delay: number; duration: number;
  color: string; size: number; isCircle: boolean; drift: number; rotation: number;
}

export function Confetti() {
  const [particles] = useState<Particle[]>(() =>
    Array.from({ length: 70 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 3,
      duration: 2.5 + Math.random() * 2.5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 6 + Math.random() * 8,
      isCircle: Math.random() > 0.5,
      drift: (Math.random() - 0.5) * 80,
      rotation: Math.random() * 720,
    }))
  );

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      pointerEvents: 'none', zIndex: 100, overflow: 'hidden',
    }}>
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: '-16px',
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.isCircle ? '50%' : '2px',
            animation: `confettiFall ${p.duration}s ${p.delay}s ease-in forwards`,
            '--drift': `${p.drift}px`,
            '--rot': `${p.rotation}deg`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
