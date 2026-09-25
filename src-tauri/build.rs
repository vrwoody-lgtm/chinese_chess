use std::{
    env, fs,
    path::{Path, PathBuf},
    process::Command,
};

fn main() {
    if env::var("TARGET")
        .map(|target| target.contains("apple-ios"))
        .unwrap_or(false)
    {
        build_ios_pikafish();
        fix_xcode27_swift_rs_exports();
    }

    tauri_build::build();
}

fn fix_xcode27_swift_rs_exports() {
    if xcode_major_version()
        .map(|version| version < 27)
        .unwrap_or(true)
    {
        return;
    }

    let out_dir = PathBuf::from(env::var_os("OUT_DIR").expect("OUT_DIR must be set by Cargo"));
    let Some(profile_dir) = out_dir.ancestors().nth(3) else {
        return;
    };
    let build_dir = profile_dir.join("build");
    let Ok(entries) = fs::read_dir(&build_dir) else {
        return;
    };

    let mut archives = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let is_tauri_build = path
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name.starts_with("tauri-"))
            .unwrap_or(false);
        if !is_tauri_build {
            continue;
        }

        let swift_package_dir = path.join("out/swift-rs/Tauri");
        collect_named_files(&swift_package_dir, "libTauri.a", &mut archives);
    }

    let mut unique_archives = Vec::new();
    for archive in archives {
        let archive = fs::canonicalize(&archive).unwrap_or(archive);
        if !unique_archives.contains(&archive) {
            unique_archives.push(archive);
        }
    }

    if let Some(archive) = unique_archives.into_iter().max_by_key(|path| {
        fs::metadata(path)
            .and_then(|metadata| metadata.modified())
            .ok()
    }) {
        globalize_swift_rs_exports(&archive);
    }
}

fn globalize_swift_rs_exports(archive: &Path) {
    let Some(object) = archive
        .parent()
        .map(|directory| directory.join("SwiftRs.o"))
        .filter(|path| path.is_file())
    else {
        println!(
            "cargo:warning=swift-rs: SwiftRs.o not found next to {}",
            archive.display()
        );
        return;
    };

    // SwiftRs.o is needed directly because ld does not revisit a static archive
    // after the Rust swift-rs library introduces these symbols.
    println!("cargo:rustc-link-arg={}", object.display());

    let Ok(nm) = Command::new("nm").arg(archive).output() else {
        return;
    };
    if !nm.status.success() {
        return;
    }

    let exports = [
        "retain_object",
        "release_object",
        "string_from_bytes",
        "data_from_bytes",
    ];
    let nm_stdout = String::from_utf8_lossy(&nm.stdout);
    let local_symbols: Vec<String> = nm_stdout
        .lines()
        .filter_map(|line| {
            let mut fields = line.split_whitespace();
            let (_, kind, name) = (fields.next()?, fields.next()?, fields.next()?);
            if kind != "t" {
                return None;
            }

            let bare_name = name.strip_prefix('_')?;
            exports.contains(&bare_name).then(|| bare_name.to_owned())
        })
        .fold(Vec::new(), |mut symbols, symbol| {
            if !symbols.contains(&symbol) {
                symbols.push(symbol);
            }
            symbols
        });

    if local_symbols.is_empty() {
        return;
    }

    let Some(objcopy) = rustup_llvm_objcopy() else {
        println!(
            "cargo:warning=swift-rs: llvm-objcopy not found; {} exports remain local",
            local_symbols.join(", ")
        );
        return;
    };

    let mut command = Command::new(objcopy);
    for symbol in &local_symbols {
        command.arg(format!("--globalize-symbol=_{symbol}"));
    }
    command.arg(&object);

    let Ok(status) = command.status() else {
        println!(
            "cargo:warning=swift-rs: failed to run llvm-objcopy for {}",
            object.display()
        );
        return;
    };
    if !status.success() {
        println!(
            "cargo:warning=swift-rs: failed to export {} (status {status})",
            local_symbols.join(", ")
        );
        return;
    }

    let archive_status = Command::new("xcrun")
        .args(["ar", "-r"])
        .arg(archive)
        .arg(&object)
        .status();
    if !matches!(archive_status, Ok(status) if status.success()) {
        println!(
            "cargo:warning=swift-rs: failed to update {} with SwiftRs.o",
            archive.display()
        );
        return;
    }

    let index_status = Command::new("xcrun").arg("ranlib").arg(archive).status();
    if !matches!(index_status, Ok(status) if status.success()) {
        println!(
            "cargo:warning=swift-rs: failed to refresh archive index for {}",
            archive.display()
        );
        return;
    }

    println!(
        "cargo:warning=swift-rs: exported {} for Xcode 27",
        local_symbols.join(", ")
    );
}

