import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const style = document.createElement('style');
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --color-sand:       #FAF3DC;
    --color-sun:        #FFB950;
    --color-water:      #1FD0EF;
    --color-sea:        #1158E5;
    --color-night:      #2D3852;
    --color-cloud:      #B9C1D4;
    --color-sky:        #F2F8FA;
    --font-title:       'Taviraj', serif;
    --font-body:        'Fustat', sans-serif;
    --radius-bubble:    18px;
    --radius-button:    999px;
    --radius-input:     14px;

    --chat-font:        18px;
    --chat-padding:     0 48px 0 12px;
    --chat-gap:         24px;
    --mascot-size:      96px;
    --input-padding:    0 48px;
  }

  @media (max-width: 1100px) {
    :root {
      --chat-font:    17px;
      --chat-padding: 0 32px 0 8px;
      --mascot-size:  80px;
    }
  }

  @media (max-width: 860px) {
    :root {
      --chat-font:    16px;
      --chat-padding: 0 24px 0 8px;
      --chat-gap:     16px;
      --mascot-size:  64px;
    }
  }

  @media (max-width: 680px) {
    :root {
      --chat-font:     16px;
      --chat-padding:  0 16px;
      --input-padding: 0 16px;
      --chat-gap:      0px;
    }
    .mascot-col { display: none !important; }
  }

  .mascot-col svg {
    width:  var(--mascot-size) !important;
    height: var(--mascot-size) !important;
  }

  html, body { height: 100%; overflow: hidden; }
  body { font-family: var(--font-body); background: #1C2840; }
  #root { height: 100%; }

  @keyframes fadeSlideIn {
    from { opacity: 0; transform: translateY(10px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes confettiFall {
    0%   { transform: translateY(0) translateX(0) rotate(0deg); opacity: 1; }
    80%  { opacity: 1; }
    100% { transform: translateY(110vh) translateX(var(--drift)) rotate(var(--rot)); opacity: 0; }
  }

  @keyframes bounce {
    0%, 60%, 100% { transform: translateY(0); }
    30%            { transform: translateY(-5px); }
  }

  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--color-cloud); border-radius: 2px; }

  button:disabled { opacity: 0.45; cursor: not-allowed !important; }

  @media (max-width: 680px) {
    .app-sidebar      { display: none !important; }
    .mobile-block-bar { display: flex !important; }
  }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
