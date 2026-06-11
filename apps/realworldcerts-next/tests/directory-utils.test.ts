import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultDirectoryFilters,
  filterDirectoryItems,
  getRelatedItems,
  sortDirectoryItems
} from "../src/lib/directory.ts";
import { directoryItems } from "../src/data/directory-items.ts";

test("filterDirectoryItems narrows results by category and tag", () => {
  const results = filterDirectoryItems(directoryItems, {
    ...defaultDirectoryFilters,
    categories: ["practice-test"],
    tags: ["cloud"]
  });

  assert.ok(results.length > 0);
  assert.equal(results.every((item) => item.category === "practice-test"), true);
  assert.equal(results.every((item) => item.tags.includes("cloud")), true);
});

test("sortDirectoryItems prioritizes featured items for featured sort", () => {
  const results = sortDirectoryItems(directoryItems, "featured");

  assert.equal(results[0].featured, true);
  assert.equal(results.at(-1)?.featured, false);
});

test("getRelatedItems excludes the current listing and returns relevant matches", () => {
  const related = getRelatedItems("security-plus-lab-pack", 2);

  assert.equal(related.length, 2);
  assert.equal(
    related.some((item) => item.slug === "security-plus-lab-pack"),
    false
  );
});
