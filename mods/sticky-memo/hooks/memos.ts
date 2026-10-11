// sticky-memo의 순수 함수. $를 받지 않아 테스트하기 쉽다.
import type { StickyBoard, StickyMemo } from '../types'

/** 파스텔 칩 위 글씨 색 (k-mods 공용 팔레트). */
export const INK = '#1E2127'
/** 수정 모드 표시 칩 (공용 팔레트의 강조 보라). */
export const ACCENT = '#C3B1F5'
/** 안내 문구 중 주의가 필요한 것 (공용 팔레트의 경고 호박). */
export const WARN = '#F0C987'
/** 고를 수 있는 파스텔 8색 (공용 팔레트의 분류 파스텔). 새 메모는 차례대로 돌아가며 받는다. */
export const COLORS = ['#E3C56A', '#8EC5CC', '#E8A6C4', '#86A0DC', '#A8C98A', '#DE8E62', '#B9AEF5', '#9F8FF2'] as const

/** 이 안에 두 번째 클릭이 오면 더블클릭. 한 번 클릭(복사)은 이만큼 기다렸다가 실행한다. */
export const DOUBLE_MS = 400
/** 복사한 칩에 ✓를 보여주는 시간. */
export const FLASH_MS = 1200
/** 다른 세션이 바꾼 메모를 가져오는 주기. */
export const SYNC_MS = 4000
/** Enter 저장 뒤 엔진이 입력창에 글을 되돌려 놓은 다음, 쓰던 글로 바꿔 넣기까지 기다리는 시간. */
export const RESTORE_MS = 60
/** $.store 키. */
export const STORE_KEY = 'board'

/** 한 글자가 터미널에서 차지하는 칸 수: 한글·한자·전각 문자·그림 문자는 2, 결합 문자는 0. */
export function charCells(code: number): number {
  if (code === 0x200b || code === 0x200c || code === 0x200d || code === 0xfe0f) return 0
  if (code >= 0x0300 && code <= 0x036f) return 0
  if (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3041 && code <= 0x33ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xa000 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1f64f) ||
    (code >= 0x1f900 && code <= 0x1f9ff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  ) {
    return 2
  }
  return 1
}

/** 문자열이 터미널에서 차지하는 칸 수. */
export function cellWidth(text: string): number {
  let cells = 0
  for (const ch of text) cells += charCells(ch.codePointAt(0) ?? 0)
  return cells
}

/** max칸을 넘으면 잘라서 끝에 …을 붙인다 (…도 한 칸으로 센다). */
export function truncateCells(text: string, max: number): string {
  if (cellWidth(text) <= max) return text
  let out = ''
  let cells = 0
  for (const ch of text) {
    const w = charCells(ch.codePointAt(0) ?? 0)
    if (cells + w > max - 1) break
    out += ch
    cells += w
  }
  return `${out}…`
}

/** 비어 있지 않은 첫 줄 (탭·연속 공백은 한 칸으로). */
export function firstLine(text: string): string {
  const line = text.split('\n').find(l => l.trim() !== '') ?? ''
  return line.replace(/\s+/g, ' ').trim()
}

/** 칩에 보일 이름: 제목, 없으면 내용 첫 줄, 그것도 없으면 (빈 메모). */
export function labelOf(memo: Pick<StickyMemo, 'title' | 'text'>): string {
  return memo.title.trim() || firstLine(memo.text) || '(빈 메모)'
}

/** 폭 3단계(넓음 100칸 이상, 보통 70~99, 좁음)에 따른 칩 이름의 최대 칸 수. */
export function labelCells(columns: number): number {
  if (columns >= 100) return 16
  if (columns >= 70) return 12
  return 8
}

/**
 * 한 줄에 칩을 몇 개까지 넣을 수 있는지. 칩 사이는 gap칸, reserve는 칩 말고 같은 줄에 놓을 것(버튼들)의 칸 수.
 * 다 못 넣으면 남은 개수를 알리는 칩(moreCells(남은 개수))의 자리도 남긴다.
 */
