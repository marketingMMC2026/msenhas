-- BASELINE do schema vivo (gerado via pg_dump em 13/07/2026)
-- Documenta o estado real do banco (resolve o drift). NÃO reaplicar sobre o banco existente.

--
-- PostgreSQL database dump
--

\restrict t4wWVAzsSSZ47FjvilpvONKqoaX2FHSitXDFkmTubaN1VUrncyBsakXuq9gIyte

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: accept_pending_invite(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_pending_invite() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

  -- Sinaliza ao trigger que esta é uma promoção legítima (fluxo de convite).
  perform set_config('app.allow_privilege_change', 'on', true);

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


--
-- Name: admin_list_user_accesses(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_user_accesses(p_user_id uuid) RETURNS TABLE(id uuid, owner_id uuid, title text, login text, link text, tags text[], is_personal boolean, password_strength text, updated_at timestamp with time zone, deleted_at timestamp with time zone, access_type text, group_names text[], owner_email text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: approve_access_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_access_request(request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: can_access_secret(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_access_secret(_uid uuid, _secret_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform set_config('row_security','off', true);

  -- direto
  if exists (
    select 1
    from public.secret_permissions sp
    where sp.secret_id = _secret_id
      and sp.granted_to_user_id = _uid
      and sp.revoked_at is null
  ) then
    return true;
  end if;

  -- via grupo
  return exists (
    select 1
    from public.secret_permissions sp
    join public.group_members gm
      on gm.group_id = sp.granted_to_group_id
    where sp.secret_id = _secret_id
      and gm.user_id = _uid
      and sp.revoked_at is null
  );
end;
$$;


--
-- Name: can_archive_secret(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_archive_secret(p_user_id uuid, p_secret_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.secrets s
    where s.id = p_secret_id
      and public.is_active_user(p_user_id)
      and (
        (
          coalesce(s.is_personal, false) = true
          and s.owner_id = p_user_id
        )
        or (
          coalesce(s.is_personal, false) = false
          and (
            s.owner_id = p_user_id
            or public.is_system_admin(p_user_id)
            or public.can_edit_secret(p_user_id, s.id)
            or exists (
              select 1
              from public.secret_permissions sp
              where sp.secret_id = s.id
                and sp.revoked_at is null
                and sp.granted_to_user_id = p_user_id
                and sp.permission_level in ('manage_access', 'admin', 'owner', 'gerenciar acessos', 'gerenciar_acessos')
            )
            or exists (
              select 1
              from public.secret_permissions sp
              join public.group_members gm on gm.group_id = sp.granted_to_group_id
              where sp.secret_id = s.id
                and sp.revoked_at is null
                and gm.user_id = p_user_id
                and sp.permission_level in ('manage_access', 'admin', 'owner', 'gerenciar acessos', 'gerenciar_acessos')
            )
          )
        )
      )
  );
$$;


--
-- Name: can_edit_secret(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_edit_secret(_uid uuid, _secret_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform set_config('row_security','off', true);

  -- direto
  if exists (
    select 1
    from public.secret_permissions sp
    where sp.secret_id = _secret_id
      and sp.granted_to_user_id = _uid
      and sp.permission_level in ('edit','manage_access')
      and sp.revoked_at is null
  ) then
    return true;
  end if;

  -- via grupo
  return exists (
    select 1
    from public.secret_permissions sp
    join public.group_members gm
      on gm.group_id = sp.granted_to_group_id
    where sp.secret_id = _secret_id
      and gm.user_id = _uid
      and sp.permission_level in ('edit','manage_access')
      and sp.revoked_at is null
  );
end;
$$;


--
-- Name: can_manage_non_admin_people(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_manage_non_admin_people(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.has_app_role(p_user_id, array['manager']);
$$;


--
-- Name: can_manage_people(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_manage_people(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.has_app_role(p_user_id, array['admin', 'manager']);
$$;


--
-- Name: can_manage_secret_access(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_manage_secret_access(p_secret_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.secrets s
    where s.id = p_secret_id
      and s.owner_id = auth.uid()
  )
  or public.is_manager_or_admin(auth.uid())
  or exists (
    select 1
    from public.secret_permissions sp
    where sp.secret_id = p_secret_id
      and sp.revoked_at is null
      and sp.granted_to_user_id = auth.uid()
      and sp.permission_level = 'manage_access'
  )
  or exists (
    select 1
    from public.secret_permissions sp
    join public.group_members gm on gm.group_id = sp.granted_to_group_id
    where sp.secret_id = p_secret_id
      and sp.revoked_at is null
      and gm.user_id = auth.uid()
      and sp.permission_level = 'manage_access'
  );
$$;


--
-- Name: can_soft_delete_secret(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_soft_delete_secret(p_user_id uuid, p_secret_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.secrets s
    join public.profiles p on p.id = p_user_id
    where s.id = p_secret_id
      and p.is_active = true
      and (
        s.owner_id = p_user_id
        or (p.is_admin = true and s.is_personal = false)
        or exists (
          select 1
          from public.secret_permissions sp
          where sp.secret_id = s.id
            and sp.revoked_at is null
            and sp.granted_to_user_id = p_user_id
            and lower(sp.permission_level) in ('edit', 'manage', 'admin', 'owner', 'gerenciar acessos', 'gerenciar_acessos')
        )
        or exists (
          select 1
          from public.secret_permissions sp
          join public.group_members gm on gm.group_id = sp.granted_to_group_id
          where sp.secret_id = s.id
            and sp.revoked_at is null
            and gm.user_id = p_user_id
            and lower(sp.permission_level) in ('edit', 'manage', 'admin', 'owner', 'gerenciar acessos', 'gerenciar_acessos')
        )
      )
  );
$$;


--
-- Name: can_view_secret_history(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_view_secret_history(p_user_id uuid, p_secret_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.secrets s
    where s.id = p_secret_id
      and public.is_active_user(p_user_id)
      and (
        (
          coalesce(s.is_personal, false) = true
          and s.owner_id = p_user_id
        )
        or (
          coalesce(s.is_personal, false) = false
          and (
            s.owner_id = p_user_id
            or public.is_system_admin(p_user_id)
            or public.can_access_secret(p_user_id, s.id)
            or public.can_edit_secret(p_user_id, s.id)
          )
        )
      )
  );
$$;


--
-- Name: deny_access_request(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.deny_access_request(request_id uuid, denial_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: guard_profile_privilege(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_profile_privilege() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  actor uuid := auth.uid();
  bypass text := current_setting('app.allow_privilege_change', true);
begin
  -- Contexto de backend/service (sem JWT): não interfere.
  if actor is null then
    return new;
  end if;

  -- Fluxo confiável (accept_pending_invite) sinaliza o bypass.
  if bypass = 'on' then
    return new;
  end if;

  -- Admin de verdade não é restringido.
  if public.is_admin(actor) then
    return new;
  end if;

  -- Só interfere quando o usuário mexe no PRÓPRIO perfil (self-write).
  if tg_op = 'INSERT' and new.id = actor then
    new.is_admin := false;
    new.role := 'viewer';
    new.is_active := coalesce(new.is_active, true);
  elsif tg_op = 'UPDATE' and new.id = actor then
    new.is_admin := old.is_admin;
    new.role := old.role;
    new.is_active := old.is_active;
  end if;

  return new;
end;
$$;


--
-- Name: has_app_role(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_app_role(p_user_id uuid, p_roles text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: is_active_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_active_user(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.is_active = true
  );
$$;


--
-- Name: is_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin(_uid uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- Isso impede que a função dispare RLS e entre em loop
  perform set_config('row_security', 'off', true);

  return exists (
    select 1
    from public.profiles p
    where p.id = _uid
      and p.is_admin = true
      and p.is_active = true
  );
end;
$$;


--
-- Name: is_group_member(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_group_member(_uid uuid, _group_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform set_config('row_security', 'off', true);

  return exists (
    select 1
    from public.group_members gm
    where gm.group_id = _group_id
      and gm.user_id = _uid
  );
end;
$$;


--
-- Name: is_group_owner(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_group_owner(p_user_id uuid, p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and g.created_by = p_user_id
  )
  or exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
      and gm.role in ('manager', 'admin')
  );
$$;


--
-- Name: is_manager_or_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_manager_or_admin(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.is_active = true
      and (p.is_admin = true or p.role in ('admin', 'manager'))
  );
$$;


--
-- Name: is_system_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_system_admin(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.is_active = true
      and (p.is_admin = true or p.role = 'admin')
  );
$$;


--
-- Name: list_secret_catalog(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_secret_catalog() RETURNS TABLE(id uuid, title text, login text, link text, tags text[], is_personal boolean, updated_at timestamp with time zone, owner_email text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: log_audit_event(text, text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_audit_event(p_action text, p_resource_type text, p_resource_id uuid, p_details jsonb DEFAULT NULL::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.audit_logs (user_id, action, resource_type, resource_id, details)
  values (auth.uid(), p_action, p_resource_type, p_resource_id, p_details);
end;
$$;


--
-- Name: record_secret_history(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_secret_history() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_fields text[] := '{}';
  v_action text := 'update_secret';
begin
  if old.title is distinct from new.title then v_fields := array_append(v_fields, 'title'); end if;
  if old.login is distinct from new.login then v_fields := array_append(v_fields, 'login'); end if;
  if old.secret_value is distinct from new.secret_value then v_fields := array_append(v_fields, 'password'); end if;
  if old.link is distinct from new.link then v_fields := array_append(v_fields, 'link'); end if;
  if old.notes is distinct from new.notes then v_fields := array_append(v_fields, 'notes'); end if;
  if old.tags is distinct from new.tags then v_fields := array_append(v_fields, 'tags'); end if;
  if old.twofa_recovery is distinct from new.twofa_recovery then v_fields := array_append(v_fields, 'twofa'); end if;
  if old.expires_at is distinct from new.expires_at then v_fields := array_append(v_fields, 'expires_at'); end if;
  if old.is_personal is distinct from new.is_personal then v_fields := array_append(v_fields, 'visibility'); end if;
  if old.deleted_at is distinct from new.deleted_at then v_fields := array_append(v_fields, 'archive_status'); end if;

  if array_length(v_fields, 1) is null then
    return new;
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    v_action := 'archive_secret';
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_action := 'restore_secret';
  elsif old.secret_value is distinct from new.secret_value then
    v_action := 'password_changed';
  end if;

  insert into public.secret_history (
    secret_id,
    action,
    changed_fields,
    old_secret_value,
    new_secret_value,
    changed_by_id
  ) values (
    new.id,
    v_action,
    v_fields,
    case when old.secret_value is distinct from new.secret_value then old.secret_value else null end,
    case when old.secret_value is distinct from new.secret_value then new.secret_value else null end,
    auth.uid()
  );

  return new;
end;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: access_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    secret_id uuid NOT NULL,
    requested_by_id uuid NOT NULL,
    permission_level text NOT NULL,
    status text DEFAULT 'pending'::text,
    reviewed_by_id uuid,
    reviewed_at timestamp with time zone,
    reason text,
    denial_reason text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT access_requests_permission_level_check CHECK ((permission_level = ANY (ARRAY['view'::text, 'edit'::text]))),
    CONSTRAINT access_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text])))
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id uuid NOT NULL,
    details jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text,
    added_at timestamp with time zone DEFAULT now(),
    CONSTRAINT group_members_role_check CHECK ((role = ANY (ARRAY['manager'::text, 'member'::text, 'admin'::text])))
);


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    avatar_url text,
    domain text NOT NULL,
    is_admin boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    role text DEFAULT 'viewer'::text NOT NULL,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'editor'::text, 'viewer'::text])))
);


--
-- Name: secret_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.secret_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    secret_id uuid NOT NULL,
    action text NOT NULL,
    changed_fields text[] DEFAULT '{}'::text[] NOT NULL,
    old_secret_value text,
    new_secret_value text,
    changed_by_id uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: secret_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.secret_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    secret_id uuid NOT NULL,
    granted_to_user_id uuid,
    granted_to_group_id uuid,
    permission_level text NOT NULL,
    granted_by_id uuid NOT NULL,
    granted_at timestamp with time zone DEFAULT now(),
    revoked_at timestamp with time zone,
    CONSTRAINT chk_xor_grantee CHECK (((granted_to_user_id IS NULL) <> (granted_to_group_id IS NULL))),
    CONSTRAINT secret_permissions_permission_level_check CHECK ((permission_level = ANY (ARRAY['view'::text, 'edit'::text, 'manage_access'::text])))
);


--
-- Name: secrets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.secrets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    title text NOT NULL,
    login text,
    secret_value text NOT NULL,
    link text,
    notes text,
    tags text[],
    twofa_recovery text,
    expires_at date,
    is_personal boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    password_strength text,
    CONSTRAINT secrets_password_strength_check CHECK (((password_strength IS NULL) OR (password_strength = ANY (ARRAY['weak'::text, 'medium'::text, 'strong'::text]))))
);


--
-- Name: user_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    full_name text,
    role text DEFAULT 'viewer'::text NOT NULL,
    group_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    invited_by uuid,
    invited_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    CONSTRAINT user_invitations_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'editor'::text, 'viewer'::text]))),
    CONSTRAINT user_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'cancelled'::text])))
);


--
-- Name: access_requests access_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_requests
    ADD CONSTRAINT access_requests_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: group_members group_members_group_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_user_id_key UNIQUE (group_id, user_id);


--
-- Name: group_members group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_pkey PRIMARY KEY (id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: secret_history secret_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secret_history
    ADD CONSTRAINT secret_history_pkey PRIMARY KEY (id);


--
-- Name: secret_permissions secret_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secret_permissions
    ADD CONSTRAINT secret_permissions_pkey PRIMARY KEY (id);


--
-- Name: secrets secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secrets
    ADD CONSTRAINT secrets_pkey PRIMARY KEY (id);


--
-- Name: user_invitations user_invitations_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invitations
    ADD CONSTRAINT user_invitations_email_key UNIQUE (email);


--
-- Name: user_invitations user_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invitations
    ADD CONSTRAINT user_invitations_pkey PRIMARY KEY (id);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_logs_resource; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_resource ON public.audit_logs USING btree (resource_type, resource_id);


--
-- Name: idx_audit_logs_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user_created ON public.audit_logs USING btree (user_id, created_at);


--
-- Name: idx_audit_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);


--
-- Name: idx_group_members_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_members_group_id ON public.group_members USING btree (group_id);


--
-- Name: idx_group_members_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_members_user_id ON public.group_members USING btree (user_id);


--
-- Name: idx_groups_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_groups_created_by ON public.groups USING btree (created_by);


--
-- Name: idx_profiles_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_email ON public.profiles USING btree (email);


--
-- Name: idx_requests_requested_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_requests_requested_by ON public.access_requests USING btree (requested_by_id);


--
-- Name: idx_requests_reviewed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_requests_reviewed_by ON public.access_requests USING btree (reviewed_by_id);


--
-- Name: idx_requests_secret_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_requests_secret_id ON public.access_requests USING btree (secret_id);


--
-- Name: idx_requests_secret_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_requests_secret_status ON public.access_requests USING btree (secret_id, status);


--
-- Name: idx_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_requests_status ON public.access_requests USING btree (status);


--
-- Name: idx_requests_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_requests_user_status ON public.access_requests USING btree (requested_by_id, status);


--
-- Name: idx_secret_perm_group; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_secret_perm_group ON public.secret_permissions USING btree (secret_id, granted_to_group_id) WHERE (granted_to_group_id IS NOT NULL);


--
-- Name: idx_secret_perm_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_secret_perm_user ON public.secret_permissions USING btree (secret_id, granted_to_user_id) WHERE (granted_to_user_id IS NOT NULL);


--
-- Name: idx_secret_perms_composite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_secret_perms_composite ON public.secret_permissions USING btree (secret_id, granted_to_user_id, granted_to_group_id);


--
-- Name: idx_secret_perms_granted_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_secret_perms_granted_by ON public.secret_permissions USING btree (granted_by_id);


--
-- Name: idx_secret_perms_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_secret_perms_group_id ON public.secret_permissions USING btree (granted_to_group_id);


--
-- Name: idx_secret_perms_secret_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_secret_perms_secret_id ON public.secret_permissions USING btree (secret_id);


--
-- Name: idx_secret_perms_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_secret_perms_user_id ON public.secret_permissions USING btree (granted_to_user_id);


--
-- Name: idx_secrets_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_secrets_deleted_at ON public.secrets USING btree (deleted_at);


--
-- Name: idx_secrets_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_secrets_owner_id ON public.secrets USING btree (owner_id);


--
-- Name: idx_secrets_owner_personal_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_secrets_owner_personal_deleted ON public.secrets USING btree (owner_id, is_personal, deleted_at);


--
-- Name: secret_history_secret_id_changed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX secret_history_secret_id_changed_at_idx ON public.secret_history USING btree (secret_id, changed_at DESC);


--
-- Name: user_invitations_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_invitations_email_unique ON public.user_invitations USING btree (lower(email));


--
-- Name: profiles trg_guard_profile_privilege; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_profile_privilege BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privilege();


--
-- Name: secrets trg_record_secret_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_record_secret_history AFTER UPDATE ON public.secrets FOR EACH ROW EXECUTE FUNCTION public.record_secret_history();


--
-- Name: groups update_groups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: secrets update_secrets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_secrets_updated_at BEFORE UPDATE ON public.secrets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: access_requests access_requests_requested_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_requests
    ADD CONSTRAINT access_requests_requested_by_id_fkey FOREIGN KEY (requested_by_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: access_requests access_requests_reviewed_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_requests
    ADD CONSTRAINT access_requests_reviewed_by_id_fkey FOREIGN KEY (reviewed_by_id) REFERENCES public.profiles(id);


--
-- Name: access_requests access_requests_secret_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_requests
    ADD CONSTRAINT access_requests_secret_id_fkey FOREIGN KEY (secret_id) REFERENCES public.secrets(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: group_members group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: groups groups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: secret_history secret_history_changed_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secret_history
    ADD CONSTRAINT secret_history_changed_by_id_fkey FOREIGN KEY (changed_by_id) REFERENCES public.profiles(id);


--
-- Name: secret_history secret_history_secret_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secret_history
    ADD CONSTRAINT secret_history_secret_id_fkey FOREIGN KEY (secret_id) REFERENCES public.secrets(id) ON DELETE CASCADE;


--
-- Name: secret_permissions secret_permissions_granted_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secret_permissions
    ADD CONSTRAINT secret_permissions_granted_by_id_fkey FOREIGN KEY (granted_by_id) REFERENCES public.profiles(id);


--
-- Name: secret_permissions secret_permissions_granted_to_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secret_permissions
    ADD CONSTRAINT secret_permissions_granted_to_group_id_fkey FOREIGN KEY (granted_to_group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: secret_permissions secret_permissions_granted_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secret_permissions
    ADD CONSTRAINT secret_permissions_granted_to_user_id_fkey FOREIGN KEY (granted_to_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: secret_permissions secret_permissions_secret_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secret_permissions
    ADD CONSTRAINT secret_permissions_secret_id_fkey FOREIGN KEY (secret_id) REFERENCES public.secrets(id) ON DELETE CASCADE;


--
-- Name: secrets secrets_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secrets
    ADD CONSTRAINT secrets_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_invitations user_invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invitations
    ADD CONSTRAINT user_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: profiles Admin can update profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can update profiles" ON public.profiles FOR UPDATE USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: access_requests Admin can update request; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can update request" ON public.access_requests FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));


--
-- Name: audit_logs Admin can view all logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can view all logs" ON public.audit_logs FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_active = true))))));


--
-- Name: profiles Admin can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: access_requests Admin can view all requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can view all requests" ON public.access_requests FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_active = true))))));


--
-- Name: secret_permissions Admin can view permissions of non-personal secrets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can view permissions of non-personal secrets" ON public.secret_permissions FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))) AND (EXISTS ( SELECT 1
   FROM public.secrets
  WHERE ((secrets.id = secret_permissions.secret_id) AND (secrets.is_personal = false)))) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_active = true))))));


--
-- Name: secret_permissions Can manage access can insert permission; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Can manage access can insert permission" ON public.secret_permissions FOR INSERT WITH CHECK (public.can_manage_secret_access(secret_id));


--
-- Name: secret_permissions Can manage access can revoke permission; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Can manage access can revoke permission" ON public.secret_permissions FOR UPDATE USING (public.can_manage_secret_access(secret_id)) WITH CHECK (public.can_manage_secret_access(secret_id));


--
-- Name: secrets Owner can insert secret; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can insert secret" ON public.secrets FOR INSERT WITH CHECK (((owner_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_active = true))))));


--
-- Name: secret_permissions Owner can view permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can view permissions" ON public.secret_permissions FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.secrets
  WHERE ((secrets.id = secret_permissions.secret_id) AND (secrets.owner_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_active = true))))));


