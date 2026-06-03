-- Allows authenticated users to delete their own account.
-- Uses SECURITY DEFINER so the function runs with elevated privileges
-- to call auth.users deletion, which requires service_role.
-- RLS still enforces that only the calling user can delete themselves
-- because we check auth.uid() = user_id in the WHERE clause.

CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete the calling user's auth record. Cascades to all user data
  -- (venue_reviews, user_saved_venues, review_reports) via FK ON DELETE CASCADE.
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- Only authenticated users can call this function.
REVOKE ALL ON FUNCTION public.delete_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user() TO authenticated;
