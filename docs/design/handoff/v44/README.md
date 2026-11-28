# 체무 화면 흐름도 (v44)

두 앱의 화면 사이 이동(버튼, 행, 탭)과 두 앱이 이어지는 곳을 모은 흐름도입니다. 스크립트가 화면마다 누를 수 있는 것을 하나씩 눌러 어디로 가는지 적기 때문에, 화면이 바뀌면 같은 명령을 다시 돌려 새로 뽑습니다.

## 파일

| 파일 | 내용 |
|---|---|
| `흐름도.md` | 수, 시연 12단계 경로, 앱마다 Mermaid 그래프, 두 앱이 이어지는 곳, 들어오는 길이 없는 화면, 나가는 길이 없는 화면, PANEL에 없는 상태로 가는 이동, 앱마다 흐름 표 |
| `흐름도.json` | 같은 내용의 원자료(화면, 간선, 두 앱 연결, 시연 경로). 회차끼리 비교할 때 씁니다 |
| `흐름도_알바생.svg`, `흐름도_사장님.svg` | 탭 묶음마다 칸을 나눈 그림. 칸 안의 세로줄은 탭 첫 화면에서 몇 번 눌러 오는지입니다 |
| `흐름도_두앱.svg` | 왼쪽 알바생 앱, 오른쪽 사장님 앱, 그 사이의 연결만 그린 그림 |
| `../_gen/flow.mjs` | 흐름도를 만드는 스크립트. 앱을 여는 실행부는 `../../v41/_gen/applib.mjs`를 같이 씁니다 |

그림에서 점선 테두리는 들어오는 길이 없는 화면, 붉은 테두리는 나가는 길이 없는 화면입니다. 선에 마우스를 올리면 누른 것의 이름이 보입니다.

## 다시 뽑기

필요한 것: Node 24, 크롬(`C:/Program Files/Google/Chrome/Application/chrome.exe`, 다른 곳이면 환경 변수 `CHROME`). 따로 설치할 꾸러미는 없습니다.

```
node flow.mjs <알바생 앱 html> <사장님 앱 html> <결과 폴더> [시연 html]
```

v44 흐름도를 뽑은 명령:

```
node "C:/Users/User/Desktop/insia workspace/docs/chemu/v44/_gen/flow.mjs" "C:/Users/User/Desktop/insia workspace/docs/chemu/v40/worker_v40.html" "C:/Users/User/Desktop/insia workspace/docs/chemu/v40/owner_v40.html" "C:/Users/User/Desktop/insia workspace/docs/chemu/v44/handoff"
```

v75에서 v74 앱으로 다시 뽑는 명령(v41 문구 키 표와 같은 결과 폴더에 둡니다):

```
node "C:/Users/User/Desktop/insia workspace/docs/chemu/v44/_gen/flow.mjs" "C:/Users/User/Desktop/insia workspace/docs/chemu/v74/worker_v74.html" "C:/Users/User/Desktop/insia workspace/docs/chemu/v74/owner_v74.html" "C:/Users/User/Desktop/insia workspace/docs/chemu/v75/handoff"
```

- 시연 html을 주지 않으면 앱 폴더 두 단계 위에서 `vNN/demo_vNN.html` 가운데 번호가 가장 큰 것의 `STEPS`를 읽습니다. v77에서 시연 모드가 바뀌기 전이라면 v75 때도 v40 시연 단계를 읽으므로, 화면 번호가 바뀌었으면 시연 html을 넷째 인자로 줍니다.
- 쓴 앱보다 번호가 큰 앱 파일이 있으면 md 맨 위에 그 사실이 한 줄 붙습니다.
- 두 앱을 합쳐 10분 안팎 걸립니다. 같은 앱 파일로 v41 `keys.mjs`를 먼저 돌렸으면 저장된 결과를 읽어 1분 안에 끝납니다. 임시 폴더 `CHEMU_GEN_TMP`, 새로 읽기 `CHEMU_GEN_NOCACHE=1`, 탭 수 `CHEMU_GEN_JOBS`는 v41 README와 같습니다.
- 마지막 줄 요약은 영어 한 줄입니다. 예: `worker v40 edges 279 noin 33 noout 7 | owner v40 edges 132 noin 25 noout 18 | xlink 171`.

## 이동을 찾는 방식

1. 화면마다 사본`?i=N`을 열고, 맨 위 층(확인 창, 시트, 전체 화면, 지금 화면과 탭 막대)에서 누를 수 있는 것을 모두 셉니다.
2. 누를 것마다 화면을 새로 열어 그것 하나만 누르고, 1.5초 뒤와 3.2초 뒤 `currentKey()`를 읽습니다. 3.2초 뒤 값이 다르면(퇴근 뒤 사장님 확정처럼 기다리면 바뀌는 것) 종류 "자동" 간선을 하나 더 둡니다.
3. 도착한 키를 PANEL 키에 맞춥니다. 키가 같지 않으면 다른 탭에서 연 같은 화면, 다른 사람의 같은 화면, 기록 번호만 다른 화면, 화면 이름과 제목 틀이 같은 화면 순으로 맞추고 흐름 표 비고에 적습니다. 끝내 맞지 않는 도착은 "PANEL에 없는 상태로 가는 이동"에 키와 제목을 남깁니다.
4. 두 앱 연결은 기획 주석의 상대 앱 줄을 `v16/_tools/xlink.mjs`와 같은 규칙으로 상대 앱 화면 이름에 맞춥니다. 앱 html 안의 xlink 표(화면 목록 "상대 앱에서 이어지는 화면")와 다른 곳은 두 앱 연결 표의 "앱 화면 목록 링크" 칸에 보입니다.

## 점검 회차에서 쓰는 곳

- 들어오는 길이 없는 화면: 로딩, 끊김, 실패처럼 앱 밖 상태로만 열리는 화면이 대부분입니다. 표의 "기획 주석의 들어옴"과 비교해, 누르는 길이 있어야 하는데 없는 화면을 고릅니다.
- 나가는 길이 없는 화면: "뒤로·닫기만 있음"이 예면 돌아가는 길은 있습니다. "기획 주석의 나감"에 적힌 길이 화면에 없는지 봅니다.
- PANEL에 없는 상태로 가는 이동: 누르면 열리지만 화면 목록에 없는 상태입니다. 화면 목록에 더할지 정할 때 씁니다.
