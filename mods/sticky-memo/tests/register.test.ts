import { expect, mock, test } from 'claude-code/testing'
import type { MockClock } from 'claude-code/testing'
import type { On } from 'claude-code'

import { COLORS } from '../hooks/memos'

const PROPS = { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { offset: 0, bodyRows: 12 }, view: {} }
const FULLSCREEN = { columns: 105, rows: 30, isFullscreen: true }
const MAIN_SCREEN = { columns: 105, rows: 30, isFullscreen: false }
const BAND = { plugin: 'sticky-memo', component: 'AbovePrompt', requestId: 'band', props: PROPS } as const

const A = { id: 'a', title: '리뷰 요청', text: '아래 변경사항을 리뷰해줘', color: '#E3C56A', updatedAt: 1 }
const B = { id: 'b', title: '', text: '테스트 돌려줘\n실패하면 고쳐줘', color: '#8EC5CC', updatedAt: 2 }

type Memo = { id: string; title: string; text: string; color: string }
type World = {
  clock: MockClock
  store: Record<string, unknown>
  copied: string[]
  fills: Array<{ text: string; mode: string }>
  toasts: string[]
  box: { text: string }
}

// 엔진 대신 답하는 바닥: 시계·저장소는 메모리에서, 클립보드·입력창은 기록만 한다.
function world(on: On, memos: unknown[] = [A, B]): World {
  const w: World = { clock: mock.clock(on, { now: 10_000 }), store: { board: { rev: 1, memos } }, copied: [], fills: [], toasts: [], box: { text: '' } }
  on('store.get', (_, e) => ({ value: w.store[e.key] }))
  on('store.set', (_, e) => {
    w.store[e.key] = JSON.parse(JSON.stringify(e.value))
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine band' }))
  on('ui.copy', (_, e) => {
    w.copied.push(e.text)
    return { value: { isCopied: true } }
  })
  on('ui.toast', (_, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('prompt.read', () => ({ value: { text: w.box.text, cursor: w.box.text.length } }))
  on('prompt.fill', (_, e) => {
    w.fills.push({ text: e.text, mode: e.mode })
    w.box.text = e.mode === 'replace' ? e.text : w.box.text + e.text
    return { isFilled: true }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  return w
}

const START = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const
const typed = (text: string) => ({ text, origin: { kind: 'composer' }, wait: false }) as const
const click = (key: string) => ({ type: 'up', x: 1, y: 0, button: 'left', in: key }) as const
/** 저장소에 지금 저장된 메모들. */
const saved = (w: World): Memo[] => (w.store.board as { memos: Memo[] }).memos

test('chips: a Client per memo in the fullscreen terminal, a Button elsewhere, beside the other mods', async ($, on) => {
  world(on)
  await $.session.start(START)

  const full = await $.ui.mount({ ...BAND, surface: 'terminal', viewport: FULLSCREEN })
  expect((await full.find({ key: 'memo:a' }))?.type).toBe('Client')
  expect(await full.find({ type: 'Text', text: ' 리뷰 요청 ', in: 'memo:a' })).toBeDefined()
  // 제목이 없으면 내용 첫 줄
  expect(await full.find({ type: 'Text', text: ' 테스트 돌려줘 ', in: 'memo:b' })).toBeDefined()
  expect(await full.find({ type: 'Text', text: 'engine band' })).toBeDefined()
  await full.unmount()

  for (const [surface, viewport] of [
    ['terminal', MAIN_SCREEN],
    ['desktop', FULLSCREEN],
  ] as const) {
    const ui = await $.ui.mount({ ...BAND, surface, viewport })
    expect((await ui.find({ key: 'memo:a' }))?.type).toBe('Button')
    await ui.unmount()
  }
})

test('one click copies, but only once the double-click window has passed', async ($, on) => {
  const w = world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', viewport: FULLSCREEN })

  await ui.pointer(click('memo:a'))
  expect(w.copied).toEqual([])
  await w.clock.advance(400)
  expect(w.copied).toEqual([A.text])
  expect(await ui.find({ type: 'Text', text: '✓리뷰 요청 ', in: 'memo:a' })).toBeDefined()

  await w.clock.advance(1200)
  expect(await ui.find({ type: 'Text', text: ' 리뷰 요청 ', in: 'memo:a' })).toBeDefined()
  expect(w.fills).toEqual([])
})

test('two clicks put the memo in at the cursor and leave the clipboard alone', async ($, on) => {
  const w = world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', viewport: FULLSCREEN })

  await ui.pointer(click('memo:b'))
  await w.clock.advance(150)
  await ui.pointer(click('memo:b'))
  expect(w.fills).toEqual([{ text: B.text, mode: 'insert' }])

  await w.clock.advance(2000)
  expect(w.copied).toEqual([])
})

test('a Button chip (keyboard, desktop) follows the same click rules', async ($, on) => {
  const w = world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', viewport: FULLSCREEN })

  await ui.press({ key: 'memo:a' })
  await w.clock.advance(400)
  expect(w.copied).toEqual([A.text])

  await ui.press({ key: 'memo:a' })
  await w.clock.advance(100)
  await ui.press({ key: 'memo:a' })
  expect(w.fills).toEqual([{ text: A.text, mode: 'insert' }])
  await w.clock.advance(1000)
  expect(w.copied).toEqual([A.text])
})

test('edit mode: a click opens the memo into the prompt, Enter saves it and gives the draft back', async ($, on) => {
  const w = world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', viewport: FULLSCREEN })
  w.box.text = '쓰던 글'

  await ui.pointer(click('ctl:edit'))
  expect(await ui.find({ type: 'Text', text: ' ✎ 수정 모드 ' })).toBeDefined()

  await ui.pointer(click('memo:a'))
  expect(w.box.text).toBe(A.text)
  expect(w.copied).toEqual([])
  expect(await ui.find({ type: 'Input', key: 'title' })).toBeDefined()

  const result = await $.prompt.submit(typed('아래 변경사항을 꼼꼼히 리뷰해줘'))
  expect(result.drop).toBe("'리뷰 요청' 메모를 저장했어요")
  await w.clock.advance(60)
  expect(w.box.text).toBe('쓰던 글')

  expect(saved(w).find(m => m.id === 'a')?.text).toBe('아래 변경사항을 꼼꼼히 리뷰해줘')
  expect(await ui.find({ type: 'Input', key: 'title' })).toBeUndefined()

  // 수정이 끝나면 Enter는 다시 평소처럼 보내진다
  expect((await $.prompt.submit(typed('그냥 질문'))).text).toBe('그냥 질문')
})

test('only the person’s own Enter is caught: a notification mid-edit goes through', async ($, on) => {
  const w = world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', viewport: FULLSCREEN })
  await ui.pointer(click('ctl:edit'))
  await ui.pointer(click('memo:a'))

  const passed = await $.prompt.submit({ text: '작업이 끝났어요', origin: { kind: 'task-notification' }, wait: false })
  expect(passed.text).toBe('작업이 끝났어요')
  expect(saved(w).find(m => m.id === 'a')?.text).toBe(A.text)
  expect(w.box.text).toBe(A.text)
})

test('+ starts a new memo from the draft, takes a title, and leaves the draft in place', async ($, on) => {
  const w = world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', viewport: FULLSCREEN })
  w.box.text = '자주 쓰는 프롬프트'

  await ui.pointer(click('ctl:add'))
  expect(w.box.text).toBe('자주 쓰는 프롬프트')
  await ui.input({ key: 'title', text: '프롬프트' })

  const result = await $.prompt.submit(typed('자주 쓰는 프롬프트'))
  expect(result.drop).toBe("'프롬프트' 메모를 저장했어요")
  await w.clock.advance(60)
  expect(w.box.text).toBe('자주 쓰는 프롬프트')

  expect(saved(w)).toHaveLength(3)
  expect(saved(w)[2]).toMatchObject({ title: '프롬프트', text: '자주 쓰는 프롬프트', color: COLORS[2] })
})

test('swatches and hex codes recolor an existing memo at once; a bad code only hints', async ($, on) => {
  const w = world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', viewport: FULLSCREEN })
  await ui.pointer(click('ctl:edit'))
  await ui.pointer(click('memo:a'))

  await ui.press({ key: 'color-1' })
  expect(saved(w)[0]?.color).toBe(COLORS[1])

  await ui.input({ key: 'hex', text: 'ffb3ba' })
  expect(saved(w)[0]?.color).toBe('#FFB3BA')

  await ui.input({ key: 'hex', text: 'zz' })
  expect(saved(w)[0]?.color).toBe('#FFB3BA')
  expect(await ui.find({ type: 'Text', text: /#RRGGBB 형식/ })).toBeDefined()
})

test('delete takes two presses, then the draft comes back', async ($, on) => {
  const w = world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', viewport: FULLSCREEN })
  w.box.text = '쓰던 글'
  await ui.pointer(click('ctl:edit'))
  await ui.pointer(click('memo:b'))

  await ui.press({ key: 'delete' })
  expect(saved(w)).toHaveLength(2)
  expect(await ui.find({ type: 'Text', text: /한 번 더 누르면/ })).toBeDefined()

  await ui.press({ key: 'delete' })
  expect(saved(w).map(m => m.id)).toEqual(['a'])
  expect(w.box.text).toBe('쓰던 글')
})

test('[저장] saves plain text but asks for Enter when the prompt holds a paste placeholder', async ($, on) => {
  const w = world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', viewport: FULLSCREEN })
  await ui.pointer(click('ctl:edit'))
  await ui.pointer(click('memo:a'))

  w.box.text = '[Pasted text #1 +14 lines]'
  await ui.press({ key: 'save' })
  expect(saved(w)[0]?.text).toBe(A.text)
  expect(await ui.find({ type: 'Text', text: /Enter로 저장해 주세요/ })).toBeDefined()

  w.box.text = '고친 내용'
  await ui.press({ key: 'save' })
  expect(saved(w)[0]?.text).toBe('고친 내용')
  expect(w.box.text).toBe('')
})

test('cancel drops the edit and keeps the memo as it was', async ($, on) => {
  const w = world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', viewport: FULLSCREEN })
  w.box.text = '쓰던 글'
  await ui.pointer(click('ctl:edit'))
  await ui.pointer(click('memo:a'))

  w.box.text = '버릴 내용'
  await ui.press({ key: 'cancel' })
  expect(saved(w)[0]?.text).toBe(A.text)
  expect(w.box.text).toBe('쓰던 글')

  await ui.pointer(click('ctl:done'))
  expect(await ui.find({ type: 'Text', text: ' ✎ 수정 모드 ' })).toBeUndefined()
})

test('chips that do not fit fold into "N개 더", which unfolds them all', async ($, on) => {
  const many = Array.from({ length: 10 }, (_, i) => ({ ...A, id: `m${i}`, title: `긴 제목의 메모 ${i}` }))
  const w = world(on, many)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', viewport: FULLSCREEN, props: { ...PROPS, bodyColumns: 80 } })

  expect(await ui.find({ key: 'memo:m9' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^ \d+개 더 $/, in: 'ctl:more' })).toBeDefined()

  await ui.pointer(click('ctl:more'))
  expect(await ui.find({ key: 'memo:m9' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' 접기 ', in: 'ctl:more' })).toBeDefined()
  expect(w.copied).toEqual([])
})

test('/sticky hides the board and brings it back', async ($, on) => {
  world(on)
  await $.session.start(START)
  const run = () =>
    $.command.run({ command: 'sticky', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 105 } })

  await run()
  const hidden = await $.ui.mount({ ...BAND, surface: 'terminal', viewport: FULLSCREEN })
  expect(await hidden.find({ key: 'memo:a' })).toBeUndefined()
  expect(await hidden.find({ type: 'Text', text: 'engine band' })).toBeDefined()
  await hidden.unmount()

  await run()
  const shown = await $.ui.mount({ ...BAND, surface: 'terminal', viewport: FULLSCREEN })
  expect(await shown.find({ key: 'memo:a' })).toBeDefined()
})

test('another session’s change shows up within the sync period', async ($, on) => {
  const w = world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', viewport: FULLSCREEN })
  expect(await ui.find({ key: 'memo:b' })).toBeDefined()

  w.store.board = { rev: 7, memos: [A] }
  await w.clock.advance(4000)
  expect(await ui.find({ key: 'memo:b' })).toBeUndefined()
})

test('an empty board offers one add chip and a hint, and yields to a survey', async ($, on) => {
  world(on, [])
  await $.session.start(START)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', viewport: FULLSCREEN })
  expect(await ui.find({ type: 'Text', text: ' + 붙임 메모 ', in: 'ctl:add' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '자주 쓰는 문구를 붙여 두세요' })).toBeDefined()
  expect(await ui.find({ key: 'ctl:edit' })).toBeUndefined()
  await ui.unmount()

  const survey = await $.ui.mount({ ...BAND, surface: 'terminal', viewport: FULLSCREEN, props: { ...PROPS, hasSurvey: true } })
  expect(await survey.find({ key: 'ctl:add' })).toBeUndefined()
})
