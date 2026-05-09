const boardEl = document.querySelector("#board");
const messageEl = document.querySelector("#message");
const turnBadgeEl = document.querySelector("#turnBadge");
const gameTimerEl = document.querySelector("#gameTimer");
const redCapturedEl = document.querySelector("#redCaptured");
const blackCapturedEl = document.querySelector("#blackCaptured");
const undoBtn = document.querySelector("#undoBtn");
const resetBtn = document.querySelector("#resetBtn");
const difficultyBtns = document.querySelectorAll(".difficulty-btn");
const firstMoveBtns = document.querySelectorAll(".first-move-btn");
const themeBtns = document.querySelectorAll(".theme-btn");
const engineStatusEl = document.querySelector("#engineStatus");
const saveStatusEl = document.querySelector("#saveStatus");
const soundBtn = document.querySelector("#soundBtn");
const voiceBtn = document.querySelector("#voiceBtn");
const resultOverlay = document.querySelector("#resultOverlay");
const resultTitle = document.querySelector("#resultTitle");
const resultCloseBtn = document.querySelector("#resultCloseBtn");
const confirmOverlay = document.querySelector("#confirmOverlay");
const cancelResetStatsBtn = document.querySelector("#cancelResetStatsBtn");
const confirmResetStatsBtn = document.querySelector("#confirmResetStatsBtn");
const firstMoveConfirmOverlay = document.querySelector("#firstMoveConfirmOverlay");
const firstMoveConfirmCopy = document.querySelector("#firstMoveConfirmCopy");
const cancelFirstMoveBtn = document.querySelector("#cancelFirstMoveBtn");
const confirmFirstMoveBtn = document.querySelector("#confirmFirstMoveBtn");
const playerWinsEl = document.querySelector("#playerWins");
const computerWinsEl = document.querySelector("#computerWins");
const resetStatsBtn = document.querySelector("#resetStatsBtn");

const files = 9;
const ranks = 10;
const pieceNames = {
  red: { general: "帅", advisor: "仕", elephant: "相", horse: "马", rook: "车", cannon: "炮", soldier: "兵" },
  black: { general: "将", advisor: "士", elephant: "象", horse: "马", rook: "车", cannon: "炮", soldier: "卒" },
};
const pieceValues = { general: 12000, rook: 950, cannon: 500, horse: 460, elephant: 240, advisor: 240, soldier: 130 };
const aiNames = {
  beginner: "新手",
  amateur: "业余",
  advanced: "进阶",
  strong: "高手",
  master: "大师",
};
const themeNames = {
  classic: "经典木纹",
  jade: "青瓷玉盘",
  ink: "宣纸墨韵",
  night: "玄黑夜战",
};
const gameSaveKey = "xiangqi-game-save";
const statsSaveKey = "xiangqi-stats";
const engineProfiles = {
  beginner: { depth: 1, moveTime: 220, multiPv: 3, candidateRank: 2 },
  amateur: { depth: 2, moveTime: 800, multiPv: 3, candidateRank: 1 },
  advanced: { depth: 3, moveTime: 1400 },
  strong: { depth: 5, moveTime: 3600 },
  master: { depth: 9, moveTime: 8000 },
};

const layout = {
  appPadding: 40,
  desktopGap: 22,
  sideWidth: 560,
  boardPanelPadding: 36,
  boardAspectHeight: 10 / 9,
  minBoard: 430,
  maxBoard: 640,
};
const aiProfiles = {
  beginner: { depth: 1, candidateLimit: 14, noise: 130, randomTop: 10 },
  amateur: { depth: 2, candidateLimit: 14, noise: 35, randomTop: 3 },
  advanced: { depth: 2, candidateLimit: 18, noise: 18, randomTop: 2 },
  strong: { depth: 3, candidateLimit: 16, noise: 0, randomTop: 1 },
  master: { depth: 4, candidateLimit: 18, noise: 0, randomTop: 1 },
};

let state = createInitialState();
let selected = null;
let legalTargets = [];
let aiLevel = "beginner";
let aiThinking = false;
let lastAiMove = null;
let engineStatus = { available: false, ready: false };
let lastEngineReply = "";
let lastEngineFailure = "";
let soundEnabled = true;
let voiceEnabled = true;
let boardTheme = "classic";
let computerFirst = false;
let awaitingComputerStart = false;
let pendingComputerFirst = null;
let audioContext = null;
let stats = loadStats();
let timerInterval = null;
const history = [];
const voiceFiles = {
  capture: "./assets/voice/capture.mp3",
  check: "./assets/voice/check.mp3",
  captureCheck: "./assets/voice/capture-check.mp3",
  win: "./assets/voice/win.mp3",
  lose: "./assets/voice/lose.mp3",
};
const voiceFallbackFiles = {
  capture: "./assets/voice/capture.wav",
  check: "./assets/voice/check.wav",
  captureCheck: "./assets/voice/capture-check.wav",
  win: "./assets/voice/win.wav",
  lose: "./assets/voice/lose.wav",
};

let restoredNeedsAiMove = false;

function fitBoardToViewport() {
  const narrow = window.innerWidth <= 900;
  const widthBudget = narrow
    ? window.innerWidth - 32
    : window.innerWidth - layout.appPadding - layout.desktopGap - layout.sideWidth - layout.boardPanelPadding;
  const heightBudget = narrow
    ? (window.innerHeight - 116) / layout.boardAspectHeight
    : (window.innerHeight - layout.appPadding - layout.boardPanelPadding - 34) / layout.boardAspectHeight;
  const preferred = Math.floor(Math.min(widthBudget, heightBudget, layout.maxBoard));
  const size = Math.max(320, Math.min(layout.maxBoard, preferred || layout.minBoard));
  document.documentElement.style.setProperty("--board-size", `${size}px`);
}

