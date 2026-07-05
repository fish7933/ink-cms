-- job_posting_groups.fleet_id 컬럼에 FK 제약이 없어서, 애플리케이션 코드가 참조하는
-- job_posting_groups_fleet_id_fkey 관계를 PostgREST가 찾지 못해 목록 조회(임베디드 조인)가
-- 전부 400 에러로 실패하던 문제 수정 (구인 공고 관리 화면이 빈 목록으로 보이고 등록 버튼도
-- 안 보이던 원인 — currentUser 로딩까지 같은 Promise.all에서 실패해 발생).

ALTER TABLE job_posting_groups
  ADD CONSTRAINT job_posting_groups_fleet_id_fkey
  FOREIGN KEY (fleet_id) REFERENCES fleets(id) ON DELETE SET NULL;
