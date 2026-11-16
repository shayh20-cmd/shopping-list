-- Manual product order (drag in the catalog and the list). Run once in the SQL Editor.
-- Until it runs, the app keeps the order on each device only.

alter table products add column if not exists sort_order double precision;
