import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { IncidentSeverity, IncidentPriority } from '../types/incident';

export default function IncidentForm() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<IncidentSeverity>('medium');
  const [type, setType] = useState('service_outage');
  const [priority, setPriority] = useState<IncidentPriority>('medium');
  const [assignedTo, setAssignedTo] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from('incidents')
      .insert({
        title,
        description,
        severity,
        type,
        priority,
        assigned_to: assignedTo || null,
        status: 'open',
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    // Pendo Track Event: incident_created
    if (typeof pendo !== 'undefined') {
      pendo.track('incident_created', {
        incident_severity: severity,
        incident_type: type,
        incident_priority: priority,
        assigned_to: assignedTo ? 'yes' : 'no',
        has_description: description.length > 0,
        source: 'web_form',
      });
    }

    setLoading(false);
    navigate(`/incidents/${data.id}`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate('/incidents')} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <AlertTriangle className="h-6 w-6 text-brand-500" />
          <h1 className="text-2xl font-bold text-gray-900">Create Incident</h1>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">
              Title
            </label>
            <input
              id="title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-500 focus:border-brand-500"
              placeholder="Brief description of the incident"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-500 focus:border-brand-500"
              placeholder="Detailed description of the incident"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="severity" className="block text-sm font-medium text-gray-700">
                Severity
              </label>
              <select
                id="severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div>
              <label htmlFor="priority" className="block text-sm font-medium text-gray-700">
                Priority
              </label>
              <select
                id="priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as IncidentPriority)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700">
              Type
            </label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-500 focus:border-brand-500"
            >
              <option value="service_outage">Service Outage</option>
              <option value="performance">Performance Degradation</option>
              <option value="security">Security Incident</option>
              <option value="data_loss">Data Loss</option>
              <option value="configuration">Configuration Issue</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="assignedTo" className="block text-sm font-medium text-gray-700">
              Assign To (optional)
            </label>
            <input
              id="assignedTo"
              type="text"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-500 focus:border-brand-500"
              placeholder="Team member email or ID"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Incident'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/incidents')}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
