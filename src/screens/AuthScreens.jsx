import { useState } from 'react'
import { actions } from '../lib/store'

// Google sign-in needs an OAuth app in Google Cloud; turn it on with VITE_ENABLE_GOOGLE=true once set up.
const googleEnabled = import.meta.env.VITE_ENABLE_GOOGLE === 'true'

export function LoginScreen() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const sendLink = async (e) => {
    e.preventDefault()
    const { error } = await actions.signInWithEmail(email.trim())
    if (error) setError('לא הצלחנו לשלוח קישור. בדקו את הכתובת ונסו שוב.')
    else setSent(true)
  }

  return (
    <div className="center">
      <h1>רשימת קניות משותפת</h1>
      <span className="sub">רשימה אחת לשניכם, מתעדכנת בזמן אמת בשני הטלפונים.</span>
      {googleEnabled && <button className="btn primary big" onClick={actions.signInWithGoogle}>כניסה עם Google</button>}
      <form className="form" style={{ margin: 0 }} onSubmit={sendLink}>
        <label className="field">
          <span>{googleEnabled ? 'או קבלו קישור כניסה למייל' : 'כניסה עם קישור למייל'}</span>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
        </label>
        <button className={`btn ${googleEnabled ? '' : 'primary'}`} type="submit">שלחו לי קישור</button>
        {sent && <span className="sub">נשלח. פתחו את המייל בטלפון הזה ולחצו על הקישור.</span>}
        {error && <span className="sub" style={{ color: 'var(--warn)' }}>{error}</span>}
      </form>
    </div>
  )
}

export function SetupScreen() {
  const [name, setName] = useState('הבית שלנו')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (fn) => {
    setBusy(true)
    setError('')
    const err = await fn()
    setBusy(false)
    if (err) setError(err.message?.includes('invite') ? 'הקוד לא נמצא. בדקו אותו ונסו שוב.' : 'משהו השתבש. נסו שוב.')
  }

  return (
    <div className="center">
      <h1>ברוכים הבאים</h1>
      <span className="sub">הראשון מביניכם יוצר בית, והשני מצטרף עם הקוד שמופיע אצלו.</span>
      <form className="form" style={{ margin: 0 }} onSubmit={(e) => { e.preventDefault(); run(() => actions.createHousehold(name)) }}>
        <h2>בית חדש</h2>
        <label className="field">
          <span>שם הבית</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="btn primary" disabled={busy}>צור בית עם קטלוג מוכן</button>
      </form>
      <form className="form" style={{ margin: 0 }} onSubmit={(e) => { e.preventDefault(); run(() => actions.joinHousehold(code)) }}>
        <h2>הצטרפות לבית קיים</h2>
        <label className="field">
          <span>קוד הצטרפות</span>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" autoCapitalize="characters" />
        </label>
        <button className="btn" disabled={busy || !code.trim()}>הצטרף</button>
      </form>
      {error && <span className="sub" role="alert" style={{ color: 'var(--warn)' }}>{error}</span>}
    </div>
  )
}
