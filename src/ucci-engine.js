const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ENGINE_NAMES_BY_PLATFORM = {
  win32: ["pikafish.exe", "eleeye.exe", "engine.exe", "pikafish", "eleeye", "engine"],
  darwin: ["pikafish", "eleeye", "engine", "pikafish.exe", "eleeye.exe", "engine.exe"],
  linux: ["pikafish", "eleeye", "engine", "pikafish.exe", "eleeye.exe", "engine.exe"],
};

class UcciEngine {
  constructor(options) {
    this.appPath = options.appPath;
    this.resourcesPath = options.resourcesPath;
    this.process = null;
    this.ready = false;
    this.pending = null;
    this.buffer = "";
    this.enginePath = this.resolveEnginePath();
    this.networkPath = this.resolveNetworkPath();
    this.protocol = null;
    this.lastLines = [];
  }

  getStatus() {
    return {
      available: Boolean(this.enginePath),
      ready: this.ready,
      protocol: this.protocol,
      networkPath: this.networkPath || null,
      path: this.enginePath || null,
    };
  }

  async getBestMove(payload) {
    if (!this.enginePath) {
      return { ok: false, reason: "missing-engine" };
    }

    await this.ensureStarted();
    const fen = String(payload?.fen || "").trim();
    const depth = clampNumber(payload?.depth, 1, 16, 8);
    const moveTime = clampNumber(payload?.moveTime, 200, 15000, 1200);

    if (!fen) return { ok: false, reason: "missing-fen" };

    return this.search(fen, depth, moveTime);
  }

  resolveEnginePath() {
    const fromEnv = process.env.CHESS_ENGINE_PATH;
    if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

    const roots = [
      path.join(this.appPath, "engines"),
      path.join(this.resourcesPath || "", "engines"),
    ];

    for (const root of roots) {
      for (const name of engineNamesForPlatform()) {
        const candidate = path.join(root, name);
        if (fs.existsSync(candidate)) return candidate;
      }
    }

    return null;
  }

  resolveNetworkPath() {
    const fromEnv = process.env.PIKAFISH_NNUE_PATH;
    if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

    const roots = [
      path.join(this.appPath, "engines"),
      path.join(this.resourcesPath || "", "engines"),
      this.enginePath ? path.dirname(this.enginePath) : "",
    ];

    for (const root of roots) {
      const candidate = path.join(root, "pikafish.nnue");
      if (fs.existsSync(candidate)) return candidate;
    }

    return null;
  }

  async ensureStarted() {
    if (this.ready && this.process) return Promise.resolve();

    this.process = spawn(this.enginePath, [], {
      cwd: path.dirname(this.enginePath),
      windowsHide: true,
    });

    this.process.stdout.setEncoding("utf8");
    this.process.stderr.setEncoding("utf8");
    this.process.stdout.on("data", (chunk) => this.handleOutput(chunk));
    this.process.once("exit", () => this.handleExit());

    await onceProcessReady(this.process);

    const ucci = await this.tryHandshake("ucci", "ucciok", 1600);
    if (ucci) {
      this.protocol = "ucci";
      this.ready = true;
      this.write("setoption batch on");
      return;
    }

    const uci = await this.tryHandshake("uci", "uciok", 4000);
    if (uci) {
      this.protocol = "uci";
      this.ready = true;
      if (this.networkPath) {
        this.write(`setoption name EvalFile value ${this.networkPath}`);
      }
      this.write("isready");
      return;
    }

    const tail = this.lastLines.slice(-6).join(" | ");
    this.dispose();
    throw new Error(`Engine did not answer ucciok or uciok. Last output: ${tail}`);
  }

  tryHandshake(command, expected, timeoutMs) {
    return new Promise((resolve) => {
      const onData = (chunk) => {
        if (String(chunk).includes(expected)) {
          clearTimeout(timer);
          this.process.stdout.off("data", onData);
          resolve(true);
        }
      };

      const timer = setTimeout(() => {
        this.process.stdout.off("data", onData);
        resolve(false);
      }, timeoutMs);

      this.process.stdout.on("data", onData);
      this.write(command);
    });
  }

  search(fen, depth, moveTime) {
    if (this.pending) {
      return Promise.resolve({ ok: false, reason: "busy" });
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.write("stop");
        this.pending = null;
        resolve({ ok: false, reason: "timeout", details: this.lastLines.slice(-8) });
      }, moveTime + 4000);

      this.pending = {
        resolve: (result) => {
          clearTimeout(timer);
          this.pending = null;
          resolve(result);
        },
      };

      this.write(`position fen ${fen}`);
      if (this.protocol === "uci") {
        this.write(`go movetime ${moveTime}`);
      } else {
        this.write(`go time ${moveTime}`);
      }
    });
  }

  handleOutput(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      this.lastLines.push(line.trim());
      if (this.lastLines.length > 30) this.lastLines.shift();
      const best = line.trim().match(/^bestmove\s+([a-i][0-9][a-i][0-9])/i);
      if (best && this.pending) {
        this.pending.resolve({ ok: true, bestMove: best[1].toLowerCase(), protocol: this.protocol });
      }
    }
  }

  write(command) {
    if (this.process && !this.process.killed) {
      this.process.stdin.write(`${command}\n`);
    }
  }

  dispose() {
    if (!this.process) return;
    try {
      this.write("quit");
      this.process.kill();
    } catch (_error) {
      // The process may already be gone during app shutdown.
    }
    this.process = null;
    this.ready = false;
    this.pending = null;
    this.protocol = null;
  }

  handleExit() {
    this.ready = false;
    this.process = null;
    if (this.pending) {
      const details = this.lastLines.slice(-10);
      const missingNetwork = details.some((line) => /network file|EvalFile|nnue/i.test(line));
      this.pending.resolve({
        ok: false,
        reason: missingNetwork ? "missing-network" : "engine-exited",
        details,
      });
    }
    this.pending = null;
  }
}

function onceProcessReady(childProcess) {
  return new Promise((resolve, reject) => {
    childProcess.once("spawn", resolve);
    childProcess.once("error", reject);
  });
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function engineNamesForPlatform() {
  return ENGINE_NAMES_BY_PLATFORM[process.platform] || ENGINE_NAMES_BY_PLATFORM.linux;
}

module.exports = { UcciEngine };
