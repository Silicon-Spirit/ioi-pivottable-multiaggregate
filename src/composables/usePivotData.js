/**
 * Composable for managing pivot table data
 * Provides reactive data management, field analysis, and data transformation utilities
 * 
 * @example
 * ```javascript
 * import { usePivotData } from 'vue3-pivottable/composables';
 * 
 * const { 
 *   data, 
 *   fields, 
 *   fieldStats, 
 *   loadData, 
 *   analyzeFields,
 *   clearData 
 * } = usePivotData();
 * ```
 */

import { ref, shallowRef, computed, watch } from 'vue';
import { countUniqueValuesPerField } from '../utils/fieldAnalyzer.js';

/**
 * Composable for managing pivot table data
 * @param {Object} options - Configuration options
 * @param {Array|Function|Object} options.initialData - Initial data to load
 * @param {Boolean} options.autoAnalyze - Automatically analyze fields when data changes (default: true)
 * @returns {Object} Reactive data and utility functions
 */
export function usePivotData(options = {}) {
	const { initialData = null, autoAnalyze = true } = options;

	// Reactive state
	const data = shallowRef(initialData || []);
	const fieldStats = shallowRef(null);
	const isLoading = ref(false);
	const error = ref(null);

	/**
	 * Computed property for available fields
	 * Extracts field names from the data structure
	 */
	const fields = computed(() => {
		if (!data.value || data.value.length === 0) {
			return [];
		}

		// Handle array of arrays (from Excel)
		if (Array.isArray(data.value[0])) {
			return data.value[0] || [];
		}

		// Handle array of objects
		if (typeof data.value[0] === 'object' && data.value[0] !== null) {
			return Object.keys(data.value[0]);
		}

		return [];
	});

	/**
	 * Computed property for data row count
	 */
	const rowCount = computed(() => {
		if (!data.value) return 0;
		// Exclude header row for array of arrays
		if (Array.isArray(data.value[0]) && Array.isArray(data.value[0])) {
			return Math.max(0, data.value.length - 1);
		}
		return data.value.length;
	});

	/**
	 * Computed property indicating if data is in array of arrays format
	 */
	const isArrayOfArrays = computed(() => {
		return Array.isArray(data.value) && 
		       data.value.length > 0 && 
		       Array.isArray(data.value[0]);
	});

	/**
	 * Load data into the pivot table
	 * @param {Array|Function|Object} newData - Data to load
	 * @param {Object} options - Loading options
	 * @param {Boolean} options.analyze - Analyze fields after loading (default: true)
	 */
	const loadData = async (newData, options = {}) => {
		const { analyze = true } = options;
		
		try {
			isLoading.value = true;
			error.value = null;

			// Handle function that returns data
			if (typeof newData === 'function') {
				const result = await newData();
				data.value = result;
			} else {
				data.value = newData;
			}

			if (analyze && autoAnalyze) {
				await analyzeFields();
			}
		} catch (err) {
			error.value = err.message || 'Failed to load data';
			console.error('Error loading pivot data:', err);
		} finally {
			isLoading.value = false;
		}
	};

	/**
	 * Analyze fields in the current data
	 * Calculates unique value counts and statistics for each field
	 * @returns {Promise<Object>} Field statistics
	 */
	const analyzeFields = async () => {
		if (!data.value || data.value.length === 0) {
			fieldStats.value = null;
			return null;
		}

		try {
			const stats = await countUniqueValuesPerField(data.value);
			fieldStats.value = stats;
			return stats;
		} catch (err) {
			console.error('Error analyzing fields:', err);
			fieldStats.value = null;
			return null;
		}
	};

	/**
	 * Clear all data and reset state
	 */
	const clearData = () => {
		data.value = [];
		fieldStats.value = null;
		error.value = null;
		isLoading.value = false;
	};

	/**
	 * Get field statistics for a specific field
	 * @param {String} fieldName - Name of the field
	 * @returns {Object|null} Field statistics or null if not found
	 */
	const getFieldStats = (fieldName) => {
		if (!fieldStats.value || !fieldStats.value[fieldName]) {
			return null;
		}
		return fieldStats.value[fieldName];
	};

	/**
	 * Check if a field exists in the data
	 * @param {String} fieldName - Name of the field to check
	 * @returns {Boolean} True if field exists
	 */
	const hasField = (fieldName) => {
		return fields.value.includes(fieldName);
	};

	/**
	 * Get sample values for a field
	 * @param {String} fieldName - Name of the field
	 * @param {Number} limit - Maximum number of samples (default: 10)
	 * @returns {Array} Array of sample values
	 */
	const getFieldSamples = (fieldName, limit = 10) => {
		if (!data.value || data.value.length === 0 || !hasField(fieldName)) {
			return [];
		}

		const samples = [];
		const maxRows = isArrayOfArrays.value ? data.value.length : data.value.length;
		const startRow = isArrayOfArrays.value ? 1 : 0; // Skip header for AoA

		for (let i = startRow; i < maxRows && samples.length < limit; i++) {
			const row = data.value[i];
			let value;

			if (isArrayOfArrays.value) {
				const fieldIndex = fields.value.indexOf(fieldName);
				value = fieldIndex >= 0 && row ? row[fieldIndex] : undefined;
			} else {
				value = row[fieldName];
			}

			if (value !== undefined && value !== null && !samples.includes(value)) {
				samples.push(value);
			}
		}

		return samples;
	};

	// Auto-analyze when data changes (if enabled)
	if (autoAnalyze) {
		watch(data, (newData) => {
			if (newData && newData.length > 0) {
				analyzeFields();
			}
		}, { deep: false });
	}

	return {
		// State
		data,
		fields,
		fieldStats,
		isLoading,
		error,
		rowCount,
		isArrayOfArrays,

		// Methods
		loadData,
		analyzeFields,
		clearData,
		getFieldStats,
		hasField,
		getFieldSamples,
	};
}

