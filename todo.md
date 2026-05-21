# 고급 기능 구현 TODO

## 1. 비밀번호 해싱 (bcrypt)
- [x] bcryptjs 패키지 설치
- [ ] `/src/lib/auth.ts` - 비밀번호 해싱/검증 유틸리티 함수
- [ ] `/src/lib/store.ts` - login, register 함수에 bcrypt 적용
- [ ] `/src/lib/db-migration-hash.sql` - 기존 테스트 계정 비밀번호를 해시로 업데이트하는 SQL

## 2. 파일 업로드 (Supabase Storage)
- [ ] `/src/lib/storage.ts` - Supabase Storage 업로드/다운로드 함수
- [ ] `/src/lib/db-storage-buckets.sql` - Storage 버킷 생성 SQL
- [ ] `/src/components/FileUpload.tsx` - 파일 업로드 컴포넌트
- [ ] `/src/pages/CrewManagementPage.tsx` - 선원 문서 업로드 UI 추가
- [ ] `/src/pages/ShipManagementPage.tsx` - 선박 문서 업로드 UI 추가

## 3. 실시간 알림 (Supabase Realtime)
- [ ] `/src/lib/notifications.ts` - Realtime 구독 및 알림 관리 함수
- [ ] `/src/components/NotificationCenter.tsx` - 알림 센터 컴포넌트
- [ ] `/src/components/Header.tsx` - 알림 아이콘 및 드롭다운 추가
- [ ] `/src/lib/db-notifications.sql` - notifications 테이블 생성 SQL

## 4. 고급 필터링
- [ ] `/src/components/ShipFilters.tsx` - 선박 필터 컴포넌트
- [ ] `/src/components/CrewFilters.tsx` - 선원 필터 컴포넌트
- [ ] `/src/pages/ShipManagementPage.tsx` - 필터 UI 및 로직 통합
- [ ] `/src/pages/CrewManagementPage.tsx` - 필터 UI 및 로직 통합
- [ ] `/src/lib/store.ts` - 필터링 쿼리 함수 추가

## 파일 관계도
```
auth.ts (해싱 유틸) → store.ts (로그인/회원가입)
storage.ts (파일 관리) → FileUpload.tsx → CrewManagementPage.tsx, ShipManagementPage.tsx
notifications.ts (Realtime) → NotificationCenter.tsx → Header.tsx
ShipFilters.tsx, CrewFilters.tsx → ShipManagementPage.tsx, CrewManagementPage.tsx
```

## 구현 순서
1. 비밀번호 해싱 (보안 기반)
2. 파일 업로드 (데이터 확장)
3. 실시간 알림 (사용자 경험)
4. 고급 필터링 (검색 최적화)