REVOKE INSERT, DELETE ON public.deliveries FROM authenticated;
DROP POLICY IF EXISTS "deliveries insert by scorers" ON public.deliveries;
DROP POLICY IF EXISTS "deliveries delete by scorers" ON public.deliveries;