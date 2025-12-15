/**
 * Formatting helper functions
 * @module formatHelpers
 */

/**
 * Format a number with thousands separator and decimal places
 * @param {number} value - Number to format
 * @param {Object} options - Formatting options
 * @param {number} options.decimals - Number of decimal places (default: 2)
 * @param {string} options.thousandsSep - Thousands separator (default: ',')
 * @param {string} options.decimalSep - Decimal separator (default: '.')
 * @param {string} options.prefix - Prefix (default: '')
 * @param {string} options.suffix - Suffix (default: '')
 * @returns {string} Formatted number string
 */
export function formatNumber(value, options = {}) {
	const {
		decimals = 2,
		thousandsSep = ',',
		decimalSep = '.',
		prefix = '',
		suffix = '',
	} = options;

	if (value === null || value === undefined || isNaN(value) || !isFinite(value)) {
		return '';
	}

	const parts = value.toFixed(decimals).split('.');
	const integerPart = parts[0];
	const decimalPart = parts[1];

	// Add thousands separator
	const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSep);

	// Combine parts
	const formatted = decimalPart ? `${formattedInteger}${decimalSep}${decimalPart}` : formattedInteger;

	return `${prefix}${formatted}${suffix}`;
}

/**
 * Format a number as currency
 * @param {number} value - Number to format
 * @param {string} currency - Currency symbol (default: '$')
 * @param {Object} options - Additional formatting options
 * @returns {string} Formatted currency string
 */
export function formatCurrency(value, currency = '$', options = {}) {
	return formatNumber(value, {
		...options,
		prefix: currency,
	});
}

/**
 * Format a number as percentage
 * @param {number} value - Number to format (0-1 range)
 * @param {Object} options - Formatting options
 * @returns {string} Formatted percentage string
 */
export function formatPercentage(value, options = {}) {
	const { decimals = 1 } = options;
	const percentage = value * 100;
	return formatNumber(percentage, {
		...options,
		decimals,
		suffix: '%',
	});
}

/**
 * Format a date
 * @param {Date|string|number} date - Date to format
 * @param {string} format - Format string (default: 'YYYY-MM-DD')
 * @returns {string} Formatted date string
 */
export function formatDate(date, format = 'YYYY-MM-DD') {
	if (!date) {
		return '';
	}

	const d = date instanceof Date ? date : new Date(date);
	if (isNaN(d.getTime())) {
		return '';
	}

	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	const hours = String(d.getHours()).padStart(2, '0');
	const minutes = String(d.getMinutes()).padStart(2, '0');
	const seconds = String(d.getSeconds()).padStart(2, '0');

	return format
		.replace('YYYY', year)
		.replace('MM', month)
		.replace('DD', day)
		.replace('HH', hours)
		.replace('mm', minutes)
		.replace('ss', seconds);
}

/**
 * Format file size in bytes to human-readable format
 * @param {number} bytes - Size in bytes
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted file size string
 */
export function formatFileSize(bytes, decimals = 2) {
	if (bytes === 0) return '0 Bytes';

	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Truncate text to a maximum length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix to add if truncated (default: '...')
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength, suffix = '...') {
	if (!text || typeof text !== 'string') {
		return '';
	}

	if (text.length <= maxLength) {
		return text;
	}

	return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Capitalize first letter of a string
 * @param {string} text - Text to capitalize
 * @returns {string} Capitalized text
 */
export function capitalize(text) {
	if (!text || typeof text !== 'string') {
		return '';
	}

	return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Convert camelCase to Title Case
 * @param {string} text - Text to convert
 * @returns {string} Title case text
 */
export function toTitleCase(text) {
	if (!text || typeof text !== 'string') {
		return '';
	}

	return text
		.replace(/([A-Z])/g, ' $1')
		.replace(/^./, (str) => str.toUpperCase())
		.trim();
}

/**
 * Format a value based on its type
 * @param {*} value - Value to format
 * @param {Object} options - Formatting options
 * @returns {string} Formatted value
 */
export function formatValue(value, options = {}) {
	if (value === null || value === undefined) {
		return options.nullValue || '';
	}

	if (typeof value === 'number') {
		return formatNumber(value, options);
	}

	if (value instanceof Date) {
		return formatDate(value, options.dateFormat);
	}

	return String(value);
}

