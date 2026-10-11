// 칩 하나: 색 배경 위 글자. 그리기 스레드에서 돌며 마우스 신호를 직접 받는다.
//
// 엔진의 Button은 더블클릭의 두 번째 클릭을 넘겨주지 않고, 대신 그 자리 글자를 단어로 골라
// 클립보드에 복사해 버린다(fullscreen 터미널). 그래서 칩은 Client로 그리고 왼쪽 버튼을 뗄 때마다
// hooks 모듈에 알린다. 한 번/두 번 클릭 판정은 hooks 모듈이 $.clock으로 한다.
import type { ClientModule } from 'claude-code'

export type ChipProps = { text: string; bg: string; fg: string; bold?: boolean }

const Chip: ClientModule<ChipProps> = (props, surface) => {
  const { Text } = surface.elements
  surface.onPointer(ev => {
    if (ev.type !== 'up' || ev.button !== 'left') return
    // 칩에서 누르고 밖으로 끌고 나가 뗀 건 클릭이 아니다
    const isLaidOut = surface.columns > 0 && surface.rows > 0
    if (isLaidOut && (ev.x < 0 || ev.y < 0 || ev.x >= surface.columns || ev.y >= surface.rows)) return
    surface.post({ click: true })
  })
  return (
    <Text backgroundColor={props.bg} color={props.fg} bold={props.bold === true} wrap="truncate">
      {props.text}
    </Text>
  )
}

export default Chip
