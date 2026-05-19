/* 
    HCI Experiment Cleaned Version for Color Fill (溢彩画)
    接入 hci-base.js：动态 AI 选取与染色动画 + 容错死局计算
*/

var BOARD_SEL = "#sudoku-board";
var W = 10, H = 10;
var board = [];
var selectedRegion = [];
var maxSteps = 15;
var currentSteps = 0;
var currentCellSize = "45px";

var targetColorObj = 1;
var historyStack = [];
var initialState = null; // 用于重置和死局回档

var colorNames = { 1: "红色 (键1)", 2: "蓝色 (键2)", 3: "黄色 (键3)", 4: "绿色 (键4)", 5: "紫色 (键5)", 6: "橙色 (键6)" };
var colorHex = { 1: "#ff4d4f", 2: "#1890ff", 3: "#fadb14", 4: "#52c41a", 5: "#722ed1", 6: "#fa8c16" };

// ==========================================
// 1. 游戏本体逻辑
// ==========================================
function updateTopDisplay() {
    let colorNameOnly = colorNames[targetColorObj].split(" ")[0];
    $("#step-display").html(
        `目标：<span style="color:${colorHex[targetColorObj]}; font-weight:900; font-size:28px;">${colorNameOnly}</span> ` +
        `&nbsp;&nbsp;|&nbsp;&nbsp; ` +
        `<span style="color:#dc3545">剩余步数: ${maxSteps - currentSteps} / ${maxSteps}</span>`
    );
}

function generateBoard() {
    board = [];
    for (let y = 0; y < H; y++) {
        let row = [];
        for (let x = 0; x < W; x++) { row.push(Math.floor(Math.random() * 6) + 1); }
        board.push(row);
    }
}

function build_board() {
    $(BOARD_SEL).empty();
    var table = '';
    for (var y = 0; y < H; y++) {
        table += "<tr>";
        for (var x = 0; x < W; x++) {
            table += `<td><div id="c_${x}_${y}" data-x="${x}" data-y="${y}" class="color-cell color-${board[y][x]}" style="width:${currentCellSize}; height:${currentCellSize};"></div></td>`;
        }
        table += "</tr>";
    }
    $(BOARD_SEL).html(table);

    $(BOARD_SEL + " .color-cell").click(function () {
        if (window.EXPERIMENT_IS_PAUSED) return;
        let x = parseInt($(this).attr("data-x"));
        let y = parseInt($(this).attr("data-y"));
        selectConnectedRegion(x, y);
    });
}

function getRegions(currentBoard) {
    let visited = new Uint8Array(W * H);
    let regions = [];
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let idx = y * W + x;
            if (visited[idx] === 0) {
                let color = currentBoard[y][x];
                let region = [];
                let queue = [{ x: x, y: y }];
                visited[idx] = 1;
                let adjColors = new Set();
                let head = 0;
                while (head < queue.length) {
                    let curr = queue[head++];
                    region.push(curr);
                    let dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
                    for (let d of dirs) {
                        let nx = curr.x + d[0], ny = curr.y + d[1];
                        if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
                            if (currentBoard[ny][nx] === color) {
                                let nidx = ny * W + nx;
                                if (visited[nidx] === 0) { visited[nidx] = 1; queue.push({ x: nx, y: ny }); }
                            } else { adjColors.add(currentBoard[ny][nx]); }
                        }
                    }
                }
                regions.push({ points: region, color: color, adjColors: Array.from(adjColors) });
            }
        }
    }
    return regions;
}

function selectConnectedRegion(x, y) {
    $(".selected-region").removeClass("selected-region");
    let regions = getRegions(board);
    let targetR = regions.find(r => r.points.some(p => p.x === x && p.y === y));
    selectedRegion = targetR.points;
    selectedRegion.forEach(pos => { $(`#c_${pos.x}_${pos.y}`).addClass("selected-region"); });
}

