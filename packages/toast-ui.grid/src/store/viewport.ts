import { Data } from '@t/store/data';
import { Column } from '@t/store/column';
import { Dimension } from '@t/store/dimension';
import { RowCoords } from '@t/store/rowCoords';
import { ColumnCoords } from '@t/store/columnCoords';
import { Range } from '@t/store/selection';
import { Viewport } from '@t/store/viewport';
import { observable } from '../helper/observable';
import { arrayEqual, findIndex } from '../helper/common';
import { getMaxRowSpanCount, isRowSpanEnabled } from '../query/rowSpan';
import { isClientPagination } from '../query/data';

interface ViewportOption {
  data: Data;
  column: Column;
  dimension: Dimension;
  rowCoords: RowCoords;
  columnCoords: ColumnCoords;
  showDummyRows: boolean;
}

interface CalculateRangeOption {
  scrollPos: number;
  totalSize: number;
  offsets: number[];
  data: Data;
  column: Column;
  rowCalculation?: boolean;
}

function findIndexByPosition(offsets: number[], position: number) {
  const rowOffset = findIndex((offset) => offset > position, offsets);

  return rowOffset === -1 ? offsets.length - 1 : rowOffset - 1;
}

function calculateRange({
  scrollPos,
  totalSize,
  offsets,
  data,
  column,
  rowCalculation,
}: CalculateRangeOption): Range {
  // safari uses negative scroll position for bouncing effect
  scrollPos = Math.max(scrollPos, 0);

  let start = findIndexByPosition(offsets, scrollPos);
  let end = findIndexByPosition(offsets, scrollPos + totalSize) + 1;
  const { filteredRawData, sortState, pageRowRange } = data;
  const dataLength = filteredRawData.length;

  if (rowCalculation && isClientPagination(data)) {
    [start, end] = pageRowRange;
  }

  if (dataLength && dataLength >= start && rowCalculation && isRowSpanEnabled(sortState, column)) {
    const maxRowSpanCount = getMaxRowSpanCount(start, filteredRawData);
    const topRowSpanIndex = start - maxRowSpanCount;

    return [topRowSpanIndex >= 0 ? topRowSpanIndex : 0, end];
  }

  return [start, end];
}

function getCachedRange(cachedRange: Range, newRange: Range) {
  if (cachedRange && arrayEqual(cachedRange, newRange)) {
    return cachedRange;
  }
  return newRange;
}

export function create({ data, column, dimension, rowCoords, showDummyRows }: ViewportOption) {
  return observable<Viewport>({
    scrollTop: 0,
    scrollPixelScale: 40,

    // 가로 스크롤 관련 상태 삭제
    // scrollLeft: 0,
    // maxScrollLeft: 0,
    // 모든 컬럼 포함하는 범위 계산
    get colRange() {
      return [0, column.allColumns.length] as Range;
    },

    // 모든 컬럼 반환
    get columns() {
      return column.allColumns;
    },

    // offsetLeft 삭제 또는 고정값으로 대체
    // get offsetLeft() {
    //   return 0;
    // },
    // 기존 로직 유지
    get maxScrollTop() {
      const { bodyHeight, scrollbarWidth } = dimension;
      const { totalRowHeight } = rowCoords;

      return totalRowHeight - bodyHeight + scrollbarWidth;
    },

    get rowRange() {
      const range = calculateRange({
        scrollPos: this.scrollTop,
        totalSize: dimension.bodyHeight,
        offsets: rowCoords.offsets,
        data,
        column,
        rowCalculation: true,
      });

      return getCachedRange(this.__storage__.rowRange, range);
    },

    get rows() {
      return data.filteredViewData.slice(...this.rowRange);
    },

    get offsetTop() {
      return rowCoords.offsets[this.rowRange[0] - data.pageRowRange[0]];
    },

    // 기존 로직 유지
    get dummyRowCount() {
      const { rowHeight, bodyHeight, scrollXHeight, cellBorderWidth } = dimension;
      const { totalRowHeight } = rowCoords;
      const adjustedRowHeight = rowHeight + cellBorderWidth;
      const adjustedBodyHeight = bodyHeight - scrollXHeight;

      if (showDummyRows && totalRowHeight < adjustedBodyHeight) {
        return Math.ceil((adjustedBodyHeight - totalRowHeight) / adjustedRowHeight) + 1;
      }

      return 0;
    },
    scrollLeft: 0,
    maxScrollLeft: 0,
    offsetLeft: 0,
  });
}
