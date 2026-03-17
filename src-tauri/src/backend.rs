use anyhow::Result;
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};

// ============== Data Models ==============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Script {
    pub id: i64,
    pub name: String,
    pub path: String,
    pub venv_path: Option<String>,
    pub params: Vec<ScriptParam>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptParam {
    pub name: String,
    pub param_type: String,
    pub default: Option<serde_json::Value>,
    pub doc: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub python_path: String,
    pub llm_api_key: String,
    pub llm_base_url: String,
    pub llm_model: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            python_path: "python".to_string(),
            llm_api_key: String::new(),
            llm_base_url: "https://api.openai.com/v1".to_string(),
            llm_model: "gpt-4o".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub id: i64,
    pub script_id: Option<i64>,
    pub level: String,
    pub message: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunResult {
    pub script_id: i64,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub started_at: String,
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptStatus {
    pub script_id: i64,
    pub status: String, // "idle", "running", "completed", "failed", "terminated"
    pub exit_code: Option<i32>,
    pub output: String,
}

// ============== State ==============

pub struct AppState {
    pub db: Mutex<Connection>,
    pub running_processes: Mutex<HashMap<i64, tokio::sync::oneshot::Sender<()>>>,
}

// ============== Database ==============

pub fn init_db(app_data_dir: PathBuf) -> Result<Connection> {
    std::fs::create_dir_all(&app_data_dir)?;
    let db_path = app_data_dir.join("pyscript_launcher.db");
    let conn = Connection::open(db_path)?;

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS scripts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            path TEXT NOT NULL UNIQUE,
            venv_path TEXT,
            params_json TEXT NOT NULL DEFAULT '[]',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            script_id INTEGER,
            level TEXT NOT NULL CHECK(level IN ('INFO', 'WARNING', 'ERROR')),
            message TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
        );
        ",
    )?;

    Ok(conn)
}

// ============== Commands: Scripts ==============

