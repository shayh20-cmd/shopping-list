-- Store price comparison. Run once in the Supabase SQL editor, after schema.sql.
-- Price data comes from the chains' public price files (Israeli price-transparency law),
-- loaded nightly by .github/workflows/prices.yml with the service role key.

-- Where the household shops: the nightly job loads only stores near a household's home.
alter table households
  add column if not exists home_lat double precision,
  add column if not exists home_lng double precision,
  add column if not exists radius_km int not null default 5;

-- A product can be pinned to one exact item (barcode); otherwise it is compared by name.
alter table products add column if not exists barcode text;
alter table products add column if not exists barcode_name text;

create extension if not exists pg_trgm;

create table if not exists chain_stores (
  key text primary key,            -- "<chain id>-<store id>"
  chain_id text not null,
  chain_name text not null,
  store_id text not null,
  name text,
  address text,
  city text,
  lat double precision,
  lng double precision,
  geocoded boolean not null default false,
  approx boolean not null default false,  -- located by city only
  updated_at timestamptz not null default now()
);

create table if not exists chain_items (
  barcode text primary key,
  name text not null,
  manufacturer text,
  quantity text,
  unit text,
  updated_at timestamptz not null default now()
);
create index if not exists chain_items_name_trgm on chain_items using gin (name gin_trgm_ops);

create table if not exists store_prices (
  store_key text not null references chain_stores(key) on delete cascade,
  barcode text not null,
  price numeric(10,2) not null,
  updated_at timestamptz not null default now(),
  primary key (store_key, barcode)
);

-- Cheapest item per store whose name starts with a household product name ("חלב" -> "חלב 3% 1 ליטר").
create table if not exists store_generic_prices (
  store_key text not null references chain_stores(key) on delete cascade,
  product_name text not null,
  barcode text not null,
  item_name text not null,
  price numeric(10,2) not null,
  primary key (store_key, product_name)
);

alter table chain_stores enable row level security;
alter table chain_items enable row level security;
alter table store_prices enable row level security;
alter table store_generic_prices enable row level security;

-- Public price data: any signed-in user can read it. Only the service role writes.
drop policy if exists read_all on chain_stores;
create policy read_all on chain_stores for select to authenticated using (true);
drop policy if exists read_all on chain_items;
create policy read_all on chain_items for select to authenticated using (true);
drop policy if exists read_all on store_prices;
create policy read_all on store_prices for select to authenticated using (true);
drop policy if exists read_all on store_generic_prices;
create policy read_all on store_generic_prices for select to authenticated using (true);

create or replace function km_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- One row per store item on the household's shopping list, for every store in range.
create or replace function basket_lines(hh uuid)
returns table (
  store_key text, chain_name text, store_name text, address text, city text, distance_km double precision, approx boolean,
  item_id uuid, item_name text, qty int, price numeric, matched_name text, exact boolean
) language sql stable as $$
  with h as (
    select home_lat, home_lng, radius_km from households where id = hh and is_member(hh) and home_lat is not null
  ), stores as (
    select s.*, km_between(h.home_lat, h.home_lng, s.lat, s.lng) as dist
    from chain_stores s, h
    where s.lat is not null and km_between(h.home_lat, h.home_lng, s.lat, s.lng) <= h.radius_km
  ), items as (
    select li.id, li.name, li.qty, p.barcode
    from list_items li
    join lists l on l.id = li.list_id and l.kind = 'grocery'
    left join products p on p.id = li.product_id
    where li.household_id = hh and not li.checked
  )
  select s.key, s.chain_name, s.name, s.address, s.city, s.dist, s.approx,
         i.id, i.name, i.qty,
         coalesce(sp.price, g.price),
         case when sp.price is not null then ci.name else g.item_name end,
         sp.price is not null
  from stores s
  cross join items i
  left join store_prices sp on sp.store_key = s.key and sp.barcode = i.barcode
  left join chain_items ci on ci.barcode = i.barcode
  left join store_generic_prices g on g.store_key = s.key and g.product_name = i.name
$$;

-- Basket total per store, cheapest first. Stores missing items are ranked after complete ones.
create or replace function compare_stores(hh uuid)
returns table (
  store_key text, chain_name text, store_name text, address text, city text, distance_km double precision,
  total numeric, found int, missing int
) language sql stable as $$
  select store_key, chain_name, store_name, address, city, distance_km,
         coalesce(sum(price * qty), 0), count(price)::int, (count(*) - count(price))::int
  from basket_lines(hh)
  group by store_key, chain_name, store_name, address, city, distance_km
  order by (count(*) - count(price)), coalesce(sum(price * qty), 0)
$$;

-- Exact-item search for pinning a product to a barcode.
create or replace function search_items(q text)
returns table (barcode text, name text, manufacturer text, quantity text, unit text)
language sql stable as $$
  select barcode, name, manufacturer, quantity, unit from chain_items
  where name ilike '%' || q || '%'
  order by similarity(name, q) desc
  limit 30
$$;

-- Geocoding results kept between nightly runs (address -> coordinates; null when not found).
create table if not exists geo_cache (
  query text primary key,
  lat double precision,
  lng double precision
);
alter table geo_cache enable row level security;
