-- 애플리케이션 코드가 어떤 이유로든(캐시된 예전 번들, 새로 추가되는 호출부 등) 막지 못하더라도
-- DB 단에서 최종적으로 막는다. DB 서버는 UTC 기준이라 한국 등 UTC+ 시간대에서의 "오늘"이
-- UTC로는 아직 어제일 수 있으므로, 하루의 여유를 두어 정상적인 당일 입력까지 막지 않는다.
ALTER TABLE accounting_daily_reports
  DROP CONSTRAINT IF EXISTS accounting_daily_reports_no_future_date;
ALTER TABLE accounting_daily_reports
  ADD CONSTRAINT accounting_daily_reports_no_future_date
  CHECK (report_date <= CURRENT_DATE + INTERVAL '1 day');