--
-- Name: access_requests Owner can view requests for own secret; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can view requests for own secret" ON public.access_requests FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.secrets
  WHERE ((secrets.id = access_requests.secret_id) AND (secrets.owner_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_active = true))))));


--
-- Name: audit_logs System can insert logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert logs" ON public.audit_logs FOR INSERT WITH CHECK (true);


--
-- Name: access_requests User can create request; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User can create request" ON public.access_requests FOR INSERT WITH CHECK (((requested_by_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_active = true)))) AND (NOT (EXISTS ( SELECT 1
   FROM public.secret_permissions sp
  WHERE ((sp.secret_id = access_requests.secret_id) AND ((sp.granted_to_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.group_members gm
          WHERE ((gm.group_id = sp.granted_to_group_id) AND (gm.user_id = auth.uid()))))) AND (sp.revoked_at IS NULL)))))));


--
-- Name: audit_logs User can view own logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User can view own logs" ON public.audit_logs FOR SELECT USING (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_active = true))))));


--
-- Name: access_requests User can view own requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User can view own requests" ON public.access_requests FOR SELECT USING (((requested_by_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_active = true))))));


--
-- Name: secret_permissions User in group can view group permission; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User in group can view group permission" ON public.secret_permissions FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.group_members
  WHERE ((group_members.group_id = secret_permissions.granted_to_group_id) AND (group_members.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_active = true))))));


