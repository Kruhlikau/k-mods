// sticky-memo가 세션 상태($.state)에 두는 값들의 형식.

/** 메모 하나. title이 비면 text의 첫 줄을 제목으로 보여준다. color는 '#RRGGBB'. */
export type StickyMemo = {
  id: string
  title: string
  text: string
  color: string
  updatedAt: number
}

/** $.store에 저장하는 모양. rev는 쓸 때마다 1씩 올라서 다른 세션이 바뀐 걸 알아챈다. */
export type StickyBoard = {
  rev: number
  memos: StickyMemo[]
}

/**
 * 펼쳐서 고치는 중인 메모. 내용은 입력창을 빌려 고치므로, 사람이 쓰던 글(draft)을 보관했다가
 * 수정이 끝나면 돌려준다. title·color가 null이면 아직 안 바꾼 것.
 * openedAt은 수정을 시작한 시각: 입력칸 key에 넣어 수정마다 새 칸을 그린다(엔진의 입력칸은
 * key와 value가 그대로면 사람이 쳐 둔 글을 남겨서, 앞 메모의 제목이 다음 메모 칸에 보인다).
 */
export type StickyEdit = {
  id: string
  openedAt: number
  isNew: boolean
  draft: string
  title: string | null
  color: string | null
  isArmedDelete: boolean
  hint: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'sticky-memo': {
      memos: StickyMemo[]
      rev: number
      isEditMode: boolean
      edit: StickyEdit | null
      flash: string | null
      isHidden: boolean
      isAllShown: boolean
    }
  }
}
