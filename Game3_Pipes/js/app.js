var BOARD_SEL = "#sudoku-board";
var W = 5, H = 5;
var aPlantilla = [];
var solvedBoard = [];
var rotations = [];
var selectedIndex = null;
var maxSteps = 15;
var currentSteps = 0;
var historyStack = [];
var initialState = null;
var cSize = "45px";
var lastRotatedIndex = null; // 【新增】记录当前正在疯狂旋转的是哪根管子

function checkUp(tile) { return "13579BDF".indexOf(tile) !== -1; }
function checkDown(tile) { return "4567CDEF".indexOf(tile) !== -1; }
function checkRight(tile) { return "2367ABEF".indexOf(tile) !== -1; }
function checkLeft(tile) { return "89ABCDEF".indexOf(tile) !== -1; }

function generateLevel(w, h) {
    let hEdges = Array.from({ length: h }, () => new Array(w - 1).fill(false));
    let vEdges = Array.from({ length: h - 1 }, () => new Array(w).fill(false));
    let visited = Array.from({ length: h }, () => new Array(w).fill(false));

    function dfs(x, y) {
        visited[y][x] = true;
        let dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]].sort(() => Math.random() - 0.5);
        for (let i = 0; i < dirs.length; i++) {
            let d = dirs[i];
            let nx = x + d[0], ny = y + d[1];
            if (nx >= 0 && nx < w && ny >= 0 && ny < h && !visited[ny][nx]) {
                if (d[0] === 1) hEdges[y][x] = true;
                else if (d[0] === -1) hEdges[y][nx] = true;
                else if (d[1] === 1) vEdges[y][x] = true;
                else if (d[1] === -1) vEdges[ny][x] = true;
                dfs(nx, ny);
            }
        }
    }
    dfs(Math.floor(Math.random() * w), Math.floor(Math.random() * h));

    let extraEdges = Math.floor(w * h * 0.15);
    for (let i = 0; i < extraEdges; i++) {
        if (Math.random() > 0.5) {
            let rx = Math.floor(Math.random() * (w - 1));
            let ry = Math.floor(Math.random() * h);
            hEdges[ry][rx] = true;
        } else {
            let rx = Math.floor(Math.random() * w);
            let ry = Math.floor(Math.random() * (h - 1));
            vEdges[ry][rx] = true;
        }
    }

    let hexChars = "0123456789ABCDEF";
    let board = [];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let up = (y > 0) ? vEdges[y - 1][x] : false;
            let down = (y < h - 1) ? vEdges[y][x] : false;
            let left = (x > 0) ? hEdges[y][x - 1] : false;
            let right = (x < w - 1) ? hEdges[y][x] : false;

            let val = 0;
            if (up) val |= 1;
            if (right) val |= 2;
            if (down) val |= 4;
            if (left) val |= 8;
            board.push(hexChars[val]);
        }
    }
    return board;
}

function getPipeHTML(hexChar) {
    if (hexChar === '0') return '';
    let html = '<div class="center-joint"></div>';
    if (checkUp(hexChar)) html += '<div class="arm arm-up"></div>';
    if (checkRight(hexChar)) html += '<div class="arm arm-right"></div>';
    if (checkDown(hexChar)) html += '<div class="arm arm-down"></div>';
    if (checkLeft(hexChar)) html += '<div class="arm arm-left"></div>';
    return html;
}

function build_board() {
    $(BOARD_SEL).empty();
    var table = '';
    for (var y = 0; y < H; y++) {
        table += "<tr>";
        for (var x = 0; x < W; x++) {
            var index = y * W + x;
            table += `<td class="pipe-wrapper" data-idx="${index}">
                <div id="c${index}" class="pipe-cell" style="width:${cSize}; height:${cSize}; transform: rotate(${rotations[index]}deg);">
                    ${getPipeHTML(solvedBoard[index])}
                </div>
            </td>`;
        }
        table += "</tr>";
    }
    $(BOARD_SEL).html(table);

    $(BOARD_SEL).on("click", ".pipe-wrapper", function () {
        if (window.EXPERIMENT_IS_PAUSED) return;
        $(".selected-pipe").removeClass("selected-pipe");
        $(this).addClass("selected-pipe");
        selectedIndex = parseInt($(this).attr("data-idx"));
    });
}

function rotateRight(hexChar) {
    let val = parseInt(hexChar, 16);
    let newVal = ((val << 1) & 15) | (val >> 3);
    return newVal.toString(16).toUpperCase();
}

function rotateLeft(hexChar) {
    let val = parseInt(hexChar, 16);
    let newVal = (val >> 1) | ((val & 1) << 3);
    return newVal.toString(16).toUpperCase();
}

