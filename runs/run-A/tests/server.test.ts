import { describe, it, expect, beforeEach } from "vitest";
import { unlinkSync, existsSync } from "node:fs";
import request from "supertest";
import { createApp } from "../src/server.js";

const TEST_FILE = "todos.json";

beforeEach(() => {
  if (existsSync(TEST_FILE)) {
    unlinkSync(TEST_FILE);
  }
});

describe("Todo API", () => {
  it("GET /todos returns empty array initially", async () => {
    const app = createApp();
    const res = await request(app).get("/todos");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("POST /todos creates a new todo", async () => {
    const app = createApp();
    const res = await request(app).post("/todos").send({ text: "Buy milk" });
    expect(res.status).toBe(201);
    expect(res.body.text).toBe("Buy milk");
    expect(res.body.done).toBe(false);
    expect(res.body.id).toBeDefined();
  });

  it("POST /todos rejects invalid input", async () => {
    const app = createApp();
    const res = await request(app).post("/todos").send({});
    expect(res.status).toBe(400);
  });

  it("PATCH /todos/:id updates done state", async () => {
    const app = createApp();
    const created = await request(app).post("/todos").send({ text: "Test" });
    const res = await request(app).patch(`/todos/${created.body.id}`).send({ done: true });
    expect(res.status).toBe(200);
    expect(res.body.done).toBe(true);
  });

  it("PATCH /todos/:id returns 404 for missing todo", async () => {
    const app = createApp();
    const res = await request(app).patch("/todos/nonexistent").send({ done: true });
    expect(res.status).toBe(404);
  });

  it("DELETE /todos/:id removes a todo", async () => {
    const app = createApp();
    const created = await request(app).post("/todos").send({ text: "Test" });
    const res = await request(app).delete(`/todos/${created.body.id}`);
    expect(res.status).toBe(204);

    const after = await request(app).get("/todos");
    expect(after.body).toEqual([]);
  });

  it("DELETE /todos/:id returns 404 for missing todo", async () => {
    const app = createApp();
    const res = await request(app).delete("/todos/nonexistent");
    expect(res.status).toBe(404);
  });
});
