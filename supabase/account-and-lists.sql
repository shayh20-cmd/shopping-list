-- Fixed-list details and account deletion. Run once in Supabase → SQL Editor, after fixed-lists.sql.

-- Who made a fixed list and when it last changed, shown in the catalog's fixed-lists view.
alter table lists add column if not exists created_by text;
alter table lists add column if not exists updated_at timestamptz not null default now();
update lists l set updated_at = greatest(l.created_at, coalesce((select max(i.updated_at) from list_items i where i.list_id = l.id), l.created_at));

-- Deletes the signed-in user. A household they share stays with the other members;
-- a household they are alone in is deleted with everything in it.
create or replace function delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  -- Households with nobody else in them go.
  delete from households h
    where (h.created_by = uid or exists (select 1 from household_members m where m.household_id = h.id and m.user_id = uid))
      and not exists (select 1 from household_members m where m.household_id = h.id and m.user_id <> uid);
  -- households.created_by cascades on user delete, so hand shared households to another member first.
  update households h set created_by = (
      select m.user_id from household_members m where m.household_id = h.id and m.user_id <> uid limit 1)
    where h.created_by = uid;
  delete from auth.users where id = uid;
end;
$$;
revoke all on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;
