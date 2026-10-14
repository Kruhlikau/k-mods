# subagent-tuner

> 서브에이전트가 시작될 때 쓸 모델과 추론 강도를 직접 고르거나, 작업 종류별 추천과 저장한 기본값으로 정해요.

| | |
| --- | --- |
| 설치 이름 | `subagent-tuner` |
| 종류 | 원본 (검토한 커밋 고정) |
| 만든 사람 | [Aleh Kruhlikau](https://github.com/Kruhlikau) |
| 라이선스 | MIT |
| 원본 | [Kruhlikau/subagent-tuner @ `823747d`](https://github.com/Kruhlikau/subagent-tuner/tree/823747db2ab95027b986ba5cb28046ddf8063f7e) |
| 유형 | 🧰 도구 |
| 보이는 곳 | 터미널 |
| 명령어 | 없음 (설치하면 알아서 동작해요) |
| 권한 | ⚙️ 프로그램 실행 · ✏️ 파일 쓰기 · 🛡️ 도구 호출 제어 |

## 설치

Claude Code 안에서:

```
/plugin marketplace add SeongGwangJu/k-mods
/plugin install subagent-tuner@k-mods
```

터미널에서:

```sh
claude plugin marketplace add SeongGwangJu/k-mods
claude plugin install subagent-tuner@k-mods
```

이미 열려 있는 세션에는 `/reload-plugins`로 바로 적용돼요. Claude Code 2.1.287 이상이 필요해요.

## 알아 둘 점

- `claude -p`와 SDK 실행, 포크는 건드리지 않아요.
- 입력창 위 띠에서 Manual(묻기)과 Auto(저장한 기본값 우선)를 바꿔요. 터미널이 144칸 이상이면 옆 패널로, 좁으면 대화상자로 물어봐요.

## 이 mod가 내 컴퓨터에서 하는 일

- ⚙️ **프로그램 실행**.
- ✏️ **파일 쓰기**.
- 🛡️ **도구 호출 제어**.

<details><summary>정적 분석 결과 (<code>claude plugin validate</code>)</summary>

- 검사한 Claude Code: 2.1.296
- 결과: 통과
- 다루는 이벤트: `session.start`, `tool.call{tool=Agent}`, `ui.close`, `ui.render{component=AbovePrompt}`, `ui.render{component=Pane}`
- 부르는 API: `$.clock.now`, `$.clock.sleep`, `$.fs.write`, `$.process.run`, `$.session.surfaces`, `$.state.get`, `$.state.set`, `$.store.get`, `$.store.set`, `$.ui.ask`, `$.ui.close`, `$.ui.open`, `$.ui.panes`, `$.ui.resolve`, `$.ui.toast`

</details>

## 검토 기록

- 2026-10-13 · Kruhlikau · Claude Code 2.1.296 · 정적 검사, 코드 읽기, 테스트
- 이 항목은 위 커밋에 고정돼 있어요. 원본이 바뀌면 다시 검토한 뒤에 올려요.

<details><summary>검토 노트 5개 (코드를 읽으며 확인한 것)</summary>

- validate --strict 통과, 테스트 196개 통과(claude plugin test). 만든 사람이 직접 검토했어요.
- 네트워크 호출과 모델 호출은 없어요.
- 외부 프로그램은 대기용 sh(macOS·Linux) 또는 powershell.exe(Windows)만 실행해요. 패널 대기와, 플러그인 폴더의 .waits/ 쓰기 확인 파일 삭제에만 써요.
- 파일 쓰기는 플러그인 폴더의 .waits/ 아래 빈 신호 파일과 확인용 .probe 파일뿐이고, 설정(모드·기본값)은 Claude Code의 플러그인 저장소에 저장해요.
- tool.call{tool=Agent}를 가로채 model과 effort 필드만 바꾸고, 사용자가 취소하면 호출을 거절해요(deny). 대화 내용은 어디로도 보내지 않아요.

</details>

## 더 보기

- [원본 저장소](https://github.com/Kruhlikau/subagent-tuner/tree/823747db2ab95027b986ba5cb28046ddf8063f7e)
- [카탈로그로 돌아가기](../../README.md#mod-목록)