function applyColor(newColor) {
    if (selectedRegion.length === 0) return false;
    let targetColor = board[selectedRegion[0].y][selectedRegion[0].x];
    if (targetColor === newColor) return false;

    historyStack.push({ board: JSON.parse(JSON.stringify(board)), selectedRegion: JSON.parse(JSON.stringify(selectedRegion)), steps: currentSteps });

    selectedRegion.forEach(pos => {
        board[pos.y][pos.x] = newColor;
        $(`#c_${pos.x}_${pos.y}`).attr("class", `color-cell color-${newColor} selected-region`);
    });

    selectConnectedRegion(selectedRegion[0].x, selectedRegion[0].y);
    return true;
}

function checkWinOrDeadEnd() {
    updateTopDisplay();
    let isWin = true;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) { if (board[y][x] !== targetColorObj) { isWin = false; break; } }
        if (!isWin) break;
    }

    if (isWin) {
        HCI.logEvent('game_complete', { success: true, steps_used: currentSteps });
        setTimeout(function () {
            alert(`恭喜！用时 ${currentSteps} 步成功染成目标色！`);
            HCI.endGame(true);
        }, 300);
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
    if (window.EXPERIMENT_IS_PAUSED || selectedRegion.length === 0) return;
    if (currentSteps >= maxSteps) return;
    let key = parseInt(e.key);
    if (key >= 1 && key <= 6) {
        if (applyColor(key)) {
            currentSteps++;
            HCI.setMoveState(true); // 通知基座：玩家已操作，点亮撤回/重置
            checkWinOrDeadEnd();
        }
    }
});

// === AI 核心逻辑 ===
function getBestMove(currentBoard) {
    let regions = getRegions(currentBoard);
    let minComponents = Infinity;
    let maxRegionSize = 0;
    let bestMove = { x: 0, y: 0, color: 1 };

    if (regions.length === 1) {
        let r = regions[0];
        if (r.color !== targetColorObj) return { x: r.points[0].x, y: r.points[0].y, color: targetColorObj };
        return bestMove;
    }

    for (let r of regions) {
        let startX = r.points[0].x, startY = r.points[0].y;
        for (let targetColor of r.adjColors) {
            for (let p of r.points) currentBoard[p.y][p.x] = targetColor;
            let newRegions = getRegions(currentBoard);
            let components = newRegions.length;
            let mergedSize = 0;
            for (let nr of newRegions) {
                if (nr.points.some(p => p.x === startX && p.y === startY)) { mergedSize = nr.points.length; break; }
            }
            let weight = (targetColor === targetColorObj) ? 0.5 : 0;
            let score = components - weight;

            if (score < minComponents || (score === minComponents && mergedSize > maxRegionSize)) {
                minComponents = score; maxRegionSize = mergedSize;
                bestMove = { x: startX, y: startY, color: targetColor };
            }
            for (let p of r.points) currentBoard[p.y][p.x] = r.color;
        }
    }
    return bestMove;
}

function calculateRemainingSteps(targetBoard) {
    let simBoard = JSON.parse(JSON.stringify(targetBoard));
    let steps = 0;
    while (true) {
        let regions = getRegions(simBoard);
        if (regions.length === 1 && regions[0].color === targetColorObj) break;
        if (steps > 40) break;

        let best = getBestMove(simBoard);
        let r = regions.find(reg => reg.points.some(p => p.x === best.x && p.y === best.y));
        for (let p of r.points) simBoard[p.y][p.x] = best.color;
        steps++;
    }
    return steps;
}

var start_game = function () {
    // 【修改1】难度文字只保留最干净的名称
    var diffStr = ["简单", "中等", "困难"];
    var lvl = HCI.state.currentLevel;
    $("#level-indicator").text("当前难度：" + diffStr[lvl]);

    // 【修改2】将 cellSize 固定写死为 32px，网格变大时格子不缩小！
    var configs = [
        { w: 14, h: 14, cellSize: "32px", tol: 2 },
        { w: 19, h: 19, cellSize: "32px", tol: 1 },
        { w: 25, h: 25, cellSize: "31px", tol: 0 }
    ];

    W = configs[lvl].w; H = configs[lvl].h; currentCellSize = configs[lvl].cellSize;
    currentSteps = 0; historyStack = []; selectedRegion = [];
    targetColorObj = Math.floor(Math.random() * 6) + 1;

    generateBoard();

    let aiSteps = calculateRemainingSteps(board);
    maxSteps = aiSteps + configs[lvl].tol;

    initialState = { board: JSON.parse(JSON.stringify(board)) };

    build_board();
    updateTopDisplay();
}

