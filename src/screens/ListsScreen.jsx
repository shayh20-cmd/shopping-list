import { useState } from 'react'
import { useStore, actions } from '../lib/store'
import { isConfigured } from '../lib/supabase'

export default function ListsScreen({ go }) {
  const s = useStore()
  const [name, setName] = useState('')
  const [tag, setTag] = useState('')
  const [kind, setKind] = useState('general')

  const open = (id) => {
    actions.setActiveList(id)
    go('list')
  }

  const create = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    actions.createList({ name, kind, tag })
    setName('')
    setTag('')
    go('list')
  }

  const active = s.lists.find((l) => l.id === s.activeListId)

  return (
    <>
      <header className="head">
        <h1>כל הרשימות</h1>
        <span className="sub">לפי נושאים, משותף לכל הבית</span>
      </header>

      <div className="grid">
        {s.lists.map((l) => {
          const count = s.items.filter((i) => i.list_id === l.id && !i.checked).length
          return (
            <button key={l.id} className={`tile ${l.kind} ${l.id === s.activeListId ? 'active' : ''}`} onClick={() => open(l.id)}>
              <span className="tile-letter">{l.name.slice(0, 1)}</span>
              <span className="tile-title">{l.name}</span>
              <span className="tile-sub">{count} פריטים{l.tag ? ` · ${l.tag}` : ''}</span>
            </button>
          )
        })}
      </div>

      <form className="form" onSubmit={create}>
        <h2>רשימה חדשה</h2>
        <label className="field">
          <span>שם</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: ילדים, ריהוט, חשמל" />
        </label>
        <label className="field">
          <span>תיאור קצר (לא חובה)</span>
          <input className="input" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="למשל: בגדי חורף" />
        </label>
        <div className="chips" style={{ padding: 0 }} role="group" aria-label="סוג רשימה">
          <button type="button" className={`chip ${kind === 'general' ? 'on' : ''}`} aria-pressed={kind === 'general'} onClick={() => setKind('general')}>רשימה כללית</button>
          <button type="button" className={`chip ${kind === 'grocery' ? 'on' : ''}`} aria-pressed={kind === 'grocery'} onClick={() => setKind('grocery')}>סופר, עם קטלוג</button>
        </div>
        <button className="btn primary" type="submit">צור רשימה</button>
      </form>

      {isConfigured && s.household?.invite_code && (
        <div className="form">
          <h2>קוד הצטרפות לבית</h2>
          <span className="sub">בן או בת הזוג נכנסים לאפליקציה, בוחרים "הצטרפות לבית קיים" ומקלידים:</span>
          <span className="invite">{s.household.invite_code}</span>
        </div>
      )}

      <div className="actions">
        {active && s.lists.length > 1 && (
          <button className="btn danger" onClick={() => window.confirm(`למחוק את הרשימה "${active.name}" וכל הפריטים בה?`) && actions.deleteList(active.id)}>
            מחק את הרשימה "{active.name}"
          </button>
        )}
        {isConfigured && <button className="btn" onClick={actions.signOut}>התנתקות</button>}
      </div>
    </>
  )
}
