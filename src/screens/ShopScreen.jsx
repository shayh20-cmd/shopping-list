import { useState } from 'react'
import { useStore, actions } from '../lib/store'
import { PRODUCE, categoryRank, qtyLabel } from '../data/catalog'
import Icon from '../components/Icon'
import { QuickAdd } from './ListScreen'

// The list in the store: check items off only. Quantities are edited in edit mode.
export default function ShopBody({ list, onDone }) {
  const { items } = useStore()
  const [confirming, setConfirming] = useState(false)

  const mine = items
    .filter((i) => i.list_id === list.id)
    .sort((a, b) => a.checked - b.checked || categoryRank(a.category) - categoryRank(b.category) || a.name.localeCompare(b.name, 'he'))
  const done = mine.filter((i) => i.checked).length
  const pct = mine.length ? Math.round((done * 100) / mine.length) : 0

  const finish = () => {
    actions.finishShopping(list.id)
    setConfirming(false)
    onDone()
  }

  return (
    <>
      <div className="shop-progress">
        <span className="sync">{done} מתוך {mine.length} בעגלה</span>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="התקדמות הקנייה">
          <div style={{ width: `${pct}%` }} />
        </div>
      </div>

      {mine.length === 0 && <div className="empty">אין מה לקנות ברשימה הזו.</div>}
      <div className="shop-list">
        {mine.map((it) => (
          <button key={it.id} className={`shop-row ${it.checked ? 'done' : ''}`} aria-pressed={it.checked}
            onClick={() => actions.updateItem(it, { checked: !it.checked })}>
            <span className="box">{it.checked && <Icon name="check" size={18} width={3} />}</span>
            <span className="shop-name">{it.name}</span>
            {it.category === PRODUCE
              ? <span className="shop-qty">{qtyLabel(it)}</span>
              : it.qty > 1 && <span className="shop-qty">×{it.qty}</span>}
          </button>
        ))}
      </div>

      <div className="group-title">שכחתם משהו?</div>
      <QuickAdd list={list} />

      {done > 0 && (
        <div className="actions">
          {confirming ? (
            <div className="form" style={{ margin: 0 }}>
              <h2>להסיר מהרשימה את {done} הפריטים שנקנו?</h2>
              <button className="btn primary" onClick={finish}>כן, סיימתי</button>
              <button className="btn" onClick={() => setConfirming(false)}>עוד לא</button>
            </div>
          ) : (
            <button className="btn primary big" onClick={() => setConfirming(true)}>סיימתי קנייה</button>
          )}
        </div>
      )}
    </>
  )
}
