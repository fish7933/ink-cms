-- 승진/강등 발령(crew_dispatch_orders) 결재를 채용/배승/계약 결재와 동일한 구조로 분리.
-- 결재선(approval_lines/approval_line_steps)은 기존 것을 그대로 재사용한다.

CREATE TABLE dispatch_order_approvals (
  id uuid primary key default gen_random_uuid(),
  crew_dispatch_order_id uuid not null references crew_dispatch_orders(id) on delete cascade,
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

CREATE TABLE dispatch_order_approval_actions (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references dispatch_order_approvals(id) on delete cascade,
  step_order integer not null,
  approver_id uuid references users(id) on delete set null,
  action text not null check (action in ('approved','rejected')),
  comments text,
  created_at timestamptz not null default now()
);

CREATE INDEX idx_dispatch_order_approvals_order ON dispatch_order_approvals(crew_dispatch_order_id);
CREATE INDEX idx_dispatch_order_approvals_line ON dispatch_order_approvals(approval_line_id);
CREATE INDEX idx_dispatch_order_approval_actions_request ON dispatch_order_approval_actions(approval_request_id);
