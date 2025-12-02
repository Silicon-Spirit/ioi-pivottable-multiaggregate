/**
 * Data transformation helpers for pivot tables
 * Utilities for converting between different data formats and structures
 */

/**
 * Convert array of arrays to array of objects
 * @param {Array<Array>} aoa - Array of arrays (first row is headers)
 * @returns {Array<Object>} Array of objects
 * 
 * @example
 * ```javascript
 * const aoa = [
 *   ['name', 'age', 'city'],
 *   ['John', 30, 'NYC'],
 *   ['Jane', 25, 'LA']
 * ];
 * const objects = arrayOfArraysToObjects(aoa);
 * // Result: [
 * //   { name: 'John', age: 30, city: 'NYC' },
 * //   { name: 'Jane', age: 25, city: 'LA' }
 * // ]
 * ```
 */
export function arrayOfArraysToObjects(aoa) {
	if (!Array.isArray(aoa) || aoa.length === 0) {
		return [];
	}

	const headers = aoa[0];
	if (!Array.isArray(headers)) {
		return [];
	}

	return aoa.slice(1).map(row => {
		const obj = {};
		headers.forEach((header, index) => {
			obj[header] = row[index] !== undefined ? row[index] : null;
		});
		return obj;
	});
}

/**
 * Convert array of objects to array of arrays
 * @param {Array<Object>} objects - Array of objects
 * @param {Array<String>} headers - Optional array of header names (uses object keys if not provided)
 * @returns {Array<Array>} Array of arrays (first row is headers)
 * 
 * @example
 * ```javascript
 * const objects = [
 *   { name: 'John', age: 30, city: 'NYC' },
 *   { name: 'Jane', age: 25, city: 'LA' }
 * ];
 * const aoa = objectsToArrayOfArrays(objects);
 * // Result: [
 * //   ['name', 'age', 'city'],
 * //   ['John', 30, 'NYC'],
 * //   ['Jane', 25, 'LA']
 * // ]
 * ```
 */
export function objectsToArrayOfArrays(objects, headers = null) {
	if (!Array.isArray(objects) || objects.length === 0) {
		return headers ? [headers] : [];
	}

	// Get headers from first object if not provided
	if (!headers) {
		headers = Object.keys(objects[0]);
	}

	const result = [headers];
	objects.forEach(obj => {
		const row = headers.map(header => obj[header] !== undefined ? obj[header] : null);
		result.push(row);
	});

	return result;
}

/**
 * Normalize data format to array of objects
 * Handles various input formats and converts to consistent structure
 * @param {Array|Object|Function} data - Data in various formats
 * @returns {Promise<Array<Object>>} Normalized array of objects
 */
export async function normalizeData(data) {
	if (!data) {
		return [];
	}

	// Handle function that returns data
	if (typeof data === 'function') {
		const result = await data();
		return normalizeData(result);
	}

	// Handle array of arrays
	if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
		return arrayOfArraysToObjects(data);
	}

	// Handle array of objects
	if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
		return data;
	}

	// Handle single object (convert to array)
	if (typeof data === 'object' && !Array.isArray(data)) {
		return [data];
	}

	return [];
}

/**
 * Filter data by field values
 * @param {Array<Object>} data - Data to filter
 * @param {String} fieldName - Field name to filter by
 * @param {Array|Function} filterValue - Values to include or filter function
 * @returns {Array<Object>} Filtered data
 */
export function filterDataByField(data, fieldName, filterValue) {
	if (!Array.isArray(data) || !fieldName) {
		return data;
	}

	if (typeof filterValue === 'function') {
		return data.filter(row => filterValue(row[fieldName]));
	}

	if (Array.isArray(filterValue)) {
		return data.filter(row => filterValue.includes(row[fieldName]));
	}

	return data.filter(row => row[fieldName] === filterValue);
}

/**
 * Get unique values for a field
 * @param {Array<Object>} data - Data array
 * @param {String} fieldName - Field name
 * @returns {Array} Array of unique values
 */
export function getUniqueValues(data, fieldName) {
	if (!Array.isArray(data) || !fieldName) {
		return [];
	}

	const values = new Set();
	data.forEach(row => {
		const value = row[fieldName];
		if (value !== null && value !== undefined) {
			values.add(value);
		}
	});

	return Array.from(values).sort();
}

/**
 * Group data by field
 * @param {Array<Object>} data - Data to group
 * @param {String} fieldName - Field name to group by
 * @returns {Object} Object with field values as keys and arrays of rows as values
 */
export function groupByField(data, fieldName) {
	if (!Array.isArray(data) || !fieldName) {
		return {};
	}

	const grouped = {};
	data.forEach(row => {
		const key = row[fieldName];
		if (!grouped[key]) {
			grouped[key] = [];
		}
		grouped[key].push(row);
	});

	return grouped;
}

/**
 * Sort data by field(s)
 * @param {Array<Object>} data - Data to sort
 * @param {String|Array<String>} fieldNames - Field name(s) to sort by
 * @param {String|Array<String>} directions - Sort direction(s): 'asc' or 'desc' (default: 'asc')
 * @returns {Array<Object>} Sorted data
 */
export function sortDataByFields(data, fieldNames, directions = 'asc') {
	if (!Array.isArray(data) || !fieldNames) {
		return data;
	}

	const fields = Array.isArray(fieldNames) ? fieldNames : [fieldNames];
	const dirs = Array.isArray(directions) ? directions : [directions];

	return [...data].sort((a, b) => {
		for (let i = 0; i < fields.length; i++) {
			const field = fields[i];
			const direction = dirs[i] || 'asc';
			const aVal = a[field];
			const bVal = b[field];

			if (aVal === bVal) continue;

			const comparison = aVal < bVal ? -1 : 1;
			return direction === 'desc' ? -comparison : comparison;
		}
		return 0;
	});
}

/**
 * Calculate statistics for numeric fields
 * @param {Array<Object>} data - Data array
 * @param {String} fieldName - Numeric field name
 * @returns {Object} Statistics object with min, max, sum, avg, count
 */
export function calculateFieldStatistics(data, fieldName) {
	if (!Array.isArray(data) || !fieldName) {
		return null;
	}

	const values = data
		.map(row => row[fieldName])
		.filter(val => typeof val === 'number' && !isNaN(val) && isFinite(val));

	if (values.length === 0) {
		return null;
	}

	const sum = values.reduce((acc, val) => acc + val, 0);
	const sorted = [...values].sort((a, b) => a - b);

	return {
		count: values.length,
		sum,
		avg: sum / values.length,
		min: sorted[0],
		max: sorted[sorted.length - 1],
		median: sorted.length % 2 === 0
			? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
			: sorted[Math.floor(sorted.length / 2)],
	};
}

