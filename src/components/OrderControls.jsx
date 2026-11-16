import { actions } from '../lib/store'
import Icon from './Icon'

// א-ב on, or off for the household's own order. Shared by the catalog and the list, kept on the device.
export function AbcChip({ abc }) {
  return (
    <button className={`chip ${abc ? 'on' : ''}`} aria-pressed={abc} onClick={() => actions.setPref({ abc: !abc })}
      title={abc ? 'לחיצה נוספת עוברת לסידור ידני' : 'חזרה לסידור א-ב'}>
      א-ב
    </button>
  )
}

export function OrderHint({ grouped = true }) {
  return (
    <p className="order-hint">
      <Icon name="grip" size={16} width={3} />
      <span>סידור ידני: גוררים מוצר מהידית{grouped ? ', גם לקטגוריה אחרת' : ''}.</span>
    </p>
  )
}
