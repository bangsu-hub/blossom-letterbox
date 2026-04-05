import { useState, useEffect, useRef } from 'react'
import html2canvas from 'html2canvas'
// PortOne V1 타입 선언 (CDN 스크립트로 주입됨)
declare global {
  interface Window {
    IMP: {
      init(merchantId: string): void
      request_pay(
        params: {
          pg: string; pay_method: string; merchant_uid: string
          name: string; amount: number
          buyer_email?: string; buyer_name?: string; buyer_tel?: string
          m_redirect_url?: string
        },
        callback: (rsp: {
          success: boolean; imp_uid: string; merchant_uid: string; error_msg?: string
        }) => void
      ): void
    }
  }
}
import { Helmet } from 'react-helmet-async'
import { supabase } from './utils/supabase'
import { trackPageView, trackCreateMailbox, trackSendLetter, trackShareLink, trackWriteToCreate, trackPurchaseRollingPaper } from './utils/analytics'
import './App.css'

/* ═══════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════ */
type LetterType = '칭찬' | '응원' | '감사'
type Stage = 0 | 1 | 2 | 3
type Route =
  | { path: 'landing' }
  | { path: 'create' }
  | { path: 'dashboard'; userId: string }
  | { path: 'write'; userId: string }

interface Letter {
  id: string; box_id: string; type: LetterType; message: string
  from_name: string; is_anonymous: boolean; created_at: string
  deleted_at: string | null
}
interface LetterBox {
  id: string; nickname: string; letters: Letter[]
}

/* ═══════════════════════════════════════════════════════════
   CONSTANTS — FLOWER SPOTS (균등 분포: 나무 전체에 고루)
═══════════════════════════════════════════════════════════ */
const FLOWER_SPOTS: { x: number; y: number }[] = [
  // 1차: 중앙 코어
  { x: 193, y: 64 },
  { x: 178, y: 74 },
  { x: 208, y: 74 },
  { x: 185, y: 90 },
  { x: 201, y: 90 },
  { x: 172, y: 102 },
  { x: 218, y: 102 },
  { x: 190, y: 108 },

  // 2차: 중앙 볼륨 확장
  { x: 158, y: 118 },
  { x: 228, y: 118 },
  { x: 175, y: 122 },
  { x: 210, y: 122 },
  { x: 145, y: 132 },
  { x: 242, y: 132 },
  { x: 162, y: 138 },
  { x: 225, y: 138 },

  // 3차: 좌우 중간층
  { x: 126, y: 124 },
  { x: 263, y: 124 },
  { x: 112, y: 136 },
  { x: 278, y: 136 },
  { x: 98, y: 148 },
  { x: 292, y: 148 },
  { x: 130, y: 148 },
  { x: 250, y: 148 },

  // 4차: 아래쪽 빈 공간 보강
  { x: 146, y: 154 },
  { x: 190, y: 146 },
  { x: 234, y: 154 },
  { x: 116, y: 160 },
  { x: 264, y: 160 },
  { x: 84, y: 172 },
  { x: 306, y: 172 },

  // 5차: 바깥 날개
  { x: 70, y: 162 },
  { x: 320, y: 162 },
  { x: 52, y: 152 },
  { x: 338, y: 152 },

  // 6차: 하단 좌우 가지 보강
  { x: 118, y: 172 },
  { x: 138, y: 180 },
  { x: 158, y: 188 },

  { x: 272, y: 172 },
  { x: 252, y: 180 },
  { x: 232, y: 188 },

  // 7차: 하단 바깥쪽 끝 보강
  { x: 88, y: 186 },
  { x: 72, y: 194 },
  { x: 302, y: 186 },
  { x: 318, y: 194 },

  // 8차: 줄기 가까운 하단 내부 보강
  { x: 172, y: 176 },
  { x: 208, y: 176 },

  // 하단 살짝 추가
  { x: 132, y: 186 },
  { x: 152, y: 194 },
  { x: 172, y: 188 },

  { x: 248, y: 186 },
  { x: 228, y: 194 },
  { x: 208, y: 188 },

  // 하단 고르게 보강
  { x: 118, y: 198 },
  { x: 144, y: 204 },
  { x: 168, y: 198 },
  { x: 186, y: 204 },

  { x: 214, y: 204 },
  { x: 232, y: 198 },
  { x: 256, y: 204 },
  { x: 282, y: 198 },
]

const FLOWER_GROUPS = {
  top: FLOWER_SPOTS.filter(p => p.y < 90),
  upper: FLOWER_SPOTS.filter(p => p.y >= 90 && p.y < 120),
  mid: FLOWER_SPOTS.filter(p => p.y >= 120 && p.y < 150),
  lower: FLOWER_SPOTS.filter(p => p.y >= 150 && p.y < 180),
  bottom: FLOWER_SPOTS.filter(p => p.y >= 180),
}

function pickBalanced(count: number) {
  const orderedGroups = [
    FLOWER_GROUPS.top,
    FLOWER_GROUPS.upper,
    FLOWER_GROUPS.mid,
    FLOWER_GROUPS.upper,
    FLOWER_GROUPS.mid,
    FLOWER_GROUPS.lower,
    FLOWER_GROUPS.mid,
    FLOWER_GROUPS.upper,
    FLOWER_GROUPS.lower,
    FLOWER_GROUPS.bottom,
  ]

  const result: { x: number; y: number }[] = []
  const used = new Set<string>()
  let i = 0

  while (result.length < count) {
    const group = orderedGroups[i % orderedGroups.length]

    if (group.length > 0) {
      const idx = Math.floor(i / orderedGroups.length) % group.length
      const spot = group[idx]
      const key = `${spot.x}-${spot.y}`

      if (!used.has(key)) {
        result.push(spot)
        used.add(key)
      }
    }

    i++
    if (i > 1000) break
  }

  return result
}

const LEAF_SPOTS = [
  { x: 148, y: 130, a: -22 }, { x: 170, y: 150, a: 18 },
  { x: 220, y: 130, a: 22 }, { x: 206, y: 150, a: -18 },
  { x: 100, y: 150, a: -30 }, { x: 83, y: 172, a: 26 },
  { x: 300, y: 150, a: 30 }, { x: 316, y: 172, a: -26 },
  { x: 176, y: 112, a: -12 }, { x: 210, y: 112, a: 12 },
  { x: 62, y: 186, a: -20 }, { x: 342, y: 186, a: 20 },
]

const TYPE_META: Record<LetterType, {
  color: string; soft: string; bg: string; pill: string; emoji: string; desc: string
}> = {
  '칭찬': { color: '#FF6B9D', soft: '#FFB3CC', bg: '#FFF0F6', pill: '#FFE0EE', emoji: '✨', desc: '잘한 점을 콕 집어서' },
  '응원': { color: '#FF8C42', soft: '#FFBD85', bg: '#FFF4EE', pill: '#FFE5D0', emoji: '🔥', desc: '힘내라고 등 두드려주며' },
  '감사': { color: '#A78BFA', soft: '#C4B5FD', bg: '#F5F0FF', pill: '#E8DDFF', emoji: '🌸', desc: '마음 깊이 고마움을' },
}

interface StageConf {
  skyA: string; skyB: string; ground: string
  trunkColor: string; bodyBg: string
  label: string; labelEmoji: string
  hasSun: boolean; hasHills: boolean
  flowerScale: number // 단계별 꽃 크기 배율
}
const STAGE_CONF: StageConf[] = [
  {
    skyA: '#E8E8EC', skyB: '#DCDCE2', ground: '#B4C0AC',
    trunkColor: '#9A8880', bodyBg: '#F2F2F2',
    label: '봄을 기다리는 중...', labelEmoji: '🌱',
    hasSun: false, hasHills: false,
    flowerScale: 1.0,
  },
  {
    skyA: '#FFFDF9', skyB: '#FFF4EE', ground: '#C8D8A0',
    trunkColor: '#8B5E3C', bodyBg: '#FFFDF9',
    label: '봄이 오고 있어요', labelEmoji: '🌷',
    hasSun: false, hasHills: false,
    flowerScale: 1.15,
  },
  {
    skyA: '#FFEEF8', skyB: '#FFF5DC', ground: '#9CCA70',
    trunkColor: '#7A4830', bodyBg: '#FFF8F5',
    label: '꽃이 피기 시작했어요', labelEmoji: '🌸',
    hasSun: true, hasHills: true,
    flowerScale: 1.35,
  },
  {
    skyA: '#FFF5F7', skyB: '#EEF0FF', ground: '#7ABB50',
    trunkColor: '#6B3F22', bodyBg: '#FFF5F7',
    label: '활짝 피었어요!', labelEmoji: '🌸✨',
    hasSun: true, hasHills: true,
    flowerScale: 1.55,
  },
]

/* ═══════════════════════════════════════════════════════════
   ROUTING
═══════════════════════════════════════════════════════════ */

function getStage(count: number): Stage {
  if (count >= 5) return 3
  if (count >= 3) return 2
  if (count >= 1) return 1
  return 0
}

function parseRoute(pathname: string): Route {
  if (!pathname || pathname === '/') return { path: 'landing' }
  if (pathname === '/create') return { path: 'create' }
  const box = pathname.match(/^\/box\/([^/]+)$/)
  if (box) return { path: 'dashboard', userId: box[1] }
  const write = pathname.match(/^\/write\/([^/]+)$/)
  if (write) return { path: 'write', userId: write[1] }
  return { path: 'landing' }
}
const go = (path: string) => {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new Event('routechange'))
}

