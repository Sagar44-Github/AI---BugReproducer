import {
  pgTable,
  text,
  serial,
  timestamp,
  real,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const analysesTable = pgTable("analyses", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  inputType: text("input_type", {
    enum: ["raw_text", "github_url", "stack_trace"],
  }).notNull(),
  rawInput: text("raw_input").notNull(),
  githubUrl: text("github_url"),
  codeContext: text("code_context"),
  status: text("status", {
    enum: ["pending", "running", "completed", "failed"],
  })
    .notNull()
    .default("pending"),
  confidenceScore: real("confidence_score"),
  extractedEntities: text("extracted_entities"),
  hypotheses: text("hypotheses"),
  reproductionSteps: text("reproduction_steps"),
  testCode: text("test_code"),
  flowDiagram: text("flow_diagram"),
  clarifyingQuestions: text("clarifying_questions"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAnalysisSchema = createInsertSchema(analysesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAnalysis = z.infer<typeof insertAnalysisSchema>;
export type Analysis = typeof analysesTable.$inferSelect;
