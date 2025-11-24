/**
 * Chart Performance Optimization Utilities
 * 
 * LTTB (Largest-Triangle-Three-Buckets): Downsampling algorithm for line/bar charts
 * Top-N: Filtering to show only top N items by value
 */

/**
 * LTTB (Largest-Triangle-Three-Buckets) downsampling algorithm
 * Reduces data points while preserving visual appearance
 * 
 * @param {Array} data - Array of [x, y] pairs or objects with x/y properties
 * @param {Number} threshold - Target number of data points
 * @returns {Array} Downsampled data array
 */
export function lttb(data, threshold) {
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
		// If original was array, return array
		if (Array.isArray(data[0])) {
			return [point.x, point.y];
		}
		// If original was number, return number
		if (typeof data[0] === 'number') {
			return point.y;
		}
		// Otherwise return object
		return { x: point.x, y: point.y };
	});
}

/**
 * Top-N filtering: Returns only the top N items by value
 * 
 * @param {Array} items - Array of items with value property or [label, value] pairs
 * @param {Number} n - Number of top items to return
 * @param {String} sortBy - 'value' (default) or 'label'
 * @param {Boolean} descending - Sort descending (default: true)
 * @returns {Array} Top N items
 */
export function topN(items, n, sortBy = 'value', descending = true) {
	if (!items || items.length === 0) return [];
	if (n >= items.length) return items;

	// Convert items to normalized format
	const normalized = items.map((item, index) => {
		if (Array.isArray(item)) {
			return {
				label: item[0],
				value: typeof item[1] === 'number' ? item[1] : (parseFloat(item[1]) || 0),
				original: item,
				index
			};
		} else if (typeof item === 'object' && item !== null) {
			return {
				label: item.name || item.label || String(index),
				value: typeof item.value === 'number' ? item.value : (parseFloat(item.value) || 0),
				original: item,
				index
			};
		} else {
			return {
				label: String(item),
				value: typeof item === 'number' ? item : (parseFloat(item) || 0),
				original: item,
				index
			};
		}
	});

	// Sort by value or label
	normalized.sort((a, b) => {
		if (sortBy === 'value') {
			return descending ? b.value - a.value : a.value - b.value;
		} else {
			return descending 
				? String(b.label).localeCompare(String(a.label))
				: String(a.label).localeCompare(String(b.label));
		}
	});

	// Return top N, preserving original format
	return normalized.slice(0, n).map(item => item.original);
}

/**
 * Apply LTTB downsampling to chart data
 * 
 * @param {Object} chartData - Chart data object with labels and datasets
 * @param {Number} maxPoints - Maximum number of data points per series
 * @returns {Object} Optimized chart data
 */
