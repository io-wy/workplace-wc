// Types for PyScript Launcher

export interface Script {
  id: number;
  name: string;
  path: string;
  venv_path: string | null;
  params: ScriptParam[];
  created_at: string;
  updated_at: string;
}

export interface ScriptParam {
  name: string;
  param_type: string;
  default: unknown;
  doc: string | null;
}

export interface Settings {
  python_path: string;
  llm_api_key: string;
  llm_base_url: string;
  llm_model: string;
}

export interface LogEntry {
  id: number;
  script_id: number | null;
  level: string;
  message: string;
  timestamp: string;
}

export interface ScriptStatus {
  script_id: number;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'terminated';
  exit_code: number | null;
  output: string;
}

export interface ScriptOutput {
  script_id: number;
  stream: 'stdout' | 'stderr';
  line: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
