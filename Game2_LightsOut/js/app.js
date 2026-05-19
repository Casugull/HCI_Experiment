var BOARD_SEL = "#sudoku-board";
var W = 5, H = 5;
var board = [];
var solution = [];
var selectedPos = null;
var maxSteps = 15;
var currentSteps = 0;
var historyStack = [];
var initialState = null;
var currentCellSize = "60px";

function generateBoard(shuffleClicks) {
    board = Array.from({ length: H }, () => new Array(W).fill(false));
    solution = Array.from({ length: H }, () => new Array(W).fill(false));
    let actualClicks = 0;
    for (let i = 0; i < shuffleClicks; i++) {
        let rx = Math.floor(Math.random() * W);
        let ry = Math.floor(Math.random() * H);
        if (!solution[ry][rx]) {
            toggleLightsSim(rx, ry);
            solution[ry][rx] = true;
            actualClicks++;
        }
    }
    return actualClicks;
}

function toggleLightsSim(x, y) {
    let dirs = [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]];
    for (let d of dirs) {
        let nx = x + d[0], ny = y + d[1];
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) board[ny][nx] = !board[ny][nx];
    }
}

function build_board() {
    $(BOARD_SEL).empty();
    var table = '';
    for (var y = 0; y < H; y++) {
        table += "<tr>";
        for (var x = 0; x < W; x++) {
            table += `<td><div id="c_${x}_${y}" data-x="${x}" data-y="${y}" class="light-cell" style="width:${currentCellSize}; height:${currentCellSize};"></div></td>`;
        }
        table += "</tr>";
    }
    $(BOARD_SEL).html(table);

    $(BOARD_SEL + " .light-cell").click(function () {
        if (window.EXPERIMENT_IS_PAUSED) return;
        let targetX = parseInt($(this).attr("data-x")), targetY = parseInt($(this).attr("data-y"));
        if (selectedPos && selectedPos.x === targetX && selectedPos.y === targetY) selectedPos = null;
        else selectedPos = { x: targetX, y: targetY };
        render_board();
    });
}

function render_board() {
    let affected = Array.from({ length: H }, () => new Array(W).fill(false));
    if (selectedPos) {
        let dirs = [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]];
        for (let d of dirs) {
            let nx = selectedPos.x + d[0], ny = selectedPos.y + d[1];
            if (nx >= 0 && nx < W && ny >= 0 && ny < H) affected[ny][nx] = true;
        }
    }
    for (var y = 0; y < H; y++) {
        for (var x = 0; x < W; x++) {
            let $cell = $(`#c_${x}_${y}`);
            let isOn = board[y][x], isAffected = affected[y][x];
            $cell.removeClass("is-on preview-on preview-off selected-target");
            if (selectedPos && selectedPos.x === x && selectedPos.y === y) $cell.addClass("selected-target");
            if (isAffected) {
                if (isOn) $cell.addClass("preview-off"); else $cell.addClass("preview-on");
            } else {
                if (isOn) $cell.addClass("is-on");
            }
        }
    }
    $("#step-display").text(`剩余步数: ${maxSteps - currentSteps} / ${maxSteps}`);
}

function calculateRemainingSteps() {
    let needed = 0;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) { if (solution[y][x]) needed++; }
    }
    return needed;
}

function executeToggle(x, y) {
    if (currentSteps >= maxSteps) return;
    historyStack.push({ board: JSON.parse(JSON.stringify(board)), solution: JSON.parse(JSON.stringify(solution)), steps: currentSteps });

    toggleLightsSim(x, y);
    solution[y][x] = !solution[y][x];
    currentSteps++;
    selectedPos = null;

    render_board();
    HCI.setMoveState(historyStack.length > 0);

    let $cell = $(`#c_${x}_${y}`);
    $cell.addClass("trigger-pulse");
    setTimeout(() => $cell.removeClass("trigger-pulse"), 200);
    checkWinOrDeadEnd();
}

function checkWinOrDeadEnd() {
    let isWin = true;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) { if (board[y][x]) { isWin = false; break; } }
        if (!isWin) break;
    }
    if (isWin) {
        HCI.logEvent('game_complete', { success: true, steps_used: currentSteps });
        alert(`神乎其技！仅用 ${currentSteps} 步完成闭环！`);
        HCI.endGame(true);
    } else if (currentSteps >= maxSteps) {
        window.EXPERIMENT_IS_PAUSED = true;
        HCI.showDeadEndModal(
            // 如果玩家在弹窗选【免费重置】
            () => {
                HCI.callbacks.onReset();
            },
            // 如果玩家在弹窗选【消耗提示演示】
            () => {
                // 模拟点击一次提示按钮，这样会自动扣除全局提示次数并触发 onHint
                document.getElementById('exp-btn-hint').click();
            }
        );
    }
}

