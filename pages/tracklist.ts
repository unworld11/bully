import { prepareWithSegments, walkLineRanges, type PreparedTextWithSegments } from '@chenglou/pretext'

type Track = {
  id: string
  title: string
  feat?: string
  duration: string
  bitrate: string
}

const TRACKS: Track[] = [
  { id: '01', title: 'KING', duration: '02:06', bitrate: '24-BIT/96KHZ' },
  { id: '02', title: 'THIS A MUST', duration: '01:26', bitrate: '24-BIT/96KHZ' },
  { id: '03', title: 'FATHER', feat: 'Travis Scott', duration: '02:49', bitrate: '24-BIT/96KHZ' },
  { id: '04', title: 'ALL THE LOVE', feat: 'Andre Troutman', duration: '03:49', bitrate: '24-BIT/96KHZ' },
  { id: '05', title: 'PUNCH DRUNK', duration: '01:48', bitrate: '24-BIT/96KHZ' },
  { id: '06', title: 'WHATEVER WORKS', duration: '01:59', bitrate: '24-BIT/96KHZ' },
  { id: '07', title: "MAMA'S FAVORITE", duration: '02:34', bitrate: '24-BIT/96KHZ' },
  { id: '08', title: 'SISTERS AND BROTHERS', duration: '02:46', bitrate: '24-BIT/96KHZ' },
  { id: '09', title: 'BULLY', feat: 'CeeLo Green', duration: '02:27', bitrate: '24-BIT/96KHZ' },
  { id: '10', title: 'HIGHS AND LOWS', duration: '01:51', bitrate: '24-BIT/96KHZ' },
  { id: '11', title: "I CAN'T WAIT", duration: '02:07', bitrate: '24-BIT/96KHZ' },
  { id: '12', title: 'WHITE LINES', feat: 'Andre Troutman', duration: '02:10', bitrate: '24-BIT/96KHZ' },
  { id: '13', title: 'CIRCLES', feat: 'Don Toliver', duration: '01:31', bitrate: '24-BIT/96KHZ' },
  { id: '14', title: 'PREACHER MAN', duration: '03:01', bitrate: '24-BIT/96KHZ' },
  { id: '15', title: 'BEAUTY AND THE BEAST', duration: '01:45', bitrate: '24-BIT/96KHZ' },
  { id: '16', title: 'DAMN', duration: '02:02', bitrate: '24-BIT/96KHZ' },
  { id: '17', title: 'LAST BREATH', feat: 'Peso Pluma', duration: '03:06', bitrate: '24-BIT/96KHZ' },
  { id: '18', title: 'THIS ONE HERE', duration: '03:01', bitrate: '24-BIT/96KHZ' },
]

const TITLE_FONT = '700 24px "Epilogue", sans-serif'
const preparedByKey = new Map<string, PreparedTextWithSegments>()

function getPrepared(text: string, font: string): PreparedTextWithSegments {
  const key = `${font}::${text}`
  const cached = preparedByKey.get(key)
  if (cached !== undefined) return cached
  const prepared = prepareWithSegments(text, font)
  preparedByKey.set(key, prepared)
  return prepared
}

function measureTitleWidth(text: string): number {
  const prepared = getPrepared(text, TITLE_FONT)
  let width = 0
  walkLineRanges(prepared, 100_000, line => { width = line.width })
  return Math.ceil(width)
}

function buildSideNav(): void {
  const container = document.getElementById('side-nav-items')!
  for (const track of TRACKS) {
    const a = document.createElement('a')
    a.href = `#track-${track.id}`
    a.textContent = track.id
    a.className = track.id === '01' ? 'active' : ''
    container.appendChild(a)
  }
}

function buildLedger(): void {
  const t0 = performance.now()
  const ledger = document.getElementById('ledger')!
  let measuredCount = 0

  const header = document.createElement('div')
  header.className = 'ledger-header'
  header.innerHTML = `
    <div>ID</div>
    <div>COMPOSITION_TITLE / FEATURES</div>
    <div>DURATION</div>
    <div>BITRATE</div>
  `
  ledger.appendChild(header)

  const titleWidths: { title: string; width: number }[] = []

  for (const track of TRACKS) {
    const displayText = track.feat ? `${track.title}  (feat. ${track.feat})` : track.title
    const width = measureTitleWidth(track.title)
    titleWidths.push({ title: track.title, width })
    measuredCount++

    const row = document.createElement('div')
    row.className = 'ledger-row'
    row.id = `track-${track.id}`

    const idCell = document.createElement('div')
    idCell.innerHTML = `<span class="track-id">${track.id}</span>`

    const titleCell = document.createElement('div')
    const titleSpan = document.createElement('span')
    titleSpan.className = 'track-title'
    titleSpan.textContent = track.title
    titleSpan.setAttribute('data-pretext-width', String(width))
    titleCell.appendChild(titleSpan)

    if (track.feat) {
      const featSpan = document.createElement('span')
      featSpan.className = 'track-feat'
      featSpan.textContent = `(feat. ${track.feat})`
      titleCell.appendChild(featSpan)
    }

    const durationCell = document.createElement('div')
    durationCell.innerHTML = `<span class="track-duration">${track.duration}</span>`

    const bitrateCell = document.createElement('div')
    bitrateCell.innerHTML = `<span class="track-bitrate">${track.bitrate}</span>`

    row.appendChild(idCell)
    row.appendChild(titleCell)
    row.appendChild(durationCell)
    row.appendChild(bitrateCell)
    ledger.appendChild(row)
  }

  const elapsed = performance.now() - t0

  document.getElementById('stat-tracks')!.textContent = String(TRACKS.length)
  document.getElementById('stat-measured')!.textContent = String(measuredCount)
  document.getElementById('stat-reflow')!.textContent = `${elapsed.toFixed(1)}ms`

  const maxWidth = Math.max(...titleWidths.map(t => t.width))
  console.log(`[pretext] Measured ${measuredCount} track titles in ${elapsed.toFixed(1)}ms`)
  console.log(`[pretext] Widest title: ${maxWidth}px`)
}

function highlightSideNav(): void {
  const items = document.querySelectorAll('.side-nav-items a')
  const rows = document.querySelectorAll('.ledger-row')
  const scrollY = window.scrollY + window.innerHeight / 2

  let activeId = '01'
  for (const row of rows) {
    const el = row as HTMLElement
    if (el.offsetTop < scrollY) {
      activeId = el.id.replace('track-', '')
    }
  }

  items.forEach(item => {
    const a = item as HTMLAnchorElement
    a.className = a.textContent === activeId ? 'active' : ''
  })
}

await document.fonts.ready
buildSideNav()
buildLedger()

window.addEventListener('scroll', () => {
  requestAnimationFrame(highlightSideNav)
}, { passive: true })
