# UCCI engine folder

Place a UCCI-compatible Xiangqi engine here.

Recommended filenames:

- `pikafish.exe` on Windows
- `pikafish` on macOS/Linux
- `eleeye.exe`
- `engine.exe`

Pikafish also needs its NNUE evaluation network file in this folder:

- `pikafish.nnue`

You can also set `CHESS_ENGINE_PATH` to an absolute engine path before starting Electron.
You can set `PIKAFISH_NNUE_PATH` to an absolute `pikafish.nnue` path when the network file is stored elsewhere.

The app will fall back to its built-in JavaScript AI when no engine is found.