function calcEntropy() {
    var entropy = 0;
    for (var y = 0; y < H; y++) {
        for (var x = 0; x < W; x++) {
            var idx = y * W + x;
            var tile = aPlantilla[idx];
            if (checkUp(tile) && (y == 0 || !checkDown(aPlantilla[(y - 1) * W + x]))) entropy++;
            if (checkDown(tile) && (y == H - 1 || !checkUp(aPlantilla[(y + 1) * W + x]))) entropy++;
            if (checkRight(tile) && (x == W - 1 || !checkLeft(aPlantilla[y * W + x + 1]))) entropy++;
            if (checkLeft(tile) && (x == 0 || !checkRight(aPlantilla[y * W + x - 1]))) entropy++;
        }
    }
    return entropy;
}

function getMinRotationsToSolve(currHex, targetHex) {
    if (currHex === targetHex) return 0;
    let temp = currHex;
    for (let i = 1; i <= 3; i++) {
        temp = rotateRight(temp);
        if (temp === targetHex) return Math.min(i, 4 - i);
    }
    return 0;
}

function calculateRemainingOptimalSteps() {
    let needed = 0;
    for (let i = 0; i < aPlantilla.length; i++) {
        // 只要这根管子方向不对，就需要 1 步去修（因为它只要被选中转对了就行）
        // 如果当前玩家正好还在选中并操作这根管子，那修好它不消耗额外步数
        if (aPlantilla[i] !== solvedBoard[i] && i !== lastRotatedIndex) {
            needed++;
        }
    }
    return needed;
}

