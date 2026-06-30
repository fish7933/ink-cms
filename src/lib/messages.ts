// Dynamic message strings — currently Korean only.
// When adding i18n: replace each function body with t('key', params).

export const msg = {
  crew: {
    selectedCount: (count: number) => ` · ${count}명 선택됨`,
  },

  ship: {
    selectedCount: (count: number) => ` · ${count}척 선택됨`,
    pageInfo: (current: number, total: number) => `(페이지 ${current}/${total})`,
    deleteConfirm: (count: number, names: string) =>
      `선택한 ${count}척의 선박을 삭제하시겠습니까?\n\n${names}`,
    ownerMismatch: (shipOwnerName: string, fleetOwnerName: string) =>
      `경고: 선박 소유주 "${shipOwnerName}"와 플릿 소유주 "${fleetOwnerName}"가 일치하지 않습니다. ` +
      `데이터 불일치를 방지하기 위해 플릿을 제거하거나 같은 소유주의 플릿을 선택해주세요.`,
    supervisedPostings: (count: number) => `담당 선박 ${count}척의 구인 공고를 관리하세요`,
  },

  approval: {
    lineChanged: (isEdit: boolean) => `결재 라인이 ${isEdit ? '수정' : '생성'}되었습니다.`,
    lineToggled: (willActivate: boolean) =>
      `결재 라인이 ${willActivate ? '활성화' : '비활성화'}되었습니다.`,
    usageDetail: (total: number, inProgress: number, completed: number) => {
      let s = `이 결재 라인은 총 ${total}건의 결재에서 사용되고 있습니다.\n`;
      if (inProgress > 0) s += `• 진행 중인 결재: ${inProgress}건\n`;
      if (completed > 0) s += `• 완료된 결재: ${completed}건\n`;
      s += '\n결재 라인을 삭제하려면 먼저 관련된 모든 결재 건을 삭제해주세요.';
      return s;
    },
    inProgressBlock: (count: number) =>
      `이 결재 라인은 현재 ${count}건의 진행 중인 결재에서 사용 중입니다. 진행 중인 결재가 완료될 때까지 수정할 수 없습니다.`,
    completedWarning: (count: number) =>
      `이 결재 라인은 ${count}건의 완료된 결재에서 사용되었습니다. 수정 시 기존 결재 이력에는 영향을 주지 않습니다.`,
    dbError: (errorMessage: string) =>
      `데이터베이스 조회 중 오류가 발생했습니다: ${errorMessage}`,
  },

  jobPosting: {
    duplicateWarning: (details: string) =>
      `중복 가능성이 있는 공고가 발견되었습니다:\n\n${details}\n\n그래도 등록하시겠습니까?`,
    saveFailed: (errorMessage: string) => `저장에 실패했습니다: ${errorMessage}`,
    overlapDetail: (
      shipName: string, currentRanks: string, currentDate: string,
      nextRanks: string, nextDate: string, overlappingRanks: string, daysDiff: number,
    ) =>
      `${shipName} - [${currentRanks}]: ${currentDate}과 [${nextRanks}]: ${nextDate} 공고에서 [${overlappingRanks}] 직급이 중복됩니다 (${daysDiff}일 차이).`,
    multipleAgencies: (firstName: string, rest: number) => `${firstName} 외 ${rest}개사`,
    totalRecommendable: (count: number) => `총 ${count}개의 채용 공고 (선원 추천 가능)`,
    total: (count: number) => `총 ${count}개의 구인 공고`,
  },

  file: {
    uploadFailed: (fileName: string) => `파일 업로드 실패: ${fileName}`,
  },

  salaryTemplate: {
    shipAutoRelease: (count: number, names: string) =>
      `선박 할당 ${count}건 자동 해제: ${names}`,
    fleetAutoRelease: (count: number, names: string) =>
      `플릿 할당 ${count}건 자동 해제: ${names}`,
    assignedToOwnerFleet: (ownerName: string, fleetName: string, shipCount: number) =>
      `"${ownerName}" 선주의 "${fleetName}" 플릿에 할당됩니다. (소속 선박 ${shipCount}척 모두 해당)`,
    assignedToOwner: (ownerName: string, fleetCount: number, shipCount: number) =>
      `"${ownerName}" 선주에 할당됩니다. (${fleetCount}개 플릿, ${shipCount}척 모든 선박 해당)`,
    duplicateTemplate: (existingName: string) =>
      `이미 "${existingName}" 템플릿이 할당되어 있습니다. 기존 할당을 해제한 후 다시 시도해주세요.`,
    assignSuccess: (levelText: string) =>
      `템플릿이 ${levelText}에 성공적으로 할당되었습니다.`,
    ownerAssignConfirm: (
      ownerName: string, templateName: string,
      conflictFleetNames: string[], conflictShipNames: string[],
    ) => {
      let s = `"${ownerName}" 선주에 "${templateName}" 템플릿을 할당하시겠습니까?\n\n`;
      if (conflictFleetNames.length > 0)
        s += `이미 템플릿이 할당된 플릿:\n${conflictFleetNames.map(n => `  - ${n}`).join('\n')}\n\n`;
      if (conflictShipNames.length > 0)
        s += `이미 템플릿이 할당된 선박:\n${conflictShipNames.map(n => `  - ${n}`).join('\n')}\n\n`;
      s += conflictFleetNames.length > 0 || conflictShipNames.length > 0
        ? `[확인] 기존 플릿/선박 할당을 모두 삭제하고 선주 레벨로 통일합니다.\n[취소] 진행하지 않습니다.`
        : `[확인] 할당을 진행합니다.\n[취소] 진행하지 않습니다.`;
      return s;
    },
    fleetAssignConfirm: (fleetName: string, templateName: string, conflictShipNames: string[]) => {
      let s = `"${fleetName}" 플릿에 "${templateName}" 템플릿을 할당하시겠습니까?\n\n`;
      if (conflictShipNames.length > 0) {
        s += `이미 템플릿이 할당된 선박:\n${conflictShipNames.map(n => `  - ${n}`).join('\n')}\n\n`;
        s += `[확인] 기존 선박 할당을 모두 삭제하고 플릿 레벨로 통일합니다.\n[취소] 진행하지 않습니다.`;
      } else {
        s += `[확인] 할당을 진행합니다.\n[취소] 진행하지 않습니다.`;
      }
      return s;
    },
    shipAssignConfirm: (shipName: string, templateName: string) =>
      `"${shipName}" 선박에 "${templateName}" 템플릿을 할당하시겠습니까?\n\n[확인] 할당을 진행합니다.\n[취소] 진행하지 않습니다.`,
  },
};
