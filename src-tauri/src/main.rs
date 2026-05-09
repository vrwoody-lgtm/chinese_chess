#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    env,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{ChildStdin, Command, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EngineRequest {
    fen: String,
    depth: Option<u32>,
    move_time: Option<u64>,
    multi_pv: Option<u32>,
    candidate_rank: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineStatus {
    available: bool,
    ready: bool,
    protocol: Option<String>,
    path: Option<String>,
    network_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineResponse {
    ok: bool,
    best_move: Option<String>,
    protocol: Option<String>,
    reason: Option<String>,
    details: Vec<String>,
}

#[tauri::command]
fn get_engine_status(app: AppHandle) -> EngineStatus {
    let engine_path = resolve_engine_path(&app);
    let network_path = resolve_network_path(&app, engine_path.as_ref());

    EngineStatus {
        available: engine_path.is_some(),
        ready: false,
        protocol: None,
        path: engine_path.map(display_path),
        network_path: network_path.map(display_path),
    }
}

#[tauri::command]
async fn get_best_move(app: AppHandle, payload: EngineRequest) -> EngineResponse {
    tauri::async_runtime::spawn_blocking(move || search_best_move(app, payload))
        .await
        .unwrap_or_else(|error| EngineResponse {
            ok: false,
            best_move: None,
            protocol: None,
            reason: Some("worker-failed".into()),
            details: vec![error.to_string()],
        })
}

fn search_best_move(app: AppHandle, payload: EngineRequest) -> EngineResponse {
    let Some(engine_path) = resolve_engine_path(&app) else {
        return failure("missing-engine", Vec::new(), None);
    };

    let network_path = resolve_network_path(&app, Some(&engine_path));
    let move_time = payload.move_time.unwrap_or(2200).clamp(200, 15_000);
    let depth = payload.depth.unwrap_or(8).clamp(1, 24);
    let multi_pv = payload.multi_pv.unwrap_or(1).clamp(1, 12);
    let candidate_rank = payload.candidate_rank.unwrap_or(1).clamp(1, multi_pv);

    let mut command = Command::new(&engine_path);
    command
        .current_dir(
            engine_path
                .parent()
                .unwrap_or_else(|| engine_path.as_path()),
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => return failure("spawn-failed", vec![error.to_string()], None),
    };

    let Some(mut stdin) = child.stdin.take() else {
        return failure("stdin-unavailable", Vec::new(), None);
    };
    let Some(stdout) = child.stdout.take() else {
        return failure("stdout-unavailable", Vec::new(), None);
    };

    let (tx, rx) = mpsc::channel::<String>();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().flatten() {
            let _ = tx.send(line);
        }
    });

    let mut transcript = Vec::new();
    let mut root_candidates = BTreeMap::new();
    let protocol = if handshake(&mut stdin, &rx, &mut transcript, "ucci", "ucciok", 1600) {
        "ucci"
    } else if handshake(&mut stdin, &rx, &mut transcript, "uci", "uciok", 4000) {
        if multi_pv > 1 {
            write_line(
                &mut stdin,
                &format!("setoption name MultiPV value {}", multi_pv),
            );
        }
        if let Some(path) = network_path.as_ref() {
            write_line(
                &mut stdin,
                &format!("setoption name EvalFile value {}", path.display()),
            );
        }
        write_line(&mut stdin, "isready");
        let _ = wait_for(&rx, &mut transcript, "readyok", 1800);
        "uci"
    } else {
        let _ = child.kill();
        return failure("handshake-failed", tail(&transcript, 10), None);
    };

    write_line(&mut stdin, &format!("position fen {}", payload.fen.trim()));
    if protocol == "uci" {
        write_line(
            &mut stdin,
            &format!("go depth {} movetime {}", depth, move_time),
        );
    } else {
        write_line(
            &mut stdin,
            &format!("go depth {} time {}", depth, move_time),
        );
    }

    let deadline = Instant::now() + Duration::from_millis(move_time + 4000);
    while Instant::now() < deadline {
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(line) => {
                if let Some(best_move) = parse_bestmove(&line) {
                    let chosen_move = choose_root_move(best_move, &root_candidates, candidate_rank);
                    write_line(&mut stdin, "quit");
                    let _ = child.kill();
                    return EngineResponse {
                        ok: true,
                        best_move: Some(chosen_move),
                        protocol: Some(protocol.into()),
                        reason: None,
                        details: tail(&transcript, 8),
                    };
                }
                if let Some((rank, root_move)) = parse_multipv_root_move(&line) {
                    root_candidates.insert(rank, root_move);
                }
                transcript.push(line);
                if transcript.iter().any(|line| is_missing_network_line(line)) {
                    let _ = child.kill();
                    return failure("missing-network", tail(&transcript, 10), Some(protocol));
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if let Ok(Some(_status)) = child.try_wait() {
                    return failure("engine-exited", tail(&transcript, 10), Some(protocol));
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                return failure(
                    "engine-output-closed",
                    tail(&transcript, 10),
                    Some(protocol),
                );
            }
        }
    }

    write_line(&mut stdin, "stop");
    let _ = child.kill();
    failure("timeout", tail(&transcript, 10), Some(protocol))
}

fn choose_root_move(
    best_move: String,
    root_candidates: &BTreeMap<u32, String>,
    candidate_rank: u32,
) -> String {
    root_candidates
        .get(&candidate_rank)
        .cloned()
        .or_else(|| root_candidates.get(&1).cloned())
        .unwrap_or(best_move)
}

