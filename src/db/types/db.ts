export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[]

export interface Database {
  public: {
    Tables: {
      conversations: {
        Row: {
          active: boolean
          channel: string | null
          count: number
          createdAt: string
          guild: string | null
          history: Json | null
          id: string
          updatedAt: string | null
        }
        Insert: {
          active: boolean
          channel?: string | null
          count?: number
          createdAt?: string
          guild?: string | null
          history?: Json | null
          id: string
          updatedAt?: string | null
        }
        Update: {
          active?: boolean
          channel?: string | null
          count?: number
          createdAt?: string
          guild?: string | null
          history?: Json | null
          id?: string
          updatedAt?: string | null
        }
      }
      cooldown: {
        Row: {
          createdAt: string
          id: string
          name: string
        }
        Insert: {
          createdAt?: string
          id: string
          name: string
        }
        Update: {
          createdAt?: string
          id?: string
          name?: string
        }
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