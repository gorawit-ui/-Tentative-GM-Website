// A09 — line icons drawn as in the Part 5 prototype (24px grid, stroke = currentColor); always next to a
// text label or with an accessible name on the control (Part 3 §0.1: icon/text with colour).
const PATHS = {
  home: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />,
  list: (
    <>
      <rect x="5" y="4" width="15" height="17" rx="2" />
      <path d="M9 3h7v4H9zM9 11h7M9 15h5" />
    </>
  ),
  repair: <path d="m14 6 4 4m-9 2-6 6a2.1 2.1 0 0 0 3 3l6-6M14 3a6 6 0 0 0-6 8l5 5a6 6 0 0 0 8-6l-4 3-4-4 3-4Z" />,
  board: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M15 4v16M5.5 8h1M11.5 8h1M17.5 8h1" />
    </>
  ),
  users: <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2M12 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  logout: <path d="M10 3H4v18h6M14 8l5 4-5 4M8 12h11" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  location: (
    <>
      <path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  qr: <path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h3v3h-6z" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  file: <path d="M14 3H5v18h14V8ZM14 3v6h5M8 13h8M8 17h6" />,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  back: <path d="m15 5-7 7 7 7" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { readonly name: IconName }) {
  return (
    <svg className="gm-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