--
-- Name: secret_permissions User with direct permission can view own permission; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User with direct permission can view own permission" ON public.secret_permissions FOR SELECT USING (((granted_to_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_active = true))))));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id)) WITH CHECK (((auth.uid() = id) AND (is_admin = false)));


--
-- Name: profiles Users can view own profile (clean); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile (clean)" ON public.profiles FOR SELECT USING (((auth.uid() = id) AND (is_active = true)));


--
-- Name: access_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_logs_select_admin_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_select_admin_manager ON public.audit_logs FOR SELECT USING (public.can_manage_people(auth.uid()));


--
-- Name: group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: group_members group_members_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_members_delete ON public.group_members FOR DELETE USING ((public.is_admin(auth.uid()) OR public.is_group_owner(auth.uid(), group_id)));


--
-- Name: group_members group_members_delete_admin_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_members_delete_admin_manager ON public.group_members FOR DELETE USING (public.can_manage_people(auth.uid()));


--
-- Name: group_members group_members_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_members_insert ON public.group_members FOR INSERT WITH CHECK ((public.is_admin(auth.uid()) OR public.is_group_owner(auth.uid(), group_id)));


--
-- Name: group_members group_members_insert_admin_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_members_insert_admin_manager ON public.group_members FOR INSERT WITH CHECK (public.can_manage_people(auth.uid()));


