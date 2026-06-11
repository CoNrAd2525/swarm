import type {
  DirectoryCategory,
  DirectoryDifficulty,
  DirectoryTag
} from "./types.ts";

export const categoryOptions: Array<{
  value: DirectoryCategory;
  label: string;
}> = [
  { value: "course", label: "Courses" },
  { value: "practice-test", label: "Practice Tests" },
  { value: "study-tool", label: "Study Tools" },
  { value: "career-track", label: "Career Tracks" }
];

export const difficultyOptions: Array<{
  value: DirectoryDifficulty;
  label: string;
}> = [
  { value: "Beginner", label: "Beginner" },
  { value: "Intermediate", label: "Intermediate" },
  { value: "Advanced", label: "Advanced" }
];

export const tagOptions: Array<{
  value: DirectoryTag;
  label: string;
}> = [
  { value: "security", label: "Security" },
  { value: "cloud", label: "Cloud" },
  { value: "compliance", label: "Compliance" },
  { value: "career", label: "Career" },
  { value: "exam-prep", label: "Exam Prep" },
  { value: "automation", label: "Automation" },
  { value: "analytics", label: "Analytics" }
];

export const sortOptions = [
  { value: "featured", label: "Featured first" },
  { value: "rating", label: "Top rated" },
  { value: "reviews", label: "Most reviewed" },
  { value: "title", label: "Alphabetical" }
] as const;

export type SortOption = (typeof sortOptions)[number]["value"];
