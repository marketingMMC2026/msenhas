-- Archive-first permissions and password history for M Password
begin;

create extension if not exists pgcrypto;

create table if not exists public.secret_history (
  id uuid primary key default gen_random_uuid(),
  secret_id uuid not null references public.secrets(id) on delete cascade,
  action text not null,
  changed_fields text[] not null default '{}',
  old_secret_value text,
  new_secret_value text,
  changed_by_id uuid references public.profiles(id),
  changed_at timestamp with time zone not null default now()
);

create index if not exists secret_history_secret_id_changed_at_idx
  on public.secret_history(secret_id, changed_at desc);

alter table public.secret_history enable row level security;

create or replace function public.is_active_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.is_active = true
  );
$$;

create or replace function public.is_system_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.is_active = true
      and p.is_admin = true
  );
$$;

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
        s.owner_id = p_user_id
        or public.is_system_admin(p_user_id)
        or public.can_access_secret(p_user_id, s.id)
        or public.can_edit_secret(p_user_id, s.id)
      )
  );
$$;

drop policy if exists "secret_history_select" on public.secret_history;
create policy "secret_history_select"
on public.secret_history
for select
to authenticated
using (public.can_view_secret_history(auth.uid(), secret_id));

drop policy if exists "Allow update own secrets" on public.secrets;
drop policy if exists "secrets_owner_update_clean" on public.secrets;
drop policy if exists "secrets_edit_update_clean" on public.secrets;
drop policy if exists "secrets_update_owner_or_manager" on public.secrets;
drop policy if exists "secrets_update_owner_admin_or_manager" on public.secrets;

create policy "secrets_update_owner_admin_or_manager"
on public.secrets
for update
to authenticated
using (public.can_archive_secret(auth.uid(), id))
with check (public.can_archive_secret(auth.uid(), id));

drop policy if exists "secrets_select_clean" on public.secrets;
create policy "secrets_select_active_or_archived_allowed"
on public.secrets
for select
to authenticated
using (
  public.is_active_user(auth.uid())
  and (
    owner_id = auth.uid()
    or public.can_access_secret(auth.uid(), id)
    or public.can_edit_secret(auth.uid(), id)
    or public.is_system_admin(auth.uid())
  )
);

create or replace function public.record_secret_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fields text[] := '{}';
  v_action text := 'update_secret';
begin
  if old.title is distinct from new.title then v_fields := array_append(v_fields, 'title'); end if;
  if old.login is distinct from new.login then v_fields := array_append(v_fields, 'login'); end if;
  if old.secret_value is distinct from new.secret_value then v_fields := array_append(v_fields, 'password'); end if;
  if old.link is distinct from new.link then v_fields := array_append(v_fields, 'link'); end if;
  if old.notes is distinct from new.notes then v_fields := array_append(v_fields, 'notes'); end if;
  if old.tags is distinct from new.tags then v_fields := array_append(v_fields, 'tags'); end if;
  if old.twofa_recovery is distinct from new.twofa_recovery then v_fields := array_append(v_fields, 'twofa'); end if;
  if old.expires_at is distinct from new.expires_at then v_fields := array_append(v_fields, 'expires_at'); end if;
  if old.is_personal is distinct from new.is_personal then v_fields := array_append(v_fields, 'visibility'); end if;
  if old.deleted_at is distinct from new.deleted_at then v_fields := array_append(v_fields, 'archive_status'); end if;

  if array_length(v_fields, 1) is null then
    return new;
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    v_action := 'archive_secret';
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_action := 'restore_secret';
  elsif old.secret_value is distinct from new.secret_value then
    v_action := 'password_changed';
  end if;

  insert into public.secret_history (
    secret_id,
    action,
    changed_fields,
    old_secret_value,
    new_secret_value,
    changed_by_id
  ) values (
    new.id,
    v_action,
    v_fields,
    case when old.secret_value is distinct from new.secret_value then old.secret_value else null end,
    case when old.secret_value is distinct from new.secret_value then new.secret_value else null end,
    auth.uid()
  );

  return new;
end;
$$;

drop trigger if exists trg_record_secret_history on public.secrets;
create trigger trg_record_secret_history
after update on public.secrets
for each row
execute function public.record_secret_history();

commit;
