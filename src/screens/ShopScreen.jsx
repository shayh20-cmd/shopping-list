import { useStore, actions } from '../lib/store'
import { categoryRank } from '../data/catalog'
import Icon from '../components/Icon'

export default function ShopScreen({ list, go }) {
  const { items } = useStore()
  if (!list) return <div className="empty">אין רשימה פעילה.</div>

  const mine = items
    .filter((i) => i.list_id === list.id)
    .sort((a, b) => a.checked - b.checked || categoryRank(a.category) - categoryRank(b.category) || a.name.localeCompare(b.name, 'he'))
  const done = mine.filter((i) => i.checked).length
  const pct = mine.length ? Math.round((done * 100) / mine.length) : 0

  const finish = () => {
    if (done === 0) return go('list')
    if (window.confirm(`להסיר מהרשימה את ${done} הפריטים שנקנו?`)) {
      actions.finishShopping(list.id)
      go('list')
    }
  }

  return (
    <>
      <header className="head" style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="head-row">
          <h1 style={{ fontSize: 28 }}>{list.name}</h1>
          <span className="sync">{done} מתוך {mine.length}</span>
        </div>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="התקדמות הקנייה">
          <div style={{ width: `${pct}%` }} />
        </div>
        {list.kind === 'grocery' && <span className="sub">ממוין לפי סדר המדפים</span>}
      </header>

      {mine.length === 0 && <div className="empty">אין מה לקנות ברשימה הזו.</div>}
      {mine.map((it) => (
        <button key={it.id} className={`shop-row ${it.checked ? 'done' : ''}`} aria-pressed={it.checked}
          onClick={() => actions.updateItem(it, { checked: !it.checked })}>
          <span className="box">{it.checked && <Icon name="check" size={18} width={3} />}</span>
          <span className="shop-name">
            {it.name}
            {it.note && <span className="shop-note">{it.note}</span>}
          </span>
          {it.qty > 1 && <span className="shop-qty">×{it.qty}</span>}
        </button>
      ))}

      <div className="actions">
        <button className="btn primary big" onClick={finish}>סיימתי קנייה</button>
      </div>
    </>
  )
}
