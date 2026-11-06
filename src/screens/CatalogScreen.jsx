import { useState } from 'react'
import { useStore, actions } from '../lib/store'
import { CATEGORIES, OTHER, categoryRank, qtyLabel } from '../data/catalog'
import { ExactButton } from '../components/ProductPicker'
import ResetButton from '../components/ResetButton'

function ProductRow({ product, item, onAdd }) {
  return (
    <div className="row">
      <div className="row-main">
        <span className="row-name">{product.name}</span>
        {product.barcode_name && <span className="row-meta">{product.barcode_name}</span>}
      </div>
      <ExactButton product={product} />
      {!onAdd ? null : item ? (
        <div className="stepper">
          <button aria-label={`הפחת ${product.name}`} onClick={() => actions.setQty(item, item.qty - 1)}>−</button>
          <span>{qtyLabel(item)}</span>
          <button aria-label={`הוסף ${product.name}`} onClick={() => actions.setQty(item, item.qty + 1)}>+</button>
        </div>
      ) : (
        <button className="btn small" onClick={onAdd}>+ הוסף</button>
      )}
    </div>
  )
}

// "היום", "אתמול", or the date.
function when(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000)
  if (days === 0) return 'היום'
  if (days === 1) return 'אתמול'
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: days > 300 ? '2-digit' : undefined })
}

