import { useState } from 'react'
import { useStore, actions } from './lib/store'
import { isConfigured } from './lib/supabase'
import Icon from './components/Icon'
import ListScreen from './screens/ListScreen'
import CatalogScreen from './screens/CatalogScreen'
import SettingsScreen from './screens/SettingsScreen'
import CompareScreen from './screens/CompareScreen'
import { LoginScreen, SetupScreen } from './screens/AuthScreens'

const TABS = [
  { key: 'list', label: 'רשימה', icon: 'list' },
  { key: 'catalog', label: 'קטלוג', icon: 'catalog' },
  { key: 'compare', label: 'איפה זול', icon: 'compare' },
  { key: 'settings', label: 'הגדרות', icon: 'settings' },
]

export default function App() {
  const s = useStore()
  const [tab, setTab] = useState('list')
  const [listMode, setListMode] = useState('edit') // 'edit' at home, 'shop' in the store
  // A fixed list being edited in the catalog; null means the catalog adds to the next trip.
  const [editingFixed, setEditingFixed] = useState(null)

  if (!s.ready && !s.household) return <div className="app" dir="rtl" />
  if (isConfigured && s.ready && !s.session) return <div className="app" dir="rtl"><LoginScreen /></div>
  if (isConfigured && s.ready && !s.household) return <div className="app" dir="rtl"><SetupScreen /></div>
  if (!s.household) return <div className="app" dir="rtl" />

  const list = s.lists.find((l) => l.kind === 'grocery') ?? s.lists.find((l) => l.kind !== 'fixed') ?? null
  // Leaving the catalog always ends fixed-list editing, so it can never stay on by accident.
  const go = (t) => {
    setEditingFixed(null)
    setTab(t)
  }
  const editFixed = (id) => {
    setEditingFixed(id)
    setTab('catalog')
  }

  return (
    <div className="app" dir="rtl">
      {s.error && (
        <div className="toast" role="alert">
          <span>{s.error}</span>
          <button className="link-btn" onClick={actions.clearError}>סגור</button>
        </div>
      )}
      <main className={`screen ${tab === 'list' && listMode === 'shop' ? 'shop' : ''}`}>
        {tab === 'list' && <ListScreen list={list} mode={listMode} setMode={setListMode} />}
        {tab === 'catalog' && (
          <CatalogScreen list={list} editingId={editingFixed} editFixed={editFixed} doneEditing={() => setEditingFixed(null)} go={go} />
        )}
        {tab === 'compare' && <CompareScreen list={list} go={go} />}
        {tab === 'settings' && <SettingsScreen />}
      </main>
      <nav className="tabs" aria-label="ניווט ראשי">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'on' : ''}`} aria-current={tab === t.key ? 'page' : undefined}
            onClick={() => go(t.key)}>
            <span className="tab-icon"><Icon name={t.icon} /></span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
