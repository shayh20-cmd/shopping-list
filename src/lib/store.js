// App state with optimistic local updates, an offline write queue, and Supabase realtime sync.
import { useSyncExternalStore } from 'react'
import { supabase, isConfigured } from './supabase'
import { seedProducts, OTHER, stepQty } from '../data/catalog'

const STATE_KEY = 'shopping-state-v1'
const QUEUE_KEY = 'shopping-queue-v1'
const PERSISTED = ['household', 'members', 'products', 'lists', 'items', 'activeListId', 'settings']
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
  // Per-device preferences: home location and search radius for the store comparison.
  settings: { radiusKm: 5, home: null },
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

// Columns from a migration that may not have run yet (account-and-lists.sql). If the server
// doesn't know them (PGRST204), the write is sent again without them instead of failing.
const OPTIONAL_COLUMNS = { lists: ['created_by', 'updated_at'] }

function withoutOptional(op) {
  const drop = (r) => Object.fromEntries(Object.entries(r).filter(([k]) => !OPTIONAL_COLUMNS[op.table].includes(k)))
  if (op.type === 'insert') return { ...op, rows: op.rows.map(drop) }
  if (op.type === 'update') {
    const patch = drop(op.patch)
    return Object.keys(patch).length ? { ...op, patch } : null
  }
  return op
}

async function runOp(op) {
  const r = await sendOp(op)
  if (r.error?.code !== 'PGRST204' || !OPTIONAL_COLUMNS[op.table]) return r
  const lean = withoutOptional(op)
  return lean ? sendOp(lean) : { error: null }
}

