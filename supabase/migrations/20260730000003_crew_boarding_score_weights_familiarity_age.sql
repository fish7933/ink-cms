-- 승선 적합도에 "같은 선박/플릿/선주사 경험"(familiarity)과 "나이"(30대 최고점, 멀어질수록
-- 감점) 가점 요소를 추가한다.
ALTER TABLE crew_boarding_score_weights ADD COLUMN IF NOT EXISTS familiarity NUMERIC NOT NULL DEFAULT 15;
ALTER TABLE crew_boarding_score_weights ADD COLUMN IF NOT EXISTS age NUMERIC NOT NULL DEFAULT 10;
