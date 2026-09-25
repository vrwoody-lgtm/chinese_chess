use serde::{Deserialize, Serialize};
#[cfg(not(target_os = "ios"))]
use std::{
    collections::BTreeMap,
    io::{BufRead, BufReader, Write},
    process::{ChildStdin, Command, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};
use std::{env, path::PathBuf};
use tauri::{AppHandle, Manager};

#[cfg(target_os = "ios")]
use std::{ffi::CString, os::raw::c_char};

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

#[cfg(target_os = "ios")]
extern "C" {
    fn cc_pikafish_init(nnue_path: *const c_char) -> i32;
    fn cc_pikafish_search(
        fen: *const c_char,
        depth: u32,
        move_time_ms: u64,
        multi_pv: u32,
        candidate_rank: u32,
        best_move: *mut c_char,
        best_move_capacity: usize,
    ) -> i32;
}

#[tauri::command]
fn get_engine_status(app: AppHandle) -> EngineStatus {
    #[cfg(target_os = "ios")]
    {
        let network_path = resolve_network_path(&app, None);
        return EngineStatus {
            available: network_path.is_some(),
            ready: network_path.is_some(),
            protocol: Some("native".into()),
            path: None,
            network_path: network_path.map(display_path),
        };
    }

    #[cfg(not(target_os = "ios"))]
    {
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

#[cfg(target_os = "ios")]
fn search_best_move(app: AppHandle, payload: EngineRequest) -> EngineResponse {
    let Some(network_path) = resolve_network_path(&app, None) else {
        return failure("engine-unavailable", Vec::new(), Some("native"));
    };

    let Ok(network_path) = CString::new(network_path.to_string_lossy().as_bytes()) else {
        return failure("engine-unavailable", Vec::new(), Some("native"));
    };
    let Ok(fen) = CString::new(payload.fen.trim()) else {
        return failure("invalid-position", Vec::new(), Some("native"));
    };

    let depth = payload.depth.unwrap_or(8).clamp(1, 24);
    let move_time = payload.move_time.unwrap_or(2200).clamp(200, 15_000);
    let multi_pv = payload.multi_pv.unwrap_or(1).clamp(1, 12);
    let candidate_rank = payload.candidate_rank.unwrap_or(1).clamp(1, multi_pv);

    let init_status = unsafe { cc_pikafish_init(network_path.as_ptr()) };
    if init_status != 0 {
        return failure("engine-unavailable", Vec::new(), Some("native"));
    }

    let mut move_buffer = vec![0_u8; 32];
    let search_status = unsafe {
        cc_pikafish_search(
            fen.as_ptr(),
            depth,
            move_time,
            multi_pv,
            candidate_rank,
            move_buffer.as_mut_ptr() as *mut c_char,
            move_buffer.len(),
        )
    };
    if search_status != 0 {
        return failure("engine-unavailable", Vec::new(), Some("native"));
    }

    let move_length = move_buffer
        .iter()
        .position(|byte| *byte == 0)
        .unwrap_or(move_buffer.len());
    let best_move = String::from_utf8_lossy(&move_buffer[..move_length]).to_ascii_lowercase();
    if !is_valid_engine_move(&best_move) {
        return failure("invalid-move", Vec::new(), Some("native"));
    }

    EngineResponse {
        ok: true,
        best_move: Some(best_move),
        protocol: Some("native".into()),
        reason: None,
        details: Vec::new(),
    }
}

#[cfg(not(target_os = "ios"))]
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

#[cfg(not(target_os = "ios"))]
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

#[cfg(not(target_os = "ios"))]
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

#[cfg(not(target_os = "ios"))]
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

#[cfg(not(target_os = "ios"))]
fn write_line(stdin: &mut ChildStdin, command: &str) {
    let _ = writeln!(stdin, "{command}");
    let _ = stdin.flush();
}

#[cfg(not(target_os = "ios"))]
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

#[cfg(not(target_os = "ios"))]
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

#[cfg(not(target_os = "ios"))]
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

#[cfg(not(target_os = "ios"))]
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

#[cfg(not(target_os = "ios"))]
fn resolve_engine_path(app: &AppHandle) -> Option<PathBuf> {
    let from_env = env::var_os("CHESS_ENGINE_PATH").map(PathBuf::from);
    if let Some(path) = from_env.filter(|path| path.exists()) {
        return Some(path);
    }

    #[cfg(target_os = "macos")]
    if let Some(path) = bundled_macos_helper_engine().filter(|path| path.exists()) {
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

#[cfg(target_os = "macos")]
fn bundled_macos_helper_engine() -> Option<PathBuf> {
    let exe = env::current_exe().ok()?;
    let macos_dir = exe.parent()?;
    let contents_dir = macos_dir.parent()?;
    Some(contents_dir.join("Helpers").join("pikafish"))
}

fn resolve_network_path(app: &AppHandle, engine_path: Option<&PathBuf>) -> Option<PathBuf> {
    let from_env = env::var_os("PIKAFISH_NNUE_PATH").map(PathBuf::from);
    if let Some(path) = from_env.filter(|path| path.exists()) {
        return Some(path);
    }

    #[cfg(target_os = "macos")]
    if let Some(path) = bundled_macos_network_path().filter(|path| path.exists()) {
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

#[cfg(target_os = "macos")]
fn bundled_macos_network_path() -> Option<PathBuf> {
    let exe = env::current_exe().ok()?;
    let macos_dir = exe.parent()?;
    let contents_dir = macos_dir.parent()?;
    Some(
        contents_dir
            .join("Resources")
            .join("_up_")
            .join("engines")
            .join("pikafish.nnue"),
    )
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
        // Tauri preserves a resource source such as `../engines/pikafish`
        // under an `_up_` directory in packaged applications. Development
        // builds find the repository-level directory above, but release
        // bundles (notably macOS .app bundles) need this packaged path.
        roots.push(resource_dir.join("_up_").join("engines"));
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

#[cfg(not(target_os = "ios"))]
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
