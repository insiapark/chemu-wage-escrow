# 체무 Sepolia 시연 증빙 · 2026-11-28

최준우가 MetaMask에서 직접 수행한 수동 지급, CLI 지급, 급여일 자동 지급과 JSON 대조 결과를 모았습니다. 개발 도구는 공개 체인 조회와 이미 내보낸 파일 검증만 수행했습니다. 이 폴더에는 개인키·복구 문구·환경 파일이 없습니다. 서명은 이미 보관된 공개 시연 기록의 서명입니다.

## 발표에서 보여 줄 결과

**양측 서명으로 보관한 일당 92,880 KRWt가 실행기를 통해 정해진 시각 뒤 근로자 지갑으로 지급됐습니다.** 예정 시각은 2026-11-28 **02:30:00 KST**, 지급 거래의 블록 시각은 **02:30:12 KST**입니다. 1,176초 전부터 대기한 로그와 성공 거래를 함께 확인할 수 있습니다.

- 기록 ID: `0x7f4797e5719cee910cd022637023bdb003c75395110024114921af2e2827c815`
- 원본 SHA-256: `0x9f6a9f037c66db0143199072a0d486523e4bb63ef41a6d8aec3abd21b66c4cd2`
- [보관 거래](https://sepolia.etherscan.io/tx/0x52bc45f3590b832fc40f57ed04743ee7755e7e5e2816a368bcbaf2a7e274b7df)
- [자동 지급 거래](https://sepolia.etherscan.io/tx/0x7cac06425db3c2a1cba0f12ba02e5cc188179ac1c15a930ebcc779f65f2aae86)
- 체인: Sepolia `11155111`. [보관 컨트랙트](https://sepolia.etherscan.io/address/0x2342ef5F31BDa58Eb84F7f422Fd1ad7005fF4C19), [KRWt](https://sepolia.etherscan.io/address/0xBdA115167ff594E6Fdc87e24AE6B995EDeD131c9), 소수점 `0`.
- 고용주: `0xF247C360744D9e7c8b9E96717F705B1d4fe7e8a2`
- 근로자: `0x75Ab1fA1337dFaF22124Cd2e8b0c6027A4eD727A`

## 들어 있는 파일

| 파일 | 의미 |
|---|---|
| [chemu-sepolia-3.json](chemu-sepolia-3.json) | 자동 지급한 nonce 3의 원본·조건·record ID·양측 서명 |
| [chemu-sepolia-0.json](chemu-sepolia-0.json) | 앞서 수동 지급한 nonce 0의 별도 정상 기록 |
| [scheduled-release-countdown-log.txt](scheduled-release-countdown-log.txt) | 사용자가 제공한 실행기의 대기→pending→confirmed→released 로그 |
| [chain-payment-snapshot.json](chain-payment-snapshot.json) | 기존 읽기 전용 RPC 감사 결과. 조회 시점·블록과 4건의 보관/지급 상태 |
| [smart-account-snapshot.json](smart-account-snapshot.json) | 고용주 위임 계정이 기존 공개 서명에 ERC-1271 성공값을 반환한 조회 결과 |
| [browser-capture.json](browser-capture.json) | 새 브라우저에서 실제 RPC로 기록·JSON을 조회한 캡처 범위와 오류 여부 |
| [checks](checks/) | 이번 공유 준비에서 다시 실행한 단위·브라우저·타입·빌드·파일 검증 로그 |
| [manifest.json](manifest.json) | 이 묶음 파일들의 크기와 SHA-256. manifest 자체는 목록에서 제외 |

원본 파일 두 개는 같지 않습니다. nonce 0과 3, 지급 시각, 원본 해시, record ID와 서명이 다릅니다. **각 파일을 자기 record ID의 체인 기록과 대조하므로 둘 다 통과하는 것이 정상입니다.** 최신 파일인지 확인하려면 파일명만 보지 말고 `record.nonce`, `recordId`, `original.payday`를 확인합니다.

원본의 출퇴근은 11월 29~30일 고정 시연 데이터이며, 테스트에서는 지급 시각을 앞당겼습니다. 실제 근무가 해당 시점에 이루어졌음을 증명하는 자료가 아닙니다. 기록이 고정되고 서명·보관·지급되는 기술 흐름의 증빙입니다.

## 화면 증빙

다음 네 장은 지갑을 연결하지 않은 새 Edge에서 **실제 Sepolia RPC로 과거 기록을 조회**해 캡처한 것입니다. 새로운 서명·보관·지급 장면을 재연한 화면은 아닙니다.

- [자동 지급 완료 조회](screenshots/scheduled-payment-live.png)
- [nonce 0 JSON 대조](screenshots/json-0-verified-live.png)
- [nonce 3 JSON 대조](screenshots/json-3-verified-live.png)
- [nonce 3 모바일 대조](screenshots/json-3-verified-mobile-live.png)

아래 두 장은 별도 **목데이터 모드**의 브라우저 테스트 캡처입니다. 실제 체인 잔액 증빙으로 사용하지 않습니다.

- [목데이터 데스크톱 홈](screenshots/mock-home-desktop.png)
- [목데이터 모바일 홈](screenshots/mock-home-mobile.png)

동영상은 새로 녹화하지 않았습니다. 실제 자동 실행 과정은 사용자가 제공한 로그와 체인 거래로 남겼습니다.

## 팀원이 재검증하는 방법

저장소 `frontend`에서 설치 후 실행합니다. 두 명령 모두 키나 연결된 지갑이 필요 없습니다.

```powershell
npm.cmd run evidence:verify
npm.cmd run evidence:verify -- --live
```

첫 명령은 오프라인에서 원본 SHA-256, WorkRecord와 EIP-712 record ID, 두 서명을 재계산합니다. 두 번째는 파일 자체 검증에 더해 현재 공개 RPC로 배포 정보·보관 조건·WageLocked 이벤트·보관 거래 성공·지급 여부를 확인합니다. 다른 파일을 확인하려면 경로를 추가합니다. `NEXT_PUBLIC_SEPOLIA_RPC_URL`을 바꾸려면 실행 프로세스에 설정합니다. CLI는 Next.js의 `.env.local`을 자동 로드하지 않습니다.

브라우저로 보려면 `npm.cmd run dev` 후 `/sepolia`에서 기록 ID를 입력해 조회하고, 파일 선택에서 이 폴더의 JSON을 불러와 **파일과 체인 대조하기**를 누릅니다. 파일 선택을 바꿀 때는 읽기가 끝난 뒤 검증합니다. 파일의 성공 결과에 연결된 보관 거래가 위 링크와 같은지도 확인합니다.

## 검증 결과와 한계

| 항목 | 이번 공유 준비 결과 |
|---|---|
| 단위 테스트 | 29개 통과 |
| 브라우저 테스트 | 9개 통과: 목모드 5개 + Sepolia 경로 4개 |
| TypeScript | 통과 |
| 프로덕션 빌드 | 통과 |
| JSON 오프라인 검증 | nonce 0, 3 통과 |
| JSON 실제 체인 조회 | 두 기록의 보관 이벤트 일치, 보관 거래 성공, 지급 완료 |

브라우저 자동 테스트의 거래 경로는 테스트 RPC와 공개 연습 계정을 사용합니다. 실제 테스트넷 자동 지급은 사용자 실행 로그와 별도 실제 체인 조회로 확인했습니다. 체인 스냅샷의 잔액은 그 조회 시점의 값이며 현재 잔액을 보장하지 않습니다. `independentlyVerified=false`인 nonce 1 기록은 지급을 아직 하지 않은 과거 테스트로, 다른 지급의 실패를 뜻하지 않습니다.

원화 계좌 입금·상시 운영 자동화·기기 간 서명 공유는 이 증빙의 범위에 포함하지 않습니다. 자동 지급 실행기의 별도 프로세스가 필요하며 정각 확정을 보장하지 않습니다.

## 1분 설명 순서

1. 0~10초: 한 근무 기록에 고용주와 근로자가 같은 조건으로 서명한다고 설명합니다.
2. 10~25초: nonce 3 JSON의 record ID와 보관 거래를 보여 줍니다.
3. 25~40초: 로그의 남은 시간과 마지막 pending→confirmed→released, 지급 거래의 02:30:12 KST를 보여 줍니다.
4. 40~55초: JSON 대조 화면과 보관 거래 링크를 보여 줍니다. nonce 0도 별도의 정상 기록임을 설명합니다.
5. 55~60초: 이번 범위는 테스트넷 토큰·준비된 근무 원본·별도 실행기이며, 실제 은행 지급과 공유 API는 후속 개발이라고 설명합니다.
