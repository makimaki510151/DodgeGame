// gzip ローダーは body 末尾へ挿入するため、この時点で #gameCanvas が無いページがある
let canvas;
let ctx;
let startButton;
let restartButton;
let titleScreen;
let gameOverScreen;
let finalTimeElement;
let timerElement;
let heartsElement;

/** ホストがマークアップを置かない埋め込み向け: CSS セレクタ文字列 or Element */
function resolveDodgeGameMount() {
    const m = window.__DODGEGAME_MOUNT__;
    if (typeof m === 'string') {
        try {
            return document.querySelector(m);
        } catch (e) {
            return null;
        }
    }
    if (m && m.nodeType === 1) {
        return m;
    }
    return document.body;
}

const DODGEGAME_EMBED_STYLE = [
        '#dodgegame-bootstrap{box-sizing:border-box;display:grid;place-items:center;width:100%;max-width:100vw;min-height:100vh;min-height:100dvh;min-height:-webkit-fill-available;overflow:hidden;background:#1a1a2e}',
        '#dodgegame-bootstrap #game-container{position:relative;box-sizing:border-box;justify-self:center;align-self:center;margin:0 auto;overflow:hidden;max-width:100vw;max-height:100vh;max-height:100dvh;min-height:0;color:#fff;font-family:sans-serif;touch-action:none}',
        '#dodgegame-bootstrap #game-container>canvas{position:absolute;inset:0;z-index:0;display:block;width:100%;height:100%;box-sizing:border-box;background:#000;border:2px solid #fff}',
        '#dodgegame-bootstrap #ui{z-index:2;position:absolute;top:0;left:0;right:0;width:100%;display:flex;justify-content:space-between;align-items:flex-start;padding:10px 14px 0;box-sizing:border-box;pointer-events:none}',
        '#dodgegame-bootstrap #ui .heart,#dodgegame-bootstrap #timer,#dodgegame-bootstrap #hearts{pointer-events:auto}',
        '#dodgegame-bootstrap #timer{font-size:clamp(1.5rem,8vmin,2.4rem);font-weight:bold;line-height:1.1}',
        '#dodgegame-bootstrap #hearts{font-size:clamp(1.1rem,5.5vmin,1.75rem);line-height:1.1}',
        '#dodgegame-bootstrap .screen{z-index:3;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;max-width:calc(100% - 24px);padding:16px 18px;box-sizing:border-box;background-color:rgba(0,0,0,.7);border-radius:10px}',
        '#dodgegame-bootstrap .screen h1{font-size:clamp(1.4rem,7vmin,2.2rem);margin:0 0 14px;line-height:1.15}',
        '#dodgegame-bootstrap .screen button{padding:10px 18px;font-size:clamp(1rem,4.2vmin,1.35rem);cursor:pointer;border:none;border-radius:5px}',
        '#dodgegame-bootstrap #game-over-screen{display:none}',
        '#dodgegame-bootstrap .ranking-send-status{margin:12px 0 0;font-size:clamp(12px,2.8vw,15px);font-weight:700;line-height:1.35;color:#7c4dff}',
        "#dodgegame-bootstrap .ranking-send-status[data-level='error']{color:#ff5252}",
        "#dodgegame-bootstrap .ranking-send-status[data-level='ok']{color:#69f0ae}",
    ].join('');

const DODGEGAME_INNER_HTML =
    '<style type="text/css">' +
    DODGEGAME_EMBED_STYLE +
    '</style>' +
    '<div id="game-container" data-dodgegame-auto="1">' +
    '<canvas id="gameCanvas"></canvas>' +
    '<div id="ui">' +
    '<div id="timer">00:00</div>' +
    '<div id="hearts"><span class="heart">❤️</span><span class="heart">❤️</span><span class="heart">❤️</span></div>' +
    '</div>' +
    '<div id="title-screen" class="screen"><h1>避けるゲーム</h1><button id="startButton" type="button">スタート</button></div>' +
    '<div id="game-over-screen" class="screen"><h1>ゲームオーバー</h1><p id="final-time"></p><button id="restartButton" type="button">もう一度</button><p id="ranking-send-status" class="ranking-send-status" hidden></p></div>' +
    '</div>';

