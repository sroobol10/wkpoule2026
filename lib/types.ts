export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bonus_answers: {
        Row: {
          answer: string
          created_at: string
          id: string
          points_awarded: number | null
          question_id: string
          user_id: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          points_awarded?: number | null
          question_id: string
          user_id: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          points_awarded?: number | null
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonus_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "bonus_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_answers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bonus_questions: {
        Row: {
          answer_options: string[] | null
          answer_type: string
          correct_answer: string | null
          correct_answer_set: boolean
          created_at: string
          description: string | null
          id: string
          question: string
          type: string
          unlock_date: string | null
        }
        Insert: {
          answer_options?: string[] | null
          answer_type?: string
          correct_answer?: string | null
          correct_answer_set?: boolean
          created_at?: string
          description?: string | null
          id?: string
          question: string
          type: string
          unlock_date?: string | null
        }
        Update: {
          answer_options?: string[] | null
          answer_type?: string
          correct_answer?: string | null
          correct_answer_set?: boolean
          created_at?: string
          description?: string | null
          id?: string
          question?: string
          type?: string
          unlock_date?: string | null
        }
        Relationships: []
      }
      group_advancement: {
        Row: {
          created_at: string
          id: string
          points_awarded: number | null
          predicted_position: number
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          points_awarded?: number | null
          predicted_position: number
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          points_awarded?: number | null
          predicted_position?: number
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_advancement_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_advancement_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      jokers: {
        Row: {
          created_at: string
          group_name: string
          id: string
          match_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_name: string
          id?: string
          match_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_name?: string
          id?: string
          match_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jokers_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jokers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      knockout_predictions: {
        Row: {
          created_at: string
          id: string
          match_id: string
          points_awarded: number | null
          predicted_winner_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          points_awarded?: number | null
          predicted_winner_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          points_awarded?: number | null
          predicted_winner_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knockout_predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knockout_predictions_predicted_winner_id_fkey"
            columns: ["predicted_winner_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knockout_predictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_cards: {
        Row: {
          created_at:   string
          id:           string
          match_id:     string
          red_cards:    number
          team_id:      string
          yellow_cards: number
        }
        Insert: {
          created_at?:  string
          id?:          string
          match_id:     string
          red_cards?:   number
          team_id:      string
          yellow_cards?: number
        }
        Update: {
          created_at?:  string
          id?:          string
          match_id?:    string
          red_cards?:   number
          team_id?:     string
          yellow_cards?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_cards_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_cards_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          away_score: number | null
          away_team_id: string | null
          created_at: string
          home_score: number | null
          home_team_id: string | null
          id: string
          kickoff_at: string
          match_number: number | null
          result_entered: boolean
          shootout_winner_id: string | null
          stage: string
          venue: string | null
        }
        Insert: {
          away_score?: number | null
          away_team_id?: string | null
          created_at?: string
          home_score?: number | null
          home_team_id?: string | null
          id?: string
          kickoff_at: string
          match_number?: number | null
          result_entered?: boolean
          shootout_winner_id?: string | null
          stage: string
          venue?: string | null
        }
        Update: {
          away_score?: number | null
          away_team_id?: string | null
          created_at?: string
          home_score?: number | null
          home_team_id?: string | null
          id?: string
          kickoff_at?: string
          match_number?: number | null
          result_entered?: boolean
          shootout_winner_id?: string | null
          stage?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      poule_members: {
        Row: {
          id: string
          joined_at: string
          poule_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          poule_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          poule_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poule_members_poule_id_fkey"
            columns: ["poule_id"]
            isOneToOne: false
            referencedRelation: "poules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poule_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      poule_scores: {
        Row: {
          bonus_daily_pts: number
          bonus_pre_pts: number
          correct_results: number
          exact_hits: number
          group_match_pts: number
          group_standings_pts: number
          jokers_played: number
          knockout_pts: number
          poule_id: string
          rank_change: number | null
          total_pts: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bonus_daily_pts?: number
          bonus_pre_pts?: number
          correct_results?: number
          exact_hits?: number
          group_match_pts?: number
          group_standings_pts?: number
          jokers_played?: number
          knockout_pts?: number
          poule_id: string
          rank_change?: number | null
          total_pts?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bonus_daily_pts?: number
          bonus_pre_pts?: number
          correct_results?: number
          exact_hits?: number
          group_match_pts?: number
          group_standings_pts?: number
          jokers_played?: number
          knockout_pts?: number
          poule_id?: string
          rank_change?: number | null
          total_pts?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poule_scores_poule_id_fkey"
            columns: ["poule_id"]
            isOneToOne: false
            referencedRelation: "poules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poule_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      poules: {
        Row: {
          created_at: string
          creator_id: string | null
          id: string
          invite_code: string
          is_general: boolean
          name: string
        }
        Insert: {
          created_at?: string
          creator_id?: string | null
          id?: string
          invite_code: string
          is_general?: boolean
          name: string
        }
        Update: {
          created_at?: string
          creator_id?: string | null
          id?: string
          invite_code?: string
          is_general?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "poules_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          created_at: string
          id: string
          match_id: string
          points_awarded: number | null
          predicted_away: number
          predicted_home: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          points_awarded?: number | null
          predicted_away: number
          predicted_home: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          points_awarded?: number | null
          predicted_away?: number
          predicted_home?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          is_admin: boolean
          theme: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          is_admin?: boolean
          theme?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          is_admin?: boolean
          theme?: string
          username?: string
        }
        Relationships: []
      }
      teams: {
        Row: {
          code: string
          created_at: string
          flag_url: string
          group_name: string
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          flag_url: string
          group_name: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          flag_url?: string
          group_name?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_match_points: {
        Args: {
          p_actual_away: number
          p_actual_home: number
          p_predicted_away: number
          p_predicted_home: number
        }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
