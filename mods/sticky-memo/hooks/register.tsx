// sticky-memo: 자주 쓰는 문구를 입력창 위에 붙여 두는 메모 (윈도우 '메모잇' 같은 쓰임새).
//   평소: 칩을 한 번 누르면 클립보드에 복사, 두 번 누르면 입력창 커서 자리에 넣는다.
//   ✎ 수정 모드: 칩을 누르면 펼쳐진다. 내용은 입력창을 빌려 고치고 Enter(또는 [저장])로 저장하고,
//     제목·색은 막대에서 바로 바꾼다. 사람이 쓰던 글은 보관했다가 수정이 끝나면 돌려준다.
//   메모는 모든 폴더 공통으로 $.store에 저장되고, 여러 세션이 SYNC_MS마다 서로 맞춘다.
//   /sticky로 막대를 숨기거나 다시 보인다.
import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderElement, RenderSurface, Timer } from 'claude-code'

import type { StickyEdit, StickyMemo } from '../types'
import {
  ACCENT,
  COLORS,
  DOUBLE_MS,
  FLASH_MS,
  INK,
  RESTORE_MS,
  STORE_KEY,
  SYNC_MS,
  WARN,
  cellWidth,
  copyFailText,
  fitCount,
  hasPlaceholder,
  labelCells,
  labelOf,
  moreLabel,
  newMemoId,
  nextColor,
  normalizeHex,
  parseBoard,
  patchMemo,
  removeMemo,
  truncateCells,
  upsertMemo,
} from './memos'

/** 버튼처럼 쓰는 칩(＋·✎·완료·더 보기)의 색: 공용 팔레트의 홈 색 위에 본문 글자. */
const SOFT = '#3A3E47'
const SOFT_FG = '#E8EAED'
/** 막 복사한 칩의 반짝임 (공용 팔레트의 본문 색). */
const FLASH_BG = '#E8EAED'
const EDIT_HINT = '내용은 입력창에서 고치고 Enter로 저장해요'
const PLACEHOLDER_TOAST = '입력창에 붙여넣은 글(또는 이미지)이 있어요. 보내거나 지운 뒤 다시 눌러 주세요'

const memos = atom({ plugin: 'sticky-memo', key: 'memos' } as const, [])
const rev = atom({ plugin: 'sticky-memo', key: 'rev' } as const, 0)
const isEditMode = atom({ plugin: 'sticky-memo', key: 'isEditMode' } as const, false)
const edit = atom({ plugin: 'sticky-memo', key: 'edit' } as const, null)
const flash = atom({ plugin: 'sticky-memo', key: 'flash' } as const, null)
const isHidden = atom({ plugin: 'sticky-memo', key: 'isHidden' } as const, false)
const isAllShown = atom({ plugin: 'sticky-memo', key: 'isAllShown' } as const, false)

// 한 번 클릭을 DOUBLE_MS 동안 붙잡아 두는 자리. 그 안에 같은 칩이 또 눌리면 더블클릭이다.
let pending: { id: string; at: number; timer: Timer } | null = null
// 버튼처럼 쓰는 칩을 빠르게 두 번 눌러도 한 번만 처리한다.
let lastPress: { key: string; at: number } | null = null
// 제목 칸에 치는 중인 글(Enter 전). 내용을 저장할 때 함께 반영한다.
let titleTyping: string | null = null
// prompt.submit의 .catch가 $ 없이 판단하도록 지금 수정 중인지 비춰 둔다.
let isEditingMirror = false