#[tauri::command]
pub fn get_scripts(state: State<AppState>) -> Result<Vec<Script>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, path, venv_path, params_json, created_at, updated_at FROM scripts")
        .map_err(|e| e.to_string())?;

    let scripts = stmt
        .query_map([], |row| {
            let params_json: String = row.get(4)?;
            let params: Vec<ScriptParam> =
                serde_json::from_str(&params_json).unwrap_or_default();
            Ok(Script {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                venv_path: row.get(3)?,
                params,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(scripts)
}

#[tauri::command]
pub fn add_script(
    state: State<AppState>,
    name: String,
    path: String,
    venv_path: Option<String>,
    params: Vec<ScriptParam>,
) -> Result<Script, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let params_json = serde_json::to_string(&params).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO scripts (name, path, venv_path, params_json) VALUES (?1, ?2, ?3, ?4)",
        params![name, path, venv_path, params_json],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    Ok(Script {
        id,
        name,
        path,
        venv_path,
        params,
        created_at: Utc::now().to_rfc3339(),
        updated_at: Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
pub fn update_script(
    state: State<AppState>,
    id: i64,
    name: String,
    path: String,
    venv_path: Option<String>,
    params: Vec<ScriptParam>,
) -> Result<Script, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let params_json = serde_json::to_string(&params).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE scripts SET name = ?1, path = ?2, venv_path = ?3, params_json = ?4, updated_at = CURRENT_TIMESTAMP WHERE id = ?5",
        params![name, path, venv_path, params_json, id],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT created_at, updated_at FROM scripts WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    let (created_at, updated_at): (String, String) = stmt
        .query_row([id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?;

    Ok(Script {
        id,
        name,
        path,
        venv_path,
        params,
        created_at,
        updated_at,
    })
}

#[tauri::command]
pub fn delete_script(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM scripts WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ============== Commands: Settings ==============

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<Settings, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let mut settings = Settings::default();

    let mut stmt = conn
        .prepare("SELECT key, value FROM settings")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;

    for row in rows.flatten() {
        match row.0.as_str() {
            "python_path" => settings.python_path = row.1,
            "llm_api_key" => settings.llm_api_key = row.1,
            "llm_base_url" => settings.llm_base_url = row.1,
            "llm_model" => settings.llm_model = row.1,
            _ => {}
        }
    }

    Ok(settings)
}

#[tauri::command]
pub fn save_settings(state: State<AppState>, settings: Settings) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let pairs = [
        ("python_path", settings.python_path),
        ("llm_api_key", settings.llm_api_key),
        ("llm_base_url", settings.llm_base_url),
        ("llm_model", settings.llm_model),
    ];

    for (key, value) in pairs {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ============== Commands: Logs ==============

#[tauri::command]
pub fn add_log(
    state: State<AppState>,
    script_id: Option<i64>,
    level: String,
    message: String,
) -> Result<i64, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO logs (script_id, level, message) VALUES (?1, ?2, ?3)",
        params![script_id, level, message],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn get_logs(state: State<AppState>, limit: Option<i64>) -> Result<Vec<LogEntry>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(100);

    let mut stmt = conn
        .prepare("SELECT id, script_id, level, message, timestamp FROM logs ORDER BY id DESC LIMIT ?1")
        .map_err(|e| e.to_string())?;

    let logs = stmt
        .query_map([limit], |row| {
            Ok(LogEntry {
                id: row.get(0)?,
                script_id: row.get(1)?,
                level: row.get(2)?,
                message: row.get(3)?,
                timestamp: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(logs)
}

// ============== Commands: Script Execution ==============

#[tauri::command]
pub async fn run_script(
    app: AppHandle,
    state: State<'_, AppState>,
    script_id: i64,
    args: HashMap<String, serde_json::Value>,
) -> Result<(), String> {
    // Get script info
    let script = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, name, path, venv_path, params_json FROM scripts WHERE id = ?1")
            .map_err(|e| e.to_string())?;

        stmt.query_row([script_id], |row| {
            let params_json: String = row.get(4)?;
            let params: Vec<ScriptParam> =
                serde_json::from_str(&params_json).unwrap_or_default();
            Ok(Script {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                venv_path: row.get(3)?,
                params,
                created_at: String::new(),
                updated_at: String::new(),
            })
        })
        .map_err(|e| e.to_string())?
    };

    // Get settings
    let settings = get_settings(state.clone()).map_err(|e| e.to_string())?;

    // Build command
    let python_path = if let Some(ref venv) = script.venv_path {
        if cfg!(windows) {
            format!("{}/Scripts/python.exe", venv)
        } else {
            format!("{}/bin/python", venv)
        }
    } else {
        settings.python_path.clone()
    };

    // Build arguments
    let mut cmd_args = vec![script.path.clone()];
    for param in &script.params {
        if let Some(value) = args.get(&param.name) {
            cmd_args.push(format!("--{}", param.name));
            cmd_args.push(value.to_string().trim_matches('"').to_string());
        }
    }

    let started_at = Utc::now().to_rfc3339();

    // Emit status
    let _ = app.emit(
        "script-status",
        ScriptStatus {
            script_id,
            status: "running".to_string(),
            exit_code: None,
            output: format!("Starting: {} {}\n", python_path, cmd_args.join(" ")),
        },
    );

    // Create cancellation channel
    let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel::<()>();
    {
        let mut processes = state.running_processes.lock().map_err(|e| e.to_string())?;
        processes.insert(script_id, cancel_tx);
    }

    // Run process
    let mut child = Command::new(&python_path)
        .args(&cmd_args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start process: {}", e))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let app_clone = app.clone();
    let app_clone2 = app.clone();
    let script_id_clone = script_id;

    // Handle stdout
    let stdout_handle = tokio::spawn(async move {
        if let Some(stdout) = stdout {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = app_clone.emit(
                    "script-output",
                    serde_json::json!({
                        "script_id": script_id_clone,
                        "stream": "stdout",
                        "line": line
                    }),
                );
            }
        }
    });

    // Handle stderr
    let stderr_handle = tokio::spawn(async move {
        if let Some(stderr) = stderr {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = app_clone2.emit(
                    "script-output",
                    serde_json::json!({
                        "script_id": script_id_clone,
                        "stream": "stderr",
                        "line": line
                    }),
                );
            }
        }
    });

    // Wait for either completion or cancellation
    let status = tokio::select! {
        status = child.wait() => {
            match status {
                Ok(s) => Some(s.code().unwrap_or(-1)),
                Err(_) => Some(-1),
            }
        }
        _ = &mut cancel_rx => {
            let _ = child.kill().await;
            None
        }
    };

    let _ = stdout_handle.await;
    let _ = stderr_handle.await;

    // Remove from running processes
    {
        let mut processes = state.running_processes.lock().map_err(|e| e.to_string())?;
        processes.remove(&script_id);
    }

    let exit_code = status.unwrap_or(-1);
    let finished_at = Utc::now().to_rfc3339();

    let final_status = if exit_code == 0 {
        "completed"
    } else {
        "failed"
    };

    // Emit final status
    let _ = app.emit(
        "script-status",
        ScriptStatus {
            script_id,
            status: final_status.to_string(),
            exit_code: Some(exit_code),
            output: format!("Exited with code: {}", exit_code),
        },
    );

    // Add log entry
    let _ = add_log(
        state,
        Some(script_id),
        if exit_code == 0 {
            "INFO".to_string()
        } else {
            "ERROR".to_string()
        },
        format!(
            "Script {} finished with exit code {}",
            script.name, exit_code
        ),
    );

    Ok(())
}

#[tauri::command]
pub fn stop_script(state: State<AppState>, script_id: i64) -> Result<(), String> {
    let mut processes = state.running_processes.lock().map_err(|e| e.to_string())?;
    if let Some(cancel_tx) = processes.remove(&script_id) {
        let _ = cancel_tx.send(());
    }
    Ok(())
}

// ============== Commands: LLM ==============

#[tauri::command]
pub async fn llm_chat(
    state: State<'_, AppState>,
    messages: Vec<serde_json::Value>,
) -> Result<String, String> {
    let settings = get_settings(state).map_err(|e| e.to_string())?;

    if settings.llm_api_key.is_empty() {
        return Err("LLM API key not configured".to_string());
    }

    let client = reqwest::Client::new();

    let response = client
        .post(format!("{}/chat/completions", settings.llm_base_url))
        .header("Authorization", format!("Bearer {}", settings.llm_api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": settings.llm_model,
            "messages": messages,
            "temperature": 0.7
        }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let content = json["choices"]
        .as_array()
        .and_then(|c| c.first())
        .and_then(|c| c["message"]["content"].as_str())
        .unwrap_or("")
        .to_string();

    Ok(content)
}

#[tauri::command]
pub async fn llm_fill_params(
    state: State<'_, AppState>,
    script_name: String,
    params_schema: Vec<ScriptParam>,
    user_input: String,
) -> Result<HashMap<String, serde_json::Value>, String> {
    let settings = get_settings(state).map_err(|e| e.to_string())?;

    if settings.llm_api_key.is_empty() {
        return Err("LLM API key not configured".to_string());
    }

    let params_desc: Vec<String> = params_schema
        .iter()
        .map(|p| {
            format!(
                "- {} ({}){}",
                p.name,
                p.param_type,
                p.doc.as_ref().map(|d| format!(": {}", d)).unwrap_or_default()
            )
        })
        .collect();

    let system_prompt = format!(
        r#"You are a Python script parameter filling assistant.

Script: {}
Parameters:
{}

User request: {}

Please return a JSON object with parameter values. Example: {{"param1": "value1", "param2": 123}}

Only return valid JSON, no other text."#,
        script_name,
        params_desc.join("\n"),
        user_input
    );

    let messages = vec![
        serde_json::json!({
            "role": "system",
            "content": system_prompt
        }),
        serde_json::json!({
            "role": "user",
            "content": user_input
        })
    ];

    let client = reqwest::Client::new();

    let response = client
        .post(format!("{}/chat/completions", settings.llm_base_url))
        .header("Authorization", format!("Bearer {}", settings.llm_api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": settings.llm_model,
            "messages": messages,
            "temperature": 0.3
        }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let content = json["choices"]
        .as_array()
        .and_then(|c| c.first())
        .and_then(|c| c["message"]["content"].as_str())
        .unwrap_or("{}")
        .to_string();

    // Parse JSON from response
    let parsed: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse LLM response: {}", e))?;

    let mut result = HashMap::new();
    if let Some(obj) = parsed.as_object() {
        for (k, v) in obj {
            result.insert(k.clone(), v.clone());
        }
    }

    Ok(result)
}

// ============== Commands: Utils ==============

#[tauri::command]
pub fn parse_script_params(path: String) -> Result<Vec<ScriptParam>, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;

    // Simple Python parameter parsing
    // Look for function definitions with type hints
    let mut params = Vec::new();

    for line in content.lines() {
        let line = line.trim();
        if line.starts_with("def ") {
            // Extract parameters from function definition
            if let Some(start) = line.find('(') {
                if let Some(end) = line.find(')') {
                    let args_str = &line[start + 1..end];
                    for arg in args_str.split(',') {
                        let arg = arg.trim();
                        if arg.is_empty() {
                            continue;
                        }

                        let (name, param_type, default) = if arg.contains(": ") {
                            let parts: Vec<&str> = arg.splitn(2, ": ").collect();
                            let name = parts[0].trim().to_string();
                            let type_hint = parts[1].trim().to_string();

                            let (param_type, default) = if let Some(eq_idx) = type_hint.find("=") {
                                let t = type_hint[..eq_idx].trim().to_string();
                                let d = type_hint[eq_idx + 1..].trim().to_string();
                                let default = if d == "None" {
                                    serde_json::Value::Null
                                } else if d.parse::<i64>().is_ok() {
                                    serde_json::json!(d.parse::<i64>().unwrap())
                                } else if d.parse::<f64>().is_ok() {
                                    serde_json::json!(d.parse::<f64>().unwrap())
                                } else if d == "True" || d == "False" {
                                    serde_json::json!(d == "True")
                                } else {
                                    serde_json::json!(d.trim_matches('"').to_string())
                                };
                                (t, Some(default))
                            } else {
                                (type_hint, None)
                            };

                            (name, param_type, default)
                        } else {
                            let name = arg.trim().to_string();
                            (name, "str".to_string(), None)
                        };

                        if name != "self" && name != "cls" {
                            params.push(ScriptParam {
                                name,
                                param_type,
                                default,
                                doc: None,
                            });
                        }
                    }
                }
            }
            break; // Only parse first function
        }
    }

    Ok(params)
}

#[tauri::command]
pub fn detect_venv(script_path: String) -> Result<Option<String>, String> {
    let script_dir = std::path::Path::new(&script_path)
        .parent()
        .ok_or("Invalid script path")?;

    let venv_names = ["venv", ".venv", "env", ".env"];

    for name in &venv_names {
        let venv_path = script_dir.join(name);
        if venv_path.exists() && venv_path.is_dir() {
            return Ok(Some(venv_path.to_string_lossy().to_string()));
        }
    }

    Ok(None)
}
