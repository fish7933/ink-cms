-- 관리비 청구 항목 중 부가세(VAT) 과세 대상인 항목을 표시. 템플릿의 청구항목 그룹(같은
-- fee_item_id) 단위로 켜고 끈다 — 직급/국적 등 조건행별로 다를 이유가 없는 항목 속성이다.
ALTER TABLE management_fee_template_items ADD COLUMN IF NOT EXISTS is_vat_applicable BOOLEAN NOT NULL DEFAULT false;
