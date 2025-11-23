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
		...defaultProps.props,
	},
	data() {
		return {
			chartInstance: null
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
				const pivotData = new PivotData(this.$props);

				let aggregatorList = [];
				if (typeof pivotData.getAggregatorNames === "function") {
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
				if (!aggregatorList.length) {
					const fallbackKeys = Object.keys(pivotData.props.aggregators || {});
					if (fallbackKeys.length) {
						aggregatorList = [fallbackKeys[0]];
					}
				}
				if (!aggregatorList.length) {
					aggregatorList = ["Count"];
				}

				const aggregatorCount = aggregatorList.length;

				const rowAttrs = pivotData.props.rows;
				const colAttrs = pivotData.props.cols;

				const baseRowKeys = pivotData.getRowKeys();
				const baseColKeys = pivotData.getColKeys();
				
				// Check if all data is filtered out - if both rowKeys and colKeys are empty and tree is empty, don't display the table
				const isAllDataFiltered = baseRowKeys.length === 0 && baseColKeys.length === 0 && Object.keys(pivotData.tree).length === 0;
				
				if (isAllDataFiltered) {
					return null; // Don't display the table when all values are filtered
				}
				
				// Filter out rows and columns where any header value is "null"
				const filteredRowKeys = baseRowKeys.filter((rowKey) => {
					// Exclude rows where any part of the rowKey is "null"
					// Empty arrays are allowed (for grand totals)
					if (rowKey.length === 0) return true;
					return !rowKey.some((val) => val === "null" || val === null);
				});
				
				const filteredColKeys = baseColKeys.filter((colKey) => {
					// Exclude columns where any part of the colKey is "null"
					// Empty arrays are allowed (for grand totals)
					if (colKey.length === 0) return true;
					return !colKey.some((val) => val === "null" || val === null);
				});
				
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

				if (aggregatorCount === 1 && opts.mode && opts.mode !== 'table') {
					const colorScaleGenerator = this.tableColorScaleGenerator;
					const rowTotalValues = colKeys.map((colKey) =>
						pivotData.getAggregator([], colKey, aggregatorList[0]).value()
					);
					rowTotalColors = colorScaleGenerator(rowTotalValues);
					const colTotalValues = rowKeys.map((rowKey) =>
						pivotData.getAggregator(rowKey, [], aggregatorList[0]).value()
					);
					colTotalColors = colorScaleGenerator(colTotalValues);

					if (opts.mode === "heat-map-full") {
						const allValues = [];
						rowKeys.forEach((rowKey) =>
							colKeys.forEach((colKey) =>
								allValues.push(
									pivotData.getAggregator(rowKey, colKey, aggregatorList[0]).value()
								)
							)
						);
						const colorScale = colorScaleGenerator(allValues);
						valueCellColors = (r, c, v) => colorScale(v);
					} else if (opts.mode === "heat-map-row") {
						const rowColorScales = {};
						rowKeys.forEach((rowKey) => {
							const rowValues = colKeys.map((colKey) =>
								pivotData.getAggregator(rowKey, colKey, aggregatorList[0]).value()
							);
							rowColorScales[rowKey] = colorScaleGenerator(rowValues);
						});
						valueCellColors = (r, c, v) => rowColorScales[r](v);
					} else if (opts.mode === "heat-map-col") {
						const colColorScales = {};
						colKeys.forEach((colKey) => {
							const colValues = rowKeys.map((rowKey) =>
								pivotData.getAggregator(rowKey, colKey, aggregatorList[0]).value()
							);
							colColorScales[colKey] = colorScaleGenerator(colValues);
						});
						valueCellColors = (r, c, v) => colColorScales[c](v);
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
									this.tableOptions.clickCallback(e, value, filters, pivotData);
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
								aggName
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
							cells.push(
								h(
									"th",
									{
										class: ["pvtColLabel"],
										key: `colKey${i}-${attrIndex}`,
										colSpan: span,
										rowSpan: 1,
									},
									colKey[attrIndex] != null ? colKey[attrIndex] : ""
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
										aggName
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
							const aggregator = pivotData.getAggregator(rowKey, colKey, aggregatorName);
							const value =
								aggregator && typeof aggregator.value === "function"
									? aggregator.value()
									: null;
							const { formatted, isEmpty } = formatCellDisplay(aggregator, value);
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
								const totalAggregator = pivotData.getAggregator(rowKey, [], aggName);
								const totalValue =
									totalAggregator && typeof totalAggregator.value === "function"
										? totalAggregator.value()
										: null;
								const totalDisplay = formatCellDisplay(totalAggregator, totalValue);
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
						const grandAggregator = pivotData.getAggregator([], [], aggregatorList[0]);
						const grandValue =
							grandAggregator && typeof grandAggregator.value === "function"
								? grandAggregator.value()
								: null;
						const grandDisplay = formatCellDisplay(grandAggregator, grandValue);
						const grandClasses = ["pvtGrandTotal"];
						if (grandDisplay.isEmpty) {
							grandClasses.push("pvtEmpty");
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
							const totalAggregator = pivotData.getAggregator([], colKey, aggregatorName);
							const totalValue =
								totalAggregator && typeof totalAggregator.value === "function"
									? totalAggregator.value()
									: null;
							const columnDisplay = formatCellDisplay(totalAggregator, totalValue);
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
								const grandAggregator = pivotData.getAggregator([], [], aggName);
								const grandValue =
									grandAggregator && typeof grandAggregator.value === "function"
										? grandAggregator.value()
										: null;
								const grandDisplay = formatCellDisplay(grandAggregator, grandValue);
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

				return h(
					"table",
					{
						class: ["pvtTable"],
					},
					[h("thead", headerRows), h("tbody", null, bodyRows)]
				);
			}

			else if (['bar-chart', 'line-chart', 'pie-chart', 'percentage-chart'].includes(opts.mode)) {
				return h('div', {
					ref: 'chartContainer',
					id: 'pivot_chart'
				});
			}

			if (false) { // legacy single-aggregator rendering retained for reference

			if (['table', 'heat-map-full', 'heat-map-col', 'heat-map-row'].includes(opts.mode)) {

				const pivotData = new PivotData(this.$props);
				const aggregatorNames = pivotData.getAggregatorNames
					? pivotData.getAggregatorNames()
					: [this.aggregatorName];
				const primaryAggregator = aggregatorNames[0];
				const getAggregatorResult = (rowKey, colKey) => {
					if (aggregatorNames.length > 1) {
						return pivotData.getAggregator(rowKey, colKey);
					}
					return pivotData.getAggregator(rowKey, colKey, primaryAggregator);
				};
				const getAggregatorValue = (rowKey, colKey) => {
					if (!primaryAggregator) {
						const aggregator = pivotData.getAggregator(rowKey, colKey);
						if (aggregator && typeof aggregator.value === "function") {
							return aggregator.value();
						}
						const fallbackName = aggregatorNames[0];
						if (fallbackName) {
							const fallbackAggregator = pivotData.getAggregator(
								rowKey,
								colKey,
								fallbackName
							);
							if (
								fallbackAggregator &&
								typeof fallbackAggregator.value === "function"
							) {
								return fallbackAggregator.value();
							}
						}
						return null;
					}
					const aggregator = pivotData.getAggregator(rowKey, colKey, primaryAggregator);
					return aggregator && typeof aggregator.value === "function"
						? aggregator.value()
						: null;
				};
				const rowKeys = pivotData.getRowKeys();
				const colKeys = pivotData.getColKeys();
				const colAttrs = pivotData.props.cols;
				const rowAttrs = pivotData.props.rows;
				const grandTotalAggregator =
					aggregatorNames.length > 1
						? pivotData.getAggregator([], [])
						: pivotData.getAggregator([], [], primaryAggregator);

				// eslint-disable-next-line no-unused-vars
				let valueCellColors = () => { };
				// eslint-disable-next-line no-unused-vars
				let rowTotalColors = () => { };
				// eslint-disable-next-line no-unused-vars
				let colTotalColors = () => { };

				if (opts.mode && opts.mode !== 'table') {
					const colorScaleGenerator = this.tableColorScaleGenerator;
					const rowTotalValues = colKeys.map((x) =>
						getAggregatorValue([], x)
					);
					rowTotalColors = colorScaleGenerator(rowTotalValues);
					const colTotalValues = rowKeys.map((x) =>
						getAggregatorValue(x, [])
					);
					colTotalColors = colorScaleGenerator(colTotalValues);

					if (opts.mode === "heat-map-full") {
						const allValues = [];
						rowKeys.map((r) =>
							colKeys.map((c) =>
								allValues.push(getAggregatorValue(r, c))
							)
						);
						const colorScale = colorScaleGenerator(allValues);
						valueCellColors = (r, c, v) => colorScale(v);
					} else if (opts.mode === "heat-map-row") {
						const rowColorScales = {};
						rowKeys.map((r) => {
							const rowValues = colKeys.map((x) =>
								getAggregatorValue(r, x)
							);
							rowColorScales[r] = colorScaleGenerator(rowValues);
						});
						valueCellColors = (r, c, v) => rowColorScales[r](v);
					} else if (opts.mode === "heat-map-col") {
						const colColorScales = {};
						colKeys.map((c) => {
							const colValues = rowKeys.map((x) =>
								getAggregatorValue(x, c)
							);
							colColorScales[c] = colorScaleGenerator(colValues);
						});
						valueCellColors = (r, c, v) => colColorScales[c](v);
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
								this.tableOptions.clickCallback(e, value, filters, pivotData);
						}
						: null;

				return h(
					"table",
					{
						class: ["pvtTable"],
					},
					[
						h("thead", [
							colAttrs.map((c, j) => {
								return h(
									"tr",
									{
										key: `colAttrs${j}`,
									},
									[
										j === 0 && rowAttrs.length !== 0
											? h("th", {
												colSpan: rowAttrs.length,
												rowSpan: colAttrs.length,
											})
											: undefined,

										h(
											"th",
											{
												class: ["pvtAxisLabel"],
											},
											c
										),

										colKeys.map((colKey, i) => {
											const x = this.spanSize(colKeys, i, j);
											if (x === -1) {
												return null;
											}
											return h(
												"th",
												{
													class: ["pvtColLabel"],
													key: `colKey${i}`,
													colSpan: x,
													rowSpan:
														j === colAttrs.length - 1 && rowAttrs.length !== 0
															? 2
															: 1,
												},
												colKey[j]
											);
										}),
										j === 0 && this.rowTotal
											? h(
												"th",
												{
													class: ["pvtTotalLabel"],
													rowSpan:
														colAttrs.length + (rowAttrs.length === 0 ? 0 : 1),
												},
												"Totals"
											)
											: undefined,
									]
								);
							}),

							rowAttrs.length !== 0
								? h("tr", [
									rowAttrs.map((r, i) => {
										return h(
											"th",
											{
												class: ["pvtAxisLabel"],
												key: `rowAttr${i}`,
											},
											r
										);
									}),

									this.rowTotal
										? h(
											"th",
											{ class: ["pvtTotalLabel"] },
											colAttrs.length === 0 ? "Totals" : null
										)
										: colAttrs.length === 0
											? undefined
											: h("th", { class: ["pvtTotalLabel"] }, null),
								])
								: undefined,
						]),

						h("tbody", null, [
							rowKeys.map((rowKey, i) => {
								const totalAggregator = pivotData.getAggregator(rowKey, []);
								const totalValue = totalAggregator && typeof totalAggregator.value === "function"
									? totalAggregator.value()
									: null;
								return h(
									"tr",
									{
										key: `rowKeyRow${i}`,
									},
									[
										rowKey.map((txt, j) => {
											const x = this.spanSize(rowKeys, i, j);
											if (x === -1) {
												return null;
											}
											return h(
												"th",
												{
													class: ["pvtRowLabel"],
													key: `rowKeyLabel${i}-${j}`,
													rowSpan: x,
													colSpan:
														j === rowAttrs.length - 1 && colAttrs.length !== 0
															? 2
															: 1,
												},
												txt
											);
										}),

										colKeys.map((colKey, j) => {
											const aggregator = pivotData.getAggregator(rowKey, colKey);
											return h(
												"td",
												Object.assign(
													{
														class: ["pvVal"],
														style: valueCellColors(
															rowKey,
															colKey,
															primaryAggregator && aggregator && typeof aggregator.value === "function"
																? aggregator.value()
																: primaryAggregator
																? getAggregatorValue(rowKey, colKey)
																: null
														),
														key: `pvtVal${i}-${j}`,
													},
													getClickHandler
														? {
															onClick: getClickHandler(
																primaryAggregator && aggregator && typeof aggregator.value === "function"
																	? aggregator.value()
																	: getAggregatorValue(rowKey, colKey),
																rowKey,
																colKey
															),
														}
														: {}
												),
												aggregator && typeof aggregator.format === "function"
													? aggregator.format(aggregator.value())
													: ""
											);
										}),

										this.rowTotal
											? h(
												"td",
												Object.assign(
													{
														class: ["pvtTotal"],
														style: colTotalColors(
															totalValue
														),
													},
													getClickHandler
														? {
															onClick: getClickHandler(
																totalValue,
																rowKey,
																[null]
															),
														}
														: {}
												),
												totalAggregator && typeof totalAggregator.format === "function"
													? totalAggregator.format(totalValue)
													: ""
											)
											: undefined,
									]
								);
							}),

							h("tr", [
								this.colTotal
									? h(
										"th",
										{
											class: ["pvtTotalLabel"],
											colSpan:
												rowAttrs.length + (colAttrs.length === 0 ? 0 : 1),
										},
										"Totals"
									)
									: undefined,

								this.colTotal
									? colKeys.map((colKey, i) => {
										const totalAggregator =
											aggregatorNames.length > 1
												? pivotData.getAggregator([], colKey)
												: pivotData.getAggregator([], colKey, primaryAggregator);
										const totalValue =
											aggregatorNames.length > 1
												? getAggregatorValue([], colKey)
												: totalAggregator.value();
										return h(
											"td",
											Object.assign(
												{
													class: ["pvtTotal"],
													style: rowTotalColors(
														totalValue
													),
													key: `total${i}`,
												},
												getClickHandler
													? {
														onClick: getClickHandler(
															totalValue,
															[null],
															colKey
														),
													}
													: {}
											),
											totalAggregator && typeof totalAggregator.format === "function"
												? totalAggregator.format(totalValue)
												: ""
										);
									})
									: undefined,

								this.colTotal && this.rowTotal
									? h(
										"td",
										Object.assign(
											{
												class: ["pvtGrandTotal"],
											},
											getClickHandler
												? {
													onClick: getClickHandler(
														grandTotalAggregator && typeof grandTotalAggregator.value === "function"
															? grandTotalAggregator.value()
															: null,
														[null],
														[null]
													),
												}
												: {}
										),
										grandTotalAggregator && typeof grandTotalAggregator.format === "function"
											? grandTotalAggregator.format(grandTotalAggregator.value())
											: ""
									)
									: undefined,
							]),
						]),
					]
				)
			}
		}
		},
	};
	return TableRenderer;
}

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