function checkWinOrDeadEnd() {
    var currentEntropy = calcEntropy();
    $("#entropy-display").text(`剩余步数: ${maxSteps - currentSteps} | 待修复泄露: ${currentEntropy}`);

    if (currentEntropy === 0) {
        HCI.logEvent('game_complete', { success: true, steps_used: currentSteps });
        setTimeout(function () {
            alert(`恭喜！用时 ${currentSteps} 步，管网已完美闭合！`);
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

// 统一操作：空格键顺时针旋转
$(document).keydown(function (e) {
    if (window.EXPERIMENT_IS_PAUSED || selectedIndex === null) return;

    // 只监听 Space 空格键
    if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault(); // 阻止网页默认滚动

        var stepCost = (selectedIndex === lastRotatedIndex) ? 0 : 1;
        if (currentSteps + stepCost > maxSteps) return;

        historyStack.push({ board: aPlantilla.slice(), rots: rotations.slice(), steps: currentSteps, lastIdx: lastRotatedIndex });

        // 统一为顺时针旋转
        aPlantilla[selectedIndex] = rotateRight(aPlantilla[selectedIndex]);
        rotations[selectedIndex] += 90;

        currentSteps += stepCost;
        lastRotatedIndex = selectedIndex;

        $("#c" + selectedIndex).css("transform", `rotate(${rotations[selectedIndex]}deg)`);
        HCI.setMoveState(true);
        checkWinOrDeadEnd();
    }
});

var start_game = function () {
    // 隐藏括号里的尺寸，让 UI 更干净
    var diffStr = ["简单", "中等", "困难"];
    var lvl = HCI.state.currentLevel;
    $("#level-indicator").text("当前难度：" + diffStr[lvl]);

    // 固定 cellSize 为 40px，保持每个独立格子大小一致
    var configs = [
        { w: 8, h: 8, cellSize: "40px", tol: 6 },
        { w: 12, h: 12, cellSize: "40px", tol: 4 },
        { w: 16, h: 16, cellSize: "40px", tol: 2 }
    ];

    W = configs[lvl].w; H = configs[lvl].h; cSize = configs[lvl].cellSize;
    currentSteps = 0; historyStack = []; selectedIndex = null; rotations = [];
    lastRotatedIndex = null; // 重置操作记录

    solvedBoard = generateLevel(W, H);
    aPlantilla = solvedBoard.slice();

    let optimalSteps = 0;
    for (var i = 0; i < aPlantilla.length; i++) {
        if (aPlantilla[i] === '0' || aPlantilla[i] === 'F') { rotations[i] = 0; continue; }
        var randomRots = Math.floor(Math.random() * 3) + 1;
        rotations[i] = randomRots * 90;
        for (var j = 0; j < randomRots; j++) aPlantilla[i] = rotateRight(aPlantilla[i]);

        // 既然每根管子无论转多少下只算 1 步，那理论最少步数 = 需要调整的管子总数
        if (aPlantilla[i] !== solvedBoard[i]) {
            optimalSteps += 1;
        }
    }

    maxSteps = optimalSteps + configs[lvl].tol;
    initialState = { board: aPlantilla.slice(), rots: rotations.slice() };

    build_board();
    $("#entropy-display").text(`剩余步数: ${maxSteps} | 待修复泄露: ${calcEntropy()}`);
}

$(function () {
    // 【核心】基座接管
    HCI.init({ gameName: "EntroPipes", thinkTimeSec: 5 }, {
        onUndo: () => {
            let lastState = historyStack.pop();
            aPlantilla = lastState.board;
            rotations = lastState.rots;
            currentSteps = lastState.steps;
            lastRotatedIndex = lastState.lastIdx; // 【恢复】管子的锁定状态
            for (let i = 0; i < aPlantilla.length; i++) $("#c" + i).css("transform", `rotate(${rotations[i]}deg)`);
            $("#entropy-display").text(`剩余步数: ${maxSteps - currentSteps} | 待修复泄露: ${calcEntropy()}`);
            HCI.setMoveState(historyStack.length > 0);
        },
        onReset: () => {
            aPlantilla = initialState.board.slice();
            rotations = initialState.rots.slice();
            currentSteps = 0;
            historyStack = [];
            selectedIndex = null;
            lastRotatedIndex = null; // 【重置】管子的锁定状态
            $(".selected-pipe").removeClass("selected-pipe");
            for (let i = 0; i < aPlantilla.length; i++) $("#c" + i).css("transform", `rotate(${rotations[i]}deg)`);
            $("#entropy-display").text(`剩余步数: ${maxSteps - currentSteps} | 待修复泄露: ${calcEntropy()}`);
            HCI.setMoveState(false);
        },
        onHint: () => {
            let aiNeedSteps = calculateRemainingOptimalSteps();
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
                HCI.pauseGame("管道拓扑网络演算中...");
                let startBoard, startRots;

                if (isDeadEnd) {
                    startBoard = initialState.board.slice();
                    startRots = initialState.rots.slice();
                    aPlantilla = startBoard.slice();
                    rotations = startRots.slice();
                    currentSteps = 0;
                    selectedIndex = null;
                    lastRotatedIndex = null;
                    historyStack = [];
                    $(".selected-pipe").removeClass("selected-pipe");
                    for (let i = 0; i < aPlantilla.length; i++) $("#c" + i).css("transform", `rotate(${rotations[i]}deg)`);
                    $("#entropy-display").text(`剩余步数: ${maxSteps - currentSteps} | 待修复泄露: ${calcEntropy()}`);
                } else {
                    startBoard = aPlantilla.slice();
                    startRots = rotations.slice();
                }

                let pipesToFix = [];
                for (let i = 0; i < startBoard.length; i++) {
                    if (startBoard[i] !== solvedBoard[i]) pipesToFix.push(i);
                }
                pipesToFix.sort(() => Math.random() - 0.5);

                let moves = [];
                pipesToFix.forEach(idx => {
                    let temp = startBoard[idx], target = solvedBoard[idx], r_count = 0;
                    while (temp !== target && r_count < 4) { temp = rotateRight(temp); r_count++; }
                    let degChange = (r_count === 3) ? -90 : (r_count * 90);
                    moves.push({ idx: idx, targetHex: target, degChange: degChange });
                });

                let stepIdx = 0;
                const $aiText = $("#exp-ai-text");

                function playNext() {
                    if (stepIdx >= moves.length) {
                        $aiText.text("推演完毕，移交控制阀门");
                        setTimeout(() => {
                            if (!isDeadEnd) {
                                aPlantilla = startBoard.slice();
                                rotations = startRots.slice();
                            } else {
                                aPlantilla = initialState.board.slice();
                                rotations = initialState.rots.slice();
                            }
                            $(".selected-pipe").removeClass("selected-pipe");
                            $(".rotate-pulse").removeClass("rotate-pulse");
                            selectedIndex = null; lastRotatedIndex = null;
                            for (let i = 0; i < aPlantilla.length; i++) $("#c" + i).css("transform", `rotate(${rotations[i]}deg)`);
                            $("#entropy-display").text(`剩余步数: ${maxSteps - currentSteps} | 待修复泄露: ${calcEntropy()}`);
                            HCI.resumeGame(); HCI.setMoveState(historyStack.length > 0);
                        }, 1500);
                        return;
                    }

                    let move = moves[stepIdx];
                    $(".selected-pipe").removeClass("selected-pipe");
                    $(".rotate-pulse").removeClass("rotate-pulse");
                    let $td = $(`td[data-idx="${move.idx}"]`).addClass("selected-pipe rotate-pulse");

                    aPlantilla[move.idx] = move.targetHex;
                    rotations[move.idx] += move.degChange;
                    $("#c" + move.idx).css("transform", `rotate(${rotations[move.idx]}deg)`);

                    $aiText.text(`演算第 ${stepIdx + 1}/${moves.length} 步: 修复节点 ${move.idx}`);

                    stepIdx++;
                    setTimeout(playNext, 800);
                }
                setTimeout(playNext, 1000);
            }
        }
    });

    start_game();
});