-- Fix soft delete for shared/imported secrets.
-- The previous UPDATE policy for users with edit/manage_access also acted as
-- WITH CHECK and required deleted_at IS NULL after the update, blocking soft deletes.

DROP POLICY IF EXISTS "User with edit permission can update non-sensitive fields" ON public.secrets;
DROP POLICY IF EXISTS "Owner or admin can soft delete secret" ON public.secrets;

CREATE POLICY "User with edit permission can update secrets" ON public.secrets
FOR UPDATE
USING (
  (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND is_admin = TRUE
        AND is_active = TRUE
    )
    OR EXISTS (
      SELECT 1
      FROM public.secret_permissions
      WHERE secret_id = secrets.id
        AND granted_to_user_id = auth.uid()
        AND permission_level IN ('edit', 'manage_access')
        AND revoked_at IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.secret_permissions sp
      JOIN public.group_members gm ON sp.granted_to_group_id = gm.group_id
      WHERE sp.secret_id = secrets.id
        AND gm.user_id = auth.uid()
        AND sp.permission_level IN ('edit', 'manage_access')
        AND sp.revoked_at IS NULL
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND is_active = TRUE
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND is_active = TRUE
  )
);
