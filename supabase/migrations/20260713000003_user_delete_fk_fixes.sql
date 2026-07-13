-- "누가 이 작업을 했는지" 기록하는 감사(audit) 성격의 users FK들이 ON DELETE 액션 없이
-- (기본값 RESTRICT) 걸려 있어서, 그 직원이 과거에 이런 기록을 하나라도 남긴 적이 있으면
-- 사용자 그룹 관리에서 직원 삭제 자체가 막히고 있었다 (예: shore_leave_resets_created_by_fkey).
-- 이력 데이터는 남기되 "누가 했는지"만 NULL로 비우도록 ON DELETE SET NULL로 바꾼다
-- (approval_documents.created_by 등 기존에 이미 이렇게 처리된 감사 컬럼들과 동일한 방식).

ALTER TABLE shore_leave_resets ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE shore_leave_resets DROP CONSTRAINT shore_leave_resets_created_by_fkey;
ALTER TABLE shore_leave_resets ADD CONSTRAINT shore_leave_resets_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE shore_leave_adjustments ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE shore_leave_adjustments DROP CONSTRAINT shore_leave_adjustments_created_by_fkey;
ALTER TABLE shore_leave_adjustments ADD CONSTRAINT shore_leave_adjustments_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE shore_leave_admin_log ALTER COLUMN performed_by DROP NOT NULL;
ALTER TABLE shore_leave_admin_log DROP CONSTRAINT shore_leave_admin_log_performed_by_fkey;
ALTER TABLE shore_leave_admin_log ADD CONSTRAINT shore_leave_admin_log_performed_by_fkey
  FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE supervisor_assignments ALTER COLUMN assigned_by DROP NOT NULL;
ALTER TABLE supervisor_assignments DROP CONSTRAINT supervisor_assignments_assigned_by_fkey;
ALTER TABLE supervisor_assignments ADD CONSTRAINT supervisor_assignments_assigned_by_fkey
  FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE crew_assignments ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE crew_assignments DROP CONSTRAINT crew_assignments_created_by_fkey;
ALTER TABLE crew_assignments ADD CONSTRAINT crew_assignments_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE companies DROP CONSTRAINT companies_manager_id_fkey;
ALTER TABLE companies ADD CONSTRAINT companies_manager_id_fkey
  FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ships DROP CONSTRAINT ships_manager_id_fkey;
ALTER TABLE ships ADD CONSTRAINT ships_manager_id_fkey
  FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE homepage_posts DROP CONSTRAINT homepage_posts_created_by_fkey;
ALTER TABLE homepage_posts ADD CONSTRAINT homepage_posts_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
