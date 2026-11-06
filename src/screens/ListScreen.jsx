import { useState } from 'react'
import { useStore, actions } from '../lib/store'
import { isConfigured } from '../lib/supabase'
import { CATEGORIES, OTHER, categoryRank, qtyLabel } from '../data/catalog'
import ShopBody from './ShopScreen'
import { ExactButton } from '../components/ProductPicker'

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
  const { products } = useStore()
  const product = item.product_id ? products.find((p) => p.id === item.product_id) : null
  return (
    <div className="row">
      <div className="row-main">
        <span className="row-name">{item.name}</span>
        {product?.barcode_name && <span className="row-meta">{product.barcode_name}</span>}
      </div>
      <ExactButton product={product} />
      <div className="stepper">
        <button aria-label={`הפחת ${item.name}`} onClick={() => actions.setQty(item, item.qty - 1)}>−</button>
        <span>{qtyLabel(item)}</span>
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

// Start the trip from a fixed list, or keep this trip as a new fixed list.
function BaseSheet({ list, onClose }) {
  const { items, lists } = useStore()
  const fixedLists = lists.filter((l) => l.kind === 'fixed')
  const bases = list.based_on ?? []
  const [newName, setNewName] = useState('')
  const [notice, setNotice] = useState('')
  const toBuy = items.filter((i) => i.list_id === list.id && !i.checked).length

  const pick = (f) => {
    actions.loadFixedList(f.id, list.id)
    onClose()
  }
  const saveNew = (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    const f = actions.createFixedList(newName)
    actions.saveAsFixedList(list.id, f.id)
    setNotice(`נשמרה רשימה קבועה חדשה: "${f.name}". אפשר לערוך אותה בקטלוג.`)
    setNewName('')
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="בסיס לקנייה" onClick={(e) => e.stopPropagation()}>
        <h2>על איזו רשימה קבועה לבסס?</h2>
        <p className="sub" style={{ margin: '0 20px 8px' }}>המוצרים שלה ייכנסו לקנייה, ואחר כך אפשר להוסיף ולהוריד. הרשימה הקבועה עצמה לא משתנה.</p>
        {notice && <div className="notice" role="status">{notice}</div>}
        {fixedLists.length === 0
          ? <div className="empty">עוד אין רשימות קבועות. יוצרים אותן בקטלוג, תחת "רשימות קבועות".</div>
          : (
            <div className="card">
              {fixedLists.map((f) => (
                <button key={f.id} className="row" onClick={() => pick(f)}>
                  <span className="row-main">
                    <span className="row-name">{f.name}</span>
                    <span className="row-meta">{items.filter((i) => i.list_id === f.id).length} פריטים{bases.includes(f.id) ? ' · כבר בבסיס' : ''}</span>
                  </span>
                  <span className="btn small primary" aria-hidden="true">בסס</span>
                </button>
              ))}
            </div>
          )}
        {toBuy > 0 && (
          <form className="quick-add" style={{ marginTop: 16 }} onSubmit={saveNew}>
            <label className="field" style={{ flex: 1 }}>
              <span>או לשמור את הקנייה הזו כרשימה קבועה חדשה</span>
              <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="למשל: בסיס שבועי" />
            </label>
            <button className="btn primary" type="submit" style={{ alignSelf: 'flex-end' }}>שמור</button>
          </form>
        )}
        <div className="actions"><button className="btn" onClick={onClose}>סגור</button></div>
      </div>
    </div>
  )
}

// "מבוסס על" for the trip, with a way to copy this trip back into one of its bases.
function BaseLine({ list }) {
  const { lists } = useStore()
  const [confirm, setConfirm] = useState(null)
  const bases = (list.based_on ?? []).map((id) => lists.find((l) => l.id === id)).filter(Boolean)
  if (!bases.length) return null
  return (
    <div className="base-line">
      <span>מבוסס על: <b>{bases.map((b) => b.name).join(' + ')}</b></span>
      {!confirm && bases.map((b) => (
        <button key={b.id} className="link-btn" onClick={() => setConfirm(b)}>עדכן את "{b.name}" לפי הקנייה</button>
      ))}
      {confirm && (
        <div className="inline-form">
          <span>להחליף את התוכן של "{confirm.name}" במה שיש עכשיו ברשימה?</span>
          <button className="btn small primary" onClick={() => { actions.saveAsFixedList(list.id, confirm.id); setConfirm(null) }}>עדכן</button>
          <button className="btn small" onClick={() => setConfirm(null)}>ביטול</button>
        </div>
      )}
    </div>
  )
}

// A catalog product that is not on the list yet, shown when the list shows every product.
function ProductAddRow({ product, list }) {
  return (
    <div className="row not-chosen">
      <div className="row-main"><span className="row-name">{product.name}</span></div>
      <ExactButton product={product} />
      <button className="btn small" onClick={() => actions.addToList(list.id, { name: product.name, category: product.category, productId: product.id })}>
        + הוסף
      </button>
    </div>
  )
}

function EditBody({ list }) {
  const { items, products } = useStore()
  const [sheet, setSheet] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const all = items.filter((i) => i.list_id === list.id)
  const mine = all.filter((i) => !i.checked)
  const inCart = all.length - mine.length
  const canShowAll = list.kind === 'grocery'

  let rows = mine
  if (showAll && canShowAll) {
    // Every catalog product, with what is already chosen in place among the rest.
    const chosen = new Set(mine.map((i) => i.product_id))
    rows = [...mine, ...products.filter((p) => !chosen.has(p.id)).map((p) => ({ ...p, product: p }))]
  }
  const groups = list.kind === 'grocery' ? groupByCategory(rows) : [['', [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))]]

  return (
    <>
      <BaseLine list={list} />
      <QuickAdd list={list} />
      <div className="chips wrap">
        {canShowAll && (
          <>
            <button className={`chip ${!showAll ? 'on' : ''}`} aria-pressed={!showAll} onClick={() => setShowAll(false)}>ברשימה ({mine.length})</button>
            <button className={`chip ${showAll ? 'on' : ''}`} aria-pressed={showAll} onClick={() => setShowAll(true)}>כל המוצרים</button>
          </>
        )}
        <button className="chip ghost" onClick={() => setSheet(true)}>בסס על רשימה קבועה</button>
      </div>
      {mine.length === 0 && !showAll && (
        <div className="empty">
          הרשימה ריקה.{list.kind === 'grocery' ? ' הוסיפו פריטים מהקטלוג, מרשימה קבועה או בשורה למעלה.' : ' הוסיפו פריטים בשורה למעלה.'}
        </div>
      )}
      {groups.map(([title, rows]) => (
        <section key={title || 'all'}>
          {title && <div className="group-title">{title}</div>}
          <div className="card" style={title ? undefined : { marginTop: 8 }}>
            {rows.map((it) => (it.product
              ? <ProductAddRow key={it.id} product={it.product} list={list} />
              : <ItemRow key={it.id} item={it} />))}
          </div>
        </section>
      ))}
      {inCart > 0 && (
        <p className="sub" style={{ margin: '12px 20px 0' }}>
          {inCart} פריטים כבר סומנו בעגלה. הם יירדו מהרשימה כשתלחצו "סיימתי קנייה".
        </p>
      )}
      {sheet && <BaseSheet list={list} onClose={() => setSheet(false)} />}
    </>
  )
}

// One list, two modes: edit it at home, check it off in the store.
export default function ListScreen({ list, mode, setMode }) {
  const { items } = useStore()
  if (!list) return <div className="empty">הרשימה נטענת…</div>
  const toBuy = items.filter((i) => i.list_id === list.id && !i.checked).length

  return (
    <>
      <header className="head">
        <div className="head-row"><SyncBadge /><Avatars /></div>
        <h1>{list.name}</h1>
        <span className="sub">{toBuy} פריטים לקנייה</span>
      </header>
      <div className="segmented" role="tablist" aria-label="מצב הרשימה">
        <button role="tab" aria-selected={mode === 'edit'} className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}>עריכה</button>
        <button role="tab" aria-selected={mode === 'shop'} className={mode === 'shop' ? 'on' : ''} onClick={() => setMode('shop')}>קנייה</button>
      </div>
      {mode === 'shop'
        ? <ShopBody list={list} onDone={() => setMode('edit')} />
        : <EditBody list={list} />}
    </>
  )
}

