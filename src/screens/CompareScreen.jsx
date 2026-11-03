import { useEffect, useState } from 'react'
import { useStore, actions } from '../lib/store'
import { isConfigured } from '../lib/supabase'

const shekel = (n) => `₪${Number(n).toFixed(2)}`

// basket_lines rows -> one entry per store, complete baskets first, then cheapest.
function rank(lines) {
  const stores = new Map()
  for (const l of lines) {
    if (!stores.has(l.store_key)) stores.set(l.store_key, { ...l, total: 0, found: 0, missing: 0, lines: [] })
    const s = stores.get(l.store_key)
    s.lines.push(l)
    if (l.price == null) s.missing++
    else { s.found++; s.total += Number(l.price) * l.qty }
  }
  return [...stores.values()].sort((a, b) => a.missing - b.missing || a.total - b.total)
}

function StoreCard({ store, best, open, onToggle }) {
  return (
    <button className={`store ${best ? 'best' : ''}`} onClick={onToggle} aria-expanded={open}>
      <div className="store-top">
        <span className="store-name">{store.chain_name} {store.store_name}</span>
        <span className="store-total">{shekel(store.total)}</span>
      </div>
      <div className="row-meta" style={{ marginTop: 4 }}>
        {best && <span className="badge">הכי זול</span>}
        {store.missing > 0 && <span className="badge warn">חסרים {store.missing}</span>}
        <span>{store.approx ? 'באזור העיר' : `${store.distance_km.toFixed(1)} ק"מ`}</span>
        {store.address && <span>{store.address}{store.city ? `, ${store.city}` : ''}</span>}
      </div>
      {open && (
        <div className="lines">
          {[...store.lines].sort((a, b) => (a.price == null) - (b.price == null)).map((l) => (
            <div className="line" key={l.item_id}>
              <span>
                {l.item_name}{l.qty > 1 ? ` ×${l.qty}` : ''}
                <small>{l.price == null ? 'לא נמצא בסניף' : `${l.exact ? 'מוצר מדויק' : 'הזול מסוגו'}: ${l.matched_name}`}</small>
              </span>
              <span>{l.price == null ? '—' : shekel(l.price * l.qty)}</span>
            </div>
          ))}
        </div>
      )}
    </button>
  )
}

export default function CompareScreen({ list, go }) {
  const s = useStore()
  const home = s.settings?.home
  const radius = s.settings?.radiusKm ?? 5
  const count = list ? s.items.filter((i) => i.list_id === list.id && !i.checked).length : 0
  const [state, setState] = useState({ loading: false, stores: null, error: '' })
  const [open, setOpen] = useState(null)

  const load = () => {
    setState({ loading: true, stores: null, error: '' })
    actions.basketLines()
      .then((lines) => setState({ loading: false, stores: rank(lines), error: '' }))
      .catch((e) => setState({
        loading: false, stores: null,
        error: e?.code === 'PGRST202' ? 'טבלאות המחירים עוד לא הוגדרו ב-Supabase.' : 'לא הצלחנו לטעון מחירים. בדקו את החיבור ונסו שוב.',
      }))
  }

  const ready = isConfigured && home && count > 0
  // Recompute when the list or the search area changes.
  useEffect(() => { if (ready) load() }, [ready, count, home?.lat, home?.lng, radius]) // eslint-disable-line react-hooks/exhaustive-deps

  let body
  if (!isConfigured) body = <div className="empty">השוואת מחירים זמינה רק כשמחוברים לחשבון המשותף.</div>
  else if (!home) body = (
    <div className="empty">
      כדי למצוא סניפים קרובים צריך לקבוע מיקום.
      <div className="actions"><button className="btn primary" onClick={() => go('settings')}>לקביעת מיקום</button></div>
    </div>
  )
  else if (!count) body = <div className="empty">הרשימה ריקה. הוסיפו פריטים כדי להשוות מחירים.</div>
  else if (state.loading) body = <div className="empty">מחשב את הסל בכל סניף…</div>
  else if (state.error) body = <div className="empty">{state.error}<div className="actions"><button className="btn" onClick={load}>נסו שוב</button></div></div>
  else if (state.stores && !state.stores.length) body = (
    <div className="empty">עוד אין מחירים לסניפים ברדיוס {radius} ק"מ. המחירים נטענים פעם ביום בבוקר, אחרי שקובעים מיקום.</div>
  )
  else if (state.stores) body = (
    <>
      <div className="group-title">{state.stores.length} סניפים, מהזול ליקר</div>
      <div className="card">
        {state.stores.map((st, i) => (
          <StoreCard key={st.store_key} store={st} best={i === 0 && st.found > 0} open={open === st.store_key}
            onToggle={() => setOpen(open === st.store_key ? null : st.store_key)} />
        ))}
      </div>
      <p className="sub" style={{ margin: '12px 20px' }}>
        פריט בלי מוצר מדויק מושווה לפי המוצר הזול ביותר בסניף ששמו מתחיל באותה מילה. אפשר לבחור מוצר מדויק ברשימה.
      </p>
    </>
  )

  return (
    <>
      <header className="head">
        <h1>איפה הכי זול</h1>
        <span className="sub">{count} פריטים · רדיוס {radius} ק"מ</span>
      </header>
      {body}
    </>
  )
}
