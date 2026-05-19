/**
 * HCI Experiment Unified Base (V5.1 Super Base - 带管理员上帝模式)
 * 集成: 面部提取、键鼠监听、IndexedDB、动态难度、真实积分结算、测试权限
 */

const HCI = {
    config: { gameName: "Unknown", thinkTimeSec: 5, maxUndos: 3 },

    // 全局限制与当前状态
    state: {
        mode: localStorage.getItem("HCI_Mode") || "play",
        participantId: localStorage.getItem("HCI_ParticipantID") || "Test",
        isAdmin: localStorage.getItem("HCI_IsAdmin") === "true", // 判断是否为管理员
        currentLevel: 0,
        globalHintsLeft: parseInt(localStorage.getItem("HCI_GlobalHints")) || 3,
        globalSkipsLeft: parseInt(localStorage.getItem("HCI_GlobalSkips")) || 5,
        localUndosLeft: 3,
        localHintUsed: false,
        isThinking: true,
        hasMoved: false,
        startTime: 0
    },

    // 传感器数据组
    trackingData: {
        face_features: [],
        mouse_events: [],
        keyboard_events: [],
        game_logs: []
    },

    callbacks: { onUndo: null, onReset: null, onHint: null },

    init: function (config, callbacks) {
        Object.assign(this.config, config);
        Object.assign(this.callbacks, callbacks);
        this.state.localUndosLeft = this.config.maxUndos || 3;
        window.EXPERIMENT_IS_PAUSED = false;

        this.loadGameState();
        this.injectUI();
        this.bindEvents();

        this.state.startTime = Date.now();
        this.logEvent('game_start');

        // --- 核心：动态思考期 ---
        let lockTimeSec = 60;
        if (this.state.isAdmin) {
            lockTimeSec = 5; // 管理员永远只等 5 秒
        } else {
            // 普通被试按难度递增：60 / 90 / 120 秒
            lockTimeSec = this.state.currentLevel === 0 ? 60 : (this.state.currentLevel === 1 ? 90 : 120);
        }

        setTimeout(() => {
            this.state.isThinking = false;
            this.logEvent('forced_end');
            document.getElementById('exp-placeholder-hint').style.display = 'none';
            document.getElementById('exp-placeholder-skip').style.display = 'none';
            document.getElementById('exp-btn-hint').style.display = 'block';
            document.getElementById('exp-btn-skip').style.display = 'block';

            // 管理员专属秒过按钮亮起
            if (this.state.isAdmin) {
                document.getElementById('exp-btn-admin-win').style.display = 'block';
            }

            this.updatePanel();
        }, lockTimeSec * 1000);

        // 如果是实验模式，启动所有传感器！
        if (this.state.mode === 'experiment') {
            this.startTracking();
        }
    },

    loadGameState: function () {
        let savedLevel = localStorage.getItem("HCI_Level_" + this.config.gameName);
        this.state.currentLevel = (savedLevel !== null && !isNaN(savedLevel)) ? parseInt(savedLevel) : 0;
    },

    // ==========================================
    // 1. UI 渲染与控制
    // ==========================================
    injectUI: function () {
        const style = document.createElement('style');
        style.innerHTML = `
            #exp-control-panel { position: fixed; bottom: 20px; right: 20px; z-index: 9999; background: #f8f9fa; padding: 15px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: flex; gap: 10px; font-family: sans-serif; }
            .exp-btn-placeholder { width: 140px; height: 40px; background: #e9ecef; border-radius: 4px; display: inline-block; }
            .exp-btn { width: 140px; height: 40px; border: none; border-radius: 4px; font-size: 14px; font-weight: bold; cursor: pointer; display: none; transition: 0.2s; }
            #exp-btn-undo { background: #17a2b8; color: #fff; display: block; }
            #exp-btn-reset { background: #6c757d; color: #fff; display: block; }
            #exp-btn-hint { background: #ffc107; color: #000; }
            #exp-btn-skip { background: #dc3545; color: #fff; }
            #exp-btn-admin-win { background: #8e44ad; color: #fff; } /* 管理员专属紫色秒过按钮 */
            .exp-btn:disabled { background: #ccc !important; color: #666 !important; cursor: not-allowed; opacity: 0.7; }
            #exp-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 9998; display: none; background: rgba(0, 0, 0, 0.4); }
            #exp-ai-text { position: absolute; top: 10%; left: 50%; transform: translate(-50%, 0); background: rgba(0, 0, 0, 0.85); color: #fff; padding: 15px 30px; font-size: 24px; border-radius: 8px; display: none; pointer-events: none; z-index: 9999; }
            
            #exp-deadend-modal { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.6); z-index: 10000; display: none; align-items: center; justify-content: center; }
            .modal-box { background: #fff; padding: 30px; border-radius: 12px; text-align: center; max-width: 420px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); font-family: sans-serif; }
            .modal-btn { padding: 12px 20px; border: none; border-radius: 6px; font-size: 15px; font-weight: bold; cursor: pointer; }
            .modal-btn-reset { background: #6c757d; color: #fff; }
            .modal-btn-demo { background: #ffc107; color: #000; }
        `;
        document.head.appendChild(style);

        const panelHTML = `
            <div id="exp-control-panel">
                <button id="exp-btn-undo" class="exp-btn" disabled>撤回 [限3次]</button>
                <button id="exp-btn-reset" class="exp-btn" disabled>重置 (无限)</button>
                <div id="exp-placeholder-hint" class="exp-btn-placeholder"></div>
                <div id="exp-placeholder-skip" class="exp-btn-placeholder"></div>
                <button id="exp-btn-hint" class="exp-btn">提示 (-2分)</button>
                <button id="exp-btn-skip" class="exp-btn">放弃 (得0分)</button>
                <button id="exp-btn-admin-win" class="exp-btn">✨ 秒过 (算通关)</button>
            </div>
            <div id="exp-overlay"></div><div id="exp-ai-text">AI 辅助中...</div>
            <div id="exp-deadend-modal">
                <div class="modal-box">
                    <h3 style="color:#dc3545; margin-top:0;">⚠️ 无法通关</h3>
                    <p style="color:#555; margin-bottom:25px;">当前步数已耗尽。请选择重置本局，或消耗提示查看解法。</p>
                    <div style="display:flex; justify-content:space-between; gap: 15px;">
                        <button id="btn-deadend-reset" class="modal-btn modal-btn-reset">免费重置</button>
                        <button id="btn-deadend-demo" class="modal-btn modal-btn-demo">消耗提示演示</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', panelHTML);
    },

    updatePanel: function () {
        const btnHint = document.getElementById('exp-btn-hint');
        const btnSkip = document.getElementById('exp-btn-skip');
        const btnUndo = document.getElementById('exp-btn-undo');
        const btnReset = document.getElementById('exp-btn-reset');

        if (this.state.isAdmin) {
            // 管理员：无限资源
            btnHint.innerText = `提示 (无限)`;
            btnSkip.innerText = `放弃 (无限)`;
            btnUndo.innerText = `撤回 (无限)`;
            btnHint.disabled = false;
            btnSkip.disabled = false;
            btnReset.disabled = !this.state.hasMoved;
            btnUndo.disabled = !this.state.hasMoved;
        } else {
            // 普通被试：严格限制
            btnHint.innerText = `提示 (-2分) [全局剩${this.state.globalHintsLeft}]`;
            btnSkip.innerText = `放弃 (得0分) [全局剩${this.state.globalSkipsLeft}]`;
            btnUndo.innerText = `撤回 [剩${this.state.localUndosLeft}次]`;
            btnHint.disabled = (this.state.globalHintsLeft <= 0 || this.state.localHintUsed);
            btnSkip.disabled = (this.state.globalSkipsLeft <= 0);
            btnReset.disabled = !this.state.hasMoved;
            btnUndo.disabled = (!this.state.hasMoved || this.state.localUndosLeft <= 0);
        }
    },

    setMoveState: function (moved) {
        this.state.hasMoved = moved;
        this.updatePanel();
    },

    // ==========================================
    // 2. 交互事件与按钮回调
    // ==========================================
    bindEvents: function () {
        const self = this;
        document.getElementById('exp-btn-undo').onclick = function () {
            if (this.disabled) return;
            if (!self.state.isAdmin) self.state.localUndosLeft--; // 管理员不扣次数
            self.logEvent('undo_click');
            if (self.callbacks.onUndo) self.callbacks.onUndo();
        };

        document.getElementById('exp-btn-reset').onclick = function () {
            if (this.disabled) return;
            self.logEvent('reset_click');
            if (self.callbacks.onReset) self.callbacks.onReset();
        };

        const btnHint = document.getElementById('exp-btn-hint');
        let hoverStart = 0;
        btnHint.onmouseenter = () => { if (!btnHint.disabled) { hoverStart = Date.now(); self.logEvent('hint_hover_start'); } };
        btnHint.onmouseleave = () => { if (!btnHint.disabled && hoverStart) { self.logEvent('hint_hover_end', { dwell_time: Date.now() - hoverStart }); hoverStart = 0; } };

        btnHint.onclick = function () {
            if (this.disabled) return;
            if (!self.state.isAdmin) {
                self.state.globalHintsLeft--;
                self.state.localHintUsed = true;
                localStorage.setItem("HCI_GlobalHints", self.state.globalHintsLeft);
            }
            self.updatePanel();
            self.logEvent('hint_click');
            if (self.callbacks.onHint) self.callbacks.onHint();
        };

        document.getElementById('exp-btn-skip').onclick = function () {
            if (this.disabled) return;
            let msg = self.state.isAdmin ? "确定放弃对局吗？（管理员不扣次数）" : "确定要放弃当前对局吗？本局得分为 0，且消耗一次全局跳过次数。";
            if (confirm(msg)) {
                if (!self.state.isAdmin) {
                    self.state.globalSkipsLeft--;
                    localStorage.setItem("HCI_GlobalSkips", self.state.globalSkipsLeft);
                }
                self.logEvent('skip_click');
                self.endGame(false, "Give_Up"); // 放弃，不升级难度
            }
        };

        // --- 管理员专属：一键真通关 ---
        document.getElementById('exp-btn-admin-win').onclick = function () {
            self.endGame(true, "Admin_AutoWin");
        };

        // 防切屏监测
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) self.logEvent('tab_switch_away');
            else self.logEvent('tab_switch_back');
        });
    },

    showDeadEndModal: function (onReset, onDemo) {
        const modal = document.getElementById('exp-deadend-modal');
        modal.style.display = 'flex';
        document.getElementById('btn-deadend-reset').onclick = () => { modal.style.display = 'none'; if (onReset) onReset(); };
        document.getElementById('btn-deadend-demo').onclick = () => { modal.style.display = 'none'; if (onDemo) onDemo(); };
    },

    pauseGame: function (text) {
        window.EXPERIMENT_IS_PAUSED = true;
        document.getElementById('exp-overlay').style.display = 'block';
        document.getElementById('exp-ai-text').innerText = text;
        document.getElementById('exp-ai-text').style.display = 'block';
    },
    resumeGame: function () {
        window.EXPERIMENT_IS_PAUSED = false;
        document.getElementById('exp-overlay').style.display = 'none';
        document.getElementById('exp-ai-text').style.display = 'none';
    },

    logEvent: function (eventType, extraData = {}) {
        this.trackingData.game_logs.push({ timestamp: Date.now(), event: eventType, level: this.state.currentLevel, ...extraData });
    },

    // ==========================================
    // 3. 高频数据采集器
    // ==========================================
    startTracking: function () {
        const self = this;

        document.addEventListener('mousemove', (e) => {
            self.trackingData.mouse_events.push({ timestamp: Date.now(), type: 'move', x: e.clientX, y: e.clientY });
        });
        document.addEventListener('mousedown', (e) => {
            self.trackingData.mouse_events.push({ timestamp: Date.now(), type: 'click', btn: e.button, x: e.clientX, y: e.clientY });
        });
        document.addEventListener('keydown', (e) => {
            self.trackingData.keyboard_events.push({ timestamp: Date.now(), type: 'keydown', key: e.key, code: e.code });
        });

        const video = document.createElement('video');
        video.style.display = 'none';
        document.body.appendChild(video);

        const loadScript = (src) => new Promise(r => { let s = document.createElement('script'); s.src = src; s.onload = r; document.head.appendChild(s); });

        Promise.all([
            loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js'),
            loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js')
        ]).then(() => {
            const faceMesh = new FaceMesh({ locateFile: (file) => "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/" + file });
            faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });

            faceMesh.onResults((results) => {
                if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
                    const lm = results.multiFaceLandmarks[0];
                    const left_ear = Math.abs(lm[159].y - lm[145].y) / Math.abs(lm[133].x - lm[33].x);
                    const right_ear = Math.abs(lm[386].y - lm[374].y) / Math.abs(lm[263].x - lm[362].x);
                    const au4_ratio = Math.abs(lm[107].x - lm[336].x);
                    const pitch = lm[10].y - lm[152].y;

                    self.trackingData.face_features.push({
                        timestamp: Date.now(), face_detected: 1,
                        left_ear: left_ear, right_ear: right_ear,
                        au4_ratio: au4_ratio, head_pitch: pitch
                    });
                } else {
                    self.trackingData.face_features.push({ timestamp: Date.now(), face_detected: 0 });
                }
            });

            const camera = new Camera(video, { onFrame: async () => { await faceMesh.send({ image: video }); }, width: 320, height: 240 });
            camera.start();
        });
    },

    // ==========================================
    // 4. 实验结算与 IndexedDB 落盘
    // ==========================================
    endGame: function (isSuccess, statusOverride = null) {
        window.EXPERIMENT_IS_PAUSED = true;
        const timeSpent = Math.floor((Date.now() - this.state.startTime) / 1000);

        let finalStatus = statusOverride || (isSuccess ? "Success" : "Failed");
        let scoreEarned = 0;

        if (isSuccess) {
            const baseScores = [3, 5, 7];
            scoreEarned = baseScores[this.state.currentLevel];
            // 管理员秒过也不扣分，真实使用提示才扣分
            if (this.state.localHintUsed && !this.state.isAdmin) scoreEarned -= 2;
            if (scoreEarned < 0) scoreEarned = 0;

            let nextLevel = this.state.currentLevel + 1;
            if (nextLevel > 2) nextLevel = 2;
            localStorage.setItem("HCI_Level_" + this.config.gameName, nextLevel);

            let completed = parseInt(localStorage.getItem("HCI_CompletedGames")) || 0;
            localStorage.setItem("HCI_CompletedGames", completed + 1);

            let totalScore = parseInt(localStorage.getItem("HCI_TotalScore")) || 0;
            localStorage.setItem("HCI_TotalScore", totalScore + scoreEarned);
        }

        let totalTime = parseInt(localStorage.getItem("HCI_TotalTimeSec")) || 0;
        localStorage.setItem("HCI_TotalTimeSec", totalTime + timeSpent);

        this.logEvent(isSuccess ? 'game_complete' : 'game_skip', { score: scoreEarned, time_spent: timeSpent });

        if (this.state.mode === 'experiment') {
            this.pauseGame("正在打包加密传感器数据...");
            const sessionData = {
                participant_id: this.state.participantId,
                game_name: this.config.gameName,
                level: this.state.currentLevel,
                status: finalStatus,
                score: scoreEarned,
                time_spent: timeSpent,
                tracking: this.trackingData
            };
            this.saveToDB(sessionData, () => {
                window.location.href = "../hub.html";
            });
        } else {
            window.location.href = "../hub.html";
        }
    },

    saveToDB: function (data, callback) {
        let req = indexedDB.open("HCI_Experiment_DB", 1);
        req.onupgradeneeded = function (e) {
            let db = e.target.result;
            if (!db.objectStoreNames.contains("sessions")) {
                db.createObjectStore("sessions", { autoIncrement: true });
            }
        };
        req.onsuccess = function (e) {
            let db = e.target.result;
            let tx = db.transaction("sessions", "readwrite");
            tx.objectStore("sessions").add(data);
            tx.oncomplete = function () { callback(); };
        };
        req.onerror = function () {
            alert("数据保存失败！请勿使用隐身模式！");
            callback();
        }
    }
};