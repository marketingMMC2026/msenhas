-- Restrict admin audit to private accesses owned by the selected user.
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
    'personal'::text as access_type,
    '{}'::text[] as group_names,
    owner_profile.email as owner_email
  from public.secrets s
  left join public.profiles owner_profile on owner_profile.id = s.owner_id
  where public.is_system_admin(auth.uid())
    and public.is_active_user(p_user_id)
    and s.owner_id = p_user_id
    and coalesce(s.is_personal, false) = true
  order by s.updated_at desc nulls last, s.title asc;
$$;

revoke all on function public.admin_list_user_accesses(uuid) from public;
grant execute on function public.admin_list_user_accesses(uuid) to authenticated;

commit;
