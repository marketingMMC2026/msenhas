-- C1 — Impede escalada de privilégio via self-write em `profiles`.
-- Problema: as policies de INSERT/UPDATE do próprio perfil não restringem
-- `is_admin`/`role`/`is_active`, e a autorização confia em `role='admin'`.
-- Assim, um usuário comum podia se auto-promover a admin.
--
-- Solução: trigger BEFORE INSERT/UPDATE que, para quem NÃO é admin e mexe no
-- PRÓPRIO perfil, força/preserva as colunas de privilégio — exceto quando o
-- fluxo confiável `accept_pending_invite` sinaliza o bypass via GUC de sessão
-- (o client, via PostgREST, não consegue setar esse GUC).

create or replace function public.guard_profile_privilege()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
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

drop trigger if exists trg_guard_profile_privilege on public.profiles;
create trigger trg_guard_profile_privilege
  before insert or update on public.profiles
  for each row execute function public.guard_profile_privilege();

-- `accept_pending_invite` passa a sinalizar o bypass antes de promover o perfil,
-- para que o trigger não reverta a atribuição legítima de papel do convite.
create or replace function public.accept_pending_invite()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
$function$;
