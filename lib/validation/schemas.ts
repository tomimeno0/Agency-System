import {
  AssignmentStatus,
  FinancialMovementStatus,
  FinancialMovementType,
  AssignmentMode,
  LearningLevel,
  LearningProgressStatus,
  NotificationStatus,
  PaymentStatus,
  ReviewDecision,
  Role,
  TaskPriority,
  TaskState,
  UserStatus,
} from "@prisma/client";
import { z } from "zod";

export const cuidSchema = z.string().cuid();

export const paginationSchema = z.object({
  take: z.coerce.number().int().min(1).max(100).default(25),
  skip: z.coerce.number().int().min(0).default(0),
});

export const roleSchema = z.nativeEnum(Role);
export const userStatusSchema = z.nativeEnum(UserStatus);
export const taskStateSchema = z.nativeEnum(TaskState);
export const taskPrioritySchema = z.nativeEnum(TaskPriority);
export const assignmentStatusSchema = z.nativeEnum(AssignmentStatus);
export const assignmentModeSchema = z.nativeEnum(AssignmentMode);
export const reviewDecisionSchema = z.nativeEnum(ReviewDecision);
export const paymentStatusSchema = z.nativeEnum(PaymentStatus);
export const notificationStatusSchema = z.nativeEnum(NotificationStatus);
export const learningLevelSchema = z.nativeEnum(LearningLevel);
export const learningProgressStatusSchema = z.nativeEnum(LearningProgressStatus);
export const financialMovementTypeSchema = z.nativeEnum(FinancialMovementType);
export const financialMovementStatusSchema = z.nativeEnum(FinancialMovementStatus);

const passwordPolicySchema = z
  .string()
  .min(7, "Debe tener al menos 7 caracteres");

export const userCreateSchema = z.object({
  email: z.string().email(),
  password: passwordPolicySchema,
  displayName: z.string().min(2).max(80),
  fullName: z.string().min(2).max(120).optional(),
  avatarUrl: z.string().url().optional(),
  role: roleSchema,
  phone: z.string().min(6).max(30).optional(),
  country: z.string().max(80).optional(),
  timezone: z.string().min(2).max(80).optional(),
  declaredLevel: learningLevelSchema.optional(),
  softwareStack: z.array(z.string().min(1)).max(20).optional(),
  availabilityText: z.string().max(300).optional(),
});

export const userUpdateSchema = userCreateSchema.partial().omit({ password: true }).extend({
  status: userStatusSchema.optional(),
});

export const clientCreateSchema = z.object({
  name: z.string().min(2).max(120),
  brandName: z.string().max(120).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(6).max(30).optional(),
  notes: z.string().max(2000).optional(),
  stylePreferences: z.record(z.string(), z.unknown()).optional(),
  references: z.record(z.string(), z.unknown()).optional(),
  packSize: z.number().int().positive().optional(),
  packPrice: z.number().positive().optional(),
});

