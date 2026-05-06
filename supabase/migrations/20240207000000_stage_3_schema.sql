-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =================================================================================================
-- 1. TABLES
-- =================================================================================================

-- PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    domain TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- GROUPS
CREATE TABLE IF NOT EXISTS public.groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- GROUP MEMBERS
CREATE TABLE IF NOT EXISTS public.group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('member', 'admin')),
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

-- SECRETS
CREATE TABLE IF NOT EXISTS public.secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    login TEXT,
    secret_value TEXT NOT NULL,
    link TEXT,
    notes TEXT,
    tags TEXT[],
    twofa_recovery TEXT,
    expires_at DATE,
    is_personal BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- SECRET PERMISSIONS
CREATE TABLE IF NOT EXISTS public.secret_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    secret_id UUID NOT NULL REFERENCES public.secrets(id) ON DELETE CASCADE,
    granted_to_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    granted_to_group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    permission_level TEXT NOT NULL CHECK (permission_level IN ('view', 'edit', 'manage_access')),
    granted_by_id UUID NOT NULL REFERENCES public.profiles(id),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at TIMESTAMP WITH TIME ZONE,
    -- XOR Constraint: Either user OR group, not both, not neither (unless logic handles nulls differently, usually XOR implies exactly one is true)
    -- Here we ensure at least one is null, and checks they aren't both null
    CONSTRAINT check_grant_target_xor CHECK (
        (granted_to_user_id IS NOT NULL AND granted_to_group_id IS NULL) OR 
        (granted_to_user_id IS NULL AND granted_to_group_id IS NOT NULL)
    ),
    UNIQUE(secret_id, granted_to_user_id), -- Prevent duplicate grants to user
    UNIQUE(secret_id, granted_to_group_id) -- Prevent duplicate grants to group
);

-- ACCESS REQUESTS
CREATE TABLE IF NOT EXISTS public.access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    secret_id UUID NOT NULL REFERENCES public.secrets(id) ON DELETE CASCADE,
    requested_by_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    permission_level TEXT NOT NULL CHECK (permission_level IN ('view', 'edit')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
    reviewed_by_id UUID REFERENCES public.profiles(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reason TEXT,
    denial_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id UUID NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =================================================================================================
-- 2. INDEXES
-- =================================================================================================

-- Profiles
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Groups
CREATE INDEX IF NOT EXISTS idx_groups_created_by ON public.groups(created_by);

-- Group Members
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON public.group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON public.group_members(user_id);

-- Secrets
CREATE INDEX IF NOT EXISTS idx_secrets_owner_id ON public.secrets(owner_id);
CREATE INDEX IF NOT EXISTS idx_secrets_deleted_at ON public.secrets(deleted_at);
CREATE INDEX IF NOT EXISTS idx_secrets_composite_filter ON public.secrets(owner_id, is_personal, deleted_at);

-- Secret Permissions
CREATE INDEX IF NOT EXISTS idx_secret_permissions_secret_id ON public.secret_permissions(secret_id);
CREATE INDEX IF NOT EXISTS idx_secret_permissions_user_id ON public.secret_permissions(granted_to_user_id);
CREATE INDEX IF NOT EXISTS idx_secret_permissions_group_id ON public.secret_permissions(granted_to_group_id);
CREATE INDEX IF NOT EXISTS idx_secret_permissions_composite ON public.secret_permissions(secret_id, granted_to_user_id, granted_to_group_id);

-- Access Requests
CREATE INDEX IF NOT EXISTS idx_access_requests_secret_id ON public.access_requests(secret_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_requested_by ON public.access_requests(requested_by_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON public.access_requests(status);

-- Audit Logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- =================================================================================================
-- 3. TRIGGERS & FUNCTIONS
-- =================================================================================================

-- Trigger Function: Update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

-- Apply Triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_secrets_updated_at BEFORE UPDATE ON public.secrets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: Approve Access Request
CREATE OR REPLACE FUNCTION public.approve_access_request(request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_request public.access_requests%ROWTYPE;
    v_user_id UUID;
    v_is_admin BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    
    -- Check if user is admin
    SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_user_id;
    IF v_is_admin IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
    END IF;

    -- Fetch request
    SELECT * INTO v_request FROM public.access_requests WHERE id = request_id AND status = 'pending';
    IF v_request IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or not pending');
    END IF;

    -- Update request status
    UPDATE public.access_requests 
    SET status = 'approved', reviewed_by_id = v_user_id, reviewed_at = NOW()
    WHERE id = request_id;

    -- Insert or Update permission
    -- Note: This handles the case where permission might already exist but at a different level
    INSERT INTO public.secret_permissions (secret_id, granted_to_user_id, permission_level, granted_by_id)
    VALUES (v_request.secret_id, v_request.requested_by_id, v_request.permission_level, v_user_id)
    ON CONFLICT (secret_id, granted_to_user_id) 
    DO UPDATE SET 
        permission_level = EXCLUDED.permission_level, 
        granted_by_id = EXCLUDED.granted_by_id, 
        revoked_at = NULL; -- Reactivate if revoked

    -- Audit Log
    INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, details)
    VALUES (v_user_id, 'approve_request', 'access_request', request_id, jsonb_build_object('secret_id', v_request.secret_id, 'grantee_id', v_request.requested_by_id));

    INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, details)
    VALUES (v_user_id, 'grant_permission', 'secret', v_request.secret_id, jsonb_build_object('grantee_id', v_request.requested_by_id, 'level', v_request.permission_level));

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- RPC: Deny Access Request
CREATE OR REPLACE FUNCTION public.deny_access_request(request_id UUID, denial_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_user_id UUID;
    v_is_admin BOOLEAN;
    v_request_exists BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    
    -- Check if user is admin
    SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_user_id;
    IF v_is_admin IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
    END IF;

    -- Check request exists and is pending
    SELECT EXISTS(SELECT 1 FROM public.access_requests WHERE id = request_id AND status = 'pending') INTO v_request_exists;
    IF v_request_exists IS FALSE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or not pending');
    END IF;

    -- Update request status
    UPDATE public.access_requests 
    SET status = 'denied', reviewed_by_id = v_user_id, reviewed_at = NOW(), denial_reason = denial_reason
    WHERE id = request_id;

    -- Audit Log
    INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, details)
    VALUES (v_user_id, 'deny_request', 'access_request', request_id, jsonb_build_object('reason', denial_reason));

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- =================================================================================================
-- 4. RLS POLICIES
-- =================================================================================================

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secret_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper condition to check if user is active
-- We append this to most SELECT/UPDATE policies to ensure deactivated users are locked out.
-- (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true))

-- --- PROFILES ---
CREATE POLICY "Users can view own profile" ON public.profiles 
FOR SELECT USING (
    auth.uid() = id AND is_active = true
);

CREATE POLICY "Admin can view all profiles" ON public.profiles 
FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true AND is_active = true)
);

