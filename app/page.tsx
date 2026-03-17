'use client';

import { useEffect, useState, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '@/lib/store';
import type { ScriptStatus, ScriptOutput, Settings } from '@/lib/types';
import * as api from '@/lib/api';
import {
  Plus,
  Play,
  Square,
  Trash2,
  Settings as SettingsIcon,
  X,
  Bot,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Loader2,
  Check,
  AlertCircle,
  Clock,
  Terminal,
  Sparkles
} from 'lucide-react';

// ============== Components ==============

function ScriptList() {
  const {
    scripts,
    selectedScriptId,
    scriptStatuses,
    selectScript,
    setAddScriptDialogOpen,
    setEditScriptDialogOpen,
    deleteScript,
    runScript,
    stopScript
  } = useAppStore();

  const getStatusColor = (status?: ScriptStatus) => {
    if (!status) return 'bg-green-500';
    switch (status.status) {
      case 'running': return 'bg-yellow-500 animate-pulse';
      case 'completed': return 'bg-green-500';
      case 'failed': return 'bg-red-500';
      case 'terminated': return 'bg-gray-500';
      default: return 'bg-green-500';
    }
  };

  const handleRun = async (e: React.MouseEvent, scriptId: number) => {
    e.stopPropagation();
    selectScript(scriptId);
    // Run with default params
    const script = scripts.find(s => s.id === scriptId);
    if (script) {
      const args: Record<string, unknown> = {};
      for (const param of script.params) {
        if (param.default !== undefined && param.default !== null) {
          args[param.name] = param.default;
        }
      }
      await runScript(args);
    }
  };

  const handleStop = async (e: React.MouseEvent, scriptId: number) => {
    e.stopPropagation();
    await stopScript(scriptId);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <button
          onClick={() => setAddScriptDialogOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Script
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {scripts.length === 0 ? (
          <div className="text-center text-muted-foreground p-4">
            No scripts added yet
          </div>
        ) : (
          <div className="space-y-1">
            {scripts.map((script) => {
              const status = scriptStatuses[script.id];
              const isRunning = status?.status === 'running';

              return (
                <div
                  key={script.id}
                  onClick={() => selectScript(script.id)}
                  className={`
                    group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all
                    ${selectedScriptId === script.id
                      ? 'bg-primary/20 border border-primary/50'
                      : 'hover:bg-secondary border border-transparent'}
                  `}
                >
                  <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(status)}`} />

                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{script.name}</div>
                    {script.venv_path && (
                      <div className="text-xs text-muted-foreground truncate">
                        venv: {script.venv_path.split(/[/\\]/).pop()}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isRunning ? (
                      <button
                        onClick={(e) => handleStop(e, script.id)}
                        className="p-1.5 rounded hover:bg-destructive/20 text-destructive"
                        title="Stop"
                      >
                        <Square className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={(e) => handleRun(e, script.id)}
                        className="p-1.5 rounded hover:bg-primary/20 text-primary"
                        title="Run"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        selectScript(script.id);
                        setEditScriptDialogOpen(true);
                      }}
                      className="p-1.5 rounded hover:bg-secondary text-muted-foreground"
                      title="Edit"
                    >
                      <SettingsIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Delete this script?')) {
                          deleteScript(script.id);
                        }
                      }}
                      className="p-1.5 rounded hover:bg-destructive/20 text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ScriptPanel() {
  const {
    scripts,
    selectedScriptId,
    scriptStatuses,
    scriptOutputs,
    runScript,
    stopScript,
    clearScriptOutput
  } = useAppStore();

  const script = scripts.find(s => s.id === selectedScriptId);
  const status = selectedScriptId ? scriptStatuses[selectedScriptId] : undefined;
  const output = selectedScriptId ? scriptOutputs[selectedScriptId] : '';
  const [args, setArgs] = useState<Record<string, string>>({});
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (script) {
      const initialArgs: Record<string, string> = {};
      for (const param of script.params) {
        if (param.default !== undefined && param.default !== null) {
          initialArgs[param.name] = String(param.default);
        }
      }
      setArgs(initialArgs);
    }
  }, [script]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  if (!script) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Terminal className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>Select a script to view details</p>
        </div>
      </div>
    );
  }

  const isRunning = status?.status === 'running';

  const handleRun = () => {
    const parsedArgs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      const param = script.params.find(p => p.name === key);
      if (param) {
        if (param.param_type === 'int') parsedArgs[key] = parseInt(value) || 0;
        else if (param.param_type === 'float') parsedArgs[key] = parseFloat(value) || 0;
        else if (param.param_type === 'bool') parsedArgs[key] = value === 'true';
        else parsedArgs[key] = value;
      }
    }
    clearScriptOutput(script.id);
    runScript(parsedArgs);
  };

  const renderParamInput = (param: typeof script.params[0]) => {
    const value = args[param.name] ?? '';

    if (param.param_type === 'bool') {
      return (
        <select
          value={value}
          onChange={(e) => setArgs({ ...args, [param.name]: e.target.value })}
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground"
          disabled={isRunning}
        >
          <option value="false">false</option>
          <option value="true">true</option>
        </select>
      );
    }

    if (param.param_type === 'int' || param.param_type === 'float') {
      return (
        <input
          type="number"
          step={param.param_type === 'float' ? '0.01' : '1'}
          value={value}
          onChange={(e) => setArgs({ ...args, [param.name]: e.target.value })}
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground"
          disabled={isRunning}
        />
      );
    }

    return (
      <input
        type="text"
        value={value}
        onChange={(e) => setArgs({ ...args, [param.name]: e.target.value })}
        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground"
        disabled={isRunning}
      />
    );
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">{script.name}</h2>
          <p className="text-sm text-muted-foreground truncate">{script.path}</p>
        </div>
        <div className="flex items-center gap-2">
          {isRunning ? (
            <button
              onClick={() => stopScript(script.id)}
              className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors"
            >
              <Square className="w-4 h-4" />
              Stop
            </button>
          ) : (
            <button
              onClick={handleRun}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Play className="w-4 h-4" />
              Run
            </button>
          )}
        </div>
      </div>

      {/* Parameters */}
      {script.params.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium mb-3 text-muted-foreground">Parameters</h3>
          <div className="grid gap-4">
            {script.params.map((param) => (
              <div key={param.name} className="grid grid-cols-3 gap-4 items-center">
                <label className="text-sm font-medium">
                  {param.name}
                  <span className="text-muted-foreground font-normal ml-1">
                    ({param.param_type})
                  </span>
                </label>
                <div className="col-span-2">
                  {renderParamInput(param)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Output */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-muted-foreground">Output</h3>
          {status && (
            <div className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full ${
                status.status === 'running' ? 'bg-yellow-500 animate-pulse' :
                status.status === 'completed' ? 'bg-green-500' :
                status.status === 'failed' ? 'bg-red-500' :
                'bg-gray-500'
              }`} />
              <span className="text-muted-foreground capitalize">{status.status}</span>
              {status.exit_code !== null && (
                <span className="text-muted-foreground">
                  (exit: {status.exit_code})
                </span>
              )}
            </div>
          )}
        </div>
        <div
          ref={outputRef}
          className="flex-1 bg-background border border-border rounded-lg p-4 overflow-y-auto font-mono text-sm"
        >
          {output || (isRunning ? 'Running...' : 'No output yet')}
        </div>
      </div>
    </div>
  );
}

function AddScriptDialog() {
  const { addScriptDialogOpen, setAddScriptDialogOpen, addScript, loadScripts } = useAppStore();
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [venvPath, setVenvPath] = useState('');
  const [loading, setLoading] = useState(false);

  const handleBrowse = async () => {
    // In Tauri, we'd use dialog plugin. For now, just let user paste path
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.py';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        setPath(file.name.replace('.py', '') + '.py');
        if (!name) {
          setName(file.name.replace('.py', ''));
        }
      }
    };
    input.click();
  };

  const handleSubmit = async () => {
    if (!name || !path) return;

    setLoading(true);
    try {
      await addScript(name, path, venvPath || null);
      setAddScriptDialogOpen(false);
      setName('');
      setPath('');
      setVenvPath('');
    } catch (error) {
      alert(`Failed to add script: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  if (!addScriptDialogOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="glass w-full max-w-md p-6 rounded-xl animate-scale-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Add Script</h2>
          <button onClick={() => setAddScriptDialogOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Script Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my_script"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Script Path</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="C:/scripts/my_script.py"
                className="flex-1 px-3 py-2 bg-background border border-border rounded-lg"
              />
              <button
                onClick={handleBrowse}
                className="px-3 py-2 bg-secondary border border-border rounded-lg hover:bg-secondary/80"
              >
                <FolderOpen className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Virtual Environment (optional)</label>
            <input
              type="text"
              value={venvPath}
              onChange={(e) => setVenvPath(e.target.value)}
              placeholder="C:/scripts/venv"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={() => setAddScriptDialogOpen(false)}
              className="px-4 py-2 border border-border rounded-lg hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !name || !path}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsDialog() {
  const { settingsOpen, setSettingsOpen, settings, saveSettings, loadSettings } = useAppStore();
  const [form, setForm] = useState<Settings>({
    python_path: 'python',
    llm_api_key: '',
    llm_base_url: 'https://api.openai.com/v1',
    llm_model: 'gpt-4o'
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm(settings);
    }
  }, [settings]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await saveSettings(form);
      setSettingsOpen(false);
    } catch (error) {
      alert(`Failed to save settings: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  if (!settingsOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="glass w-full max-w-lg p-6 rounded-xl animate-scale-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={() => setSettingsOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Python Path</label>
            <input
              type="text"
              value={form.python_path}
              onChange={(e) => setForm({ ...form, python_path: e.target.value })}
              placeholder="python"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg"
            />
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-medium mb-3">LLM Configuration</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">API Key</label>
                <input
                  type="password"
                  value={form.llm_api_key}
                  onChange={(e) => setForm({ ...form, llm_api_key: e.target.value })}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Base URL</label>
                <input
                  type="text"
                  value={form.llm_base_url}
                  onChange={(e) => setForm({ ...form, llm_base_url: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Model</label>
                <input
                  type="text"
                  value={form.llm_model}
                  onChange={(e) => setForm({ ...form, llm_model: e.target.value })}
                  placeholder="gpt-4o"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={() => setSettingsOpen(false)}
              className="px-4 py-2 border border-border rounded-lg hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LLMAssistant() {
  const {
    llmOpen,
    setLlmOpen,
    llmMessages,
    llmLoading,
    sendLlmMessage,
    clearLlmMessages,
    selectedScriptId
  } = useAppStore();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [llmMessages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || llmLoading) return;

    const userInput = input;
    setInput('');
    await sendLlmMessage(userInput);
  };

  if (!llmOpen) {
    return (
      <button
        onClick={() => setLlmOpen(true)}
        className="fixed bottom-6 right-6 p-4 bg-primary rounded-full shadow-lg hover:bg-primary/90 transition-all hover:scale-105"
      >
        <Bot className="w-6 h-6 text-primary-foreground" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 h-[500px] glass rounded-xl flex flex-col overflow-hidden animate-scale-in">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <span className="font-medium">LLM Assistant</span>
          {selectedScriptId && (
            <span className="text-xs text-muted-foreground">(Fill Params)</span>
          )}
        </div>
        <button
          onClick={() => {
            setLlmOpen(false);
            clearLlmMessages();
          }}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {llmMessages.length === 0 && (
          <div className="text-center text-muted-foreground text-sm">
            {selectedScriptId
              ? 'Describe what parameters you want to use, e.g., "Use data.csv with 50 epochs"'
              : 'Ask me anything about your scripts or general questions'}
          </div>
        )}
        {llmMessages.map((msg, i) => (
          <div
            key={i}
            className={`${
              msg.role === 'user' ? 'ml-8' : 'mr-8'
            }`}
          >
            <div
              className={`p-3 rounded-lg ${
                msg.role === 'user'
                  ? 'bg-primary/20 border border-primary/30'
                  : 'bg-secondary border border-border'
              }`}
            >
              <pre className="text-sm whitespace-pre-wrap font-sans">{msg.content}</pre>
            </div>
          </div>
        ))}
        {llmLoading && (
          <div className="mr-8">
            <div className="bg-secondary border border-border p-3 rounded-lg">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={llmLoading}
            className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
          />
          <button
            type="submit"
            disabled={llmLoading || !input.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            <Bot className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

function StatusBar() {
  const { scripts, scriptStatuses, setSettingsOpen } = useAppStore();
  const runningCount = Object.values(scriptStatuses).filter(s => s.status === 'running').length;

  return (
    <div className="h-8 px-4 flex items-center justify-between text-xs text-muted-foreground border-t border-border bg-card/50">
      <div className="flex items-center gap-4">
        <span>Scripts: {scripts.length}</span>
        <span>Running: {runningCount}</span>
      </div>
      <button
        onClick={() => setSettingsOpen(true)}
        className="flex items-center gap-1 hover:text-foreground transition-colors"
      >
        <SettingsIcon className="w-3.5 h-3.5" />
        Settings
      </button>
    </div>
  );
}

// ============== Main Component ==============

export default function Home() {
  const { loadScripts, loadSettings, updateScriptStatus, appendScriptOutput } = useAppStore();

  useEffect(() => {
    loadScripts();
    loadSettings();

    // Listen for script status updates
    const unlistenStatus = listen<ScriptStatus>('script-status', (event) => {
      updateScriptStatus(event.payload);
    });

    // Listen for script output
    const unlistenOutput = listen<ScriptOutput>('script-output', (event) => {
      appendScriptOutput(event.payload);
    });

    return () => {
      unlistenStatus.then(fn => fn());
      unlistenOutput.then(fn => fn());
    };
  }, []);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-72 border-r border-border bg-card/30">
          <ScriptList />
        </div>

        {/* Main panel */}
        <ScriptPanel />
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* Dialogs */}
      <AddScriptDialog />
      <SettingsDialog />

      {/* LLM Assistant */}
      <LLMAssistant />
    </div>
  );
}
