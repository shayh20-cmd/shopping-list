// App state with optimistic local updates, an offline write queue, and Supabase realtime sync.
import { useSyncExternalStore } from 'react'
import { supabase, isConfigured } from './supabase'
import { seedProducts, OTHER } from '../data/catalog'

const STATE_KEY = 'shopping-state-v1'
const QUEUE_KEY = 'shopping-queue-v1'
const PERSISTED = ['household', 'members', 'products', 'lists', 'items', 'activeListId']
const TABLE_KEY = { products: 'products', lists: 'lists', list_items: 'items' }

function readJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key))
    return v ?? fallback
  } catch {
    return fallback
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage full or blocked: the app keeps working in memory
  }
}

const empty = {
  ready: false,
  session: null,
  household: null,
  members: [],
  products: [],
  lists: [],
  items: [],
  activeListId: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pending: 0,
  error: null,
}

let state = { ...empty, ...readJSON(STATE_KEY, {}), ready: false, session: null }
let queue = readJSON(QUEUE_KEY, [])
state.pending = queue.length
const listeners = new Set()

function setState(patch) {
  state = { ...state, ...patch }
  const saved = {}
  for (const k of PERSISTED) saved[k] = state[k]
  writeJSON(STATE_KEY, saved)
  listeners.forEach((l) => l())
}

export function useStore() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

export const getState = () => state

// ---------- local mutations ----------

function upsertLocal(table, rows) {
  const key = TABLE_KEY[table]
  const byId = new Map(state[key].map((r) => [r.id, r]))
  for (const r of rows) byId.set(r.id, { ...byId.get(r.id), ...r })
  setState({ [key]: [...byId.values()] })
}

function removeLocal(table, ids) {
  const key = TABLE_KEY[table]
  const drop = new Set(ids)
  setState({ [key]: state[key].filter((r) => !drop.has(r.id)) })
}

// ---------- remote write queue ----------

let flushing = false

function enqueue(op) {
  if (!isConfigured) return
  queue.push(op)
  writeJSON(QUEUE_KEY, queue)
  setState({ pending: queue.length })
  flush()
}

function runOp(op) {
  const t = supabase.from(op.table)
  if (op.type === 'insert') return t.insert(op.rows)
  if (op.type === 'update') return t.update(op.patch).eq('id', op.id)
  return t.delete().in('id', op.ids)
}

async function flush() {
  if (flushing || !isConfigured || !navigator.onLine) return
  flushing = true
  try {
    while (queue.length) {
      const { error } = await runOp(queue[0])
      // PostgREST errors carry a code; a missing code means the request never reached the server.
      if (error && !error.code) break
      if (error) {
        console.error('sync error', error)
        setState({ error: 'שינוי אחד לא נשמר בשרת' })
      }
      queue.shift()
      writeJSON(QUEUE_KEY, queue)
      setState({ pending: queue.length })
    }
  } finally {
    flushing = false
  }
}

// ---------- helpers ----------

const now = () => new Date().toISOString()
const uuid = () => crypto.randomUUID()

export function displayName(session) {
  const meta = session?.user?.user_metadata
  return meta?.full_name || meta?.name || session?.user?.email?.split('@')[0] || 'אני'
}

function me() {
  return isConfigured ? displayName(state.session) : null
}

// ---------- actions ----------