function createInitialState(startWithComputer = false, waitForComputerStart = false) {
  const pieces = [
    ["black", "rook", 0, 0], ["black", "horse", 1, 0], ["black", "elephant", 2, 0], ["black", "advisor", 3, 0], ["black", "general", 4, 0], ["black", "advisor", 5, 0], ["black", "elephant", 6, 0], ["black", "horse", 7, 0], ["black", "rook", 8, 0],
    ["black", "cannon", 1, 2], ["black", "cannon", 7, 2],
    ["black", "soldier", 0, 3], ["black", "soldier", 2, 3], ["black", "soldier", 4, 3], ["black", "soldier", 6, 3], ["black", "soldier", 8, 3],
    ["red", "rook", 0, 9], ["red", "horse", 1, 9], ["red", "elephant", 2, 9], ["red", "advisor", 3, 9], ["red", "general", 4, 9], ["red", "advisor", 5, 9], ["red", "elephant", 6, 9], ["red", "horse", 7, 9], ["red", "rook", 8, 9],
    ["red", "cannon", 1, 7], ["red", "cannon", 7, 7],
    ["red", "soldier", 0, 6], ["red", "soldier", 2, 6], ["red", "soldier", 4, 6], ["red", "soldier", 6, 6], ["red", "soldier", 8, 6],
  ];

  return {
    turn: startWithComputer ? "black" : "red",
    winner: null,
    statsRecorded: false,
    resultShown: false,
    startedAt: null,
    elapsedMs: 0,
    message: waitForComputerStart
      ? "点击“机器先走”开始新局。"
      : (startWithComputer ? `机器正在思考（${aiNames[aiLevel]}）。` : "请选择红方棋子。"),
    captured: { red: [], black: [] },
    pieces: pieces.map(([color, type, x, y], index) => ({
      id: `${color}-${type}-${index}`,
      color,
      type,
      x,
      y,
    })),
  };
}

function cloneState(source, includeCurrentElapsed = false) {
  return {
    turn: source.turn,
    winner: source.winner,
    statsRecorded: source.statsRecorded,
    resultShown: Boolean(source.resultShown),
    startedAt: source.startedAt,
    elapsedMs: includeCurrentElapsed ? currentElapsedMs(source) : source.elapsedMs,
    message: source.message,
    captured: {
      red: [...source.captured.red],
      black: [...source.captured.black],
    },
    pieces: source.pieces.map((piece) => ({ ...piece })),
  };
}

function loadSavedGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(gameSaveKey) || "null");
    if (!saved || !saved.state || !Array.isArray(saved.state.pieces)) return false;
    state = normalizeSavedState(saved.state);
    history.length = 0;
    if (Array.isArray(saved.history)) {
      history.push(...saved.history.map(normalizeSavedState).filter(Boolean));
    }
    aiLevel = normalizeAiLevel(saved.aiLevel);
    soundEnabled = typeof saved.soundEnabled === "boolean" ? saved.soundEnabled : true;
    voiceEnabled = typeof saved.voiceEnabled === "boolean" ? saved.voiceEnabled : true;
    boardTheme = normalizeTheme(saved.boardTheme);
    computerFirst = typeof saved.computerFirst === "boolean" ? saved.computerFirst : false;
    awaitingComputerStart = typeof saved.awaitingComputerStart === "boolean" ? saved.awaitingComputerStart : false;
    lastAiMove = saved.lastAiMove || null;
    selected = null;
    legalTargets = [];
    aiThinking = false;
    restoredNeedsAiMove = state.turn === "black" && !state.winner && !awaitingComputerStart;
    updateSaveStatus(saved.savedAt, "已恢复上次棋局");
    return true;
  } catch (_error) {
    return false;
  }
}

function normalizeAiLevel(level) {
  const legacy = { easy: "amateur", normal: "strong", hard: "master" };
  const normalized = legacy[level] || level;
  return aiNames[normalized] ? normalized : "beginner";
}

function normalizeTheme(theme) {
  return themeNames[theme] ? theme : "classic";
}

function normalizeSavedState(savedState) {
  if (!savedState || !Array.isArray(savedState.pieces)) return null;
  const winner = savedState.winner === "red" || savedState.winner === "black" ? savedState.winner : null;
  const elapsedMs = Number.isFinite(savedState.elapsedMs) ? savedState.elapsedMs : 0;
  const startedAt = Number.isFinite(savedState.startedAt) ? savedState.startedAt : null;
  return {
    turn: savedState.turn === "black" ? "black" : "red",
    winner,
    statsRecorded: Boolean(savedState.statsRecorded),
    resultShown: Boolean(savedState.resultShown),
    startedAt: !winner && startedAt ? Date.now() : startedAt,
    elapsedMs,
    message: typeof savedState.message === "string" ? savedState.message : "请选择红方棋子。",
    captured: {
      red: Array.isArray(savedState.captured?.red) ? savedState.captured.red : [],
      black: Array.isArray(savedState.captured?.black) ? savedState.captured.black : [],
    },
    pieces: savedState.pieces
      .filter((piece) => piece && piece.id && piece.color && piece.type)
      .map((piece) => ({ ...piece })),
  };
}

function currentElapsedMs(currentState = state) {
  const base = Number.isFinite(currentState.elapsedMs) ? currentState.elapsedMs : 0;
  if (currentState.winner) return base;
  if (!Number.isFinite(currentState.startedAt)) return base;
  const startedAt = currentState.startedAt;
  return base + Math.max(0, Date.now() - startedAt);
}

function freezeElapsed(currentState = state) {
  currentState.elapsedMs = currentElapsedMs(currentState);
  currentState.startedAt = Number.isFinite(currentState.startedAt) ? Date.now() : null;
}

function resumeElapsed(currentState = state) {
  if (currentState.winner || !Number.isFinite(currentState.startedAt)) return;
  currentState.startedAt = Date.now();
}

function startElapsedIfNeeded(currentState = state) {
  if (currentState.winner || Number.isFinite(currentState.startedAt)) return;
  currentState.startedAt = Date.now();
}

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const two = (value) => String(value).padStart(2, "0");
  if (hours > 0) return `${hours}:${two(minutes)}:${two(seconds)}`;
  return `${two(minutes)}:${two(seconds)}`;
}

function startTimerTicker() {
  if (timerInterval) return;
  timerInterval = window.setInterval(() => {
    if (!gameTimerEl) return;
    gameTimerEl.textContent = formatElapsed(currentElapsedMs(state));
  }, 1000);
}

function saveGame() {
  try {
    const savedAt = Date.now();
    const stateToSave = cloneState(state, true);
    if (!stateToSave.winner && Number.isFinite(stateToSave.startedAt)) stateToSave.startedAt = Date.now();
    localStorage.setItem(gameSaveKey, JSON.stringify({
      state: stateToSave,
      history: history.map(cloneState),
      aiLevel,
      soundEnabled,
      voiceEnabled,
      boardTheme,
      computerFirst,
      awaitingComputerStart,
      lastAiMove,
      savedAt,
    }));
    updateSaveStatus(savedAt, "已自动保存");
  } catch (_error) {
    // Autosave should never interrupt play.
  }
}

