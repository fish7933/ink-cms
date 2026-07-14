-- 직원카드 관리에서 임원/직원을 구분해 관리할 수 있도록 명시적 플래그를 추가한다.
-- 직급(shore_positions)만으로 자동 판정하지 않고 수동으로 지정할 수 있게 한다.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_executive BOOLEAN NOT NULL DEFAULT false;
