CREATE TABLE IF NOT EXISTS public.captcha_request_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  request_ip_hash text NOT NULL CHECK (request_ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS captcha_request_limits_site_time_idx
  ON public.captcha_request_limits (site_id, created_at);

CREATE INDEX IF NOT EXISTS captcha_request_limits_site_ip_time_idx
  ON public.captcha_request_limits (site_id, request_ip_hash, created_at);

ALTER TABLE public.captcha_request_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.captcha_request_limits FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.vin_reserve_challenge_rate_limit(
  p_site_id uuid,
  p_request_ip_hash text,
  p_now timestamp with time zone DEFAULT now()
)
RETURNS TABLE(allowed boolean, reason text, retry_after integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  site_count bigint;
  ip_count bigint;
BEGIN
  IF p_site_id IS NULL OR p_request_ip_hash IS NULL OR p_request_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN QUERY SELECT false, 'invalid_request'::text, 60;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_site_id::text, 0));

  DELETE FROM public.captcha_request_limits
  WHERE site_id = p_site_id
    AND created_at < p_now - interval '60 seconds';

  SELECT count(*) INTO site_count
  FROM public.captcha_request_limits
  WHERE site_id = p_site_id
    AND created_at >= p_now - interval '60 seconds';

  IF site_count >= 120 THEN
    RETURN QUERY SELECT false, 'site_rate_limited'::text, 60;
    RETURN;
  END IF;

  SELECT count(*) INTO ip_count
  FROM public.captcha_request_limits
  WHERE site_id = p_site_id
    AND request_ip_hash = p_request_ip_hash
    AND created_at >= p_now - interval '60 seconds';

  IF ip_count >= 20 THEN
    RETURN QUERY SELECT false, 'ip_rate_limited'::text, 60;
    RETURN;
  END IF;

  INSERT INTO public.captcha_request_limits(site_id, request_ip_hash, created_at)
  VALUES (p_site_id, p_request_ip_hash, p_now);

  RETURN QUERY SELECT true, 'ok'::text, 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.vin_reserve_challenge_rate_limit(uuid, text, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vin_reserve_challenge_rate_limit(uuid, text, timestamp with time zone) TO service_role;
