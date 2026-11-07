import { useEffect, useState } from 'react'
import { useStore, actions, displayName } from '../lib/store'
import { isConfigured } from '../lib/supabase'
import './splash.css'

// Animated launch screen, about 3 s: the cart dashes across the screen three times, then
// drives in from the left, brakes into place as the B of BASKET, and the rest of the name,
// the motto, the enter button and the credit line follow. It stays until the enter button is
// pressed; a tap elsewhere skips to the end. Plays once per app session.
const SEEN_KEY = 'basket-splash-seen'
const FADE_MS = 450
// Wordmark: the B is drawn as a cart; the rest is Rubik 700 set at 1000 units with 40 units tracking.
const LETTERS = [['A', 744], ['S', 1500], ['K', 2203], ['E', 2906], ['T', 3585]]
// The three fly-bys: where each crosses, which way, how big and when.
const PASSES = [
  { y0: '14vh', y1: '10vh', r: '-3deg', s: 1, d: '.05s', t: '.42s' },
  { y0: '70vh', y1: '74vh', r: '3deg', s: 1.3, d: '.42s', t: '.4s', rtl: true },
  { y0: '88vh', y1: '30vh', r: '-22deg', s: .8, d: '.78s', t: '.36s' },
]

// ?intro in the address plays it again, for showing it off or checking a change.
function alreadySeen() {
  if (new URLSearchParams(location.search).has('intro')) return false
  try { return sessionStorage.getItem(SEEN_KEY) === '1' } catch { return false }
}

export default function Splash() {
  const [phase, setPhase] = useState(() => (alreadySeen() ? 'gone' : 'play'))
  const [skipped, setSkipped] = useState(false)
  const [askOut, setAskOut] = useState(false)
  const s = useStore()
  const signedIn = isConfigured && s.session

  useEffect(() => {
    if (phase === 'fade') {
      try { sessionStorage.setItem(SEEN_KEY, '1') } catch { /* private mode */ }
      const t = setTimeout(() => setPhase('gone'), FADE_MS)
      return () => clearTimeout(t)
    }
  }, [phase])

  if (phase === 'gone') return null

  return (
    <div className={`splash ${phase === 'fade' ? 'out' : ''} ${skipped ? 'skip' : ''}`} onClick={() => setSkipped(true)}>
      <div className="sp-sky" aria-hidden="true">
        {PASSES.map((p, i) => (
          <div key={i} className={`sp-fly ${p.rtl ? 'rtl' : ''}`}
            style={{ '--y0': p.y0, '--y1': p.y1, '--r': p.r, '--s': p.s, '--d': p.d, '--t': p.t }}>
            <div className="sp-fly-body">
              <Trail />
              <Cart />
            </div>
          </div>
        ))}
      </div>

      <h1 className="splash-name" aria-label="BASKET">
        <span className="sp-b-move">
          <Trail className="sp-b-trail" />
          <span className="sp-b-body">
            <Cart className="sp-b" />
          </span>
          <Skid />
        </span>
        <svg className="sp-rest" viewBox="744 -720 3500 960" fill="currentColor" aria-hidden="true">
          {LETTERS.map(([ch, x], i) => (
            <text key={ch} className="sp-ltr" style={{ '--d': `${2 + i * 0.06}s` }} x={x} y="0">{ch}</text>
          ))}
        </svg>
      </h1>
      <p className="splash-motto sp-fade" style={{ '--d': '2.4s' }}>
        Same Shopping. <b>Smarter Choices.</b>
      </p>
      <div className="splash-enter sp-fade" style={{ '--d': '2.7s' }} dir="rtl">
        <button type="button" className="sp-enter-btn" onClick={(e) => { e.stopPropagation(); setPhase('fade') }}>
          כניסה
        </button>
        {signedIn && (
          <p className="sp-user" onClick={(e) => e.stopPropagation()}>
            {askOut ? (
              <>
                <span>להתנתק מהמכשיר הזה?</span>
                <button type="button" onClick={() => { setAskOut(false); actions.signOut() }}>כן</button>
                <button type="button" onClick={() => setAskOut(false)}>לא</button>
              </>
            ) : (
              <>
                <span className="sp-user-name" dir="auto">{displayName(s.session)}</span>
                <span aria-hidden="true">·</span>
                <button type="button" onClick={() => setAskOut(true)}>התנתקות</button>
              </>
            )}
          </p>
        )}
      </div>
      <p className="splash-credit sp-fade" style={{ '--d': '2.9s' }}>
        © {new Date().getFullYear()} Shay Hershkovitz. All rights reserved.
      </p>
    </div>
  )
}

// The app's logo: a B whose bowls are the cart's basket, a handle at the top left, two wheels.
function Cart({ className = 'sp-cart' }) {
  return (
    <svg className={className} viewBox="-200 -720 944 960" fill="currentColor" stroke="currentColor" aria-hidden="true">
      <rect x="70" y="-703" width="180" height="703" rx="24" stroke="none" />
      <path d="M-120 -638 H160 M160 -638 H420 C635 -638 635 -358 420 -358 H160 M160 -358 H440 C647 -358 647 -65 440 -65 H160"
        fill="none" strokeWidth="130" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="230" cy="150" r="78" stroke="none" />
      <circle cx="530" cy="150" r="78" stroke="none" />
    </svg>
  )
}

// Speed lines and dust puffs that stream out behind the cart, in light cream strokes.
function Trail({ className = 'sp-trail' }) {
  return (
    <svg className={className} viewBox="0 0 240 100" fill="none" stroke="currentColor" strokeWidth="3"
      strokeLinecap="round" aria-hidden="true">
      <path className="sp-streak" d="M40 14 H200" style={{ '--sd': '0s' }} />
      <path className="sp-streak" d="M90 34 H228" style={{ '--sd': '-.1s' }} />
      <path className="sp-streak" d="M10 54 H170" style={{ '--sd': '-.05s' }} />
      <path className="sp-streak" d="M120 70 H215" style={{ '--sd': '-.15s' }} />
      {[[214, 90, '0s'], [196, 86, '-.1s'], [222, 84, '-.2s'], [204, 92, '-.3s']].map(([x, y, pd], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <g className="sp-puff" style={{ '--pd': pd }}>
            <circle cx="-9" cy="1" r="6" />
            <circle cx="0" cy="-4" r="8" />
            <circle cx="10" cy="1" r="5.5" />
          </g>
        </g>
      ))}
    </svg>
  )
}

// The brake: skid marks behind the wheels and a dust cloud thrown forward when the cart stops.
function Skid() {
  return (
    <svg className="sp-skid" viewBox="0 0 200 60" fill="none" stroke="currentColor" strokeWidth="3"
      strokeLinecap="round" aria-hidden="true">
      <path className="sp-skid-line" d="M8 52 H70" />
      <path className="sp-skid-line" d="M30 44 H62" />
      {[[150, 40, '0s'], [168, 30, '.05s'], [136, 28, '.08s']].map(([x, y, bd], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <g className="sp-burst" style={{ '--bd': bd }}>
            <circle cx="-8" cy="1" r="6" />
            <circle cx="0" cy="-4" r="8" />
            <circle cx="9" cy="1" r="5" />
          </g>
        </g>
      ))}
    </svg>
  )
}
