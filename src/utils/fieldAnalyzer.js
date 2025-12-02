/**
 * Analyzes fields in JSON data to determine their suitability for pivot table headers vs aggregations
 */

/**
 * Counts the number of unique values for each field in the data
 * @param {Array<Object>|Array<Array>} data - Array of data objects or array of arrays (first row is headers)
 * @returns {Object} Object with field names as keys and unique count as values
 */
export function countUniqueValuesPerField(data) {
	if (!Array.isArray(data) || data.length === 0) {
		return {};
	}

	const fieldCounts = {};
	const fieldSets = {};

	// Check if data is array of arrays format
	// Array of arrays: first element is an array, and if there's a second element, it's also an array
	// Array of objects: first element is an object (not an array)
	const isArrayOfArrays = Array.isArray(data[0]) && 
	                        (data.length === 1 || Array.isArray(data[1]));

	if (isArrayOfArrays && data.length > 1) {
		// Array of arrays format: first row is headers, rest are data rows
		const headers = data[0];
		const headerCount = headers.length;

		// Initialize sets for each header
		for (let i = 0; i < headerCount; i++) {
			const fieldName = headers[i] != null ? String(headers[i]) : `Column${i + 1}`;
			fieldSets[fieldName] = new Set();
		}

		// Count unique values for each field
		for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
			const row = data[rowIndex];
			if (!Array.isArray(row)) continue;

			for (let colIndex = 0; colIndex < headerCount && colIndex < row.length; colIndex++) {
				const fieldName = headers[colIndex] != null ? String(headers[colIndex]) : `Column${colIndex + 1}`;
				const value = row[colIndex];
				
				// Convert value to string for consistent comparison
				// Handle null/undefined
				if (value === null || value === undefined) {
					fieldSets[fieldName].add('null');
				} else {
					fieldSets[fieldName].add(String(value));
				}
			}
		}
	} else {
		// Array of objects format (original behavior)
		// Initialize sets for each field
		const firstRecord = data[0];
		for (const field in firstRecord) {
			fieldSets[field] = new Set();
		}

		// Count unique values for each field
		data.forEach(record => {
			for (const field in record) {
				const value = record[field];
				// Convert value to string for consistent comparison
				// Handle null/undefined
				if (value === null || value === undefined) {
					fieldSets[field].add('null');
				} else {
					fieldSets[field].add(String(value));
				}
			}
		});
	}

	// Convert sets to counts
	for (const field in fieldSets) {
		fieldCounts[field] = fieldSets[field].size;
	}

	return fieldCounts;
}

/**
 * Categorizes fields based on unique value count
 * @param {Array<Object>} data - Array of data objects
 * @param {number} threshold - Threshold for unique values (default: 50)
 * @returns {Object} Object with categorized fields:
 *   - headerFields: fields with unique count <= threshold (suitable for rows/cols)
 *   - aggregationFields: fields with unique count > threshold (suitable for values)
 *   - fieldStats: object with field names and their unique counts
 */
export function categorizeFields(data, threshold = 50) {
	const fieldStats = countUniqueValuesPerField(data);
	
	const headerFields = [];
	const aggregationFields = [];

	for (const field in fieldStats) {
		const uniqueCount = fieldStats[field];
		if (uniqueCount > threshold) {
			aggregationFields.push(field);
		} else {
			headerFields.push(field);
		}
	}

	// Sort by unique count (ascending for headers, descending for aggregations)
	headerFields.sort((a, b) => fieldStats[a] - fieldStats[b]);
	aggregationFields.sort((a, b) => fieldStats[b] - fieldStats[a]);

	return {
		headerFields,
		aggregationFields,
		fieldStats
	};
}

/**
 * Gets field statistics with detailed information
 * @param {Array<Object>} data - Array of data objects
 * @returns {Array<Object>} Array of field statistics objects
 */
export function getFieldStatistics(data) {
	const fieldStats = countUniqueValuesPerField(data);
	const statsArray = [];

	for (const field in fieldStats) {
		statsArray.push({
			field,
			uniqueCount: fieldStats[field],
			suitableFor: fieldStats[field] > 50 ? 'aggregation' : 'header'
		});
	}

	// Sort by unique count
	statsArray.sort((a, b) => a.uniqueCount - b.uniqueCount);

	return statsArray;
}

