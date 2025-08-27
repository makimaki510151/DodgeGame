// キャンバスとコンテキストの取得
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI要素
const startButton = document.getElementById('startButton');
const restartButton = document.getElementById('restartButton');
const titleScreen = document.getElementById('title-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const finalTimeElement = document.getElementById('final-time');
const timerElement = document.getElementById('timer');
const heartsElement = document.getElementById('hearts');

// ゲームの状態
let gameState = 'title';
let player;
let bullets = [];
let bulletTimer = 0;
let timeSurvived = 0;
let hearts = 3;
let invincibilityTime = 0;

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
        this.color = 'white';
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
        this.color = 'red';
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

// 初期化
function init() {
    canvas.width = Math.min(window.innerWidth, 600);
    canvas.height = Math.min(window.innerHeight, 800);
    player = new Player();
    bullets = [];
    bulletTimer = 0;
    timeSurvived = 0;
    hearts = 3;
    invincibilityTime = 0;
    bulletSpeed = 2;
    updateHeartsUI();
}

// ゲーム開始
function startGame() {
    gameState = 'playing';
    titleScreen.style.display = 'none';
    gameOverScreen.style.display = 'none';
    init();
    lastTime = performance.now(); // performance.now() を使用
    requestAnimationFrame(gameLoop); // 初回のループを開始
}

// ゲームオーバー
function gameOver() {
    gameState = 'gameover';
    finalTimeElement.textContent = `生き残った時間: ${formatTime(timeSurvived)}`;
    gameOverScreen.style.display = 'block';
}

// メインループ
let lastTime = 0;
function gameLoop(currentTime) {
    if (gameState !== 'playing') return;

    // requestAnimationFrameから渡されるcurrentTimeを使用
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
        player.color = invincibilityTime % 10 < 5 ? 'transparent' : 'white'; // 点滅
    } else {
        player.color = 'white';
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

// イベントリスナー
startButton.addEventListener('click', startGame);
restartButton.addEventListener('click', startGame);

// マウス操作（PC）
canvas.addEventListener('mousemove', (e) => {
    if (gameState === 'playing') {
        const rect = canvas.getBoundingClientRect();
        player.x = e.clientX - rect.left;
        player.y = e.clientY - rect.top;
    }
});

// タッチ操作（スマホ）
canvas.addEventListener('touchmove', (e) => {
    e.preventDefault(); // スクロールを防止
    if (gameState === 'playing') {
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        player.x = touch.clientX - rect.left;
        player.y = touch.clientY - rect.top;
    }
}, { passive: false }); // スクロール防止のために passive: false を設定

// ウィンドウのリサイズ
window.addEventListener('resize', init);

// 初期設定
init();