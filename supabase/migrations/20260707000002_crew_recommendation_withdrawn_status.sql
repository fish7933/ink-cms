-- 검토 대기 중 추천을 철회하면 기존엔 완전히 삭제되어 철회 이력이 남지 않았다.
-- status에 'withdrawn'을 추가해 삭제 대신 상태 변경으로 처리하고, 목록/상세에서
-- 철회 이력을 보여준 뒤 같은 직급에 재추천할 수 있게 한다.
ALTER TABLE crew_recommendations DROP CONSTRAINT crew_recommendations_status_check;
ALTER TABLE crew_recommendations ADD CONSTRAINT crew_recommendations_status_check
  CHECK (status IN ('pending', 'reviewed', 'accepted', 'rejected', 'withdrawn'));