/* ═══════════════════════════════════════════════════════════
   GLOBAL CSS
═══════════════════════════════════════════════════════════ */
const CSS = `
  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root {
    height: 100%;
    font-family: 'Pretendard', -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
    background: #E8E0E8;
  }
  .app-shell {
    width: 100%;
    max-width: 430px;
    min-height: 100dvh;
    margin: 0 auto;
    position: relative;
    overflow-x: hidden;
    overflow-y: auto;
  }

  @keyframes petalFall {
    0%   { transform: translateY(-40px) rotate(var(--r0)) translateX(0); opacity:.9; }
    45%  { transform: translateY(48vh)  rotate(var(--r1)) translateX(var(--dx)); opacity:.75; }
    100% { transform: translateY(110vh) rotate(var(--r2)) translateX(0); opacity:0; }
  }
  @keyframes fadeUp {
    from { opacity:0; transform:translateY(18px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes slideUp {
    from { opacity:0; transform:translateY(100%); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes bloomIn {
    0%   { transform:scale(0) rotate(-35deg); opacity:0; }
    60%  { transform:scale(1.25) rotate(6deg); opacity:1; }
    100% { transform:scale(1) rotate(0); opacity:1; }
  }
  @keyframes slideUp {
    0%   { transform: translateY(100%); }
    100% { transform: translateY(0); }
  }
  @keyframes sway {
    0%,100% { transform-origin:50% 100%; transform:rotate(0deg); }
    25%      { transform-origin:50% 100%; transform:rotate(0.7deg); }
    75%      { transform-origin:50% 100%; transform:rotate(-0.7deg); }
  }
  @keyframes floatY {
    0%,100% { transform:translateY(0); }
    50%     { transform:translateY(-8px); }
  }
  @keyframes wiggle {
    0%,100% { transform:rotate(-4deg) scale(1); }
    50%     { transform:rotate(4deg) scale(1.09); }
  }
  @keyframes heartbeat {
    0%,100% { transform:scale(1); }
    30%     { transform:scale(1.08); }
    60%     { transform:scale(1.04); }
  }
  @keyframes shimmer {
    from { background-position:200% center; }
    to   { background-position:-200% center; }
  }
  @keyframes fadeIn {
    from { opacity:0; } to { opacity:1; }
  }
  @keyframes scaleIn {
    from { opacity:0; transform:scale(0.92); }
    to   { opacity:1; transform:scale(1); }
  }
  @keyframes shakePw {
    0%,100% { transform:translateX(0); }
    20%     { transform:translateX(-8px); }
    40%     { transform:translateX(8px); }
    60%     { transform:translateX(-6px); }
    80%     { transform:translateX(6px); }
  }
  @keyframes treeShake {
    0%,100% { transform:rotate(0deg); }
    18%     { transform:rotate(-1.4deg); }
    42%     { transform:rotate(1.1deg); }
    65%     { transform:rotate(-0.5deg); }
    84%     { transform:rotate(0.25deg); }
  }
  @keyframes petalFlutter {
    0%   { opacity:0.92; transform:translate(0,0) rotate3d(1,1,0.5,0deg) scale(1); }
    15%  { transform:translate(var(--sx), calc(var(--dy)*0.11)) rotate3d(0.8,1,0.3,55deg); }
    30%  { transform:translate(0px, calc(var(--dy)*0.26)) rotate3d(1,0.4,1,115deg); }
    45%  { transform:translate(calc(var(--sx)*-0.9), calc(var(--dy)*0.44)) rotate3d(0.3,1,0.6,175deg); opacity:0.78; }
    60%  { transform:translate(calc(var(--sx)*0.5), calc(var(--dy)*0.61)) rotate3d(1,0.7,0.2,235deg); }
    78%  { transform:translate(calc(var(--sx)*-0.5), calc(var(--dy)*0.80)) rotate3d(0.5,0.5,1,305deg); opacity:0.38; }
    100% { opacity:0; transform:translate(calc(var(--sx)*0.3),var(--dy)) rotate3d(1,1,0.5,420deg) scale(0.55); }
  }

  .screen-enter { animation:slideUp .38s cubic-bezier(0.22,1,0.36,1) forwards; }
  .shake { animation:shakePw 0.4s ease; }
  .tree-shake { transform-origin:195px 400px; animation:treeShake 0.95s cubic-bezier(0.36,0.07,0.19,0.97) both; }

  button { cursor:pointer; border:none; outline:none; font-family:inherit; }
  input, textarea { font-family:inherit; }
  ::-webkit-scrollbar { display:none; }
  * { scrollbar-width:none; }
`

/* ═══════════════════════════════════════════════════════════
   FALLING PETALS (Stage 3)
═══════════════════════════════════════════════════════════ */
const PETALS_POOL = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  left: 3 + (i * 97 / 19) % 91,
  delay: (i * 1.85) % 9,
  dur: 5.5 + (i * 1.1) % 4,
  size: 9 + (i * 0.85) % 8,
  r0: `${(i * 53) % 360}deg`,
  r1: `${(i * 53 + 115) % 360}deg`,
  r2: `${(i * 53 + 235) % 360}deg`,
  dx: `${-14 + (i * 7) % 28}px`,
}))

function FallingPetals() {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 14 }}>
      {PETALS_POOL.map(p => (
        <div key={p.id} style={{
          position: 'absolute', left: `${p.left}%`, top: '-24px',
          width: p.size, height: p.size * 0.72,
          background: 'radial-gradient(ellipse at 40% 30%, #FFE0EC, #FFB3CC)',
          borderRadius: '50% 30% 50% 30% / 40% 50% 40% 50%',
          ['--r0' as any]: p.r0, ['--r1' as any]: p.r1, ['--r2' as any]: p.r2,
          ['--dx' as any]: p.dx,
          animation: `petalFall ${p.dur}s ${p.delay}s infinite ease-in-out`,
        }} />
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   FLOWER — 모든 stage에서 5장 꽃잎, 단계별 크기 증가
═══════════════════════════════════════════════════════════ */
const FLOWER_PALETTES = [
  ['#FFB3CC', '#FFA0BC', '#FFC8D8', '#FF90B4', '#FFD4E4'],
  ['#FF88B0', '#FFB0CC', '#FFC4DA', '#FF78A8', '#FFCCE2'],
  ['#FF6B9D', '#FF9EC0', '#FFB8D2', '#FF5593', '#FFAAC8'],
  ['#FF4F8A', '#FF8CB6', '#FFACD0', '#FF3A7E', '#FF9CC4'],
]

function Flower({
  x, y, stage, flowerScale, delayMs,
}: {
  x: number; y: number; stage: Stage; flowerScale: number; delayMs: number
}) {
  const palette = FLOWER_PALETTES[stage]
  const colorIdx = Math.floor(Math.abs(Math.sin(x * 0.37 + y * 0.23)) * palette.length)
  const petalColor = palette[colorIdx]

  // petal geometry
  const BASE_RX = 4.8, BASE_RY = 8.8
  const rx = BASE_RX * flowerScale
  const ry = BASE_RY * flowerScale
  const centerR = BASE_RX * flowerScale * 0.62
  const innerR = centerR * 0.52
  const offsetY = ry * 0.74

  return (
    <g style={{ animation: `bloomIn 0.48s ${delayMs}ms ease backwards` }}>
      {/* 5 petals */}
      {[0, 72, 144, 216, 288].map(angle => (
        <ellipse
          key={angle}
          cx={x} cy={y - offsetY}
          rx={rx} ry={ry}
          fill={petalColor}
          opacity={0.93}
          transform={`rotate(${angle}, ${x}, ${y})`}
        />
      ))}
      {/* center glow */}
      <circle cx={x} cy={y} r={centerR} fill="#FFF4F8" opacity={0.95} />
      <circle cx={x} cy={y} r={innerR} fill="#FFD8EC" opacity={0.85} />
      {/* tiny stamens */}
      {[0, 60, 120, 180, 240, 300].map(a => {
        const rad = (a * Math.PI) / 180
        const sr = innerR * 0.65
        return <circle key={a} cx={x + Math.cos(rad) * sr} cy={y + Math.sin(rad) * sr}
          r={innerR * 0.22} fill="#FFAACC" opacity={0.7} />
      })}
    </g>
  )
}

function LeafShape({ x, y, a }: { x: number; y: number; a: number }) {
  return (
    <ellipse cx={x} cy={y} rx={4.2} ry={9}
      fill="#72CC58" opacity={0.75}
      transform={`rotate(${a}, ${x}, ${y})`} />
  )
}

/* ═══════════════════════════════════════════════════════════
   CHERRY BLOSSOM TREE
═══════════════════════════════════════════════════════════ */
interface FlutterPetal {
  id: number
  left: number
  top: number
  size: number
  dur: number
  delay: number
  sx: string
  dy: string
  color: string
}

let _petalId = 0
function spawnPetals(): FlutterPetal[] {
  const count = 10 + Math.floor(Math.random() * 6)
  return Array.from({ length: count }, () => {
    const sign = Math.random() > 0.5 ? 1 : -1
    return {
      id: _petalId++,
      left: 15 + Math.random() * 70,
      top:  10 + Math.random() * 55,
      size: 7  + Math.random() * 8,
      dur:  4.2 + Math.random() * 2.8,
      delay: Math.random() * 0.9,
      sx:   `${sign * (38 + Math.random() * 62)}px`,
      dy:   `${280 + Math.random() * 220}px`,
      color: Math.random() > 0.45 ? '#FFB7D5' : '#FFD9EA',
    }
  })
}

function CherryTree({ letterCount }: { letterCount: number }) {
  const stage = getStage(letterCount)
  const conf = STAGE_CONF[stage]
  const visibleCount = Math.min(letterCount, FLOWER_SPOTS.length)
  const balancedSpots = pickBalanced(visibleCount)
  const [shaking, setShaking] = useState(false)
  const [petals, setPetals] = useState<FlutterPetal[]>([])

  const handleTreeClick = () => {
    if (shaking) return
    setShaking(true)
    setTimeout(() => setShaking(false), 950)
    const newPetals = spawnPetals()
    setPetals(prev => [...prev, ...newPetals])
    const maxDur = Math.max(...newPetals.map(p => (p.dur + p.delay) * 1000))
    setTimeout(() => {
      const ids = new Set(newPetals.map(p => p.id))
      setPetals(prev => prev.filter(p => !ids.has(p.id)))
    }, maxDur + 200)
  }

  return (
    <div style={{ position: 'relative', cursor: 'pointer' }} onClick={handleTreeClick}>
      {/* 클릭 시 꽃잎 flutter */}
      {petals.length > 0 && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20, overflow: 'visible', perspective: '600px' }}>
          {petals.map(p => (
            <div key={p.id} style={{
              position: 'absolute',
              left: `${p.left}%`, top: `${p.top}%`,
              width: p.size, height: p.size * 0.68,
              background: `radial-gradient(ellipse at 38% 28%, #fff6, ${p.color})`,
              borderRadius: '50% 28% 50% 28% / 42% 52% 42% 52%',
              ['--sx' as string]: p.sx,
              ['--dy' as string]: p.dy,
              animation: `petalFlutter ${p.dur}s ${p.delay}s ease-in-out forwards`,
            }} />
          ))}
        </div>
      )}
    <svg viewBox="0 0 390 400" xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', display: 'block', transition: 'all 1.6s ease' }}>
      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={conf.skyA} />
          <stop offset="100%" stopColor={conf.skyB} />
        </linearGradient>
        <linearGradient id="trunkGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={conf.trunkColor} stopOpacity={0.8} />
          <stop offset="50%" stopColor={conf.trunkColor} />
          <stop offset="100%" stopColor={conf.trunkColor} stopOpacity={0.8} />
        </linearGradient>
        <radialGradient id="groundGrad" cx="50%" cy="25%">
          <stop offset="0%" stopColor={conf.ground} />
          <stop offset="100%" stopColor={conf.ground} stopOpacity={0.5} />
        </radialGradient>
      </defs>

      {/* Sky */}
      <rect width="390" height="368" fill="url(#skyGrad)" style={{ transition: 'all 1.6s ease' }} />

      {/* Sun */}
      {conf.hasSun && (
        <circle cx={345} cy={58} r={28}
          fill={stage === 3 ? '#FFE878' : '#F8F0B8'} opacity={0.58}
          style={{ transition: 'all 1.6s ease' }} />
      )}

      {/* Distant hills */}
      {conf.hasHills && (
        <>
          <ellipse cx={78} cy={282} rx={125} ry={42}
            fill={stage === 3 ? '#FFCCE0' : '#F0D8B8'} opacity={0.3}
            style={{ transition: 'all 1.6s ease' }} />
          <ellipse cx={322} cy={277} rx={130} ry={46}
            fill={stage === 3 ? '#FFD0E8' : '#F4DCC0'} opacity={0.26}
            style={{ transition: 'all 1.6s ease' }} />
        </>
      )}

      {/* Ground */}
      <ellipse cx={195} cy={390} rx={200} ry={46}
        fill="url(#groundGrad)" style={{ transition: 'all 1.6s ease' }} />

      {/* Stage 3: fallen petals on ground */}
      {stage === 3 && [55, 110, 168, 238, 298, 352].map((px, i) => (
        <g key={i}>
          {[0, 120, 240].map(a => (
            <ellipse key={a} cx={px} cy={376 - (i % 3)} rx={3.2} ry={5.5}
              fill="#FFB8CC"
              transform={`rotate(${a + i * 25}, ${px}, ${376 - i % 3})`}
              opacity={0.62} />
          ))}
        </g>
      ))}

      {/* ── Tree group (sways in stage 2+, shakes on click) ── */}
      <g className={shaking ? 'tree-shake' : ''}>
      <g style={{ animation: stage >= 2 ? 'sway 5s ease-in-out infinite' : 'none' }}>
        {/* Branches */}
        <g stroke="url(#trunkGrad)" strokeLinecap="round" fill="none">
          {/* Main trunk */}
          <path d="M195,400 C193,368 192,335 192,302 C191,274 190,250 190,220" strokeWidth="18" />
          <path d="M190,230 C189,208 188,184 187,158" strokeWidth="13" />
          <path d="M187,168 C186,148 185,128 184,108" strokeWidth="9" />

          {/* Left main */}
          <path d="M192,275 C172,257 150,240 126,222 C104,206 82,192 62,180" strokeWidth="11" />
          <path d="M62,180 C50,172 39,165 32,157" strokeWidth="7" />
          <path d="M106,230 C93,219 80,209 70,202" strokeWidth="6" />

          {/* Right main */}
          <path d="M193,270 C215,251 240,236 266,220 C288,206 310,193 330,181" strokeWidth="11" />
          <path d="M330,181 C342,173 354,165 361,157" strokeWidth="7" />
          <path d="M282,228 C296,217 310,207 318,200" strokeWidth="6" />

          {/* Upper left */}
          <path d="M189,206 C170,194 150,180 132,167 C116,155 102,146 89,138" strokeWidth="8" />
          <path d="M89,138 C77,129 64,121 55,113" strokeWidth="5" />

          {/* Upper right */}
          <path d="M191,204 C211,190 233,176 253,163 C269,152 285,144 298,137" strokeWidth="8" />
          <path d="M298,137 C310,129 323,122 332,114" strokeWidth="5" />

          {/* Top forks */}
          <path d="M186,150 C175,135 161,120 151,106" strokeWidth="6" />
          <path d="M186,148 C198,132 215,117 226,103" strokeWidth="6" />
          <path d="M154,108 C145,99 136,90 129,82" strokeWidth="4" />
          <path d="M224,104 C234,95 244,86 252,78" strokeWidth="4" />
        </g>

        {/* Leaves (stage 2+) */}
        {stage >= 2 && LEAF_SPOTS.map((l, i) => (
          <LeafShape key={i} x={l.x} y={l.y} a={l.a} />
        ))}

        {/* Flowers — stage 0: placeholder dots, stage 1+: full 5-petal flowers */}
        {stage === 0
          ? FLOWER_SPOTS.map((spot, i) => (
            <circle
              key={i}
              cx={spot.x}
              cy={spot.y}
              r={2.5}
              fill="#C8C0C4"
              opacity={0.15}
            />
          ))
          : balancedSpots.map((spot, i) => {
            const isNewest = i === balancedSpots.length - 1
            return (
              <Flower
                key={i}
                x={spot.x}
                y={spot.y}
                stage={stage}
                flowerScale={conf.flowerScale}
                delayMs={isNewest ? 0 : 0}
              />
            )
          })}

        {/* Tiny birds (stage 3) */}
        {stage === 3 && (
          <g fill="none" stroke="#8A7090" strokeWidth="1.2" strokeLinecap="round">
            <path d="M50 72 Q54 67 59 72" />
            <path d="M62 76 Q66 71 71 76" />
            <path d="M306 84 Q310 79 315 84" />
          </g>
        )}
      </g>
      </g>{/* /tree-shake wrapper */}
    </svg>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   SHARED UI ATOMS
═══════════════════════════════════════════════════════════ */
function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: 40, height: 40, borderRadius: 14,
      background: '#FFE8F2', color: '#FF6B9D',
      fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
    }}>←</button>
  )
}

