import { useState } from 'react'
import { useStore, actions } from '../lib/store'
import { isConfigured } from '../lib/supabase'
import { CATEGORIES, OTHER, categoryRank } from '../data/catalog'

export function SyncBadge() {
  const s = useStore()
  if (!isConfigured) return <span className="sync">שמור במכשיר</span>
  const off = !s.online || s.pending > 0
  return (
    <span className={`sync ${off ? 'off' : ''}`}>
      <span className="dot" />
      {s.online ? (s.pending ? 'מסנכרן…' : 'מסונכרן') : 'לא מחובר, השינויים יישמרו'}
    </span>
  )
}

function Avatars() {
  const { members } = useStore()
  if (!members.length) return null
  return (
    <span className="avatars">
      {members.slice(0, 3).map((m) => (
        <span key={m.user_id} className="avatar" title={m.display_name}>{(m.display_name || '?').slice(0, 1)}</span>
      ))}
    </span>
  )
}

export function groupByCategory(items) {
  const groups = new Map()
  for (const it of [...items].sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || a.name.localeCompare(b.name, 'he'))) {
    const c = it.category || OTHER
    if (!groups.has(c)) groups.set(c, [])
    groups.get(c).push(it)
  }
  return [...groups.entries()]
}

function ItemRow({ item }) {
  const editNote = () => {
    const note = window.prompt(`הערה ל${item.name}`, item.note)
    if (note !== null) actions.updateItem(item, { note: note.trim() })
  }
  return (
    <div className="row">
      <div className="row-main">
        <span className="row-name">{item.name}</span>
        <span className="row-meta">
          {item.note && <span>{item.note}</span>}
          {item.added_by && <span>הוסיף/ה {item.added_by}</span>}
          <button className="link-btn" onClick={editNote}>{item.note ? 'ערוך הערה' : 'הוסף הערה'}</button>
        </span>
      </div>
      <div className="stepper">
        <button aria-label={`הפחת ${item.name}`} onClick={() => actions.setQty(item, item.qty - 1)}>−</button>
        <span>{item.qty}</span>
        <button aria-label={`הוסף ${item.name}`} onClick={() => actions.setQty(item, item.qty + 1)}>+</button>
      </div>
    </div>
  )
}

export function QuickAdd({ list }) {
  const { products } = useStore()
  const [text, setText] = useState('')
  const [category, setCategory] = useState(OTHER)
  const name = text.trim()
  const known = products.find((p) => p.name === name)
  const isGrocery = list.kind === 'grocery'

  const submit = (e) => {
    e.preventDefault()
    if (!name) return
    if (isGrocery) {
      const p = known ?? actions.addProduct({ name, category })
      actions.addToList(list.id, { name: p.name, category: p.category, productId: p.id })
    } else {
      actions.addToList(list.id, { name })
    }
    setText('')
    setCategory(OTHER)
  }

  return (
    <form onSubmit={submit}>
      <div className="quick-add">
        <label className="field" style={{ flex: 1 }}>
          <span className="sr">הוספת פריט</span>
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="הוסף פריט…"
            list={isGrocery ? 'product-names' : undefined} enterKeyHint="done" />
        </label>
        <button className="btn primary" type="submit" style={{ alignSelf: 'flex-end' }}>הוסף</button>
      </div>
      {isGrocery && name && !known && (
        <div className="quick-add">
          <label className="field" style={{ flex: 1 }}>
            <span>מוצר חדש בקטלוג, באיזו קטגוריה?</span>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
      )}
      {isGrocery && (
        <datalist id="product-names">
          {products.map((p) => <option key={p.id} value={p.name} />)}
        </datalist>
      )}
    </form>
  )
}

export default function ListScreen({ list, go }) {
  const { items } = useStore()
  if (!list) return <div className="empty">אין רשימות עדיין. צרו אחת במסך "כל הרשימות".</div>
  const mine = items.filter((i) => i.list_id === list.id)
  const groups = list.kind === 'grocery' ? groupByCategory(mine) : [['', [...mine].sort((a, b) => a.created_at.localeCompare(b.created_at))]]

  return (
    <>
      <header className="head">
        <div className="head-row"><SyncBadge /><Avatars /></div>
        <h1>{list.name}</h1>
        <span className="sub">{list.tag ? `${list.tag} · ` : ''}{mine.length} פריטים</span>
      </header>
      <QuickAdd list={list} />
      {mine.length === 0 && (
        <div className="empty">
          הרשימה ריקה.{list.kind === 'grocery' ? ' הוסיפו פריטים מהקטלוג או בשורה למעלה.' : ' הוסיפו פריטים בשורה למעלה.'}
        </div>
      )}
      {groups.map(([title, rows]) => (
        <section key={title || 'all'}>
          {title && <div className="group-title">{title}</div>}
          <div className="card" style={title ? undefined : { marginTop: 8 }}>
            {rows.map((it) => <ItemRow key={it.id} item={it} />)}
          </div>
        </section>
      ))}
      {mine.length > 0 && (
        <div className="actions">
          <button className="btn primary big" onClick={() => go('shop')}>התחל קנייה</button>
        </div>
      )}
    </>
  )
}
