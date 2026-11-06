import { useState } from 'react'
import { useStore, actions } from '../lib/store'
import { isConfigured } from '../lib/supabase'
import { PRODUCE, categoryRank, qtyLabel } from '../data/catalog'
import Icon from '../components/Icon'
import { QuickAdd } from './ListScreen'

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

// The list in the store: check items off only. Quantities are edited in edit mode.
export default function ShopBody({ list, onDone, go }) {
  const { items } = useStore()
  const [confirming, setConfirming] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const mine = items
    .filter((i) => i.list_id === list.id)
    .sort((a, b) => a.checked - b.checked || categoryRank(a.category) - categoryRank(b.category) || a.name.localeCompare(b.name, 'he'))
  const bought = mine.filter((i) => i.checked)
  const done = bought.length
  const pct = mine.length ? Math.round((done * 100) / mine.length) : 0

  // Signed in, the trip can be saved to the purchase history; local-only, just confirm.
  const startFinish = () => (isConfigured ? setFinishing(true) : setConfirming(true))
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

      <div className="actions">
        {confirming ? (
          <div className="form" style={{ margin: 0 }}>
            <h2>להסיר מהרשימה את {done} הפריטים שנקנו?</h2>
            <button className="btn primary" onClick={finish}>כן, סיימתי</button>
            <button className="btn" onClick={() => setConfirming(false)}>עוד לא</button>
          </div>
        ) : (
          done > 0 && <button className="btn primary big" onClick={startFinish}>סיימתי קנייה</button>
        )}
        {isConfigured && <button className="btn" onClick={() => go('purchases')}>הקניות שלי</button>}
      </div>
      {finishing && (
        <FinishSheet list={list} bought={bought} onClose={() => setFinishing(false)}
          onDone={() => { setFinishing(false); onDone(); go('purchases') }} />
      )}
    </>
  )
}
