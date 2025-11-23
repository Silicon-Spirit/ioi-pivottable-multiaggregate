// Manager for Web Worker-based pivot calculations
// Handles worker lifecycle, communication, and error management for multi-aggregation pivot tables

class PivotWorkerManager {
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
			console.warn('[PivotWorkerManager] Web Workers are not supported in this browser');
			return false;
		}

		if (this.isInitialized && this.worker) {
			return true;
		}

		try {
			// Create worker from the worker file
			this.worker = new Worker(new URL('../worker/pivotWorker.js', import.meta.url), {
				type: 'module'
			});

			// Set up message handler
			this.worker.onmessage = (e) => {
				this.handleWorkerMessage(e);
			};

			// Set up error handler
			this.worker.onerror = (error) => {
				console.error('[PivotWorkerManager] Worker error:', error);
				this.handleWorkerError(error);
			};

			// Set up message error handler (for uncaught errors in worker)
			this.worker.onmessageerror = (error) => {
				console.error('[PivotWorkerManager] Worker message error:', error);
				this.handleWorkerError(error);
			};

			this.isInitialized = true;
			this.initError = null;
			return true;
		} catch (error) {
			console.error('[PivotWorkerManager] Failed to initialize worker:', error);
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
		const { id, type, result, error, stack } = e.data;

		if (type === 'ERROR') {
			const request = this.pendingRequests.get(id);
			if (request) {
				const errorObj = new Error(error || 'Unknown error in worker');
				if (stack) {
					errorObj.stack = stack;
				}
				request.reject(errorObj);
				this.pendingRequests.delete(id);
			}
			return;
		}

		if (type === 'PIVOT_CALCULATED') {
			const request = this.pendingRequests.get(id);
			if (request) {
				request.resolve(result);
				this.pendingRequests.delete(id);
			}
			return;
		}

		// Unknown message type
		console.warn('[PivotWorkerManager] Received unknown message type:', type);
	}

	/**
	 * Handle worker errors
	 * @param {Error} error - Error from worker
	 */
	handleWorkerError(error) {
		// Reject all pending requests
		const errorMessage = error.message || 'Worker error occurred';
		const workerError = new Error(errorMessage);
		
		for (const [id, request] of this.pendingRequests.entries()) {
			request.reject(workerError);
		}
		this.pendingRequests.clear();
	}

	/**
	 * Calculate pivot table data using Web Worker
	 * @param {Object} config - Configuration object for pivot calculation
	 * @param {Array} config.data - Input data array
	 * @param {Array} config.rows - Row attributes
	 * @param {Array} config.cols - Column attributes
	 * @param {Array} config.vals - Value attributes
	 * @param {Array} config.aggregatorNames - Aggregator names (for multi-aggregation)
	 * @param {Object} config.aggregatorVals - Per-aggregator value fields
	 * @param {Object} config.valueFilter - Value filters
	 * @param {string} config.rowOrder - Row ordering
	 * @param {string} config.colOrder - Column ordering
	 * @returns {Promise<Object>} Promise that resolves with pivot calculation result
	 */
	calculatePivot(config) {
		return new Promise((resolve, reject) => {
			// Ensure worker is initialized
			if (!this.isInitialized) {
				const initSuccess = this.init();
				if (!initSuccess) {
					reject(new Error('Worker initialization failed'));
					return;
				}
			}

			if (!this.worker) {
				reject(new Error('Worker not available'));
				return;
			}

			// Generate unique request ID
			const id = ++this.requestId;
			
			// Store request for later resolution
			this.pendingRequests.set(id, { resolve, reject });

			// Set timeout for request (60 seconds)
			const timeoutId = setTimeout(() => {
				if (this.pendingRequests.has(id)) {
					this.pendingRequests.delete(id);
					reject(new Error('Pivot calculation timeout after 60 seconds'));
				}
			}, 60000);

			// Override reject to clear timeout
			const originalReject = reject;
			this.pendingRequests.get(id).reject = (error) => {
				clearTimeout(timeoutId);
				originalReject(error);
			};

			// Override resolve to clear timeout
			const originalResolve = resolve;
			this.pendingRequests.get(id).resolve = (result) => {
				clearTimeout(timeoutId);
				originalResolve(result);
			};

			try {
				// Send calculation request to worker
				this.worker.postMessage({
					id,
					type: 'CALCULATE_PIVOT',
					payload: config
				});
			} catch (error) {
				// If postMessage fails, clean up and reject
				clearTimeout(timeoutId);
				this.pendingRequests.delete(id);
				reject(new Error(`Failed to send message to worker: ${error.message}`));
			}
		});
	}

	/**
	 * Terminate the worker and clean up
	 */
	terminate() {
		if (this.worker) {
			// Reject all pending requests
			for (const [id, request] of this.pendingRequests.entries()) {
				request.reject(new Error('Worker terminated'));
			}
			this.pendingRequests.clear();

			// Terminate the worker
			this.worker.terminate();
			this.worker = null;
			this.isInitialized = false;
		}
	}

	/**
	 * Check if worker is available and ready
	 * @returns {boolean} True if worker is available, false otherwise
	 */
	isAvailable() {
		return this.isWorkerSupported && this.isInitialized && this.worker !== null;
	}

	/**
	 * Get the number of pending requests
	 * @returns {number} Number of pending requests
	 */
	getPendingRequestCount() {
		return this.pendingRequests.size;
	}

	/**
	 * Cancel all pending requests
	 */
	cancelAllRequests() {
		for (const [id, request] of this.pendingRequests.entries()) {
			request.reject(new Error('Request cancelled'));
		}
		this.pendingRequests.clear();
	}
}

// Singleton instance
export const pivotWorkerManager = new PivotWorkerManager();

// Initialize on import (only in browser environment)
if (typeof window !== 'undefined') {
	// Initialize worker when module loads
	pivotWorkerManager.init();
	
	// Clean up worker when page unloads
	if (typeof window.addEventListener !== 'undefined') {
		window.addEventListener('beforeunload', () => {
			pivotWorkerManager.terminate();
		});
	}
}
