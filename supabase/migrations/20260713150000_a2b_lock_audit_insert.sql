-- A2 (parte 2/2) — Bloqueia INSERT direto em audit_logs.
-- ⚠️ APLICAR SOMENTE APÓS O DEPLOY do código que usa public.log_audit_event
-- (useAuditLog.js e useAuth.jsx). Antes disso, a produção ainda insere direto
-- e este bloqueio quebraria o registro de logs.
--
-- Após remover a policy de INSERT, o role `authenticated` não consegue mais
-- inserir direto (RLS nega por padrão sem policy permissiva). As funções
-- SECURITY DEFINER (log_audit_event, approve_access_request, deny_access_request)
-- inserem como owner e continuam funcionando.

drop policy if exists "System can insert logs" on public.audit_logs;
