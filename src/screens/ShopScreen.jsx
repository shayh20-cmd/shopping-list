import { useState } from 'react'
import { useStore, actions } from '../lib/store'
import { isConfigured } from '../lib/supabase'
import { categoryRank } from '../data/catalog'
import Icon from '../components/Icon'

function FinishSheet({ list, bought, onClose, onDone }) {
  const s = useStore()
  const [store, setStore] = useState(s.settings?.lastStore ?? '')
  const [total, setTotal] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    setBusy(true)
    setErr('')
    const products = new Map(s.products.map((p) => [p.id, p]))
    const error = await actions.savePurchase({
      storeName: store,
      total: total ? Number(total.replace(',', '.')) : null,
      items: bought.map((it) => ({ ...it, barcode: products.get(it.product_id)?.barcode ?? null })),
    })
    setBusy(false)
    if (error) return setErr(error.code === '42P01' || error.code === 'PGRST205'
      ? 'טבלאות הקניות עוד לא הוגדרו ב-Supabase.' : 'השמירה נכשלה. בדקו את החיבור ונסו שוב.')
    if (store.trim()) actions.setSettings({ lastStore: store.trim() })
    actions.finishShopping(list.id)
    onDone()
  }

  const skip = () => {
    actions.finishShopping(list.id)
    onDone()
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="סיום קנייה" onClick={(e) => e.stopPropagation()}>
        <h2>לשמור את הקנייה בהיסטוריה?</h2>
        <p className="sub" style={{ margin: '0 20px 8px' }}>{bought.length} פריטים שנקנו יירשמו ויוסרו מהרשימה.</p>
        <div className="form" style={{ marginTop: 0 }}>
          <label className="field">
            <span>איפה קניתם</span>
            <input className="input" value={store} onChange={(e) => setStore(e.target.value)} placeholder="למשל: רמי לוי גבעתיים" />
          </label>
          <label className="field">
            <span>כמה שילמתם (לא חובה)</span>
            <input className="input" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="₪" />
          </label>
          {err && <span className="sub" role="alert" style={{ color: 'var(--warn)' }}>{err}</span>}
        </div>
        <div className="actions">
          <button className="btn primary big" onClick={save} disabled={busy}>{busy ? 'שומר…' : 'שמור וסיים'}</button>
          <button className="btn" onClick={skip} disabled={busy}>סיים בלי לשמור</button>
        </div>
      </div>
    </div>
  )
}

export default function ShopScreen({ list, go }) {
  const { items } = useStore()
  const [finishing, setFinishing] = useState(false)
  if (!list) return <div className="empty">אין רשימה פעילה.</div>

  const mine = items
    .filter((i) => i.list_id === list.id)
    .sort((a, b) => a.checked - b.checked || categoryRank(a.category) - categoryRank(b.category) || a.name.localeCompare(b.name, 'he'))
  const done = mine.filter((i) => i.checked).length
  const pct = mine.length ? Math.round((done * 100) / mine.length) : 0

  const finish = () => {
    if (done === 0) return go('list')
    if (isConfigured) return setFinishing(true)
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
        {isConfigured && <button className="btn" onClick={() => go('purchases')}>הקניות שלי</button>}
      </div>
      {finishing && (
        <FinishSheet list={list} bought={mine.filter((i) => i.checked)} onClose={() => setFinishing(false)}
          onDone={() => { setFinishing(false); go('purchases') }} />
      )}
    </>
  )
}
