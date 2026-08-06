/**
 * Stage 2: File Parser
 * Parses CSV and Excel files using an inline Web Worker to keep the UI thread free.
 * Supports: .csv (PapaParse), .xlsx/.xls (SheetJS)
 */

/**
 * @param {File} file
 * @param {Function} onProgress - (message: string) => void
 * @returns {Promise<{ columns: string[], rows: object[], sheetNames: string[] }>}
 */
export function parseFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const isCSV = file.name.toLowerCase().endsWith('.csv');

    file.arrayBuffer().then(arrayBuffer => {
      onProgress?.('Loading file into background worker...');

      const workerCode = `
        self.importScripts('https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js');
        self.importScripts('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');

        self.onmessage = function(e) {
          const { arrayBuffer, isCSV, fileName } = e.data;
          try {
            let rows = [];
            let columns = [];
            let sheetNames = [];

            if (isCSV) {
              const decoder = new TextDecoder('utf-8');
              const csvText = decoder.decode(arrayBuffer);
              const results = self.Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                dynamicTyping: false,
                transformHeader: h => h.trim()
              });
              rows = results.data;
              columns = results.meta.fields || [];
              sheetNames = ['Default'];
            } else {
              const data = new Uint8Array(arrayBuffer);
              const workbook = self.XLSX.read(data, { type: 'array', cellDates: true, raw: false });
              sheetNames = workbook.SheetNames;
              const sheet = workbook.Sheets[sheetNames[0]];
              rows = self.XLSX.utils.sheet_to_json(sheet, { defval: '' });
              if (rows.length > 0) {
                // Trim column header whitespace
                const firstRow = rows[0];
                const hasWhitespace = Object.keys(firstRow).some(k => k !== k.trim());
                if (hasWhitespace) {
                  rows = rows.map(r => {
                    const clean = {};
                    Object.entries(r).forEach(([k, v]) => { clean[k.trim()] = v; });
                    return clean;
                  });
                }
              }
              columns = rows.length > 0 ? Object.keys(rows[0]) : [];
            }

            if (rows.length === 0) {
              self.postMessage({ success: false, error: 'The file contains no data rows. Please check the file and try again.' });
              return;
            }

            // Tag each row with file metadata (used by pipeline stages downstream)
            rows.forEach(r => {
              r._fileName = fileName;
              r._sheetNames = sheetNames;
            });

            self.postMessage({ success: true, columns, rows, sheetNames });
          } catch (err) {
            self.postMessage({ success: false, error: 'Parsing failed: ' + err.message });
          }
        };
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);

      worker.onmessage = (e) => {
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
        const { success, columns, rows, sheetNames, error } = e.data;
        if (success) {
          onProgress?.(`${rows.length.toLocaleString()} rows × ${columns.length} columns parsed`);
          resolve({ columns, rows, sheetNames });
        } else {
          reject(new Error(error));
        }
      };

      worker.onerror = (e) => {
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
        reject(new Error('Web Worker parsing error: ' + e.message));
      };

      worker.postMessage({ arrayBuffer, isCSV, fileName: file.name }, [arrayBuffer]);
    }).catch(err => {
      reject(new Error('Failed to read file buffer: ' + err.message));
    });
  });
}