let dodgeGameMarkupInjected = false;

function injectDodgeGameMarkupIfMissing() {
    if (document.getElementById('gameCanvas')) {
        return true;
    }
    if (dodgeGameMarkupInjected) {
        return !!document.getElementById('gameCanvas');
    }
    const mount = resolveDodgeGameMount();
    if (!mount) {
        return false;
    }
    dodgeGameMarkupInjected = true;
    const wrap = document.createElement('div');
    wrap.id = 'dodgegame-bootstrap';
    wrap.innerHTML = DODGEGAME_INNER_HTML;
    mount.appendChild(wrap);
    return !!document.getElementById('gameCanvas');
}

function resolveDomRefs() {
    const el = document.getElementById('gameCanvas');
    if (!el) {
        return false;
    }
    const c = el.getContext('2d');
    if (!c) {
        return false;
    }
    canvas = el;
    ctx = c;
    startButton = document.getElementById('startButton');
    restartButton = document.getElementById('restartButton');
    titleScreen = document.getElementById('title-screen');
    gameOverScreen = document.getElementById('game-over-screen');
    finalTimeElement = document.getElementById('final-time');
    timerElement = document.getElementById('timer');
    heartsElement = document.getElementById('hearts');
    return !!(startButton && restartButton && titleScreen && gameOverScreen && finalTimeElement && timerElement && heartsElement);
}

// ゲームの状態
let gameState = 'title';
let player;
let bullets = [];
let bulletTimer = 0;
let timeSurvived = 0;
let hearts = 3;
let invincibilityTime = 0;

// 論理解像度（表示は CSS で拡縮。入力はゲーム座標へ換算する）
const GAME_W = 540;
const GAME_H = 960;

// 定数
const PLAYER_SIZE = 20;
const BULLET_MIN_SIZE = 10;
const BULLET_MAX_SIZE = 30;
const BULLET_EMISSION_RATE = 60; // 1秒 = 60フレーム
let bulletSpeed = 2;

