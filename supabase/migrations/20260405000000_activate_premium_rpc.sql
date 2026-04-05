CREATE OR REPLACE FUNCTION activate_my_premium()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE letter_boxes
  SET is_premium = true
  WHERE owner_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION activate_my_premium() TO authenticated;
