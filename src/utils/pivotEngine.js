/**
 * Pivot Calculation Engine
 * A clean, correct implementation of the pivot table calculation engine
 * that supports both single and multi-aggregation modes.
 */

import { aggregators, getSort, naturalSort } from './utils.js';

/**
 * Default props for PivotData
 */
const defaultProps = {
	data: [],
	rows: [],
	cols: [],
	vals: [],
	aggregatorName: "Count",
	aggregatorNames: [],
	aggregatorVals: {},
	aggregators: aggregators,
	valueFilter: {},
	derivedAttributes: {},
	sorters: {},
	rowOrder: "key_a_to_z",
	colOrder: "key_a_to_z",
};

/**
 * Create an empty aggregator that returns null/empty values
 */
function makeEmptyAggregator() {
	return {
		push() {},
		value() {
			return null;
		},
		format() {
			return "";
		},
	};
}

/**
 * Iterate through input records and call callback for each
 * Handles arrays of objects, arrays of arrays, and functions
 */
export function forEachRecord(input, derivedAttributes, callback) {
	let addRecord, record;
	
	// Create a function that applies derived attributes before calling callback
	if (Object.getOwnPropertyNames(derivedAttributes).length === 0) {
		addRecord = callback;
	} else {
		addRecord = function (record) {
			for (const k in derivedAttributes) {
				const derived = derivedAttributes[k](record);
				if (derived !== null) {
					record[k] = derived;
				}
			}
			return callback(record);
		};
	}

	// If it's a function, have it call us back
	if (typeof input === "function") {
		return input(addRecord);
	} else if (Array.isArray(input)) {
		if (Array.isArray(input[0])) {
			// array of arrays
			for (let i = 1; i < input.length; i++) {
				const compactRecord = input[i];
				record = {};
				for (let j = 0; j < input[0].length; j++) {
					const k = input[0][j];
					record[k] = compactRecord[j];
				}
				addRecord(record);
			}
		} else {
			// array of objects
			for (let i = 0; i < input.length; i++) {
				record = input[i];
				if (record && typeof record === "object") {
					addRecord(record);
				}
			}
		}
	}
}

/**
 * Pivot Calculation Engine Class
 */
export class PivotEngine {
	constructor(inputProps = {}) {
		// Merge with default props
		this.props = Object.assign({}, defaultProps, inputProps);
		
		// Resolve aggregator names
		this.aggregatorNames = this.resolveAggregatorNames();
		
		// Get aggregatorVals if provided
		const aggregatorVals = this.props.aggregatorVals || {};
		
		// Create aggregator factories for each aggregator name
		this.aggregatorFactories = this.aggregatorNames
			.map((name) => {
				const generator = this.props.aggregators[name];
				if (typeof generator !== "function") {
					return null;
				}
				// Use per-aggregator vals if available, otherwise use the shared vals array
				const vals = aggregatorVals[name] || this.props.vals || [];
				const factory = generator(vals);
				if (typeof factory !== "function") {
					return null;
				}
				return { name, factory };
			})
			.filter(Boolean);

		// Fallback if no valid aggregators found
		if (!this.aggregatorFactories.length) {
			const fallbackName = Object.keys(this.props.aggregators)[0];
			if (fallbackName) {
				const aggregatorVals = this.props.aggregatorVals || {};
				const vals = aggregatorVals[fallbackName] || this.props.vals || [];
				const fallbackFactory = this.props.aggregators[fallbackName](vals);
				this.aggregatorFactories.push({
					name: fallbackName,
					factory: fallbackFactory,
				});
				this.aggregatorNames = [fallbackName];
			}
		}
		
		// Ensure aggregatorNames matches factories
		this.aggregatorNames = this.aggregatorFactories.map((entry) => entry.name);
		this.primaryAggregatorName = this.aggregatorNames[0] || null;

		// Initialize data structures
		this.tree = {};
		this.rowKeys = [];
		this.colKeys = [];
		this.rowTotals = {};
		this.colTotals = {};
		this.allTotal = this.createAggregatorCollection([], []);
		this.sorted = false;

		// Process all records
		forEachRecord(
			this.props.data,
			this.props.derivedAttributes,
			(record) => {
				if (this.filter(record)) {
					this.processRecord(record);
				}
			}
		);
	}