type Els = Elements['terminal'] | Elements['desktop']
type Site = {
  surface: 'terminal' | 'desktop'
  viewport?: { isFullscreen?: boolean }
  props: { bodyColumns: number }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'sticky', description: '붙임 메모 보이기/숨기기 (작업 중에도 동작)', immediate: true })
    await loadBoard($)
    $.clock.every(SYNC_MS, () => {
      void loadBoard($)
    })
    return next(e)
  })

  on('command.run', { command: 'sticky' }, async $ => {
    const hidden = await read($, isHidden)
    if (!hidden && !(await endEdit($, 'save'))) {
      $.ui.toast('수정 중인 메모를 먼저 저장하거나 취소해 주세요')
      return {}
    }
    await update($, isHidden, () => !hidden)
    return {}
  })

  // 입력창 위 막대는 여러 mod가 함께 쓰는 자리: 설문이 뜨면 양보하고, 다른 mod의 그림(theirs)도 함께 그린다
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const theirs = await next(e)
    if (e.props.hasSurvey) return theirs
    if (e.surface !== 'terminal' && e.surface !== 'desktop') return theirs
    if (await read($, isHidden)) return theirs
    const els = $.ui.resolve(e)
    const { Box } = els
    const board = await drawBoard($, e, els)
    return (
      <Box flexDirection="column">
        {theirs}
        {board}
      </Box>
    )
  })

  // 칩(Client)이 왼쪽 버튼을 뗄 때마다 보낸다
  on('ui.message', async ($, e, next) => {
    const data = e.data as { click?: unknown } | null
    if (data !== null && typeof data === 'object' && data.click === true) await onClick($, e.element, e.surface)
    return next(e)
  })

  // 수정 중에 사람이 Enter를 누르면 모델에 보내지 않고 메모로 저장한다. 붙여넣은 긴 글은 여기서만 온전히 받는다.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind !== 'composer') return next(e)
    const cur = await read($, edit)
    if (cur === null) return next(e)
    return { drop: await saveSubmitted($, cur, e.text) }
  }).catch(($, e, next) =>
    next.called || !isEditingMirror || e.origin.kind !== 'composer'
      ? next(e)
      : { drop: '붙임 메모를 저장하지 못했어요. 다시 Enter를 누르거나 [취소]를 눌러 주세요' },
  )
}

/** $.store에서 보드를 읽어, 다른 세션이 바꿨으면(rev가 다르면) 세션 상태에 반영한다. */
async function loadBoard($: EngineInterface): Promise<void> {
  const board = parseBoard(await $.store.get(STORE_KEY))
  if (board.rev === (await read($, rev))) return
  await update($, memos, () => board.memos)
  await update($, rev, () => board.rev)
}

/** 저장소의 최신본에 change를 적용해 저장한다. 다른 세션이 그사이 바꾼 메모를 덮어쓰지 않는다. */
async function commitMemos($: EngineInterface, change: (list: StickyMemo[]) => StickyMemo[]): Promise<void> {
  const saved = parseBoard(await $.store.get(STORE_KEY))
  const nextList = change(saved.memos)
  const nextRev = Math.max(saved.rev, await read($, rev)) + 1
  await $.store.set(STORE_KEY, { rev: nextRev, memos: nextList })
  await update($, memos, () => nextList)
  await update($, rev, () => nextRev)
}

async function setEdit($: EngineInterface, value: StickyEdit | null): Promise<void> {
  isEditingMirror = value !== null
  await update($, edit, () => value)
}

/** 칩 하나가 눌렸을 때. key는 'memo:<id>' 또는 'ctl:<이름>'. */
async function onClick($: EngineInterface, key: string, surface: RenderSurface): Promise<void> {
  const now = await $.clock.now()
  const editing = await read($, isEditMode)
  // 버튼처럼 쓰는 칩과 수정 모드의 칩은 더블클릭이 없다: 두 번째는 버린다
  if (key.startsWith('ctl:') || editing) {
    if (lastPress !== null && lastPress.key === key && now - lastPress.at < DOUBLE_MS) return
    lastPress = { key, at: now }
  }
  if (key.startsWith('ctl:')) {
    await pressControl($, key.slice(4))
    return
  }
  if (!key.startsWith('memo:')) return
  const id = key.slice(5)
  if (editing) {
    await openEdit($, id)
    return
  }
  if (pending !== null && pending.id === id && now - pending.at <= DOUBLE_MS) {
    pending.timer.cancel()
    pending = null
    await insertMemo($, id)
    return
  }
  // 한 번 클릭은 더블클릭이 아닌 게 확실해진 뒤에 복사한다. 바로 복사하면 더블클릭(넣기)할 때마다
  // 클립보드가 덮어써져서, 메모를 넣고 복사해 둔 다른 글을 붙여넣는 흐름이 깨진다.
  pending?.timer.cancel()
  const timer = $.clock.after(DOUBLE_MS, () => {
    pending = null
    void copyMemo($, id, surface)
  })
  pending = { id, at: now, timer }
}

async function pressControl($: EngineInterface, name: string): Promise<void> {
  if (name === 'add') {
    await startNew($)
  } else if (name === 'edit') {
    await update($, isEditMode, () => true)
  } else if (name === 'done') {
    if (await endEdit($, 'save')) await update($, isEditMode, () => false)
  } else if (name === 'more') {
    await update($, isAllShown, shown => !shown)
  }
}

