/**
 * Validation helper functions
 * @module validationHelpers
 */

/**
 * Validate if a value is a valid number
 * @param {*} value - Value to validate
 * @returns {boolean} True if valid number
 */
export function isValidNumber(value) {
	return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Validate if a value is a valid email
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email
 */
export function isValidEmail(email) {
	if (typeof email !== 'string') {
		return false;
	}

	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

/**
 * Validate if a value is a valid URL
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid URL
 */
export function isValidUrl(url) {
	if (typeof url !== 'string') {
		return false;
	}

	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}

/**
 * Validate if a value is not empty
 * @param {*} value - Value to validate
 * @returns {boolean} True if not empty
 */
export function isNotEmpty(value) {
	if (value === null || value === undefined) {
		return false;
	}

	if (typeof value === 'string') {
		return value.trim().length > 0;
	}

	if (Array.isArray(value)) {
		return value.length > 0;
	}

	if (typeof value === 'object') {
		return Object.keys(value).length > 0;
	}

	return true;
}

/**
 * Validate if a value is within a range
 * @param {number} value - Value to validate
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {boolean} True if within range
 */
export function isInRange(value, min, max) {
	if (!isValidNumber(value)) {
		return false;
	}

	return value >= min && value <= max;
}

/**
 * Validate if an array has a minimum length
 * @param {Array} array - Array to validate
 * @param {number} minLength - Minimum length
 * @returns {boolean} True if array meets minimum length
 */
export function hasMinLength(array, minLength) {
	if (!Array.isArray(array)) {
		return false;
	}

	return array.length >= minLength;
}

/**
 * Validate if an array has a maximum length
 * @param {Array} array - Array to validate
 * @param {number} maxLength - Maximum length
 * @returns {boolean} True if array meets maximum length
 */
export function hasMaxLength(array, maxLength) {
	if (!Array.isArray(array)) {
		return false;
	}

	return array.length <= maxLength;
}

/**
 * Validate data structure for pivot table
 * @param {*} data - Data to validate
 * @returns {Object} Validation result with isValid and message
 */
export function validatePivotData(data) {
	if (!Array.isArray(data)) {
		return {
			isValid: false,
			message: 'Data must be an array',
		};
	}

	if (data.length === 0) {
		return {
			isValid: false,
			message: 'Data array cannot be empty',
		};
	}

	// Check if all items are objects
	const allObjects = data.every((item) => typeof item === 'object' && item !== null && !Array.isArray(item));

	if (!allObjects) {
		return {
			isValid: false,
			message: 'All data items must be objects',
		};
	}

	// Check if all objects have at least one key
	const hasKeys = data.every((item) => Object.keys(item).length > 0);

	if (!hasKeys) {
		return {
			isValid: false,
			message: 'All data objects must have at least one field',
		};
	}

	return {
		isValid: true,
		message: 'Data is valid',
	};
}

/**
 * Validate file type
 * @param {File} file - File to validate
 * @param {Array<string>} allowedTypes - Array of allowed MIME types or extensions
 * @returns {Object} Validation result with isValid and message
 */
export function validateFileType(file, allowedTypes) {
	if (!file || !(file instanceof File)) {
		return {
			isValid: false,
			message: 'Invalid file object',
		};
	}

	if (!Array.isArray(allowedTypes) || allowedTypes.length === 0) {
		return {
			isValid: true,
			message: 'No file type restrictions',
		};
	}

	const fileExtension = file.name.split('.').pop().toLowerCase();
	const fileType = file.type;

	const isValid =
		allowedTypes.some((type) => {
			// Check by extension
			if (type.startsWith('.')) {
				return fileExtension === type.substring(1);
			}
			// Check by MIME type
			return fileType === type || fileType.startsWith(type);
		}) ||
		allowedTypes.some((type) => {
			// Check by extension without dot
			return fileExtension === type.toLowerCase();
		});

	return {
		isValid,
		message: isValid ? 'File type is valid' : `File type must be one of: ${allowedTypes.join(', ')}`,
	};
}

/**
 * Validate file size
 * @param {File} file - File to validate
 * @param {number} maxSize - Maximum size in bytes
 * @returns {Object} Validation result with isValid and message
 */
export function validateFileSize(file, maxSize) {
	if (!file || !(file instanceof File)) {
		return {
			isValid: false,
			message: 'Invalid file object',
		};
	}

	if (!isValidNumber(maxSize) || maxSize <= 0) {
		return {
			isValid: true,
			message: 'No file size restrictions',
		};
	}

	const isValid = file.size <= maxSize;

	return {
		isValid,
		message: isValid
			? 'File size is valid'
			: `File size (${formatFileSize(file.size)}) exceeds maximum allowed size (${formatFileSize(maxSize)})`,
	};
}

/**
 * Format file size helper (imported from formatHelpers)
 * @param {number} bytes - Size in bytes
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes, decimals = 2) {
	if (bytes === 0) return '0 Bytes';

	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

