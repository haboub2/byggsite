-- Fix: is_admin() read the admins table under RLS, and the admins table's own
-- select policy calls is_admin(), so Postgres stopped with "infinite recursion
-- detected in policy for relation admins". Every admin check failed and
-- signed-in admins were shown as "saknar admin-behörighet".
--
-- security definer runs the lookup as the function owner, which bypasses RLS
-- on admins. The function only answers yes/no for the caller's own uid, so it
-- exposes nothing. search_path is pinned so the definer can't be hijacked.

create or replace function public.is_admin() returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists(select 1 from public.admins where user_id = auth.uid())
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;
