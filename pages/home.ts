import { prepareWithSegments, type PreparedTextWithSegments } from '@chenglou/pretext'
import './analytics.ts'

// ── Config ──────────────────────────────────────────────────────────
const FONT_SIZE = 14
const LINE_HEIGHT = 17
const PROP_FAMILY = '"Space Grotesk", sans-serif'
const CHARSET = ' .,:;!+-=*#@%&abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const WEIGHTS = [300, 500, 700] as const
const FONT_STYLES = ['normal', 'italic'] as const
const MAX_COLS = 220
const MAX_ROWS = 90

// ── Brightness measurement ──────────────────────────────────────────
const bCvs = document.createElement('canvas')
bCvs.width = bCvs.height = 28
const bCtx = bCvs.getContext('2d', { willReadFrequently: true })!

function estimateBrightness(ch: string, font: string): number {
  bCtx.clearRect(0, 0, 28, 28)
  bCtx.font = font
  bCtx.fillStyle = '#fff'
  bCtx.textBaseline = 'middle'
  bCtx.fillText(ch, 1, 14)
  const d = bCtx.getImageData(0, 0, 28, 28).data
  let sum = 0
  for (let i = 3; i < d.length; i += 4) sum += d[i]
  return sum / (255 * 784)
}

// ── Build character palette with pretext-measured widths ─────────────
type PaletteEntry = {
  char: string
  weight: number
  style: string
  font: string
  width: number
  brightness: number
}

const palette: PaletteEntry[] = []
for (const style of FONT_STYLES) {
  for (const weight of WEIGHTS) {
    const font = `${style === 'italic' ? 'italic ' : ''}${weight} ${FONT_SIZE}px ${PROP_FAMILY}`
    for (const ch of CHARSET) {
      if (ch === ' ') continue
      const p = prepareWithSegments(ch, font)
      const width = (p as any).widths?.length > 0 ? (p as any).widths[0] : 0
      if (width <= 0) continue
      palette.push({ char: ch, weight, style, font, width, brightness: estimateBrightness(ch, font) })
    }
  }
}

const maxB = Math.max(...palette.map(p => p.brightness))
if (maxB > 0) for (const p of palette) p.brightness /= maxB
palette.sort((a, b) => a.brightness - b.brightness)

const avgCharW = palette.reduce((s, p) => s + p.width, 0) / palette.length
const aspect = avgCharW / LINE_HEIGHT
const aspect2 = aspect * aspect
const spaceW = FONT_SIZE * 0.27

// ── Character selection ─────────────────────────────────────────────
function findBest(targetB: number, targetW: number): PaletteEntry {
  let lo = 0, hi = palette.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (palette[mid]!.brightness < targetB) lo = mid + 1
    else hi = mid
  }
  let bestScore = Infinity, best = palette[lo]!
  for (let i = Math.max(0, lo - 15); i < Math.min(palette.length, lo + 15); i++) {
    const p = palette[i]!
    const score = Math.abs(p.brightness - targetB) * 2.5 + Math.abs(p.width - targetW) / targetW
    if (score < bestScore) { bestScore = score; best = p }
  }
  return best
}

function esc(c: string): string {
  if (c === '&') return '&amp;'
  if (c === '<') return '&lt;'
  if (c === '>') return '&gt;'
  return c
}

function wCls(w: number, s: string): string {
  const wc = w === 300 ? 'w3' : w === 500 ? 'w5' : 'w7'
  return s === 'italic' ? wc + ' it' : wc
}

// ── DOM setup ───────────────────────────────────────────────────────
const artEl = document.getElementById('fluid-art')!
const statsGrid = document.getElementById('stat-grid')!
const statsFps = document.getElementById('stat-fps')!
const statsVariants = document.getElementById('stat-variants')!

let COLS = 0
let ROWS = 0
let rowEls: HTMLDivElement[] = []
let density: Float32Array
let tempDen: Float32Array

// ── Emitters — orbiting heat sources ────────────────────────────────
const emitters = [
  { cx: 0.25, cy: 0.35, orbitR: 0.14, freq: 0.3, phase: 0, strength: 0.18 },
  { cx: 0.7, cy: 0.30, orbitR: 0.1, freq: 0.25, phase: 2.1, strength: 0.15 },
  { cx: 0.45, cy: 0.60, orbitR: 0.16, freq: 0.35, phase: 4.2, strength: 0.2 },
  { cx: 0.8, cy: 0.55, orbitR: 0.08, freq: 0.4, phase: 1, strength: 0.14 },
  { cx: 0.5, cy: 0.45, orbitR: 0.20, freq: 0.2, phase: 3.0, strength: 0.22 },
]

