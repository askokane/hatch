// Shared enums-as-labels and tunable constants used across the app.

export const INTENT_LABELS: Record<string, string> = {
  COFOUNDER: "Co-founder",
  TEAMMATE: "Teammate",
  MENTOR: "Mentor",
  FEEDBACK: "Feedback",
  INTERNSHIP: "Internship",
};

export const INTENT_KINDS = ["COFOUNDER", "TEAMMATE", "MENTOR", "FEEDBACK", "INTERNSHIP"] as const;
export type IntentKindT = (typeof INTENT_KINDS)[number];

export const COMMITMENT_LABELS: Record<string, string> = {
  LIGHT: "Light · 1–3 hrs/wk",
  STEADY: "Steady · 4–8 hrs/wk",
  HEAVY: "Heavy · 8+ hrs/wk",
};

export const STAGE_LABELS: Record<string, string> = {
  IDEA: "Idea",
  BUILDING: "Building",
  LAUNCHED: "Launched",
};

export const ROLE_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  FILLED: "Filled",
  CLOSED: "Closed",
};

export const TAG_KINDS = ["SKILL", "INTEREST", "DOMAIN"] as const;

// Polling / messaging
export const POLL_INTERVAL_MS = 3000;

// Intro request constraints (enforced server-side)
export const NOTE_MIN = 40;
export const NOTE_MAX = 500;
export const MESSAGE_MIN = 1;
export const MESSAGE_MAX = 2000;
export const MAX_PENDING_OUTBOUND = 5;

// Profile constraints
export const HANDLE_IMMUTABLE_DAYS = 7;
export const BIO_MAX = 600;
export const MIN_SKILL_TAGS = 3;
export const MIN_LEARNING_TAGS = 1;
export const MIN_INTENTS = 1;

// Pagination
export const PAGE_SIZE = 20;
