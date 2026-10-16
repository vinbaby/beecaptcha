ALTER TABLE public.captcha_assets
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_author text,
  ADD COLUMN IF NOT EXISTS license_name text DEFAULT 'Unsplash License',
  ADD COLUMN IF NOT EXISTS source_title text;

CREATE UNIQUE INDEX IF NOT EXISTS captcha_assets_image_url_unique
  ON public.captcha_assets (image_url);

INSERT INTO public.captcha_assets
  (kind, label, image_url, active, source_url, source_author, license_name, source_title)
VALUES
  ('image','bicycle','https://images.unsplash.com/photo-1613855162802-8dd37355dc12?auto=format&fit=crop&fm=jpg&q=80&w=640',true,'https://unsplash.com/photos/blue-city-bike-parked-on-black-metal-fence-during-daytime-0xw36tM5MG4',NULL,'Unsplash License','Blue city bike parked on a city street'),
  ('image','bicycle','https://images.unsplash.com/photo-1553788195-e0fd80c655d2?auto=format&fit=crop&fm=jpg&q=80&w=640',true,'https://unsplash.com/photos/green-commuter-bike-kxuAteLDmfk',NULL,'Unsplash License','Green commuter bike'),
  ('image','bicycle','https://images.unsplash.com/photo-1777046258447-32ea6918eba5?auto=format&fit=crop&fm=jpg&q=80&w=640',true,'https://unsplash.com/photos/a-person-rides-a-bicycle-down-a-city-street-2s9f8MGMxRk','Muhammad Irfan','Unsplash License','A person rides a bicycle down a city street'),
  ('image','car','https://images.unsplash.com/photo-1655286347294-4ae8125d33e7?auto=format&fit=crop&fm=jpg&q=80&w=640',true,'https://unsplash.com/photos/a-white-car-parked-on-a-street-0FoH1c4i0CU','David Moffatt','Unsplash License','A white car parked on a street'),
  ('image','car','https://images.unsplash.com/photo-1749746816910-46aff57b92a4?auto=format&fit=crop&fm=jpg&q=80&w=640',true,'https://unsplash.com/photos/a-shiny-green-sports-car-on-a-tree-lined-road-b9iXBkBB1QQ',NULL,'Unsplash License','A shiny green sports car on a tree-lined road'),
  ('image','car','https://images.unsplash.com/photo-1589123592035-32858c974713?auto=format&fit=crop&fm=jpg&q=80&w=640',true,'https://unsplash.com/s/photos/street-parking',NULL,'Unsplash License','Cars parked along a residential street'),
  ('image','bus','https://images.unsplash.com/photo-1659276579460-d9832cbc08f8?auto=format&fit=crop&fm=jpg&q=80&w=640',true,'https://unsplash.com/photos/a-group-of-red-double-decker-buses-on-a-city-street-_wuEaYPWuUg',NULL,'Unsplash License','A group of red double-decker buses on a city street'),
  ('image','bus','https://images.unsplash.com/photo-1661730846214-22dcc954d557?auto=format&fit=crop&fm=jpg&q=80&w=640',true,'https://unsplash.com/photos/a-white-bus-driving-down-a-street-next-to-tall-buildings-kAf_Iayg00E',NULL,'Unsplash License','A white city bus on an urban street'),
  ('image','bus','https://images.unsplash.com/photo-1664079555411-f5e74d5c0268?auto=format&fit=crop&fm=jpg&q=80&w=640',true,'https://unsplash.com/photos/a-bus-travels-down-the-street-ZgjJ3KkFlg4','Markus Winkler','Unsplash License','A bus travels down the street'),
  ('image','traffic_light','https://images.unsplash.com/photo-1761637822855-e75040cebd72?auto=format&fit=crop&fm=jpg&q=80&w=640',true,'https://unsplash.com/photos/traffic-light-showing-red-and-green-signals-C4Pmx4cPNbU','Sergej Karpow','Unsplash License','Traffic light showing red and green signals'),
  ('image','traffic_light','https://images.unsplash.com/photo-1771570947161-5fe6caba183d?auto=format&fit=crop&fm=jpg&q=80&w=640',true,'https://unsplash.com/photos/traffic-light-with-red-pedestrian-signal-and-green-light-C6GdYEFuqYU','KC Shum','Unsplash License','Traffic light with red pedestrian signal and green light'),
  ('image','traffic_light','https://images.unsplash.com/photo-1769118442465-83ed7034a63a?auto=format&fit=crop&fm=jpg&q=80&w=640',true,'https://unsplash.com/fr/photos/une-rue-de-la-ville-la-nuit-avec-des-feux-de-circulation-t9ab2yS7dRE',NULL,'Unsplash License','Nighttime city intersection with traffic signals')
ON CONFLICT (image_url) DO NOTHING;

UPDATE public.captcha_types
SET active = false,
    description = 'Deprecated: deterministic shapes/colors are trivially machine-readable; use Image Select instead.'
WHERE code = 'visual_select_v1';

UPDATE public.captcha_types
SET active = false,
    description = 'Deprecated: arithmetic prompts are trivially automated; use Image Select instead.'
WHERE code = 'math_v1';

UPDATE public.captcha_types
SET active = true,
    description = 'Select all tiles containing the requested object. Server stores answer hashes; tiles are shuffled per challenge.'
WHERE code = 'image_select_v1';

ALTER TABLE public.sites
  ALTER COLUMN captcha_type SET DEFAULT 'image_select_v1';

UPDATE public.sites
SET captcha_type = 'image_select_v1', updated_at = now()
WHERE captcha_type IN ('visual_select_v1','math_v1');
