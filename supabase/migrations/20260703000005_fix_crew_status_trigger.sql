-- crew_members.status가 바뀔 때마다 crew_status_history에 기록하는 트리거 함수가
-- 존재하지 않는 컬럼(NEW.updated_by)을 참조해서, status를 바꾸는 모든 UPDATE가
-- "record \"new\" has no field \"updated_by\"" 에러로 실패하고 있었음
-- (발령 실행 시 crew_members.status 업데이트가 여기서 막혀 실패).
-- 이 앱은 Supabase Auth를 쓰지 않아 auth.uid()도 없으므로, changed_by는 NULL로 기록.

CREATE OR REPLACE FUNCTION public.log_crew_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO crew_status_history (crew_member_id, from_status, to_status, changed_by, notes)
    VALUES (NEW.id, OLD.status, NEW.status, NULL, NEW.status_notes);
  END IF;
  RETURN NEW;
END;
$function$;
