export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type IncidentPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  type: string;
  priority: IncidentPriority;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  created_by: string;
}

export interface IncidentComment {
  id: string;
  incident_id: string;
  content: string;
  is_internal: boolean;
  has_attachments: boolean;
  created_at: string;
  created_by: string;
}

export interface IncidentAttachment {
  id: string;
  incident_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  created_at: string;
}

export interface AISuggestion {
  id: string;
  type: string;
  content: string;
  incident_id: string;
  created_at: string;
}
