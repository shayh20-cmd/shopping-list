-- Online orders: the chains' online stores and their delivery fees. Run once after prices.sql.

create table if not exists chain_online (
  store_key text primary key references chain_stores(key) on delete cascade,
  label text not null,
  delivery_fee numeric(10,2),        -- null when the chain shows the fee only at checkout
  min_order numeric(10,2),
  fee_note text,
  updated_at timestamptz not null default now()
);
alter table chain_online enable row level security;
drop policy if exists read_all on chain_online;
create policy read_all on chain_online for select to authenticated using (true);

drop function if exists compare_stores(uuid);
drop function if exists basket_lines(uuid);

-- One row per (store, list item): physical stores within the radius, plus every online store.
create function basket_lines(hh uuid)
returns table (
  store_key text, chain_name text, store_name text, address text, city text, distance_km double precision, approx boolean,
  online boolean, delivery_fee numeric, min_order numeric, fee_note text,
  item_id uuid, item_name text, qty numeric, price numeric, matched_name text, exact boolean
) language sql stable as $$
  with h as (
    select home_lat, home_lng, radius_km from households where id = hh and is_member(hh) and home_lat is not null
  ), stores as (
    select s.key, s.chain_name, s.name, s.address, s.city, km_between(h.home_lat, h.home_lng, s.lat, s.lng) as dist, s.approx,
           false as online, null::numeric as fee, null::numeric as min_order, null::text as fee_note
    from chain_stores s, h
    where s.lat is not null and km_between(h.home_lat, h.home_lng, s.lat, s.lng) <= h.radius_km
      and s.key not in (select store_key from chain_online)
    union all
    select s.key, s.chain_name, o.label, null, null, null, false, true, o.delivery_fee, o.min_order, o.fee_note
    from chain_online o join chain_stores s on s.key = o.store_key
    where exists (select 1 from h)
  ), items as (
    select li.id, li.name, li.qty, p.barcode
    from list_items li
    join lists l on l.id = li.list_id and l.kind = 'grocery'
    left join products p on p.id = li.product_id
    where li.household_id = hh and not li.checked
  )
  select s.key, s.chain_name, s.name, s.address, s.city, s.dist, s.approx, s.online, s.fee, s.min_order, s.fee_note,
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
