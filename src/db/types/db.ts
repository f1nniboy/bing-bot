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
      sessions: {
        Row: {
          active: boolean | null
          id: string
        }
        Insert: {
          active?: boolean | null
          id: string
        }
        Update: {
          active?: boolean | null
          id?: string
        }
      }
      usage: {
        Row: {
          id: string
          initialAt: string
          interactions: number
          latestAt: string
        }
        Insert: {
          id: string
          initialAt?: string
          interactions?: number
          latestAt?: string
        }
        Update: {
          id?: string
          initialAt?: string
          interactions?: number
          latestAt?: string
        }
      }
      users: {
        Row: {
          banned: boolean
          dev: boolean
          id: string
          infractions: Json | null
        }
        Insert: {
          banned?: boolean
          dev?: boolean
          id: string
          infractions?: Json | null
        }
        Update: {
          banned?: boolean
          dev?: boolean
          id?: string
          infractions?: Json | null
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
