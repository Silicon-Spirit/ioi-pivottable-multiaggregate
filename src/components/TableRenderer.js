import { PivotEngine } from "../utils/pivotEngine.js";
import defaultProps from "../utils/defaultProps.js";
import { h } from "vue";
import * as XLSX from "xlsx";
import ChartWrapper from "./RechartsWrapper.js";
import { pivotWorkerManager } from "../utils/pivotWorkerManager.js";
import { optimizeChartDataWithTopN } from "../utils/chartOptimization.js";

function redColorScaleGenerator(values) {
	const min = Math.min.apply(Math, values);
	const max = Math.max.apply(Math, values);
	return (x) => {
		// eslint-disable-next-line no-magic-numbers
		const nonRed = 255 - Math.round((255 * (x - min)) / (max - min));
		return { backgroundColor: `rgb(255,${nonRed},${nonRed})` };
	};
}

function makeRenderer(opts = {}) {
	const TableRenderer = {
		name: opts.name,
		props: {
			mode: String,
			tableColorScaleGenerator: {
				type: Function,
				default: redColorScaleGenerator,
			},
			tableOptions: {
				type: Object,
				default: function () {
					return {};
				},
			},
			...defaultProps.props
	},
	data() {
		return {
				chartInstance: null,
				cachedPivotData: null,
				cachedInputHash: null,
				calculationStartTime: null,
				calculationTime: 0,
				renderingStartTime: null
			};
		},
		methods: {
			spanSize(arr, i, j) {
				// helper function for setting row/col-span in pivotTableRenderer
				let x;
				if (i !== 0) {
					let asc, end;
					let noDraw = true;
					for (
						x = 0, end = j, asc = end >= 0;
						asc ? x <= end : x >= end;
						asc ? x++ : x--
					) {
						if (arr[i - 1][x] !== arr[i][x]) {
							noDraw = false;
						}
					}
					if (noDraw) {
						return -1;
					}
				}
				let len = 0;
				while (i + len < arr.length) {
					let asc1, end1;
					let stop = false;
					for (
						x = 0, end1 = j, asc1 = end1 >= 0;
						asc1 ? x <= end1 : x >= end1;
						asc1 ? x++ : x--
					) {
						if (arr[i][x] !== arr[i + len][x]) {
							stop = true;
						}
					}
					if (stop) {
						break;
					}
					len++;
				}
				return len;
			},
			getChartData() {
				// Check if we have a pre-calculated result with Top-N already applied
				let rowKeys, colKeys, aggregatorList, pivotData;
				
				if (this.usePreCalculatedResult && this.pivotResult && 
					this.pivotResult.rowKeys && this.pivotResult.colKeys && this.pivotResult.tree) {
					// Use pre-calculated result (Top-N already applied)
					rowKeys = this.pivotResult.rowKeys;
					colKeys = this.pivotResult.colKeys;
					aggregatorList = this.pivotResult.aggregatorNames || [];
					pivotData = null; // We'll use pivotResult.tree instead
				} else {
					// Create new PivotEngine instance (for small datasets or when worker not used)
					pivotData = new PivotEngine(this.$props);
					// Always use aggregator names from PivotEngine as the source of truth
					// This ensures the names match exactly what's stored in the aggregator collections
					aggregatorList = [];
					if (typeof pivotData.getAggregatorNames === "function") {
						const names = pivotData.getAggregatorNames();
						if (Array.isArray(names) && names.length > 0) {
							aggregatorList = names.filter((name) => typeof name === "string" && name.length);
						}
					}
					// Only fall back to props if PivotData doesn't have aggregator names
					if (!aggregatorList.length) {
						if (Array.isArray(this.aggregatorNames) && this.aggregatorNames.length) {
							aggregatorList = this.aggregatorNames.filter((name) => typeof name === "string" && name.length);
						} else if (Array.isArray(this.aggregatorName)) {
							aggregatorList = this.aggregatorName.filter((name) => typeof name === "string" && name.length);
						} else if (typeof this.aggregatorName === "string" && this.aggregatorName) {
							aggregatorList = [this.aggregatorName];
				}
					}
					if (!aggregatorList.length) {
						const fallbackKeys = Object.keys(pivotData.props.aggregators || {});
						if (fallbackKeys.length) {
							aggregatorList = [fallbackKeys[0]];
						}
					}
					rowKeys = pivotData.getRowKeys();
					colKeys = pivotData.getColKeys();
				}
				
				const primaryAggregator = aggregatorList[0];

				// Check if we have data (either from pivotData or pivotResult)
				const hasData = pivotData ? Object.keys(pivotData.tree).length > 0 : 
					(this.pivotResult && this.pivotResult.tree && Object.keys(this.pivotResult.tree).length > 0);
				
				if (hasData) {

					if (rowKeys.length === 0) {
						rowKeys.push([]);
					}
					if (colKeys.length === 0) {
						colKeys.push([]);
					}

					const headerRow = [];

					if (colKeys.length === 1 && colKeys[0].length === 0) {
						headerRow.push(primaryAggregator || this.aggregatorName);
					} else {
						colKeys.map((col) => {
							// Include null values in header display - convert "null" to "(null)" for better visibility
							let displayCols = col.map(el => {
								if (el === null || el === "null" || el === "") {
									return "(null)";
								}
								return el;
							});
							headerRow.push(displayCols.join("-"));
						});
					}

					const rawData = rowKeys.map((r) => {
						const row = [];
						colKeys.map((c) => {
							let v = null;
							
							if (pivotData) {
								// Use PivotData instance
								const aggregator =
									primaryAggregator
										? pivotData.getAggregator(r, c, primaryAggregator)
										: pivotData.getAggregator(r, c);
								v = aggregator && typeof aggregator.value === "function"
									? aggregator.value()
									: null;
							} else if (this.pivotResult && this.pivotResult.tree) {
								// Use pre-calculated result (Top-N already applied)
								const flatRowKey = r.join(String.fromCharCode(0));
								const flatColKey = c.join(String.fromCharCode(0));
								const cellData = this.pivotResult.tree[flatRowKey]?.[flatColKey]?.[primaryAggregator];
								if (cellData) {
									v = cellData.value;
								}
							}
							
							row.push(v || "");
						});
						return row;
					});

					rawData.unshift(headerRow);

					// Filter out null values from labels
					// Create labels from row keys, including null values
					const labels = rowKeys
						.map(r => {
							// Include null values - convert "null" to "(null)" for better visibility
							const display = r.map(el => {
								if (el === null || el === "null" || el === "") {
									return "(null)";
								}
								return el;
							});
							return display.length > 0 ? display.join("-") : "(null)";
						});

					// Filter datasets to exclude those with null in their names
					// Also filter out datasets where the name contains "null"
					const datasets = rawData[0]
						.map((name, index) => {
							// Skip if name is null, empty, contains "null", or is just "null"
							if (!name || name === "" || name === "null" || String(name).includes("null")) {
								return null;
							}
						const values = rawData.slice(1).map(row => row[index]);
						return {
							name: name,
							values: values
							};
						})
						.filter(dataset => dataset !== null && dataset.name && !String(dataset.name).includes("null"));

					let data = {
						labels: labels,
						datasets: datasets
					}

					// Format values empty string to number to fix pie/percentage charts issues
					const isNumber = data.datasets.some(entry => 
						entry.values.some(value => typeof value === "number")
					);

					if (isNumber == true) {				
						data.datasets.forEach(entry => {
							entry.values = entry.values.map(value => value === "" ? 0 : value);
						});
					}

					// Apply Top-N with "Others" grouping if data is large
					// Threshold: 20 items for all chart types
					const topNThreshold = 20;
					if (data.labels.length > topNThreshold) {
						data = optimizeChartDataWithTopN(data, topNThreshold, 'sum', true);
					}

					return data;
				} else {
					return { labels: [], datasets: [] };
				}
			},
		},
		render() {
			try {
				// Use this.mode prop if available, otherwise fall back to opts.mode
				// Declare once at the top to avoid duplicate declarations
				const currentMode = this.mode || opts.mode;
				
				// Helper function to round numeric values to 2 decimal places
				const roundNumericValue = (val) => {
					if (val === null || val === undefined || val === "") {
						return val;
					}
					// Check if value is numeric
					const numValue = typeof val === 'number' ? val : parseFloat(val);
					if (!isNaN(numValue) && isFinite(numValue)) {
						// Round to 2 decimal places
						return Math.round(numValue * 100) / 100;
					}
					return val;
				};

				// Helper function to apply aggregation method to a collection of values
				const applyAggregationToValues = (values, aggName) => {
					if (!values || values.length === 0) {
						return null;
					}
					
					// Apply aggregation based on aggregator name
					// Remove parentheses and extra text (e.g., "Average(Amount)" -> "Average")
					const cleanAggName = aggName.split('(')[0].trim().toLowerCase();
					
					// Special handling for "List Unique Values" - returns string, not number
					if (cleanAggName.includes('list') && cleanAggName.includes('unique')) {
						// For List Unique Values: combine all unique values from all cells
						const allUniqueValues = new Set();
						values.forEach(v => {
							if (v !== null && v !== undefined && v !== "") {
								// Each cell value is a comma-separated string like "North, East, South"
								const cellValues = String(v).split(',').map(s => s.trim()).filter(s => s.length > 0);
								cellValues.forEach(val => allUniqueValues.add(val));
							}
						});
						// Return comma-separated list of all unique values
						return Array.from(allUniqueValues).join(', ');
					}
					
					// For numeric aggregations, filter out null/undefined and non-numeric values
					const validValues = values.filter(v => v !== null && v !== undefined && !isNaN(parseFloat(v)));
					if (validValues.length === 0) {
						return null;
					}
					
					const numValues = validValues.map(v => typeof v === 'number' ? v : parseFloat(v));
					
					// Check for specific aggregator types (order matters - check more specific first)
					// Check for Average FIRST before Sum to avoid false matches
					if (cleanAggName === 'average' || cleanAggName.includes('average') || cleanAggName.includes('mean') || cleanAggName === 'avg') {
						// For Average: average of all visible cell values
						const sum = numValues.reduce((s, val) => s + val, 0);
						const avg = sum / numValues.length;
						return avg;
					} else if (cleanAggName.includes('count') && !cleanAggName.includes('fraction')) {
						// For Count: sum all counts (each cell is a count)
						const result = numValues.reduce((sum, val) => sum + val, 0);
						return result;
					} else if (cleanAggName.includes('median')) {
						// For Median: median of all visible cell values
						const sorted = [...numValues].sort((a, b) => a - b);
						const mid = Math.floor(sorted.length / 2);
						const result = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
						return result;
					} else if (cleanAggName.includes('min')) {
						// For Minimum: minimum of all visible cell values
						const result = Math.min(...numValues);
						return result;
					} else if (cleanAggName.includes('max')) {
						// For Maximum: maximum of all visible cell values
						const result = Math.max(...numValues);
						return result;
					} else if (cleanAggName.includes('sum') && !cleanAggName.includes('fraction')) {
						// For Sum: sum all visible cell values
						const result = numValues.reduce((sum, val) => sum + val, 0);
						return result;
					} else {
						// Default: sum (for unknown aggregations)
						// This should not happen, but fallback to sum
						const result = numValues.reduce((sum, val) => sum + val, 0);
						return result;
					}
				};

				const formatCellDisplay = (aggregator, value) => {
					let formatted = "";
					if (aggregator && typeof aggregator.format === "function") {
						formatted = aggregator.format(value);
					} else if (value !== undefined && value !== null && value !== "") {
						formatted = value;
					}
					const isEmpty =
						formatted === "" ||
						formatted === null ||
						(typeof formatted === "number" && Number.isNaN(formatted));
					if (isEmpty) {
						return { formatted: "—", isEmpty: true };
					}
					
					// Check if this is a string aggregator (like List Unique Values)
					// For string aggregators, don't try to round - just return the string as-is
					if (typeof formatted === "string" && formatted.includes(",")) {
						// This looks like a comma-separated list (List Unique Values)
						return { formatted, isEmpty: false };
					}
					
					// Round numeric values to 2 decimal places
					const roundedValue = roundNumericValue(formatted);
					
					if (typeof roundedValue !== "string") {
						formatted = String(roundedValue);
					} else {
						// If it's a string, check if it represents a number and round it
						const numValue = parseFloat(roundedValue);
						if (!isNaN(numValue) && isFinite(numValue)) {
							formatted = String(Math.round(numValue * 100) / 100);
						} else {
							formatted = roundedValue;
						}
					}
					return { formatted, isEmpty: false };
				};
				
				if (['table', 'heat-map-full', 'heat-map-col', 'heat-map-row'].includes(currentMode)) {
					// Start rendering time measurement
					this.renderingStartTime = performance.now();
					
					// Check if we should use pre-calculated result from Web Worker
					let pivotData = null;
					let usePreCalculated = false;
					
					// Only check for pre-calculated result if we're actually using worker workflow
					if (this.usePreCalculatedResult) {
						// Check if we have a valid result (either from worker or sync fallback)
						if (this.pivotResult && typeof this.pivotResult === 'object' && 
						    this.pivotResult.rowKeys && this.pivotResult.colKeys && this.pivotResult.tree) {
							// Use pre-calculated result - could be from worker or sync fallback
							usePreCalculated = true;
							this.calculationTime = 0; // Calculation already done
							if (this.calculationError) {
								console.warn('Using sync fallback result after worker error');
							} else {
								console.log(`[Performance] Using pre-calculated result from Web Worker`);
							}
						} else if (this.isCalculating) {
							// Worker is still calculating - show loading state
							return h('div', {
								class: 'pvtCalculating',
								style: { padding: '20px', textAlign: 'center' }
							}, 'Calculating...');
						} else {
							// Calculation finished but no result - fall through to create PivotData synchronously
							// This handles cases where worker failed and sync fallback also failed
							// or when calculation is still in progress but isCalculating flag hasn't been set yet
							console.warn('No pre-calculated result available, will create PivotData synchronously');
						}
					}
					// If usePreCalculatedResult is false, we skip the above and go straight to creating PivotData
					
					// If not using pre-calculated result, check if we have pivotResult from async calculation
					// For small datasets, PivottableUi calculates asynchronously and sets pivotResult
					if (!usePreCalculated) {
						// Validate data before creating PivotData
						if (!Array.isArray(this.data) || this.data.length === 0) {
							return null; // Don't render if no data
						}
						
						// If calculation is in progress, show loading state
						if (this.isCalculating) {
							return h('div', {
								class: 'pvtCalculating',
								style: { padding: '20px', textAlign: 'center' }
							}, 'Calculating...');
						}
						
						// Check if we have a pre-calculated result from PivottableUi's async calculation
						// If yes, use it to avoid synchronous recalculation
						if (this.pivotResult && this.pivotResult.rowKeys && this.pivotResult.colKeys) {
							// We have a pre-calculated result - use it
							// Create PivotData but it will be used with the pre-calculated result
							// The actual calculation was already done asynchronously
							try {
								pivotData = new PivotEngine(this.$props);
								// Mark that we're using pre-calculated data
								usePreCalculated = true;
								this.cachedPivotData = pivotData;
								this.cachedInputHash = inputHash;
								this.calculationTime = 0; // Already calculated asynchronously
							} catch (error) {
								console.error('Error creating PivotData from pre-calculated result:', error);
								return null;
							}
						}
						
						// Create a hash of inputs to determine if recalculation is needed
						const inputHash = JSON.stringify({
							data: this.data?.length || 0,
							rows: this.rows,
							cols: this.cols,
							vals: this.vals,
							aggregatorNames: this.aggregatorNames,
							aggregatorVals: this.aggregatorVals,
							valueFilter: this.valueFilter,
							rowOrder: this.rowOrder,
							colOrder: this.colOrder
						});
						
						// Use cached PivotData if inputs haven't changed
						if (this.cachedPivotData && this.cachedInputHash === inputHash) {
							pivotData = this.cachedPivotData;
							this.calculationTime = 0; // No calculation needed
							console.log(`[Performance] Using cached PivotData (no recalculation needed)`);
						} else {
							// For small datasets, check if we have a pre-calculated result from PivottableUi
							// If isCalculating is true, calculation is in progress - show loading
							// If pivotResult exists, use it to create PivotData without recalculating
							if (this.pivotResult && this.pivotResult.rowKeys) {
								// Use pre-calculated result - create PivotData from it
								// This avoids blocking the UI thread
								try {
									// Create PivotData but it will use cached result
									// We still need to create it for the API, but it won't recalculate
									pivotData = new PivotEngine(this.$props);
									this.cachedPivotData = pivotData;
									this.cachedInputHash = inputHash;
									this.calculationTime = 0; // Already calculated
								} catch (error) {
									console.error('Error creating PivotData from cached result:', error);
									return null;
								}
							} else {
								// No pre-calculated result and calculation not in progress
								// This shouldn't happen if PivottableUi is working correctly
								// But fallback to synchronous creation if needed
								this.calculationStartTime = performance.now();
								try {
									// Validate props before creating PivotData
									if (!this.$props || !this.$props.data) {
										console.warn('Invalid props for PivotData creation');
										return null;
									}
									
									pivotData = new PivotEngine(this.$props);
									const calculationEndTime = performance.now();
									this.calculationTime = calculationEndTime - this.calculationStartTime;
									
									const dataSize = Array.isArray(this.data) ? this.data.length : 0;
									console.log(`\n[Performance] Pivot Calculation: ${this.calculationTime.toFixed(2)}ms for ${dataSize} records`);
									console.log(`[Performance] Calculation Rate: ${dataSize > 0 ? (dataSize / this.calculationTime * 1000).toFixed(0) : 0} records/sec`);
									
									this.cachedPivotData = pivotData;
									this.cachedInputHash = inputHash;
								} catch (error) {
									console.error('Error creating PivotData in render:', error);
									return null;
								}
							}
						}
					}

					// Helper function to format aggregator name with value field
					const formatAggregatorHeader = (aggName) => {
						const aggregatorVals = this.aggregatorVals || {};
						const vals = aggregatorVals[aggName];
						if (vals && Array.isArray(vals) && vals.length > 0 && vals[0]) {
							// Format: "AggregationName(ValueField)" or "AggregationName of ValueField" for Count
							if (aggName === "Count" || aggName === __("Count")) {
								return `${aggName} of ${vals[0]}`;
							} else {
								return `${aggName}(${vals[0]})`;
							}
						}
						return aggName;
					};

					let aggregatorList = [];
					if (usePreCalculated && this.pivotResult) {
						// Use pre-calculated aggregator names from worker
						aggregatorList = this.pivotResult.aggregatorNames || [];
					} else if (pivotData && typeof pivotData.getAggregatorNames === "function") {
						const names = pivotData.getAggregatorNames();
						if (Array.isArray(names)) {
							aggregatorList = names.filter((name) => typeof name === "string" && name.length);
						}
					}
					if (!aggregatorList.length) {
						// Check aggregatorNames prop first (plural)
						if (Array.isArray(this.aggregatorNames) && this.aggregatorNames.length) {
							aggregatorList = this.aggregatorNames.filter((name) => typeof name === "string" && name.length);
						} else if (Array.isArray(this.aggregatorName)) {
							aggregatorList = this.aggregatorName.filter((name) => typeof name === "string" && name.length);
						} else if (typeof this.aggregatorName === "string" && this.aggregatorName) {
							aggregatorList = [this.aggregatorName];
						}
					}
					if (!aggregatorList.length && pivotData) {
						const fallbackKeys = Object.keys(pivotData.props?.aggregators || {});
						if (fallbackKeys.length) {
							aggregatorList = [fallbackKeys[0]];
						}
					}
					if (!aggregatorList.length) {
						aggregatorList = ["Count"];
					}

					const aggregatorCount = aggregatorList.length;

					// Get row/col attrs and keys - use pre-calculated if available, otherwise from pivotData
					let rowAttrs = [];
					let colAttrs = [];
					let baseRowKeys = [];
					let baseColKeys = [];

					if (usePreCalculated && this.pivotResult && 
					    Array.isArray(this.pivotResult.rowKeys) && Array.isArray(this.pivotResult.colKeys)) {
						rowAttrs = this.rows || [];
						colAttrs = this.cols || [];
						// Ensure all elements are arrays
						baseRowKeys = this.pivotResult.rowKeys.filter(key => Array.isArray(key)) || [];
						baseColKeys = this.pivotResult.colKeys.filter(key => Array.isArray(key)) || [];
					} else if (pivotData) {
						try {
							rowAttrs = pivotData.props?.rows || [];
							colAttrs = pivotData.props?.cols || [];
							const rowKeysResult = pivotData.getRowKeys();
							const colKeysResult = pivotData.getColKeys();
							
							// Ensure results are arrays and all elements are arrays
							if (Array.isArray(rowKeysResult)) {
								baseRowKeys = rowKeysResult.filter(key => Array.isArray(key));
							} else {
								baseRowKeys = [];
							}
							
							if (Array.isArray(colKeysResult)) {
								baseColKeys = colKeysResult.filter(key => Array.isArray(key));
							} else {
								baseColKeys = [];
							}
						} catch (error) {
							console.error('Error getting keys from pivotData:', error);
							// Fallback to props
							rowAttrs = this.rows || [];
							colAttrs = this.cols || [];
							baseRowKeys = [];
							baseColKeys = [];
						}
					} else {
						// Fallback: use props directly if neither is available
						rowAttrs = this.rows || [];
						colAttrs = this.cols || [];
						baseRowKeys = [];
						baseColKeys = [];
					}
					
					// Safety check: ensure baseRowKeys and baseColKeys are always arrays
					if (!Array.isArray(baseRowKeys)) {
						baseRowKeys = [];
					}
					if (!Array.isArray(baseColKeys)) {
						baseColKeys = [];
					}
					
					// Include null values in calculations and display
					// First, ensure all elements are arrays
					const validBaseRowKeys = baseRowKeys.filter(rowKey => Array.isArray(rowKey));
					const validBaseColKeys = baseColKeys.filter(colKey => Array.isArray(colKey));
					
					// Don't filter out null values - include them in calculations and display
					const filteredRowKeys = validBaseRowKeys;
					const filteredColKeys = validBaseColKeys;
					
					// Check if all data is filtered out - hide table if:
					// 1. Both rowKeys and colKeys are empty and tree is empty, OR
					// 2. There are row attributes defined but all rowKeys are filtered out, OR
					// 3. There are column attributes defined but all colKeys are filtered out
					const hasRowAttrs = rowAttrs.length > 0;
					const hasColAttrs = colAttrs.length > 0;
					const allRowsFiltered = hasRowAttrs && filteredRowKeys.length === 0;
					const allColsFiltered = hasColAttrs && filteredColKeys.length === 0;
					// Check tree emptiness - use pivotResult.tree if available, otherwise pivotData.tree
					const tree = usePreCalculated && this.pivotResult ? this.pivotResult.tree : (pivotData ? pivotData.tree : {});
					const bothEmpty = filteredRowKeys.length === 0 && filteredColKeys.length === 0 && Object.keys(tree).length === 0;
					
					const isAllDataFiltered = bothEmpty || allRowsFiltered || allColsFiltered;
					
					if (isAllDataFiltered) {
						return null; // Don't display the table when all values are filtered
					}
					
					const rowKeys = filteredRowKeys.length ? filteredRowKeys : [[]];
					const colKeys = filteredColKeys.length ? filteredColKeys : [[]];

					let effectiveColKeys =
						aggregatorCount > 1
							? colKeys.flatMap((colKey) =>
									aggregatorList.map((aggName) => [...colKey, aggName])
							  )
							: colKeys.map((colKey) =>
									colKey.length === 0 ? [aggregatorList[0]] : colKey
							  );

					let columnDescriptors =
						aggregatorCount > 1
							? colKeys.flatMap((colKey) =>
									aggregatorList.map((aggName) => ({
										colKey,
										aggregatorName: aggName,
									}))
							  )
							: colKeys.map((colKey) => ({
									colKey,
									aggregatorName: aggregatorList[0],
							  }));

					// When there are no horizontal header fields (colAttrs.length === 0),
					// the standard format shows one column per aggregator
					// effectiveColKeys and columnDescriptors are already correctly structured for this case
					// No need to remove columns - they represent the aggregator columns that should be displayed

					const headerColAttrs =
						aggregatorCount > 1 ? [...colAttrs, __("Values")] : colAttrs.slice();

					const totalsRowSpan = headerColAttrs.length;

					let valueCellColors = () => ({});
					let rowTotalColors = () => ({});
					let colTotalColors = () => ({});

					// Apply heatmap colors if in heatmap mode (works with single or multiple aggregators)
					// For multiple aggregators, use the first aggregator for heatmap coloring
					if (currentMode && ['heat-map-full', 'heat-map-col', 'heat-map-row'].includes(currentMode)) {
					const colorScaleGenerator = this.tableColorScaleGenerator;
						const primaryAggregator = aggregatorList[0]; // Use first aggregator for heatmap
						
						if (usePreCalculated && this.pivotResult) {
							// Use pre-calculated data from worker for heatmap
							const rowTotalValues = colKeys.map((colKey) => {
								const flatColKey = colKey.join(String.fromCharCode(0));
								return this.pivotResult.colTotals[flatColKey]?.[primaryAggregator]?.value ?? null;
							});
					rowTotalColors = colorScaleGenerator(rowTotalValues);
							
							const colTotalValues = rowKeys.map((rowKey) => {
								const flatRowKey = rowKey.join(String.fromCharCode(0));
								return this.pivotResult.rowTotals[flatRowKey]?.[primaryAggregator]?.value ?? null;
							});
					colTotalColors = colorScaleGenerator(colTotalValues);

							if (currentMode === "heat-map-full") {
						const allValues = [];
								rowKeys.forEach((rowKey) =>
									colKeys.forEach((colKey) => {
										const flatRowKey = rowKey.join(String.fromCharCode(0));
										const flatColKey = colKey.join(String.fromCharCode(0));
										const val = this.pivotResult.tree[flatRowKey]?.[flatColKey]?.[primaryAggregator]?.value ?? null;
										allValues.push(val);
									})
						);
						const colorScale = colorScaleGenerator(allValues);
								valueCellColors = (rowKey, colKey, value) => colorScale(value);
							} else if (currentMode === "heat-map-row") {
						const rowColorScales = {};
								rowKeys.forEach((rowKey) => {
									const flatRowKey = rowKey.join(String.fromCharCode(0));
									const rowValues = colKeys.map((colKey) => {
										const flatColKey = colKey.join(String.fromCharCode(0));
										return this.pivotResult.tree[flatRowKey]?.[flatColKey]?.[primaryAggregator]?.value ?? null;
									});
									rowColorScales[flatRowKey] = colorScaleGenerator(rowValues);
						});
								valueCellColors = (rowKey, colKey, value) => {
									const flatRowKey = rowKey.join(String.fromCharCode(0));
									const scale = rowColorScales[flatRowKey];
									return scale ? scale(value) : {};
								};
							} else if (currentMode === "heat-map-col") {
						const colColorScales = {};
								colKeys.forEach((colKey) => {
									const flatColKey = colKey.join(String.fromCharCode(0));
									const colValues = rowKeys.map((rowKey) => {
										const flatRowKey = rowKey.join(String.fromCharCode(0));
										return this.pivotResult.tree[flatRowKey]?.[flatColKey]?.[primaryAggregator]?.value ?? null;
									});
									colColorScales[flatColKey] = colorScaleGenerator(colValues);
								});
								valueCellColors = (rowKey, colKey, value) => {
									const flatColKey = colKey.join(String.fromCharCode(0));
									const scale = colColorScales[flatColKey];
									return scale ? scale(value) : {};
								};
							}
						} else if (pivotData) {
							// Fallback to PivotData instance
							const rowTotalValues = colKeys.map((colKey) => {
								const agg = pivotData.getAggregator([], colKey, primaryAggregator);
								return agg && typeof agg.value === 'function' ? agg.value() : null;
							});
							rowTotalColors = colorScaleGenerator(rowTotalValues);
							
							const colTotalValues = rowKeys.map((rowKey) => {
								const agg = pivotData.getAggregator(rowKey, [], primaryAggregator);
								return agg && typeof agg.value === 'function' ? agg.value() : null;
							});
							colTotalColors = colorScaleGenerator(colTotalValues);

							if (currentMode === "heat-map-full") {
								const allValues = [];
								rowKeys.forEach((rowKey) =>
									colKeys.forEach((colKey) => {
										const agg = pivotData.getAggregator(rowKey, colKey, primaryAggregator);
										const val = agg && typeof agg.value === 'function' ? agg.value() : null;
										allValues.push(val);
									})
								);
								const colorScale = colorScaleGenerator(allValues);
								valueCellColors = (rowKey, colKey, value) => colorScale(value);
							} else if (currentMode === "heat-map-row") {
								const rowColorScales = {};
								rowKeys.forEach((rowKey) => {
									const flatRowKey = rowKey.join(String.fromCharCode(0));
									const rowValues = colKeys.map((colKey) => {
										const agg = pivotData.getAggregator(rowKey, colKey, primaryAggregator);
										return agg && typeof agg.value === 'function' ? agg.value() : null;
									});
									rowColorScales[flatRowKey] = colorScaleGenerator(rowValues);
								});
								valueCellColors = (rowKey, colKey, value) => {
									const flatRowKey = rowKey.join(String.fromCharCode(0));
									const scale = rowColorScales[flatRowKey];
									return scale ? scale(value) : {};
								};
							} else if (currentMode === "heat-map-col") {
								const colColorScales = {};
								colKeys.forEach((colKey) => {
									const flatColKey = colKey.join(String.fromCharCode(0));
									const colValues = rowKeys.map((rowKey) => {
										const agg = pivotData.getAggregator(rowKey, colKey, primaryAggregator);
										return agg && typeof agg.value === 'function' ? agg.value() : null;
									});
									colColorScales[flatColKey] = colorScaleGenerator(colValues);
						});
								valueCellColors = (rowKey, colKey, value) => {
									const flatColKey = colKey.join(String.fromCharCode(0));
									const scale = colColorScales[flatColKey];
									return scale ? scale(value) : {};
								};
							}
					}
				}

				const getClickHandler =
					this.tableOptions && this.tableOptions.clickCallback
						? (value, rowValues, colValues) => {
							const filters = {};
							for (const i of Object.keys(colAttrs || {})) {
								const attr = colAttrs[i];
								if (colValues[i] !== null) {
									filters[attr] = colValues[i];
								}
							}
							for (const i of Object.keys(rowAttrs || {})) {
								const attr = rowAttrs[i];
								if (rowValues[i] !== null) {
									filters[attr] = rowValues[i];
								}
							}
							return (e) =>
										this.tableOptions.clickCallback(e, value, filters, pivotData || null);
						}
						: null;

					let headerRows;

					if (!colAttrs.length) {
						const rowCells = [];
						// When no column attributes:
						// 1. Add row attribute labels - the last one should span to cover corner area
						if (rowAttrs.length) {
							rowAttrs.forEach((r, i) => {
								const isLastRowAttr = i === rowAttrs.length - 1;
								rowCells.push(
									h(
										"th",
					{
											class: ["pvtAxisLabel"],
											key: `rowAttr${i}`,
											// Last row attribute spans to cover corner area (its own column + corner = 2 columns)
											colSpan: isLastRowAttr ? 2 : 1,
										},
										r
									)
								);
							});
						} else {
							// If no row attributes, add empty corner cell
							rowCells.push(
								h("th", {
									class: ["pvtAxisLabel"],
									colSpan: 1,
								}, null)
							);
						}
						// 2. Add aggregator names starting from where table body begins (one position to the right of last row attr)
						aggregatorList.forEach((aggName, aggIndex) => {
							rowCells.push(
								h(
									"th",
									{
										class: ["pvtColLabel"],
										key: `aggHeader-${aggIndex}`,
									},
									formatAggregatorHeader(aggName)
								)
							);
						});
						headerRows = [h("tr", rowCells)];
					} else {
						headerRows = headerColAttrs.map((attr, attrIndex) => {
							const cells = [];
							const isLastHeaderRow = attrIndex === headerColAttrs.length - 1;

							if (!isLastHeaderRow && rowAttrs.length !== 0 && attrIndex === 0) {
								const rowSpan = headerColAttrs.length - 1;
								if (rowSpan > 0) {
									cells.push(
										h("th", {
												colSpan: rowAttrs.length,
											rowSpan,
											})
									);
								}
							}

							if (isLastHeaderRow && rowAttrs.length !== 0) {
								rowAttrs.forEach((r, i) => {
									cells.push(
										h(
											"th",
											{
												class: ["pvtAxisLabel"],
												key: `rowAttr${i}`,
											},
											r
										)
									);
								});
							}

							cells.push(
								h(
									"th",
									{
										class: ["pvtAxisLabel"],
									},
									attr
								)
							);

							effectiveColKeys.forEach((colKey, i) => {
								const span = this.spanSize(effectiveColKeys, i, attrIndex);
								if (span === -1) {
									return;
								}
								// When this is the "Values" row (last header row with multiple aggregators), show aggregator name with value field
								let cellContent = colKey[attrIndex] != null ? colKey[attrIndex] : "";
								if (isLastHeaderRow && attr === __("Values") && aggregatorCount > 1) {
									// colKey[attrIndex] contains the aggregator name in the "Values" row
									const aggName = cellContent;
									if (aggName && aggregatorList.includes(aggName)) {
										cellContent = formatAggregatorHeader(aggName);
									}
								}
								cells.push(
									h(
												"th",
												{
													class: ["pvtColLabel"],
											key: `colKey${i}-${attrIndex}`,
											colSpan: span,
											rowSpan: 1,
										},
										cellContent
									)
								);
							});

							if (
								attrIndex === 0 &&
								this.rowTotal &&
								aggregatorCount > 0 &&
								headerColAttrs.length > 1
							) {
								const remainingRows = headerColAttrs.length - 1;
								if (remainingRows > 0) {
									cells.push(
										h(
												"th",
												{
												class: ["pvtTotalGroupLabel"],
												colSpan: aggregatorCount,
												rowSpan: remainingRows,
												},
											__("Totals")
											)
								);
								}
							}

							if (isLastHeaderRow && this.rowTotal && aggregatorCount > 0) {
								if (aggregatorCount > 1) {
								aggregatorList.forEach((aggName, aggIndex) => {
									cells.push(
										h(
											"th",
											{
												class: ["pvtColLabel"],
												key: `totalHeader-${aggIndex}`,
											},
											formatAggregatorHeader(aggName)
										)
										);
								});
								} else {
									cells.push(
										h(
											"th",
											{
												class: ["pvtColLabel"],
											},
											__("Totals")
										)
									);
								}
							}

								return h(
									"tr",
									{
									key: `colAttrs${attrIndex}`,
									},
								cells
							);
						});
					}

					// When there are no vertical header fields, skip data rows (only show Totals row)
					const bodyRows = rowAttrs.length === 0 
						? []
						: rowKeys.map((rowKey, rowIndex) => {
							const rowCells = [];

							rowKey.forEach((txt, attrIndex) => {
								const span = this.spanSize(rowKeys, rowIndex, attrIndex);
								if (span === -1) {
									return;
								}
								const isLastRowAttr = attrIndex === rowAttrs.length - 1;
								// Last row attribute should span 2 columns when:
								// 1. There are column attributes (headerColAttrs.length !== 0), OR
								// 2. There are no column attributes (to cover corner area)
								const shouldSpan = isLastRowAttr && (
									headerColAttrs.length !== 0 || 
									colAttrs.length === 0
								);
								rowCells.push(
									h(
												"th",
												{
													class: ["pvtRowLabel"],
											key: `rowKeyLabel${rowIndex}-${attrIndex}`,
											rowSpan: span,
											colSpan: shouldSpan ? 2 : 1,
												},
												txt
									)
											);
							});

							columnDescriptors.forEach(({ colKey, aggregatorName }, descriptorIndex) => {
								let value = null;
								let formatted = '';
								let isEmpty = true;
								
								if (usePreCalculated && this.pivotResult) {
									// Use pre-calculated data from worker
									const flatRowKey = rowKey.join(String.fromCharCode(0));
									const flatColKey = colKey.join(String.fromCharCode(0));
									const cellData = this.pivotResult.tree[flatRowKey]?.[flatColKey]?.[aggregatorName];
									if (cellData) {
										value = cellData.value;
										// Round numeric values to 2 decimal places
										const roundedValue = roundNumericValue(value);
										if (cellData.formatted) {
											// If formatted value exists, check if it's numeric and round it
											const numValue = parseFloat(cellData.formatted);
											if (!isNaN(numValue) && isFinite(numValue)) {
												formatted = String(Math.round(numValue * 100) / 100);
											} else {
												formatted = cellData.formatted;
											}
										} else {
											formatted = roundedValue !== null && roundedValue !== undefined ? String(roundedValue) : '';
										}
										isEmpty = value === null || value === undefined;
									}
								} else if (pivotData) {
									// Use PivotEngine instance - get the specific aggregator
									const aggregator = pivotData.getAggregator(rowKey, colKey, aggregatorName);
									if (aggregator && typeof aggregator.value === "function") {
										value = aggregator.value();
										const result = formatCellDisplay(aggregator, value);
										formatted = result.formatted;
										isEmpty = result.isEmpty;
									} else {
										value = null;
										formatted = '';
										isEmpty = true;
									}
								} else {
									// pivotData is null and not using pre-calculated - show empty cell
									formatted = '';
									isEmpty = true;
								}
								const cellClasses = ["pvVal"];
								if (isEmpty) {
									cellClasses.push("pvtEmpty");
								}
								rowCells.push(
									h(
												"td",
												Object.assign(
													{
												class: cellClasses,
												style: valueCellColors(rowKey, colKey, value),
												key: `pvtVal${rowIndex}-${descriptorIndex}`,
													},
													getClickHandler
														? {
														onClick: getClickHandler(value, rowKey, colKey),
														}
														: {}
												),
										formatted
									)
								);
							});

							// Only add row totals column if there are column attributes
							// When colAttrs.length === 0, we don't want the rightmost row totals column
							if (this.rowTotal && colAttrs.length > 0) {
								aggregatorList.forEach((aggName, aggIndex) => {
									let totalValue = null;
									let totalDisplay = { formatted: '', isEmpty: true };
									
									if (usePreCalculated && this.pivotResult) {
										// Use pre-calculated row total from pivot result (correct approach)
										// This is already calculated by PivotEngine and contains all unique values for "List Unique Values"
										const flatRowKey = rowKey.join(String.fromCharCode(0));
										const cleanAggName = aggName.split('(')[0].trim().toLowerCase();
										const isStringAggregator = cleanAggName.includes('list') && cleanAggName.includes('unique');
										
										// Debug: log what's available in pivotResult
										if (isStringAggregator) {
											console.log(`[Row Total Retrieval] Row key:`, rowKey, `flatRowKey:`, flatRowKey, `Aggregator:`, aggName);
											console.log(`[Row Total Retrieval] pivotResult.rowTotals exists:`, !!this.pivotResult.rowTotals);
											console.log(`[Row Total Retrieval] pivotResult.rowTotals[flatRowKey] exists:`, !!this.pivotResult.rowTotals?.[flatRowKey]);
											console.log(`[Row Total Retrieval] Available aggregators in rowTotals:`, this.pivotResult.rowTotals?.[flatRowKey] ? Object.keys(this.pivotResult.rowTotals[flatRowKey]) : 'N/A');
										}
										
										const rowTotalData = this.pivotResult.rowTotals?.[flatRowKey]?.[aggName];
										if (rowTotalData) {
											totalValue = rowTotalData.value;
											// Debug: log for List Unique Values and Average to verify retrieved value
											if (isStringAggregator) {
												console.log(`[Row Total Retrieval] Retrieved value:`, totalValue, `Type:`, typeof totalValue);
												console.log(`[Row Total Retrieval] Retrieved formatted:`, rowTotalData.formatted, `Type:`, typeof rowTotalData.formatted);
												console.log(`[Row Total Retrieval] Full rowTotalData:`, rowTotalData);
											}
											if (cleanAggName === 'average' || cleanAggName.includes('average')) {
												console.log(`[Row Total Retrieval - Average] Row key:`, rowKey, `flatRowKey:`, flatRowKey, `Aggregator:`, aggName);
												console.log(`[Row Total Retrieval - Average] Retrieved value:`, totalValue, `Type:`, typeof totalValue);
												console.log(`[Row Total Retrieval - Average] Retrieved formatted:`, rowTotalData.formatted, `Type:`, typeof rowTotalData.formatted);
											}
											
											if (!isStringAggregator && typeof totalValue === 'number') {
												totalValue = roundNumericValue(totalValue);
											}
											
											// Use formatted value if available, otherwise format manually
											if (rowTotalData.formatted) {
												totalDisplay = {
													formatted: rowTotalData.formatted,
													isEmpty: false
												};
											} else if (totalValue !== null && totalValue !== undefined) {
												totalDisplay = {
													formatted: String(totalValue),
													isEmpty: false
												};
											} else {
												totalDisplay = { formatted: '', isEmpty: true };
											}
										} else {
											// Fallback: collect visible cell values (for edge cases)
											// This should only be used if rowTotals is missing
											const cleanAggName = aggName.split('(')[0].trim().toLowerCase();
											const isStringAggregator = cleanAggName.includes('list') && cleanAggName.includes('unique');
											
											if (isStringAggregator) {
												// For List Unique Values: combine unique values from all cells in the row
												const allUniqueValues = new Set();
												columnDescriptors.forEach(({ colKey, aggregatorName }) => {
													if (aggregatorName === aggName) {
														const flatColKey = colKey.join(String.fromCharCode(0));
														const cellData = this.pivotResult.tree[flatRowKey]?.[flatColKey]?.[aggName];
														if (cellData && cellData.value !== null && cellData.value !== undefined) {
															// Each cell value is a comma-separated string like "4" or "5"
															const cellValues = String(cellData.value).split(',').map(s => s.trim()).filter(s => s.length > 0);
															cellValues.forEach(val => allUniqueValues.add(val));
														}
													}
												});
												if (allUniqueValues.size > 0) {
													totalValue = Array.from(allUniqueValues).join(', ');
													totalDisplay = {
														formatted: String(totalValue),
														isEmpty: false
													};
												}
											} else {
												// For numeric aggregations: use applyAggregationToValues to correctly handle different aggregation types
												// This is important for Average - you can't sum the averages, you need to average them
												const visibleValues = [];
												columnDescriptors.forEach(({ colKey, aggregatorName }) => {
													if (aggregatorName === aggName) {
														const flatColKey = colKey.join(String.fromCharCode(0));
														const cellData = this.pivotResult.tree[flatRowKey]?.[flatColKey]?.[aggName];
														if (cellData && cellData.value !== null && cellData.value !== undefined) {
															visibleValues.push(cellData.value);
														}
													}
												});
												if (visibleValues.length > 0) {
													totalValue = applyAggregationToValues(visibleValues, aggName);
													if (totalValue !== null && totalValue !== undefined) {
														const cleanAggName = aggName.split('(')[0].trim().toLowerCase();
														const isStringAggregator = cleanAggName.includes('list') && cleanAggName.includes('unique');
														if (!isStringAggregator && typeof totalValue === 'number') {
															totalValue = roundNumericValue(totalValue);
														}
														totalDisplay = {
															formatted: totalValue !== null && totalValue !== undefined ? String(totalValue) : '',
															isEmpty: totalValue === null || totalValue === undefined
														};
													}
												}
											}
										}
									} else if (pivotData) {
										// Use the pre-calculated row total aggregator
										// This is the correct way - the engine already calculated the total for this row
										const rowTotalAggregator = pivotData.getAggregator(rowKey, [], aggName);
										if (rowTotalAggregator && typeof rowTotalAggregator.value === "function") {
											totalValue = rowTotalAggregator.value();
											// Debug: log for List Unique Values and Average
											const cleanAggName = aggName.split('(')[0].trim().toLowerCase();
											const isStringAggregator = cleanAggName.includes('list') && cleanAggName.includes('unique');
											if (isStringAggregator) {
												console.log(`[Row Total PivotData] Row key:`, rowKey, `Aggregator:`, aggName);
												console.log(`[Row Total PivotData] totalValue from aggregator.value():`, totalValue, `Type:`, typeof totalValue);
												if (rowTotalAggregator.uniq) {
													console.log(`[Row Total PivotData] Aggregator.uniq:`, rowTotalAggregator.uniq, `Length:`, rowTotalAggregator.uniq.length);
												}
											}
											if (cleanAggName === 'average' || cleanAggName.includes('average')) {
												console.log(`[Row Total PivotData - Average] Row key:`, rowKey, `Aggregator:`, aggName);
												console.log(`[Row Total PivotData - Average] totalValue from aggregator.value():`, totalValue, `Type:`, typeof totalValue);
												if (rowTotalAggregator.n !== undefined) {
													console.log(`[Row Total PivotData - Average] Aggregator.n (count):`, rowTotalAggregator.n);
												}
												if (rowTotalAggregator.m !== undefined) {
													console.log(`[Row Total PivotData - Average] Aggregator.m (mean):`, rowTotalAggregator.m);
												}
											}
											
											// For "List Unique Values", the value is already a comma-separated string
											// For numeric aggregations, round to 2 decimal places
											if (!isStringAggregator && typeof totalValue === 'number') {
												totalValue = roundNumericValue(totalValue);
											}
											totalDisplay = formatCellDisplay(rowTotalAggregator, totalValue);
											if (isStringAggregator) {
												console.log(`[Row Total PivotData] totalDisplay after formatCellDisplay:`, totalDisplay);
											}
										} else {
											totalDisplay = { formatted: '', isEmpty: true };
										}
									}
									// If neither is available, totalDisplay remains empty
									
									const totalClasses = ["pvtTotal"];
									if (totalDisplay.isEmpty) {
										totalClasses.push("pvtEmpty");
									}
									rowCells.push(
										h(
												"td",
												Object.assign(
													{
													class: totalClasses,
													style: colTotalColors(totalValue),
													key: `rowTotal${rowIndex}-${aggIndex}`,
													},
													getClickHandler
														? {
															onClick: getClickHandler(totalValue, rowKey, [null]),
														}
														: {}
												),
											totalDisplay.formatted
										)
									);
								});
							}

							return h(
								"tr",
								{
									key: `rowKeyRow${rowIndex}`,
								},
								rowCells
							);
						});

					if (this.colTotal) {
						const totalCells = [];
						
						// Special handling when there are no horizontal header fields and only one aggregation
						if (colAttrs.length === 0 && aggregatorCount === 1 && this.rowTotal) {
							// Get the rightmost value (grand total) - this is the value that should go in the first column
							let grandValue = null;
							let grandDisplay = { formatted: '', isEmpty: true };
							
							const aggName = aggregatorList[0];
							
							if (usePreCalculated && this.pivotResult) {
								// Use pre-calculated grand total from pivot result (correct approach)
								// This is already calculated by PivotEngine and contains all unique values for "List Unique Values"
								const grandTotalData = this.pivotResult.allTotal?.[aggName];
								if (grandTotalData) {
									grandValue = grandTotalData.value;
									// For "List Unique Values", the value is already a comma-separated string
									// For numeric aggregations, round to 2 decimal places
									const cleanAggName = aggName.split('(')[0].trim().toLowerCase();
									const isStringAggregator = cleanAggName.includes('list') && cleanAggName.includes('unique');
									
									if (!isStringAggregator && typeof grandValue === 'number') {
										grandValue = roundNumericValue(grandValue);
									}
									
									// Use formatted value if available, otherwise format manually
									if (grandTotalData.formatted) {
										grandDisplay = {
											formatted: grandTotalData.formatted,
											isEmpty: false
										};
									} else if (grandValue !== null && grandValue !== undefined) {
										grandDisplay = {
											formatted: String(grandValue),
											isEmpty: false
										};
									} else {
										grandDisplay = { formatted: '', isEmpty: true };
									}
								} else {
									// Fallback: collect visible cell values (for edge cases)
									const visibleValues = [];
									rowKeys.forEach((rowKey) => {
										columnDescriptors.forEach(({ colKey, aggregatorName }) => {
											if (aggregatorName === aggName) {
												const flatRowKey = rowKey.join(String.fromCharCode(0));
												const flatColKey = colKey.join(String.fromCharCode(0));
												const cellData = this.pivotResult.tree[flatRowKey]?.[flatColKey]?.[aggName];
												if (cellData && cellData.value !== null && cellData.value !== undefined) {
													visibleValues.push(cellData.value);
												}
											}
										});
									});
									
									// Apply aggregation method to visible values
									grandValue = applyAggregationToValues(visibleValues, aggName);
									
									if (grandValue !== null && grandValue !== undefined) {
										const cleanAggName = aggName.split('(')[0].trim().toLowerCase();
										const isStringAggregator = cleanAggName.includes('list') && cleanAggName.includes('unique');
										
										if (!isStringAggregator) {
											grandValue = roundNumericValue(grandValue);
										}
										
										grandDisplay = {
											formatted: String(grandValue),
											isEmpty: false
										};
									} else {
										grandDisplay = { formatted: '', isEmpty: true };
									}
								}
							} else if (pivotData) {
								// Use the pre-calculated grand total aggregator
								// This is the correct way - the engine already calculated the grand total
								const grandTotalAggregator = pivotData.getAggregator([], [], aggName);
								if (grandTotalAggregator && typeof grandTotalAggregator.value === "function") {
									grandValue = grandTotalAggregator.value();
									// Round numeric value to 2 decimal places
									if (typeof grandValue === 'number') {
										grandValue = roundNumericValue(grandValue);
									}
									grandDisplay = formatCellDisplay(grandTotalAggregator, grandValue);
								} else {
									grandDisplay = { formatted: '', isEmpty: true };
								}
							}

							// Calculate total columns in a data row to match the structure
							// Structure of data rows: row attrs (with last spanning 2) + data columns (0 after removal) + row total (1)
							let totalColsInDataRow = 0;
							if (rowAttrs.length > 0) {
								// Row attrs: first (rowAttrs.length - 1) take 1 column each, last takes 2 columns
								totalColsInDataRow = (rowAttrs.length - 1) + 2;
							} else {
								// No row attrs, but there's still a corner cell (colSpan 1)
								totalColsInDataRow = 1;
							}
							totalColsInDataRow += columnDescriptors.length; // This will be 0 after removal
							totalColsInDataRow += (this.rowTotal ? aggregatorList.length : 0); // Row total column (1)
							
							// First cell: "Totals" label spanning all columns except the rightmost
							// So it should span: totalColsInDataRow - 1 (subtract 1 for the rightmost column)
							const totalsLabelSpan = Math.max(0, totalColsInDataRow - 1);
							
							if (totalsLabelSpan > 0) {
								totalCells.push(
									h(
										"th",
										{
											class: ["pvtTotalLabel"],
											colSpan: totalsLabelSpan,
											style: {
												backgroundColor: "#ebf0f8", // Header background color
											},
										},
										__("Totals")
									)
								);
							}
							
							// Last cell: The grand total value (rightmost position)
							const grandClasses = ["pvtGrandTotal"];
							if (grandDisplay.isEmpty) {
								grandClasses.push("pvtEmpty");
							}
							totalCells.push(
								h(
											"td",
											Object.assign(
												{
											class: grandClasses,
											key: "grandTotalRightmost",
												},
												getClickHandler
													? {
													onClick: getClickHandler(grandValue, [null], [null]),
													}
													: {}
											),
									grandDisplay.formatted
								)
							);
						} else {
							// Original logic for other cases
							const labelColSpan = rowAttrs.length + (headerColAttrs.length > 0 ? 1 : 0);

							if (labelColSpan > 0 && headerColAttrs.length) {
								totalCells.push(
									h(
										"th",
										{
											class: ["pvtTotalLabel"],
											colSpan: labelColSpan,
										},
										__("Totals")
									)
								);
							}

							columnDescriptors.forEach(({ colKey, aggregatorName }, descriptorIndex) => {
								let totalValue = null;
								let columnDisplay = { formatted: '', isEmpty: true };
								
								if (usePreCalculated && this.pivotResult) {
									// Use pre-calculated column total from pivot result (correct approach)
									// This is already calculated by PivotEngine and contains the correct average for "Average"
									const flatColKey = colKey.join(String.fromCharCode(0));
									const colTotalData = this.pivotResult.colTotals?.[flatColKey]?.[aggregatorName];
									if (colTotalData) {
										totalValue = colTotalData.value;
										// For "List Unique Values", the value is already a comma-separated string
										// For numeric aggregations, round to 2 decimal places
										const cleanAggName = aggregatorName.split('(')[0].trim().toLowerCase();
										const isStringAggregator = cleanAggName.includes('list') && cleanAggName.includes('unique');
										
										if (!isStringAggregator && typeof totalValue === 'number') {
											totalValue = roundNumericValue(totalValue);
										}
										
										// Use formatted value if available, otherwise format manually
										if (colTotalData.formatted) {
											columnDisplay = {
												formatted: colTotalData.formatted,
												isEmpty: false
											};
										} else if (totalValue !== null && totalValue !== undefined) {
											columnDisplay = {
												formatted: String(totalValue),
												isEmpty: false
											};
										} else {
											columnDisplay = { formatted: '', isEmpty: true };
										}
									} else {
										// Fallback: use applyAggregationToValues for different aggregation types
										// This should only be used if colTotals is missing
										const visibleValues = [];
										rowKeys.forEach((rowKey) => {
											const flatRowKey = rowKey.join(String.fromCharCode(0));
											const flatColKey = colKey.join(String.fromCharCode(0));
											const cellData = this.pivotResult.tree[flatRowKey]?.[flatColKey]?.[aggregatorName];
											if (cellData && cellData.value !== null && cellData.value !== undefined) {
												visibleValues.push(cellData.value);
											}
										});
										if (visibleValues.length > 0) {
											totalValue = applyAggregationToValues(visibleValues, aggregatorName);
											if (totalValue !== null && totalValue !== undefined) {
												const cleanAggName = aggregatorName.split('(')[0].trim().toLowerCase();
												const isStringAggregator = cleanAggName.includes('list') && cleanAggName.includes('unique');
												if (!isStringAggregator && typeof totalValue === 'number') {
													totalValue = roundNumericValue(totalValue);
												}
												columnDisplay = {
													formatted: totalValue !== null && totalValue !== undefined ? String(totalValue) : '',
													isEmpty: totalValue === null || totalValue === undefined
												};
											}
										}
									}
								} else if (pivotData) {
									// Use the pre-calculated column total aggregator
									// This is the correct way - the engine already calculated the total for this column
									const colTotalAggregator = pivotData.getAggregator([], colKey, aggregatorName);
									if (colTotalAggregator && typeof colTotalAggregator.value === "function") {
										totalValue = colTotalAggregator.value();
										// Round numeric value to 2 decimal places
										totalValue = roundNumericValue(totalValue);
										columnDisplay = formatCellDisplay(colTotalAggregator, totalValue);
									} else {
										columnDisplay = { formatted: '', isEmpty: true };
									}
								}
								const columnClasses = ["pvtTotal"];
								if (columnDisplay.isEmpty) {
									columnClasses.push("pvtEmpty");
								}
								totalCells.push(
									h(
										"td",
										Object.assign(
											{
												class: columnClasses,
												style: rowTotalColors(totalValue),
												key: `colTotal${descriptorIndex}`,
											},
											getClickHandler
												? {
														onClick: getClickHandler(totalValue, [null], colKey),
												  }
												: {}
										),
										columnDisplay.formatted
									)
								);
							});

							// Only add grand totals column if there are column attributes
							// When colAttrs.length === 0, we don't want the rightmost "Totals" column
							if (this.rowTotal && colAttrs.length > 0) {
								aggregatorList.forEach((aggName, aggIndex) => {
									let grandValue = null;
									let grandDisplay = { formatted: '', isEmpty: true };
									
									if (usePreCalculated && this.pivotResult) {
										// Use pre-calculated grand total from pivot result (correct approach)
										// This is already calculated by PivotEngine and contains all unique values for "List Unique Values"
										const grandTotalData = this.pivotResult.allTotal?.[aggName];
										if (grandTotalData) {
											grandValue = grandTotalData.value;
											// For "List Unique Values", the value is already a comma-separated string
											// For numeric aggregations, round to 2 decimal places
											const cleanAggName = aggName.split('(')[0].trim().toLowerCase();
											const isStringAggregator = cleanAggName.includes('list') && cleanAggName.includes('unique');
											
											if (!isStringAggregator && typeof grandValue === 'number') {
												grandValue = roundNumericValue(grandValue);
											}
											
											// Use formatted value if available, otherwise format manually
											if (grandTotalData.formatted) {
												grandDisplay = {
													formatted: grandTotalData.formatted,
													isEmpty: false
												};
											} else if (grandValue !== null && grandValue !== undefined) {
												grandDisplay = {
													formatted: String(grandValue),
													isEmpty: false
												};
											} else {
												grandDisplay = { formatted: '', isEmpty: true };
											}
										} else {
											// Fallback: if allTotal is missing, try to use pivotData if available
											// This should rarely happen as allTotal should always be populated
											// For Average, we cannot average cell values (which are already averages)
											// So we must use the grand total aggregator from pivotData
											if (pivotData) {
												const grandTotalAggregator = pivotData.getAggregator([], [], aggName);
												if (grandTotalAggregator && typeof grandTotalAggregator.value === "function") {
													grandValue = grandTotalAggregator.value();
													if (typeof grandValue === 'number') {
														grandValue = roundNumericValue(grandValue);
													}
													grandDisplay = formatCellDisplay(grandTotalAggregator, grandValue);
												} else {
													grandDisplay = { formatted: '', isEmpty: true };
												}
											} else {
												// Last resort: collect visible cell values (for edge cases)
												// Note: This is incorrect for Average as it averages already-averaged values
												const visibleValues = [];
												rowKeys.forEach((rowKey) => {
												columnDescriptors.forEach(({ colKey, aggregatorName }) => {
													if (aggregatorName === aggName) {
														const flatRowKey = rowKey.join(String.fromCharCode(0));
														const flatColKey = colKey.join(String.fromCharCode(0));
														const cellData = this.pivotResult.tree[flatRowKey]?.[flatColKey]?.[aggName];
														if (cellData && cellData.value !== null && cellData.value !== undefined) {
															visibleValues.push(cellData.value);
														}
													}
												});
												});
												
												// Apply aggregation method to visible values
												// Note: This is incorrect for Average as it averages already-averaged values
												grandValue = applyAggregationToValues(visibleValues, aggName);
												
												if (grandValue !== null && grandValue !== undefined) {
													const cleanAggName = aggName.split('(')[0].trim().toLowerCase();
													const isStringAggregator = cleanAggName.includes('list') && cleanAggName.includes('unique');
													
													if (!isStringAggregator) {
														grandValue = roundNumericValue(grandValue);
													}
													
													grandDisplay = {
														formatted: String(grandValue),
														isEmpty: false
													};
												} else {
													grandDisplay = { formatted: '', isEmpty: true };
												}
											}
										}
									} else if (pivotData) {
										// Use the pre-calculated grand total aggregator
										// This is the correct way - the engine already calculated the grand total
										const grandTotalAggregator = pivotData.getAggregator([], [], aggName);
										if (grandTotalAggregator && typeof grandTotalAggregator.value === "function") {
											grandValue = grandTotalAggregator.value();
											// Round numeric value to 2 decimal places
											if (typeof grandValue === 'number') {
												grandValue = roundNumericValue(grandValue);
											}
											grandDisplay = formatCellDisplay(grandTotalAggregator, grandValue);
										} else {
											grandDisplay = { formatted: '', isEmpty: true };
										}
									}
									const grandClasses = ["pvtGrandTotal"];
									if (grandDisplay.isEmpty) {
										grandClasses.push("pvtEmpty");
									}
									totalCells.push(
										h(
											"td",
											Object.assign(
												{
													class: grandClasses,
													key: `grandTotal${aggIndex}`,
												},
												getClickHandler
													? {
															onClick: getClickHandler(grandValue, [null], [null]),
												}
												: {}
										),
											grandDisplay.formatted
										)
									);
								});
							}
						}

						bodyRows.push(h("tr", totalCells));
					}

					// If there are no body rows at all (no data rows and no totals), don't display the table
					if (bodyRows.length === 0) {
						return null;
					}

					// Measure rendering time (from calculation completion to render completion)
					if (this.renderingStartTime) {
						const renderingEndTime = performance.now();
						const renderingTime = renderingEndTime - this.renderingStartTime;
						const dataSize = Array.isArray(this.data) ? this.data.length : 0;
						
						console.log(`[Performance] Rendering: ${renderingTime.toFixed(2)}ms`);
						if (this.calculationTime > 0) {
							console.log(`[Performance] Calculation: ${this.calculationTime.toFixed(2)}ms`);
							console.log(`[Performance] Total Time (Calculation + Rendering): ${(this.calculationTime + renderingTime).toFixed(2)}ms`);
						}
						
						// Log summary
						const rowCount = rowKeys.length;
						const colCount = colKeys.length;
						const cellCount = rowCount * colCount * aggregatorCount;
						console.log(`[Performance] Summary: ${dataSize} records → ${rowCount} rows × ${colCount} cols × ${aggregatorCount} aggregators = ${cellCount} cells`);
						console.log(`==========================================\n`);
					}

					return h(
						"table",
						{
							class: ["pvtTable"],
						},
						[h("thead", headerRows), h("tbody", null, bodyRows)]
					);
				}
				
				// Handle chart renderers
				else if (['bar-chart', 'line-chart', 'pie-chart', 'percentage-chart'].includes(currentMode)) {
					const chartData = this.getChartData();
					
					// Map chart mode to Recharts type
					let chartType = 'bar';
					if (currentMode === 'line-chart') {
						chartType = 'line';
					} else if (currentMode === 'pie-chart') {
						chartType = 'pie';
					} else if (currentMode === 'percentage-chart') {
						chartType = 'percentage';
					}

				// Check if we should use worker for LTTB optimization (line/bar charts with large data)
				const useWorkerForLTTB = pivotWorkerManager.isAvailable() && 
					(chartType === 'line' || chartType === 'bar') &&
					chartData && chartData.labels && chartData.labels.length > 500;

				return h('div', {
						style: {
							width: '100%',
							padding: '20px'
						}
					}, [
						h(ChartWrapper, {
							data: chartData,
							type: chartType,
							colors: ['#7ad6ff', '#7a94ff', '#d7d0ff', '#ff7b92', '#ffad70', '#fff48d', '#7ef8b3', '#c1ff7a', '#d7b3ff', '#ff7bff', '#b1b1b1', '#8d8d8d'],
							lineOptions: opts.lineOptions || {},
							useWorkerOptimization: useWorkerForLTTB
						})
					]);
				}
			} catch (error) {
				console.error('Error in TableRenderer render:', error);
				// Return a simple error message or empty div
				return h('div', {
					class: 'pvtError',
					style: { padding: '20px', color: 'red' }
				}, `Error rendering table: ${error.message}`);
			}
		}
	};

	return TableRenderer;
};

