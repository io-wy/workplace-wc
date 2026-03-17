import { create } from 'zustand';
import type { Script, Settings, ScriptStatus, ScriptOutput } from './types';
import * as api from './api';

interface AppStore {
  // Scripts
  scripts: Script[];
  selectedScriptId: number | null;
  scriptStatuses: Record<number, ScriptStatus>;
  scriptOutputs: Record<number, string>;

  // Settings
  settings: Settings | null;
  settingsOpen: boolean;

  // LLM Assistant
  llmOpen: boolean;
  llmMessages: { role: 'user' | 'assistant'; content: string }[];
  llmLoading: boolean;

  // UI State
  addScriptDialogOpen: boolean;
  editScriptDialogOpen: boolean;

  // Actions
  loadScripts: () => Promise<void>;
  selectScript: (id: number | null) => void;
  addScript: (name: string, path: string, venvPath: string | null) => Promise<void>;
  updateScript: (id: number, name: string, path: string, venvPath: string | null) => Promise<void>;
  deleteScript: (id: number) => Promise<void>;
  runScript: (args: Record<string, unknown>) => Promise<void>;
  stopScript: (id: number) => Promise<void>;
  updateScriptStatus: (status: ScriptStatus) => void;
  appendScriptOutput: (output: ScriptOutput) => void;
  clearScriptOutput: (id: number) => void;

  loadSettings: () => Promise<void>;
  saveSettings: (settings: Settings) => Promise<void>;
  setSettingsOpen: (open: boolean) => void;

  setLlmOpen: (open: boolean) => void;
  sendLlmMessage: (content: string) => Promise<void>;
  clearLlmMessages: () => void;

  setAddScriptDialogOpen: (open: boolean) => void;
  setEditScriptDialogOpen: (open: boolean) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  // Initial state
  scripts: [],
  selectedScriptId: null,
  scriptStatuses: {},
  scriptOutputs: {},

  settings: null,
  settingsOpen: false,

  llmOpen: false,
  llmMessages: [],
  llmLoading: false,

  addScriptDialogOpen: false,
  editScriptDialogOpen: false,

  // Scripts actions
  loadScripts: async () => {
    try {
      const scripts = await api.getScripts();
      set({ scripts });
    } catch (error) {
      console.error('Failed to load scripts:', error);
    }
  },

  selectScript: (id) => {
    set({ selectedScriptId: id });
  },

  addScript: async (name, path, venvPath) => {
    try {
      const params = await api.parseScriptParams(path);
      await api.addScript(name, path, venvPath, params);
      await get().loadScripts();
    } catch (error) {
      console.error('Failed to add script:', error);
      throw error;
    }
  },

  updateScript: async (id, name, path, venvPath) => {
    try {
      const script = get().scripts.find(s => s.id === id);
      if (!script) return;

      const params = await api.parseScriptParams(path);
      await api.updateScript(id, name, path, venvPath, params);
      await get().loadScripts();
    } catch (error) {
      console.error('Failed to update script:', error);
      throw error;
    }
  },

  deleteScript: async (id) => {
    try {
      await api.deleteScript(id);
      if (get().selectedScriptId === id) {
        set({ selectedScriptId: null });
      }
      await get().loadScripts();
    } catch (error) {
      console.error('Failed to delete script:', error);
      throw error;
    }
  },

  runScript: async (args) => {
    const { selectedScriptId } = get();
    if (!selectedScriptId) return;

    // Clear previous output
    set((state) => ({
      scriptOutputs: { ...state.scriptOutputs, [selectedScriptId]: '' },
      scriptStatuses: {
        ...state.scriptStatuses,
        [selectedScriptId]: { script_id: selectedScriptId, status: 'running', exit_code: null, output: '' }
      }
    }));

    try {
      await api.runScript(selectedScriptId, args);
    } catch (error) {
      console.error('Failed to run script:', error);
      set((state) => ({
        scriptStatuses: {
          ...state.scriptStatuses,
          [selectedScriptId]: {
            script_id: selectedScriptId,
            status: 'failed',
            exit_code: -1,
            output: String(error)
          }
        }
      }));
    }
  },

  stopScript: async (id) => {
    try {
      await api.stopScript(id);
    } catch (error) {
      console.error('Failed to stop script:', error);
    }
  },

  updateScriptStatus: (status) => {
    set((state) => ({
      scriptStatuses: {
        ...state.scriptStatuses,
        [status.script_id]: status
      }
    }));
  },

  appendScriptOutput: (output) => {
    set((state) => ({
      scriptOutputs: {
        ...state.scriptOutputs,
        [output.script_id]: (state.scriptOutputs[output.script_id] || '') + output.line + '\n'
      }
    }));
  },

  clearScriptOutput: (id) => {
    set((state) => ({
      scriptOutputs: { ...state.scriptOutputs, [id]: '' }
    }));
  },

  // Settings actions
  loadSettings: async () => {
    try {
      const settings = await api.getSettings();
      set({ settings });
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  },

  saveSettings: async (settings) => {
    try {
      await api.saveSettings(settings);
      set({ settings });
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  },

  setSettingsOpen: (open) => {
    set({ settingsOpen: open });
  },

  // LLM actions
  setLlmOpen: (open) => {
    set({ llmOpen: open });
  },

  sendLlmMessage: async (content) => {
    const { selectedScriptId, scripts, settings } = get();
    if (!settings?.llm_api_key) {
      alert('Please configure LLM settings first');
      return;
    }

    set((state) => ({
      llmMessages: [...state.llmMessages, { role: 'user', content }],
      llmLoading: true
    }));

    try {
      let response: string;

      if (selectedScriptId) {
        // Fill params mode
        const script = scripts.find(s => s.id === selectedScriptId);
        if (script) {
          const filledParams = await api.llmFillParams(script.name, script.params, content);
          response = JSON.stringify(filledParams, null, 2);
        } else {
          response = 'Script not found';
        }
      } else {
        // Chat mode
        const messages = get().llmMessages.map(m => ({ role: m.role, content: m.content }));
        messages.push({ role: 'user', content });
        response = await api.llmChat(messages);
      }

      set((state) => ({
        llmMessages: [...state.llmMessages, { role: 'assistant', content: response }],
        llmLoading: false
      }));
    } catch (error) {
      set((state) => ({
        llmMessages: [...state.llmMessages, { role: 'assistant', content: `Error: ${error}` }],
        llmLoading: false
      }));
    }
  },

  clearLlmMessages: () => {
    set({ llmMessages: [] });
  },

  // Dialog actions
  setAddScriptDialogOpen: (open) => {
    set({ addScriptDialogOpen: open });
  },

  setEditScriptDialogOpen: (open) => {
    set({ editScriptDialogOpen: open });
  }
}));
