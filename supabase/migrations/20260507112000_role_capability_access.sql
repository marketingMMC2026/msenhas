-- Role capability access for M Password.
-- Admin keeps full control. Manager can operate users, invites, groups and logs,
-- but cannot create/modify admin users or use import/global settings permissions.
begin;

alter table public.profiles
  add column if not exists role text not null default 'viewer';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'manager', 'editor', 'viewer'));

create or replace function public.has_app_role(p_user_id uuid, p_roles text[])
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
      and (
        (p.is_admin = true and 'admin' = any(p_roles))
        or p.role = any(p_roles)
      )
  );
$$;

create or replace function public.can_manage_people(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_app_role(p_user_id, array['admin', 'manager']);
$$;

create or replace function public.can_manage_non_admin_people(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_app_role(p_user_id, array['manager']);
$$;

grant execute on function public.has_app_role(uuid, text[]) to authenticated;
grant execute on function public.can_manage_people(uuid) to authenticated;
grant execute on function public.can_manage_non_admin_people(uuid) to authenticated;

-- Profiles: managers can view users and update non-admin users only.
drop policy if exists profiles_select_admin_manager on public.profiles;
drop policy if exists profiles_update_manager_non_admin on public.profiles;

create policy profiles_select_admin_manager on public.profiles
  for select
  using (public.can_manage_people(auth.uid()));

create policy profiles_update_manager_non_admin on public.profiles
  for update
  using (
    public.can_manage_non_admin_people(auth.uid())
    and coalesce(is_admin, false) = false
    and coalesce(role, 'viewer') <> 'admin'
  )
  with check (
    public.can_manage_non_admin_people(auth.uid())
    and coalesce(is_admin, false) = false
    and coalesce(role, 'viewer') <> 'admin'
  );

-- Invitations: managers can create/cancel invitations, except admin invitations.
drop policy if exists user_invitations_select_admin on public.user_invitations;
drop policy if exists user_invitations_insert_admin on public.user_invitations;
drop policy if exists user_invitations_update_admin on public.user_invitations;
drop policy if exists user_invitations_delete_admin on public.user_invitations;
drop policy if exists user_invitations_select_admin_manager on public.user_invitations;
drop policy if exists user_invitations_insert_admin_manager on public.user_invitations;
drop policy if exists user_invitations_update_admin_manager on public.user_invitations;
drop policy if exists user_invitations_delete_admin_manager on public.user_invitations;

create policy user_invitations_select_admin_manager on public.user_invitations
  for select
  using (
    public.is_system_admin(auth.uid())
    or (public.can_manage_non_admin_people(auth.uid()) and role <> 'admin')
  );

create policy user_invitations_insert_admin_manager on public.user_invitations
  for insert
  with check (
    public.is_system_admin(auth.uid())
    or (public.can_manage_non_admin_people(auth.uid()) and role <> 'admin')
  );

create policy user_invitations_update_admin_manager on public.user_invitations
  for update
  using (
    public.is_system_admin(auth.uid())
    or (public.can_manage_non_admin_people(auth.uid()) and role <> 'admin')
  )
  with check (
    public.is_system_admin(auth.uid())
    or (public.can_manage_non_admin_people(auth.uid()) and role <> 'admin')
  );

create policy user_invitations_delete_admin_manager on public.user_invitations
  for delete
  using (
    public.is_system_admin(auth.uid())
    or (public.can_manage_non_admin_people(auth.uid()) and role <> 'admin')
  );

-- Groups and group members: managers can operate team groups.
drop policy if exists groups_select_admin_manager on public.groups;
drop policy if exists groups_insert_admin_manager on public.groups;
drop policy if exists groups_update_admin_manager on public.groups;
drop policy if exists groups_delete_admin_manager on public.groups;

create policy groups_select_admin_manager on public.groups
  for select
  using (public.can_manage_people(auth.uid()));

create policy groups_insert_admin_manager on public.groups
  for insert
  with check (public.can_manage_people(auth.uid()) and created_by = auth.uid());

create policy groups_update_admin_manager on public.groups
  for update
  using (public.can_manage_people(auth.uid()))
  with check (public.can_manage_people(auth.uid()));

create policy groups_delete_admin_manager on public.groups
  for delete
  using (public.can_manage_people(auth.uid()));

drop policy if exists group_members_select_admin_manager on public.group_members;
drop policy if exists group_members_insert_admin_manager on public.group_members;
drop policy if exists group_members_update_admin_manager on public.group_members;
drop policy if exists group_members_delete_admin_manager on public.group_members;

create policy group_members_select_admin_manager on public.group_members
  for select
  using (public.can_manage_people(auth.uid()));

create policy group_members_insert_admin_manager on public.group_members
  for insert
  with check (public.can_manage_people(auth.uid()));

create policy group_members_update_admin_manager on public.group_members
  for update
  using (public.can_manage_people(auth.uid()))
  with check (public.can_manage_people(auth.uid()));

create policy group_members_delete_admin_manager on public.group_members
  for delete
  using (public.can_manage_people(auth.uid()));

-- Logs: managers can read logs. Inserts remain available through existing audit policies/triggers.
do $$
begin
  if to_regclass('public.audit_logs') is not null then
    execute 'drop policy if exists audit_logs_select_admin_manager on public.audit_logs';
    execute 'create policy audit_logs_select_admin_manager on public.audit_logs for select using (public.can_manage_people(auth.uid()))';
  end if;
end $$;

commit;
