-- 선원이 직접 등록하는 승선 희망일. crew_recommendations.available_date(매닝사가 채용공고에
-- 추천할 때 넘기는 값)와는 별개 개념 — 이건 이미 등록된 선원 본인이 언제 다시 승선하고
-- 싶은지를 나타내며, 로테이션 승선 후보 추천 점수 계산에 쓰인다.
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS desired_embark_date DATE;
