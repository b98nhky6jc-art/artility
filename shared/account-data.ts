export const ACCOUNT_DELETION_CONFIRMATION = "DELETE";

export const ACCOUNT_DELETION_POLICY = {
  removed: [
    "account and authentication records",
    "sessions",
    "check-ins",
    "saved home area",
    "upload-security events",
  ],
  retainedAnonymously: [
    "published artwork contributions",
    "published photographs",
    "artwork revision history",
    "status reports and moderation history",
  ],
} as const;

export function confirmsAccountDeletion(value: unknown) {
  return value === ACCOUNT_DELETION_CONFIRMATION;
}
