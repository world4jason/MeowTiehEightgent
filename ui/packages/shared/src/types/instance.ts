export interface InstanceExperimentalSettings {
  enableIsolatedWorkspaces: boolean;
}

export interface InstanceSettings {
  id: string;
  experimental: InstanceExperimentalSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface InstanceGeneralSettings {
  id: string;
  instanceName: string | null;
  hostnames: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PatchInstanceGeneralSettings {
  instanceName?: string | null;
  hostnames?: string[];
}
