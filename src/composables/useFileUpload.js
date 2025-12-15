/**
 * Composable for handling file uploads (Excel, JSON, CSV)
 * @module useFileUpload
 */

import { ref } from 'vue';
import * as XLSX from 'xlsx';
import { excelWorkerManager } from '../utils/excelWorkerManager.js';

/**
 * Composable for file upload functionality
 * @param {Object} options - Configuration options
 * @param {number} options.maxFileSize - Maximum file size in bytes (default: 50MB)
 * @param {number} options.maxRows - Maximum rows to process (default: 500000)
 * @param {Function} options.onProgress - Progress callback
 * @param {Function} options.onComplete - Completion callback
 * @param {Function} options.onError - Error callback
 * @returns {Object} File upload state and methods
 */
export function useFileUpload(options = {}) {
	const {
		maxFileSize = 50 * 1024 * 1024, // 50MB
		maxRows = 500000,
		onProgress,
		onComplete,
		onError,
	} = options;

	// State
	const uploading = ref(false);
	const uploadProgress = ref(0);
	const uploadError = ref(null);

	/**
	 * Validate file size
	 * @param {File} file - File to validate
	 * @returns {boolean} True if valid
	 */
	const validateFileSize = (file) => {
		if (file.size > maxFileSize) {
			const sizeMB = (file.size / 1024 / 1024).toFixed(2);
			const maxMB = (maxFileSize / 1024 / 1024).toFixed(2);
			uploadError.value = `File is too large (${sizeMB}MB). Maximum file size is ${maxMB}MB.`;
			return false;
		}
		return true;
	};

	/**
	 * Process Excel file
	 * @param {File} file - Excel file
	 * @returns {Promise<Array>} Processed data array
	 */
	const processExcelFile = async (file) => {
		if (!validateFileSize(file)) {
			throw new Error(uploadError.value);
		}

		uploading.value = true;
		uploadProgress.value = 0;
		uploadError.value = null;

		try {
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

				// Check if row limit was reached
				if (result.rowCount >= maxRows) {
					const proceed = confirm(
						`The file contains more than ${maxRows.toLocaleString()} rows. Only the first ${maxRows.toLocaleString()} rows were processed. Continue?`
					);
					if (!proceed) {
						uploading.value = false;
						uploadProgress.value = 0;
						return null;
					}
				}

				if (onComplete) onComplete(result.data);
				return result.data;
			} else {
				// Fallback to synchronous processing
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
					dense: false,
				});

				const firstSheetName = workbook.SheetNames[0];
				const worksheet = workbook.Sheets[firstSheetName];

				let jsonData = XLSX.utils.sheet_to_json(worksheet, {
					raw: true,
					defval: null,
					blankrows: false,
				});

				// Limit rows
				if (jsonData.length > maxRows) {
					const proceed = confirm(
						`The file contains ${jsonData.length.toLocaleString()} rows. Processing more than ${maxRows.toLocaleString()} rows may cause the browser to freeze. Do you want to process only the first ${maxRows.toLocaleString()} rows?`
					);
					if (!proceed) {
						uploading.value = false;
						uploadProgress.value = 0;
						return null;
					}
					jsonData = jsonData.slice(0, maxRows);
				}

				// Process data
				const totalRows = jsonData.length;
				for (let i = 0; i < totalRows; i++) {
					const row = jsonData[i];
					const keys = Object.keys(row);
					for (let j = 0, len = keys.length; j < len; j++) {
						const key = keys[j];
						const value = row[key];
						if (value === '' || value === 'null') {
							row[key] = null;
						}
					}

					if ((i + 1) % 10000 === 0 || i === totalRows - 1) {
						uploadProgress.value = Math.round(((i + 1) / totalRows) * 100);
						if (onProgress) onProgress({ percentage: uploadProgress.value });
						if (i % 50000 === 0 && i > 0) {
							await new Promise((resolve) => setTimeout(resolve, 0));
						}
					}
				}

				if (onComplete) onComplete(jsonData);
				return jsonData;
			}
		} catch (error) {
			uploadError.value = error.message || 'Failed to process Excel file';
			if (onError) onError(error);
			throw error;
		} finally {
			uploading.value = false;
			uploadProgress.value = 0;
		}
	};

	/**
	 * Process JSON file
	 * @param {File} file - JSON file
	 * @returns {Promise<Array>} Processed data array
	 */
	const processJsonFile = async (file) => {
		if (!validateFileSize(file)) {
			throw new Error(uploadError.value);
		}

		uploading.value = true;
		uploadError.value = null;

		try {
			const fileText = await file.text();
			let jsonData;

			try {
				jsonData = JSON.parse(fileText);
			} catch (parseError) {
				throw new Error('Invalid JSON format: ' + parseError.message);
			}

			if (!Array.isArray(jsonData)) {
				throw new Error('JSON file must contain an array of objects');
			}

			// Limit rows
			if (jsonData.length > maxRows) {
				const proceed = confirm(
					`The file contains ${jsonData.length.toLocaleString()} rows. Processing more than ${maxRows.toLocaleString()} rows may cause the browser to freeze. Do you want to process only the first ${maxRows.toLocaleString()} rows?`
				);
				if (!proceed) {
					uploading.value = false;
					return null;
				}
				jsonData = jsonData.slice(0, maxRows);
			}

			// Process data in chunks
			const chunkSize = 1000;
			const processedData = [];

			// Process first chunk
			for (let i = 0; i < Math.min(chunkSize, jsonData.length); i++) {
				const row = jsonData[i];
				const processedRow = {};
				for (const key in row) {
					let value = row[key];
					if (value === '' || value === 'null') {
						value = null;
					} else if (typeof value === 'string' && value.trim() !== '') {
						const numValue = parseFloat(value);
						if (!isNaN(numValue) && isFinite(numValue) && value.trim() === String(numValue)) {
							value = numValue;
						}
					}
					processedRow[key] = value;
				}
				processedData.push(processedRow);
			}

			// Process remaining chunks
			if (jsonData.length > chunkSize) {
				await new Promise((resolve) => {
					let currentIndex = chunkSize;

					const processChunk = () => {
						const endIndex = Math.min(currentIndex + chunkSize, jsonData.length);

						for (let i = currentIndex; i < endIndex; i++) {
							const row = jsonData[i];
							const processedRow = {};
							for (const key in row) {
								let value = row[key];
								if (value === '' || value === 'null') {
									value = null;
								} else if (typeof value === 'string' && value.trim() !== '') {
									const numValue = parseFloat(value);
									if (!isNaN(numValue) && isFinite(numValue) && value.trim() === String(numValue)) {
										value = numValue;
									}
								}
								processedRow[key] = value;
							}
							processedData.push(processedRow);
						}

						currentIndex = endIndex;

						if (currentIndex < jsonData.length) {
							setTimeout(processChunk, 0);
						} else {
							resolve();
						}
					};

					processChunk();
				});
			}

			if (onComplete) onComplete(processedData);
			return processedData;
		} catch (error) {
			uploadError.value = error.message || 'Failed to process JSON file';
			if (onError) onError(error);
			throw error;
		} finally {
			uploading.value = false;
		}
	};

	/**
	 * Handle file upload based on file type
	 * @param {File} file - File to upload
	 * @returns {Promise<Array>} Processed data array
	 */
	const handleFileUpload = async (file) => {
		if (!file) {
			return null;
		}

		const fileExtension = file.name.split('.').pop().toLowerCase();

		switch (fileExtension) {
			case 'xlsx':
			case 'xls':
			case 'csv':
				return await processExcelFile(file);
			case 'json':
				return await processJsonFile(file);
			default:
				throw new Error(`Unsupported file type: ${fileExtension}`);
		}
	};

	/**
	 * Reset upload state
	 */
	const reset = () => {
		uploading.value = false;
		uploadProgress.value = 0;
		uploadError.value = null;
	};

	return {
		// State
		uploading,
		uploadProgress,
		uploadError,

		// Methods
		handleFileUpload,
		processExcelFile,
		processJsonFile,
		validateFileSize,
		reset,
	};
}