$(document).keydown(function (e) {
    if (window.EXPERIMENT_IS_PAUSED || !selectedPos) return;
    if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        executeToggle(selectedPos.x, selectedPos.y);
    }
});

var start_game = function () {
    var diffStr = ["简单", "中等", "困难"];
    var lvl = HCI.state.currentLevel;
    $("#level-indicator").text("当前难度：" + diffStr[lvl]);

    // 【修改】网格统一调整为 5x5, 6x6, 7x7。
    // 【修改】cellSize 固定为 50px，切换难度时格子大小不再改变。
    var configs = [
        { w: 5, h: 5, cellSize: "50px", shuffle: 4, tol: 3 },
        { w: 6, h: 6, cellSize: "50px", shuffle: 8, tol: 2 },
        { w: 7, h: 7, cellSize: "50px", shuffle: 15, tol: 1 }
    ];

    W = configs[lvl].w;
    H = configs[lvl].h;
    currentCellSize = configs[lvl].cellSize;
    currentSteps = 0;
    historyStack = [];
    selectedPos = null;

    let optimalSteps = generateBoard(configs[lvl].shuffle);
    maxSteps = optimalSteps + configs[lvl].tol;

    initialState = { board: JSON.parse(JSON.stringify(board)), solution: JSON.parse(JSON.stringify(solution)) };

    build_board();
    render_board();
}

$(function () {
    // 【核心】基座接管
    HCI.init({ gameName: "LightsOut", thinkTimeSec: 5 }, {
        onUndo: () => {
            let lastState = historyStack.pop();
            board = lastState.board; solution = lastState.solution; currentSteps = lastState.steps;
            selectedPos = null; render_board();
            HCI.setMoveState(historyStack.length > 0);
        },
        onReset: () => {
            board = JSON.parse(JSON.stringify(initialState.board));
            solution = JSON.parse(JSON.stringify(initialState.solution));
            currentSteps = 0; historyStack = []; selectedPos = null; render_board();
            HCI.setMoveState(false);
        },
        onHint: () => {
            let aiNeedSteps = calculateRemainingSteps();
            let willFail = (currentSteps + aiNeedSteps) > maxSteps;

            if (willFail) {
                // 如果死局，呼出选择弹窗
                HCI.showDeadEndModal(
                    () => { HCI.callbacks.onReset(); },   // 选免费重置，退还次数并重置
                    () => { executeHint(true); }          // 选直接演示，消耗次数开始动画
                );
            } else {
                executeHint(false); // 没死局，直接演示
            }

            function executeHint(isDeadEnd) {
                HCI.pauseGame("正在建立演算模型...");
                let startBoard, startSolution;

                if (isDeadEnd) {
                    startBoard = JSON.parse(JSON.stringify(initialState.board));
                    startSolution = JSON.parse(JSON.stringify(initialState.solution));
                    board = JSON.parse(JSON.stringify(startBoard));
                    solution = JSON.parse(JSON.stringify(startSolution));
                    currentSteps = 0; selectedPos = null; historyStack = []; render_board();
                } else {
                    startBoard = JSON.parse(JSON.stringify(board));
                    startSolution = JSON.parse(JSON.stringify(solution));
                }

                var moves = [];
                for (let y = 0; y < H; y++) {
                    for (let x = 0; x < W; x++) { if (startSolution[y][x]) moves.push({ x: x, y: y }); }
                }
                moves.sort(() => Math.random() - 0.5);

                let stepIdx = 0;
                function playNext() {
                    if (stepIdx >= moves.length) {
                        $("#exp-ai-text").text("路径演示结束，移交操作权");
                        setTimeout(() => {
                            if (!isDeadEnd) { board = JSON.parse(JSON.stringify(startBoard)); solution = JSON.parse(JSON.stringify(startSolution)); }
                            else { board = JSON.parse(JSON.stringify(initialState.board)); solution = JSON.parse(JSON.stringify(initialState.solution)); }
                            selectedPos = null; render_board(); HCI.resumeGame(); HCI.setMoveState(historyStack.length > 0);
                        }, 1500);
                        return;
                    }
                    let move = moves[stepIdx];
                    selectedPos = { x: move.x, y: move.y }; render_board();
                    $("#exp-ai-text").text(`演算第 ${stepIdx + 1}/${moves.length} 步`);

                    setTimeout(() => {
                        toggleLightsSim(move.x, move.y); solution[move.y][move.x] = false;
                        let $cell = $(`#c_${move.x}_${move.y}`).addClass("trigger-pulse");
                        setTimeout(() => $cell.removeClass("trigger-pulse"), 200);
                        selectedPos = null; render_board(); stepIdx++; setTimeout(playNext, 600);
                    }, 200);
                }
                setTimeout(playNext, 1000);
            }
        }
    });

    start_game();
});