function PillBadge({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      background: bg, color, borderRadius: 99,
      padding: '3px 10px', fontSize: 11, fontWeight: 700,
    }}>{children}</span>
  )
}

function ShimmerStrip() {
  return (
    <div style={{
      height: 4,
      background: 'linear-gradient(90deg, #FFB3CC 0%, #FF85AD 25%, #FFBD85 50%, #C4B5FD 75%, #FFB3CC 100%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 4s linear infinite',
    }} />
  )
}

/* ═══════════════════════════════════════════════════════════
   결제 후 DB 업데이트 헬퍼
   RLS 정책 "letter_boxes: owner update premium" 에 의해
   인증된 오너만 자신의 박스에 is_premium = true 를 쓸 수 있습니다.
═══════════════════════════════════════════════════════════ */
async function activatePremium(_boxId: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
    await fetch(`${base}/rest/v1/rpc/activate_my_premium`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': session.access_token,
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: '{}',
    })
  } catch (_) { /* 백그라운드 업데이트 실패는 무시 */ }
}

/* ═══════════════════════════════════════════════════════════
   ROLLING PAPER SAMPLE DATA
═══════════════════════════════════════════════════════════ */
const SAMPLE_LETTERS: Letter[] = [
  { id: 's1', box_id: '', type: '칭찬', message: '항상 밝고 긍정적인 모습이 주변 사람들에게 큰 힘이 돼요 ✨ 네가 있어서 우리 팀이 훨씬 빛나는 것 같아요!', from_name: '오랜 친구', is_anonymous: false, created_at: '2024-03-20T10:00:00Z', deleted_at: null },
  { id: 's2', box_id: '', type: '응원', message: '지금 하는 일 모두 잘 될 거예요! 항상 최선을 다하는 모습이 정말 멋있어요. 파이팅 🔥', from_name: '익명', is_anonymous: true, created_at: '2024-03-21T11:00:00Z', deleted_at: null },
  { id: 's3', box_id: '', type: '감사', message: '힘들 때마다 내 얘기 들어줘서 정말 고마워요. 덕분에 많이 웃을 수 있었어요 🌸', from_name: '소중한 사람', is_anonymous: false, created_at: '2024-03-22T14:00:00Z', deleted_at: null },
  { id: 's4', box_id: '', type: '칭찬', message: '세심한 배려 덕분에 주변이 항상 따뜻해요. 당신의 작은 말 한마디가 큰 위로가 됐어요 💕', from_name: '익명', is_anonymous: true, created_at: '2024-03-23T09:00:00Z', deleted_at: null },
]

