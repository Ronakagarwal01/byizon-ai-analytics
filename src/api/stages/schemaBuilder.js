/**
 * Stage 4: Schema Builder
 * Packages the DataProfile into a lean, structured schema payload.
 * Pure function — zero API calls. Sole purpose: prepare the AI input contract.
 */

/**
 * @param {DataProfile} dataProfile - Output of Stage 3 (Data Profiler)
 * @returns {object}
 */
export function buildSchemaPayload(dataProfile) {
  return {
    metadata: {
      fileName: dataProfile.fileName,
      rowCount: dataProfile.rowCount,
      colCount: dataProfile.colCount,
      sheetNames: dataProfile.sheetNames,
    },
    // Compact column profiles — only what AI needs for schema detection
    columnProfiles: dataProfile.columns.map(col => ({
      name: col.name,
      detectedType: col.detectedType,
      nullRate: col.nullRate,
      uniqueCount: col.uniqueCount,
      uniqueRate: col.uniqueRate,
      sampleValues: col.sampleValues,
      // Include relevant stats per type
      numericStats: col.numericStats
        ? { sum: col.numericStats.sum, min: col.numericStats.min, max: col.numericStats.max, avg: col.numericStats.avg }
        : null,
      dateStats: col.dateStats || null,
      categoricalStats: col.categoricalStats
        ? { uniqueCount: col.categoricalStats.uniqueCount, topValues: col.categoricalStats.topValues }
        : null,
    })),
    // First 100 rows — AI uses these to understand actual data patterns
    sampleRows: dataProfile.sampleRows,
  };
}
