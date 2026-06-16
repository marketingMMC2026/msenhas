-- Safe admin audit view: list which accesses a user can see without exposing secrets.
begin;

create or replace function public.admin_list_user_accesses(p_user_id uuid)
returns table (
  id uuid,
  owner_id uuid,
  title text,
  login text,
  link text,
  tags text[],
  is_personal boolean,
  password_strength text,
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone,
  access_type text,
  group_names text[],
  owner_email text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.owner_id,
    s.title,
    s.login,
    s.link,
    s.tags,
    coalesce(s.is_personal, false) as is_personal,
    s.password_strength,
    s.updated_at,
    s.deleted_at,
    case
      when coalesce(s.is_personal, false) = true then 'personal'
      when s.owner_id = p_user_id then 'owner'
      else 'shared'
    end as access_type,
    coalesce((
      select array_agg(distinct g.name order by g.name)
      from public.secret_permissions sp
      join public.groups g on g.id = sp.granted_to_group_id
      left join public.group_members gm on gm.group_id = g.id
      where sp.secret_id = s.id
        and sp.revoked_at is null
        and (
          gm.user_id = p_user_id
          or s.owner_id = p_user_id
        )
    ), '{}'::text[]) as group_names,
    owner_profile.email as owner_email
  from public.secrets s
  left join public.profiles owner_profile on owner_profile.id = s.owner_id
  where public.is_system_admin(auth.uid())
    and public.is_active_user(p_user_id)
    and (
      s.owner_id = p_user_id
      or (
        coalesce(s.is_personal, false) = false
        and (
          public.can_access_secret(p_user_id, s.id)
          or public.can_edit_secret(p_user_id, s.id)
          or public.is_system_admin(p_user_id)
        )
      )
    )
  order by s.updated_at desc nulls last, s.title asc;
$$;

revoke all on function public.admin_list_user_accesses(uuid) from public;
grant execute on function public.admin_list_user_accesses(uuid) to authenticated;

commit;
