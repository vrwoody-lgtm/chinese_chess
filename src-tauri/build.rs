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
    }

    tauri_build::build();
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
