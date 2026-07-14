-- Gestão de admin: ações em massa sobre acessos (arquivar/tag/grupo).
-- SECURITY DEFINER gated em can_manage_people (admin/manager). Não faz exclusão
-- definitiva (só arquivar) — exclusão continua individual, por segurança.

create or replace function public.bulk_manage_secrets(
  p_ids uuid[],
  p_action text,
  p_value text default null
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_n integer := 0;
  v_group uuid;
begin
  if not public.can_manage_people(v_uid) then
    raise exception 'Not authorized';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

  if p_action = 'archive' then
    update public.secrets set deleted_at = now(), updated_at = now()
      where id = any(p_ids) and deleted_at is null;
    get diagnostics v_n = row_count;

  elsif p_action = 'unarchive' then
    update public.secrets set deleted_at = null, updated_at = now()
      where id = any(p_ids) and deleted_at is not null;
    get diagnostics v_n = row_count;

  elsif p_action = 'add_tag' then
    update public.secrets
      set tags = (select array(select distinct t from unnest(coalesce(tags, '{}') || p_value) as t where t <> '')),
          updated_at = now()
      where id = any(p_ids) and not (coalesce(tags,'{}') @> array[p_value]);
    get diagnostics v_n = row_count;

  elsif p_action = 'remove_tag' then
    update public.secrets set tags = array_remove(coalesce(tags,'{}'), p_value), updated_at = now()
      where id = any(p_ids) and coalesce(tags,'{}') @> array[p_value];
    get diagnostics v_n = row_count;

  elsif p_action = 'add_group' then
    v_group := p_value::uuid;
    insert into public.secret_permissions (secret_id, granted_to_group_id, permission_level, granted_by_id)
      select s.id, v_group, 'view', v_uid
      from public.secrets s
      where s.id = any(p_ids) and s.is_personal = false
    on conflict (secret_id, granted_to_group_id) where granted_to_group_id is not null
      do update set revoked_at = null, granted_by_id = v_uid;
    get diagnostics v_n = row_count;

  else
    raise exception 'Unknown action: %', p_action;
  end if;

  perform public.log_audit_event('bulk_' || p_action, 'secret',
    coalesce(p_ids[1], gen_random_uuid()),
    jsonb_build_object('count', v_n, 'value', p_value, 'total_selected', array_length(p_ids,1)));

  return v_n;
end;
$$;

grant execute on function public.bulk_manage_secrets(uuid[], text, text) to authenticated;
