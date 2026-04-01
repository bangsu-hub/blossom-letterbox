import { createClient } from '@supabase/supabase-js'

export type LetterType = '칭찬' | '응원' | '감사'

export interface Database {
  public: {
    PostgrestVersion: "12"
    Tables: {
      letter_boxes: {
        Row: {
          id: string
          owner_id: string
          nickname: string
          created_at: string
        }
        Insert: {
          id: string
          owner_id?: string
          nickname: string
          created_at?: string
        }
        Update: {
          nickname?: string
        }
        Relationships: []
      }
      letters: {
        Row: {
          id: string
          box_id: string
          type: LetterType
          message: string
          from_name: string
          is_anonymous: boolean
          created_at: string
        }
        Insert: {
          id?: string
          box_id: string
          type: LetterType
          message: string
          from_name?: string
          is_anonymous?: boolean
          created_at?: string
        }
        Update: {
          [key: string]: never
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY

export const supabase = createClient<Database>(supabaseUrl, supabaseKey)
