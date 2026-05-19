/* 
    HCI Experiment Cleaned Version for Rotatable Puzzle
    无步数限制纯净版 + AI 全量逆序回放解法
*/

const EXPERIMENT_CONFIG = { gameName: "RotatablePuzzle", thinkTimeSec: 5 };

var BOARD_SEL = "#sudoku-board";
var W = 3, H = 3;
var board = [];
var selIdx = 0;
var historyStack = [];
var initialState = null;
var PUZZLE_IMAGE_URL = '';

var aiSolutionMoves = [];

// ==========================================
// 1. 游戏本体逻辑
// ==========================================

function generateBoard() {
    board = [];
    for (let i = 0; i < W * H; i++) {
        board.push({ id: (i === W * H - 1) ? 0 : i + 1, angle: 0 });
    }
}

function shuffleBoard(moves) {
    let holeIdx = W * H - 1;
    aiSolutionMoves = [];
    let lastHoleIdx = -1;

    for (let i = 0; i < moves; i++) {
        let dirs = [];
        let x = holeIdx % W, y = Math.floor(holeIdx / W);

        if (x > 0 && (holeIdx - 1) !== lastHoleIdx) dirs.push(-1);
        if (x < W - 1 && (holeIdx + 1) !== lastHoleIdx) dirs.push(1);
        if (y > 0 && (holeIdx - W) !== lastHoleIdx) dirs.push(-W);
        if (y < H - 1 && (holeIdx + W) !== lastHoleIdx) dirs.push(W);

        if (dirs.length === 0) {
            if (x > 0) dirs.push(-1);
            if (x < W - 1) dirs.push(1);
            if (y > 0) dirs.push(-W);
            if (y < H - 1) dirs.push(W);
        }

        let move = dirs[Math.floor(Math.random() * dirs.length)];
        let targetIdx = holeIdx + move;

        let temp = board[holeIdx];
        board[holeIdx] = board[targetIdx];
        board[targetIdx] = temp;

        aiSolutionMoves.unshift({ type: 'move', from: holeIdx, to: targetIdx });
        lastHoleIdx = holeIdx;
        holeIdx = targetIdx;

        let randTile = Math.floor(Math.random() * (W * H));
        if (board[randTile].id !== 0) {
            let rots = Math.floor(Math.random() * 3) + 1;
            board[randTile].angle += 90 * rots;
            aiSolutionMoves.unshift({ type: 'rotate', tileId: board[randTile].id, times: 4 - rots });
        }
    }
    selIdx = 0;
}

function init_DOM() {
    $(BOARD_SEL).empty();
    for (let i = 0; i < W * H; i++) {
        let tileId = board[i].id;
        if (tileId !== 0) {
            let origIndex = tileId - 1;
            let origX = origIndex % W, origY = Math.floor(origIndex / W);
            let bgPosX = (W === 1) ? 0 : (origX * 100 / (W - 1));
            let bgPosY = (H === 1) ? 0 : (origY * 100 / (H - 1));

            let $tile = $(`<div id="tile-${tileId}" class="tile-outer">
                             <div class="tile-inner" style="
                                background-image: url('${PUZZLE_IMAGE_URL}');
                                background-size: ${W * 100}% ${H * 100}%;
                                background-position: ${bgPosX}% ${bgPosY}%;
                             "></div>
                           </div>`);
            $(BOARD_SEL).append($tile);

            // 单击：仅仅瞄准/选中目标（红框移过去）
            $tile.click(function () {
                if (window.EXPERIMENT_IS_PAUSED) return;
                let clickedId = parseInt($(this).attr("id").split("-")[1]);
                let idx = board.findIndex(t => t.id === clickedId);
                selIdx = idx;
                render_board();
            });

            // 双击：触发移动（如果它紧挨着空位）
            $tile.dblclick(function () {
                if (window.EXPERIMENT_IS_PAUSED) return;
                let clickedId = parseInt($(this).attr("id").split("-")[1]);
                let idx = board.findIndex(t => t.id === clickedId);
                selIdx = idx; // 确保红框跟上
                if (slideTile(idx)) HCI.setMoveState(true);
            });
        }
    }
    $(BOARD_SEL).append('<div id="selection-box"></div>');
}

