-- Shared shopping list: run once in Supabase → SQL Editor.

create extension if not exists pgcrypto;

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null default upper(substr(md5(random()::text), 1, 6)),
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists household_members (
  household_id uuid not null references households on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  display_name text,
  primary key (household_id, user_id)
);

create table if not exists products (
  id uuid primary key,
  household_id uuid not null references households on delete cascade,
  name text not null,
  category text not null,
  created_at timestamptz not null default now()
);

create table if not exists lists (
  id uuid primary key,
  household_id uuid not null references households on delete cascade,
  name text not null,
  kind text not null default 'grocery' check (kind in ('grocery', 'general')),
  tag text,
  created_at timestamptz not null default now()
);

create table if not exists list_items (
  id uuid primary key,
  household_id uuid not null references households on delete cascade,
  list_id uuid not null references lists on delete cascade,
  product_id uuid references products on delete set null,
  name text not null,
  category text,
  qty int not null default 1 check (qty > 0),
  note text not null default '',
  checked boolean not null default false,
  added_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists list_items_list_idx on list_items (list_id);
create index if not exists products_household_idx on products (household_id);

-- Membership check used by every policy. security definer avoids recursive RLS on household_members.
create or replace function is_member(hh uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members where household_id = hh and user_id = auth.uid());
$$;

-- The partner joins with the invite code shown in the app.
create or replace function join_household(code text, display_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hh uuid;
begin
  select id into hh from households where invite_code = upper(trim(code));
  if hh is null then raise exception 'invite code not found'; end if;
  insert into household_members (household_id, user_id, display_name)
    values (hh, auth.uid(), display_name)
    on conflict do nothing;
  return hh;
end;
$$;

alter table households enable row level security;
alter table household_members enable row level security;
alter table products enable row level security;
alter table lists enable row level security;
alter table list_items enable row level security;

drop policy if exists hh_select on households;
create policy hh_select on households for select using (is_member(id) or created_by = auth.uid());
drop policy if exists hh_insert on households;
create policy hh_insert on households for insert with check (created_by = auth.uid());
drop policy if exists hh_update on households;
create policy hh_update on households for update using (is_member(id));

drop policy if exists hm_select on household_members;
create policy hm_select on household_members for select using (is_member(household_id));
drop policy if exists hm_insert_creator on household_members;
create policy hm_insert_creator on household_members for insert with check (
  user_id = auth.uid()
  and exists (select 1 from households h where h.id = household_id and h.created_by = auth.uid())
);

drop policy if exists products_all on products;
create policy products_all on products for all using (is_member(household_id)) with check (is_member(household_id));
drop policy if exists lists_all on lists;
create policy lists_all on lists for all using (is_member(household_id)) with check (is_member(household_id));
drop policy if exists items_all on list_items;
create policy items_all on list_items for all using (is_member(household_id)) with check (is_member(household_id));

-- Realtime sync between both phones.
alter publication supabase_realtime add table products, lists, list_items;
