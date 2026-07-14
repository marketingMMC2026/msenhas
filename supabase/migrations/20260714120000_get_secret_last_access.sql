-- Gestão de admin: último acesso por segredo, derivado do audit_logs.
-- "Acesso" = revelar (reveal_secret) ou copiar (copy_secret) a senha.
-- Só admin/manager (can_manage_people); demais usuários recebem conjunto vazio.

create or replace function public.get_secret_last_access()
returns table(secret_id uuid, last_access timestamptz, access_count bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select al.resource_id as secret_id,
         max(al.created_at) as last_access,
         count(*)::bigint as access_count
  from public.audit_logs al
  where public.can_manage_people(auth.uid())
    and al.resource_type = 'secret'
    and al.action in ('reveal_secret', 'copy_secret')
  group by al.resource_id;
$$;

grant execute on function public.get_secret_last_access() to authenticated;
