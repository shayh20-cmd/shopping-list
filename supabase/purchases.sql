-- Purchase history: one row per shopping trip, with its items. Run once after schema.sql.

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  store_key text,                  -- chain_stores.key when known
  store_name text not null default '',
  purchased_at timestamptz not null default now(),
  total numeric(10,2),             -- amount paid, from the receipt; null when not entered
  source text not null default 'manual' check (source in ('manual', 'receipt', 'sms')),
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists purchases_hh on purchases (household_id, purchased_at desc);

create table if not exists purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  name text not null,
  category text,
  barcode text,
  qty numeric(10,3) not null default 1,
  unit_price numeric(10,2),
  line_total numeric(10,2)
);
create index if not exists purchase_items_purchase on purchase_items (purchase_id);

alter table purchases enable row level security;
alter table purchase_items enable row level security;
drop policy if exists purchases_all on purchases;
create policy purchases_all on purchases for all using (is_member(household_id)) with check (is_member(household_id));
drop policy if exists purchase_items_all on purchase_items;
create policy purchase_items_all on purchase_items for all using (is_member(household_id)) with check (is_member(household_id));
