# 목백엔드 범위

이번 발표용 구현은 별도 서버 없이 `frontend/src/lib/gateway.ts`의 `EscrowGateway`와 `MockEscrowGateway`를 사용합니다. 계약, 출퇴근, 두 사람의 서명, 보관 잔액, 지급 상태, 기록 해시를 비동기로 처리하고 `frontend/src/lib/store.ts`에서 브라우저에 저장합니다.

이 경계는 나중에 서버 API로 바꿀 수 있도록 분리했습니다. `/sepolia`에서는 금액·nonce·보관·지급을 실제 체인에서 조회하고 `SepoliaEscrowGateway`로 거래합니다. 실제 모드도 계약 원본과 서명 준비는 브라우저 로컬에 저장합니다. 사용자 인증이나 기기 간 동기화, 실제 원화 계좌 입금은 없습니다. 자동 지급 실행기는 `frontend/scripts/watch-payday.ts`이며 실행법과 연동 범위는 `frontend/README.md`를 확인합니다.
