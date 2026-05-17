-- Drop denormalised `accent_ink` from boards + template_boards. Ink is now
-- derived from `accent` in the read layer via inkForAccent (src/theme/tokens.ts).
-- Order matters: recreate the trigger function first so it stops referencing
-- the column, then drop. Body matches 20260425000000 except for the column
-- list in the boards INSERT.

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_kid_id       uuid;
  tp             record;
  tb             record;
  slug_to_uuid   jsonb := '{}'::jsonb;
  new_picto_id   uuid;
  remapped_steps uuid[];
begin
  if exists (select 1 from public.kids where owner_id = new.id) then
    return new;
  end if;

  insert into public.kids (owner_id, name)
  values (new.id, 'Liam')
  returning id into v_kid_id;

  for tp in select * from public.template_pictograms loop
    insert into public.pictograms
      (owner_id, slug, label, style, glyph, tint, image_path, audio_path)
    values
      (new.id, tp.slug, tp.label, tp.style, tp.glyph, tp.tint, tp.image_path, tp.audio_path)
    returning id into new_picto_id;
    slug_to_uuid := slug_to_uuid || jsonb_build_object(tp.slug, new_picto_id::text);
  end loop;

  for tb in select * from public.template_boards loop
    remapped_steps := array(
      select (slug_to_uuid ->> s)::uuid
      from unnest(tb.step_slugs) with ordinality as t(s, ord)
      where slug_to_uuid ? s
      order by t.ord
    );
    if coalesce(array_length(remapped_steps, 1), 0)
       <> coalesce(array_length(tb.step_slugs, 1), 0) then
      raise exception
        'handle_new_user: template_boards.slug=% references unknown pictogram slugs in %',
        tb.slug, tb.step_slugs;
    end if;
    insert into public.boards
      (owner_id, kid_id, slug, name, kind, labels_visible, voice_mode,
       step_ids, kid_reorderable, accent)
    values
      (new.id, v_kid_id, tb.slug, tb.name, tb.kind, tb.labels_visible, tb.voice_mode,
       remapped_steps, tb.kid_reorderable, tb.accent);
  end loop;

  return new;
end;
$$;

alter table public.boards          drop column accent_ink;
alter table public.template_boards drop column accent_ink;
