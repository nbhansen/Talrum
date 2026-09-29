-- One sharing rule for the four owner-scoped helpers: a new role or a
-- changed join is one edit here, not four that must agree.

create function private.has_owner_access(p_owner_id uuid, p_write boolean)
returns boolean
language sql security definer stable
set search_path = public as $$
  select coalesce(p_owner_id = auth.uid(), false)
    or exists (
      select 1
      from boards b
      join board_members bm on bm.board_id = b.id
      where b.owner_id = p_owner_id
        and bm.user_id = auth.uid()
        and (not p_write or bm.role = 'editor')
    );
$$;

-- Null unless the first folder is a canonical uuid, so a malformed object
-- path fails the check, not the cast.
create function private.storage_owner_id(p_object_name text)
returns uuid
language sql immutable
set search_path = public as $$
  select case
    when f ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then f::uuid
  end
  from (select (storage.foldername(p_object_name))[1] as f) folder;
$$;

create or replace function private.is_owner_shared_with_me(p_owner_id uuid)
returns boolean
language sql security definer stable
set search_path = public as $$
  select private.has_owner_access(p_owner_id, false);
$$;

create or replace function private.is_editor_for_owner(p_owner_id uuid)
returns boolean
language sql security definer stable
set search_path = public as $$
  select private.has_owner_access(p_owner_id, true);
$$;

create or replace function private.is_pictogram_storage_visible(p_object_name text)
returns boolean
language sql security definer stable
set search_path = public as $$
  select private.has_owner_access(private.storage_owner_id(p_object_name), false);
$$;

create or replace function private.is_pictogram_storage_writable(p_object_name text)
returns boolean
language sql security definer stable
set search_path = public as $$
  select private.has_owner_access(private.storage_owner_id(p_object_name), true);
$$;
