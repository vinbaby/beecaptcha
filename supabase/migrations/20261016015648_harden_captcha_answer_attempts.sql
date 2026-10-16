ALTER TABLE public.captcha_challenges
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'captcha_challenges_attempt_count_nonnegative'
      AND conrelid = 'public.captcha_challenges'::regclass
  ) THEN
    ALTER TABLE public.captcha_challenges
      ADD CONSTRAINT captcha_challenges_attempt_count_nonnegative
      CHECK (attempt_count >= 0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.vin_verify_answer(
  p_challenge_id uuid,
  p_answer text,
  p_token_hash text,
  p_now timestamp with time zone DEFAULT now()
)
RETURNS TABLE(site_id uuid, valid boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c public.captcha_challenges;
  next_attempt_count integer;
  max_attempts constant integer := 5;
BEGIN
  SELECT * INTO c
  FROM public.captcha_challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, false, 'invalid_challenge';
    RETURN;
  END IF;

  IF c.used_at IS NOT NULL THEN
    RETURN QUERY SELECT c.site_id, false, 'replay';
    RETURN;
  END IF;

  IF c.expires_at <= p_now THEN
    RETURN QUERY SELECT c.site_id, false, 'expired';
    RETURN;
  END IF;

  IF c.token_hash IS NOT NULL AND c.token_hash IS DISTINCT FROM p_token_hash THEN
    RETURN QUERY SELECT c.site_id, false, 'invalid_token';
    RETURN;
  END IF;

  IF p_answer IS NULL OR c.answer_hash IS DISTINCT FROM public.vin_hash(lower(trim(p_answer))) THEN
    next_attempt_count := c.attempt_count + 1;

    UPDATE public.captcha_challenges
    SET attempt_count = next_attempt_count,
        used_at = CASE WHEN next_attempt_count >= max_attempts THEN p_now ELSE used_at END
    WHERE id = c.id;

    IF next_attempt_count >= max_attempts THEN
      RETURN QUERY SELECT c.site_id, false, 'attempts_exceeded';
    ELSE
      RETURN QUERY SELECT c.site_id, false, 'invalid_answer';
    END IF;
    RETURN;
  END IF;

  UPDATE public.captcha_challenges
  SET used_at = p_now
  WHERE id = c.id;

  RETURN QUERY SELECT c.site_id, true, 'ok';
END;
$function$;

REVOKE ALL ON FUNCTION public.vin_verify_answer(uuid, text, text, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vin_verify_answer(uuid, text, text, timestamp with time zone) TO service_role;
