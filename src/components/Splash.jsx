import { useEffect, useState } from 'react'
import './splash.css'

// Animated launch screen. Plays once per app session, then fades out; a tap skips it.
const SEEN_KEY = 'basket-splash-seen'
const PLAY_MS = 3400
const FADE_MS = 450

function alreadySeen() {
  try { return sessionStorage.getItem(SEEN_KEY) === '1' } catch { return false }
}

export default function Splash() {
  const [phase, setPhase] = useState(() => (alreadySeen() ? 'gone' : 'play'))

  useEffect(() => {
    if (phase === 'play') {
      const t = setTimeout(() => setPhase('fade'), PLAY_MS)
      return () => clearTimeout(t)
    }
    if (phase === 'fade') {
      try { sessionStorage.setItem(SEEN_KEY, '1') } catch { /* private mode */ }
      const t = setTimeout(() => setPhase('gone'), FADE_MS)
      return () => clearTimeout(t)
    }
  }, [phase])

  if (phase === 'gone') return null

  return (
    <div className={`splash ${phase === 'fade' ? 'out' : ''}`} onClick={() => setPhase('fade')} role="presentation">
      <div className="splash-art">
        <div className="splash-halo" />
        <svg width="220" height="187" viewBox="0 0 200 170" fill="none" stroke="currentColor" strokeWidth="3.5"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <g className="sp-drop" style={{ '--d': '1.15s' }}>
            <path d="M66 94 C72 62, 92 36, 112 27 C120 24, 125 30, 119 36 C101 52, 88 72, 82 94" />
            <path d="M86 60 L94 66 M96 47 L104 53" />
          </g>
          <g className="sp-drop" style={{ '--d': '1.35s' }}>
            <path d="M124 94 C121 72, 130 57, 147 50 C150 67, 141 83, 130 94" />
            <path d="M127 92 C131 78, 137 67, 145 55" />
          </g>
          <g className="sp-drop" style={{ '--d': '1.55s' }}>
            <path d="M100 72 C90 66 81 74 83 84 C85 93 93 97 100 94 C107 97 115 93 117 84 C119 74 110 66 100 72 Z" />
            <path d="M100 72 C100 67 102 64 105 62" />
          </g>
          <g className="sp-draw">
            <path pathLength="1" style={{ '--d': '.3s' }} d="M30 96 C70 92, 130 100, 170 95" />
            <path pathLength="1" style={{ '--d': '.55s' }} d="M38 98 L54 150 C84 154, 116 154, 146 150 L162 98" />
            <path pathLength="1" style={{ '--d': '.9s' }} d="M45 118 C80 122, 120 116, 155 119" />
            <path pathLength="1" style={{ '--d': '1s' }} d="M50 135 C83 139, 117 133, 150 136" />
          </g>
        </svg>
        <Star className="sp-star big" d="2.4s" />
        <Star className="sp-star small" d="2.6s" />
      </div>
      <h1 className="splash-name" aria-label="BASKET">
        {'BASKET'.split('').map((ch, i) => (
          <span key={i} className="sp-ltr" style={{ '--d': `${1.7 + i * 0.08}s` }} aria-hidden="true">{ch}</span>
        ))}
      </h1>
      <p className="splash-motto sp-fade" style={{ '--d': '2.3s' }}>
        Same Shopping. <b>Smarter Choices.</b>
      </p>
    </div>
  )
}

function Star({ className, d }) {
  return (
    <svg className={className} style={{ '--d': d }} viewBox="0 0 60 60" fill="currentColor" aria-hidden="true">
      <path d="M30 4 C32 24 36 28 56 30 C36 32 32 36 30 56 C28 36 24 32 4 30 C24 28 28 24 30 4 Z" />
    </svg>
  )
}
