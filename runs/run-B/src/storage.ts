import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { Todo } from "./types.js";

const STORAGE_FILE = process.env.TODOS_FILE ?? "todos.json";

async function readAll(): Promise<Todo[]> {
  if (!existsSync(STORAGE_FILE)) {
    return [];
  }
  const raw = await readFile(STORAGE_FILE, "utf-8");
  return JSON.parse(raw) as Todo[];
}

async function writeAll(todos: Todo[]): Promise<void> {
  await writeFile(STORAGE_FILE, JSON.stringify(todos, null, 2), "utf-8");
}

export async function listTodos(): Promise<Todo[]> {
  return readAll();
}

export async function createTodo(text: string): Promise<Todo> {
  const todos = await readAll();
  const todo: Todo = {
    id: crypto.randomUUID(),
    text,
    done: false,
    createdAt: new Date().toISOString(),
  };
  todos.push(todo);
  await writeAll(todos);
  return todo;
}

export async function updateTodo(id: string, done: boolean): Promise<Todo | null> {
  const todos = await readAll();
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) {
    return null;
  }
  todos[idx].done = done;
  await writeAll(todos);
  return todos[idx];
}

export async function deleteTodo(id: string): Promise<boolean> {
  const todos = await readAll();
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) {
    return false;
  }
  todos.splice(idx, 1);
  await writeAll(todos);
  return true;
}
