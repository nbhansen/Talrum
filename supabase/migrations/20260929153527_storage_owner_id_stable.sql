-- storage.foldername is volatile to Postgres, so immutable was a false
-- contract (#600). The body is unchanged.
alter function private.storage_owner_id(text) stable;
