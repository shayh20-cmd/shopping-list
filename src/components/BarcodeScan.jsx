import { useEffect, useRef, useState } from 'react'
import { useStore, actions } from '../lib/store'
import { isConfigured } from '../lib/supabase'
import { CATEGORIES, OTHER, PRODUCE } from '../data/catalog'
import { exactName, sizeLabel } from './ProductPicker'
import Icon from './Icon'

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128']
const shekel = (n) => `₪${Number(n).toFixed(2)}`

function km(a, b) {
  const r = (d) => (d * Math.PI) / 180
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

// The browser's own barcode reader where it has one (Android), otherwise ZXing (iPhone, desktop).
async function startReader(video, onCode) {
  const native = 'BarcodeDetector' in window
    && (await window.BarcodeDetector.getSupportedFormats().catch(() => [])).includes('ean_13')
  if (native) {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
    video.srcObject = stream
    await video.play()
    const detector = new window.BarcodeDetector({ formats: FORMATS })
    let timer
    const tick = async () => {
      try {
        const [hit] = await detector.detect(video)
        if (hit) return onCode(hit.rawValue)
      } catch {
        // a frame that isn't ready yet
      }
      timer = setTimeout(tick, 200)
    }
    tick()
    return () => {
      clearTimeout(timer)
      stream.getTracks().forEach((t) => t.stop())
    }
  }
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'), import('@zxing/library'),
  ])
  const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS,
    [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128]]])
  const reader = new BrowserMultiFormatReader(hints)
  let done = false
  const controls = await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (result) => {
    if (result && !done) {
      done = true
      onCode(result.getText())
    }
  })
  return () => controls.stop()
}

function Camera({ onCode }) {
  const video = useRef(null)
  const codeRef = useRef(onCode)
  codeRef.current = onCode
  const [error, setError] = useState('')

  useEffect(() => {
    let stop = null
    let cancelled = false
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('המכשיר לא מאפשר גישה למצלמה. אפשר להקליד את המספר שמתחת לברקוד.')
      return
    }
    startReader(video.current, (code) => codeRef.current(code))
      .then((s) => {
        if (cancelled) s()
        else stop = s
      })
      .catch((e) => {
        if (cancelled) return
        setError(e?.name === 'NotAllowedError'
          ? 'אין הרשאה למצלמה. אפשר לאשר אותה בהגדרות הדפדפן, או להקליד את המספר שמתחת לברקוד.'
          : 'לא הצלחנו לפתוח את המצלמה. אפשר להקליד את המספר שמתחת לברקוד.')
      })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [])

  if (error) return <div className="notice" role="alert">{error}</div>
  return (
    <div className="scan-view">
      <video ref={video} muted playsInline autoPlay aria-label="תמונת המצלמה" />
      <span className="scan-frame" aria-hidden="true" />
    </div>
  )
}