export const clientUpdateSchema = clientCreateSchema.partial().extend({
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const projectCreateSchema = z.object({
  clientId: cuidSchema,
  title: z.string().min(2).max(160),
  description: z.string().max(4000).optional(),
  packSize: z.number().int().positive(),
  packPrice: z.number().positive(),
  currency: z.string().length(3).default("USD"),
  defaultStyleNotes: z.string().max(2000).optional(),
  active: z.boolean().default(true),
});

export const projectUpdateSchema = projectCreateSchema.partial().omit({ clientId: true });

export const taskCreateSchema = z.object({
  projectId: cuidSchema.optional(),
  clientId: cuidSchema.optional(),
  directEditorId: cuidSchema.optional(),
  title: z.string().min(2).max(160),
  description: z.string().max(3000).optional(),
  instructions: z.string().max(8000).optional(),
  deadlineAt: z.string().datetime().optional(),
  priority: taskPrioritySchema.default(TaskPriority.MEDIUM),
  estimatedDurationMinutes: z.number().int().positive().optional(),
  assignedMode: z.enum(["manual", "offered"]).default("manual"),
  assignmentMode: assignmentModeSchema.optional(),
  totalVideos: z.number().int().positive().optional(),
  splitChunkSize: z.number().int().positive().default(10),
  state: taskStateSchema.default(TaskState.DRAFT),
});

export const taskUpdateSchema = taskCreateSchema.partial();

export const assignmentCreateSchema = z.object({
  editorId: cuidSchema,
  percentageOfTask: z.number().positive().max(100).default(100),
});

export const assignmentRespondSchema = z.object({
  decision: z.enum(["accept", "reject"]),
  reason: z.string().max(1000).optional(),
});

export const taskTransitionSchema = z.object({
  toState: taskStateSchema,
  comment: z.string().max(2000).optional(),
});

export const submissionCreateSchema = z.object({
  taskAssignmentId: cuidSchema,
  fileId: cuidSchema.optional(),
  notes: z.string().max(3000).optional(),
});

export const reviewCreateSchema = z.object({
  decision: reviewDecisionSchema,
  comments: z.string().max(3000).optional(),
});

export const financeCalculateSchema = z.object({
  taskAssignmentId: cuidSchema,
  editorPercentage: z.number().positive().max(100),
  agencyPercentage: z.number().positive().max(100),
});

export const financialMovementCreateSchema = z.object({
  type: financialMovementTypeSchema,
  subtype: z.string().max(120).optional(),
  amount: z.number().positive(),
  occurredAt: z.string().datetime().optional(),
  description: z.string().min(2).max(300),
  method: z.string().max(80).optional(),
  notes: z.string().max(2000).optional(),
  clientId: cuidSchema.optional(),
  taskId: cuidSchema.optional(),
  status: financialMovementStatusSchema.default(FinancialMovementStatus.CONFIRMED),
});

export const financialMovementUpdateSchema = financialMovementCreateSchema.partial();

export const workerNoteCreateSchema = z.object({
  content: z.string().min(2).max(1000),
});

export const uploadUrlSchema = z.object({
  taskId: cuidSchema.optional(),
  assignmentId: cuidSchema.optional(),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(3).max(100),
  sizeBytes: z.number().int().positive(),
  isFinal: z.boolean().default(false),
});

export const finalizeFileSchema = z.object({
  storageKey: z.string().min(1),
  taskId: cuidSchema.optional(),
  assignmentId: cuidSchema.optional(),
  originalName: z.string().min(1).max(255),
  mimeType: z.string().min(3).max(100),
  sizeBytes: z.number().int().positive(),
  isFinal: z.boolean().default(false),
});

export const downloadUrlSchema = z.object({
  fileId: cuidSchema,
});

export const learningProgressSchema = z.object({
  resourceId: cuidSchema,
  status: learningProgressStatusSchema,
});

export const learningResourceCreateSchema = z.object({
  title: z.string().min(3).max(180),
  description: z.string().max(2000).optional(),
  url: z.string().url(),
  level: learningLevelSchema,
  tags: z.array(z.string().min(1)).max(20).default([]),
  isActive: z.boolean().default(true),
});

export const notificationReadSchema = z.object({
  read: z.boolean().default(true),
});

export const aiChatSchema = z.object({
  message: z.string().min(2).max(2000),
  context: z.object({
    niche: z.string().max(100).optional(),
    platform: z.string().max(50).optional(),
    tone: z.string().max(80).optional(),
  }).optional(),
});

export const sessionRevokeSchema = z.object({
  scope: z.enum(["current", "all"]).default("current"),
});

export const resetPasswordRequestSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordConfirmSchema = z.object({
  token: z.string().min(20),
  newPassword: passwordPolicySchema,
});

export const registerSchema = z.object({
  displayName: z.string().min(2).max(80),
  email: z.string().email(),
  password: passwordPolicySchema,
  fullName: z.string().min(2).max(120).optional(),
  country: z.string().max(80).optional(),
  timezone: z.string().min(2).max(80).optional(),
});
