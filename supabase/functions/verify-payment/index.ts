import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXPECTED_AMOUNT = 990
// PORTONE_IMP_KEY / PORTONE_IMP_SECRET 는 Supabase Dashboard → Functions → verify-payment → Secrets 에 등록해야 합니다.
const IMP_KEY = Deno.env.get('PORTONE_IMP_KEY') ?? ''
const IMP_SECRET = Deno.env.get('PORTONE_IMP_SECRET') ?? ''
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 Edge Function 내장 환경변수입니다 (자동 주입).
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// 항상 200으로 응답 — supabase.functions.invoke 는 4xx/5xx 시 data 를 null 로 반환하므로
// 성공/실패 모두 200 + { success, reason } 패턴을 사용합니다.
function ok(body: object) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  try {
    const { impUid, merchantUid, boxId } = await req.json() as {
      impUid: string
      merchantUid: string
      boxId: string
    }

    if (!impUid || !merchantUid || !boxId) {
      return ok({ success: false, reason: '필수 파라미터 누락 (impUid / merchantUid / boxId)' })
    }

    if (!IMP_KEY || !IMP_SECRET) {
      return ok({ success: false, reason: 'Edge Function Secrets 미설정: PORTONE_IMP_KEY / PORTONE_IMP_SECRET 를 Supabase Dashboard에 등록해주세요.' })
    }

    // ── 1. PortOne V1 액세스 토큰 발급 ────────────────────────
    const tokenRes = await fetch('https://api.iamport.kr/users/getToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imp_key: IMP_KEY, imp_secret: IMP_SECRET }),
    })
    const tokenBody = await tokenRes.json() as {
      code: number
      message: string
      response?: { access_token: string }
    }

    if (tokenBody.code !== 0 || !tokenBody.response?.access_token) {
      return ok({ success: false, reason: `PortOne 인증 실패: ${tokenBody.message}` })
    }

    const accessToken = tokenBody.response.access_token

    // ── 2. imp_uid 로 결제 정보 직접 조회 ─────────────────────
    const paymentRes = await fetch(
      `https://api.iamport.kr/payments/${encodeURIComponent(impUid)}`,
      { headers: { Authorization: accessToken } }
    )
    const paymentBody = await paymentRes.json() as {
      code: number
      message: string
      response?: { status: string; amount: number; merchant_uid: string }
    }

    if (paymentBody.code !== 0 || !paymentBody.response) {
      return ok({ success: false, reason: `결제 정보 조회 실패: ${paymentBody.message}` })
    }

    const payment = paymentBody.response

    // ── 3. 금액·상태·merchant_uid 검증 ────────────────────────
    if (payment.status !== 'paid') {
      return ok({ success: false, reason: `결제 상태 불일치: ${payment.status}` })
    }
    if (payment.amount !== EXPECTED_AMOUNT) {
      return ok({ success: false, reason: `금액 불일치: ${payment.amount}원 (기대값: ${EXPECTED_AMOUNT}원)` })
    }
    if (payment.merchant_uid !== merchantUid) {
      return ok({ success: false, reason: 'merchant_uid 불일치' })
    }

    // ── 4. Supabase DB 업데이트 ────────────────────────────────
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { error } = await supabase
      .from('letter_boxes')
      .update({ is_premium: true })
      .eq('id', boxId)

    if (error) {
      return ok({ success: false, reason: `DB 업데이트 실패: ${error.message}` })
    }

    return ok({ success: true })
  } catch (e) {
    return ok({ success: false, reason: `서버 오류: ${String(e)}` })
  }
})