// The fixed lists: create, open for editing, rename, delete. Using one for a trip happens on the list.
function FixedListsView({ editFixed }) {
  const { items, lists } = useStore()
  const fixedLists = lists.filter((l) => l.kind === 'fixed')
  const [open, setOpen] = useState(null) // { id, mode: 'rename' | 'delete' }
  const [name, setName] = useState('')
  const [newName, setNewName] = useState('')

  const create = (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    editFixed(actions.createFixedList(newName).id)
    setNewName('')
  }
  const rename = (e, f) => {
    e.preventDefault()
    actions.renameList(f, name)
    setOpen(null)
  }

  return (
    <>
      <form className="quick-add" onSubmit={create}>
        <label className="field" style={{ flex: 1 }}>
          <span>רשימה קבועה חדשה</span>
          <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="למשל: בסיס שבועי" />
        </label>
        <button className="btn primary" type="submit" style={{ alignSelf: 'flex-end' }}>צור</button>
      </form>
      {fixedLists.length === 0 && <div className="empty">עוד אין רשימות קבועות. צרו אחת, בחרו לה מוצרים, ובעמוד הרשימה תוכלו לבסס עליה קנייה.</div>}
      {fixedLists.length > 0 && (
        <div className="card" style={{ marginTop: 8 }}>
          {fixedLists.map((f) => {
            const mode = open?.id === f.id ? open.mode : null
            const own = items.filter((i) => i.list_id === f.id)
            const updated = [f.updated_at, f.created_at, ...own.map((i) => i.updated_at)].filter(Boolean).sort().pop()
            return (
              <div key={f.id} className="row">
                <div className="row-main">
                  <span className="row-name">{f.name}</span>
                  <span className="row-meta">
                    <span>{own.length} פריטים</span>
                    {f.created_by && <span>נוצרה ע״י {f.created_by}</span>}
                    <span>עודכנה {when(updated)}</span>
                    <button className="link-btn" onClick={() => { setOpen({ id: f.id, mode: 'rename' }); setName(f.name) }}>שנה שם</button>
                    <button className="link-btn" onClick={() => setOpen({ id: f.id, mode: 'delete' })}>מחק</button>
                  </span>
                  {mode === 'rename' && (
                    <form className="inline-form" onSubmit={(e) => rename(e, f)}>
                      <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label="שם חדש" />
                      <button className="btn small primary" type="submit">שמור</button>
                      <button className="btn small" type="button" onClick={() => setOpen(null)}>ביטול</button>
                    </form>
                  )}
                  {mode === 'delete' && (
                    <div className="inline-form">
                      <span>למחוק את "{f.name}"?</span>
                      <button className="btn small danger" onClick={() => { actions.deleteList(f); setOpen(null) }}>מחק</button>
                      <button className="btn small" onClick={() => setOpen(null)}>ביטול</button>
                    </div>
                  )}
                </div>
                <button className="btn small" onClick={() => editFixed(f.id)}>ערוך מוצרים</button>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

export default function CatalogScreen({ list, editingId, editFixed, doneEditing, go }) {
  const { products, items, lists } = useStore()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('cat')
  const [newCat, setNewCat] = useState(OTHER)
  const [view, setView] = useState('products') // 'products' | 'fixed'
  const [openCats, setOpenCats] = useState(() => new Set()) // categories expanded by category sort

  if (!list) return <div className="empty">הרשימה נטענת…</div>

  const target = lists.find((l) => l.id === editingId && l.kind === 'fixed') ?? list
  const editing = target.kind === 'fixed'
  const sortBy = !editing && sort === 'in' ? 'cat' : sort // "רק מה שנבחר" belongs to fixed-list editing

  const viewSwitch = (
    <div className="segmented" role="tablist" aria-label="תצוגת הקטלוג">
      <button role="tab" aria-selected={view === 'products'} className={view === 'products' ? 'on' : ''} onClick={() => setView('products')}>מוצרים</button>
      <button role="tab" aria-selected={view === 'fixed'} className={view === 'fixed' ? 'on' : ''} onClick={() => setView('fixed')}>רשימות קבועות</button>
    </div>
  )

  if (!editing && view === 'fixed') {
    return (
      <>
        <header className="head">
          <h1>קטלוג</h1>
          <span className="sub">רשימות קבועות הן בסיס לקנייה. כאן יוצרים ועורכים אותן.</span>
        </header>
        {viewSwitch}
        <FixedListsView editFixed={editFixed} />
      </>
    )
  }
  const query = q.trim()
  const targetItems = items.filter((i) => i.list_id === target.id && !i.checked)
  const inTarget = new Map(targetItems.map((i) => [i.product_id, i]))
  const matches = products.filter((p) => !query || p.name.includes(query))
  const exact = products.some((p) => p.name === query)
  const byCategory = (a, b) => categoryRank(a.category) - categoryRank(b.category) || a.name.localeCompare(b.name, 'he')

  let groups
  if (sortBy === 'abc') {
    groups = matches.length ? [['כל המוצרים, א עד ת', [...matches].sort((a, b) => a.name.localeCompare(b.name, 'he'))]] : []
  } else if (sortBy === 'in') {
    const chosen = matches.filter((p) => inTarget.has(p.id)).sort(byCategory)
    groups = chosen.length ? [[`נבחרו ${chosen.length}`, chosen]] : []
  } else {
    const m = new Map()
    for (const p of [...matches].sort(byCategory)) {
      if (!m.has(p.category)) m.set(p.category, [])
      m.get(p.category).push(p)
    }
    groups = [...m.entries()]
  }

  const add = (p) => actions.addToList(target.id, { name: p.name, category: p.category, productId: p.id })

  // Browsing the catalog only adds products to it; lists are built on the list page or in a fixed list.
  const addNew = () => {
    const p = actions.addProduct({ name: query, category: newCat })
    if (editing) add(p)
    setQ('')
  }

  return (
    <>
      {editing ? (
        <div className="bar editing" role="status">
          <span>עורכים רשימה קבועה: <b>{target.name}</b> · {targetItems.length} פריטים</span>
          <button className="btn small" onClick={doneEditing}>סיום</button>
        </div>
      ) : null}
      <header className="head">
        <h1>{editing ? target.name : 'קטלוג'}</h1>
        <span className="sub">{editing ? 'מה שתבחרו כאן נכנס רק לרשימה הקבועה, לא לקנייה הקרובה.' : 'כל המוצרים של הבית. סמל התגית בוחר מוצר מדויק וגודל, למחיר מדויק.'}</span>
      </header>
      {!editing && viewSwitch}
      <div className="quick-add">
        <label className="field" style={{ flex: 1 }}>
          <span>חיפוש מוצר</span>
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="למשל: חלב" />
        </label>
      </div>
      <div className="chips wrap" role="group" aria-label="מיון">
        <button className={`chip ${sort === 'cat' ? 'on' : ''}`} aria-pressed={sort === 'cat'} onClick={() => setSort('cat')}>לפי קטגוריה</button>
        <button className={`chip ${sort === 'abc' ? 'on' : ''}`} aria-pressed={sort === 'abc'} onClick={() => setSort('abc')}>א-ב</button>
        {editing && (
          <>
            <button className={`chip ${sort === 'in' ? 'on' : ''}`} aria-pressed={sort === 'in'} onClick={() => setSort('in')}>רק מה שנבחר</button>
            <ResetButton list={target} />
          </>
        )}
      </div>

      {query && !exact && (
        <div className="form">
          <h2>להוסיף את "{query}" לקטלוג?</h2>
          <label className="field">
            <span>קטגוריה</span>
            <select className="select" value={newCat} onChange={(e) => setNewCat(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <button className="btn primary" onClick={addNew}>{editing ? `הוסף לקטלוג ול${target.name}` : 'הוסף לקטלוג'}</button>
        </div>
      )}

      {sortBy === 'in' && !groups.length && <div className="empty">עוד לא נבחרו מוצרים לרשימה הזו.</div>}

      {groups.map(([title, rows]) => {
        // By category, each category folds; a search shows every match open.
        const folding = sortBy === 'cat' && !query
        const open = !folding || openCats.has(title)
        const chosen = rows.filter((p) => inTarget.has(p.id)).length
        const toggle = () => setOpenCats((prev) => {
          const next = new Set(prev)
          if (next.has(title)) next.delete(title)
          else next.add(title)
          return next
        })
        return (
          <section key={title}>
            {folding ? (
              <button className={`cat-head ${open ? 'open' : ''}`} aria-expanded={open} onClick={toggle}>
                <span className="cat-name">{title}</span>
                <span className={`cat-count ${chosen ? 'some' : ''}`}>{editing ? `${chosen} מתוך ${rows.length}` : rows.length}</span>
                <span className="cat-chevron" aria-hidden="true">‹</span>
              </button>
            ) : (
              <div className="group-title">{title}</div>
            )}
            {open && (
              <div className="card">
                {rows.map((p) => <ProductRow key={p.id} product={p} item={inTarget.get(p.id)} onAdd={editing ? () => add(p) : null} />)}
              </div>
            )}
          </section>
        )
      })}
    </>
  )
}
