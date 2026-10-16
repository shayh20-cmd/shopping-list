import { useState } from 'react'
import { useStore, actions } from './lib/store'
import { isConfigured } from './lib/supabase'
import Icon from './components/Icon'
import ListScreen from './screens/ListScreen'
import CatalogScreen from './screens/CatalogScreen'
import ShopScreen from './screens/ShopScreen'
import ListsScreen from './screens/ListsScreen'
import { LoginScreen, SetupScreen } from './screens/AuthScreens'

const TABS = [
  { key: 'list', label: 'רשימה', icon: 'list' },
  { key: 'catalog', label: 'קטלוג', icon: 'catalog' },
  { key: 'shop', label: 'קנייה', icon: 'shop' },
  { key: 'lists', label: 'כל הרשימות', icon: 'lists' },
]

export default function App() {
  const s = useStore()
  const [tab, setTab] = useState('list')

  if (!s.ready && !s.household) return <div className="app" dir="rtl" />
  if (isConfigured && s.ready && !s.session) return <div className="app" dir="rtl"><LoginScreen /></div>
  if (isConfigured && s.ready && !s.household) return <div className="app" dir="rtl"><SetupScreen /></div>
  if (!s.household) return <div className="app" dir="rtl" />

  const list = s.lists.find((l) => l.id === s.activeListId) ?? s.lists[0] ?? null
  const go = (t) => setTab(t)

  return (
    <div className="app" dir="rtl">
      {s.error && (
        <div className="toast" role="alert">
          <span>{s.error}</span>
          <button className="link-btn" onClick={actions.clearError}>סגור</button>
        </div>
      )}
      <main className={`screen ${tab === 'shop' ? 'shop' : ''}`}>
        {tab === 'list' && <ListScreen list={list} go={go} />}
        {tab === 'catalog' && <CatalogScreen list={list} />}
        {tab === 'shop' && <ShopScreen list={list} go={go} />}
        {tab === 'lists' && <ListsScreen go={go} />}
      </main>
      <nav className="tabs" aria-label="ניווט ראשי">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'on' : ''}`} aria-current={tab === t.key ? 'page' : undefined}
            onClick={() => setTab(t.key)}>
            <span className="tab-icon"><Icon name={t.icon} /></span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
