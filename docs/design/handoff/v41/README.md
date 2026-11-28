# 체무 문구 키 표 (v41)

두 앱 화면에 나오는 문구마다 개발에서 쓸 키를 붙인 표입니다. 표는 스크립트가 앱 html을 열어 만들기 때문에, 앱 문구가 바뀌면 같은 명령을 다시 돌려 새로 뽑습니다.

## 파일

| 파일 | 내용 |
|---|---|
| `문구키_알바생.md`, `문구키_알바생.json` | 알바생 앱 문구 키 표와 같은 내용의 JSON |
| `문구키_사장님.md`, `문구키_사장님.json` | 사장님 앱 문구 키 표와 같은 내용의 JSON |
| `../_gen/keys.mjs` | 표를 만드는 스크립트 |
| `../_gen/applib.mjs` | 앱을 머리 없는 크롬으로 열어 문구와 누를 것을 읽는 실행부. v44 `flow.mjs`도 같이 씁니다 |

각 md 맨 위에 쓴 앱 파일과 버전, 키 규칙, 요소별 키 수가 있고, 맨 아래에 두 앱 대조(사건별, 사건 표 버튼 이름, 두 앱에 같은 틀로 나오는 문구)가 있습니다.

## 키 규칙 요약

`앱.화면키.요소.끝말`

- 앱: `worker`, `owner`
- 화면키: PANEL 키에서 `/`, `:`를 `_`로 바꾼 것(`haneul/home/contract/missing`은 `haneul_home_contract_missing`)
- 요소: `title`, `body`, `button`, `badge`, `toast`, `notice`, `a11y`
- 끝말: 사건 표 틀에 맞으면 사건 번호(`e04`), 아니면 `t`와 틀 해시 6자리. 틀은 시각, 날짜, 금액, 알바생 이름, 숫자를 비운 문구라서 데이터만 다른 문구, 두 앱에 함께 나오는 문구는 끝말이 같습니다.

예: `worker.haneul_work_day_h1114.title.e04`는 알바생 앱 18번 화면 제목 "사장님이 퇴근 시간을 오전 7:30으로 고쳤어요"(사건 E04)입니다.

## 다시 뽑기

필요한 것: Node 24, 크롬(`C:/Program Files/Google/Chrome/Application/chrome.exe`, 다른 곳이면 환경 변수 `CHROME`). 따로 설치할 꾸러미는 없습니다.

```
node keys.mjs <알바생 앱 html> <사장님 앱 html> <결과 폴더>
```

v41 표를 뽑은 명령:

```
node "C:/Users/User/Desktop/insia workspace/docs/chemu/v41/_gen/keys.mjs" "C:/Users/User/Desktop/insia workspace/docs/chemu/v40/worker_v40.html" "C:/Users/User/Desktop/insia workspace/docs/chemu/v40/owner_v40.html" "C:/Users/User/Desktop/insia workspace/docs/chemu/v41/handoff"
```

v75에서 v74 앱으로 다시 뽑는 명령(결과는 v75 폴더에 둡니다. v41 표는 그대로 남깁니다):

```
node "C:/Users/User/Desktop/insia workspace/docs/chemu/v41/_gen/keys.mjs" "C:/Users/User/Desktop/insia workspace/docs/chemu/v74/worker_v74.html" "C:/Users/User/Desktop/insia workspace/docs/chemu/v74/owner_v74.html" "C:/Users/User/Desktop/insia workspace/docs/chemu/v75/handoff"
```

- 사건 표는 앱 폴더 두 단계 위의 `v16/EVENTS.md`를 읽습니다. 다른 파일을 쓰려면 `CHEMU_EVENTS`에 경로를 줍니다.
- 쓴 앱보다 번호가 큰 `vNN/worker_vNN.html`, `vNN/owner_vNN.html`이 있으면 md 맨 위에 그 사실이 한 줄 붙고, 마지막 줄 요약에도 나옵니다.
- 화면마다 누를 수 있는 것을 하나씩 눌러 토스트를 모으기 때문에 두 앱을 합쳐 10분 안팎 걸립니다. 결과는 임시 폴더에 html 해시로 저장되어, 같은 파일로 v44 `flow.mjs`를 돌리면 다시 누르지 않고 바로 씁니다.
- 임시 폴더는 `CHEMU_GEN_TMP`(기본 OS 임시 폴더의 `chemu_gen`)입니다. 앱 폴더에는 아무 파일도 만들지 않습니다. 저장된 결과를 쓰지 않고 새로 읽으려면 `CHEMU_GEN_NOCACHE=1`, 크롬 탭 수는 `CHEMU_GEN_JOBS`(기본 6)입니다.
- 마지막 줄 요약은 영어 한 줄입니다. 예: `worker v40 keys 2080 | owner v40 keys 1258 | events both 16/19 | shared 113`.

## v41 표와 v75 표 비교

키가 틀에서 나오므로 두 JSON의 `rows[].key` 집합을 비교하면 새로 생긴 문구와 없어진 문구가 바로 나옵니다.

```
node -e "const a=require(process.argv[1]).rows.map(r=>r.key),b=new Set(require(process.argv[2]).rows.map(r=>r.key));console.log(a.filter(k=>!b.has(k)).join('\n'))" v41/handoff/문구키_알바생.json v75/handoff/문구키_알바생.json
```

위 명령은 v41에 있고 v75에 없는 키를 보여 줍니다. 두 경로를 바꾸면 v75에 새로 생긴 키가 나옵니다.

## 읽는 범위

- 화면마다 맨 위 층 하나만 읽습니다(확인 창, 시트, 전체 화면, 지금 화면과 탭 막대 순). 아래에 깔린 화면의 문구는 그 화면 번호에서 읽습니다.
- 화면 목록(발표용 패널)과 기획 주석은 앱 화면이 아니라서 읽지 않습니다.
- 토스트는 PANEL 화면에서 한 번 눌러 뜨는 것만 모입니다. 두 번 이상 눌러야 뜨는 토스트는 그 상태가 PANEL에 화면으로 있을 때만 들어갑니다.
