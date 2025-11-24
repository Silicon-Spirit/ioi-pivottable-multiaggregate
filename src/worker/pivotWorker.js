// Web Worker for pivot table calculations
import { PivotData, aggregators } from '../utils/utils.js';

// Threshold for using batch processing
const BATCH_SIZE = 50000;

// LTTB (Largest-Triangle-Three-Buckets) downsampling algorithm
function lttb(data, threshold) {
	if (!data || data.length === 0) return [];
	if (threshold >= data.length || threshold < 3) return data;

	// Convert data to [x, y] format if needed
	const points = data.map((point, index) => {
		if (Array.isArray(point)) {
			return { x: point[0], y: point[1], index };
		} else if (typeof point === 'number') {
			return { x: index, y: point, index };
		} else {
			return { x: point.x || index, y: point.y || point.value || 0, index };
		}
	});

	const dataLength = points.length;
	const sampled = [];
	const every = (dataLength - 2) / (threshold - 2);
	let a = 0;
	let nextA = 0;

	sampled.push(points[a]); // Always include the first point

	for (let i = 0; i < threshold - 2; i++) {
		const avgRangeStart = Math.floor((i + 1) * every) + 1;
		const avgRangeEnd = Math.floor((i + 2) * every) + 1;
		const avgRangeLength = avgRangeEnd - avgRangeStart;

		let avgX = 0;
		let avgY = 0;
		for (let j = avgRangeStart; j < avgRangeEnd; j++) {
			avgX += points[j].x;
			avgY += points[j].y;
		}
		avgX /= avgRangeLength;
		avgY /= avgRangeLength;

		const rangeOffs = Math.floor((i + 0) * every) + 1;
		const rangeTo = Math.floor((i + 1) * every) + 1;
		const pointAX = points[a].x;
		const pointAY = points[a].y;

		let maxArea = -1;
		for (let j = rangeOffs; j < rangeTo; j++) {
			const area = Math.abs(
				(pointAX - avgX) * (points[j].y - pointAY) -
				(pointAX - points[j].x) * (avgY - pointAY)
			);
			if (area > maxArea) {
				maxArea = area;
				nextA = j;
			}
		}

		sampled.push(points[nextA]);
		a = nextA;
	}

	sampled.push(points[dataLength - 1]); // Always include the last point

	// Convert back to original format
	return sampled.map(point => {
		if (Array.isArray(data[0])) {
			return [point.x, point.y];
		}
		if (typeof data[0] === 'number') {
			return point.y;
		}
		return { x: point.x, y: point.y };
	});
}

// Apply LTTB to chart data
function optimizeChartDataWithLTTB(chartData, maxPoints = 500) {
	if (!chartData || !chartData.labels || !chartData.datasets) {
		return chartData;
	}

	const { labels, datasets } = chartData;
	const dataLength = labels.length;
	if (dataLength <= maxPoints) {
		return chartData;
	}

	// Apply LTTB to each dataset
	const optimizedDatasets = datasets.map(dataset => {
		const dataPoints = labels.map((label, index) => ({
			x: index,
			y: typeof dataset.values[index] === 'number' 
				? dataset.values[index] 
				: (parseFloat(dataset.values[index]) || 0)
		}));

		const downsampled = lttb(dataPoints, maxPoints);
		const downsampledIndices = downsampled.map(point => point.x);
		const optimizedLabels = downsampledIndices.map(idx => labels[idx]);
		const optimizedValues = downsampled.map(point => point.y);

		return {
			...dataset,
			values: optimizedValues
		};
	});

	// Use the labels from the first dataset
	const firstDatasetIndices = labels.map((_, index) => index);
	const downsampledFirst = lttb(
		firstDatasetIndices.map(idx => ({ x: idx, y: 0 })),
		maxPoints
	);
	const optimizedLabels = downsampledFirst.map(point => labels[point.x]);

	return {
		labels: optimizedLabels,
		datasets: optimizedDatasets
	};
}

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
	} else if (type === 'OPTIMIZE_CHART_DATA') {
		try {
			const { chartData, chartType, lttbThreshold } = payload;
			
			// Apply LTTB for line/bar charts
			if ((chartType === 'line' || chartType === 'bar') && chartData && chartData.labels && chartData.labels.length > lttbThreshold) {
				const optimized = optimizeChartDataWithLTTB(chartData, lttbThreshold);
				self.postMessage({ id, type: 'CHART_DATA_OPTIMIZED', chartData: optimized });
			} else {
				// No optimization needed, return as-is
				self.postMessage({ id, type: 'CHART_DATA_OPTIMIZED', chartData });
			}
		} catch (error) {
			console.error('Worker chart optimization error:', error);
			self.postMessage({ id, type: 'ERROR', error: error.message, stack: error.stack });
		}
	}
};

