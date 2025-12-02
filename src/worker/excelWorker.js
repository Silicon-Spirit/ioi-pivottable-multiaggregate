// Web Worker for Excel file processing
// This worker processes Excel files off the main thread to prevent UI freezing
// Optimized for maximum performance - targeting 68k+ rows/second

import * as XLSX from 'xlsx';

// Process Excel file in worker
self.onmessage = async (e) => {
	const { id, type, payload } = e.data;

	if (type === 'PROCESS_EXCEL') {
		const startTime = performance.now();
		try {
			const { arrayBuffer, maxRows = 500000 } = payload;
			
			// Parse Excel file with maximum performance options
			// CRITICAL: Use dense: true for dense data (most cells filled) - can be faster
			// Try both and see which is faster for your data
			const parseStart = performance.now();
			const workbook = XLSX.read(arrayBuffer, { 
				type: 'array',
				cellDates: false,
				cellNF: false,
				cellStyles: false,
				sheetStubs: false,
				bookSheets: false,
				bookProps: false,
				bookFiles: false,
				bookVBA: false,
				password: '',
				WTF: false,
				dense: true // Try dense mode - faster for dense data (most cells filled)
			});
			const parseTime = performance.now() - parseStart;
			
			// Get first sheet
			const firstSheetName = workbook.SheetNames[0];
			const worksheet = workbook.Sheets[firstSheetName];
			
			// CRITICAL OPTIMIZATION: For dense mode, access data directly from !data property
			// This is MUCH faster than sheet_to_json for large files!
			const jsonStart = performance.now();
			let aoa;
			
			// Check if we have dense mode data (faster direct access)
			if (worksheet['!data'] && Array.isArray(worksheet['!data'])) {
				// Dense mode: !data is a 2D array - use it directly!
				// This avoids the overhead of sheet_to_json conversion
				const rawData = worksheet['!data'];
				
				// CRITICAL: Limit rows BEFORE processing to reduce work
				const rowsToProcess = Math.min(rawData.length, maxRows + 1);
				const totalRows = rawData.length;
				
				// Pre-allocate result array for better performance
				aoa = new Array(rowsToProcess);
				
				// Convert cell objects to values (dense mode stores cells as objects)
				// ULTRA-OPTIMIZED: Minimize property access and type checks
				for (let i = 0; i < rowsToProcess; i++) {
					const row = rawData[i];
					if (!Array.isArray(row)) {
						aoa[i] = [];
						continue;
					}
					
					const rowLength = row.length;
					const newRow = new Array(rowLength);
					
					// Ultra-fast cell extraction: cache typeof check, minimize property access
					for (let j = 0; j < rowLength; j++) {
						const cell = row[j];
						// Fast path: check for object first (most common case)
						newRow[j] = (cell && typeof cell === 'object' && 'v' in cell) 
							? (cell.v != null ? cell.v : null)
							: (cell != null ? cell : null);
					}
					aoa[i] = newRow;
				}
			} else {
				// Sparse mode: use sheet_to_json (slower but necessary)
				// Get sheet range to determine limits
				const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
				const totalSheetRows = range.e.r + 1;
				const rowsToProcess = Math.min(totalSheetRows, maxRows + 1);
				
				// CRITICAL: Limit the range BEFORE parsing to speed up sheet_to_json
				if (rowsToProcess < totalSheetRows) {
					// Create limited range
					const limitedRange = XLSX.utils.encode_range({
						s: { r: 0, c: 0 },
						e: { r: rowsToProcess - 1, c: range.e.c }
					});
					// Temporarily set limited range
					const originalRef = worksheet['!ref'];
					worksheet['!ref'] = limitedRange;
					
					// Parse with limited range
					aoa = XLSX.utils.sheet_to_json(worksheet, {
						raw: true,
						defval: null,
						blankrows: false,
						header: 1
					});
					
					// Restore original range
					worksheet['!ref'] = originalRef;
				} else {
					// Parse full sheet
					aoa = XLSX.utils.sheet_to_json(worksheet, {
						raw: true,
						defval: null,
						blankrows: false,
						header: 1
					});
				}
			}
			
			const jsonTime = performance.now() - jsonStart;

			if (aoa.length === 0) {
				self.postMessage({
					id,
					type: 'SUCCESS',
					payload: {
						data: [],
						rowCount: 0
					}
				});
				return;
			}

			// Data is already limited, just calculate row count
			const totalRows = Math.max(0, aoa.length - 1);
			const processedData = aoa;

			const processTime = performance.now();
			const totalDuration = processTime - startTime;
			
			console.log(`[Performance] Excel Processing: ${totalDuration.toFixed(2)}ms for ${totalRows} rows`);
			console.log(`[Performance] Parse: ${parseTime.toFixed(2)}ms, JSON: ${jsonTime.toFixed(2)}ms`);

			// Send progress update
			self.postMessage({
				id,
				type: 'PROGRESS',
				payload: {
					processed: totalRows,
					total: totalRows,
					percentage: 100
				}
			});

			// Send final result - array of arrays (no object conversion needed!)
			// The pivot engine will convert on-the-fly which is much faster
			const transferStart = performance.now();
			self.postMessage({
				id,
				type: 'SUCCESS',
				payload: {
					data: processedData, // Array of arrays - pivot engine handles it!
					rowCount: totalRows
				}
			});
			const transferTime = performance.now() - transferStart;
			if (transferTime > 100) {
				console.log(`[Performance] Transfer: ${transferTime.toFixed(2)}ms`);
			}
		} catch (error) {
			// Send error
			self.postMessage({
				id,
				type: 'ERROR',
				payload: {
					error: error.message,
					stack: error.stack
				}
			});
		}
	}
};

