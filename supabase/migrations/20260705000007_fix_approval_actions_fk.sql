-- approval_actions.approval_request_id의 실제 FK 제약이 (한 번도 쓰인 적 없는) 미사용
-- approval_requests(id) 테이블을 가리키고 있었다. 그런데 앱 코드는 항상
-- crew_recommendation_approvals.id 값을 이 컬럼에 넣는다 — 즉 지금까지 결재
-- 승인/반려를 시도할 때마다 FK 위반(23503)으로 매번 실패했다 (approval_actions가
-- 계속 비어있던 진짜 원인). approval_requests는 실제로 아무 데도 안 쓰이므로,
-- FK를 실제 쓰임에 맞게 crew_recommendation_approvals(id)로 다시 건다.

ALTER TABLE approval_actions
  DROP CONSTRAINT IF EXISTS approval_actions_approval_request_id_fkey;

ALTER TABLE approval_actions
  ADD CONSTRAINT approval_actions_approval_request_id_fkey
  FOREIGN KEY (approval_request_id) REFERENCES crew_recommendation_approvals(id) ON DELETE CASCADE;
