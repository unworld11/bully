import {
  prepareWithSegments,
  layoutNextLine,
  layoutWithLines,
  walkLineRanges,
  layout,
  type PreparedTextWithSegments,
  type LayoutCursor,
} from '@chenglou/pretext'
import { TRACKS_LYRICS, type TrackLyrics } from './lyrics-data.ts'

function updateSpotifyEmbed(track: TrackLyrics): void {
  const iframe = document.querySelector('#spotify-mini-body iframe') as HTMLIFrameElement | null
  if (iframe && track.spotifyId) {
    iframe.src = `https://open.spotify.com/embed/track/${track.spotifyId}?utm_source=generator&theme=0`
  }
}

// ── Config ──────────────────────────────────────────────────────────
const BODY_FONT = '300 20px "Space Grotesk", sans-serif'
const BODY_LINE_HEIGHT = 34
const SECTION_LABEL_FONT = '400 10px "Space Grotesk", sans-serif'
const PULL_QUOTE_FONT_FAMILY = '"Epilogue", sans-serif'
const PQ_H_PAD = 24
const PQ_V_PAD = 32
const MIN_SLOT_WIDTH = 60

// ── DOM refs ────────────────────────────────────────────────────────
const stage = document.getElementById('lyrics-stage')!
const titleEl = document.getElementById('lyrics-title')!
const stampEl = document.getElementById('stamp-id')!
const manifestList = document.getElementById('manifest-list')!
const techData = document.getElementById('tech-data')!
const selectorContainer = document.getElementById('track-selector')!
const statLines = document.getElementById('stat-lines')!
const statReflow = document.getElementById('stat-reflow')!
const statDom = document.getElementById('stat-dom')!
const statSections = document.getElementById('stat-sections')!

// ── State ───────────────────────────────────────────────────────────
const preparedByKey = new Map<string, PreparedTextWithSegments>()
let currentTrackIndex = 0
let domReads = 0

type Rect = { x: number; y: number; w: number; h: number }
type Interval = { left: number; right: number }
type PositionedLine = { x: number; y: number; text: string; width: number; className: string }
type PullQuoteBlock = {
  rect: Rect
  text: string
  font: string
  lineHeight: number
  lines: { x: number; y: number; text: string }[]
}

// ── DOM element pools ───────────────────────────────────────────────
let bodyLinePool: HTMLElement[] = []
let pqBoxPool: HTMLElement[] = []
let pqLinePool: HTMLElement[] = []
let labelPool: HTMLElement[] = []
let dividerPool: HTMLElement[] = []

function syncPool(pool: HTMLElement[], count: number, className: string, tag = 'div'): HTMLElement[] {
  while (pool.length < count) {
    const el = document.createElement(tag)
    el.className = className
    stage.appendChild(el)
    pool.push(el)
  }
  for (let i = 0; i < pool.length; i++) {
    pool[i]!.style.display = i < count ? '' : 'none'
  }
  return pool
}

// ── Helpers ─────────────────────────────────────────────────────────
function getPrepared(text: string, font: string): PreparedTextWithSegments {
  const key = `${font}::${text}`
  const cached = preparedByKey.get(key)
  if (cached !== undefined) return cached
  const prepared = prepareWithSegments(text, font)
  preparedByKey.set(key, prepared)
  return prepared
}

function getSingleLineWidth(prepared: PreparedTextWithSegments): number {
  let width = 0
  walkLineRanges(prepared, 100_000, line => { width = line.width })
  return width
}

function fitPullQuoteFontSize(text: string, maxWidth: number): number {
  let lo = 18, hi = 64
  while (hi - lo > 2) {
    const mid = Math.floor((lo + hi) / 2)
    const font = `900 ${mid}px ${PULL_QUOTE_FONT_FAMILY}`
    const prepared = getPrepared(text, font)
    const w = getSingleLineWidth(prepared)
    if (w <= maxWidth) lo = mid
    else hi = mid
  }
  return lo
}

// ── Obstacle interval carving (from editorial engine) ───────────────
function carveTextLineSlots(base: Interval, blocked: Interval[]): Interval[] {
  let slots = [base]
  for (let bi = 0; bi < blocked.length; bi++) {
    const iv = blocked[bi]!
    const next: Interval[] = []
    for (let si = 0; si < slots.length; si++) {
      const s = slots[si]!
      if (iv.right <= s.left || iv.left >= s.right) {
        next.push(s)
        continue
      }
      if (iv.left > s.left) next.push({ left: s.left, right: iv.left })
      if (iv.right < s.right) next.push({ left: iv.right, right: s.right })
    }
    slots = next
  }
  return slots.filter(s => s.right - s.left >= MIN_SLOT_WIDTH)
}

