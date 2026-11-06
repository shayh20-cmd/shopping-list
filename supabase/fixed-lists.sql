-- Fixed lists (רשימות קבועות): run once in Supabase → SQL Editor on a database set up before this change.
-- A fixed list is a row in lists with kind 'fixed'; its items live in list_items like any list's.
-- basket_lines only reads kind 'grocery', so fixed lists stay out of the price comparison.

alter table lists drop constraint if exists lists_kind_check;
alter table lists add constraint lists_kind_check check (kind in ('grocery', 'general', 'fixed'));

-- The fixed lists a shopping trip was started from ("מבוסס על"); cleared when the trip ends.
alter table lists add column if not exists based_on uuid[] not null default '{}';