export function fitCount(widths: readonly number[], available: number, reserve: number, gap: number, moreCells: (rest: number) => number): number {
  const total = widths.reduce((sum, w) => sum + w, 0) + gap * widths.length
  if (total + reserve <= available) return widths.length
  let used = reserve
  let count = 0
  for (const w of widths) {
    const rest = widths.length - count - 1
    if (used + w + gap + gap + moreCells(rest) > available) break
    used += w + gap
    count++
  }
  return count
}

/** 남은 메모 수를 알리는 칩 글자. 좁으면 짧게. */
export function moreLabel(rest: number, columns: number): string {
  return columns >= 70 ? ` ${rest}개 더 ` : ` +${rest} `
}

/** '#RRGGBB'나 'RRGGBB', '#RGB'를 '#RRGGBB'(대문자)로. 아니면 null. */
export function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toUpperCase()}`
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw
      .split('')
      .map(c => c + c)
      .join('')
      .toUpperCase()}`
  }
  return null
}

/**
 * 입력창 글에 붙여넣기·이미지 자리표시가 있는지. $.prompt.read는 붙여넣은 긴 글을
 * "[Pasted text #1 +14 lines]"로만 돌려줘서, 이걸 그대로 저장하거나 되돌려 넣으면 내용이 사라진다.
 */
export function hasPlaceholder(text: string): boolean {
  return /\[(Pasted text|Image) #\d+[^\]]*\]/.test(text)
}

/** $.ui.copy가 실패한 이유를 한국어 안내로. */
export function copyFailText(reason: 'no-surface' | 'no-clipboard' | 'refused'): string {
  if (reason === 'no-clipboard') return '복사하지 못했어요. 이 터미널은 클립보드 쓰기를 막고 있어요'
  if (reason === 'refused') return '복사하지 못했어요. 다른 mod가 막았어요'
  return '복사하지 못했어요. 그릴 화면이 없어요'
}

function isMemo(value: unknown): value is StickyMemo {
  if (typeof value !== 'object' || value === null) return false
  const m = value as Record<string, unknown>
  return typeof m.id === 'string' && typeof m.title === 'string' && typeof m.text === 'string' && typeof m.color === 'string'
}

/** $.store에서 읽은 값을 검사해서 보드로. 모양이 다르면 빈 보드. */
export function parseBoard(value: unknown): StickyBoard {
  if (typeof value !== 'object' || value === null) return { rev: 0, memos: [] }
  const b = value as Record<string, unknown>
  const memos = Array.isArray(b.memos) ? b.memos.filter(isMemo).map(m => ({ ...m, updatedAt: typeof m.updatedAt === 'number' ? m.updatedAt : 0 })) : []
  return { rev: typeof b.rev === 'number' ? b.rev : 0, memos }
}

/** 같은 id가 있으면 그 자리에서 바꾸고, 없으면 끝에 붙인다. */
export function upsertMemo(list: readonly StickyMemo[], memo: StickyMemo): StickyMemo[] {
  return list.some(m => m.id === memo.id) ? list.map(m => (m.id === memo.id ? memo : m)) : [...list, memo]
}

export function removeMemo(list: readonly StickyMemo[], id: string): StickyMemo[] {
  return list.filter(m => m.id !== id)
}

export function patchMemo(list: readonly StickyMemo[], id: string, patch: Partial<Omit<StickyMemo, 'id'>>): StickyMemo[] {
  return list.map(m => (m.id === id ? { ...m, ...patch } : m))
}

/** 새 메모의 기본 색: 지금 메모 수에 따라 8색을 돌아가며. */
export function nextColor(list: readonly StickyMemo[]): string {
  return COLORS[list.length % COLORS.length] ?? COLORS[0]
}

/** 시각과 난수로 만든 짧은 id. */
export function newMemoId(now: number, random: number): string {
  return `m${Math.floor(now).toString(36)}${Math.floor(random * 1e6).toString(36)}`
}
