-- letter_boxes 테이블에 프리미엄 여부 컬럼 추가
ALTER TABLE letter_boxes
  ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false;

-- 편지함 오너가 자신의 is_premium 업데이트 가능
CREATE POLICY "letter_boxes: owner update premium"
  ON letter_boxes FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
