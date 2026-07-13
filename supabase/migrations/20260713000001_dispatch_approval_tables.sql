-- 배승(교대계획)/계약 결재를 채용 결재(crew_recommendation_approvals)와 동일한 구조로 분리.
-- '발령' 메뉴 전용 결재 테이블 — 결재선(approval_lines/approval_line_steps)은 기존 것을 그대로 재사용한다.

CREATE TABLE rotation_plan_approvals (
  id uuid primary key default gen_random_uuid(),
  crew_rotation_plan_id uuid not null references crew_rotation_plans(id) on delete cascade,
  approval_line_id uuid not null references approval_lines(id),
  requester_id uuid not null references users(id) on delete restrict,
  requester_comment text,
  current_step integer not null default 1,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  final_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

CREATE TABLE rotation_plan_approval_actions (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references rotation_plan_approvals(id) on delete cascade,
  step_order integer not null,
  approver_id uuid references users(id) on delete set null,
  action text not null check (action in ('approved','rejected')),
  comments text,
  created_at timestamptz not null default now()
);

CREATE TABLE crew_contract_approvals (
  id uuid primary key default gen_random_uuid(),
  crew_contract_id uuid not null references crew_contracts(id) on delete cascade,
  approval_line_id uuid not null references approval_lines(id),
  requester_id uuid not null references users(id) on delete restrict,
  requester_comment text,
  current_step integer not null default 1,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  final_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

CREATE TABLE crew_contract_approval_actions (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references crew_contract_approvals(id) on delete cascade,
  step_order integer not null,
  approver_id uuid references users(id) on delete set null,
  action text not null check (action in ('approved','rejected')),
  comments text,
  created_at timestamptz not null default now()
);

CREATE INDEX idx_rotation_plan_approvals_plan ON rotation_plan_approvals(crew_rotation_plan_id);
CREATE INDEX idx_rotation_plan_approvals_line ON rotation_plan_approvals(approval_line_id);
CREATE INDEX idx_rotation_plan_approval_actions_request ON rotation_plan_approval_actions(approval_request_id);
CREATE INDEX idx_crew_contract_approvals_contract ON crew_contract_approvals(crew_contract_id);
CREATE INDEX idx_crew_contract_approvals_line ON crew_contract_approvals(approval_line_id);
CREATE INDEX idx_crew_contract_approval_actions_request ON crew_contract_approval_actions(approval_request_id);
