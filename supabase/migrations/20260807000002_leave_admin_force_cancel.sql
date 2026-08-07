-- 관리자가 아직 사용되지 않은(시작일이 지나지 않은) 승인된 연차/질병휴가를 결재 없이 즉시
-- 강제 취소할 수 있게 한다. shore_leave_admin_log는 원래 연차 부여/차감/초기화/제외 지정-해제만
-- 기록했는데, 육상 직원 연차/질병휴가 관리 화면이 "휴가 사용 현황"으로 통합되면서 질병휴가 강제
-- 취소도 같은 로그에 함께 남긴다.
ALTER TABLE shore_leave_admin_log DROP CONSTRAINT shore_leave_admin_log_action_type_check;
ALTER TABLE shore_leave_admin_log ADD CONSTRAINT shore_leave_admin_log_action_type_check
  CHECK (action_type IN ('grant', 'manual_use', 'reset', 'exempt_on', 'exempt_off', 'cancel_annual', 'cancel_sick'));
