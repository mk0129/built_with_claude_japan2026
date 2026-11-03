/** Experience Reset 01 のアイコン（線幅 1.8、currentColor）。index.html の icons から */
const PATHS: Record<string, string> = {
  home: '<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  book: '<path d="M12 7c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V6c-3-1-6-1-9 1Z"/><path d="M12 7v14"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  checkcircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  play: '<path d="m9 6 9 6-9 6z"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.5"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 9c2 2 2 4 0 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-5 3-8 8-8s8 3 8 8"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M3 6h1M3 12h1M3 18h1"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.5 2c-1.5 1-2 1.5-2 3"/><path d="M12 17h.01"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  text: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/>',
  sparkle: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
  logout: '<path d="M9 3H4v18h5M13 7l5 5-5 5M8 12h10"/>',
  message: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-3-.4-4.2-1L3 21l1.8-5A8.5 8.5 0 1 1 21 11.5Z"/>',
  file: '<path d="M5 2h9l5 5v15H5V2Z"/><path d="M14 2v5h5M9 12h6M9 16h6"/>',
  shield: '<path d="M12 2 4 6v6c0 5 3 8 8 10 5-2 8-5 8-10V6l-8-4Z"/><path d="m9 12 2 2 4-4"/>',
};

export function Icon({ name, size = "md", className = "" }: { name: keyof typeof PATHS; size?: "sm" | "md" | "xl"; className?: string }) {
  return <svg className={`rs-icon ${size === "md" ? "" : size} ${className}`} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: PATHS[name] ?? PATHS.book }} />;
}