--
-- Name: group_members group_members_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_members_select ON public.group_members FOR SELECT USING ((public.is_admin(auth.uid()) OR public.is_group_owner(auth.uid(), group_id) OR (user_id = auth.uid())));


--
-- Name: group_members group_members_select_admin_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_members_select_admin_manager ON public.group_members FOR SELECT USING (public.can_manage_people(auth.uid()));


--
-- Name: group_members group_members_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_members_update ON public.group_members FOR UPDATE USING ((public.is_admin(auth.uid()) OR public.is_group_owner(auth.uid(), group_id))) WITH CHECK ((public.is_admin(auth.uid()) OR public.is_group_owner(auth.uid(), group_id)));


--
-- Name: group_members group_members_update_admin_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_members_update_admin_manager ON public.group_members FOR UPDATE USING (public.can_manage_people(auth.uid())) WITH CHECK (public.can_manage_people(auth.uid()));


--
-- Name: groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

--
-- Name: groups groups_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY groups_delete ON public.groups FOR DELETE USING ((public.is_admin(auth.uid()) OR (created_by = auth.uid())));


--
-- Name: groups groups_delete_admin_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY groups_delete_admin_manager ON public.groups FOR DELETE USING (public.can_manage_people(auth.uid()));


--
-- Name: groups groups_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY groups_insert ON public.groups FOR INSERT WITH CHECK ((created_by = auth.uid()));