// Prices for one barcode: stores within the search radius, then online stores, cheapest first.
function Result({ code, list, onAgain }) {
  const s = useStore()
  const [data, setData] = useState({ loading: true })
  const [category, setCategory] = useState(OTHER)
  const [pinTo, setPinTo] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    actions.barcodePrices(code)
      .then((d) => setData({ loading: false, ...d }))
      .catch(() => setData({ loading: false, error: 'לא הצלחנו לטעון מחירים. בדקו את החיבור ונסו שוב.' }))
  }, [code])

  if (data.loading) return <div className="empty">מחפש את {code}…</div>
  if (data.error) return <div className="empty">{data.error}</div>

  const home = s.settings?.home
  const radius = s.settings?.radiusKm ?? 5
  const onlineBy = new Map(data.online.map((o) => [o.store_key, o]))
  const nearby = []
  const online = []
  for (const p of data.prices) {
    const st = p.chain_stores
    if (onlineBy.has(p.store_key)) online.push({ key: p.store_key, name: onlineBy.get(p.store_key).label, price: p.price })
    else if (st) {
      const dist = home && st.lat != null ? km(home, { lat: st.lat, lng: st.lng }) : null
      if (home && (dist == null || dist > radius)) continue
      nearby.push({ key: p.store_key, name: `${st.chain_name} ${st.name ?? ''}`.trim(), dist, approx: st.approx, address: st.address, price: p.price })
    }
  }
  nearby.sort((a, b) => a.price - b.price || (a.dist ?? 0) - (b.dist ?? 0))
  online.sort((a, b) => a.price - b.price)
  const cheapest = Math.min(...nearby.map((x) => x.price), ...online.map((x) => x.price))

  const item = data.item
  const title = item ? exactName(item) : `ברקוד ${code}`
  const product = s.products.find((p) => p.barcode === code)
  const pinnable = s.products.filter((p) => p.category !== PRODUCE).sort((a, b) => a.name.localeCompare(b.name, 'he'))

  const addToList = () => {
    let p = product
    if (!p) {
      p = actions.addProduct({ name: item?.name ?? title, category })
      if (!p.barcode) actions.pinProduct(p, { barcode: code, name: title })
    }
    actions.addToList(list.id, { name: p.name, category: p.category, productId: p.id })
    setNotice(`"${p.name}" נוסף לרשימה.`)
  }
  const pin = () => {
    const p = s.products.find((x) => x.id === pinTo)
    if (!p) return
    actions.pinProduct(p, { barcode: code, name: title })
    setNotice(`"${p.name}" יושווה מעכשיו לפי המוצר הזה.`)
    setPinTo('')
  }

  const row = (x) => (
    <div key={x.key} className={`row scan-price ${x.price === cheapest ? 'best' : ''}`}>
      <div className="row-main">
        <span className="row-name">{x.name}</span>
        <span className="row-meta">
          {x.price === cheapest && <span className="badge">הכי זול</span>}
          {x.dist != null && <span>{x.approx ? 'באזור העיר' : `${x.dist.toFixed(1)} ק"מ`}</span>}
          {x.address && <span>{x.address}</span>}
        </span>
      </div>
      <span className="scan-amount">{shekel(x.price)}</span>
    </div>
  )

  return (
    <>
      <div className="scan-item">
        <span className="row-name">{title}</span>
        <span className="row-meta">
          {item?.manufacturer && item.manufacturer !== 'לא ידוע' && <span>{item.manufacturer}</span>}
          <span>{code}</span>
          {product && <span className="badge">בקטלוג: {product.name}</span>}
        </span>
      </div>
      {notice && <div className="notice" role="status">{notice}</div>}

      {!nearby.length && !online.length ? (
        <div className="empty">
          {item ? `אין מחיר למוצר הזה בסניפים ${home ? `ברדיוס ${radius} ק"מ` : 'שנטענו'}.` : 'המוצר לא נמצא במאגר המחירים.'}
        </div>
      ) : (
        <>
          {nearby.length > 0 && (
            <>
              <div className="group-title">{home ? `סניפים ברדיוס ${radius} ק"מ` : 'סניפים'}</div>
              <div className="card">{nearby.map(row)}</div>
            </>
          )}
          {online.length > 0 && (
            <>
              <div className="group-title">הזמנה באינטרנט (בלי משלוח)</div>
              <div className="card">{online.map(row)}</div>
            </>
          )}
        </>
      )}
      {!home && <p className="sub" style={{ margin: '8px 20px 0' }}>כדי לראות מרחקים ולסנן לפי אזור, קבעו מיקום בהגדרות.</p>}

      <div className="form">
        {!product && (
          <label className="field">
            <span>מוצר חדש בקטלוג, באיזו קטגוריה?</span>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        )}
        <button className="btn primary" onClick={addToList}>הוסף לרשימה</button>
        {!product && (
          <div className="inline-form">
            <select className="select" value={pinTo} onChange={(e) => setPinTo(e.target.value)} aria-label="מוצר בקטלוג">
              <option value="">או לקבוע כמוצר המדויק של…</option>
              {pinnable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button className="btn small" onClick={pin} disabled={!pinTo}>קבע</button>
          </div>
        )}
      </div>
      <div className="actions"><button className="btn" onClick={onAgain}>סרוק מוצר נוסף</button></div>
    </>
  )
}

function ScanSheet({ list, onClose }) {
  const [code, setCode] = useState(null)
  const [typed, setTyped] = useState('')
  const submit = (e) => {
    e.preventDefault()
    const c = typed.replace(/\D/g, '')
    if (c.length >= 6) setCode(c)
  }
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="סריקת ברקוד" onClick={(e) => e.stopPropagation()}>
        <h2>{code ? 'מחירים באזור' : 'סרקו ברקוד'}</h2>
        {code ? (
          <Result code={code} list={list} onAgain={() => { setCode(null); setTyped('') }} />
        ) : (
          <>
            <Camera onCode={setCode} />
            <form className="quick-add" onSubmit={submit}>
              <label className="field" style={{ flex: 1 }}>
                <span>או הקלידו את המספר שמתחת לברקוד</span>
                <input className="input" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="7290000000000" />
              </label>
              <button className="btn primary" type="submit" style={{ alignSelf: 'flex-end' }}>חפש</button>
            </form>
          </>
        )}
        <div className="actions"><button className="btn" onClick={onClose}>סגור</button></div>
      </div>
    </div>
  )
}

// "סרוק ברקוד": prices for one product in the stores around you. Needs the shared account's price data.
export default function ScanButton({ list }) {
  const [open, setOpen] = useState(false)
  if (!isConfigured || !list) return null
  return (
    <>
      <button className="btn scan-btn" onClick={() => setOpen(true)}>
        <Icon name="scan" size={18} /> סרוק ברקוד
      </button>
      {open && <ScanSheet list={list} onClose={() => setOpen(false)} />}
    </>
  )
}
