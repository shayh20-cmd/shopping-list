import { useState } from 'react'
import { useStore, actions } from '../lib/store'
import { CATEGORIES, OTHER, categoryRank, rowSorter } from '../data/catalog'
import { ExactButton } from '../components/ProductPicker'
import ResetButton from '../components/ResetButton'
import Icon from '../components/Icon'
import useDragSort from '../lib/useDragSort'
import { AbcChip, OrderHint } from '../components/OrderControls'
import { QtyStepper } from './ListScreen'

// Rename a product or move it to another category, in place.
function ProductEdit({ product, onClose }) {
  const [name, setName] = useState(product.name)
  const [category, setCategory] = useState(CATEGORIES.includes(product.category) ? product.category : OTHER)
  const [error, setError] = useState('')
  const save = (e) => {
    e.preventDefault()
    const err = actions.updateProduct(product, { name, category })
    if (err) setError(err)
    else onClose()
  }
  return (
    <form className="row-edit" onSubmit={save}>
      <input className="input" value={name} onChange={(e) => { setName(e.target.value); setError('') }} autoFocus aria-label="שם המוצר" style={{ height: 36 }} />
      <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="קטגוריה">
        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
      </select>
      {error && <span className="row-error" role="alert">{error}</span>}
      <div className="inline-form">
        <button className="btn small primary" type="submit">שמור</button>
        <button className="btn small" type="button" onClick={onClose}>ביטול</button>
      </div>
    </form>
  )
}

function ProductRow({ product, item, onAdd, manage, dnd, dragCat }) {
  const [mode, setMode] = useState(null) // 'edit' | 'delete'
  const d = dnd ? dnd.rowProps(product.id, dragCat) : { attrs: {}, cls: '' }
  return (
    <div className={`row ${d.cls}`} {...d.attrs}>
      {dnd && (
        <button className="drag-handle" aria-label={`גרור את ${product.name}`} {...dnd.handleProps(product.id)}>
          <Icon name="grip" width={3} />
        </button>
      )}
      <div className="row-main">
        <span className="row-name">{product.name}</span>
        {product.barcode_name && <span className="row-meta">{product.barcode_name}</span>}
        {mode === 'edit' && <ProductEdit product={product} onClose={() => setMode(null)} />}
        {mode === 'delete' && (
          <div className="inline-form" role="alertdialog" aria-label="מחיקת מוצר">
            <span>למחוק את "{product.name}" מהקטלוג?{item ? ' ברשימה הוא יישאר.' : ''}</span>
            <button className="btn small danger" onClick={() => actions.deleteProduct(product)}>מחק</button>
            <button className="btn small" onClick={() => setMode(null)}>ביטול</button>
          </div>
        )}
      </div>
      <ExactButton product={product} />
      {manage && !mode && (
        <>
          <button className="icon-btn" aria-label={`ערוך את ${product.name}`} title="שם וקטגוריה" onClick={() => setMode('edit')}>
            <Icon name="edit" size={18} />
          </button>
          <button className="icon-btn" aria-label={`מחק את ${product.name}`} title="מחק מהקטלוג" onClick={() => setMode('delete')}>
            <Icon name="trash" size={18} />
          </button>
        </>
      )}
      {!onAdd ? null : item ? (
        <>
          <button className="icon-btn" aria-label={`הסר את ${product.name} מהרשימה`} title="הסר מהרשימה" onClick={() => actions.removeItems([item.id])}>
            <Icon name="trash" size={18} />
          </button>
          <QtyStepper item={item} />
        </>
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

export default function CatalogScreen({ list, editingId, startChosen, editFixed, doneEditing, go }) {
  const { products, items, lists, settings } = useStore()
  const [q, setQ] = useState('')
  const [grouped, setGrouped] = useState(true)
  const [chosenOnly, setChosenOnly] = useState(!!startChosen) // opened from the list: start on what the fixed list holds
  const abc = settings?.abc !== false
  const [newCat, setNewCat] = useState(OTHER)
  const [view, setView] = useState('products') // 'products' | 'fixed'
  const [openCats, setOpenCats] = useState(() => new Set()) // categories expanded by category sort
  // Manual order: a row dropped by another row lands right there; on a category's header, last in it.
  // Without categories the order changes but the category stays.
  const dnd = useDragSort((id, t) => actions.moveProduct(id, {
    category: grouped ? t.cat : undefined,
    prevId: t.id && t.after ? t.id : null,
    nextId: t.id && !t.after ? t.id : null,
  }))

  if (!list) return <div className="empty">הרשימה נטענת…</div>

  const target = lists.find((l) => l.id === editingId && l.kind === 'fixed') ?? list
  const editing = target.kind === 'fixed'
  const onlyChosen = editing && chosenOnly // "רק מה שנבחר" belongs to fixed-list editing

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
  const matches = products.filter((p) => (!query || p.name.includes(query)) && (!onlyChosen || inTarget.has(p.id)))
  const exact = products.some((p) => p.name === query)
  // א-ב or the manual order, inside each category too.
  const order = rowSorter(abc, (p) => p.sort_order)

  let groups
  if (!grouped) {
    const title = onlyChosen ? `נבחרו ${matches.length}` : abc ? 'כל המוצרים, א עד ת' : 'כל המוצרים, בסידור ידני'
    groups = matches.length ? [[title, [...matches].sort(order)]] : []
  } else {
    const m = new Map()
    for (const p of [...matches].sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || order(a, b))) {
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
        <button className={`chip ${grouped ? 'on' : ''}`} aria-pressed={grouped} onClick={() => setGrouped(!grouped)}>לפי קטגוריה</button>
        <AbcChip abc={abc} />
        {editing && (
          <>
            <button className={`chip ${chosenOnly ? 'on' : ''}`} aria-pressed={chosenOnly} onClick={() => setChosenOnly(!chosenOnly)}>רק מה שנבחר</button>
            <ResetButton list={target} />
          </>
        )}
      </div>
      {!abc && <OrderHint grouped={grouped} />}

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

      {onlyChosen && !groups.length && <div className="empty">עוד לא נבחרו מוצרים לרשימה הזו.</div>}

      {groups.map(([title, rows]) => {
        // By category, each category folds; a search shows every match open.
        const folding = grouped && !query
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
              <button className={`cat-head ${open ? 'open' : ''} ${dnd.dropClass(title)}`} aria-expanded={open} onClick={toggle}
                data-drop-cat={abc ? undefined : title}>
                <span className="cat-name">{title}</span>
                <span className={`cat-count ${chosen ? 'some' : ''}`}>{editing ? `${chosen} מתוך ${rows.length}` : rows.length}</span>
                <span className="cat-chevron" aria-hidden="true">‹</span>
              </button>
            ) : (
              <div className={`group-title ${grouped ? dnd.dropClass(title) : ''}`} data-drop-cat={grouped && !abc ? title : undefined}>{title}</div>
            )}
            {open && (
              <div className="card">
                {rows.map((p) => (
                  <ProductRow key={p.id} product={p} item={inTarget.get(p.id)} onAdd={editing ? () => add(p) : null}
                    manage={!editing} dnd={abc ? null : dnd} dragCat={grouped ? p.category : undefined} />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </>
  )
}
