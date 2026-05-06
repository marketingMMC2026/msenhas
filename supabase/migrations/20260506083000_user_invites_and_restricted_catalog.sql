-- Invitation-based access flow for M Password.
-- Users can still sign in with Google, but team access is only applied through admin invitations.
begin;

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
      and (p.is_admin = true or p.role = 'admin')
  );
$$;

create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  role text not null default 'viewer',
  group_ids uuid[] not null default '{}',
  invited_by uuid references public.profiles(id) on delete set null,
  invited_at timestamp with time zone not null default now(),
  accepted_at timestamp with time zone,
  status text not null default 'pending',
  notes text
);

alter table public.user_invitations
  add column if not exists full_name text,
  add column if not exists role text not null default 'viewer',
  add column if not exists group_ids uuid[] not null default '{}',
  add column if not exists invited_by uuid references public.profiles(id) on delete set null,
  add column if not exists invited_at timestamp with time zone not null default now(),
  add column if not exists accepted_at timestamp with time zone,
  add column if not exists status text not null default 'pending',
  add column if not exists notes text;

update public.user_invitations
set email = lower(trim(email));

alter table public.user_invitations
  drop constraint if exists user_invitations_role_check;

alter table public.user_invitations
  add constraint user_invitations_role_check
  check (role in ('admin', 'manager', 'editor', 'viewer'));

alter table public.user_invitations
  drop constraint if exists user_invitations_status_check;

alter table public.user_invitations
  add constraint user_invitations_status_check
  check (status in ('pending', 'accepted', 'cancelled'));

create unique index if not exists user_invitations_email_unique
  on public.user_invitations (lower(email));

alter table public.user_invitations enable row level security;

drop policy if exists user_invitations_select_admin on public.user_invitations;
drop policy if exists user_invitations_insert_admin on public.user_invitations;
drop policy if exists user_invitations_update_admin on public.user_invitations;
drop policy if exists user_invitations_delete_admin on public.user_invitations;

create policy user_invitations_select_admin on public.user_invitations
  for select
  using (public.is_system_admin(auth.uid()));

create policy user_invitations_insert_admin on public.user_invitations
  for insert
  with check (public.is_system_admin(auth.uid()));

create policy user_invitations_update_admin on public.user_invitations
  for update
  using (public.is_system_admin(auth.uid()))
  with check (public.is_system_admin(auth.uid()));

create policy user_invitations_delete_admin on public.user_invitations
  for delete
  using (public.is_system_admin(auth.uid()));

create or replace function public.accept_pending_invite()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_invite public.user_invitations%rowtype;
  v_group_id uuid;
  v_profile public.profiles%rowtype;
begin
  if v_user_id is null or v_email = '' then
    return jsonb_build_object('accepted', false, 'reason', 'no_authenticated_user');
  end if;

  select *
  into v_invite
  from public.user_invitations ui
  where lower(ui.email) = v_email
    and ui.status = 'pending'
  order by ui.invited_at desc
  limit 1;

  if not found then
    select * into v_profile from public.profiles where id = v_user_id;
    return jsonb_build_object('accepted', false, 'profile', to_jsonb(v_profile));
  end if;

  update public.profiles
  set
    full_name = coalesce(nullif(v_invite.full_name, ''), full_name),
    role = v_invite.role,
    is_admin = (v_invite.role = 'admin'),
    is_active = true,
    updated_at = now()
  where id = v_user_id;

  foreach v_group_id in array coalesce(v_invite.group_ids, '{}') loop
    if not exists (
      select 1
      from public.group_members gm
      where gm.group_id = v_group_id
        and gm.user_id = v_user_id
    ) then
      insert into public.group_members (group_id, user_id, role)
      values (v_group_id, v_user_id, 'member');
    end if;
  end loop;

  update public.user_invitations
  set status = 'accepted', accepted_at = now()
  where id = v_invite.id;

  select * into v_profile from public.profiles where id = v_user_id;

  return jsonb_build_object(
    'accepted', true,
    'invite_id', v_invite.id,
    'profile', to_jsonb(v_profile)
  );
end;
$$;

grant execute on function public.accept_pending_invite() to authenticated;

-- A user without invitation/group should not see the limited catalog of team accesses.
-- They will only see secrets they own and secrets explicitly shared with them.
create or replace function public.list_secret_catalog()
returns table (
  id uuid,
  title text,
  login text,
  link text,
  tags text[],
  is_personal boolean,
  updated_at timestamp with time zone,
  owner_email text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.title,
    s.login,
    s.link,
    s.tags,
    s.is_personal,
    s.updated_at,
    p.email as owner_email
  from public.secrets s
  left join public.profiles p on p.id = s.owner_id
  where s.deleted_at is null
    and coalesce(s.is_personal, false) = false
    and public.is_active_user(auth.uid())
    and exists (
      select 1
      from public.profiles viewer
      where viewer.id = auth.uid()
        and viewer.is_active = true
        and (viewer.is_admin = true or viewer.role in ('admin', 'manager', 'editor'))
    )
    and not (
      s.owner_id = auth.uid()
      or public.is_system_admin(auth.uid())
      or public.can_access_secret(auth.uid(), s.id)
      or public.can_edit_secret(auth.uid(), s.id)
    )
  order by s.updated_at desc;
$$;

grant execute on function public.list_secret_catalog() to authenticated;

commit;
