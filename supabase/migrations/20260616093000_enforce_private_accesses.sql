-- Enforce private access privacy: only the owner can see or manage private accesses.
begin;

create or replace function public.can_archive_secret(p_user_id uuid, p_secret_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.secrets s
    where s.id = p_secret_id
      and public.is_active_user(p_user_id)
      and (
        (
          coalesce(s.is_personal, false) = true
          and s.owner_id = p_user_id
        )
        or (
          coalesce(s.is_personal, false) = false
          and (
            s.owner_id = p_user_id
            or public.is_system_admin(p_user_id)
            or public.can_edit_secret(p_user_id, s.id)
            or exists (
              select 1
              from public.secret_permissions sp
              where sp.secret_id = s.id
                and sp.revoked_at is null
                and sp.granted_to_user_id = p_user_id
                and sp.permission_level in ('manage_access', 'admin', 'owner', 'gerenciar acessos', 'gerenciar_acessos')
            )
            or exists (
              select 1
              from public.secret_permissions sp
              join public.group_members gm on gm.group_id = sp.granted_to_group_id
              where sp.secret_id = s.id
                and sp.revoked_at is null
                and gm.user_id = p_user_id
                and sp.permission_level in ('manage_access', 'admin', 'owner', 'gerenciar acessos', 'gerenciar_acessos')
            )
          )
        )
      )
  );
$$;

create or replace function public.can_view_secret_history(p_user_id uuid, p_secret_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.secrets s
    where s.id = p_secret_id
      and public.is_active_user(p_user_id)
      and (
        (
          coalesce(s.is_personal, false) = true
          and s.owner_id = p_user_id
        )
        or (
          coalesce(s.is_personal, false) = false
          and (
            s.owner_id = p_user_id
            or public.is_system_admin(p_user_id)
            or public.can_access_secret(p_user_id, s.id)
            or public.can_edit_secret(p_user_id, s.id)
          )
        )
      )
  );
$$;

drop policy if exists "secrets_select_clean" on public.secrets;
drop policy if exists "secrets_select_active_or_archived_allowed" on public.secrets;
drop policy if exists "secrets_select_owner_private_or_shared" on public.secrets;
drop policy if exists "Admin can view non-personal secrets" on public.secrets;
drop policy if exists "Owner can view own secrets" on public.secrets;
drop policy if exists "User can view shared secrets" on public.secrets;
drop policy if exists "Users can view own secrets" on public.secrets;
drop policy if exists "Users can view accessible secrets" on public.secrets;

create policy "secrets_select_owner_private_or_shared"
on public.secrets
for select
to authenticated
using (
  public.is_active_user(auth.uid())
  and (
    (
      coalesce(is_personal, false) = true
      and owner_id = auth.uid()
    )
    or (
      coalesce(is_personal, false) = false
      and (
        owner_id = auth.uid()
        or public.can_access_secret(auth.uid(), id)
        or public.can_edit_secret(auth.uid(), id)
        or public.is_system_admin(auth.uid())
      )
    )
  )
);

update public.secret_permissions sp
set revoked_at = coalesce(sp.revoked_at, now())
where sp.revoked_at is null
  and exists (
    select 1
    from public.secrets s
    where s.id = sp.secret_id
      and coalesce(s.is_personal, false) = true
  );

commit;
