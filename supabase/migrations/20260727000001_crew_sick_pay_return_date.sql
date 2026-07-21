-- 상병급여 청구 시작일은 하선일이 아니라 귀국일(귀국일까지는 정상 급여 지급) 다음날부터다.
-- 계산에 쓴 귀국일 자체도 조회/표시용으로 남겨둔다(하선일과 달리 이전엔 저장하지 않았음).
ALTER TABLE crew_sick_pay_records ADD COLUMN IF NOT EXISTS return_date DATE;
