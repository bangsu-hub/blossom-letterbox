import ReactGA from 'react-ga4'

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined

export function initGA() {
  if (!MEASUREMENT_ID) return
  ReactGA.initialize(MEASUREMENT_ID)
}

/** 페이지뷰 */
export function trackPageView(path: string, title: string) {
  if (!MEASUREMENT_ID) return
  ReactGA.send({ hitType: 'pageview', page: path, title })
}

/** 편지함 생성 완료 */
export function trackCreateMailbox(nickname: string) {
  if (!MEASUREMENT_ID) return
  ReactGA.event('create_mailbox', { nickname })
}

/** 편지 전송 완료 */
export function trackSendLetter(letterType: string, isAnonymous: boolean) {
  if (!MEASUREMENT_ID) return
  ReactGA.event('send_letter', { letter_type: letterType, is_anonymous: isAnonymous })
}

/** 공유 버튼 클릭 */
export function trackShareLink(method: 'copy' | 'native_share') {
  if (!MEASUREMENT_ID) return
  ReactGA.event('share_link', { method })
}

/** 편지 작성 화면 → 편지함 만들기 이동 */
export function trackWriteToCreate() {
  if (!MEASUREMENT_ID) return
  ReactGA.event('click_create_from_write')
}