async function copyMemo($: EngineInterface, id: string, surface: RenderSurface): Promise<void> {
  const memo = (await read($, memos)).find(m => m.id === id)
  if (memo === undefined) return
  const result = await $.ui.copy({ text: memo.text, surface })
  if (!result.isCopied) {
    $.ui.toast(copyFailText(result.reason))
    return
  }
  await update($, flash, () => id)
  $.clock.after(FLASH_MS, () => {
    void update($, flash, shown => (shown === id ? null : shown))
  })
}

async function insertMemo($: EngineInterface, id: string): Promise<void> {
  const memo = (await read($, memos)).find(m => m.id === id)
  if (memo === undefined) return
  const result = await $.prompt.fill({ text: memo.text, mode: 'insert' })
  if (!result.isFilled) $.ui.toast('입력창에 넣지 못했어요. 열린 창을 닫고 다시 해 주세요')
}

/** ＋: 새 메모를 펼친다. 입력창에 쓰던 글이 있으면 그 글로 시작하고, 저장한 뒤에도 입력창 글은 그대로 남는다. */
async function startNew($: EngineInterface): Promise<void> {
  if (!(await endEdit($, 'save'))) return
  const box = await $.prompt.read()
  if (hasPlaceholder(box.text)) {
    $.ui.toast(PLACEHOLDER_TOAST)
    return
  }
  const id = newMemoId(await $.clock.now(), Math.random())
  titleTyping = null
  await update($, isEditMode, () => true)
  await setEdit($, { id, isNew: true, draft: box.text, title: null, color: null, isArmedDelete: false, hint: null })
}

/** 수정 모드에서 칩을 눌렀을 때: 그 메모를 펼치고 내용을 입력창에 옮긴다. 펼친 칩을 또 누르면 접는다. */
async function openEdit($: EngineInterface, id: string): Promise<void> {
  const cur = await read($, edit)
  if (cur !== null && cur.id === id) {
    await endEdit($, 'save')
    return
  }
  if (!(await endEdit($, 'save'))) return
  const memo = (await read($, memos)).find(m => m.id === id)
  if (memo === undefined) return
  const box = await $.prompt.read()
  if (hasPlaceholder(box.text)) {
    $.ui.toast(PLACEHOLDER_TOAST)
    return
  }
  const filled = await $.prompt.fill({ text: memo.text, mode: 'replace' })
  if (!filled.isFilled) {
    $.ui.toast('입력창을 쓸 수 없어서 펼치지 못했어요. 열린 창을 닫고 다시 해 주세요')
    return
  }
  titleTyping = null
  await setEdit($, { id, isNew: false, draft: box.text, title: null, color: null, isArmedDelete: false, hint: null })
}

/**
 * 펼친 메모를 닫는다. save는 입력창 글을 내용으로 저장하고, cancel은 버리고, delete는 메모를 지운다.
 * 어느 쪽이든 쓰던 글을 입력창에 돌려준다. 저장할 수 없으면(붙여넣은 글, 빈 내용) 안내만 띄우고 false.
 */
async function endEdit($: EngineInterface, how: 'save' | 'cancel' | 'delete'): Promise<boolean> {
  const cur = await read($, edit)
  if (cur === null) return true
  if (how === 'save') {
    const box = await $.prompt.read()
    if (hasPlaceholder(box.text)) {
      await setEdit($, { ...cur, isArmedDelete: false, hint: '붙여넣은 글이 있어서 Enter로 저장해 주세요' })
      return false
    }
    if (box.text.trim() !== '') {
      await saveMemo($, cur, box.text)
    } else if (!cur.isNew) {
      await setEdit($, { ...cur, isArmedDelete: false, hint: '내용이 비어 있어요. 지우려면 [삭제]를 눌러 주세요' })
      return false
    }
  }
  if (how === 'delete' && !cur.isNew) await commitMemos($, list => removeMemo(list, cur.id))
  await $.prompt.fill({ text: cur.draft, mode: 'replace' })
  titleTyping = null
  await setEdit($, null)
  return true
}

/** 펼친 메모를 text 내용으로 저장한다. 바뀐 게 없으면 저장소에 쓰지 않는다. */
async function saveMemo($: EngineInterface, cur: StickyEdit, text: string): Promise<StickyMemo> {
  const list = await read($, memos)
  const old = list.find(m => m.id === cur.id)
  const title = (titleTyping ?? cur.title ?? old?.title ?? '').trim()
  const color = cur.color ?? old?.color ?? nextColor(list)
  if (old !== undefined && old.text === text && old.title === title && old.color === color) return old
  const memo: StickyMemo = { id: cur.id, title, text, color, updatedAt: await $.clock.now() }
  await commitMemos($, saved => upsertMemo(saved, memo))
  return memo
}

