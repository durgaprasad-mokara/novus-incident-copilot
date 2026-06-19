import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  AlertTriangle,
  MessageSquare,
  Paperclip,
  UserCheck,
  ArrowUpCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Incident, IncidentStatus, IncidentSeverity, IncidentComment } from '../types/incident';
import AICopilot from './AICopilot';

export default function IncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [comments, setComments] = useState<IncidentComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Comment form state
  const [commentText, setCommentText] = useState('');
  const [isInternalComment, setIsInternalComment] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  // Assignment state
  const [assigneeInput, setAssigneeInput] = useState('');

  useEffect(() => {
    if (id) {
      loadIncident();
      loadComments();
    }
  }, [id]);

  async function loadIncident() {
    const { data, error: fetchError } = await supabase
      .from('incidents')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setIncident(data);
      setAssigneeInput(data.assigned_to || '');
    }
    setLoading(false);
  }

  async function loadComments() {
    const { data } = await supabase
      .from('incident_comments')
      .select('*')
      .eq('incident_id', id)
      .order('created_at', { ascending: true });

    if (data) setComments(data);
  }

  async function handleStatusChange(newStatus: IncidentStatus) {
    if (!incident) return;
    const previousStatus = incident.status;
    if (previousStatus === newStatus) return;

    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
    if (newStatus === 'resolved') {
      updatePayload.resolved_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from('incidents')
      .update(updatePayload)
      .eq('id', incident.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    const previousUpdatedAt = new Date(incident.updated_at).getTime();
    const timeInPreviousStatus = Math.round((Date.now() - previousUpdatedAt) / 1000);

    // Pendo Track Event: incident_status_changed
    if (typeof pendo !== 'undefined') {
      pendo.track('incident_status_changed', {
        incident_id: incident.id,
        previous_status: previousStatus,
        new_status: newStatus,
        incident_severity: incident.severity,
        time_in_previous_status_seconds: timeInPreviousStatus,
      });
    }

    // Pendo Track Event: incident_resolved (fires when status transitions to resolved)
    if (newStatus === 'resolved' && typeof pendo !== 'undefined') {
      const createdAt = new Date(incident.created_at).getTime();
      const timeToResolution = Math.round((Date.now() - createdAt) / 1000);

      pendo.track('incident_resolved', {
        incident_id: incident.id,
        incident_severity: incident.severity,
        resolution_type: 'manual',
        time_to_resolution_seconds: timeToResolution,
        was_ai_assisted: false,
      });
    }

    setIncident({ ...incident, status: newStatus, updated_at: new Date().toISOString() });
  }

  async function handleAssign() {
    if (!incident || !assigneeInput) return;
    const isReassignment = !!incident.assigned_to;

    const { error: updateError } = await supabase
      .from('incidents')
      .update({
        assigned_to: assigneeInput,
        updated_at: new Date().toISOString(),
      })
      .eq('id', incident.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    // Pendo Track Event: incident_assigned
    if (typeof pendo !== 'undefined') {
      pendo.track('incident_assigned', {
        incident_id: incident.id,
        incident_severity: incident.severity,
        is_reassignment: isReassignment,
        assignee_role: 'team_member',
      });
    }

    setIncident({ ...incident, assigned_to: assigneeInput, updated_at: new Date().toISOString() });
  }

  async function handleEscalate(newSeverity: IncidentSeverity) {
    if (!incident) return;
    const previousSeverity = incident.severity;

    const { error: updateError } = await supabase
      .from('incidents')
      .update({
        severity: newSeverity,
        updated_at: new Date().toISOString(),
      })
      .eq('id', incident.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    const createdAt = new Date(incident.created_at).getTime();
    const timeSinceCreation = Math.round((Date.now() - createdAt) / 1000);

    // Pendo Track Event: incident_escalated
    if (typeof pendo !== 'undefined') {
      pendo.track('incident_escalated', {
        incident_id: incident.id,
        previous_severity: previousSeverity,
        new_severity: newSeverity,
        escalation_reason: 'manual_escalation',
        time_since_creation_seconds: timeSinceCreation,
      });
    }

    setIncident({ ...incident, severity: newSeverity, updated_at: new Date().toISOString() });
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!incident || !commentText.trim()) return;
    setSubmittingComment(true);

    const { error: insertError } = await supabase.from('incident_comments').insert({
      incident_id: incident.id,
      content: commentText,
      is_internal: isInternalComment,
      has_attachments: false,
    });

    if (insertError) {
      setError(insertError.message);
      setSubmittingComment(false);
      return;
    }

    // Pendo Track Event: incident_comment_added
    if (typeof pendo !== 'undefined') {
      pendo.track('incident_comment_added', {
        incident_id: incident.id,
        incident_severity: incident.severity,
        comment_length: commentText.length,
        is_internal: isInternalComment,
        has_attachments: false,
      });
    }

    setCommentText('');
    setIsInternalComment(false);
    setSubmittingComment(false);
    loadComments();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!incident || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];

    const storagePath = `incidents/${incident.id}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('incident-attachments')
      .upload(storagePath, file);

    if (uploadError) {
      setError(uploadError.message);
      return;
    }

    await supabase.from('incident_attachments').insert({
      incident_id: incident.id,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      storage_path: storagePath,
    });

    // Pendo Track Event: incident_attachment_uploaded
    if (typeof pendo !== 'undefined') {
      pendo.track('incident_attachment_uploaded', {
        incident_id: incident.id,
        file_type: file.type,
        file_size_bytes: file.size,
        file_name: file.name,
      });
    }

    e.target.value = '';
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading incident...</p>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-500">Incident not found.</p>
      </div>
    );
  }

  const severityColors: Record<string, string> = {
    low: 'bg-blue-100 text-blue-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800',
  };

  const statusColors: Record<string, string> = {
    open: 'bg-red-100 text-red-800',
    in_progress: 'bg-yellow-100 text-yellow-800',
    resolved: 'bg-green-100 text-green-800',
    closed: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate('/incidents')} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <AlertTriangle className="h-6 w-6 text-brand-500" />
          <h1 className="text-2xl font-bold text-gray-900">{incident.title}</h1>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="grid grid-cols-3 gap-6">
          {/* Main content */}
          <div className="col-span-2 space-y-6">
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Description</h2>
              <p className="text-gray-700 whitespace-pre-wrap">
                {incident.description || 'No description provided.'}
              </p>
            </div>

            {/* Comments */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MessageSquare className="h-5 w-5" /> Comments
              </h2>
              <div className="space-y-4 mb-6">
                {comments.map((comment) => (
                  <div
                    key={comment.id}
                    className={`p-3 rounded-lg ${
                      comment.is_internal ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'
                    }`}
                  >
                    {comment.is_internal && (
                      <span className="text-xs font-medium text-yellow-600 mb-1 block">Internal</span>
                    )}
                    <p className="text-gray-700 text-sm">{comment.content}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(comment.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
                {comments.length === 0 && (
                  <p className="text-gray-400 text-sm">No comments yet.</p>
                )}
              </div>
              <form onSubmit={handleAddComment} className="space-y-3">
                <textarea
                  rows={3}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-500 focus:border-brand-500 text-sm"
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={isInternalComment}
                      onChange={(e) => setIsInternalComment(e.target.checked)}
                      className="h-4 w-4 text-brand-500 border-gray-300 rounded"
                    />
                    Internal note
                  </label>
                  <button
                    type="submit"
                    disabled={submittingComment || !commentText.trim()}
                    className="px-3 py-1.5 bg-brand-500 text-white text-sm rounded-md hover:bg-brand-600 disabled:opacity-50"
                  >
                    {submittingComment ? 'Posting...' : 'Post Comment'}
                  </button>
                </div>
              </form>
            </div>

            {/* AI Copilot */}
            <AICopilot incident={incident} />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-white shadow rounded-lg p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Status</label>
                <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${statusColors[incident.status]}`}>
                  {incident.status.replace('_', ' ')}
                </span>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(['open', 'in_progress', 'resolved', 'closed'] as IncidentStatus[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      disabled={incident.status === s}
                      className="px-2 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
                    >
                      {s.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Severity</label>
                <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${severityColors[incident.severity]}`}>
                  {incident.severity}
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Type</label>
                <span className="text-sm text-gray-700">{incident.type.replace('_', ' ')}</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Created</label>
                <span className="text-sm text-gray-700">
                  {new Date(incident.created_at).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Assignment */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <UserCheck className="h-4 w-4" /> Assignment
              </h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={assigneeInput}
                  onChange={(e) => setAssigneeInput(e.target.value)}
                  placeholder="Assign to..."
                  className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-brand-500 focus:border-brand-500"
                />
                <button
                  onClick={handleAssign}
                  disabled={!assigneeInput}
                  className="px-3 py-1.5 bg-brand-500 text-white text-sm rounded-md hover:bg-brand-600 disabled:opacity-50"
                >
                  Assign
                </button>
              </div>
            </div>

            {/* Escalation */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <ArrowUpCircle className="h-4 w-4" /> Escalate
              </h3>
              <div className="flex flex-wrap gap-1">
                {(['high', 'critical'] as IncidentSeverity[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleEscalate(s)}
                    disabled={incident.severity === s || incident.severity === 'critical'}
                    className="px-3 py-1.5 text-xs rounded border border-orange-300 text-orange-700 hover:bg-orange-50 disabled:opacity-30"
                  >
                    Escalate to {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Attachments */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Paperclip className="h-4 w-4" /> Attachments
              </h3>
              <label className="block cursor-pointer text-sm text-brand-500 hover:text-brand-600">
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                Upload file
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
