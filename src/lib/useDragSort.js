import { useState } from 'react'

// Drag a row by its handle, with a finger or a mouse. Rows carry data-drag-id (and data-drag-cat),
// category headers carry data-drop-cat. onDrop(id, { id?, after?, cat? }) gets the row or header under the pointer.
export default function useDragSort(onDrop) {
  const [drag, setDrag] = useState(null) // { id, dy, target }

  const start = (e, id) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    const scroller = e.currentTarget.closest('.screen') ?? document.scrollingElement
    const y0 = e.clientY
    const s0 = scroller.scrollTop
    let x = e.clientX
    let y = e.clientY
    let cur = { id, dy: 0, target: null }

    const update = () => {
      const el = document.elementFromPoint(x, y)?.closest('[data-drag-id], [data-drop-cat]')
      let target = null
      if (el?.dataset.dragId && el.dataset.dragId !== id) {
        const r = el.getBoundingClientRect()
        target = { id: el.dataset.dragId, after: y > r.top + r.height / 2, cat: el.dataset.dragCat }
      } else if (el?.dataset.dropCat) {
        target = { cat: el.dataset.dropCat }
      } else if (el?.dataset.dragId === id) {
        target = cur.target
      }
      cur = { id, dy: y - y0 + scroller.scrollTop - s0, target }
      setDrag(cur)
    }
    const move = (ev) => {
      x = ev.clientX
      y = ev.clientY
      update()
    }
    // Near the top or bottom edge the screen scrolls by itself.
    const tick = setInterval(() => {
      const r = scroller.getBoundingClientRect()
      const top = Math.max(r.top, 0)
      const bottom = Math.min(r.bottom, window.innerHeight)
      if (y < top + 56) scroller.scrollTop -= 12
      else if (y > bottom - 56) scroller.scrollTop += 12
      else return
      update()
    }, 16)
    const end = (ev) => {
      clearInterval(tick)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      setDrag(null)
      if (ev.type === 'pointerup' && cur.target) onDrop(id, cur.target)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    setDrag(cur)
  }

  // A draggable row: its attributes (spread on the element) and its extra class.
  const rowProps = (id, cat) => {
    if (!id) return { attrs: {}, cls: '' }
    const t = drag?.target
    const cls = drag?.id === id ? 'dragging' : t?.id === id ? (t.after ? 'drop-after' : 'drop-before') : ''
    const style = drag?.id === id ? { transform: `translateY(${drag.dy}px)` } : undefined
    return { attrs: { 'data-drag-id': id, 'data-drag-cat': cat, style }, cls }
  }
  const handleProps = (id) => ({ onPointerDown: (e) => start(e, id) })
  const dropClass = (cat) => (drag && !drag.target?.id && drag.target?.cat === cat ? 'drop-into' : '')

  return { drag, rowProps, handleProps, dropClass }
}
