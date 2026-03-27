import { z } from "zod";
export declare const createRoutineSchema: z.ZodObject<{
    projectId: z.ZodString;
    goalId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    parentIssueId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    title: z.ZodString;
    description: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    assigneeAgentId: z.ZodString;
    priority: z.ZodDefault<z.ZodOptional<z.ZodEnum<["critical", "high", "medium", "low"]>>>;
    status: z.ZodDefault<z.ZodOptional<z.ZodEnum<["active", "paused", "archived"]>>>;
    concurrencyPolicy: z.ZodDefault<z.ZodOptional<z.ZodEnum<["coalesce_if_active", "always_enqueue", "skip_if_active"]>>>;
    catchUpPolicy: z.ZodDefault<z.ZodOptional<z.ZodEnum<["skip_missed", "enqueue_missed_with_cap"]>>>;
}, "strip", z.ZodTypeAny, {
    status: "active" | "paused" | "archived";
    projectId: string;
    title: string;
    priority: "critical" | "high" | "medium" | "low";
    assigneeAgentId: string;
    concurrencyPolicy: "coalesce_if_active" | "always_enqueue" | "skip_if_active";
    catchUpPolicy: "skip_missed" | "enqueue_missed_with_cap";
    description?: string | null | undefined;
    goalId?: string | null | undefined;
    parentIssueId?: string | null | undefined;
}, {
    projectId: string;
    title: string;
    assigneeAgentId: string;
    status?: "active" | "paused" | "archived" | undefined;
    description?: string | null | undefined;
    priority?: "critical" | "high" | "medium" | "low" | undefined;
    goalId?: string | null | undefined;
    parentIssueId?: string | null | undefined;
    concurrencyPolicy?: "coalesce_if_active" | "always_enqueue" | "skip_if_active" | undefined;
    catchUpPolicy?: "skip_missed" | "enqueue_missed_with_cap" | undefined;
}>;
export type CreateRoutine = z.infer<typeof createRoutineSchema>;
export declare const updateRoutineSchema: z.ZodObject<{
    projectId: z.ZodOptional<z.ZodString>;
    goalId: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    parentIssueId: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    assigneeAgentId: z.ZodOptional<z.ZodString>;
    priority: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodEnum<["critical", "high", "medium", "low"]>>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodEnum<["active", "paused", "archived"]>>>>;
    concurrencyPolicy: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodEnum<["coalesce_if_active", "always_enqueue", "skip_if_active"]>>>>;
    catchUpPolicy: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodEnum<["skip_missed", "enqueue_missed_with_cap"]>>>>;
}, "strip", z.ZodTypeAny, {
    status?: "active" | "paused" | "archived" | undefined;
    description?: string | null | undefined;
    projectId?: string | undefined;
    title?: string | undefined;
    priority?: "critical" | "high" | "medium" | "low" | undefined;
    goalId?: string | null | undefined;
    assigneeAgentId?: string | undefined;
    parentIssueId?: string | null | undefined;
    concurrencyPolicy?: "coalesce_if_active" | "always_enqueue" | "skip_if_active" | undefined;
    catchUpPolicy?: "skip_missed" | "enqueue_missed_with_cap" | undefined;
}, {
    status?: "active" | "paused" | "archived" | undefined;
    description?: string | null | undefined;
    projectId?: string | undefined;
    title?: string | undefined;
    priority?: "critical" | "high" | "medium" | "low" | undefined;
    goalId?: string | null | undefined;
    assigneeAgentId?: string | undefined;
    parentIssueId?: string | null | undefined;
    concurrencyPolicy?: "coalesce_if_active" | "always_enqueue" | "skip_if_active" | undefined;
    catchUpPolicy?: "skip_missed" | "enqueue_missed_with_cap" | undefined;
}>;
export type UpdateRoutine = z.infer<typeof updateRoutineSchema>;
export declare const createRoutineTriggerSchema: z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
    label: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    enabled: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
} & {
    kind: z.ZodLiteral<"schedule">;
    cronExpression: z.ZodString;
    timezone: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    kind: "schedule";
    cronExpression: string;
    timezone: string;
    label?: string | null | undefined;
}, {
    kind: "schedule";
    cronExpression: string;
    enabled?: boolean | undefined;
    label?: string | null | undefined;
    timezone?: string | undefined;
}>, z.ZodObject<{
    label: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    enabled: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
} & {
    kind: z.ZodLiteral<"webhook">;
    signingMode: z.ZodDefault<z.ZodOptional<z.ZodEnum<["bearer", "hmac_sha256"]>>>;
    replayWindowSec: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    kind: "webhook";
    signingMode: "bearer" | "hmac_sha256";
    replayWindowSec: number;
    label?: string | null | undefined;
}, {
    kind: "webhook";
    enabled?: boolean | undefined;
    label?: string | null | undefined;
    signingMode?: "bearer" | "hmac_sha256" | undefined;
    replayWindowSec?: number | undefined;
}>, z.ZodObject<{
    label: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    enabled: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
} & {
    kind: z.ZodLiteral<"api">;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    kind: "api";
    label?: string | null | undefined;
}, {
    kind: "api";
    enabled?: boolean | undefined;
    label?: string | null | undefined;
}>]>;
export type CreateRoutineTrigger = z.infer<typeof createRoutineTriggerSchema>;
export declare const updateRoutineTriggerSchema: z.ZodObject<{
    label: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    enabled: z.ZodOptional<z.ZodBoolean>;
    cronExpression: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    timezone: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    signingMode: z.ZodNullable<z.ZodOptional<z.ZodEnum<["bearer", "hmac_sha256"]>>>;
    replayWindowSec: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    enabled?: boolean | undefined;
    label?: string | null | undefined;
    cronExpression?: string | null | undefined;
    timezone?: string | null | undefined;
    signingMode?: "bearer" | "hmac_sha256" | null | undefined;
    replayWindowSec?: number | null | undefined;
}, {
    enabled?: boolean | undefined;
    label?: string | null | undefined;
    cronExpression?: string | null | undefined;
    timezone?: string | null | undefined;
    signingMode?: "bearer" | "hmac_sha256" | null | undefined;
    replayWindowSec?: number | null | undefined;
}>;
export type UpdateRoutineTrigger = z.infer<typeof updateRoutineTriggerSchema>;
export declare const runRoutineSchema: z.ZodObject<{
    triggerId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    payload: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    idempotencyKey: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    source: z.ZodDefault<z.ZodOptional<z.ZodEnum<["manual", "api"]>>>;
}, "strip", z.ZodTypeAny, {
    source: "manual" | "api";
    payload?: Record<string, unknown> | null | undefined;
    idempotencyKey?: string | null | undefined;
    triggerId?: string | null | undefined;
}, {
    source?: "manual" | "api" | undefined;
    payload?: Record<string, unknown> | null | undefined;
    idempotencyKey?: string | null | undefined;
    triggerId?: string | null | undefined;
}>;
export type RunRoutine = z.infer<typeof runRoutineSchema>;
export declare const rotateRoutineTriggerSecretSchema: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
export type RotateRoutineTriggerSecret = z.infer<typeof rotateRoutineTriggerSecretSchema>;
//# sourceMappingURL=routine.d.ts.map