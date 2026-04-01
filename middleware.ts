import { next } from '@vercel/edge'

export const config = {
  matcher: ['/', '/write/:path*'],
}

const BASE_URL = 'https://blossom-letterbox.vercel.app'
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`

function buildOgHtml(title: string, description: string, pageUrl: string) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="벚꽃 편지함">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${DEFAULT_IMAGE}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:locale" content="ko_KR">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${DEFAULT_IMAGE}">
</head>
<body></body>
</html>`
}

export default async function middleware(request: Request) {
  const ua = request.headers.get('user-agent') ?? ''
  const isCrawler = /kakaotalk-scrap|facebookexternalhit|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|googlebot|bingbot/i.test(ua)

  if (!isCrawler) return next()

  const url = new URL(request.url)

  // 랜딩 페이지 (/)
  if (url.pathname === '/') {
    const html = buildOgHtml(
      '벚꽃 편지함 🌸',
      '소중한 진심 한 통에 하나씩, 우리만의 봄이 피어납니다',
      `${BASE_URL}/`
    )
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  // 편지 작성 페이지 (/write/:userId)
  const userId = url.pathname.replace('/write/', '').replace(/\/$/, '')

  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? ''
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? ''

  let nickname = '누군가'
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/letter_boxes?id=eq.${userId}&select=nickname`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    )
    const data = await res.json()
    if (data?.[0]?.nickname) nickname = data[0].nickname
  } catch {}

  const html = buildOgHtml(
    `${nickname}님이 당신의 진심을 기다리고 있어요 🌸`,
    `${nickname}님에게 평소 전하지 못한 마음을 전해보세요`,
    url.href
  )
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
