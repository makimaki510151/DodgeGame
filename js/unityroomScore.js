/**
 * unityroom スコア送信（unityroom-client-library の HMAC / 間隔 / リトライに準拠）
 * スコアは生存秒の整数（InvariantCulture 相当の整数文字列）
 */
(function (global) {
    const INTERVAL_SECONDS = 6;
    const MAX_TRY_COUNT = 2;

    function emit(text, level) {
        global.dispatchEvent(
            new CustomEvent('dodgegame-ranking-status', {
                detail: { text: text || '', level: level || 'info' },
            }),
        );
    }

    function getConfig() {
        return global.DODGEGAME_UNITYROOM;
    }

    function configReady(cfg) {
        return !!(cfg && cfg.hmacKey && cfg.boardNo != null && String(cfg.boardNo).trim() !== '');
    }

    function base64ToBytes(b64) {
        const normalized = b64.replace(/-/g, '+').replace(/_/g, '/');
        const bin = global.atob(normalized);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) {
            out[i] = bin.charCodeAt(i);
        }
        return out;
    }

    function bufferToHex(buf) {
        const bytes = new Uint8Array(buf);
        let s = '';
        for (let i = 0; i < bytes.length; i += 1) {
            s += bytes[i].toString(16).padStart(2, '0');
        }
        return s;
    }

    async function hmacSha256Hex(dataText, base64Key) {
        const enc = new TextEncoder();
        const keyBytes = base64ToBytes(base64Key);
        const cryptoKey = await global.crypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign'],
        );
        const sig = await global.crypto.subtle.sign('HMAC', cryptoKey, enc.encode(dataText));
        return bufferToHex(sig);
    }

    function sleep(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    async function postScore(boardNo, scoreText, hmacKey) {
        const path = `/gameplay_api/v1/scoreboards/${boardNo}/scores`;
        const unixTime = String(Math.floor(Date.now() / 1000));
        const payload = `POST\n${path}\n${unixTime}\n${scoreText}`;
        const signature = await hmacSha256Hex(payload, hmacKey);

        const form = new FormData();
        form.append('score', scoreText);

        const res = await global.fetch(path, {
            method: 'POST',
            headers: {
                'X-Unityroom-Timestamp': unixTime,
                'X-Unityroom-Signature': signature,
            },
            body: form,
            credentials: 'same-origin',
        });
        return res;
    }

    function UnityroomScoreSender() {
        this._confirmedMax = null;
        this._lockUntil = 0;
        this._processing = false;
        this._queue = [];
    }

    UnityroomScoreSender.prototype._enqueue = function (secondsInt) {
        const cfg = getConfig();
        if (!configReady(cfg)) {
            return;
        }
        if (typeof global.crypto === 'undefined' || !global.crypto.subtle) {
            emit('ランキング送信には HTTPS 環境が必要です', 'error');
            return;
        }
        const sec = Math.max(0, Math.floor(Number(secondsInt)));
        if (this._confirmedMax !== null && sec <= this._confirmedMax) {
            return;
        }
        this._queue.push(sec);
        void this._drain();
    };

    UnityroomScoreSender.prototype._drain = async function () {
        if (this._processing) {
            return;
        }
        this._processing = true;
        try {
            while (this._queue.length > 0) {
                const batch = Math.max.apply(null, this._queue);
                this._queue.length = 0;

                if (this._confirmedMax !== null && batch <= this._confirmedMax) {
                    continue;
                }

                const nowS = Math.floor(Date.now() / 1000);
                if (nowS < this._lockUntil) {
                    await sleep((this._lockUntil - nowS) * 1000);
                }
                this._lockUntil = Math.floor(Date.now() / 1000) + INTERVAL_SECONDS;

                const cfg = getConfig();
                if (!configReady(cfg)) {
                    break;
                }

                const scoreText = String(batch);
                emit('ランキング送信中…', 'info');

                let ok = false;
                for (let attempt = 0; attempt < MAX_TRY_COUNT; attempt += 1) {
                    if (attempt > 0) {
                        await sleep(INTERVAL_SECONDS * 1000);
                    }
                    try {
                        const res = await postScore(cfg.boardNo, scoreText, cfg.hmacKey);
                        if (res.ok) {
                            ok = true;
                            break;
                        }
                    } catch (_) {
                        /* retry */
                    }
                }

                if (ok) {
                    this._confirmedMax = batch;
                    emit(`ランキング送信済み（${scoreText} 秒）`, 'ok');
                } else {
                    emit('ランキング送信に失敗しました', 'error');
                }
            }
        } finally {
            this._processing = false;
            if (this._queue.length > 0) {
                void this._drain();
            }
        }
    };

    const sender = new UnityroomScoreSender();

    global.DodgeUnityroomScore = {
        notifySurvivalSeconds: function (seconds) {
            sender._enqueue(seconds);
        },
    };
})(typeof window !== 'undefined' ? window : globalThis);