fn collect_named_files(directory: &Path, file_name: &str, files: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_named_files(&path, file_name, files);
        } else if path.file_name().and_then(|name| name.to_str()) == Some(file_name) {
            files.push(path);
        }
    }
}

fn xcode_major_version() -> Option<u32> {
    let output = Command::new("xcrun")
        .args(["xcodebuild", "-version"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let xcode_output = String::from_utf8_lossy(&output.stdout);
    let first_line = xcode_output.lines().next()?.trim();
    first_line
        .strip_prefix("Xcode ")?
        .split('.')
        .next()?
        .parse()
        .ok()
}

fn rustup_llvm_objcopy() -> Option<PathBuf> {
    let sysroot = Command::new("rustc")
        .args(["--print", "sysroot"])
        .output()
        .ok()?;
    if !sysroot.status.success() {
        return None;
    }

    let sysroot = String::from_utf8_lossy(&sysroot.stdout).trim().to_owned();
    let host = format!("{}-apple-darwin", env::consts::ARCH);
    let path = Path::new(&sysroot)
        .join("lib/rustlib")
        .join(host)
        .join("bin/llvm-objcopy");
    path.is_file().then_some(path)
}

fn build_ios_pikafish() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let source_root = manifest_dir.join("native/pikafish-source/src");
    let bridge = manifest_dir.join("native/pikafish_bridge.cpp");
    let bridge_header = manifest_dir.join("native/pikafish_bridge.h");

    if !source_root.is_dir() {
        panic!(
            "Pikafish source is missing at {}. Restore src-tauri/native/pikafish-source before building iOS.",
            source_root.display()
        );
    }

    let mut source_files = Vec::new();
    collect_cpp_files(&source_root, &mut source_files);

    let target = env::var("TARGET").expect("TARGET must be set by Cargo");
    let sdk = if target.contains("-sim") {
        "iphonesimulator"
    } else {
        "iphoneos"
    };
    let deployment_target =
        env::var("IPHONEOS_DEPLOYMENT_TARGET").unwrap_or_else(|_| "15.0".into());
    let clang_arch = if target.starts_with("aarch64") {
        "arm64"
    } else if target.starts_with("x86_64") {
        "x86_64"
    } else {
        panic!("unsupported iOS architecture in target {target}");
    };
    let clang_target = if target.contains("-sim") {
        format!("{clang_arch}-apple-ios{deployment_target}-simulator")
    } else {
        format!("{clang_arch}-apple-ios{deployment_target}")
    };

    let sdk_path = Command::new("xcrun")
        .args(["--sdk", sdk, "--show-sdk-path"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned());

    let mut build = cc::Build::new();
    build
        .cpp(true)
        .std("c++17")
        .opt_level(3)
        .include(&source_root)
        .define("NDEBUG", None)
        .define("IS_64BIT", None)
        .define("USE_NEON", Some("8"))
        .define("USE_PTHREADS", None)
        .define("NO_PREFETCH", None)
        .flag_if_supported("-fno-exceptions")
        .flag_if_supported("-fno-rtti")
        .flag_if_supported("-Wno-overriding-option")
        .flag("-target")
        .flag(&clang_target)
        .file(&bridge)
        .files(&source_files);

    if let Some(sdk_path) = sdk_path {
        build.flag("-isysroot").flag(sdk_path);
    }

    for file in source_files
        .iter()
        .chain(std::iter::once(&bridge))
        .chain(std::iter::once(&bridge_header))
    {
        println!("cargo:rerun-if-changed={}", file.display());
    }

    build.compile("chinese_chess_pikafish");
    println!("cargo:rustc-link-lib=c++");
}

fn collect_cpp_files(directory: &Path, files: &mut Vec<PathBuf>) {
    let entries = fs::read_dir(directory)
        .unwrap_or_else(|error| panic!("cannot read {}: {error}", directory.display()));

    for entry in entries {
        let entry = entry.unwrap_or_else(|error| panic!("cannot inspect Pikafish source: {error}"));
        let path = entry.path();

        if path.is_dir() {
            let excluded = path
                .file_name()
                .and_then(|name| name.to_str())
                .map(|name| name == "universal" || name == "temp_builds")
                .unwrap_or(false);
            if !excluded {
                collect_cpp_files(&path, files);
            }
            continue;
        }

        let is_cpp = path.extension().and_then(|extension| extension.to_str()) == Some("cpp");
        let is_main = path.file_name().and_then(|name| name.to_str()) == Some("main.cpp");
        if is_cpp && !is_main {
            files.push(path);
        }
    }
}
