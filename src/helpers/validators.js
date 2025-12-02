/**
 * Validation helpers for pivot table data and configuration
 * Utilities for validating data structures, field names, and configurations
 */

/**
 * Validate pivot table data structure
 * @param {Array|Object|Function} data - Data to validate
 * @returns {Object} Validation result with isValid flag and error message
 */
export function validatePivotData(data) {
	if (!data) {
		return {
			isValid: false,
			error: 'Data is required',
		};
	}

	// Function is valid
	if (typeof data === 'function') {
		return { isValid: true };
	}

	// Array of arrays
	if (Array.isArray(data) && data.length > 0) {
		if (Array.isArray(data[0])) {
			// Validate array of arrays structure
			if (data.length < 2) {
				return {
					isValid: false,
					error: 'Array of arrays must have at least a header row and one data row',
				};
			}

			const headerLength = data[0].length;
			for (let i = 1; i < data.length; i++) {
				if (!Array.isArray(data[i])) {
					return {
						isValid: false,
						error: `Row ${i} is not an array`,
					};
				}
			}

			return { isValid: true };
		}

		// Array of objects
		if (typeof data[0] === 'object' && data[0] !== null) {
			// Validate all objects have consistent structure
			const firstKeys = Object.keys(data[0]);
			for (let i = 1; i < data.length; i++) {
				if (typeof data[i] !== 'object' || data[i] === null) {
					return {
						isValid: false,
						error: `Row ${i} is not an object`,
					};
				}
			}

			return { isValid: true };
		}

		return {
			isValid: false,
			error: 'Array must contain objects or arrays',
		};
	}

	// Single object
	if (typeof data === 'object' && !Array.isArray(data)) {
		return { isValid: true };
	}

	return {
		isValid: false,
		error: 'Data must be an array, object, or function',
	};
}

/**
 * Validate field name exists in data
 * @param {Array|Object} data - Data to check
 * @param {String} fieldName - Field name to validate
 * @returns {Object} Validation result
 */
export function validateFieldName(data, fieldName) {
	if (!fieldName || typeof fieldName !== 'string') {
		return {
			isValid: false,
			error: 'Field name must be a non-empty string',
		};
	}

	if (!data) {
		return {
			isValid: false,
			error: 'Data is required',
		};
	}

	// Handle array of arrays
	if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
		const headers = data[0];
		if (headers.includes(fieldName)) {
			return { isValid: true };
		}
		return {
			isValid: false,
			error: `Field "${fieldName}" not found in data headers`,
		};
	}

	// Handle array of objects
	if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
		const firstObject = data[0];
		if (fieldName in firstObject) {
			return { isValid: true };
		}
		return {
			isValid: false,
			error: `Field "${fieldName}" not found in data objects`,
		};
	}

	return {
		isValid: false,
		error: 'Cannot validate field name for this data structure',
	};
}

/**
 * Validate pivot configuration
 * @param {Object} config - Configuration object
 * @param {Array} availableFields - Available field names
 * @returns {Object} Validation result
 */
export function validatePivotConfig(config, availableFields = []) {
	const errors = [];

	// Validate rows
	if (config.rows !== undefined) {
		if (!Array.isArray(config.rows)) {
			errors.push('rows must be an array');
		} else {
			config.rows.forEach((field, index) => {
				if (availableFields.length > 0 && !availableFields.includes(field)) {
					errors.push(`rows[${index}]: field "${field}" not found in data`);
				}
			});
		}
	}

	// Validate cols
	if (config.cols !== undefined) {
		if (!Array.isArray(config.cols)) {
			errors.push('cols must be an array');
		} else {
			config.cols.forEach((field, index) => {
				if (availableFields.length > 0 && !availableFields.includes(field)) {
					errors.push(`cols[${index}]: field "${field}" not found in data`);
				}
			});
		}
	}

	// Validate vals
	if (config.vals !== undefined) {
		if (!Array.isArray(config.vals)) {
			errors.push('vals must be an array');
		} else {
			config.vals.forEach((field, index) => {
				if (availableFields.length > 0 && !availableFields.includes(field)) {
					errors.push(`vals[${index}]: field "${field}" not found in data`);
				}
			});
		}
	}

	// Validate aggregatorNames
	if (config.aggregatorNames !== undefined) {
		if (!Array.isArray(config.aggregatorNames) && typeof config.aggregatorNames !== 'string') {
			errors.push('aggregatorNames must be an array or string');
		}
	}

	// Validate rendererName
	if (config.rendererName !== undefined) {
		if (typeof config.rendererName !== 'string') {
			errors.push('rendererName must be a string');
		}
	}

	return {
		isValid: errors.length === 0,
		errors,
	};
}

/**
 * Validate aggregator name
 * @param {String} aggregatorName - Aggregator name to validate
 * @param {Array<String>} availableAggregators - List of available aggregators
 * @returns {Object} Validation result
 */
export function validateAggregatorName(aggregatorName, availableAggregators = []) {
	if (!aggregatorName || typeof aggregatorName !== 'string') {
		return {
			isValid: false,
			error: 'Aggregator name must be a non-empty string',
		};
	}

	if (availableAggregators.length > 0 && !availableAggregators.includes(aggregatorName)) {
		return {
			isValid: false,
			error: `Aggregator "${aggregatorName}" is not available`,
		};
	}

	return { isValid: true };
}

/**
 * Validate renderer name
 * @param {String} rendererName - Renderer name to validate
 * @param {Array<String>} availableRenderers - List of available renderers
 * @returns {Object} Validation result
 */
export function validateRendererName(rendererName, availableRenderers = []) {
	if (!rendererName || typeof rendererName !== 'string') {
		return {
			isValid: false,
			error: 'Renderer name must be a non-empty string',
		};
	}

	if (availableRenderers.length > 0 && !availableRenderers.includes(rendererName)) {
		return {
			isValid: false,
			error: `Renderer "${rendererName}" is not available`,
		};
	}

	return { isValid: true };
}

