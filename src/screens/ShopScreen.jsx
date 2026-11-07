import { useEffect, useRef, useState } from 'react'
import { useStore, actions } from '../lib/store'
import { isConfigured } from '../lib/supabase'
import { PRODUCE, categoryRank, qtyLabel } from '../data/catalog'
import Icon from '../components/Icon'
import { QuickAdd } from './ListScreen'
import ScanButton from '../components/BarcodeScan'

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

const shekel = (n) => `₪${Number(n).toFixed(2)}`
const MARKET_KEY = 'basket.showMarket'
const readFlag = () => { try { return localStorage.getItem(MARKET_KEY) === '1' } catch { return false } }
const saveFlag = (on) => { try { localStorage.setItem(MARKET_KEY, on ? '1' : '0') } catch { /* private mode */ } }

// The cheapest price per list item among the stores within the radius (basket_lines; online
// stores left out). The exact product when one is pinned and sold nearby, else the cheapest
// similar item. Loaded once per item: checked items drop out of basket_lines but keep their line.
function useMarketPrices(on, ids) {
  const [best, setBest] = useState({})
  const [state, setState] = useState('idle') // idle | loading | ready | error
  const asked = useRef(new Set())
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const missing = ids.filter((id) => !asked.current.has(id))
  // After a failed load, wait for the checkbox to be turned on again rather than retrying in a loop.
  const need = on && missing.length > 0 && (state === 'idle' || state === 'ready')

  useEffect(() => {
    // Starting the load flips need back to false; the result must still land, so no cleanup here.
    if (!need) return
    missing.forEach((id) => asked.current.add(id))
    setState('loading')
    actions.basketLines()
      .then((rows) => {
        if (!mounted.current) return
        const out = {}
        for (const r of rows ?? []) {
          if (r.online || r.price == null) continue
          const cur = out[r.item_id]
          // An exact match beats any similar item; then the lower price, then the nearer store.
          const better = !cur || (r.exact && !cur.exact)
            || (r.exact === cur.exact && (Number(r.price) < Number(cur.price)
              || (Number(r.price) === Number(cur.price) && (r.distance_km ?? 99) < (cur.distance_km ?? 99))))
          if (better) out[r.item_id] = r
        }
        for (const id of missing) if (!(id in out)) out[id] = null // asked, no price nearby
        setBest((b) => ({ ...b, ...out }))
        setState('ready')
      })
      .catch(() => {
        if (!mounted.current) return
        missing.forEach((id) => asked.current.delete(id))
        setState('error')
      })
  }, [need])

  useEffect(() => { if (!on && state === 'error') setState('idle') }, [on, state])
  return { best, state }
}

function MarketLine({ row }) {
  if (!row) return <span className="shop-market none">אין מחיר בסניפים באזור</span>
  const where = `${row.chain_name} ${row.store_name ?? ''}`.trim()
  return (
    <span className="shop-market">
      <b>{shekel(row.price)}</b>
      {!row.exact && row.matched_name && <span> · {row.matched_name}</span>}
      <span> · {where}</span>
    </span>
  )
}

// The list in the store: check items off only. Quantities are edited in edit mode.
export default function ShopBody({ list, onDone, go }) {
  const { items, settings } = useStore()
  const [confirming, setConfirming] = useState(false)
  const [market, setMarket] = useState(readFlag)
  const hasHome = Boolean(settings?.home)
  const [finishing, setFinishing] = useState(false)

  const mine = items
    .filter((i) => i.list_id === list.id)
    .sort((a, b) => a.checked - b.checked || categoryRank(a.category) - categoryRank(b.category) || a.name.localeCompare(b.name, 'he'))
  const bought = mine.filter((i) => i.checked)
  const done = bought.length
  const pct = mine.length ? Math.round((done * 100) / mine.length) : 0
  const showMarket = isConfigured && market && hasHome
  const prices = useMarketPrices(showMarket, mine.filter((i) => !i.checked).map((i) => i.id))
  const toggleMarket = (on) => { setMarket(on); saveFlag(on) }

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

      <div className="scan-bar"><ScanButton list={list} /></div>
      {isConfigured && (
        <label className="market-toggle">
          <input type="checkbox" checked={market} onChange={(e) => toggleMarket(e.target.checked)} />
          <span>הצג מחירי שוק</span>
          {market && hasHome && <span className="sub">הכי זול ברדיוס {settings?.radiusKm ?? 5} ק"מ</span>}
        </label>
      )}
      {isConfigured && market && !hasHome && (
        <p className="sub" style={{ margin: '0 20px 8px' }}>כדי לראות מחירי שוק, קבעו מיקום בהגדרות.</p>
      )}
      {showMarket && prices.state === 'error' && (
        <p className="sub" role="alert" style={{ margin: '0 20px 8px', color: 'var(--warn)' }}>לא הצלחנו לטעון מחירים. בדקו את החיבור.</p>
      )}
      {mine.length === 0 && <div className="empty">אין מה לקנות ברשימה הזו.</div>}
      <div className="shop-list">
        {mine.map((it) => (
          <button key={it.id} className={`shop-row ${it.checked ? 'done' : ''}`} aria-pressed={it.checked}
            onClick={() => actions.updateItem(it, { checked: !it.checked })}>
            <span className="box">{it.checked && <Icon name="check" size={18} width={3} />}</span>
            <span className="shop-text">
              <span className="shop-name">{it.name}</span>
              {showMarket && it.id in prices.best && <MarketLine row={prices.best[it.id]} />}
              {showMarket && !(it.id in prices.best) && prices.state === 'loading'
                && <span className="shop-market">טוען מחיר…</span>}
            </span>
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
