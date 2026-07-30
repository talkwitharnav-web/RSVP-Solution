import type { EventRecord } from "./types";

export type PublicEventRecord = Pick<
  EventRecord,
  | "slug"
  | "kind"
  | "title"
  | "host_name"
  | "description"
  | "event_date"
  | "location"
  | "external_url"
  | "questions"
  | "card_image_url"
  | "design_config"
  | "guest_categories"
  | "published"
>;

export function toPublicEventRecord(event: EventRecord): PublicEventRecord {
  return {
    slug: event.slug,
    kind: event.kind,
    title: event.title,
    host_name: event.host_name,
    description: event.description,
    event_date: event.event_date,
    location: event.location,
    external_url: event.external_url,
    questions: event.questions,
    card_image_url: event.card_image_url,
    design_config: event.design_config,
    guest_categories: event.guest_categories,
    published: event.published,
  };
}