import { useEffect, useState } from 'react'
import { actions } from '../lib/store'
import Icon from './Icon'
import { PRODUCE } from '../data/catalog'

// "500 מיליליטר" from the price feed's quantity and unit; empty when the feed has none.
export function sizeLabel(item) {
  const n = Number(item.quantity)
  if (!n || !item.unit) return ''
  return `${n} ${item.unit}`
}

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
    // Keep the size with the name, so the list shows which package was chosen.
    const size = item && sizeLabel(item)
    actions.pinProduct(product, item && { ...item, name: size && !item.name.includes(String(Number(item.quantity))) ? `${item.name} · ${size}` : item.name })
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
            <button className="btn" onClick={() => pick(null)}>בטל בחירה ({product.barcode_name})</button>
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
                  {sizeLabel(it) && <span className="badge">{sizeLabel(it)}</span>}
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

// The tag icon beside a product: opens the picker; filled when an exact product is chosen.
export function ExactButton({ product }) {
  const [open, setOpen] = useState(false)
  if (!product || product.category === PRODUCE) return null
  return (
    <>
      <button className={`icon-btn ${product.barcode ? 'on' : ''}`} onClick={() => setOpen(true)}
        aria-label={product.barcode ? `מוצר מדויק: ${product.barcode_name}` : `בחירת מוצר מדויק ל${product.name}`}
        title={product.barcode ? product.barcode_name : 'בחירת מוצר מדויק וגודל'}>
        <Icon name="tag" size={18} />
      </button>
      {open && <ProductPicker product={product} onClose={() => setOpen(false)} />}
    </>
  )
}
