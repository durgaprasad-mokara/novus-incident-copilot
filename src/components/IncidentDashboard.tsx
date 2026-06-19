import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Plus, Download, Settings, CheckSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Incident, IncidentSeverity, IncidentStatus } from '../types/incident';

export default function IncidentDashboard() {
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState('');

  useEffect(() => {
    loadIncidents();
  }, []);

  async function loadIncidents() {
    setLoading(true);
    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setIncidents(data);
    }
    setLoading(false);
  }

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      loadIncidents();
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .ilike('title', `%${searchQuery}%`)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setIncidents(data);

      // Pendo Track Event: dashboard_search_executed
      if (typeof pendo !== 'undefined') {
        pendo.track('dashboard_search_executed', {
          query: searchQuery.substring(0, 100),
          results_count: data.length,
          filters_applied: getActiveFilterCount() > 0,
          search_type: 'text',
        });
      }
    }
    setLoading(false);
  }, [searchQuery]);

  function getActiveFilterCount() {
    let count = 0;
    if (filterSeverity !== 'all') count++;
    if (filterStatus !== 'all') count++;
    if (filterType !== 'all') count++;
    return count;
  }

  async function handleApplyFilters() {
    setLoading(true);
    let query = supabase.from('incidents').select('*');

    if (filterSeverity !== 'all') {
      query = query.eq('severity', filterSeverity);
    }
    if (filterStatus !== 'all') {
      query = query.eq('status', filterStatus);
    }
    if (filterType !== 'all') {
      query = query.eq('type', filterType);
    }
    if (searchQuery.trim()) {
      query = query.ilike('title', `%${searchQuery}%`);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (!error && data) {
      setIncidents(data);

      // Pendo Track Event: dashboard_filters_applied
      if (typeof pendo !== 'undefined') {
        pendo.track('dashboard_filters_applied', {
          filter_severity: filterSeverity,
          filter_status: filterStatus,
          filter_type: filterType,
          results_count: data.length,
          active_filter_count: getActiveFilterCount(),
        });
      }
    }
    setLoading(false);
  }

  async function handleBulkAction() {
    if (selectedIds.size === 0 || !bulkAction) return;

    const ids = Array.from(selectedIds);
    let successCount = 0;
    let failureCount = 0;

    for (const incidentId of ids) {
      const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };

      if (bulkAction === 'close') {
        updatePayload.status = 'closed';
      } else if (bulkAction === 'resolve') {
        updatePayload.status = 'resolved';
        updatePayload.resolved_at = new Date().toISOString();
      } else if (bulkAction === 'in_progress') {
        updatePayload.status = 'in_progress';
      }

      const { error } = await supabase
        .from('incidents')
        .update(updatePayload)
        .eq('id', incidentId);

      if (error) {
        failureCount++;
      } else {
        successCount++;
      }
    }

    // Pendo Track Event: bulk_incident_update
    if (typeof pendo !== 'undefined') {
      pendo.track('bulk_incident_update', {
        action_type: bulkAction,
        incident_count: ids.length,
        success_count: successCount,
        failure_count: failureCount,
      });
    }

    setSelectedIds(new Set());
    setBulkAction('');
    loadIncidents();
  }

  async function handleExport() {
    const csvRows = [
      ['ID', 'Title', 'Severity', 'Status', 'Type', 'Priority', 'Created At'].join(','),
    ];

    for (const inc of incidents) {
      csvRows.push(
        [
          inc.id,
          `"${inc.title.replace(/"/g, '""')}"`,
          inc.severity,
          inc.status,
          inc.type,
          inc.priority,
          inc.created_at,
        ].join(',')
      );
    }

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incidents_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    // Pendo Track Event: incident_report_exported
    if (typeof pendo !== 'undefined') {
      pendo.track('incident_report_exported', {
        export_format: 'csv',
        incident_count: incidents.length,
        filters_applied: getActiveFilterCount() > 0,
        file_size_bytes: blob.size,
      });
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
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
      <div className="max-w-7xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Incidents</h1>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/settings')}
              className="px-3 py-2 text-gray-600 hover:text-gray-800"
            >
              <Settings className="h-5 w-5" />
            </button>
            <button
              onClick={() => navigate('/incidents/new')}
              className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600"
            >
              <Plus className="h-4 w-4" /> New Incident
            </button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="bg-white shadow rounded-lg p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                <Search className="inline h-3 w-3" /> Search
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search incidents..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-brand-500 focus:border-brand-500"
                />
                <button
                  onClick={handleSearch}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
                >
                  Search
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                <Filter className="inline h-3 w-3" /> Severity
              </label>
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="all">All</option>
                {(['low', 'medium', 'high', 'critical'] as IncidentSeverity[]).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="all">All</option>
                {(['open', 'in_progress', 'resolved', 'closed'] as IncidentStatus[]).map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="all">All</option>
                <option value="service_outage">Service Outage</option>
                <option value="performance">Performance</option>
                <option value="security">Security</option>
                <option value="data_loss">Data Loss</option>
                <option value="configuration">Configuration</option>
                <option value="other">Other</option>
              </select>
            </div>
            <button
              onClick={handleApplyFilters}
              className="px-4 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 text-sm"
            >
              Apply Filters
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:text-gray-800 text-sm border border-gray-300 rounded-md"
            >
              <Download className="h-4 w-4" /> Export
            </button>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div className="bg-brand-50 border border-brand-200 rounded-lg p-3 mb-4 flex items-center gap-4">
            <CheckSquare className="h-5 w-5 text-brand-600" />
            <span className="text-sm text-brand-700 font-medium">
              {selectedIds.size} incident{selectedIds.size > 1 ? 's' : ''} selected
            </span>
            <select
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value)}
              className="px-2 py-1 border border-brand-300 rounded text-sm"
            >
              <option value="">Choose action...</option>
              <option value="in_progress">Set In Progress</option>
              <option value="resolve">Resolve</option>
              <option value="close">Close</option>
            </select>
            <button
              onClick={handleBulkAction}
              disabled={!bulkAction}
              className="px-3 py-1 bg-brand-500 text-white text-sm rounded hover:bg-brand-600 disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        )}

        {/* Incident Table */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading incidents...</div>
          ) : incidents.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No incidents found.</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8" />
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Severity
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {incidents.map((inc) => (
                  <tr
                    key={inc.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/incidents/${inc.id}`)}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(inc.id)}
                        onChange={() => toggleSelect(inc.id)}
                        className="h-4 w-4 text-brand-500 border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{inc.title}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded ${severityColors[inc.severity]}`}>
                        {inc.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded ${statusColors[inc.status]}`}>
                        {inc.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{inc.type.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(inc.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
