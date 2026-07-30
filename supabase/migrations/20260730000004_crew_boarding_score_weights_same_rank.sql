-- 승선 적합도에 가장 중요한 요소인 "동직급(대상 직급) 경력"을 추가한다 — 지금 직급을 갖고
-- 있는지가 아니라, 그 직급으로 실제 승선해본 경력이 얼마나 되는지를 본다.
ALTER TABLE crew_boarding_score_weights ADD COLUMN IF NOT EXISTS same_rank NUMERIC NOT NULL DEFAULT 20;
