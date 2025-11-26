import { h, defineComponent, computed } from 'vue';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
	TitleComponent,
	TooltipComponent,
	LegendComponent,
	GridComponent,
	DataZoomComponent
} from 'echarts/components';
import VChart from 'vue-echarts';
import { pivotWorkerManager } from '../utils/pivotWorkerManager.js';
import { optimizePieDataWithTopN } from '../utils/chartOptimization.js';

// Register ECharts components
use([
	CanvasRenderer,
	BarChart,
	LineChart,
	PieChart,
	TitleComponent,
	TooltipComponent,
	LegendComponent,
	GridComponent,
	DataZoomComponent
]);

export default defineComponent({
	name: 'ChartWrapper',
	components: {
		VChart
	},
	props: {
		data: {
			type: Object,
			required: true,
			default: () => ({ labels: [], datasets: [] })
		},
		type: {
			type: String,
			required: true,
			validator: (value) => ['bar', 'line', 'pie', 'percentage'].includes(value)
		},
		colors: {
			type: Array,
			default: () => ['#7ad6ff', '#7a94ff', '#d7d0ff', '#ff7b92', '#ffad70', '#fff48d', '#7ef8b3', '#c1ff7a', '#d7b3ff', '#ff7bff', '#b1b1b1', '#8d8d8d']
		},
		lineOptions: {
			type: Object,
			default: () => ({})
		},
		useWorkerOptimization: {
			type: Boolean,
			default: false
		}
	},
		setup(props) {
		const chartOption = computed(() => {
			if (!props.data || !props.data.labels || !props.data.datasets || props.data.datasets.length === 0) {
				return {
					title: {
						text: 'No data available',
						left: 'center',
						top: 'center',
						textStyle: {
							color: '#999',
							fontSize: 16
						}
					}
				};
			}

			// Data is already optimized:
			// - Top-N is applied after pivot calculation (filters rowKeys/colKeys)
			// - LTTB runs in Web Worker when useWorkerOptimization is true
			// So we just use the data as-is here
			const { labels, datasets } = props.data;
			const isSpline = props.lineOptions && props.lineOptions.spline === 1;
			
			// Helper function to calculate legend height
			const calculateLegendHeight = (legendItems, isVertical = false) => {
				if (!legendItems || legendItems.length === 0) return 0;
				// Each legend item is approximately 20px tall (including spacing)
				// For horizontal legends, they wrap, so we estimate based on items per row
				if (isVertical) {
					// Vertical legend: each item takes ~20px
					return legendItems.length * 20 + 20; // +20 for padding
				} else {
					// Horizontal legend: estimate rows (assuming ~5 items per row on average)
					const estimatedRows = Math.ceil(legendItems.length / 5);
					return estimatedRows * 20 + 30; // +30 for padding and spacing
				}
			};

			if (props.type === 'pie') {
				// Pie chart - combine all series into one pie
				let pieData = [];
				labels.forEach((label, labelIndex) => {
					// Filter out null labels and labels containing "null"
					if (label == null || label === "null" || label === "" || String(label).includes("null")) {
						return;
					}
					datasets.forEach((dataset) => {
						// Filter out null dataset names and names containing "null"
						if (dataset.name == null || dataset.name === "null" || dataset.name === "" || String(dataset.name).includes("null")) {
							return;
						}
						const value = dataset.values[labelIndex] || 0;
						// Only add if value is valid
						if (value !== null && value !== undefined && value !== "") {
							pieData.push({
								name: `${label} - ${dataset.name}`,
								value: typeof value === 'number' ? value : (parseFloat(value) || 0)
							});
						}
					});
				});

				// Apply Top-N with "Others" grouping if data is large
				// Note: Top-N is already applied in getChartData(), but we apply it here again
				// for pie charts since they combine labels and datasets differently
				const topNThreshold = 20;
				if (pieData.length > topNThreshold) {
					pieData = optimizePieDataWithTopN(pieData, topNThreshold, true);
				}

				// Calculate legend width for vertical legend
				const legendItems = pieData.map(item => item.name);
				// Estimate legend width: base 180px, add 10px per item (max 300px)
				const estimatedLegendWidth = Math.min(300, Math.max(180, 180 + legendItems.length * 10));
				
				return {
					tooltip: {
						trigger: 'item',
						formatter: '{a} <br/>{b}: {c}'
					},
					legend: {
						orient: 'vertical',
						left: 'left',
						top: 'center',
						show: true,
						itemGap: 10,
						itemWidth: 12,
						itemHeight: 12,
						textStyle: {
							fontSize: 12
						},
						width: `${estimatedLegendWidth}px` // Set legend width
					},
					series: [{
						name: datasets[0]?.name || 'Data',
						type: 'pie',
						radius: '50%',
						// Center the pie in the remaining space after legend
						// If legend takes ~20% of width, center pie at ~60% (20% + 40% of remaining 80%)
						center: legendItems.length > 15 ? ['60%', '50%'] : ['55%', '50%'],
						data: pieData,
						emphasis: {
							itemStyle: {
								shadowBlur: 10,
								shadowOffsetX: 0,
								shadowColor: 'rgba(0, 0, 0, 0.5)'
							}
						},
						itemStyle: {
							color: (params) => {
								return props.colors[params.dataIndex % props.colors.length];
							}
						},
						label: {
							show: legendItems.length < 20, // Hide labels if too many items (legend shows them)
							position: 'outside'
						}
					}]
				};
			} else if (props.type === 'percentage') {
				// Percentage chart - horizontal segmented bar (progress bar style)
				// Combine all datasets into segments
				let segments = [];
				let segmentIndex = 0;
				
				labels.forEach((label, labelIndex) => {
					// Filter out null labels and labels containing "null"
					if (label == null || label === "null" || label === "" || String(label).includes("null")) {
						return;
					}
					datasets.forEach((dataset) => {
						// Filter out null dataset names and names containing "null"
						if (dataset.name == null || dataset.name === "null" || dataset.name === "" || String(dataset.name).includes("null")) {
							return;
						}
						const value = typeof dataset.values[labelIndex] === 'number' 
							? dataset.values[labelIndex] 
							: (parseFloat(dataset.values[labelIndex]) || 0);
						if (value > 0) {
							segments.push({
								name: dataset.name,
								value: value,
								label: label,
								color: props.colors[segmentIndex % props.colors.length]
							});
							segmentIndex++;
						}
					});
				});

				// Apply Top-N with "Others" grouping if data is large
				const topNThreshold = 20;
				if (segments.length > topNThreshold) {
					// Sort by value and take top N, then sum remaining into "Others"
					segments.sort((a, b) => b.value - a.value);
					const topNSegments = segments.slice(0, topNThreshold);
					const othersSegments = segments.slice(topNThreshold);
					
					if (othersSegments.length > 0) {
						const othersValue = othersSegments.reduce((sum, seg) => sum + seg.value, 0);
						topNSegments.push({
							name: 'Others',
							value: othersValue,
							label: 'Others',
							color: props.colors[topNSegments.length % props.colors.length]
						});
					}
					
					segments = topNSegments;
				}

				// Calculate total and percentages
				const total = segments.reduce((sum, seg) => sum + seg.value, 0);
				const percentageData = segments.map(seg => ({
					...seg,
					percentage: total > 0 ? (seg.value / total * 100) : 0
				}));

				// Create a single horizontal bar with stacked segments
				// We'll use a custom series with stack to create the segmented bar
				const seriesData = percentageData.map((seg, index) => ({
					value: seg.percentage,
					name: seg.name,
					itemStyle: {
						color: seg.color
					}
				}));

				return {
					tooltip: {
						trigger: 'item',
						formatter: (params) => {
							const seg = percentageData[params.dataIndex];
							return `${seg.name}: ${seg.percentage.toFixed(1)}%`;
						}
					},
					grid: {
						left: '3%',
						right: '4%',
						top: '10%',
						bottom: '3%',
						containLabel: false
					},
					xAxis: {
						type: 'value',
						max: 100,
						axisLabel: {
							formatter: '{value}%'
						}
					},
					yAxis: {
						type: 'category',
						data: [''], // Single row for the horizontal bar
						show: false
					},
					series: [{
						name: 'Percentage',
						type: 'bar',
						barWidth: '60%',
						data: seriesData,
						stack: 'total',
						label: {
							show: false
						},
						emphasis: {
							focus: 'series'
						}
					}]
				};
			} else {
				// Bar or Line chart
				// Filter out null labels and datasets with null names
				const filteredLabels = labels.filter(label => 
					label !== null && label !== "null" && label !== "" && !String(label).includes("null")
				);
				
				const filteredDatasets = datasets.filter(dataset => 
					dataset && 
					dataset.name !== null && 
					dataset.name !== "null" && 
					dataset.name !== "" && 
					!String(dataset.name).includes("null")
				);
				
				const series = filteredDatasets.map((dataset, index) => {
					// Map values to match filtered labels
					const values = filteredLabels.map((filteredLabel, filteredIndex) => {
						// Find the original index of this label
						const originalIndex = labels.indexOf(filteredLabel);
						if (originalIndex !== -1 && originalIndex < dataset.values.length) {
							const value = dataset.values[originalIndex];
							return typeof value === 'number' ? value : (parseFloat(value) || 0);
						}
						return 0;
					});
					
					return {
						name: dataset.name,
						type: props.type === 'line' ? 'line' : 'bar',
						data: values,
						smooth: isSpline && props.type === 'line',
						itemStyle: {
							color: props.colors[index % props.colors.length]
						}
					};
				});

				// Calculate legend height for horizontal legend
				const legendItems = filteredDatasets.map(d => d.name);
				
				// Calculate all values to determine y-axis range for consistent chart height
				const allValues = [];
				series.forEach(s => {
					if (Array.isArray(s.data)) {
						s.data.forEach(v => {
							if (typeof v === 'number' && !isNaN(v) && isFinite(v)) {
								allValues.push(v);
							}
						});
					}
				});

				// Calculate min and max values
				let yMin = allValues.length > 0 ? Math.min(...allValues) : 0;
				let yMax = allValues.length > 0 ? Math.max(...allValues) : 1;
				const range = yMax - yMin;
				
				// Use fixed spacing: legend at top, then fixed gap, then chart
				// This ensures consistent distance between legend and chart regardless of legend size
				const legendTopPx = 20; // Fixed top position for legend
				const legendGapPx = 20; // Fixed gap between legend and chart
				const gridTopPx = legendTopPx + 40 + legendGapPx; // Legend height (~40px) + gap
				
				// Configure y-axis to maintain consistent visual height
				// If range is very small, expand it to show variations clearly
				const yAxisConfig = {
					type: 'value'
				};
				
				// Always set a minimum range to maintain consistent chart height
				// This ensures the chart area maintains the same visual height regardless of data values
				const minRange = Math.max(range, Math.abs(yMax || 1) * 0.1); // At least 10% of max value
				const padding = minRange * 0.1; // 10% padding
				
				if (range > 0) {
					yAxisConfig.min = yMin - padding;
					yAxisConfig.max = yMax + padding;
					// Ensure minimum visual range for consistent chart height
					if ((yAxisConfig.max - yAxisConfig.min) < minRange) {
						const center = (yAxisConfig.max + yAxisConfig.min) / 2;
						yAxisConfig.min = center - minRange / 2;
						yAxisConfig.max = center + minRange / 2;
					}
				} else {
					// All values are the same, use a range around that value
					const centerValue = yMax || 1;
					const defaultRange = Math.abs(centerValue) * 0.2; // 20% range
					yAxisConfig.min = centerValue - defaultRange;
					yAxisConfig.max = centerValue + defaultRange;
				}

				return {
					tooltip: {
						trigger: 'axis',
						axisPointer: {
							type: props.type === 'line' ? 'cross' : 'shadow'
						}
					},
					legend: {
						data: legendItems,
						show: filteredDatasets.length > 1,
						top: `${legendTopPx}px`, // Fixed pixel position
						left: 'center',
						itemGap: 15,
						itemWidth: 12,
						itemHeight: 12,
						textStyle: {
							fontSize: 12
						},
						type: 'scroll' // Enable scrolling for long legends
					},
					grid: {
						left: '3%',
						right: '4%',
						top: `${gridTopPx}px`, // Fixed pixel position to maintain consistent gap
						bottom: '15%', // Increased bottom for x-axis labels and dataZoom
						containLabel: true
					},
					dataZoom: [
						{
							type: 'slider',
							show: true,
							xAxisIndex: [0],
							start: 0,
							end: 100,
							bottom: '5%',
							height: 20,
							handleIcon: 'path://M10.7,11.9v-1.3H9.3v1.3c-4.9,0.3-8.8,4.4-8.8,9.4c0,5,3.9,9.1,8.8,9.4v1.3h1.3v-1.3c4.9-0.3,8.8-4.4,8.8-9.4C19.5,16.3,15.6,12.2,10.7,11.9z M13.3,24.4H6.7V23.1h6.6V24.4z M13.3,19.6H6.7v-1.4h6.6V19.6z',
							handleSize: '80%',
							handleStyle: {
								color: '#fff',
								shadowBlur: 3,
								shadowColor: 'rgba(0, 0, 0, 0.6)',
								shadowOffsetX: 2,
								shadowOffsetY: 2
							},
							textStyle: {
								color: '#333'
							},
							borderColor: '#ccc'
						},
						{
							type: 'inside',
							xAxisIndex: [0],
							start: 0,
							end: 100,
							zoomOnMouseWheel: true,
							moveOnMouseMove: true,
							moveOnMouseWheel: false
						},
						{
							type: 'slider',
							show: true,
							yAxisIndex: [0],
							start: 0,
							end: 100,
							right: '5%',
							width: 20,
							handleIcon: 'path://M10.7,11.9v-1.3H9.3v1.3c-4.9,0.3-8.8,4.4-8.8,9.4c0,5,3.9,9.1,8.8,9.4v1.3h1.3v-1.3c4.9-0.3,8.8-4.4,8.8-9.4C19.5,16.3,15.6,12.2,10.7,11.9z M13.3,24.4H6.7V23.1h6.6V24.4z M13.3,19.6H6.7v-1.4h6.6V19.6z',
							handleSize: '80%',
							handleStyle: {
								color: '#fff',
								shadowBlur: 3,
								shadowColor: 'rgba(0, 0, 0, 0.6)',
								shadowOffsetX: 2,
								shadowOffsetY: 2
							},
							textStyle: {
								color: '#333'
							},
							borderColor: '#ccc'
						},
						{
							type: 'inside',
							yAxisIndex: [0],
							start: 0,
							end: 100,
							zoomOnMouseWheel: true,
							moveOnMouseMove: true,
							moveOnMouseWheel: false
						}
					],
					xAxis: {
						type: 'category',
						data: filteredLabels,
						axisTick: {
							alignWithLabel: true
						},
						axisLabel: {
							rotate: filteredLabels.length > 10 ? 45 : 0, // Rotate if many labels
							interval: 0
						}
					},
					yAxis: yAxisConfig,
					series: series
				};
			}
		});

		return () => {
			// Fixed canvas height: 500px - this ensures the chart canvas always has the same height
			const fixedCanvasHeight = 500;
			
			// Calculate total container height to accommodate legend and controls
			// but the canvas itself will always be fixed at fixedCanvasHeight
			const legendTopPx = 20; // Fixed top position for legend
			const legendGapPx = 20; // Fixed gap between legend and chart
			const bottomControlsHeight = 80; // Space for x-axis labels and dataZoom
			
			let totalHeight = legendTopPx + 40 + legendGapPx + fixedCanvasHeight + bottomControlsHeight; // Base structure
			
			// Use props.data directly - optimizations are already applied:
			// - Top-N is applied after pivot calculation
			// - LTTB runs in Web Worker if useWorkerOptimization is true
			if (props.data && props.data.datasets && props.data.labels) {
				const { labels, datasets } = props.data;
				
				if (props.type === 'pie') {
					// For pie charts with vertical legend, calculate based on legend items
					let pieData = [];
					labels.forEach((label, labelIndex) => {
						if (label == null || label === "null" || label === "" || String(label).includes("null")) {
							return;
						}
						datasets.forEach((dataset) => {
							if (dataset.name == null || dataset.name === "null" || dataset.name === "" || String(dataset.name).includes("null")) {
								return;
							}
							const value = dataset.values[labelIndex] || 0;
							if (value !== null && value !== undefined && value !== "") {
								pieData.push({
									name: `${label} - ${dataset.name}`,
									value: typeof value === 'number' ? value : (parseFloat(value) || 0)
								});
							}
						});
					});
					// Top-N is already applied after pivot calculation, so pieData is already filtered
					// Vertical legend: add height based on number of items
					const legendItemCount = pieData.length;
					const legendHeight = legendItemCount * 20 + 40; // Each item ~20px + padding
					totalHeight = legendTopPx + legendHeight + legendGapPx + fixedCanvasHeight + bottomControlsHeight;
				} else if (props.type === 'bar' || props.type === 'line') {
					// For bar/line charts with horizontal legend
					// Legend height is fixed at ~40px (single row) or more if multiple rows
					const filteredDatasets = datasets.filter(dataset => 
						dataset && 
						dataset.name !== null && 
						dataset.name !== "null" && 
						dataset.name !== "" && 
						!String(dataset.name).includes("null")
					);
					
					if (filteredDatasets.length > 1) {
						// Estimate legend rows (assuming ~5 items per row, each row ~20px)
						const estimatedLegendRows = Math.ceil(filteredDatasets.length / 5);
						const legendHeight = estimatedLegendRows * 20 + 40; // Each row ~20px + padding
						// Total height: legend + gap + fixed chart area + bottom controls
						totalHeight = legendTopPx + legendHeight + legendGapPx + fixedCanvasHeight + bottomControlsHeight;
					} else {
						// No legend or single series
						totalHeight = legendTopPx + legendGapPx + fixedCanvasHeight + bottomControlsHeight;
					}
					
					// Account for rotated x-axis labels if there are many labels
					const filteredLabels = labels.filter(label => 
						label !== null && label !== "null" && label !== "" && !String(label).includes("null")
					);
					if (filteredLabels.length > 10) {
						// Add extra height for rotated labels (part of bottom controls)
						totalHeight += 30;
					}
				}
			}
			
			// Ensure minimum height
			totalHeight = Math.max(totalHeight, 600); // At least 600px total
			
			return h('div', {
				style: {
					width: '100%',
					height: `${totalHeight}px`,
					minHeight: '600px'
				}
			}, [
				h(VChart, {
					option: chartOption.value,
					style: {
						width: '100%',
						height: `${fixedCanvasHeight}px` // Fixed canvas height - always 500px
					}
				})
			]);
		};
	}
});

