-- crew_rotation_plans.fleet_id 컬럼에 FK 제약이 아예 없어서, 애플리케이션 코드가 참조하는
-- crew_rotation_plans_fleet_id_fkey 관계를 PostgREST가 찾지 못해 목록 조회(임베디드 조인)가
-- 전부 400 에러로 실패하던 문제 수정 (교대 계획이 실제로는 저장되는데 목록에는 하나도 안 보이던 원인).

ALTER TABLE crew_rotation_plans
  ADD CONSTRAINT crew_rotation_plans_fleet_id_fkey
  FOREIGN KEY (fleet_id) REFERENCES fleets(id) ON DELETE SET NULL;
