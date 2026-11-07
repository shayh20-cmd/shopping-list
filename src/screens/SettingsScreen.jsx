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

      {isConfigured && <AccountSection />}
    </>
  )
}

// Sign out keeps everything on the server; deleting the account removes the user for good.
function AccountSection() {
  const s = useStore()
  const [ask, setAsk] = useState(null) // 'out' | 'delete'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const shared = s.members.length > 1

  const remove = async () => {
    setBusy(true)
    setErr('')
    const error = await actions.deleteAccount()
    setBusy(false)
    if (error) setErr(error.code === 'PGRST202' ? 'מחיקת חשבון עוד לא הוגדרה ב-Supabase.' : 'המחיקה נכשלה. בדקו את החיבור ונסו שוב.')
  }

  return (
    <section className="form">
      <h2>החשבון שלי</h2>
      <span style={{ fontSize: 15 }}>{s.session?.user?.email}</span>
      <span className="sub">הרשימות והקטלוג שמורים בשרת. גם אם מוחקים את האפליקציה מהטלפון, מתחברים שוב עם אותו מייל וכל הנתונים שם.</span>

      {ask === 'out' ? (
        <div className="inline-form">
          <span>להתנתק מהמכשיר הזה? הנתונים נשארים בחשבון.</span>
          <button className="btn small primary" onClick={actions.signOut}>התנתק</button>
          <button className="btn small" onClick={() => setAsk(null)}>ביטול</button>
        </div>
      ) : (
        <button className="btn" onClick={() => setAsk('out')} disabled={busy}>התנתקות</button>
      )}

      {ask === 'delete' ? (
        <div className="inline-form" role="alertdialog" aria-label="מחיקת חשבון">
          <span>
            {shared
              ? 'למחוק את החשבון לצמיתות? תצאו מהבית, והרשימות יישארו אצל שאר בני הבית.'
              : 'למחוק את החשבון לצמיתות? כל הרשימות, הקטלוג והיסטוריית הקניות יימחקו, ואי אפשר לשחזר.'}
          </span>
          <button className="btn small danger" onClick={remove} disabled={busy}>{busy ? 'מוחק…' : 'כן, מחק את החשבון'}</button>
          <button className="btn small" onClick={() => setAsk(null)} disabled={busy}>ביטול</button>
        </div>
      ) : (
        <button className="btn danger" onClick={() => setAsk('delete')} disabled={busy}>מחיקת חשבון</button>
      )}
      {err && <span className="sub" role="alert" style={{ color: 'var(--warn)' }}>{err}</span>}
    </section>
  )
}