--
-- Name: groups groups_insert_admin_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY groups_insert_admin_manager ON public.groups FOR INSERT WITH CHECK ((public.can_manage_people(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: groups groups_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY groups_select ON public.groups FOR SELECT USING ((public.is_admin(auth.uid()) OR (created_by = auth.uid()) OR public.is_group_member(auth.uid(), id)));


--
-- Name: groups groups_select_admin_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY groups_select_admin_manager ON public.groups FOR SELECT USING (public.can_manage_people(auth.uid()));


--
-- Name: groups groups_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY groups_update ON public.groups FOR UPDATE USING ((public.is_admin(auth.uid()) OR (created_by = auth.uid()))) WITH CHECK ((public.is_admin(auth.uid()) OR (created_by = auth.uid())));


--
-- Name: groups groups_update_admin_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY groups_update_admin_manager ON public.groups FOR UPDATE USING (public.can_manage_people(auth.uid())) WITH CHECK (public.can_manage_people(auth.uid()));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_select_admin_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_admin_manager ON public.profiles FOR SELECT USING (public.can_manage_people(auth.uid()));


--
-- Name: profiles profiles_update_manager_non_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_manager_non_admin ON public.profiles FOR UPDATE USING ((public.can_manage_non_admin_people(auth.uid()) AND (COALESCE(is_admin, false) = false) AND (COALESCE(role, 'viewer'::text) <> 'admin'::text))) WITH CHECK ((public.can_manage_non_admin_people(auth.uid()) AND (COALESCE(is_admin, false) = false) AND (COALESCE(role, 'viewer'::text) <> 'admin'::text)));


--
-- Name: secret_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.secret_history ENABLE ROW LEVEL SECURITY;

--
-- Name: secret_history secret_history_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY secret_history_select ON public.secret_history FOR SELECT TO authenticated USING (public.can_view_secret_history(auth.uid(), secret_id));


--
-- Name: secret_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.secret_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: secrets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.secrets ENABLE ROW LEVEL SECURITY;

--
-- Name: secrets secrets_delete_owner_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY secrets_delete_owner_or_admin ON public.secrets FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_active = true)))) AND ((owner_id = auth.uid()) OR (public.is_admin(auth.uid()) AND (is_personal = false)))));


