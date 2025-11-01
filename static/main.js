// ===== 盤パラメータ（半径5：61マス） =====
const RADIUS = 5;
const HEX_SIZE = 28; // SVG内での1辺目安

// 六角の6方向（axial座標: q, r）
const DIRS = [
  [+1, 0], [+1, -1], [0, -1],
  [-1, 0], [-1, +1], [0, +1],
];

const state = {
  cells: new Map(),      // key "q,r" -> {q,r, x,y, stone:0|1|2}
  turn: 1,               // 1:黄, 2:白
  history: [],           // {key, prevTurn}
  gameOver: false,
  lastPlaced: null,
  winLine: null
};

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const hintToggle = document.getElementById("hintToggle");

// ===== 座標ユーティリティ =====
const keyOf = (q, r) => `${q},${r}`;

function axialToPixel(q, r) {
  // pointy-top hex axial -> pixel（OpenGL風）
  const x = HEX_SIZE * (Math.sqrt(3) * q + Math.sqrt(3)/2 * r);
  const y = HEX_SIZE * (3/2 * r);
  return { x, y };
}

function hexPolygonPoints(x, y, size) {
  // 頂点6点の座標列
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 180 * (60 * i - 30); // pointy-top
    pts.push([x + size * Math.cos(angle), y + size * Math.sin(angle)]);
  }
  return pts.map(p => p.join(",")).join(" ");
}

// ===== 盤生成 =====
function generateBoard() {
  boardEl.innerHTML = ""; // クリア
  state.cells.clear();
  state.turn = 1;
  state.history = [];
  state.gameOver = false;
  state.lastPlaced = null;
  state.winLine = null;

  // 盤（正六角形領域）
  for (let q = -RADIUS + 1; q <= RADIUS - 1; q++) {
    const r1 = Math.max(-RADIUS + 1, -q - RADIUS + 1);
    const r2 = Math.min(RADIUS - 1, -q + RADIUS - 1);
    for (let r = r1; r <= r2; r++) {
      const { x, y } = axialToPixel(q, r);
      const k = keyOf(q, r);

      // セル背景
      const hex = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      hex.setAttribute("points", hexPolygonPoints(x, y, HEX_SIZE * 0.98));
      hex.classList.add("hex");
      hex.dataset.key = k;
      hex.addEventListener("click", onPlace);

      // 石（空で作っておく）
      const stone = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      stone.setAttribute("cx", x);
      stone.setAttribute("cy", y);
      stone.setAttribute("r", HEX_SIZE * 0.55);
      stone.setAttribute("opacity", "0");
      stone.classList.add("stone");
      stone.dataset.key = k;

      boardEl.appendChild(hex);
      boardEl.appendChild(stone);

      state.cells.set(k, { q, r, x, y, stone: 0, stoneEl: stone, hexEl: hex, hintEl: null });
    }
  }
  setStatus();
}

function setStatus(msg) {
  if (msg) { statusEl.textContent = msg; return; }
  const turnName = state.turn === 1 ? "黄" : "白";
  statusEl.textContent = state.gameOver ? "(終了)" : `手番: ${turnName}`;
}

// ===== 手を打つ =====
function onPlace(e) {
  if (state.gameOver) return;
  const k = e.currentTarget.dataset.key;
  const cell = state.cells.get(k);
  if (!cell || cell.stone !== 0) return;

  placeStone(k, state.turn);
  const outcome = evaluateAfterMove(cell.q, cell.r, state.turn);
  if (outcome.win) {
    drawWinLine(outcome.line);
    state.gameOver = true;
    setStatus(`勝ち！（${state.turn === 1 ? "黄" : "白"}の4連）`);
  } else if (outcome.lose) {
    state.gameOver = true;
    setStatus(`負け…（${state.turn === 1 ? "黄" : "白"}が3連を作成）`);
  } else {
    // ターン交代
    state.turn = 3 - state.turn;
    setStatus();
    if (hintToggle.checked) refreshHints();
  }
}

function placeStone(k, player) {
  const cell = state.cells.get(k);
  cell.stone = player;
  cell.stoneEl.setAttribute("opacity", "1");
  cell.stoneEl.classList.toggle("p1", player === 1);
  cell.stoneEl.classList.toggle("p2", player === 2);
  state.history.push({ key: k, prevTurn: 3 - player });
  state.lastPlaced = k;
}

