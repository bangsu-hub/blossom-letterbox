-- ──────────────────────────────────────────
-- TABLES
-- ──────────────────────────────────────────

CREATE TABLE letter_boxes (
  id          uuid PRIMARY KEY,
  owner_id    uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname    text NOT NULL CHECK (char_length(nickname) BETWEEN 1 AND 12),
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE letters (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id       uuid NOT NULL REFERENCES letter_boxes(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('칭찬', '응원', '감사')),
  message      text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 200),
  from_name    text NOT NULL DEFAULT '익명',
  is_anonymous boolean NOT NULL DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

-- ──────────────────────────────────────────
-- INDEXES
-- ──────────────────────────────────────────

CREATE INDEX idx_letter_boxes_owner_id ON letter_boxes(owner_id);
CREATE INDEX idx_letters_box_id_date   ON letters(box_id, created_at DESC);

-- ──────────────────────────────────────────
-- RLS 활성화
-- ──────────────────────────────────────────

ALTER TABLE letter_boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE letters      ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────
-- letter_boxes RLS
-- ──────────────────────────────────────────

-- 비로그인 포함 누구나 편지함 닉네임 조회 (편지 작성 화면용)
CREATE POLICY "letter_boxes: public select"
  ON letter_boxes FOR SELECT
  TO anon, authenticated
  USING (true);

-- 본인만 편지함 생성
CREATE POLICY "letter_boxes: owner insert"
  ON letter_boxes FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- ──────────────────────────────────────────
-- letters RLS
-- ──────────────────────────────────────────

-- 비로그인 포함 누구나 편지 작성 (존재하는 박스에만)
CREATE POLICY "letters: public insert"
  ON letters FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    box_id IN (SELECT id FROM letter_boxes)
  );

-- 편지함 주인만 자기 편지 조회
CREATE POLICY "letters: box owner select"
  ON letters FOR SELECT
  TO authenticated
  USING (
    box_id IN (
      SELECT id FROM letter_boxes WHERE owner_id = auth.uid()
    )
  );
