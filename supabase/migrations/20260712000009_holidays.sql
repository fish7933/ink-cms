-- 연차 계산 시 주말 외에 공휴일도 제외하기 위한 공휴일 캘린더.
-- 음력 명절(설날/추석) 등은 매년 날짜가 바뀌므로 관리자가 연도별로 직접 등록/관리한다.
CREATE TABLE IF NOT EXISTS holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "holidays_all" ON holidays FOR ALL USING (true) WITH CHECK (true);
