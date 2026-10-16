const PATHS = {
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  catalog: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  shop: 'M3 4h2l2.5 11h11L21 8H7M9 20h.01M18 20h.01',
  lists: 'M3 7h6l2 2h10v10H3z',
  check: 'M5 12l5 5L20 7',
}

export default function Icon({ name, size = 20, width = 2 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  )
}
