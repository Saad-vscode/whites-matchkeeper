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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      deliveries: {
        Row: {
          bowler: string
          created_at: string
          created_by: string
          extra_type: string
          extras: number
          id: string
          innings: number
          match_id: string
          non_striker: string
          runs_bat: number
          seq: number
          striker: string
          wicket: Json | null
        }
        Insert: {
          bowler: string
          created_at?: string
          created_by?: string
          extra_type?: string
          extras?: number
          id: string
          innings: number
          match_id: string
          non_striker: string
          runs_bat?: number
          seq: number
          striker: string
          wicket?: Json | null
        }
        Update: {
          bowler?: string
          created_at?: string
          created_by?: string
          extra_type?: string
          extras?: number
          id?: string
          innings?: number
          match_id?: string
          non_striker?: string
          runs_bat?: number
          seq?: number
          striker?: string
          wicket?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      fixture_generation_requests: {
        Row: {
          created_at: string
          created_by: string
          match_ids: string[]
          payload_hash: string
          request_id: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          match_ids: string[]
          payload_hash: string
          request_id: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          match_ids?: string[]
          payload_hash?: string
          request_id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixture_generation_requests_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      match_award_publications: {
        Row: {
          match_id: string
          published_at: string
          published_by: string | null
          score_revision: number
        }
        Insert: {
          match_id: string
          published_at?: string
          published_by?: string | null
          score_revision: number
        }
        Update: {
          match_id?: string
          published_at?: string
          published_by?: string | null
          score_revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_award_publications_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_scorers: {
        Row: {
          email: string | null
          match_id: string
          user_id: string
        }
        Insert: {
          email?: string | null
          match_id: string
          user_id: string
        }
        Update: {
          email?: string | null
          match_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_scorers_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          balls_per_over: number
          created_at: string
          created_by: string
          id: string
          live: Json
          match_date: string | null
          name: string
          overs: number
          platform_archived: boolean
          platform_deleted_at: string | null
          platform_disabled: boolean
          platform_hidden: boolean
          players_per_team: number
          result: string | null
          rules: Json
          scheduled_time: string | null
          score_revision: number
          status: string
          team_a: string
          team_a_id: string | null
          team_a_players: string[]
          team_b: string
          team_b_id: string | null
          team_b_players: string[]
          tie_break_toss_winner: string | null
          toss_decision: string | null
          toss_winner: string | null
          tournament_id: string | null
          updated_at: string
          venue: string | null
        }
        Insert: {
          balls_per_over?: number
          created_at?: string
          created_by?: string
          id?: string
          live?: Json
          match_date?: string | null
          name: string
          overs?: number
          platform_archived?: boolean
          platform_deleted_at?: string | null
          platform_disabled?: boolean
          platform_hidden?: boolean
          players_per_team?: number
          result?: string | null
          rules?: Json
          scheduled_time?: string | null
          score_revision?: number
          status?: string
          team_a: string
          team_a_id?: string | null
          team_a_players?: string[]
          team_b: string
          team_b_id?: string | null
          team_b_players?: string[]
          tie_break_toss_winner?: string | null
          toss_decision?: string | null
          toss_winner?: string | null
          tournament_id?: string | null
          updated_at?: string
          venue?: string | null
        }
        Update: {
          balls_per_over?: number
          created_at?: string
          created_by?: string
          id?: string
          live?: Json
          match_date?: string | null
          name?: string
          overs?: number
          platform_archived?: boolean
          platform_deleted_at?: string | null
          platform_disabled?: boolean
          platform_hidden?: boolean
          players_per_team?: number
          result?: string | null
          rules?: Json
          scheduled_time?: string | null
          score_revision?: number
          status?: string
          team_a?: string
          team_a_id?: string | null
          team_a_players?: string[]
          team_b?: string
          team_b_id?: string | null
          team_b_players?: string[]
          tie_break_toss_winner?: string | null
          toss_decision?: string | null
          toss_winner?: string | null
          tournament_id?: string | null
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_team_a_id_fkey"
            columns: ["team_a_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_b_id_fkey"
            columns: ["team_b_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_accounts: {
        Row: {
          changed_at: string
          changed_by: string | null
          deactivated_at: string | null
          reason: string | null
          user_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          deactivated_at?: string | null
          reason?: string | null
          user_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          deactivated_at?: string | null
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      platform_activity: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json
          created_at: string
          id: number
          match_id: string | null
          reason: string | null
          subject_id: string | null
          tournament_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: never
          match_id?: string | null
          reason?: string | null
          subject_id?: string | null
          tournament_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: never
          match_id?: string | null
          reason?: string | null
          subject_id?: string | null
          tournament_id?: string | null
        }
        Relationships: []
      }
      platform_announcements: {
        Row: {
          body: string
          category: string
          changed_at: string
          dismissible: boolean
          ends_at: string | null
          id: string
          published: boolean
          starts_at: string | null
          title: string
        }
        Insert: {
          body: string
          category: string
          changed_at?: string
          dismissible?: boolean
          ends_at?: string | null
          id?: string
          published?: boolean
          starts_at?: string | null
          title: string
        }
        Update: {
          body?: string
          category?: string
          changed_at?: string
          dismissible?: boolean
          ends_at?: string | null
          id?: string
          published?: boolean
          starts_at?: string | null
          title?: string
        }
        Relationships: []
      }
      platform_drain_transactions: {
        Row: {
          match_id: string
          transaction_id: number
        }
        Insert: {
          match_id: string
          transaction_id: number
        }
        Update: {
          match_id?: string
          transaction_id?: number
        }
        Relationships: []
      }
      platform_feature_baselines: {
        Row: {
          enabled: boolean
          feature_id: string
          user_id: string
        }
        Insert: {
          enabled: boolean
          feature_id: string
          user_id: string
        }
        Update: {
          enabled?: boolean
          feature_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_feature_baselines_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "platform_features"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_feature_overrides: {
        Row: {
          changed_at: string
          changed_by: string
          enabled: boolean
          feature_id: string
          user_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          enabled: boolean
          feature_id: string
          user_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          enabled?: boolean
          feature_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_feature_overrides_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "platform_features"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_features: {
        Row: {
          category: string
          default_enabled: boolean
          globally_enabled: boolean
          id: string
          label: string
        }
        Insert: {
          category: string
          default_enabled?: boolean
          globally_enabled?: boolean
          id: string
          label: string
        }
        Update: {
          category?: string
          default_enabled?: boolean
          globally_enabled?: boolean
          id?: string
          label?: string
        }
        Relationships: []
      }
      platform_invitations: {
        Row: {
          actor_id: string
          created_at: string
          email: string
          full_name: string
          id: string
          requested_role: string
          state: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          actor_id: string
          created_at?: string
          email: string
          full_name: string
          id: string
          requested_role: string
          state?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          actor_id?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          requested_role?: string
          state?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      platform_maintenance_matches: {
        Row: {
          match_id: string
        }
        Insert: {
          match_id: string
        }
        Update: {
          match_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_maintenance_matches_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_roles: {
        Row: {
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          category: string
          changed_at: string
          changed_by: string | null
          default_value: Json
          id: string
          value: Json
        }
        Insert: {
          category: string
          changed_at?: string
          changed_by?: string | null
          default_value: Json
          id: string
          value: Json
        }
        Update: {
          category?: string
          changed_at?: string
          changed_by?: string | null
          default_value?: Json
          id?: string
          value?: Json
        }
        Relationships: []
      }
      platform_tournament_context: {
        Row: {
          actor_id: string
          transaction_id: number
        }
        Insert: {
          actor_id: string
          transaction_id: number
        }
        Update: {
          actor_id?: string
          transaction_id?: number
        }
        Relationships: []
      }
      score_operations: {
        Row: {
          actor_id: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          id: string
          kind: string
          match_id: string
          reason: string | null
          revision: number
        }
        Insert: {
          actor_id: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id: string
          kind: string
          match_id: string
          reason?: string | null
          revision: number
        }
        Update: {
          actor_id?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          kind?: string
          match_id?: string
          reason?: string | null
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "score_operations_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_groups: {
        Row: {
          created_at: string
          id: string
          name: string
          team_ids: string[]
          tournament_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          team_ids?: string[]
          tournament_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          team_ids?: string[]
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_groups_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_playoffs: {
        Row: {
          approved: boolean
          draw: Json
          revision: number
          tournament_id: string
          updated_at: string
        }
        Insert: {
          approved?: boolean
          draw: Json
          revision?: number
          tournament_id: string
          updated_at?: string
        }
        Update: {
          approved?: boolean
          draw?: Json
          revision?: number
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_playoffs_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: true
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_presentation: {
        Row: {
          playing: boolean
          seconds: number
          tournament_id: string
          updated_at: string
        }
        Insert: {
          playing?: boolean
          seconds?: number
          tournament_id: string
          updated_at?: string
        }
        Update: {
          playing?: boolean
          seconds?: number
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_presentation_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: true
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_teams: {
        Row: {
          captain: string | null
          color: string
          created_at: string
          id: string
          logo_url: string | null
          name: string
          players: string[]
          short_name: string | null
          tournament_id: string
          vice_captain: string | null
        }
        Insert: {
          captain?: string | null
          color?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          players?: string[]
          short_name?: string | null
          tournament_id: string
          vice_captain?: string | null
        }
        Update: {
          captain?: string | null
          color?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          players?: string[]
          short_name?: string | null
          tournament_id?: string
          vice_captain?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_teams_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          accent_color: string
          balls_per_over: number
          competition_format: string
          created_at: string
          created_by: string
          description: string | null
          end_date: string | null
          id: string
          location: string | null
          logo_url: string | null
          name: string
          overs: number
          platform_archived: boolean
          platform_deleted_at: string | null
          platform_disabled: boolean
          platform_hidden: boolean
          players_per_team: number
          points_loss: number
          points_no_result: number
          points_tie: number
          points_win: number
          primary_color: string
          ranking_rule: string
          rules: Json
          short_name: string | null
          start_date: string | null
        }
        Insert: {
          accent_color?: string
          balls_per_over?: number
          competition_format?: string
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          logo_url?: string | null
          name: string
          overs?: number
          platform_archived?: boolean
          platform_deleted_at?: string | null
          platform_disabled?: boolean
          platform_hidden?: boolean
          players_per_team?: number
          points_loss?: number
          points_no_result?: number
          points_tie?: number
          points_win?: number
          primary_color?: string
          ranking_rule?: string
          rules?: Json
          short_name?: string | null
          start_date?: string | null
        }
        Update: {
          accent_color?: string
          balls_per_over?: number
          competition_format?: string
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          logo_url?: string | null
          name?: string
          overs?: number
          platform_archived?: boolean
          platform_deleted_at?: string | null
          platform_disabled?: boolean
          platform_hidden?: boolean
          players_per_team?: number
          points_loss?: number
          points_no_result?: number
          points_tie?: number
          points_win?: number
          primary_color?: string
          ranking_rule?: string
          rules?: Json
          short_name?: string | null
          start_date?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_access: { Args: never; Returns: boolean }
      apply_score_operation: {
        Args: {
          _delivery: Json
          _expected: number
          _id: string
          _kind: string
          _match: string
          _patch: Json
          _reason: string
        }
        Returns: Json
      }
      assign_scorer: {
        Args: { _email: string; _match: string }
        Returns: undefined
      }
      can_score: { Args: { _match: string }; Returns: boolean }
      create_generated_fixtures: {
        Args: {
          _group: string
          _mode: string
          _pairs: Json
          _request: string
          _t: string
          _target: number
          _token: string
        }
        Returns: string[]
      }
      decide_playoff_tie: {
        Args: {
          _node: string
          _reason: string
          _t: string
          _team: string
          _token: string
        }
        Returns: undefined
      }
      decider_innings_tied: {
        Args: { _first: number; _match: string }
        Returns: boolean
      }
      delete_scheduled_match: { Args: { _match: string }; Returns: undefined }
      feature_enabled: {
        Args: { _feature: string; _user: string }
        Returns: boolean
      }
      feature_owner: { Args: { _match?: string; _t?: string }; Returns: string }
      fixture_generator_context: {
        Args: { _group: string; _t: string }
        Returns: Json
      }
      fixture_generator_context_unrestricted: {
        Args: { _group: string; _t: string }
        Returns: Json
      }
      global_value: { Args: { _id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      independent_match_writable: { Args: { _m: string }; Returns: boolean }
      is_match_owner: { Args: { _match: string }; Returns: boolean }
      is_playoff_decider: { Args: { _rules: Json }; Returns: boolean }
      is_tournament_owner: { Args: { _t: string }; Returns: boolean }
      match_award_access: { Args: { _match: string }; Returns: boolean }
      match_format_supported: { Args: never; Returns: boolean }
      match_read_access: { Args: { _m: string }; Returns: boolean }
      match_row_read_access: {
        Args: {
          _created_by: string
          _deleted_at: string
          _hidden: boolean
          _match_id: string
          _tournament_id: string
        }
        Returns: boolean
      }
      platform_account_active: { Args: { _id: string }; Returns: boolean }
      platform_announcement_save: {
        Args: { _delete?: boolean; _id: string; _value: Json }
        Returns: undefined
      }
      platform_announcements_read: {
        Args: { _public?: boolean }
        Returns: Json
      }
      platform_bulk_defaults: {
        Args: { _confirm: string; _revision: string }
        Returns: undefined
      }
      platform_feature_details: { Args: { _target: string }; Returns: Json }
      platform_finish_invitation: {
        Args: { _id: string; _sent: boolean }
        Returns: undefined
      }
      platform_manage_other_match: {
        Args: {
          _action: string
          _confirmation?: string
          _match: string
          _owner?: string
          _reason?: string
        }
        Returns: undefined
      }
      platform_manage_tournament: {
        Args: {
          _action: string
          _confirmation?: string
          _reason?: string
          _t: string
          _values?: Json
        }
        Returns: undefined
      }
      platform_manage_user: {
        Args: {
          _action: string
          _avatar?: string
          _name?: string
          _reason?: string
          _target: string
        }
        Returns: undefined
      }
      platform_other_match_details: { Args: { _match: string }; Returns: Json }
      platform_other_matches: {
        Args: { _page?: number; _search?: string; _state?: string }
        Returns: Json
      }
      platform_overview: { Args: never; Returns: Json }
      platform_overview_before_tournament_controls: {
        Args: never
        Returns: Json
      }
      platform_reserve_invitation: {
        Args: { _email: string; _id: string; _name: string; _role: string }
        Returns: Json
      }
      platform_role: { Args: never; Returns: string }
      platform_save_features: {
        Args: { _reset?: boolean; _target: string; _values: Json }
        Returns: undefined
      }
      platform_settings_read: { Args: never; Returns: Json }
      platform_settings_save: {
        Args: {
          _features: Json
          _reason?: string
          _revision: string
          _values: Json
        }
        Returns: undefined
      }
      platform_tournament_details: { Args: { _t: string }; Returns: Json }
      platform_tournament_directory: {
        Args: {
          _organizer?: string
          _page?: number
          _search?: string
          _sort?: string
          _status?: string
          _visibility?: string
        }
        Returns: Json
      }
      platform_tournament_rows: { Args: never; Returns: Json[] }
      platform_transfer_candidates: {
        Args: { _search?: string }
        Returns: Json
      }
      platform_user_details: { Args: { _target: string }; Returns: Json }
      platform_user_directory: {
        Args: {
          _page?: number
          _role?: string
          _search?: string
          _sort?: string
          _status?: string
        }
        Returns: Json
      }
      playoff_context: { Args: { _t: string }; Returns: Json }
      playoff_context_internal: { Args: { _t: string }; Returns: Json }
      public_platform_configuration: { Args: never; Returns: Json }
      publish_match_award: {
        Args: { _expected: number; _match: string }
        Returns: Json
      }
      read_feature_access: {
        Args: { _match?: string; _t?: string }
        Returns: Json
      }
      read_live_match: { Args: { _match: string }; Returns: Json }
      read_live_tournament_matches: {
        Args: { _tournament: string }
        Returns: Json
      }
      read_match_award: { Args: { _match: string }; Returns: Json }
      read_tournament_presentation: { Args: { _t: string }; Returns: Json }
      save_playoff_draw: {
        Args: { _approve: boolean; _draw: Json; _t: string; _token: string }
        Returns: undefined
      }
      save_tournament_group: {
        Args: { _id: string; _name: string; _t: string; _teams: string[] }
        Returns: string
      }
      scoring_snapshot: { Args: { _match: string }; Returns: Json }
      set_tournament_presentation: {
        Args: { _playing: boolean; _seconds: number; _t: string }
        Returns: undefined
      }
      super_innings_complete: {
        Args: { _innings: number; _match: string }
        Returns: boolean
      }
      super_over_supported: { Args: never; Returns: boolean }
      sync_playoff_fixtures: {
        Args: { _t: string; _token: string; _winners: Json }
        Returns: number
      }
      tournament_admin_mutation: { Args: never; Returns: boolean }
      tournament_read_access: { Args: { _t: string }; Returns: boolean }
      tournament_row_read_access: {
        Args: {
          _created_by: string
          _deleted_at: string
          _hidden: boolean
          _id: string
        }
        Returns: boolean
      }
      tournament_write_access: { Args: { _t: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