function clearSavedGame() {
  try {
    localStorage.removeItem(gameSaveKey);
  } catch (_error) {
    // Ignore storage cleanup failures.
  }
}

function updateSaveStatus(savedAt, prefix = "已自动保存") {
  if (!saveStatusEl) return;
  if (!savedAt) {
    saveStatusEl.textContent = "自动保存已开启";
    return;
  }
  const time = new Date(savedAt).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  saveStatusEl.textContent = `${prefix} ${time}`;
}

function render() {
  boardEl.innerHTML = "";
  addBoardDecorations();
  addAiMoveTrail();

  for (let y = 0; y < ranks; y += 1) {
    for (let x = 0; x < files; x += 1) {
      const point = document.createElement("button");
      point.className = "point";
      point.type = "button";
      point.style.left = `${(x / 8) * 100}%`;
      point.style.top = `${(y / 9) * 100}%`;
      point.dataset.x = x;
      point.dataset.y = y;
      const target = legalTargets.find((move) => move.x === x && move.y === y);
      if (target) point.classList.add(target.capture ? "capture-hint" : "hint");
      point.addEventListener("click", () => onPointClick(x, y));
      boardEl.append(point);
    }
  }

  for (const piece of state.pieces) {
    const pieceEl = document.createElement("button");
    pieceEl.type = "button";
    pieceEl.className = `piece ${piece.color}`;
    if (selected?.id === piece.id) pieceEl.classList.add("selected");
    if (lastAiMove?.pieceId === piece.id) pieceEl.classList.add("ai-last");
    pieceEl.style.left = `${(piece.x / 8) * 100}%`;
    pieceEl.style.top = `${(piece.y / 9) * 100}%`;
    pieceEl.textContent = pieceNames[piece.color][piece.type];
    pieceEl.title = `${piece.color === "red" ? "红" : "黑"}${pieceNames[piece.color][piece.type]}`;
    pieceEl.addEventListener("click", () => onPieceClick(piece.id));
    boardEl.append(pieceEl);
  }

  messageEl.textContent = state.message;
  turnBadgeEl.textContent = state.winner ? `${colorName(state.winner)}胜` : `${colorName(state.turn)}走棋`;
  turnBadgeEl.className = `turn-badge ${state.winner || state.turn}`;
  undoBtn.disabled = history.length === 0;
  difficultyBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.level === aiLevel));
  firstMoveBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.first === (computerFirst ? "computer" : "player")));
  themeBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.theme === boardTheme));
  document.body.dataset.theme = boardTheme;
  soundBtn.textContent = soundEnabled ? "音效 开" : "音效 关";
  soundBtn.classList.toggle("active", soundEnabled);
  voiceBtn.textContent = voiceEnabled ? "语音 开" : "语音 关";
  voiceBtn.classList.toggle("active", voiceEnabled);
  gameTimerEl.textContent = formatElapsed(currentElapsedMs(state));
  playerWinsEl.textContent = stats.playerWins;
  computerWinsEl.textContent = stats.computerWins;
  if (engineStatus.ready) {
    const network = engineStatus.networkPath ? "，NNUE 已加载" : "";
    engineStatusEl.textContent = `${String(engineStatus.protocol || "UCCI").toUpperCase()} 引擎已启动${network}`;
  } else if (engineStatus.available) {
    engineStatusEl.textContent = "已找到引擎，等待首次启动";
  } else {
    engineStatusEl.textContent = "内置电脑";
  }
  renderCaptured();
}

function addAiMoveTrail() {
  if (!lastAiMove || !Number.isFinite(lastAiMove.fromX) || !Number.isFinite(lastAiMove.fromY)) return;

  const fromLeft = (lastAiMove.fromX / 8) * 100;
  const fromTop = (lastAiMove.fromY / 9) * 100;
  const toLeft = (lastAiMove.x / 8) * 100;
  const toTop = (lastAiMove.y / 9) * 100;
  const dx = toLeft - fromLeft;
  const dy = toTop - fromTop;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;

  const trail = document.createElement("span");
  trail.className = "ai-trail";
  trail.style.left = `${fromLeft}%`;
  trail.style.top = `${fromTop}%`;
  trail.style.width = `${length}%`;
  trail.style.transform = `rotate(${angle}deg)`;
  boardEl.append(trail);

  const fromMark = document.createElement("span");
  fromMark.className = "ai-trail-mark from";
  fromMark.style.left = `${fromLeft}%`;
  fromMark.style.top = `${fromTop}%`;
  boardEl.append(fromMark);

  const toMark = document.createElement("span");
  toMark.className = "ai-trail-mark to";
  toMark.style.left = `${toLeft}%`;
  toMark.style.top = `${toTop}%`;
  boardEl.append(toMark);
}

function addBoardDecorations() {
  for (let y = 0; y < ranks; y += 1) {
    const line = document.createElement("span");
    line.className = "grid-line horizontal";
    line.style.top = `${(y / 9) * 100}%`;
    boardEl.append(line);
  }

  for (let x = 0; x < files; x += 1) {
    const line = document.createElement("span");
    line.className = "grid-line vertical";
    line.style.left = `${(x / 8) * 100}%`;
    boardEl.append(line);
  }

  const river = document.createElement("div");
  river.className = "river";
  river.innerHTML = "<span>楚河</span><span>汉界</span>";
  boardEl.append(river);

  const top = document.createElement("div");
  top.className = "palace-line palace-top";
  boardEl.append(top);

  const bottom = document.createElement("div");
  bottom.className = "palace-line palace-bottom";
  boardEl.append(bottom);
}

function renderCaptured() {
  redCapturedEl.innerHTML = "";
  blackCapturedEl.innerHTML = "";
  for (const piece of state.captured.red) redCapturedEl.append(createCapturedPiece(piece));
  for (const piece of state.captured.black) blackCapturedEl.append(createCapturedPiece(piece));
}

function createCapturedPiece(piece) {
  const el = document.createElement("span");
  el.className = `captured-piece ${piece.color}`;
  el.textContent = pieceNames[piece.color][piece.type];
  return el;
}

function onPieceClick(id) {
  if (state.winner || aiThinking || state.turn !== "red") return;
  const piece = pieceById(id);
  if (!piece) return;

  if (piece.color === state.turn) {
    selectPiece(piece);
    return;
  }

  if (selected && legalTargets.some((move) => move.x === piece.x && move.y === piece.y)) {
    moveSelected(piece.x, piece.y);
  }
}