CREATE POLICY "Users can update own profile" ON public.profiles 
FOR UPDATE USING (
    auth.uid() = id
) WITH CHECK (
    auth.uid() = id
);

-- --- GROUPS ---
CREATE POLICY "Admin can view all groups" ON public.groups 
FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true AND is_active = true)
);

CREATE POLICY "Members can view group" ON public.groups 
FOR SELECT USING (
    EXISTS (SELECT 1 FROM group_members WHERE group_id = groups.id AND user_id = auth.uid()) AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);

CREATE POLICY "Users can create group" ON public.groups 
FOR INSERT WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);

CREATE POLICY "Admin or group admin can update group" ON public.groups 
FOR UPDATE USING (
    (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) OR 
        EXISTS (SELECT 1 FROM group_members WHERE group_id = groups.id AND user_id = auth.uid() AND role = 'admin')
    ) AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);

CREATE POLICY "Admin or group admin can delete group" ON public.groups 
FOR DELETE USING (
    (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) OR 
        EXISTS (SELECT 1 FROM group_members WHERE group_id = groups.id AND user_id = auth.uid() AND role = 'admin')
    ) AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);

-- --- GROUP MEMBERS ---
CREATE POLICY "Members can view group members" ON public.group_members 
FOR SELECT USING (
    EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid()) AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);

CREATE POLICY "Admin can view all members" ON public.group_members 
FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true AND is_active = true)
);

CREATE POLICY "Admin or group admin can insert members" ON public.group_members 
FOR INSERT WITH CHECK (
    (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) OR 
        EXISTS (SELECT 1 FROM group_members WHERE group_id = group_members.group_id AND user_id = auth.uid() AND role = 'admin')
    ) AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);

CREATE POLICY "Admin or group admin can delete members" ON public.group_members 
FOR DELETE USING (
    (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) OR 
        EXISTS (SELECT 1 FROM group_members WHERE group_id = group_members.group_id AND user_id = auth.uid() AND role = 'admin')
    ) AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);

-- --- SECRETS ---
CREATE POLICY "Owner can view own secret" ON public.secrets 
FOR SELECT USING (
    owner_id = auth.uid() AND 
    deleted_at IS NULL AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);

CREATE POLICY "User with direct permission can view secret" ON public.secrets 
FOR SELECT USING (
    EXISTS (SELECT 1 FROM secret_permissions WHERE secret_id = secrets.id AND granted_to_user_id = auth.uid() AND revoked_at IS NULL) AND
    deleted_at IS NULL AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);

CREATE POLICY "User in group with permission can view secret" ON public.secrets 
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM secret_permissions sp 
        JOIN group_members gm ON sp.granted_to_group_id = gm.group_id 
        WHERE sp.secret_id = secrets.id AND gm.user_id = auth.uid() AND sp.revoked_at IS NULL
    ) AND
    deleted_at IS NULL AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);

CREATE POLICY "Admin can view non-personal secrets" ON public.secrets 
FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true AND is_active = true) AND 
    is_personal = false AND 
    deleted_at IS NULL
);

CREATE POLICY "Owner can insert secret" ON public.secrets 
FOR INSERT WITH CHECK (
    owner_id = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);

