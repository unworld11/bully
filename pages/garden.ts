const canvas = document.getElementById('garden') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

let W = 0
let H = 0
let dpr = 1
let groundY = 0

function resize(): void {
  dpr = window.devicePixelRatio || 1
  W = window.innerWidth
  H = window.innerHeight
  canvas.width = W * dpr
  canvas.height = H * dpr
  canvas.style.width = W + 'px'
  canvas.style.height = H + 'px'
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  groundY = H * 0.55
  generateFlowers()
}

// ── Color Palettes ──────────────────────────────────────────────
const FLOWER_PALETTES = [
  ['#ff4d8b', '#ff69a0', '#ff85b5', '#ff1a6b'],  // hot pink / magenta
  ['#ff6b35', '#ff8c5a', '#ffad7e', '#ff4e0d'],  // coral / orange
  ['#4dc9f6', '#6dd5fa', '#8be0ff', '#2bb8ea'],  // sky blue
  ['#b39ddb', '#ce93d8', '#e1bee7', '#9575cd'],  // lavender / purple
  ['#fff176', '#fff59d', '#fffde7', '#ffee58'],  // sunny yellow
  ['#f8bbd0', '#f48fb1', '#f06292', '#fce4ec'],  // soft pink
  ['#80cbc4', '#4db6ac', '#26a69a', '#b2dfdb'],  // teal
  ['#ef5350', '#e57373', '#ef9a9a', '#f44336'],  // red
  ['#ffffff', '#e0e0e0', '#f5f5f5', '#bdbdbd'],  // white
]

const LEAF_GREENS = ['#1b5e20', '#2e7d32', '#388e3c', '#1a3a1a', '#0d2e0d', '#2d5a2d', '#174517']

type Flower = {
  x: number
  y: number
  stemH: number
  petalR: number
  palette: string[]
  type: number
  phase: number
  swaySpeed: number
  swayAmp: number
  leafCount: number
  depth: number // 0=back, 1=mid, 2=front
}

type Raindrop = {
  x: number
  y: number
  speed: number
  len: number
  alpha: number
}

type Sparkle = {
  x: number
  y: number
  r: number
  alpha: number
  decay: number
  hue: number
  vy: number
}

let flowers: Flower[] = []
let raindrops: Raindrop[] = []
let sparkles: Sparkle[] = []
let time = 0

function generateFlowers(): void {
  flowers = []
  const count = Math.floor(W / 8)
  for (let i = 0; i < count; i++) {
    const depth = i < count * 0.3 ? 0 : i < count * 0.7 ? 1 : 2
    const depthScale = depth === 0 ? 0.5 : depth === 1 ? 0.8 : 1.0
    const yBase = groundY + (depth === 0 ? -30 : depth === 1 ? 10 : 40)

    flowers.push({
      x: (i / count) * W + (Math.random() - 0.5) * (W / count),
      y: yBase + Math.random() * (H - yBase) * 0.6,
      stemH: (40 + Math.random() * 120) * depthScale,
      petalR: (4 + Math.random() * 14) * depthScale,
      palette: FLOWER_PALETTES[Math.floor(Math.random() * FLOWER_PALETTES.length)]!,
      type: Math.floor(Math.random() * 5),
      phase: Math.random() * Math.PI * 2,
      swaySpeed: 0.3 + Math.random() * 0.7,
      swayAmp: 2 + Math.random() * 6,
      leafCount: Math.floor(Math.random() * 3),
      depth,
    })
  }
  flowers.sort((a, b) => a.depth - b.depth || a.y - b.y)
}

function initRain(): void {
  raindrops = []
  for (let i = 0; i < 400; i++) {
    raindrops.push(makeRaindrop())
  }
}

function makeRaindrop(): Raindrop {
  return {
    x: Math.random() * W * 1.2 - W * 0.1,
    y: Math.random() * H * -1.5,
    speed: 6 + Math.random() * 10,
    len: 8 + Math.random() * 20,
    alpha: 0.08 + Math.random() * 0.25,
  }
}

function spawnSparkle(): void {
  sparkles.push({
    x: Math.random() * W,
    y: Math.random() * H * 0.7,
    r: 1 + Math.random() * 2.5,
    alpha: 0.6 + Math.random() * 0.4,
    decay: 0.003 + Math.random() * 0.008,
    hue: Math.random() * 60 + 20,
    vy: -0.1 - Math.random() * 0.3,
  })
}

