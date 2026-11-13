import { useState } from 'react'
import { useStore, actions } from '../lib/store'
import { isConfigured } from '../lib/supabase'
import { CATEGORIES, OTHER, PRODUCE, categoryRank, qtyLabel, stepQty, unitOf } from '../data/catalog'
import ShopBody from './ShopScreen'
import { ExactButton } from '../components/ProductPicker'
import ResetButton from '../components/ResetButton'

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
      <QtyStepper item={item} />
    </div>
  )
}

// − qty +. Produce moves by half a kilo, and its unit (ק"ג / יח') switches with a tap on the amount.
export function QtyStepper({ item }) {
  const produce = item.category === PRODUCE
  const kg = unitOf(item) === 'kg'
  return (
    <div className="stepper">
      <button aria-label={`הפחת ${item.name}`} onClick={() => actions.setQty(item, stepQty(item, -1))}>−</button>
      {produce
        ? (
          <button className="qty-unit" onClick={() => actions.setUnit(item, kg ? 'unit' : 'kg')}
            aria-label={`${qtyLabel(item)}. ${kg ? 'החלף ליחידות' : 'החלף לקילו'}`} title={kg ? 'החלף ליחידות' : 'החלף לקילו'}>
            {qtyLabel(item)}
          </button>
        )
        : <span>{qtyLabel(item)}</span>}
      <button aria-label={`הוסף ${item.name}`} onClick={() => actions.setQty(item, stepQty(item, 1))}>+</button>
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

// "מבוסס על" for the trip: which fixed lists it came from, and what can be done with them.
function BaseLine({ list, onAddBase }) {
  const { lists } = useStore()
  const [open, setOpen] = useState(false)
  const [ask, setAsk] = useState(null) // { kind: 'update' | 'remove' | 'clear', base }
  const bases = (list.based_on ?? []).map((id) => lists.find((l) => l.id === id)).filter(Boolean)
  if (!bases.length) return null
  const names = bases.map((b) => `"${b.name}"`).join(' + ')

  const confirm = {
    update: () => ({
      q: `לשמור את הרשימה של עכשיו בתוך "${ask.base.name}"? בפעם הבאה שתבחרו בה, היא תיפתח בדיוק כמו עכשיו.`,
      yes: `כן, עדכן את "${ask.base.name}"`, tone: 'primary',
    }),
    remove: () => ({
      q: `להוריד מהקנייה את המוצרים שהגיעו מ"${ask.base.name}"? הרשימה הקבועה עצמה נשארת שמורה.`,
      yes: 'כן, הורד אותם', tone: 'danger',
    }),
    clear: () => ({ q: 'לרוקן את הרשימה ולבחור מחדש איך מתחילים?', yes: 'כן, קנייה חדשה', tone: 'danger' }),
  }
  const run = () => {
    if (ask.kind === 'update') actions.saveAsFixedList(list.id, ask.base.id)
    if (ask.kind === 'remove') actions.removeBase(list.id, ask.base.id)
    if (ask.kind === 'clear') actions.clearTrip(list.id)
    setAsk(null)
    setOpen(false)
  }
  const option = (key, title, meta, onClick) => (
    <button key={key} className="row" onClick={onClick}>
      <span className="row-main">
        <span className="row-name">{title}</span>
        <span className="row-meta">{meta}</span>
      </span>
    </button>
  )

  if (ask) {
    const c = confirm[ask.kind]()
    return (
      <div className="base-box" role="alertdialog" aria-label="אישור">
        <p className="base-q">{c.q}</p>
        <div className="base-confirm">
          <button className={`btn small ${c.tone}`} onClick={run}>{c.yes}</button>
          <button className="btn small" onClick={() => setAsk(null)}>לא, השאר כמו שהיה</button>
        </div>
      </div>
    )
  }

  return (
    <div className="base-box">
      <button className="base-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="base-title">
          <span className="base-kicker">הקנייה התחילה מרשימה קבועה</span>
          <b>{names}</b>
        </span>
        <span className="base-toggle">{open ? 'סגור' : 'אפשרויות'} <span className={`cat-chevron ${open ? 'up' : ''}`} aria-hidden="true">‹</span></span>
      </button>
      {open && (
        <>
          <p className="base-note">מה שמוסיפים או מורידים כאן משנה רק את הקנייה הזו. הרשימה הקבועה לא משתנה, אלא אם תבחרו לעדכן אותה.</p>
          <div className="card base-options">
            {bases.map((b) => option(`u${b.id}`, `עדכן את "${b.name}" לפי הקנייה`, 'הרשימה הקבועה תהיה בדיוק כמו הרשימה של עכשיו',
              () => setAsk({ kind: 'update', base: b })))}
            {bases.map((b) => option(`r${b.id}`, `הורד את המוצרים של "${b.name}"`, 'רק מהקנייה הזו. מה שהוספתם בעצמכם נשאר',
              () => setAsk({ kind: 'remove', base: b })))}
            {option('add', 'הוסף עוד רשימה קבועה', 'המוצרים שלה יצטרפו לקנייה', () => { setOpen(false); onAddBase() })}
            {option('clear', 'התחל קנייה חדשה', 'מרוקן את הרשימה ובוחרים מחדש איך מתחילים', () => setAsk({ kind: 'clear' }))}
          </div>
        </>
      )}
    </div>
  )
}

// No trip yet: start a quick list here, or start from one of the fixed lists.
// On launch a trip that is still exactly its fixed lists starts over too; picking empties it first.
function StartChoice({ list, onQuick, onPick, restart }) {
  const { items, lists } = useStore()
  const fixedLists = lists.filter((l) => l.kind === 'fixed')
  const last = restart ? list.based_on ?? [] : []
  const pick = (f) => {
    if (restart) actions.clearTrip(list.id)
    actions.loadFixedList(f.id, list.id)
    onPick()
  }
  return (
    <>
      <div className="card start-card">
        <button className="row" onClick={onQuick}>
          <span className="row-main">
            <span className="row-name">רשימה מהירה</span>
            <span className="row-meta">בוחרים מוצרים חופשי, כאן בעמוד</span>
          </span>
          <span className="btn small primary" aria-hidden="true">התחל</span>
        </button>
      </div>
      <div className="group-title">או מתוך רשימה קבועה</div>
      {fixedLists.length === 0
        ? <div className="empty">עוד אין רשימות קבועות. יוצרים אותן בקטלוג, תחת "רשימות קבועות".</div>
        : (
          <div className="card">
            {fixedLists.map((f) => (
              <button key={f.id} className="row" onClick={() => pick(f)}>
                <span className="row-main">
                  <span className="row-name">{f.name}</span>
                  <span className="row-meta">
                    {items.filter((i) => i.list_id === f.id).length} פריטים
                    {last.includes(f.id) ? ' · נבחרה בפעם הקודמת' : ' · אפשר להוסיף ולהוריד בלי לשנות אותה'}
                  </span>
                </span>
                <span className="btn small" aria-hidden="true">בחר</span>
              </button>
            ))}
          </div>
        )}
    </>
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

function EditBody({ list, startAll }) {
  const { items, products } = useStore()
  const [sheet, setSheet] = useState(false)
  const [showAll, setShowAll] = useState(startAll)
  const [openCats, setOpenCats] = useState(() => new Set()) // categories expanded under "כל המוצרים"
  const toggleCat = (title) => setOpenCats((prev) => {
    const next = new Set(prev)
    if (next.has(title)) next.delete(title)
    else next.add(title)
    return next
  })
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
      <BaseLine list={list} onAddBase={() => setSheet(true)} />
      <QuickAdd list={list} />
      <div className="chips wrap">
        {canShowAll && (
          <>
            <button className={`chip ${!showAll ? 'on' : ''}`} aria-pressed={!showAll} onClick={() => setShowAll(false)}>ברשימה ({mine.length})</button>
            <button className={`chip ${showAll ? 'on' : ''}`} aria-pressed={showAll} onClick={() => setShowAll(true)}>כל המוצרים</button>
          </>
        )}
        <button className="chip ghost" onClick={() => setSheet(true)}>הוסף רשימה קבועה</button>
        <ResetButton list={list} />
      </div>
      {mine.length === 0 && !showAll && (
        <div className="empty">
          הרשימה ריקה.{list.kind === 'grocery' ? ' בחרו מוצרים ב"כל המוצרים", מרשימה קבועה או בשורה למעלה.' : ' הוסיפו פריטים בשורה למעלה.'}
        </div>
      )}
      {groups.map(([title, rows]) => {
        // Under "כל המוצרים" each category folds, as in the catalog; the list itself stays open.
        const folding = showAll && canShowAll && title
        const open = !folding || openCats.has(title)
        const chosen = rows.filter((it) => !it.product).length
        return (
          <section key={title || 'all'}>
            {folding ? (
              <button className={`cat-head ${open ? 'open' : ''}`} aria-expanded={open} onClick={() => toggleCat(title)}>
                <span className="cat-name">{title}</span>
                <span className={`cat-count ${chosen ? 'some' : ''}`}>{chosen} מתוך {rows.length}</span>
                <span className="cat-chevron" aria-hidden="true">‹</span>
              </button>
            ) : (
              title && <div className="group-title">{title}</div>
            )}
            {open && (
              <div className="card" style={title ? undefined : { marginTop: 8 }}>
                {rows.map((it) => (it.product
                  ? <ProductAddRow key={it.id} product={it.product} list={list} />
                  : <ItemRow key={it.id} item={it} />))}
              </div>
            )}
          </section>
        )
      })}
      {inCart > 0 && (
        <p className="sub" style={{ margin: '12px 20px 0' }}>
          {inCart} פריטים כבר סומנו בעגלה. הם יירדו מהרשימה כשתלחצו "סיימתי קנייה".
        </p>
      )}
      {sheet && <BaseSheet list={list} onClose={() => setSheet(false)} />}
    </>
  )
}

// Asked once per app launch: does the trip open as it was, or on "how do we start"?
let launchRestart

// A trip nobody has worked on yet: exactly its fixed lists, nothing added, changed or in the cart.
function untouched(list, items) {
  if (!(list.based_on ?? []).length) return false
  if (items.some((i) => i.list_id === list.id && i.checked)) return false
  const { remove, restore, readd } = actions.resetPlan(list.id)
  return !remove.length && !restore.length && !readd.length
}

// One list, two modes: edit it at home, check it off in the store.
export default function ListScreen({ list, mode, setMode, go }) {
  const { items } = useStore()
  const [quick, setQuick] = useState(false)
  const [, rerender] = useState(0)
  if (!list) return <div className="empty">הרשימה נטענת…</div>
  if (launchRestart === undefined) launchRestart = untouched(list, items)
  const all = items.filter((i) => i.list_id === list.id)
  const toBuy = all.filter((i) => !i.checked).length
  // Nothing on the trip and nothing it is based on, or a fresh launch on an untouched trip: choose how to start.
  const restart = launchRestart && untouched(list, items)
  const fresh = restart || (!quick && !all.length && !(list.based_on ?? []).length)
  const started = () => { launchRestart = false; rerender((n) => n + 1); setMode('edit') }

  if (fresh) {
    return (
      <>
        <header className="head">
          <div className="head-row"><SyncBadge /><Avatars /></div>
          <h1>קנייה חדשה</h1>
          <span className="sub">איך מתחילים?</span>
        </header>
        <StartChoice list={list} restart={restart}
          onQuick={() => { if (restart) actions.clearTrip(list.id); setQuick(true); started() }}
          onPick={started} />
      </>
    )
  }

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
        ? <ShopBody list={list} onDone={() => setMode('edit')} go={go} />
        : <EditBody list={list} startAll={quick && !all.length} />}
    </>
  )
}

