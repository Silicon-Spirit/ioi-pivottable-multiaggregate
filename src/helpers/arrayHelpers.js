/**
 * Array manipulation helper functions
 * @module arrayHelpers
 */

/**
 * Chunk an array into smaller arrays of specified size
 * @param {Array} array - Array to chunk
 * @param {number} size - Chunk size
 * @returns {Array} Array of chunks
 */
export function chunk(array, size) {
	if (!Array.isArray(array) || size <= 0) {
		return [];
	}

	const chunks = [];
	for (let i = 0; i < array.length; i += size) {
		chunks.push(array.slice(i, i + size));
	}

	return chunks;
}

/**
 * Flatten a nested array
 * @param {Array} array - Array to flatten
 * @param {number} depth - Flattening depth (default: Infinity)
 * @returns {Array} Flattened array
 */
export function flatten(array, depth = Infinity) {
	if (!Array.isArray(array)) {
		return [];
	}

	return array.flat(depth);
}

/**
 * Remove duplicates from an array
 * @param {Array} array - Array to deduplicate
 * @param {Function} keyFn - Optional function to extract key for comparison
 * @returns {Array} Array without duplicates
 */
export function unique(array, keyFn) {
	if (!Array.isArray(array)) {
		return [];
	}

	if (!keyFn) {
		return [...new Set(array)];
	}

	const seen = new Set();
	return array.filter((item) => {
		const key = keyFn(item);
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

/**
 * Group array items by a key
 * @param {Array} array - Array to group
 * @param {Function|string} keyFn - Function or property name to extract key
 * @returns {Object} Object with keys as group names and arrays as values
 */
export function groupBy(array, keyFn) {
	if (!Array.isArray(array)) {
		return {};
	}

	const getKey = typeof keyFn === 'function' ? keyFn : (item) => item[keyFn];

	const grouped = {};
	array.forEach((item) => {
		const key = getKey(item);
		if (!grouped[key]) {
			grouped[key] = [];
		}
		grouped[key].push(item);
	});

	return grouped;
}

/**
 * Sort array by a key
 * @param {Array} array - Array to sort
 * @param {Function|string} keyFn - Function or property name to extract key
 * @param {string} direction - Sort direction ('asc' or 'desc', default: 'asc')
 * @returns {Array} Sorted array
 */
export function sortBy(array, keyFn, direction = 'asc') {
	if (!Array.isArray(array)) {
		return [];
	}

	const getKey = typeof keyFn === 'function' ? keyFn : (item) => item[keyFn];

	const sorted = [...array];
	sorted.sort((a, b) => {
		const aVal = getKey(a);
		const bVal = getKey(b);

		if (aVal === null || aVal === undefined) return 1;
		if (bVal === null || bVal === undefined) return -1;

		if (aVal < bVal) return direction === 'asc' ? -1 : 1;
		if (aVal > bVal) return direction === 'asc' ? 1 : -1;
		return 0;
	});

	return sorted;
}

/**
 * Get the first N items from an array
 * @param {Array} array - Array
 * @param {number} n - Number of items
 * @returns {Array} First N items
 */
export function take(array, n) {
	if (!Array.isArray(array) || n <= 0) {
		return [];
	}

	return array.slice(0, n);
}

/**
 * Get the last N items from an array
 * @param {Array} array - Array
 * @param {number} n - Number of items
 * @returns {Array} Last N items
 */
export function takeLast(array, n) {
	if (!Array.isArray(array) || n <= 0) {
		return [];
	}

	return array.slice(-n);
}

/**
 * Skip the first N items from an array
 * @param {Array} array - Array
 * @param {number} n - Number of items to skip
 * @returns {Array} Array without first N items
 */
export function skip(array, n) {
	if (!Array.isArray(array) || n <= 0) {
		return array || [];
	}

	return array.slice(n);
}

/**
 * Skip the last N items from an array
 * @param {Array} array - Array
 * @param {number} n - Number of items to skip
 * @returns {Array} Array without last N items
 */
export function skipLast(array, n) {
	if (!Array.isArray(array) || n <= 0) {
		return array || [];
	}

	return array.slice(0, -n);
}

/**
 * Partition an array into two arrays based on a predicate
 * @param {Array} array - Array to partition
 * @param {Function} predicate - Predicate function
 * @returns {Array} Array with two arrays: [truthy, falsy]
 */
export function partition(array, predicate) {
	if (!Array.isArray(array) || typeof predicate !== 'function') {
		return [[], []];
	}

	const truthy = [];
	const falsy = [];

	array.forEach((item) => {
		if (predicate(item)) {
			truthy.push(item);
		} else {
			falsy.push(item);
		}
	});

	return [truthy, falsy];
}

/**
 * Zip two arrays together
 * @param {Array} array1 - First array
 * @param {Array} array2 - Second array
 * @returns {Array} Array of pairs
 */
export function zip(array1, array2) {
	if (!Array.isArray(array1) || !Array.isArray(array2)) {
		return [];
	}

	const length = Math.min(array1.length, array2.length);
	const result = [];

	for (let i = 0; i < length; i++) {
		result.push([array1[i], array2[i]]);
	}

	return result;
}

/**
 * Shuffle an array
 * @param {Array} array - Array to shuffle
 * @returns {Array} Shuffled array
 */
export function shuffle(array) {
	if (!Array.isArray(array)) {
		return [];
	}

	const shuffled = [...array];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}

	return shuffled;
}

/**
 * Get intersection of two arrays
 * @param {Array} array1 - First array
 * @param {Array} array2 - Second array
 * @returns {Array} Intersection array
 */
export function intersection(array1, array2) {
	if (!Array.isArray(array1) || !Array.isArray(array2)) {
		return [];
	}

	const set2 = new Set(array2);
	return array1.filter((item) => set2.has(item));
}

/**
 * Get difference of two arrays (items in array1 but not in array2)
 * @param {Array} array1 - First array
 * @param {Array} array2 - Second array
 * @returns {Array} Difference array
 */
export function difference(array1, array2) {
	if (!Array.isArray(array1) || !Array.isArray(array2)) {
		return array1 || [];
	}

	const set2 = new Set(array2);
	return array1.filter((item) => !set2.has(item));
}

/**
 * Get union of two arrays
 * @param {Array} array1 - First array
 * @param {Array} array2 - Second array
 * @returns {Array} Union array
 */
export function union(array1, array2) {
	if (!Array.isArray(array1) && !Array.isArray(array2)) {
		return [];
	}

	if (!Array.isArray(array1)) {
		return [...new Set(array2)];
	}

	if (!Array.isArray(array2)) {
		return [...new Set(array1)];
	}

	return [...new Set([...array1, ...array2])];
}