// ==========================================
// 2. 绑定 HCI 基座
// ==========================================
$(function () {
    HCI.init({ gameName: "ColorFill", thinkTimeSec: 5 }, { // 测试时5秒，发布前改回规范秒数
        onUndo: () => {
            let lastState = historyStack.pop();
            board = lastState.board; selectedRegion = lastState.selectedRegion; currentSteps = lastState.steps;
            build_board();
            if (selectedRegion.length > 0) selectConnectedRegion(selectedRegion[0].x, selectedRegion[0].y);
            updateTopDisplay();
            HCI.setMoveState(historyStack.length > 0);
        },
        onReset: () => {
            board = JSON.parse(JSON.stringify(initialState.board));
            currentSteps = 0; historyStack = []; selectedRegion = [];
            build_board(); updateTopDisplay();
            HCI.setMoveState(false);
        },
        onHint: () => {
            let aiNeedSteps = calculateRemainingSteps(board);
            let willFail = (currentSteps + aiNeedSteps) > maxSteps;

            if (willFail) {
                HCI.showDeadEndModal(
                    () => { HCI.callbacks.onReset(); },
                    () => { executeHint(true); }
                );
            } else {
                executeHint(false);
            }

            function executeHint(isDeadEnd) {
                HCI.pauseGame("正在建立染色模型...");
                let startBoard;

                if (isDeadEnd) {
                    startBoard = JSON.parse(JSON.stringify(initialState.board));
                    board = JSON.parse(JSON.stringify(startBoard));
                    currentSteps = 0; historyStack = []; selectedRegion = [];
                    build_board(); updateTopDisplay();
                } else {
                    startBoard = JSON.parse(JSON.stringify(board));
                }

                let simBoard = JSON.parse(JSON.stringify(startBoard));
                let moves = [];
                let safeCount = 40;
                while (safeCount-- > 0) {
                    let regions = getRegions(simBoard);
                    if (regions.length === 1 && regions[0].color === targetColorObj) break;
                    let best = getBestMove(simBoard);
                    moves.push(best);
                    let r = regions.find(reg => reg.points.some(p => p.x === best.x && p.y === best.y));
                    for (let p of r.points) simBoard[p.y][p.x] = best.color;
                }

                let stepIdx = 0;
                function playNext() {
                    if (stepIdx >= moves.length) {
                        $("#exp-ai-text").text("演示结束，移交画笔");
                        setTimeout(() => {
                            if (!isDeadEnd) board = JSON.parse(JSON.stringify(startBoard));
                            else board = JSON.parse(JSON.stringify(initialState.board));
                            selectedRegion = []; build_board(); updateTopDisplay();
                            HCI.resumeGame(); HCI.setMoveState(historyStack.length > 0);
                        }, 1500);
                        return;
                    }

                    let move = moves[stepIdx];
                    selectConnectedRegion(move.x, move.y);

                    setTimeout(() => {
                        selectedRegion.forEach(pos => {
                            board[pos.y][pos.x] = move.color;
                            $(`#c_${pos.x}_${pos.y}`).attr("class", `color-cell color-${move.color} selected-region`);
                        });
                        selectConnectedRegion(move.x, move.y);

                        let colorNameStr = colorNames[move.color].split(" ")[0];
                        $("#exp-ai-text").text(`演算第 ${stepIdx + 1}/${moves.length} 步: 染成【${colorNameStr}】`);

                        stepIdx++;
                        setTimeout(playNext, 400);
                    }, 400);
                }
                setTimeout(playNext, 1000);
            }
        }
    });

    start_game();
});