export const actions = {
  setActiveList(id) {
    setState({ activeListId: id })
  },

  addToList(listId, { name, category = null, productId = null }) {
    const clean = name.trim()
    if (!clean) return
    const existing = state.items.find(
      (i) => i.list_id === listId && !i.checked && (productId ? i.product_id === productId : i.name === clean),
    )
    if (existing) return actions.setQty(existing, existing.qty + 1)
    const row = {
      id: uuid(),
      household_id: state.household.id,
      list_id: listId,
      product_id: productId,
      name: clean,
      category,
      qty: 1,
      note: '',
      checked: false,
      added_by: me(),
      created_at: now(),
      updated_at: now(),
    }
    upsertLocal('list_items', [row])
    enqueue({ table: 'list_items', type: 'insert', rows: [row] })
  },

  setQty(item, qty) {
    if (qty < 1) return actions.removeItems([item.id])
    actions.updateItem(item, { qty })
  },

  updateItem(item, patch) {
    const p = { ...patch, updated_at: now() }
    upsertLocal('list_items', [{ id: item.id, ...p }])
    enqueue({ table: 'list_items', type: 'update', id: item.id, patch: p })
  },

  removeItems(ids) {
    if (!ids.length) return
    removeLocal('list_items', ids)
    enqueue({ table: 'list_items', type: 'delete', ids })
  },

  finishShopping(listId) {
    actions.removeItems(state.items.filter((i) => i.list_id === listId && i.checked).map((i) => i.id))
  },

  addProduct({ name, category = OTHER }) {
    const clean = name.trim()
    const found = state.products.find((p) => p.name === clean)
    if (found) return found
    const row = { id: uuid(), household_id: state.household.id, name: clean, category, created_at: now() }
    upsertLocal('products', [row])
    enqueue({ table: 'products', type: 'insert', rows: [row] })
    return row
  },

  createList({ name, kind = 'grocery', tag = '' }) {
    const row = { id: uuid(), household_id: state.household.id, name: name.trim(), kind, tag: tag.trim(), created_at: now() }
    upsertLocal('lists', [row])
    enqueue({ table: 'lists', type: 'insert', rows: [row] })
    setState({ activeListId: row.id })
    return row
  },

  deleteList(id) {
    removeLocal('lists', [id])
    removeLocal('list_items', state.items.filter((i) => i.list_id === id).map((i) => i.id))
    enqueue({ table: 'lists', type: 'delete', ids: [id] })
    if (state.activeListId === id) setState({ activeListId: state.lists[0]?.id ?? null })
  },

  clearError() {
    setState({ error: null })
  },

  async signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + import.meta.env.BASE_URL },
    })
  },

  async signInWithEmail(email) {
    return supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + import.meta.env.BASE_URL },
    })
  },

  async signOut() {
    await supabase.auth.signOut()
    queue = []
    writeJSON(QUEUE_KEY, queue)
    setState({ ...empty, ready: true })
  },

  async createHousehold(name) {
    const uid = state.session.user.id
    const hh = { id: uuid(), name: name.trim() || 'הבית שלנו' }
    let r = await supabase.from('households').insert(hh)
    if (r.error) return r.error
    r = await supabase.from('household_members').insert({ household_id: hh.id, user_id: uid, display_name: me() })
    if (r.error) return r.error
    const products = seedProducts().map((p) => ({ id: uuid(), household_id: hh.id, ...p }))
    r = await supabase.from('products').insert(products)
    if (r.error) return r.error
    r = await supabase.from('lists').insert({ id: uuid(), household_id: hh.id, name: 'סופר', kind: 'grocery', tag: 'קנייה שבועית' })
    if (r.error) return r.error
    await loadHousehold()
    return null
  },

  async joinHousehold(code) {
    const { error } = await supabase.rpc('join_household', { code, display_name: me() })
    if (error) return error
    await loadHousehold()
    return null
  },
}

// ---------- loading & realtime ----------

let channel = null

async function refresh() {
  const hh = state.household
  if (!hh || !isConfigured) return
  await flush()
  if (queue.length) return // still offline: keep local state until writes land
  const [p, l, i, m] = await Promise.all([
    supabase.from('products').select('*').eq('household_id', hh.id),
    supabase.from('lists').select('*').eq('household_id', hh.id).order('created_at'),
    supabase.from('list_items').select('*').eq('household_id', hh.id),
    supabase.from('household_members').select('user_id, display_name').eq('household_id', hh.id),
  ])
  if (p.error || l.error || i.error || m.error) return
  const lists = l.data
  const activeListId = lists.some((x) => x.id === state.activeListId) ? state.activeListId : lists[0]?.id ?? null
  setState({ products: p.data, lists, items: i.data, members: m.data, activeListId })
}

function subscribe(hhId) {
  if (channel) supabase.removeChannel(channel)
  const onChange = (table) => (payload) => {
    if (payload.eventType === 'DELETE') removeLocal(table, [payload.old.id])
    else upsertLocal(table, [payload.new])
  }
  channel = supabase.channel(`hh-${hhId}`)
  for (const table of Object.keys(TABLE_KEY)) {
    const filter = `household_id=eq.${hhId}`
    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, onChange(table))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter }, onChange(table))
      // Delete events cannot be filtered; removing an unknown id is harmless.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, onChange(table))
  }
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') refresh()
  })
}

async function loadHousehold() {
  const uid = state.session?.user?.id
  if (!uid) return
  const { data, error } = await supabase
    .from('household_members')
    .select('household_id, households(id, name, invite_code)')
    .eq('user_id', uid)
    .limit(1)
  if (error) return // offline: keep the cached household
  const hh = data[0]?.households ?? null
  if (!hh) {
    setState({ household: null, products: [], lists: [], items: [], members: [] })
    return
  }
  setState({ household: hh })
  subscribe(hh.id)
  await refresh()
}

function initLocal() {
  if (state.household) return
  const household = { id: 'local', name: 'הבית שלנו', invite_code: null }
  const products = seedProducts().map((p) => ({ id: uuid(), household_id: 'local', ...p }))
  const list = { id: uuid(), household_id: 'local', name: 'סופר', kind: 'grocery', tag: 'קנייה שבועית', created_at: now() }
  setState({ household, products, lists: [list], items: [], activeListId: list.id })
}

export async function init() {
  window.addEventListener('online', () => {
    setState({ online: true })
    refresh()
  })
  window.addEventListener('offline', () => setState({ online: false }))

  if (!isConfigured) {
    initLocal()
    setState({ ready: true })
    return
  }

  const { data } = await supabase.auth.getSession()
  setState({ session: data.session })
  supabase.auth.onAuthStateChange((event, session) => {
    setState({ session })
    if (event === 'SIGNED_IN') loadHousehold()
  })
  if (data.session) await loadHousehold()
  setState({ ready: true })
}
