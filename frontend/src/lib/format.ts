// Screen number formats shared by the mock app and domain messages (화면기획서 2절 숫자 표기).
export const won = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;

/** "2026-11-29" → "11월 29일" */
export function monthDay(isoDate: string) {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${month}월 ${day}일`;
}

/** "11월 29일 일요일" in Asia/Seoul, regardless of the presenter PC's time zone. */
export function monthDayWeekday(isoDate: string) {
  const weekday = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", weekday: "long" }).format(new Date(`${isoDate}T12:00:00+09:00`));
  return `${monthDay(isoDate)} ${weekday}`;
}
