-- 급여 구성항목 개명/통합(BW/OT/LP/OA 등 영문 약어로 정리) 이후 비활성화(is_active=false)된
-- 예전 한글 항목(기본급/시간외 수당/휴가비/식비/통신비/B·W/LP')이 salary_template_items에
-- 그대로 남아 있었다. 확인 결과 이 항목을 쓰는 55개 템플릿 전부 이미 대응하는 활성 영문
-- 항목(BW/OT/LP/OA)을 동일 직급으로 가지고 있어 완전히 중복된 죽은 참조였다(급여 계산/
-- 급여대장 화면은 is_active=true만 걸러 쓰므로 실질 영향 없음) — 참조 행과 항목 자체를 정리한다.
DELETE FROM salary_template_items
WHERE component_id IN (
  SELECT id FROM salary_components
  WHERE is_active = false
    AND name IN ('기본급', '시간외 수당', '휴가비', '식비', '통신비', 'B/W', 'LP''')
);

DELETE FROM salary_components
WHERE is_active = false
  AND name IN ('기본급', '시간외 수당', '휴가비', '식비', '통신비', 'B/W', 'LP''');
