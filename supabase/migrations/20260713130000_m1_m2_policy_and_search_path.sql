-- M1 — Corrige policy de INSERT em access_requests.
-- Bug: a subquery comparava `secret_permissions.secret_id = secret_permissions.secret_id`
-- (tautologia, sempre true), então a trava "não pedir acesso a segredo que já tenho"
-- na prática bloqueava criar QUALQUER solicitação se o usuário tivesse QUALQUER permissão.
-- Correção: correlacionar com a linha sendo inserida (access_requests.secret_id).

drop policy if exists "User can create request" on public.access_requests;
create policy "User can create request" on public.access_requests
  for insert
  with check (
    (requested_by_id = auth.uid())
    and (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_active = true))
    and (not exists (
      select 1 from public.secret_permissions sp
      where sp.secret_id = access_requests.secret_id
        and (
          sp.granted_to_user_id = auth.uid()
          or exists (
            select 1 from public.group_members gm
            where gm.group_id = sp.granted_to_group_id and gm.user_id = auth.uid()
          )
        )
        and sp.revoked_at is null
    ))
  );

-- M2 — Adiciona search_path fixo às 2 funções SECURITY DEFINER que estavam sem
-- (as outras 20 já têm). Corpo idêntico ao vigente; só endurece contra hijack de search_path.

CREATE OR REPLACE FUNCTION public.approve_access_request(request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_request public.access_requests%ROWTYPE;
    v_user_id UUID;
    v_is_admin BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_user_id;
    IF v_is_admin IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
    END IF;
    SELECT * INTO v_request FROM public.access_requests WHERE id = request_id AND status = 'pending';
    IF v_request IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or not pending');
    END IF;
    UPDATE public.access_requests
    SET status = 'approved', reviewed_by_id = v_user_id, reviewed_at = NOW()
    WHERE id = request_id;
    INSERT INTO public.secret_permissions (secret_id, granted_to_user_id, permission_level, granted_by_id)
    VALUES (v_request.secret_id, v_request.requested_by_id, v_request.permission_level, v_user_id)
    ON CONFLICT (secret_id, granted_to_user_id) WHERE granted_to_user_id IS NOT NULL
    DO UPDATE SET permission_level = EXCLUDED.permission_level, granted_by_id = EXCLUDED.granted_by_id, revoked_at = NULL;
    INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, details)
    VALUES (v_user_id, 'approve_request', 'access_request', request_id, jsonb_build_object('secret_id', v_request.secret_id, 'grantee_id', v_request.requested_by_id));
    INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, details)
    VALUES (v_user_id, 'grant_permission', 'secret', v_request.secret_id, jsonb_build_object('grantee_id', v_request.requested_by_id, 'level', v_request.permission_level));
    RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.deny_access_request(request_id uuid, denial_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_is_admin BOOLEAN;
    v_request_exists BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_user_id;
    IF v_is_admin IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
    END IF;
    SELECT EXISTS(SELECT 1 FROM public.access_requests WHERE id = request_id AND status = 'pending') INTO v_request_exists;
    IF v_request_exists IS FALSE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or not pending');
    END IF;
    UPDATE public.access_requests
    SET status = 'denied', reviewed_by_id = v_user_id, reviewed_at = NOW(), denial_reason = denial_reason
    WHERE id = request_id;
    INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, details)
    VALUES (v_user_id, 'deny_request', 'access_request', request_id, jsonb_build_object('reason', denial_reason));
    RETURN jsonb_build_object('success', true);
END;
$function$;
