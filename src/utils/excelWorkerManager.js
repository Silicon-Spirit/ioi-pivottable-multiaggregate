// Manager for Web Worker-based Excel file processing
// Handles worker lifecycle, communication, and progress updates

class ExcelWorkerManager {
	constructor() {
		this.worker = null;
		this.pendingRequests = new Map();
		this.requestId = 0;
		this.isWorkerSupported = typeof Worker !== 'undefined';
		this.isInitialized = false;
		this.initError = null;
	}

	/**
	 * Initialize the Web Worker
	 * @returns {boolean} True if initialization was successful, false otherwise
	 */
	init() {
		if (!this.isWorkerSupported) {
			console.warn('[ExcelWorkerManager] Web Workers are not supported in this browser');
			return false;
		}

		if (this.isInitialized && this.worker) {
			return true;
		}

		try {
			// Create worker from the worker file
			this.worker = new Worker(new URL('../worker/excelWorker.js', import.meta.url), {
				type: 'module'
			});

			// Set up message handler
			this.worker.onmessage = (e) => {
				this.handleWorkerMessage(e);
			};

			// Set up error handler
			this.worker.onerror = (error) => {
				console.error('[ExcelWorkerManager] Worker error:', error);
				this.handleWorkerError(error);
			};

			// Set up message error handler (for uncaught errors in worker)
			this.worker.onmessageerror = (error) => {
				console.error('[ExcelWorkerManager] Worker message error:', error);
				this.handleWorkerError(error);
			};

			this.isInitialized = true;
			this.initError = null;
			return true;
		} catch (error) {
			console.error('[ExcelWorkerManager] Failed to initialize worker:', error);
			this.initError = error;
			this.isInitialized = false;
			return false;
		}
	}

	/**
	 * Handle messages from the worker
	 * @param {MessageEvent} e - Message event from worker
	 */
	handleWorkerMessage(e) {
		const { id, type, payload } = e.data;

		if (type === 'ERROR') {
			const request = this.pendingRequests.get(id);
			if (request) {
				const errorObj = new Error(payload.error || 'Unknown error in worker');
				if (payload.stack) {
					errorObj.stack = payload.stack;
				}
				request.reject(errorObj);
				this.pendingRequests.delete(id);
			}
			return;
		}

		if (type === 'PROGRESS') {
			const request = this.pendingRequests.get(id);
			if (request && request.onProgress) {
				request.onProgress(payload);
			}
			return;
		}

		if (type === 'SUCCESS') {
			const request = this.pendingRequests.get(id);
			if (request) {
				request.resolve(payload);
				this.pendingRequests.delete(id);
			}
			return;
		}

		// Unknown message type
		console.warn('[ExcelWorkerManager] Unknown message type:', type);
	}

	/**
	 * Handle worker errors
	 * @param {Error} error - Error from worker
	 */
	handleWorkerError(error) {
		// Reject all pending requests
		for (const [id, request] of this.pendingRequests.entries()) {
			request.reject(error);
			this.pendingRequests.delete(id);
		}
	}

	/**
	 * Check if worker is available
	 * @returns {boolean} True if worker is available and initialized
	 */
	isAvailable() {
		return this.isWorkerSupported && this.isInitialized && this.worker !== null;
	}

	/**
	 * Process Excel file in worker
	 * @param {ArrayBuffer} arrayBuffer - Excel file as ArrayBuffer
	 * @param {Object} options - Processing options
	 * @param {number} options.maxRows - Maximum number of rows to process (default: 500000)
	 * @param {Function} options.onProgress - Progress callback (processed, total, percentage)
	 * @returns {Promise<Object>} Promise that resolves with processed data
	 */
	async processExcel(arrayBuffer, options = {}) {
		if (!this.isAvailable()) {
			// Try to initialize if not already done
			if (!this.init()) {
				throw new Error('Web Worker is not available. Falling back to synchronous processing.');
			}
		}

		return new Promise((resolve, reject) => {
			const id = ++this.requestId;
			
			// Store request with progress callback
			this.pendingRequests.set(id, {
				resolve,
				reject,
				onProgress: options.onProgress || null
			});

			// Send message to worker
			this.worker.postMessage({
				id,
				type: 'PROCESS_EXCEL',
				payload: {
					arrayBuffer,
					maxRows: options.maxRows || 500000
				}
			});
		});
	}

	/**
	 * Terminate the worker
	 */
	terminate() {
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
			this.isInitialized = false;
			this.pendingRequests.clear();
		}
	}
}

// Export singleton instance
export const excelWorkerManager = new ExcelWorkerManager();

// Auto-initialize on import
if (typeof window !== 'undefined') {
	excelWorkerManager.init();
}

