import { expect, test } from 'claude-code/testing'

import {
  COLORS,
  cellWidth,
  copyFailText,
  firstLine,
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
} from '../hooks/memos'

const A = { id: 'a', title: '리뷰 요청', text: '아래 변경사항을 리뷰해줘', color: '#E3C56A', updatedAt: 1 }
const B = { id: 'b', title: '', text: '테스트 돌려줘', color: '#8EC5CC', updatedAt: 2 }

test('cellWidth counts Korean, CJK and emoji as two cells', () => {
  expect(cellWidth('abc')).toBe(3)
  expect(cellWidth('한글')).toBe(4)
  expect(cellWidth('a한 b')).toBe(5)
  expect(cellWidth('😀')).toBe(2)
  expect(cellWidth('✓')).toBe(1)
})

test('truncateCells keeps the text within the cells, ellipsis included', () => {
  expect(truncateCells('짧음', 8)).toBe('짧음')
  const cut = truncateCells('코드리뷰 요청입니다', 8)
  expect(cut).toEndWith('…')
  expect(cellWidth(cut)).toBeLessThanOrEqual(8)
  expect(truncateCells('abcdefghij', 5)).toBe('abcd…')
})

test('labelOf: the title, else the first non-empty line, else a placeholder', () => {
  expect(labelOf(A)).toBe('리뷰 요청')
  expect(labelOf({ title: '  ', text: '\n\n  첫 줄\t내용 \n둘째 줄' })).toBe('첫 줄 내용')
  expect(firstLine('  \n')).toBe('')
  expect(labelOf({ title: '', text: '' })).toBe('(빈 메모)')
})

test('labelCells follows the three width tiers', () => {
  expect(labelCells(120)).toBe(16)
  expect(labelCells(80)).toBe(12)
  expect(labelCells(60)).toBe(8)
})

test('fitCount: everything when it fits, else as many as leave room for the more chip', () => {
  const more = (rest: number) => cellWidth(moreLabel(rest, 100))
  expect(fitCount([10, 10, 10], 100, 10, 1, more)).toBe(3)
  // 100칸, 버튼 몫 10칸, 칩 20칸씩: 칩 3개(63칸)에 '7개 더'(8칸+사이 1칸)까지 82칸, 4개면 103칸이라 넘친다
  expect(fitCount(Array(10).fill(20), 100, 10, 1, more)).toBe(3)
  expect(fitCount([200], 100, 10, 1, more)).toBe(0)
  expect(moreLabel(3, 100)).toBe(' 3개 더 ')
  expect(moreLabel(3, 60)).toBe(' +3 ')
})

test('normalizeHex accepts #RRGGBB, RRGGBB and #RGB', () => {
  expect(normalizeHex('#ffb3ba')).toBe('#FFB3BA')
  expect(normalizeHex(' FFB3BA ')).toBe('#FFB3BA')
  expect(normalizeHex('#abc')).toBe('#AABBCC')
  expect(normalizeHex('zzz')).toBeNull()
  expect(normalizeHex('#12345')).toBeNull()
})

test('hasPlaceholder spots paste and image placeholders', () => {
  expect(hasPlaceholder('[Pasted text #1 +14 lines]')).toBe(true)
  expect(hasPlaceholder('앞 [Pasted text #2] 뒤')).toBe(true)
  expect(hasPlaceholder('[Image #1] 이거 봐줘')).toBe(true)
  expect(hasPlaceholder('[링크](https://example.com) 그냥 대괄호')).toBe(false)
})

test('parseBoard: a valid board passes, anything else is an empty one', () => {
  expect(parseBoard(undefined)).toEqual({ rev: 0, memos: [] })
  expect(parseBoard('oops')).toEqual({ rev: 0, memos: [] })
  expect(parseBoard({ rev: 3, memos: [A, { id: 1 }, null] })).toEqual({ rev: 3, memos: [A] })
  expect(parseBoard({ memos: [{ id: 'x', title: '', text: 't', color: '#000000' }] })).toEqual({
    rev: 0,
    memos: [{ id: 'x', title: '', text: 't', color: '#000000', updatedAt: 0 }],
  })
})

test('upsert, remove and patch keep order and touch only their memo', () => {
  expect(upsertMemo([A], B).map(m => m.id)).toEqual(['a', 'b'])
  expect(upsertMemo([A, B], { ...A, text: '바뀜' })[0]?.text).toBe('바뀜')
  expect(removeMemo([A, B], 'a')).toEqual([B])
  expect(patchMemo([A, B], 'b', { color: '#000000' })[1]?.color).toBe('#000000')
  expect(patchMemo([A, B], 'b', { color: '#000000' })[0]).toEqual(A)
})

test('new memos take the palette in turn; ids are short and distinct', () => {
  expect(nextColor([])).toBe(COLORS[0])
  expect(nextColor([A, B])).toBe(COLORS[2])
  expect(nextColor(Array(8).fill(A))).toBe(COLORS[0])
  expect(newMemoId(1_700_000_000_000, 0.5)).toMatch(/^m[0-9a-z]+$/)
  expect(newMemoId(1, 0.1)).not.toBe(newMemoId(1, 0.2))
})

test('copyFailText explains each reason in Korean', () => {
  expect(copyFailText('no-clipboard')).toMatch(/클립보드/)
  expect(copyFailText('refused')).toMatch(/다른 mod/)
  expect(copyFailText('no-surface')).toMatch(/화면/)
})