	/**
	 * Resolve aggregator names from props
	 */
	resolveAggregatorNames() {
		let names = [];
		if (Array.isArray(this.props.aggregatorNames) && this.props.aggregatorNames.length) {
			names = this.props.aggregatorNames.slice();
		} else if (Array.isArray(this.props.aggregatorName)) {
			names = this.props.aggregatorName.slice();
		} else if (typeof this.props.aggregatorName === "string" && this.props.aggregatorName) {
			names = [this.props.aggregatorName];
		}
		if (!names.length) {
			const defaultName = Object.keys(this.props.aggregators)[0];
			if (defaultName) {
				names = [defaultName];
			}
		}
		// Remove duplicates
		return names.filter((name, index, arr) => arr.indexOf(name) === index);
	}

	/**
	 * Create a collection of aggregators for a specific row/column combination
	 */
	createAggregatorCollection(rowKey, colKey) {
		const collection = {};
		for (const entry of this.aggregatorFactories) {
			const { name, factory } = entry;
			collection[name] = factory(this, rowKey, colKey);
		}
		if (!Object.keys(collection).length && this.primaryAggregatorName) {
			collection[this.primaryAggregatorName] = makeEmptyAggregator();
		}
		return collection;
	}

	/**
	 * Create an empty collection (for missing cells)
	 */
	createEmptyCollection() {
		const empty = {};
		for (const name of this.aggregatorNames) {
			empty[name] = makeEmptyAggregator();
		}
		return empty;
	}

	/**
	 * Push a record to all aggregators in a collection
	 */
	pushRecord(collection, record) {
		if (!collection) {
			return;
		}
		for (const name in collection) {
			const aggregator = collection[name];
			if (aggregator && typeof aggregator.push === "function") {
				aggregator.push(record);
			}
		}
	}

