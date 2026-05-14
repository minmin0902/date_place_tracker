-- Remove in-app reaction notifications when the underlying reaction
-- is toggled off. The notification table does not store reaction_id,
-- so match by the same stable tuple used by the insert trigger:
-- actor + emoji + exact target.

create or replace function public.delete_notifications_for_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications n
  where n.kind = 'reaction'
    and n.couple_id = old.couple_id
    and n.actor_id = old.user_id
    and n.preview = old.emoji
    and (
      (old.memo_id is not null and n.memo_id = old.memo_id)
      or (
        old.food_id is not null
        and n.memo_id is null
        and n.food_id = old.food_id
      )
      or (
        old.place_id is not null
        and n.memo_id is null
        and n.food_id is null
        and n.place_id = old.place_id
      )
    );

  return old;
end;
$$;

drop trigger if exists delete_reaction_notifications_on_delete
  on public.reactions;
create trigger delete_reaction_notifications_on_delete
  after delete on public.reactions
  for each row execute function public.delete_notifications_for_reaction();

-- One-time cleanup for stale reaction notifications that were created
-- before this trigger existed.
delete from public.notifications n
where n.kind = 'reaction'
  and not exists (
    select 1
    from public.reactions r
    where r.couple_id = n.couple_id
      and r.user_id = n.actor_id
      and r.emoji = n.preview
      and (
        (n.memo_id is not null and r.memo_id = n.memo_id)
        or (
          n.memo_id is null
          and n.food_id is not null
          and r.food_id = n.food_id
        )
        or (
          n.memo_id is null
          and n.food_id is null
          and n.place_id is not null
          and r.place_id = n.place_id
        )
      )
  );
