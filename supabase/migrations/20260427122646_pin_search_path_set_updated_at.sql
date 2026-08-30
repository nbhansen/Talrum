-- Pin search_path on set_updated_at (#64, advisor
-- function_search_path_mutable): an unpinned search_path lets a per-role
-- setting shadow objects the function references at runtime.
alter function public.set_updated_at() set search_path = public;
