-- 직원 퇴사 처리: 퇴사일을 기준으로 로그인 차단, 급여 대상 제외, 일할계산에 사용한다.
ALTER TABLE users ADD COLUMN IF NOT EXISTS resignation_date DATE;

-- 입사/퇴사일 기준 일할계산을 적용했을 때 그 계산 근거를 명세서에 남겨 직원이 확인할 수 있게 한다.
ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS proration_note TEXT;
