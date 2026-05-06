-- Fix infinite recursion in secret_permissions RLS policies.
-- The previous INSERT/UPDATE policies queried public.secret_permissions from
-- inside policies on public.secret_permissions, which can trigger:
-- "infinite recursion detected in policy for relation secret_permissions".

CREATE OR REPLACE FUNCTION public.can_manage_secret_access(p_secret_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_user_id
      AND is_active = TRUE
  ) THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.secrets
    WHERE id = p_secret_id
      AND owner_id = v_user_id
      AND deleted_at IS NULL
  ) THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_user_id
      AND is_admin = TRUE
      AND is_active = TRUE
  ) THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.secret_permissions
    WHERE secret_id = p_secret_id
      AND granted_to_user_id = v_user_id
      AND permission_level = 'manage_access'
      AND revoked_at IS NULL
  ) THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.secret_permissions sp
    JOIN public.group_members gm ON gm.group_id = sp.granted_to_group_id
    WHERE sp.secret_id = p_secret_id
      AND gm.user_id = v_user_id
      AND sp.permission_level = 'manage_access'
      AND sp.revoked_at IS NULL
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.can_manage_secret_access(UUID) TO authenticated;

DROP POLICY IF EXISTS "Owner or manage_access user can insert permission" ON public.secret_permissions;
DROP POLICY IF EXISTS "Owner or manage_access user can revoke permission" ON public.secret_permissions;

CREATE POLICY "Can manage access can insert permission" ON public.secret_permissions
FOR INSERT
WITH CHECK (
  public.can_manage_secret_access(secret_id)
);

CREATE POLICY "Can manage access can revoke permission" ON public.secret_permissions
FOR UPDATE
USING (
  public.can_manage_secret_access(secret_id)
)
WITH CHECK (
  public.can_manage_secret_access(secret_id)
);
