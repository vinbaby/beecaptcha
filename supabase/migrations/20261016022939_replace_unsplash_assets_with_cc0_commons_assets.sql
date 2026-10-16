UPDATE public.captcha_assets
SET active = false
WHERE kind = 'image'
  AND image_url LIKE 'https://images.unsplash.com/%';

INSERT INTO public.captcha_assets
  (kind,label,image_url,active,source_url,source_author,license_name,source_title)
VALUES
('image','bicycle','https://commons.wikimedia.org/wiki/Special:FilePath/White_bicycle.jpg?width=640',true,'https://commons.wikimedia.org/wiki/File:White_bicycle.jpg','Fasalul Abid Shj','CC0 1.0','White bicycle in blue background'),
('image','bicycle','https://commons.wikimedia.org/wiki/Special:FilePath/Bicycle_07.jpg?width=640',true,'https://commons.wikimedia.org/wiki/File:Bicycle_07.jpg','Shams948','CC0 1.0','Bicycle 07'),
('image','bicycle','https://commons.wikimedia.org/wiki/Special:FilePath/Bicycle_10.jpg?width=640',true,'https://commons.wikimedia.org/wiki/File:Bicycle_10.jpg','Shams948','CC0 1.0','Bicycle 10'),
('image','bicycle','https://commons.wikimedia.org/wiki/Special:FilePath/Uma_%C3%BAnica_bicicleta_estacionada.jpg?width=640',true,'https://commons.wikimedia.org/wiki/File:Uma_%C3%BAnica_bicicleta_estacionada.jpg','Depetrica','CC0 1.0','Uma única bicicleta estacionada'),
('image','bus','https://commons.wikimedia.org/wiki/Special:FilePath/PJ_City_Bus.jpg?width=640',true,'https://commons.wikimedia.org/wiki/File:PJ_City_Bus.jpg','Wiki Farazi','CC0 1.0','PJ City Bus'),
('image','bus','https://commons.wikimedia.org/wiki/Special:FilePath/GandhinagarCityBus.jpg?width=640',true,'https://commons.wikimedia.org/wiki/File:GandhinagarCityBus.jpg','Gaurav.raval','CC0 1.0','Gandhinagar city bus'),
('image','bus','https://commons.wikimedia.org/wiki/Special:FilePath/469Imus_City_bus.jpg?width=640',true,'https://commons.wikimedia.org/wiki/File:469Imus_City_bus.jpg','Judgefloro','CC0 1.0','Imus City bus'),
('image','bus','https://commons.wikimedia.org/wiki/Special:FilePath/MTA_New_York_City_Bus_5439_on_the_Bx1_route_in_the_Bronx.jpg?width=640',true,'https://commons.wikimedia.org/wiki/File:MTA_New_York_City_Bus_5439_on_the_Bx1_route_in_the_Bronx.jpg','Yamiel Aurion','CC0 1.0','New York City bus on the Bx1 route'),
('image','car','https://commons.wikimedia.org/wiki/Special:FilePath/Car_traveling_along_road_in_Singapore.jpg?width=640',true,'https://commons.wikimedia.org/wiki/File:Car_traveling_along_road_in_Singapore.jpg','Teojincheng','CC0 1.0','Car traveling along road in Singapore'),
('image','car','https://commons.wikimedia.org/wiki/Special:FilePath/Car_Singapore.jpg?width=640',true,'https://commons.wikimedia.org/wiki/File:Car_Singapore.jpg','Iorisrandombses5001','CC0 1.0','Car Singapore'),
('image','car','https://commons.wikimedia.org/wiki/Special:FilePath/Car_wakhan_corridor.jpg?width=640',true,'https://commons.wikimedia.org/wiki/File:Car_wakhan_corridor.jpg','Benoît Vicart','CC0 1.0','Car on a dirt road in the Wakhan corridor'),
('image','car','https://commons.wikimedia.org/wiki/Special:FilePath/Car_Photography.jpg?width=640',true,'https://commons.wikimedia.org/wiki/File:Car_Photography.jpg','Al Dorecl Sina','CC0 1.0','Car photography'),
('image','traffic_light','https://commons.wikimedia.org/wiki/Special:FilePath/Traffic_Light.jpg?width=640',true,'https://commons.wikimedia.org/wiki/File:Traffic_Light.jpg','鄒延','CC0 1.0','Traffic light'),
('image','traffic_light','https://commons.wikimedia.org/wiki/Special:FilePath/Traffic_lights_%281%29.jpg?width=640',true,'https://commons.wikimedia.org/wiki/File:Traffic_lights_%281%29.jpg','Mrshaxas','CC0 1.0','Traffic lights'),
('image','traffic_light','https://commons.wikimedia.org/wiki/Special:FilePath/Ampel-Singapur-03-fws.jpg?width=640',true,'https://commons.wikimedia.org/wiki/File:Ampel-Singapur-03-fws.jpg','Kryp','CC0 1.0','Pedestrian countdown traffic signal in Singapore'),
('image','traffic_light','https://commons.wikimedia.org/wiki/Special:FilePath/Traffic_signal_in_Italy_with_red_light.jpg?width=640',true,'https://commons.wikimedia.org/wiki/File:Traffic_signal_in_Italy_with_red_light.jpg','Albertomos; derivative work Trixt','CC0 1.0','Traffic signal in Italy with red light')
ON CONFLICT (image_url) DO UPDATE SET
  active = EXCLUDED.active,
  source_url = EXCLUDED.source_url,
  source_author = EXCLUDED.source_author,
  license_name = EXCLUDED.license_name,
  source_title = EXCLUDED.source_title;
