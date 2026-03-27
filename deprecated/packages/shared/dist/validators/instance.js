import { z } from "zod";
export const instanceGeneralSettingsSchema = z.object({
    censorUsernameInLogs: z.boolean().default(false),
}).strict();
export const patchInstanceGeneralSettingsSchema = instanceGeneralSettingsSchema.partial();
export const instanceExperimentalSettingsSchema = z.object({
    enableIsolatedWorkspaces: z.boolean().default(false),
    autoRestartDevServerWhenIdle: z.boolean().default(false),
}).strict();
export const patchInstanceExperimentalSettingsSchema = instanceExperimentalSettingsSchema.partial();
//# sourceMappingURL=instance.js.map