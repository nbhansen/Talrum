-- A deleted user's access token stays valid until it expires, and Storage
-- checks only the signature. Without this, a second device can upload under
-- the purged prefix after account deletion (#639).
create or replace function private.is_pictogram_storage_writable(p_object_name text)
returns boolean
language sql security definer stable
set search_path = public as $$
  select private.has_owner_access(private.storage_owner_id(p_object_name), true)
    and exists (select 1 from auth.users where id = auth.uid());
$$;
