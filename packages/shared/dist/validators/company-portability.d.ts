import { z } from "zod";
export declare const portabilityIncludeSchema: z.ZodObject<{
    company: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
    agents: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
    projects: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
    issues: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
    skills: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    company?: boolean | undefined;
    agents?: boolean | undefined;
    projects?: boolean | undefined;
    issues?: boolean | undefined;
    skills?: boolean | undefined;
}, {
    company?: boolean | undefined;
    agents?: boolean | undefined;
    projects?: boolean | undefined;
    issues?: boolean | undefined;
    skills?: boolean | undefined;
}>;
export declare const portabilityEnvInputSchema: z.ZodObject<{
    key: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    agentSlug: z.ZodNullable<z.ZodString>;
    kind: z.ZodEnum<["secret", "plain"]>;
    requirement: z.ZodEnum<["required", "optional"]>;
    defaultValue: z.ZodNullable<z.ZodString>;
    portability: z.ZodEnum<["portable", "system_dependent"]>;
}, "strip", z.ZodTypeAny, {
    kind: "plain" | "secret";
    description: string | null;
    key: string;
    agentSlug: string | null;
    requirement: "required" | "optional";
    defaultValue: string | null;
    portability: "portable" | "system_dependent";
}, {
    kind: "plain" | "secret";
    description: string | null;
    key: string;
    agentSlug: string | null;
    requirement: "required" | "optional";
    defaultValue: string | null;
    portability: "portable" | "system_dependent";
}>;
export declare const portabilityFileEntrySchema: z.ZodUnion<[z.ZodString, z.ZodObject<{
    encoding: z.ZodLiteral<"base64">;
    data: z.ZodString;
    contentType: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    encoding: "base64";
    data: string;
    contentType?: string | null | undefined;
}, {
    encoding: "base64";
    data: string;
    contentType?: string | null | undefined;
}>]>;
export declare const portabilityCompanyManifestEntrySchema: z.ZodObject<{
    path: z.ZodString;
    name: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    brandColor: z.ZodNullable<z.ZodString>;
    logoPath: z.ZodNullable<z.ZodString>;
    requireBoardApprovalForNewAgents: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    path: string;
    name: string;
    description: string | null;
    requireBoardApprovalForNewAgents: boolean;
    brandColor: string | null;
    logoPath: string | null;
}, {
    path: string;
    name: string;
    description: string | null;
    requireBoardApprovalForNewAgents: boolean;
    brandColor: string | null;
    logoPath: string | null;
}>;
export declare const portabilityAgentManifestEntrySchema: z.ZodObject<{
    slug: z.ZodString;
    name: z.ZodString;
    path: z.ZodString;
    skills: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    role: z.ZodString;
    title: z.ZodNullable<z.ZodString>;
    icon: z.ZodNullable<z.ZodString>;
    capabilities: z.ZodNullable<z.ZodString>;
    reportsToSlug: z.ZodNullable<z.ZodString>;
    adapterType: z.ZodString;
    adapterConfig: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    runtimeConfig: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    permissions: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    budgetMonthlyCents: z.ZodNumber;
    metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    path: string;
    name: string;
    budgetMonthlyCents: number;
    slug: string;
    metadata: Record<string, unknown> | null;
    adapterType: string;
    skills: string[];
    role: string;
    title: string | null;
    icon: string | null;
    capabilities: string | null;
    reportsToSlug: string | null;
    adapterConfig: Record<string, unknown>;
    runtimeConfig: Record<string, unknown>;
    permissions: Record<string, unknown>;
}, {
    path: string;
    name: string;
    budgetMonthlyCents: number;
    slug: string;
    metadata: Record<string, unknown> | null;
    adapterType: string;
    role: string;
    title: string | null;
    icon: string | null;
    capabilities: string | null;
    reportsToSlug: string | null;
    adapterConfig: Record<string, unknown>;
    runtimeConfig: Record<string, unknown>;
    permissions: Record<string, unknown>;
    skills?: string[] | undefined;
}>;
export declare const portabilitySkillManifestEntrySchema: z.ZodObject<{
    key: z.ZodString;
    slug: z.ZodString;
    name: z.ZodString;
    path: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    sourceType: z.ZodString;
    sourceLocator: z.ZodNullable<z.ZodString>;
    sourceRef: z.ZodNullable<z.ZodString>;
    trustLevel: z.ZodNullable<z.ZodString>;
    compatibility: z.ZodNullable<z.ZodString>;
    metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    fileInventory: z.ZodDefault<z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        kind: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        path: string;
        kind: string;
    }, {
        path: string;
        kind: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    path: string;
    name: string;
    description: string | null;
    key: string;
    slug: string;
    sourceType: string;
    sourceLocator: string | null;
    sourceRef: string | null;
    trustLevel: string | null;
    compatibility: string | null;
    fileInventory: {
        path: string;
        kind: string;
    }[];
    metadata: Record<string, unknown> | null;
}, {
    path: string;
    name: string;
    description: string | null;
    key: string;
    slug: string;
    sourceType: string;
    sourceLocator: string | null;
    sourceRef: string | null;
    trustLevel: string | null;
    compatibility: string | null;
    metadata: Record<string, unknown> | null;
    fileInventory?: {
        path: string;
        kind: string;
    }[] | undefined;
}>;
export declare const portabilityProjectManifestEntrySchema: z.ZodObject<{
    slug: z.ZodString;
    name: z.ZodString;
    path: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    ownerAgentSlug: z.ZodNullable<z.ZodString>;
    leadAgentSlug: z.ZodNullable<z.ZodString>;
    targetDate: z.ZodNullable<z.ZodString>;
    color: z.ZodNullable<z.ZodString>;
    status: z.ZodNullable<z.ZodString>;
    executionWorkspacePolicy: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    status: string | null;
    path: string;
    name: string;
    description: string | null;
    slug: string;
    metadata: Record<string, unknown> | null;
    ownerAgentSlug: string | null;
    leadAgentSlug: string | null;
    targetDate: string | null;
    color: string | null;
    executionWorkspacePolicy: Record<string, unknown> | null;
}, {
    status: string | null;
    path: string;
    name: string;
    description: string | null;
    slug: string;
    metadata: Record<string, unknown> | null;
    ownerAgentSlug: string | null;
    leadAgentSlug: string | null;
    targetDate: string | null;
    color: string | null;
    executionWorkspacePolicy: Record<string, unknown> | null;
}>;
export declare const portabilityIssueManifestEntrySchema: z.ZodObject<{
    slug: z.ZodString;
    identifier: z.ZodNullable<z.ZodString>;
    title: z.ZodString;
    path: z.ZodString;
    projectSlug: z.ZodNullable<z.ZodString>;
    assigneeAgentSlug: z.ZodNullable<z.ZodString>;
    description: z.ZodNullable<z.ZodString>;
    recurrence: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    status: z.ZodNullable<z.ZodString>;
    priority: z.ZodNullable<z.ZodString>;
    labelIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    billingCode: z.ZodNullable<z.ZodString>;
    executionWorkspaceSettings: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    assigneeAdapterOverrides: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    status: string | null;
    path: string;
    description: string | null;
    slug: string;
    metadata: Record<string, unknown> | null;
    title: string;
    identifier: string | null;
    projectSlug: string | null;
    assigneeAgentSlug: string | null;
    recurrence: Record<string, unknown> | null;
    priority: string | null;
    labelIds: string[];
    billingCode: string | null;
    executionWorkspaceSettings: Record<string, unknown> | null;
    assigneeAdapterOverrides: Record<string, unknown> | null;
}, {
    status: string | null;
    path: string;
    description: string | null;
    slug: string;
    metadata: Record<string, unknown> | null;
    title: string;
    identifier: string | null;
    projectSlug: string | null;
    assigneeAgentSlug: string | null;
    recurrence: Record<string, unknown> | null;
    priority: string | null;
    billingCode: string | null;
    executionWorkspaceSettings: Record<string, unknown> | null;
    assigneeAdapterOverrides: Record<string, unknown> | null;
    labelIds?: string[] | undefined;
}>;
export declare const portabilityManifestSchema: z.ZodObject<{
    schemaVersion: z.ZodNumber;
    generatedAt: z.ZodString;
    source: z.ZodNullable<z.ZodObject<{
        companyId: z.ZodString;
        companyName: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        companyId: string;
        companyName: string;
    }, {
        companyId: string;
        companyName: string;
    }>>;
    includes: z.ZodObject<{
        company: z.ZodBoolean;
        agents: z.ZodBoolean;
        projects: z.ZodBoolean;
        issues: z.ZodBoolean;
        skills: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        company: boolean;
        agents: boolean;
        projects: boolean;
        issues: boolean;
        skills: boolean;
    }, {
        company: boolean;
        agents: boolean;
        projects: boolean;
        issues: boolean;
        skills: boolean;
    }>;
    company: z.ZodNullable<z.ZodObject<{
        path: z.ZodString;
        name: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
        brandColor: z.ZodNullable<z.ZodString>;
        logoPath: z.ZodNullable<z.ZodString>;
        requireBoardApprovalForNewAgents: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        path: string;
        name: string;
        description: string | null;
        requireBoardApprovalForNewAgents: boolean;
        brandColor: string | null;
        logoPath: string | null;
    }, {
        path: string;
        name: string;
        description: string | null;
        requireBoardApprovalForNewAgents: boolean;
        brandColor: string | null;
        logoPath: string | null;
    }>>;
    agents: z.ZodArray<z.ZodObject<{
        slug: z.ZodString;
        name: z.ZodString;
        path: z.ZodString;
        skills: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        role: z.ZodString;
        title: z.ZodNullable<z.ZodString>;
        icon: z.ZodNullable<z.ZodString>;
        capabilities: z.ZodNullable<z.ZodString>;
        reportsToSlug: z.ZodNullable<z.ZodString>;
        adapterType: z.ZodString;
        adapterConfig: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        runtimeConfig: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        permissions: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        budgetMonthlyCents: z.ZodNumber;
        metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        path: string;
        name: string;
        budgetMonthlyCents: number;
        slug: string;
        metadata: Record<string, unknown> | null;
        adapterType: string;
        skills: string[];
        role: string;
        title: string | null;
        icon: string | null;
        capabilities: string | null;
        reportsToSlug: string | null;
        adapterConfig: Record<string, unknown>;
        runtimeConfig: Record<string, unknown>;
        permissions: Record<string, unknown>;
    }, {
        path: string;
        name: string;
        budgetMonthlyCents: number;
        slug: string;
        metadata: Record<string, unknown> | null;
        adapterType: string;
        role: string;
        title: string | null;
        icon: string | null;
        capabilities: string | null;
        reportsToSlug: string | null;
        adapterConfig: Record<string, unknown>;
        runtimeConfig: Record<string, unknown>;
        permissions: Record<string, unknown>;
        skills?: string[] | undefined;
    }>, "many">;
    skills: z.ZodDefault<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        slug: z.ZodString;
        name: z.ZodString;
        path: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
        sourceType: z.ZodString;
        sourceLocator: z.ZodNullable<z.ZodString>;
        sourceRef: z.ZodNullable<z.ZodString>;
        trustLevel: z.ZodNullable<z.ZodString>;
        compatibility: z.ZodNullable<z.ZodString>;
        metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        fileInventory: z.ZodDefault<z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            kind: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            path: string;
            kind: string;
        }, {
            path: string;
            kind: string;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        path: string;
        name: string;
        description: string | null;
        key: string;
        slug: string;
        sourceType: string;
        sourceLocator: string | null;
        sourceRef: string | null;
        trustLevel: string | null;
        compatibility: string | null;
        fileInventory: {
            path: string;
            kind: string;
        }[];
        metadata: Record<string, unknown> | null;
    }, {
        path: string;
        name: string;
        description: string | null;
        key: string;
        slug: string;
        sourceType: string;
        sourceLocator: string | null;
        sourceRef: string | null;
        trustLevel: string | null;
        compatibility: string | null;
        metadata: Record<string, unknown> | null;
        fileInventory?: {
            path: string;
            kind: string;
        }[] | undefined;
    }>, "many">>;
    projects: z.ZodDefault<z.ZodArray<z.ZodObject<{
        slug: z.ZodString;
        name: z.ZodString;
        path: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
        ownerAgentSlug: z.ZodNullable<z.ZodString>;
        leadAgentSlug: z.ZodNullable<z.ZodString>;
        targetDate: z.ZodNullable<z.ZodString>;
        color: z.ZodNullable<z.ZodString>;
        status: z.ZodNullable<z.ZodString>;
        executionWorkspacePolicy: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        status: string | null;
        path: string;
        name: string;
        description: string | null;
        slug: string;
        metadata: Record<string, unknown> | null;
        ownerAgentSlug: string | null;
        leadAgentSlug: string | null;
        targetDate: string | null;
        color: string | null;
        executionWorkspacePolicy: Record<string, unknown> | null;
    }, {
        status: string | null;
        path: string;
        name: string;
        description: string | null;
        slug: string;
        metadata: Record<string, unknown> | null;
        ownerAgentSlug: string | null;
        leadAgentSlug: string | null;
        targetDate: string | null;
        color: string | null;
        executionWorkspacePolicy: Record<string, unknown> | null;
    }>, "many">>;
    issues: z.ZodDefault<z.ZodArray<z.ZodObject<{
        slug: z.ZodString;
        identifier: z.ZodNullable<z.ZodString>;
        title: z.ZodString;
        path: z.ZodString;
        projectSlug: z.ZodNullable<z.ZodString>;
        assigneeAgentSlug: z.ZodNullable<z.ZodString>;
        description: z.ZodNullable<z.ZodString>;
        recurrence: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        status: z.ZodNullable<z.ZodString>;
        priority: z.ZodNullable<z.ZodString>;
        labelIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        billingCode: z.ZodNullable<z.ZodString>;
        executionWorkspaceSettings: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        assigneeAdapterOverrides: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        status: string | null;
        path: string;
        description: string | null;
        slug: string;
        metadata: Record<string, unknown> | null;
        title: string;
        identifier: string | null;
        projectSlug: string | null;
        assigneeAgentSlug: string | null;
        recurrence: Record<string, unknown> | null;
        priority: string | null;
        labelIds: string[];
        billingCode: string | null;
        executionWorkspaceSettings: Record<string, unknown> | null;
        assigneeAdapterOverrides: Record<string, unknown> | null;
    }, {
        status: string | null;
        path: string;
        description: string | null;
        slug: string;
        metadata: Record<string, unknown> | null;
        title: string;
        identifier: string | null;
        projectSlug: string | null;
        assigneeAgentSlug: string | null;
        recurrence: Record<string, unknown> | null;
        priority: string | null;
        billingCode: string | null;
        executionWorkspaceSettings: Record<string, unknown> | null;
        assigneeAdapterOverrides: Record<string, unknown> | null;
        labelIds?: string[] | undefined;
    }>, "many">>;
    envInputs: z.ZodDefault<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
        agentSlug: z.ZodNullable<z.ZodString>;
        kind: z.ZodEnum<["secret", "plain"]>;
        requirement: z.ZodEnum<["required", "optional"]>;
        defaultValue: z.ZodNullable<z.ZodString>;
        portability: z.ZodEnum<["portable", "system_dependent"]>;
    }, "strip", z.ZodTypeAny, {
        kind: "plain" | "secret";
        description: string | null;
        key: string;
        agentSlug: string | null;
        requirement: "required" | "optional";
        defaultValue: string | null;
        portability: "portable" | "system_dependent";
    }, {
        kind: "plain" | "secret";
        description: string | null;
        key: string;
        agentSlug: string | null;
        requirement: "required" | "optional";
        defaultValue: string | null;
        portability: "portable" | "system_dependent";
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    company: {
        path: string;
        name: string;
        description: string | null;
        requireBoardApprovalForNewAgents: boolean;
        brandColor: string | null;
        logoPath: string | null;
    } | null;
    agents: {
        path: string;
        name: string;
        budgetMonthlyCents: number;
        slug: string;
        metadata: Record<string, unknown> | null;
        adapterType: string;
        skills: string[];
        role: string;
        title: string | null;
        icon: string | null;
        capabilities: string | null;
        reportsToSlug: string | null;
        adapterConfig: Record<string, unknown>;
        runtimeConfig: Record<string, unknown>;
        permissions: Record<string, unknown>;
    }[];
    projects: {
        status: string | null;
        path: string;
        name: string;
        description: string | null;
        slug: string;
        metadata: Record<string, unknown> | null;
        ownerAgentSlug: string | null;
        leadAgentSlug: string | null;
        targetDate: string | null;
        color: string | null;
        executionWorkspacePolicy: Record<string, unknown> | null;
    }[];
    issues: {
        status: string | null;
        path: string;
        description: string | null;
        slug: string;
        metadata: Record<string, unknown> | null;
        title: string;
        identifier: string | null;
        projectSlug: string | null;
        assigneeAgentSlug: string | null;
        recurrence: Record<string, unknown> | null;
        priority: string | null;
        labelIds: string[];
        billingCode: string | null;
        executionWorkspaceSettings: Record<string, unknown> | null;
        assigneeAdapterOverrides: Record<string, unknown> | null;
    }[];
    includes: {
        company: boolean;
        agents: boolean;
        projects: boolean;
        issues: boolean;
        skills: boolean;
    };
    source: {
        companyId: string;
        companyName: string;
    } | null;
    skills: {
        path: string;
        name: string;
        description: string | null;
        key: string;
        slug: string;
        sourceType: string;
        sourceLocator: string | null;
        sourceRef: string | null;
        trustLevel: string | null;
        compatibility: string | null;
        fileInventory: {
            path: string;
            kind: string;
        }[];
        metadata: Record<string, unknown> | null;
    }[];
    schemaVersion: number;
    generatedAt: string;
    envInputs: {
        kind: "plain" | "secret";
        description: string | null;
        key: string;
        agentSlug: string | null;
        requirement: "required" | "optional";
        defaultValue: string | null;
        portability: "portable" | "system_dependent";
    }[];
}, {
    company: {
        path: string;
        name: string;
        description: string | null;
        requireBoardApprovalForNewAgents: boolean;
        brandColor: string | null;
        logoPath: string | null;
    } | null;
    agents: {
        path: string;
        name: string;
        budgetMonthlyCents: number;
        slug: string;
        metadata: Record<string, unknown> | null;
        adapterType: string;
        role: string;
        title: string | null;
        icon: string | null;
        capabilities: string | null;
        reportsToSlug: string | null;
        adapterConfig: Record<string, unknown>;
        runtimeConfig: Record<string, unknown>;
        permissions: Record<string, unknown>;
        skills?: string[] | undefined;
    }[];
    includes: {
        company: boolean;
        agents: boolean;
        projects: boolean;
        issues: boolean;
        skills: boolean;
    };
    source: {
        companyId: string;
        companyName: string;
    } | null;
    schemaVersion: number;
    generatedAt: string;
    projects?: {
        status: string | null;
        path: string;
        name: string;
        description: string | null;
        slug: string;
        metadata: Record<string, unknown> | null;
        ownerAgentSlug: string | null;
        leadAgentSlug: string | null;
        targetDate: string | null;
        color: string | null;
        executionWorkspacePolicy: Record<string, unknown> | null;
    }[] | undefined;
    issues?: {
        status: string | null;
        path: string;
        description: string | null;
        slug: string;
        metadata: Record<string, unknown> | null;
        title: string;
        identifier: string | null;
        projectSlug: string | null;
        assigneeAgentSlug: string | null;
        recurrence: Record<string, unknown> | null;
        priority: string | null;
        billingCode: string | null;
        executionWorkspaceSettings: Record<string, unknown> | null;
        assigneeAdapterOverrides: Record<string, unknown> | null;
        labelIds?: string[] | undefined;
    }[] | undefined;
    skills?: {
        path: string;
        name: string;
        description: string | null;
        key: string;
        slug: string;
        sourceType: string;
        sourceLocator: string | null;
        sourceRef: string | null;
        trustLevel: string | null;
        compatibility: string | null;
        metadata: Record<string, unknown> | null;
        fileInventory?: {
            path: string;
            kind: string;
        }[] | undefined;
    }[] | undefined;
    envInputs?: {
        kind: "plain" | "secret";
        description: string | null;
        key: string;
        agentSlug: string | null;
        requirement: "required" | "optional";
        defaultValue: string | null;
        portability: "portable" | "system_dependent";
    }[] | undefined;
}>;
export declare const portabilitySourceSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"inline">;
    rootPath: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    files: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodObject<{
        encoding: z.ZodLiteral<"base64">;
        data: z.ZodString;
        contentType: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        encoding: "base64";
        data: string;
        contentType?: string | null | undefined;
    }, {
        encoding: "base64";
        data: string;
        contentType?: string | null | undefined;
    }>]>>;
}, "strip", z.ZodTypeAny, {
    type: "inline";
    files: Record<string, string | {
        encoding: "base64";
        data: string;
        contentType?: string | null | undefined;
    }>;
    rootPath?: string | null | undefined;
}, {
    type: "inline";
    files: Record<string, string | {
        encoding: "base64";
        data: string;
        contentType?: string | null | undefined;
    }>;
    rootPath?: string | null | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"github">;
    url: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "github";
    url: string;
}, {
    type: "github";
    url: string;
}>]>;
export declare const portabilityTargetSchema: z.ZodDiscriminatedUnion<"mode", [z.ZodObject<{
    mode: z.ZodLiteral<"new_company">;
    newCompanyName: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    mode: "new_company";
    newCompanyName?: string | null | undefined;
}, {
    mode: "new_company";
    newCompanyName?: string | null | undefined;
}>, z.ZodObject<{
    mode: z.ZodLiteral<"existing_company">;
    companyId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    mode: "existing_company";
    companyId: string;
}, {
    mode: "existing_company";
    companyId: string;
}>]>;
export declare const portabilityAgentSelectionSchema: z.ZodUnion<[z.ZodLiteral<"all">, z.ZodArray<z.ZodString, "many">]>;
export declare const portabilityCollisionStrategySchema: z.ZodEnum<["rename", "skip", "replace"]>;
export declare const companyPortabilityExportSchema: z.ZodObject<{
    include: z.ZodOptional<z.ZodObject<{
        company: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        agents: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        projects: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        issues: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        skills: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
    }, "strip", z.ZodTypeAny, {
        company?: boolean | undefined;
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        skills?: boolean | undefined;
    }, {
        company?: boolean | undefined;
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        skills?: boolean | undefined;
    }>>;
    agents: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    projects: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    issues: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    projectIssues: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    selectedFiles: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    expandReferencedSkills: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    agents?: string[] | undefined;
    projects?: string[] | undefined;
    issues?: string[] | undefined;
    skills?: string[] | undefined;
    include?: {
        company?: boolean | undefined;
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        skills?: boolean | undefined;
    } | undefined;
    projectIssues?: string[] | undefined;
    selectedFiles?: string[] | undefined;
    expandReferencedSkills?: boolean | undefined;
}, {
    agents?: string[] | undefined;
    projects?: string[] | undefined;
    issues?: string[] | undefined;
    skills?: string[] | undefined;
    include?: {
        company?: boolean | undefined;
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        skills?: boolean | undefined;
    } | undefined;
    projectIssues?: string[] | undefined;
    selectedFiles?: string[] | undefined;
    expandReferencedSkills?: boolean | undefined;
}>;
export type CompanyPortabilityExport = z.infer<typeof companyPortabilityExportSchema>;
export declare const companyPortabilityPreviewSchema: z.ZodObject<{
    source: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"inline">;
        rootPath: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        files: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodObject<{
            encoding: z.ZodLiteral<"base64">;
            data: z.ZodString;
            contentType: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            encoding: "base64";
            data: string;
            contentType?: string | null | undefined;
        }, {
            encoding: "base64";
            data: string;
            contentType?: string | null | undefined;
        }>]>>;
    }, "strip", z.ZodTypeAny, {
        type: "inline";
        files: Record<string, string | {
            encoding: "base64";
            data: string;
            contentType?: string | null | undefined;
        }>;
        rootPath?: string | null | undefined;
    }, {
        type: "inline";
        files: Record<string, string | {
            encoding: "base64";
            data: string;
            contentType?: string | null | undefined;
        }>;
        rootPath?: string | null | undefined;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"github">;
        url: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "github";
        url: string;
    }, {
        type: "github";
        url: string;
    }>]>;
    include: z.ZodOptional<z.ZodObject<{
        company: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        agents: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        projects: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        issues: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        skills: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
    }, "strip", z.ZodTypeAny, {
        company?: boolean | undefined;
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        skills?: boolean | undefined;
    }, {
        company?: boolean | undefined;
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        skills?: boolean | undefined;
    }>>;
    target: z.ZodDiscriminatedUnion<"mode", [z.ZodObject<{
        mode: z.ZodLiteral<"new_company">;
        newCompanyName: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        mode: "new_company";
        newCompanyName?: string | null | undefined;
    }, {
        mode: "new_company";
        newCompanyName?: string | null | undefined;
    }>, z.ZodObject<{
        mode: z.ZodLiteral<"existing_company">;
        companyId: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        mode: "existing_company";
        companyId: string;
    }, {
        mode: "existing_company";
        companyId: string;
    }>]>;
    agents: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<"all">, z.ZodArray<z.ZodString, "many">]>>;
    collisionStrategy: z.ZodOptional<z.ZodEnum<["rename", "skip", "replace"]>>;
    nameOverrides: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    selectedFiles: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    target: {
        mode: "new_company";
        newCompanyName?: string | null | undefined;
    } | {
        mode: "existing_company";
        companyId: string;
    };
    source: {
        type: "inline";
        files: Record<string, string | {
            encoding: "base64";
            data: string;
            contentType?: string | null | undefined;
        }>;
        rootPath?: string | null | undefined;
    } | {
        type: "github";
        url: string;
    };
    agents?: string[] | "all" | undefined;
    include?: {
        company?: boolean | undefined;
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        skills?: boolean | undefined;
    } | undefined;
    selectedFiles?: string[] | undefined;
    collisionStrategy?: "rename" | "skip" | "replace" | undefined;
    nameOverrides?: Record<string, string> | undefined;
}, {
    target: {
        mode: "new_company";
        newCompanyName?: string | null | undefined;
    } | {
        mode: "existing_company";
        companyId: string;
    };
    source: {
        type: "inline";
        files: Record<string, string | {
            encoding: "base64";
            data: string;
            contentType?: string | null | undefined;
        }>;
        rootPath?: string | null | undefined;
    } | {
        type: "github";
        url: string;
    };
    agents?: string[] | "all" | undefined;
    include?: {
        company?: boolean | undefined;
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        skills?: boolean | undefined;
    } | undefined;
    selectedFiles?: string[] | undefined;
    collisionStrategy?: "rename" | "skip" | "replace" | undefined;
    nameOverrides?: Record<string, string> | undefined;
}>;
export type CompanyPortabilityPreview = z.infer<typeof companyPortabilityPreviewSchema>;
export declare const portabilityAdapterOverrideSchema: z.ZodObject<{
    adapterType: z.ZodString;
    adapterConfig: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    adapterType: string;
    adapterConfig?: Record<string, unknown> | undefined;
}, {
    adapterType: string;
    adapterConfig?: Record<string, unknown> | undefined;
}>;
export declare const companyPortabilityImportSchema: z.ZodObject<{
    source: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"inline">;
        rootPath: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        files: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodObject<{
            encoding: z.ZodLiteral<"base64">;
            data: z.ZodString;
            contentType: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            encoding: "base64";
            data: string;
            contentType?: string | null | undefined;
        }, {
            encoding: "base64";
            data: string;
            contentType?: string | null | undefined;
        }>]>>;
    }, "strip", z.ZodTypeAny, {
        type: "inline";
        files: Record<string, string | {
            encoding: "base64";
            data: string;
            contentType?: string | null | undefined;
        }>;
        rootPath?: string | null | undefined;
    }, {
        type: "inline";
        files: Record<string, string | {
            encoding: "base64";
            data: string;
            contentType?: string | null | undefined;
        }>;
        rootPath?: string | null | undefined;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"github">;
        url: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "github";
        url: string;
    }, {
        type: "github";
        url: string;
    }>]>;
    include: z.ZodOptional<z.ZodObject<{
        company: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        agents: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        projects: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        issues: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        skills: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
    }, "strip", z.ZodTypeAny, {
        company?: boolean | undefined;
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        skills?: boolean | undefined;
    }, {
        company?: boolean | undefined;
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        skills?: boolean | undefined;
    }>>;
    target: z.ZodDiscriminatedUnion<"mode", [z.ZodObject<{
        mode: z.ZodLiteral<"new_company">;
        newCompanyName: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        mode: "new_company";
        newCompanyName?: string | null | undefined;
    }, {
        mode: "new_company";
        newCompanyName?: string | null | undefined;
    }>, z.ZodObject<{
        mode: z.ZodLiteral<"existing_company">;
        companyId: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        mode: "existing_company";
        companyId: string;
    }, {
        mode: "existing_company";
        companyId: string;
    }>]>;
    agents: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<"all">, z.ZodArray<z.ZodString, "many">]>>;
    collisionStrategy: z.ZodOptional<z.ZodEnum<["rename", "skip", "replace"]>>;
    nameOverrides: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    selectedFiles: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
} & {
    adapterOverrides: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        adapterType: z.ZodString;
        adapterConfig: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        adapterType: string;
        adapterConfig?: Record<string, unknown> | undefined;
    }, {
        adapterType: string;
        adapterConfig?: Record<string, unknown> | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    target: {
        mode: "new_company";
        newCompanyName?: string | null | undefined;
    } | {
        mode: "existing_company";
        companyId: string;
    };
    source: {
        type: "inline";
        files: Record<string, string | {
            encoding: "base64";
            data: string;
            contentType?: string | null | undefined;
        }>;
        rootPath?: string | null | undefined;
    } | {
        type: "github";
        url: string;
    };
    agents?: string[] | "all" | undefined;
    include?: {
        company?: boolean | undefined;
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        skills?: boolean | undefined;
    } | undefined;
    selectedFiles?: string[] | undefined;
    collisionStrategy?: "rename" | "skip" | "replace" | undefined;
    nameOverrides?: Record<string, string> | undefined;
    adapterOverrides?: Record<string, {
        adapterType: string;
        adapterConfig?: Record<string, unknown> | undefined;
    }> | undefined;
}, {
    target: {
        mode: "new_company";
        newCompanyName?: string | null | undefined;
    } | {
        mode: "existing_company";
        companyId: string;
    };
    source: {
        type: "inline";
        files: Record<string, string | {
            encoding: "base64";
            data: string;
            contentType?: string | null | undefined;
        }>;
        rootPath?: string | null | undefined;
    } | {
        type: "github";
        url: string;
    };
    agents?: string[] | "all" | undefined;
    include?: {
        company?: boolean | undefined;
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        skills?: boolean | undefined;
    } | undefined;
    selectedFiles?: string[] | undefined;
    collisionStrategy?: "rename" | "skip" | "replace" | undefined;
    nameOverrides?: Record<string, string> | undefined;
    adapterOverrides?: Record<string, {
        adapterType: string;
        adapterConfig?: Record<string, unknown> | undefined;
    }> | undefined;
}>;
export type CompanyPortabilityImport = z.infer<typeof companyPortabilityImportSchema>;
//# sourceMappingURL=company-portability.d.ts.map