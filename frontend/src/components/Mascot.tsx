import React from 'react';

interface MascotProps {
  size?: number;
  animating?: boolean;
}

export function Mascot({ size = 44, animating = false }: MascotProps) {
  const uid = React.useId().replace(/:/g, '');

  return (
    <svg
      viewBox="0 0 240 252"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, overflow: 'visible' }}
    >
      <style>{`
        @keyframes breathe-${uid} {
          0%, 100% { transform: scale(1);     }
          50%       { transform: scale(1.04); }
        }
        @keyframes blink-${uid} {
          0%, 90%, 100% { transform: scaleY(1);   }
          94%            { transform: scaleY(0.1); }
        }
        @keyframes spin-${uid} {
          from { transform: rotate(0deg);   }
          to   { transform: rotate(360deg); }
        }
        #idle-${uid} {
          transform-box: fill-box;
          transform-origin: center;
          animation: breathe-${uid} 3.6s ease-in-out infinite;
        }
        #arcs-${uid} {
          transform-box: fill-box;
          transform-origin: center;
          animation: ${animating
            ? `spin-${uid} 2s linear infinite`
            : `breathe-${uid} 3.6s ease-in-out infinite`};
        }
        #eyes-${uid} {
          transform-box: fill-box;
          transform-origin: center;
          animation: blink-${uid} 5s ease-in-out infinite;
        }
      `}</style>

      <g id={`idle-${uid}`}>
        <g id={`arcs-${uid}`}>
          <path d="M 42.8 170.1 A 92 92 0 0 1 161.8 38.0"  stroke="#7FE5F5" strokeWidth="15" strokeLinecap="round" />
          <path d="M 197.2 69.9 A 92 92 0 0 1 78.2 202.0"  stroke="#1FD0EF" strokeWidth="15" strokeLinecap="round" />
        </g>

        <rect x="70"  y="92" width="40" height="34" rx="12" stroke="#1FD0EF" strokeWidth="5" />
        <rect x="130" y="92" width="40" height="34" rx="12" stroke="#1FD0EF" strokeWidth="5" />
        <path d="M110 101 Q120 96 130 101" stroke="#1FD0EF" strokeWidth="5" strokeLinecap="round" />
        <path d="M70 101 L60 99"   stroke="#1FD0EF" strokeWidth="5" strokeLinecap="round" />
        <path d="M170 101 L180 99" stroke="#1FD0EF" strokeWidth="5" strokeLinecap="round" />

        <g id={`eyes-${uid}`}>
          <circle cx="90"  cy="109" r="5" fill="#1a2133" />
          <circle cx="150" cy="109" r="5" fill="#1a2133" />
        </g>

        <path d="M101 148 Q120 161 139 148" stroke="#1a2133" strokeWidth="5" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}
