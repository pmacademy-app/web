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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      email_broadcasts: {
        Row: {
          batch_size: number
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          failed_count: number
          id: string
          last_batch_index: number
          name: string
          recipient_filters: Json
          scheduled_at: string | null
          sent_count: number
          skipped_count: number
          started_at: string | null
          status: string
          subject_override: string | null
          template_key: string
          total_recipients: number | null
          updated_at: string
        }
        Insert: {
          batch_size?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          failed_count?: number
          id?: string
          last_batch_index?: number
          name: string
          recipient_filters?: Json
          scheduled_at?: string | null
          sent_count?: number
          skipped_count?: number
          started_at?: string | null
          status?: string
          subject_override?: string | null
          template_key: string
          total_recipients?: number | null
          updated_at?: string
        }
        Update: {
          batch_size?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          failed_count?: number
          id?: string
          last_batch_index?: number
          name?: string
          recipient_filters?: Json
          scheduled_at?: string | null
          sent_count?: number
          skipped_count?: number
          started_at?: string | null
          status?: string
          subject_override?: string | null
          template_key?: string
          total_recipients?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      admin_audit_logs: {
        Row: {
          action: string
          admin_email: string
          admin_user_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_resource: string
        }
        Insert: {
          action: string
          admin_email: string
          admin_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_resource: string
        }
        Update: {
          action?: string
          admin_email?: string
          admin_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_resource?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      badges: {
        Row: {
          description: string
          icon: string
          id: string
          key: string
          name: string
        }
        Insert: {
          description: string
          icon: string
          id?: string
          key: string
          name: string
        }
        Update: {
          description?: string
          icon?: string
          id?: string
          key?: string
          name?: string
        }
        Relationships: []
      }
      bookmarks: {
        Row: {
          created_at: string
          id: string
          lesson_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lesson_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      capstone_submissions: {
        Row: {
          content: string
          id: string
          is_public: boolean
          module_slug: string
          status: string
          submitted_at: string
          user_id: string | null
        }
        Insert: {
          content: string
          id?: string
          is_public?: boolean
          module_slug: string
          status?: string
          submitted_at?: string
          user_id?: string | null
        }
        Update: {
          content?: string
          id?: string
          is_public?: boolean
          module_slug?: string
          status?: string
          submitted_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "capstone_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          career_title: string
          certificate_code: string
          id: string
          issued_at: string
          learner_name: string
          lessons_completed: number
          level: number
          module_slug: string | null
          modules_completed: number
          total_xp: number
          type: string
          user_id: string
        }
        Insert: {
          career_title: string
          certificate_code: string
          id?: string
          issued_at?: string
          learner_name: string
          lessons_completed?: number
          level?: number
          module_slug?: string | null
          modules_completed?: number
          total_xp?: number
          type?: string
          user_id: string
        }
        Update: {
          career_title?: string
          certificate_code?: string
          id?: string
          issued_at?: string
          learner_name?: string
          lessons_completed?: number
          level?: number
          module_slug?: string | null
          modules_completed?: number
          total_xp?: number
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_members: {
        Row: {
          cohort_id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          cohort_id: string
          joined_at?: string
          user_id: string
        }
        Update: {
          cohort_id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_members_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cohorts: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_private: boolean
          name: string
          slug: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_private?: boolean
          name: string
          slug?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_private?: boolean
          name?: string
          slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cohorts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          admin_notes: string | null
          category: string
          created_at: string
          email: string
          id: string
          message: string
          name: string
          source: string
          status: string
          subject: string
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          category?: string
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          source?: string
          status?: string
          subject: string
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          category?: string
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          source?: string
          status?: string
          subject?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_dead_letter: {
        Row: {
          all_errors: Json
          created_at: string
          failure_reason: string | null
          id: string
          original_queue_id: string | null
          template_key: string
          template_variables: Json
          user_id: string | null
        }
        Insert: {
          all_errors?: Json
          created_at?: string
          failure_reason?: string | null
          id?: string
          original_queue_id?: string | null
          template_key: string
          template_variables?: Json
          user_id?: string | null
        }
        Update: {
          all_errors?: Json
          created_at?: string
          failure_reason?: string | null
          id?: string
          original_queue_id?: string | null
          template_key?: string
          template_variables?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_dead_letter_original_queue_id_fkey"
            columns: ["original_queue_id"]
            isOneToOne: false
            referencedRelation: "email_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_dead_letter_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_delivery_events: {
        Row: {
          email_queue_id: string | null
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          resend_id: string | null
        }
        Insert: {
          email_queue_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          resend_id?: string | null
        }
        Update: {
          email_queue_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          resend_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_delivery_events_email_queue_id_fkey"
            columns: ["email_queue_id"]
            isOneToOne: false
            referencedRelation: "email_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      email_queue: {
        Row: {
          attempt_count: number
          broadcast_id: string | null
          created_at: string
          delivered_at: string | null
          error_message: string | null
          event_id: string | null
          event_type: string
          failed_at: string | null
          id: string
          max_attempts: number
          next_retry_at: string | null
          priority: number
          processing_at: string | null
          resend_id: string | null
          scheduled_at: string
          skipped_reason: string | null
          status: string
          template_key: string
          template_variables: Json
          to_email: string
          to_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          broadcast_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          event_id?: string | null
          event_type: string
          failed_at?: string | null
          id?: string
          max_attempts?: number
          next_retry_at?: string | null
          priority?: number
          processing_at?: string | null
          resend_id?: string | null
          scheduled_at?: string
          skipped_reason?: string | null
          status?: string
          template_key: string
          template_variables?: Json
          to_email: string
          to_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          broadcast_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          event_id?: string | null
          event_type?: string
          failed_at?: string | null
          id?: string
          max_attempts?: number
          next_retry_at?: string | null
          priority?: number
          processing_at?: string | null
          resend_id?: string | null
          scheduled_at?: string
          skipped_reason?: string | null
          status?: string
          template_key?: string
          template_variables?: Json
          to_email?: string
          to_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_queue_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "notification_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_suppressions: {
        Row: {
          email: string
          expires_at: string | null
          id: string
          reason: string
          suppressed_at: string
        }
        Insert: {
          email: string
          expires_at?: string | null
          id?: string
          reason: string
          suppressed_at?: string
        }
        Update: {
          email?: string
          expires_at?: string | null
          id?: string
          reason?: string
          suppressed_at?: string
        }
        Relationships: []
      }
      in_app_notifications: {
        Row: {
          action_url: string | null
          body: string
          category: string
          created_at: string
          event_id: string | null
          expires_at: string
          id: string
          idempotency_key: string | null
          is_read: boolean
          priority: number
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body: string
          category: string
          created_at?: string
          event_id?: string | null
          expires_at?: string
          id?: string
          idempotency_key?: string | null
          is_read?: boolean
          priority?: number
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string
          category?: string
          created_at?: string
          event_id?: string | null
          expires_at?: string
          id?: string
          idempotency_key?: string | null
          is_read?: boolean
          priority?: number
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "in_app_notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "notification_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "in_app_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_events: {
        Row: {
          channels_notified: string[]
          created_at: string
          event_type: string
          id: string
          payload: Json
          skipped_reason: string | null
          user_id: string
        }
        Insert: {
          channels_notified?: string[]
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          skipped_reason?: string | null
          user_id: string
        }
        Update: {
          channels_notified?: string[]
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          skipped_reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_feature_flags: {
        Row: {
          description: string | null
          enabled: boolean
          key: string
          updated_at: string
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          description?: string | null
          enabled?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_template_versions: {
        Row: {
          body_html: string
          body_text: string
          created_at: string
          id: string
          status: string
          subject_line: string
          template_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          body_html: string
          body_text: string
          created_at?: string
          id?: string
          status?: string
          subject_line: string
          template_id?: string | null
          updated_at?: string
          version: number
        }
        Update: {
          body_html?: string
          body_text?: string
          created_at?: string
          id?: string
          status?: string
          subject_line?: string
          template_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "notification_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          category: string
          created_at: string
          current_version: number
          id: string
          template_key: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          current_version?: number
          id?: string
          template_key: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          current_version?: number
          id?: string
          template_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      quiz_attempts: {
        Row: {
          attempted_at: string
          id: string
          is_correct: boolean
          lesson_id: string
          question_id: string
          selected_option: number
          user_id: string | null
        }
        Insert: {
          attempted_at?: string
          id?: string
          is_correct: boolean
          lesson_id: string
          question_id: string
          selected_option: number
          user_id?: string | null
        }
        Update: {
          attempted_at?: string
          id?: string
          is_correct?: boolean
          lesson_id?: string
          question_id?: string
          selected_option?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          last_requested_at: string
          updated_at: string
        }
        Insert: {
          count?: number
          key: string
          last_requested_at?: string
          updated_at?: string
        }
        Update: {
          count?: number
          key?: string
          last_requested_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      reflections: {
        Row: {
          content: string
          created_at: string
          id: string
          is_public: boolean
          lesson_id: string
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_public?: boolean
          lesson_id: string
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_public?: boolean
          lesson_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reflections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      system_errors: {
        Row: {
          category: string
          created_at: string
          details: Json | null
          fingerprint: string
          id: string
          message: string
          operation: string
          queue_id: string | null
          resend_id: string | null
          severity: string
          status: string
          template_key: string | null
          timestamp: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          details?: Json | null
          fingerprint: string
          id?: string
          message: string
          operation: string
          queue_id?: string | null
          resend_id?: string | null
          severity: string
          status?: string
          template_key?: string | null
          timestamp?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          details?: Json | null
          fingerprint?: string
          id?: string
          message?: string
          operation?: string
          queue_id?: string | null
          resend_id?: string | null
          severity?: string
          status?: string
          template_key?: string | null
          timestamp?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_errors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      system_announcements: {
        Row: {
          id: string
          title: string
          content: string
          type: string
          status: string
          target_audience: string
          target_cohort_id: string | null
          target_user_id: string | null
          link_url: string | null
          link_text: string | null
          scheduled_at: string | null
          published_at: string | null
          expires_at: string | null
          dismissible: boolean
          priority: number
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          content: string
          type?: string
          status?: string
          target_audience?: string
          target_cohort_id?: string | null
          target_user_id?: string | null
          link_url?: string | null
          link_text?: string | null
          scheduled_at?: string | null
          published_at?: string | null
          expires_at?: string | null
          dismissible?: boolean
          priority?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          content?: string
          type?: string
          status?: string
          target_audience?: string
          target_cohort_id?: string | null
          target_user_id?: string | null
          link_url?: string | null
          link_text?: string | null
          scheduled_at?: string | null
          published_at?: string | null
          expires_at?: string | null
          dismissible?: boolean
          priority?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_announcements_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_announcement_dismissals: {
        Row: {
          id: string
          user_id: string
          announcement_id: string
          dismissed_at: string
        }
        Insert: {
          id?: string
          user_id: string
          announcement_id: string
          dismissed_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          announcement_id?: string
          dismissed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_announcement_dismissals_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "system_announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_announcement_dismissals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          author_name: string | null
          author_role: string | null
          content: string
          created_at: string
          headline: string | null
          id: string
          is_featured: boolean
          is_published: boolean
          rating: number
          reviewed_at: string | null
          reviewed_by: string | null
          source_event: string
          status: string
          user_id: string | null
        }
        Insert: {
          author_name?: string | null
          author_role?: string | null
          content: string
          created_at?: string
          headline?: string | null
          id?: string
          is_featured?: boolean
          is_published?: boolean
          rating?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_event: string
          status?: string
          user_id?: string | null
        }
        Update: {
          author_name?: string | null
          author_role?: string | null
          content?: string
          created_at?: string
          headline?: string | null
          id?: string
          is_featured?: boolean
          is_published?: boolean
          rating?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_event?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "testimonials_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          badge_id: string
          earned_at: string
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_feedback: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          page_url: string | null
          rating: number | null
          source_event: string
          status: string
          user_id: string | null
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          id?: string
          page_url?: string | null
          rating?: number | null
          source_event: string
          status?: string
          user_id?: string | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          page_url?: string | null
          rating?: number | null
          source_event?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_feedback_prompts: {
        Row: {
          action: string
          created_at: string
          id: string
          prompt_key: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          prompt_key: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          prompt_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_feedback_prompts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_flashcard_srs: {
        Row: {
          ease_factor: number
          flashcard_id: string
          interval_days: number
          lesson_id: string
          next_review_at: string
          repetitions: number
          user_id: string
        }
        Insert: {
          ease_factor?: number
          flashcard_id: string
          interval_days?: number
          lesson_id?: string
          next_review_at?: string
          repetitions?: number
          user_id: string
        }
        Update: {
          ease_factor?: number
          flashcard_id?: string
          interval_days?: number
          lesson_id?: string
          next_review_at?: string
          repetitions?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_flashcard_srs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_friends: {
        Row: {
          created_at: string
          friend_id: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          friend_id: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          friend_id?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_friends_friend_id_fkey"
            columns: ["friend_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_friends_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_leaderboard_settings: {
        Row: {
          allow_friend_requests: boolean
          is_opted_in: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_friend_requests?: boolean
          is_opted_in?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_friend_requests?: boolean
          is_opted_in?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_leaderboard_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_lesson_progress: {
        Row: {
          completed_at: string | null
          lesson_id: string
          quiz_attempts: number
          quiz_score: number | null
          status: string
          theory_read_at: string | null
          user_id: string
          xp_earned: number
        }
        Insert: {
          completed_at?: string | null
          lesson_id: string
          quiz_attempts?: number
          quiz_score?: number | null
          status?: string
          theory_read_at?: string | null
          user_id: string
          xp_earned?: number
        }
        Update: {
          completed_at?: string | null
          lesson_id?: string
          quiz_attempts?: number
          quiz_score?: number | null
          status?: string
          theory_read_at?: string | null
          user_id?: string
          xp_earned?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_lesson_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_preferences: {
        Row: {
          achievements_email: boolean
          achievements_in_app: boolean
          all_email: boolean
          all_in_app: boolean
          all_notifications: boolean
          certificates_email: boolean
          certificates_in_app: boolean
          learning_email: boolean
          learning_in_app: boolean
          marketing_email: boolean
          marketing_in_app: boolean
          portfolio_email: boolean
          portfolio_in_app: boolean
          preferred_reminder_hour: number
          product_updates_email: boolean
          product_updates_in_app: boolean
          security_email: boolean
          security_in_app: boolean
          timezone: string
          unsubscribe_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          achievements_email?: boolean
          achievements_in_app?: boolean
          all_email?: boolean
          all_in_app?: boolean
          all_notifications?: boolean
          certificates_email?: boolean
          certificates_in_app?: boolean
          learning_email?: boolean
          learning_in_app?: boolean
          marketing_email?: boolean
          marketing_in_app?: boolean
          portfolio_email?: boolean
          portfolio_in_app?: boolean
          preferred_reminder_hour?: number
          product_updates_email?: boolean
          product_updates_in_app?: boolean
          security_email?: boolean
          security_in_app?: boolean
          timezone?: string
          unsubscribe_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          achievements_email?: boolean
          achievements_in_app?: boolean
          all_email?: boolean
          all_in_app?: boolean
          all_notifications?: boolean
          certificates_email?: boolean
          certificates_in_app?: boolean
          learning_email?: boolean
          learning_in_app?: boolean
          marketing_email?: boolean
          marketing_in_app?: boolean
          portfolio_email?: boolean
          portfolio_in_app?: boolean
          preferred_reminder_hour?: number
          product_updates_email?: boolean
          product_updates_in_app?: boolean
          security_email?: boolean
          security_in_app?: boolean
          timezone?: string
          unsubscribe_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_timeline: {
        Row: {
          channel: string
          clicked_at: string | null
          created_at: string
          delivered_at: string | null
          error_details: string | null
          event_id: string | null
          failed_at: string | null
          id: string
          metadata: Json
          opened_at: string | null
          priority: number
          queued_at: string
          resend_id: string | null
          sent_at: string | null
          status: string
          suppressed_at: string | null
          template_key: string
          template_version: number
          user_id: string
        }
        Insert: {
          channel: string
          clicked_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error_details?: string | null
          event_id?: string | null
          failed_at?: string | null
          id?: string
          metadata?: Json
          opened_at?: string | null
          priority?: number
          queued_at?: string
          resend_id?: string | null
          sent_at?: string | null
          status: string
          suppressed_at?: string | null
          template_key: string
          template_version?: number
          user_id: string
        }
        Update: {
          channel?: string
          clicked_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error_details?: string | null
          event_id?: string | null
          failed_at?: string | null
          id?: string
          metadata?: Json
          opened_at?: string | null
          priority?: number
          queued_at?: string
          resend_id?: string | null
          sent_at?: string | null
          status?: string
          suppressed_at?: string | null
          template_key?: string
          template_version?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notification_timeline_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "notification_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notification_timeline_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_provider: string
          avatar_url: string | null
          bio: string | null
          career_role: string | null
          created_at: string
          current_streak: number
          curriculum_access_override: boolean
          email: string
          github_url: string | null
          goal: string | null
          id: string
          is_admin: boolean
          is_portfolio_public: boolean
          last_streak_date: string | null
          learning_purpose: string | null
          level: number
          linkedin_url: string | null
          longest_streak: number
          name: string | null
          onboarding_completed: boolean
          streak_freezes_available: number
          timezone: string
          total_active_seconds: number
          total_xp: number
          username: string | null
          website_url: string | null
        }
        Insert: {
          auth_provider?: string
          avatar_url?: string | null
          bio?: string | null
          career_role?: string | null
          created_at?: string
          current_streak?: number
          curriculum_access_override?: boolean
          email: string
          github_url?: string | null
          goal?: string | null
          id: string
          is_admin?: boolean
          is_portfolio_public?: boolean
          last_streak_date?: string | null
          learning_purpose?: string | null
          level?: number
          linkedin_url?: string | null
          longest_streak?: number
          name?: string | null
          onboarding_completed?: boolean
          streak_freezes_available?: number
          timezone?: string
          total_active_seconds?: number
          total_xp?: number
          username?: string | null
          website_url?: string | null
        }
        Update: {
          auth_provider?: string
          avatar_url?: string | null
          bio?: string | null
          career_role?: string | null
          created_at?: string
          current_streak?: number
          curriculum_access_override?: boolean
          email?: string
          github_url?: string | null
          goal?: string | null
          id?: string
          is_admin?: boolean
          is_portfolio_public?: boolean
          last_streak_date?: string | null
          learning_purpose?: string | null
          level?: number
          linkedin_url?: string | null
          longest_streak?: number
          name?: string | null
          onboarding_completed?: boolean
          streak_freezes_available?: number
          timezone?: string
          total_active_seconds?: number
          total_xp?: number
          username?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          career_position: string
          created_at: string
          email: string
          id: string
          name: string
          referrer: string | null
          source: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          career_position: string
          created_at?: string
          email: string
          id?: string
          name: string
          referrer?: string | null
          source?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          career_position?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          referrer?: string | null
          source?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      weekly_leaderboard_snapshots: {
        Row: {
          created_at: string
          days_studied: number
          id: string
          lessons_completed: number
          rank: number
          user_id: string
          week_start: string
          xp_earned: number
        }
        Insert: {
          created_at?: string
          days_studied?: number
          id?: string
          lessons_completed?: number
          rank?: number
          user_id: string
          week_start: string
          xp_earned?: number
        }
        Update: {
          created_at?: string
          days_studied?: number
          id?: string
          lessons_completed?: number
          rank?: number
          user_id?: string
          week_start?: string
          xp_earned?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_leaderboard_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_events: {
        Row: {
          created_at: string
          id: string
          source_id: string | null
          source_type: string
          user_id: string | null
          xp_amount: number
        }
        Insert: {
          created_at?: string
          id?: string
          source_id?: string | null
          source_type: string
          user_id?: string | null
          xp_amount: number
        }
        Update: {
          created_at?: string
          id?: string
          source_id?: string | null
          source_type?: string
          user_id?: string | null
          xp_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "xp_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_user_level: { Args: { p_xp: number }; Returns: number }
      claim_email_queue_items: {
        Args: { p_batch_size: number }
        Returns: {
          attempt_count: number
          created_at: string
          delivered_at: string | null
          error_message: string | null
          event_id: string | null
          event_type: string
          failed_at: string | null
          id: string
          max_attempts: number
          next_retry_at: string | null
          priority: number
          processing_at: string | null
          resend_id: string | null
          scheduled_at: string
          skipped_reason: string | null
          status: string
          template_key: string
          template_variables: Json
          to_email: string
          to_name: string | null
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "email_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_current_daily_email_count: { Args: never; Returns: number }
      increment_daily_email_quota: {
        Args: { p_limit: number }
        Returns: boolean
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
