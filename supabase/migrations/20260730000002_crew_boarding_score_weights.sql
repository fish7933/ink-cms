-- 로테이션 승선 후보 추천 점수(crew-boarding-score.service.ts)의 요소별 가중치. company_info와
-- 동일하게 단일 레코드(싱글턴)로 운용 — "선원 관리 설정 > 승선 적합도 설정" 화면에서 관리자가
-- 조정할 수 있게 한다. 값은 상대적 가중치(합이 100일 필요는 없음, 존재하는 요소끼리 정규화됨).
CREATE TABLE IF NOT EXISTS crew_boarding_score_weights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ship_type NUMERIC NOT NULL DEFAULT 15,
  size NUMERIC NOT NULL DEFAULT 10,
  route NUMERIC NOT NULL DEFAULT 10,
  evaluation NUMERIC NOT NULL DEFAULT 25,
  work_years NUMERIC NOT NULL DEFAULT 15,
  rest NUMERIC NOT NULL DEFAULT 15,
  desired_date NUMERIC NOT NULL DEFAULT 10,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE crew_boarding_score_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_crew_boarding_score_weights" ON crew_boarding_score_weights FOR ALL USING (true);

INSERT INTO crew_boarding_score_weights (ship_type, size, route, evaluation, work_years, rest, desired_date)
SELECT 15, 10, 10, 25, 15, 15, 10
WHERE NOT EXISTS (SELECT 1 FROM crew_boarding_score_weights);
