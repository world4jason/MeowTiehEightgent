export interface Routine {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoutineListItem {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  triggerCount: number;
}

export interface RoutineDetail extends Routine {
  triggers: RoutineTrigger[];
}

export interface RoutineRun {
  id: string;
  routineId: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

export interface RoutineRunSummary {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: Date;
  finishedAt: Date | null;
}

export type RoutineTriggerKind = "schedule" | "webhook" | "internal";

export interface RoutineTrigger {
  id: string;
  routineId: string;
  kind: RoutineTriggerKind;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: Date;
}

export interface RoutineTriggerSecretMaterial {
  webhookSecret: string;
}
