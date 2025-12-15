/**
 * Data manipulation helper functions
 * @module dataHelpers
 */

/**
 * Deep clone an object or array
 * @param {*} obj - Object or array to clone
 * @returns {*} Cloned object or array
 */
export function deepClone(obj) {
	if (obj === null || typeof obj !== 'object') {
		return obj;
	}

	if (obj instanceof Date) {
		return new Date(obj.getTime());
	}

	if (obj instanceof Array) {
		return obj.map((item) => deepClone(item));
	}

	if (typeof obj === 'object') {
		const cloned = {};
		for (const key in obj) {
			if (obj.hasOwnProperty(key)) {
				cloned[key] = deepClone(obj[key]);
			}
		}
		return cloned;
	}

	return obj;
}

/**
 * Get unique values from an array
 * @param {Array} array - Array to get unique values from
 * @returns {Array} Array of unique values
 */
export function getUniqueValues(array) {
	if (!Array.isArray(array)) {
		return [];
	}
	return [...new Set(array)];
}

/**
 * Get unique values for a specific field in an array of objects
 * @param {Array} data - Array of objects
 * @param {string} field - Field name
 * @returns {Array} Array of unique values
 */
export function getUniqueFieldValues(data, field) {
	if (!Array.isArray(data) || !field) {
		return [];
	}

	const uniqueValues = new Set();
	data.forEach((record) => {
		const value = record[field];
		if (value === null || value === undefined) {
			uniqueValues.add('null');
		} else {
			uniqueValues.add(String(value));
		}
	});

	return Array.from(uniqueValues);
}

/**
 * Filter data by field value
 * @param {Array} data - Array of objects
 * @param {string} field - Field name
 * @param {*} value - Value to filter by
 * @returns {Array} Filtered array
 */
export function filterByField(data, field, value) {
	if (!Array.isArray(data) || !field) {
		return [];
	}

	return data.filter((record) => {
		const recordValue = record[field];
		if (value === null || value === undefined) {
			return recordValue === null || recordValue === undefined;
		}
		return recordValue === value;
	});
}

/**
 * Group data by a field
 * @param {Array} data - Array of objects
 * @param {string} field - Field name to group by
 * @returns {Object} Object with field values as keys and arrays of records as values
 */
export function groupByField(data, field) {
	if (!Array.isArray(data) || !field) {
		return {};
	}

	const grouped = {};
	data.forEach((record) => {
		const key = record[field] ?? 'null';
		if (!grouped[key]) {
			grouped[key] = [];
		}
		grouped[key].push(record);
	});

	return grouped;
}

/**
 * Sort data by a field
 * @param {Array} data - Array of objects
 * @param {string} field - Field name to sort by
 * @param {string} direction - Sort direction ('asc' or 'desc', default: 'asc')
 * @returns {Array} Sorted array
 */
export function sortByField(data, field, direction = 'asc') {
	if (!Array.isArray(data) || !field) {
		return [];
	}

	const sorted = [...data];
	sorted.sort((a, b) => {
		const aVal = a[field];
		const bVal = b[field];

		// Handle null/undefined
		if (aVal === null || aVal === undefined) return 1;
		if (bVal === null || bVal === undefined) return -1;

		// Compare values
		if (aVal < bVal) return direction === 'asc' ? -1 : 1;
		if (aVal > bVal) return direction === 'asc' ? 1 : -1;
		return 0;
	});

	return sorted;
}

/**
 * Get all field names from an array of objects
 * @param {Array} data - Array of objects
 * @returns {Array} Array of field names
 */
export function getFieldNames(data) {
	if (!Array.isArray(data) || data.length === 0) {
		return [];
	}

	const fields = new Set();
	data.forEach((record) => {
		if (typeof record === 'object' && record !== null) {
			Object.keys(record).forEach((key) => fields.add(key));
		}
	});

	return Array.from(fields);
}

/**
 * Get numeric fields from data
 * @param {Array} data - Array of objects
 * @returns {Array} Array of numeric field names
 */
export function getNumericFields(data) {
	if (!Array.isArray(data) || data.length === 0) {
		return [];
	}

	const numericFields = [];
	const allFields = getFieldNames(data);

	allFields.forEach((field) => {
		const sampleValue = data.find((r) => r[field] != null)?.[field];
		if (typeof sampleValue === 'number') {
			numericFields.push(field);
		}
	});

	return numericFields;
}

/**
 * Calculate statistics for a numeric field
 * @param {Array} data - Array of objects
 * @param {string} field - Field name
 * @returns {Object} Statistics object with min, max, sum, avg, count
 */
export function calculateFieldStatistics(data, field) {
	if (!Array.isArray(data) || !field) {
		return null;
	}

	const values = data
		.map((record) => record[field])
		.filter((val) => typeof val === 'number' && !isNaN(val));

	if (values.length === 0) {
		return null;
	}

	const sum = values.reduce((acc, val) => acc + val, 0);
	const min = Math.min(...values);
	const max = Math.max(...values);
	const avg = sum / values.length;

	return {
		min,
		max,
		sum,
		avg,
		count: values.length,
	};
}

/**
 * Transform data by mapping fields
 * @param {Array} data - Array of objects
 * @param {Object} fieldMap - Object mapping old field names to new field names
 * @returns {Array} Transformed array
 */
export function transformFields(data, fieldMap) {
	if (!Array.isArray(data) || !fieldMap) {
		return data;
	}

	return data.map((record) => {
		const transformed = {};
		for (const oldField in fieldMap) {
			const newField = fieldMap[oldField];
			transformed[newField] = record[oldField];
		}
		return { ...record, ...transformed };
	});
}

/**
 * Remove null/undefined values from objects
 * @param {Array} data - Array of objects
 * @returns {Array} Array with null/undefined values removed
 */
export function removeNullValues(data) {
	if (!Array.isArray(data)) {
		return data;
	}

	return data.map((record) => {
		const cleaned = {};
		for (const key in record) {
			if (record[key] !== null && record[key] !== undefined) {
				cleaned[key] = record[key];
			}
		}
		return cleaned;
	});
}