function getRectIntervalForBand(rects: Rect[], bandTop: number, bandBottom: number): Interval[] {
  const intervals: Interval[] = []
  for (const r of rects) {
    if (bandBottom <= r.y - PQ_V_PAD || bandTop >= r.y + r.h + PQ_V_PAD) continue
    intervals.push({ left: r.x - PQ_H_PAD, right: r.x + r.w + PQ_H_PAD })
  }
  return intervals
}

// ── Build continuous text + pull quote layout ───────────────────────
function buildTrackText(track: TrackLyrics): string {
  const parts: string[] = []
  for (const section of track.sections) {
    parts.push(section.lines.join('\n'))
  }
  return parts.join('\n\n')
}

type SectionMarker = { charOffset: number; label: string }
type PullQuotePlacement = { afterSection: number; text: string; side: 'left' | 'right' }

function getSectionMarkers(track: TrackLyrics): SectionMarker[] {
  const markers: SectionMarker[] = []
  let offset = 0
  for (const section of track.sections) {
    markers.push({ charOffset: offset, label: section.label })
    const text = section.lines.join('\n')
    offset += text.length + 2
  }
  return markers
}

function getPullQuotePlacements(track: TrackLyrics): PullQuotePlacement[] {
  const placements: PullQuotePlacement[] = []
  let side: 'left' | 'right' = 'right'
  for (let i = 0; i < track.sections.length; i++) {
    const section = track.sections[i]!
    if (section.pullQuote) {
      placements.push({ afterSection: i, text: section.pullQuote, side })
      side = side === 'right' ? 'left' : 'right'
    }
  }
  return placements
}

// ── Main layout engine ──────────────────────────────────────────────
function renderLyrics(track: TrackLyrics): void {
  const t0 = performance.now()
  domReads++
  const stageWidth = stage.offsetWidth
  const regionX = 0

  const fullText = buildTrackText(track)
  const prepared = getPrepared(fullText, BODY_FONT)
  const placements = getPullQuotePlacements(track)

  const pqBlocks: PullQuoteBlock[] = []
  const pqRects: Rect[] = []

  const firstPassResult = layout(prepared, stageWidth, BODY_LINE_HEIGHT)
  const totalTextHeight = firstPassResult.height

  for (let pi = 0; pi < placements.length; pi++) {
    const p = placements[pi]!
    const pqMaxW = Math.min(stageWidth * 0.55, 420)
    const fontSize = fitPullQuoteFontSize(p.text, pqMaxW - 20)
    const font = `900 ${fontSize}px ${PULL_QUOTE_FONT_FAMILY}`
    const pqPrepared = getPrepared(p.text, font)
    const pqLineHeight = Math.round(fontSize * 1.1)
    const pqResult = layoutWithLines(pqPrepared, pqMaxW - 20, pqLineHeight)
    const pqH = pqResult.height + PQ_V_PAD * 2
    const pqW = pqMaxW

    const yFrac = (pi + 1) / (placements.length + 1)
    const pqY = Math.round(totalTextHeight * yFrac * 0.7 + 60)
    const pqX = p.side === 'right' ? stageWidth - pqW : 0

    const rect: Rect = { x: pqX, y: pqY, w: pqW, h: pqH }
    pqRects.push(rect)

    const pqLines = pqResult.lines.map((l, i) => ({
      x: pqX + (p.side === 'right' ? 10 : 10),
      y: pqY + PQ_V_PAD + i * pqLineHeight,
      text: l.text,
    }))

    pqBlocks.push({ rect, text: p.text, font, lineHeight: pqLineHeight, lines: pqLines })
  }

  const allLines: PositionedLine[] = []
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let lineTop = 0
  let sectionCount = track.sections.length

  while (true) {
    const bandTop = lineTop
    const bandBottom = lineTop + BODY_LINE_HEIGHT

    const blocked = getRectIntervalForBand(pqRects, bandTop, bandBottom)
    const base: Interval = { left: regionX, right: regionX + stageWidth }
    const slots = carveTextLineSlots(base, blocked)

    if (slots.length === 0) {
      lineTop += BODY_LINE_HEIGHT
      if (lineTop > totalTextHeight + 400) break
      continue
    }

    slots.sort((a, b) => a.left - b.left)
    let exhausted = false

    for (const slot of slots) {
      const slotWidth = slot.right - slot.left
      const line = layoutNextLine(prepared, cursor, slotWidth)
      if (line === null) { exhausted = true; break }
      allLines.push({
        x: Math.round(slot.left),
        y: Math.round(lineTop),
        text: line.text,
        width: line.width,
        className: 'lyrics-line',
      })
      cursor = line.end
    }

    if (exhausted) break
    lineTop += BODY_LINE_HEIGHT
  }

  const totalHeight = lineTop + 80
  stage.style.height = `${totalHeight}px`

  syncPool(bodyLinePool, allLines.length, 'lyrics-line', 'span')
  for (let i = 0; i < allLines.length; i++) {
    const el = bodyLinePool[i]!
    const line = allLines[i]!
    el.textContent = line.text
    el.style.left = line.x + 'px'
    el.style.top = line.y + 'px'
    el.style.font = BODY_FONT
    el.style.lineHeight = BODY_LINE_HEIGHT + 'px'
    el.style.display = ''
  }
  for (let i = allLines.length; i < bodyLinePool.length; i++) {
    bodyLinePool[i]!.style.display = 'none'
  }

  let totalPQLines = 0
  for (const pq of pqBlocks) totalPQLines += pq.lines.length

  syncPool(pqBoxPool, pqBlocks.length, 'pq-box')
  syncPool(pqLinePool, totalPQLines, 'pq-line', 'span')

  let pqLineIdx = 0
  for (let pi = 0; pi < pqBlocks.length; pi++) {
    const pq = pqBlocks[pi]!
    const boxEl = pqBoxPool[pi]!
    boxEl.style.left = pq.rect.x + 'px'
    boxEl.style.top = pq.rect.y + 'px'
    boxEl.style.width = pq.rect.w + 'px'
    boxEl.style.height = pq.rect.h + 'px'
    boxEl.style.display = ''

    for (const line of pq.lines) {
      const el = pqLinePool[pqLineIdx]!
      el.textContent = line.text
      el.style.left = line.x + 'px'
      el.style.top = line.y + 'px'
      el.style.font = pq.font
      el.style.lineHeight = pq.lineHeight + 'px'
      el.style.display = ''
      pqLineIdx++
    }
  }
  for (let i = pqLineIdx; i < pqLinePool.length; i++) {
    pqLinePool[i]!.style.display = 'none'
  }

  const elapsed = performance.now() - t0
  statLines.textContent = String(allLines.length)
  statReflow.textContent = `${elapsed.toFixed(1)}ms`
  statDom.textContent = String(domReads)
  statSections.textContent = String(sectionCount)
}

