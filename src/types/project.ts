/**
 * Central type definitions for the Project entity.
 *
 * What this file exports:
 *   - `Project` — the read shape of a project as returned by the Base44 SDK
 *     (`base44.entities.Project.get/list/filter`).
 *   - `ProjectStatus` / `ProjectPriority` — the finite string unions used by
 *     the corresponding fields. Mirrors the values rendered by the modal's
 *     status/priority selects.
 *   - `ProjectWorkflowEntry` — one entry in a project's append-only audit
 *     trail (see CS-2387). Mirrors the entries written by the create/update
 *     mutations on the Projects page.
 *
 * Why it exists:
 *   The Base44 SDK's `EntityHandler<T = any>` defaults every `Project` read
 *   to `any` at call sites, which silently spreads type holes through the
 *   app. Centralizing the shape gives pages, modals, and helpers a single
 *   source of truth.
 *
 * How to keep it accurate:
 *   The Project entity is hosted by Base44 with no local `.jsonc` schema
 *   today. When you add or rename a server-side field, update this file in
 *   the same change. The `[key: string]: unknown` index signature is a
 *   pragmatic tail for fields the Base44 record may carry that we haven't
 *   modeled yet.
 */

import type { ProjectType } from '@/types/enums';

export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
export type ProjectPriority = 'low' | 'medium' | 'high' | 'critical';

export type ProjectWorkflowEntry = {
  action: string;
  by_email?: string | null;
  by_name?: string | null;
  timestamp: string;
  note?: string;
  [key: string]: unknown;
};

export type Project = {
  // Base44 entity metadata
  id?: string;
  created_date?: string;
  updated_date?: string;

  // Core
  name?: string;
  project_type?: ProjectType;
  description?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;

  // Relations
  company_id?: string;
  team_members?: string[];

  // Numbers (form may carry `''` while the field is empty in the input)
  budget?: number | '';
  budget_spent?: number;
  progress?: number;

  // Dates (ISO date strings)
  start_date?: string;
  end_date?: string;

  // Type-specific data; shape varies by `project_type`.
  project_type_data?: Record<string, unknown>;

  // Authorship + audit (added in CS-2387)
  created_by?: string | null;
  created_by_name?: string | null;
  workflow_history?: ProjectWorkflowEntry[];

  // Loose tail for unmodeled Base44 fields.
  [key: string]: unknown;
};
