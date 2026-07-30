import type { DesignConfig } from "./design-types";

export type EventKind = "external_link" | "custom_card" | "designed_template";

export interface RsvpQuestion {
  id: string;
  label: string;
  type: "text" | "boolean";
  required: boolean;
}

export interface EventRecord {
  id: string;
  slug: string;
  kind: EventKind;
  title: string;
  host_name: string | null;
  description: string | null;
  event_date: string | null;
  location: string | null;
  external_url: string | null;
  questions: RsvpQuestion[];
  card_image_url: string | null;
  design_config: DesignConfig | null;
  created_by: string | null;
  guest_categories: string[];
  published: boolean;
  created_at: string;
}

export type SenderEventSummary = Pick<
  EventRecord,
  "id" | "slug" | "kind" | "title" | "guest_categories" | "published"
> & { card_image_version: string | null };

export type AdminEventSummary = Pick<EventRecord, "id" | "slug" | "kind" | "title" | "created_at">;

export interface RsvpRecord {
  id: string;
  event_id: string;
  guest_name: string;
  attending: boolean;
  guest_count: number;
  category_counts: Record<string, number>;
  answers: Record<string, string>;
  created_at: string;
}

export interface UserRecord {
  id: string;
  name: string;
  username: string;
  password: string;
  raw_password: string | null;
  created_at: string;
}
