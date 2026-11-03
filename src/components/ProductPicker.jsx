import { useEffect, useState } from 'react'
import { actions } from '../lib/store'

// Pin a catalog product ("חלב") to one exact store item (barcode) for price comparison.
export default function ProductPicker({ product, onClose }) {
  const [q, setQ] = useState(product.name)
  const [res, setRes] = useState({ loading: false, rows: [], error: '' })

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return setRes({ loading: false, rows: [], error: '' })
    setRes((r) => ({ ...r, loading: true }))
    const t = setTimeout(() => {
      actions.searchItems(term)
        .then((rows) => setRes({ loading: false, rows, error: '' }))
        .catch(() => setRes({ loading: false, rows: [], error: 'החיפוש לא זמין כרגע.' }))
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  const pick = (item) => {
    actions.pinProduct(product, item)
    onClose()
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={`בחירת מוצר מדויק ל${product.name}`} onClick={(e) => e.stopPropagation()}>
        <h2>איזה {product.name} אתם קונים?</h2>
        <div className="quick-add">
          <label className="field" style={{ flex: 1 }}>
            <span>חיפוש לפי שם, מותג או גודל</span>
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </label>
        </div>
        {product.barcode && (
          <div className="actions" style={{ paddingTop: 0 }}>
            <button className="btn" onClick={() => pick(null)}>בטל בחירה (השווה לפי הזול מסוגו)</button>
          </div>
        )}
        {res.error && <div className="empty">{res.error}</div>}
        {!res.error && !res.loading && q.trim().length >= 2 && !res.rows.length && (
          <div className="empty">לא נמצאו מוצרים. המאגר מתמלא אחרי טעינת המחירים הראשונה.</div>
        )}
        {res.rows.length > 0 && (
          <div className="card" style={{ marginTop: 8 }}>
            {res.rows.map((it) => (
              <button key={it.barcode} className="store" onClick={() => pick(it)}>
                <span className="row-name">{it.name}</span>
                <span className="row-meta">
                  {it.manufacturer && it.manufacturer !== 'לא ידוע' && <span>{it.manufacturer}</span>}
                  {product.barcode === it.barcode && <span className="badge">נבחר</span>}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="actions"><button className="btn" onClick={onClose}>סגור</button></div>
      </div>
    </div>
  )
}
