import { useState } from 'react'
import { useStore, actions } from '../lib/store'
import { isConfigured } from '../lib/supabase'

const RADII = [1, 3, 5, 10, 20]

export default function SettingsScreen() {
  const s = useStore()
  const { radiusKm, home } = s.settings ?? { radiusKm: 5, home: null }
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState('')

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return setLocError('הדפדפן לא תומך באיתור מיקום.')
    setLocating(true)
    setLocError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        actions.setSettings({ home: { lat: pos.coords.latitude, lng: pos.coords.longitude } })
      },
      () => {
        setLocating(false)
        setLocError('לא הצלחנו לקבל מיקום. בדקו שהרשאת המיקום פתוחה לדפדפן.')
      },
      { enableHighAccuracy: false, timeout: 15000 },
    )
  }

  return (
    <>
      <header className="head">
        <h1>הגדרות</h1>
        <span className="sub">{s.household?.name}</span>
      </header>

      <section className="form">
        <h2>אזור חיפוש סופרים</h2>
        <span className="sub">לפיו נחפש את הסניף הזול ביותר לרשימה שלכם.</span>
        <div className="field">
          <span>מיקום</span>
          <span style={{ color: 'var(--ink)', fontSize: 15 }}>
            {home ? `נשמר (${home.lat.toFixed(3)}, ${home.lng.toFixed(3)})` : 'עוד לא נקבע'}
          </span>
        </div>
        <button className="btn" onClick={useCurrentLocation} disabled={locating}>
          {locating ? 'מאתר…' : home ? 'עדכן למיקום הנוכחי' : 'השתמש במיקום הנוכחי'}
        </button>
        {locError && <span className="sub" role="alert" style={{ color: 'var(--warn)' }}>{locError}</span>}
        <div className="field">
          <span>רדיוס</span>
          <div className="chips" style={{ padding: 0, flexWrap: 'wrap' }} role="group" aria-label="רדיוס חיפוש">
            {RADII.map((r) => (
              <button key={r} className={`chip ${radiusKm === r ? 'on' : ''}`} aria-pressed={radiusKm === r}
                onClick={() => actions.setSettings({ radiusKm: r })}>
                {r} ק"מ
              </button>
            ))}
          </div>
        </div>
      </section>

      {isConfigured && (
        <section className="form">
          <h2>משתמשים בבית</h2>
          {s.members.map((m) => (
            <span key={m.user_id} style={{ fontSize: 15 }}>{m.display_name || 'ללא שם'}</span>
          ))}
          {s.household?.invite_code && (
            <>
              <span className="sub">כדי לצרף את בן או בת הזוג: נכנסים לאפליקציה, בוחרים "הצטרפות לבית קיים" ומקלידים:</span>
              <span className="invite">{s.household.invite_code}</span>
            </>
          )}
        </section>
      )}

      {isConfigured && (
        <div className="actions">
          <button className="btn" onClick={actions.signOut}>התנתקות</button>
        </div>
      )}
    </>
  )
}