/** 수정 중 Enter: 내용을 저장하고, 엔진이 입력창에 글을 되돌려 놓은 뒤 쓰던 글로 바꿔 넣는다. 막힌 이유(안내)를 돌려준다. */
async function saveSubmitted($: EngineInterface, cur: StickyEdit, text: string): Promise<string> {
  if (text.trim() === '') {
    await setEdit($, { ...cur, isArmedDelete: false, hint: '내용이 비어 있어요. 지우려면 [삭제]를 눌러 주세요' })
    return '붙임 메모: 내용이 비어 있어서 저장하지 않았어요'
  }
  const memo = await saveMemo($, cur, text)
  $.clock.after(RESTORE_MS, () => {
    void $.prompt.fill({ text: cur.draft, mode: 'replace' })
  })
  titleTyping = null
  await setEdit($, null)
  return `'${truncateCells(labelOf(memo), 24)}' 메모를 저장했어요`
}

async function setTitle($: EngineInterface, value: string): Promise<void> {
  const cur = await read($, edit)
  if (cur === null) return
  titleTyping = null
  const title = value.trim()
  if (!cur.isNew) await commitMemos($, list => patchMemo(list, cur.id, { title }))
  await setEdit($, { ...cur, title, isArmedDelete: false, hint: null })
}

async function setColor($: EngineInterface, color: string): Promise<void> {
  const cur = await read($, edit)
  if (cur === null) return
  if (!cur.isNew) await commitMemos($, list => patchMemo(list, cur.id, { color }))
  await setEdit($, { ...cur, color, isArmedDelete: false, hint: null })
}

async function setHex($: EngineInterface, value: string): Promise<void> {
  const color = normalizeHex(value)
  if (color !== null) {
    await setColor($, color)
    return
  }
  const cur = await read($, edit)
  if (cur !== null) await setEdit($, { ...cur, hint: '#RRGGBB 형식으로 적어 주세요 (예: #FFB3BA)' })
}

/** [삭제]는 두 번 눌러야 지운다. 새 메모(아직 저장 전)는 버리기만 한다. */
async function pressDelete($: EngineInterface): Promise<void> {
  const cur = await read($, edit)
  if (cur === null) return
  if (!cur.isArmedDelete) {
    await setEdit($, { ...cur, isArmedDelete: true, hint: '한 번 더 누르면 지워져요' })
    return
  }
  await endEdit($, 'delete')
}

