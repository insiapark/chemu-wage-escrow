const contractErrors: Record<string, string> = {
  InvalidNonce: "다른 근무가 먼저 확정돼 nonce가 바뀌었어요. 서명을 지우고 기록을 다시 준비해 주세요.",
  InvalidPayday: "급여 시각이 지났어요. 미래 시각으로 기록을 다시 준비해 주세요.",
  InvalidEmployerSignature: "사장님 서명이 이 기록과 맞지 않아요. 지갑과 서명할 내용을 다시 확인해 주세요.",
  InvalidEmployeeSignature: "알바생 서명이 이 기록과 맞지 않아요. 지갑과 서명할 내용을 다시 확인해 주세요.",
  InsufficientAvailableBalance: "채워 둔 돈이 모자라요. 사장님 보관함을 먼저 채워 주세요.",
  AlreadyLocked: "이미 보관한 기록이에요. 기록 ID로 체인 상태를 확인해 주세요.",
  WageNotFound: "체인에 보관된 기록이 없어요. 기록 ID를 확인해 주세요.",
  PaydayNotReached: "체인 시간이 아직 급여일에 도달하지 않았어요.",
  AlreadyReleased: "이미 지급된 기록이에요. 체인 상태를 다시 확인해 주세요.",
};
interface ErrorShape { message?: string; shortMessage?: string; data?: { errorName?: string }; cause?: unknown }
export function chainErrorMessage(error: unknown): string {
  let current = error;
  for (let depth = 0; current && depth < 12; depth++) {
    const value = current as ErrorShape;
    if (value.data?.errorName && contractErrors[value.data.errorName]) return contractErrors[value.data.errorName];
    current = value.cause;
  }
  const value = (error || {}) as ErrorShape;
  const message = value.shortMessage || value.message || "요청을 처리하지 못했어요.";
  if (/reject|denied/i.test(message)) return "지갑 요청을 닫았어요. 이미 전송된 거래는 내역에서 확인해 주세요.";
  if (/timed out|timeout/i.test(message)) return "거래 결과를 아직 확인하지 못했어요. 다시 전송하기 전에 미확인 거래를 조회해 주세요.";
  return message.slice(0, 500);
}