function undo() {
  if (state.history.length === 0 || state.gameOver && !state.winLine) return;
  // 消す
  const last = state.history.pop();
  const cell = state.cells.get(last.key);
  cell.stone = 0;
  cell.stoneEl.setAttribute("opacity", "0");
  // 終局解除
  state.gameOver = false;
  if (state.winLine) {
    state.winLine.remove();
    state.winLine = null;
  }
  // ターン戻し
  state.turn = 3 - state.turn;
  setStatus();
  refreshHints();
}

document.getElementById("resetBtn").addEventListener("click", generateBoard);
document.getElementById("undoBtn").addEventListener("click", undo);
hintToggle.addEventListener("change", () => refreshHints());

// ===== 判定（4連勝ち／3連負け） =====
function evaluateAfterMove(q, r, player) {
  let win = false;
  let lose = false;
  let winLine = null;

  // 3軸（反対方向をまとめて1軸として数える）
  for (let i = 0; i < 3; i++) {
    const [dq1, dr1] = DIRS[i];
    const [dq2, dr2] = DIRS[i + 3];
    const len1 = countDir(q, r, dq1, dr1, player);
    const len2 = countDir(q, r, dq2, dr2, player);
    const total = 1 + len1 + len2;

    if (total >= 4) {
      win = true;
      // 直線の端点2つを記録しておく（描画用）
      const start = axialToPixel(q + dq1 * len1 * -1, r + dr1 * len1 * -1);
      const end   = axialToPixel(q + dq2 * len2 * -1, r + dr2 * len2 * -1);
      winLine = [start, end];
    } else if (total === 3) {
      // 「ちょうど3」で負け（4未満の条件でのみ）
      lose = true;
    }
  }
  return { win, lose: !win && lose, line: winLine };
}

function countDir(q, r, dq, dr, player) {
  let n = 0;
  while (true) {
    q += dq; r += dr;
    const c = state.cells.get(keyOf(q, r));
    if (c && c.stone === player) n++;
    else break;
  }
  return n;
}

// ===== 勝ち筋可視化 =====
function drawWinLine(line) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "line");
  path.setAttribute("x1", line[0].x);
  path.setAttribute("y1", line[0].y);
  path.setAttribute("x2", line[1].x);
  path.setAttribute("y2", line[1].y);
  path.classList.add("win-line");
  boardEl.appendChild(path);
  state.winLine = path;
}

// ===== “安全なリーチ(1空2)”のヒント描画（簡易） =====
function refreshHints() {
  // 既存ヒント消去
  state.cells.forEach(c => {
    if (c.hintEl) { c.hintEl.remove(); c.hintEl = null; }
  });
  if (!hintToggle.checked || state.gameOver) return;

  const me = state.turn;
  state.cells.forEach(c => {
    if (c.stone !== 0) return;
    // 置いたと仮定して「3連ちょうどにならず」「次に4連の期待がある」かを粗く判定
    // 1) 仮置き
    c.stone = me;
    let makes3 = false;
    let has1gap2 = false;

    for (let i = 0; i < 3; i++) {
      const [dAq, dAr] = DIRS[i];
      const [dBq, dBr] = DIRS[i + 3];

      // 3連チェック（4以上は除外されるので実戦の負け条件に合わせる）
      const L1 = countDir(c.q, c.r, dAq, dAr, me);
      const L2 = countDir(c.q, c.r, dBq, dBr, me);
      const tot = 1 + L1 + L2;
      if (tot === 3) makes3 = true;

      // 1空2 パターン（軸上のどちらかに「2連」+ 反対に「1連」かつ、穴が間にある）
      // 簡易に「どちらかが2連以上 & もう一方が1連以上」を安全リーチとみなす
      if ((L1 >= 2 && L2 >= 1) || (L2 >= 2 && L1 >= 1)) has1gap2 = true;
    }

    // 2) 元に戻す
    c.stone = 0;

    if (!makes3 && has1gap2) {
      // ヒント円
      const hint = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      hint.setAttribute("cx", c.x);
      hint.setAttribute("cy", c.y);
      hint.setAttribute("r", HEX_SIZE * 0.33);
      hint.classList.add("hint");
      boardEl.appendChild(hint);
      c.hintEl = hint;
    }
  });
}

// 初期化
generateBoard();
