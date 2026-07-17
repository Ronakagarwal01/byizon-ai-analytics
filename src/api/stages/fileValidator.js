/**
 * Stage 1: File Validator
 * Enterprise-grade file validation before any parsing occurs.
 * Checks: extension, MIME type, file size, empty file guard.
 */

const ALLOWED_EXTENSIONS = ['.csv', '.tsv', '.xlsx', '.xls', '.json', '.pdf', '.txt', '.log', '.sql', '.sqlite', '.sqlite3', '.db'];
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

/**
 * @param {File} file
 * @returns {{ valid: boolean, fileName: string, fileSize: number, fileSizeMB: string,
 *             extension: string, mimeType: string, isCSV: boolean, isExcel: boolean,
 *             error: string|null }}
 */
export function validateFile(file) {
  const result = {
    valid: false,
    fileName: file.name,
    fileSize: file.size,
    fileSizeMB: (file.size / (1024 * 1024)).toFixed(2),
    extension: '',
    mimeType: file.type || 'application/octet-stream',
    isCSV: false,
    isExcel: false,
    error: null,
  };

  // 1. Extension check
  const name = file.name.toLowerCase();
  const ext = ALLOWED_EXTENSIONS.find(e => name.endsWith(e));
  if (!ext) {
    const foundExt = name.includes('.') ? name.split('.').pop() : 'unknown';
    result.error = `Unsupported file format ".${foundExt}". Please upload CSV, Excel, JSON, PDF, TXT, SQL, or SQLite database export files.`;
    return result;
  }
  result.extension = ext;
  result.isCSV = ext === '.csv';
  result.isExcel = ext === '.xlsx' || ext === '.xls';

  // 2. Empty file guard
  if (file.size === 0) {
    result.error = 'The uploaded file is empty (0 bytes). Please upload a file that contains data.';
    return result;
  }

  // 3. Size limit
  if (file.size > MAX_FILE_SIZE_BYTES) {
    result.error = `File size (${result.fileSizeMB} MB) exceeds the 100 MB limit. Please upload a smaller dataset.`;
    return result;
  }

  result.valid = true;
  return result;
}