const XLSXExportRenderer = {
	name: "xlsx-export-renderers",
	props: defaultProps.props,
	methods: {
		exportToXLSX(data) {
			const worksheet = XLSX.utils.aoa_to_sheet(data);
			const workbook = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(workbook, worksheet, "Pivot Data");

			const columnWidths = data[0].map((_, colIndex) => {
				const maxLength = data.reduce((max, row) => {
					const cellValue = row[colIndex] ? row[colIndex].toString() : "";
					return Math.max(max, cellValue.length);
				}, 10);
				return { wch: maxLength + 2 };
			});

			worksheet["!cols"] = columnWidths;

			const filename = (typeof cur_list !== 'undefined' && cur_list && cur_list.doctype) 
				? `${cur_list.doctype.toLowerCase().replaceAll(' ', '_')}_pivot_export.xlsx` 
				: "pivot_data_export.xlsx";
			XLSX.writeFile(workbook, filename, {cellStyles: true});
		},
	},
	render() {
		const pivotData = new PivotEngine(this.$props);
		let rowKeys = pivotData.getRowKeys();
		let colKeys = pivotData.getColKeys();

		// Get row and column attributes (same as table renderer)
		const rowAttrs = Array.from(pivotData.props.rows || []);
		const colAttrs = Array.from(pivotData.props.cols || []);

		// CRITICAL: Don't filter out null values - include them in export (same as table renderer)
		// The table renderer explicitly includes null values (line 625-627)
		// First, ensure all elements are arrays
		const validRowKeys = rowKeys.filter(rowKey => Array.isArray(rowKey));
		const validColKeys = colKeys.filter(colKey => Array.isArray(colKey));
		
		// Don't filter out null values - include them in export
		const filteredRowKeys = validRowKeys;
		const filteredColKeys = validColKeys;

		// CRITICAL: Check if all data is filtered out (same logic as table renderer)
		// This ensures export matches what's displayed in the table
		const hasRowAttrs = rowAttrs.length > 0;
		const hasColAttrs = colAttrs.length > 0;
		const allRowsFiltered = hasRowAttrs && filteredRowKeys.length === 0;
		const allColsFiltered = hasColAttrs && filteredColKeys.length === 0;
		const tree = pivotData.tree || {};
		const bothEmpty = filteredRowKeys.length === 0 && filteredColKeys.length === 0 && Object.keys(tree).length === 0;
		
		const isAllDataFiltered = bothEmpty || allRowsFiltered || allColsFiltered;
		
		// If all data is filtered (no headers and no data), return empty export button
		// This matches the table renderer behavior which returns null in this case
		if (isAllDataFiltered) {
			return h("div", {
				class: "d-flex justify-content-center align-items-center",
				style: {
					width: "100%",
					height: "60vh",
				},
			}, [
				h("button", {
					class: "btn btn-default btn-sm ellipsis mb-3",
					disabled: true,
					title: "No data to export. Please add fields to row or column headers.",
				}, __("Export to XLSX (No Data)"))
			]);
		}

		// Use filtered keys, but ensure at least one empty array if all are filtered
		rowKeys = filteredRowKeys.length ? filteredRowKeys : [[]];
		colKeys = filteredColKeys.length ? filteredColKeys : [[]];

		// Get aggregator names and props (same as table renderer)
		const aggregatorNames = pivotData.getAggregatorNames() || [];
		const aggregatorCount = aggregatorNames.length;
		const aggregatorVals = this.aggregatorVals || {};
		// rowAttrs and colAttrs are already defined above

		// Helper function to format aggregator name with value field (same as table renderer)
		const formatAggregatorHeader = (aggName) => {
			const vals = aggregatorVals[aggName];
			if (vals && Array.isArray(vals) && vals.length > 0 && vals[0]) {
				if (aggName === "Count" || aggName === __("Count")) {
					return `${aggName} of ${vals[0]}`;
				} else {
					return `${aggName}(${vals[0]})`;
				}
			}
			return aggName;
		};

		// Build column descriptors (same logic as table renderer)
		const effectiveColKeys = aggregatorCount > 1
			? colKeys.flatMap((colKey) =>
					aggregatorNames.map((aggName) => [...colKey, aggName])
			  )
			: colKeys.map((colKey) =>
					colKey.length === 0 ? [aggregatorNames[0]] : colKey
			  );

		let columnDescriptors = aggregatorCount > 1
			? colKeys.flatMap((colKey) =>
					aggregatorNames.map((aggName) => ({
						colKey,
						aggregatorName: aggName,
					}))
			  )
			: colKeys.map((colKey) => ({
					colKey,
					aggregatorName: aggregatorNames[0],
			  }));

		// When there are no horizontal header fields (colAttrs.length === 0),
		// columnDescriptors already has the correct structure (one per aggregator)
		// We should NOT remove any columns in this case - they represent the aggregator columns
		// The removal logic below is only for when there ARE column attributes
		// (This matches the table renderer behavior - when colAttrs.length === 0, show aggregator columns directly)

		// Build export data array
		const format_data = [];

		// Build header rows (matching table structure)
		// When colAttrs.length === 0, show aggregator names directly (no "Values" row)
		if (colAttrs.length === 0) {
			// Single header row with aggregator names
			const headerRow = [];
			
			// Add row attribute headers
			rowAttrs.forEach((attr) => {
				headerRow.push(attr);
			});

			// Add aggregator names directly (no "Values" row, no column attribute header)
			aggregatorNames.forEach((aggName) => {
				headerRow.push(formatAggregatorHeader(aggName));
			});

			// When colAttrs.length === 0, we don't want the rightmost row totals column
			// This matches the table renderer behavior (line 1107)

			format_data.push(headerRow);
		} else {
			// Normal case: there are column attributes
			const headerColAttrs = aggregatorCount > 1 ? [...colAttrs, __("Values")] : colAttrs.slice();
			
			headerColAttrs.forEach((attr, attrIndex) => {
				const headerRow = [];
				
				// Add empty cells for row attributes
				rowAttrs.forEach(() => {
					headerRow.push('');
				});

				// Add column attribute header
				if (attrIndex < colAttrs.length) {
					headerRow.push(attr);
				} else if (attr === __("Values")) {
					headerRow.push(attr);
				}

				// Add column keys and aggregator names
				// Include null values - convert null to "(null)" for better visibility (same as table renderer for charts, line 152-153)
				effectiveColKeys.forEach((colKey) => {
					let cellValue = colKey[attrIndex] != null ? colKey[attrIndex] : "";
					// Convert null to "(null)" for display
					if (cellValue === null || cellValue === "null" || cellValue === "") {
						cellValue = "(null)";
					}
					// Format aggregator name in "Values" row
					if (attrIndex === headerColAttrs.length - 1 && attr === __("Values") && aggregatorCount > 1) {
						const aggName = cellValue;
						if (aggName && aggregatorNames.includes(aggName)) {
							headerRow.push(formatAggregatorHeader(aggName));
						} else {
							headerRow.push(cellValue);
						}
					} else {
						headerRow.push(cellValue);
					}
				});

				// Add "Totals" header if row totals are enabled and there are column attributes
				if (this.rowTotal && aggregatorCount > 0 && colAttrs.length > 0) {
					if (attrIndex === headerColAttrs.length - 1) {
						if (aggregatorCount > 1) {
							aggregatorNames.forEach((aggName) => {
								headerRow.push(formatAggregatorHeader(aggName));
							});
						} else {
							headerRow.push(__("Totals"));
						}
					} else if (attrIndex === 0 && headerColAttrs.length > 1) {
						headerRow.push(__("Totals"));
					}
			}

				format_data.push(headerRow);
			});
		}

		// Build data rows
		// When there are no vertical header fields (rowAttrs.length === 0), skip data rows (only show Totals row)
		// This matches the table renderer behavior
		const datas = rowAttrs.length === 0 
			? []
			: rowKeys.map((rowKey) => {
			const row = [];
			
			// Add row attribute values
			// Include null values - convert null to "(null)" for better visibility (same as table renderer for charts, line 152-153)
			rowKey.forEach((txt) => {
				if (txt === null || txt === "null" || txt === "") {
					row.push("(null)");
				} else {
					row.push(txt);
				}
			});

			// Add empty cell if there are column attributes
			if (colAttrs.length > 0) {
				row.push('');
			}

			// Add data cells for each column descriptor
			// Use the same formatCellDisplay logic as table renderer to match null value display
			columnDescriptors.forEach(({ colKey, aggregatorName }) => {
				const aggregator = pivotData.getAggregator(rowKey, colKey, aggregatorName);
				let value = null;
				if (aggregator && typeof aggregator.value === "function") {
					value = aggregator.value();
				}
				// Format the value using the same logic as table renderer (formatCellDisplay)
				let formatted = "";
				if (aggregator && typeof aggregator.format === "function") {
					formatted = aggregator.format(value);
				} else if (value !== undefined && value !== null && value !== "") {
					formatted = value;
				}
				const isEmpty =
					formatted === "" ||
					formatted === null ||
					(typeof formatted === "number" && Number.isNaN(formatted));
				// Match table renderer: show "—" for empty/null values (line 353)
				if (isEmpty) {
					formatted = "—";
				}
				row.push(formatted);
			});

			// Add row totals if enabled
			// When colAttrs.length === 0, we don't want the rightmost row totals column
			// This matches the table renderer behavior (line 1107)
			if (this.rowTotal && colAttrs.length > 0) {
				aggregatorNames.forEach((aggName) => {
					const totalAggregator = pivotData.getAggregator(rowKey, [], aggName);
					let totalValue = null;
					if (totalAggregator && typeof totalAggregator.value === "function") {
						totalValue = totalAggregator.value();
					}
					// Use the same formatCellDisplay logic as table renderer
					let totalFormatted = "";
					if (totalAggregator && typeof totalAggregator.format === "function") {
						totalFormatted = totalAggregator.format(totalValue);
					} else if (totalValue !== undefined && totalValue !== null && totalValue !== "") {
						totalFormatted = totalValue;
					}
					const isEmpty =
						totalFormatted === "" ||
						totalFormatted === null ||
						(typeof totalFormatted === "number" && Number.isNaN(totalFormatted));
					// Match table renderer: show "—" for empty/null values
					if (isEmpty) {
						totalFormatted = "—";
					}
					row.push(totalFormatted);
				});
			}

			return row;
		});

		// Add data rows to format_data
		datas.forEach(data => format_data.push(data));

		// Add column totals row if enabled
		if (this.colTotal) {
			const totalRow = [];
			
			// When colAttrs.length === 0, structure is simpler
			if (colAttrs.length === 0) {
				// Add "Totals" label
				rowAttrs.forEach(() => {
					totalRow.push('');
				});
				if (rowAttrs.length > 0) {
					totalRow.push(__("Totals"));
				}

				// Add aggregator totals (grand totals) for each aggregator
				aggregatorNames.forEach((aggName) => {
					const grandAggregator = pivotData.getAggregator([], [], aggName);
					let grandValue = null;
					if (grandAggregator && typeof grandAggregator.value === "function") {
						grandValue = grandAggregator.value();
					}
					// Use the same formatCellDisplay logic as table renderer
					let grandFormatted = "";
					if (grandAggregator && typeof grandAggregator.format === "function") {
						grandFormatted = grandAggregator.format(grandValue);
					} else if (grandValue !== undefined && grandValue !== null && grandValue !== "") {
						grandFormatted = grandValue;
					}
					const isEmpty =
						grandFormatted === "" ||
						grandFormatted === null ||
						(typeof grandFormatted === "number" && Number.isNaN(grandFormatted));
					// Match table renderer: show "—" for empty/null values
					if (isEmpty) {
						grandFormatted = "—";
					}
					totalRow.push(grandFormatted);
				});

				// When colAttrs.length === 0, we don't want the rightmost grand totals column
				// This matches the table renderer behavior (line 1555)
			} else {
				// Normal case: there are column attributes
				const headerColAttrs = aggregatorCount > 1 ? [...colAttrs, __("Values")] : colAttrs.slice();
				
				// Add "Totals" label - match table renderer structure exactly
				// The "Totals" label should span: rowAttrs.length + 1 (for row attrs + column attr header)
				// This matches the table renderer where "Totals" spans across row attrs and column attr header
				const labelColSpan = rowAttrs.length + (headerColAttrs.length > 0 ? 1 : 0);
				if (labelColSpan > 0 && headerColAttrs.length) {
					// In Excel, we represent the span by putting "Totals" in the first cell
					// and empty strings in the remaining cells that are spanned
					totalRow.push(__("Totals"));
					// Fill remaining label columns (row attrs + column attr header - 1 for "Totals" cell)
					for (let i = 1; i < labelColSpan; i++) {
						totalRow.push('');
					}
				} else {
					// Edge case: no column attributes but we're in the else branch (shouldn't happen)
					// When both rowAttrs and colAttrs are empty, don't add "Totals" label
					rowAttrs.forEach(() => {
						totalRow.push('');
					});
					// Only add "Totals" label if there are row attributes or column headers
					if (rowAttrs.length > 0 || (headerColAttrs.length > 0 && colAttrs.length > 0)) {
						totalRow.push(__("Totals"));
					}
				}

				// Add column totals for each column descriptor
				columnDescriptors.forEach(({ colKey, aggregatorName }) => {
					const totalAggregator = pivotData.getAggregator([], colKey, aggregatorName);
					let totalValue = null;
					if (totalAggregator && typeof totalAggregator.value === "function") {
						totalValue = totalAggregator.value();
					}
					// Use the same formatCellDisplay logic as table renderer
					let totalFormatted = "";
					if (totalAggregator && typeof totalAggregator.format === "function") {
						totalFormatted = totalAggregator.format(totalValue);
					} else if (totalValue !== undefined && totalValue !== null && totalValue !== "") {
						totalFormatted = totalValue;
					}
					const isEmpty =
						totalFormatted === "" ||
						totalFormatted === null ||
						(typeof totalFormatted === "number" && Number.isNaN(totalFormatted));
					// Match table renderer: show "—" for empty/null values
					if (isEmpty) {
						totalFormatted = "—";
					}
					totalRow.push(totalFormatted);
				});

				// Add grand total if row totals are enabled and there are column attributes
				// When colAttrs.length === 0, we don't want the rightmost grand totals column
				// This matches the table renderer behavior (line 1555)
				if (this.rowTotal && colAttrs.length > 0) {
					aggregatorNames.forEach((aggName) => {
						const grandAggregator = pivotData.getAggregator([], [], aggName);
						let grandValue = null;
						if (grandAggregator && typeof grandAggregator.value === "function") {
							grandValue = grandAggregator.value();
						}
						// Use the same formatCellDisplay logic as table renderer
						let grandFormatted = "";
						if (grandAggregator && typeof grandAggregator.format === "function") {
							grandFormatted = grandAggregator.format(grandValue);
						} else if (grandValue !== undefined && grandValue !== null && grandValue !== "") {
							grandFormatted = grandValue;
						}
						const isEmpty =
							grandFormatted === "" ||
							grandFormatted === null ||
							(typeof grandFormatted === "number" && Number.isNaN(grandFormatted));
						// Match table renderer: show "—" for empty/null values
						if (isEmpty) {
							grandFormatted = "—";
						}
						totalRow.push(grandFormatted);
					});
				}
			}

			format_data.push(totalRow);
		}

		console.log(format_data);

		return h("div", {
			class: "d-flex justify-content-center align-items-center",
			style: {
				width: "100%",
				height: "60vh",
			},
		}, [
			h("button", {
				class: "btn btn-default btn-sm ellipsis mb-3",
				onClick: () => this.exportToXLSX(format_data),
			}, __("Export to XLSX"))
		]);
	},
};

