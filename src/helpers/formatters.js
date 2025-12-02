/**
 * Formatting helpers for pivot table data
 * Utilities for formatting numbers, dates, and other data types
 */

/**
 * Format number with locale support
 * @param {Number} value - Number to format
 * @param {Object} options - Formatting options
 * @param {Number} options.decimals - Number of decimal places (default: 2)
 * @param {String} options.locale - Locale string (default: 'en-US')
 * @param {Boolean} options.useGrouping - Use thousand separators (default: true)
 * @returns {String} Formatted number string
 */
export function formatNumber(value, options = {}) {
	const {
		decimals = 2,
		locale = 'en-US',
		useGrouping = true,
	} = options;

	if (value === null || value === undefined || isNaN(value)) {
		return '—';
	}

	try {
		return new Intl.NumberFormat(locale, {
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals,
			useGrouping,
		}).format(value);
	} catch (err) {
		// Fallback to simple formatting
		return value.toFixed(decimals);
	}
}

/**
 * Format currency value
 * @param {Number} value - Currency value
 * @param {Object} options - Formatting options
 * @param {String} options.currency - Currency code (default: 'USD')
 * @param {String} options.locale - Locale string (default: 'en-US')
 * @returns {String} Formatted currency string
 */
export function formatCurrency(value, options = {}) {
	const {
		currency = 'USD',
		locale = 'en-US',
	} = options;

	if (value === null || value === undefined || isNaN(value)) {
		return '—';
	}

	try {
		return new Intl.NumberFormat(locale, {
			style: 'currency',
			currency,
		}).format(value);
	} catch (err) {
		return `$${value.toFixed(2)}`;
	}
}

/**
 * Format percentage value
 * @param {Number} value - Percentage value (0-1 or 0-100)
 * @param {Object} options - Formatting options
 * @param {Boolean} options.asDecimal - Value is decimal (0-1) not percentage (default: true)
 * @param {Number} options.decimals - Number of decimal places (default: 1)
 * @returns {String} Formatted percentage string
 */
export function formatPercentage(value, options = {}) {
	const {
		asDecimal = true,
		decimals = 1,
	} = options;

	if (value === null || value === undefined || isNaN(value)) {
		return '—';
	}

	const percentage = asDecimal ? value * 100 : value;
	return `${percentage.toFixed(decimals)}%`;
}

/**
 * Format date value
 * @param {Date|String|Number} value - Date value
 * @param {Object} options - Formatting options
 * @param {String} options.locale - Locale string (default: 'en-US')
 * @param {Object} options.dateStyle - Date style: 'full', 'long', 'medium', 'short' (default: 'medium')
 * @returns {String} Formatted date string
 */
export function formatDate(value, options = {}) {
	const {
		locale = 'en-US',
		dateStyle = 'medium',
	} = options;

	if (!value) {
		return '—';
	}

	try {
		const date = value instanceof Date ? value : new Date(value);
		if (isNaN(date.getTime())) {
			return '—';
		}

		return new Intl.DateTimeFormat(locale, {
			dateStyle,
		}).format(date);
	} catch (err) {
		return String(value);
	}
}

/**
 * Format date and time value
 * @param {Date|String|Number} value - Date value
 * @param {Object} options - Formatting options
 * @param {String} options.locale - Locale string (default: 'en-US')
 * @param {Object} options.dateStyle - Date style (default: 'medium')
 * @param {Object} options.timeStyle - Time style: 'full', 'long', 'medium', 'short' (default: 'short')
 * @returns {String} Formatted date-time string
 */
export function formatDateTime(value, options = {}) {
	const {
		locale = 'en-US',
		dateStyle = 'medium',
		timeStyle = 'short',
	} = options;

	if (!value) {
		return '—';
	}

	try {
		const date = value instanceof Date ? value : new Date(value);
		if (isNaN(date.getTime())) {
			return '—';
		}

		return new Intl.DateTimeFormat(locale, {
			dateStyle,
			timeStyle,
		}).format(date);
	} catch (err) {
		return String(value);
	}
}

/**
 * Format file size in human-readable format
 * @param {Number} bytes - Size in bytes
 * @param {Number} decimals - Number of decimal places (default: 2)
 * @returns {String} Formatted file size (e.g., "1.5 MB")
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
 * Format duration in human-readable format
 * @param {Number} milliseconds - Duration in milliseconds
 * @returns {String} Formatted duration (e.g., "1h 23m 45s")
 */
export function formatDuration(milliseconds) {
	if (milliseconds < 1000) {
		return `${milliseconds}ms`;
	}

	const seconds = Math.floor(milliseconds / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	const parts = [];
	if (days > 0) parts.push(`${days}d`);
	if (hours % 24 > 0) parts.push(`${hours % 24}h`);
	if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
	if (seconds % 60 > 0) parts.push(`${seconds % 60}s`);

	return parts.join(' ') || '0s';
}

/**
 * Truncate text with ellipsis
 * @param {String} text - Text to truncate
 * @param {Number} maxLength - Maximum length (default: 50)
 * @param {String} suffix - Suffix to add (default: '...')
 * @returns {String} Truncated text
 */
export function truncateText(text, maxLength = 50, suffix = '...') {
	if (!text || typeof text !== 'string') {
		return '';
	}

	if (text.length <= maxLength) {
		return text;
	}

	return text.substring(0, maxLength - suffix.length) + suffix;
}

