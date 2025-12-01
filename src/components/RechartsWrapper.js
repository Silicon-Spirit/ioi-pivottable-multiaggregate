import { h, defineComponent, computed, ref, onMounted, onUnmounted, nextTick } from 'vue';
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
		// Helper function to truncate long labels for display
		const truncateLabel = (label, maxLength = 30) => {
			if (!label || typeof label !== 'string') return label;
			if (label.length <= maxLength) return label;
			// Try to find a good break point (space, dash, etc.)
			const truncated = label.substring(0, maxLength - 3);
			const lastSpace = truncated.lastIndexOf(' ');
			const lastDash = truncated.lastIndexOf('-');
			const breakPoint = Math.max(lastSpace, lastDash);
			if (breakPoint > maxLength * 0.6) {
				return label.substring(0, breakPoint) + '...';
			}
			return truncated + '...';
		};
		
		// Helper function to format label for better readability
		const formatLabelForDisplay = (label) => {
			if (!label || typeof label !== 'string') return label;
			// If label is very long, try to extract key parts
			// For labels like "Ancien contrat-2022-05-12-2025-09-04 21:08:24.026246-2932.33-2423.41"
			// Extract: "Ancien contrat" and date part
			if (label.length > 40) {
				const parts = label.split('-');
				if (parts.length >= 2) {
					// Take first part (category) and date if available
					const category = parts[0];
					const datePart = parts.length > 1 ? parts[1] : '';
					if (datePart && datePart.match(/^\d{4}-\d{2}-\d{2}/)) {
						return `${category}-${datePart}...`;
					}
				}
			}
			return truncateLabel(label, 40);
		};
		
		const chartOption = computed(() => {
			// More lenient check - allow null values in labels/datasets
			// Only show "No data available" if there's truly no data structure
			if (!props.data) {
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
			const { labels = [], datasets = [] } = props.data || {};
			
			// Check if we have actual data after processing (will check per chart type)
			// For now, just ensure we have the structure - null values are allowed
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
				// Process labels and datasets - allow null values
				// Check after processing if we have valid data
				if (labels && labels.length > 0 && datasets && datasets.length > 0) {
					labels.forEach((label, labelIndex) => {
						// Allow "(null)" as a valid label (display format for null values)
						// Filter out only actual null, empty strings, and the literal "null" string
						if (label == null || label === "null" || label === "") {
							return;
						}
						datasets.forEach((dataset) => {
							// Allow "(null)" as a valid dataset name (display format for null values)
							// Filter out only actual null, empty strings, and the literal "null" string
							if (dataset.name == null || dataset.name === "null" || dataset.name === "") {
								return;
							}
							const value = dataset.values && dataset.values[labelIndex] !== undefined 
								? dataset.values[labelIndex] 
								: null;
							// Include all values, converting null/undefined/empty to 0
							const numValue = (value !== null && value !== undefined && value !== "") 
								? (typeof value === 'number' ? value : (parseFloat(value) || 0))
								: 0;
							pieData.push({
								name: `${label} - ${dataset.name}`,
								value: numValue
							});
						});
					});
				}
				
				// Check if we have chart structure to render
				// Only show "No data available" if there's no pie data at all
				// Note: Zero values are valid data - the chart should render even with zeros
				if (pieData.length === 0) {
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
				
				// Calculate better layout for pie chart
				// Legend width depends on item count and text length
				const maxNameLength = Math.max(...pieData.map(item => String(item.name).length), 0);
				const legendWidth = Math.min(250, Math.max(150, Math.min(maxNameLength * 7, 250)));
				// Calculate pie center as percentage - legend takes ~20-25% of width, center pie at ~60-65%
				// Use a simple percentage-based approach
				const pieCenterX = legendItems.length > 15 ? '65%' : '60%';
				
				return {
					// Explicitly hide title when chart has data
					title: {
						show: false
					},
					tooltip: {
						trigger: 'item',
						// Enhanced tooltip with percentage and value
						formatter: (params) => {
							const total = pieData.reduce((sum, item) => sum + item.value, 0);
							const percentage = total > 0 ? ((params.value / total) * 100).toFixed(1) : 0;
							const value = typeof params.value === 'number' 
								? params.value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
								: params.value;
							return `<div style="margin-bottom: 4px; font-weight: bold;">${params.name}</div>
								<div style="margin: 2px 0;">
									<span style="margin-right: 12px;">Value:</span>
									<span style="font-weight: bold;">${value}</span>
								</div>
								<div style="margin: 2px 0;">
									<span style="margin-right: 12px;">Percentage:</span>
									<span style="font-weight: bold;">${percentage}%</span>
								</div>`;
						},
						backgroundColor: 'rgba(255, 255, 255, 0.95)',
						borderColor: '#ccc',
						borderWidth: 1,
						padding: [8, 12],
						textStyle: {
							color: '#333',
							fontSize: 12
						},
						extraCssText: 'box-shadow: 0 2px 8px rgba(0,0,0,0.15); border-radius: 4px;'
					},
					legend: {
						orient: 'vertical',
						left: 'left',
						top: 'middle',
						show: true,
						itemGap: 8,
						itemWidth: 14,
						itemHeight: 14,
						textStyle: {
							fontSize: 12,
							color: '#333'
						},
						width: `${legendWidth}px`,
						// Better legend formatting - truncate long names
						formatter: (name) => {
							return truncateLabel(name, 30);
						},
						// Allow clicking to show/hide series
						selectedMode: true,
						icon: 'circle',
						// Better tooltip for legend
						tooltip: {
							show: true,
							formatter: (params) => {
								return params.name; // Show full name in tooltip
							}
						}
					},
					series: [{
						name: datasets[0]?.name || 'Data',
						type: 'pie',
						// Better radius calculation - use smaller radius if many items
						radius: legendItems.length > 15 ? ['30%', '60%'] : ['35%', '65%'], // Donut chart for better visibility
						// Center the pie chart accounting for legend width - use percentage
						center: [pieCenterX, '50%'],
						data: pieData,
						emphasis: {
							itemStyle: {
								shadowBlur: 15,
								shadowOffsetX: 0,
								shadowOffsetY: 0,
								shadowColor: 'rgba(0, 0, 0, 0.3)'
							},
							// Scale up on hover
							scale: true,
							scaleSize: 5
						},
						itemStyle: {
							color: (params) => {
								return props.colors[params.dataIndex % props.colors.length];
							},
							borderColor: '#fff',
							borderWidth: 2
						},
						label: {
							show: false // Hide all labels - only show tooltip on hover
						},
						labelLine: {
							show: false // Hide label lines since labels are hidden
						},
						// Better animation
						animationType: 'scale',
						animationEasing: 'elasticOut',
						animationDelay: (idx) => idx * 10
					}]
				};
			} else if (props.type === 'percentage') {
				// Percentage chart - horizontal segmented bar (progress bar style)
				// Combine all datasets into segments
				let segments = [];
				let segmentIndex = 0;
				
				// Process labels and datasets - allow null values
				if (labels && labels.length > 0 && datasets && datasets.length > 0) {
					labels.forEach((label, labelIndex) => {
						// Allow "(null)" as a valid label (display format for null values)
						// Filter out only actual null, empty strings, and the literal "null" string
						if (label == null || label === "null" || label === "") {
							return;
						}
						datasets.forEach((dataset) => {
							// Allow "(null)" as a valid dataset name (display format for null values)
							// Filter out only actual null, empty strings, and the literal "null" string
							if (dataset.name == null || dataset.name === "null" || dataset.name === "") {
								return;
							}
							const value = dataset.values && dataset.values[labelIndex] !== undefined 
								? dataset.values[labelIndex] 
								: null;
							// Include all values, converting null/undefined/empty to 0
							const numValue = (value !== null && value !== undefined && value !== "") 
								? (typeof value === 'number' ? value : (parseFloat(value) || 0))
								: 0;
							// Include all segments, even if value is 0
							segments.push({
								name: dataset.name,
								value: numValue,
								label: label,
								color: props.colors[segmentIndex % props.colors.length]
							});
							segmentIndex++;
						});
					});
				}
				
				// Check if we have chart structure to render
				// Only show "No data available" if there's no segments at all
				// Note: Zero values are valid data - the chart should render even with zeros
				if (segments.length === 0) {
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
					// Explicitly hide title when chart has data
					title: {
						show: false
					},
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
				// Allow "(null)" as a valid label (display format for null values)
				// Filter out only actual null, empty strings, and the literal "null" string
				const filteredLabels = (labels || []).filter(label => 
					label !== null && label !== "null" && label !== ""
				);
				
				// Allow "(null)" as a valid dataset name (display format for null values)
				// Filter out only actual null, empty strings, and the literal "null" string
				const filteredDatasets = (datasets || []).filter(dataset => 
					dataset && 
					dataset.name !== null && 
					dataset.name !== "null" && 
					dataset.name !== ""
				);
				
				// Build series first to check if we have actual data
				const series = filteredDatasets.map((dataset, index) => {
					// Map values to match filtered labels
					const values = filteredLabels.map((filteredLabel, filteredIndex) => {
						// Find the original index of this label
						const originalIndex = labels.indexOf(filteredLabel);
						if (originalIndex !== -1 && originalIndex < dataset.values.length) {
							const value = dataset.values[originalIndex];
							// Include null values, converting them to 0 for chart display
							if (value === null || value === undefined || value === "") {
								return 0;
							}
							return typeof value === 'number' ? value : (parseFloat(value) || 0);
						}
						return 0;
					});
					
					// Calculate max value for label display threshold
					const maxValue = Math.max(...values.filter(v => typeof v === 'number' && !isNaN(v)));
					
					return {
						name: dataset.name,
						type: props.type === 'line' ? 'line' : 'bar',
						data: values,
						smooth: isSpline && props.type === 'line',
						itemStyle: {
							color: props.colors[index % props.colors.length],
							// Better bar styling with rounded corners
							borderRadius: props.type === 'bar' ? [4, 4, 0, 0] : 0,
							borderWidth: props.type === 'bar' ? 1 : 0,
							borderColor: props.type === 'bar' ? 'rgba(255, 255, 255, 0.3)' : undefined
						},
						// Enhanced emphasis for better interactivity
						emphasis: {
							focus: 'series',
							itemStyle: {
								shadowBlur: 10,
								shadowColor: 'rgba(0, 0, 0, 0.5)',
								borderWidth: 2,
								borderColor: props.colors[index % props.colors.length]
							}
						},
						// Show labels only for significant values to reduce clutter
						label: {
							show: false, // Hide by default
							position: 'top',
							formatter: (params) => {
								const value = params.value;
								if (typeof value === 'number' && value !== 0 && maxValue > 0) {
									// Only show label if value is > 5% of max to reduce clutter
									if (value > maxValue * 0.05) {
										return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
									}
								}
								return '';
							},
							fontSize: 10,
							color: '#333'
						}
					};
				});

				// Check if we have chart structure to render
				// Only show "No data available" if there's no series or all series have empty data arrays
				// Note: Zero values are valid data - the chart should render even with zeros
				// We need at least one series with non-empty data array
				const hasChartStructure = series.length > 0 && series.some(s => {
					return s.data && Array.isArray(s.data) && s.data.length > 0;
				});
				
				if (!hasChartStructure) {
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
				
				// Calculate space needed for X-axis labels
				// When labels are long and rotated, we need more bottom space
				const isRotated = filteredLabels.length > 10;
				let maxLabelLength = 0;
				if (filteredLabels.length > 0) {
					// Find the longest label to estimate space needed
					maxLabelLength = Math.max(...filteredLabels.map(label => String(label).length));
				}
				
				// Use fixed spacing: legend at top, then fixed gap, then chart
				// This ensures consistent distance between legend and chart regardless of legend size
				const legendTopPx = 20; // Fixed top position for legend
				const legendGapPx = 20; // Fixed gap between legend and chart
				const gridTopPx = legendTopPx + 40 + legendGapPx; // Legend height (~40px) + gap
				
				// Fixed chart data area height - this MUST remain constant (section 1)
				// This is the height of the actual chart visualization area
				const fixedChartDataAreaHeight = 500;
				
				// Calculate space needed for labels below the grid
				// This will be used to calculate canvas height
				// The grid bottom will be calculated to maintain fixed chart data area height
				// FIXED gap between labels and dataZoom to maintain consistent UI
				const dataZoomHeight = 20; // Height of dataZoom slider
				const fixedGap = 5; // Fixed gap between labels and dataZoom (always constant)
				const bottomMargin = 10; // Fixed bottom margin
				const fixedGapTotal = fixedGap + dataZoomHeight + bottomMargin; // Always 35px total
				
				// Calculate label height needed (can vary, but cap at reasonable maximum)
				let labelHeight = 30; // Base label height
				if (isRotated) {
					// For rotated labels, calculate space but cap at maximum
					// Cap at 120px to prevent excessive space
					labelHeight = Math.min(120, Math.max(40, maxLabelLength * 5));
				} else {
					if (maxLabelLength > 50) {
						// Very long labels might wrap, but cap at reasonable maximum
						labelHeight = Math.min(100, Math.ceil(maxLabelLength / 10) * 15);
					} else {
						labelHeight = 30; // Base label height
					}
				}
				
				// Total space = label height (variable, capped) + fixed gap (always constant)
				const labelSpaceNeeded = labelHeight + fixedGapTotal;
				
				// Grid bottom will be calculated dynamically to maintain fixed chart data area height
				// Grid area = canvasHeight - gridTop - gridBottom = fixedChartDataAreaHeight
				// So: gridBottom = canvasHeight - gridTop - fixedChartDataAreaHeight
				// For now, use labelSpaceNeeded as a placeholder (will be recalculated in return function)
				const gridBottomPx = labelSpaceNeeded;
				
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
					// Explicitly hide title when chart has data
					title: {
						show: false
					},
					tooltip: {
						trigger: 'axis',
						axisPointer: {
							type: props.type === 'line' ? 'cross' : 'shadow'
						},
						// Enhanced tooltip formatting with full label text
						formatter: (params) => {
							if (!params || !Array.isArray(params)) return '';
							// Get the full label (not truncated) - use original label from filteredLabels
							const labelIndex = params[0]?.dataIndex;
							const fullLabel = labelIndex !== undefined && filteredLabels[labelIndex] 
								? filteredLabels[labelIndex] 
								: (params[0]?.axisValue || '');
							let tooltipContent = `<div style="margin-bottom: 8px; font-weight: bold; border-bottom: 1px solid #eee; padding-bottom: 4px; max-width: 400px; word-wrap: break-word;">${fullLabel}</div>`;
							params.forEach((param) => {
								const value = typeof param.value === 'number' 
									? param.value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
									: param.value;
								const color = param.color || '#333';
								tooltipContent += `<div style="margin: 4px 0; display: flex; align-items: center;">
									<span style="display: inline-block; width: 10px; height: 10px; background-color: ${color}; margin-right: 8px; border-radius: 2px;"></span>
									<span style="margin-right: 12px; flex-shrink: 0;">${truncateLabel(param.seriesName, 30)}:</span>
									<span style="font-weight: bold;">${value}</span>
								</div>`;
							});
							return tooltipContent;
						},
						backgroundColor: 'rgba(255, 255, 255, 0.95)',
						borderColor: '#ccc',
						borderWidth: 1,
						padding: [8, 12],
						textStyle: {
							color: '#333',
							fontSize: 12
						},
						extraCssText: 'box-shadow: 0 2px 8px rgba(0,0,0,0.15); border-radius: 4px;'
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
							fontSize: 12,
							color: '#333'
						},
						type: 'scroll', // Enable scrolling for long legends
						// Better legend formatting - truncate long names
						formatter: (name) => {
							return truncateLabel(name, 25);
						},
						// Enhanced tooltip for legend to show full name
						tooltip: {
							show: true,
							formatter: (params) => {
								return params.name; // Show full name in tooltip
							}
						},
						// Allow clicking to show/hide series
						selectedMode: true,
						icon: 'rect'
					},
					grid: {
						left: '3%',
						right: '10%', // Increased right margin to accommodate vertical dataZoom slider (20px width + gap)
						top: `${gridTopPx}px`, // Fixed pixel position to maintain consistent gap
						// Grid bottom will be calculated to maintain fixed chart data area height
						// The grid area = canvasHeight - gridTop - gridBottom = fixedChartDataAreaHeight
						// So gridBottom = canvasHeight - gridTop - fixedChartDataAreaHeight
						// We'll calculate this dynamically, but for now use labelSpaceNeeded
						bottom: `${labelSpaceNeeded}px`, // Space for labels - will maintain fixed grid area
						containLabel: false // Don't contain labels to maintain fixed data area
					},
					dataZoom: [
						{
							type: 'slider',
							show: true,
							xAxisIndex: [0],
							// Show first 20 labels by default for better initial view
							start: 0,
							end: Math.min(100, filteredLabels.length > 20 ? (20 / filteredLabels.length) * 100 : 100),
							bottom: '5px', // Position dataZoom very close to labels
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
								color: '#333',
								fontSize: 11
							},
							borderColor: '#ccc',
							// Better visual styling
							fillerColor: 'rgba(122, 214, 255, 0.2)',
							dataBackground: {
								lineStyle: {
									color: '#7ad6ff',
									width: 1
								},
								areaStyle: {
									color: 'rgba(122, 214, 255, 0.1)'
								}
							},
							selectedDataBackground: {
								lineStyle: {
									color: '#7a94ff',
									width: 2
								},
								areaStyle: {
									color: 'rgba(122, 148, 255, 0.2)'
								}
							}
						},
						{
							type: 'inside',
							xAxisIndex: [0],
							start: 0,
							end: Math.min(100, filteredLabels.length > 20 ? (20 / filteredLabels.length) * 100 : 100),
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
							right: '2%', // Positioned outside grid area with gap from chart data
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
								color: '#333',
								fontSize: 11
							},
							borderColor: '#ccc',
							// Better visual styling for Y-axis zoom
							fillerColor: 'rgba(122, 214, 255, 0.2)',
							dataBackground: {
								lineStyle: {
									color: '#7ad6ff',
									width: 1
								},
								areaStyle: {
									color: 'rgba(122, 214, 255, 0.1)'
								}
							},
							selectedDataBackground: {
								lineStyle: {
									color: '#7a94ff',
									width: 2
								},
								areaStyle: {
									color: 'rgba(122, 148, 255, 0.2)'
								}
							}
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
							alignWithLabel: true,
							show: true
						},
						axisLabel: {
							// Better rotation based on label count and length
							rotate: filteredLabels.length > 5 ? 45 : (filteredLabels.length > 3 ? 30 : 0),
							interval: 0, // Show all labels
							// Truncate long labels for display using helper function
							formatter: (value) => {
								return formatLabelForDisplay(value);
							},
							// Better styling for labels - moved directly to axisLabel (ECharts 4.0+)
							fontSize: 11,
							color: '#666',
							// Add margin for rotated labels
							margin: filteredLabels.length > 5 ? 12 : 8
						},
						// Better axis line styling
						axisLine: {
							show: true,
							lineStyle: {
								color: '#ccc',
								width: 1
							}
						}
					},
					yAxis: {
						...yAxisConfig,
						// Better Y-axis formatting
						axisLabel: {
							formatter: (value) => {
								// Format large numbers with commas
								if (typeof value === 'number') {
									return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
								}
								return value;
							},
							// Styling moved directly to axisLabel (ECharts 4.0+)
							color: '#666',
							fontSize: 11
						},
						// Better axis line
						axisLine: {
							show: true,
							lineStyle: {
								color: '#ccc',
								width: 1
							}
						},
						// Better split line (grid lines)
						splitLine: {
							show: true,
							lineStyle: {
								color: '#e6e6e6',
								type: 'dashed',
								width: 1
							}
						}
					},
					series: series,
					// Add smooth animation for better UX
					animation: true,
					animationDuration: 750,
					animationEasing: 'cubicOut'
				};
			}
		});

		// Responsive chart container ref
		const chartContainer = ref(null);
		
		// Resize handler for responsive behavior
		const handleResize = () => {
			// Chart will auto-resize via autoresize prop
		};
		
		onMounted(() => {
			nextTick(() => {
				if (window.ResizeObserver && chartContainer.value) {
					const resizeObserver = new ResizeObserver(() => {
						handleResize();
					});
					resizeObserver.observe(chartContainer.value);
					
					// Store observer for cleanup
					chartContainer.value._resizeObserver = resizeObserver;
				} else {
					window.addEventListener('resize', handleResize);
				}
			});
		});
		
		onUnmounted(() => {
			if (chartContainer.value && chartContainer.value._resizeObserver) {
				chartContainer.value._resizeObserver.disconnect();
			}
			window.removeEventListener('resize', handleResize);
		});
		
		return () => {
			// Base chart data area height - minimum height for the chart visualization
			const baseChartDataAreaHeight = 500;
			
			// Calculate total container height to accommodate legend and controls
			// The canvas height will be dynamic based on label length
			const legendTopPx = 20; // Fixed top position for legend
			const legendGapPx = 20; // Fixed gap between legend and chart
			const baseGridTopPx = legendTopPx + 40 + legendGapPx; // Legend height (~40px) + gap
			
			// Base bottom space for normal labels
			let bottomSpaceForLabels = 80;
			
			// Calculate dynamic canvas height based on label length
			// Start with base height, will be adjusted based on actual label lengths
			let canvasHeight = baseChartDataAreaHeight + baseGridTopPx + bottomSpaceForLabels;
			
			// Use props.data directly - optimizations are already applied:
			// - Top-N is applied after pivot calculation
			// - LTTB runs in Web Worker if useWorkerOptimization is true
			if (props.data && props.data.datasets && props.data.labels) {
				const { labels, datasets } = props.data;
				
				if (props.type === 'pie') {
					// For pie charts with vertical legend, calculate based on legend items
					let pieData = [];
					labels.forEach((label, labelIndex) => {
						// Allow "(null)" as a valid label (display format for null values)
						// Filter out only actual null, empty strings, and the literal "null" string
						if (label == null || label === "null" || label === "") {
							return;
						}
						datasets.forEach((dataset) => {
							// Allow "(null)" as a valid dataset name (display format for null values)
							// Filter out only actual null, empty strings, and the literal "null" string
							if (dataset.name == null || dataset.name === "null" || dataset.name === "") {
								return;
							}
							const value = dataset.values[labelIndex];
							// Include all values, converting null/undefined/empty to 0
							const numValue = (value !== null && value !== undefined && value !== "") 
								? (typeof value === 'number' ? value : (parseFloat(value) || 0))
								: 0;
							pieData.push({
								name: `${label} - ${dataset.name}`,
								value: numValue
							});
						});
					});
					// Top-N is already applied after pivot calculation, so pieData is already filtered
					// For pie charts, we don't need bottom space for labels (no X-axis)
					// Calculate legend height based on item count
					const legendItemCount = pieData.length;
					// Each legend item takes ~20px (item height + gap), with padding
					const legendHeight = Math.min(legendItemCount * 20 + 40, baseChartDataAreaHeight * 0.8);
					// Pie charts don't need extra bottom space - just legend at top and pie in center
					canvasHeight = baseChartDataAreaHeight + legendTopPx + legendHeight + legendGapPx + 40; // 40px bottom padding
				} else if (props.type === 'bar' || props.type === 'line') {
					// For bar/line charts with horizontal legend
					// Legend height is fixed at ~40px (single row) or more if multiple rows
					// Allow "(null)" as a valid dataset name (display format for null values)
					// Filter out only actual null, empty strings, and the literal "null" string
					const filteredDatasets = datasets.filter(dataset => 
						dataset && 
						dataset.name !== null && 
						dataset.name !== "null" && 
						dataset.name !== ""
					);
					
					// Account for rotated x-axis labels if there are many labels
					// Allow "(null)" as a valid label (display format for null values)
					// Filter out only actual null, empty strings, and the literal "null" string
					const filteredLabels = labels.filter(label => 
						label !== null && label !== "null" && label !== ""
					);
					
					// Calculate space needed for labels (this is for canvas height, NOT grid bottom)
					// The grid bottom stays fixed to keep chart data area (section 1) constant
					// Canvas height increases to accommodate longer labels below the grid
					const isRotated = filteredLabels.length > 10;
					let maxLabelLength = 0;
					if (filteredLabels.length > 0) {
						maxLabelLength = Math.max(...filteredLabels.map(label => String(label).length));
					}
					
					// Calculate extra space needed for labels below the fixed grid bottom
					// This space is added to canvas height but doesn't affect the grid (chart data area)
					// Calculate space needed for labels with FIXED gap to dataZoom
					// The gap between labels and dataZoom must remain constant
					const dataZoomHeight = 20; // Height of dataZoom slider
					const fixedGap = 5; // Fixed gap between labels and dataZoom (always constant)
					const bottomMargin = 10; // Fixed bottom margin
					const fixedGapTotal = fixedGap + dataZoomHeight + bottomMargin; // Always 35px total
					
					// Calculate label height needed (can vary, but cap at reasonable maximum)
					let labelHeight = 30; // Base label height
					if (isRotated) {
						// For rotated labels, calculate space but cap at maximum
						// Cap at 120px to prevent excessive space
						labelHeight = Math.min(120, Math.max(40, maxLabelLength * 5));
					} else {
						if (maxLabelLength > 50) {
							// Very long labels might wrap, but cap at reasonable maximum
							labelHeight = Math.min(100, Math.ceil(maxLabelLength / 10) * 15);
						} else {
							labelHeight = 30; // Base label height
						}
					}
					
					// Total space = label height (variable, capped) + fixed gap (always constant)
					const labelSpaceNeeded = labelHeight + fixedGapTotal;
					
					// Calculate legend height
					let legendHeight = 40; // Base legend height
					if (filteredDatasets.length > 1) {
						// Estimate legend rows (assuming ~5 items per row, each row ~20px)
						const estimatedLegendRows = Math.ceil(filteredDatasets.length / 5);
						legendHeight = estimatedLegendRows * 20 + 40; // Each row ~20px + padding
					}
					
					// Calculate canvas height: legend + gap + fixed chart data area + label space (includes dataZoom)
					// The fixed chart data area height (section 1) stays constant
					// Canvas height increases only to accommodate longer labels below the grid
					// labelSpaceNeeded already includes labels + gap + dataZoom + margin
					const barLineGridTopPx = legendTopPx + legendHeight + legendGapPx;
					canvasHeight = baseChartDataAreaHeight + barLineGridTopPx + labelSpaceNeeded;
				}
			}
			
			// Ensure minimum canvas height
			canvasHeight = Math.max(canvasHeight, 600); // At least 600px total
			
			// Calculate grid bottom to maintain fixed chart data area height
			// Grid area = canvasHeight - gridTop - gridBottom = fixedChartDataAreaHeight
			// So: gridBottom = canvasHeight - gridTop - fixedChartDataAreaHeight
			// Update the chart option with the correct grid bottom
			const finalChartOption = { ...chartOption.value };
			if (finalChartOption.grid && (props.type === 'bar' || props.type === 'line')) {
				// Get grid top from the option
				const gridTopValue = finalChartOption.grid.top;
				const gridTopNum = typeof gridTopValue === 'string' ? parseFloat(gridTopValue) : (gridTopValue || 80);
				// Calculate grid bottom to maintain fixed chart data area height (500px)
				const calculatedGridBottom = canvasHeight - gridTopNum - baseChartDataAreaHeight;
				// Ensure minimum grid bottom but keep it tight to minimize space between labels and dataZoom
				finalChartOption.grid.bottom = `${Math.max(45, calculatedGridBottom)}px`;
			}
			
			return h('div', {
				ref: chartContainer,
				style: {
					width: '100%',
					height: `${canvasHeight}px`,
					minHeight: '600px',
					position: 'relative',
					overflow: 'hidden'
				}
			}, [
				h(VChart, {
					option: finalChartOption,
					autoresize: true, // Enable automatic resizing for responsive behavior
					style: {
						width: '100%',
						height: '100%',
						minHeight: '600px'
					}
				})
			]);
		};
	}
});


