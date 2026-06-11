import { directoryItems } from "../data/directory-items.ts";
import { type SortOption } from "../data/filters.ts";
import type {
  DirectoryCategory,
  DirectoryDifficulty,
  DirectoryItem,
  DirectoryTag
} from "../data/types.ts";

export interface DirectoryFilterState {
  query: string;
  categories: DirectoryCategory[];
  difficulties: DirectoryDifficulty[];
  tags: DirectoryTag[];
  featuredOnly: boolean;
  sortBy: SortOption;
}

export const defaultDirectoryFilters: DirectoryFilterState = {
  query: "",
  categories: [],
  difficulties: [],
  tags: [],
  featuredOnly: false,
  sortBy: "featured"
};

export function filterDirectoryItems(
  items: DirectoryItem[],
  filters: DirectoryFilterState
) {
  const query = filters.query.trim().toLowerCase();

  return items.filter((item) => {
    const matchesQuery =
      query.length === 0 ||
      [
        item.title,
        item.shortDescription,
        item.provider,
        item.tags.join(" "),
        item.category
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);

    const matchesCategory =
      filters.categories.length === 0 ||
      filters.categories.includes(item.category);

    const matchesDifficulty =
      filters.difficulties.length === 0 ||
      filters.difficulties.includes(item.difficulty);

    const matchesTags =
      filters.tags.length === 0 ||
      filters.tags.every((tag) => item.tags.includes(tag));

    const matchesFeatured = !filters.featuredOnly || item.featured;

    return (
      matchesQuery &&
      matchesCategory &&
      matchesDifficulty &&
      matchesTags &&
      matchesFeatured
    );
  });
}

export function sortDirectoryItems(
  items: DirectoryItem[],
  sortBy: SortOption
) {
  const sorted = [...items];

  sorted.sort((left, right) => {
    switch (sortBy) {
      case "rating":
        return right.rating - left.rating;
      case "reviews":
        return right.reviewCount - left.reviewCount;
      case "title":
        return left.title.localeCompare(right.title);
      case "featured":
      default:
        if (left.featured !== right.featured) {
          return Number(right.featured) - Number(left.featured);
        }
        if (left.rating !== right.rating) {
          return right.rating - left.rating;
        }
        return right.reviewCount - left.reviewCount;
    }
  });

  return sorted;
}

export function getDirectoryResults(filters: DirectoryFilterState) {
  return sortDirectoryItems(
    filterDirectoryItems(directoryItems, filters),
    filters.sortBy
  );
}

export function getRelatedItems(currentSlug: string, limit = 3) {
  const currentItem = directoryItems.find((item) => item.slug === currentSlug);

  if (!currentItem) {
    return [];
  }

  return directoryItems
    .filter(
      (item) =>
        item.slug !== currentSlug &&
        (item.category === currentItem.category ||
          item.tags.some((tag) => currentItem.tags.includes(tag)))
    )
    .slice(0, limit);
}
