// 모든 아이콘은 stroke 방식 인라인 SVG, 색은 currentColor
const svg = (d, size = 20, sw = 1.8, extra = '') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;

export const icon = {
  heart: (s = 22) => svg('<path d="M12 21c4.5-3 7-6.2 7-9.5A5.5 5.5 0 0 0 12 6a5.5 5.5 0 0 0-7 5.5C5 14.8 7.5 18 12 21Z"/>', s),
  gear: (s = 17) => svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.6-1.2-1.5-2.6-1.9.6a7.6 7.6 0 0 0-2.6-1.5L14.6 4h-3l-.4 1.9a7.6 7.6 0 0 0-2.6 1.5l-1.9-.6-1.5 2.6L6.6 10.5a7.6 7.6 0 0 0 0 3L5 14.7l1.5 2.6 1.9-.6a7.6 7.6 0 0 0 2.6 1.5l.4 1.8h3l.4-1.8a7.6 7.6 0 0 0 2.6-1.5l1.9.6 1.5-2.6-1.6-1.2Z"/>', s, 1.7),
  camera: (s = 18) => svg('<path d="M4 8a2 2 0 0 1 2-2h1.2l1-1.6A1.5 1.5 0 0 1 9.5 3.6h5a1.5 1.5 0 0 1 1.3.8l1 1.6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z"/><circle cx="12" cy="12.5" r="3.4"/>', s, 1.7),
  moodGood: (s = 26) => svg('<circle cx="12" cy="12" r="9"/><path d="M8.5 10h.01M15.5 10h.01M8 14.5c1 1.2 2.4 1.8 4 1.8s3-.6 4-1.8"/>', s, 1.7),
  moodNormal: (s = 26) => svg('<circle cx="12" cy="12" r="9"/><path d="M8.5 10h.01M15.5 10h.01M8.5 15h7"/>', s, 1.7),
  moodHard: (s = 26) => svg('<circle cx="12" cy="12" r="9"/><path d="M8.5 10h.01M15.5 10h.01M8 16c1-1.2 2.4-1.8 4-1.8s3 .6 4 1.8"/>', s, 1.7),
  sun: (s = 16) => svg('<path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/><circle cx="12" cy="12" r="4"/>', s),
  chat: (s = 13) => svg('<path d="M4 5h16v10H8l-4 4V5Z"/>', s, 1.9),
  tabRecord: (s = 20) => svg('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 10h8M8 14h5"/>', s),
  tabJourney: (s = 20) => svg('<path d="M4 18c3-8 6-10 8-10s5 2 8 10"/><circle cx="12" cy="6" r="2"/>', s),
  tabCoach: (s = 20) => svg('<path d="M4 5h16v10H8l-4 4V5Z"/>', s),
  back: (s = 16) => svg('<path d="M15 5l-7 7 7 7"/>', s, 1.9),
  chevron: (s = 16) => svg('<path d="M9 5l7 7-7 7"/>', s),
  coach: (s = 17) => svg('<path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M14 4l2 2-2 2"/>', s),
  fork: (s = 16) => svg('<path d="M6 3v8M6 3c-2 0-2 3.5 0 5M18 3v18M18 3c-3 0-3 5 0 6"/>', s, 1.7),
  pill: (s = 16) => svg('<rect x="4" y="9" width="16" height="7" rx="3.5" transform="rotate(-30 12 12.5)"/><path d="M9 8l6 9"/>', s, 1.7),
  drop: (s = 16) => svg('<path d="M12 3c2.5 3 5 6.4 5 9.4a5 5 0 0 1-10 0C7 9.4 9.5 6 12 3Z"/>', s, 1.7),
  bolt: (s = 22) => svg('<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/>', s),
  send: (s = 17) => svg('<path d="M4 12l16-8-6 16-3-6-7-2Z"/>', s, 2),
  flame: (s = 16) => svg('<path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-9-1 2-2 3-3.5 3.5C9 8 9 6 9.5 4 7 6 6 9.5 6 12v3a6 6 0 0 0 6 6Z"/>', s, 1.7),
  lock: (s = 26) => svg('<rect x="5" y="10" width="14" height="10" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>', s),
  plus: (s = 14) => svg('<path d="M12 5v14M5 12h14"/>', s, 2),
  refresh: (s = 14) => svg('<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/>', s, 1.9),
  triUp: (s = 9) => `<svg width="${s}" height="${s}" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1l4 6H1z" fill="currentColor"/></svg>`,
  triDown: (s = 9) => `<svg width="${s}" height="${s}" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 9l4-6H1z" fill="currentColor"/></svg>`,
};
