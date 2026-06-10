-- Atomic pictogram deletion RPC (#280).
--
-- `boards.step_ids` is a bare uuid[] with no FK, so deleting a pictogram
-- used to require the client to scrub references itself: SELECT + N UPDATEs
-- + DELETE from the browser, with the scrub list computed from the client
-- cache at enqueue time. Non-atomic (a crash mid-way leaves partial state)
-- and the stale scrub list could miss boards edited between enqueue and
-- drain, leaving dangling step_ids forever. This function recomputes the
-- referencing boards at execution time and runs scrub + delete in one
-- transaction. Storage cleanup stays client-side.
--
-- SECURITY INVOKER on purpose: RLS scopes the UPDATE to boards the caller
-- can write and the DELETE to pictograms they own, so no authorization code
-- is needed here and the rest_surface_contract_test invariant (no SECURITY
-- DEFINER functions in public) holds. Idempotent: a retry after success
-- (outbox redelivery) finds nothing to scrub or delete and is a no-op.
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