function onPointClick(x, y) {
  if (state.winner || aiThinking || state.turn !== "red") return;
  const piece = pieceAt(x, y);
  if (piece) {
    onPieceClick(piece.id);
    return;
  }
  if (selected && legalTargets.some((move) => move.x === x && move.y === y)) {
    moveSelected(x, y);
  }
}

function selectPiece(piece) {
  selected = piece;
  legalTargets = legalMovesFor(piece, state);
  state.message = legalTargets.length
    ? `已选择${pieceNames[piece.color][piece.type]}。`
    : `这个${pieceNames[piece.color][piece.type]}暂时没有可走位置。`;
  playSound("select");
  render();
}

function moveSelected(x, y) {
  lastAiMove = null;
  makeMove(selected.id, x, y, true);
}

function makeMove(pieceId, x, y, saveHistory) {
  const piece = pieceById(pieceId);
  if (!piece) return;
  const captured = pieceAt(x, y);
  if (saveHistory) history.push(cloneState(state, true));
  startElapsedIfNeeded();

  if (captured) {
    state.pieces = state.pieces.filter((item) => item.id !== captured.id);
    state.captured[piece.color].push({ color: captured.color, type: captured.type });
  }

  piece.x = x;
  piece.y = y;
  selected = null;
  legalTargets = [];

  const mover = state.turn;
  const opponent = opposite(mover);
  let sound = captured ? "capture" : "move";
  if (captured?.type === "general") {
    state.winner = mover;
    freezeElapsed();
    state.message = `${colorName(mover)}吃掉主帅，获胜。`;
    sound = "win";
  } else {
    state.turn = opponent;
    const checked = isInCheck(opponent, state);
    const canMove = hasAnyLegalMove(opponent, state);
    if (checked && !canMove) {
      state.winner = opposite(opponent);
      freezeElapsed();
      state.message = `将死，${colorName(state.winner)}获胜。`;
      sound = "win";
    } else if (checked) {
      state.message = `${colorName(opponent)}被将军。`;
      sound = "check";
    } else if (!canMove) {
      state.winner = opposite(opponent);
      freezeElapsed();
      state.message = `${colorName(opponent)}无棋可走，${colorName(state.winner)}获胜。`;
      sound = "win";
    } else {
      state.message = state.turn === "black" ? `机器正在思考（${aiNames[aiLevel]}）。` : `轮到${colorName(state.turn)}。`;
    }
  }

  playSound(sound);
  recordWinnerIfNeeded();
  showWinnerResultOnce();
  saveGame();
  render();

  if (!state.winner && state.turn === "black") {
    queueAiMove();
  }
}

function legalMoves(piece, currentState) {
  const moves = [];
  const add = (x, y) => {
    if (!inside(x, y)) return;
    const target = pieceAt(x, y, currentState);
    if (!target || target.color !== piece.color) {
      moves.push({ x, y, capture: Boolean(target) });
    }
  };

  if (piece.type === "general") {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = piece.x + dx;
      const y = piece.y + dy;
      if (inPalace(piece.color, x, y)) add(x, y);
    }
    const enemyGeneral = currentState.pieces.find((item) => item.color !== piece.color && item.type === "general");
    if (enemyGeneral && enemyGeneral.x === piece.x && clearFile(piece.x, piece.y, enemyGeneral.y, currentState)) {
      add(enemyGeneral.x, enemyGeneral.y);
    }
  }

  if (piece.type === "advisor") {
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = piece.x + dx;
      const y = piece.y + dy;
      if (inPalace(piece.color, x, y)) add(x, y);
    }
  }

  if (piece.type === "elephant") {
    for (const [dx, dy] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
      const x = piece.x + dx;
      const y = piece.y + dy;
      const eyeX = piece.x + dx / 2;
      const eyeY = piece.y + dy / 2;
      const ownSide = piece.color === "red" ? y >= 5 : y <= 4;
      if (inside(x, y) && ownSide && !pieceAt(eyeX, eyeY, currentState)) add(x, y);
    }
  }

  if (piece.type === "horse") {
    const patterns = [
      [1, 2, 0, 1], [-1, 2, 0, 1], [1, -2, 0, -1], [-1, -2, 0, -1],
      [2, 1, 1, 0], [2, -1, 1, 0], [-2, 1, -1, 0], [-2, -1, -1, 0],
    ];
    for (const [dx, dy, blockX, blockY] of patterns) {
      if (!pieceAt(piece.x + blockX, piece.y + blockY, currentState)) add(piece.x + dx, piece.y + dy);
    }
  }

  if (piece.type === "rook") {
    addLineMoves(piece, currentState, moves, false);
  }

  if (piece.type === "cannon") {
    addLineMoves(piece, currentState, moves, true);
  }

  if (piece.type === "soldier") {
    const forward = piece.color === "red" ? -1 : 1;
    add(piece.x, piece.y + forward);
    const crossedRiver = piece.color === "red" ? piece.y <= 4 : piece.y >= 5;
    if (crossedRiver) {
      add(piece.x + 1, piece.y);
      add(piece.x - 1, piece.y);
    }
  }

  return moves;
}

function legalMovesFor(piece, currentState) {
  return legalMoves(piece, currentState).filter((move) => !wouldExposeGeneral(piece, move.x, move.y, currentState));
}

function addLineMoves(piece, currentState, moves, isCannon) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let x = piece.x + dx;
    let y = piece.y + dy;
    let jumped = false;
    while (inside(x, y)) {
      const target = pieceAt(x, y, currentState);
      if (!isCannon) {
        if (!target) {
          moves.push({ x, y, capture: false });
        } else {
          if (target.color !== piece.color) moves.push({ x, y, capture: true });
          break;
        }
      } else if (!jumped) {
        if (!target) moves.push({ x, y, capture: false });
        else jumped = true;
      } else if (target) {
        if (target.color !== piece.color) moves.push({ x, y, capture: true });
        break;
      }
      x += dx;
      y += dy;
    }
  }
}

function wouldExposeGeneral(piece, x, y, currentState = state) {
  const next = cloneState(currentState);
  const moving = next.pieces.find((item) => item.id === piece.id);
  const target = next.pieces.find((item) => item.x === x && item.y === y);
  if (target) next.pieces = next.pieces.filter((item) => item.id !== target.id);
  moving.x = x;
  moving.y = y;
  return isInCheck(piece.color, next);
}