/** 입력창 위 막대에 그릴 메모판: 평소엔 칩 한 줄, 펼친 메모가 있으면 그 아래 제목·색·저장 줄. */
async function drawBoard($: EngineInterface, e: Site, els: Els): Promise<RenderElement> {
  const { Box, Text, Button, Client } = els
  const list = await read($, memos)
  const editing = await read($, isEditMode)
  const cur = await read($, edit)
  const flashed = await read($, flash)
  const allShown = await read($, isAllShown)
  const columns = e.props.bodyColumns
  const surface = e.surface
  // 마우스 신호를 받을 수 있으면 Client 칩, 아니면 키보드로도 누를 수 있는 Button 칩
  const isPointer = surface === 'terminal' && e.viewport?.isFullscreen === true

  const chip = (key: string, text: string, bg: string, fg: string, bold = false): RenderElement =>
    isPointer ? (
      <Client key={key} module="./chip.tsx" props={{ text, bg, fg, bold }} />
    ) : (
      <Button key={key} plain onPress={() => onClick($, key, surface)}>
        <Text backgroundColor={bg} color={fg} bold={bold}>
          {text}
        </Text>
      </Button>
    )

  const maxLabel = labelCells(columns)
  const memoChips = list.map(m => {
    const label = truncateCells(labelOf(m), maxLabel)
    const key = `memo:${m.id}`
    // 막 복사한 칩은 폭은 그대로 두고 밝게 반짝이며 앞에 ✓ (폭이 바뀌면 옆 칩들이 밀린다)
    if (flashed === m.id) return { width: cellWidth(` ${label} `), el: chip(key, `✓${label} `, FLASH_BG, INK, true) }
    const isOpen = cur?.id === m.id
    return { width: cellWidth(` ${label} `), el: chip(key, ` ${label} `, isOpen ? INK : m.color, isOpen ? m.color : INK, isOpen) }
  })

  const modeText = ' ✎ 수정 모드 '
  const lead = editing ? [<Text backgroundColor={ACCENT} color={INK}>{modeText}</Text>] : []
  const controls: Array<{ key: string; text: string; bg: string; fg: string }> = editing
    ? [
        { key: 'ctl:add', text: ' + ', bg: SOFT, fg: SOFT_FG },
        { key: 'ctl:done', text: ' 완료 ', bg: ACCENT, fg: INK },
      ]
    : list.length === 0
      ? [{ key: 'ctl:add', text: ' + 붙임 메모 ', bg: COLORS[0], fg: INK }]
      : [
          { key: 'ctl:add', text: ' + ', bg: SOFT, fg: SOFT_FG },
          { key: 'ctl:edit', text: ' ✎ ', bg: SOFT, fg: SOFT_FG },
        ]
  const tail = controls.map(c => chip(c.key, c.text, c.bg, c.fg))
  const panel = cur === null ? null : drawPanel($, els, list, cur)

  // 막대는 기본 한 줄: 넘치는 칩은 'N개 더'로 묶고, 누르면 여러 줄로 다 펼친다
  const reserve = (editing ? cellWidth(modeText) + 1 : 0) + controls.reduce((sum, c) => sum + cellWidth(c.text) + 1, 0)
  const fit = fitCount(
    memoChips.map(c => c.width),
    columns,
    reserve,
    1,
    rest => cellWidth(moreLabel(rest, columns)),
  )
  const overflows = fit < memoChips.length
  const shown = overflows && !allShown ? memoChips.slice(0, fit) : memoChips
  const more = !overflows ? null : allShown ? chip('ctl:more', ' 접기 ', SOFT, SOFT_FG) : chip('ctl:more', moreLabel(memoChips.length - fit, columns), SOFT, SOFT_FG)
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" columnGap={1} flexWrap={allShown ? 'wrap' : 'nowrap'}>
        {lead}
        {shown.map(c => c.el)}
        {more}
        {tail}
        {list.length === 0 && !editing && <Text dimColor>자주 쓰는 문구를 붙여 두세요</Text>}
      </Box>
      {panel}
    </Box>
  )
}

/** 펼친 메모의 제목·색·저장 줄. 내용은 입력창에 있다. */
function drawPanel($: EngineInterface, els: Els, list: readonly StickyMemo[], cur: StickyEdit): RenderElement {
  const { Box, Text, Button, Input } = els
  const target = list.find(m => m.id === cur.id)
  const color = cur.color ?? target?.color ?? nextColor(list)
  const title = cur.title ?? target?.title ?? ''
  const isCustom = !(COLORS as readonly string[]).includes(color)
  return (
    <Box flexDirection="column">
      <Input
        key="title"
        label="제목"
        placeholder="비우면 내용 첫 줄"
        value={title}
        submitLabel="저장"
        onInput={(value: string) => {
          titleTyping = value
        }}
        onSubmit={(value: string) => setTitle($, value)}
      />
      <Box flexDirection="row" columnGap={1} flexWrap="wrap">
        <Text dimColor>색</Text>
        {COLORS.map((c, i) => (
          <Button key={`color-${i}`} plain onPress={() => setColor($, c)}>
            <Text backgroundColor={c} color={INK}>
              {c === color ? ' ✓ ' : '   '}
            </Text>
          </Button>
        ))}
        {isCustom && (
          <Text backgroundColor={color} color={INK}>
            {' ✓ '}
          </Text>
        )}
        <Input key="hex" label="#" placeholder="RRGGBB" value="" submitLabel="적용" onSubmit={(value: string) => setHex($, value)} />
      </Box>
      <Box flexDirection="row" columnGap={1} flexWrap="wrap">
        <Button key="save" label="저장" variant="primary" onPress={() => endEdit($, 'save')} />
        <Button key="cancel" label="취소" onPress={() => endEdit($, 'cancel')} />
        <Button key="delete" label={cur.isArmedDelete ? '정말 삭제' : '삭제'} onPress={() => pressDelete($)} />
        <Text color={cur.hint === null ? undefined : WARN} dimColor={cur.hint === null}>
          {cur.hint ?? EDIT_HINT}
        </Text>
      </Box>
    </Box>
  )
}
