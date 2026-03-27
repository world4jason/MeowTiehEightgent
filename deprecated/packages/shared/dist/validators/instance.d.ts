import { z } from "zod";
export declare const instanceGeneralSettingsSchema: z.ZodObject<{
    censorUsernameInLogs: z.ZodDefault<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    censorUsernameInLogs: boolean;
}, {
    censorUsernameInLogs?: boolean | undefined;
}>;
export declare const patchInstanceGeneralSettingsSchema: z.ZodObject<{
    censorUsernameInLogs: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "strict", z.ZodTypeAny, {
    censorUsernameInLogs?: boolean | undefined;
}, {
    censorUsernameInLogs?: boolean | undefined;
}>;
export declare const instanceExperimentalSettingsSchema: z.ZodObject<{
    enableIsolatedWorkspaces: z.ZodDefault<z.ZodBoolean>;
    autoRestartDevServerWhenIdle: z.ZodDefault<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    enableIsolatedWorkspaces: boolean;
    autoRestartDevServerWhenIdle: boolean;
}, {
    enableIsolatedWorkspaces?: boolean | undefined;
    autoRestartDevServerWhenIdle?: boolean | undefined;
}>;
export declare const patchInstanceExperimentalSettingsSchema: z.ZodObject<{
    enableIsolatedWorkspaces: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    autoRestartDevServerWhenIdle: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "strict", z.ZodTypeAny, {
    enableIsolatedWorkspaces?: boolean | undefined;
    autoRestartDevServerWhenIdle?: boolean | undefined;
}, {
    enableIsolatedWorkspaces?: boolean | undefined;
    autoRestartDevServerWhenIdle?: boolean | undefined;
}>;
export type InstanceGeneralSettings = z.infer<typeof instanceGeneralSettingsSchema>;
export type PatchInstanceGeneralSettings = z.infer<typeof patchInstanceGeneralSettingsSchema>;
export type InstanceExperimentalSettings = z.infer<typeof instanceExperimentalSettingsSchema>;
export type PatchInstanceExperimentalSettings = z.infer<typeof patchInstanceExperimentalSettingsSchema>;
//# sourceMappingURL=instance.d.ts.map