export function optimizeChartDataWithLTTB(chartData, maxPoints = 500) {
	if (!chartData || !chartData.labels || !chartData.datasets) {
		return chartData;
	}

	const { labels, datasets } = chartData;

	// Check if we need to downsample
	const dataLength = labels.length;
	if (dataLength <= maxPoints) {
		return chartData; // No need to downsample
	}

	// Apply LTTB to each dataset
	const optimizedDatasets = datasets.map(dataset => {
		// Create [x, y] pairs for LTTB
		const dataPoints = labels.map((label, index) => ({
			x: index,
			y: typeof dataset.values[index] === 'number' 
				? dataset.values[index] 
				: (parseFloat(dataset.values[index]) || 0)
		}));

		// Apply LTTB
		const downsampled = lttb(dataPoints, maxPoints);

		// Extract labels and values
		const downsampledIndices = downsampled.map(point => point.x);
		const optimizedLabels = downsampledIndices.map(idx => labels[idx]);
		const optimizedValues = downsampled.map(point => point.y);

		return {
			...dataset,
			values: optimizedValues
		};
	});

	// Use the labels from the first dataset (they should all be the same)
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

/**
 * Apply Top-N filtering to chart data with "Others" grouping
 * 
 * @param {Object} chartData - Chart data object with labels and datasets
 * @param {Number} n - Number of top items to show
 * @param {String} aggregation - 'sum' (default), 'max', 'min', 'avg' - how to aggregate multiple series
 * @param {Boolean} includeOthers - Whether to group remaining items into "Others" (default: true)
 * @returns {Object} Filtered chart data with "Others" if applicable
 */
export function optimizeChartDataWithTopN(chartData, n = 20, aggregation = 'sum', includeOthers = true) {
	if (!chartData || !chartData.labels || !chartData.datasets) {
		return chartData;
	}

	const { labels, datasets } = chartData;

	// If data is already small enough, return as-is
	if (labels.length <= n) {
		return chartData;
	}

	// Calculate aggregated value for each label across all datasets
	const labelValues = labels.map((label, labelIndex) => {
		let aggregatedValue = 0;
		let count = 0;

		datasets.forEach(dataset => {
			const value = typeof dataset.values[labelIndex] === 'number'
				? dataset.values[labelIndex]
				: (parseFloat(dataset.values[labelIndex]) || 0);
			
			if (aggregation === 'sum') {
				aggregatedValue += value;
			} else if (aggregation === 'max') {
				aggregatedValue = Math.max(aggregatedValue, value);
			} else if (aggregation === 'min') {
				aggregatedValue = count === 0 ? value : Math.min(aggregatedValue, value);
			} else if (aggregation === 'avg') {
				aggregatedValue += value;
			}
			count++;
		});

		if (aggregation === 'avg' && count > 0) {
			aggregatedValue /= count;
		}

		return {
			label,
			value: aggregatedValue,
			index: labelIndex
		};
	});

	// Sort by value descending
	labelValues.sort((a, b) => b.value - a.value);

	// Get top N indices
	const topNIndices = new Set(labelValues.slice(0, n).map(item => item.index));
	const othersIndices = labelValues.slice(n).map(item => item.index);

	// Filter labels and datasets for top N
	const filteredLabels = labels.filter((_, index) => topNIndices.has(index));
	const filteredDatasets = datasets.map(dataset => ({
		...dataset,
		values: labels.map((_, index) => topNIndices.has(index) ? dataset.values[index] : null)
			.filter((val, idx) => topNIndices.has(idx))
	}));

	// Add "Others" if there are remaining items
	if (includeOthers && othersIndices.length > 0) {
		// Calculate "Others" values by aggregating remaining items
		const othersValues = datasets.map(dataset => {
			let othersValue = 0;
			othersIndices.forEach(idx => {
				const value = typeof dataset.values[idx] === 'number'
					? dataset.values[idx]
					: (parseFloat(dataset.values[idx]) || 0);
				
				if (aggregation === 'sum') {
					othersValue += value;
				} else if (aggregation === 'max') {
					othersValue = Math.max(othersValue, value);
				} else if (aggregation === 'min') {
					othersValue = othersIndices.indexOf(idx) === 0 ? value : Math.min(othersValue, value);
				} else if (aggregation === 'avg') {
					othersValue += value;
				}
			});
			
			if (aggregation === 'avg' && othersIndices.length > 0) {
				othersValue /= othersIndices.length;
			}
			
			return othersValue;
		});

		// Add "Others" label and values
		filteredLabels.push('Others');
		filteredDatasets.forEach((dataset, datasetIndex) => {
			dataset.values.push(othersValues[datasetIndex]);
		});
	}

	return {
		labels: filteredLabels,
		datasets: filteredDatasets
	};
}

/**
 * Apply Top-N filtering to pie chart data with "Others" grouping
 * 
 * @param {Array} pieData - Array of {name, value} objects
 * @param {Number} n - Number of top items to show
 * @param {Boolean} includeOthers - Whether to group remaining items into "Others" (default: true)
 * @returns {Array} Filtered pie data with "Others" if applicable
 */
export function optimizePieDataWithTopN(pieData, n = 20, includeOthers = true) {
	if (!pieData || pieData.length === 0) return pieData;
	if (n >= pieData.length) return pieData;

	// Sort by value descending
	const sorted = [...pieData].sort((a, b) => {
		const valA = typeof a.value === 'number' ? a.value : (parseFloat(a.value) || 0);
		const valB = typeof b.value === 'number' ? b.value : (parseFloat(b.value) || 0);
		return valB - valA;
	});

	// Get top N
	const topN = sorted.slice(0, n);
	const others = sorted.slice(n);

	// Add "Others" if there are remaining items
	if (includeOthers && others.length > 0) {
		// Sum all "Others" values
		const othersValue = others.reduce((sum, item) => {
			const val = typeof item.value === 'number' ? item.value : (parseFloat(item.value) || 0);
			return sum + val;
		}, 0);

		topN.push({
			name: 'Others',
			value: othersValue
		});
	}

	return topN;
}

/**
 * Auto-optimize chart data based on data size
 * 
 * @param {Object} chartData - Chart data object
 * @param {String} chartType - 'bar', 'line', 'pie', 'percentage'
 * @param {Object} options - Optimization options
 * @returns {Object} Optimized chart data
 */
export function autoOptimizeChartData(chartData, chartType, options = {}) {
	if (!chartData || !chartData.labels || !chartData.datasets) {
		return chartData;
	}

	const {
		lttbThreshold = 150,      // Max points for LTTB
		topNThreshold = 20,        // Max items for Top-N
		enableLTTB = true,        // Enable LTTB for line/bar charts
		enableTopN = true         // Enable Top-N filtering
	} = options;

	const dataLength = chartData.labels.length;
	const datasetCount = chartData.datasets.length;

	// For pie charts, use Top-N
	if (chartType === 'pie' && enableTopN && dataLength > topNThreshold) {
		// Pie data is already in a different format, handled in the component
		return chartData;
	}

	// For line/bar charts with many data points, use LTTB
	if ((chartType === 'line' || chartType === 'bar') && enableLTTB && dataLength > lttbThreshold) {
		return optimizeChartDataWithLTTB(chartData, lttbThreshold);
	}

	// For charts with many series, use Top-N
	if (enableTopN && dataLength > topNThreshold) {
		return optimizeChartDataWithTopN(chartData, topNThreshold);
	}

	return chartData;
}

