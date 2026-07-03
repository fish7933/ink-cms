-- 교대지 국가명/도시명을 영어로 통일

UPDATE ports SET country_name = 'South Korea' WHERE country_code = 'KR';
UPDATE ports SET country_name = 'China' WHERE country_code = 'CN';
UPDATE ports SET country_name = 'Hong Kong' WHERE country_code = 'HK';
UPDATE ports SET country_name = 'Taiwan' WHERE country_code = 'TW';
UPDATE ports SET country_name = 'Japan' WHERE country_code = 'JP';
UPDATE ports SET country_name = 'Vietnam' WHERE country_code = 'VN';
UPDATE ports SET country_name = 'Thailand' WHERE country_code = 'TH';
UPDATE ports SET country_name = 'Malaysia' WHERE country_code = 'MY';
UPDATE ports SET country_name = 'Philippines' WHERE country_code = 'PH';
UPDATE ports SET country_name = 'Sri Lanka' WHERE country_code = 'LK';
UPDATE ports SET country_name = 'India' WHERE country_code = 'IN';
UPDATE ports SET country_name = 'United Arab Emirates' WHERE country_code = 'AE';
UPDATE ports SET country_name = 'Saudi Arabia' WHERE country_code = 'SA';
UPDATE ports SET country_name = 'Netherlands' WHERE country_code = 'NL';
UPDATE ports SET country_name = 'Belgium' WHERE country_code = 'BE';
UPDATE ports SET country_name = 'Germany' WHERE country_code = 'DE';
UPDATE ports SET country_name = 'United Kingdom' WHERE country_code = 'GB';
UPDATE ports SET country_name = 'Greece' WHERE country_code = 'GR';
UPDATE ports SET country_name = 'Spain' WHERE country_code = 'ES';
UPDATE ports SET country_name = 'United States' WHERE country_code = 'US';
UPDATE ports SET country_name = 'Panama' WHERE country_code = 'PA';
UPDATE ports SET country_name = 'Brazil' WHERE country_code = 'BR';
UPDATE ports SET country_name = 'Canada' WHERE country_code = 'CA';
UPDATE ports SET country_name = 'Australia' WHERE country_code = 'AU';
UPDATE ports SET country_name = 'Singapore' WHERE country_code = 'SG';

UPDATE ports SET city_name = 'Busan' WHERE country_code = 'KR' AND city_name = '부산';
UPDATE ports SET city_name = 'Incheon' WHERE country_code = 'KR' AND city_name = '인천';
UPDATE ports SET city_name = 'Ulsan' WHERE country_code = 'KR' AND city_name = '울산';
UPDATE ports SET city_name = 'Yeosu/Gwangyang' WHERE country_code = 'KR' AND city_name = '여수/광양';
UPDATE ports SET city_name = 'Pyeongtaek/Dangjin' WHERE country_code = 'KR' AND city_name = '평택/당진';
UPDATE ports SET city_name = 'Mokpo' WHERE country_code = 'KR' AND city_name = '목포';
UPDATE ports SET city_name = 'Pohang' WHERE country_code = 'KR' AND city_name = '포항';
UPDATE ports SET city_name = 'Gunsan' WHERE country_code = 'KR' AND city_name = '군산';
UPDATE ports SET city_name = 'Daesan' WHERE country_code = 'KR' AND city_name = '대산';
UPDATE ports SET city_name = 'Donghae/Mukho' WHERE country_code = 'KR' AND city_name = '동해/묵호';
