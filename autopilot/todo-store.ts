// Todo store. A tiny, local, never-throwing task list persisted to todos.json at
// process.cwd(). Designed so the autopilot/fleet can auto-add tasks it discovers
// (source="ai"/"clipboard") alongside ones the owner types by hand.
//
// PRIVACY/SAFETY: data lives ONLY locally in todos.json. All file I/O is wrapped
// in try/catch; nothing here ever throws — callers always get a sane value.

import fs from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "todos.json");

export interface Todo {
  id: string;
  ts: string;
  text: string;
  done: boolean;
  source?: string;
}

function read(): Todo[] {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (t: any) =>
          t &&
          typeof t.id === "string" &&
          typeof t.ts === "string" &&
          typeof t.text === "string"
      )
      .map((t: any) => ({
        id: t.id,
        ts: t.ts,
        text: t.text,
        done: !!t.done,
        ...(typeof t.source === "string" ? { source: t.source } : {})
      }));
  } catch {
    return [];
  }
}

function write(todos: Todo[]): void {
  try {
    fs.writeFileSync(FILE, JSON.stringify(todos, null, 2), "utf8");
  } catch (e) {
    console.error("todo-store write failed:", e);
  }
}

// All todos, newest first.
export function listTodos(): Todo[] {
  try {
    return read().sort((a, b) => b.ts.localeCompare(a.ts));
  } catch {
    return [];
  }
}

// Add a todo. id is the creation timestamp (Date.now()). Returns the new todo;
// if text is blank it still returns a (harmless) record rather than throwing.
export function addTodo(text: string, source?: string): Todo {
  const todo: Todo = {
    id: String(Date.now()),
    ts: new Date().toISOString(),
    text: typeof text === "string" ? text.trim() : "",
    done: false,
    ...(typeof source === "string" && source ? { source } : {})
  };
  try {
    const todos = read();
    todos.push(todo);
    write(todos);
  } catch (e) {
    console.error("todo-store add failed:", e);
  }
  return todo;
}

// Flip the done flag of one todo. Returns the updated todo, or null if not found.
export function toggleTodo(id: string): Todo | null {
  try {
    const todos = read();
    const t = todos.find((x) => x.id === id);
    if (!t) return null;
    t.done = !t.done;
    write(todos);
    return t;
  } catch (e) {
    console.error("todo-store toggle failed:", e);
    return null;
  }
}

// Remove one todo. No-op (and silent) if it doesn't exist.
export function deleteTodo(id: string): void {
  try {
    const todos = read().filter((x) => x.id !== id);
    write(todos);
  } catch (e) {
    console.error("todo-store delete failed:", e);
  }
}