function isInCheck(color, currentState) {
  const general = currentState.pieces.find((piece) => piece.color === color && piece.type === "general");
  if (!general) return true;
  return currentState.pieces
    .filter((piece) => piece.color !== color)
    .some((piece) => legalMoves(piece, currentState).some((move) => move.x === general.x && move.y === general.y));
}

function hasAnyLegalMove(color, currentState = state) {
  return currentState.pieces
    .filter((piece) => piece.color === color)
    .some((piece) => legalMovesFor(piece, currentState).length > 0);
}

function queueAiMove() {
  aiThinking = true;
  selected = null;
  legalTargets = [];
  state.message = engineStatus.available
    ? `引擎正在思考（${aiNames[aiLevel]}）。`
    : `机器正在思考（${aiNames[aiLevel]}）。`;
  render();
  window.setTimeout(async () => {
    const move = await chooseAiMove();
    aiThinking = false;
    if (!move) {
      state.winner = "red";
      freezeElapsed();
      state.message = "黑方无棋可走，红方获胜。";
      recordWinnerIfNeeded();
      showWinnerResultOnce();
      saveGame();
      render();
      return;
    }
    lastAiMove = {
      pieceId: move.piece.id,
      fromX: move.piece.x,
      fromY: move.piece.y,
      x: move.x,
      y: move.y,
    };
    const capturedByAi = move.capture ? { ...move.capture } : null;
    makeMove(move.piece.id, move.x, move.y, false);
    const movedPiece = pieceById(move.piece.id);
    const checkedRed = !state.winner && isInCheck("red", state);
    const aiWon = state.winner === "black";
    if (movedPiece && !state.winner) {
      const source = move.source === "engine" ? "引擎" : "内置电脑";
      const note = move.fallbackReason ? `（${move.fallbackReason}）` : "";
      const action = aiMoveActionText(movedPiece, capturedByAi, checkedRed, aiWon);
      state.message = `${source}${action}到 ${move.x + 1} 路 ${move.y + 1} 线${note}。轮到红方。`;
      refreshEngineStatus();
      saveGame();
      render();
    }
    speakAiMove(movedPiece, capturedByAi, checkedRed, aiWon);
  }, 420);
}

async function chooseAiMove() {
  const engineMove = await chooseEngineMove();
  if (engineMove) return engineMove;

  const expectedEngine = Boolean(engineProfiles[aiLevel]);
  if (expectedEngine && engineStatus.available) {
    state.message = lastEngineFailure || (lastEngineReply
      ? `引擎返回 ${lastEngineReply}，当前坐标无法落子，已临时使用内置电脑。`
      : "引擎没有返回可用走法，已临时使用内置电脑。");
    render();
  }

  const moves = allLegalMoves("black", state);
  if (!moves.length) return null;

  if (aiLevel === "beginner") {
    return withFallbackReason(pickHumanLikeMove(moves, aiProfiles.beginner), lastEngineFailure || "外部引擎不可用");
  }

  if (aiLevel === "amateur") {
    return withFallbackReason(bestMoveByScore(moves, aiProfiles.amateur), lastEngineFailure || "外部引擎不可用");
  }

  return withFallbackReason(bestMoveByScore(moves, aiProfiles[aiLevel]), lastEngineFailure || "外部引擎不可用");
}

async function chooseEngineMove() {
  if (!hasExternalEngineBridge()) return null;
  const profile = engineProfiles[aiLevel];
  if (!profile) return null;

  try {
    lastEngineFailure = "";
    const fen = stateToFen(state);
    const result = await getExternalBestMove({
      fen,
      depth: profile.depth,
      moveTime: profile.moveTime,
      multiPv: profile.multiPv,
      candidateRank: profile.candidateRank,
    });
    lastEngineReply = result?.bestMove || result?.reason || "";
    if (!result?.ok || !result.bestMove) {
      const details = Array.isArray(result?.details) && result.details.length
        ? `：${result.details.slice(-3).join(" / ")}`
        : "";
      const reason = result?.reason === "missing-network"
        ? "缺少 pikafish.nnue 评估文件"
        : (result?.reason || "unknown");
      lastEngineFailure = `引擎未给出 bestmove（${reason}${details}），已临时使用内置电脑。`;
      return null;
    }
    const move = engineMoveToLocalMove(result.bestMove);
    if (!move) {
      lastEngineFailure = `引擎返回 ${result.bestMove}，但无法匹配当前黑方合法走法，已临时使用内置电脑。`;
    }
    return move;
  } catch (error) {
    lastEngineFailure = `引擎启动或通信失败：${error?.message || error}。已临时使用内置电脑。`;
    return null;
  }
}

function hasExternalEngineBridge() {
  return Boolean(window.chessEngine?.getBestMove || window.__TAURI__?.core?.invoke);
}

async function getExternalBestMove(payload) {
  if (window.chessEngine?.getBestMove) {
    return window.chessEngine.getBestMove(payload);
  }
  return window.__TAURI__.core.invoke("get_best_move", { payload });
}

function withFallbackReason(move, reason = "") {
  if (!move) return null;
  return {
    ...move,
    source: "fallback",
    fallbackReason: reason,
  };
}

function engineMoveToLocalMove(bestMove) {
  const match = String(bestMove).trim().match(/^([a-i])([0-9])([a-i])([0-9])$/i);
  if (!match) return null;

  const rawFromX = match[1].toLowerCase().charCodeAt(0) - 97;
  const rawToX = match[3].toLowerCase().charCodeAt(0) - 97;
  const rawFromRank = Number(match[2]);
  const rawToRank = Number(match[4]);

  const candidates = [
    [rawFromX, 9 - rawFromRank, rawToX, 9 - rawToRank],
    [8 - rawFromX, 9 - rawFromRank, 8 - rawToX, 9 - rawToRank],
    [rawFromX, rawFromRank, rawToX, rawToRank],
    [8 - rawFromX, rawFromRank, 8 - rawToX, rawToRank],
  ];

  for (const [fromX, fromY, toX, toY] of candidates) {
    const move = buildEngineMove(fromX, fromY, toX, toY);
    if (move) return move;
  }

  return null;
}