/* ═══════════════════════════════════════════════════════════
   ROLLING PAPER MODAL
═══════════════════════════════════════════════════════════ */
function RollingPaperModal({
  boxId,
  nickname,
  realLetters,
  initialPaid,
  onPaid,
  onClose,
}: {
  boxId: string
  nickname: string
  realLetters: Letter[]
  initialPaid: boolean
  onPaid: () => void
  onClose: () => void
}) {
  const [paid, setPaid] = useState(initialPaid)
  const [payLoading, setPayLoading] = useState(false)
  const [payError, setPayError] = useState('')
  const [saving, setSaving] = useState(false)
  const paperRef = useRef<HTMLDivElement>(null)

  const displayLetters = paid ? realLetters : SAMPLE_LETTERS

  useEffect(() => {
    // IMP init
    const impCode = (import.meta.env.VITE_PORTONE_IMP_CODE as string | undefined) || 'imp81538743'
    if (window.IMP && impCode) window.IMP.init(impCode)

    // 모달 열릴 때마다 DB에서 is_premium 동기화
    // 결제 완료 후 콜백/redirect 처리 실패 시에도 올바른 상태를 보여줌
    supabase
      .from('letter_boxes')
      .select('is_premium')
      .eq('id', boxId)
      .single()
      .then(({ data }) => {
        if (data?.is_premium && !paid) {
          setPaid(true)
          onPaid()
        }
      })
  }, [])

  // iamport.js 동적 로드 (head script 실패 시 fallback)
  const ensureIMP = (impCode: string): Promise<void> =>
    new Promise((resolve, reject) => {
      if (window.IMP) { window.IMP.init(impCode); resolve(); return }
      const existing = document.querySelector('script[src*="iamport.kr"]')
      if (existing) { reject(new Error('iamport.js 로드 대기 중')); return }
      const script = document.createElement('script')
      script.src = 'https://cdn.iamport.kr/v1/iamport.js'
      script.onload = () => { window.IMP!.init(impCode); resolve() }
      script.onerror = () => reject(new Error('iamport.js 로드 실패. 네트워크를 확인해주세요.'))
      document.head.appendChild(script)
    })

  const handlePayment = async () => {
    const impCode = (import.meta.env.VITE_PORTONE_IMP_CODE as string | undefined) || 'imp81538743'
    if (!impCode) {
      setPayError('결제 설정 오류가 발생했어요. 잠시 후 다시 시도해주세요.')
      return
    }

    setPayLoading(true)
    setPayError('')

    try {
      await ensureIMP(impCode)
    } catch (e) {
      setPayError(String(e))
      setPayLoading(false)
      return
    }

    // Date.now() + 랜덤 suffix로 중복 방지
    const merchantUid = `blossom-${boxId.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    window.IMP.request_pay(
      {
        pg: 'tosspayments',          // 토스페이먼츠 테스트 채널
        pay_method: 'card',           // 신용카드
        merchant_uid: merchantUid,
        name: '벚꽃 편지함 소장용 이미지',
        amount: 990,
        buyer_email: '',
        buyer_name: '',
        buyer_tel: '',
        // 모바일에서 결제창이 새 페이지로 열릴 때 복귀 URL
        m_redirect_url: `${window.location.origin}/box/${boxId}`,
      },
      async (rsp) => {
        // ── 프론트 1차 체크 ───────────────────────────────────
        // 모바일에서 결제창이 redirect 방식으로 열릴 경우
        // 페이지가 재로드되면서 rsp.success=false 가 반환될 수 있습니다.
        // imp_uid 가 없으면 진짜 취소/실패, 있으면 서버에서 실제 상태를 확인합니다.
        if (!rsp.success && !rsp.imp_uid) {
          setPayError(rsp.error_msg ?? '결제가 취소되었어요.')
          setPayLoading(false)
          return
        }

        // 결제 성공 → UI 즉시 업데이트 (DB 업데이트는 백그라운드)
        trackPurchaseRollingPaper(boxId)
        setPaid(true)
        onPaid()
        setPayLoading(false)
        activatePremium(boxId)
      }
    )
  }

  const handleSave = async () => {
    if (!paperRef.current || saving) return
    setSaving(true)
    try {
      const el = paperRef.current
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#FFF5F7',
        logging: false,
        width: el.scrollWidth,
        height: el.scrollHeight,
        onclone: (_doc, clone) => {
          // 애니메이션·트랜지션 제거 + 그래디언트 배경을 단색으로 교체
          clone.querySelectorAll<HTMLElement>('*').forEach(child => {
            child.style.animation = 'none'
            child.style.transition = 'none'
            child.style.animationFillMode = 'none'
            // linear-gradient 배경이 있는 height≤2px 구분선은 단색으로 대체
            const bg = child.style.background || child.style.backgroundImage
            if (bg.includes('linear-gradient') && child.offsetHeight <= 2) {
              child.style.background = '#FFB3D4'
              child.style.backgroundImage = 'none'
            }
          })
        },
      })
      const dataUrl = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = `${nickname}님의_벚꽃편지함.png`
      link.href = dataUrl
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (e) {
      alert(`이미지 저장에 실패했어요: ${String(e)}`)
    }
    setSaving(false)
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(30,10,20,0.6)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      animation: 'fadeIn 0.2s ease forwards',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 430,
        background: '#FFF5F7',
        borderRadius: '28px 28px 0 0',
        maxHeight: '92dvh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 -12px 48px rgba(255,107,157,0.22)',
        animation: 'slideUp 0.3s cubic-bezier(0.22,1,0.36,1) forwards',
      }}>
        {/* 핸들 */}
        <div style={{ padding: '14px 24px 0', flexShrink: 0 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#F0D0E0', margin: '0 auto 14px' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 900, color: '#2D1020' }}>
                🌸 롤링페이퍼 소장하기
              </h3>
              <p style={{ fontSize: 11, color: '#C09AB0', marginTop: 2, fontWeight: 500 }}>
                {paid ? '내 편지들로 만든 롤링페이퍼예요' : '샘플 미리보기 중 · 결제 후 내 편지로 교체돼요'}
              </p>
            </div>
            <button onClick={onClose} style={{ fontSize: 20, color: '#C0A0C0', padding: 4, background: 'none' }}>✕</button>
          </div>

          {/* 샘플 안내 배너 */}
          {!paid && (
            <div style={{
              background: '#FFF8E8', border: '1.5px solid #FFDC80',
              borderRadius: 12, padding: '8px 12px', marginTop: 10, marginBottom: 2,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 14 }}>✨</span>
              <p style={{ fontSize: 11, color: '#A08020', fontWeight: 600, lineHeight: 1.6 }}>
                지금은 예시 편지로 미리보기 중이에요.<br />
                <span style={{ color: '#C06010' }}>990원 결제 후 내 실제 편지들로 바뀌어요.</span>
              </p>
            </div>
          )}
        </div>

        {/* 롤링페이퍼 본문 (스크롤) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {/* 이미지로 저장될 영역 */}
          <div ref={paperRef} style={{
            background: 'linear-gradient(160deg, #FFF5F7 0%, #FFF0F6 40%, #F8F0FF 100%)',
            borderRadius: 20, padding: '20px 16px',
            border: '1.5px solid #FFD8EE',
          }}>
            {/* 헤더 */}
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>🌸</div>
              <p style={{ fontSize: 16, fontWeight: 900, color: '#CC3D6B', marginBottom: 2 }}>
                {paid ? `${nickname}` : '미리보기'}님의 봄 편지함
              </p>
              <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #FFB3D4, transparent)', margin: '10px 0 0' }} />
            </div>

            {/* 편지 카드 그리드 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {displayLetters.map((letter) => {
                const m = TYPE_META[letter.type]
                return (
                  <div key={letter.id} style={{
                    background: '#fff',
                    borderRadius: 16, padding: '12px 12px',
                    border: `1.5px solid ${m.pill}`,
                    boxShadow: `0 3px 12px ${m.color}18`,
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 800, color: m.color,
                        background: m.bg, padding: '2px 7px', borderRadius: 99,
                        border: `1px solid ${m.pill}`,
                      }}>{m.emoji} {letter.type}</span>
                    </div>
                    <p style={{
                      fontSize: 11, color: '#3D1025', lineHeight: 1.7, fontWeight: 500,
                      wordBreak: 'keep-all',
                    }}>{letter.message}</p>
                    <p style={{ fontSize: 10, color: '#C0A0C0', fontWeight: 600, marginTop: 'auto' }}>
                      — {letter.is_anonymous ? '익명' : letter.from_name}
                    </p>
                    <p style={{ fontSize: 9, color: '#D8C0D0', fontWeight: 500 }}>
                      {new Date(letter.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  </div>
                )
              })}
            </div>

            {/* 하단 장식 */}
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <p style={{ fontSize: 10, color: '#D0B0C8', fontWeight: 500 }}>
                {new Date().getFullYear()}년 봄 🌸
              </p>
            </div>
          </div>
        </div>

        {/* 하단 버튼 영역 */}
        <div style={{ padding: '12px 16px 36px', flexShrink: 0, borderTop: '1px solid #FFE8F2' }}>
          {payError && (
            <div style={{
              background: '#FFF0F0', border: '1.5px solid #FFAAAA',
              borderRadius: 12, padding: '10px 14px', marginBottom: 10,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 14 }}>⚠️</span>
              <p style={{ fontSize: 11, color: '#CC3333', fontWeight: 600, lineHeight: 1.5 }}>{payError}</p>
            </div>
          )}
          {!paid ? (
            /* 결제 버튼 */
            <button onClick={handlePayment} disabled={payLoading} style={{
              width: '100%', padding: '16px',
              background: payLoading ? '#F0E8F0' : 'linear-gradient(135deg, #FF85AD, #FF6B9D)',
              borderRadius: 20, marginBottom: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: payLoading ? 'none' : '0 6px 22px rgba(255,107,157,0.38)',
              transition: 'all 0.25s',
            }}>
              <span style={{ fontSize: 18 }}>💳</span>
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: payLoading ? '#A888A8' : '#fff', marginBottom: 1 }}>
                  {payLoading ? '결제 처리 중...' : '990원 결제하고 내 편지로 소장'}
                </p>
                <p style={{ fontSize: 10, color: payLoading ? '#C0A0C0' : 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
                  내 실제 편지들로 롤링페이퍼 완성 + PNG 저장
                </p>
              </div>
            </button>
          ) : (
            /* 저장 버튼 */
            <button onClick={handleSave} disabled={saving} style={{
              width: '100%', padding: '16px',
              background: saving ? '#F0E8F0' : 'linear-gradient(135deg, #7ACC8A, #4CAF6F)',
              borderRadius: 20, marginBottom: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: saving ? 'none' : '0 6px 22px rgba(76,175,111,0.35)',
              transition: 'all 0.25s',
            }}>
              <span style={{ fontSize: 18 }}>📥</span>
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: saving ? '#A888A8' : '#fff', marginBottom: 1 }}>
                  {saving ? '이미지 저장 중...' : '사진첩에 저장하기'}
                </p>
                <p style={{ fontSize: 10, color: saving ? '#C0A0C0' : 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
                  PNG 파일로 다운로드돼요
                </p>
              </div>
            </button>
          )}
          <button onClick={onClose} style={{
            width: '100%', padding: '11px',
            background: 'transparent', color: '#C0A0C0',
            fontSize: 13, fontWeight: 600,
          }}>닫기</button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   LETTER MODAL
═══════════════════════════════════════════════════════════ */
function LetterModal({ letter, onClose, onDelete }: {
  letter: Letter
  onClose: () => void
  onDelete: (id: string) => void
}) {
  const m = TYPE_META[letter.type]
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 100,
      background: 'rgba(30,10,20,0.48)',
      backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 20px',
      animation: 'fadeIn 0.22s ease forwards',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 360,
        background: 'rgba(255,255,255,0.96)',
        backdropFilter: 'blur(20px)',
        borderRadius: 28, overflow: 'hidden',
        border: `2px solid ${m.pill}`,
        boxShadow: `0 24px 70px ${m.color}28`,
        animation: 'scaleIn 0.28s cubic-bezier(0.22,1,0.36,1) forwards',
      }}>
        <div style={{
          padding: '18px 22px 14px',
          background: `linear-gradient(135deg, ${m.bg}, rgba(255,255,255,0))`,
          borderBottom: `1.5px solid ${m.pill}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: `linear-gradient(135deg, ${m.soft}, ${m.color})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
              animation: 'floatY 2.5s ease-in-out infinite',
            }}>{m.emoji}</div>
            <div>
              <PillBadge color={m.color} bg={m.pill}>{letter.type} 편지</PillBadge>
              <p style={{ fontSize: 10, color: '#C0A8C0', marginTop: 3, fontWeight: 500 }}>
                {new Date(letter.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 10,
            background: '#F0E8F0', color: '#A888A8', fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        <div style={{ padding: '20px 22px', minHeight: 100 }}>
          <p style={{ fontSize: 15, lineHeight: 2, color: '#2D1020', fontWeight: 400, whiteSpace: 'pre-wrap' }}>
            {letter.message}
          </p>
        </div>

        <div style={{
          padding: '12px 22px 14px',
          borderTop: `1.5px solid ${m.pill}`, background: m.bg,
        }}>
          <p style={{ fontSize: 10, color: '#C0A0C0', fontWeight: 500, marginBottom: 3 }}>
            {letter.is_anonymous ? '소중한 마음을 담아 보냈어요 💕' : '이름을 남겨주었어요 ✉️'}
          </p>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#3D1025' }}>
            {letter.is_anonymous ? '🎭 익명의 친구' : `💌 ${letter.from_name}`}
          </p>
        </div>

        {/* 삭제 버튼 */}
        <div style={{ padding: '10px 22px 18px', background: m.bg }}>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} style={{
              width: '100%', padding: '9px',
              background: 'transparent', border: '1.5px solid #F0D0D0',
              borderRadius: 14, fontSize: 12, color: '#C09898', fontWeight: 600,
            }}>
              🗑️ 편지 삭제
            </button>
          ) : (
            <div style={{
              background: '#FFF0F0', border: '1.5px solid #FFAAAA',
              borderRadius: 14, padding: '12px 14px',
            }}>
              <p style={{ fontSize: 11, color: '#CC3333', fontWeight: 700, marginBottom: 10, lineHeight: 1.6, textAlign: 'center' }}>
                삭제하면 다시 복구할 수 없습니다.<br />정말 삭제하시겠습니까?
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setConfirmDelete(false)} style={{
                  flex: 1, padding: '9px',
                  background: '#F0E8F0', borderRadius: 12,
                  fontSize: 12, fontWeight: 700, color: '#A888A8',
                }}>취소</button>
                <button onClick={() => onDelete(letter.id)} style={{
                  flex: 1, padding: '9px',
                  background: 'linear-gradient(135deg, #FF7070, #EE4444)',
                  borderRadius: 12,
                  fontSize: 12, fontWeight: 800, color: '#fff',
                  boxShadow: '0 3px 10px rgba(238,68,68,0.35)',
                }}>삭제</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   LOCK SCREEN (비밀번호 인증)
═══════════════════════════════════════════════════════════ */
function LockScreen({ box, onUnlock }: { box: LetterBox; onUnlock: () => void }) {
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [shaking, setShaking] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  const attempt = async () => {
    if (!pw || loading) return
    setLoading(true)
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: `box-${box.id}@gmail.com`,
      password: pw,
    })
    setLoading(false)
    if (authError) {
      setError('비밀번호가 맞지 않아요')
      setShaking(true)
      setPw('')
      setTimeout(() => { setShaking(false); setError('') }, 600)
    } else {
      onUnlock()
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(160deg, #FFF0F6 0%, #F8F0FF 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '32px 28px', gap: 28,
      animation: 'fadeIn 0.35s ease forwards',
    }}>
      {/* Back to landing */}
      <div style={{ position: 'absolute', top: 52, left: 20 }}>
        <BackBtn onClick={() => go('/')} />
      </div>

      {/* Icon */}
      <div style={{
        width: 88, height: 88, borderRadius: '50%',
        background: 'linear-gradient(135deg, #FFD0E8, #C4B5FD)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 40, boxShadow: '0 10px 36px rgba(167,139,250,0.3)',
        animation: 'floatY 3s ease-in-out infinite',
      }}>🔒</div>

      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 21, fontWeight: 800, color: '#2D1020', marginBottom: 8, letterSpacing: -0.3 }}>
          {box.nickname}님의 편지함
        </h2>
        <p style={{ fontSize: 13, color: '#C09AB0', lineHeight: 1.8, fontWeight: 500 }}>
          소중한 편지를 보호하고 있어요.<br />비밀번호를 입력해 편지함을 열어보세요.
        </p>
      </div>

      {/* Input */}
      <div style={{ width: '100%', position: 'relative' }}
        className={shaking ? 'shake' : ''}>
        <input
          type={showPw ? 'text' : 'password'}
          value={pw}
          onChange={e => { setPw(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && attempt()}
          placeholder="비밀번호 입력"
          autoComplete="off"
          style={{
            width: '100%', padding: '16px 52px 16px 18px',
            background: '#fff',
            border: `2px solid ${error ? '#FF6B9D' : '#FFD0E8'}`,
            borderRadius: 18, fontSize: 16,
            color: '#2D1020', outline: 'none',
            boxShadow: error ? '0 0 0 4px #FF6B9D18' : '0 4px 16px rgba(255,107,157,0.1)',
            transition: 'all 0.2s',
            textAlign: 'center', letterSpacing: showPw ? 0.5 : 4,
            fontWeight: 600,
          }}
        />
        <button
          onClick={() => setShowPw(v => !v)}
          style={{
            position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
            background: 'none', fontSize: 18, color: '#C0A8C0',
          }}
        >{showPw ? '🙈' : '👁️'}</button>
        {error && (
          <p style={{
            textAlign: 'center', color: '#FF6B9D', fontSize: 12,
            marginTop: 8, fontWeight: 700,
          }}>{error}</p>
        )}
      </div>

      <button
        onClick={attempt}
        disabled={!pw || loading}
        style={{
          width: '100%', padding: '16px',
          background: pw ? 'linear-gradient(135deg, #FF85AD, #FF6B9D)' : '#F0E0E8',
          borderRadius: 20, fontSize: 16, fontWeight: 800,
          color: pw ? '#fff' : '#C8A8C0',
          boxShadow: pw ? '0 6px 26px rgba(255,107,157,0.4)' : 'none',
          transition: 'all 0.3s ease',
        }}
        onPointerDown={e => pw && (e.currentTarget.style.transform = 'scale(0.97)')}
        onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
      >
        {loading
          ? <span style={{ display: 'inline-block', animation: 'floatY 0.6s ease-in-out infinite' }}>🌸</span>
          : '🌸 편지함 열기'
        }
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   SCREEN 1 — LANDING  (/)
═══════════════════════════════════════════════════════════ */
function LandingScreen() {
  const [myBoxId, setMyBoxId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const { data } = await supabase
        .from('letter_boxes')
        .select('id')
        .eq('owner_id', session.user.id)
        .single()
      if (data) setMyBoxId(data.id)
    })
  }, [])

  return (
    <>
      <Helmet>
        <title>벚꽃 편지함</title>
      </Helmet>
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(180deg, #FFF5F7 0%, #FFF0FA 42%, #F5EEFF 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', position: 'relative', overflow: 'hidden',
    }}>
      {/* Bg blobs */}
      <div style={{
        position: 'absolute', width: 280, height: 280, borderRadius: '50%',
        background: 'radial-gradient(circle, #FFD0E840, transparent)',
        top: -60, right: -80, pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', width: 200, height: 200, borderRadius: '50%',
        background: 'radial-gradient(circle, #E8D8FF40, transparent)',
        bottom: 100, left: -60, pointerEvents: 'none',
      }} />

      {/* Logo pill */}
      <div style={{
        marginTop: 'calc(env(safe-area-inset-top, 0px) + 20px)', marginBottom: 4,
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(12px)',
        padding: '8px 18px', borderRadius: 99,
        border: '1.5px solid rgba(255,179,204,0.5)',
        boxShadow: '0 2px 14px rgba(255,107,157,0.14)',
        animation: 'fadeUp 0.6s ease forwards',
      }}>
        <span style={{ fontSize: 18, animation: 'floatY 2.5s ease-in-out infinite' }}>🌸</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: '#CC3D6B', letterSpacing: -0.3 }}>벚꽃편지함</span>
      </div>

      {/* Tree preview */}
      <div style={{
        width: '72%', maxWidth: 280,
        animation: 'fadeUp 0.6s 0.1s ease backwards',
      }}>
        <CherryTree letterCount={26} />
      </div>

      {/* Copy */}
      <div style={{
        padding: '0 28px 0',
        textAlign: 'center',
        animation: 'fadeUp 0.6s 0.18s ease backwards',
      }}>
        <h1 style={{
          fontSize: 20, fontWeight: 900, color: '#2D1020',
          letterSpacing: -0.6, lineHeight: 1.35, marginBottom: 8,
        }}>
          소중한 진심 한 통에 하나씩,<br />{' '}
          <span style={{
            background: 'linear-gradient(135deg, #FF6B9D, #A78BFA)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>우리만의 봄이 피어납니다</span>
        </h1>
        <p style={{ fontSize: 13, color: '#A888A8', lineHeight: 1.85, fontWeight: 500 }}>
          친구에게 평소 전하지 못한 따뜻한 마음을<br />
          벚꽃 편지에 익명으로 담아 나무를 키워보세요.
        </p>
      </div>

      {/* CTAs */}
      <div style={{
        width: '100%', padding: '14px 24px 32px',
        display: 'flex', flexDirection: 'column', gap: 10,
        animation: 'fadeUp 0.6s 0.26s ease backwards',
      }}>
        <button onClick={() => go('/create')} style={{
          width: '100%', padding: '17px',
          background: 'linear-gradient(135deg, #FF85AD, #FF6B9D)',
          borderRadius: 22, fontSize: 16, fontWeight: 800, color: '#fff',
          boxShadow: '0 6px 28px rgba(255,107,157,0.44)',
          animation: 'heartbeat 2.5s 1s ease-in-out infinite',
          letterSpacing: 0.3,
        }}
          onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
          onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          🌱 나만의 봄 편지함 만들기
        </button>
        {myBoxId && (
          <button onClick={() => go(`/box/${myBoxId}`)} style={{
            width: '100%', padding: '14px',
            background: 'rgba(255,255,255,0.72)',
            border: '1.5px solid rgba(255,179,204,0.5)',
            borderRadius: 18, fontSize: 14, fontWeight: 700, color: '#CC3D6B',
            backdropFilter: 'blur(8px)',
          }}>
            🌸 내 편지함으로 →
          </button>
        )}
      </div>
    </div>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════
   SCREEN 2 — CREATE  (/create)
═══════════════════════════════════════════════════════════ */
function CreateScreen() {
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [errors, setErrors] = useState({ nickname: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [createdBoxId, setCreatedBoxId] = useState<string | null>(null)
  const [urlCopied, setUrlCopied] = useState(false)

  const validate = () => {
    const e = { nickname: '', password: '' }
    if (!nickname.trim()) e.nickname = '이름을 입력해주세요 🌱'
    else if (nickname.trim().length > 12) e.nickname = '12자 이내로 입력해주세요'
    if (!password) e.password = '비밀번호를 설정해주세요 🔒'
    else if (password.length < 6) e.password = '6자 이상 입력해주세요'
    setErrors(e)
    return !e.nickname && !e.password
  }

  const handleCreate = async () => {
    if (!validate() || loading) return
    setLoading(true)

    const boxId = crypto.randomUUID()
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: `box-${boxId}@gmail.com`,
      password,
    })
    if (signUpError || !authData.user) {
      console.error('[signUp error]', signUpError)
      setErrors(e => ({ ...e, nickname: '오류가 발생했어요. 다시 시도해주세요.' }))
      setLoading(false)
      return
    }

    const { error: insertError } = await supabase
      .from('letter_boxes')
      .insert({ id: boxId, owner_id: authData.user.id, nickname: nickname.trim() })
    if (insertError) {
      setErrors(e => ({ ...e, nickname: '편지함 생성에 실패했어요.' }))
      setLoading(false)
      return
    }

    trackCreateMailbox(nickname.trim())
    setCreatedBoxId(boxId)
    setLoading(false)
  }

  const canSubmit = nickname.trim().length > 0 && password.length >= 6 && !loading

  // ── 생성 완료 화면 ──────────────────────────────────────────
  if (createdBoxId) {
    const boxUrl = `${window.location.origin}/box/${createdBoxId}`
    const handleCopyUrl = async () => {
      try {
        await navigator.clipboard.writeText(boxUrl)
        setUrlCopied(true)
        setTimeout(() => setUrlCopied(false), 2500)
      } catch {
        // fallback
      }
    }
    return (
      <>
        <Helmet>
          <title>편지함 만들기 완료 · 벚꽃 편지함</title>
        </Helmet>
        <div style={{
          minHeight: '100dvh',
          background: 'linear-gradient(180deg, #FFFDF9 0%, #FFF5F0 100%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '32px 28px',
        }} className="screen-enter">
          {/* 성공 아이콘 */}
          <div style={{
            width: 100, height: 100, borderRadius: '50%',
            background: 'linear-gradient(135deg, #FFD0E8, #FFB3CC)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 48, boxShadow: '0 8px 32px rgba(255,107,157,0.26)',
            marginBottom: 24, animation: 'floatY 2.5s ease-in-out infinite',
          }}>🌸</div>

          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#2D1020', marginBottom: 8, textAlign: 'center' }}>
            편지함이 만들어졌어요!
          </h2>
          <p style={{ fontSize: 13, color: '#C09AB0', marginBottom: 32, textAlign: 'center', lineHeight: 1.8, fontWeight: 500 }}>
            아래 링크를 꼭 저장해두세요.<br />
            <span style={{ color: '#FF6B9D', fontWeight: 700 }}>이 링크를 잃어버리면 편지함을 열 수 없어요.</span>
          </p>

          {/* URL 박스 */}
          <div style={{
            width: '100%',
            background: '#FFF0F6',
            border: '2px solid #FFB3D4',
            borderRadius: 16, padding: '16px 18px',
            marginBottom: 12,
          }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#C09AB0', marginBottom: 6, letterSpacing: 0.5 }}>
              📮 내 편지함 주소
            </p>
            <p style={{
              fontSize: 12, fontWeight: 700, color: '#2D1020',
              wordBreak: 'break-all', lineHeight: 1.6,
            }}>{boxUrl}</p>
          </div>

          {/* URL 복사 버튼 */}
          <button onClick={handleCopyUrl} style={{
            width: '100%', padding: '15px',
            background: urlCopied ? 'linear-gradient(135deg, #6FBF7F, #4CAF6F)' : 'linear-gradient(135deg, #FF85AD, #FF6B9D)',
            borderRadius: 18, fontSize: 15, fontWeight: 800,
            color: '#fff', marginBottom: 12,
            boxShadow: '0 6px 22px rgba(255,107,157,0.36)',
            transition: 'all 0.3s ease',
          }}>
            {urlCopied ? '✅ 링크 복사됨!' : '🔗 링크 복사하기'}
          </button>

          {/* 경고 박스 */}
          <div style={{
            width: '100%', padding: '13px 16px',
            background: '#FFF8E8', border: '1.5px solid #FFDC80',
            borderRadius: 14, marginBottom: 28,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⚠️</span>
            <p style={{ fontSize: 11, color: '#A08020', lineHeight: 1.7, fontWeight: 600 }}>
              이 링크가 곧 <span style={{ fontWeight: 800 }}>나만의 편지함 주소</span>예요.<br />
              메모장이나 카카오톡 나에게 보내기로 저장해두세요.<br />
              <span style={{ fontWeight: 800, color: '#C06010' }}>링크와 비밀번호를 잃어버리면 편지를 읽을 수 없어요.</span>
            </p>
          </div>

          {/* 내 편지함으로 이동 */}
          <button onClick={() => go(`/box/${createdBoxId}`)} style={{
            width: '100%', padding: '15px',
            background: '#FFF0F6',
            border: '2px solid #FFB3D4',
            borderRadius: 18, fontSize: 15, fontWeight: 800,
            color: '#FF6B9D',
            transition: 'all 0.2s',
          }}>
            내 편지함으로 이동 →
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <Helmet>
        <title>편지함 만들기 · 벚꽃 편지함</title>
      </Helmet>
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(180deg, #FFFDF9 0%, #FFF5F0 100%)',
      display: 'flex', flexDirection: 'column',
    }} className="screen-enter">
      {/* Header */}
      <div style={{
        padding: '52px 20px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)',
        borderBottom: '1.5px solid #FFE0EC',
      }}>
        <BackBtn onClick={() => go('/')} />
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#2D1020' }}>편지함 만들기</h2>
          <p style={{ fontSize: 11, color: '#C09AB0', marginTop: 2, fontWeight: 500 }}>
            나만의 벚꽃나무를 시작해요
          </p>
        </div>
      </div>

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', padding: '36px 28px 28px', gap: 22, overflowY: 'auto',
      }}>
        {/* Icon */}
        <div style={{
          width: 90, height: 90, borderRadius: '50%',
          background: 'linear-gradient(135deg, #FFD0E8, #FFB3CC)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 44, boxShadow: '0 8px 32px rgba(255,107,157,0.26)',
          animation: 'floatY 2.5s ease-in-out infinite',
        }}>🌱</div>

        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 21, fontWeight: 800, color: '#2D1020', marginBottom: 8 }}>
            나만의 봄 편지함을<br />시작해볼까요?
          </h2>
          <p style={{ fontSize: 13, color: '#C09AB0', lineHeight: 1.8, fontWeight: 500 }}>
            친구들이 편지를 보낼 때<br />
            이 이름으로 표시돼요
          </p>
        </div>

        {/* Nickname */}
        <div style={{ width: '100%' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#C0A0C0', marginBottom: 8, letterSpacing: 0.6 }}>
            👤 닉네임
          </p>
          <input
            value={nickname}
            onChange={e => { setNickname(e.target.value); setErrors(p => ({ ...p, nickname: '' })) }}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="닉네임 또는 이름 (최대 12자)"
            maxLength={12}
            autoFocus
            style={{
              width: '100%', padding: '15px 18px',
              background: '#fff',
              border: `2px solid ${errors.nickname ? '#FF6B9D' : '#FFD0E8'}`,
              borderRadius: 16, fontSize: 15,
              color: '#2D1020', outline: 'none',
              boxShadow: errors.nickname ? '0 0 0 4px #FF6B9D14' : '0 4px 14px rgba(255,107,157,0.08)',
              transition: 'all 0.2s', fontWeight: 600, textAlign: 'center',
            }}
          />
          {errors.nickname && (
            <p style={{ color: '#FF6B9D', fontSize: 11, marginTop: 6, fontWeight: 600, textAlign: 'center' }}>
              {errors.nickname}
            </p>
          )}
        </div>

        {/* Password */}
        <div style={{ width: '100%' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#C0A0C0', marginBottom: 8, letterSpacing: 0.6 }}>
            🔒 비밀번호 (6자 이상)
          </p>
          <div style={{ position: 'relative' }}>
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: '' })) }}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="편지함 비밀번호"
              autoComplete="new-password"
              style={{
                width: '100%', padding: '15px 50px 15px 18px',
                background: '#fff',
                border: `2px solid ${errors.password ? '#FF6B9D' : '#FFD0E8'}`,
                borderRadius: 16, fontSize: 15,
                color: '#2D1020', outline: 'none',
                boxShadow: errors.password ? '0 0 0 4px #FF6B9D14' : '0 4px 14px rgba(255,107,157,0.08)',
                transition: 'all 0.2s', fontWeight: 600, textAlign: 'center',
                letterSpacing: showPw ? 0.5 : 4,
              }}
            />
            <button onClick={() => setShowPw(v => !v)} style={{
              position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
              background: 'none', fontSize: 18, color: '#C0A8C0',
            }}>{showPw ? '🙈' : '👁️'}</button>
          </div>
          {errors.password && (
            <p style={{ color: '#FF6B9D', fontSize: 11, marginTop: 6, fontWeight: 600, textAlign: 'center' }}>
              {errors.password}
            </p>
          )}

          {/* 경고 문구 */}
          <div style={{
            marginTop: 10, padding: '11px 14px',
            background: '#FFF8E8',
            border: '1.5px solid #FFDC80',
            borderRadius: 14,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>📝</span>
            <p style={{ fontSize: 11, color: '#A08020', lineHeight: 1.7, fontWeight: 600 }}>
              비밀번호를 메모장에 꼭 적어두세요.<br />
              <span style={{ fontWeight: 800, color: '#C06010' }}>비밀번호를 모르면 편지를 열어볼 수 없어요.</span>
            </p>
          </div>
        </div>

        {/* Type hint pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {['칭찬 ✨', '응원 🔥', '감사 🌸'].map(t => (
            <span key={t} style={{
              fontSize: 11, fontWeight: 600, color: '#D0A8C0',
              background: '#FFF0F6', padding: '4px 12px', borderRadius: 99,
              border: '1px solid #FFD0E8',
            }}>{t}</span>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding: '12px 24px 44px', borderTop: '1px solid #FFE8F2' }}>
        <button onClick={handleCreate} disabled={!canSubmit} style={{
          width: '100%', padding: '17px',
          background: canSubmit ? 'linear-gradient(135deg, #FF85AD, #FF6B9D)' : '#F0E0E8',
          borderRadius: 22, fontSize: 16, fontWeight: 800,
          color: canSubmit ? '#fff' : '#C8A8C0',
          boxShadow: canSubmit ? '0 6px 26px rgba(255,107,157,0.42)' : 'none',
          transition: 'all 0.3s ease',
        }}
          onPointerDown={e => canSubmit && (e.currentTarget.style.transform = 'scale(0.97)')}
          onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          {loading
            ? <span style={{ display: 'inline-block', animation: 'floatY 0.6s ease-in-out infinite' }}>🌸</span>
            : '🌸 봄 편지함 만들기'
          }
        </button>
      </div>
    </div>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════
   SCREEN 3 — DASHBOARD  (/box/:userId)
═══════════════════════════════════════════════════════════ */
function DashboardScreen({ userId }: { userId: string }) {
  const [box, setBox] = useState<LetterBox | null>(null)
  const [authed, setAuthed] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [selectedLetter, setSelectedLetter] = useState<Letter | null>(null)
  const [copied, setCopied] = useState(false)
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(`read-${userId}`)
      return new Set(stored ? JSON.parse(stored) : [])
    } catch { return new Set() }
  })

  // ── 롤링페이퍼 상태 ───────────────────────────────────
  const [showRollingPaper, setShowRollingPaper] = useState(false)
  const [isPremium, setIsPremium] = useState(false)

  const markRead = (id: string) => {
    setReadIds(prev => {
      const next = new Set(prev).add(id)
      localStorage.setItem(`read-${userId}`, JSON.stringify([...next]))
      return next
    })
  }

  // 초기 로드: 박스 메타 + 세션 오너십 확인
  useEffect(() => {
    async function init() {
      setPageLoading(true)

      const { data: boxMeta } = await supabase
        .from('letter_boxes')
        .select('id, nickname, owner_id, is_premium')
        .eq('id', userId)
        .single()

      if (!boxMeta) { setPageLoading(false); return }

      setIsPremium(boxMeta.is_premium)
      setBox({ id: boxMeta.id, nickname: boxMeta.nickname, letters: [] })

      const { data: { session } } = await supabase.auth.getSession()
      if (session && session.user.id === boxMeta.owner_id) {
        const { data: letters } = await supabase
          .from('letters')
          .select('*')
          .eq('box_id', userId)
          .is('deleted_at', null)
          .order('created_at', { ascending: true })
        setBox({ id: boxMeta.id, nickname: boxMeta.nickname, letters: letters ?? [] })
        setAuthed(true)
      }

      // ── 모바일 결제 redirect 복귀 처리 ───────────────────────
      // 모바일에서 m_redirect_url 로 복귀 시 PortOne이 아래 파라미터를 붙여줍니다:
      //   ?imp_uid=imp_xxx&merchant_uid=blossom-xxx&imp_success=true
      // 이때 JS 콜백은 실행되지 않으므로 여기서 직접 서버 검증을 수행합니다.
      const params = new URLSearchParams(window.location.search)
      const impUid = params.get('imp_uid')
      const merchantUid = params.get('merchant_uid')
      const impSuccess = params.get('imp_success')

      // 🔍 임시 디버그: URL 파라미터 확인
      if (window.location.search) {
        alert(`[DEBUG] search: ${window.location.search}\nimp_uid: ${impUid}\nmerchant_uid: ${merchantUid}\nimp_success: ${impSuccess}`)
      }

      if (impUid && merchantUid) {
        // URL 파라미터 즉시 정리 (새로고침 시 중복 실행 방지)
        window.history.replaceState({}, '', window.location.pathname)

        if (impSuccess === 'true') {
          // 결제 성공 → UI 즉시 업데이트, DB는 백그라운드
          trackPurchaseRollingPaper(userId)
          setIsPremium(true)
          setShowRollingPaper(true)
          activatePremium(userId)
        }
        // imp_success=false 면 결제 실패/취소 — 별도 처리 없이 그냥 넘어감
      }

      setPageLoading(false)
    }
    init()
  }, [userId])

  // Realtime 구독 (인증된 오너만)
  useEffect(() => {
    if (!authed) return
    const channel = supabase
      .channel(`box:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'letters', filter: `box_id=eq.${userId}` },
        payload => {
          setBox(prev => prev
            ? { ...prev, letters: [...prev.letters, payload.new as Letter] }
            : null
          )
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [authed, userId])

  if (pageLoading) {
    return (
      <div style={{
        minHeight: '100dvh', background: '#FFF5F9',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 36, animation: 'floatY 1s ease-in-out infinite' }}>🌸</span>
      </div>
    )
  }

  if (!box) {
    return (
      <div style={{
        minHeight: '100dvh', background: '#FFF5F9',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 16, padding: 32,
      }}>
        <span style={{ fontSize: 48 }}>🌱</span>
        <p style={{ fontSize: 16, color: '#C09AB0', fontWeight: 600, textAlign: 'center', lineHeight: 1.7 }}>
          편지함을 찾을 수 없어요<br />
          <span style={{ fontSize: 13, fontWeight: 400 }}>링크를 다시 확인해주세요</span>
        </p>
        <button onClick={() => go('/')} style={{
          padding: '12px 28px', background: '#FFE0EE',
          borderRadius: 18, fontSize: 14, fontWeight: 700, color: '#FF6B9D',
        }}>홈으로</button>
      </div>
    )
  }

  // 인증 전: Lock Screen
  if (!authed) {
    return (
      <LockScreen
        box={box}
        onUnlock={async () => {
          const { data: letters } = await supabase
            .from('letters')
            .select('*')
            .eq('box_id', userId)
            .is('deleted_at', null)
            .order('created_at', { ascending: true })
          setBox(prev => prev ? { ...prev, letters: letters ?? [] } : null)
          setAuthed(true)
        }}
      />
    )
  }

  // 편지 삭제 (soft delete)
  const handleDelete = async (letterId: string) => {
    await supabase
      .from('letters')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', letterId)
    setBox(prev => prev ? { ...prev, letters: prev.letters.filter(l => l.id !== letterId) } : null)
    setSelectedLetter(null)
  }

  // 인증 후: 대시보드
  const stage = getStage(box.letters.length)
  const conf = STAGE_CONF[stage]
  const shareUrl = `${window.location.origin}/write/${userId}`
  const nextThreshold = [0, 1, 3, 5, 999][Math.min(stage + 1, 4)]
  const remaining = Math.max(0, nextThreshold - box.letters.length)

  const handleCopy = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: `${box.nickname}님의 벚꽃편지함`, url: shareUrl })
        trackShareLink('native_share')
      } else {
        await navigator.clipboard.writeText(shareUrl)
        trackShareLink('copy')
        setCopied(true); setTimeout(() => setCopied(false), 2200)
      }
    } catch {
      try {
        await navigator.clipboard.writeText(shareUrl)
        trackShareLink('copy')
        setCopied(true); setTimeout(() => setCopied(false), 2200)
      } catch { }
    }
  }

  return (
    <>
      <Helmet>
        <title>{box.nickname}님의 벚꽃 편지함</title>
      </Helmet>
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(180deg, ${conf.skyA} 0%, ${conf.skyB} 50%, ${conf.bodyBg} 100%)`,
      display: 'flex', flexDirection: 'column',
      transition: 'background 1.6s ease',
      position: 'relative', overflow: 'hidden',
    }}>
      {stage === 3 && <FallingPetals />}

      {/* Top bar */}
      <div style={{
        padding: '52px 18px 12px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'relative', zIndex: 20,
        animation: 'fadeUp 0.6s ease forwards',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(12px)',
          padding: '8px 14px', borderRadius: 99,
          border: '1.5px solid rgba(255,179,204,0.5)',
          boxShadow: '0 2px 14px rgba(255,107,157,0.14)',
        }}>
          <span style={{ fontSize: 16, animation: 'floatY 2.5s ease-in-out infinite' }}>🌸</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#CC3D6B' }}>{box.nickname}님의 나무</span>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)',
          padding: '6px 12px', borderRadius: 99,
          border: '1px solid rgba(255,179,204,0.35)',
          fontSize: 11, fontWeight: 700, color: '#C0607A',
        }}>
          <span>{conf.labelEmoji}</span>
          <span>{conf.label}</span>
        </div>
      </div>

      {/* Tree */}
      <div style={{ position: 'relative', zIndex: 15, animation: 'fadeUp 0.6s 0.1s ease backwards' }}>
        <CherryTree letterCount={box.letters.length} />
      </div>

      {/* Bottom card */}
      <div style={{
        margin: '0 14px 22px',
        background: 'rgba(255,255,255,0.86)', backdropFilter: 'blur(22px)',
        borderRadius: 30,
        border: '1.5px solid rgba(255,179,204,0.38)',
        boxShadow: '0 8px 36px rgba(255,107,157,0.14)',
        overflow: 'hidden',
        position: 'relative', zIndex: 20,
        animation: 'fadeUp 0.6s 0.18s ease backwards',
      }}>
        <ShimmerStrip />

        <div style={{ padding: '14px 18px 18px' }}>
          {/* Progress */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#AAA' }}>피어난 벚꽃</span>
                <span style={{
                  fontSize: 13, fontWeight: 800, color: '#FF6B9D',
                  background: '#FFE0EE', padding: '2px 9px', borderRadius: 99,
                }}>{box.letters.length}송이 🌸</span>
              </div>
              {stage < 3 && remaining > 0 && (
                <span style={{ fontSize: 11, color: '#C0A8C0', fontWeight: 500 }}>다음 단계까지 {remaining}통</span>
              )}
              {stage === 3 && (
                <span style={{ fontSize: 11, color: '#FF6B9D', fontWeight: 800 }}>🎉 만개!</span>
              )}
            </div>
            <div style={{ height: 8, background: '#FFE8F2', borderRadius: 99, overflow: 'hidden', border: '1px solid rgba(255,179,204,0.28)' }}>
              <div style={{
                height: '100%',
                width: `${stage === 3 ? 100 : Math.min(100, (box.letters.length / 4) * 100)}%`,
                background: 'linear-gradient(90deg, #FFB3CC, #FF6B9D)',
                borderRadius: 99, transition: 'width 1s cubic-bezier(0.22,1,0.36,1)',
              }} />
            </div>
          </div>

          {/* Letter grid */}
          {box.letters.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#C0A0C0', letterSpacing: 0.5 }}>
                  💌 받은 편지 — 꽃을 눌러보세요
                </p>
                <p style={{ fontSize: 10, fontWeight: 600, color: '#C0A0C0' }}>
                  {readIds.size}/{box.letters.length} 읽음
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 7 }}>
                {box.letters.map((letter, i) => {
                  const m = TYPE_META[letter.type]
                  const isRead = readIds.has(letter.id)
                  return (
                    <button
                      key={letter.id}
                      onClick={() => { setSelectedLetter(letter); markRead(letter.id) }}
                      style={{
                        aspectRatio: '1',
                        background: `radial-gradient(circle at 38% 34%, #fff, ${m.bg})`,
                        border: `2px solid ${m.pill}`,
                        borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: isRead ? 'none' : `0 3px 10px ${m.color}25`,
                        animation: `bloomIn 0.44s ${i * 0.05}s ease backwards`,
                        transition: 'transform 0.15s, opacity 0.3s, filter 0.3s',
                        opacity: isRead ? 0.35 : 1,
                        filter: isRead ? 'blur(1px) grayscale(0.3)' : 'none',
                      }}
                      onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.88)')}
                      onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                    >
                      <span style={{ fontSize: 14 }}>{m.emoji}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Share */}
          <div style={{
            background: '#FFF0F6', borderRadius: 18,
            padding: '12px 14px', border: '1.5px solid #FFD8EE',
            marginBottom: 10,
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#C0607A', marginBottom: 6 }}>
              🔗 링크를 공유하면 친구들이 편지를 써줄 수 있어요
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{
                flex: 1, padding: '9px 12px',
                background: '#fff', borderRadius: 12,
                border: '1.5px solid #FFD0E8',
                fontSize: 11, color: '#C0A8C0', fontWeight: 500,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {shareUrl.replace(/https?:\/\//, '')}
              </div>
              <button onClick={handleCopy} style={{
                padding: '9px 14px', borderRadius: 12,
                background: copied
                  ? 'linear-gradient(135deg, #7ACC8A, #4DB870)'
                  : 'linear-gradient(135deg, #FF85AD, #FF6B9D)',
                color: '#fff', fontSize: 12, fontWeight: 800,
                boxShadow: '0 3px 14px rgba(255,107,157,0.36)',
                transition: 'all 0.3s ease', whiteSpace: 'nowrap',
              }}>
                {copied ? '✓ 복사됨' : '링크 복사'}
              </button>
            </div>
          </div>

          {/* 롤링페이퍼 소장 버튼 */}
          <button
            onClick={() => setShowRollingPaper(true)}
            style={{
              width: '100%', padding: '13px 16px',
              background: 'linear-gradient(135deg, #FFD0E8 0%, #E8D0FF 100%)',
              border: '1.5px solid #F0B8D8',
              borderRadius: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 4px 18px rgba(255,107,157,0.18)',
              transition: 'all 0.2s',
            }}
            onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
            onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <span style={{ fontSize: 18 }}>🎀</span>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#CC3D6B' }}>
                {isPremium ? '내 롤링페이퍼 보기 · 저장하기' : '내 편지 롤링페이퍼로 소장하기'}
              </p>
              <p style={{ fontSize: 10, color: '#D08AB0', fontWeight: 500 }}>
                {isPremium ? '결제 완료 · 언제든 저장 가능해요' : '받은 편지를 예쁜 이미지로 저장 · 990원'}
              </p>
            </div>
          </button>
        </div>
      </div>

      {selectedLetter && (
        <LetterModal letter={selectedLetter} onClose={() => setSelectedLetter(null)} onDelete={handleDelete} />
      )}
      {showRollingPaper && (
        <RollingPaperModal
          boxId={userId}
          nickname={box.nickname}
          realLetters={box.letters}
          initialPaid={isPremium}
          onPaid={() => setIsPremium(true)}
          onClose={() => setShowRollingPaper(false)}
        />
      )}
    </div>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════
   SCREEN 4 — WRITE  (/write/:userId)
═══════════════════════════════════════════════════════════ */
function WriteScreen({ userId }: { userId: string }) {
  const [box, setBox] = useState<{ id: string; nickname: string } | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [type, setType] = useState<LetterType>('감사')
  const [message, setMessage] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(true)
  const [from, setFrom] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const meta = TYPE_META[type]

  useEffect(() => {
    supabase
      .from('letter_boxes')
      .select('id, nickname')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data) setBox(data)
        setPageLoading(false)
      })
  }, [userId])

  if (pageLoading) {
    return (
      <div style={{
        minHeight: '100dvh', background: '#FFF5F9',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 36, animation: 'floatY 1s ease-in-out infinite' }}>🌸</span>
      </div>
    )
  }

  if (!box) {
    return (
      <div style={{
        minHeight: '100dvh', background: '#FFF5F9',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        gap: 16, padding: '20px 20px 28px', position: 'relative', overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch',
      }}>
        <span style={{ fontSize: 48 }}>🌱</span>
        <p style={{ fontSize: 16, color: '#C09AB0', fontWeight: 600, textAlign: 'center', lineHeight: 1.7 }}>
          편지함을 찾을 수 없어요<br />
          <span style={{ fontSize: 13, fontWeight: 400 }}>올바른 링크인지 확인해주세요</span>
        </p>
      </div>
    )
  }

  const handleSubmit = async () => {
    if (!message.trim() || loading) return
    setLoading(true)
    await supabase.from('letters').insert({
      box_id: userId,
      type,
      message: message.trim(),
      from_name: isAnonymous ? '익명' : (from.trim() || '익명'),
      is_anonymous: isAnonymous,
    })
    setLoading(false)
    trackSendLetter(type, isAnonymous)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div style={{
        minHeight: '100dvh',
        background: `linear-gradient(160deg, ${meta.bg} 0%, #FFF5F9 100%)`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 22, padding: '32px 28px',
        position: 'relative', overflow: 'hidden',
      }}>
        {['🌸', '✨', '💕', '🌸', '✨'].map((e, i) => (
          <span key={i} style={{
            position: 'absolute', fontSize: 20 + i * 4,
            left: `${10 + i * 18}%`, top: `${14 + (i % 3) * 22}%`,
            opacity: 0.4, pointerEvents: 'none',
            animation: `floatY ${2 + i * 0.4}s ${i * 0.3}s ease-in-out infinite`,
          }}>{e}</span>
        ))}
        <div style={{
          width: 96, height: 96, borderRadius: '50%',
          background: `linear-gradient(135deg, ${meta.soft}, ${meta.color})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 46, boxShadow: `0 14px 44px ${meta.color}44`,
          animation: 'bloomIn 0.6s ease forwards',
        }}>{meta.emoji}</div>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 22, color: meta.color, fontWeight: 800, marginBottom: 10 }}>
            꽃이 피었어요! 🌸
          </h2>
          <p style={{ fontSize: 14, color: '#C09AB0', lineHeight: 1.9, fontWeight: 500 }}>
            소중한 진심 한 통이{' '}
            <b style={{ color: meta.color }}>{box.nickname}</b>님의<br />
            나무에 꽃으로 피어났습니다
          </p>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(12px)',
          borderRadius: 22, padding: '18px 24px',
          border: `1.5px solid ${meta.pill}`, maxWidth: 300, textAlign: 'center',
        }}>
          <p style={{ fontSize: 13, color: meta.color, fontWeight: 700, marginBottom: 6 }}>
            당신의 편지로
          </p>
          <p style={{ fontSize: 14, color: '#3D1025', fontWeight: 600, lineHeight: 1.8 }}>
            {box.nickname}님의 나무에<br />
            우리만의 봄이 피어났습니다 🌸
          </p>
        </div>
        <button onClick={() => go('/')} style={{
          padding: '13px 28px', marginTop: 4,
          background: `linear-gradient(135deg, ${meta.soft}, ${meta.color})`,
          borderRadius: 18, fontSize: 14, fontWeight: 700, color: '#fff',
          boxShadow: `0 4px 18px ${meta.color}38`,
        }}>
          나도 봄 편지함 만들기 →
        </button>
      </div>
    )
  }

  return (
    <>
      <Helmet>
        <title>{box ? `${box.nickname}님의 진심을 기다리고 있어요 · 벚꽃 편지함` : '벚꽃 편지함'}</title>
      </Helmet>
    <div style={{ minHeight: '100dvh', background: '#FFF5F9', display: 'flex', flexDirection: 'column' }}
      className="screen-enter">
      {/* Header */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top, 0px) + 16px) 18px 12px',
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)',
        borderBottom: '1.5px solid #FFE0EC',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, animation: 'floatY 2.5s ease-in-out infinite' }}>🌸</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#C09AB0' }}>벚꽃편지함</span>
          </div>
          <button onClick={() => { trackWriteToCreate(); go('/create') }} style={{
            padding: '6px 12px',
            background: 'linear-gradient(135deg, #FF85AD, #FF6B9D)',
            borderRadius: 20, fontSize: 11, fontWeight: 700, color: '#fff',
            boxShadow: '0 3px 10px rgba(255,107,157,0.35)',
            whiteSpace: 'nowrap',
          }}>
            🌱 나도 편지함 만들기
          </button>
        </div>
        <h2 style={{ fontSize: 19, fontWeight: 900, color: '#2D1020', letterSpacing: -0.3, lineHeight: 1.35 }}>
          <span style={{
            background: 'linear-gradient(135deg, #FF6B9D, #A78BFA)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>{box.nickname}</span>님에게<br />
          평소 전하지 못한 마음을 전해보세요 💌
        </h2>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px' }}>
        {/* Type */}
        <p style={{ fontSize: 11, fontWeight: 700, color: '#C0A0C0', marginBottom: 8, letterSpacing: 0.8 }}>
          💭 어떤 마음을 담을까요?
        </p>
        <div style={{ display: 'flex', gap: 9, marginBottom: 14 }}>
          {(['칭찬', '응원', '감사'] as LetterType[]).map(t => {
            const m = TYPE_META[t]; const active = type === t
            return (
              <button key={t} onClick={() => setType(t)} style={{
                flex: 1, padding: '10px 6px',
                background: active ? m.bg : '#fff',
                border: `2px solid ${active ? m.soft : '#F0E0E8'}`,
                borderRadius: 22,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                transition: 'all 0.2s ease',
                boxShadow: active ? `0 4px 18px ${m.color}28` : '0 2px 8px rgba(0,0,0,0.04)',
                transform: active ? 'scale(1.05)' : 'scale(1)',
              }}>
                <span style={{
                  fontSize: 26, display: 'inline-block',
                  animation: active ? 'wiggle 1.5s ease-in-out infinite' : 'none',
                }}>{m.emoji}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: active ? m.color : '#BBA8CC' }}>{t}</span>
                <span style={{ fontSize: 9, color: active ? m.color + 'BB' : '#CCC0D8', textAlign: 'center', lineHeight: 1.4, fontWeight: 500 }}>
                  {m.desc}
                </span>
              </button>
            )
          })}
        </div>

        {/* Message */}
        <p style={{ fontSize: 11, fontWeight: 700, color: '#C0A0C0', marginBottom: 8, letterSpacing: 0.8 }}>
          💌 진심을 담아 써보세요
        </p>
        <div style={{
          background: '#fff', border: `2px solid ${meta.soft}`,
          borderRadius: 22, overflow: 'hidden', marginBottom: 12,
          boxShadow: `0 4px 20px ${meta.color}12`,
          transition: 'border-color 0.3s, box-shadow 0.3s',
        }}>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={`${box.nickname}님에게 ${['칭찬하고 싶은 점', '힘이 되는 말', '감사한 마음'][['칭찬', '응원', '감사'].indexOf(type)]}을 써주세요...`}
            maxLength={200}
            style={{
              width: '100%', minHeight: 100, padding: '12px 16px',
              background: 'transparent', border: 'none', outline: 'none', resize: 'none',
              fontSize: 15, color: '#2D1020', lineHeight: 1.9, fontWeight: 400,
            }}
          />
          <div style={{
            padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderTop: `1.5px solid ${meta.pill}`, background: meta.bg,
          }}>
            <span style={{ fontSize: 11, color: meta.color + '88', fontWeight: 600 }}>
              {message.length > 0 ? '✍️ 작성 중...' : ''}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: message.length > 180 ? '#FF6B9D' : '#C0B0C8' }}>
              {message.length} / 200
            </span>
          </div>
        </div>

        {/* Sender */}
        <p style={{ fontSize: 11, fontWeight: 700, color: '#C0A0C0', marginBottom: 10, letterSpacing: 0.8 }}>
          👤 보내는 사람
        </p>
        <div style={{
          background: '#FFF0F6', border: '2px solid #FFE0EC',
          borderRadius: 20, overflow: 'hidden', marginBottom: 8,
          boxShadow: '0 2px 12px rgba(255,107,157,0.08)',
        }}>
          <div style={{ display: 'flex', gap: 6, padding: 6 }}>
            {[{ v: true, label: '🎭 익명으로' }, { v: false, label: '✍️ 이름 남기기' }].map(opt => {
              const active = isAnonymous === opt.v
              return (
                <button key={String(opt.v)} onClick={() => setIsAnonymous(opt.v)} style={{
                  flex: 1, padding: '10px 8px',
                  background: active ? 'linear-gradient(135deg, #FF85AD, #FF6B9D)' : 'transparent',
                  color: active ? '#fff' : '#C0A0C0',
                  fontSize: 13, fontWeight: active ? 800 : 500,
                  borderRadius: 14,
                  boxShadow: active ? '0 4px 14px rgba(255,107,157,0.35)' : 'none',
                  transform: active ? 'scale(1.03)' : 'scale(1)',
                  transition: 'all 0.2s ease',
                }}>{opt.label}</button>
              )
            })}
          </div>
          {!isAnonymous && (
            <input value={from} onChange={e => setFrom(e.target.value)}
              placeholder="이름 또는 닉네임을 적어주세요"
              style={{
                width: '100%', padding: '12px 16px',
                background: 'transparent', border: 'none',
                borderTop: '1.5px solid #FFE0EC',
                outline: 'none', fontSize: 14, color: '#2D1020', fontWeight: 400,
              }}
            />
          )}
        </div>
      </div>

      {/* Submit */}
      <div style={{
        position: 'sticky',
        bottom: 0,
        paddingTop: 12,
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
        background: `linear-gradient(to top, rgba(255,245,249,0.96) 78%, rgba(255,255,255,0))`,
        backdropFilter: 'blur(8px)',
        borderTop: '1px solid #FFE8F2',
      }}>
        <button
          onClick={handleSubmit}
          disabled={!message.trim() || loading}
          style={{
            width: '100%',
            minHeight: 54,
            padding: '14px 16px',
            background: message.trim()
              ? `linear-gradient(135deg, ${meta.soft}, ${meta.color})`
              : '#F0E0E8',
            border: 'none',
            borderRadius: 20,
            fontSize: 14,
            fontWeight: 800,
            color: message.trim() ? '#fff' : '#C8A8C0',
            boxShadow: message.trim() ? `0 6px 26px ${meta.color}42` : 'none',
            transition: 'all 0.3s ease',
            letterSpacing: 0.2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            whiteSpace: 'normal',
            textAlign: 'center',
            lineHeight: 1.4,
          }}
          onPointerDown={e => message.trim() && (e.currentTarget.style.transform = 'scale(0.97)')}
          onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          {loading
            ? <span style={{ display: 'inline-block', animation: 'floatY 0.6s ease-in-out infinite' }}>🌸</span>
            : <>{meta.emoji} {box.nickname}님께 꽃 보내기</>
          }
        </button>
      </div>
    </div>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════
   APP ROOT — path-based routing
═══════════════════════════════════════════════════════════ */
export default function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname))

  useEffect(() => {
    const el = document.createElement('style')
    el.textContent = CSS; document.head.appendChild(el)
    return () => { document.head.removeChild(el) }
  }, [])

  useEffect(() => {
    const handler = () => setRoute(parseRoute(window.location.pathname))
    window.addEventListener('popstate', handler)
    window.addEventListener('routechange', handler)
    return () => {
      window.removeEventListener('popstate', handler)
      window.removeEventListener('routechange', handler)
    }
  }, [])

  // 페이지뷰 추적
  useEffect(() => {
    const pageMap: Record<Route['path'], string> = {
      landing: '메인',
      create: '편지함 만들기',
      dashboard: '내 편지함',
      write: '편지 쓰기',
    }
    trackPageView(window.location.pathname, pageMap[route.path])
  }, [route])


  return (
    <div className="app-shell">
      {route.path === 'landing' && <LandingScreen />}
      {route.path === 'create' && <CreateScreen />}
      {route.path === 'dashboard' && <DashboardScreen key={route.userId} userId={route.userId} />}
      {route.path === 'write' && <WriteScreen key={route.userId} userId={route.userId} />}
    </div>
  )
}