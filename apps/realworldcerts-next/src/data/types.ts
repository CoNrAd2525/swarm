export type DirectoryCategory =
  | "course"
  | "practice-test"
  | "study-tool"
  | "career-track";

export type DirectoryTag =
  | "beginner"
  | "intermediate"
  | "advanced"
  | "security"
  | "cloud"
  | "compliance"
  | "career"
  | "exam-prep"
  | "automation"
  | "analytics";

export type DirectoryDifficulty = "Beginner" | "Intermediate" | "Advanced";

export interface DirectoryItem {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  category: DirectoryCategory;
  tags: DirectoryTag[];
  rating: number;
  reviewCount: number;
  durationLabel: string;
  difficulty: DirectoryDifficulty;
  featured: boolean;
  provider: string;
  ctaLabel: string;
  ctaHref: string;
  priceLabel: string;
  updatedAt: string;
  outcomes: string[];
  modules: string[];
  audience: string[];
}
