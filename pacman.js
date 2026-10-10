(() => {
  "use strict";

  const T = 16;
  const COLS = 28;
  const ROWS = 31;
  const TOP = 48;
  const BOTTOM = 40;
  const SCALE = 2;
  const W = COLS * T;
  const H = TOP + ROWS * T + BOTTOM;
  const TUNNEL_ROW = 14;
  const BASE_SPEED = 9.5;
  const STEP = 1 / 60;

  const LAYOUT = [
    "############################",
    "#............##............#",
    "#.####.#####.##.#####.####.#",
    "#o####.#####.##.#####.####o#",
    "#.####.#####.##.#####.####.#",
    "#..........................#",
    "#.####.##.########.##.####.#",
    "#.####.##.########.##.####.#",
    "#......##....##....##......#",
    "######.##### ## #####.######",
    "######.##### ## #####.######",
    "######.##          ##.######",
    "######.## ###--### ##.######",
    "######.## #      # ##.######",
    "      .   #      #   .      ",
    "######.## #      # ##.######",
    "######.## ######## ##.######",
    "######.##          ##.######",
    "######.## ######## ##.######",
    "######.## ######## ##.######",
    "#............##............#",
    "#.####.#####.##.#####.####.#",
    "#.####.#####.##.#####.####.#",
    "#o..##.......  .......##..o#",
    "###.##.##.########.##.##.###",
    "###.##.##.########.##.##.###",
    "#......##....##....##......#",
    "#.##########.##.##########.#",
    "#.##########.##.##########.#",
    "#..........................#",
    "############################"
  ];

  const UP = { x: 0, y: -1 };
  const LEFT = { x: -1, y: 0 };
  const DOWN = { x: 0, y: 1 };
  const RIGHT = { x: 1, y: 0 };
  const ORDER = [UP, LEFT, DOWN, RIGHT];
  const KEY_DIRS = {
    ArrowUp: UP, ArrowLeft: LEFT, ArrowDown: DOWN, ArrowRight: RIGHT,
    w: UP, a: LEFT, s: DOWN, d: RIGHT
  };
  const NAMED_DIRS = { up: UP, left: LEFT, down: DOWN, right: RIGHT };

  const GHOST_DEFS = [
    { id: "blinky", color: "#ff0000", scatter: { x: 25, y: -3 } },
    { id: "pinky", color: "#ffb8ff", scatter: { x: 2, y: -3 } },
    { id: "inky", color: "#00ffff", scatter: { x: 27, y: 31 } },
    { id: "clyde", color: "#ffb852", scatter: { x: 0, y: 31 } }
  ];

  const FRIGHT_SECONDS = [6, 5, 4, 3, 2, 5, 2, 2, 1, 5, 2, 1, 1, 3, 1, 1, 0, 1];
  const ELROY_DOTS = [20, 30, 40, 40, 40, 50, 50, 50, 60, 60, 60, 80, 80, 80, 100, 100, 100, 100, 120];
  const FRUITS = [
    { kind: 0, points: 100 }, { kind: 1, points: 300 }, { kind: 2, points: 500 }, { kind: 2, points: 500 },
    { kind: 3, points: 700 }, { kind: 3, points: 700 }, { kind: 4, points: 1000 }, { kind: 4, points: 1000 },
    { kind: 5, points: 2000 }, { kind: 5, points: 2000 }, { kind: 6, points: 3000 }, { kind: 6, points: 3000 },
    { kind: 7, points: 5000 }
  ];

  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d");
  const overlay = document.querySelector("#overlay");
  const overlayTitle = document.querySelector("#overlayTitle");
  const overlayText = document.querySelector("#overlayText");
  const overlayButton = document.querySelector("#overlayButton");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;

  const HIGH_KEY = "pacman-high-score";
  let high = 0;
  try {
    high = Number(localStorage.getItem(HIGH_KEY)) || 0;
  } catch (error) {
    high = 0;
  }

  let level, score, lives, extraLife, food, foodLeft, eaten, lifeDots, afterDeath;
  let pac, ghosts, fruit, popups, modeIdx, modeTimer, frightTimer, chain, stall;
  let phase, phaseTimer, readyFirst, noEatTimer, releaseCooldown, elroyOn, params;
  let wantTime = 0;
  let clock = 0;
  let paused = false;
  let eatingGhost = null;
  let wallsBlue;
  let wallsWhite;

  const opposite = (d) => (d === UP ? DOWN : d === DOWN ? UP : d === LEFT ? RIGHT : LEFT);
  const isOpposite = (a, b) => a.x === -b.x && a.y === -b.y;

  function cell(x, y) {
    if (y < 0 || y >= ROWS) return "#";
    if (x < 0 || x >= COLS) return y === TUNNEL_ROW ? " " : "#";
    return LAYOUT[y][x];
  }

  function canMove(x, y) {
    const c = cell(x, y);
    return c !== "#" && c !== "-";
  }

  function pos(a) {
    if (a.mode === "house" || a.mode === "leaving" || a.mode === "entering") return { x: a.fx, y: a.fy };
    return { x: a.tx + 0.5 + a.dir.x * a.t, y: a.ty + 0.5 + a.dir.y * a.t };
  }

  function tileOf(a) {
    if (a.mode === "house" || a.mode === "leaving" || a.mode === "entering") return { x: 14, y: 11 };
    return { x: a.tx + (a.t >= 0.5 ? a.dir.x : 0), y: a.ty + (a.t >= 0.5 ? a.dir.y : 0) };
  }

  function levelParams(l) {
    let p;
    if (l === 1) p = { pac: 0.8, ghost: 0.75, tunnel: 0.4, fpac: 0.9, fghost: 0.5, e1: 0.8, e2: 0.85 };
    else if (l <= 4) p = { pac: 0.9, ghost: 0.85, tunnel: 0.45, fpac: 0.95, fghost: 0.55, e1: 0.9, e2: 0.95 };
    else if (l <= 20) p = { pac: 1, ghost: 0.95, tunnel: 0.5, fpac: 1, fghost: 0.6, e1: 1, e2: 1.05 };
    else p = { pac: 0.9, ghost: 0.95, tunnel: 0.5, fpac: 0.9, fghost: 0.6, e1: 1, e2: 1.05 };
    p.fright = l <= FRIGHT_SECONDS.length ? FRIGHT_SECONDS[l - 1] : 0;
    p.elroy1 = ELROY_DOTS[Math.min(l - 1, ELROY_DOTS.length - 1)];
    p.elroy2 = Math.floor(p.elroy1 / 2);
    if (l === 1) p.schedule = [7, 20, 7, 20, 5, 20, 5, Infinity];
    else if (l <= 4) p.schedule = [7, 20, 7, 20, 5, 1033, 1 / 60, Infinity];
    else p.schedule = [5, 20, 5, 20, 5, 1037, 1 / 60, Infinity];
    return p;
  }

  function fruitFor(l) {
    return FRUITS[Math.min(l - 1, FRUITS.length - 1)];
  }

  /* ---------- audio (simple synthesized tones) ---------- */
  let audio = null;
  let muted = false;
  let wakaToggle = false;

  function ensureAudio() {
    if (!audio) {
      try {
        audio = new (window.AudioContext || window.webkitAudioContext)();
      } catch (error) {
        audio = null;
      }
    }
    if (audio && audio.state === "suspended") audio.resume();
  }

  function tone(freq, dur, options = {}) {
    if (!audio || muted) return;
    const { type = "square", vol = 0.05, delay = 0, to = freq } = options;
    const t0 = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 20), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const sounds = {
    waka() {
      wakaToggle = !wakaToggle;
      tone(wakaToggle ? 240 : 360, 0.07, { to: wakaToggle ? 360 : 240 });
    },
    power() {
      tone(140, 0.25, { to: 60, type: "sawtooth" });
    },
    ghost() {
      tone(200, 0.35, { to: 1400, type: "sawtooth" });
    },
    fruit() {
      tone(600, 0.1);
      tone(900, 0.16, { delay: 0.1 });
    },
    extra() {
      [660, 880, 1100].forEach((f, i) => tone(f, 0.12, { delay: i * 0.1 }));
    },
    start() {
      [392, 523, 659, 784, 659, 523, 392, 523].forEach((f, i) => tone(f, 0.16, { delay: i * 0.17, vol: 0.04 }));
    },
    death() {
      for (let i = 0; i < 9; i += 1) tone(700 - i * 60, 0.15, { delay: 0.8 + i * 0.15, to: 500 - i * 50 });
    }
  };

  /* ---------- setup ---------- */
  function makeWalls(color) {
    const c = document.createElement("canvas");
    c.width = W * SCALE;
    c.height = ROWS * T * SCALE;
    const g = c.getContext("2d");
    g.scale(SCALE, SCALE);
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.lineCap = "round";
    const wall = (x, y) => y >= 0 && y < ROWS && x >= 0 && x < COLS && LAYOUT[y][x] === "#";
    const cx = (v) => Math.min(Math.max(v, 1), W - 1);
    const cy = (v) => Math.min(Math.max(v, 1), ROWS * T - 1);
    g.beginPath();
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (!wall(x, y)) continue;
        const l = x * T;
        const r = l + T;
        const t = y * T;
        const b = t + T;
        if (!wall(x, y - 1)) { g.moveTo(l, cy(t)); g.lineTo(r, cy(t)); }
        if (!wall(x, y + 1)) { g.moveTo(l, cy(b)); g.lineTo(r, cy(b)); }
        if (!wall(x - 1, y)) { g.moveTo(cx(l), t); g.lineTo(cx(l), b); }
        if (!wall(x + 1, y)) { g.moveTo(cx(r), t); g.lineTo(cx(r), b); }
      }
    }
    g.stroke();
    return c;
  }

  function loadLevel() {
    food = LAYOUT.map((row) => [...row].map((c) => (c === "." ? 1 : c === "o" ? 2 : 0)));
    foodLeft = food.flat().filter(Boolean).length;
    eaten = 0;
    params = levelParams(level);
    afterDeath = false;
    resetActors();
    elroyOn = true;
  }

  function makeGhost(def) {
    const g = {
      ...def, mode: "house", frightened: false, reverse: false, dir: LEFT,
      t: 0, tx: 0, ty: 0, fx: 14, fy: 14.5, vy: -1, hidden: false
    };
    if (def.id === "blinky") Object.assign(g, { mode: "normal", tx: 14, ty: 11, t: 0.5, fx: null, fy: null });
    if (def.id === "inky") Object.assign(g, { fx: 12.5, vy: 1 });
    if (def.id === "clyde") Object.assign(g, { fx: 15.5 });
    return g;
  }

  function resetActors() {
    pac = { tx: 14, ty: 23, dir: LEFT, want: LEFT, t: 0.5, anim: 0, moving: false };
    ghosts = GHOST_DEFS.map(makeGhost);
    modeIdx = 0;
    modeTimer = params.schedule[0];
    frightTimer = 0;
    chain = 0;
    stall = 0;
    lifeDots = 0;
    noEatTimer = 0;
    releaseCooldown = 0;
    fruit = null;
    popups = [];
    eatingGhost = null;
    elroyOn = false;
  }

  function startReady(first) {
    phase = "ready";
    readyFirst = first;
    phaseTimer = first ? 2.6 : 1.8;
    if (first) sounds.start();
  }

  function newGame() {
    level = 1;
    score = 0;
    lives = 3;
    extraLife = false;
    loadLevel();
    startReady(true);
  }

  function addScore(points) {
    score += points;
    if (!extraLife && score >= 10000) {
      extraLife = true;
      lives += 1;
      sounds.extra();
    }
    if (score > high) {
      high = score;
      try {
        localStorage.setItem(HIGH_KEY, String(high));
      } catch (error) {
        // Ignore storage failures; the high score is just not persisted.
      }
    }
  }

  /* ---------- movement ---------- */
  function wrap(a) {
    if (a.tx === -1 && a.dir.x < 0) a.tx = COLS;
    else if (a.tx === COLS && a.dir.x > 0) a.tx = -1;
  }

  function reverseActor(a) {
    a.tx += a.dir.x;
    a.ty += a.dir.y;
    a.t = 1 - a.t;
    a.dir = opposite(a.dir);
  }

  function updatePac(dt) {
    if (stall > 0) {
      stall -= dt;
      return;
    }
    if (pac.want !== pac.dir && clock - wantTime > 0.7) pac.want = pac.dir;
    if (pac.t > 0 && isOpposite(pac.want, pac.dir)) reverseActor(pac);
    let dist = BASE_SPEED * (frightTimer > 0 ? params.fpac : params.pac) * dt;
    pac.moving = false;
    while (dist > 1e-9) {
      if (pac.t === 0) {
        if (canMove(pac.tx + pac.want.x, pac.ty + pac.want.y)) pac.dir = pac.want;
        if (!canMove(pac.tx + pac.dir.x, pac.ty + pac.dir.y)) break;
      }
      pac.moving = true;
      const s = Math.min(dist, 1 - pac.t);
      pac.t += s;
      pac.anim += s;
      dist -= s;
      if (pac.t >= 1 - 1e-9) {
        pac.tx += pac.dir.x;
        pac.ty += pac.dir.y;
        pac.t = 0;
        wrap(pac);
        eatAt();
        if (phase !== "play") return;
      }
    }
  }

  function eatAt() {
    const f = food[pac.ty] && food[pac.ty][pac.tx];
    if (!f) return;
    food[pac.ty][pac.tx] = 0;
    foodLeft -= 1;
    eaten += 1;
    lifeDots += 1;
    noEatTimer = 0;
    addScore(f === 1 ? 10 : 50);
    stall = f === 1 ? STEP : STEP * 3;
    if (f === 1) sounds.waka();
    else {
      sounds.power();
      startFright();
    }
    if (eaten === 70 || eaten === 170) {
      fruit = { x: 14, y: 17.5, timer: 9.5 + Math.random() * 0.5 };
    }
    if (foodLeft === 0) {
      phase = "clear";
      phaseTimer = 2.4;
    }
  }

  function startFright() {
    chain = 0;
    ghosts.forEach((g) => {
      if (g.mode === "eaten" || g.mode === "entering") return;
      if (g.mode === "normal") g.reverse = true;
      if (params.fright > 0) g.frightened = true;
    });
    frightTimer = params.fright;
  }

  function endFright() {
    frightTimer = 0;
    chain = 0;
    ghosts.forEach((g) => { g.frightened = false; });
  }

  function advanceMode() {
    modeIdx += 1;
    modeTimer = params.schedule[modeIdx] ?? Infinity;
    ghosts.forEach((g) => { if (g.mode === "normal") g.reverse = true; });
  }

  function ghostSpeed(g) {
    if (g.mode === "eaten") return BASE_SPEED * 1.8;
    if (g.ty === TUNNEL_ROW && (g.tx < 6 || g.tx > 21)) return BASE_SPEED * params.tunnel;
    if (g.frightened) return BASE_SPEED * params.fghost;
    let s = params.ghost;
    if (g.id === "blinky" && elroyOn) {
      if (foodLeft <= params.elroy2) s = params.e2;
      else if (foodLeft <= params.elroy1) s = params.e1;
    }
    return BASE_SPEED * s;
  }

  function ghostTarget(g) {
    if (g.mode === "eaten") return { x: 14, y: 11 };
    const chasing = modeIdx % 2 === 1 ||
      (g.id === "blinky" && elroyOn && foodLeft <= params.elroy1);
    if (!chasing) return g.scatter;
    const p = tileOf(pac);
    const d = pac.dir;
    const upBug = d === UP ? 1 : 0;
    if (g.id === "blinky") return p;
    if (g.id === "pinky") return { x: p.x + 4 * d.x - 4 * upBug, y: p.y + 4 * d.y };
    if (g.id === "inky") {
      const b = tileOf(ghosts[0]);
      const ahead = { x: p.x + 2 * d.x - 2 * upBug, y: p.y + 2 * d.y };
      return { x: ahead.x * 2 - b.x, y: ahead.y * 2 - b.y };
    }
    const me = tileOf(g);
    const far = (me.x - p.x) ** 2 + (me.y - p.y) ** 2 > 64;
    return far ? p : g.scatter;
  }

  function chooseGhostDir(g) {
    if (g.reverse) {
      g.reverse = false;
      const back = opposite(g.dir);
      if (canMove(g.tx + back.x, g.ty + back.y)) {
        g.dir = back;
        return;
      }
    }
    const noUp = (g.tx === 12 || g.tx === 15) && (g.ty === 11 || g.ty === 23);
    const options = ORDER.filter((d) => {
      if (isOpposite(d, g.dir)) return false;
      if (!canMove(g.tx + d.x, g.ty + d.y)) return false;
      if (d === UP && noUp && g.mode === "normal" && !g.frightened) return false;
      return true;
    });
    if (options.length === 0) {
      g.dir = opposite(g.dir);
      return;
    }
    if (g.frightened && g.mode === "normal") {
      g.dir = options[Math.floor(Math.random() * options.length)];
      return;
    }
    const target = ghostTarget(g);
    let best = options[0];
    let bestDist = Infinity;
    for (const d of options) {
      const dist = (g.tx + d.x - target.x) ** 2 + (g.ty + d.y - target.y) ** 2;
      if (dist < bestDist) {
        best = d;
        bestDist = dist;
      }
    }
    g.dir = best;
  }

  function updateGhostGrid(g, dt) {
    let dist = ghostSpeed(g) * dt;
    while (dist > 1e-9) {
      if (g.t === 0) chooseGhostDir(g);
      const s = Math.min(dist, 1 - g.t);
      g.t += s;
      dist -= s;
      if (g.t >= 1 - 1e-9) {
        g.tx += g.dir.x;
        g.ty += g.dir.y;
        g.t = 0;
        wrap(g);
        if (g.mode === "eaten" && g.ty === 11 && (g.tx === 13 || g.tx === 14)) {
          g.mode = "entering";
          g.fx = g.tx + 0.5;
          g.fy = g.ty + 0.5;
          return;
        }
      }
    }
  }

  function updateGhostFree(g, dt) {
    if (g.mode === "house") {
      g.fy += g.vy * 2.2 * dt;
      if (g.fy < 14.05) { g.fy = 14.05; g.vy = 1; }
      else if (g.fy > 14.95) { g.fy = 14.95; g.vy = -1; }
      return;
    }
    let dist = (g.mode === "entering" ? 7 : 4) * dt;
    const dx = 14 - g.fx;
    if (Math.abs(dx) > 1e-6) {
      const s = Math.min(dist, Math.abs(dx));
      g.fx += Math.sign(dx) * s;
      dist -= s;
    }
    if (dist <= 0 || Math.abs(14 - g.fx) > 1e-6) return;
    if (g.mode === "leaving") {
      g.fy = Math.max(11.5, g.fy - dist);
      if (g.fy <= 11.5) {
        Object.assign(g, { mode: "normal", tx: 14, ty: 11, t: 0.5, dir: LEFT, reverse: false });
      }
    } else {
      g.fy = Math.min(14.5, g.fy + dist);
      if (g.fy >= 14.5) {
        g.mode = "leaving";
        g.frightened = false;
      }
    }
  }

  function updateRelease(dt) {
    if (releaseCooldown > 0) {
      releaseCooldown -= dt;
      return;
    }
    const g = ghosts.find((x) => x.mode === "house");
    if (!g) return;
    let limits = { pinky: 0, inky: 0, clyde: 0 };
    if (afterDeath) limits = { pinky: 7, inky: 17, clyde: 32 };
    else if (level === 1) limits = { pinky: 0, inky: 30, clyde: 60 };
    else if (level === 2) limits = { pinky: 0, inky: 0, clyde: 50 };
    if (lifeDots >= limits[g.id] || noEatTimer >= (level < 5 ? 4 : 3)) {
      g.mode = "leaving";
      noEatTimer = 0;
      releaseCooldown = 0.5;
      if (g.id === "clyde") elroyOn = true;
    }
  }

  function collisions() {
    const q = pos(pac);
    for (const g of ghosts) {
      if (g.mode !== "normal") continue;
      const p = pos(g);
      if ((p.x - q.x) ** 2 + (p.y - q.y) ** 2 > 0.45) continue;
      if (g.frightened) {
        const points = 200 * 2 ** Math.min(chain, 3);
        chain += 1;
        addScore(points);
        popups.push({ x: p.x, y: p.y, text: String(points), color: "#00ffff", time: 0.8 });
        g.mode = "eaten";
        g.frightened = false;
        g.hidden = true;
        eatingGhost = g;
        phase = "ghostEat";
        phaseTimer = 0.8;
        sounds.ghost();
        return;
      }
      phase = "dying";
      phaseTimer = 3;
      lives -= 1;
      sounds.death();
      return;
    }
  }

  function updatePlay(dt) {
    if (frightTimer > 0) {
      frightTimer -= dt;
      if (frightTimer <= 0) endFright();
    } else {
      modeTimer -= dt;
      if (modeTimer <= 0) advanceMode();
    }
    noEatTimer += dt;
    updateRelease(dt);
    updatePac(dt);
    if (phase !== "play") return;
    for (const g of ghosts) {
      if (g.mode === "normal" || g.mode === "eaten") updateGhostGrid(g, dt);
      else updateGhostFree(g, dt);
    }
    if (fruit) {
      fruit.timer -= dt;
      const q = pos(pac);
      if (Math.abs(q.x - fruit.x) < 0.7 && Math.abs(q.y - fruit.y) < 0.7) {
        const f = fruitFor(level);
        addScore(f.points);
        popups.push({ x: fruit.x, y: fruit.y, text: String(f.points), color: "#ff80ff", time: 2 });
        fruit = null;
        sounds.fruit();
      } else if (fruit.timer <= 0) {
        fruit = null;
      }
    }
    collisions();
  }

  function step(dt) {
    popups.forEach((p) => { p.time -= dt; });
    popups = popups.filter((p) => p.time > 0);
    phaseTimer -= dt;
    if (phase === "ready") {
      if (phaseTimer <= 0) phase = "play";
    } else if (phase === "play") {
      phaseTimer += dt;
      updatePlay(dt);
    } else if (phase === "ghostEat") {
      if (phaseTimer <= 0) {
        if (eatingGhost) eatingGhost.hidden = false;
        eatingGhost = null;
        phase = "play";
      }
    } else if (phase === "dying") {
      if (phaseTimer <= 0) {
        if (lives <= 0) {
          phase = "gameover";
          phaseTimer = 3;
        } else {
          resetActors();
          afterDeath = true;
          startReady(false);
        }
      }
    } else if (phase === "clear") {
      if (phaseTimer <= 0) {
        level += 1;
        loadLevel();
        startReady(false);
      }
    } else if (phase === "gameover") {
      if (phaseTimer <= 0) {
        phase = "title";
        showOverlay("GAME OVER", `Score: ${score}`, "Play again");
      }
    }
  }

  /* ---------- drawing ---------- */
  function text(str, x, y, color = "#fff", align = "left", size = 16) {
    ctx.font = `bold ${size}px "Courier New", monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function circle(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFruit(kind, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 12, size / 12);
    if (kind === 0) {
      ctx.strokeStyle = "#a86a00";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-5, 5);
      ctx.quadraticCurveTo(-3, -6, 5, -10);
      ctx.moveTo(5, 6);
      ctx.quadraticCurveTo(5, -4, 5, -10);
      ctx.stroke();
      circle(-5, 6, 5, "#ff2020");
      circle(5, 7, 5, "#ff2020");
    } else if (kind === 1) {
      ctx.fillStyle = "#ff2040";
      ctx.beginPath();
      ctx.moveTo(-9, -4);
      ctx.quadraticCurveTo(0, -10, 9, -4);
      ctx.quadraticCurveTo(7, 6, 0, 11);
      ctx.quadraticCurveTo(-7, 6, -9, -4);
      ctx.fill();
      ctx.fillStyle = "#2ecc40";
      ctx.fillRect(-6, -8, 12, 3);
      ctx.fillStyle = "#fff";
      [[-4, 0], [3, -1], [0, 4], [-2, 7], [4, 4]].forEach(([sx, sy]) => ctx.fillRect(sx, sy, 1.5, 1.5));
    } else if (kind === 2 || kind === 3) {
      circle(0, 2, 9, kind === 2 ? "#ff9a1f" : "#ff3030");
      ctx.fillStyle = "#2ecc40";
      ctx.beginPath();
      ctx.ellipse(3, -8, 4, 2, -0.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 4) {
      circle(0, 1, 10, "#40c040");
      ctx.strokeStyle = "#b6f5b6";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-6, -6); ctx.lineTo(6, 8);
      ctx.moveTo(0, -9); ctx.lineTo(0, 10);
      ctx.moveTo(6, -6); ctx.lineTo(-6, 8);
      ctx.stroke();
    } else if (kind === 5) {
      ctx.fillStyle = "#ffe600";
      ctx.beginPath();
      ctx.moveTo(-10, -8); ctx.lineTo(0, 2); ctx.lineTo(10, -8); ctx.lineTo(0, 9);
      ctx.fill();
      ctx.fillStyle = "#2121de";
      ctx.fillRect(-2, 2, 4, 8);
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(-1, -9, 2, 6);
    } else if (kind === 6) {
      ctx.fillStyle = "#ffe600";
      ctx.beginPath();
      ctx.moveTo(-9, 8); ctx.quadraticCurveTo(-9, -9, 0, -9); ctx.quadraticCurveTo(9, -9, 9, 8);
      ctx.fill();
      circle(0, 9, 3, "#fff");
    } else {
      ctx.strokeStyle = "#00ffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -5, 4.5, 0, Math.PI * 2);
      ctx.moveTo(0, -1); ctx.lineTo(0, 10);
      ctx.moveTo(0, 5); ctx.lineTo(5, 5);
      ctx.moveTo(0, 9); ctx.lineTo(5, 9);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPacShape(x, y, dir, mouth) {
    const r = T * 0.8;
    const a = Math.atan2(dir.y, dir.x);
    ctx.fillStyle = "#ffff00";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, a + mouth, a + Math.PI * 2 - mouth);
    ctx.closePath();
    ctx.fill();
  }

  function drawPac() {
    const p = pos(pac);
    let mouth = 0;
    if (phase !== "ready" && phase !== "title" && pac.moving) {
      mouth = Math.abs(((pac.anim * 1.6) % 1) * 2 - 1) * 0.85;
    } else if (phase === "play" || phase === "clear") {
      mouth = 0.4;
    }
    drawPacShape(p.x * T, p.y * T, pac.dir, mouth);
  }

  function drawPacDeath(progress) {
    if (progress >= 1) return;
    const p = pos(pac);
    const x = p.x * T;
    const y = p.y * T;
    const a = progress * Math.PI;
    ctx.fillStyle = "#ffff00";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, T * 0.8, -Math.PI / 2 + a, -Math.PI / 2 + Math.PI * 2 - a);
    ctx.closePath();
    ctx.fill();
  }

  function drawGhost(g) {
    if (g.hidden) return;
    const p = pos(g);
    const cx = p.x * T;
    const cy = p.y * T;
    const r = T * 0.85;
    if (g.mode !== "eaten") {
      const flash = g.frightened && frightTimer < 2 && Math.floor(frightTimer * 5) % 2 === 1;
      const body = g.frightened ? (flash ? "#ffffff" : "#2121de") : g.color;
      const frame = Math.floor(clock * 8) % 2;
      const bottom = cy + r * 0.85;
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.1, r, Math.PI, 0);
      ctx.lineTo(cx + r, bottom);
      const n = 6;
      for (let i = 1; i <= n; i += 1) {
        ctx.lineTo(cx + r - (i * 2 * r) / n, bottom - ((i + frame) % 2 === 0 ? 0 : r * 0.3));
      }
      ctx.closePath();
      ctx.fill();
      if (g.frightened) {
        const face = flash ? "#ff0000" : "#ffb8ae";
        ctx.fillStyle = face;
        ctx.fillRect(cx - r * 0.45, cy - r * 0.35, r * 0.25, r * 0.25);
        ctx.fillRect(cx + r * 0.2, cy - r * 0.35, r * 0.25, r * 0.25);
        ctx.strokeStyle = face;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.65, cy + r * 0.4);
        for (let i = 1; i <= 6; i += 1) ctx.lineTo(cx - r * 0.65 + i * r * 0.22, cy + r * (i % 2 ? 0.2 : 0.4));
        ctx.stroke();
        return;
      }
    }
    for (const s of [-1, 1]) {
      const ex = cx + s * r * 0.38;
      const ey = cy - r * 0.25;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(ex, ey, r * 0.28, r * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      circle(ex + g.dir.x * r * 0.14, ey + g.dir.y * r * 0.16, r * 0.16, "#2121de");
    }
  }

  function drawFood() {
    const blink = Math.floor(clock * 4) % 2 === 0;
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const f = food[y][x];
        if (f === 1) {
          ctx.fillStyle = "#ffb8ae";
          ctx.fillRect(x * T + T / 2 - 2, y * T + T / 2 - 2, 4, 4);
        } else if (f === 2 && (blink || phase === "title" || paused)) {
          circle(x * T + T / 2, y * T + T / 2, 6.5, "#ffb8ae");
        }
      }
    }
  }

  function drawHud() {
    const blink = Math.floor(clock * 3) % 2 === 0;
    if (blink || phase !== "play") text("1UP", 3 * T, 14);
    text(String(score).padStart(2, " "), 6 * T, 34, "#fff", "right");
    text("HIGH SCORE", W / 2, 14, "#fff", "center");
    text(String(high), W / 2 + 40, 34, "#fff", "right");
  }

  function drawFooter() {
    const y = TOP + ROWS * T + 20;
    for (let i = 0; i < Math.max(0, lives - 1); i += 1) {
      drawPacShape(24 + i * 30, y, LEFT, 0.55);
    }
    const first = Math.max(1, level - 6);
    for (let l = level; l >= first; l -= 1) {
      drawFruit(fruitFor(l).kind, W - 22 - (level - l) * 28, y, 11);
    }
  }

  function draw() {
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    drawHud();
    ctx.save();
    ctx.translate(0, TOP);

    const flashWhite = phase === "clear" && phaseTimer < 2 && Math.floor(phaseTimer * 5) % 2 === 1;
    ctx.drawImage(flashWhite ? wallsWhite : wallsBlue, 0, 0, W, ROWS * T);
    ctx.fillStyle = "#ffb8de";
    ctx.fillRect(13 * T, 12 * T + T / 2 - 2, 2 * T, 3);

    if (phase !== "clear" || phaseTimer > 2) drawFood();
    if (fruit) drawFruit(fruitFor(level).kind, fruit.x * T, fruit.y * T, 12);

    const elapsed = 3 - phaseTimer;
    if (phase === "dying") {
      if (elapsed < 0.8) {
        drawPac();
        ghosts.forEach(drawGhost);
      } else {
        drawPacDeath((elapsed - 0.8) / 1.5);
      }
    } else if (phase === "ghostEat") {
      ghosts.forEach(drawGhost);
    } else if (phase === "clear") {
      drawPac();
    } else {
      if (phase !== "gameover") drawPac();
      ghosts.forEach(drawGhost);
    }

    popups.forEach((p) => text(p.text, p.x * T, p.y * T, p.color, "center", 12));
    if (phase === "ready") {
      if (readyFirst) text("PLAYER ONE", W / 2, 11 * T + T / 2 + 1, "#00ffff", "center");
      text("READY!", W / 2, 17 * T + T / 2, "#ffff00", "center");
    } else if (phase === "gameover") {
      text("GAME OVER", W / 2, 17 * T + T / 2, "#ff0000", "center");
    }
    ctx.restore();
    drawFooter();
  }

  /* ---------- input & UI ---------- */
  function showOverlay(title, body, button) {
    overlayTitle.textContent = title;
    overlayText.textContent = body;
    overlayButton.textContent = button;
    overlay.hidden = false;
    overlayButton.focus({ preventScroll: true });
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

  function startGame() {
    ensureAudio();
    hideOverlay();
    newGame();
  }

  function togglePause() {
    if (phase === "title" || phase === "gameover") return;
    paused = !paused;
    if (paused) showOverlay("PAUSED", "Take a breather.", "Resume");
    else hideOverlay();
  }

  function setDirection(dir) {
    if (!pac || phase === "title") return;
    pac.want = dir;
    wantTime = clock;
  }

  document.addEventListener("keydown", (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (KEY_DIRS[key]) {
      event.preventDefault();
      ensureAudio();
      if (!paused) setDirection(KEY_DIRS[key]);
      return;
    }
    if (key === "p" || key === "Escape") {
      togglePause();
    } else if (key === "m") {
      muted = !muted;
    } else if ((key === "Enter" || key === " ") && !overlay.hidden && document.activeElement !== overlayButton) {
      event.preventDefault();
      overlayButton.click();
    }
  });

  overlayButton.addEventListener("click", () => {
    if (paused) togglePause();
    else startGame();
  });

  document.querySelectorAll("[data-dir]").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      ensureAudio();
      setDirection(NAMED_DIRS[button.dataset.dir]);
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && !paused && phase !== "title" && phase !== "gameover") togglePause();
  });

  let last = performance.now();
  let acc = 0;
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    clock += dt;
    if (!paused && phase !== "title") {
      acc += dt;
      while (acc >= STEP) {
        step(STEP);
        acc -= STEP;
      }
    }
    draw();
    requestAnimationFrame(loop);
  }

  wallsBlue = makeWalls("#2121de");
  wallsWhite = makeWalls("#ffffff");
  level = 1;
  score = 0;
  lives = 3;
  loadLevel();
  phase = "title";
  showOverlay("PAC-MAN", "Eat every dot, grab power pellets, and avoid the ghosts.", "Start");
  requestAnimationFrame(loop);
})();
