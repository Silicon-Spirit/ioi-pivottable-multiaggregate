/**
 * Analyzes fields in JSON data to determine their suitability for pivot table headers vs aggregations
 */

/**
 * Counts the number of unique values for each field in the data
 * @param {Array<Object>} data - Array of data objects
 * @returns {Object} Object with field names as keys and unique count as values
 */
export function countUniqueValuesPerField(data) {
	if (!Array.isArray(data) || data.length === 0) {
		return {};
	}

	const fieldCounts = {};
	const fieldSets = {};

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