// ── Drawing Functions ─────────────────────────────────────────

function drawSky(): void {
  const grad = ctx.createLinearGradient(0, 0, 0, groundY)
  grad.addColorStop(0, '#020208')
  grad.addColorStop(0.5, '#050510')
  grad.addColorStop(1, '#0a0a18')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, groundY + 20)

  const groundGrad = ctx.createLinearGradient(0, groundY - 20, 0, H)
  groundGrad.addColorStop(0, '#0a0a12')
  groundGrad.addColorStop(0.3, '#060810')
  groundGrad.addColorStop(1, '#020205')
  ctx.fillStyle = groundGrad
  ctx.fillRect(0, groundY - 20, W, H - groundY + 20)
}

function drawLeaf(x: number, y: number, angle: number, size: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.fillStyle = LEAF_GREENS[Math.floor(Math.random() * LEAF_GREENS.length)]!
  ctx.globalAlpha = 0.7
  ctx.beginPath()
  ctx.ellipse(0, 0, size * 0.3, size, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawFlower(f: Flower, t: number): void {
  const sway = Math.sin(t * f.swaySpeed + f.phase) * f.swayAmp
  const tipX = f.x + sway
  const tipY = f.y - f.stemH
  const depthAlpha = f.depth === 0 ? 0.4 : f.depth === 1 ? 0.7 : 1.0

  ctx.globalAlpha = depthAlpha

  // Stem
  ctx.strokeStyle = LEAF_GREENS[f.depth % LEAF_GREENS.length]!
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(f.x, f.y)
  ctx.quadraticCurveTo(f.x + sway * 0.3, f.y - f.stemH * 0.5, tipX, tipY)
  ctx.stroke()

  // Leaves on stem
  for (let i = 0; i < f.leafCount; i++) {
    const t2 = 0.3 + i * 0.25
    const lx = f.x + sway * 0.3 * t2
    const ly = f.y - f.stemH * t2
    const side = i % 2 === 0 ? -1 : 1
    drawLeaf(lx, ly, side * (0.3 + Math.random() * 0.4), 6 + f.petalR * 0.5)
  }

  // Flower head
  ctx.save()
  ctx.translate(tipX, tipY)
  const c = f.palette

  switch (f.type) {
    case 0: // Multi-petal round flower
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2
        ctx.fillStyle = c[i % c.length]!
        ctx.beginPath()
        ctx.ellipse(
          Math.cos(a) * f.petalR * 0.5,
          Math.sin(a) * f.petalR * 0.5,
          f.petalR * 0.6,
          f.petalR * 0.3,
          a, 0, Math.PI * 2
        )
        ctx.fill()
      }
      ctx.fillStyle = '#ffeb3b'
      ctx.beginPath()
      ctx.arc(0, 0, f.petalR * 0.25, 0, Math.PI * 2)
      ctx.fill()
      break

    case 1: // Tulip shape
      ctx.fillStyle = c[0]!
      ctx.beginPath()
      ctx.moveTo(0, -f.petalR)
      ctx.quadraticCurveTo(-f.petalR * 0.8, -f.petalR * 0.2, -f.petalR * 0.4, f.petalR * 0.3)
      ctx.quadraticCurveTo(0, f.petalR * 0.1, f.petalR * 0.4, f.petalR * 0.3)
      ctx.quadraticCurveTo(f.petalR * 0.8, -f.petalR * 0.2, 0, -f.petalR)
      ctx.fill()
      ctx.fillStyle = c[1]!
      ctx.globalAlpha *= 0.5
      ctx.beginPath()
      ctx.moveTo(0, -f.petalR * 0.6)
      ctx.quadraticCurveTo(-f.petalR * 0.3, 0, 0, f.petalR * 0.2)
      ctx.quadraticCurveTo(f.petalR * 0.3, 0, 0, -f.petalR * 0.6)
      ctx.fill()
      break

    case 2: // Daisy
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        ctx.fillStyle = c[i % 2 === 0 ? 0 : 2]!
        ctx.save()
        ctx.rotate(a)
        ctx.beginPath()
        ctx.ellipse(0, -f.petalR * 0.7, f.petalR * 0.15, f.petalR * 0.5, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      ctx.fillStyle = '#ffd54f'
      ctx.beginPath()
      ctx.arc(0, 0, f.petalR * 0.3, 0, Math.PI * 2)
      ctx.fill()
      break

    case 3: // Simple blossom cluster
      for (let i = 0; i < 5; i++) {
        const ox = (Math.random() - 0.5) * f.petalR
        const oy = (Math.random() - 0.5) * f.petalR
        ctx.fillStyle = c[Math.floor(Math.random() * c.length)]!
        ctx.beginPath()
        ctx.arc(ox, oy, f.petalR * 0.3 + Math.random() * f.petalR * 0.3, 0, Math.PI * 2)
        ctx.fill()
      }
      break

    case 4: // Tall spike flower (like lavender/delphinium)
      for (let i = 0; i < 8; i++) {
        const yy = -i * f.petalR * 0.35
        ctx.fillStyle = c[i % c.length]!
        ctx.globalAlpha = depthAlpha * (0.6 + i * 0.05)
        ctx.beginPath()
        ctx.arc((Math.random() - 0.5) * 3, yy, f.petalR * 0.2 + Math.random() * 2, 0, Math.PI * 2)
        ctx.fill()
      }
      break
  }

  ctx.restore()
  ctx.globalAlpha = 1
}

function drawRain(): void {
  ctx.strokeStyle = 'rgba(180, 200, 255, 0.5)'
  ctx.lineWidth = 0.8
  for (const drop of raindrops) {
    ctx.globalAlpha = drop.alpha
    ctx.beginPath()
    ctx.moveTo(drop.x, drop.y)
    ctx.lineTo(drop.x - 1.5, drop.y + drop.len)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function drawSparkles(): void {
  for (const s of sparkles) {
    const grd = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 3)
    grd.addColorStop(0, `hsla(${s.hue}, 80%, 85%, ${s.alpha})`)
    grd.addColorStop(0.4, `hsla(${s.hue}, 70%, 70%, ${s.alpha * 0.5})`)
    grd.addColorStop(1, `hsla(${s.hue}, 60%, 50%, 0)`)
    ctx.fillStyle = grd
    ctx.fillRect(s.x - s.r * 3, s.y - s.r * 3, s.r * 6, s.r * 6)

    // Cross sparkle
    ctx.strokeStyle = `hsla(${s.hue}, 80%, 90%, ${s.alpha * 0.8})`
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(s.x - s.r * 1.5, s.y)
    ctx.lineTo(s.x + s.r * 1.5, s.y)
    ctx.moveTo(s.x, s.y - s.r * 1.5)
    ctx.lineTo(s.x, s.y + s.r * 1.5)
    ctx.stroke()
  }
}

function drawGlow(): void {
  // Ambient glow from the garden
  const glowGrad = ctx.createRadialGradient(W * 0.5, groundY + 40, 0, W * 0.5, groundY + 40, W * 0.6)
  glowGrad.addColorStop(0, 'rgba(80, 30, 60, 0.08)')
  glowGrad.addColorStop(0.5, 'rgba(40, 20, 60, 0.04)')
  glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = glowGrad
  ctx.fillRect(0, 0, W, H)
}

// ── Update Loop ──────────────────────────────────────────────

function update(): void {
  time += 0.016

  for (const drop of raindrops) {
    drop.y += drop.speed
    drop.x -= 1.5
    if (drop.y > H + 20) {
      drop.x = Math.random() * W * 1.2 - W * 0.1
      drop.y = Math.random() * -200
    }
  }

  if (Math.random() < 0.3) spawnSparkle()

  for (let i = sparkles.length - 1; i >= 0; i--) {
    const s = sparkles[i]!
    s.alpha -= s.decay
    s.y += s.vy
    if (s.alpha <= 0) sparkles.splice(i, 1)
  }
}

function draw(): void {
  ctx.clearRect(0, 0, W, H)
  drawSky()
  drawGlow()

  // Draw flowers by depth
  for (const f of flowers) {
    if (f.depth === 0) drawFlower(f, time)
  }
  for (const f of flowers) {
    if (f.depth === 1) drawFlower(f, time)
  }

  drawRain()
  drawSparkles()

  for (const f of flowers) {
    if (f.depth === 2) drawFlower(f, time)
  }
}

function loop(): void {
  update()
  draw()
  requestAnimationFrame(loop)
}

resize()
initRain()
window.addEventListener('resize', resize)
requestAnimationFrame(loop)
