-- 직급 관리 화면의 드래그 순서변경이 "적용이 안 되는 것처럼" 보인 원인: 부서(department) 내에서
-- display_order 값이 중복된 직급들이 있었다(예: deck의 2/O·MSTR·C/O가 전부 0, engine의
-- FITTER·WPR·3/E가 전부 11). 부서 내에서 값을 1..n으로 정규화해 중복을 제거한다.
-- (부서 간 순서는 rank-order.ts의 DEPARTMENT_ORDER가 별도로 고정하므로 여기서는 건드리지 않음)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY department ORDER BY display_order, rank_code) AS rn
  FROM ranks
)
UPDATE ranks
SET display_order = ranked.rn
FROM ranked
WHERE ranks.id = ranked.id;