function buildEngineMove(fromX, fromY, toX, toY) {
  const piece = pieceAt(fromX, fromY);
  if (!piece || piece.color !== "black") return null;
  const legal = legalMovesFor(piece, state).some((move) => move.x === toX && move.y === toY);
  if (!legal) return null;

  return {
    piece,
    x: toX,
    y: toY,
    capture: pieceAt(toX, toY),
    source: "engine",
  };
}

function stateToFen(currentState) {
  const symbolMap = {
    black: { general: "k", advisor: "a", elephant: "b", horse: "n", rook: "r", cannon: "c", soldier: "p" },
    red: { general: "K", advisor: "A", elephant: "B", horse: "N", rook: "R", cannon: "C", soldier: "P" },
  };

  const rows = [];
  for (let y = 0; y < ranks; y += 1) {
    let row = "";
    let empty = 0;
    for (let x = 0; x < files; x += 1) {
      const piece = pieceAt(x, y, currentState);
      if (!piece) {
        empty += 1;
      } else {
        if (empty) {
          row += empty;
          empty = 0;
        }
        row += symbolMap[piece.color][piece.type];
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }

  return `${rows.join("/")} ${currentState.turn === "red" ? "w" : "b"} - - 0 1`;
}

function pickHumanLikeMove(moves, profile) {
  const scored = moves
    .map((move) => ({
      move,
      score: quickMoveScore(move, state) + Math.random() * profile.noise,
    }))
    .sort((a, b) => b.score - a.score);
  const topCount = Math.min(profile.randomTop, scored.length);
  const pool = scored.slice(0, topCount);
  return pool[Math.floor(Math.random() * pool.length)]?.move || scored[0]?.move || null;
}

function bestMoveByScore(moves, profile) {
  let best = null;
  let bestScore = -Infinity;
  const ordered = orderMoves(moves, state, "black").slice(0, profile.candidateLimit);
  for (const move of ordered) {
    const next = applyMoveToState(state, move);
    const score = minimax(next, profile.depth - 1, false, -Infinity, Infinity, profile) + moveTieBreak(move, state);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}

function quickMoveScore(move, currentState) {
  let score = moveOrderScore(move, currentState, move.piece.color);
  if (givesCheck(move, currentState)) score += 180;
  const next = applyMoveToState(currentState, move);
  if (winnerOf(next) === move.piece.color) score += 200000;
  return score;
}

function minimax(currentState, depth, maximizingBlack, alpha, beta, profile) {
  const winner = winnerOf(currentState);
  if (winner) return winner === "black" ? 999999 : -999999;
  if (depth === 0) return tacticalEvaluation(currentState, maximizingBlack, alpha, beta, profile);

  const color = maximizingBlack ? "black" : "red";
  const moves = orderMoves(allLegalMoves(color, currentState), currentState, color).slice(0, profile.candidateLimit);
  if (!moves.length) return maximizingBlack ? -999999 : 999999;

  if (maximizingBlack) {
    let value = -Infinity;
    for (const move of moves) {
      value = Math.max(value, minimax(applyMoveToState(currentState, move), depth - 1, false, alpha, beta, profile));
      alpha = Math.max(alpha, value);
      if (beta <= alpha) break;
    }
    return value;
  }

  let value = Infinity;
  for (const move of moves) {
    value = Math.min(value, minimax(applyMoveToState(currentState, move), depth - 1, true, alpha, beta, profile));
    beta = Math.min(beta, value);
    if (beta <= alpha) break;
  }
  return value;
}

function tacticalEvaluation(currentState, maximizingBlack, alpha, beta, profile) {
  let standPat = evaluateState(currentState);
  if (profile.noise) standPat += (Math.random() - 0.5) * profile.noise;
  const color = maximizingBlack ? "black" : "red";
  const tacticalMoves = orderMoves(allLegalMoves(color, currentState), currentState, color)
    .filter((move) => move.capture)
    .slice(0, 6);

  if (!tacticalMoves.length) return standPat;

  if (maximizingBlack) {
    let value = standPat;
    for (const move of tacticalMoves) {
      value = Math.max(value, evaluateState(applyMoveToState(currentState, move)));
      alpha = Math.max(alpha, value);
      if (beta <= alpha) break;
    }
    return value;
  }

  let value = standPat;
  for (const move of tacticalMoves) {
    value = Math.min(value, evaluateState(applyMoveToState(currentState, move)));
    beta = Math.min(beta, value);
    if (beta <= alpha) break;
  }
  return value;
}

function orderMoves(moves, currentState, color) {
  return [...moves].sort((a, b) => moveOrderScore(b, currentState, color) - moveOrderScore(a, currentState, color));
}

function moveOrderScore(move, currentState, color) {
  let score = 0;
  if (move.capture) {
    score += pieceValues[move.capture.type] * 10 - pieceValues[move.piece.type];
    if (move.capture.type === "general") score += 200000;
  }
  score += positionalScore({ ...move.piece, x: move.x, y: move.y }) - positionalScore(move.piece);
  if (color === "black") score += move.y * 3;
  else score += (9 - move.y) * 3;
  return score;
}

function moveTieBreak(move, currentState) {
  const next = applyMoveToState(currentState, move);
  return evaluateState(next) * 0.001 + moveOrderScore(move, currentState, move.piece.color) * 0.01;
}

function allLegalMoves(color, currentState) {
  return currentState.pieces
    .filter((piece) => piece.color === color)
    .flatMap((piece) => legalMovesFor(piece, currentState).map((move) => ({
      piece,
      x: move.x,
      y: move.y,
      capture: pieceAt(move.x, move.y, currentState),
    })));
}

function applyMoveToState(currentState, move) {
  const next = cloneState(currentState);
  const moving = next.pieces.find((piece) => piece.id === move.piece.id);
  const target = next.pieces.find((piece) => piece.x === move.x && piece.y === move.y);
  if (target) next.pieces = next.pieces.filter((piece) => piece.id !== target.id);
  moving.x = move.x;
  moving.y = move.y;
  next.turn = opposite(currentState.turn);
  return next;
}

function givesCheck(move, currentState) {
  const next = applyMoveToState(currentState, move);
  return isInCheck(opposite(move.piece.color), next);
}

function winnerOf(currentState) {
  const redGeneral = currentState.pieces.some((piece) => piece.color === "red" && piece.type === "general");
  const blackGeneral = currentState.pieces.some((piece) => piece.color === "black" && piece.type === "general");
  if (!redGeneral) return "black";
  if (!blackGeneral) return "red";
  return null;
}

function evaluateState(currentState) {
  let score = 0;
  for (const piece of currentState.pieces) {
    const direction = piece.color === "black" ? 1 : -1;
    let value = pieceValues[piece.type] + positionalScore(piece);
    if (piece.type === "rook" || piece.type === "cannon" || piece.type === "horse") {
      value += legalMoves(piece, currentState).length * 5;
    }
    score += direction * value;
  }
  score += palaceSafety(currentState, "black");
  score -= palaceSafety(currentState, "red");
  if (isInCheck("red", currentState)) score += 110;
  if (isInCheck("black", currentState)) score -= 140;
  return score;
}

function positionalScore(piece) {
  const advance = piece.color === "black" ? piece.y : 9 - piece.y;
  const center = 4 - Math.abs(4 - piece.x);
  const riverCrossed = piece.color === "black" ? piece.y >= 5 : piece.y <= 4;

  if (piece.type === "soldier") {
    return advance * 22 + center * 8 + (riverCrossed ? 80 : 0);
  }

  if (piece.type === "horse") {
    return center * 18 + Math.min(advance, 5) * 10;
  }

  if (piece.type === "cannon") {
    return center * 14 + (piece.y >= 2 && piece.y <= 7 ? 35 : 0);
  }

  if (piece.type === "rook") {
    return center * 10 + (piece.x === 0 || piece.x === 8 ? -22 : 18);
  }

  if (piece.type === "general") {
    return -Math.abs(4 - piece.x) * 14;
  }

  return center * 4;
}

function palaceSafety(currentState, color) {
  const general = currentState.pieces.find((piece) => piece.color === color && piece.type === "general");
  if (!general) return -12000;
  const guards = currentState.pieces.filter((piece) =>
    piece.color === color && (piece.type === "advisor" || piece.type === "elephant")
  ).length;
  const homeRank = color === "black" ? general.y : 9 - general.y;
  return guards * 18 - homeRank * 20;
}

function pieceAt(x, y, currentState = state) {
  return currentState.pieces.find((piece) => piece.x === x && piece.y === y);
}

function pieceById(id) {
  return state.pieces.find((piece) => piece.id === id);
}

function clearFile(x, y1, y2, currentState) {
  const start = Math.min(y1, y2) + 1;
  const end = Math.max(y1, y2);
  for (let y = start; y < end; y += 1) {
    if (pieceAt(x, y, currentState)) return false;
  }
  return true;
}

function inside(x, y) {
  return x >= 0 && x < files && y >= 0 && y < ranks;
}

function inPalace(color, x, y) {
  const yMin = color === "red" ? 7 : 0;
  const yMax = color === "red" ? 9 : 2;
  return x >= 3 && x <= 5 && y >= yMin && y <= yMax;
}

function opposite(color) {
  return color === "red" ? "black" : "red";
}

function colorName(color) {
  return color === "red" ? "红方" : "黑方";
}

function loadStats() {
  try {
    const parsed = JSON.parse(localStorage.getItem(statsSaveKey) || "{}");
    return {
      playerWins: Number.isFinite(parsed.playerWins) ? parsed.playerWins : 0,
      computerWins: Number.isFinite(parsed.computerWins) ? parsed.computerWins : 0,
    };
  } catch (_error) {
    return { playerWins: 0, computerWins: 0 };
  }
}

function saveStats() {
  localStorage.setItem(statsSaveKey, JSON.stringify(stats));
}

function recordWinnerIfNeeded() {
  if (!state.winner || state.statsRecorded) return;
  if (state.winner === "red") stats.playerWins += 1;
  if (state.winner === "black") stats.computerWins += 1;
  state.statsRecorded = true;
  saveStats();
}

function unrecordWinnerIfNeeded() {
  if (!state.winner || !state.statsRecorded) return;
  if (state.winner === "red") stats.playerWins = Math.max(0, stats.playerWins - 1);
  if (state.winner === "black") stats.computerWins = Math.max(0, stats.computerWins - 1);
  state.statsRecorded = false;
  saveStats();
}

function resetStats() {
  stats = { playerWins: 0, computerWins: 0 };
  saveStats();
  state.message = "输赢次数统计已重置。";
  saveGame();
  render();
}

function playSound(type) {
  if (!soundEnabled || typeof window === "undefined") return;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return;

  audioContext ||= new AudioCtor();
  if (audioContext.state === "suspended") audioContext.resume();

  const now = audioContext.currentTime;
  const master = audioContext.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.16, now + 0.012);
  master.gain.exponentialRampToValueAtTime(0.0001, now + soundDuration(type));
  master.connect(audioContext.destination);

  for (const note of soundNotes(type)) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = note.wave || "sine";
    osc.frequency.setValueAtTime(note.freq, now + note.delay);
    if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, now + note.delay + note.length);
    gain.gain.setValueAtTime(note.gain || 0.55, now + note.delay);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.delay + note.length);
    osc.connect(gain).connect(master);
    osc.start(now + note.delay);
    osc.stop(now + note.delay + note.length + 0.02);
  }
}

