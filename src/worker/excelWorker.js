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
			
			// CRITICAL OPTIMIZATION: Use sheet_to_json with header: 1 (array of arrays)
			// This is the fastest format and pivot engine handles it directly
			const jsonStart = performance.now();
			
			// Get sheet range to determine limits
			const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
			const totalSheetRows = range.e.r + 1;
			const rowsToProcess = Math.min(totalSheetRows, maxRows + 1);
			
			// CRITICAL: Limit the range BEFORE parsing to speed up sheet_to_json
			// This tells XLSX to only parse the rows we need
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
				var aoa = XLSX.utils.sheet_to_json(worksheet, {
					raw: true,
					defval: null,
					blankrows: false,
					header: 1
				});
				
				// Restore original range
				worksheet['!ref'] = originalRef;
			} else {
				// Parse full sheet
				var aoa = XLSX.utils.sheet_to_json(worksheet, {
					raw: true,
					defval: null,
					blankrows: false,
					header: 1
				});
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

			// Limit rows if needed
			const totalRows = Math.min(aoa.length - 1, maxRows);
			if (aoa.length - 1 > maxRows) {
				// Include header row + limited data rows
				const limitedAoa = [aoa[0], ...aoa.slice(1, maxRows + 1)];
				var processedData = limitedAoa;
			} else {
				var processedData = aoa;
			}

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

