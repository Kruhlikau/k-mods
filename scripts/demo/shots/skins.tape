# shoot: size=1300x1000 type=png crop=0,175,1300,782 pad=14 allow="Bash(git log:*)"
# 기본 스킨(noir)으로 도구 줄, 코드 카드, ##로 나뉜 두 제목, 한국어 표를 한 화면에. 답 길이에 따라 위치가 달라지면 crop을 다시 잰다.
Type "git log --oneline -3 을 실행하고, 답을 '## 최근 커밋'과 '## 엔드포인트' 두 제목으로 나눠줘. 엔드포인트는 src/routes/orders.ts를 읽어서 메서드·경로·설명 세 열의 한국어 표로 정리해줘. 설명은 20자 이내로"
Enter
Wait+Screen@150s /◆ .+ in \d/
Sleep 4s
Screenshot "/tmp/k-demo/shots/skins.png"
Sleep 1s
