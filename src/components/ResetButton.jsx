import { useState } from 'react'
import { useStore, actions } from '../lib/store'

// "איפוס בחירה": empties a list, or brings a trip based on fixed lists back to exactly those bases.
// Always asks first. Items already checked into the cart are left alone.
export default function ResetButton({ list }) {
  const { lists } = useStore()
  const [asking, setAsking] = useState(false)
  const { remove, restore, readd } = actions.resetPlan(list.id)
  const changes = remove.length + restore.length + readd.length
  const bases = (list.based_on ?? []).map((id) => lists.find((l) => l.id === id)).filter(Boolean)

  let question
  if (list.kind === 'fixed') question = `לרוקן את "${list.name}"? כל ${remove.length} הפריטים יוסרו ממנה.`
  else if (!bases.length) question = `לאפס את הרשימה? כל ${remove.length} הפריטים יוסרו.`
  else {
    const names = bases.map((b) => b.name).join(' + ')
    const parts = []
    if (remove.length) parts.push(`${remove.length} פריטים שנוספו יוסרו`)
    if (restore.length) parts.push(`${restore.length} כמויות יחזרו לבסיס`)
    if (readd.length) parts.push(`${readd.length} פריטים מהבסיס יחזרו`)
    question = `להחזיר את הרשימה ל"${names}"? ${parts.join(', ')}.`
  }

  if (asking) {
    return (
      <div className="form reset-ask" role="alertdialog" aria-label="איפוס בחירה">
        <h2>{question}</h2>
        <button className="btn danger" onClick={() => { actions.resetList(list.id); setAsking(false) }}>כן, אפס</button>
        <button className="btn" onClick={() => setAsking(false)}>ביטול</button>
      </div>
    )
  }
  return (
    <button className="chip ghost" disabled={!changes} onClick={() => setAsking(true)}>
      איפוס בחירה
    </button>
  )
}
