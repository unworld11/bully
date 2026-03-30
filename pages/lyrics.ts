import {
  prepareWithSegments,
  walkLineRanges,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'
import { TRACKS_LYRICS, type TrackLyrics } from './lyrics-data.ts'
import './analytics.ts'

function updateSpotifyEmbed(track: TrackLyrics): void {
  const iframe = document.querySelector('#spotify-mini-body iframe') as HTMLIFrameElement | null
  if (iframe && track.spotifyId) {
    iframe.src = `https://open.spotify.com/embed/track/${track.spotifyId}?utm_source=generator&theme=0`
  }
}

const BODY_FONT = '300 17px "Space Grotesk", sans-serif'

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
const sparkleCanvas = document.getElementById('sparkle-canvas') as HTMLCanvasElement
const sCtx = sparkleCanvas.getContext('2d')!

const preparedByKey = new Map<string, PreparedTextWithSegments>()
let currentTrackIndex = 0

function getPrepared(text: string, font: string): PreparedTextWithSegments {
  const key = `${font}::${text}`
  const cached = preparedByKey.get(key)
  if (cached !== undefined) return cached
  const prepared = prepareWithSegments(text, font)
  preparedByKey.set(key, prepared)
  return prepared
}

function measureLine(text: string): number {
  const prepared = getPrepared(text, BODY_FONT)
  let width = 0
  walkLineRanges(prepared, 100_000, line => { width = line.width })
  return width
}

// ── Sparkle particle system ─────────────────────────────────────────
type Particle = {
  x: number; y: number; vx: number; vy: number
  size: number; life: number; maxLife: number
  color: string; alpha: number
}

let particles: Particle[] = []
let sW = 0, sH = 0
const COLORS = ['#ffffff', '#c9a0ff', '#7eb8ff', '#ff9ec4', '#ffd07e']

function resizeSparkle(): void {
  const dpr = window.devicePixelRatio || 1
  const rect = stage.getBoundingClientRect()
  sW = rect.width
  sH = Math.max(rect.height, 400)
  sparkleCanvas.width = sW * dpr
  sparkleCanvas.height = sH * dpr
  sparkleCanvas.style.width = sW + 'px'
  sparkleCanvas.style.height = sH + 'px'
  sCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function spawn(x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const sp = 0.2 + Math.random() * 1.0
    particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 0.2,
      size: 0.8 + Math.random() * 2,
      life: 0,
      maxLife: 30 + Math.random() * 50,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      alpha: 0.3 + Math.random() * 0.5,
    })
  }
}

function sparkleFrame(): void {
  sCtx.clearRect(0, 0, sW, sH)

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]!
    p.x += p.vx
    p.y += p.vy
    p.vy += 0.006
    p.life++
    if (p.life >= p.maxLife) { particles.splice(i, 1); continue }

    const t = p.life / p.maxLife
    const a = p.alpha * (1 - t * t)
    const r = p.size * (1 - t * 0.4)

    sCtx.globalAlpha = a
    sCtx.beginPath()
    sCtx.arc(p.x, p.y, r, 0, Math.PI * 2)
    sCtx.fillStyle = p.color
    sCtx.fill()

    sCtx.globalAlpha = a * 0.25
    const g = sCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4)
    g.addColorStop(0, p.color)
    g.addColorStop(1, 'transparent')
    sCtx.fillStyle = g
    sCtx.beginPath()
    sCtx.arc(p.x, p.y, r * 4, 0, Math.PI * 2)
    sCtx.fill()
  }

  sCtx.globalAlpha = 1
  if (Math.random() < 0.05 && sW > 0) {
    spawn(Math.random() * sW, Math.random() * sH, 1)
  }

  requestAnimationFrame(sparkleFrame)
}

stage.addEventListener('mousemove', e => {
  const rect = stage.getBoundingClientRect()
  spawn(e.clientX - rect.left, e.clientY - rect.top, 2)
})

// ── Render lyrics as two-column verses ──────────────────────────────
function renderLyrics(track: TrackLyrics): void {
  const t0 = performance.now()

  const old = stage.querySelector('.verse-columns')
  if (old) old.remove()

  const sections = track.sections
  let totalLines = 0

  const cols = document.createElement('div')
  cols.className = 'verse-columns'
  const left = document.createElement('div')
  left.className = 'verse-column'
  const right = document.createElement('div')
  right.className = 'verse-column'

  const sizes = sections.map(s => s.lines.length + 2)
  const total = sizes.reduce((a, b) => a + b, 0)
  let acc = 0
  let split = 1
  for (let i = 0; i < sections.length; i++) {
    acc += sizes[i]!
    if (acc >= total / 2) { split = i + 1; break }
  }
  if (split >= sections.length) split = Math.max(1, sections.length - 1)

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i]!
    const col = i < split ? left : right
    const stanza = document.createElement('div')
    stanza.className = 'verse-stanza' + (sec.muted ? ' muted' : '')

    const lbl = document.createElement('div')
    lbl.className = 'verse-label'
    lbl.textContent = sec.label
    stanza.appendChild(lbl)

    for (const line of sec.lines) {
      const el = document.createElement('div')
      el.className = 'verse-line'
      el.textContent = line
      stanza.appendChild(el)
      totalLines++
      measureLine(line)
    }
    col.appendChild(stanza)
  }

  cols.appendChild(left)
  cols.appendChild(right)
  stage.appendChild(cols)

  const elapsed = performance.now() - t0
  statLines.textContent = String(totalLines)
  statReflow.textContent = `${elapsed.toFixed(1)}ms`
  statDom.textContent = String(totalLines + sections.length)
  statSections.textContent = String(sections.length)

  requestAnimationFrame(resizeSparkle)
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

// ── Init ────────────────────────────────────────────────────────────
await document.fonts.ready
buildTrackSelector()

const urlTrackId = new URLSearchParams(window.location.search).get('track')
let startIndex = 0
if (urlTrackId) {
  const idx = TRACKS_LYRICS.findIndex(t => t.id === urlTrackId)
  if (idx !== -1) startIndex = idx
}
currentTrackIndex = startIndex
selectorContainer.querySelectorAll('button')[startIndex]?.classList.add('active')
selectorContainer.querySelectorAll('button').forEach((b, i) => {
  b.className = i === startIndex ? 'active' : ''
})
switchTrack(TRACKS_LYRICS[startIndex]!)

sparkleFrame()

let rafPending = false
window.addEventListener('resize', () => {
  if (rafPending) return
  rafPending = true
  requestAnimationFrame(() => {
    rafPending = false
    renderLyrics(TRACKS_LYRICS[currentTrackIndex]!)
  })
})