function aiMoveActionText(piece, captured, checked, won) {
  let text = `走了${pieceNames.black[piece.type]}`;
  if (captured) text += `，吃掉${pieceNames.red[captured.type]}`;
  if (won) text += "，取得胜利";
  else if (checked) text += "，将军";
  return text;
}

function speakAiMove(piece, captured, checked, won) {
  if (!voiceEnabled || !piece || typeof window === "undefined") return;
  if (!captured && !checked && !won) return;

  if (won) {
    playVoice("win");
  } else if (captured && checked) {
    playVoice("captureCheck");
  } else if (captured) {
    playVoice("capture");
  } else if (checked) {
    playVoice("check");
  }
}

function playVoice(type) {
  const src = voiceFiles[type];
  if (!src) return;
  const audio = new Audio(src);
  audio.volume = 0.9;
  audio.play().catch(() => {
    const fallbackSrc = voiceFallbackFiles[type];
    if (!fallbackSrc) return;
    const fallback = new Audio(fallbackSrc);
    fallback.volume = 0.9;
    fallback.play().catch(() => {});
  });
}

function showResult(text) {
  if (!resultOverlay.hidden && resultTitle.textContent === text) return;
  resultTitle.textContent = text;
  resultOverlay.hidden = false;
}

function hideResult() {
  resultOverlay.hidden = true;
}

