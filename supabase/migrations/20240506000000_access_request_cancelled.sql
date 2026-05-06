ALTER TABLE public.access_requests
DROP CONSTRAINT IF EXISTS access_requests_status_check;

ALTER TABLE public.access_requests
ADD CONSTRAINT access_requests_status_check
CHECK (status IN ('pending', 'approved', 'denied', 'cancelled'));

CREATE POLICY "User can cancel own pending request" ON public.access_requests
FOR UPDATE USING (
    requested_by_id = auth.uid() AND
    status = 'pending' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
) WITH CHECK (
    requested_by_id = auth.uid() AND
    status = 'cancelled' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
);
