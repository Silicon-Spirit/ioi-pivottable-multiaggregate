import { PivotData } from "../utils/utils.js";
import defaultProps from "../utils/defaultProps.js";
import { h } from "vue";
import * as XLSX from "xlsx";

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
		mounted() {
			if (['bar-chart', 'line-chart', 'pie-chart', 'percentage-chart'].includes(opts.mode)) {
				this.renderChart();
			}
		},
		updated() {
			if (['bar-chart', 'line-chart', 'pie-chart', 'percentage-chart'].includes(opts.mode)) {
				this.renderChart();
			}
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
			renderChart() {
				if (!this.$refs.chartContainer) {
					return;
				}

				const pivotData = new PivotData(this.$props);
				let aggregatorList = [];
				if (typeof pivotData.getAggregatorNames === "function") {
					const names = pivotData.getAggregatorNames();
					if (Array.isArray(names)) {
						aggregatorList = names.filter((name) => typeof name === "string" && name.length);
					}
				}
				if (!aggregatorList.length) {
					if (Array.isArray(this.aggregatorName)) {
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
				const primaryAggregator = aggregatorList[0];

				const buildChartElement = (data) => {
					const chartHeight = (window.innerHeight / 100) * 60;

					// Clear previous chart if exists
					if (this.chartInstance) {
						this.chartInstance.destroy?.();
					}

					setTimeout(() => {
						if (this.$refs.chartContainer && window.frappe && window.frappe.Chart) {
							this.chartInstance = new frappe.Chart(this.$refs.chartContainer, {
								data: data,
								type: opts.chartType,
								height: chartHeight,
								lineOptions: opts.lineOptions,
								colors: ['#7ad6ff', '#7a94ff', '#d7d0ff', '#ff7b92', '#ffad70', '#fff48d', '#7ef8b3', '#c1ff7a', '#d7b3ff', '#ff7bff', '#b1b1b1', '#8d8d8d']
							});
						}
					}, 100);
				}

				if (Object.keys(pivotData.tree).length) {
					const rowKeys = pivotData.getRowKeys();
					const colKeys = pivotData.getColKeys();

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
							let filteredCols = col.filter(el => !!el);
							headerRow.push(filteredCols.join("-"));
						});
					}

					const rawData = rowKeys.map((r) => {
						const row = [];
						colKeys.map((c) => {
							const aggregator =
								primaryAggregator
									? pivotData.getAggregator(r, c, primaryAggregator)
									: pivotData.getAggregator(r, c);
							const v =
								aggregator && typeof aggregator.value === "function"
									? aggregator.value()
									: null;
							row.push(v || "");
						});
						return row;
					});

					rawData.unshift(headerRow);

					const labels = rowKeys.flat();

					const datasets = rawData[0].map((name, index) => {
						const values = rawData.slice(1).map(row => row[index]);

						return {
							name: name,
							values: values
						}
					});

					const data = {
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

					buildChartElement(data)

				} else {

					buildChartElement({ labels: [], datasets: []})
				}
			},
		},
		render() {
			try {
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
					if (typeof formatted !== "string") {
						formatted = String(formatted);
					}
					return { formatted, isEmpty: false };
				};
				if (['table', 'heat-map-full', 'heat-map-col', 'heat-map-row'].includes(opts.mode)) {
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
					
					// If not using pre-calculated result, create PivotData synchronously (for small datasets)
					if (!usePreCalculated) {
						// Validate data before creating PivotData
						if (!Array.isArray(this.data) || this.data.length === 0) {
							return null; // Don't render if no data
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
							// Measure pivot calculation time
							this.calculationStartTime = performance.now();
							try {
								// Validate props before creating PivotData
								if (!this.$props || !this.$props.data) {
									console.warn('Invalid props for PivotData creation');
									return null;
								}
								
								pivotData = new PivotData(this.$props);
								const calculationEndTime = performance.now();
								this.calculationTime = calculationEndTime - this.calculationStartTime;
								
								const dataSize = Array.isArray(this.data) ? this.data.length : 0;
								console.log(`\n[Performance] Pivot Calculation: ${this.calculationTime.toFixed(2)}ms for ${dataSize} records`);
								console.log(`[Performance] Calculation Rate: ${dataSize > 0 ? (dataSize / this.calculationTime * 1000).toFixed(0) : 0} records/sec`);
								
								this.cachedPivotData = pivotData;
								this.cachedInputHash = inputHash;
							} catch (error) {
								console.error('Error creating PivotData in render:', error);
								// Return null to prevent rendering with invalid data
								return null;
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
					
					// Filter out rows and columns where any header value is "null"
					// First, ensure all elements are arrays
					const validBaseRowKeys = baseRowKeys.filter(rowKey => Array.isArray(rowKey));
					const validBaseColKeys = baseColKeys.filter(colKey => Array.isArray(colKey));
					
					const filteredRowKeys = validBaseRowKeys.filter((rowKey) => {
						// Exclude rows where any part of the rowKey is "null"
						// Empty arrays are allowed (for grand totals)
						if (rowKey.length === 0) return true;
						return !rowKey.some((val) => val === "null" || val === null);
					});
					
					const filteredColKeys = validBaseColKeys.filter((colKey) => {
						// Exclude columns where any part of the colKey is "null"
						// Empty arrays are allowed (for grand totals)
						if (colKey.length === 0) return true;
						return !colKey.some((val) => val === "null" || val === null);
					});
					
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

					const effectiveColKeys =
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

					// When there are no horizontal header fields, remove the rightmost columns equal to the number of aggregators
					if (colAttrs.length === 0 && columnDescriptors.length >= aggregatorCount) {
						columnDescriptors = columnDescriptors.slice(0, -aggregatorCount);
					}

					const headerColAttrs =
						aggregatorCount > 1 ? [...colAttrs, __("Values")] : colAttrs.slice();

					const totalsRowSpan = headerColAttrs.length;

					let valueCellColors = () => ({});
					let rowTotalColors = () => ({});
					let colTotalColors = () => ({});

					// Apply heatmap colors if in heatmap mode (works with single or multiple aggregators)
					// For multiple aggregators, use the first aggregator for heatmap coloring
					if (opts.mode && ['heat-map-full', 'heat-map-col', 'heat-map-row'].includes(opts.mode)) {
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

							if (opts.mode === "heat-map-full") {
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
							} else if (opts.mode === "heat-map-row") {
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
							} else if (opts.mode === "heat-map-col") {
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

							if (opts.mode === "heat-map-full") {
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
							} else if (opts.mode === "heat-map-row") {
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
							} else if (opts.mode === "heat-map-col") {
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
										formatted = cellData.formatted || (value !== null && value !== undefined ? String(value) : '');
										isEmpty = value === null || value === undefined;
									}
								} else if (pivotData) {
									// Use PivotData instance - only if pivotData exists
									const aggregator = pivotData.getAggregator(rowKey, colKey, aggregatorName);
									value = aggregator && typeof aggregator.value === "function"
										? aggregator.value()
										: null;
									const result = formatCellDisplay(aggregator, value);
									formatted = result.formatted;
									isEmpty = result.isEmpty;
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

							if (this.rowTotal) {
								aggregatorList.forEach((aggName, aggIndex) => {
									let totalValue = null;
									let totalDisplay = { formatted: '', isEmpty: true };
									
									if (usePreCalculated && this.pivotResult) {
										// Use pre-calculated row totals from worker
										const flatRowKey = rowKey.join(String.fromCharCode(0));
										const rowTotalData = this.pivotResult.rowTotals[flatRowKey]?.[aggName];
										if (rowTotalData) {
											totalValue = rowTotalData.value;
											totalDisplay = {
												formatted: rowTotalData.formatted || (totalValue !== null && totalValue !== undefined ? String(totalValue) : ''),
												isEmpty: totalValue === null || totalValue === undefined
											};
										}
									} else if (pivotData) {
										// Use PivotData instance - only if pivotData exists
										const totalAggregator = pivotData.getAggregator(rowKey, [], aggName);
										totalValue = totalAggregator && typeof totalAggregator.value === "function"
											? totalAggregator.value()
											: null;
										totalDisplay = formatCellDisplay(totalAggregator, totalValue);
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
							
							if (usePreCalculated && this.pivotResult) {
								// Use pre-calculated grand total from worker
								const grandTotalData = this.pivotResult.allTotal[aggregatorList[0]];
								if (grandTotalData) {
									grandValue = grandTotalData.value;
									grandDisplay = {
										formatted: grandTotalData.formatted || (grandValue !== null && grandValue !== undefined ? String(grandValue) : ''),
										isEmpty: grandValue === null || grandValue === undefined
									};
								}
							} else if (pivotData) {
								// Use PivotData instance
								const grandAggregator = pivotData.getAggregator([], [], aggregatorList[0]);
								grandValue = grandAggregator && typeof grandAggregator.value === "function"
									? grandAggregator.value()
									: null;
								grandDisplay = formatCellDisplay(grandAggregator, grandValue);
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
									// Use pre-calculated column totals from worker
									const flatColKey = colKey.join(String.fromCharCode(0));
									const colTotalData = this.pivotResult.colTotals[flatColKey]?.[aggregatorName];
									if (colTotalData) {
										totalValue = colTotalData.value;
										columnDisplay = {
											formatted: colTotalData.formatted || (totalValue !== null && totalValue !== undefined ? String(totalValue) : ''),
											isEmpty: totalValue === null || totalValue === undefined
										};
									}
								} else if (pivotData) {
									// Use PivotData instance
									const totalAggregator = pivotData.getAggregator([], colKey, aggregatorName);
									totalValue = totalAggregator && typeof totalAggregator.value === "function"
										? totalAggregator.value()
										: null;
									columnDisplay = formatCellDisplay(totalAggregator, totalValue);
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

							if (this.rowTotal) {
								aggregatorList.forEach((aggName, aggIndex) => {
									let grandValue = null;
									let grandDisplay = { formatted: '', isEmpty: true };
									
									if (usePreCalculated && this.pivotResult) {
										// Use pre-calculated grand total from worker
										const grandTotalData = this.pivotResult.allTotal[aggName];
										if (grandTotalData) {
											grandValue = grandTotalData.value;
											grandDisplay = {
												formatted: grandTotalData.formatted || (grandValue !== null && grandValue !== undefined ? String(grandValue) : ''),
												isEmpty: grandValue === null || grandValue === undefined
											};
										}
									} else if (pivotData) {
										// Use PivotData instance
										const grandAggregator = pivotData.getAggregator([], [], aggName);
										grandValue = grandAggregator && typeof grandAggregator.value === "function"
											? grandAggregator.value()
											: null;
										grandDisplay = formatCellDisplay(grandAggregator, grandValue);
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
				else if (['bar-chart', 'line-chart', 'pie-chart', 'percentage-chart'].includes(opts.mode)) {
					return h('div', {
						ref: 'chartContainer',
						id: 'pivot_chart'
					});
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
		const pivotData = new PivotData(this.$props);
		const rowKeys = pivotData.getRowKeys();
		const colKeys = pivotData.getColKeys();

		if (rowKeys.length === 0) {
			rowKeys.push([]);
		}
		if (colKeys.length === 0) {
			colKeys.push([]);
		}

		const rows = Array.from(pivotData.props.rows)
		const cols = Array.from(pivotData.props.cols)

		const format_data = []

		cols.forEach(col => format_data.push([col]))
		rows.forEach(row => format_data.forEach(col => col.unshift('')))

		for (let i = 0; i < colKeys.length; i++) {
			for (let j = 0; j < cols.length; j++) {
				format_data[j].push(colKeys[i][j])
			}
		}

		const format_rows = rows

		for (let i = 0; i < colKeys.length + 1; i++) {
			format_rows.push('')
		}

		format_data.push(format_rows)

		const datas = rowKeys.map((r) => {
			const row = r.map((x) => x);
			if (cols.length) row.push('')

			colKeys.map((c) => {
				const v = pivotData.getAggregator(r, c).value();
				row.push(v || "");
			});
			return row;
		});

		datas.forEach(data => format_data.push(data))

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
		name: "vue-table-col-heatmap",
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
	"Percentage Chart": makeRenderer({
		name: "percentage-chart",
		mode: 'percentage-chart',
		chartType: "percentage",
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