fn handshake(
    stdin: &mut ChildStdin,
    rx: &mpsc::Receiver<String>,
    transcript: &mut Vec<String>,
    command: &str,
    expected: &str,
    timeout_ms: u64,
) -> bool {
    write_line(stdin, command);
    wait_for(rx, transcript, expected, timeout_ms)
}

fn wait_for(
    rx: &mpsc::Receiver<String>,
    transcript: &mut Vec<String>,
    expected: &str,
    timeout_ms: u64,
) -> bool {
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    while Instant::now() < deadline {
        match rx.recv_timeout(Duration::from_millis(80)) {
            Ok(line) => {
                let matched = line.contains(expected);
                transcript.push(line);
                if matched {
                    return true;
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => return false,
        }
    }
    false
}

fn write_line(stdin: &mut ChildStdin, command: &str) {
    let _ = writeln!(stdin, "{command}");
    let _ = stdin.flush();
}

fn parse_multipv_root_move(line: &str) -> Option<(u32, String)> {
    let mut parts = line.split_whitespace();
    let mut rank = None;
    let mut root_move = None;

    while let Some(part) = parts.next() {
        match part {
            "multipv" => rank = parts.next()?.parse::<u32>().ok(),
            "pv" => {
                root_move = parts.next().map(str::to_ascii_lowercase);
                break;
            }
            _ => {}
        }
    }

    let rank = rank?;
    let root_move = root_move?;
    is_valid_engine_move(&root_move).then_some((rank, root_move))
}

fn parse_bestmove(line: &str) -> Option<String> {
    let trimmed = line.trim();
    let rest = trimmed.strip_prefix("bestmove ")?;
    let candidate = rest.split_whitespace().next()?.to_ascii_lowercase();
    is_valid_engine_move(&candidate).then_some(candidate)
}

fn is_valid_engine_move(candidate: &str) -> bool {
    let bytes = candidate.as_bytes();
    bytes.len() == 4
        && (b'a'..=b'i').contains(&bytes[0])
        && bytes[1].is_ascii_digit()
        && (b'a'..=b'i').contains(&bytes[2])
        && bytes[3].is_ascii_digit()
}

fn is_missing_network_line(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    lower.contains("not loaded successfully")
        || lower.contains("must be available")
        || lower.contains("engine will be terminated")
        || lower.contains("downloaded from")
        || (lower.contains("error")
            && (lower.contains("evalfile")
                || lower.contains("network file")
                || lower.contains("nnue")))
}

fn failure(reason: &str, details: Vec<String>, protocol: Option<&str>) -> EngineResponse {
    EngineResponse {
        ok: false,
        best_move: None,
        protocol: protocol.map(str::to_string),
        reason: Some(reason.into()),
        details,
    }
}

fn tail(lines: &[String], count: usize) -> Vec<String> {
    lines
        .iter()
        .rev()
        .take(count)
        .cloned()
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect()
}

fn resolve_engine_path(app: &AppHandle) -> Option<PathBuf> {
    let from_env = env::var_os("CHESS_ENGINE_PATH").map(PathBuf::from);
    if let Some(path) = from_env.filter(|path| path.exists()) {
        return Some(path);
    }

    for root in engine_roots(app) {
        for name in engine_names_for_platform() {
            let candidate = root.join(name);
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    None
}

fn resolve_network_path(app: &AppHandle, engine_path: Option<&PathBuf>) -> Option<PathBuf> {
    let from_env = env::var_os("PIKAFISH_NNUE_PATH").map(PathBuf::from);
    if let Some(path) = from_env.filter(|path| path.exists()) {
        return Some(path);
    }

    let mut roots = engine_roots(app);
    if let Some(path) = engine_path.and_then(|path| path.parent()) {
        roots.push(path.to_path_buf());
    }

    roots
        .into_iter()
        .map(|root| root.join("pikafish.nnue"))
        .find(|path| path.exists())
}

fn engine_roots(app: &AppHandle) -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Ok(cwd) = env::current_dir() {
        roots.push(cwd.join("engines"));
        roots.push(cwd.join("..").join("engines"));
    }

    roots.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("engines"));
    roots.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("engines"),
    );

    if let Ok(manifest_dir) = env::var("CARGO_MANIFEST_DIR") {
        let manifest = PathBuf::from(manifest_dir);
        roots.push(manifest.join("engines"));
        roots.push(manifest.join("..").join("engines"));
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        roots.push(resource_dir.join("engines"));
    }

    if let Ok(exe) = env::current_exe() {
        if let Some(bin_dir) = exe.parent() {
            roots.push(bin_dir.join("engines"));
            if let Some(contents_dir) = bin_dir.parent() {
                roots.push(contents_dir.join("Resources").join("engines"));
            }
        }
    }

    roots
}

fn engine_names_for_platform() -> &'static [&'static str] {
    if cfg!(target_os = "windows") {
        &[
            "pikafish.exe",
            "eleeye.exe",
            "engine.exe",
            "pikafish",
            "eleeye",
            "engine",
        ]
    } else {
        &[
            "pikafish",
            "eleeye",
            "engine",
            "pikafish.exe",
            "eleeye.exe",
            "engine.exe",
        ]
    }
}

fn display_path(path: PathBuf) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_engine_status, get_best_move])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}