function render_board() {
    let pct = 100 / W;
    for (let i = 0; i < W * H; i++) {
        let tile = board[i];
        if (tile.id !== 0) {
            let x = i % W, y = Math.floor(i / W);
            let $tile = $(`#tile-${tile.id}`);
            $tile.css({ "width": `${pct}%`, "height": `${pct}%`, "left": `${x * pct}%`, "top": `${y * pct}%` });
            $tile.find('.tile-inner').css("transform", `rotate(${tile.angle}deg)`);
        }
    }
    let selX = selIdx % W, selY = Math.floor(selIdx / W);
    $("#selection-box").css({ "width": `${pct}%`, "height": `${pct}%`, "left": `${selX * pct}%`, "top": `${selY * pct}%` });
}

function slideTile(idx) {
    let holeIdx = board.findIndex(t => t.id === 0);
    let r1 = Math.floor(idx / W), c1 = idx % W;
    let r2 = Math.floor(holeIdx / W), c2 = holeIdx % W;

    if (Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1) {
        historyStack.push({ board: JSON.parse(JSON.stringify(board)), selIdx: selIdx });
        let temp = board[idx]; board[idx] = board[holeIdx]; board[holeIdx] = temp;
        selIdx = holeIdx;
        render_board();
        checkWin();
        return true;
    }
    return false;
}

function rotateTile(idx) {
    if (board[idx].id === 0) return false;
    historyStack.push({ board: JSON.parse(JSON.stringify(board)), selIdx: selIdx });
    board[idx].angle += 90;
    render_board();
    checkWin();
    return true;
}

// 【修改】只判断胜利，不再有死局和步数耗尽的惩罚
function checkWin() {
    let isWin = true;
    for (let i = 0; i < W * H - 1; i++) {
        if (board[i].id !== i + 1 || board[i].angle % 360 !== 0) { isWin = false; break; }
    }
    if (board[W * H - 1].id !== 0) isWin = false;

    if (isWin) {
        HCI.logEvent('game_complete', { success: true });
        setTimeout(function () {
            alert(`神乎其技！您已成功还原拼图！`);
            HCI.endGame(true);
        }, 300);
    }
}

// 统一操作：移除方向键，仅保留空格旋转和回车移动
$(document).keydown(function (e) {
    if (window.EXPERIMENT_IS_PAUSED) return;
    let moved = false;

    if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        moved = rotateTile(selIdx);
    }
    else if (e.key === 'Enter') {
        e.preventDefault();
        moved = slideTile(selIdx);
    }

    render_board();
    if (moved) HCI.setMoveState(true);
});

var start_game = function () {
    var diffStr = ["简单", "中等", "困难"];
    var lvl = HCI.state.currentLevel;
    $("#level-indicator").text("当前难度：" + diffStr[lvl]);

    // 【修改】按难度精确控制图片的展示，确保不重复
    if (lvl === 2) {
        // 困难难度：必定是螺旋图
        PUZZLE_IMAGE_URL = 'img/spiral.png';
        $(BOARD_SEL).addClass("hardcore-mode");
    } else {
        // 简单/中等难度：随机抽取且不重复
        $(BOARD_SEL).removeClass("hardcore-mode");

        // 检查 localStorage 里是否已经存了本次实验用过的图片数组
        let usedImages = JSON.parse(localStorage.getItem("HCI_UsedImages_Twiddle")) || [];
        let availableImages = ['img/birds.png', 'img/sea.png', 'img/stone.png'];

        // 过滤掉已经用过的图片
        let remainingImages = availableImages.filter(img => !usedImages.includes(img));

        // 如果备用图片库被抽空了（极端情况），就清空记录重新开始抽
        if (remainingImages.length === 0) {
            remainingImages = [...availableImages];
            usedImages = [];
        }

        // 随机抽取一张，并记录到已使用列表
        PUZZLE_IMAGE_URL = remainingImages[Math.floor(Math.random() * remainingImages.length)];
        usedImages.push(PUZZLE_IMAGE_URL);
        localStorage.setItem("HCI_UsedImages_Twiddle", JSON.stringify(usedImages));
    }

    var configs = [
        { w: 3, h: 3, shuffle: 15 },
        { w: 4, h: 4, shuffle: 35 },
        { w: 5, h: 5, shuffle: 60 }
    ];

    W = configs[lvl].w; H = configs[lvl].h;
    historyStack = [];

    generateBoard();
    shuffleBoard(configs[lvl].shuffle);

    initialState = { board: JSON.parse(JSON.stringify(board)), selIdx: selIdx };

    init_DOM();
    render_board();
}

