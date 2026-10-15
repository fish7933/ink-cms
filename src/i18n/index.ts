import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import common from './locales/common/en.json';

// 번역 전략: 한국어 원문 문자열 자체를 키로 쓴다(t('선원 목록')). i18next는 키를 못 찾으면
// 키 그대로 보여주므로 한국어용 리소스 파일은 따로 만들 필요가 없고, 영문 파일(en.json)에만
// "한글 원문 → English" 매핑을 채우면 된다 — 두 언어 파일이 서로 어긋나는 문제 자체가 없다.
//
// 페이지/공용 컴포넌트별로 번역 네임스페이스를 분리한다(src/i18n/locales/pages/<PageName>/en.json
// 등) — 각 페이지는 이미 route-config.ts에서 React.lazy()로 코드스플릿되어 있으므로, 그
// 파일 상단에서 자기 네임스페이스 json을 import해 addResourceBundle로 한 번만 등록하면
// 같은 청크에 묶여 번들이 커지지 않는다. common(사이드바/헤더/탭바/공용 버튼)만 여기서
// 앱 시작 시 미리 등록한다.
i18n.use(initReactI18next).init({
  lng: localStorage.getItem('lang') || 'ko',
  fallbackLng: 'ko',
  ns: ['common'],
  defaultNS: 'common',
  resources: {
    en: { common },
  },
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

export default i18n;