// ── Fluid velocity field ────────────────────────────────────────────
function getVel(c: number, r: number, t: number): [number, number] {
  const nx = c / COLS, ny = r / ROWS
  let vx = Math.sin(ny * 6.28 + t * 0.3) * 2
    + Math.cos((nx + ny) * 12.5 + t * 0.55) * 0.7
    + Math.sin(nx * 25 + ny * 18 + t * 0.8) * 0.25
  let vy = Math.cos(nx * 5 + t * 0.4) * 1.5
    + Math.sin((nx - ny) * 10 + t * 0.4) * 0.8
    + Math.cos(nx * 18 - ny * 25 + t * 0.7) * 0.25
  vy *= aspect
  return [vx, vy]
}

// ── Simulation step ─────────────────────────────────────────────────
function updateSim(t: number): void {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const [vx, vy] = getVel(c, r, t)
      const sx = Math.max(0, Math.min(COLS - 1.001, c - vx))
      const sy = Math.max(0, Math.min(ROWS - 1.001, r - vy))
      const x0 = sx | 0, y0 = sy | 0
      const x1 = Math.min(x0 + 1, COLS - 1), y1 = Math.min(y0 + 1, ROWS - 1)
      const fx = sx - x0, fy = sy - y0
      tempDen[r * COLS + c] =
        density[y0 * COLS + x0]! * (1 - fx) * (1 - fy) +
        density[y0 * COLS + x1]! * fx * (1 - fy) +
        density[y1 * COLS + x0]! * (1 - fx) * fy +
        density[y1 * COLS + x1]! * fx * fy
    }
  }
  ;[density, tempDen] = [tempDen, density]

  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      const i = r * COLS + c
      const avg = (density[i - 1]! + density[i + 1]! + (density[i - COLS]! + density[i + COLS]!) * aspect2) / (2 + 2 * aspect2)
      tempDen[i] = density[i]! * 0.92 + avg * 0.08
    }
  }
  ;[density, tempDen] = [tempDen, density]

  const spread = 4
  for (const e of emitters) {
    const ex = (e.cx + Math.cos(t * e.freq + e.phase) * e.orbitR) * COLS
    const ey = (e.cy + Math.sin(t * e.freq * 0.7 + e.phase) * e.orbitR * 0.8) * ROWS
    const ec = ex | 0, er = ey | 0
    for (let dr = -spread; dr <= spread; dr++) {
      for (let dc = -spread; dc <= spread; dc++) {
        const rr = er + dr, cc = ec + dc
        if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
          const drScaled = dr / aspect
          const dist = Math.sqrt(drScaled * drScaled + dc * dc)
          const s = Math.max(0, 1 - dist / (spread + 1))
          density[rr * COLS + cc] = Math.min(1, density[rr * COLS + cc]! + s * e.strength)
        }
      }
    }
  }

  for (let i = 0; i < COLS * ROWS; i++) density[i]! *= 0.984
}

// ── Grid init ───────────────────────────────────────────────────────
function initGrid(): void {
  const heroEl = document.getElementById('fluid-art')!
  const rect = heroEl.parentElement!.getBoundingClientRect()
  COLS = Math.min(MAX_COLS, Math.floor(rect.width / avgCharW))
  ROWS = Math.min(MAX_ROWS, Math.floor(rect.height / LINE_HEIGHT))
  density = new Float32Array(COLS * ROWS)
  tempDen = new Float32Array(COLS * ROWS)
  artEl.innerHTML = ''
  rowEls = []
  for (let r = 0; r < ROWS; r++) {
    const div = document.createElement('div')
    div.className = 'smoke-row'
    div.style.height = div.style.lineHeight = LINE_HEIGHT + 'px'
    artEl.appendChild(div)
    rowEls.push(div)
  }
  statsGrid.textContent = `${COLS}×${ROWS}`
  statsVariants.textContent = String(palette.length)
}

let resizeTimer = 0
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(initGrid, 150) as unknown as number
})

// ── Render loop ─────────────────────────────────────────────────────
let fc = 0
let lastFps = 0
let dispFps = 0

function render(now: number): void {
  requestAnimationFrame(render)
  const t = now / 1000
  updateSim(t)

  const tcw = artEl.parentElement!.getBoundingClientRect().width / COLS

  for (let r = 0; r < ROWS; r++) {
    let html = ''
    for (let c = 0; c < COLS; c++) {
      const b = density[r * COLS + c]!
      if (b < 0.025) {
        html += ' '
      } else {
        const m = findBest(b, tcw)
        const ai = Math.max(1, Math.min(10, Math.round(b * 10)))
        html += `<span class="${wCls(m.weight, m.style)} a${ai}">${esc(m.char)}</span>`
      }
    }
    rowEls[r]!.innerHTML = html
  }

  fc++
  if (now - lastFps > 500) {
    dispFps = Math.round(fc / ((now - lastFps) / 1000))
    fc = 0
    lastFps = now
    statsFps.textContent = String(dispFps)
  }
}

await document.fonts.ready
initGrid()
requestAnimationFrame(render)
