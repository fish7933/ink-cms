-- 삭제된 플릿을 여전히 가리키는 선박의 fleet_id를 정리 (고아 참조)
-- 예: HANA Marine 소속 선박들이 삭제된 플릿 id를 참조하고 있어
-- 우리회사 담당자 배정 트리 화면에서 플릿에도, 선주 직속에도 잡히지 않아 사라져 보이던 문제
UPDATE ships
SET fleet_id = NULL
WHERE fleet_id IS NOT NULL
  AND fleet_id NOT IN (SELECT id FROM fleets);
