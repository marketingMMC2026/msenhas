-- Limited catalog visibility: show that an access exists without revealing the secret.
begin;

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
