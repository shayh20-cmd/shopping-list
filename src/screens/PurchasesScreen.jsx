import { useEffect, useState } from 'react'
import { actions } from '../lib/store'

const shekel = (n) => `₪${Number(n).toFixed(2)}`
const monthName = (d) => d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
const dayName = (d) => d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' })

export default function PurchasesScreen({ go }) {
  const [state, setState] = useState({ loading: true, rows: [], error: '' })
  const [open, setOpen] = useState(null)

  const load = () => {
    setState((s) => ({ ...s, loading: true, error: '' }))
    actions.loadPurchases()
      .then((rows) => setState({ loading: false, rows, error: '' }))
      .catch((e) => setState({
        loading: false, rows: [],
        error: e?.code === 'PGRST205' || e?.code === '42P01' ? 'טבלאות הקניות עוד לא הוגדרו ב-Supabase.' : 'לא הצלחנו לטעון את הקניות.',
      }))
  }
  useEffect(load, [])

  const remove = async (p) => {
    if (!window.confirm(`למחוק את הקנייה מ${p.store_name || 'הסופר'}?`)) return
    const error = await actions.deletePurchase(p.id)
    if (!error) load()
  }

  // Group by month, newest first.
  const months = new Map()
  for (const p of state.rows) {
    const d = new Date(p.purchased_at)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (!months.has(key)) months.set(key, { title: monthName(d), total: 0, rows: [] })
    const m = months.get(key)
    m.rows.push(p)
    m.total += Number(p.total ?? 0)
  }

  let body
  if (state.loading) body = <div className="empty">טוען…</div>
  else if (state.error) body = <div className="empty">{state.error}</div>
  else if (!state.rows.length) body = <div className="empty">עוד אין קניות שמורות. בסוף קנייה לוחצים "סיימתי קנייה" ושומרים.</div>
  else body = [...months.values()].map((m) => (
    <section key={m.title}>
      <div className="group-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{m.title}</span><span>{m.total ? shekel(m.total) : ''}</span>
      </div>
      <div className="card">
        {m.rows.map((p) => (
          <div key={p.id} className="store" role="button" tabIndex={0} aria-expanded={open === p.id}
            onClick={() => setOpen(open === p.id ? null : p.id)}>
            <div className="store-top">
              <span className="store-name">{p.store_name || 'קנייה'}</span>
              <span className="store-total">{p.total != null ? shekel(p.total) : '—'}</span>
            </div>
            <div className="row-meta" style={{ marginTop: 4 }}>
              <span>{dayName(new Date(p.purchased_at))}</span>
              <span>{p.purchase_items.length} פריטים</span>
              {p.created_by && <span>{p.created_by}</span>}
            </div>
            {open === p.id && (
              <div className="lines">
                {p.purchase_items.map((it) => (
                  <div className="line" key={it.id}>
                    <span>{it.name}{Number(it.qty) !== 1 ? ` ×${Number(it.qty)}` : ''}</span>
                    <span>{it.line_total != null ? shekel(it.line_total) : ''}</span>
                  </div>
                ))}
                <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={(e) => { e.stopPropagation(); remove(p) }}>מחק קנייה</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  ))

  return (
    <>
      <header className="head">
        <div className="head-row">
          <h1>הקניות שלי</h1>
          <button className="link-btn" style={{ fontSize: 14 }} onClick={() => go('shop')}>חזרה לקנייה</button>
        </div>
        <span className="sub">כל הקניות שנשמרו, לפי חודש</span>
      </header>
      {body}
    </>
  )
}
