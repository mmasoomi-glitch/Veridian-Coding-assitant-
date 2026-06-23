// Prompt inventory store. A private, server-side library of reusable developer
// prompts (LLM prompt templates) the developer wants on hand — explain code,
// write tests, refactor, find bugs, draft commit messages, etc. Entries live in
// `prompts.json` at the repo root. Everything here is best-effort and NEVER
// throws — the UI polls these endpoints and a thrown error would crash the
// request handler.

import fs from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "prompts.json");

export interface PromptItem {
  id: string;
  ts: string;
  title: string;
  body: string;
  tags: string[];
}

// A small, genuinely useful starter set seeded on first run. These are real,
// reusable prompt bodies — not placeholders — so the inventory is useful out of
// the box.
function seedPrompts(): PromptItem[] {
  const now = new Date().toISOString();
  // Spread the seed timestamps by a few ms so ids stay unique and ordering is
  // stable/deterministic.
  let i = 0;
  const mk = (title: string, body: string, tags: string[]): PromptItem => {
    const item: PromptItem = {
      id: `${Date.now() + i}`,
      ts: now,
      title,
      body,
      tags
    };
    i++;
    return item;
  };
  return [
    mk(
      "Explain this code",
      "Explain what the selected code does, step by step. Cover its purpose, the key control flow, any non-obvious decisions or edge cases, and the assumptions it makes about its inputs. Call out anything that looks surprising or potentially buggy. Keep it concise and concrete.",
      ["explain", "review"]
    ),
    mk(
      "Write tests for selection",
      "Write thorough unit tests for the selected code using the project's existing test framework and conventions. Cover the happy path, boundary conditions, empty/null inputs, and error handling. Use descriptive test names, avoid over-mocking, and assert on observable behavior rather than implementation details.",
      ["tests", "quality"]
    ),
    mk(
      "Refactor for readability",
      "Refactor the selected code to improve readability and maintainability WITHOUT changing its observable behavior. Prefer clear names, small focused functions, early returns over deep nesting, and removal of dead code or duplication. Explain each change briefly and keep the public interface stable.",
      ["refactor", "cleanup"]
    ),
    mk(
      "Find the bug",
      "Act as a careful reviewer. Find the bug in the selected code. Reason about the inputs that would trigger it, the exact line(s) responsible, and why it misbehaves (off-by-one, race, null deref, wrong operator, incorrect assumption, etc.). Propose the smallest correct fix and a test that would have caught it.",
      ["debug", "review"]
    ),
    mk(
      "Draft a commit message",
      "Write a clear, conventional commit message for the staged changes. Use an imperative subject line under ~72 characters (e.g. 'Fix race in session poller'), a blank line, then a short body explaining WHAT changed and WHY (not how). Reference any relevant issue. Do not invent changes that aren't in the diff.",
      ["git", "writing"]
    )
  ];
}

function read(): PromptItem[] {
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PromptItem[]) : [];
  } catch {
    return [];
  }
}

function write(items: PromptItem[]): void {
  try {
    fs.writeFileSync(FILE, JSON.stringify(items, null, 2), "utf8");
  } catch (e) {
    console.error("prompts write failed:", e);
  }
}

// Returns all prompts. On first run (no file yet), seeds and persists a small
// set of useful developer prompts, then returns them.
export function listPrompts(): PromptItem[] {
  try {
    if (!fs.existsSync(FILE)) {
      const seed = seedPrompts();
      write(seed);
      return seed;
    }
    return read();
  } catch (e) {
    console.error("prompts listPrompts failed:", e);
    return [];
  }
}

export function addPrompt(p: { title: string; body: string; tags?: string[] }): PromptItem {
  const item: PromptItem = {
    id: `${Date.now()}`,
    ts: new Date().toISOString(),
    title: (p.title || "").trim() || "(untitled)",
    body: p.body || "",
    tags: Array.isArray(p.tags) ? p.tags.map((t) => String(t).trim()).filter(Boolean) : []
  };
  try {
    const items = listPrompts();
    items.push(item);
    write(items);
  } catch (e) {
    console.error("prompts addPrompt failed:", e);
  }
  return item;
}

export function updatePrompt(id: string, patch: Partial<PromptItem>): PromptItem | null {
  if (!id) return null;
  try {
    const items = listPrompts();
    const idx = items.findIndex((x) => x.id === id);
    if (idx < 0) return null;
    const current = items[idx];
    const next: PromptItem = {
      ...current,
      // id and ts are not patchable through the public surface.
      title: patch.title !== undefined ? String(patch.title) : current.title,
      body: patch.body !== undefined ? String(patch.body) : current.body,
      tags:
        patch.tags !== undefined && Array.isArray(patch.tags)
          ? patch.tags.map((t) => String(t).trim()).filter(Boolean)
          : current.tags,
      id: current.id,
      ts: current.ts
    };
    items[idx] = next;
    write(items);
    return next;
  } catch (e) {
    console.error("prompts updatePrompt failed:", e);
    return null;
  }
}

export function deletePrompt(id: string): void {
  if (!id) return;
  try {
    const items = listPrompts();
    write(items.filter((x) => x.id !== id));
  } catch (e) {
    console.error("prompts deletePrompt failed:", e);
  }
}