function sendOp(op) {
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

function copyItem(item, listId) {
  const t = now()
  return {
    id: uuid(), household_id: state.household.id, list_id: listId, product_id: item.product_id,
    name: item.name, category: item.category, qty: item.qty, unit: item.unit ?? null, note: '', checked: false,
    added_by: me(), created_at: t, updated_at: t,
  }
}

// The fixed lists a shopping trip was started from, shown as "מבוסס על".
function setBases(listId, ids) {
  const list = state.lists.find((l) => l.id === listId)
  if (!list || (!ids.length && !list.based_on?.length)) return
  upsertLocal('lists', [{ id: listId, based_on: ids }])
  enqueue({ table: 'lists', type: 'update', id: listId, patch: { based_on: ids } })
}

// A fixed list shows when it last changed, so editing its items bumps it.
function touchLists(listIds) {
  const t = now()
  for (const id of new Set(listIds)) {
    if (state.lists.find((l) => l.id === id)?.kind !== 'fixed') continue
    upsertLocal('lists', [{ id, updated_at: t }])
    enqueue({ table: 'lists', type: 'update', id, patch: { updated_at: t } })
  }
}

function insertItems(rows) {
  if (!rows.length) return
  upsertLocal('list_items', rows)
  enqueue({ table: 'list_items', type: 'insert', rows })
  touchLists(rows.map((r) => r.list_id))
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
    if (existing) return actions.setQty(existing, stepQty(existing, 1))
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
    insertItems([row])
  },

  setQty(item, qty) {
    if (!(qty > 0)) return actions.removeItems([item.id])
    actions.updateItem(item, { qty })
  },

  // Produce between kilos and units; a switch to units rounds up to whole ones.
  setUnit(item, unit) {
    const qty = unit === 'unit' ? Math.max(1, Math.ceil(Number(item.qty))) : Number(item.qty)
    actions.updateItem(item, { unit, qty })
  },

  updateItem(item, patch) {
    const p = { ...patch, updated_at: now() }
    upsertLocal('list_items', [{ id: item.id, ...p }])
    enqueue({ table: 'list_items', type: 'update', id: item.id, patch: p })
    touchLists([item.list_id])
  },

  removeItems(ids) {
    if (!ids.length) return
    const drop = new Set(ids)
    touchLists(state.items.filter((i) => drop.has(i.id)).map((i) => i.list_id))
    removeLocal('list_items', ids)
    enqueue({ table: 'list_items', type: 'delete', ids })
  },

  // Save the checked items as a purchase. Online only: history is read from the server.
  async savePurchase({ storeName, storeKey = null, total = null, purchasedAt = null, items, source = 'manual' }) {
    const id = uuid()
    const hh = state.household.id
    const head = {
      id, household_id: hh, store_name: storeName.trim(), store_key: storeKey,
      total, source, created_by: me(), purchased_at: purchasedAt ?? now(),
    }
    let r = await supabase.from('purchases').insert(head)
    if (r.error) return r.error
    const rows = items.map((it) => ({
      purchase_id: id, household_id: hh, product_id: it.product_id ?? null, name: it.name,
      category: it.category ?? null, barcode: it.barcode ?? null, qty: it.qty ?? 1,
      unit_price: it.unit_price ?? null, line_total: it.line_total ?? null,
    }))
    if (rows.length) {
      r = await supabase.from('purchase_items').insert(rows)
      if (r.error) return r.error
    }
    return null
  },

  async loadPurchases() {
    const { data, error } = await supabase.from('purchases')
      .select('*, purchase_items(*)').eq('household_id', state.household.id)
      .order('purchased_at', { ascending: false }).limit(200)
    if (error) throw error
    return data
  },

  async deletePurchase(id) {
    const { error } = await supabase.from('purchases').delete().eq('id', id)
    return error
  },

  finishShopping(listId) {
    actions.removeItems(state.items.filter((i) => i.list_id === listId && i.checked).map((i) => i.id))
    // The next trip picks its base again.
    setBases(listId, [])
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

  // ---------- fixed lists: reusable bases for the next shopping trip ----------

  createFixedList(name) {
    const t = now()
    const row = {
      id: uuid(), household_id: state.household.id, name: name.trim() || 'רשימה קבועה', kind: 'fixed', tag: null,
      created_at: t, updated_at: t, ...(isConfigured ? { created_by: me() } : {}),
    }
    upsertLocal('lists', [row])
    enqueue({ table: 'lists', type: 'insert', rows: [row] })
    return row
  },

  renameList(list, name) {
    const clean = name.trim()
    if (!clean || clean === list.name) return
    upsertLocal('lists', [{ id: list.id, name: clean }])
    enqueue({ table: 'lists', type: 'update', id: list.id, patch: { name: clean } })
  },

  deleteList(list) {
    // The server cascades the items; drop them here too.
    removeLocal('list_items', state.items.filter((i) => i.list_id === list.id).map((i) => i.id))
    removeLocal('lists', [list.id])
    enqueue({ table: 'lists', type: 'delete', ids: [list.id] })
  },

  // Add a fixed list to a shopping list. An item already there keeps the larger quantity.
  loadFixedList(fixedId, intoId) {
    const target = state.items.filter((i) => i.list_id === intoId && !i.checked)
    const rows = []
    for (const f of state.items.filter((i) => i.list_id === fixedId)) {
      const existing = target.find((i) => (f.product_id ? i.product_id === f.product_id : i.name === f.name))
      if (existing) {
        if (existing.qty < f.qty) actions.setQty(existing, f.qty)
      } else {
        rows.push(copyItem(f, intoId))
      }
    }
    insertItems(rows)
    const bases = state.lists.find((l) => l.id === intoId)?.based_on ?? []
    if (!bases.includes(fixedId)) setBases(intoId, [...bases, fixedId])
  },

  // What a list holds after "איפוס בחירה": nothing, or for a trip based on fixed lists, exactly those bases.
  resetPlan(listId) {
    const list = state.lists.find((l) => l.id === listId)
    const current = state.items.filter((i) => i.list_id === listId && !i.checked)
    const base = new Map() // key -> fixed item, the larger quantity when two bases share a product
    if (list?.kind !== 'fixed') {
      for (const id of list?.based_on ?? []) {
        for (const f of state.items.filter((i) => i.list_id === id)) {
          const k = f.product_id ?? f.name
          if (!base.has(k) || base.get(k).qty < f.qty) base.set(k, f)
        }
      }
    }
    const keyOf = (i) => i.product_id ?? i.name
    return {
      remove: current.filter((i) => !base.has(keyOf(i))),
      restore: current.filter((i) => base.has(keyOf(i)) && i.qty !== base.get(keyOf(i)).qty),
      readd: [...base.values()].filter((f) => !current.some((i) => keyOf(i) === keyOf(f))),
      base,
    }
  },

  // Take one fixed list out of the trip: its items go, unless another base still has them.
  removeBase(listId, baseId) {
    const list = state.lists.find((l) => l.id === listId)
    const rest = (list?.based_on ?? []).filter((id) => id !== baseId)
    const keyOf = (i) => i.product_id ?? i.name
    const kept = new Set(state.items.filter((i) => rest.includes(i.list_id)).map(keyOf))
    const fromBase = new Set(state.items.filter((i) => i.list_id === baseId).map(keyOf))
    actions.removeItems(state.items
      .filter((i) => i.list_id === listId && !i.checked && fromBase.has(keyOf(i)) && !kept.has(keyOf(i)))
      .map((i) => i.id))
    setBases(listId, rest)
  },

  // Empty the trip and drop its bases, back to choosing how to start.
  clearTrip(listId) {
    actions.removeItems(state.items.filter((i) => i.list_id === listId && !i.checked).map((i) => i.id))
    setBases(listId, [])
  },

  resetList(listId) {
    const { remove, restore, readd, base } = actions.resetPlan(listId)
    actions.removeItems(remove.map((i) => i.id))
    for (const i of restore) actions.setQty(i, base.get(i.product_id ?? i.name).qty)
    insertItems(readd.map((f) => copyItem(f, listId)))
  },

  // Replace a fixed list's items with what is on a shopping list now (still to buy).
  saveAsFixedList(fromId, fixedId) {
    actions.removeItems(state.items.filter((i) => i.list_id === fixedId).map((i) => i.id))
    insertItems(state.items.filter((i) => i.list_id === fromId && !i.checked).map((i) => copyItem(i, fixedId)))
  },


  setSettings(patch) {
    const settings = { ...state.settings, ...patch }
    setState({ settings })
    // The nightly price job reads the home location from the household.
    if (isConfigured && state.household) {
      const row = { radius_km: settings.radiusKm, home_lat: settings.home?.lat ?? null, home_lng: settings.home?.lng ?? null }
      setState({ household: { ...state.household, ...row } })
      enqueue({ table: 'households', type: 'update', id: state.household.id, patch: row })
    }
  },

  pinProduct(product, item) {
    const patch = { barcode: item?.barcode ?? null, barcode_name: item?.name ?? null }
    upsertLocal('products', [{ id: product.id, ...patch }])
    enqueue({ table: 'products', type: 'update', id: product.id, patch })
  },

  // One row per (store in range, list item), computed by the basket_lines SQL function.
  async basketLines() {
    const { data, error } = await supabase.rpc('basket_lines', { hh: state.household.id })
    if (error) throw error
    return data
  },

  // One scanned barcode: the item, and its price at every loaded store (physical ones carry coordinates).
  async barcodePrices(code) {
    const [item, prices, online] = await Promise.all([
      supabase.from('chain_items').select('barcode, name, manufacturer, quantity, unit').eq('barcode', code).maybeSingle(),
      supabase.from('store_prices')
        .select('price, store_key, chain_stores(chain_name, name, address, city, lat, lng, approx)').eq('barcode', code),
      supabase.from('chain_online').select('store_key, label, delivery_fee'),
    ])
    const error = item.error || prices.error
    if (error) throw error
    return { item: item.data, prices: prices.data, online: online.data ?? [] }
  },

  async searchItems(q) {
    const { data, error } = await supabase.rpc('search_items', { q })
    if (error) throw error
    return data
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

  // The code from the same email. An iPhone home-screen app cannot receive the link (it opens
  // in Safari, whose sign-in the app does not share), so the code is typed in the app instead.
  async verifyEmailCode(email, token) {
    return supabase.auth.verifyOtp({ email, token, type: 'email' })
  },

  async signOut() {
    await supabase.auth.signOut()
    queue = []
    writeJSON(QUEUE_KEY, queue)
    setState({ ...empty, ready: true })
  },

  // Deletes the user on the server (delete_my_account in account-and-lists.sql), then signs out.
  async deleteAccount() {
    const { error } = await supabase.rpc('delete_my_account')
    if (error) return error
    await actions.signOut()
    return null
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
  let lists = l.data
  if (!lists.some((x) => x.kind === 'grocery')) {
    const row = { id: uuid(), household_id: hh.id, name: 'רשימת קניות', kind: 'grocery', tag: '', created_at: now() }
    lists = [...lists, row]
    enqueue({ table: 'lists', type: 'insert', rows: [row] })
  }
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
    .select('household_id, households(*)')
    .eq('user_id', uid)
    .limit(1)
  if (error) return // offline: keep the cached household
  const hh = data[0]?.households ?? null
  if (!hh) {
    setState({ household: null, products: [], lists: [], items: [], members: [] })
    return
  }
  const settings = hh.home_lat == null ? state.settings
    : { ...state.settings, home: { lat: hh.home_lat, lng: hh.home_lng }, radiusKm: hh.radius_km ?? state.settings.radiusKm }
  setState({ household: hh, settings })
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