// プレイヤーオブジェクト
class Player {
    constructor() {
        this.x = canvas.width / 2;
        this.y = canvas.height / 2;
        this.size = PLAYER_SIZE;
        this.color = '#00ffff'; // シアンに変更
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

// 弾幕オブジェクト
class Bullet {
    constructor(playerX, playerY) {
        // 画面外からランダムな位置に出現
        const side = Math.floor(Math.random() * 4); // 0:上, 1:右, 2:下, 3:左
        if (side === 0) {
            this.x = Math.random() * canvas.width;
            this.y = -BULLET_MAX_SIZE;
        } else if (side === 1) {
            this.x = canvas.width + BULLET_MAX_SIZE;
            this.y = Math.random() * canvas.height;
        } else if (side === 2) {
            this.x = Math.random() * canvas.width;
            this.y = canvas.height + BULLET_MAX_SIZE;
        } else {
            this.x = -BULLET_MAX_SIZE;
            this.y = Math.random() * canvas.height;
        }

        // 弾の大きさをランダムに設定
        const bulletSizeLevel = Math.floor(Math.random() * 3); // 0, 1, 2
        this.size = BULLET_MIN_SIZE + bulletSizeLevel * 10;
        
        // プレイヤーの位置を目標として速度を計算
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        this.vx = (dx / dist) * bulletSpeed;
        this.vy = (dy / dist) * bulletSpeed;
        this.color = '#ff007f'; // マゼンタに変更
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

function layoutGameStage() {
    const box = document.getElementById('game-container');
    if (!box) {
        return;
    }
    const vv = window.visualViewport;
    let aw = window.innerWidth;
    let ah = window.innerHeight;
    let originX = 0;
    let originY = 0;
    let useVisualViewportFrame = false;

    if (vv && vv.width > 1 && vv.height > 1) {
        aw = Math.floor(vv.width);
        ah = Math.floor(vv.height);
        originX = Math.round(vv.offsetLeft);
        originY = Math.round(vv.offsetTop);
        useVisualViewportFrame = true;
    }

    aw = Math.max(1, aw);
    ah = Math.max(1, ah);
    const scale = Math.min(aw / GAME_W, ah / GAME_H);
    const w = Math.max(1, Math.floor(GAME_W * scale));
    const h = Math.max(1, Math.floor(GAME_H * scale));

    box.style.width = w + 'px';
    box.style.height = h + 'px';
    box.style.zIndex = '1';

    if (useVisualViewportFrame) {
        box.style.position = 'fixed';
        box.style.left = `${Math.round(originX + (aw - w) / 2)}px`;
        box.style.top = `${Math.round(originY + (ah - h) / 2)}px`;
        box.style.right = 'auto';
        box.style.bottom = 'auto';
        box.style.margin = '0';
    } else {
        box.style.position = 'relative';
        box.style.left = '';
        box.style.top = '';
        box.style.right = '';
        box.style.bottom = '';
        box.style.margin = '0 auto';
    }
}

function pointerToGameCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        return { x: GAME_W / 2, y: GAME_H / 2 };
    }
    return {
        x: ((clientX - rect.left) / rect.width) * GAME_W,
        y: ((clientY - rect.top) / rect.height) * GAME_H,
    };
}

// 初期化
function init() {
    layoutGameStage();
    canvas.width = GAME_W;
    canvas.height = GAME_H;
    player = new Player();
    bullets = [];
    bulletTimer = 0;
    timeSurvived = 0;
    hearts = 3;
    invincibilityTime = 0;
    bulletSpeed = 2;
    updateHeartsUI();
}

function clearRankingSendStatus() {
    const rankEl = document.getElementById('ranking-send-status');
    if (!rankEl) {
        return;
    }
    rankEl.textContent = '';
    rankEl.hidden = true;
    rankEl.dataset.level = '';
}

function onRankingStatus(ev) {
    const el = document.getElementById('ranking-send-status');
    if (!el) {
        return;
    }
    const d = ev.detail || {};
    el.textContent = d.text || '';
    el.hidden = !d.text;
    el.dataset.level = d.level || '';
}

// ゲーム開始
function startGame() {
    gameState = 'playing';
    titleScreen.style.display = 'none';
    gameOverScreen.style.display = 'none';
    clearRankingSendStatus();
    init();
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

// ゲームオーバー
function gameOver() {
    gameState = 'gameover';
    finalTimeElement.textContent = `生き残った時間: ${formatTime(timeSurvived)}`;
    gameOverScreen.style.display = 'block';
    const survivedSec = Math.floor(timeSurvived);
    if (typeof window !== 'undefined' && window.DodgeUnityroomScore) {
        window.DodgeUnityroomScore.notifySurvivalSeconds(survivedSec);
    }
}

// メインループ
let lastTime = 0;
function gameLoop(currentTime) {
    if (gameState !== 'playing') return;

    // 時間の更新
    const deltaTime = (currentTime - lastTime) / 1000;
    timeSurvived += deltaTime;
    lastTime = currentTime;
    updateTimerUI();

    // 画面クリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 弾幕の生成
    bulletTimer++;
    const emissionRateMultiplier = Math.floor(timeSurvived / 10) + 1; // 10秒ごとに増加
    if (bulletTimer >= BULLET_EMISSION_RATE / (timeSurvived < 60 ? 1 : 1.5)) { // 60秒後から弾幕の頻度を上げる
        for (let i = 0; i < emissionRateMultiplier; i++) {
            bullets.push(new Bullet(player.x, player.y));
        }
        bulletTimer = 0;
    }

    // 弾幕の速度上昇
    bulletSpeed = 2 + Math.floor(timeSurvived / 20) * 0.5;

    // 弾幕の更新と描画
    bullets = bullets.filter(bullet => {
        bullet.update();
        return bullet.x > -bullet.size && bullet.x < canvas.width + bullet.size &&
               bullet.y > -bullet.size && bullet.y < canvas.height + bullet.size;
    });
    bullets.forEach(bullet => bullet.draw());

    // プレイヤーの更新と描画
    if (invincibilityTime > 0) {
        invincibilityTime--;
        player.color = invincibilityTime % 10 < 5 ? 'transparent' : '#00ffff'; // 点滅時の色も変更
    } else {
        player.color = '#00ffff';
    }
    player.draw();

    // 当たり判定
    if (invincibilityTime === 0) {
        bullets.forEach(bullet => {
            const distance = Math.sqrt((player.x - bullet.x) ** 2 + (player.y - bullet.y) ** 2);
            if (distance < (player.size + bullet.size) / 2) {
                hearts--;
                updateHeartsUI();
                invincibilityTime = 60; // 1秒間の無敵（60フレーム）
                if (hearts <= 0) {
                    gameOver();
                }
            }
        });
    }

    // 次のフレームを要求
    requestAnimationFrame(gameLoop);
}

// UI更新
function updateTimerUI() {
    timerElement.textContent = formatTime(timeSurvived);
}

function updateHeartsUI() {
    heartsElement.innerHTML = '';
    for (let i = 0; i < hearts; i++) {
        const heart = document.createElement('span');
        heart.className = 'heart';
        heart.textContent = '❤️';
        heartsElement.appendChild(heart);
    }
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

let domListenersAttached = false;
let bootstrapAttempts = 0;
const MAX_BOOTSTRAP_ATTEMPTS = 600;

function attachDomListenersOnce() {
    if (domListenersAttached) {
        return;
    }
    domListenersAttached = true;
    window.addEventListener('dodgegame-ranking-status', onRankingStatus);
    startButton.addEventListener('click', startGame);
    restartButton.addEventListener('click', startGame);
    canvas.addEventListener('mousemove', (e) => {
        if (gameState === 'playing') {
            const p = pointerToGameCoords(e.clientX, e.clientY);
            player.x = p.x;
            player.y = p.y;
        }
    });
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (gameState === 'playing') {
            const touch = e.touches[0];
            const p = pointerToGameCoords(touch.clientX, touch.clientY);
            player.x = p.x;
            player.y = p.y;
        }
    }, { passive: false });
    function onStageViewportChanged() {
        if (!canvas || !ctx) {
            return;
        }
        layoutGameStage();
        if (gameState === 'playing' && player) {
            const r = PLAYER_SIZE / 2;
            player.x = Math.min(GAME_W - r, Math.max(r, player.x));
            player.y = Math.min(GAME_H - r, Math.max(r, player.y));
        }
    }
    window.addEventListener('resize', onStageViewportChanged);
    document.addEventListener('fullscreenchange', onStageViewportChanged);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onStageViewportChanged);
        window.visualViewport.addEventListener('scroll', onStageViewportChanged);
    }
}

function bootstrapWhenDomReady() {
    if (!document.body) {
        requestAnimationFrame(bootstrapWhenDomReady);
        return;
    }
    injectDodgeGameMarkupIfMissing();
    if (resolveDomRefs()) {
        attachDomListenersOnce();
        init();
        return;
    }
    bootstrapAttempts += 1;
    if (bootstrapAttempts > MAX_BOOTSTRAP_ATTEMPTS) {
        console.error(
            'DodgeGame: 起動に失敗しました。ページに #gameCanvas が無い場合は自動で挿入しますが、' +
                '挿入先を window.__DODGEGAME_MOUNT__ = "#ホストの要素"; のように指定してください。'
        );
        return;
    }
    requestAnimationFrame(bootstrapWhenDomReady);
}

bootstrapWhenDomReady();