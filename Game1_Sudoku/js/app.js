var BOARD_SEL = "#sudoku-board";
window.currentSolution = "";
window.undoStack = [];

var build_board = function () {
    for (var r = 0; r < 9; ++r) {
        var $row = $("<tr/>", {});
        for (var c = 0; c < 9; ++c) {
            var $square = $("<td/>", {});
            if (c % 3 == 2 && c != 8) { $square.addClass("border-right"); }
            $square.append($("<input/>", { id: "row" + r + "-col" + c, class: "square", maxlength: "1", type: "text", inputmode: "numeric", 'data-r': r, 'data-c': c }));
            $row.append($square);
        }
        if (r % 3 == 2 && r != 8) { $row.addClass("border-bottom"); }
        $(BOARD_SEL).append($row);
    }
};

var init_board = function () {
    $(BOARD_SEL + " input.square").on('focus', function () { $(this).data('prev-val', $(this).val()); });

    $(BOARD_SEL + " input.square").on('input change', function () {
        if (window.EXPERIMENT_IS_PAUSED) { $(this).val($(this).data('prev-val') || ""); return false; }

        var $square = $(this);
        var val = $square.val();
        var prevVal = $square.data('prev-val') || "";

        // 严格限制只接受 1-9 的数字
        if (val !== "" && !/^[1-9]$/.test(val)) { $square.val(prevVal); return false; }
        if (val !== prevVal) {
            window.undoStack.push({ id: $square.attr('id'), prevVal: prevVal });
            $square.data('prev-val', val);
            HCI.setMoveState(window.undoStack.length > 0);
        }

        setTimeout(function () {
            if (window.EXPERIMENT_IS_PAUSED) return;
            var currentStr = "";
            var isFull = true;
            for (var r = 0; r < 9; r++) {
                for (var c = 0; c < 9; c++) {
                    var cellVal = $("#row" + r + "-col" + c).val();
                    if (cellVal === "") { isFull = false; break; }
                    currentStr += cellVal;
                }
            }
            if (isFull) {
                try {
                    if (sudoku.solve(currentStr) === currentStr) {
                        HCI.logEvent('game_complete', { success: true });
                        alert("恭喜，本局通关！");
                        HCI.endGame(true); // 通知基座游戏胜利
                    }
                } catch (e) { }
            }
        }, 100);
    });
    $(BOARD_SEL + " input.square").keydown(function (e) { if (window.EXPERIMENT_IS_PAUSED) e.preventDefault(); });
};

var display_puzzle = function (board) {
    window.undoStack = [];
    for (var r = 0; r < 9; ++r) {
        for (var c = 0; c < 9; ++c) {
            var $square = $(BOARD_SEL + " input#row" + r + "-col" + c);
            $square.removeClass("green-text").css({ "background-color": "", "color": "" }).attr("disabled", "disabled");
            if (board[r][c] != sudoku.BLANK_CHAR) {
                $square.val(board[r][c]).data('prev-val', board[r][c]);
            } else {
                $square.removeAttr("disabled").val('').data('prev-val', '');
            }
        }
    }
};

$(function () {
    // 【核心】向基座注册游戏信息和三个按钮的回调
    HCI.init({ gameName: "Sudoku", thinkTimeSec: 5 }, {
        onUndo: () => {
            let lastMove = window.undoStack.pop();
            let $sq = $("#" + lastMove.id);
            $sq.val(lastMove.prevVal).data('prev-val', lastMove.prevVal);
            HCI.setMoveState(window.undoStack.length > 0);
        },
        onReset: () => {
            window.undoStack = [];
            $(BOARD_SEL + " input.square:not([disabled])").val('').data('prev-val', '');
            HCI.setMoveState(false); // 重置后禁用撤回按钮
        },
        onHint: () => {
            HCI.pauseGame("AI 辅助透视中...");
            var userBackup = [];
            for (var r = 0; r < 9; r++) {
                for (var c = 0; c < 9; c++) {
                    var $sq = $("#row" + r + "-col" + c);
                    if ($sq.attr("disabled") !== "disabled") {
                        userBackup.push({ id: $sq.attr('id'), val: $sq.val(), bg: $sq.css("background-color"), color: $sq.css("color") });
                        let correctVal = window.currentSolution[r * 9 + c];
                        if ($sq.val() === correctVal) $sq.css({ "background-color": "#d4edda", "color": "#155724" });
                        else if ($sq.val() === "") $sq.val(correctVal).css({ "background-color": "#f8d7da", "color": "#721c24" });
                        else $sq.val(correctVal).css({ "background-color": "#fff3cd", "color": "#856404" });
                    }
                }
            }
            setTimeout(() => {
                userBackup.forEach(cell => $("#" + cell.id).val(cell.val).css({ "background-color": cell.bg, "color": cell.color }));
                HCI.resumeGame();
            }, 5000);
        }
    });

    build_board();
    init_board();
    $("#app-wrap").removeClass("hidden");
    $("#loading").addClass("hidden");

    // 内部调用引擎用的难度配置
    var engineDiffs = ["medium", "hard", "very-hard"];
    var currentEngineDiff = engineDiffs[HCI.state.currentLevel] || "very-hard";

    // UI 面板上向被试（玩家）显示的友好文字
    var displayDiffs = ["简单", "中等", "困难"];
    var currentDisplayDiff = displayDiffs[HCI.state.currentLevel] || "困难";

    $("#level-indicator").text("当前难度：" + currentDisplayDiff);
    var board_str = sudoku.generate(currentEngineDiff);

    window.currentSolution = sudoku.solve(board_str);
    display_puzzle(sudoku.board_string_to_grid(board_str));
});