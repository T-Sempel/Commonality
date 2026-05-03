// =============================================================================
// SHARED CONSTANTS
// =============================================================================
// Lives in /shared so both frontend and backend agree on the same vocabulary.

export const TOS_VERSION = "1.0";

export interface ProfileFieldDef {
  key: string;
  label: string;
  options: string[];
  sensitive: boolean;
}

export const PROFILE_FIELDS: ProfileFieldDef[] = [
  { key: "ageRange", label: "Age range", options: ["18-24","25-34","35-44","45-54","55-64","65+"], sensitive: false },
  { key: "raceEthnicity", label: "Race or ethnicity", options: ["Asian","Black","Hispanic/Latino","Middle Eastern","Native American","Pacific Islander","White","Multiracial","Other"], sensitive: true },
  { key: "education", label: "Education", options: ["High school","Some college","Bachelor's","Master's","Doctorate","Trade/vocational","Self-taught"], sensitive: false },
  { key: "politics", label: "Political alignment", options: ["Very liberal","Liberal","Moderate","Conservative","Very conservative","Libertarian","Other","Apolitical"], sensitive: true },
  { key: "religion", label: "Religion", options: ["Christian","Muslim","Jewish","Hindu","Buddhist","Atheist","Agnostic","Spiritual","Other"], sensitive: true },
  { key: "socialClass", label: "Social class", options: ["Working class","Lower middle","Middle","Upper middle","Wealthy"], sensitive: true },
  { key: "pets", label: "Pets", options: ["Dog person","Cat person","Both","Other pets","No pets"], sensitive: false },
  { key: "phone", label: "Phone preference", options: ["iPhone","Android","Other"], sensitive: false },
  { key: "region", label: "Region type", options: ["Urban","Suburban","Rural","Small town"], sensitive: false },
  { key: "hobby", label: "Top hobby", options: ["Reading","Gaming","Cooking","Sports","Music","Art","Outdoors","Crafting","Tech"], sensitive: false },
  { key: "tvLike", label: "Favorite TV genre", options: ["Comedy/sitcoms","Drama","Reality","Sci-fi/fantasy","Documentary","True crime","Sports","Anime"], sensitive: false },
  { key: "food", label: "Comfort food", options: ["Italian","Mexican","Asian","BBQ","Soul food","Mediterranean","Vegetarian","Fast food"], sensitive: false },
];

export const HANDLE_ADJ = ["Quiet","Curious","Wandering","Honest","Distant","Patient","Restless","Bright","Steady","Hidden","Open","Soft","Sharp","Calm","Earnest"];
export const HANDLE_NOUN = ["Lantern","River","Window","Compass","Harbor","Field","Signal","Ember","Thread","Echo","Path","Stone","Branch","Tide","Breeze"];

// Used for client-side pre-validation; backend re-runs the same list authoritatively.
export const BANNED_PHRASES = [
  "kill yourself",
  "kys",
  "retard",
  "faggot",
  "n-word-slur",
  "go die",
];

export const PII_PATTERNS = [
  { name: "email" as const, pattern: /\b[\w.-]+@[\w.-]+\.\w{2,}\b/i },
  { name: "phone" as const, pattern: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/ },
  { name: "url" as const,   pattern: /\b(https?:\/\/|www\.)\S+/i },
  { name: "handle" as const, pattern: /@[a-zA-Z0-9_]{3,}/ },
];

// Chat reveal thresholds. Centralized so both client preview and server-side
// state machine agree on when "unlock" actually happens.
export const REVEAL_RULES = {
  minMessages: 6,
  minPerSide: 2,
  maxWaitMs: 5 * 60 * 1000,
};

// New-account rate limit
export const NEW_ACCOUNT_AGE_MS = 60 * 60 * 1000;
export const NEW_ACCOUNT_MSGS_PER_MIN = 10;
