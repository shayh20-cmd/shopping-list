import { useState } from 'react'
import { useStore, actions } from '../lib/store'
import { CATEGORIES, OTHER, categoryRank } from '../data/catalog'

export default function CatalogScreen({ list }) {
  const { products, items } = useStore()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('cat')
  const [newCat, setNewCat] = useState(OTHER)

  if (!list) return <div className="empty">צרו קודם רשימה במסך "כל הרשימות".</div>

  const query = q.trim()
  const inList = new Map(items.filter((i) => i.list_id === list.id && !i.checked).map((i) => [i.product_id, i]))
  const matches = products.filter((p) => !query || p.name.includes(query))
  const exact = products.some((p) => p.name === query)

  let groups
  if (sort === 'abc') {
    groups = matches.length ? [['כל המוצרים, א עד ת', [...matches].sort((a, b) => a.name.localeCompare(b.name, 'he'))]] : []
  } else {
    const m = new Map()
    for (const p of [...matches].sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || a.name.localeCompare(b.name, 'he'))) {
      if (!m.has(p.category)) m.set(p.category, [])
      m.get(p.category).push(p)
    }
    groups = [...m.entries()]
  }

  const toggle = (p) => {
    const item = inList.get(p.id)
    if (item) actions.removeItems([item.id])
    else actions.addToList(list.id, { name: p.name, category: p.category, productId: p.id })
  }

  const addNew = () => {
    const p = actions.addProduct({ name: query, category: newCat })
    actions.addToList(list.id, { name: p.name, category: p.category, productId: p.id })
    setQ('')
  }

  return (
    <>
      <header className="head">
        <h1>קטלוג מוצרים</h1>
        <span className="sub">מוסיף לרשימה: {list.name}</span>
      </header>
      <div className="quick-add">
        <label className="field" style={{ flex: 1 }}>
          <span>חיפוש מוצר</span>
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="למשל: חלב" />
        </label>
      </div>
      <div className="chips" role="group" aria-label="מיון">
        <button className={`chip ${sort === 'cat' ? 'on' : ''}`} aria-pressed={sort === 'cat'} onClick={() => setSort('cat')}>לפי קטגוריה</button>
        <button className={`chip ${sort === 'abc' ? 'on' : ''}`} aria-pressed={sort === 'abc'} onClick={() => setSort('abc')}>א-ב</button>
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
          <button className="btn primary" onClick={addNew}>הוסף לקטלוג ולרשימה</button>
        </div>
      )}

      {groups.map(([title, rows]) => (
        <section key={title}>
          <div className="group-title">{title}</div>
          <div className="card">
            {rows.map((p) => {
              const added = inList.has(p.id)
              return (
                <div className="row" key={p.id}>
                  <div className="row-main"><span className="row-name">{p.name}</span></div>
                  <button className={`btn small ${added ? 'added' : ''}`} aria-pressed={added} onClick={() => toggle(p)}>
                    {added ? `✓ ברשימה${inList.get(p.id).qty > 1 ? ` (${inList.get(p.id).qty})` : ''}` : '+ הוסף'}
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </>
  )
}
