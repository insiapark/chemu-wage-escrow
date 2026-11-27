# 다헌님 컨트랙트 인수

`contracts/`의 두 Solidity 파일은 2026-11-27 전달받은 원본입니다. 프론트엔드가 사용하는 ABI와 배포 정보는 `frontend/src/contracts/`에 복사했습니다. 기존 테스트넷 배포를 사용하므로 앱 연동을 위해 새로 배포하지 않습니다.

- Sepolia chain ID: `11155111`
- MockKRWt: `0xBdA115167ff594E6Fdc87e24AE6B995EDeD131c9`, decimals `0`
- DailyWageEscrow: `0x2342ef5F31BDa58Eb84F7f422Fd1ad7005fF4C19`
- OpenZeppelin dependency in handoff lockfile: `5.6.1`

새 배포가 필요하면 전달받은 전체 Hardhat 프로젝트를 사용하고 새 주소·ABI를 앱에 함께 반영합니다. 이 디렉토리에는 개인키나 `.env`를 복사하지 않았습니다. 자동 지급은 Windows에서도 실행할 수 있는 `frontend/scripts/watch-payday.ts`로 연결했습니다. 기본 읽기 전용이며 거래 전송에는 `--send`가 필요합니다.