// ── Sidebar + track selection ───────────────────────────────────────
function updateSidebar(track: TrackLyrics): void {
  titleEl.textContent = `${track.trackNum}_${track.title}`
  stampEl.textContent = track.stampId
  manifestList.innerHTML = ''
  for (const item of track.manifest) {
    const li = document.createElement('li')
    li.textContent = item
    manifestList.appendChild(li)
  }
  techData.innerHTML = `BPM: ${track.bpm}<br/>KEY: ${track.key}<br/>DURATION: ${track.duration}<br/>SOURCE: BULLY LP // YZY / GAMMA`
}

function buildTrackSelector(): void {
  for (let i = 0; i < TRACKS_LYRICS.length; i++) {
    const track = TRACKS_LYRICS[i]!
    const btn = document.createElement('button')
    btn.textContent = `${track.trackNum} — ${track.title}`
    btn.className = i === 0 ? 'active' : ''
    btn.addEventListener('click', () => {
      currentTrackIndex = i
      selectorContainer.querySelectorAll('button').forEach(b => b.className = '')
      btn.className = 'active'
      switchTrack(track)
    })
    selectorContainer.appendChild(btn)
  }
}

function switchTrack(track: TrackLyrics): void {
  updateSidebar(track)
  renderLyrics(track)
  updateSpotifyEmbed(track)
  const sideNavItems = document.querySelectorAll('.side-nav-items a')
  sideNavItems.forEach(a => {
    const el = a as HTMLAnchorElement
    el.className = el.textContent === track.trackNum ? 'active' : ''
  })
}

function render(): void {
  const track = TRACKS_LYRICS[currentTrackIndex]!
  renderLyrics(track)
}

await document.fonts.ready
buildTrackSelector()
switchTrack(TRACKS_LYRICS[0]!)

let rafPending = false
window.addEventListener('resize', () => {
  if (rafPending) return
  rafPending = true
  requestAnimationFrame(() => {
    rafPending = false
    render()
  })
})
