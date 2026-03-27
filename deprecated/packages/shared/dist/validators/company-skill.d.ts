import { z } from "zod";
export declare const companySkillSourceTypeSchema: z.ZodEnum<["local_path", "github", "url", "catalog", "skills_sh"]>;
export declare const companySkillTrustLevelSchema: z.ZodEnum<["markdown_only", "assets", "scripts_executables"]>;
export declare const companySkillCompatibilitySchema: z.ZodEnum<["compatible", "unknown", "invalid"]>;
export declare const companySkillSourceBadgeSchema: z.ZodEnum<["mth", "github", "local", "url", "catalog", "skills_sh"]>;
export declare const companySkillFileInventoryEntrySchema: z.ZodObject<{
    path: z.ZodString;
    kind: z.ZodEnum<["skill", "markdown", "reference", "script", "asset", "other"]>;
}, "strip", z.ZodTypeAny, {
    path: string;
    kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
}, {
    path: string;
    kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
}>;
export declare const companySkillSchema: z.ZodObject<{
    id: z.ZodString;
    companyId: z.ZodString;
    key: z.ZodString;
    slug: z.ZodString;
    name: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    markdown: z.ZodString;
    sourceType: z.ZodEnum<["local_path", "github", "url", "catalog", "skills_sh"]>;
    sourceLocator: z.ZodNullable<z.ZodString>;
    sourceRef: z.ZodNullable<z.ZodString>;
    trustLevel: z.ZodEnum<["markdown_only", "assets", "scripts_executables"]>;
    compatibility: z.ZodEnum<["compatible", "unknown", "invalid"]>;
    fileInventory: z.ZodDefault<z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        kind: z.ZodEnum<["skill", "markdown", "reference", "script", "asset", "other"]>;
    }, "strip", z.ZodTypeAny, {
        path: string;
        kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
    }, {
        path: string;
        kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
    }>, "many">>;
    metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    updatedAt: Date;
    markdown: string;
    id: string;
    companyId: string;
    createdAt: Date;
    name: string;
    description: string | null;
    key: string;
    slug: string;
    sourceType: "local_path" | "github" | "url" | "catalog" | "skills_sh";
    sourceLocator: string | null;
    sourceRef: string | null;
    trustLevel: "markdown_only" | "assets" | "scripts_executables";
    compatibility: "unknown" | "compatible" | "invalid";
    fileInventory: {
        path: string;
        kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
    }[];
    metadata: Record<string, unknown> | null;
}, {
    updatedAt: Date;
    markdown: string;
    id: string;
    companyId: string;
    createdAt: Date;
    name: string;
    description: string | null;
    key: string;
    slug: string;
    sourceType: "local_path" | "github" | "url" | "catalog" | "skills_sh";
    sourceLocator: string | null;
    sourceRef: string | null;
    trustLevel: "markdown_only" | "assets" | "scripts_executables";
    compatibility: "unknown" | "compatible" | "invalid";
    metadata: Record<string, unknown> | null;
    fileInventory?: {
        path: string;
        kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
    }[] | undefined;
}>;
export declare const companySkillListItemSchema: z.ZodObject<{
    id: z.ZodString;
    companyId: z.ZodString;
    key: z.ZodString;
    slug: z.ZodString;
    name: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    markdown: z.ZodString;
    sourceType: z.ZodEnum<["local_path", "github", "url", "catalog", "skills_sh"]>;
    sourceLocator: z.ZodNullable<z.ZodString>;
    sourceRef: z.ZodNullable<z.ZodString>;
    trustLevel: z.ZodEnum<["markdown_only", "assets", "scripts_executables"]>;
    compatibility: z.ZodEnum<["compatible", "unknown", "invalid"]>;
    fileInventory: z.ZodDefault<z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        kind: z.ZodEnum<["skill", "markdown", "reference", "script", "asset", "other"]>;
    }, "strip", z.ZodTypeAny, {
        path: string;
        kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
    }, {
        path: string;
        kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
    }>, "many">>;
    metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
} & {
    attachedAgentCount: z.ZodNumber;
    editable: z.ZodBoolean;
    editableReason: z.ZodNullable<z.ZodString>;
    sourceLabel: z.ZodNullable<z.ZodString>;
    sourceBadge: z.ZodEnum<["mth", "github", "local", "url", "catalog", "skills_sh"]>;
}, "strip", z.ZodTypeAny, {
    updatedAt: Date;
    markdown: string;
    id: string;
    companyId: string;
    createdAt: Date;
    name: string;
    description: string | null;
    key: string;
    slug: string;
    sourceType: "local_path" | "github" | "url" | "catalog" | "skills_sh";
    sourceLocator: string | null;
    sourceRef: string | null;
    trustLevel: "markdown_only" | "assets" | "scripts_executables";
    compatibility: "unknown" | "compatible" | "invalid";
    fileInventory: {
        path: string;
        kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
    }[];
    metadata: Record<string, unknown> | null;
    attachedAgentCount: number;
    editable: boolean;
    editableReason: string | null;
    sourceLabel: string | null;
    sourceBadge: "mth" | "github" | "url" | "catalog" | "skills_sh" | "local";
}, {
    updatedAt: Date;
    markdown: string;
    id: string;
    companyId: string;
    createdAt: Date;
    name: string;
    description: string | null;
    key: string;
    slug: string;
    sourceType: "local_path" | "github" | "url" | "catalog" | "skills_sh";
    sourceLocator: string | null;
    sourceRef: string | null;
    trustLevel: "markdown_only" | "assets" | "scripts_executables";
    compatibility: "unknown" | "compatible" | "invalid";
    metadata: Record<string, unknown> | null;
    attachedAgentCount: number;
    editable: boolean;
    editableReason: string | null;
    sourceLabel: string | null;
    sourceBadge: "mth" | "github" | "url" | "catalog" | "skills_sh" | "local";
    fileInventory?: {
        path: string;
        kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
    }[] | undefined;
}>;
export declare const companySkillUsageAgentSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    urlKey: z.ZodString;
    adapterType: z.ZodString;
    desired: z.ZodBoolean;
    actualState: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    urlKey: string;
    adapterType: string;
    desired: boolean;
    actualState: string | null;
}, {
    id: string;
    name: string;
    urlKey: string;
    adapterType: string;
    desired: boolean;
    actualState: string | null;
}>;
export declare const companySkillDetailSchema: z.ZodObject<{
    id: z.ZodString;
    companyId: z.ZodString;
    key: z.ZodString;
    slug: z.ZodString;
    name: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    markdown: z.ZodString;
    sourceType: z.ZodEnum<["local_path", "github", "url", "catalog", "skills_sh"]>;
    sourceLocator: z.ZodNullable<z.ZodString>;
    sourceRef: z.ZodNullable<z.ZodString>;
    trustLevel: z.ZodEnum<["markdown_only", "assets", "scripts_executables"]>;
    compatibility: z.ZodEnum<["compatible", "unknown", "invalid"]>;
    fileInventory: z.ZodDefault<z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        kind: z.ZodEnum<["skill", "markdown", "reference", "script", "asset", "other"]>;
    }, "strip", z.ZodTypeAny, {
        path: string;
        kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
    }, {
        path: string;
        kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
    }>, "many">>;
    metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
} & {
    attachedAgentCount: z.ZodNumber;
    usedByAgents: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        urlKey: z.ZodString;
        adapterType: z.ZodString;
        desired: z.ZodBoolean;
        actualState: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        urlKey: string;
        adapterType: string;
        desired: boolean;
        actualState: string | null;
    }, {
        id: string;
        name: string;
        urlKey: string;
        adapterType: string;
        desired: boolean;
        actualState: string | null;
    }>, "many">>;
    editable: z.ZodBoolean;
    editableReason: z.ZodNullable<z.ZodString>;
    sourceLabel: z.ZodNullable<z.ZodString>;
    sourceBadge: z.ZodEnum<["mth", "github", "local", "url", "catalog", "skills_sh"]>;
}, "strip", z.ZodTypeAny, {
    updatedAt: Date;
    markdown: string;
    id: string;
    companyId: string;
    createdAt: Date;
    name: string;
    description: string | null;
    key: string;
    slug: string;
    sourceType: "local_path" | "github" | "url" | "catalog" | "skills_sh";
    sourceLocator: string | null;
    sourceRef: string | null;
    trustLevel: "markdown_only" | "assets" | "scripts_executables";
    compatibility: "unknown" | "compatible" | "invalid";
    fileInventory: {
        path: string;
        kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
    }[];
    metadata: Record<string, unknown> | null;
    attachedAgentCount: number;
    editable: boolean;
    editableReason: string | null;
    sourceLabel: string | null;
    sourceBadge: "mth" | "github" | "url" | "catalog" | "skills_sh" | "local";
    usedByAgents: {
        id: string;
        name: string;
        urlKey: string;
        adapterType: string;
        desired: boolean;
        actualState: string | null;
    }[];
}, {
    updatedAt: Date;
    markdown: string;
    id: string;
    companyId: string;
    createdAt: Date;
    name: string;
    description: string | null;
    key: string;
    slug: string;
    sourceType: "local_path" | "github" | "url" | "catalog" | "skills_sh";
    sourceLocator: string | null;
    sourceRef: string | null;
    trustLevel: "markdown_only" | "assets" | "scripts_executables";
    compatibility: "unknown" | "compatible" | "invalid";
    metadata: Record<string, unknown> | null;
    attachedAgentCount: number;
    editable: boolean;
    editableReason: string | null;
    sourceLabel: string | null;
    sourceBadge: "mth" | "github" | "url" | "catalog" | "skills_sh" | "local";
    fileInventory?: {
        path: string;
        kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
    }[] | undefined;
    usedByAgents?: {
        id: string;
        name: string;
        urlKey: string;
        adapterType: string;
        desired: boolean;
        actualState: string | null;
    }[] | undefined;
}>;
export declare const companySkillUpdateStatusSchema: z.ZodObject<{
    supported: z.ZodBoolean;
    reason: z.ZodNullable<z.ZodString>;
    trackingRef: z.ZodNullable<z.ZodString>;
    currentRef: z.ZodNullable<z.ZodString>;
    latestRef: z.ZodNullable<z.ZodString>;
    hasUpdate: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    supported: boolean;
    reason: string | null;
    trackingRef: string | null;
    currentRef: string | null;
    latestRef: string | null;
    hasUpdate: boolean;
}, {
    supported: boolean;
    reason: string | null;
    trackingRef: string | null;
    currentRef: string | null;
    latestRef: string | null;
    hasUpdate: boolean;
}>;
export declare const companySkillImportSchema: z.ZodObject<{
    source: z.ZodString;
}, "strip", z.ZodTypeAny, {
    source: string;
}, {
    source: string;
}>;
export declare const companySkillProjectScanRequestSchema: z.ZodObject<{
    projectIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    workspaceIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    projectIds?: string[] | undefined;
    workspaceIds?: string[] | undefined;
}, {
    projectIds?: string[] | undefined;
    workspaceIds?: string[] | undefined;
}>;
export declare const companySkillProjectScanSkippedSchema: z.ZodObject<{
    projectId: z.ZodString;
    projectName: z.ZodString;
    workspaceId: z.ZodNullable<z.ZodString>;
    workspaceName: z.ZodNullable<z.ZodString>;
    path: z.ZodNullable<z.ZodString>;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string | null;
    reason: string;
    projectId: string;
    projectName: string;
    workspaceId: string | null;
    workspaceName: string | null;
}, {
    path: string | null;
    reason: string;
    projectId: string;
    projectName: string;
    workspaceId: string | null;
    workspaceName: string | null;
}>;
export declare const companySkillProjectScanConflictSchema: z.ZodObject<{
    slug: z.ZodString;
    key: z.ZodString;
    projectId: z.ZodString;
    projectName: z.ZodString;
    workspaceId: z.ZodString;
    workspaceName: z.ZodString;
    path: z.ZodString;
    existingSkillId: z.ZodString;
    existingSkillKey: z.ZodString;
    existingSourceLocator: z.ZodNullable<z.ZodString>;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
    key: string;
    slug: string;
    reason: string;
    projectId: string;
    projectName: string;
    workspaceId: string;
    workspaceName: string;
    existingSkillId: string;
    existingSkillKey: string;
    existingSourceLocator: string | null;
}, {
    path: string;
    key: string;
    slug: string;
    reason: string;
    projectId: string;
    projectName: string;
    workspaceId: string;
    workspaceName: string;
    existingSkillId: string;
    existingSkillKey: string;
    existingSourceLocator: string | null;
}>;
export declare const companySkillProjectScanResultSchema: z.ZodObject<{
    scannedProjects: z.ZodNumber;
    scannedWorkspaces: z.ZodNumber;
    discovered: z.ZodNumber;
    imported: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        companyId: z.ZodString;
        key: z.ZodString;
        slug: z.ZodString;
        name: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
        markdown: z.ZodString;
        sourceType: z.ZodEnum<["local_path", "github", "url", "catalog", "skills_sh"]>;
        sourceLocator: z.ZodNullable<z.ZodString>;
        sourceRef: z.ZodNullable<z.ZodString>;
        trustLevel: z.ZodEnum<["markdown_only", "assets", "scripts_executables"]>;
        compatibility: z.ZodEnum<["compatible", "unknown", "invalid"]>;
        fileInventory: z.ZodDefault<z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            kind: z.ZodEnum<["skill", "markdown", "reference", "script", "asset", "other"]>;
        }, "strip", z.ZodTypeAny, {
            path: string;
            kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
        }, {
            path: string;
            kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
        }>, "many">>;
        metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        createdAt: z.ZodDate;
        updatedAt: z.ZodDate;
    }, "strip", z.ZodTypeAny, {
        updatedAt: Date;
        markdown: string;
        id: string;
        companyId: string;
        createdAt: Date;
        name: string;
        description: string | null;
        key: string;
        slug: string;
        sourceType: "local_path" | "github" | "url" | "catalog" | "skills_sh";
        sourceLocator: string | null;
        sourceRef: string | null;
        trustLevel: "markdown_only" | "assets" | "scripts_executables";
        compatibility: "unknown" | "compatible" | "invalid";
        fileInventory: {
            path: string;
            kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
        }[];
        metadata: Record<string, unknown> | null;
    }, {
        updatedAt: Date;
        markdown: string;
        id: string;
        companyId: string;
        createdAt: Date;
        name: string;
        description: string | null;
        key: string;
        slug: string;
        sourceType: "local_path" | "github" | "url" | "catalog" | "skills_sh";
        sourceLocator: string | null;
        sourceRef: string | null;
        trustLevel: "markdown_only" | "assets" | "scripts_executables";
        compatibility: "unknown" | "compatible" | "invalid";
        metadata: Record<string, unknown> | null;
        fileInventory?: {
            path: string;
            kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
        }[] | undefined;
    }>, "many">;
    updated: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        companyId: z.ZodString;
        key: z.ZodString;
        slug: z.ZodString;
        name: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
        markdown: z.ZodString;
        sourceType: z.ZodEnum<["local_path", "github", "url", "catalog", "skills_sh"]>;
        sourceLocator: z.ZodNullable<z.ZodString>;
        sourceRef: z.ZodNullable<z.ZodString>;
        trustLevel: z.ZodEnum<["markdown_only", "assets", "scripts_executables"]>;
        compatibility: z.ZodEnum<["compatible", "unknown", "invalid"]>;
        fileInventory: z.ZodDefault<z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            kind: z.ZodEnum<["skill", "markdown", "reference", "script", "asset", "other"]>;
        }, "strip", z.ZodTypeAny, {
            path: string;
            kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
        }, {
            path: string;
            kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
        }>, "many">>;
        metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        createdAt: z.ZodDate;
        updatedAt: z.ZodDate;
    }, "strip", z.ZodTypeAny, {
        updatedAt: Date;
        markdown: string;
        id: string;
        companyId: string;
        createdAt: Date;
        name: string;
        description: string | null;
        key: string;
        slug: string;
        sourceType: "local_path" | "github" | "url" | "catalog" | "skills_sh";
        sourceLocator: string | null;
        sourceRef: string | null;
        trustLevel: "markdown_only" | "assets" | "scripts_executables";
        compatibility: "unknown" | "compatible" | "invalid";
        fileInventory: {
            path: string;
            kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
        }[];
        metadata: Record<string, unknown> | null;
    }, {
        updatedAt: Date;
        markdown: string;
        id: string;
        companyId: string;
        createdAt: Date;
        name: string;
        description: string | null;
        key: string;
        slug: string;
        sourceType: "local_path" | "github" | "url" | "catalog" | "skills_sh";
        sourceLocator: string | null;
        sourceRef: string | null;
        trustLevel: "markdown_only" | "assets" | "scripts_executables";
        compatibility: "unknown" | "compatible" | "invalid";
        metadata: Record<string, unknown> | null;
        fileInventory?: {
            path: string;
            kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
        }[] | undefined;
    }>, "many">;
    skipped: z.ZodArray<z.ZodObject<{
        projectId: z.ZodString;
        projectName: z.ZodString;
        workspaceId: z.ZodNullable<z.ZodString>;
        workspaceName: z.ZodNullable<z.ZodString>;
        path: z.ZodNullable<z.ZodString>;
        reason: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        path: string | null;
        reason: string;
        projectId: string;
        projectName: string;
        workspaceId: string | null;
        workspaceName: string | null;
    }, {
        path: string | null;
        reason: string;
        projectId: string;
        projectName: string;
        workspaceId: string | null;
        workspaceName: string | null;
    }>, "many">;
    conflicts: z.ZodArray<z.ZodObject<{
        slug: z.ZodString;
        key: z.ZodString;
        projectId: z.ZodString;
        projectName: z.ZodString;
        workspaceId: z.ZodString;
        workspaceName: z.ZodString;
        path: z.ZodString;
        existingSkillId: z.ZodString;
        existingSkillKey: z.ZodString;
        existingSourceLocator: z.ZodNullable<z.ZodString>;
        reason: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        path: string;
        key: string;
        slug: string;
        reason: string;
        projectId: string;
        projectName: string;
        workspaceId: string;
        workspaceName: string;
        existingSkillId: string;
        existingSkillKey: string;
        existingSourceLocator: string | null;
    }, {
        path: string;
        key: string;
        slug: string;
        reason: string;
        projectId: string;
        projectName: string;
        workspaceId: string;
        workspaceName: string;
        existingSkillId: string;
        existingSkillKey: string;
        existingSourceLocator: string | null;
    }>, "many">;
    warnings: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    skipped: {
        path: string | null;
        reason: string;
        projectId: string;
        projectName: string;
        workspaceId: string | null;
        workspaceName: string | null;
    }[];
    updated: {
        updatedAt: Date;
        markdown: string;
        id: string;
        companyId: string;
        createdAt: Date;
        name: string;
        description: string | null;
        key: string;
        slug: string;
        sourceType: "local_path" | "github" | "url" | "catalog" | "skills_sh";
        sourceLocator: string | null;
        sourceRef: string | null;
        trustLevel: "markdown_only" | "assets" | "scripts_executables";
        compatibility: "unknown" | "compatible" | "invalid";
        fileInventory: {
            path: string;
            kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
        }[];
        metadata: Record<string, unknown> | null;
    }[];
    scannedProjects: number;
    scannedWorkspaces: number;
    discovered: number;
    imported: {
        updatedAt: Date;
        markdown: string;
        id: string;
        companyId: string;
        createdAt: Date;
        name: string;
        description: string | null;
        key: string;
        slug: string;
        sourceType: "local_path" | "github" | "url" | "catalog" | "skills_sh";
        sourceLocator: string | null;
        sourceRef: string | null;
        trustLevel: "markdown_only" | "assets" | "scripts_executables";
        compatibility: "unknown" | "compatible" | "invalid";
        fileInventory: {
            path: string;
            kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
        }[];
        metadata: Record<string, unknown> | null;
    }[];
    conflicts: {
        path: string;
        key: string;
        slug: string;
        reason: string;
        projectId: string;
        projectName: string;
        workspaceId: string;
        workspaceName: string;
        existingSkillId: string;
        existingSkillKey: string;
        existingSourceLocator: string | null;
    }[];
    warnings: string[];
}, {
    skipped: {
        path: string | null;
        reason: string;
        projectId: string;
        projectName: string;
        workspaceId: string | null;
        workspaceName: string | null;
    }[];
    updated: {
        updatedAt: Date;
        markdown: string;
        id: string;
        companyId: string;
        createdAt: Date;
        name: string;
        description: string | null;
        key: string;
        slug: string;
        sourceType: "local_path" | "github" | "url" | "catalog" | "skills_sh";
        sourceLocator: string | null;
        sourceRef: string | null;
        trustLevel: "markdown_only" | "assets" | "scripts_executables";
        compatibility: "unknown" | "compatible" | "invalid";
        metadata: Record<string, unknown> | null;
        fileInventory?: {
            path: string;
            kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
        }[] | undefined;
    }[];
    scannedProjects: number;
    scannedWorkspaces: number;
    discovered: number;
    imported: {
        updatedAt: Date;
        markdown: string;
        id: string;
        companyId: string;
        createdAt: Date;
        name: string;
        description: string | null;
        key: string;
        slug: string;
        sourceType: "local_path" | "github" | "url" | "catalog" | "skills_sh";
        sourceLocator: string | null;
        sourceRef: string | null;
        trustLevel: "markdown_only" | "assets" | "scripts_executables";
        compatibility: "unknown" | "compatible" | "invalid";
        metadata: Record<string, unknown> | null;
        fileInventory?: {
            path: string;
            kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
        }[] | undefined;
    }[];
    conflicts: {
        path: string;
        key: string;
        slug: string;
        reason: string;
        projectId: string;
        projectName: string;
        workspaceId: string;
        workspaceName: string;
        existingSkillId: string;
        existingSkillKey: string;
        existingSourceLocator: string | null;
    }[];
    warnings: string[];
}>;
export declare const companySkillCreateSchema: z.ZodObject<{
    name: z.ZodString;
    slug: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    markdown: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    markdown?: string | null | undefined;
    description?: string | null | undefined;
    slug?: string | null | undefined;
}, {
    name: string;
    markdown?: string | null | undefined;
    description?: string | null | undefined;
    slug?: string | null | undefined;
}>;
export declare const companySkillFileDetailSchema: z.ZodObject<{
    skillId: z.ZodString;
    path: z.ZodString;
    kind: z.ZodEnum<["skill", "markdown", "reference", "script", "asset", "other"]>;
    content: z.ZodString;
    language: z.ZodNullable<z.ZodString>;
    markdown: z.ZodBoolean;
    editable: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    path: string;
    markdown: boolean;
    kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
    editable: boolean;
    skillId: string;
    content: string;
    language: string | null;
}, {
    path: string;
    markdown: boolean;
    kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other";
    editable: boolean;
    skillId: string;
    content: string;
    language: string | null;
}>;
export declare const companySkillFileUpdateSchema: z.ZodObject<{
    path: z.ZodString;
    content: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
    content: string;
}, {
    path: string;
    content: string;
}>;
export type CompanySkillImport = z.infer<typeof companySkillImportSchema>;
export type CompanySkillProjectScan = z.infer<typeof companySkillProjectScanRequestSchema>;
export type CompanySkillCreate = z.infer<typeof companySkillCreateSchema>;
export type CompanySkillFileUpdate = z.infer<typeof companySkillFileUpdateSchema>;
//# sourceMappingURL=company-skill.d.ts.map