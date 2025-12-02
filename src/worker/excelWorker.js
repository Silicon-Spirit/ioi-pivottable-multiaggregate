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
			const workbook = XLSX.read(arrayBuffer, { 
				type: 'array',
				cellDates: false, // Disable date parsing (faster, we'll handle dates differently if needed)
				cellNF: false, // Don't parse number formats
				cellStyles: false, // Don't parse styles
				sheetStubs: false,
				bookSheets: false, // Don't parse all sheets metadata
				bookProps: false, // Don't parse book properties
				bookFiles: false, // Don't parse file list
				bookVBA: false, // Don't parse VBA
				password: '', // No password
				WTF: false, // Don't warn on unexpected file types
				dense: false // Use sparse mode (faster for large files)
			});
			
			// Get first sheet
			const firstSheetName = workbook.SheetNames[0];
			const worksheet = workbook.Sheets[firstSheetName];
			
			// Use raw values for maximum speed - avoid string conversions
			// This is MUCH faster than raw: false
			let jsonData = XLSX.utils.sheet_to_json(worksheet, {
				raw: true, // Keep raw values (numbers stay numbers, faster!)
				defval: null, // Default value for empty cells
				blankrows: false // Skip blank rows
			});

			// Limit rows if needed (do this before processing)
			const totalRows = Math.min(jsonData.length, maxRows);
			if (jsonData.length > maxRows) {
				jsonData = jsonData.slice(0, maxRows);
			}

			const transformStart = performance.now();
			
			// CRITICAL OPTIMIZATION: Modify rows in-place instead of creating new objects
			// This eliminates object creation overhead which is the main bottleneck
			// Use for...in which is faster for sparse objects (typical in Excel data)
			for (let i = 0; i < totalRows; i++) {
				const row = jsonData[i];
				
				// Fast in-place modification - only convert empty strings to null
				// Combine checks for better branch prediction
				for (const key in row) {
					const value = row[key];
					// Only convert empty strings - everything else stays as-is
					if (value === '' || value === 'null') {
						row[key] = null;
					}
				}
			}

			const transformTime = performance.now();
			
			// Use the modified jsonData directly - no need to copy
			const processedData = jsonData;

			const processTime = performance.now();
			const totalDuration = processTime - startTime;
			
			console.log(`[Performance] Excel Processing: ${totalDuration.toFixed(2)}ms for ${totalRows} rows`);

			// Send progress updates less frequently to reduce overhead
			// Only send updates at 25%, 50%, 75%, and 100%
			const milestones = [0.25, 0.5, 0.75, 1.0];
			for (const milestone of milestones) {
				const progress = Math.floor(totalRows * milestone);
				if (progress > 0 && progress <= totalRows) {
					self.postMessage({
						id,
						type: 'PROGRESS',
						payload: {
							processed: progress,
							total: totalRows,
							percentage: Math.round(milestone * 100)
						}
					});
				}
			}

			// Send final result
			self.postMessage({
				id,
				type: 'SUCCESS',
				payload: {
					data: processedData,
					rowCount: processedData.length
				}
			});
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

