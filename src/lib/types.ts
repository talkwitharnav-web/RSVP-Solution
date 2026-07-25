export type EventKind = "external_link" | "hosted_template";

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
  created_at: string;
}

export interface RsvpRecord {
  id: string;
  event_id: string;
  guest_name: string;
  attending: boolean;
  guest_count: number;
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
