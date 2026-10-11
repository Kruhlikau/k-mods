# shoot: size=1300x1000 type=png crop=0,364,1300,804 pad=14 plugins="skins gfm-render"
# gfm-render가 그리는 세 가지를 한 화면에: 경고 상자(> [!WARNING]), 할 일 목록(☐), mermaid 흐름도(상자 그림). skins를 먼저 불러 제목·표·코드 카드는 skins가 맡는다.
Type "src/routes/orders.ts를 읽고 답해줘. 1) 주문 흐름을 ```mermaid flowchart LR 코드블록으로 (노드 4~5개, 라벨은 짧은 영어로) 2) 개선할 점 3개를 '- [ ]' 할 일 목록으로 3) 가장 위험한 문제 하나만 '> [!WARNING]' 경고로. 이 순서대로, 설명은 짧게"
Enter
Wait+Screen@150s /◆ .+ in \d/
Sleep 4s
Screenshot "/tmp/k-demo/shots/gfm-render.png"
Sleep 1s
