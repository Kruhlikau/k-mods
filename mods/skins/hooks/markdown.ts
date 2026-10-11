// Finds the tables, fenced code and (k-mods) headings in a reply so they can be drawn as
// cards; the rest stays markdown.

export type Align = 'left' | 'right' | 'center'

export type Table = { kind: 'table'; header: string[]; align: Align[]; rows: string[][] }

// `raw` is the fence as written, for the surfaces that keep Claude Code's own drawing.
export type Code = { kind: 'code'; lang: string; code: string; raw: string }

// k-mods: an ATX heading (`# Title`), drawn by the skin where the surface's markdown
// draws every level as plain bold.
export type Heading = { kind: 'heading'; level: number; text: string }

// k-mods: a thematic break (`---`, `***`, `___`) on a line after a blank one; right under
// text, `---` is a setext heading and stays text.
export type Rule = { kind: 'rule' }

export type Segment = { kind: 'text'; text: string } | Table | Code | Heading | Rule

export type SplitOptions = {
  // k-mods: false leaves tables and fences in the text (the `tables` setting off).
  cards?: boolean
  // k-mods: headings and thematic breaks become their own segments (the terminal; the
  // desktop draws both).
  headings?: boolean
  // k-mods: fences in these languages stay in the text, for a mod further down the
  // chain to draw (gfm-render's ```mermaid), instead of becoming a code card.
  keepFences?: readonly string[]
}

const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/
const FENCE = /^\s*(```|~~~)\s*([\w+#.-]*)/

// Up to three spaces, one to six #s, a space, the title; a closing run of #s is dropped.
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/

export const hasHeadingOrRule = (markdown: string): boolean =>
  /^ {0,3}#{1,6}[ \t]+\S/m.test(markdown) || /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/m.test(markdown)

// Inline emphasis and code ticks read as noise in a padded cell.
const clean = (cell: string): string =>
  cell.replace(/\*\*|__|`/g, '').replace(/\\\|/g, '|').trim()

export function cellsOf(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '')

  return inner.split(/(?<!\\)\|/).map(clean)
}

const alignOf = (cell: string): Align => {
  const spec = cell.trim()

  if (spec.startsWith(':') && spec.endsWith(':')) {
    return 'center'
  }

  return spec.endsWith(':') ? 'right' : 'left'
}

const fit = (cells: string[], width: number): string[] =>
  Array.from({ length: width }, (_, i) => cells[i] ?? '')

export function splitReply(markdown: string, options: SplitOptions = {}): Segment[] {
  const lines = markdown.split('\n')
  const keep = new Set(options.keepFences ?? [])
  const segments: Segment[] = []
  let text: string[] = []
  let inFence = false

  const flush = () => {
    if (text.join('\n').trim() !== '') {
      segments.push({ kind: 'text', text: text.join('\n') })
    }

    text = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const next = lines[i + 1] ?? ''

    const fence = FENCE.exec(line)

    // A closed fence becomes a code segment; one still streaming stays text.
    if (fence !== null && !inFence) {
      const close = lines.findIndex((other, j) => j > i && FENCE.test(other) && other.trim().replace(/[`~]/g, '') === '')

      const lang = (fence[2] ?? '').toLowerCase()

      if (close !== -1 && (keep.has(lang) || options.cards === false)) {
        text.push(...lines.slice(i, close + 1))
        i = close
        continue
      }

      if (close !== -1) {
        flush()
        segments.push({
          kind: 'code',
          lang,
          code: lines.slice(i + 1, close).join('\n'),
          raw: lines.slice(i, close + 1).join('\n'),
        })
        i = close
        continue
      }

      inFence = true
    } else if (fence !== null) {
      inFence = false
    }

    const heading = options.headings === true && !inFence ? HEADING.exec(line) : null

    if (heading !== null && (heading[2] ?? '').trim() !== '') {
      flush()
      segments.push({ kind: 'heading', level: (heading[1] ?? '#').length, text: (heading[2] ?? '').replace(/\*\*|__|`/g, '').trim() })
      continue
    }

    const afterBlank = (text.at(-1) ?? '').trim() === ''

    if (options.headings === true && !inFence && afterBlank && RULE.test(line)) {
      flush()
      segments.push({ kind: 'rule' })
      continue
    }

    const header = cellsOf(line)
    const isTable =
      options.cards !== false &&
      !inFence &&
      line.includes('|') &&
      SEPARATOR.test(next) &&
      header.length > 1 &&
      cellsOf(next).length === header.length

    if (!isTable) {
      text.push(line)
      continue
    }

    flush()

    const rows: string[][] = []
    i += 2

    while (i < lines.length && (lines[i] ?? '').includes('|') && (lines[i] ?? '').trim() !== '') {
      rows.push(fit(cellsOf(lines[i] ?? ''), header.length))
      i++
    }

    i--
    segments.push({ kind: 'table', header, align: cellsOf(next).map(alignOf), rows })
  }

  flush()

  return segments
}

// k-mods: a column used to be sized by character count, which cuts a Hangul table
// short, since the terminal draws each Hangul (and other wide) character in two
// cells. `widthOf` counts terminal cells instead, so `columnWidths`, `cutCell` and
// `padCell` size and cut a Korean table the way the terminal actually draws it.
const isWide = (ch: string): boolean =>
  /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/.test(ch)

export const widthOf = (text: string): number =>
  [...text].reduce((sum, ch) => sum + (isWide(ch) ? 2 : 1), 0)

// Cuts to a cell width in terminal cells, not characters, so a cut never splits a
// wide character's two cells. Marked with an ellipsis where it lost text.
function cutToWidth(text: string, width: number): string {
  if (widthOf(text) <= width) {
    return text
  }

  let out = ''
  let used = 0

  for (const ch of text) {
    const w = isWide(ch) ? 2 : 1

    if (used + w > width - 1) {
      break
    }

    out += ch
    used += w
  }

  return `${out}…`
}

// Natural column widths, narrowed from the widest down until the table fits.
export function columnWidths(table: Table, maxWidth: number, gap: number): number[] {
  const widths = table.header.map((cell, col) =>
    Math.max(widthOf(cell), ...table.rows.map(row => widthOf(row[col] ?? ''))),
  )
  const budget = maxWidth - gap * (widths.length - 1)

  while (widths.reduce((sum, width) => sum + width, 0) > budget) {
    const widest = widths.indexOf(Math.max(...widths))

    if ((widths[widest] ?? 0) <= 3) {
      break
    }

    widths[widest] = (widths[widest] ?? 0) - 1
  }

  return widths
}

// A cell cut to its column, marked with an ellipsis where it lost text.
export function cutCell(text: string, width: number): string {
  return cutToWidth(text, width)
}

export function padCell(text: string, width: number, align: Align): string {
  const cut = cutToWidth(text, width)
  const room = width - widthOf(cut)

  if (align === 'right') {
    return ' '.repeat(room) + cut
  }

  if (align === 'center') {
    const left = Math.floor(room / 2)

    return ' '.repeat(left) + cut + ' '.repeat(room - left)
  }

  return cut + ' '.repeat(room)
}
