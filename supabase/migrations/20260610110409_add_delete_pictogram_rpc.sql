-- Atomic pictogram deletion (#280): step_ids has no FK, and a client-side
-- scrub was non-atomic and could go stale between enqueue and drain. The
-- RPC recomputes referencing boards at execution time in one transaction.
-- SECURITY INVOKER: RLS is the authorization; retries no-op (outbox).
create function public.delete_pictogram(p_pictogram_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update boards
     set step_ids = array_remove(step_ids, p_pictogram_id)
   where step_ids @> array[p_pictogram_id];
  delete from pictograms where id = p_pictogram_id;
end;
$$;

-- Per the grant contract in 20260427000000_tighten_grants.sql: anon has no
-- surface in this app, so strip the default PUBLIC execute grant and pin
-- execute per role. (Safe to revoke here — unlike the private RLS helpers,
-- this function is never evaluated inside a policy.)
revoke all on function public.delete_pictogram(uuid) from public, anon;
grant execute on function public.delete_pictogram(uuid) to authenticated, service_role;
