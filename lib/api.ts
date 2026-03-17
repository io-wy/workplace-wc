import { invoke } from '@tauri-apps/api/core';
import type { Script, ScriptParam, Settings, LogEntry, ChatMessage } from './types';

// ============== Scripts API ==============

export async function getScripts(): Promise<Script[]> {
  return invoke('get_scripts');
}

export async function addScript(
  name: string,
  path: string,
  venvPath: string | null,
  params: ScriptParam[]
): Promise<Script> {
  return invoke('add_script', { name, path, venvPath, params });
}

export async function updateScript(
  id: number,
  name: string,
  path: string,
  venvPath: string | null,
  params: ScriptParam[]
): Promise<Script> {
  return invoke('update_script', { id, name, path, venvPath, params });
}

export async function deleteScript(id: number): Promise<void> {
  return invoke('delete_script', { id });
}

export async function parseScriptParams(path: string): Promise<ScriptParam[]> {
  return invoke('parse_script_params', { path });
}

export async function detectVenv(scriptPath: string): Promise<string | null> {
  return invoke('detect_venv', { scriptPath });
}

// ============== Execution API ==============

export async function runScript(
  scriptId: number,
  args: Record<string, unknown>
): Promise<void> {
  return invoke('run_script', { scriptId, args });
}

export async function stopScript(scriptId: number): Promise<void> {
  return invoke('stop_script', { scriptId });
}

// ============== Settings API ==============

export async function getSettings(): Promise<Settings> {
  return invoke('get_settings');
}

export async function saveSettings(settings: Settings): Promise<void> {
  return invoke('save_settings', { settings });
}

// ============== Logs API ==============

export async function addLog(
  scriptId: number | null,
  level: string,
  message: string
): Promise<number> {
  return invoke('add_log', { scriptId, level, message });
}

export async function getLogs(limit?: number): Promise<LogEntry[]> {
  return invoke('get_logs', { limit });
}

// ============== LLM API ==============

export async function llmChat(messages: ChatMessage[]): Promise<string> {
  return invoke('llm_chat', { messages });
}

export async function llmFillParams(
  scriptName: string,
  paramsSchema: ScriptParam[],
  userInput: string
): Promise<Record<string, unknown>> {
  return invoke('llm_fill_params', { scriptName, paramsSchema, userInput });
}
