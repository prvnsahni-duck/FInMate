import * as XLSX from 'xlsx';
import {
  buildExportInfoMatrix,
  EXPORT_COLUMNS,
  ExportFormat,
  ExportMeta,
  ExportRow,
} from './expense-export.types';

/**
 * Serializes decrypted export rows into a downloadable file. One implementation
 * per output format — the row→cell mapping (EXPORT_COLUMNS) is shared, so a
 * builder only decides how to serialize, never what a column means.
 */
export interface WorkbookBuilder {
  readonly format: ExportFormat;
  readonly extension: string;
  readonly mimeType: string;
  build(rows: ExportRow[], meta: ExportMeta): Blob;
}

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Excel number format for monetary columns (thousands + 2 decimals). */
const CURRENCY_FORMAT = '#,##0.00';

/** Excel `.xlsx` builder backed by SheetJS. */
export class XlsxWorkbookBuilder implements WorkbookBuilder {
  readonly format: ExportFormat = 'xlsx';
  readonly extension = 'xlsx';
  readonly mimeType = XLSX_MIME;

  build(rows: ExportRow[], meta: ExportMeta): Blob {
    return new Blob([this.buildBuffer(rows, meta)], { type: this.mimeType });
  }

  /**
   * Serialize to the raw `.xlsx` byte buffer. Split out from `build()` so it can
   * be verified directly (jsdom's Blob has no readable `arrayBuffer()`).
   *
   * Two worksheets: "Transactions" (the data) and "Export Information" (a cover
   * sheet with the range, filters, and totals for this export run).
   */
  buildBuffer(rows: ExportRow[], meta: ExportMeta): ArrayBuffer {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      this.buildTransactionsSheet(rows),
      'Transactions',
    );
    XLSX.utils.book_append_sheet(
      workbook,
      this.buildInfoSheet(meta),
      'Export Information',
    );

    return XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array',
    }) as ArrayBuffer;
  }

  private buildTransactionsSheet(rows: ExportRow[]): XLSX.WorkSheet {
    const headers = EXPORT_COLUMNS.map((c) => c.header);
    const matrix: (string | number | null)[][] = [
      headers,
      ...rows.map((row) => EXPORT_COLUMNS.map((col) => col.value(row))),
    ];

    const sheet = XLSX.utils.aoa_to_sheet(matrix);

    this.applyColumnWidths(sheet, rows);
    this.applyCurrencyFormat(sheet, rows.length);
    this.applyHeaderStyle(sheet, headers.length);

    // Freeze the header row so it stays visible while scrolling.
    sheet['!freeze'] = { xSplit: 0, ySplit: 1 };

    return sheet;
  }

  private buildInfoSheet(meta: ExportMeta): XLSX.WorkSheet {
    const sheet = XLSX.utils.aoa_to_sheet(buildExportInfoMatrix(meta));
    sheet['!cols'] = [{ wch: 20 }, { wch: 30 }];
    // Bold the title (A1) — degrades gracefully on the community build.
    this.applyHeaderStyle(sheet, 1);
    return sheet;
  }

  /** Auto-size each column to the widest cell (header or value), within bounds. */
  private applyColumnWidths(sheet: XLSX.WorkSheet, rows: ExportRow[]): void {
    sheet['!cols'] = EXPORT_COLUMNS.map((col) => {
      let widest = col.header.length;
      for (const row of rows) {
        const value = col.value(row);
        const len = value == null ? 0 : String(value).length;
        if (len > widest) widest = len;
      }
      // +2 padding; clamp so a long note doesn't blow the layout out.
      return { wch: Math.min(Math.max(widest + 2, 10), 60) };
    });
  }

  /** Tag monetary columns with a 2-decimal number format. */
  private applyCurrencyFormat(sheet: XLSX.WorkSheet, rowCount: number): void {
    EXPORT_COLUMNS.forEach((col, colIndex) => {
      if (col.type !== 'number') return;
      for (let r = 1; r <= rowCount; r++) {
        const ref = XLSX.utils.encode_cell({ r, c: colIndex });
        const cell = sheet[ref];
        if (cell && cell.t === 'n') {
          cell.z = CURRENCY_FORMAT;
        }
      }
    });
  }

  /**
   * Bold the header row. Note: the SheetJS community build does not write font
   * styling, so this is a no-op there and degrades gracefully; column widths and
   * number formats above are fully honored. Kept so a future swap to a
   * style-capable build (e.g. xlsx-js-style) renders bold headers automatically.
   */
  private applyHeaderStyle(sheet: XLSX.WorkSheet, columnCount: number): void {
    for (let c = 0; c < columnCount; c++) {
      const ref = XLSX.utils.encode_cell({ r: 0, c });
      const cell = sheet[ref] as XLSX.CellObject & { s?: unknown };
      if (cell) {
        cell.s = { font: { bold: true } };
      }
    }
  }
}

/** Registry of available builders, keyed by format. Extend for csv/pdf. */
export function createWorkbookBuilder(format: ExportFormat): WorkbookBuilder {
  switch (format) {
    case 'xlsx':
      return new XlsxWorkbookBuilder();
    default:
      // Only xlsx ships today; other formats are declared in the type for
      // forward-compatibility and slot in here without touching callers.
      throw new Error(`Unsupported export format: ${format}`);
  }
}
