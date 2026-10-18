/** Inline SVG icons (own drawings, 24×24). Colours via currentColor unless stated. */
const svg = (body: string, vb = '0 0 24 24'): string => `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICON = {
  coin: svg(
    '<circle cx="12" cy="12" r="10" fill="#f2c14e" stroke="#b9851f" stroke-width="2"/><circle cx="12" cy="12" r="6.2" fill="none" stroke="#d9a032" stroke-width="1.6"/><path d="M12 8.2v7.6M10 10.2c0-1 4-1.4 4 .3 0 1.8-4 1.1-4 3 0 1.5 4 1.3 4 .2" fill="none" stroke="#9a6a14" stroke-width="1.5" stroke-linecap="round"/>',
  ),
  star: svg('<path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" fill="currentColor"/>'),
  flame: svg('<path d="M12 2.5c1 3.2 5.5 5.6 5.5 10.6A5.5 5.5 0 0 1 6.5 13c0-2.4 1.3-3.9 2.4-5 .2 1.7.9 2.8 2 3.3-.4-3.2.3-6.2 1.1-8.8z" fill="currentColor"/><path d="M12 13c.8 1.3 2.3 2 2.3 3.8a2.3 2.3 0 0 1-4.6 0c0-1.3.9-2.2 2.3-3.8z" fill="#ffe08a"/>'),
  broom: svg('<path d="M14.5 3.5l-3.2 7.4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M8.2 10.4l6.3 2.7-1.8 4.3c-.8 1.9-3 3.6-6.6 3.9.6-1.2.6-2.4.3-3.4-1 .4-2.1.4-3 .1 1.9-1.6 3.3-4.6 4.8-7.6z" fill="currentColor"/>'),
  box: svg('<path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z" fill="currentColor" opacity=".9"/><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9" fill="none" stroke="#fff8ea" stroke-width="1.4" opacity=".75"/>'),
  tag: svg('<path d="M3 12.6V4.2C3 3.5 3.5 3 4.2 3h8.4l8.4 8.4-8.6 8.6z" fill="currentColor"/><circle cx="7.6" cy="7.6" r="1.8" fill="#fff8ea"/>'),
  up: svg('<path d="M12 3l7.5 8.2h-4.6V21H9.1v-9.8H4.5z" fill="currentColor"/>'),
  cart: svg('<path d="M3 6h18l-1.4 8.2a2 2 0 0 1-2 1.7H6.4a2 2 0 0 1-2-1.7z" fill="currentColor"/><path d="M2 4h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="7.5" cy="19" r="2" fill="currentColor"/><circle cx="16.5" cy="19" r="2" fill="currentColor"/><path d="M6 9h12" stroke="#fff8ea" stroke-width="1.4" opacity=".8"/>'),
  plus: svg('<path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>'),
  gear: svg('<path d="M10.3 2.5h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9-2.6-.5v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8z" fill="currentColor"/><circle cx="12" cy="12" r="3.4" fill="#fff8ea"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'),
  check: svg('<path d="M4.5 12.5l5 5 10-11" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>'),
  people: svg('<circle cx="9" cy="7.5" r="3.5" fill="currentColor"/><path d="M2.5 20c0-4 2.9-6.5 6.5-6.5s6.5 2.5 6.5 6.5z" fill="currentColor"/><circle cx="16.8" cy="8.5" r="2.8" fill="currentColor" opacity=".7"/><path d="M15.5 13.6c3.7-.3 6 2 6 5.9h-4.3" fill="currentColor" opacity=".7"/>'),
  sun: svg('<circle cx="12" cy="12" r="4.6" fill="currentColor"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7L7 17M17 7l1.7-1.7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  soundOn: svg('<path d="M3.5 9h4l5-4.5v15L7.5 15h-4z" fill="currentColor"/><path d="M15.5 8.5c1.8 1.9 1.8 5.1 0 7M18.3 5.8c3.3 3.4 3.3 9 0 12.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  soundOff: svg('<path d="M3.5 9h4l5-4.5v15L7.5 15h-4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  sparkle: svg('<path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z" fill="currentColor"/>'),
  target: svg('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="4.6" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>'),
  heart: svg('<path d="M12 20.5S3 15 3 8.8A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 9 2.2C21 15 12 20.5 12 20.5z" fill="#e8574a"/>'),
  angry: svg('<path d="M4 12a8 8 0 1 0 16 0 8 8 0 1 0-16 0" fill="#7c8696"/><path d="M8 9.5l2.5 1.2M16 9.5l-2.5 1.2M8.8 16c1.8-1.4 4.6-1.4 6.4 0" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"/>'),
  hotdog: svg(
    '<rect x="2.5" y="10" width="19" height="7.5" rx="3.75" fill="#e2b071"/><rect x="1.5" y="8.6" width="21" height="4.6" rx="2.3" fill="#c4553b"/><path d="M4.5 10.9c1.5-1.2 2.5 1.2 4 0s2.5 1.2 4 0 2.5 1.2 4 0 2.5 1.2 3 0" fill="none" stroke="#f2c93a" stroke-width="1.3" stroke-linecap="round"/><path d="M3 13.6h18" stroke="#c99257" stroke-width="1.2"/>',
  ),
  burger: svg(
    '<path d="M3 11a9 6.5 0 0 1 18 0z" fill="#e2a85e"/><rect x="2.5" y="11.5" width="19" height="2.4" rx="1.2" fill="#7fb24a"/><rect x="3" y="13.6" width="18" height="2" rx="1" fill="#f2c14e"/><rect x="2.5" y="15.2" width="19" height="2.8" rx="1.4" fill="#6b3d24"/><path d="M3 18.5h18a3 3 0 0 1-3 2.5H6a3 3 0 0 1-3-2.5z" fill="#e2a85e"/><circle cx="9" cy="7.6" r=".7" fill="#fff4dc"/><circle cx="13" cy="6.8" r=".7" fill="#fff4dc"/><circle cx="15.5" cy="8.6" r=".7" fill="#fff4dc"/>',
  ),
  crepe: svg('<path d="M2.5 16.5L12 4l9.5 12.5c-3 2.5-16 2.5-19 0z" fill="#f1d29a"/><path d="M7 15.2c2-1 3.5 0 5-1s3 0 5-1" stroke="#6b3d24" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M2.5 16.5c3 2.5 16 2.5 19 0" stroke="#d9ad6a" stroke-width="1.4" fill="none"/>'),
  shop: svg('<path d="M3 9l1.6-5h14.8L21 9z" fill="currentColor"/><path d="M3 9h18v2a3 3 0 0 1-4.5 2.6A3 3 0 0 1 12 13a3 3 0 0 1-4.5.6A3 3 0 0 1 3 11z" fill="currentColor" opacity=".75"/><path d="M5 14v6.5h14V14" fill="none" stroke="currentColor" stroke-width="2"/><rect x="10" y="15.5" width="4" height="5" fill="currentColor"/>'),
  key: svg('<circle cx="8" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M12.3 12H21M18 12v3.5M15.5 12v2.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'),
  layout: svg('<rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="6" y="6" width="5" height="4" fill="currentColor"/><rect x="13.5" y="6" width="4.5" height="8" fill="currentColor"/><rect x="6" y="13" width="5" height="5" fill="currentColor" opacity=".7"/>'),
  rotate: svg('<path d="M19 12a7 7 0 1 1-2.1-5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M18.5 2.8v4.6h-4.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'),
  move: svg('<path d="M12 2.5v19M2.5 12h19" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M9 5.5l3-3 3 3M9 18.5l3 3 3-3M5.5 9l-3 3 3 3M18.5 9l3 3-3 3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  swap: svg('<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'),
  trash: svg('<path d="M4 6.5h16M9.5 6.5V4h5v2.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M6 6.5l1 14h10l1-14z" fill="currentColor"/>'),
  lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2.4" fill="currentColor"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.4"/>'),
  speed: svg('<path d="M13 2L4.5 13.5H11L10 22l9-12.2h-6.6z" fill="currentColor"/>'),
  grill: svg('<rect x="3" y="8" width="18" height="5" rx="1.5" fill="currentColor"/><path d="M6 13l-2 7M18 13l2 7M12 13v7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7 4.5c1 1 1 2 0 3M12 3.5c1 1 1 2.5 0 4M17 4.5c1 1 1 2 0 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>'),
  recipe: svg('<path d="M5 3h11l3 3v15H5z" fill="currentColor"/><path d="M8 9h8M8 12.5h8M8 16h5" stroke="#fff8ea" stroke-width="1.6" stroke-linecap="round"/>'),
  sign: svg('<rect x="3" y="4" width="18" height="11" rx="2" fill="currentColor"/><path d="M8 15v6M16 15v6" stroke="currentColor" stroke-width="2"/><path d="M7 9.5h10" stroke="#ffe08a" stroke-width="2.2" stroke-linecap="round"/>'),
  comfort: svg('<path d="M3 11a9 7 0 0 1 18 0z" fill="currentColor"/><path d="M12 11v9M9 20h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  pantry: svg('<rect x="3.5" y="7" width="17" height="13" rx="2" fill="currentColor"/><rect x="2.5" y="4.5" width="19" height="4" rx="1.4" fill="currentColor" opacity=".75"/><path d="M9 12.5h6" stroke="#fff8ea" stroke-width="2" stroke-linecap="round"/>'),
  field: svg('<path d="M2 20l4-9h12l4 9z" fill="currentColor" opacity=".55"/><path d="M5 20l2.6-9M9.5 20l1-9M14.5 20l-1-9M19 20l-2.6-9" stroke="currentColor" stroke-width="1.6"/><path d="M12 9.5V4.5M12 6c-1.6-1.8-3.4-1.4-3.6-.4 1 .9 2.3 1 3.6.4zM12 6c1.6-1.8 3.4-1.4 3.6-.4-1 .9-2.3 1-3.6.4z" stroke="currentColor" stroke-width="1.6" fill="currentColor" stroke-linecap="round"/>'),
  build: svg('<path d="M3 21h18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M5 21v-9l7-5 7 5v9" fill="currentColor" opacity=".8"/><path d="M14.5 4.5l5 5-2 2-5-5z" fill="currentColor"/><path d="M13 13.5h-2v7.5h2z" fill="#fff8ea" opacity=".8"/>'),
  chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M21 20H3" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'),
} as const;

export type IconName = keyof typeof ICON;
