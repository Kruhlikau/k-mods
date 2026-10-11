# shoot: size=1000x820 type=gif crop=0,644,1000,772 pad=14 start=5.2
# 칩을 한 번 눌러 복사(✓)하고, 입력창에 앞말을 친 뒤 다른 칩을 두 번 눌러 커서 자리에 넣는다(보내지 않음).
# vhs에는 마우스 명령이 없어서 SGR 마우스 신호(ESC [<0;열;줄M / m)를 직접 입력한다. 칩 줄은 27번째 줄.
# 촬영 전에 이 mod의 inline 저장소에 데모 메모 4개를 넣어 둔다(리뷰 요청·커밋 메시지·테스트 먼저·쉽게 설명).
Sleep 1.2s
Escape
Type@0ms "[<0;4;27M"
Escape
Type@0ms "[<0;4;27m"
Sleep 2.2s
Type@70ms "결제 모듈에서 "
Sleep 0.6s
Escape
Type@0ms "[<0;30;27M"
Escape
Type@0ms "[<0;30;27m"
Sleep 0.12s
Escape
Type@0ms "[<0;30;27M"
Escape
Type@0ms "[<0;30;27m"
Sleep 3s
