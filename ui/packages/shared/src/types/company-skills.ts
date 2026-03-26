export interface CompanySkill {
  id: string;
  companyId: string;
  slug: string;
  name: string;
  source: string | null;
  status: CompanySkillUpdateStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanySkillListItem {
  id: string;
  slug: string;
  name: string;
  source: string | null;
  status: CompanySkillUpdateStatus;
}

export interface CompanySkillDetail extends CompanySkill {
  files: CompanySkillFileDetail[];
}

export interface CompanySkillFileDetail {
  path: string;
  content: string;
}

export interface CompanySkillCreateRequest {
  slug: string;
  name: string;
  source?: string;
}

export type CompanySkillUpdateStatus = "managed" | "local" | "fork";

export interface CompanySkillProjectScanRequest {
  projectId: string;
}

export interface CompanySkillProjectScanResult {
  found: CompanySkillListItem[];
}

export interface CompanySkillImportResult {
  imported: number;
  skipped: number;
}
