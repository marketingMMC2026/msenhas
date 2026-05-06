-- User, group and secret access roles for M Password
begin;

alter table public.profiles
  add column if not exists role text not null default 'viewer';

update public.profiles
set role = case
  when is_admin = true then 'admin'
  when role is null then 'viewer'
  else role
end;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'manager', 'editor', 'viewer'));

update public.profiles
set is_admin = true
where role = 'admin';

update public.profiles
set is_admin = false
where role <> 'admin';

alter table public.group_members
  drop constraint if exists group_members_role_check;

alter table public.group_members
  add constraint group_members_role_check
  check (role in ('manager', 'member', 'admin'));

update public.group_members
set role = 'manager'
where role = 'admin';

create or replace function public.is_manager_or_admin(p_user_id uuid)
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
      and (p.is_admin = true or p.role in ('admin', 'manager'))
  );
$$;

create or replace function public.is_group_owner(p_user_id uuid, p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and g.created_by = p_user_id
  )
  or exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
      and gm.role in ('manager', 'admin')
  );
$$;

create or replace function public.can_edit_secret(p_user_id uuid, p_secret_id uuid)
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
      and s.owner_id = p_user_id
  )
  or exists (
    select 1
    from public.profiles p
    join public.secrets s on s.id = p_secret_id
    where p.id = p_user_id
      and p.is_active = true
      and p.is_admin = true
  )
  or exists (
    select 1
    from public.secret_permissions sp
    where sp.secret_id = p_secret_id
      and sp.revoked_at is null
      and sp.granted_to_user_id = p_user_id
      and sp.permission_level in ('edit', 'manage_access')
  )
  or exists (
    select 1
    from public.secret_permissions sp
    join public.group_members gm on gm.group_id = sp.granted_to_group_id
    where sp.secret_id = p_secret_id
      and sp.revoked_at is null
      and gm.user_id = p_user_id
      and sp.permission_level in ('edit', 'manage_access')
  );
$$;

create or replace function public.can_manage_secret_access(p_secret_id uuid)
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
      and s.owner_id = auth.uid()
  )
  or public.is_manager_or_admin(auth.uid())
  or exists (
    select 1
    from public.secret_permissions sp
    where sp.secret_id = p_secret_id
      and sp.revoked_at is null
      and sp.granted_to_user_id = auth.uid()
      and sp.permission_level = 'manage_access'
  )
  or exists (
    select 1
    from public.secret_permissions sp
    join public.group_members gm on gm.group_id = sp.granted_to_group_id
    where sp.secret_id = p_secret_id
      and sp.revoked_at is null
      and gm.user_id = auth.uid()
      and sp.permission_level = 'manage_access'
  );
$$;

commit;
