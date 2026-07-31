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
      articles: {
        Row: {
          body: string
          business_id: string | null
          canonical_url: string | null
          categories: string[]
          cover_image_url: string | null
          created_at: string
          excerpt: string | null
          id: string
          organizer_id: string | null
          owner_id: string
          published_at: string | null
          reading_time: number | null
          scheduled_for: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: string
          tags: string[]
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          body: string
          business_id?: string | null
          canonical_url?: string | null
          categories?: string[]
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          organizer_id?: string | null
          owner_id: string
          published_at?: string | null
          reading_time?: number | null
          scheduled_for?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          body?: string
          business_id?: string | null
          canonical_url?: string | null
          categories?: string[]
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          organizer_id?: string | null
          owner_id?: string
          published_at?: string | null
          reading_time?: number | null
          scheduled_for?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "articles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          address: string | null
          category: string
          city: string | null
          country: string | null
          created_at: string
          current_period_end: string | null
          description: string
          email: string | null
          id: string
          industry: string
          is_flagged: boolean
          listing_tier: string
          logo: string | null
          name: string
          owner_id: string
          phone: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          state: string | null
          status: string
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          category: string
          city?: string | null
          country?: string | null
          created_at?: string
          current_period_end?: string | null
          description: string
          email?: string | null
          id?: string
          industry: string
          is_flagged?: boolean
          listing_tier?: string
          logo?: string | null
          name: string
          owner_id: string
          phone?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          state?: string | null
          status?: string
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          category?: string
          city?: string | null
          country?: string | null
          created_at?: string
          current_period_end?: string | null
          description?: string
          email?: string | null
          id?: string
          industry?: string
          is_flagged?: boolean
          listing_tier?: string
          logo?: string | null
          name?: string
          owner_id?: string
          phone?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          state?: string | null
          status?: string
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      comments: {
        Row: {
          author_email: string | null
          author_name: string | null
          body: string
          created_at: string | null
          id: string
          payment_intent_id: string | null
          status: string | null
          target_id: string
          target_type: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          author_email?: string | null
          author_name?: string | null
          body: string
          created_at?: string | null
          id?: string
          payment_intent_id?: string | null
          status?: string | null
          target_id: string
          target_type: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          author_email?: string | null
          author_name?: string | null
          body?: string
          created_at?: string | null
          id?: string
          payment_intent_id?: string | null
          status?: string | null
          target_id?: string
          target_type?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      donations: {
        Row: {
          amount: number | null
          certificate_path: string | null
          created_at: string | null
          currency: string | null
          donor_email: string | null
          donor_name: string | null
          fundraiser_id: string | null
          id: string
          message: string | null
          payment_intent_id: string | null
          payment_method: string | null
          receipt_path: string | null
          status: string | null
          stripe_session_id: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          certificate_path?: string | null
          created_at?: string | null
          currency?: string | null
          donor_email?: string | null
          donor_name?: string | null
          fundraiser_id?: string | null
          id?: string
          message?: string | null
          payment_intent_id?: string | null
          payment_method?: string | null
          receipt_path?: string | null
          status?: string | null
          stripe_session_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          certificate_path?: string | null
          created_at?: string | null
          currency?: string | null
          donor_email?: string | null
          donor_name?: string | null
          fundraiser_id?: string | null
          id?: string
          message?: string | null
          payment_intent_id?: string | null
          payment_method?: string | null
          receipt_path?: string | null
          status?: string | null
          stripe_session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "donations_fundraiser_id_fkey"
            columns: ["fundraiser_id"]
            isOneToOne: false
            referencedRelation: "fundraisers"
            referencedColumns: ["id"]
          },
        ]
      }
      eventbrite_sources: {
        Row: {
          created_at: string | null
          enabled: boolean
          id: string
          last_sync_message: string | null
          last_synced_at: string | null
          organizer_eventbrite_id: string
          organizer_id: string | null
          organizer_name: string
          organizer_url: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean
          id?: string
          last_sync_message?: string | null
          last_synced_at?: string | null
          organizer_eventbrite_id: string
          organizer_id?: string | null
          organizer_name: string
          organizer_url: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          enabled?: boolean
          id?: string
          last_sync_message?: string | null
          last_synced_at?: string | null
          organizer_eventbrite_id?: string
          organizer_id?: string | null
          organizer_name?: string
          organizer_url?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventbrite_sources_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          address_country: string | null
          address_locality: string | null
          address_region: string | null
          average_rating: number | null
          banner: string | null
          category: string | null
          city: string | null
          created_at: string | null
          description: string | null
          end_date: string | null
          event_date: string | null
          event_type: string | null
          featured_until: string | null
          homepage_position: number | null
          id: string
          is_featured: boolean | null
          is_homepage_featured: boolean | null
          latitude: number | null
          longitude: number | null
          online_url: string | null
          organizer_id: string | null
          performer_name: string | null
          postal_code: string | null
          review_count: number | null
          slug: string
          source_organizer_description: string | null
          source_organizer_name: string | null
          source_organizer_url: string | null
          status: string | null
          street_address: string | null
          title: string
          user_id: string | null
          venue: string | null
          video_url: string | null
          visibility: string | null
        }
        Insert: {
          address_country?: string | null
          address_locality?: string | null
          address_region?: string | null
          average_rating?: number | null
          banner?: string | null
          category?: string | null
          city?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          event_date?: string | null
          event_type?: string | null
          featured_until?: string | null
          homepage_position?: number | null
          id?: string
          is_featured?: boolean | null
          is_homepage_featured?: boolean | null
          latitude?: number | null
          longitude?: number | null
          online_url?: string | null
          organizer_id?: string | null
          performer_name?: string | null
          postal_code?: string | null
          review_count?: number | null
          slug: string
          source_organizer_description?: string | null
          source_organizer_name?: string | null
          source_organizer_url?: string | null
          status?: string | null
          street_address?: string | null
          title: string
          user_id?: string | null
          venue?: string | null
          video_url?: string | null
          visibility?: string | null
        }
        Update: {
          address_country?: string | null
          address_locality?: string | null
          address_region?: string | null
          average_rating?: number | null
          banner?: string | null
          category?: string | null
          city?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          event_date?: string | null
          event_type?: string | null
          featured_until?: string | null
          homepage_position?: number | null
          id?: string
          is_featured?: boolean | null
          is_homepage_featured?: boolean | null
          latitude?: number | null
          longitude?: number | null
          online_url?: string | null
          organizer_id?: string | null
          performer_name?: string | null
          postal_code?: string | null
          review_count?: number | null
          slug?: string
          source_organizer_description?: string | null
          source_organizer_name?: string | null
          source_organizer_url?: string | null
          status?: string | null
          street_address?: string | null
          title?: string
          user_id?: string | null
          venue?: string | null
          video_url?: string | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      fundraiser_media: {
        Row: {
          caption: string | null
          created_at: string | null
          fundraiser_id: string
          id: string
          position: number | null
          type: string | null
          updated_at: string | null
          url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          fundraiser_id: string
          id?: string
          position?: number | null
          type?: string | null
          updated_at?: string | null
          url: string
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          fundraiser_id?: string
          id?: string
          position?: number | null
          type?: string | null
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "fundraiser_media_fundraiser_id_fkey"
            columns: ["fundraiser_id"]
            isOneToOne: false
            referencedRelation: "fundraisers"
            referencedColumns: ["id"]
          },
        ]
      }
      fundraiser_updates: {
        Row: {
          content: string
          created_at: string | null
          fundraiser_id: string | null
          id: string
          organizer_id: string | null
          title: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          fundraiser_id?: string | null
          id?: string
          organizer_id?: string | null
          title?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          fundraiser_id?: string | null
          id?: string
          organizer_id?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fundraiser_updates_fundraiser_id_fkey"
            columns: ["fundraiser_id"]
            isOneToOne: false
            referencedRelation: "fundraisers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundraiser_updates_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      fundraisers: {
        Row: {
          average_rating: number | null
          banner: string | null
          category: string
          created_at: string | null
          featured_until: string | null
          goal: number | null
          homepage_position: number | null
          id: string
          image_url: string | null
          is_featured: boolean | null
          is_homepage_featured: boolean | null
          organizer: string | null
          organizer_id: string | null
          raised: number | null
          raised_amount: number | null
          review_count: number | null
          slug: string
          story: string | null
          title: string
          user_id: string | null
          video_url: string | null
        }
        Insert: {
          average_rating?: number | null
          banner?: string | null
          category?: string
          created_at?: string | null
          featured_until?: string | null
          goal?: number | null
          homepage_position?: number | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          is_homepage_featured?: boolean | null
          organizer?: string | null
          organizer_id?: string | null
          raised?: number | null
          raised_amount?: number | null
          review_count?: number | null
          slug: string
          story?: string | null
          title: string
          user_id?: string | null
          video_url?: string | null
        }
        Update: {
          average_rating?: number | null
          banner?: string | null
          category?: string
          created_at?: string | null
          featured_until?: string | null
          goal?: number | null
          homepage_position?: number | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          is_homepage_featured?: boolean | null
          organizer?: string | null
          organizer_id?: string | null
          raised?: number | null
          raised_amount?: number | null
          review_count?: number | null
          slug?: string
          story?: string | null
          title?: string
          user_id?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fundraisers_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      gofundme_sources: {
        Row: {
          created_at: string | null
          enabled: boolean
          fundraiser_id: string | null
          id: string
          last_sync_message: string | null
          last_synced_at: string | null
          organizer: string | null
          source_url: string
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean
          fundraiser_id?: string | null
          id?: string
          last_sync_message?: string | null
          last_synced_at?: string | null
          organizer?: string | null
          source_url: string
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          enabled?: boolean
          fundraiser_id?: string | null
          id?: string
          last_sync_message?: string | null
          last_synced_at?: string | null
          organizer?: string | null
          source_url?: string
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gofundme_sources_fundraiser_id_fkey"
            columns: ["fundraiser_id"]
            isOneToOne: false
            referencedRelation: "fundraisers"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_categories: {
        Row: {
          created_at: string | null
          icon: string
          id: string
          is_visible: boolean | null
          name: string
          position: number | null
        }
        Insert: {
          created_at?: string | null
          icon: string
          id?: string
          is_visible?: boolean | null
          name: string
          position?: number | null
        }
        Update: {
          created_at?: string | null
          icon?: string
          id?: string
          is_visible?: boolean | null
          name?: string
          position?: number | null
        }
        Relationships: []
      }
      homepage_sponsors: {
        Row: {
          created_at: string
          id: string
          is_visible: boolean
          logo_url: string
          name: string
          position: number
          website_url: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_visible?: boolean
          logo_url?: string
          name: string
          position?: number
          website_url?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_visible?: boolean
          logo_url?: string
          name?: string
          position?: number
          website_url?: string
        }
        Relationships: []
      }
      homepage_testimonials: {
        Row: {
          created_at: string
          id: string
          is_visible: boolean
          name: string
          photo_url: string
          position: number
          quote: string
          role: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_visible?: boolean
          name: string
          photo_url?: string
          position?: number
          quote: string
          role?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_visible?: boolean
          name?: string
          photo_url?: string
          position?: number
          quote?: string
          role?: string
        }
        Relationships: []
      }
      organizer_follows: {
        Row: {
          created_at: string | null
          id: string
          organizer_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          organizer_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          organizer_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizer_follows_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_visibility_audit: {
        Row: {
          admin_user_id: string
          created_at: string | null
          field_name: string
          id: string
          new_value: number
          old_value: number
          organizer_id: string
        }
        Insert: {
          admin_user_id: string
          created_at?: string | null
          field_name: string
          id?: string
          new_value: number
          old_value: number
          organizer_id: string
        }
        Update: {
          admin_user_id?: string
          created_at?: string | null
          field_name?: string
          id?: string
          new_value?: number
          old_value?: number
          organizer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizer_visibility_audit_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      organizers: {
        Row: {
          average_rating: number | null
          banner: string | null
          bio: string | null
          created_at: string | null
          events_offset: number
          facebook: string | null
          follower_offset: number
          id: string
          name: string
          nonprofit_registration_number: string | null
          organization_name: string | null
          photo: string | null
          review_count: number | null
          status: string | null
          tax_id: string | null
          twitter: string | null
          user_id: string | null
          verified_at: string | null
          visibility: string | null
          website: string | null
        }
        Insert: {
          average_rating?: number | null
          banner?: string | null
          bio?: string | null
          created_at?: string | null
          events_offset?: number
          facebook?: string | null
          follower_offset?: number
          id?: string
          name: string
          nonprofit_registration_number?: string | null
          organization_name?: string | null
          photo?: string | null
          review_count?: number | null
          status?: string | null
          tax_id?: string | null
          twitter?: string | null
          user_id?: string | null
          verified_at?: string | null
          visibility?: string | null
          website?: string | null
        }
        Update: {
          average_rating?: number | null
          banner?: string | null
          bio?: string | null
          created_at?: string | null
          events_offset?: number
          facebook?: string | null
          follower_offset?: number
          id?: string
          name?: string
          nonprofit_registration_number?: string | null
          organization_name?: string | null
          photo?: string | null
          review_count?: number | null
          status?: string | null
          tax_id?: string | null
          twitter?: string | null
          user_id?: string | null
          verified_at?: string | null
          visibility?: string | null
          website?: string | null
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string | null
          updated_by: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_info: Json
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          id: string
          preferences: Json
          privacy_settings: Json
          profile_photo: string | null
          role: string
          status: string
          updated_at: string | null
        }
        Insert: {
          account_info?: Json
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id: string
          preferences?: Json
          privacy_settings?: Json
          profile_photo?: string | null
          role?: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          account_info?: Json
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          preferences?: Json
          privacy_settings?: Json
          profile_photo?: string | null
          role?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      reviews: {
        Row: {
          created_at: string | null
          event_id: string | null
          fundraiser_id: string | null
          id: string
          is_approved: boolean | null
          is_verified: boolean | null
          organizer_id: string | null
          rating: number
          review: string | null
          review_type: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_id?: string | null
          fundraiser_id?: string | null
          id?: string
          is_approved?: boolean | null
          is_verified?: boolean | null
          organizer_id?: string | null
          rating: number
          review?: string | null
          review_type?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_id?: string | null
          fundraiser_id?: string | null
          id?: string
          is_approved?: boolean | null
          is_verified?: boolean | null
          organizer_id?: string | null
          rating?: number
          review?: string | null
          review_type?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_fundraiser_id_fkey"
            columns: ["fundraiser_id"]
            isOneToOne: false
            referencedRelation: "fundraisers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "organizers"
            referencedColumns: ["id"]
          },
        ]
      }
      seats: {
        Row: {
          event_id: string
          id: string
          layout_id: string
          price_override: number | null
          reserved_until: string | null
          row_label: string
          seat_number: number
          section: string
          status: string
          ticket_id: string | null
        }
        Insert: {
          event_id: string
          id?: string
          layout_id: string
          price_override?: number | null
          reserved_until?: string | null
          row_label: string
          seat_number: number
          section: string
          status?: string
          ticket_id?: string | null
        }
        Update: {
          event_id?: string
          id?: string
          layout_id?: string
          price_override?: number | null
          reserved_until?: string | null
          row_label?: string
          seat_number?: number
          section?: string
          status?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seats_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seats_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "venue_layouts"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_orders: {
        Row: {
          buyer_email: string | null
          buyer_name: string | null
          checked_in_at: string | null
          created_at: string | null
          currency: string | null
          event_id: string
          id: string
          payment_method: string | null
          qr_code: string
          quantity: number
          seat_id: string | null
          seat_label: string | null
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          ticket_id: string | null
          total_amount: number
        }
        Insert: {
          buyer_email?: string | null
          buyer_name?: string | null
          checked_in_at?: string | null
          created_at?: string | null
          currency?: string | null
          event_id: string
          id?: string
          payment_method?: string | null
          qr_code: string
          quantity?: number
          seat_id?: string | null
          seat_label?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          ticket_id?: string | null
          total_amount: number
        }
        Update: {
          buyer_email?: string | null
          buyer_name?: string | null
          checked_in_at?: string | null
          created_at?: string | null
          currency?: string | null
          event_id?: string
          id?: string
          payment_method?: string | null
          qr_code?: string
          quantity?: number
          seat_id?: string | null
          seat_label?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          ticket_id?: string | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "ticket_orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_orders_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          event_id: string | null
          id: string
          name: string | null
          price: number | null
          quantity: number | null
        }
        Insert: {
          event_id?: string | null
          id?: string
          name?: string | null
          price?: number | null
          quantity?: number | null
        }
        Update: {
          event_id?: string | null
          id?: string
          name?: string | null
          price?: number | null
          quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_layouts: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          name: string
          sections: Json
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          name?: string
          sections?: Json
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          name?: string
          sections?: Json
        }
        Relationships: [
          {
            foreignKeyName: "venue_layouts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_donation_activity: {
        Row: {
          amount: number | null
          created_at: string | null
          fundraiser_banner: string | null
          fundraiser_id: string | null
          fundraiser_slug: string | null
          fundraiser_title: string | null
          id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "donations_fundraiser_id_fkey"
            columns: ["fundraiser_id"]
            isOneToOne: false
            referencedRelation: "fundraisers"
            referencedColumns: ["id"]
          },
        ]
      }
      public_profiles: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          id: string | null
        }
        Insert: {
          avatar_url?: never
          display_name?: string | null
          id?: string | null
        }
        Update: {
          avatar_url?: never
          display_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      recalculate_event_rating: {
        Args: { target_id: string }
        Returns: undefined
      }
      recalculate_fundraiser_rating: {
        Args: { target_id: string }
        Returns: undefined
      }
      recalculate_organizer_rating: {
        Args: { target_id: string }
        Returns: undefined
      }
      release_expired_seat_reservations: { Args: never; Returns: undefined }
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

