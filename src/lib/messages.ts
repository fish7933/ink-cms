// Dynamic message strings, now i18n-aware: each function body calls i18n.t('key', params)
// with the original Korean template (​${var}​ → {{var}}) as the key. No React hook is used
// here since this isn't a component — i18n.t() is called directly, scoped to the 'messages'
// namespace registered below.

import i18n from '@/i18n';
import en from '@/i18n/locales/lib/messages/en.json';

i18n.addResourceBundle('en', 'messages', en, true, true);

export const msg = {
  crew: {
    selectedCount: (count: number) => i18n.t(' · {{count}}명 선택됨', { count, ns: 'messages' }),
  },

  ship: {
    selectedCount: (count: number) => i18n.t(' · {{count}}척 선택됨', { count, ns: 'messages' }),
    pageInfo: (current: number, total: number) => i18n.t('(페이지 {{current}}/{{total}})', { current, total, ns: 'messages' }),
    deleteConfirm: (count: number, names: string) =>
      i18n.t('선택한 {{count}}척의 선박을 삭제하시겠습니까?\n\n{{names}}', { count, names, ns: 'messages' }),
    ownerMismatch: (shipOwnerName: string, fleetOwnerName: string) =>
      i18n.t(
        '경고: 선박 소유주 "{{shipOwnerName}}"와 플릿 소유주 "{{fleetOwnerName}}"가 일치하지 않습니다. ' +
        '데이터 불일치를 방지하기 위해 플릿을 제거하거나 같은 소유주의 플릿을 선택해주세요.',
        { shipOwnerName, fleetOwnerName, ns: 'messages' },
      ),
    supervisedPostings: (count: number) => i18n.t('담당 선박 {{count}}척의 구인 공고를 관리하세요', { count, ns: 'messages' }),
  },

  approval: {
    lineChanged: (isEdit: boolean) =>
      isEdit
        ? i18n.t('결재 라인이 수정되었습니다.', { ns: 'messages' })
        : i18n.t('결재 라인이 생성되었습니다.', { ns: 'messages' }),
    lineToggled: (willActivate: boolean) =>
      willActivate
        ? i18n.t('결재 라인이 활성화되었습니다.', { ns: 'messages' })
        : i18n.t('결재 라인이 비활성화되었습니다.', { ns: 'messages' }),
    usageDetail: (total: number, inProgress: number, completed: number) => {
      let s = i18n.t('이 결재 라인은 총 {{total}}건의 결재에서 사용되고 있습니다.\n', { total, ns: 'messages' });
      if (inProgress > 0) s += i18n.t('• 진행 중인 결재: {{inProgress}}건\n', { inProgress, ns: 'messages' });
      if (completed > 0) s += i18n.t('• 완료된 결재: {{completed}}건\n', { completed, ns: 'messages' });
      s += i18n.t('\n결재 라인을 삭제하려면 먼저 관련된 모든 결재 건을 삭제해주세요.', { ns: 'messages' });
      return s;
    },
    inProgressBlock: (count: number) =>
      i18n.t('이 결재 라인은 현재 {{count}}건의 진행 중인 결재에서 사용 중입니다. 진행 중인 결재가 완료될 때까지 수정할 수 없습니다.', { count, ns: 'messages' }),
    completedWarning: (count: number) =>
      i18n.t('이 결재 라인은 {{count}}건의 완료된 결재에서 사용되었습니다. 수정 시 기존 결재 이력에는 영향을 주지 않습니다.', { count, ns: 'messages' }),
    dbError: (errorMessage: string) =>
      i18n.t('데이터베이스 조회 중 오류가 발생했습니다: {{errorMessage}}', { errorMessage, ns: 'messages' }),
  },

  jobPosting: {
    duplicateWarning: (details: string) =>
      i18n.t('중복 가능성이 있는 공고가 발견되었습니다:\n\n{{details}}\n\n그래도 등록하시겠습니까?', { details, ns: 'messages' }),
    saveFailed: (errorMessage: string) => i18n.t('저장에 실패했습니다: {{errorMessage}}', { errorMessage, ns: 'messages' }),
    overlapDetail: (
      shipName: string, currentRanks: string, currentDate: string,
      nextRanks: string, nextDate: string, overlappingRanks: string, daysDiff: number,
    ) =>
      i18n.t(
        '{{shipName}} - [{{currentRanks}}]: {{currentDate}}과 [{{nextRanks}}]: {{nextDate}} 공고에서 [{{overlappingRanks}}] 직급이 중복됩니다 ({{daysDiff}}일 차이).',
        { shipName, currentRanks, currentDate, nextRanks, nextDate, overlappingRanks, daysDiff, ns: 'messages' },
      ),
    multipleAgencies: (firstName: string, rest: number) => i18n.t('{{firstName}} 외 {{rest}}개사', { firstName, rest, ns: 'messages' }),
    totalRecommendable: (count: number) => i18n.t('총 {{count}}개의 채용 공고 (선원 추천 가능)', { count, ns: 'messages' }),
    total: (count: number) => i18n.t('총 {{count}}개의 구인 공고', { count, ns: 'messages' }),
  },

  file: {
    uploadFailed: (fileName: string) => i18n.t('파일 업로드 실패: {{fileName}}', { fileName, ns: 'messages' }),
  },

  salaryTemplate: {
    shipAutoRelease: (count: number, names: string) =>
      i18n.t('선박 할당 {{count}}건 자동 해제: {{names}}', { count, names, ns: 'messages' }),
    fleetAutoRelease: (count: number, names: string) =>
      i18n.t('플릿 할당 {{count}}건 자동 해제: {{names}}', { count, names, ns: 'messages' }),
    assignedToOwnerFleet: (ownerName: string, fleetName: string, shipCount: number) =>
      i18n.t('"{{ownerName}}" 선주의 "{{fleetName}}" 플릿에 할당됩니다. (소속 선박 {{shipCount}}척 모두 해당)', { ownerName, fleetName, shipCount, ns: 'messages' }),
    assignedToOwner: (ownerName: string, fleetCount: number, shipCount: number) =>
      i18n.t('"{{ownerName}}" 선주에 할당됩니다. ({{fleetCount}}개 플릿, {{shipCount}}척 모든 선박 해당)', { ownerName, fleetCount, shipCount, ns: 'messages' }),
    duplicateTemplate: (existingName: string) =>
      i18n.t('이미 "{{existingName}}" 템플릿이 할당되어 있습니다. 기존 할당을 해제한 후 다시 시도해주세요.', { existingName, ns: 'messages' }),
    assignSuccess: (levelText: string) =>
      i18n.t('템플릿이 {{levelText}}에 성공적으로 할당되었습니다.', { levelText, ns: 'messages' }),
    ownerAssignConfirm: (
      ownerName: string, templateName: string,
      conflictFleetNames: string[], conflictShipNames: string[],
    ) => {
      let s = i18n.t('"{{ownerName}}" 선주에 "{{templateName}}" 템플릿을 할당하시겠습니까?\n\n', { ownerName, templateName, ns: 'messages' });
      if (conflictFleetNames.length > 0)
        s += i18n.t('이미 템플릿이 할당된 플릿:\n{{list}}\n\n', { list: conflictFleetNames.map(n => `  - ${n}`).join('\n'), ns: 'messages' });
      if (conflictShipNames.length > 0)
        s += i18n.t('이미 템플릿이 할당된 선박:\n{{list}}\n\n', { list: conflictShipNames.map(n => `  - ${n}`).join('\n'), ns: 'messages' });
      s += conflictFleetNames.length > 0 || conflictShipNames.length > 0
        ? i18n.t('[확인] 기존 플릿/선박 할당을 모두 삭제하고 선주 레벨로 통일합니다.\n[취소] 진행하지 않습니다.', { ns: 'messages' })
        : i18n.t('[확인] 할당을 진행합니다.\n[취소] 진행하지 않습니다.', { ns: 'messages' });
      return s;
    },
    fleetAssignConfirm: (fleetName: string, templateName: string, conflictShipNames: string[]) => {
      let s = i18n.t('"{{fleetName}}" 플릿에 "{{templateName}}" 템플릿을 할당하시겠습니까?\n\n', { fleetName, templateName, ns: 'messages' });
      if (conflictShipNames.length > 0) {
        s += i18n.t('이미 템플릿이 할당된 선박:\n{{list}}\n\n', { list: conflictShipNames.map(n => `  - ${n}`).join('\n'), ns: 'messages' });
        s += i18n.t('[확인] 기존 선박 할당을 모두 삭제하고 플릿 레벨로 통일합니다.\n[취소] 진행하지 않습니다.', { ns: 'messages' });
      } else {
        s += i18n.t('[확인] 할당을 진행합니다.\n[취소] 진행하지 않습니다.', { ns: 'messages' });
      }
      return s;
    },
    shipAssignConfirm: (shipName: string, templateName: string) =>
      i18n.t('"{{shipName}}" 선박에 "{{templateName}}" 템플릿을 할당하시겠습니까?\n\n[확인] 할당을 진행합니다.\n[취소] 진행하지 않습니다.', { shipName, templateName, ns: 'messages' }),
  },
};
