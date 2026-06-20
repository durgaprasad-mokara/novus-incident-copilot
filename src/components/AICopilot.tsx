import { useState } from 'react';
import { Bot, Send, ThumbsUp, ThumbsDown, FileText } from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Incident, AISuggestion } from '../types/incident';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GOOGLE_API_KEY || '');
const MODEL_NAME = 'gemini-pro';

interface AICopilotProps {
  incident: Incident;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export default function AICopilot({ incident }: AICopilotProps) {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  async function handleSubmitQuery(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || loading) return;

    const userMessage = query.trim();
    setQuery('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage, timestamp: Date.now() }]);
    setLoading(true);

    const startTime = Date.now();

    try {
      const model = genAI.getGenerativeModel({ model: MODEL_NAME });
      const prompt = `You are an incident management copilot. The current incident is:
Title: ${incident.title}
Severity: ${incident.severity}
Status: ${incident.status}
Type: ${incident.type}
Description: ${incident.description || 'None'}

User query: ${userMessage}

Provide helpful, concise guidance.`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const responseTimeMs = Date.now() - startTime;

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: responseText, timestamp: Date.now() },
      ]);

      // Parse suggestions from the AI response if present
      const newSuggestions = parseSuggestions(responseText, incident.id);
      if (newSuggestions.length > 0) {
        setSuggestions((prev) => [...prev, ...newSuggestions]);
      }

      // Pendo Track Event: copilot_query_submitted
      if (typeof pendo !== 'undefined') {
        pendo.track('copilot_query_submitted', {
          query_length: userMessage.length,
          query_type: categorizeQuery(userMessage),
          response_time_ms: responseTimeMs,
          has_incident_context: true,
          incident_id: incident.id,
          model_used: MODEL_NAME,
        });
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.', timestamp: Date.now() },
      ]);
    }

    setLoading(false);
  }

  function handleAcceptSuggestion(suggestion: AISuggestion, index: number) {
    const suggestionCreatedAt = new Date(suggestion.created_at).getTime();
    const timeToAccept = Math.round((Date.now() - suggestionCreatedAt) / 1000);

    // Pendo Track Event: copilot_suggestion_accepted
    if (typeof pendo !== 'undefined') {
      pendo.track('copilot_suggestion_accepted', {
        suggestion_type: suggestion.type,
        incident_id: suggestion.incident_id,
        suggestion_index: index,
        time_to_accept_seconds: timeToAccept,
      });
    }

    setSuggestions((prev) => prev.filter((_, i) => i !== index));
  }

  function handleRejectSuggestion(suggestion: AISuggestion, index: number) {
    // Pendo Track Event: copilot_suggestion_rejected
    if (typeof pendo !== 'undefined') {
      pendo.track('copilot_suggestion_rejected', {
        suggestion_type: suggestion.type,
        incident_id: suggestion.incident_id,
        rejection_reason: 'user_dismissed',
        suggestion_index: index,
      });
    }

    setSuggestions((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleGenerateSummary() {
    setSummaryLoading(true);
    const startTime = Date.now();

    try {
      const model = genAI.getGenerativeModel({ model: MODEL_NAME });
      const prompt = `Provide a concise summary of this incident:
Title: ${incident.title}
Severity: ${incident.severity}
Status: ${incident.status}
Type: ${incident.type}
Priority: ${incident.priority}
Description: ${incident.description || 'None'}
Created: ${incident.created_at}

Summarize the key facts, current state, and any recommended next steps in 2-3 paragraphs.`;

      const result = await model.generateContent(prompt);
      const summaryText = result.response.text();
      const responseTimeMs = Date.now() - startTime;

      setSummary(summaryText);

      const createdAt = new Date(incident.created_at).getTime();
      const incidentAgeHours = Math.round((Date.now() - createdAt) / (1000 * 60 * 60));

      // Pendo Track Event: copilot_summary_generated
      if (typeof pendo !== 'undefined') {
        pendo.track('copilot_summary_generated', {
          incident_id: incident.id,
          incident_severity: incident.severity,
          summary_length: summaryText.length,
          response_time_ms: responseTimeMs,
          incident_age_hours: incidentAgeHours,
        });
      }
    } catch {
      setSummary('Unable to generate summary. Please try again.');
    }

    setSummaryLoading(false);
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Bot className="h-5 w-5 text-brand-500" /> AI Copilot
        </h2>
        <button
          onClick={handleGenerateSummary}
          disabled={summaryLoading}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
        >
          <FileText className="h-3 w-3" />
          {summaryLoading ? 'Generating...' : 'Generate Summary'}
        </button>
      </div>

      {/* Summary */}
      {summary && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-xs font-semibold text-blue-700 uppercase mb-1">AI Summary</h3>
          <p className="text-sm text-blue-900 whitespace-pre-wrap">{summary}</p>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="mb-4 space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase">Suggestions</h3>
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion.id}
              className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-start justify-between gap-3"
            >
              <div className="flex-1">
                <span className="text-xs font-medium text-green-700 uppercase">
                  {suggestion.type}
                </span>
                <p className="text-sm text-green-900 mt-1">{suggestion.content}</p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => handleAcceptSuggestion(suggestion, index)}
                  className="p-1.5 text-green-600 hover:bg-green-100 rounded"
                  title="Accept suggestion"
                >
                  <ThumbsUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleRejectSuggestion(suggestion, index)}
                  className="p-1.5 text-red-400 hover:bg-red-50 rounded"
                  title="Dismiss suggestion"
                >
                  <ThumbsDown className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chat messages */}
      <div className="space-y-3 mb-4 max-h-80 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">
            Ask the AI Copilot for help with this incident.
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg text-sm ${
              msg.role === 'user'
                ? 'bg-brand-50 text-brand-900 ml-8'
                : 'bg-gray-50 text-gray-800 mr-8'
            }`}
          >
            <span className="text-xs font-medium text-gray-500 block mb-1">
              {msg.role === 'user' ? 'You' : 'Copilot'}
            </span>
            <p className="whitespace-pre-wrap">{msg.content}</p>
          </div>
        ))}
        {loading && (
          <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-500 mr-8">
            Thinking...
          </div>
        )}
      </div>

      {/* Query input */}
      <form onSubmit={handleSubmitQuery} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask the copilot..."
          disabled={loading}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-brand-500 focus:border-brand-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-3 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

function categorizeQuery(query: string): string {
  const lower = query.toLowerCase();
  if (lower.includes('fix') || lower.includes('resolve') || lower.includes('solution')) return 'resolution';
  if (lower.includes('cause') || lower.includes('why') || lower.includes('root')) return 'root_cause';
  if (lower.includes('similar') || lower.includes('history') || lower.includes('past')) return 'historical';
  if (lower.includes('escalat') || lower.includes('priority') || lower.includes('urgent')) return 'escalation';
  return 'general';
}

function parseSuggestions(responseText: string, incidentId: string): AISuggestion[] {
  const suggestions: AISuggestion[] = [];
  const lines = responseText.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('SUGGESTION:') || trimmed.startsWith('Action:')) {
      suggestions.push({
        id: crypto.randomUUID(),
        type: 'action',
        content: trimmed.replace(/^(SUGGESTION:|Action:)\s*/i, ''),
        incident_id: incidentId,
        created_at: new Date().toISOString(),
      });
    }
  }

  return suggestions;
}
