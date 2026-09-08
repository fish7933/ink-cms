-- 수당 지급 조건(재고용수당의 "최대 10회", "직전 계약 8개월 이상", "재승선 6개월 이내",
-- "선주 변경 시 초기화" 등) — 조건에 맞는지는 시스템이 자동 판정해 보여주고, 실제 발령에
-- 적용할지는 발령자가 최종 결정한다(자동으로 지급을 막거나 강제하지 않음). 전부 nullable/
-- 기본값 처리라 기존 템플릿 항목(예: KSS 재고용수당 템플릿)은 "조건 없음"으로 그대로 유효.
ALTER TABLE allowance_template_items
  ADD COLUMN IF NOT EXISTS max_payout_count INTEGER NULL,
  ADD COLUMN IF NOT EXISTS min_prior_contract_months INTEGER NULL,
  ADD COLUMN IF NOT EXISTS max_gap_months INTEGER NULL,
  ADD COLUMN IF NOT EXISTS reset_on_owner_change BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN allowance_template_items.max_payout_count IS '이 항목을 같은 선원에게 지급할 수 있는 최대 횟수 (NULL=제한 없음)';
COMMENT ON COLUMN allowance_template_items.min_prior_contract_months IS '직전 승선기록이 이 개월수 이상 지속되어야 지급 대상 (NULL=조건 없음, 최초 승선도 통과)';
COMMENT ON COLUMN allowance_template_items.max_gap_months IS '직전 하선(귀국)일로부터 이 개월수 이내 재승선해야 지급 대상 (NULL=제한 없음)';
COMMENT ON COLUMN allowance_template_items.reset_on_owner_change IS '직전 계약과 선주(owner)가 다르면 max_payout_count 카운트를 0으로 리셋할지 여부';