// ==========================================
// 2. 绑定 HCI 基座
// ==========================================
$(function () {
    HCI.init({ gameName: "RotatablePuzzle", thinkTimeSec: 5 }, {
        onUndo: () => {
            let lastState = historyStack.pop();
            board = lastState.board; selIdx = lastState.selIdx;
            render_board();
            HCI.setMoveState(historyStack.length > 0);
        },
        onReset: () => {
            board = JSON.parse(JSON.stringify(initialState.board));
            selIdx = initialState.selIdx; historyStack = [];
            render_board();
            HCI.setMoveState(false);
        },
        onHint: () => {
            HCI.pauseGame("计算全局通关路径中...");

            alert(`【AI 教学】\n系统将为您重置盘面，并闪电演示全量通关解法！\n请注意观察操作路线！`);
            historyStack = [];

            // 强制将UI和后台切回 initialState
            board = JSON.parse(JSON.stringify(initialState.board));
            selIdx = initialState.selIdx;
            render_board();

            let flatMoves = [];

            // ==========================================
            // 【全新高智商 AI 逻辑：先统筹转正，再集中位移】
            // ==========================================

            // 阶段 1：先把所有乱转的方块，一口气全部转正！
            board.forEach(t => {
                if (t.id !== 0) {
                    let remainder = t.angle % 360;
                    if (remainder < 0) remainder += 360; // 处理可能的负数角度
                    if (remainder !== 0) {
                        // 计算需要顺时针转几次才能回到正向 (0度)
                        let neededRots = (360 - remainder) / 90;
                        for (let r = 0; r < neededRots; r++) {
                            flatMoves.push({ type: 'rotate', tileId: t.id });
                        }
                    }
                }
            });

            // 阶段 2：提取历史录像，但【彻底抛弃】所有杂乱的旋转，只保留纯粹的滑动！
            aiSolutionMoves.forEach(act => {
                if (act.type === 'move') {
                    flatMoves.push(act);
                }
            });

            let step = 0;
            const $aiText = $("#exp-ai-text");
            $aiText.text(`AI 全量演示中 (共 ${flatMoves.length} 步)...`).fadeIn();

            function playNextAction() {
                if (step >= flatMoves.length) {
                    $aiText.text("演示结束，为您重置盘面...");
                    setTimeout(function () {
                        // 演示完重置，让玩家自己玩
                        board = JSON.parse(JSON.stringify(initialState.board));
                        selIdx = initialState.selIdx;
                        render_board();
                        HCI.resumeGame();
                        HCI.setMoveState(false);
                    }, 1500);
                    return;
                }

                let act = flatMoves[step];
                if (act.type === 'rotate') {
                    let tIdx = board.findIndex(t => t.id === act.tileId);
                    board[tIdx].angle += 90;
                    selIdx = tIdx; // 选框跟过去，模拟AI正在操作它
                    $aiText.text(`演算阶段 1: 修正所有方块朝向 (${step + 1}/${flatMoves.length})`);
                } else if (act.type === 'move') {
                    let temp = board[act.from]; board[act.from] = board[act.to]; board[act.to] = temp;
                    selIdx = act.to; // 选框跟过去
                    $aiText.text(`演算阶段 2: 华容道位移复原 (${step + 1}/${flatMoves.length})`);
                }

                render_board();
                step++;

                // 这里的速度我设的是 200 毫秒（极速复原）。
                // 如果你确实希望每步都要像其他游戏一样停顿 0.8 秒，请把 200 改成 800。
                // (注意：如果步数有 60 步，0.8 秒会导致动画播放长达 48 秒哦！)
                setTimeout(playNextAction, 800);
            }

            setTimeout(playNextAction, 1000);
        }
    });

    start_game();
});