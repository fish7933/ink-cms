-- 결재선 관리에서 직접 고른 라인으로 만들어진 기존 문서들은 approver_label에
-- "결재선: OOO 결재" 같은 라인 이름이 그대로 저장돼 있었다(코드 수정 전 버그).
-- 시행문/결재란은 이 저장된 값을 그대로 읽어서 보여주므로, 이미 만들어진 건들도
-- 다른 결재라인과 동일하게 직급만 보이도록 값 자체를 바로잡는다.
UPDATE approval_document_steps ads
SET approver_label = sp.name
FROM users u
JOIN shore_positions sp ON sp.id = u.position_id
WHERE ads.approver_id = u.id
  AND ads.approver_label LIKE '결재선:%';
