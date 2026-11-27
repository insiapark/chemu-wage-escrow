# 화면 점검 도구

와이어프레임(`docs/wireframe/worker.html`, `owner.html`)을 크롬 헤드리스로 열어 화면 목록의 항목마다 찍고, 재고, 문구를 뽑습니다. Node.js와 크롬이 필요하고, 크롬 경로는 Windows 기본 설치 위치(`C:/Program Files/Google/Chrome/Application/chrome.exe`)로 적혀 있습니다. 경로는 모두 절대 경로로 넘깁니다.

| 도구 | 하는 일 | 예 |
|---|---|---|
| `cap.mjs` | 화면 목록 순서대로 캡처(창 440x900, 2배) | `node cap.mjs <html> <출력 폴더> <화면 수>` |
| `audit.mjs` | 화면마다 13px 미만 글자, 명암비 미달, 44px 미만 터치 대상, 채운 주 버튼 수, 모서리 값 종류를 잼. 휴대폰을 1:1로 재려면 창 크기 `480x1200` | `node audit.mjs <html> <결과 json> <화면 수> 480x1200` |
| `textdump.mjs` | 화면마다 보이는 문구를 뽑음. 버튼, 제목, 시트, 대화창 표시를 붙임 | `node textdump.mjs <html> <결과 json> <화면 수>` |
| `lint.mjs` | 뽑은 문구를 문구 원칙으로 검사(금지어, 대시, 격식체, 버튼 문법, 데이터에 없는 금액) | `node lint.mjs <textdump 결과 json> [owner]` |
| `panelx.mjs` | 화면 목록의 묶음, 이름, 기획 주석을 JSON으로 뽑음 | `node panelx.mjs <html> <결과 json>` |
| `xlink.mjs` | 두 앱의 주석에 적힌 상대 앱 화면 이름을 찾아 화면 목록 패널에 바로가기 링크를 붙임 | `node xlink.mjs <worker html> <owner html> <worker 목록 json> <owner 목록 json> <보고서 md>` |
| `shot.mjs` | 주소 하나를 원하는 창 크기로 한 장 찍음 | `node shot.mjs 1280x900 1 <출력 png> <html 또는 주소>` |

v10의 측정 결과와 기준은 `docs/design/` 아래 문서에 있습니다.
