insert into public.captcha_types (code,name,description,active,sort_order)
values (
  'auto',
  'Auto (Recommended)',
  'Alternates quick Drag & Match and Connect the Dots challenges. Escalates to Image Select after repeated wrong answers and occasionally uses an image challenge as a randomized audit.',
  true,
  15
)
on conflict (code) do update
set name=excluded.name,
    description=excluded.description,
    active=true,
    sort_order=excluded.sort_order,
    updated_at=now();

alter table public.sites alter column captcha_type set default 'auto';