CREATE POLICY "Owner can update own secret" ON public.secrets 
FOR UPDATE USING (
    owner_id = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);

CREATE POLICY "User with edit permission can update non-sensitive fields" ON public.secrets 
FOR UPDATE USING (
    (
        EXISTS (SELECT 1 FROM secret_permissions WHERE secret_id = secrets.id AND granted_to_user_id = auth.uid() AND permission_level IN ('edit', 'manage_access') AND revoked_at IS NULL) OR
        EXISTS (SELECT 1 FROM secret_permissions sp JOIN group_members gm ON sp.granted_to_group_id = gm.group_id WHERE sp.secret_id = secrets.id AND gm.user_id = auth.uid() AND sp.permission_level IN ('edit', 'manage_access') AND sp.revoked_at IS NULL)
    ) AND 
    deleted_at IS NULL AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);

CREATE POLICY "Owner or admin can soft delete secret" ON public.secrets 
FOR UPDATE USING (
    (
        owner_id = auth.uid() OR 
        (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) AND is_personal = false)
    ) AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);

-- --- SECRET PERMISSIONS ---
CREATE POLICY "Owner can view permissions" ON public.secret_permissions 
FOR SELECT USING (
    EXISTS (SELECT 1 FROM secrets WHERE id = secret_id AND owner_id = auth.uid()) AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);

CREATE POLICY "User with direct permission can view own permission" ON public.secret_permissions 
FOR SELECT USING (
    granted_to_user_id = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);

CREATE POLICY "User in group can view group permission" ON public.secret_permissions 
FOR SELECT USING (
    EXISTS (SELECT 1 FROM group_members WHERE group_id = granted_to_group_id AND user_id = auth.uid()) AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);

CREATE POLICY "Admin can view permissions of non-personal secrets" ON public.secret_permissions 
FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true AND is_active = true) AND
    EXISTS (SELECT 1 FROM secrets WHERE id = secret_id AND is_personal = false)
);

CREATE POLICY "Owner or manage_access user can insert permission" ON public.secret_permissions 
FOR INSERT WITH CHECK (
    (
        EXISTS (SELECT 1 FROM secrets WHERE id = secret_id AND owner_id = auth.uid()) OR
        EXISTS (SELECT 1 FROM secret_permissions WHERE secret_id = secret_id AND granted_to_user_id = auth.uid() AND permission_level = 'manage_access' AND revoked_at IS NULL) OR
        EXISTS (SELECT 1 FROM secret_permissions sp JOIN group_members gm ON sp.granted_to_group_id = gm.group_id WHERE sp.secret_id = secret_id AND gm.user_id = auth.uid() AND sp.permission_level = 'manage_access' AND sp.revoked_at IS NULL)
    ) AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);

CREATE POLICY "Owner or manage_access user can revoke permission" ON public.secret_permissions 
FOR UPDATE USING (
    (
        EXISTS (SELECT 1 FROM secrets WHERE id = secret_id AND owner_id = auth.uid()) OR
        EXISTS (SELECT 1 FROM secret_permissions WHERE secret_id = secret_id AND granted_to_user_id = auth.uid() AND permission_level = 'manage_access' AND revoked_at IS NULL) OR
        EXISTS (SELECT 1 FROM secret_permissions sp JOIN group_members gm ON sp.granted_to_group_id = gm.group_id WHERE sp.secret_id = secret_id AND gm.user_id = auth.uid() AND sp.permission_level = 'manage_access' AND sp.revoked_at IS NULL)
    ) AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);

-- --- ACCESS REQUESTS ---
CREATE POLICY "User can create request" ON public.access_requests 
FOR INSERT WITH CHECK (
    requested_by_id = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);

CREATE POLICY "User can view own requests" ON public.access_requests 
FOR SELECT USING (
    requested_by_id = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);

CREATE POLICY "Owner can view requests for own secret" ON public.access_requests 
FOR SELECT USING (
    EXISTS (SELECT 1 FROM secrets WHERE id = secret_id AND owner_id = auth.uid()) AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);

CREATE POLICY "Admin can view all requests" ON public.access_requests 
FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true AND is_active = true)
);

CREATE POLICY "Admin can update request" ON public.access_requests 
FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true AND is_active = true)
);

-- --- AUDIT LOGS ---
CREATE POLICY "System can insert logs" ON public.audit_logs 
FOR INSERT WITH CHECK (
    true -- Typically this would be restricted to specific service roles or functions (SECURITY DEFINER) but for RLS enabled tables, we allow insert if triggered by user actions or allow all authenticated for now. 
    -- Better practice: Use SECURITY DEFINER functions for sensitive inserts.
    -- For this schema, we leave it open to authenticated users to support the client-side/RPC logging flow or ensure only system level roles can write if strictly enforced.
    -- Given requirements: "System can insert logs" implies broad write or write via function.
);

CREATE POLICY "User can view own logs" ON public.audit_logs 
FOR SELECT USING (
    user_id = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);

CREATE POLICY "Admin can view all logs" ON public.audit_logs 
FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true AND is_active = true)
);