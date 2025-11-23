// Web Worker for pivot table calculations
import { PivotData, aggregators } from '../utils/utils.js';

// Threshold for using batch processing
const BATCH_SIZE = 50000;

self.onmessage = async (e) => {
	const { id, type, payload } = e.data;

	if (type === 'CALCULATE_PIVOT') {
		try {
			const { data, rows, cols, vals, aggregatorNames, aggregatorVals, valueFilter, derivedAttributes, sorters, rowOrder, colOrder } = payload;

			// Create PivotData instance in worker
			const pivotData = new PivotData({
				data,
				rows,
				cols,
				vals,
				aggregatorNames,
				aggregatorVals,
				aggregators, // Pass aggregators to worker
				valueFilter,
				derivedAttributes: {}, // Functions can't be serialized, so use empty object
				sorters: {}, // Functions can't be serialized, so use empty object
				rowOrder,
				colOrder
			});

			// Extract necessary data for rendering
			const rowKeys = pivotData.getRowKeys();
			const colKeys = pivotData.getColKeys();
			const aggregatorNamesList = pivotData.getAggregatorNames();

			// Build result structure
			const result = {
				rowKeys,
				colKeys,
				aggregatorNames: aggregatorNamesList,
				tree: {},
				rowTotals: {},
				colTotals: {},
				allTotal: {}
			};

			// Populate tree with aggregated values
			for (const rowKey of rowKeys) {
				const flatRowKey = rowKey.join(String.fromCharCode(0));
				result.tree[flatRowKey] = {};
				for (const colKey of colKeys) {
					const flatColKey = colKey.join(String.fromCharCode(0));
					result.tree[flatRowKey][flatColKey] = {};
					for (const aggName of aggregatorNamesList) {
						const aggregator = pivotData.getAggregator(rowKey, colKey, aggName);
						const value = aggregator && typeof aggregator.value === 'function' ? aggregator.value() : null;
						const formatted = aggregator && typeof aggregator.format === 'function' ? aggregator.format(value) : (value !== null && value !== undefined ? String(value) : '');
						result.tree[flatRowKey][flatColKey][aggName] = { value, formatted };
					}
				}
			}

			// Populate row totals
			for (const rowKey of rowKeys) {
				const flatRowKey = rowKey.join(String.fromCharCode(0));
				result.rowTotals[flatRowKey] = {};
				for (const aggName of aggregatorNamesList) {
					const aggregator = pivotData.getAggregator(rowKey, [], aggName);
					const value = aggregator && typeof aggregator.value === 'function' ? aggregator.value() : null;
					const formatted = aggregator && typeof aggregator.format === 'function' ? aggregator.format(value) : (value !== null && value !== undefined ? String(value) : '');
					result.rowTotals[flatRowKey][aggName] = { value, formatted };
				}
			}

			// Populate column totals
			for (const colKey of colKeys) {
				const flatColKey = colKey.join(String.fromCharCode(0));
				result.colTotals[flatColKey] = {};
				for (const aggName of aggregatorNamesList) {
					const aggregator = pivotData.getAggregator([], colKey, aggName);
					const value = aggregator && typeof aggregator.value === 'function' ? aggregator.value() : null;
					const formatted = aggregator && typeof aggregator.format === 'function' ? aggregator.format(value) : (value !== null && value !== undefined ? String(value) : '');
					result.colTotals[flatColKey][aggName] = { value, formatted };
				}
			}

			// Populate grand total
			for (const aggName of aggregatorNamesList) {
				const aggregator = pivotData.getAggregator([], [], aggName);
				const value = aggregator && typeof aggregator.value === 'function' ? aggregator.value() : null;
				const formatted = aggregator && typeof aggregator.format === 'function' ? aggregator.format(value) : (value !== null && value !== undefined ? String(value) : '');
				result.allTotal[aggName] = { value, formatted };
			}

			self.postMessage({ id, type: 'PIVOT_CALCULATED', result });
		} catch (error) {
			console.error('Worker calculation error:', error);
			self.postMessage({ id, type: 'ERROR', error: error.message, stack: error.stack });
		}
	}
};