const renderers = {
	"Table": makeRenderer({
		mode: "table",
		name: "vue-table"
	}),
	"Table Heatmap": makeRenderer({
		mode: "heat-map-full",
		name: "vue-table-heatmap",
	}),
	"Table Col Heatmap": makeRenderer({
		mode: "heat-map-col",
		name: "vue-table-col-heatmap",
	}),
	"Table Row Heatmap": makeRenderer({
		mode: "heat-map-row",
		name: "vue-table-row-heatmap",
	}),
	"Bar Chart": makeRenderer({
		name: "bar-chart",
		mode: 'bar-chart',
		chartType: "bar",
		lineOptions: {},
	}),
	"Line Chart Straight": makeRenderer({
		name: "line-chart",
		mode: 'line-chart',
		chartType: "line",
		lineOptions: {},
	}),
	"Line Chart Curved": makeRenderer({
		name: "line-chart",
		mode: 'line-chart',
		chartType: "line",
		lineOptions: {
			spline: 1
		},
	}),
	"Pie Chart": makeRenderer({
		name: "pie-chart",
		mode: 'pie-chart',
		chartType: "pie",
		lineOptions: {},
	}),
	"Export": XLSXExportRenderer,
};

const translated_renderers = {};

Object.keys(renderers).forEach((key) => {
	translated_renderers[__(key)] = renderers[key];
});

// Export makeRenderer for custom renderers
export { makeRenderer };

export default translated_renderers;
