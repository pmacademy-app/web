import { z } from 'zod';

export const RawLearningPathMetadataSchema = z.object({
  module: z.string().min(1, "Module field is required"),
  currentLesson: z.string().min(1, "Current Lesson field is required"),
  difficulty: z.string().min(1, "Difficulty field is required"),
  estimatedStudyTime: z.string().min(1, "Estimated Study Time field is required"),
  prerequisites: z.string().min(1, "Prerequisites field is required"),
  nextLesson: z.string().optional(),
  futureTopicsUnlocked: z.string().optional(),
});

export const ParsedLessonMetadataSchema = z.object({
  module: z.string(), // e.g. "foundations"
  order: z.number().int().min(1), // N from "N of M"
  totalInModule: z.number().int().min(1), // M from "N of M"
  difficulty: z.number().min(1).max(10), // N from "N / 10"
  estimatedReadingTime: z.number().int().nonnegative(),
  estimatedCompletionTime: z.number().int().nonnegative(),
  prerequisitesRaw: z.string(),
  nextLessonRaw: z.string().optional(),
  futureTopicsUnlockedRaw: z.string().optional(),
});

export type RawLearningPathMetadata = z.infer<typeof RawLearningPathMetadataSchema>;
export type ParsedLessonMetadata = z.infer<typeof ParsedLessonMetadataSchema>;
