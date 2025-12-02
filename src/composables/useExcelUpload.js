/**
 * Composable for handling Excel file uploads and processing
 * Provides file upload functionality with progress tracking and worker support
 * 
 * @example
 * ```javascript
 * import { useExcelUpload } from 'vue3-pivottable/composables';
 * 
 * const {
 *   uploading,
 *   uploadProgress,
 *   uploadFile,
 *   processExcel
 * } = useExcelUpload({
 *   onSuccess: (data) => console.log('Data loaded:', data),
 *   onError: (error) => console.error('Upload failed:', error)
 * });
 * ```
 */

import { ref } from 'vue';
import { excelWorkerManager } from '../utils/excelWorkerManager.js';
import * as XLSX from 'xlsx';

/**
 * Composable for handling Excel file uploads
 * @param {Object} options - Configuration options
 * @param {Function} options.onSuccess - Callback when upload succeeds
 * @param {Function} options.onError - Callback when upload fails
 * @param {Function} options.onProgress - Callback for progress updates
 * @param {Number} options.maxRows - Maximum rows to process (default: 500000)
 * @param {Number} options.maxFileSize - Maximum file size in bytes (default: 50MB)
 * @returns {Object} Upload state and utility functions
 */
export function useExcelUpload(options = {}) {
	const {
		onSuccess = null,
		onError = null,
		onProgress = null,
		maxRows = 500000,
		maxFileSize = 50 * 1024 * 1024, // 50MB
	} = options;

	// Reactive state
	const uploading = ref(false);
	const uploadProgress = ref(0);
	const error = ref(null);
	const processedData = ref(null);

	/**
	 * Process Excel file using Web Worker or synchronous fallback
	 * @param {File} file - Excel file to process
	 * @returns {Promise<Array>} Processed data as array of arrays
	 */
	const processExcel = async (file) => {
		if (!file) {
			throw new Error('No file provided');
		}

		// Check file size
		if (file.size > maxFileSize) {
			const errorMsg = `File is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum file size is ${(maxFileSize / 1024 / 1024).toFixed(2)}MB.`;
			error.value = errorMsg;
			if (onError) onError(new Error(errorMsg));
			throw new Error(errorMsg);
		}

		uploading.value = true;
		uploadProgress.value = 0;
		error.value = null;

		try {
			// Read file as ArrayBuffer
			const arrayBuffer = await file.arrayBuffer();

			// Try to use Web Worker for processing
			if (excelWorkerManager.isAvailable()) {
				const result = await excelWorkerManager.processExcel(arrayBuffer, {
					maxRows,
					onProgress: (progress) => {
						uploadProgress.value = progress.percentage;
						if (onProgress) onProgress(progress);
					},
				});

				processedData.value = result.data;
				uploadProgress.value = 100;

				if (onSuccess) onSuccess(result.data);
				return result.data;
			} else {
				// Fallback to synchronous processing
				uploadProgress.value = 50;

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
					WTF: false,
					dense: true,
				});

				const firstSheetName = workbook.SheetNames[0];
				const worksheet = workbook.Sheets[firstSheetName];

				let data;
				if (worksheet['!data'] && Array.isArray(worksheet['!data'])) {
					// Dense mode: use !data directly
					const rawData = worksheet['!data'];
					const rowsToProcess = Math.min(rawData.length, maxRows + 1);
					data = new Array(rowsToProcess);

					for (let i = 0; i < rowsToProcess; i++) {
						const row = rawData[i];
						if (!Array.isArray(row)) {
							data[i] = [];
							continue;
						}

						const rowLength = row.length;
						const newRow = new Array(rowLength);

						for (let j = 0; j < rowLength; j++) {
							const cell = row[j];
							newRow[j] = (cell && typeof cell === 'object' && 'v' in cell)
								? (cell.v != null ? cell.v : null)
								: (cell != null ? cell : null);
						}
						data[i] = newRow;
					}
				} else {
					// Sparse mode: use sheet_to_json
					data = XLSX.utils.sheet_to_json(worksheet, {
						raw: true,
						defval: null,
						blankrows: false,
						header: 1,
					});
				}

				if (data.length - 1 > maxRows) {
					data = data.slice(0, maxRows + 1);
				}

				uploadProgress.value = 100;
				processedData.value = data;

				if (onSuccess) onSuccess(data);
				return data;
			}
		} catch (err) {
			error.value = err.message || 'Failed to process Excel file';
			console.error('Excel upload error:', err);
			if (onError) onError(err);
			throw err;
		} finally {
			uploading.value = false;
		}
	};

	/**
	 * Upload file from input element
	 * @param {Event} event - File input change event
	 * @returns {Promise<Array>} Processed data
	 */
	const uploadFile = async (event) => {
		const file = event.target?.files?.[0];
		if (!file) {
			return null;
		}

		return await processExcel(file);
	};

	/**
	 * Reset upload state
	 */
	const reset = () => {
		uploading.value = false;
		uploadProgress.value = 0;
		error.value = null;
		processedData.value = null;
	};

	return {
		// State
		uploading,
		uploadProgress,
		error,
		processedData,

		// Methods
		processExcel,
		uploadFile,
		reset,
	};
}

