begin;

alter table public.secrets
  add column if not exists password_strength text;

alter table public.secrets
  drop constraint if exists secrets_password_strength_check;

alter table public.secrets
  add constraint secrets_password_strength_check
  check (password_strength is null or password_strength in ('weak', 'medium', 'strong'));

-- Personal accesses are private to their owner. Even admins should not read them unless they own the access.
drop policy if exists secrets_select_clean on public.secrets;

create policy secrets_select_clean on public.secrets
  for select
  using (
    deleted_at is null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
    )
    and (
      owner_id = auth.uid()
      or (
        coalesce(is_personal, false) = false
        and (
          can_access_secret(auth.uid(), id)
          or can_edit_secret(auth.uid(), id)
          or is_admin(auth.uid())
        )
      )
    )
  );

commit;
