"use strict";
var DynamicTiler = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/extension.ts
  var extension_exports = {};
  __export(extension_exports, {
    disable: () => disable,
    enable: () => enable,
    init: () => init
  });

  // src/core/types.ts
  function getGridColumns(config) {
    return config.gridColumns || config.gridSize;
  }
  function getGridRows(config) {
    return config.gridRows || config.gridSize;
  }
  function getMinColumnSpan(config) {
    return config.minColumnSpan || config.minSpan;
  }
  function getMinRowSpan(config) {
    return config.minRowSpan || config.minSpan;
  }

  // src/core/engine/GridSpans.ts
  var HORIZONTAL_SPANS = [
    [0, 2],
    // 0
    [0, 4],
    // 1
    [0, 6],
    // 2 (left 1/2)
    [0, 8],
    // 3
    [0, 10],
    // 4
    [0, 12],
    // 5 (full width)
    [2, 12],
    // 6
    [4, 12],
    // 7
    [6, 12],
    // 8 (right 1/2)
    [8, 12],
    // 9
    [10, 12]
    // 10
  ];
  var VERTICAL_SPANS = [
    [0, 2],
    // 0
    [0, 4],
    // 1
    [0, 6],
    // 2 (top 1/2)
    [0, 8],
    // 3
    [0, 10],
    // 4
    [0, 12],
    // 5 (full height)
    [2, 12],
    // 6
    [4, 12],
    // 7
    [6, 12],
    // 8 (bottom 1/2)
    [8, 12],
    // 9
    [10, 12]
    // 10
  ];
  function spanToHIndex(span) {
    for (let i = 0; i < HORIZONTAL_SPANS.length; i++) {
      if (HORIZONTAL_SPANS[i][0] === span[0] && HORIZONTAL_SPANS[i][1] === span[1]) {
        return i;
      }
    }
    return 5;
  }
  function spanToVIndex(span) {
    for (let i = 0; i < VERTICAL_SPANS.length; i++) {
      if (VERTICAL_SPANS[i][0] === span[0] && VERTICAL_SPANS[i][1] === span[1]) {
        return i;
      }
    }
    return 3;
  }

  // src/core/engine/GeometryConverter.ts
  var GeometryConverter = class {
    /**
     * Преобразует физическую геометрию окна в логические колонки (hSpan) на указанном мониторе
     */
    static geometryToHSpan(geom, monitor, config = { gridSize: 12, gridColumns: 12, gridRows: 12, minSpan: 2, minColumnSpan: 2, minRowSpan: 2, step: 2, gaps: 0 }) {
      const { workarea } = monitor;
      const gridColumns = getGridColumns(config);
      const colWidth = workarea.width / gridColumns;
      const relLeft = geom.x - workarea.x;
      const relRight = geom.x + geom.width - workarea.x;
      let startCol = Math.floor(relLeft / colWidth);
      const startRemainder = relLeft / colWidth - startCol;
      if (startRemainder > 0.2) {
        startCol = Math.min(gridColumns - 1, startCol + 1);
      }
      startCol = Math.max(0, startCol);
      let endCol = Math.ceil(relRight / colWidth);
      const endRemainder = endCol - relRight / colWidth;
      if (endRemainder > 0.2) {
        endCol = Math.max(1, endCol - 1);
      }
      endCol = Math.min(gridColumns, endCol);
      return [startCol, endCol];
    }
    /**
     * Преобразует физическую геометрию окна в логические строки (vSpan) на указанном мониторе
     */
    static geometryToVSpan(geom, monitor, config = { gridSize: 12, gridColumns: 12, gridRows: 12, minSpan: 2, minColumnSpan: 2, minRowSpan: 2, step: 2, gaps: 0 }) {
      const { workarea } = monitor;
      const gridRows = getGridRows(config);
      const rowHeight = workarea.height / gridRows;
      const relTop = geom.y - workarea.y;
      const relBottom = geom.y + geom.height - workarea.y;
      let startRow = Math.floor(relTop / rowHeight);
      const startRemainder = relTop / rowHeight - startRow;
      if (startRemainder > 0.2) {
        startRow = Math.min(gridRows - 1, startRow + 1);
      }
      startRow = Math.max(0, startRow);
      let endRow = Math.ceil(relBottom / rowHeight);
      const endRemainder = endRow - relBottom / rowHeight;
      if (endRemainder > 0.2) {
        endRow = Math.max(1, endRow - 1);
      }
      endRow = Math.min(gridRows, endRow);
      return [startRow, endRow];
    }
    /**
     * Преобразует абстрактные доли WindowState в реальные координаты Geometry с учетом отступов (gaps)
     */
    static stateToGeometry(state, screen, config) {
      const { workarea } = screen;
      const gaps = config.gaps || 0;
      const gridColumns = getGridColumns(config);
      const gridRows = getGridRows(config);
      const hSpan = state.hSpan || HORIZONTAL_SPANS[state.hIndex] || [0, gridColumns];
      const vSpan = state.vSpan || VERTICAL_SPANS[state.vIndex] || [0, gridRows];
      const colWidth = workarea.width / gridColumns;
      const rowHeight = workarea.height / gridRows;
      const xStart = workarea.x + Math.round(hSpan[0] * colWidth);
      const xEnd = workarea.x + Math.round(hSpan[1] * colWidth);
      let width = xEnd - xStart;
      let x = xStart;
      const yStart = workarea.y + Math.round(vSpan[0] * rowHeight);
      const yEnd = workarea.y + Math.round(vSpan[1] * rowHeight);
      let height = yEnd - yStart;
      let y = yStart;
      if (gaps > 0) {
        const minDimension = 100;
        const maxGapW = Math.max(0, (width - minDimension) / 2);
        const maxGapH = Math.max(0, (height - minDimension) / 2);
        const gapW = Math.min(gaps, maxGapW);
        const gapH = Math.min(gaps, maxGapH);
        x += gapW;
        y += gapH;
        width -= 2 * gapW;
        height -= 2 * gapH;
      }
      return { x, y, width, height };
    }
  };

  // src/core/engine/InitialLayout.ts
  var InitialLayout = class {
    /**
     * Находит наиболее подходящий горизонтальный спан для первого тайлинга в зависимости от направления и соседей
     */
    static getInitialHSpan(direction, siblingSpans, config, fixedVSpan) {
      const gridColumns = getGridColumns(config);
      const halfColumns = Math.round(gridColumns / 2);
      if (direction === "shift-left") return [0, halfColumns];
      if (direction === "shift-right") return [halfColumns, gridColumns];
      const spans = this.getInitialSpans(direction, siblingSpans, config, {
        fixedVSpan: fixedVSpan || [0, getGridRows(config)]
      });
      return spans.hSpan;
    }
    /**
     * Находит наиболее подходящий вертикальный спан для первого тайлинга в зависимости от направления и соседей
     */
    static getInitialVSpan(direction, siblingSpans, config, fixedHSpan) {
      const gridRows = getGridRows(config);
      const halfRows = Math.round(gridRows / 2);
      if (direction === "shift-up") return [0, halfRows];
      if (direction === "shift-down") return [halfRows, gridRows];
      const spans = this.getInitialSpans(direction, siblingSpans, config, {
        fixedHSpan: fixedHSpan || [0, getGridColumns(config)]
      });
      return spans.vSpan;
    }
    /**
     * Находит наиболее подходящий двумерный макет для первого тайлинга
     */
    static getInitialSpans(direction, siblingSpans, config, options = {}) {
      const gridColumns = getGridColumns(config);
      const gridRows = getGridRows(config);
      const minColumnSpan = getMinColumnSpan(config);
      const minRowSpan = getMinRowSpan(config);
      const halfColumns = Math.round(gridColumns / 2);
      const halfRows = Math.round(gridRows / 2);
      const occupied = Array.from({ length: gridRows }, () => new Array(gridColumns).fill(false));
      for (const sibling of siblingSpans) {
        const [hStart, hEnd] = sibling.hSpan;
        const [vStart, vEnd] = sibling.vSpan;
        for (let r = vStart; r < vEnd; r++) {
          for (let c = hStart; c < hEnd; c++) {
            if (r >= 0 && r < gridRows && c >= 0 && c < gridColumns) {
              occupied[r][c] = true;
            }
          }
        }
      }
      if (direction === "shift-left") {
        return { hSpan: [0, halfColumns], vSpan: options.fixedVSpan || [0, gridRows] };
      }
      if (direction === "shift-right") {
        return { hSpan: [halfColumns, gridColumns], vSpan: options.fixedVSpan || [0, gridRows] };
      }
      if (direction === "shift-up") {
        return { hSpan: options.fixedHSpan || [0, gridColumns], vSpan: [0, halfRows] };
      }
      if (direction === "shift-down") {
        return { hSpan: options.fixedHSpan || [0, gridColumns], vSpan: [halfRows, gridRows] };
      }
      if (direction === "left") {
        let bestHSpan = [0, halfColumns];
        let bestVSpan = options.fixedVSpan || [0, gridRows];
        for (let hStart = 0; hStart <= gridColumns - minColumnSpan; hStart++) {
          let maxArea = 0;
          let localBestHSpan = null;
          let localBestVSpan = null;
          const vIntervals = options.fixedVSpan ? [options.fixedVSpan] : [];
          if (!options.fixedVSpan) {
            for (let vStart = 0; vStart <= gridRows - minRowSpan; vStart += config.step) {
              for (let vEnd = vStart + minRowSpan; vEnd <= gridRows; vEnd += config.step) {
                vIntervals.push([vStart, vEnd]);
              }
              if (gridRows - vStart >= minRowSpan && (gridRows - vStart) % config.step !== 0) {
                vIntervals.push([vStart, gridRows]);
              }
            }
          }
          for (const [vStart, vEnd] of vIntervals) {
            let w = 0;
            while (hStart + w < gridColumns && w < halfColumns) {
              let colFree = true;
              for (let r = vStart; r < vEnd; r++) {
                if (occupied[r][hStart + w]) {
                  colFree = false;
                  break;
                }
              }
              if (colFree) {
                w++;
              } else {
                break;
              }
            }
            if (w >= minColumnSpan) {
              const area = w * (vEnd - vStart);
              if (area > maxArea || area === maxArea && w > (localBestHSpan ? localBestHSpan[1] - localBestHSpan[0] : 0)) {
                maxArea = area;
                localBestHSpan = [hStart, hStart + w];
                localBestVSpan = [vStart, vEnd];
              }
            }
          }
          if (localBestHSpan && localBestVSpan) {
            bestHSpan = localBestHSpan;
            bestVSpan = localBestVSpan;
            break;
          }
        }
        return { hSpan: bestHSpan, vSpan: bestVSpan };
      }
      if (direction === "right") {
        let bestHSpan = [halfColumns, gridColumns];
        let bestVSpan = options.fixedVSpan || [0, gridRows];
        for (let hEnd = gridColumns; hEnd >= minColumnSpan; hEnd--) {
          let maxArea = 0;
          let localBestHSpan = null;
          let localBestVSpan = null;
          const vIntervals = options.fixedVSpan ? [options.fixedVSpan] : [];
          if (!options.fixedVSpan) {
            for (let vStart = 0; vStart <= gridRows - minRowSpan; vStart += config.step) {
              for (let vEnd = vStart + minRowSpan; vEnd <= gridRows; vEnd += config.step) {
                vIntervals.push([vStart, vEnd]);
              }
              if (gridRows - vStart >= minRowSpan && (gridRows - vStart) % config.step !== 0) {
                vIntervals.push([vStart, gridRows]);
              }
            }
          }
          for (const [vStart, vEnd] of vIntervals) {
            let w = 0;
            while (hEnd - 1 - w >= 0 && w < halfColumns) {
              let colFree = true;
              for (let r = vStart; r < vEnd; r++) {
                if (occupied[r][hEnd - 1 - w]) {
                  colFree = false;
                  break;
                }
              }
              if (colFree) {
                w++;
              } else {
                break;
              }
            }
            if (w >= minColumnSpan) {
              const area = w * (vEnd - vStart);
              if (area > maxArea || area === maxArea && w > (localBestHSpan ? localBestHSpan[1] - localBestHSpan[0] : 0)) {
                maxArea = area;
                localBestHSpan = [hEnd - w, hEnd];
                localBestVSpan = [vStart, vEnd];
              }
            }
          }
          if (localBestHSpan && localBestVSpan) {
            bestHSpan = localBestHSpan;
            bestVSpan = localBestVSpan;
            break;
          }
        }
        return { hSpan: bestHSpan, vSpan: bestVSpan };
      }
      if (direction === "up") {
        let bestHSpan = options.fixedHSpan || [0, gridColumns];
        let bestVSpan = [0, halfRows];
        for (let vStart = 0; vStart <= gridRows - minRowSpan; vStart++) {
          let maxArea = 0;
          let localBestHSpan = null;
          let localBestVSpan = null;
          const hIntervals = options.fixedHSpan ? [options.fixedHSpan] : [];
          if (!options.fixedHSpan) {
            for (let hStart = 0; hStart <= gridColumns - minColumnSpan; hStart += config.step) {
              for (let hEnd = hStart + minColumnSpan; hEnd <= gridColumns; hEnd += config.step) {
                hIntervals.push([hStart, hEnd]);
              }
              if (gridColumns - hStart >= minColumnSpan && (gridColumns - hStart) % config.step !== 0) {
                hIntervals.push([hStart, gridColumns]);
              }
            }
          }
          for (const [hStart, hEnd] of hIntervals) {
            let h = 0;
            while (vStart + h < gridRows && h < halfRows) {
              let rowFree = true;
              for (let c = hStart; c < hEnd; c++) {
                if (occupied[vStart + h][c]) {
                  rowFree = false;
                  break;
                }
              }
              if (rowFree) {
                h++;
              } else {
                break;
              }
            }
            if (h >= minRowSpan) {
              const area = h * (hEnd - hStart);
              if (area > maxArea || area === maxArea && h > (localBestVSpan ? localBestVSpan[1] - localBestVSpan[0] : 0)) {
                maxArea = area;
                localBestHSpan = [hStart, hEnd];
                localBestVSpan = [vStart, vStart + h];
              }
            }
          }
          if (localBestHSpan && localBestVSpan) {
            bestHSpan = localBestHSpan;
            bestVSpan = localBestVSpan;
            break;
          }
        }
        return { hSpan: bestHSpan, vSpan: bestVSpan };
      }
      if (direction === "down") {
        let bestHSpan = options.fixedHSpan || [0, gridColumns];
        let bestVSpan = [halfRows, gridRows];
        for (let vEnd = gridRows; vEnd >= minRowSpan; vEnd--) {
          let maxArea = 0;
          let localBestHSpan = null;
          let localBestVSpan = null;
          const hIntervals = options.fixedHSpan ? [options.fixedHSpan] : [];
          if (!options.fixedHSpan) {
            for (let hStart = 0; hStart <= gridColumns - minColumnSpan; hStart += config.step) {
              for (let hEnd = hStart + minColumnSpan; hEnd <= gridColumns; hEnd += config.step) {
                hIntervals.push([hStart, hEnd]);
              }
              if (gridColumns - hStart >= minColumnSpan && (gridColumns - hStart) % config.step !== 0) {
                hIntervals.push([hStart, gridColumns]);
              }
            }
          }
          for (const [hStart, hEnd] of hIntervals) {
            let h = 0;
            while (vEnd - 1 - h >= 0 && h < halfRows) {
              let rowFree = true;
              for (let c = hStart; c < hEnd; c++) {
                if (occupied[vEnd - 1 - h][c]) {
                  rowFree = false;
                  break;
                }
              }
              if (rowFree) {
                h++;
              } else {
                break;
              }
            }
            if (h >= minRowSpan) {
              const area = h * (hEnd - hStart);
              if (area > maxArea || area === maxArea && h > (localBestVSpan ? localBestVSpan[1] - localBestVSpan[0] : 0)) {
                maxArea = area;
                localBestHSpan = [hStart, hEnd];
                localBestVSpan = [vEnd - h, vEnd];
              }
            }
          }
          if (localBestHSpan && localBestVSpan) {
            bestHSpan = localBestHSpan;
            bestVSpan = localBestVSpan;
            break;
          }
        }
        return { hSpan: bestHSpan, vSpan: bestVSpan };
      }
      return { hSpan: [0, gridColumns], vSpan: [0, gridRows] };
    }
  };

  // src/core/engine/ChainBlockDetector.ts
  var ChainBlockDetector = class {
    /**
     * Проверяет, заблокирована ли цепочка соприкасающихся окон слева от текущей границы
     */
    static isLeftChainBlocked(startCol, siblingSpans, config, activeVSpan) {
      let currentStart = startCol;
      let chainLength = 0;
      let currentChainWidth = 0;
      let currentVSpan = activeVSpan;
      while (true) {
        const neighbor = siblingSpans.find(
          (s) => s.hSpan[1] === currentStart && Math.max(s.vSpan[0], currentVSpan[0]) < Math.min(s.vSpan[1], currentVSpan[1])
        );
        if (!neighbor) break;
        chainLength++;
        const width = neighbor.hSpan[1] - neighbor.hSpan[0];
        currentChainWidth += width;
        currentStart = neighbor.hSpan[0];
        currentVSpan = neighbor.vSpan;
      }
      if (chainLength === 0) return false;
      const freeSpace = currentStart;
      const minChainWidth = chainLength * getMinColumnSpan(config);
      const compressionReserve = currentChainWidth - minChainWidth;
      const movementReserve = freeSpace + compressionReserve;
      return movementReserve <= 0;
    }
    /**
     * Проверяет, заблокирована ли цепочка соприкасающихся окон справа от текущей границы
     */
    static isRightChainBlocked(endCol, siblingSpans, config, activeVSpan) {
      let currentEnd = endCol;
      let chainLength = 0;
      let currentChainWidth = 0;
      let currentVSpan = activeVSpan;
      while (true) {
        const neighbor = siblingSpans.find(
          (s) => s.hSpan[0] === currentEnd && Math.max(s.vSpan[0], currentVSpan[0]) < Math.min(s.vSpan[1], currentVSpan[1])
        );
        if (!neighbor) break;
        chainLength++;
        const width = neighbor.hSpan[1] - neighbor.hSpan[0];
        currentChainWidth += width;
        currentEnd = neighbor.hSpan[1];
        currentVSpan = neighbor.vSpan;
      }
      if (chainLength === 0) return false;
      const freeSpace = getGridColumns(config) - currentEnd;
      const minChainWidth = chainLength * getMinColumnSpan(config);
      const compressionReserve = currentChainWidth - minChainWidth;
      const movementReserve = freeSpace + compressionReserve;
      return movementReserve <= 0;
    }
    /**
     * Проверяет, заблокирована ли цепочка соприкасающихся окон сверху от текущей границы
     */
    static isTopChainBlocked(startRow, siblingSpans, config, activeHSpan) {
      let currentStart = startRow;
      let chainLength = 0;
      let currentChainHeight = 0;
      let currentHSpan = activeHSpan;
      while (true) {
        const neighbor = siblingSpans.find(
          (s) => s.vSpan[1] === currentStart && Math.max(s.hSpan[0], currentHSpan[0]) < Math.min(s.hSpan[1], currentHSpan[1])
        );
        if (!neighbor) break;
        chainLength++;
        const height = neighbor.vSpan[1] - neighbor.vSpan[0];
        currentChainHeight += height;
        currentStart = neighbor.vSpan[0];
        currentHSpan = neighbor.hSpan;
      }
      if (chainLength === 0) return false;
      const freeSpace = currentStart;
      const minChainHeight = chainLength * getMinRowSpan(config);
      const compressionReserve = currentChainHeight - minChainHeight;
      const movementReserve = freeSpace + compressionReserve;
      return movementReserve <= 0;
    }
    /**
     * Проверяет, заблокирована ли цепочка соприкасающихся окон снизу от текущей границы
     */
    static isBottomChainBlocked(endRow, siblingSpans, config, activeHSpan) {
      let currentEnd = endRow;
      let chainLength = 0;
      let currentChainHeight = 0;
      let currentHSpan = activeHSpan;
      while (true) {
        const neighbor = siblingSpans.find(
          (s) => s.vSpan[0] === currentEnd && Math.max(s.hSpan[0], currentHSpan[0]) < Math.min(s.hSpan[1], currentHSpan[1])
        );
        if (!neighbor) break;
        chainLength++;
        const height = neighbor.vSpan[1] - neighbor.vSpan[0];
        currentChainHeight += height;
        currentEnd = neighbor.vSpan[1];
        currentHSpan = neighbor.hSpan;
      }
      if (chainLength === 0) return false;
      const freeSpace = getGridRows(config) - currentEnd;
      const minChainHeight = chainLength * getMinRowSpan(config);
      const compressionReserve = currentChainHeight - minChainHeight;
      const movementReserve = freeSpace + compressionReserve;
      return movementReserve <= 0;
    }
  };

  // src/core/engine/ChainTransitions.ts
  var ChainTransitions = class {
    /**
     * Рассчитывает новые состояния для всей цепочки соприкасающихся окон на основе направления
     */
    static calculateChainTransitions(activeId, direction, config, activeWindows, allVisibleSpans = [], calculateNextStateFn, getDefaultStateFn) {
      const result = {};
      const gridColumns = getGridColumns(config);
      const gridRows = getGridRows(config);
      const minColumnSpan = getMinColumnSpan(config);
      const minRowSpan = getMinRowSpan(config);
      const activeWin = activeWindows.find((w) => w.windowId === activeId);
      if (!activeWin) {
        const siblingSpans = allVisibleSpans.length > 0 ? allVisibleSpans : activeWindows.map((w) => ({
          hSpan: w.state.hSpan || HORIZONTAL_SPANS[w.state.hIndex] || [0, gridColumns],
          vSpan: w.state.vSpan || VERTICAL_SPANS[w.state.vIndex] || [0, gridRows]
        }));
        const defaultState = getDefaultStateFn();
        const nextActiveState2 = calculateNextStateFn(defaultState, direction, config, siblingSpans);
        result[activeId] = nextActiveState2;
        return result;
      }
      const currentActiveState = { ...activeWin.state };
      if (!currentActiveState.hSpan) {
        currentActiveState.hSpan = HORIZONTAL_SPANS[currentActiveState.hIndex] || [0, gridColumns];
      }
      if (!currentActiveState.vSpan) {
        currentActiveState.vSpan = VERTICAL_SPANS[currentActiveState.vIndex] || [0, gridRows];
      }
      const siblings = activeWindows.filter((w) => w.windowId !== activeId).map((w) => ({
        hSpan: w.state.hSpan || HORIZONTAL_SPANS[w.state.hIndex] || [0, gridColumns],
        vSpan: w.state.vSpan || VERTICAL_SPANS[w.state.vIndex] || [0, gridRows]
      }));
      const nextActiveState = calculateNextStateFn(currentActiveState, direction, config, siblings);
      result[activeId] = nextActiveState;
      if (direction === "shift-left" || direction === "shift-right" || direction === "shift-up" || direction === "shift-down") {
        return result;
      }
      const normalizedWindows = activeWindows.map((w) => {
        const state = { ...w.state };
        if (!state.hSpan) {
          state.hSpan = HORIZONTAL_SPANS[state.hIndex] || [0, gridColumns];
        }
        if (!state.vSpan) {
          state.vSpan = VERTICAL_SPANS[state.vIndex] || [0, gridRows];
        }
        return { windowId: w.windowId, state };
      });
      if (direction === "left" || direction === "right") {
        const sortedWins = [...normalizedWindows].sort((a, b) => {
          const aSpan = a.windowId === activeId ? nextActiveState.hSpan : a.state.hSpan;
          const bSpan = b.windowId === activeId ? nextActiveState.hSpan : b.state.hSpan;
          return aSpan[0] - bSpan[0];
        });
        const N = sortedWins.length;
        const k = sortedWins.findIndex((w) => w.windowId === activeId);
        const newSpans = sortedWins.map((w) => {
          return w.windowId === activeId ? [...nextActiveState.hSpan] : [...w.state.hSpan];
        });
        const MIN_WIDTH = minColumnSpan;
        for (let i = k + 1; i < N; i++) {
          const currWin = sortedWins[i];
          const currOriginalStart = currWin.state.hSpan[0];
          const touchBoundaries = [];
          for (let j = 0; j < i; j++) {
            const prevWin = sortedWins[j];
            const hasVSpanOverlap = Math.max(prevWin.state.vSpan[0], currWin.state.vSpan[0]) < Math.min(prevWin.state.vSpan[1], currWin.state.vSpan[1]);
            const touching = prevWin.state.hSpan[1] === currOriginalStart && hasVSpanOverlap;
            if (touching) {
              touchBoundaries.push(newSpans[j][1]);
            }
          }
          if (touchBoundaries.length > 0) {
            const origStart = currWin.state.hSpan[0];
            const origEnd = currWin.state.hSpan[1];
            newSpans[i][0] = Math.max(...touchBoundaries);
            const shift = newSpans[i][0] - origStart;
            if (shift > 0) {
              let limit = gridColumns;
              for (const other of sortedWins) {
                if (other.windowId === currWin.windowId) continue;
                const hasVSpanOverlap = Math.max(other.state.vSpan[0], currWin.state.vSpan[0]) < Math.min(other.state.vSpan[1], currWin.state.vSpan[1]);
                if (other.state.hSpan[0] >= origEnd && hasVSpanOverlap) {
                  if (other.state.hSpan[0] < limit) {
                    limit = other.state.hSpan[0];
                  }
                }
              }
              const freeSpace = limit - origEnd;
              const allowedShift = Math.max(0, Math.min(shift, freeSpace));
              newSpans[i][1] = origEnd + allowedShift;
            } else if (shift < 0) {
              const hasRightAnchor = sortedWins.some((other) => {
                if (other.windowId === currWin.windowId) return false;
                const hasVSpanOverlap = Math.max(other.state.vSpan[0], currWin.state.vSpan[0]) < Math.min(other.state.vSpan[1], currWin.state.vSpan[1]);
                return other.state.hSpan[0] === origEnd && hasVSpanOverlap;
              });
              const isAnchored = origEnd === gridColumns || hasRightAnchor;
              newSpans[i][1] = isAnchored ? origEnd : origEnd + shift;
            }
            const width = newSpans[i][1] - newSpans[i][0];
            if (width < MIN_WIDTH) {
              newSpans[i][1] = newSpans[i][0] + MIN_WIDTH;
              if (newSpans[i][1] > gridColumns) {
                newSpans[i][1] = gridColumns;
                newSpans[i][0] = gridColumns - MIN_WIDTH;
              }
            }
          }
        }
        for (let i = k - 1; i >= 0; i--) {
          const currWin = sortedWins[i];
          const currOriginalEnd = currWin.state.hSpan[1];
          const touchBoundaries = [];
          for (let j = i + 1; j < N; j++) {
            const nextWin = sortedWins[j];
            const hasVSpanOverlap = Math.max(nextWin.state.vSpan[0], currWin.state.vSpan[0]) < Math.min(nextWin.state.vSpan[1], currWin.state.vSpan[1]);
            const touching = nextWin.state.hSpan[0] === currOriginalEnd && hasVSpanOverlap;
            if (touching) {
              touchBoundaries.push(newSpans[j][0]);
            }
          }
          if (touchBoundaries.length > 0) {
            const origStart = currWin.state.hSpan[0];
            const origEnd = currWin.state.hSpan[1];
            newSpans[i][1] = Math.min(...touchBoundaries);
            const shift = origEnd - newSpans[i][1];
            if (shift > 0) {
              let limit = 0;
              for (const other of sortedWins) {
                if (other.windowId === currWin.windowId) continue;
                const hasVSpanOverlap = Math.max(other.state.vSpan[0], currWin.state.vSpan[0]) < Math.min(other.state.vSpan[1], currWin.state.vSpan[1]);
                if (other.state.hSpan[1] <= origStart && hasVSpanOverlap) {
                  if (other.state.hSpan[1] > limit) {
                    limit = other.state.hSpan[1];
                  }
                }
              }
              const freeSpace = origStart - limit;
              const allowedShift = Math.max(0, Math.min(shift, freeSpace));
              newSpans[i][0] = origStart - allowedShift;
            } else if (shift < 0) {
              const hasLeftAnchor = sortedWins.some((other) => {
                if (other.windowId === currWin.windowId) return false;
                const hasVSpanOverlap = Math.max(other.state.vSpan[0], currWin.state.vSpan[0]) < Math.min(other.state.vSpan[1], currWin.state.vSpan[1]);
                return other.state.hSpan[1] === origStart && hasVSpanOverlap;
              });
              const isAnchored = origStart === 0 || hasLeftAnchor;
              newSpans[i][0] = isAnchored ? origStart : origStart - shift;
            }
            const width = newSpans[i][1] - newSpans[i][0];
            if (width < MIN_WIDTH) {
              newSpans[i][0] = newSpans[i][1] - MIN_WIDTH;
              if (newSpans[i][0] < 0) {
                newSpans[i][0] = 0;
                newSpans[i][1] = MIN_WIDTH;
              }
            }
          }
        }
        for (let i = 0; i < N; i++) {
          const w = sortedWins[i];
          if (w.windowId === activeId) {
            nextActiveState.hSpan = newSpans[i];
            nextActiveState.hIndex = spanToHIndex(newSpans[i]);
          } else {
            const nextState = {
              ...w.state,
              hSpan: newSpans[i],
              hIndex: spanToHIndex(newSpans[i]),
              lastDirection: direction
            };
            result[w.windowId] = nextState;
          }
        }
      }
      if (direction === "up" || direction === "down") {
        const sortedWins = [...normalizedWindows].sort((a, b) => {
          const aSpan = a.windowId === activeId ? nextActiveState.vSpan : a.state.vSpan;
          const bSpan = b.windowId === activeId ? nextActiveState.vSpan : b.state.vSpan;
          return aSpan[0] - bSpan[0];
        });
        const N = sortedWins.length;
        const k = sortedWins.findIndex((w) => w.windowId === activeId);
        const newSpans = sortedWins.map((w) => {
          return w.windowId === activeId ? [...nextActiveState.vSpan] : [...w.state.vSpan];
        });
        const MIN_HEIGHT = minRowSpan;
        for (let i = k + 1; i < N; i++) {
          const currWin = sortedWins[i];
          const currOriginalStart = currWin.state.vSpan[0];
          const touchBoundaries = [];
          for (let j = 0; j < i; j++) {
            const prevWin = sortedWins[j];
            const hasHSpanOverlap = Math.max(prevWin.state.hSpan[0], currWin.state.hSpan[0]) < Math.min(prevWin.state.hSpan[1], currWin.state.hSpan[1]);
            const touching = prevWin.state.vSpan[1] === currOriginalStart && hasHSpanOverlap;
            if (touching) {
              touchBoundaries.push(newSpans[j][1]);
            }
          }
          if (touchBoundaries.length > 0) {
            const origStart = currWin.state.vSpan[0];
            const origEnd = currWin.state.vSpan[1];
            newSpans[i][0] = Math.max(...touchBoundaries);
            const shift = newSpans[i][0] - origStart;
            if (shift > 0) {
              let limit = gridRows;
              for (const other of sortedWins) {
                if (other.windowId === currWin.windowId) continue;
                const hasHSpanOverlap = Math.max(other.state.hSpan[0], currWin.state.hSpan[0]) < Math.min(other.state.hSpan[1], currWin.state.hSpan[1]);
                if (other.state.vSpan[0] >= origEnd && hasHSpanOverlap) {
                  if (other.state.vSpan[0] < limit) {
                    limit = other.state.vSpan[0];
                  }
                }
              }
              const freeSpace = limit - origEnd;
              const allowedShift = Math.max(0, Math.min(shift, freeSpace));
              newSpans[i][1] = origEnd + allowedShift;
            } else if (shift < 0) {
              const hasBottomAnchor = sortedWins.some((other) => {
                if (other.windowId === currWin.windowId) return false;
                const hasHSpanOverlap = Math.max(other.state.hSpan[0], currWin.state.hSpan[0]) < Math.min(other.state.hSpan[1], currWin.state.hSpan[1]);
                return other.state.vSpan[0] === origEnd && hasHSpanOverlap;
              });
              const isAnchored = origEnd === gridRows || hasBottomAnchor;
              newSpans[i][1] = isAnchored ? origEnd : origEnd + shift;
            }
            const height = newSpans[i][1] - newSpans[i][0];
            if (height < MIN_HEIGHT) {
              newSpans[i][1] = newSpans[i][0] + MIN_HEIGHT;
              if (newSpans[i][1] > gridRows) {
                newSpans[i][1] = gridRows;
                newSpans[i][0] = gridRows - MIN_HEIGHT;
              }
            }
          }
        }
        for (let i = k - 1; i >= 0; i--) {
          const currWin = sortedWins[i];
          const currOriginalEnd = currWin.state.vSpan[1];
          const touchBoundaries = [];
          for (let j = i + 1; j < N; j++) {
            const nextWin = sortedWins[j];
            const hasHSpanOverlap = Math.max(nextWin.state.hSpan[0], currWin.state.hSpan[0]) < Math.min(nextWin.state.hSpan[1], currWin.state.hSpan[1]);
            const touching = nextWin.state.vSpan[0] === currOriginalEnd && hasHSpanOverlap;
            if (touching) {
              touchBoundaries.push(newSpans[j][0]);
            }
          }
          if (touchBoundaries.length > 0) {
            const origStart = currWin.state.vSpan[0];
            const origEnd = currWin.state.vSpan[1];
            newSpans[i][1] = Math.min(...touchBoundaries);
            const shift = origEnd - newSpans[i][1];
            if (shift > 0) {
              let limit = 0;
              for (const other of sortedWins) {
                if (other.windowId === currWin.windowId) continue;
                const hasHSpanOverlap = Math.max(other.state.hSpan[0], currWin.state.hSpan[0]) < Math.min(other.state.hSpan[1], currWin.state.hSpan[1]);
                if (other.state.vSpan[1] <= origStart && hasHSpanOverlap) {
                  if (other.state.vSpan[1] > limit) {
                    limit = other.state.vSpan[1];
                  }
                }
              }
              const freeSpace = origStart - limit;
              const allowedShift = Math.max(0, Math.min(shift, freeSpace));
              newSpans[i][0] = origStart - allowedShift;
            } else if (shift < 0) {
              const hasTopAnchor = sortedWins.some((other) => {
                if (other.windowId === currWin.windowId) return false;
                const hasHSpanOverlap = Math.max(other.state.hSpan[0], currWin.state.hSpan[0]) < Math.min(other.state.hSpan[1], currWin.state.hSpan[1]);
                return other.state.vSpan[1] === origStart && hasHSpanOverlap;
              });
              const isAnchored = origStart === 0 || hasTopAnchor;
              newSpans[i][0] = isAnchored ? origStart : origStart - shift;
            }
            const height = newSpans[i][1] - newSpans[i][0];
            if (height < MIN_HEIGHT) {
              newSpans[i][0] = newSpans[i][1] - MIN_HEIGHT;
              if (newSpans[i][0] < 0) {
                newSpans[i][0] = 0;
                newSpans[i][1] = MIN_HEIGHT;
              }
            }
          }
        }
        for (let i = 0; i < N; i++) {
          const w = sortedWins[i];
          if (w.windowId === activeId) {
            nextActiveState.vSpan = newSpans[i];
            nextActiveState.vIndex = spanToVIndex(newSpans[i]);
          } else {
            const nextState = {
              ...w.state,
              vSpan: newSpans[i],
              vIndex: spanToVIndex(newSpans[i]),
              lastDirection: direction
            };
            result[w.windowId] = nextState;
          }
        }
      }
      return result;
    }
  };

  // src/core/TilingEngine.ts
  var TilingEngine = class {
    /**
     * Возвращает дефолтное пустое состояние окна (до тайлинга)
     */
    static getDefaultState() {
      return {
        hIndex: 5,
        // [0, 12] (полная ширина)
        vIndex: 5,
        // [0, 12] (полная высота)
        hSpan: [0, 12],
        vSpan: [0, 12],
        lastDirection: null
      };
    }
    /**
     * Находит наиболее подходящий горизонтальный спан для первого тайлинга в зависимости от направления и соседей
     */
    static getInitialHSpan(direction, siblingSpans, config, fixedVSpan) {
      return InitialLayout.getInitialHSpan(direction, siblingSpans, config, fixedVSpan);
    }
    /**
     * Находит наиболее подходящий вертикальный спан для первого тайлинга в зависимости от направления и соседей
     */
    static getInitialVSpan(direction, siblingSpans, config, fixedHSpan) {
      return InitialLayout.getInitialVSpan(direction, siblingSpans, config, fixedHSpan);
    }
    /**
     * Рассчитывает следующее состояние окна на основе текущего состояния, направления и конфигурации
     */
    static calculateNextState(currentState, direction, config, siblingSpans = []) {
      const nextState = { ...currentState };
      const gridColumns = getGridColumns(config);
      const gridRows = getGridRows(config);
      const minColumnSpan = getMinColumnSpan(config);
      const minRowSpan = getMinRowSpan(config);
      if (!nextState.hSpan) {
        nextState.hSpan = HORIZONTAL_SPANS[nextState.hIndex] || [0, gridColumns];
      }
      if (!nextState.vSpan) {
        nextState.vSpan = VERTICAL_SPANS[nextState.vIndex] || [0, gridRows];
      }
      const halfColumns = Math.round(gridColumns / 2);
      const halfRows = Math.round(gridRows / 2);
      if (currentState.lastDirection === null) {
        switch (direction) {
          case "left": {
            const spans = InitialLayout.getInitialSpans("left", siblingSpans, config);
            nextState.hSpan = spans.hSpan;
            nextState.vSpan = spans.vSpan;
            nextState.hIndex = this.spanToHIndex(nextState.hSpan);
            nextState.vIndex = this.spanToVIndex(nextState.vSpan);
            nextState.lastDirection = nextState.hSpan[0] > 0 ? "right" : "left";
            break;
          }
          case "right": {
            const spans = InitialLayout.getInitialSpans("right", siblingSpans, config);
            nextState.hSpan = spans.hSpan;
            nextState.vSpan = spans.vSpan;
            nextState.hIndex = this.spanToHIndex(nextState.hSpan);
            nextState.vIndex = this.spanToVIndex(nextState.vSpan);
            nextState.lastDirection = nextState.hSpan[1] < gridColumns ? "left" : "right";
            break;
          }
          case "up": {
            const spans = InitialLayout.getInitialSpans("up", siblingSpans, config);
            nextState.hSpan = spans.hSpan;
            nextState.vSpan = spans.vSpan;
            nextState.hIndex = this.spanToHIndex(nextState.hSpan);
            nextState.vIndex = this.spanToVIndex(nextState.vSpan);
            nextState.lastDirection = nextState.vSpan[0] > 0 ? "down" : "up";
            break;
          }
          case "down": {
            const spans = InitialLayout.getInitialSpans("down", siblingSpans, config);
            nextState.hSpan = spans.hSpan;
            nextState.vSpan = spans.vSpan;
            nextState.hIndex = this.spanToHIndex(nextState.hSpan);
            nextState.vIndex = this.spanToVIndex(nextState.vSpan);
            nextState.lastDirection = nextState.vSpan[1] < gridRows ? "up" : "down";
            break;
          }
          case "shift-left":
            nextState.hSpan = [0, halfColumns];
            nextState.vSpan = [0, gridRows];
            nextState.hIndex = this.spanToHIndex(nextState.hSpan);
            nextState.vIndex = this.spanToVIndex(nextState.vSpan);
            nextState.lastDirection = "shift-left";
            break;
          case "shift-right":
            nextState.hSpan = [halfColumns, gridColumns];
            nextState.vSpan = [0, gridRows];
            nextState.hIndex = this.spanToHIndex(nextState.hSpan);
            nextState.vIndex = this.spanToVIndex(nextState.vSpan);
            nextState.lastDirection = "shift-right";
            break;
          case "shift-up":
            nextState.hSpan = [0, gridColumns];
            nextState.vSpan = [0, halfRows];
            nextState.hIndex = this.spanToHIndex(nextState.hSpan);
            nextState.vIndex = this.spanToVIndex(nextState.vSpan);
            nextState.lastDirection = "shift-up";
            break;
          case "shift-down":
            nextState.hSpan = [0, gridColumns];
            nextState.vSpan = [halfRows, gridRows];
            nextState.hIndex = this.spanToHIndex(nextState.hSpan);
            nextState.vIndex = this.spanToVIndex(nextState.vSpan);
            nextState.lastDirection = "shift-down";
            break;
        }
      } else {
        const isHorizontalOld = currentState.lastDirection === "left" || currentState.lastDirection === "right" || currentState.lastDirection === "shift-left" || currentState.lastDirection === "shift-right";
        const isVerticalOld = currentState.lastDirection === "up" || currentState.lastDirection === "down" || currentState.lastDirection === "shift-up" || currentState.lastDirection === "shift-down";
        const isHorizontalNew = direction === "left" || direction === "right" || direction === "shift-left" || direction === "shift-right";
        const isVerticalNew = direction === "up" || direction === "down" || direction === "shift-up" || direction === "shift-down";
        const isBothSpansCompressed = currentState.hSpan[1] - currentState.hSpan[0] < gridColumns && currentState.vSpan[1] - currentState.vSpan[0] < gridRows;
        if (!isBothSpansCompressed) {
          if (isHorizontalOld && isVerticalNew) {
            nextState.hSpan = currentState.hSpan;
            nextState.hIndex = currentState.hIndex;
            nextState.vSpan = this.getInitialVSpan(direction, siblingSpans, config, currentState.hSpan);
            nextState.vIndex = this.spanToVIndex(nextState.vSpan);
            nextState.lastDirection = direction;
            return nextState;
          }
          if (isVerticalOld && isHorizontalNew) {
            nextState.vSpan = currentState.vSpan;
            nextState.vIndex = currentState.vIndex;
            nextState.hSpan = this.getInitialHSpan(direction, siblingSpans, config, currentState.vSpan);
            nextState.hIndex = this.spanToHIndex(nextState.hSpan);
            nextState.lastDirection = direction;
            return nextState;
          }
        }
        switch (direction) {
          case "left": {
            const [start, end] = nextState.hSpan;
            let newStart = start;
            let newEnd = end;
            if (start > 0) {
              newStart = Math.max(0, start - config.step);
            } else {
              newEnd = Math.max(minColumnSpan, end - config.step);
            }
            const targetSpan = [newStart, newEnd];
            const leftCollision = targetSpan[0] < currentState.hSpan[0] && ChainBlockDetector.isLeftChainBlocked(currentState.hSpan[0], siblingSpans, config, currentState.vSpan);
            if (leftCollision) {
              const currentStart = currentState.hSpan[0];
              const currentEnd = currentState.hSpan[1];
              nextState.hSpan = [
                currentStart,
                Math.max(currentStart + minColumnSpan, currentEnd - config.step)
              ];
            } else {
              nextState.hSpan = targetSpan;
            }
            nextState.hIndex = this.spanToHIndex(nextState.hSpan);
            nextState.lastDirection = "left";
            break;
          }
          case "right": {
            const [start, end] = nextState.hSpan;
            let newStart = start;
            let newEnd = end;
            if (end < gridColumns) {
              newEnd = Math.min(gridColumns, end + config.step);
            } else {
              newStart = Math.min(gridColumns - minColumnSpan, start + config.step);
            }
            const targetSpan = [newStart, newEnd];
            const rightCollision = targetSpan[1] > currentState.hSpan[1] && ChainBlockDetector.isRightChainBlocked(currentState.hSpan[1], siblingSpans, config, currentState.vSpan);
            if (rightCollision) {
              const currentStart = currentState.hSpan[0];
              const currentEnd = currentState.hSpan[1];
              nextState.hSpan = [
                Math.min(currentEnd - minColumnSpan, currentStart + config.step),
                currentEnd
              ];
            } else {
              nextState.hSpan = targetSpan;
            }
            nextState.hIndex = this.spanToHIndex(nextState.hSpan);
            nextState.lastDirection = "right";
            break;
          }
          case "up": {
            const [start, end] = nextState.vSpan;
            let newStart = start;
            let newEnd = end;
            if (start > 0) {
              newStart = Math.max(0, start - config.step);
            } else {
              newEnd = Math.max(minRowSpan, end - config.step);
            }
            const targetSpan = [newStart, newEnd];
            const topCollision = targetSpan[0] < currentState.vSpan[0] && ChainBlockDetector.isTopChainBlocked(currentState.vSpan[0], siblingSpans, config, currentState.hSpan);
            if (topCollision) {
              const currentStart = currentState.vSpan[0];
              const currentEnd = currentState.vSpan[1];
              nextState.vSpan = [
                currentStart,
                Math.max(currentStart + minRowSpan, currentEnd - config.step)
              ];
            } else {
              nextState.vSpan = targetSpan;
            }
            nextState.vIndex = this.spanToVIndex(nextState.vSpan);
            nextState.lastDirection = "up";
            break;
          }
          case "down": {
            const [start, end] = nextState.vSpan;
            let newStart = start;
            let newEnd = end;
            if (end < gridRows) {
              newEnd = Math.min(gridRows, end + config.step);
            } else {
              newStart = Math.min(gridRows - minRowSpan, start + config.step);
            }
            const targetSpan = [newStart, newEnd];
            const bottomCollision = targetSpan[1] > currentState.vSpan[1] && ChainBlockDetector.isBottomChainBlocked(currentState.vSpan[1], siblingSpans, config, currentState.hSpan);
            if (bottomCollision) {
              const currentStart = currentState.vSpan[0];
              const currentEnd = currentState.vSpan[1];
              nextState.vSpan = [
                Math.min(currentEnd - minRowSpan, currentStart + config.step),
                currentEnd
              ];
            } else {
              nextState.vSpan = targetSpan;
            }
            nextState.vIndex = this.spanToVIndex(nextState.vSpan);
            nextState.lastDirection = "down";
            break;
          }
          case "shift-left":
            nextState.hSpan = [0, halfColumns];
            nextState.hIndex = this.spanToHIndex(nextState.hSpan);
            nextState.lastDirection = "shift-left";
            break;
          case "shift-right":
            nextState.hSpan = [halfColumns, gridColumns];
            nextState.hIndex = this.spanToHIndex(nextState.hSpan);
            nextState.lastDirection = "shift-right";
            break;
          case "shift-up":
            nextState.vSpan = [0, halfRows];
            nextState.vIndex = this.spanToVIndex(nextState.vSpan);
            nextState.lastDirection = "shift-up";
            break;
          case "shift-down":
            nextState.vSpan = [halfRows, gridRows];
            nextState.vIndex = this.spanToVIndex(nextState.vSpan);
            nextState.lastDirection = "shift-down";
            break;
        }
      }
      return nextState;
    }
    /**
     * Рассчитывает новые состояния для всей цепочки соприкасающихся окон на основе направления
     */
    static calculateChainTransitions(activeId, direction, config, activeWindows, allVisibleSpans = []) {
      return ChainTransitions.calculateChainTransitions(
        activeId,
        direction,
        config,
        activeWindows,
        allVisibleSpans,
        this.calculateNextState.bind(this),
        this.getDefaultState.bind(this)
      );
    }
    static spanToHIndex(span) {
      return spanToHIndex(span);
    }
    static spanToVIndex(span) {
      return spanToVIndex(span);
    }
    static geometryToHSpan(geom, monitor, config) {
      return GeometryConverter.geometryToHSpan(geom, monitor, config);
    }
    static geometryToVSpan(geom, monitor, config) {
      return GeometryConverter.geometryToVSpan(geom, monitor, config);
    }
    static stateToGeometry(state, screen, config) {
      return GeometryConverter.stateToGeometry(state, screen, config);
    }
  };

  // src/core/usecases/TilingUseCase.ts
  var _TilingUseCase = class _TilingUseCase {
    constructor(shell, cache, configProvider) {
      __publicField(this, "shell", shell);
      __publicField(this, "cache", cache);
      __publicField(this, "configProvider", configProvider);
      __publicField(this, "resizeTransactions", []);
      __publicField(this, "cacheWriteGeneration", 0);
    }
    tile(direction) {
      const config = this.configProvider.getConfig();
      const configForMonitor = (monitor) => this.configProvider.getConfigForMonitor ? this.configProvider.getConfigForMonitor(monitor) : config;
      const windowId = this.shell.getActiveWindowId();
      if (!windowId) {
        throw new Error("Could not retrieve active window ID.");
      }
      const windowGeom = this.shell.getWindowGeometry(windowId);
      const extents = this.shell.getFrameExtents(windowId);
      const monitors = this.shell.getActiveMonitors();
      const activeMonitor = this.shell.findMonitorForWindow(windowGeom, monitors);
      const activeConfig = configForMonitor(activeMonitor);
      const visibleWindowIds = this.shell.getVisibleWindowIds();
      const allCached = this.cache.getAllCachedWindows();
      const activeWindowsOnMonitor = [];
      let activeWindowIsResized = false;
      let activeWindowPhysicalState = null;
      const activeCached = allCached[windowId];
      if (activeCached) {
        try {
          const currentGeom = this.shell.getWindowGeometry(windowId);
          const ext = this.shell.getFrameExtents(windowId);
          const currentVisible = {
            x: currentGeom.x + ext.left,
            y: currentGeom.y + ext.top,
            width: currentGeom.width - ext.left - ext.right,
            height: currentGeom.height - ext.top - ext.bottom
          };
          const diffX = Math.abs(currentVisible.x - activeCached.tiledGeometry.x);
          const diffY = Math.abs(currentVisible.y - activeCached.tiledGeometry.y);
          const diffW = Math.abs(currentVisible.width - activeCached.tiledGeometry.width);
          const diffH = Math.abs(currentVisible.height - activeCached.tiledGeometry.height);
          const currentMonitor = this.shell.findMonitorForWindow(currentVisible, monitors);
          const currentConfig = configForMonitor(currentMonitor);
          const hSpan = TilingEngine.geometryToHSpan(currentVisible, currentMonitor, currentConfig);
          const vSpan = TilingEngine.geometryToVSpan(currentVisible, currentMonitor, currentConfig);
          const spanChanged = !this.spansEqual(hSpan, activeCached.state.hSpan) || !this.spansEqual(vSpan, activeCached.state.vSpan);
          const THRESHOLD = 80;
          if (spanChanged || diffX > THRESHOLD || diffY > THRESHOLD || diffW > THRESHOLD || diffH > THRESHOLD) {
            activeWindowIsResized = true;
            activeWindowPhysicalState = {
              state: {
                ...activeCached.state,
                hSpan,
                vSpan,
                hIndex: TilingEngine.spanToHIndex(hSpan),
                vIndex: TilingEngine.spanToVIndex(vSpan)
              },
              visibleGeometry: currentVisible,
              frameGeometry: currentGeom,
              monitor: currentMonitor
            };
          }
        } catch {
        }
      }
      for (const id of visibleWindowIds) {
        let cachedWin = allCached[id];
        if (!cachedWin) {
          try {
            const currentGeom2 = this.shell.getWindowGeometry(id);
            const ext = this.shell.getFrameExtents(id);
            const currentVisible = {
              x: currentGeom2.x + ext.left,
              y: currentGeom2.y + ext.top,
              width: currentGeom2.width - ext.left - ext.right,
              height: currentGeom2.height - ext.top - ext.bottom
            };
            const currentMonitor2 = this.shell.findMonitorForWindow(currentVisible, monitors);
            const currentConfig = configForMonitor(currentMonitor2);
            const hSpan = TilingEngine.geometryToHSpan(currentVisible, currentMonitor2, currentConfig);
            const vSpan = TilingEngine.geometryToVSpan(currentVisible, currentMonitor2, currentConfig);
            const testState = {
              hIndex: TilingEngine.spanToHIndex(hSpan),
              vIndex: TilingEngine.spanToVIndex(vSpan),
              hSpan,
              vSpan,
              lastDirection: null
            };
            const idealGeom = TilingEngine.stateToGeometry(testState, currentMonitor2, currentConfig);
            const diffX = Math.abs(currentVisible.x - idealGeom.x);
            const diffY = Math.abs(currentVisible.y - idealGeom.y);
            const diffW = Math.abs(currentVisible.width - idealGeom.width);
            const diffH = Math.abs(currentVisible.height - idealGeom.height);
            const SNAP_THRESHOLD = 80;
            if (diffX <= SNAP_THRESHOLD && diffY <= SNAP_THRESHOLD && diffW <= SNAP_THRESHOLD && diffH <= SNAP_THRESHOLD) {
              let hasOverlap = false;
              for (const [cachedId, cachedW] of Object.entries(allCached)) {
                if (cachedId === id) continue;
                let cachedMonitor = currentMonitor2;
                try {
                  const g = this.shell.getWindowGeometry(cachedId);
                  cachedMonitor = this.shell.findMonitorForWindow(g, monitors);
                } catch {
                  cachedMonitor = this.shell.findMonitorForWindow(cachedW.tiledGeometry, monitors);
                }
                if (cachedMonitor.id === currentMonitor2.id) {
                  const hasH = Math.max(hSpan[0], cachedW.state.hSpan[0]) < Math.min(hSpan[1], cachedW.state.hSpan[1]);
                  const hasV = Math.max(vSpan[0], cachedW.state.vSpan[0]) < Math.min(vSpan[1], cachedW.state.vSpan[1]);
                  if (hasH && hasV) {
                    hasOverlap = true;
                    break;
                  }
                }
              }
              if (!hasOverlap) {
                const restoredState = {
                  hIndex: TilingEngine.spanToHIndex(hSpan),
                  vIndex: TilingEngine.spanToVIndex(vSpan),
                  hSpan,
                  vSpan,
                  lastDirection: null
                };
                this.cache.saveState(id, restoredState, currentVisible, currentGeom2);
                cachedWin = this.cache.getCachedWindow(id);
              }
            }
          } catch {
          }
        }
        if (!cachedWin) continue;
        let windowState = { ...cachedWin.state };
        let currentMonitor = activeMonitor;
        let currentGeom = cachedWin.tiledGeometry;
        if (id === windowId && activeWindowIsResized && activeWindowPhysicalState) {
          windowState = activeWindowPhysicalState.state;
          currentMonitor = activeWindowPhysicalState.monitor;
          currentGeom = activeWindowPhysicalState.frameGeometry;
          this.cache.saveState(
            id,
            windowState,
            activeWindowPhysicalState.visibleGeometry,
            cachedWin.originalGeometry || currentGeom
          );
        } else {
          try {
            currentGeom = this.shell.getWindowGeometry(id);
            const ext = this.shell.getFrameExtents(id);
            const currentVisible = {
              x: currentGeom.x + ext.left,
              y: currentGeom.y + ext.top,
              width: currentGeom.width - ext.left - ext.right,
              height: currentGeom.height - ext.top - ext.bottom
            };
            currentMonitor = this.shell.findMonitorForWindow(currentVisible, monitors);
            if (id !== windowId) {
              if (currentMonitor.id !== activeMonitor.id) {
                continue;
              }
              const diffX = Math.abs(currentVisible.x - cachedWin.tiledGeometry.x);
              const diffY = Math.abs(currentVisible.y - cachedWin.tiledGeometry.y);
              const diffW = Math.abs(currentVisible.width - cachedWin.tiledGeometry.width);
              const diffH = Math.abs(currentVisible.height - cachedWin.tiledGeometry.height);
              const currentConfig = configForMonitor(currentMonitor);
              const hSpan = TilingEngine.geometryToHSpan(currentVisible, currentMonitor, currentConfig);
              const vSpan = TilingEngine.geometryToVSpan(currentVisible, currentMonitor, currentConfig);
              const spanChanged = !this.spansEqual(hSpan, cachedWin.state.hSpan) || !this.spansEqual(vSpan, cachedWin.state.vSpan);
              const THRESHOLD = 80;
              if (spanChanged || diffX > THRESHOLD || diffY > THRESHOLD || diffW > THRESHOLD || diffH > THRESHOLD) {
                windowState = {
                  ...cachedWin.state,
                  hSpan,
                  vSpan,
                  hIndex: TilingEngine.spanToHIndex(hSpan),
                  vIndex: TilingEngine.spanToVIndex(vSpan)
                };
                this.cache.saveState(id, windowState, currentVisible, cachedWin.originalGeometry || currentGeom);
              }
            }
          } catch {
            currentMonitor = this.shell.findMonitorForWindow(cachedWin.tiledGeometry, monitors);
            if (id !== windowId && currentMonitor.id !== activeMonitor.id) {
              continue;
            }
          }
        }
        if (id === windowId) {
          if (currentMonitor.id !== activeMonitor.id) continue;
        }
        const isOldStateSchema = typeof windowState.hIndex !== "number" || typeof windowState.vIndex !== "number";
        if (isOldStateSchema) continue;
        activeWindowsOnMonitor.push({
          windowId: id,
          state: windowState
        });
      }
      const undoTransaction = this.getUndoResizeTransaction(
        windowId,
        direction,
        activeMonitor.id,
        activeWindowsOnMonitor,
        activeMonitor,
        activeConfig
      );
      if (undoTransaction) {
        const operationId2 = this.nextCacheWriteGeneration();
        const axis = this.resizeAxis(direction);
        this.applyStates(
          undoTransaction.before,
          windowId,
          activeMonitor,
          activeConfig,
          operationId2
        );
        if (axis) {
          this.refreshUndoStack(windowId, activeMonitor.id, axis);
        }
        return;
      }
      const beforeStates = this.captureStates(activeWindowsOnMonitor);
      const chainStates = TilingEngine.calculateChainTransitions(
        windowId,
        direction,
        activeConfig,
        activeWindowsOnMonitor
      );
      const operationId = this.nextCacheWriteGeneration();
      for (const [id, nextState] of Object.entries(chainStates)) {
        if (id === windowId) continue;
        try {
          const cachedWin = allCached[id];
          const currentGeom = this.shell.getWindowGeometry(id);
          const originalGeom = cachedWin ? cachedWin.originalGeometry || currentGeom : currentGeom;
          const nextGeom = TilingEngine.stateToGeometry(nextState, activeMonitor, activeConfig);
          this.shell.unmaximizeWindow(id);
          this.shell.applyGeometry(id, nextGeom);
          setTimeout(() => {
            if (operationId !== this.cacheWriteGeneration) return;
            try {
              const realGeom = this.shell.getWindowGeometry(id);
              this.cache.saveState(id, nextState, realGeom, originalGeom);
            } catch {
              this.cache.saveState(id, nextState, nextGeom, originalGeom);
            }
          }, 100);
        } catch {
        }
      }
      const activeNextState = chainStates[windowId];
      if (activeNextState) {
        const cachedWin = allCached[windowId];
        const originalGeom = cachedWin ? cachedWin.originalGeometry || windowGeom : windowGeom;
        const nextGeom = TilingEngine.stateToGeometry(activeNextState, activeMonitor, activeConfig);
        try {
          this.shell.unmaximizeWindow(windowId);
          this.shell.applyGeometry(windowId, nextGeom);
          setTimeout(() => {
            if (operationId !== this.cacheWriteGeneration) return;
            try {
              const realGeom = this.shell.getWindowGeometry(windowId);
              this.cache.saveState(windowId, activeNextState, realGeom, originalGeom);
            } catch {
              this.cache.saveState(windowId, activeNextState, nextGeom, originalGeom);
            }
          }, 100);
          this.shell.raiseWindow(windowId);
        } catch {
        }
      }
      this.rememberResizeTransaction(windowId, direction, activeMonitor.id, beforeStates, chainStates);
    }
    restore() {
      const windowId = this.shell.getActiveWindowId();
      if (!windowId) {
        throw new Error("Could not retrieve active window ID.");
      }
      const cached = this.cache.getCachedWindow(windowId);
      if (cached && cached.originalGeometry) {
        this.shell.unmaximizeWindow(windowId);
        this.shell.applyGeometry(windowId, cached.originalGeometry);
        this.cache.clearState(windowId);
      } else {
        throw new Error("No original geometry saved for this window.");
      }
    }
    clearCache() {
      const windowId = this.shell.getActiveWindowId();
      if (windowId) {
        this.cache.clearState(windowId);
      } else {
        throw new Error("Could not get active window ID for clearing cache.");
      }
    }
    nextCacheWriteGeneration() {
      this.cacheWriteGeneration += 1;
      return this.cacheWriteGeneration;
    }
    captureStates(windows) {
      const states = {};
      for (const win of windows) {
        states[win.windowId] = this.cloneState(win.state);
      }
      return states;
    }
    cloneState(state) {
      return {
        ...state,
        hSpan: [...state.hSpan],
        vSpan: [...state.vSpan]
      };
    }
    rememberResizeTransaction(windowId, direction, monitorId, before, after) {
      const axis = this.resizeAxis(direction);
      if (!axis || !this.hasMeaningfulResize(before, after, axis)) {
        this.pruneResizeTransactions();
        return;
      }
      const plainDirection = direction;
      const clonedAfter = {};
      for (const [id, state] of Object.entries(after)) {
        clonedAfter[id] = this.cloneState(state);
      }
      this.pruneResizeTransactions();
      this.resizeTransactions.push({
        windowId,
        monitorId,
        axis,
        direction: plainDirection,
        expiresAt: Date.now() + _TilingUseCase.INVERSE_RESIZE_TTL_MS,
        before,
        after: clonedAfter
      });
      if (this.resizeTransactions.length > _TilingUseCase.MAX_RESIZE_UNDO_DEPTH) {
        this.resizeTransactions = this.resizeTransactions.slice(-_TilingUseCase.MAX_RESIZE_UNDO_DEPTH);
      }
    }
    getUndoResizeTransaction(windowId, direction, monitorId, activeWindows, monitor, config) {
      const axis = this.resizeAxis(direction);
      if (!axis) return null;
      this.pruneResizeTransactions();
      for (let i = this.resizeTransactions.length - 1; i >= 0; i -= 1) {
        const transaction = this.resizeTransactions[i];
        if (transaction.windowId !== windowId || transaction.monitorId !== monitorId || transaction.axis !== axis || this.oppositeDirection(transaction.direction) !== direction) {
          continue;
        }
        const currentStates = this.capturePhysicalStates(activeWindows, Object.keys(transaction.after), monitor, config);
        let matches = true;
        for (const [id, expectedAfter] of Object.entries(transaction.after)) {
          const current = currentStates[id];
          if (!current || !this.statesHaveSameSpans(current, expectedAfter)) {
            matches = false;
            break;
          }
        }
        if (!matches) return null;
        this.resizeTransactions.splice(i, 1);
        return transaction;
      }
      return null;
    }
    pruneResizeTransactions() {
      const now = Date.now();
      this.resizeTransactions = this.resizeTransactions.filter((transaction) => transaction.expiresAt >= now);
    }
    refreshUndoStack(windowId, monitorId, axis) {
      const expiresAt = Date.now() + _TilingUseCase.INVERSE_RESIZE_TTL_MS;
      for (const transaction of this.resizeTransactions) {
        if (transaction.windowId === windowId && transaction.monitorId === monitorId && transaction.axis === axis) {
          transaction.expiresAt = expiresAt;
        }
      }
    }
    capturePhysicalStates(fallbackWindows, windowIds, monitor, config) {
      const fallbackStates = this.captureStates(fallbackWindows);
      const states = {};
      for (const id of windowIds) {
        try {
          const frame = this.shell.getWindowGeometry(id);
          const ext = this.shell.getFrameExtents(id);
          const visible = {
            x: frame.x + ext.left,
            y: frame.y + ext.top,
            width: frame.width - ext.left - ext.right,
            height: frame.height - ext.top - ext.bottom
          };
          const hSpan = TilingEngine.geometryToHSpan(visible, monitor, config);
          const vSpan = TilingEngine.geometryToVSpan(visible, monitor, config);
          states[id] = {
            ...fallbackStates[id] || TilingEngine.getDefaultState(),
            hSpan,
            vSpan,
            hIndex: TilingEngine.spanToHIndex(hSpan),
            vIndex: TilingEngine.spanToVIndex(vSpan)
          };
        } catch {
          if (fallbackStates[id]) {
            states[id] = fallbackStates[id];
          }
        }
      }
      return states;
    }
    applyStates(states, activeId, monitor, config, operationId) {
      for (const [id, state] of Object.entries(states)) {
        if (id === activeId) continue;
        this.applySingleState(id, state, monitor, config, operationId, false);
      }
      const activeState = states[activeId];
      if (activeState) {
        this.applySingleState(activeId, activeState, monitor, config, operationId, true);
      }
    }
    applySingleState(id, state, monitor, config, operationId, raise) {
      try {
        const currentGeom = this.shell.getWindowGeometry(id);
        const cachedWin = this.cache.getCachedWindow(id);
        const originalGeom = cachedWin ? cachedWin.originalGeometry || currentGeom : currentGeom;
        const nextGeom = TilingEngine.stateToGeometry(state, monitor, config);
        this.shell.unmaximizeWindow(id);
        this.shell.applyGeometry(id, nextGeom);
        setTimeout(() => {
          if (operationId !== this.cacheWriteGeneration) return;
          try {
            const realGeom = this.shell.getWindowGeometry(id);
            this.cache.saveState(id, state, realGeom, originalGeom);
          } catch {
            this.cache.saveState(id, state, nextGeom, originalGeom);
          }
        }, 100);
        if (raise) {
          this.shell.raiseWindow(id);
        }
      } catch {
      }
    }
    resizeAxis(direction) {
      if (direction === "left" || direction === "right") return "horizontal";
      if (direction === "up" || direction === "down") return "vertical";
      return null;
    }
    oppositeDirection(direction) {
      switch (direction) {
        case "left":
          return "right";
        case "right":
          return "left";
        case "up":
          return "down";
        case "down":
          return "up";
      }
    }
    hasMeaningfulResize(before, after, axis) {
      for (const [id, afterState] of Object.entries(after)) {
        const beforeState = before[id];
        if (!beforeState) continue;
        if (axis === "horizontal" && !this.spansEqual(beforeState.hSpan, afterState.hSpan)) {
          return true;
        }
        if (axis === "vertical" && !this.spansEqual(beforeState.vSpan, afterState.vSpan)) {
          return true;
        }
      }
      return false;
    }
    statesHaveSameSpans(a, b) {
      return this.spansEqual(a.hSpan, b.hSpan) && this.spansEqual(a.vSpan, b.vSpan);
    }
    spansEqual(a, b) {
      return a[0] === b[0] && a[1] === b[1];
    }
  };
  __publicField(_TilingUseCase, "INVERSE_RESIZE_TTL_MS", 2500);
  __publicField(_TilingUseCase, "MAX_RESIZE_UNDO_DEPTH", 16);
  var TilingUseCase = _TilingUseCase;

  // src/TilePreview.ts
  var St = imports.gi.St;
  var Clutter = imports.gi.Clutter;
  var Meta = imports.gi.Meta;
  var Main = imports.ui.main;
  var TilePreview = class {
    constructor() {
      __publicField(this, "actor");
      __publicField(this, "_showing", false);
      __publicField(this, "_rect", null);
      __publicField(this, "_monitorIndex", -1);
      __publicField(this, "anim_time", 150);
      this.actor = new St.Bin({ style_class: "tile-preview", important: true });
      this.actor.set_style("background-color: rgba(52, 152, 219, 0.32); border: 2.5px solid #3498db; border-radius: 8px;");
      global.window_group.add_actor(this.actor);
      this._reset();
    }
    show(window, tileRect, monitorIndex, animate, animTime, customOpacity, isSecondary, variant, startFromWindow = true) {
      this.anim_time = animTime || 150;
      if (variant === "blocked" || variant === "blocked-overlap") {
        this.actor.set_style("background-color: rgba(231, 76, 60, 0.16); border: 2.5px dashed rgba(231, 76, 60, 0.92); border-radius: 8px;");
      } else if (variant === "blocked-too-small") {
        this.actor.set_style("background-color: rgba(243, 156, 18, 0.18); border: 2.5px dashed rgba(243, 156, 18, 0.94); border-radius: 8px;");
      } else if (variant === "blocked-out-of-bounds") {
        this.actor.set_style("background-color: rgba(155, 89, 182, 0.16); border: 2.5px dashed rgba(155, 89, 182, 0.94); border-radius: 8px;");
      } else if (variant === "swap-primary") {
        this.actor.set_style("background-color: rgba(46, 204, 113, 0.24); border: 3px solid rgba(46, 204, 113, 0.98); border-radius: 8px;");
      } else if (variant === "swap-secondary") {
        this.actor.set_style("background-color: rgba(46, 204, 113, 0.12); border: 2.5px dashed rgba(46, 204, 113, 0.86); border-radius: 8px;");
      } else if (isSecondary) {
        this.actor.set_style("background-color: rgba(52, 152, 219, 0.08); border: 1.5px dashed rgba(52, 152, 219, 0.5); border-radius: 6px;");
      } else {
        this.actor.set_style("background-color: rgba(52, 152, 219, 0.32); border: 2.5px solid #3498db; border-radius: 8px;");
      }
      if (this._rect && this._rect.x === tileRect.x && this._rect.y === tileRect.y && this._rect.width === tileRect.width && this._rect.height === tileRect.height) {
        return;
      }
      const changeMonitor = this._monitorIndex === -1 || this._monitorIndex !== monitorIndex;
      this._monitorIndex = monitorIndex;
      this._rect = tileRect;
      const { x, y, width, height } = tileRect;
      if (!this._showing || changeMonitor) {
        try {
          const monitor = Main.layoutManager.monitors[monitorIndex];
          const monitorRect = new Meta.Rectangle({
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height
          });
          const [intersected, rect] = startFromWindow ? window.get_buffer_rect().intersect(monitorRect) : [false, null];
          if (intersected) {
            this.actor.set_size(rect.width, rect.height);
            this.actor.set_position(rect.x, rect.y);
          } else {
            this.actor.set_size(width, height);
            this.actor.set_position(x, y);
          }
        } catch (e) {
          this.actor.set_size(width, height);
          this.actor.set_position(x, y);
        }
        this.actor.opacity = 0;
      }
      this._showing = true;
      this.actor.show();
      const targetOpacity = customOpacity !== void 0 ? customOpacity : isSecondary ? 120 : 180;
      const props = {
        x,
        y,
        width,
        height,
        opacity: targetOpacity
      };
      if (animate && Main.animations_enabled) {
        this.actor.remove_all_transitions();
        Object.assign(props, {
          duration: this.anim_time,
          mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
        this.actor.ease(props);
        return;
      }
      this.actor.x = x;
      this.actor.y = y;
      this.actor.width = width;
      this.actor.height = height;
      this.actor.opacity = targetOpacity;
    }
    hide() {
      if (!this._showing) return;
      this._showing = false;
      this.actor.remove_all_transitions();
      if (Main.animations_enabled) {
        this.actor.ease({
          opacity: 0,
          duration: this.anim_time,
          mode: Clutter.AnimationMode.EASE_OUT_QUAD,
          onComplete: () => this._reset()
        });
      } else {
        this._reset();
      }
    }
    _reset() {
      this.actor.hide();
      this._rect = null;
      this._monitorIndex = -1;
    }
    destroy() {
      this.actor.destroy();
    }
  };

  // src/CinnamonAdapters.ts
  var Meta2 = imports.gi.Meta;
  var CinnamonCache = class {
    constructor() {
      __publicField(this, "cache", {});
    }
    saveState(windowId, state, tiledGeom, originalGeom) {
      this.cache[windowId] = {
        windowId,
        state,
        tiledGeometry: tiledGeom,
        originalGeometry: originalGeom,
        lastUpdated: Date.now()
      };
    }
    getCachedWindow(windowId) {
      return this.cache[windowId] || null;
    }
    getAllCachedWindows() {
      return this.cache;
    }
    clearState(windowId) {
      delete this.cache[windowId];
    }
  };
  var CinnamonConfigProvider = class {
    constructor(ext) {
      __publicField(this, "ext", ext);
    }
    getConfig() {
      return this.ext.getConfigForMonitor ? this.ext.getConfigForMonitor(null) : this.buildConfig();
    }
    getConfigForMonitor(monitor) {
      return this.ext.getConfigForMonitor ? this.ext.getConfigForMonitor(monitor) : this.buildConfig();
    }
    buildConfig() {
      return {
        gridSize: this.ext.gridSize !== void 0 ? this.ext.gridSize : 12,
        gridColumns: this.ext.gridColumns !== void 0 ? this.ext.gridColumns : this.ext.gridSize !== void 0 ? this.ext.gridSize : 12,
        gridRows: this.ext.gridRows !== void 0 ? this.ext.gridRows : 6,
        minSpan: this.ext.minSpan !== void 0 ? this.ext.minSpan : 2,
        minColumnSpan: this.ext.minColumnSpan !== void 0 ? this.ext.minColumnSpan : this.ext.minSpan !== void 0 ? this.ext.minSpan : 2,
        minRowSpan: this.ext.minRowSpan !== void 0 ? this.ext.minRowSpan : this.ext.minSpan !== void 0 ? this.ext.minSpan : 2,
        step: this.ext.step !== void 0 ? this.ext.step : 1,
        gaps: this.ext.gaps !== void 0 ? this.ext.gaps : 8
      };
    }
  };
  var CinnamonShellAdapter = class {
    constructor(ext) {
      __publicField(this, "ext", ext);
    }
    getActiveWindowId() {
      const win = global.display.focus_window;
      return win ? win.get_stable_sequence().toString() : "";
    }
    getWindowGeometry(id) {
      const win = this._findMetaWindow(id);
      if (!win) {
        throw new Error(`Window ${id} not found.`);
      }
      const rect = win.get_frame_rect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }
    getFrameExtents(id) {
      return { left: 0, right: 0, top: 0, bottom: 0 };
    }
    getVisibleWindowIds() {
      const workspace = global.workspace_manager.get_active_workspace();
      const actors = global.get_window_actors() || [];
      return actors.map((a) => a.meta_window).filter((win) => {
        if (!win) return false;
        if (win.get_window_type() !== Meta2.WindowType.NORMAL) return false;
        if (win.minimized) return false;
        if (!win.is_on_all_workspaces() && win.get_workspace() !== workspace) return false;
        return true;
      }).map((win) => win.get_stable_sequence().toString());
    }
    getActiveMonitors() {
      const monitors = [];
      const nMonitors = global.display.get_n_monitors();
      const activeWorkspace = global.workspace_manager.get_active_workspace();
      for (let i = 0; i < nMonitors; i++) {
        const rect = global.display.get_monitor_geometry(i);
        const workArea = activeWorkspace.get_work_area_for_monitor(i);
        monitors.push({
          id: i.toString(),
          width: rect.width,
          height: rect.height,
          x: rect.x,
          y: rect.y,
          workarea: {
            x: workArea.x,
            y: workArea.y,
            width: workArea.width,
            height: workArea.height
          }
        });
      }
      return monitors;
    }
    findMonitorForWindow(geom, monitors) {
      let maxArea = -1;
      let bestMonitor = monitors[0];
      for (const m of monitors) {
        const ix = Math.max(geom.x, m.workarea.x);
        const iy = Math.max(geom.y, m.workarea.y);
        const iw = Math.min(geom.x + geom.width, m.workarea.x + m.workarea.width) - ix;
        const ih = Math.min(geom.y + geom.height, m.workarea.y + m.workarea.height) - iy;
        if (iw > 0 && ih > 0) {
          const area = iw * ih;
          if (area > maxArea) {
            maxArea = area;
            bestMonitor = m;
          }
        }
      }
      return bestMonitor;
    }
    applyGeometry(id, geom) {
      const win = this._findMetaWindow(id);
      if (!win) return;
      if (win.maximized_horz || win.maximized_vert) {
        win.unmaximize(Meta2.MaximizeFlags.BOTH);
      }
      const enablePreview = this.ext.enablePreview !== void 0 ? this.ext.enablePreview : true;
      if (enablePreview) {
        const monitorIndex = win.get_monitor();
        const preview = new TilePreview();
        preview.show(win, geom, monitorIndex, true, 150);
        imports.mainloop.timeout_add(60, () => {
          try {
            win.move_resize_frame(true, geom.x, geom.y, geom.width, geom.height);
          } catch (e) {
          }
          return false;
        });
        imports.mainloop.timeout_add(220, () => {
          try {
            preview.hide();
            preview.destroy();
          } catch (e) {
          }
          return false;
        });
      } else {
        win.move_resize_frame(true, geom.x, geom.y, geom.width, geom.height);
      }
    }
    unmaximizeWindow(id) {
      const win = this._findMetaWindow(id);
      if (win && (win.maximized_horz || win.maximized_vert)) {
        win.unmaximize(Meta2.MaximizeFlags.BOTH);
      }
    }
    raiseWindow(id) {
      const win = this._findMetaWindow(id);
      if (win) {
        win.activate(global.get_current_time());
      }
    }
    _findMetaWindow(stableSequence) {
      const actors = global.get_window_actors() || [];
      const actor = actors.find((a) => {
        return a.meta_window && a.meta_window.get_stable_sequence().toString() === stableSequence;
      });
      return actor ? actor.meta_window : null;
    }
  };

  // src/DragTiling.ts
  function hasSpanOverlap(spanA, spanB) {
    return Math.max(spanA[0], spanB[0]) < Math.min(spanA[1], spanB[1]);
  }
  function spansEqual(spanA, spanB) {
    return Boolean(spanA && spanB && spanA[0] === spanB[0] && spanA[1] === spanB[1]);
  }
  function shouldFloatAfterModifierRelease(input) {
    const distance = Math.hypot(input.pointerX - input.startPointerX, input.pointerY - input.startPointerY);
    const movementThreshold = input.thresholdPixels ?? 80;
    return distance >= movementThreshold;
  }
  function shouldCancelSourceReturn(sourceState, targetHSpan, targetVSpan, intentPoint) {
    if (!sourceState) return false;
    if (intentPoint && intentPoint.h >= sourceState.hSpan[0] && intentPoint.h <= sourceState.hSpan[1] && intentPoint.v >= sourceState.vSpan[0] && intentPoint.v <= sourceState.vSpan[1]) {
      return true;
    }
    return spansEqual(sourceState.hSpan, targetHSpan) && spansEqual(sourceState.vSpan, targetVSpan);
  }
  function hasLayoutOverlaps(states) {
    const entries = Object.entries(states);
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i][1];
        const b = entries[j][1];
        if (hasSpanOverlap(a.hSpan, b.hSpan) && hasSpanOverlap(a.vSpan, b.vSpan)) {
          return true;
        }
      }
    }
    return false;
  }
  function solveDragTransitions(draggedId, targetHSpan, targetVSpan, config, activeWindows, options = {}) {
    const states = calculateDragTransitions(
      draggedId,
      targetHSpan,
      targetVSpan,
      config,
      activeWindows,
      options
    );
    const reason = getDragBlockReason(states, config);
    return {
      status: reason ? "blocked" : "valid",
      states,
      affected: getAffectedWindowIds(states, activeWindows),
      reason
    };
  }
  function getDragBlockReason(states, config) {
    const gridColumns = getGridColumns(config);
    const gridRows = getGridRows(config);
    const minColumnSpan = getMinColumnSpan(config);
    const minRowSpan = getMinRowSpan(config);
    for (const state of Object.values(states)) {
      if (state.hSpan[0] < 0 || state.vSpan[0] < 0 || state.hSpan[1] > gridColumns || state.vSpan[1] > gridRows || state.hSpan[0] >= state.hSpan[1] || state.vSpan[0] >= state.vSpan[1]) {
        return "outOfBounds";
      }
      if (state.hSpan[1] - state.hSpan[0] < minColumnSpan || state.vSpan[1] - state.vSpan[0] < minRowSpan) {
        return "tooSmall";
      }
    }
    if (hasLayoutOverlaps(states)) {
      return "wouldOverlap";
    }
    return void 0;
  }
  function cloneWindowState(state) {
    return {
      hIndex: state.hIndex,
      vIndex: state.vIndex,
      hSpan: [...state.hSpan],
      vSpan: [...state.vSpan],
      lastDirection: state.lastDirection
    };
  }
  function statesEqual(a, b) {
    if (!a || !b) return false;
    return a.hSpan[0] === b.hSpan[0] && a.hSpan[1] === b.hSpan[1] && a.vSpan[0] === b.vSpan[0] && a.vSpan[1] === b.vSpan[1];
  }
  function restoreDragTransaction(snapshot, draggedId, config, activeWindows) {
    if (!snapshot || snapshot.draggedId !== draggedId) return null;
    const currentStates = new Map(activeWindows.map((w) => [w.windowId, w.state]));
    if (!statesEqual(currentStates.get(draggedId), snapshot.afterStates[draggedId])) {
      return null;
    }
    const idsToRestore = snapshot.affected.filter((id) => id !== draggedId && snapshot.beforeStates[id] && snapshot.afterStates[id]).sort((a, b) => a.localeCompare(b));
    if (idsToRestore.length === 0) return null;
    for (const id of idsToRestore) {
      if (!statesEqual(currentStates.get(id), snapshot.afterStates[id])) {
        return null;
      }
    }
    const restoredStates = {};
    for (const w of activeWindows) {
      if (w.windowId === draggedId) continue;
      restoredStates[w.windowId] = cloneWindowState(w.state);
    }
    for (const id of idsToRestore) {
      restoredStates[id] = cloneWindowState(snapshot.beforeStates[id]);
    }
    if (getDragBlockReason(restoredStates, config)) {
      return null;
    }
    return restoredStates;
  }
  function restoreDragTransactionHistory(snapshots, draggedId, monitorId, config, activeWindows) {
    for (let i = snapshots.length - 1; i >= 0; i--) {
      const snapshot = snapshots[i];
      if (snapshot.draggedId !== draggedId || snapshot.monitorId !== monitorId) {
        continue;
      }
      const states = restoreDragTransaction(snapshot, draggedId, config, activeWindows);
      if (states) {
        return {
          states,
          snapshotIndex: i
        };
      }
    }
    return null;
  }
  function getAffectedWindowIds(states, activeWindows) {
    const originalStates = new Map(activeWindows.map((w) => [w.windowId, w.state]));
    return Object.keys(states).filter((id) => {
      const previous = originalStates.get(id);
      if (!previous) return true;
      const next = states[id];
      return previous.hSpan[0] !== next.hSpan[0] || previous.hSpan[1] !== next.hSpan[1] || previous.vSpan[0] !== next.vSpan[0] || previous.vSpan[1] !== next.vSpan[1];
    }).sort((a, b) => a.localeCompare(b));
  }
  function spanSize(span) {
    return span[1] - span[0];
  }
  function stateArea(state) {
    return spanSize(state.hSpan) * spanSize(state.vSpan);
  }
  function stateDelta(previous, next) {
    return Math.abs(previous.hSpan[0] - next.hSpan[0]) + Math.abs(previous.hSpan[1] - next.hSpan[1]) + Math.abs(previous.vSpan[0] - next.vSpan[0]) + Math.abs(previous.vSpan[1] - next.vSpan[1]);
  }
  function scoreDragLayoutCandidate(states, config, activeWindows, draggedId, order = 0) {
    const reason = getDragBlockReason(states, config);
    const invalidPenalty = reason === "outOfBounds" ? 1e9 : reason === "tooSmall" ? 9e8 : reason === "wouldOverlap" ? 8e8 : 0;
    const originalStates = new Map(activeWindows.map((w) => [w.windowId, w.state]));
    const affected = getAffectedWindowIds(states, activeWindows);
    let score = invalidPenalty + affected.length * 1e4 + order / 1e3;
    for (const id of affected) {
      const previous = originalStates.get(id);
      const next = states[id];
      if (!next) continue;
      if (!previous) {
        score += id === draggedId ? 0 : 5e4;
        continue;
      }
      const isDragged = id === draggedId;
      const movement = stateDelta(previous, next);
      const areaDelta = Math.abs(stateArea(previous) - stateArea(next));
      score += (isDragged ? 0 : 1e3) + movement * (isDragged ? 5 : 100) + areaDelta * (isDragged ? 2 : 25);
    }
    return score;
  }
  function computeDragTarget(input) {
    const { draggedId, mx, my, monitor, config, activeWindows } = input;
    const { workarea } = monitor;
    const gridColumns = getGridColumns(config);
    const gridRows = getGridRows(config);
    const minColumnSpan = getMinColumnSpan(config);
    const minRowSpan = getMinRowSpan(config);
    const colWidth = workarea.width / gridColumns;
    const rowHeight = workarea.height / gridRows;
    const intentPoint = {
      h: (mx - workarea.x) / colWidth,
      v: (my - workarea.y) / rowHeight
    };
    const targetWidth = Math.max(minColumnSpan, Math.min(gridColumns, input.preferredWidth));
    let startCol = Math.round(intentPoint.h - targetWidth / 2);
    if (startCol + targetWidth > gridColumns) {
      startCol = gridColumns - targetWidth;
    }
    if (startCol < 0) startCol = 0;
    let targetHSpan = [startCol, startCol + targetWidth];
    const initialHSpan = [...targetHSpan];
    const ratioY = (my - workarea.y) / workarea.height;
    const midRows = Math.round(gridRows / 2);
    let targetVSpan;
    const previousVSpan = input.previousTarget?.targetVSpan;
    const shouldKeepTopHalf = spansEqual(previousVSpan, [0, midRows]) && ratioY < 0.32;
    const shouldKeepBottomHalf = spansEqual(previousVSpan, [midRows, gridRows]) && ratioY > 0.68;
    const shouldKeepFullHeight = spansEqual(previousVSpan, [0, gridRows]) && ratioY >= 0.24 && ratioY <= 0.76;
    if (shouldKeepTopHalf || !shouldKeepBottomHalf && !shouldKeepFullHeight && ratioY < 0.28) {
      targetVSpan = [0, midRows];
    } else if (shouldKeepBottomHalf || !shouldKeepTopHalf && !shouldKeepFullHeight && ratioY > 0.72) {
      targetVSpan = [midRows, gridRows];
    } else {
      targetVSpan = [0, gridRows];
    }
    const initialVSpan = [...targetVSpan];
    const allStackWindowCandidates = activeWindows.filter((w) => w.windowId !== draggedId).map((w) => ({
      ...w,
      hOverlap: Math.max(0, Math.min(targetHSpan[1], w.state.hSpan[1]) - Math.max(targetHSpan[0], w.state.hSpan[0]))
    }));
    const stackWindows = allStackWindowCandidates.filter((w) => w.hOverlap > 0).sort(
      (a, b) => b.hOverlap - a.hOverlap || a.state.vSpan[0] - b.state.vSpan[0] || a.windowId.localeCompare(b.windowId)
    );
    const stackGroups = /* @__PURE__ */ new Map();
    for (const w of allStackWindowCandidates) {
      const key = `${w.state.hSpan[0]}:${w.state.hSpan[1]}`;
      const existing = stackGroups.get(key);
      if (existing) {
        existing.windows.push(w);
      } else {
        stackGroups.set(key, {
          hSpan: [...w.state.hSpan],
          windows: [w]
        });
      }
    }
    const stackGroupCandidates = Array.from(stackGroups.values()).map((group) => {
      const containsCursor = intentPoint.h >= group.hSpan[0] && intentPoint.h <= group.hSpan[1];
      const hDistance = containsCursor ? 0 : Math.min(Math.abs(intentPoint.h - group.hSpan[0]), Math.abs(intentPoint.h - group.hSpan[1]));
      return {
        ...group,
        containsCursor,
        hDistance,
        width: group.hSpan[1] - group.hSpan[0]
      };
    }).filter((group) => group.containsCursor || group.hDistance <= 0.5).sort(
      (a, b) => Number(b.containsCursor) - Number(a.containsCursor) || a.hDistance - b.hDistance || b.windows.length - a.windows.length || a.width - b.width || a.hSpan[0] - b.hSpan[0]
    );
    const cursorVerticalGroup = stackGroupCandidates[0];
    const shouldPreferVerticalStack = (() => {
      if (!cursorVerticalGroup) return false;
      const cursorRow = intentPoint.v;
      const boundaries = [0, gridRows];
      for (const w of cursorVerticalGroup.windows) {
        boundaries.push(w.state.vSpan[0], w.state.vSpan[1]);
      }
      const uniqueBoundaries = Array.from(new Set(boundaries)).filter((v) => v >= 0 && v <= gridRows).sort((a, b) => a - b);
      let nearestDistance = Infinity;
      for (const boundary of uniqueBoundaries) {
        nearestDistance = Math.min(nearestDistance, Math.abs(cursorRow - boundary));
      }
      const stackTargetHeight = Math.max(
        minRowSpan,
        (cursorVerticalGroup.windows.length + 1) * minRowSpan <= gridRows ? Math.round(gridRows / (cursorVerticalGroup.windows.length + 1)) : minRowSpan
      );
      const canFitStackVertically = (cursorVerticalGroup.windows.length + 1) * minRowSpan <= gridRows;
      const canUseHorizontalRelief = cursorVerticalGroup.width < gridColumns;
      return nearestDistance <= Math.max(1, stackTargetHeight / 2) && (canFitStackVertically || canUseHorizontalRelief);
    })();
    const horizontalGroups = /* @__PURE__ */ new Map();
    for (const w of allStackWindowCandidates) {
      const key = `${w.state.vSpan[0]}:${w.state.vSpan[1]}`;
      const existing = horizontalGroups.get(key);
      if (existing) {
        existing.windows.push(w);
      } else {
        horizontalGroups.set(key, {
          vSpan: [...w.state.vSpan],
          windows: [w]
        });
      }
    }
    const nearHorizontalScreenEdge = intentPoint.h <= 0.65 || intentPoint.h >= gridColumns - 0.65;
    const targetOverlapsLeftEdgeWindow = allStackWindowCandidates.some(
      (w) => w.state.hSpan[0] <= 0 && w.state.hSpan[1] - w.state.hSpan[0] <= minColumnSpan && targetHSpan[0] <= w.state.hSpan[1] + 1 && hasSpanOverlap(targetVSpan, w.state.vSpan) && intentPoint.h <= w.state.hSpan[1] + 1
    );
    const targetOverlapsRightEdgeWindow = allStackWindowCandidates.some(
      (w) => w.state.hSpan[1] >= gridColumns && w.state.hSpan[1] - w.state.hSpan[0] <= minColumnSpan && targetHSpan[1] >= w.state.hSpan[0] - 1 && hasSpanOverlap(targetVSpan, w.state.vSpan) && intentPoint.h >= w.state.hSpan[0] - 1
    );
    const targetTouchesHorizontalScreenEdge = targetHSpan[0] <= 0 || targetHSpan[1] >= gridColumns || targetOverlapsLeftEdgeWindow || targetOverlapsRightEdgeWindow;
    const horizontalGroupCandidates = Array.from(horizontalGroups.values()).filter((group) => group.windows.length >= 2 || nearHorizontalScreenEdge || targetTouchesHorizontalScreenEdge).map((group) => {
      const containsCursor = intentPoint.v >= group.vSpan[0] && intentPoint.v <= group.vSpan[1];
      const vDistance = containsCursor ? 0 : Math.min(Math.abs(intentPoint.v - group.vSpan[0]), Math.abs(intentPoint.v - group.vSpan[1]));
      return {
        ...group,
        containsCursor,
        vDistance,
        height: group.vSpan[1] - group.vSpan[0]
      };
    }).filter((group) => group.containsCursor || group.vDistance <= 0.5).sort(
      (a, b) => Number(b.containsCursor) - Number(a.containsCursor) || a.vDistance - b.vDistance || b.windows.length - a.windows.length || a.height - b.height || a.vSpan[0] - b.vSpan[0]
    );
    let usedHorizontalStackTarget = false;
    const cursorHorizontalGroup = horizontalGroupCandidates[0];
    const debug = {
      mode: "base",
      preferredWidth: input.preferredWidth,
      preferredHeight: input.preferredHeight,
      targetWidth,
      initialHSpan,
      initialVSpan,
      verticalCandidates: stackGroupCandidates.length,
      horizontalCandidates: horizontalGroupCandidates.length,
      shouldPreferVerticalStack,
      verticalGroup: cursorVerticalGroup ? {
        hSpan: [...cursorVerticalGroup.hSpan],
        windows: cursorVerticalGroup.windows.length,
        containsCursor: cursorVerticalGroup.containsCursor,
        hDistance: cursorVerticalGroup.hDistance
      } : void 0,
      horizontalGroup: cursorHorizontalGroup ? {
        vSpan: [...cursorHorizontalGroup.vSpan],
        windows: cursorHorizontalGroup.windows.length,
        containsCursor: cursorHorizontalGroup.containsCursor,
        vDistance: cursorHorizontalGroup.vDistance
      } : void 0
    };
    if (cursorHorizontalGroup && !shouldPreferVerticalStack) {
      const cursorCol = intentPoint.h;
      const boundaries = [0, gridColumns];
      for (const w of cursorHorizontalGroup.windows) {
        boundaries.push(w.state.hSpan[0], w.state.hSpan[1]);
      }
      const uniqueBoundaries = Array.from(new Set(boundaries)).filter((h) => h >= 0 && h <= gridColumns).sort((a, b) => a - b);
      let nearestBoundary = uniqueBoundaries[0];
      let nearestDistance = Math.abs(cursorCol - nearestBoundary);
      if (targetHSpan[0] <= 0 || targetOverlapsLeftEdgeWindow) {
        nearestBoundary = 0;
        nearestDistance = Math.abs(cursorCol);
      } else if (targetHSpan[1] >= gridColumns || targetOverlapsRightEdgeWindow) {
        nearestBoundary = gridColumns;
        nearestDistance = Math.abs(cursorCol - gridColumns);
      } else {
        for (const boundary of uniqueBoundaries) {
          const distance = Math.abs(cursorCol - boundary);
          if (distance < nearestDistance) {
            nearestBoundary = boundary;
            nearestDistance = distance;
          }
        }
      }
      let usesStickyHorizontalBoundary = false;
      const previousHorizontalBoundary = input.previousTarget?.debug.mode === "horizontal-stack" && spansEqual(input.previousTarget.targetVSpan, cursorHorizontalGroup.vSpan) ? input.previousTarget.debug.nearestBoundary : void 0;
      if (previousHorizontalBoundary !== void 0 && uniqueBoundaries.includes(previousHorizontalBoundary)) {
        const previousDistance = Math.abs(cursorCol - previousHorizontalBoundary);
        const previousExitThreshold = Math.max(1, input.previousTarget?.debug.horizontalThreshold ?? 1) + 0.35;
        if (previousDistance <= previousExitThreshold) {
          nearestBoundary = previousHorizontalBoundary;
          nearestDistance = previousDistance;
          usesStickyHorizontalBoundary = true;
        }
      }
      const adjacentWindows = cursorHorizontalGroup.windows.filter(
        (w) => Math.abs(w.state.hSpan[0] - nearestBoundary) <= 1 || Math.abs(w.state.hSpan[1] - nearestBoundary) <= 1
      );
      const adjacentWidths = adjacentWindows.map((w) => w.state.hSpan[1] - w.state.hSpan[0]).filter((width) => width >= minColumnSpan);
      const requestedSlotWidth = Math.min(
        targetWidth,
        adjacentWidths.length > 0 ? Math.max(minColumnSpan, Math.min(...adjacentWidths)) : targetWidth
      );
      const isScreenEdgeBoundary = nearestBoundary <= 0 || nearestBoundary >= gridColumns;
      let slotWidth = requestedSlotWidth;
      if (!isScreenEdgeBoundary) {
        const canCarveSlot = (width) => {
          let start = Math.round(nearestBoundary - width / 2);
          if (start < 0) start = 0;
          if (start + width > gridColumns) {
            start = gridColumns - width;
          }
          const candidateHSpan = [start, start + width];
          for (const w of adjacentWindows) {
            const overlap = Math.max(
              0,
              Math.min(candidateHSpan[1], w.state.hSpan[1]) - Math.max(candidateHSpan[0], w.state.hSpan[0])
            );
            if (overlap > 0 && w.state.hSpan[1] - w.state.hSpan[0] - overlap < minColumnSpan) {
              return false;
            }
          }
          return true;
        };
        for (let width = requestedSlotWidth; width >= minColumnSpan; width--) {
          if (canCarveSlot(width)) {
            slotWidth = width;
            break;
          }
        }
      }
      const isWideTargetClampedToEdge = isScreenEdgeBoundary && targetWidth > slotWidth && (nearestBoundary <= 0 && targetHSpan[0] <= 0 || nearestBoundary <= 0 && targetOverlapsLeftEdgeWindow || nearestBoundary >= gridColumns && targetHSpan[1] >= gridColumns || nearestBoundary >= gridColumns && targetOverlapsRightEdgeWindow);
      const isMinimumEdgeNeighborInsertion = isScreenEdgeBoundary && (targetOverlapsLeftEdgeWindow || targetOverlapsRightEdgeWindow);
      const horizontalThreshold = isScreenEdgeBoundary ? isWideTargetClampedToEdge || isMinimumEdgeNeighborInsertion ? Math.max(0.65, targetWidth / 2 + slotWidth / 2, minColumnSpan + 1) : Math.min(0.65, Math.max(0.35, slotWidth / 3)) : Math.max(1, requestedSlotWidth / 2);
      debug.nearestBoundary = nearestBoundary;
      debug.nearestDistance = nearestDistance;
      debug.slotWidth = slotWidth;
      debug.horizontalThreshold = horizontalThreshold;
      if (nearestDistance <= horizontalThreshold || usesStickyHorizontalBoundary) {
        targetVSpan = [...cursorHorizontalGroup.vSpan];
        if (nearestBoundary <= 0) {
          targetHSpan = [0, slotWidth];
        } else if (nearestBoundary >= gridColumns) {
          targetHSpan = [gridColumns - slotWidth, gridColumns];
        } else {
          let boundaryStartCol = Math.round(nearestBoundary - slotWidth / 2);
          if (boundaryStartCol < 0) boundaryStartCol = 0;
          if (boundaryStartCol + slotWidth > gridColumns) {
            boundaryStartCol = gridColumns - slotWidth;
          }
          targetHSpan = [boundaryStartCol, boundaryStartCol + slotWidth];
        }
        usedHorizontalStackTarget = true;
        debug.mode = "horizontal-stack";
      }
    }
    if (!usedHorizontalStackTarget && stackWindows.length > 0) {
      const targetSpanWidth = targetHSpan[1] - targetHSpan[0];
      const overlapBasedStackWindows = (() => {
        const maxOverlap = stackWindows[0].hOverlap;
        return stackWindows.filter((w) => w.hOverlap === maxOverlap && w.hOverlap / targetSpanWidth >= 0.5).sort((a, b) => a.state.vSpan[0] - b.state.vSpan[0] || a.windowId.localeCompare(b.windowId));
      })();
      const cursorStackGroup = cursorVerticalGroup;
      const columnStackWindows = cursorStackGroup ? cursorStackGroup.windows.sort((a, b) => a.state.vSpan[0] - b.state.vSpan[0] || a.windowId.localeCompare(b.windowId)) : overlapBasedStackWindows;
      if (columnStackWindows.length > 0) {
        const cursorRow = intentPoint.v;
        const boundaries = [0, gridRows];
        for (const w of columnStackWindows) {
          boundaries.push(w.state.vSpan[0], w.state.vSpan[1]);
        }
        const uniqueBoundaries = Array.from(new Set(boundaries)).filter((v) => v >= 0 && v <= gridRows).sort((a, b) => a - b);
        let nearestBoundary = uniqueBoundaries[0];
        let nearestDistance = Math.abs(cursorRow - nearestBoundary);
        for (const boundary of uniqueBoundaries) {
          const distance = Math.abs(cursorRow - boundary);
          if (distance < nearestDistance) {
            nearestBoundary = boundary;
            nearestDistance = distance;
          }
        }
        const stackTargetHeight = Math.max(
          minRowSpan,
          (columnStackWindows.length + 1) * minRowSpan <= gridRows ? Math.round(gridRows / (columnStackWindows.length + 1)) : minRowSpan
        );
        const boundaryThreshold = Math.max(1, stackTargetHeight / 2);
        const canFitStackVertically = (columnStackWindows.length + 1) * minRowSpan <= gridRows;
        const canUseHorizontalRelief = Boolean(cursorStackGroup && cursorStackGroup.width < gridColumns);
        let usesStickyVerticalBoundary = false;
        const previousVerticalBoundary = input.previousTarget?.debug.mode === "vertical-stack" && cursorStackGroup && spansEqual(input.previousTarget.targetHSpan, cursorStackGroup.hSpan) ? input.previousTarget.debug.nearestBoundary : void 0;
        if (previousVerticalBoundary !== void 0 && uniqueBoundaries.includes(previousVerticalBoundary)) {
          const previousDistance = Math.abs(cursorRow - previousVerticalBoundary);
          if (previousDistance <= boundaryThreshold + 0.35) {
            nearestBoundary = previousVerticalBoundary;
            nearestDistance = previousDistance;
            usesStickyVerticalBoundary = true;
          }
        }
        if ((nearestDistance <= boundaryThreshold || usesStickyVerticalBoundary) && (canFitStackVertically || canUseHorizontalRelief)) {
          debug.nearestBoundary = nearestBoundary;
          debug.nearestDistance = nearestDistance;
          debug.stackTargetHeight = stackTargetHeight;
          debug.boundaryThreshold = boundaryThreshold;
          debug.mode = "vertical-stack";
          if (cursorStackGroup) {
            targetHSpan = [...cursorStackGroup.hSpan];
          }
          if (nearestBoundary <= 0) {
            targetVSpan = [0, stackTargetHeight];
          } else if (nearestBoundary >= gridRows) {
            targetVSpan = [gridRows - stackTargetHeight, gridRows];
          } else {
            let startRow = Math.round(nearestBoundary - stackTargetHeight / 2);
            if (startRow < 0) startRow = 0;
            if (startRow + stackTargetHeight > gridRows) {
              startRow = gridRows - stackTargetHeight;
            }
            targetVSpan = [startRow, startRow + stackTargetHeight];
          }
        }
      }
    }
    return {
      targetHSpan,
      targetVSpan,
      intentPoint,
      debug
    };
  }
  function calculateDragTransitions(draggedId, targetHSpan, targetVSpan, config, activeWindows, options = {}) {
    const states = {};
    const visited = /* @__PURE__ */ new Set();
    const touched = /* @__PURE__ */ new Set();
    const gridColumns = getGridColumns(config);
    const gridRows = getGridRows(config);
    const minColumnSpan = getMinColumnSpan(config);
    const minRowSpan = getMinRowSpan(config);
    const otherWindows = activeWindows.filter((w) => w.windowId !== draggedId).sort(compareWindowsByGridPosition);
    for (const w of otherWindows) {
      states[w.windowId] = {
        hIndex: w.state.hIndex,
        vIndex: w.state.vIndex,
        hSpan: [...w.state.hSpan || [0, gridColumns]],
        vSpan: [...w.state.vSpan || [0, gridRows]],
        lastDirection: w.state.lastDirection
      };
    }
    const hasVerticalOverlap = (spanA, spanB) => {
      return Math.max(spanA[0], spanB[0]) < Math.min(spanA[1], spanB[1]);
    };
    const hasHorizontalOverlap = (spanA, spanB) => {
      return Math.max(spanA[0], spanB[0]) < Math.min(spanA[1], spanB[1]);
    };
    const spansEqual2 = (spanA, spanB) => {
      return spanA[0] === spanB[0] && spanA[1] === spanB[1];
    };
    const spanSize2 = (span) => span[1] - span[0];
    const spanCenter = (span) => (span[0] + span[1]) / 2;
    const cloneState = (state) => ({
      hIndex: state.hIndex,
      vIndex: state.vIndex,
      hSpan: [...state.hSpan],
      vSpan: [...state.vSpan],
      lastDirection: state.lastDirection
    });
    const updateIndexes = (state) => {
      state.hIndex = TilingEngine.spanToHIndex(state.hSpan);
      state.vIndex = TilingEngine.spanToVIndex(state.vSpan);
    };
    const setHSpan = (id, hSpan) => {
      const state = states[id];
      state.hSpan = hSpan;
      state.hIndex = TilingEngine.spanToHIndex(hSpan);
      touched.add(id);
    };
    const setVSpan = (id, vSpan) => {
      const state = states[id];
      state.vSpan = vSpan;
      state.vIndex = TilingEngine.spanToVIndex(vSpan);
      touched.add(id);
    };
    const cloneStates = (source) => {
      const cloned = {};
      for (const [id, state] of Object.entries(source)) {
        cloned[id] = cloneState(state);
      }
      return cloned;
    };
    const scoreCandidateStates = (candidateStates, order = 0) => scoreDragLayoutCandidate(candidateStates, config, activeWindows, draggedId, order);
    const applyCandidateStates = (candidateStates) => {
      for (const [id, nextState] of Object.entries(candidateStates)) {
        if (!states[id] || !statesEqual(states[id], nextState)) {
          states[id] = cloneState(nextState);
          touched.add(id);
        }
      }
    };
    const rectsOverlap = (a, b) => {
      return hasHorizontalOverlap(a.hSpan, b.hSpan) && hasVerticalOverlap(a.vSpan, b.vSpan);
    };
    const maybeSwapWindows = () => {
      if (!options.swapWindows || !options.intentPoint) return null;
      const draggedWin2 = activeWindows.find((w) => w.windowId === draggedId);
      if (!draggedWin2) return null;
      const draggedState = draggedWin2.state;
      const targetWin = otherWindows.find((w) => {
        const state = w.state;
        return options.intentPoint.h >= state.hSpan[0] && options.intentPoint.h <= state.hSpan[1] && options.intentPoint.v >= state.vSpan[0] && options.intentPoint.v <= state.vSpan[1];
      });
      if (!targetWin) return null;
      const targetState = targetWin.state;
      const swappedStates = {};
      for (const w of activeWindows) {
        if (w.windowId === draggedId) {
          swappedStates[w.windowId] = cloneState(targetState);
          swappedStates[w.windowId].lastDirection = null;
        } else if (w.windowId === targetWin.windowId) {
          swappedStates[w.windowId] = cloneState(draggedState);
          swappedStates[w.windowId].lastDirection = null;
        } else {
          swappedStates[w.windowId] = cloneState(w.state);
        }
      }
      return swappedStates;
    };
    const swapStates = maybeSwapWindows();
    if (swapStates) return swapStates;
    const getCarveCandidatesAwayFromTarget = (id) => {
      const state = states[id];
      const stateWidth = spanSize2(state.hSpan);
      const stateHeight = spanSize2(state.vSpan);
      const originalArea = stateWidth * stateHeight;
      const hOverlap = Math.max(0, Math.min(targetHSpan[1], state.hSpan[1]) - Math.max(targetHSpan[0], state.hSpan[0]));
      const vOverlap = Math.max(0, Math.min(targetVSpan[1], state.vSpan[1]) - Math.max(targetVSpan[0], state.vSpan[0]));
      const hCoverage = stateWidth > 0 ? hOverlap / stateWidth : 0;
      const vCoverage = stateHeight > 0 ? vOverlap / stateHeight : 0;
      const touchesHorizontalEdge = Math.min(Math.abs(targetHSpan[0] - state.hSpan[0]), Math.abs(targetHSpan[1] - state.hSpan[1])) <= 0.5;
      const touchesVerticalEdge = Math.min(Math.abs(targetVSpan[0] - state.vSpan[0]), Math.abs(targetVSpan[1] - state.vSpan[1])) <= 0.5;
      const horizontalSpanCandidates = spanCenter(targetHSpan) >= spanCenter(state.hSpan) ? [[state.hSpan[0], targetHSpan[0]], [targetHSpan[1], state.hSpan[1]]] : [[targetHSpan[1], state.hSpan[1]], [state.hSpan[0], targetHSpan[0]]];
      const verticalSpanCandidates = spanCenter(targetVSpan) >= spanCenter(state.vSpan) ? [[state.vSpan[0], targetVSpan[0]], [targetVSpan[1], state.vSpan[1]]] : [[targetVSpan[1], state.vSpan[1]], [state.vSpan[0], targetVSpan[0]]];
      const candidates = [];
      let order = 0;
      for (const span of horizontalSpanCandidates) {
        if (span[0] >= 0 && span[1] <= gridColumns && spanSize2(span) >= minColumnSpan) {
          const remainingArea = spanSize2(span) * stateHeight;
          const axisPreference = (vCoverage - hCoverage) * 2 + (touchesHorizontalEdge ? 1 : 0) - (touchesVerticalEdge ? 0.5 : 0) + 0.05;
          candidates.push({
            axis: "horizontal",
            span,
            score: (originalArea - remainingArea) * 10 - axisPreference,
            order: order++
          });
        }
      }
      for (const span of verticalSpanCandidates) {
        if (span[0] >= 0 && span[1] <= gridRows && spanSize2(span) >= minRowSpan) {
          const remainingArea = stateWidth * spanSize2(span);
          const axisPreference = (hCoverage - vCoverage) * 2 + (touchesVerticalEdge ? 1 : 0) - (touchesHorizontalEdge ? 0.5 : 0);
          candidates.push({
            axis: "vertical",
            span,
            score: (originalArea - remainingArea) * 10 - axisPreference,
            order: order++
          });
        }
      }
      return candidates.sort(
        (a, b) => a.score - b.score || a.order - b.order
      );
    };
    const carveAwayFromTarget = (id) => {
      const candidates = getCarveCandidatesAwayFromTarget(id);
      let bestCandidate = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const [index, candidate] of candidates.entries()) {
        const candidateStates = cloneStates(states);
        if (candidate.axis === "horizontal") {
          candidateStates[id].hSpan = [...candidate.span];
          candidateStates[id].hIndex = TilingEngine.spanToHIndex(candidate.span);
        } else {
          candidateStates[id].vSpan = [...candidate.span];
          candidateStates[id].vIndex = TilingEngine.spanToVIndex(candidate.span);
        }
        const score = scoreCandidateStates(candidateStates, index) + candidate.score / 1e3;
        if (score < bestScore) {
          bestScore = score;
          bestCandidate = candidate;
        }
      }
      if (!bestCandidate) return false;
      if (bestCandidate.axis === "horizontal") {
        setHSpan(id, bestCandidate.span);
      } else {
        setVSpan(id, bestCandidate.span);
      }
      return true;
    };
    const separateHorizontally = (movableId, anchorId) => {
      const movable = states[movableId];
      const anchor = states[anchorId];
      const movableCenter = spanCenter(movable.hSpan);
      const anchorCenter = spanCenter(anchor.hSpan);
      const candidates = movableCenter >= anchorCenter ? [[anchor.hSpan[1], movable.hSpan[1]], [movable.hSpan[0], anchor.hSpan[0]]] : [[movable.hSpan[0], anchor.hSpan[0]], [anchor.hSpan[1], movable.hSpan[1]]];
      for (const candidate of candidates) {
        if (candidate[0] >= 0 && candidate[1] <= gridColumns && spanSize2(candidate) >= minColumnSpan) {
          setHSpan(movableId, candidate);
          return true;
        }
      }
      return false;
    };
    const separateVertically = (movableId, anchorId) => {
      const movable = states[movableId];
      const anchor = states[anchorId];
      const movableCenter = spanCenter(movable.vSpan);
      const anchorCenter = spanCenter(anchor.vSpan);
      const candidates = movableCenter >= anchorCenter ? [[anchor.vSpan[1], movable.vSpan[1]], [movable.vSpan[0], anchor.vSpan[0]]] : [[movable.vSpan[0], anchor.vSpan[0]], [anchor.vSpan[1], movable.vSpan[1]]];
      for (const candidate of candidates) {
        if (candidate[0] >= 0 && candidate[1] <= gridRows && spanSize2(candidate) >= minRowSpan) {
          setVSpan(movableId, candidate);
          return true;
        }
      }
      return false;
    };
    const separateFromAnchor = (movableId, anchorId) => {
      const movable = states[movableId];
      const anchor = states[anchorId];
      const hOverlap = Math.min(movable.hSpan[1], anchor.hSpan[1]) - Math.max(movable.hSpan[0], anchor.hSpan[0]);
      const vOverlap = Math.min(movable.vSpan[1], anchor.vSpan[1]) - Math.max(movable.vSpan[0], anchor.vSpan[0]);
      if (hOverlap <= vOverlap) {
        return separateHorizontally(movableId, anchorId) || separateVertically(movableId, anchorId);
      }
      return separateVertically(movableId, anchorId) || separateHorizontally(movableId, anchorId);
    };
    const sanitizeTouchedOverlaps = () => {
      const ids = Object.keys(states);
      for (let pass = 0; pass < ids.length * 2; pass++) {
        let changed = false;
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const aId = ids[i];
            const bId = ids[j];
            const a = states[aId];
            const b = states[bId];
            if (!rectsOverlap(a, b)) continue;
            let movableId = null;
            let anchorId = null;
            if (aId === draggedId) {
              movableId = bId;
              anchorId = aId;
            } else if (bId === draggedId) {
              movableId = aId;
              anchorId = bId;
            } else if (touched.has(aId) && !touched.has(bId)) {
              movableId = aId;
              anchorId = bId;
            } else if (touched.has(bId) && !touched.has(aId)) {
              movableId = bId;
              anchorId = aId;
            } else if (touched.has(aId)) {
              movableId = aId;
              anchorId = bId;
            }
            if (movableId && anchorId && separateFromAnchor(movableId, anchorId)) {
              updateIndexes(states[movableId]);
              changed = true;
            }
          }
        }
        if (!changed) break;
      }
    };
    const draggedWin = activeWindows.find((w) => w.windowId === draggedId);
    if (draggedWin && draggedWin.state && draggedWin.state.hSpan && draggedWin.state.vSpan) {
      const vacantHSpan = draggedWin.state.hSpan;
      const vacantVSpan = draggedWin.state.vSpan;
      const isHSpanCropped = vacantHSpan[1] - vacantHSpan[0] < gridColumns;
      const isVSpanCropped = vacantVSpan[1] - vacantVSpan[0] < gridRows;
      const isSameAsTarget = spansEqual2(vacantHSpan, targetHSpan) && spansEqual2(vacantVSpan, targetVSpan);
      if (!isSameAsTarget && (isHSpanCropped || isVSpanCropped)) {
        const collapsedStates = collapseVacancy(draggedId, config, activeWindows);
        for (const [id, collapsedState] of Object.entries(collapsedStates)) {
          const previous = states[id];
          states[id] = cloneState(collapsedState);
          if (!previous || previous.hSpan[0] !== collapsedState.hSpan[0] || previous.hSpan[1] !== collapsedState.hSpan[1] || previous.vSpan[0] !== collapsedState.vSpan[0] || previous.vSpan[1] !== collapsedState.vSpan[1]) {
            touched.add(id);
          }
        }
      }
    }
    states[draggedId] = {
      hIndex: TilingEngine.spanToHIndex(targetHSpan),
      vIndex: TilingEngine.spanToVIndex(targetVSpan),
      hSpan: [...targetHSpan],
      vSpan: [...targetVSpan],
      lastDirection: null
    };
    const tryRedistributeVerticalStackInsertion = () => {
      if (spanSize2(targetVSpan) >= gridRows) return false;
      const sameColumnWindows = otherWindows.filter((w) => spansEqual2(states[w.windowId].hSpan, targetHSpan)).sort((a, b) => states[a.windowId].vSpan[0] - states[b.windowId].vSpan[0] || a.windowId.localeCompare(b.windowId));
      const collidingStackWindows = sameColumnWindows.filter((w) => rectsOverlap(states[w.windowId], states[draggedId]));
      if (sameColumnWindows.length === 0 || collidingStackWindows.length === 0) {
        return false;
      }
      if ((sameColumnWindows.length + 1) * minRowSpan > gridRows) {
        return false;
      }
      const stackTop = Math.min(...sameColumnWindows.map((w) => states[w.windowId].vSpan[0]));
      const stackBottom = Math.max(...sameColumnWindows.map((w) => states[w.windowId].vSpan[1]));
      if (stackTop > 0 || stackBottom < gridRows) {
        return false;
      }
      const slotCount = sameColumnWindows.length + 1;
      const targetCenter = spanCenter(targetVSpan);
      const targetIndex = Math.max(
        0,
        Math.min(slotCount - 1, Math.floor(targetCenter / (gridRows / slotCount)))
      );
      const baseHeight = Math.floor(gridRows / slotCount);
      const extraRows = gridRows - baseHeight * slotCount;
      const slots = [];
      let cursor = 0;
      for (let i = 0; i < slotCount; i++) {
        const height = baseHeight + (i < extraRows ? 1 : 0);
        slots.push([cursor, cursor + height]);
        cursor += height;
      }
      const candidateStates = {};
      for (const [id, state] of Object.entries(states)) {
        candidateStates[id] = cloneState(state);
      }
      candidateStates[draggedId].hSpan = [...targetHSpan];
      candidateStates[draggedId].vSpan = [...slots[targetIndex]];
      updateIndexes(candidateStates[draggedId]);
      let sourceIndex = 0;
      for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
        if (slotIndex === targetIndex) continue;
        const stackWindow = sameColumnWindows[sourceIndex++];
        const state = candidateStates[stackWindow.windowId];
        state.hSpan = [...targetHSpan];
        state.vSpan = [...slots[slotIndex]];
        updateIndexes(state);
      }
      if (getDragBlockReason(candidateStates, config)) {
        return false;
      }
      for (const [id, nextState] of Object.entries(candidateStates)) {
        if (!statesEqual(states[id], nextState)) {
          states[id] = cloneState(nextState);
          touched.add(id);
        }
      }
      return true;
    };
    const tryRelocateTightVerticalStack = () => {
      const targetWidth = spanSize2(targetHSpan);
      if (targetWidth < minColumnSpan) return false;
      if (spanSize2(targetVSpan) >= gridRows) return false;
      const sameColumnWindows = otherWindows.filter((w) => spansEqual2(states[w.windowId].hSpan, targetHSpan)).sort((a, b) => states[a.windowId].vSpan[0] - states[b.windowId].vSpan[0] || a.windowId.localeCompare(b.windowId));
      const collidingStackWindows = sameColumnWindows.filter((w) => rectsOverlap(states[w.windowId], states[draggedId]));
      if (sameColumnWindows.length === 0 || collidingStackWindows.length === 0) {
        return false;
      }
      const hasPinnedCollision = collidingStackWindows.some(
        (w) => spanSize2(states[w.windowId].hSpan) <= minColumnSpan || spanSize2(states[w.windowId].vSpan) <= minRowSpan
      );
      if (!hasPinnedCollision) return false;
      const stackIds = new Set(sameColumnWindows.map((w) => w.windowId));
      const candidateHSpans = [];
      const leftCandidate = [targetHSpan[0] - targetWidth, targetHSpan[0]];
      const rightCandidate = [targetHSpan[1], targetHSpan[1] + targetWidth];
      if (targetHSpan[1] >= gridColumns) {
        candidateHSpans.push(leftCandidate, rightCandidate);
      } else if (targetHSpan[0] <= 0) {
        candidateHSpans.push(rightCandidate, leftCandidate);
      } else {
        candidateHSpans.push(leftCandidate, rightCandidate);
      }
      const overlapsMovedStack = (candidateStates, state) => {
        for (const stackId of stackIds) {
          if (hasHorizontalOverlap(state.hSpan, candidateStates[stackId].hSpan) && hasVerticalOverlap(state.vSpan, candidateStates[stackId].vSpan)) {
            return true;
          }
        }
        return false;
      };
      const carveAwayFromHSpan = (state, avoidHSpan) => {
        const avoidCenter = spanCenter(avoidHSpan);
        const stateCenter = spanCenter(state.hSpan);
        const candidates = avoidCenter >= stateCenter ? [[state.hSpan[0], avoidHSpan[0]], [avoidHSpan[1], state.hSpan[1]]] : [[avoidHSpan[1], state.hSpan[1]], [state.hSpan[0], avoidHSpan[0]]];
        for (const candidate of candidates) {
          if (candidate[0] >= 0 && candidate[1] <= gridColumns && spanSize2(candidate) >= minColumnSpan) {
            const nextState = cloneState(state);
            nextState.hSpan = candidate;
            updateIndexes(nextState);
            return nextState;
          }
        }
        return null;
      };
      let bestStates = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const [index, candidateHSpan] of candidateHSpans.entries()) {
        if (candidateHSpan[0] < 0 || candidateHSpan[1] > gridColumns) continue;
        const candidateStates = cloneStates(states);
        for (const stackId of stackIds) {
          candidateStates[stackId].hSpan = [...candidateHSpan];
          updateIndexes(candidateStates[stackId]);
        }
        let failed = false;
        for (const [id, state] of Object.entries(candidateStates)) {
          if (id === draggedId || stackIds.has(id)) continue;
          if (!overlapsMovedStack(candidateStates, state)) continue;
          const carved = carveAwayFromHSpan(state, candidateHSpan);
          if (!carved) {
            failed = true;
            break;
          }
          candidateStates[id] = carved;
        }
        if (failed || getDragBlockReason(candidateStates, config)) {
          continue;
        }
        const score = scoreCandidateStates(candidateStates, index);
        if (score < bestScore) {
          bestScore = score;
          bestStates = candidateStates;
        }
      }
      if (bestStates) {
        applyCandidateStates(bestStates);
        return true;
      }
      return false;
    };
    const tryRelocateTightHorizontalStack = () => {
      const targetWidth = spanSize2(targetHSpan);
      if (targetWidth < minColumnSpan) return false;
      if (spanSize2(targetHSpan) >= gridColumns) return false;
      const sameRowWindows = otherWindows.filter((w) => spansEqual2(states[w.windowId].vSpan, targetVSpan)).sort((a, b) => states[a.windowId].hSpan[0] - states[b.windowId].hSpan[0] || a.windowId.localeCompare(b.windowId));
      const collidingRowWindows = sameRowWindows.filter((w) => rectsOverlap(states[w.windowId], states[draggedId]));
      const intentNearLeftEdge = options.intentPoint ? options.intentPoint.h <= 0.65 : false;
      const intentNearRightEdge = options.intentPoint ? options.intentPoint.h >= gridColumns - 0.65 : false;
      const targetTouchesLeftEdge = targetHSpan[0] <= 0;
      const targetTouchesRightEdge = targetHSpan[1] >= gridColumns;
      const isExplicitScreenEdgeInsertion = targetTouchesLeftEdge && intentNearLeftEdge || targetTouchesRightEdge && intentNearRightEdge;
      const isAutoNarrowedScreenEdgeInsertion = Boolean(options.preferredWidth && options.preferredWidth > targetWidth) && (targetTouchesLeftEdge || targetTouchesRightEdge);
      if (sameRowWindows.length < 2 && !isExplicitScreenEdgeInsertion && !isAutoNarrowedScreenEdgeInsertion || collidingRowWindows.length === 0) {
        return false;
      }
      const hasPinnedCollision = collidingRowWindows.some(
        (w) => spanSize2(states[w.windowId].hSpan) <= minColumnSpan || spanSize2(states[w.windowId].vSpan) <= minRowSpan
      );
      if (!hasPinnedCollision) return false;
      const rowIds = new Set(sameRowWindows.map((w) => w.windowId));
      const shifts = [];
      if (targetHSpan[1] >= gridColumns) {
        shifts.push(-targetWidth);
      } else if (targetHSpan[0] <= 0) {
        shifts.push(targetWidth);
      } else {
        const targetCenter = spanCenter(targetHSpan);
        const rowCenter = spanCenter([
          Math.min(...sameRowWindows.map((w) => states[w.windowId].hSpan[0])),
          Math.max(...sameRowWindows.map((w) => states[w.windowId].hSpan[1]))
        ]);
        shifts.push(targetCenter >= rowCenter ? -targetWidth : targetWidth);
        shifts.push(targetCenter >= rowCenter ? targetWidth : -targetWidth);
      }
      let bestStates = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const [index, shift] of shifts.entries()) {
        const candidateStates = cloneStates(states);
        let failed = false;
        for (const rowId of rowIds) {
          const state = candidateStates[rowId];
          const nextHSpan = [state.hSpan[0] + shift, state.hSpan[1] + shift];
          if (nextHSpan[0] < 0 || nextHSpan[1] > gridColumns) {
            failed = true;
            break;
          }
          state.hSpan = nextHSpan;
          updateIndexes(state);
        }
        if (failed || getDragBlockReason(candidateStates, config)) {
          continue;
        }
        const score = scoreCandidateStates(candidateStates, index);
        if (score < bestScore) {
          bestScore = score;
          bestStates = candidateStates;
        }
      }
      if (bestStates) {
        applyCandidateStates(bestStates);
        return true;
      }
      return false;
    };
    const tryCarveEdgeInsertionCorridor = () => {
      if (!options.intentPoint) return false;
      if (spanSize2(targetVSpan) < minRowSpan) return false;
      const targetTouchesLeftEdge = targetHSpan[0] <= 0;
      const targetTouchesRightEdge = targetHSpan[1] >= gridColumns;
      const intentNearLeftEdge = options.intentPoint.h <= 0.65;
      const intentNearRightEdge = options.intentPoint.h >= gridColumns - 0.65;
      const isExplicitScreenEdgeInsertion = targetTouchesLeftEdge && intentNearLeftEdge || targetTouchesRightEdge && intentNearRightEdge;
      const isAutoNarrowedScreenEdgeInsertion = Boolean(options.preferredWidth && options.preferredWidth > spanSize2(targetHSpan)) && (targetTouchesLeftEdge || targetTouchesRightEdge);
      if (!isExplicitScreenEdgeInsertion && !isAutoNarrowedScreenEdgeInsertion) {
        return false;
      }
      if (!targetTouchesLeftEdge && !targetTouchesRightEdge) return false;
      const corridorWidth = spanSize2(targetHSpan);
      const direction = targetTouchesLeftEdge ? 1 : -1;
      let cursorStart = targetTouchesLeftEdge ? targetHSpan[0] : targetHSpan[1] - corridorWidth;
      let cursorEnd = targetTouchesLeftEdge ? targetHSpan[1] : targetHSpan[1];
      const chainIds = /* @__PURE__ */ new Set();
      let donorId = null;
      for (let guard = 0; guard < gridColumns; guard++) {
        const columnWindows = otherWindows.filter((w) => {
          const state = states[w.windowId];
          return state.hSpan[0] === cursorStart && state.hSpan[1] === cursorEnd && hasVerticalOverlap(state.vSpan, targetVSpan);
        }).sort((a, b) => a.windowId.localeCompare(b.windowId));
        if (columnWindows.length === 0) {
          const donorWindow = otherWindows.filter((w) => {
            const state = states[w.windowId];
            if (!hasVerticalOverlap(state.vSpan, targetVSpan)) return false;
            if (spanSize2(state.hSpan) - corridorWidth < minColumnSpan) return false;
            return targetTouchesLeftEdge ? state.hSpan[0] === cursorStart : state.hSpan[1] === cursorEnd;
          }).sort((a, b) => {
            const aSize = spanSize2(states[a.windowId].hSpan);
            const bSize = spanSize2(states[b.windowId].hSpan);
            return bSize - aSize || a.windowId.localeCompare(b.windowId);
          })[0];
          if (donorWindow) {
            donorId = donorWindow.windowId;
          }
          break;
        }
        const columnWidth = cursorEnd - cursorStart;
        if (columnWidth <= corridorWidth) {
          for (const w of columnWindows) {
            chainIds.add(w.windowId);
          }
          cursorStart += direction * corridorWidth;
          cursorEnd += direction * corridorWidth;
          if (cursorStart < 0 || cursorEnd > gridColumns) return false;
          continue;
        }
        if (columnWidth - corridorWidth < minColumnSpan) {
          return false;
        }
        donorId = columnWindows[0].windowId;
        break;
      }
      if (chainIds.size === 0) return false;
      const candidateStates = {};
      for (const [id, state] of Object.entries(states)) {
        candidateStates[id] = cloneState(state);
      }
      for (const id of chainIds) {
        const state = candidateStates[id];
        state.hSpan = [state.hSpan[0] + direction * corridorWidth, state.hSpan[1] + direction * corridorWidth];
        updateIndexes(state);
      }
      if (donorId) {
        const donor = candidateStates[donorId];
        donor.hSpan = targetTouchesLeftEdge ? [donor.hSpan[0] + corridorWidth, donor.hSpan[1]] : [donor.hSpan[0], donor.hSpan[1] - corridorWidth];
        updateIndexes(donor);
      }
      if (getDragBlockReason(candidateStates, config)) {
        return false;
      }
      for (const [id, nextState] of Object.entries(candidateStates)) {
        if (!statesEqual(states[id], nextState)) {
          states[id] = cloneState(nextState);
          touched.add(id);
        }
      }
      return true;
    };
    if (!tryRedistributeVerticalStackInsertion()) {
      tryRelocateTightVerticalStack();
    }
    if (!tryCarveEdgeInsertionCorridor()) {
      tryRelocateTightHorizontalStack();
    }
    const windowsToProcess = otherWindows;
    const pushLeft = (id, rightBoundary) => {
      if (visited.has(id)) return;
      visited.add(id);
      const state = states[id];
      if (!state) return;
      const width = state.hSpan[1] - state.hSpan[0];
      const newEnd = rightBoundary;
      let newStart = Math.min(state.hSpan[0], newEnd - width);
      newStart = Math.max(0, newStart);
      const newEndClamped = Math.max(minColumnSpan, Math.min(newEnd, newStart + width));
      const newStartClamped = Math.max(0, newEndClamped - Math.max(minColumnSpan, width));
      state.hSpan = [newStartClamped, newEndClamped];
      state.hIndex = TilingEngine.spanToHIndex(state.hSpan);
      touched.add(id);
      for (const other of windowsToProcess) {
        if (other.windowId === id) continue;
        const otherState = states[other.windowId];
        if (hasVerticalOverlap(state.vSpan, otherState.vSpan) && otherState.hSpan[1] > state.hSpan[0] && otherState.hSpan[0] < state.hSpan[0]) {
          pushLeft(other.windowId, state.hSpan[0]);
        }
      }
    };
    const pushRight = (id, leftBoundary) => {
      if (visited.has(id)) return;
      visited.add(id);
      const state = states[id];
      if (!state) return;
      const width = state.hSpan[1] - state.hSpan[0];
      const newStart = leftBoundary;
      let newEnd = Math.max(state.hSpan[1], newStart + width);
      newEnd = Math.min(gridColumns, newEnd);
      const newStartClamped = Math.max(0, Math.min(newStart, newEnd - minColumnSpan));
      const newEndClamped = Math.min(gridColumns, newStartClamped + Math.max(minColumnSpan, width));
      state.hSpan = [newStartClamped, newEndClamped];
      state.hIndex = TilingEngine.spanToHIndex(state.hSpan);
      touched.add(id);
      for (const other of windowsToProcess) {
        if (other.windowId === id) continue;
        const otherState = states[other.windowId];
        if (hasVerticalOverlap(state.vSpan, otherState.vSpan) && otherState.hSpan[0] < state.hSpan[1] && otherState.hSpan[1] > state.hSpan[1]) {
          pushRight(other.windowId, state.hSpan[1]);
        }
      }
    };
    const pushUp = (id, bottomBoundary) => {
      if (visited.has(id)) return;
      visited.add(id);
      const state = states[id];
      if (!state) return;
      const height = state.vSpan[1] - state.vSpan[0];
      const newEnd = bottomBoundary;
      let newStart = Math.min(state.vSpan[0], newEnd - height);
      newStart = Math.max(0, newStart);
      const newEndClamped = Math.max(minRowSpan, Math.min(newEnd, newStart + height));
      const newStartClamped = Math.max(0, newEndClamped - Math.max(minRowSpan, height));
      state.vSpan = [newStartClamped, newEndClamped];
      state.vIndex = TilingEngine.spanToVIndex(state.vSpan);
      touched.add(id);
      for (const other of windowsToProcess) {
        if (other.windowId === id) continue;
        const otherState = states[other.windowId];
        if (hasHorizontalOverlap(state.hSpan, otherState.hSpan) && otherState.vSpan[1] > state.vSpan[0] && otherState.vSpan[0] < state.vSpan[0]) {
          pushUp(other.windowId, state.vSpan[0]);
        }
      }
    };
    const pushDown = (id, topBoundary) => {
      if (visited.has(id)) return;
      visited.add(id);
      const state = states[id];
      if (!state) return;
      const height = state.vSpan[1] - state.vSpan[0];
      const newStart = topBoundary;
      let newEnd = Math.max(state.vSpan[1], newStart + height);
      newEnd = Math.min(gridRows, newEnd);
      const newStartClamped = Math.max(0, Math.min(newStart, newEnd - minRowSpan));
      const newEndClamped = Math.min(gridRows, newStartClamped + Math.max(minRowSpan, height));
      state.vSpan = [newStartClamped, newEndClamped];
      state.vIndex = TilingEngine.spanToVIndex(state.vSpan);
      touched.add(id);
      for (const other of windowsToProcess) {
        if (other.windowId === id) continue;
        const otherState = states[other.windowId];
        if (hasHorizontalOverlap(state.hSpan, otherState.hSpan) && otherState.vSpan[0] < state.vSpan[1] && otherState.vSpan[1] > state.vSpan[1]) {
          pushDown(other.windowId, state.vSpan[1]);
        }
      }
    };
    visited.add(draggedId);
    for (const w of windowsToProcess) {
      const state = states[w.windowId];
      if (hasVerticalOverlap(targetVSpan, state.vSpan) && hasHorizontalOverlap(targetHSpan, state.hSpan)) {
        const centerTargetX = (targetHSpan[0] + targetHSpan[1]) / 2;
        const centerTargetY = (targetVSpan[0] + targetVSpan[1]) / 2;
        const centerWindowX = (state.hSpan[0] + state.hSpan[1]) / 2;
        const centerWindowY = (state.vSpan[0] + state.vSpan[1]) / 2;
        const dx = centerWindowX - centerTargetX;
        const dy = centerWindowY - centerTargetY;
        const carved = carveAwayFromTarget(w.windowId);
        if (carved) {
          continue;
        }
        if (Math.abs(dx) >= Math.abs(dy)) {
          if (dx < 0) {
            pushLeft(w.windowId, targetHSpan[0]);
          } else {
            pushRight(w.windowId, targetHSpan[1]);
          }
        } else {
          if (dy < 0) {
            pushUp(w.windowId, targetVSpan[0]);
          } else {
            pushDown(w.windowId, targetVSpan[1]);
          }
        }
      }
    }
    sanitizeTouchedOverlaps();
    return states;
  }
  function compareWindowsByGridPosition(a, b) {
    return a.state.vSpan[0] - b.state.vSpan[0] || a.state.hSpan[0] - b.state.hSpan[0] || a.state.vSpan[1] - b.state.vSpan[1] || a.state.hSpan[1] - b.state.hSpan[1] || a.windowId.localeCompare(b.windowId);
  }
  function collapseVacancy(vacantId, config, activeWindows) {
    const states = {};
    const gridColumns = getGridColumns(config);
    const gridRows = getGridRows(config);
    const minColumnSpan = getMinColumnSpan(config);
    const minRowSpan = getMinRowSpan(config);
    const vacantWin = activeWindows.find((w) => w.windowId === vacantId);
    if (!vacantWin) {
      for (const w of activeWindows) {
        states[w.windowId] = {
          hIndex: w.state.hIndex,
          vIndex: w.state.vIndex,
          hSpan: [...w.state.hSpan || [0, gridColumns]],
          vSpan: [...w.state.vSpan || [0, gridRows]],
          lastDirection: w.state.lastDirection
        };
      }
      return states;
    }
    const vacantHSpan = vacantWin.state.hSpan;
    const vacantVSpan = vacantWin.state.vSpan;
    const otherWindows = activeWindows.filter((w) => w.windowId !== vacantId).sort(compareWindowsByGridPosition);
    for (const w of otherWindows) {
      states[w.windowId] = {
        hIndex: w.state.hIndex,
        vIndex: w.state.vIndex,
        hSpan: [...w.state.hSpan || [0, gridColumns]],
        vSpan: [...w.state.vSpan || [0, gridRows]],
        lastDirection: w.state.lastDirection
      };
    }
    const hasVerticalOverlap = (spanA, spanB) => {
      return Math.max(spanA[0], spanB[0]) < Math.min(spanA[1], spanB[1]);
    };
    const hasHorizontalOverlap = (spanA, spanB) => {
      return Math.max(spanA[0], spanB[0]) < Math.min(spanA[1], spanB[1]);
    };
    const overlapSize = (spanA, spanB) => {
      return Math.max(0, Math.min(spanA[1], spanB[1]) - Math.max(spanA[0], spanB[0]));
    };
    const spanSize2 = (span) => span[1] - span[0];
    const spansEqual2 = (spanA, spanB) => {
      return spanA[0] === spanB[0] && spanA[1] === spanB[1];
    };
    const covers = (container, inner) => {
      return container[0] <= inner[0] && container[1] >= inner[1];
    };
    const wouldOverlap = (id, hSpan, vSpan) => {
      for (const other of otherWindows) {
        if (other.windowId === id) continue;
        const s = states[other.windowId];
        if (hasHorizontalOverlap(hSpan, s.hSpan) && hasVerticalOverlap(vSpan, s.vSpan)) {
          return true;
        }
      }
      return false;
    };
    const applyCandidate = (id, hSpan, vSpan) => {
      const s = states[id];
      s.hSpan = hSpan;
      s.vSpan = vSpan;
      s.hIndex = TilingEngine.spanToHIndex(hSpan);
      s.vIndex = TilingEngine.spanToVIndex(vSpan);
    };
    const sameColumnWindows = otherWindows.filter((w) => spansEqual2(states[w.windowId].hSpan, vacantHSpan));
    const prefersVerticalStackCollapse = spanSize2(vacantHSpan) <= minColumnSpan || sameColumnWindows.length >= 2;
    if (prefersVerticalStackCollapse && sameColumnWindows.length > 0) {
      const stackEntries = [
        { id: vacantId, vSpan: vacantVSpan, vacant: true },
        ...sameColumnWindows.map((w) => ({
          id: w.windowId,
          vSpan: states[w.windowId].vSpan,
          vacant: false
        }))
      ].sort((a, b) => a.vSpan[0] - b.vSpan[0] || a.id.localeCompare(b.id));
      const vacantIndex = stackEntries.findIndex((entry) => entry.vacant);
      let startIndex = vacantIndex;
      let endIndex = vacantIndex;
      while (startIndex > 0 && Math.abs(stackEntries[startIndex - 1].vSpan[1] - stackEntries[startIndex].vSpan[0]) <= 1) {
        startIndex--;
      }
      while (endIndex < stackEntries.length - 1 && Math.abs(stackEntries[endIndex].vSpan[1] - stackEntries[endIndex + 1].vSpan[0]) <= 1) {
        endIndex++;
      }
      const connectedStack = stackEntries.slice(startIndex, endIndex + 1);
      const remainingStack = connectedStack.filter((entry) => !entry.vacant);
      const stackStart = Math.min(...connectedStack.map((entry) => entry.vSpan[0]));
      const stackEnd = Math.max(...connectedStack.map((entry) => entry.vSpan[1]));
      const stackHeight = stackEnd - stackStart;
      if (remainingStack.length > 0 && stackHeight >= remainingStack.length * minRowSpan) {
        const previousStackStates = remainingStack.map((entry) => ({
          id: entry.id,
          hSpan: [...states[entry.id].hSpan],
          vSpan: [...states[entry.id].vSpan]
        }));
        for (let i = 0; i < remainingStack.length; i++) {
          const nextStart = stackStart + Math.round(stackHeight * i / remainingStack.length);
          const nextEnd = stackStart + Math.round(stackHeight * (i + 1) / remainingStack.length);
          applyCandidate(remainingStack[i].id, [...vacantHSpan], [nextStart, nextEnd]);
        }
        if (!hasLayoutOverlaps(states)) {
          return states;
        }
        for (const previous of previousStackStates) {
          applyCandidate(previous.id, previous.hSpan, previous.vSpan);
        }
      }
    }
    const candidates = [];
    for (const w of otherWindows) {
      const s = states[w.windowId];
      if (hasVerticalOverlap(vacantVSpan, s.vSpan) && Math.abs(s.hSpan[1] - vacantHSpan[0]) <= 1) {
        candidates.push({
          id: w.windowId,
          priority: 100 + overlapSize(vacantVSpan, s.vSpan),
          fullHSpan: [s.hSpan[0], vacantHSpan[1]],
          fullVSpan: s.vSpan,
          partialHSpan: covers(s.vSpan, vacantVSpan) ? [s.hSpan[0], vacantHSpan[1]] : void 0,
          partialVSpan: covers(s.vSpan, vacantVSpan) ? [...vacantVSpan] : void 0
        });
      }
      if (hasVerticalOverlap(vacantVSpan, s.vSpan) && Math.abs(s.hSpan[0] - vacantHSpan[1]) <= 1) {
        candidates.push({
          id: w.windowId,
          priority: 100 + overlapSize(vacantVSpan, s.vSpan),
          fullHSpan: [vacantHSpan[0], s.hSpan[1]],
          fullVSpan: s.vSpan,
          partialHSpan: covers(s.vSpan, vacantVSpan) ? [vacantHSpan[0], s.hSpan[1]] : void 0,
          partialVSpan: covers(s.vSpan, vacantVSpan) ? [...vacantVSpan] : void 0
        });
      }
      if (hasHorizontalOverlap(vacantHSpan, s.hSpan) && Math.abs(s.vSpan[1] - vacantVSpan[0]) <= 1) {
        const isSameColumnStackNeighbor = prefersVerticalStackCollapse && spansEqual2(s.hSpan, vacantHSpan);
        candidates.push({
          id: w.windowId,
          priority: (isSameColumnStackNeighbor ? 200 : 0) + overlapSize(vacantHSpan, s.hSpan),
          fullHSpan: s.hSpan,
          fullVSpan: [s.vSpan[0], vacantVSpan[1]]
        });
      }
      if (hasHorizontalOverlap(vacantHSpan, s.hSpan) && Math.abs(s.vSpan[0] - vacantVSpan[1]) <= 1) {
        const isSameColumnStackNeighbor = prefersVerticalStackCollapse && spansEqual2(s.hSpan, vacantHSpan);
        candidates.push({
          id: w.windowId,
          priority: (isSameColumnStackNeighbor ? 200 : 0) + overlapSize(vacantHSpan, s.hSpan),
          fullHSpan: s.hSpan,
          fullVSpan: [vacantVSpan[0], s.vSpan[1]]
        });
      }
    }
    candidates.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    for (const candidate of candidates) {
      if (!wouldOverlap(candidate.id, candidate.fullHSpan, candidate.fullVSpan)) {
        applyCandidate(candidate.id, candidate.fullHSpan, candidate.fullVSpan);
        return states;
      }
      if (candidate.partialHSpan && candidate.partialVSpan && !wouldOverlap(candidate.id, candidate.partialHSpan, candidate.partialVSpan)) {
        applyCandidate(candidate.id, candidate.partialHSpan, candidate.partialVSpan);
        return states;
      }
    }
    return states;
  }

  // src/extension.ts
  var Settings = imports.ui.settings;
  var Main2 = imports.ui.main;
  var Meta3 = imports.gi.Meta;
  var Clutter2 = imports.gi.Clutter;
  var DynamicTilerExtension = class {
    constructor(metadata) {
      __publicField(this, "metadata");
      __publicField(this, "settings");
      __publicField(this, "shell");
      __publicField(this, "cache");
      __publicField(this, "configProvider");
      __publicField(this, "useCase");
      __publicField(this, "bindings", {});
      // Settings values automatically bound by Cinnamon settings system
      __publicField(this, "gaps");
      __publicField(this, "gridSize");
      __publicField(this, "gridColumns");
      __publicField(this, "gridRows");
      __publicField(this, "horizontalGridColumns");
      __publicField(this, "horizontalGridRows");
      __publicField(this, "verticalGridColumns");
      __publicField(this, "verticalGridRows");
      __publicField(this, "ultrawideGridColumns");
      __publicField(this, "ultrawideGridRows");
      __publicField(this, "monitorGridOverrides");
      __publicField(this, "minSpan");
      __publicField(this, "minColumnSpan");
      __publicField(this, "minRowSpan");
      __publicField(this, "step");
      __publicField(this, "enablePreview");
      __publicField(this, "enableDebugLogs");
      __publicField(this, "enable-dnd-tiling");
      __publicField(this, "dnd-modifier-key");
      __publicField(this, "dnd-swap-modifier-key");
      __publicField(this, "experimentalSwapSameShapeWindows");
      __publicField(this, "keybinding-tile-left");
      __publicField(this, "keybinding-tile-right");
      __publicField(this, "keybinding-tile-up");
      __publicField(this, "keybinding-tile-down");
      __publicField(this, "keybinding-shift-left");
      __publicField(this, "keybinding-shift-right");
      __publicField(this, "keybinding-shift-up");
      __publicField(this, "keybinding-shift-down");
      __publicField(this, "keybinding-restore");
      // DnD State tracking
      __publicField(this, "grabBeginId", 0);
      __publicField(this, "grabEndId", 0);
      __publicField(this, "draggedWindow", null);
      __publicField(this, "draggedWindowId", "");
      __publicField(this, "dragTimerId", 0);
      __publicField(this, "previewsMap", {});
      __publicField(this, "lastDragStates", null);
      __publicField(this, "lastDragMonitor", null);
      __publicField(this, "dragOffsetX", 0);
      __publicField(this, "dragOffsetY", 0);
      __publicField(this, "dragSession", null);
      __publicField(this, "vacancyPreview", null);
      __publicField(this, "blockedPreview", null);
      __publicField(this, "dndTransactions", []);
      __publicField(this, "lastDndDebugSignature", "");
      __publicField(this, "lastDragTarget", null);
      this.metadata = metadata;
      this.shell = new CinnamonShellAdapter(this);
      this.cache = new CinnamonCache();
      this.configProvider = new CinnamonConfigProvider(this);
      this.useCase = new TilingUseCase(this.shell, this.cache, this.configProvider);
    }
    getConfigForMonitor(monitor) {
      const fallbackGrid = this.gridSize !== void 0 ? this.gridSize : 12;
      const baseColumns = this.gridColumns !== void 0 ? this.gridColumns : fallbackGrid;
      const baseRows = this.gridRows !== void 0 ? this.gridRows : 6;
      let gridColumns = baseColumns;
      let gridRows = baseRows;
      if (monitor) {
        const ratio = monitor.workarea.width / Math.max(1, monitor.workarea.height);
        if (ratio >= 2.1) {
          gridColumns = this.ultrawideGridColumns !== void 0 ? this.ultrawideGridColumns : 12;
          gridRows = this.ultrawideGridRows !== void 0 ? this.ultrawideGridRows : 6;
        } else if (monitor.workarea.height > monitor.workarea.width) {
          gridColumns = this.verticalGridColumns !== void 0 ? this.verticalGridColumns : gridColumns;
          gridRows = this.verticalGridRows !== void 0 ? this.verticalGridRows : gridRows;
        } else {
          gridColumns = this.horizontalGridColumns !== void 0 ? this.horizontalGridColumns : 6;
          gridRows = this.horizontalGridRows !== void 0 ? this.horizontalGridRows : 6;
        }
        const override = this.getMonitorGridOverride(String(monitor.id));
        if (override) {
          gridColumns = override.columns;
          gridRows = override.rows;
        }
      }
      const minSpan = this.minSpan !== void 0 ? this.minSpan : 2;
      return {
        gridSize: Math.max(gridColumns, gridRows),
        gridColumns,
        gridRows,
        minSpan,
        minColumnSpan: this.minColumnSpan !== void 0 ? this.minColumnSpan : minSpan,
        minRowSpan: this.minRowSpan !== void 0 ? this.minRowSpan : minSpan,
        step: this.step !== void 0 ? this.step : 1,
        gaps: this.gaps !== void 0 ? this.gaps : 8
      };
    }
    getMonitorGridOverride(monitorId) {
      const raw = (this.monitorGridOverrides || "").trim();
      if (!raw) return null;
      const entries = raw.split(/[,\n;]/).map((part) => part.trim()).filter(Boolean);
      for (const entry of entries) {
        const match = entry.match(/^([^:=\s]+)\s*[:=]\s*(\d+)\s*x\s*(\d+)$/i);
        if (!match || match[1] !== monitorId) continue;
        const columns = parseInt(match[2], 10);
        const rows = parseInt(match[3], 10);
        if (columns >= 2 && rows >= 2) {
          return { columns, rows };
        }
      }
      return null;
    }
    debugLog(message) {
      if (this.enableDebugLogs === true) {
        global.log(message);
      }
    }
    enable() {
      try {
        this.settings = new Settings.ExtensionSettings(this, this.metadata.uuid, this.metadata.uuid);
        this.settings.bindProperty(Settings.BindingDirection.IN, "gaps", "gaps", () => {
          this.applyConfigurationChange();
        });
        this.settings.bindProperty(Settings.BindingDirection.IN, "gridSize", "gridSize", () => {
          this.applyConfigurationChange();
        });
        this.settings.bindProperty(Settings.BindingDirection.IN, "gridColumns", "gridColumns", () => {
          this.applyConfigurationChange();
        });
        this.settings.bindProperty(Settings.BindingDirection.IN, "gridRows", "gridRows", () => {
          this.applyConfigurationChange();
        });
        this.settings.bindProperty(Settings.BindingDirection.IN, "horizontalGridColumns", "horizontalGridColumns", () => {
          this.applyConfigurationChange();
        });
        this.settings.bindProperty(Settings.BindingDirection.IN, "horizontalGridRows", "horizontalGridRows", () => {
          this.applyConfigurationChange();
        });
        this.settings.bindProperty(Settings.BindingDirection.IN, "verticalGridColumns", "verticalGridColumns", () => {
          this.applyConfigurationChange();
        });
        this.settings.bindProperty(Settings.BindingDirection.IN, "verticalGridRows", "verticalGridRows", () => {
          this.applyConfigurationChange();
        });
        this.settings.bindProperty(Settings.BindingDirection.IN, "ultrawideGridColumns", "ultrawideGridColumns", () => {
          this.applyConfigurationChange();
        });
        this.settings.bindProperty(Settings.BindingDirection.IN, "ultrawideGridRows", "ultrawideGridRows", () => {
          this.applyConfigurationChange();
        });
        this.settings.bindProperty(Settings.BindingDirection.IN, "monitorGridOverrides", "monitorGridOverrides", () => {
          this.applyConfigurationChange();
        });
        this.settings.bindProperty(Settings.BindingDirection.IN, "minSpan", "minSpan", () => {
          this.applyConfigurationChange();
        });
        this.settings.bindProperty(Settings.BindingDirection.IN, "minColumnSpan", "minColumnSpan", () => {
          this.applyConfigurationChange();
        });
        this.settings.bindProperty(Settings.BindingDirection.IN, "minRowSpan", "minRowSpan", () => {
          this.applyConfigurationChange();
        });
        this.settings.bindProperty(Settings.BindingDirection.IN, "step", "step", () => {
          this.applyConfigurationChange();
        });
        this.settings.bindProperty(Settings.BindingDirection.IN, "enablePreview", "enablePreview", () => {
        });
        this.settings.bindProperty(Settings.BindingDirection.IN, "enableDebugLogs", "enableDebugLogs", () => {
        });
        this.settings.bindProperty(Settings.BindingDirection.IN, "enable-dnd-tiling", "enable-dnd-tiling", () => {
        });
        this.settings.bindProperty(Settings.BindingDirection.IN, "dnd-modifier-key", "dnd-modifier-key", () => {
        });
        this.settings.bindProperty(Settings.BindingDirection.IN, "dnd-swap-modifier-key", "dnd-swap-modifier-key", () => {
        });
        this.settings.bindProperty(Settings.BindingDirection.IN, "experimentalSwapSameShapeWindows", "experimentalSwapSameShapeWindows", () => {
        });
        this.registerKeybinding("keybinding-tile-left", "left");
        this.registerKeybinding("keybinding-tile-right", "right");
        this.registerKeybinding("keybinding-tile-up", "up");
        this.registerKeybinding("keybinding-tile-down", "down");
        this.registerKeybinding("keybinding-shift-left", "shift-left");
        this.registerKeybinding("keybinding-shift-right", "shift-right");
        this.registerKeybinding("keybinding-shift-up", "shift-up");
        this.registerKeybinding("keybinding-shift-down", "shift-down");
        this.registerKeybinding("keybinding-restore", "restore");
        this.grabBeginId = global.display.connect("grab-op-begin", (...args) => {
          let window = global.display.focus_window;
          let op = null;
          if (args.length === 4) {
            window = args[2];
            op = args[3];
          } else if (args.length === 3) {
            window = args[1];
            op = args[2];
          } else if (args.length === 2) {
            op = args[1];
          } else {
            op = args[args.length - 1];
          }
          this.onGrabBegin(window, op);
        });
        this.grabEndId = global.display.connect("grab-op-end", () => {
          this.onGrabEnd();
        });
        try {
          const monitors = this.shell.getActiveMonitors();
          const activeMonitor = monitors[0];
          const config = this.getConfigForMonitor(activeMonitor);
          this.indexAllWindows(activeMonitor, config, monitors, true);
          this.debugLog(`[Dynamic Tiler] Initial window indexing completed`);
        } catch (err) {
          global.logError(`[Dynamic Tiler] Initial indexing error: ${err.message}`);
        }
        this.debugLog(`[Dynamic Tiler] Extension enabled and hooks registered successfully`);
      } catch (e) {
        global.logError(`[Dynamic Tiler] Failed to enable extension: ${e}`);
      }
    }
    disable() {
      try {
        if (this.grabBeginId) {
          global.display.disconnect(this.grabBeginId);
          this.grabBeginId = 0;
        }
        if (this.grabEndId) {
          global.display.disconnect(this.grabEndId);
          this.grabEndId = 0;
        }
        this.stopDragTimer();
        this.clearPreviews();
        for (const key of Object.keys(this.bindings)) {
          Main2.keybindingManager.removeHotKey(key);
        }
        this.bindings = {};
        if (this.settings) {
          this.settings.finalize();
        }
        this.debugLog(`[Dynamic Tiler] Extension disabled successfully`);
      } catch (e) {
        global.logError(`[Dynamic Tiler] Failed to disable extension: ${e}`);
      }
    }
    onGrabBegin(window, op) {
      const enableDnd = this["enable-dnd-tiling"] !== false;
      if (!enableDnd) return;
      const isMoving = op === Meta3.GrabOp.MOVING || op === Meta3.GrabOp.KEYBOARD_MOVING || typeof op === "number" && op === 3;
      if (!isMoving) {
        return;
      }
      const win = window || global.display.focus_window;
      if (win) {
        this.draggedWindow = win;
        this.draggedWindowId = win.get_stable_sequence().toString();
        this.lastDragStates = null;
        this.lastDragMonitor = null;
        this.lastDndDebugSignature = "";
        this.lastDragTarget = null;
        const cached = this.cache.getCachedWindow(this.draggedWindowId);
        const monitors = this.shell.getActiveMonitors();
        const geom = this.shell.getWindowGeometry(this.draggedWindowId);
        const activeMonitor = this.shell.findMonitorForWindow(geom, monitors);
        this.dragSession = {
          draggedWindowId: this.draggedWindowId,
          sourceMonitor: activeMonitor,
          wasTiled: cached !== null,
          sourceState: cached ? { ...cached.state } : null,
          sourceGeometry: cached ? { ...cached.originalGeometry } : { ...geom },
          sourceTiledGeometry: cached ? { ...cached.tiledGeometry } : null,
          startPointerX: 0,
          startPointerY: 0,
          lastDragStates: null,
          lastDragBeforeStates: null,
          lastDragAffected: [],
          cancelled: false,
          floated: false,
          dndEngaged: false
        };
        try {
          const [mx, my] = global.get_pointer();
          this.dragSession.startPointerX = mx;
          this.dragSession.startPointerY = my;
          this.dragOffsetX = mx - geom.x;
          this.dragOffsetY = my - geom.y;
        } catch (err) {
          this.dragSession.startPointerX = geom.x + Math.round(geom.width / 2);
          this.dragSession.startPointerY = geom.y + Math.round(geom.height / 2);
          this.dragOffsetX = 0;
          this.dragOffsetY = 0;
        }
        this.debugLog(`[Dynamic Tiler] Window drag started: ID ${this.draggedWindowId}, Op: ${op}, Offset: ${this.dragOffsetX}, ${this.dragOffsetY}, WasTiled: ${this.dragSession.wasTiled}`);
        try {
          const config = this.getConfigForMonitor(activeMonitor);
          this.indexAllWindows(activeMonitor, config, monitors);
        } catch (err) {
          global.logError(`[Dynamic Tiler] DnD Pre-indexing error: ${err.message}`);
        }
        this.stopDragTimer();
        this.dragTimerId = imports.mainloop.timeout_add(30, () => {
          return this.onDragUpdate();
        });
      }
    }
    indexAllWindows(activeMonitor, config, monitors, forceAddNew = false) {
      const visibleWindowIds = this.shell.getVisibleWindowIds();
      const visibleSet = new Set(visibleWindowIds);
      const allCached = this.cache.getAllCachedWindows();
      for (const id of Object.keys(allCached)) {
        if (!visibleSet.has(id)) {
          this.cache.clearState(id);
        }
      }
      const confirmedSpansMap = {};
      for (const id of visibleWindowIds) {
        if (id === this.draggedWindowId) continue;
        const cached = this.cache.getCachedWindow(id);
        if (!cached && !forceAddNew) {
          continue;
        }
        try {
          const currentGeom = this.shell.getWindowGeometry(id);
          const ext = this.shell.getFrameExtents(id);
          const currentVisible = {
            x: currentGeom.x + ext.left,
            y: currentGeom.y + ext.top,
            width: currentGeom.width - ext.left - ext.right,
            height: currentGeom.height - ext.top - ext.bottom
          };
          const currentMonitor = this.shell.findMonitorForWindow(currentVisible, monitors);
          const currentConfig = this.getConfigForMonitor(currentMonitor);
          const gridColumns = getGridColumns(currentConfig);
          const gridRows = getGridRows(currentConfig);
          const minColumnSpan = getMinColumnSpan(currentConfig);
          const minRowSpan = getMinRowSpan(currentConfig);
          let hSpan = [0, gridColumns];
          let vSpan = [0, gridRows];
          let isResting = false;
          if (cached) {
            const diffX = Math.abs(currentVisible.x - cached.tiledGeometry.x);
            const diffY = Math.abs(currentVisible.y - cached.tiledGeometry.y);
            const diffW = Math.abs(currentVisible.width - cached.tiledGeometry.width);
            const diffH = Math.abs(currentVisible.height - cached.tiledGeometry.height);
            const cachedFitsGrid = cached.state.hSpan[0] >= 0 && cached.state.hSpan[1] <= gridColumns && cached.state.vSpan[0] >= 0 && cached.state.vSpan[1] <= gridRows;
            const MATCH_THRESHOLD = 40;
            if (cachedFitsGrid && diffX <= MATCH_THRESHOLD && diffY <= MATCH_THRESHOLD && diffW <= MATCH_THRESHOLD && diffH <= MATCH_THRESHOLD) {
              hSpan = cached.state.hSpan;
              vSpan = cached.state.vSpan;
              isResting = true;
            }
          }
          if (!isResting) {
            hSpan = TilingEngine.geometryToHSpan(currentVisible, currentMonitor, currentConfig);
            vSpan = TilingEngine.geometryToVSpan(currentVisible, currentMonitor, currentConfig);
            if (hSpan[1] - hSpan[0] < minColumnSpan) {
              const center = Math.round((hSpan[0] + hSpan[1]) / 2);
              hSpan[0] = Math.max(0, center - Math.floor(minColumnSpan / 2));
              hSpan[1] = Math.min(gridColumns, hSpan[0] + minColumnSpan);
              hSpan[0] = Math.max(0, hSpan[1] - minColumnSpan);
            }
            if (vSpan[1] - vSpan[0] < minRowSpan) {
              const center = Math.round((vSpan[0] + vSpan[1]) / 2);
              vSpan[0] = Math.max(0, center - Math.floor(minRowSpan / 2));
              vSpan[1] = Math.min(gridRows, vSpan[0] + minRowSpan);
              vSpan[0] = Math.max(0, vSpan[1] - minRowSpan);
            }
          }
          if (!cached && forceAddNew) {
            const candidateState = {
              hIndex: TilingEngine.spanToHIndex(hSpan),
              vIndex: TilingEngine.spanToVIndex(vSpan),
              hSpan,
              vSpan,
              lastDirection: null
            };
            const snappedGeom = TilingEngine.stateToGeometry(candidateState, currentMonitor, currentConfig);
            const diffX = Math.abs(currentVisible.x - snappedGeom.x);
            const diffY = Math.abs(currentVisible.y - snappedGeom.y);
            const diffW = Math.abs(currentVisible.width - snappedGeom.width);
            const diffH = Math.abs(currentVisible.height - snappedGeom.height);
            const STARTUP_INDEX_THRESHOLD = 40;
            if (diffX > STARTUP_INDEX_THRESHOLD || diffY > STARTUP_INDEX_THRESHOLD || diffW > STARTUP_INDEX_THRESHOLD || diffH > STARTUP_INDEX_THRESHOLD) {
              continue;
            }
          }
          let hasOverlap = false;
          const confirmed = confirmedSpansMap[currentMonitor.id] || [];
          for (const span of confirmed) {
            const hasH = Math.max(hSpan[0], span.hSpan[0]) < Math.min(hSpan[1], span.hSpan[1]);
            const hasV = Math.max(vSpan[0], span.vSpan[0]) < Math.min(vSpan[1], span.vSpan[1]);
            if (hasH && hasV) {
              hasOverlap = true;
              break;
            }
          }
          if (hasOverlap) {
            if (cached) {
              this.cache.clearState(id);
              this.debugLog(`[Dynamic Tiler] Cache Sanitation: Stripped overlapping window ${id} from cache`);
            }
            continue;
          }
          if (!confirmedSpansMap[currentMonitor.id]) {
            confirmedSpansMap[currentMonitor.id] = [];
          }
          confirmedSpansMap[currentMonitor.id].push({ hSpan, vSpan });
          if (isResting) {
            continue;
          }
          const restoredState = {
            hIndex: TilingEngine.spanToHIndex(hSpan),
            vIndex: TilingEngine.spanToVIndex(vSpan),
            hSpan,
            vSpan,
            lastDirection: null
          };
          const originalGeom = cached ? cached.originalGeometry : currentGeom;
          this.cache.saveState(id, restoredState, currentVisible, originalGeom);
          this.debugLog(`[Dynamic Tiler] Auto-indexed window ${id} to cell [${hSpan.join(",")}] x [${vSpan.join(",")}]`);
        } catch (e) {
        }
      }
    }
    onDragUpdate() {
      if (!this.draggedWindowId) return false;
      try {
        const [mx, my, mods] = global.get_pointer();
        const isModifierPressed = this.isConfiguredModifierPressed(this["dnd-modifier-key"], "<Control>d", mods);
        const isSwapModifierPressed = this.experimentalSwapSameShapeWindows === true && this.isConfiguredModifierPressed(this["dnd-swap-modifier-key"], "<Control><Shift>d", mods);
        if (!isModifierPressed && !isSwapModifierPressed) {
          if (this.dragSession && (this.dragSession.lastDragStates || this.dragSession.dndEngaged && !this.dragSession.floated)) {
            const shouldExtract = this.dragSession.wasTiled === true && this.dragSession.sourceTiledGeometry && shouldFloatAfterModifierRelease({
              pointerX: mx,
              pointerY: my,
              startPointerX: this.dragSession.startPointerX,
              startPointerY: this.dragSession.startPointerY
            });
            this.clearPreviews();
            this.dragSession.lastDragStates = null;
            this.dragSession.lastDragBeforeStates = null;
            this.dragSession.lastDragAffected = [];
            this.dragSession.floated = shouldExtract === true;
            this.dragSession.cancelled = !this.dragSession.floated;
            this.dragSession.dndEngaged = false;
            this.lastDragStates = null;
            try {
              const win = this.shell._findMetaWindow(this.draggedWindowId);
              if (win && this.dragSession.sourceGeometry) {
                const orig = this.dragSession.sourceGeometry;
                this.shell.unmaximizeWindow(this.draggedWindowId);
                const nextX = mx - Math.round(orig.width / 2);
                const nextY = my - 15;
                win.move_resize_frame(true, nextX, nextY, orig.width, orig.height);
                this.dragOffsetX = Math.round(orig.width / 2);
                this.dragOffsetY = 15;
              }
            } catch (err) {
            }
            if (shouldExtract && this.dragSession.sourceTiledGeometry) {
              try {
                if (!this.vacancyPreview) {
                  this.vacancyPreview = new TilePreview();
                }
                const win = this.shell._findMetaWindow(this.draggedWindowId);
                if (win) {
                  const sourceMonitorIndex = parseInt(this.dragSession.sourceMonitor.id);
                  this.vacancyPreview.show(win, this.dragSession.sourceTiledGeometry, sourceMonitorIndex, true, 80, 60, true);
                }
              } catch (err) {
              }
            }
          } else {
            this.clearPreviews();
          }
          this.lastDragStates = null;
          this.lastDragMonitor = null;
          this.lastDragTarget = null;
          return true;
        }
        const monitors = this.shell.getActiveMonitors();
        const previousDragMonitorId = this.lastDragMonitor ? String(this.lastDragMonitor.id) : null;
        let activeMonitor = monitors[0];
        for (const m of monitors) {
          if (mx >= m.workarea.x && mx < m.workarea.x + m.workarea.width && my >= m.workarea.y && my < m.workarea.y + m.workarea.height) {
            activeMonitor = m;
            break;
          }
        }
        if (previousDragMonitorId !== null && previousDragMonitorId !== String(activeMonitor.id)) {
          this.lastDragTarget = null;
        }
        this.lastDragMonitor = activeMonitor;
        if (this.dragSession) {
          this.dragSession.targetMonitor = activeMonitor;
        }
        const config = this.getConfigForMonitor(activeMonitor);
        const gridColumns = getGridColumns(config);
        const gridRows = getGridRows(config);
        const minColumnSpan = getMinColumnSpan(config);
        const minRowSpan = getMinRowSpan(config);
        let windowWidth = Math.round(gridColumns / 2);
        let windowHeight = gridRows;
        let windowSizeSource = "fallback";
        if (this.dragSession && this.dragSession.wasTiled && this.dragSession.sourceState) {
          windowWidth = this.dragSession.sourceState.hSpan[1] - this.dragSession.sourceState.hSpan[0];
          windowHeight = this.dragSession.sourceState.vSpan[1] - this.dragSession.sourceState.vSpan[0];
          windowSizeSource = "source-state";
        } else {
          try {
            const geom = this.shell.getWindowGeometry(this.draggedWindowId);
            const hSpan = TilingEngine.geometryToHSpan(geom, activeMonitor, config);
            const vSpan = TilingEngine.geometryToVSpan(geom, activeMonitor, config);
            windowWidth = Math.max(minColumnSpan, hSpan[1] - hSpan[0]);
            windowHeight = Math.max(minRowSpan, vSpan[1] - vSpan[0]);
            windowSizeSource = "current-geometry";
          } catch (e) {
            try {
              if (!this.dragSession || !this.dragSession.sourceGeometry) throw e;
              const hSpan = TilingEngine.geometryToHSpan(this.dragSession.sourceGeometry, activeMonitor, config);
              const vSpan = TilingEngine.geometryToVSpan(this.dragSession.sourceGeometry, activeMonitor, config);
              windowWidth = Math.max(minColumnSpan, hSpan[1] - hSpan[0]);
              windowHeight = Math.max(minRowSpan, vSpan[1] - vSpan[0]);
              windowSizeSource = "source-geometry";
            } catch {
              windowWidth = Math.round(gridColumns / 2);
              windowHeight = Math.round(gridRows / 2);
              windowSizeSource = "fallback";
            }
          }
        }
        const visibleWindowIds = this.shell.getVisibleWindowIds();
        const activeWindowsOnMonitor = [];
        for (const id of visibleWindowIds) {
          let state = null;
          let cachedWin = this.cache.getCachedWindow(id);
          if (id === this.draggedWindowId) {
            if (this.dragSession && this.dragSession.wasTiled && this.dragSession.sourceState) {
              state = this.dragSession.sourceState;
            } else {
              continue;
            }
          } else {
            if (cachedWin) {
              state = cachedWin.state;
            }
          }
          if (!state) continue;
          let currentMonitor = activeMonitor;
          if (id !== this.draggedWindowId) {
            try {
              const geom = this.shell.getWindowGeometry(id);
              currentMonitor = this.shell.findMonitorForWindow(geom, monitors);
            } catch {
              if (cachedWin) {
                currentMonitor = this.shell.findMonitorForWindow(cachedWin.tiledGeometry, monitors);
              }
            }
          }
          if (currentMonitor.id === activeMonitor.id) {
            activeWindowsOnMonitor.push({
              windowId: id,
              state
            });
          }
        }
        const dragTarget = computeDragTarget({
          draggedId: this.draggedWindowId,
          mx,
          my,
          monitor: activeMonitor,
          config,
          preferredWidth: windowWidth,
          preferredHeight: windowHeight,
          activeWindows: activeWindowsOnMonitor,
          previousTarget: this.lastDragTarget
        });
        if (this.dragSession && this.dragSession.wasTiled && this.dragSession.sourceMonitor && String(this.dragSession.sourceMonitor.id) === String(activeMonitor.id) && !isSwapModifierPressed && shouldCancelSourceReturn(this.dragSession.sourceState, dragTarget.targetHSpan, dragTarget.targetVSpan, dragTarget.intentPoint)) {
          const sourceState = this.dragSession.sourceState;
          const signature = `source-return:${this.draggedWindowId}:${sourceState.hSpan.join("-")}x${sourceState.vSpan.join("-")}:target=${dragTarget.targetHSpan.join("-")}x${dragTarget.targetVSpan.join("-")}:intent=${dragTarget.intentPoint.h.toFixed(2)},${dragTarget.intentPoint.v.toFixed(2)}`;
          if (signature !== this.lastDndDebugSignature) {
            this.lastDndDebugSignature = signature;
            this.debugLog(`[Dynamic Tiler] DnD source-return cancel dragged=${this.draggedWindowId} source=${sourceState.hSpan.join("-")}x${sourceState.vSpan.join("-")} target=${dragTarget.targetHSpan.join("-")}x${dragTarget.targetVSpan.join("-")} intent=${dragTarget.intentPoint.h.toFixed(2)},${dragTarget.intentPoint.v.toFixed(2)}`);
          }
          this.clearBlockedPreview();
          this.clearPlacementPreviewsExcept(this.draggedWindowId);
          try {
            let preview = this.previewsMap[this.draggedWindowId];
            if (!preview) {
              preview = new TilePreview();
              this.previewsMap[this.draggedWindowId] = preview;
            }
            const win = this.shell._findMetaWindow(this.draggedWindowId);
            if (win) {
              const frameGeom = TilingEngine.stateToGeometry(this.dragSession.sourceState, activeMonitor, config);
              preview.show(win, frameGeom, parseInt(activeMonitor.id), false, 80, 220, false, "normal", false);
            }
          } catch (err) {
          }
          this.lastDragStates = null;
          this.lastDragTarget = dragTarget;
          this.dragSession.lastDragStates = null;
          this.dragSession.lastDragBeforeStates = null;
          this.dragSession.lastDragAffected = [];
          this.dragSession.cancelled = true;
          this.dragSession.floated = false;
          this.dragSession.dndEngaged = false;
          return true;
        }
        const dragResult = solveDragTransitions(
          this.draggedWindowId,
          dragTarget.targetHSpan,
          dragTarget.targetVSpan,
          config,
          activeWindowsOnMonitor,
          {
            swapWindows: isSwapModifierPressed,
            intentPoint: dragTarget.intentPoint,
            preferredWidth: windowWidth
          }
        );
        const dragStates = dragResult.states;
        this.logDndDecision(
          dragTarget,
          dragResult,
          windowWidth,
          windowHeight,
          windowSizeSource,
          activeWindowsOnMonitor
        );
        if (dragResult.status === "blocked") {
          this.clearPlacementPreviews();
          this.lastDragStates = null;
          if (this.dragSession) {
            this.dragSession.lastDragStates = null;
            this.dragSession.lastDragBeforeStates = null;
            this.dragSession.lastDragAffected = [];
            this.dragSession.cancelled = true;
            this.dragSession.floated = false;
            this.dragSession.dndEngaged = true;
          }
          try {
            if (!this.blockedPreview) {
              this.blockedPreview = new TilePreview();
            }
            const win = this.shell._findMetaWindow(this.draggedWindowId);
            if (win) {
              const blockedState = {
                hIndex: TilingEngine.spanToHIndex(dragTarget.targetHSpan),
                vIndex: TilingEngine.spanToVIndex(dragTarget.targetVSpan),
                hSpan: [...dragTarget.targetHSpan],
                vSpan: [...dragTarget.targetVSpan],
                lastDirection: null
              };
              const frameGeom = TilingEngine.stateToGeometry(blockedState, activeMonitor, config);
              this.blockedPreview.show(
                win,
                frameGeom,
                parseInt(activeMonitor.id),
                true,
                80,
                140,
                false,
                this.getBlockedPreviewVariant(dragResult.reason)
              );
            }
          } catch (e) {
          }
          return true;
        }
        this.clearBlockedPreview();
        this.lastDragStates = dragStates;
        this.lastDragTarget = dragTarget;
        if (this.dragSession) {
          const beforeStates = {};
          for (const activeWindow of activeWindowsOnMonitor) {
            beforeStates[activeWindow.windowId] = {
              hIndex: activeWindow.state.hIndex,
              vIndex: activeWindow.state.vIndex,
              hSpan: [...activeWindow.state.hSpan],
              vSpan: [...activeWindow.state.vSpan],
              lastDirection: activeWindow.state.lastDirection
            };
          }
          this.dragSession.lastDragStates = dragStates;
          this.dragSession.lastDragBeforeStates = beforeStates;
          this.dragSession.lastDragAffected = dragResult.affected;
          this.dragSession.cancelled = false;
          this.dragSession.floated = false;
          this.dragSession.dndEngaged = true;
        }
        if (this.dragSession && this.dragSession.wasTiled && this.dragSession.sourceTiledGeometry) {
          if (!this.vacancyPreview) {
            this.vacancyPreview = new TilePreview();
          }
          const sourceMonitorIndex = parseInt(this.dragSession.sourceMonitor.id);
          const win = this.shell._findMetaWindow(this.draggedWindowId);
          if (win) {
            this.vacancyPreview.show(win, this.dragSession.sourceTiledGeometry, sourceMonitorIndex, true, 80, 50, true);
          }
        }
        for (const [id, nextState] of Object.entries(dragStates)) {
          const isDragged = id === this.draggedWindowId;
          let hasChanged = true;
          if (!isDragged) {
            const cached = this.cache.getCachedWindow(id);
            if (cached) {
              const sameH = cached.state.hSpan[0] === nextState.hSpan[0] && cached.state.hSpan[1] === nextState.hSpan[1];
              const sameV = cached.state.vSpan[0] === nextState.vSpan[0] && cached.state.vSpan[1] === nextState.vSpan[1];
              if (sameH && sameV) {
                hasChanged = false;
              }
            }
          }
          if (hasChanged) {
            const frameGeom = TilingEngine.stateToGeometry(nextState, activeMonitor, config);
            let preview = this.previewsMap[id];
            if (!preview) {
              preview = new TilePreview();
              this.previewsMap[id] = preview;
            }
            const win = this.shell._findMetaWindow(id);
            if (win) {
              const monitorIndex = parseInt(activeMonitor.id);
              if (isDragged) {
                preview.show(win, frameGeom, monitorIndex, true, 80, 220, false, isSwapModifierPressed ? "swap-primary" : "normal");
              } else {
                preview.show(win, frameGeom, monitorIndex, true, 80, isSwapModifierPressed ? 170 : 80, true, isSwapModifierPressed ? "swap-secondary" : "normal");
              }
            }
          }
        }
        const unusedIds = new Set(Object.keys(this.previewsMap));
        for (const id of Object.keys(dragStates)) {
          const isDragged = id === this.draggedWindowId;
          let hasChanged = true;
          if (!isDragged) {
            const cached = this.cache.getCachedWindow(id);
            if (cached) {
              const sameH = cached.state.hSpan[0] === dragStates[id].hSpan[0] && cached.state.hSpan[1] === dragStates[id].hSpan[1];
              const sameV = cached.state.vSpan[0] === dragStates[id].vSpan[0] && cached.state.vSpan[1] === dragStates[id].vSpan[1];
              if (sameH && sameV) {
                hasChanged = false;
              }
            }
          }
          if (hasChanged) {
            unusedIds.delete(id);
          }
        }
        for (const id of unusedIds) {
          this.previewsMap[id].destroy();
          delete this.previewsMap[id];
        }
      } catch (e) {
        global.logError(`[Dynamic Tiler] Drag update error: ${e.message}
${e.stack}`);
      }
      return true;
    }
    onGrabEnd() {
      this.stopDragTimer();
      if (!this.draggedWindowId || !this.dragSession) {
        this.draggedWindow = null;
        this.draggedWindowId = "";
        this.lastDragStates = null;
        this.lastDragMonitor = null;
        this.dragSession = null;
        this.lastDndDebugSignature = "";
        this.lastDragTarget = null;
        return;
      }
      this.debugLog(`[Dynamic Tiler] Window drag ended. Active ID: ${this.draggedWindowId}`);
      const session = this.dragSession;
      this.clearPreviews();
      if (session && this.draggedWindowId) {
        const monitors = this.shell.getActiveMonitors();
        const activeMonitor = this.lastDragMonitor || session.sourceMonitor;
        const config = this.getConfigForMonitor(activeMonitor);
        if (session.lastDragStates) {
          this.debugLog(`[Dynamic Tiler] Committing DnD tiling session for ${Object.keys(session.lastDragStates).length} windows`);
          if (session.lastDragBeforeStates && session.lastDragAffected && session.lastDragAffected.length > 0) {
            const afterStates = {};
            for (const [id, state] of Object.entries(session.lastDragStates)) {
              const nextState = state;
              afterStates[id] = {
                hIndex: nextState.hIndex,
                vIndex: nextState.vIndex,
                hSpan: [...nextState.hSpan],
                vSpan: [...nextState.vSpan],
                lastDirection: nextState.lastDirection
              };
            }
            this.recordDndTransaction({
              draggedId: this.draggedWindowId,
              monitorId: String(activeMonitor.id),
              beforeStates: session.lastDragBeforeStates,
              afterStates,
              affected: [...session.lastDragAffected]
            });
          }
          if (session.wasTiled && session.sourceMonitor && activeMonitor && session.sourceMonitor.id !== activeMonitor.id) {
            this.debugLog(`[Dynamic Tiler] Cross-monitor drag detected. Collapsing vacancy on source monitor ${session.sourceMonitor.id}`);
            this.collapseAndApplyVacancy(this.draggedWindowId, session.sourceMonitor, this.getConfigForMonitor(session.sourceMonitor), monitors);
          }
          for (const [id, nextState] of Object.entries(session.lastDragStates)) {
            try {
              const cached = this.cache.getCachedWindow(id);
              const currentGeom = this.shell.getWindowGeometry(id);
              const originalGeom = cached ? cached.originalGeometry : currentGeom;
              this.shell.unmaximizeWindow(id);
              const nextStateTyped = nextState;
              const nextGeom = TilingEngine.stateToGeometry(nextStateTyped, activeMonitor, config);
              this.shell.applyGeometry(id, nextGeom);
              const hasPreview = this.enablePreview !== false;
              const delay = hasPreview ? 100 : 20;
              imports.mainloop.timeout_add(delay, () => {
                try {
                  const realGeom = this.shell.getWindowGeometry(id);
                  this.cache.saveState(id, nextStateTyped, realGeom, originalGeom);
                } catch (err) {
                  this.cache.saveState(id, nextStateTyped, nextGeom, originalGeom);
                }
                return false;
              });
            } catch (e) {
              global.logError(`[Dynamic Tiler] DnD Apply error for window ${id}: ${e.message}`);
            }
          }
        } else if (session.floated && session.wasTiled && session.sourceMonitor) {
          this.debugLog(`[Dynamic Tiler] DnD floated tiled window ${this.draggedWindowId}; collapsing source vacancy on monitor ${session.sourceMonitor.id}`);
          this.collapseAndApplyVacancy(this.draggedWindowId, session.sourceMonitor, this.getConfigForMonitor(session.sourceMonitor), monitors);
          this.cache.clearState(this.draggedWindowId);
        } else if (session.cancelled) {
          if (session.wasTiled && session.sourceTiledGeometry && session.sourceState) {
            try {
              this.shell.unmaximizeWindow(this.draggedWindowId);
              this.shell.applyGeometry(this.draggedWindowId, session.sourceTiledGeometry);
              this.cache.saveState(
                this.draggedWindowId,
                session.sourceState,
                session.sourceTiledGeometry,
                session.sourceGeometry || session.sourceTiledGeometry
              );
            } catch (e) {
              global.logError(`[Dynamic Tiler] DnD cancel restore error for window ${this.draggedWindowId}: ${e.message}`);
            }
          }
          this.debugLog(`[Dynamic Tiler] DnD cancelled safely for window ${this.draggedWindowId}; layout cache left unchanged`);
        }
      }
      this.draggedWindow = null;
      this.draggedWindowId = "";
      this.lastDragStates = null;
      this.lastDragMonitor = null;
      this.dragSession = null;
      this.lastDndDebugSignature = "";
      this.lastDragTarget = null;
    }
    collapseAndApplyVacancy(draggedId, monitor, config, monitors) {
      try {
        const visibleWindowIds = this.shell.getVisibleWindowIds();
        const activeWindowsOnMonitor = [];
        for (const id of visibleWindowIds) {
          const cached = this.cache.getCachedWindow(id);
          if (cached) {
            let currentMonitor = monitor;
            try {
              const geom = this.shell.getWindowGeometry(id);
              currentMonitor = this.shell.findMonitorForWindow(geom, monitors);
            } catch {
              currentMonitor = this.shell.findMonitorForWindow(cached.tiledGeometry, monitors);
            }
            if (currentMonitor.id === monitor.id) {
              activeWindowsOnMonitor.push({
                windowId: id,
                state: cached.state
              });
            }
          }
        }
        let collapsedStates = null;
        const restoredTransaction = restoreDragTransactionHistory(
          this.dndTransactions,
          draggedId,
          String(monitor.id),
          config,
          activeWindowsOnMonitor
        );
        if (restoredTransaction) {
          collapsedStates = restoredTransaction.states;
          this.dndTransactions.splice(restoredTransaction.snapshotIndex, 1);
          this.debugLog(`[Dynamic Tiler] Restored DnD transaction neighbors for ${draggedId}`);
        } else if (this.dndTransactions.some(
          (transaction) => transaction.draggedId === draggedId && transaction.monitorId === String(monitor.id)
        )) {
          this.debugLog(`[Dynamic Tiler] DnD transaction restore skipped for ${draggedId}; falling back to vacancy collapse`);
        }
        if (!collapsedStates) {
          collapsedStates = collapseVacancy(draggedId, config, activeWindowsOnMonitor);
        }
        for (const [id, nextState] of Object.entries(collapsedStates)) {
          try {
            const cached = this.cache.getCachedWindow(id);
            const currentGeom = this.shell.getWindowGeometry(id);
            const originalGeom = cached ? cached.originalGeometry : currentGeom;
            const nextGeom = TilingEngine.stateToGeometry(nextState, monitor, config);
            this.shell.applyGeometry(id, nextGeom);
            const hasPreview = this.enablePreview !== false;
            const delay = hasPreview ? 100 : 20;
            imports.mainloop.timeout_add(delay, () => {
              try {
                const realGeom = this.shell.getWindowGeometry(id);
                this.cache.saveState(id, nextState, realGeom, originalGeom);
              } catch (err) {
                this.cache.saveState(id, nextState, nextGeom, originalGeom);
              }
              return false;
            });
          } catch (e) {
            global.logError(`[Dynamic Tiler] Collapse apply error for window ${id}: ${e.message}`);
          }
        }
        this.cache.clearState(draggedId);
        this.debugLog(`[Dynamic Tiler] Successfully collapsed grid vacancy and cleared state for ${draggedId}`);
      } catch (e) {
        global.logError(`[Dynamic Tiler] Failed to collapse and apply vacancy: ${e.message}`);
      }
    }
    recordDndTransaction(transaction) {
      const maxTransactions = 8;
      this.dndTransactions = this.dndTransactions.filter(
        (existing) => !(existing.draggedId === transaction.draggedId && existing.monitorId === transaction.monitorId)
      );
      this.dndTransactions.push(transaction);
      if (this.dndTransactions.length > maxTransactions) {
        this.dndTransactions.splice(0, this.dndTransactions.length - maxTransactions);
      }
    }
    getBlockedPreviewVariant(reason) {
      if (reason === "tooSmall") return "blocked-too-small";
      if (reason === "outOfBounds") return "blocked-out-of-bounds";
      return "blocked-overlap";
    }
    isConfiguredModifierPressed(settingValue, fallback, mods) {
      let hotkeySetting = settingValue || fallback;
      if (Array.isArray(hotkeySetting)) {
        hotkeySetting = hotkeySetting[0] || fallback;
      }
      const ctrl = hotkeySetting.includes("Control") || hotkeySetting.includes("Ctrl") || hotkeySetting.includes("Primary");
      const shift = hotkeySetting.includes("Shift");
      const alt = hotkeySetting.includes("Alt") || hotkeySetting.includes("Meta") || hotkeySetting.includes("Mod1");
      const superKey = hotkeySetting.includes("Super") || hotkeySetting.includes("Mod4");
      if (!ctrl && !shift && !alt && !superKey) {
        return true;
      }
      const ctrlPressed = (mods & Clutter2.ModifierType.CONTROL_MASK) !== 0;
      const shiftPressed = (mods & Clutter2.ModifierType.SHIFT_MASK) !== 0;
      const altPressed = (mods & Clutter2.ModifierType.MOD1_MASK) !== 0;
      const superPressed = (mods & Clutter2.ModifierType.SUPER_MASK) !== 0;
      if (ctrl && !ctrlPressed) return false;
      if (shift && !shiftPressed) return false;
      if (alt && !altPressed) return false;
      if (superKey && !superPressed) return false;
      return true;
    }
    restoreAndCollapseActiveWindow() {
      try {
        const windowId = this.shell.getActiveWindowId();
        if (!windowId) return;
        const cached = this.cache.getCachedWindow(windowId);
        if (cached && cached.originalGeometry) {
          const monitors = this.shell.getActiveMonitors();
          const geom = this.shell.getWindowGeometry(windowId);
          const activeMonitor = this.shell.findMonitorForWindow(geom, monitors);
          const config = this.getConfigForMonitor(activeMonitor);
          this.collapseAndApplyVacancy(windowId, activeMonitor, config, monitors);
          this.shell.unmaximizeWindow(windowId);
          this.shell.applyGeometry(windowId, cached.originalGeometry);
          this.cache.clearState(windowId);
          this.debugLog(`[Dynamic Tiler] [Keyboard] Successfully restored and collapsed window ${windowId}`);
        }
      } catch (e) {
        global.logError(`[Dynamic Tiler] Failed to restore and collapse window: ${e.message}`);
      }
    }
    logDndDecision(dragTarget, dragResult, windowWidth, windowHeight, windowSizeSource, activeWindows) {
      if (this.enableDebugLogs !== true) {
        return;
      }
      const debug = dragTarget.debug;
      const signature = [
        dragResult.status,
        dragResult.reason || "ok",
        debug.mode,
        windowSizeSource,
        `${windowWidth}x${windowHeight}`,
        this.formatSpan(dragTarget.targetHSpan),
        this.formatSpan(dragTarget.targetVSpan),
        debug.nearestBoundary === void 0 ? "-" : debug.nearestBoundary,
        debug.slotWidth === void 0 ? "-" : debug.slotWidth,
        debug.nearestDistance === void 0 ? "-" : debug.nearestDistance.toFixed(2)
      ].join("|");
      if (signature === this.lastDndDebugSignature) {
        return;
      }
      this.lastDndDebugSignature = signature;
      if (dragResult.status !== "blocked" && debug.mode === "base") {
        return;
      }
      const horizontalGroup = debug.horizontalGroup ? `${this.formatSpan(debug.horizontalGroup.vSpan)} windows=${debug.horizontalGroup.windows} contains=${debug.horizontalGroup.containsCursor} dist=${debug.horizontalGroup.vDistance.toFixed(2)}` : "-";
      const verticalGroup = debug.verticalGroup ? `${this.formatSpan(debug.verticalGroup.hSpan)} windows=${debug.verticalGroup.windows} contains=${debug.verticalGroup.containsCursor} dist=${debug.verticalGroup.hDistance.toFixed(2)}` : "-";
      this.debugLog(
        `[Dynamic Tiler] [DND] DnD trace status=${dragResult.status} reason=${dragResult.reason || "ok"} dragged=${this.draggedWindowId} size=${windowWidth}x${windowHeight} sizeSource=${windowSizeSource} intent=${debug.preferredWidth}x${debug.preferredHeight} pointer=${dragTarget.intentPoint.h.toFixed(2)},${dragTarget.intentPoint.v.toFixed(2)} mode=${debug.mode} initial=${this.formatSpan(debug.initialHSpan)}x${this.formatSpan(debug.initialVSpan)} target=${this.formatSpan(dragTarget.targetHSpan)}x${this.formatSpan(dragTarget.targetVSpan)} hCandidates=${debug.horizontalCandidates} vCandidates=${debug.verticalCandidates} preferV=${debug.shouldPreferVerticalStack} hGroup=${horizontalGroup} vGroup=${verticalGroup} boundary=${debug.nearestBoundary === void 0 ? "-" : debug.nearestBoundary} distance=${debug.nearestDistance === void 0 ? "-" : debug.nearestDistance.toFixed(2)} slot=${debug.slotWidth === void 0 ? "-" : debug.slotWidth} hThreshold=${debug.horizontalThreshold === void 0 ? "-" : debug.horizontalThreshold.toFixed(2)} stackHeight=${debug.stackTargetHeight === void 0 ? "-" : debug.stackTargetHeight} boundaryThreshold=${debug.boundaryThreshold === void 0 ? "-" : debug.boundaryThreshold.toFixed(2)} active=[${this.formatDndWindows(activeWindows)}]`
      );
    }
    formatSpan(span) {
      return `${span[0]}-${span[1]}`;
    }
    formatDndWindows(windows) {
      return windows.map((w) => `${w.windowId}:${this.formatSpan(w.state.hSpan)}x${this.formatSpan(w.state.vSpan)}`).join(",");
    }
    stopDragTimer() {
      if (this.dragTimerId) {
        imports.mainloop.source_remove(this.dragTimerId);
        this.dragTimerId = 0;
      }
    }
    clearPreviews() {
      this.clearPlacementPreviews();
      this.clearBlockedPreview();
    }
    clearPlacementPreviews() {
      for (const [id, preview] of Object.entries(this.previewsMap)) {
        try {
          preview.hide();
          preview.destroy();
        } catch (e) {
        }
      }
      this.previewsMap = {};
      if (this.vacancyPreview) {
        try {
          this.vacancyPreview.hide();
          this.vacancyPreview.destroy();
        } catch (e) {
        }
        this.vacancyPreview = null;
      }
    }
    clearPlacementPreviewsExcept(keepId) {
      for (const [id, preview] of Object.entries(this.previewsMap)) {
        if (id === keepId) continue;
        try {
          preview.hide();
          preview.destroy();
        } catch (e) {
        }
        delete this.previewsMap[id];
      }
      if (this.vacancyPreview) {
        try {
          this.vacancyPreview.hide();
          this.vacancyPreview.destroy();
        } catch (e) {
        }
        this.vacancyPreview = null;
      }
    }
    clearBlockedPreview() {
      if (this.blockedPreview) {
        try {
          this.blockedPreview.hide();
          this.blockedPreview.destroy();
        } catch (e) {
        }
        this.blockedPreview = null;
      }
    }
    applyConfigurationChange() {
      try {
        const visibleWindowIds = this.shell.getVisibleWindowIds();
        const monitors = this.shell.getActiveMonitors();
        for (const id of visibleWindowIds) {
          const cached = this.cache.getCachedWindow(id);
          if (!cached) continue;
          try {
            const currentGeom = this.shell.getWindowGeometry(id);
            const monitor = this.shell.findMonitorForWindow(currentGeom, monitors);
            const config = this.getConfigForMonitor(monitor);
            const hSpan = TilingEngine.geometryToHSpan(currentGeom, monitor, config);
            const vSpan = TilingEngine.geometryToVSpan(currentGeom, monitor, config);
            const nextState = {
              ...cached.state,
              hSpan,
              vSpan,
              hIndex: TilingEngine.spanToHIndex(hSpan),
              vIndex: TilingEngine.spanToVIndex(vSpan)
            };
            const nextGeom = TilingEngine.stateToGeometry(nextState, monitor, config);
            const win = this.shell._findMetaWindow(id);
            if (win) {
              if (win.maximized_horz || win.maximized_vert) {
                win.unmaximize(Meta3.MaximizeFlags.BOTH);
              }
              win.move_resize_frame(true, nextGeom.x, nextGeom.y, nextGeom.width, nextGeom.height);
              this.cache.saveState(id, nextState, nextGeom, cached.originalGeometry);
            }
          } catch (e) {
          }
        }
      } catch (e) {
        global.logError(`[Dynamic Tiler] Failed to apply config change: ${e}`);
      }
    }
    registerKeybinding(settingName, action) {
      this.settings.bindProperty(Settings.BindingDirection.IN, settingName, settingName, () => {
        this.updateHotKey(settingName, action);
      });
      this.updateHotKey(settingName, action);
    }
    updateHotKey(settingName, action) {
      const key = `dynamic-tiler-${settingName}`;
      const value = this[settingName];
      if (this.bindings[key]) {
        Main2.keybindingManager.removeHotKey(key);
        delete this.bindings[key];
      }
      if (!value || value === "") return;
      try {
        Main2.keybindingManager.addHotKey(key, value, () => {
          try {
            const activeId = this.shell.getActiveWindowId();
            this.debugLog(`[Dynamic Tiler] [Keyboard] Action triggered: key=${value}, action=${action}, activeWindowId=${activeId || "none"}`);
            if (action === "restore") {
              this.restoreAndCollapseActiveWindow();
            } else {
              this.useCase.tile(action);
            }
          } catch (e) {
            global.logError(`[Dynamic Tiler] Execution error for action ${action}: ${e.message}`);
          }
        });
        this.bindings[key] = value;
      } catch (e) {
        global.logError(`[Dynamic Tiler] Failed to register hotkey ${value}: ${e}`);
      }
    }
  };
  var extensionInstance = null;
  function init(metadata) {
    extensionInstance = new DynamicTilerExtension(metadata);
  }
  function enable() {
    if (extensionInstance) {
      extensionInstance.enable();
    }
  }
  function disable() {
    if (extensionInstance) {
      extensionInstance.disable();
    }
  }
  return __toCommonJS(extension_exports);
})();

var init = DynamicTiler.init;
var enable = DynamicTiler.enable;
var disable = DynamicTiler.disable;
