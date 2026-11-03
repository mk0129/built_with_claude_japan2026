/** 比較用の最小アイコン集（線幅 1.75、currentColor）。本番には未導入 */
const base = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
export const IconHome = () => (
  <svg {...base}>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5.5 10.5V20h13v-9.5" />
  </svg>
);
export const IconRecord = () => (
  <svg {...base}>
    <path d="M6 4h9l4 4v12H6z" />
    <path d="M9 13h6M9 17h6" />
  </svg>
);
export const IconShare = () => (
  <svg {...base}>
    <rect x="4" y="4" width="6" height="6" rx="1" />
    <rect x="14" y="4" width="6" height="6" rx="1" />
    <rect x="4" y="14" width="6" height="6" rx="1" />
    <path d="M14 14h2v2h-2zM18 14h2v6h-6v-2" />
  </svg>
);
export const IconPlay = () => (
  <svg {...base} fill="currentColor" stroke="none">
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
);
export const IconCheck = () => (
  <svg {...base}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
export const IconClock = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
export const IconQuestion = () => (
  <svg {...base}>
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 1-1 1.7" />
    <circle cx="12" cy="17" r=".6" fill="currentColor" />
    <circle cx="12" cy="12" r="9" />
  </svg>
);
export const IconAlert = () => (
  <svg {...base}>
    <path d="M12 4 3 20h18z" />
    <path d="M12 10v4M12 17v.5" />
  </svg>
);
