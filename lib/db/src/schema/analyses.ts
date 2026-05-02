import {
  pgTable,
  text,
  serial,
  timestamp,
  real,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const analysesTable = pgTable("analyses", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  inputType: text("input_type", {
    enum: ["raw_text", "github_url", "stack_trace", "jira_ticket", "sentry_event", "log_file", "curl_request", "video_description"],
  }).notNull(),
  rawInput: text("raw_input").notNull(),
  githubUrl: text("github_url"),
  codeContext: text("code_context"),
  tags: text("tags"),
  status: text("status", {
    enum: ["pending", "running", "completed", "failed"],
  })
    .notNull()
    .default("pending"),
  confidenceScore: real("confidence_score"),
  confidenceBreakdown: text("confidence_breakdown"),
  severity: text("severity", {
    enum: ["critical", "high", "medium", "low"],
  }),
  severityReason: text("severity_reason"),
  auditTrail: text("audit_trail"),
  correlations: text("correlations"),
  extractedEntities: text("extracted_entities"),
  hypotheses: text("hypotheses"),
  reproductionSteps: text("reproduction_steps"),
  testCode: text("test_code"),
  flowDiagram: text("flow_diagram"),
  clarifyingQuestions: text("clarifying_questions"),
  testSyntaxStatus: text("test_syntax_status", {
    enum: ["verified", "warning", "unchecked"],
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const collaborationAnnotationsTable = pgTable("collaboration_annotations", {
  id: serial("id").primaryKey(),
  analysisId: integer("analysis_id").notNull(),
  authorName: text("author_name").notNull(),
  type: text("type", {
    enum: ["note", "verified", "failed", "question"],
  }).notNull(),
  stepRef: text("step_ref"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAnalysisSchema = createInsertSchema(analysesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAnnotationSchema = createInsertSchema(collaborationAnnotationsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertAnalysis = z.infer<typeof insertAnalysisSchema>;
export type Analysis = typeof analysesTable.$inferSelect;
export type InsertAnnotation = z.infer<typeof insertAnnotationSchema>;
export type CollaborationAnnotation = typeof collaborationAnnotationsTable.$inferSelect;