function showWinnerResultOnce() {
  if (!state.winner || state.resultShown) return;
  state.resultShown = true;
  if (state.winner === "red") {
    playVoice("lose");
    showResult("恭喜，你胜利了！");
  } else if (state.winner === "black") {
    showResult("你已失败");
  }
}

function showResetStatsConfirm() {
  confirmOverlay.hidden = false;
}

function hideResetStatsConfirm() {
  confirmOverlay.hidden = true;
}

function showFirstMoveConfirm(nextComputerFirst) {
  pendingComputerFirst = nextComputerFirst;
  const label = nextComputerFirst ? "机器先走" : "玩家先走";
  firstMoveConfirmCopy.textContent = `将切换为“${label}”，并重开当前棋局。确定要继续吗？`;
  firstMoveConfirmOverlay.hidden = false;
}

function hideFirstMoveConfirm() {
  pendingComputerFirst = null;
  firstMoveConfirmOverlay.hidden = true;
}

function startNewGame() {
  aiThinking = false;
  awaitingComputerStart = computerFirst;
  state = createInitialState(computerFirst, awaitingComputerStart);
  history.length = 0;
  selected = null;
  legalTargets = [];
  lastAiMove = null;
  hideResult();
  playSound("reset");
  saveGame();
  render();
}

function startComputerFirstMove() {
  if (!computerFirst || !awaitingComputerStart || aiThinking || state.winner) return;
  awaitingComputerStart = false;
  state.message = `机器正在思考（${aiNames[aiLevel]}）。`;
  saveGame();
  render();
  window.setTimeout(queueAiMove, 300);
}

function soundDuration(type) {
  return {
    select: 0.1,
    move: 0.18,
    capture: 0.24,
    check: 0.42,
    win: 0.72,
    undo: 0.16,
    reset: 0.22,
  }[type] || 0.18;
}

function soundNotes(type) {
  const sounds = {
    select: [{ freq: 660, to: 760, length: 0.08, delay: 0, gain: 0.35, wave: "triangle" }],
    move: [
      { freq: 260, to: 210, length: 0.11, delay: 0, gain: 0.62, wave: "triangle" },
      { freq: 520, to: 460, length: 0.08, delay: 0.03, gain: 0.24, wave: "sine" },
    ],
    capture: [
      { freq: 150, to: 90, length: 0.18, delay: 0, gain: 0.78, wave: "sawtooth" },
      { freq: 920, to: 420, length: 0.12, delay: 0.02, gain: 0.28, wave: "square" },
    ],
    check: [
      { freq: 440, to: 660, length: 0.14, delay: 0, gain: 0.42, wave: "triangle" },
      { freq: 660, to: 880, length: 0.16, delay: 0.13, gain: 0.44, wave: "triangle" },
      { freq: 880, to: 740, length: 0.13, delay: 0.28, gain: 0.35, wave: "sine" },
    ],
    win: [
      { freq: 392, length: 0.16, delay: 0, gain: 0.42, wave: "triangle" },
      { freq: 523, length: 0.16, delay: 0.15, gain: 0.44, wave: "triangle" },
      { freq: 659, length: 0.2, delay: 0.3, gain: 0.48, wave: "triangle" },
      { freq: 784, length: 0.24, delay: 0.48, gain: 0.38, wave: "sine" },
    ],
    undo: [{ freq: 420, to: 260, length: 0.14, delay: 0, gain: 0.4, wave: "triangle" }],
    reset: [
      { freq: 240, to: 360, length: 0.12, delay: 0, gain: 0.34, wave: "sine" },
      { freq: 360, to: 480, length: 0.12, delay: 0.11, gain: 0.34, wave: "sine" },
    ],
  };
  return sounds[type] || sounds.move;
}

undoBtn.addEventListener("click", () => {
  if (aiThinking) return;
  if (!history.length) return;
  unrecordWinnerIfNeeded();
  state = history.pop();
  if (!state.winner) resumeElapsed();
  selected = null;
  legalTargets = [];
  lastAiMove = null;
  hideResult();
  playSound("undo");
  saveGame();
  render();
});

resetBtn.addEventListener("click", () => {
  startNewGame();
});

resultCloseBtn.addEventListener("click", hideResult);

resetStatsBtn.addEventListener("click", () => {
  showResetStatsConfirm();
});

cancelResetStatsBtn.addEventListener("click", hideResetStatsConfirm);

confirmResetStatsBtn.addEventListener("click", () => {
  hideResetStatsConfirm();
  resetStats();
});

soundBtn.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  if (soundEnabled) playSound("select");
  saveGame();
  render();
});

voiceBtn.addEventListener("click", () => {
  voiceEnabled = !voiceEnabled;
  saveGame();
  render();
});

difficultyBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (aiThinking) return;
    aiLevel = btn.dataset.level;
    state.message = `机器难度已切换为${aiNames[aiLevel]}。`;
    saveGame();
    render();
  });
});

firstMoveBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (aiThinking) return;
    const nextComputerFirst = btn.dataset.first === "computer";
    if (computerFirst === nextComputerFirst) {
      if (nextComputerFirst) startComputerFirstMove();
      return;
    }
    showFirstMoveConfirm(nextComputerFirst);
  });
});

cancelFirstMoveBtn.addEventListener("click", hideFirstMoveConfirm);

confirmFirstMoveBtn.addEventListener("click", () => {
  if (pendingComputerFirst === null) return;
  computerFirst = pendingComputerFirst;
  hideFirstMoveConfirm();
  startNewGame();
});

themeBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    boardTheme = normalizeTheme(btn.dataset.theme);
    state.message = `棋盘风格已切换为${themeNames[boardTheme]}。`;
    saveGame();
    render();
  });
});

window.addEventListener("resize", fitBoardToViewport);
window.addEventListener("beforeunload", () => {
  if (!state.winner) freezeElapsed();
  saveGame();
});
loadSavedGame();
fitBoardToViewport();
refreshEngineStatus();
render();
startTimerTicker();
if (restoredNeedsAiMove) {
  state.message = "已恢复棋局，电脑继续思考。";
  render();
  window.setTimeout(queueAiMove, 300);
}

async function refreshEngineStatus() {
  if (!hasExternalEngineBridge()) return;
  try {
    if (window.chessEngine?.getStatus) {
      engineStatus = await window.chessEngine.getStatus();
    } else {
      engineStatus = await window.__TAURI__.core.invoke("get_engine_status");
    }
    render();
  } catch (_error) {
    engineStatus = { available: false, ready: false };
    render();
  }
}
