-- A2 (parte 1/2) — Função de auditoria não-forjável.
-- Insere em audit_logs fixando user_id := auth.uid() (o client não pode mais
-- atribuir ações a outro usuário). SECURITY DEFINER + search_path fixo.
-- Aditivo e seguro: a policy de INSERT direto continua valendo por ora; o
-- endurecimento (bloquear INSERT direto) vem na parte 2/2, APÓS o deploy do
-- código que passa a usar esta função.

create or replace function public.log_audit_event(
  p_action text,
  p_resource_type text,
  p_resource_id uuid,
  p_details jsonb default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.audit_logs (user_id, action, resource_type, resource_id, details)
  values (auth.uid(), p_action, p_resource_type, p_resource_id, p_details);
end;
$$;

grant execute on function public.log_audit_event(text, text, uuid, jsonb) to authenticated;