	/**
	 * Filter a record based on valueFilter
	 * Includes null values in filtering - null values are converted to "null" string for consistency
	 */
	filter(record) {
		for (const k in this.props.valueFilter) {
			const value = record[k];
			// Convert null/undefined to "null" string to match how we store them in keys
			const normalizedValue = value === null || value === undefined || !(k in record) ? "null" : value;
			if (normalizedValue in this.props.valueFilter[k]) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Process a single record and update all aggregators
	 */
	processRecord(record) {
		const cols = this.props.cols;
		const rows = this.props.rows;
		const colKey = [];
		const rowKey = [];
		const separator = String.fromCharCode(0);
		
		// Build column key
		// Include null values in calculations - convert null/undefined to "null" string for consistency
		for (let i = 0, len = cols.length; i < len; i++) {
			const x = cols[i];
			const value = record[x];
			// Convert null, undefined, or missing fields to "null" string for consistent grouping
			colKey.push(value === null || value === undefined || !(x in record) ? "null" : value);
		}
		
		// Build row key
		// Include null values in calculations - convert null/undefined to "null" string for consistency
		for (let i = 0, len = rows.length; i < len; i++) {
			const x = rows[i];
			const value = record[x];
			// Convert null, undefined, or missing fields to "null" string for consistent grouping
			rowKey.push(value === null || value === undefined || !(x in record) ? "null" : value);
		}
		
		const flatRowKey = rowKey.join(separator);
		const flatColKey = colKey.join(separator);

		// Push to grand total (all data)
		this.pushRecord(this.allTotal, record);

		// Push to row totals
		if (rowKey.length !== 0) {
			if (!this.rowTotals[flatRowKey]) {
				this.rowKeys.push(rowKey);
				this.rowTotals[flatRowKey] = this.createAggregatorCollection(rowKey, []);
			}
			this.pushRecord(this.rowTotals[flatRowKey], record);
		}

		// Push to column totals
		if (colKey.length !== 0) {
			if (!this.colTotals[flatColKey]) {
				this.colKeys.push(colKey);
				this.colTotals[flatColKey] = this.createAggregatorCollection([], colKey);
			}
			this.pushRecord(this.colTotals[flatColKey], record);
		}

		// Push to cell (row + column intersection)
		if (colKey.length !== 0 && rowKey.length !== 0) {
			if (!this.tree[flatRowKey]) {
				this.tree[flatRowKey] = {};
			}
			if (!this.tree[flatRowKey][flatColKey]) {
				this.tree[flatRowKey][flatColKey] = this.createAggregatorCollection(
					rowKey,
					colKey
				);
			}
			this.pushRecord(this.tree[flatRowKey][flatColKey], record);
		}
	}

	/**
	 * Get aggregator collection for a specific row/column combination
	 */
	getAggregatorCollection(rowKey, colKey) {
		const flatRowKey = rowKey.join(String.fromCharCode(0));
		const flatColKey = colKey.join(String.fromCharCode(0));
		
		let collection;
		if (rowKey.length === 0 && colKey.length === 0) {
			collection = this.allTotal;
		} else if (rowKey.length === 0) {
			collection = this.colTotals[flatColKey];
		} else if (colKey.length === 0) {
			collection = this.rowTotals[flatRowKey];
		// Debug: check if row total exists
		if (!collection) {
			// Row total collection not found
		}
		} else {
			collection =
				this.tree[flatRowKey] && this.tree[flatRowKey][flatColKey]
					? this.tree[flatRowKey][flatColKey]
					: null;
		}
		
		if (!collection) {
			return this.createEmptyCollection();
		}
		return collection;
	}

	/**
	 * Get a specific aggregator from a row/column combination
	 * @param {Array} rowKey - Row key array
	 * @param {Array} colKey - Column key array
	 * @param {string} aggregatorName - Name of the aggregator to retrieve
	 * @returns {Object} Aggregator instance
	 */
	getAggregator(rowKey, colKey, aggregatorName) {
		const collection = this.getAggregatorCollection(rowKey, colKey);

		// If aggregatorName is provided, return that specific aggregator
		if (typeof aggregatorName === "string" && aggregatorName) {
			// Try exact match first
			if (collection[aggregatorName]) {
				return collection[aggregatorName];
			}
			// Return empty aggregator if not found
			return makeEmptyAggregator();
		}

		// If single aggregator mode, return the first one
		if (this.aggregatorNames.length === 1) {
			const name = this.aggregatorNames[0];
			return collection[name] || makeEmptyAggregator();
		}

		// Multi-aggregation mode: return the entire collection
		return collection;
	}

	/**
	 * Get list of aggregator names
	 */
	getAggregatorNames() {
		return this.aggregatorNames.slice();
	}

	/**
	 * Get row keys (sorted)
	 */
	getRowKeys() {
		this.sortKeys();
		return this.rowKeys;
	}

	/**
	 * Get column keys (sorted)
	 */
	getColKeys() {
		this.sortKeys();
		return this.colKeys;
	}

	/**
	 * Create array sort function for attributes
	 */
	arrSort(attrs) {
		const sortersArr = [];
		for (let i = 0; i < attrs.length; i++) {
			sortersArr.push(getSort(this.props.sorters, attrs[i]));
		}
		return function (a, b) {
			for (let i = 0; i < sortersArr.length; i++) {
				const sorter = sortersArr[i];
				const comparison = sorter(a[i], b[i]);
				if (comparison !== 0) {
					return comparison;
				}
			}
			return 0;
		};
	}

	/**
	 * Sort row and column keys based on sorters and order settings
	 */
	sortKeys() {
		if (this.sorted) {
			return;
		}
		this.sorted = true;

		const primary = this.primaryAggregatorName || this.aggregatorNames[0] || null;
		const v = (r, c) => {
			const aggregator = primary
				? this.getAggregator(r, c, primary)
				: this.getAggregator(r, c);
			return aggregator && typeof aggregator.value === "function"
				? aggregator.value()
				: null;
		};

		// Sort row keys
		switch (this.props.rowOrder) {
			case "value_a_to_z":
				this.rowKeys.sort((a, b) => naturalSort(v(a, []), v(b, [])));
				break;
			case "value_z_to_a":
				this.rowKeys.sort((a, b) => -naturalSort(v(a, []), v(b, [])));
				break;
			default:
				this.rowKeys.sort(this.arrSort(this.props.rows));
		}

		// Sort column keys
		switch (this.props.colOrder) {
			case "value_a_to_z":
				this.colKeys.sort((a, b) => naturalSort(v([], a), v([], b)));
				break;
			case "value_z_to_a":
				this.colKeys.sort((a, b) => -naturalSort(v([], a), v([], b)));
				break;
			default:
				this.colKeys.sort(this.arrSort(this.props.cols));
		}
	}
}

