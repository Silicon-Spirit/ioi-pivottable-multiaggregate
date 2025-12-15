/**
 * Composable for field analysis functionality
 * @module useFieldAnalysis
 */

import { ref, computed } from 'vue';
import { countUniqueValuesPerField, categorizeFields, getFieldStatistics } from '../utils/fieldAnalyzer.js';

/**
 * Composable for field analysis
 * @param {Object} options - Configuration options
 * @param {number} options.threshold - Threshold for unique values (default: 50)
 * @returns {Object} Field analysis state and methods
 */
export function useFieldAnalysis(options = {}) {
	const { threshold = 50 } = options;

	// State
	const fieldAnalysis = ref(null);
	const fieldStats = ref({});
	const headerFields = ref([]);
	const aggregationFields = ref([]);

	/**
	 * Analyze fields in data
	 * @param {Array} data - Data array to analyze
	 */
	const analyzeFields = (data) => {
		if (!Array.isArray(data) || data.length === 0) {
			fieldAnalysis.value = null;
			fieldStats.value = {};
			headerFields.value = [];
			aggregationFields.value = [];
			return;
		}

		// Count unique values
		const stats = countUniqueValuesPerField(data);
		fieldStats.value = stats;

		// Categorize fields
		const categorized = categorizeFields(data, threshold);
		headerFields.value = categorized.headerFields;
		aggregationFields.value = categorized.aggregationFields;

		// Store full analysis
		fieldAnalysis.value = {
			fieldStats: stats,
			headerFields: categorized.headerFields,
			aggregationFields: categorized.aggregationFields,
			statistics: getFieldStatistics(data),
		};
	};

	/**
	 * Get numeric fields from data
	 * @param {Array} data - Data array
	 * @returns {Array} Array of numeric field names
	 */
	const getNumericFields = (data) => {
		if (!Array.isArray(data) || data.length === 0) {
			return [];
		}

		const numericFields = [];
		const allFields = Object.keys(data[0] || {});

		for (const field of allFields) {
			const sampleValue = data.find((r) => r[field] != null)?.[field];
			if (typeof sampleValue === 'number') {
				numericFields.push(field);
			}
		}

		return numericFields;
	};

	/**
	 * Get field statistics for a specific field
	 * @param {string} fieldName - Field name
	 * @returns {Object|null} Field statistics or null
	 */
	const getFieldStat = (fieldName) => {
		if (!fieldStats.value[fieldName]) {
			return null;
		}

		return {
			field: fieldName,
			uniqueCount: fieldStats.value[fieldName],
			suitableFor: fieldStats.value[fieldName] > threshold ? 'aggregation' : 'header',
		};
	};

	/**
	 * Check if a field is suitable for headers
	 * @param {string} fieldName - Field name
	 * @returns {boolean} True if suitable for headers
	 */
	const isHeaderField = (fieldName) => {
		return headerFields.value.includes(fieldName);
	};

	/**
	 * Check if a field is suitable for aggregation
	 * @param {string} fieldName - Field name
	 * @returns {boolean} True if suitable for aggregation
	 */
	const isAggregationField = (fieldName) => {
		return aggregationFields.value.includes(fieldName);
	};

	/**
	 * Reset analysis
	 */
	const reset = () => {
		fieldAnalysis.value = null;
		fieldStats.value = {};
		headerFields.value = [];
		aggregationFields.value = [];
	};

	// Computed
	const hasAnalysis = computed(() => fieldAnalysis.value !== null);
	const totalFields = computed(() => Object.keys(fieldStats.value).length);

	return {
		// State
		fieldAnalysis,
		fieldStats,
		headerFields,
		aggregationFields,

		// Computed
		hasAnalysis,
		totalFields,

		// Methods
		analyzeFields,
		getNumericFields,
		getFieldStat,
		isHeaderField,
		isAggregationField,
		reset,
	};
}