--
-- Name: secrets secrets_select_owner_private_or_shared; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY secrets_select_owner_private_or_shared ON public.secrets FOR SELECT TO authenticated USING ((public.is_active_user(auth.uid()) AND (((COALESCE(is_personal, false) = true) AND (owner_id = auth.uid())) OR ((COALESCE(is_personal, false) = false) AND ((owner_id = auth.uid()) OR public.can_access_secret(auth.uid(), id) OR public.can_edit_secret(auth.uid(), id) OR public.is_system_admin(auth.uid()))))));


--
-- Name: secrets secrets_update_owner_admin_or_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY secrets_update_owner_admin_or_manager ON public.secrets FOR UPDATE TO authenticated USING (public.can_archive_secret(auth.uid(), id)) WITH CHECK (public.can_archive_secret(auth.uid(), id));


--
-- Name: user_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: user_invitations user_invitations_delete_admin_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_invitations_delete_admin_manager ON public.user_invitations FOR DELETE USING ((public.is_system_admin(auth.uid()) OR (public.can_manage_non_admin_people(auth.uid()) AND (role <> 'admin'::text))));


--
-- Name: user_invitations user_invitations_insert_admin_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_invitations_insert_admin_manager ON public.user_invitations FOR INSERT WITH CHECK ((public.is_system_admin(auth.uid()) OR (public.can_manage_non_admin_people(auth.uid()) AND (role <> 'admin'::text))));


--
-- Name: user_invitations user_invitations_select_admin_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_invitations_select_admin_manager ON public.user_invitations FOR SELECT USING ((public.is_system_admin(auth.uid()) OR (public.can_manage_non_admin_people(auth.uid()) AND (role <> 'admin'::text))));


--
-- Name: user_invitations user_invitations_update_admin_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_invitations_update_admin_manager ON public.user_invitations FOR UPDATE USING ((public.is_system_admin(auth.uid()) OR (public.can_manage_non_admin_people(auth.uid()) AND (role <> 'admin'::text)))) WITH CHECK ((public.is_system_admin(auth.uid()) OR (public.can_manage_non_admin_people(auth.uid()) AND (role <> 'admin'::text))));


--
-- PostgreSQL database dump complete
--

\unrestrict t4wWVAzsSSZ47FjvilpvONKqoaX2FHSitXDFkmTubaN1VUrncyBsakXuq9gIyte

