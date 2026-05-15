import { z } from "zod";

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
}

export const CreateTodoSchema = z.object({
  text: z.string().min(1).max(500),
});

export const UpdateTodoSchema = z.object({
  done: z.boolean(),
});

export type CreateTodoInput = z.infer<typeof CreateTodoSchema>;
export type UpdateTodoInput = z.infer<typeof UpdateTodoSchema>;
