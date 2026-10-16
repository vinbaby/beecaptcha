create or replace view public.vin_site_verification_events as
select
  vl.site_id,
  vl.created_at,
  vl.success,
  cc.challenge_type,
  case
    when cc.created_at is not null then greatest(0, extract(epoch from (vl.created_at - cc.created_at)))::numeric
    else null
  end as duration_seconds
from public.verification_logs vl
join public.sites s on s.id = vl.site_id
left join public.captcha_challenges cc on cc.id = vl.challenge_id
where s.owner_id = auth.uid();
