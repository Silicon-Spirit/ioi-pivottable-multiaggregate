import { h, defineComponent, computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
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
		// Drill-down state: track navigation history for "Others" items
		const drillDownHistory = ref([]); // Array of {data, label} objects representing each level
		const currentChartData = ref(null); // Current chart data being displayed (only used for drill-down)
		
		// Watch for changes to props.data - always use props.data directly when not in drill-down
		watch(() => props.data, (newData) => {
			// Only update currentChartData if we're in drill-down mode
			// Otherwise, always use props.data directly in chartOption
			if (drillDownHistory.value.length > 0) {
				// In drill-down mode, don't reset
				return;
			}
			// Not in drill-down mode, clear currentChartData so we use props.data
			currentChartData.value = null;
		}, { immediate: true });
		
		// Function to drill down into "Others"
		const drillDownIntoOthers = (othersData) => {
			if (!othersData || !othersData.labels || othersData.labels.length === 0) return;
			
			// Save current state to history
			drillDownHistory.value.push({
				data: currentChartData.value,
				label: 'Others'
			});
			
			// Apply Top-N to the "Others" data if it's still large
			const topNThreshold = 20;
			let nextData = othersData;
			if (othersData.labels.length > topNThreshold) {
				// Import the function dynamically
				import('../utils/chartOptimization.js').then(module => {
					nextData = module.optimizeChartDataWithTopN(othersData, topNThreshold, 'sum', true);
					currentChartData.value = nextData;
				});
			} else {
				currentChartData.value = nextData;
			}
		};
		
		// Function to go back to previous level
		const goBack = () => {
			if (drillDownHistory.value.length > 0) {
				const previous = drillDownHistory.value.pop();
				currentChartData.value = previous.data;
			}
		};
		
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
			// Truncate labels longer than 25 characters for x-axis display
			if (label.length > 25) {
				return truncateLabel(label, 25);
			}
			return label;
		};
		
		const chartOption = computed(() => {
			// Always use props.data directly unless we're in drill-down mode
			// This ensures the chart always shows the latest data immediately
			const dataToUse = drillDownHistory.value.length > 0 ? (currentChartData.value || props.data) : props.data;
			
			// More lenient check - allow null values in labels/datasets
			// Only show "No data available" if there's truly no data structure
			if (!dataToUse || !dataToUse.labels || !dataToUse.datasets) {
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
			const { labels = [], datasets = [] } = dataToUse || {};
			
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
					// Store _othersChartData for drill-down if _othersData exists
					if (pieData._othersData && pieData._othersData.length > 0) {
						// Convert pie "Others" data to chart data format for drill-down
						const othersChartData = {
							labels: [...new Set(pieData._othersData.map(item => {
								const parts = item.name.split(' - ');
								return parts[0];
							}))],
							datasets: datasets.map(dataset => ({
								name: dataset.name,
								values: pieData._othersData
									.filter(item => item.name.includes(` - ${dataset.name}`))
									.map(item => item.value)
							})),
							_othersData: null // Will be set if this data also needs Top-N
						};
						pieData._othersChartData = othersChartData;
					}
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
						appendToBody: true, // Render tooltip in document body to escape container constraints
						confine: false, // Allow tooltip to be positioned outside chart area
						// Dynamic positioning to ensure all items are visible
						position: function (point, params, dom, rect, size) {
							const viewWidth = size.viewSize[0];
							const viewHeight = size.viewSize[1];
							const tooltipWidth = size.contentSize[0];
							const tooltipHeight = size.contentSize[1];
							
							let x = point[0] + 10;
							let y = point[1] + 10;
							
							if (x + tooltipWidth > viewWidth) {
								x = point[0] - tooltipWidth - 10;
							}
							if (y + tooltipHeight > viewHeight) {
								if (point[1] - tooltipHeight - 10 > 0) {
									y = point[1] - tooltipHeight - 10;
								} else {
									y = 10;
								}
							}
							if (y < 10) y = 10;
							if (x < 10) x = 10;
							
							return [x, y];
						},
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
						extraCssText: 'box-shadow: 0 2px 8px rgba(0,0,0,0.15); border-radius: 4px; z-index: 99999 !important;'
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
						// Add click handler for "Others" items
						onClick: (params) => {
							if (params && params.name && params.name.includes('Others')) {
								// Check if pieData has _othersChartData
								if (pieData._othersChartData) {
									drillDownIntoOthers(pieData._othersChartData);
								}
							}
						},
						itemStyle: {
							color: (params) => {
								return props.colors[params.dataIndex % props.colors.length];
							},
							borderColor: '#fff',
							borderWidth: 2
						},
						label: {
							show: false // Hide all labels - no text rendering on pie chart
						},
						labelLine: {
							show: false // Hide label lines since labels are hidden
						},
						// Ensure no text is rendered on pie slices
						avoidLabelOverlap: false,
						stillShowZeroSum: false,
						emphasis: {
							itemStyle: {
								shadowBlur: 15,
								shadowOffsetX: 0,
								shadowOffsetY: 0,
								shadowColor: 'rgba(0, 0, 0, 0.3)'
							},
							// Scale up on hover
							scale: true,
							scaleSize: 5,
							// Disable all text rendering even on hover/emphasis
							label: {
								show: false // Hide labels even on hover/emphasis
							},
							labelLine: {
								show: false // Hide label lines even on hover/emphasis
							}
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
						appendToBody: true, // Render tooltip in document body to escape container constraints
						confine: false, // Allow tooltip to be positioned outside chart area
						// Dynamic positioning to ensure all items are visible
						position: function (point, params, dom, rect, size) {
							const viewWidth = size.viewSize[0];
							const viewHeight = size.viewSize[1];
							const tooltipWidth = size.contentSize[0];
							const tooltipHeight = size.contentSize[1];
							
							let x = point[0] + 10;
							let y = point[1] + 10;
							
							if (x + tooltipWidth > viewWidth) {
								x = point[0] - tooltipWidth - 10;
							}
							if (y + tooltipHeight > viewHeight) {
								if (point[1] - tooltipHeight - 10 > 0) {
									y = point[1] - tooltipHeight - 10;
								} else {
									y = 10;
								}
							}
							if (y < 10) y = 10;
							if (x < 10) x = 10;
							
							return [x, y];
						},
						formatter: (params) => {
							const seg = percentageData[params.dataIndex];
							return `${seg.name}: ${seg.percentage.toFixed(1)}%`;
						},
						extraCssText: 'z-index: 99999 !important;'
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
					const validValues = values.filter(v => typeof v === 'number' && !isNaN(v) && isFinite(v));
					const maxValue = validValues.length > 0 ? Math.max(...validValues) : 0;
					
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
				
				// Fixed chart data area height - this MUST remain constant
				// This is the height of the actual chart visualization area (grid area)
				const fixedChartDataAreaHeight = 400;
				
				// Calculate space needed for labels below the grid
				// This will be used to calculate canvas height
				// The grid bottom will be calculated to maintain fixed chart data area height
				// FIXED gap between labels and dataZoom to maintain consistent UI
				const dataZoomHeight = 20; // Height of dataZoom slider
				const fixedGap = 15; // Increased gap between labels and dataZoom to prevent overlap
				const bottomMargin = 10; // Increased bottom margin for better spacing
				const fixedGapTotal = fixedGap + dataZoomHeight + bottomMargin; // Total: 45px
				
				// Calculate label height needed (can vary, but cap at reasonable maximum)
				let labelHeight = 35; // Base label height (slightly increased)
				if (isRotated) {
					// For rotated labels, calculate space more accurately
					// Rotated labels need ~6-8px per character
					labelHeight = Math.min(150, Math.max(50, maxLabelLength * 6.5));
				} else {
					if (maxLabelLength > 50) {
						// Very long labels might wrap, need more space
						labelHeight = Math.min(120, Math.ceil(maxLabelLength / 8) * 18);
					} else {
						labelHeight = 35; // Base label height
					}
				}
				
				// Section 1: Dynamic gap between chart grid bottom and x-axis labels
				// Minimum 200px, but increases when labels are long to prevent overlap with dataZoom
				// Section 1 must accommodate: labels + gap + dataZoom + margin + buffer
				// Formula: section1 = max(200, labelHeight + fixedGap + dataZoomHeight + bottomMargin + buffer)
				// This ensures labels never overlap with the dataZoom slider
				const minSection1Height = 200; // Increased minimum to ensure no overlap
				const requiredSpaceForLabels = labelHeight + fixedGap + dataZoomHeight + bottomMargin + 10; // Added 10px buffer
				const section1Height = Math.max(minSection1Height, requiredSpaceForLabels);
				
				// Total space = label height (variable, capped) + fixed gap (always constant)
				const labelSpaceNeeded = labelHeight + fixedGapTotal;
				
				// Grid bottom is set to section1Height to maintain proper spacing
				// The grid area itself remains at fixedChartDataAreaHeight (400px)
				const gridBottomPx = section1Height;
				
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

				// Check if "Others" is in the labels and ensure it's visible initially
				const othersIndex = filteredLabels.indexOf('Others');
				
				// Always show at least 20 items or 10% of data, whichever is larger
				// This ensures we see some chart data on initial render
				const minItemsToShow = 20;
				const minPercentToShow = 10; // Always show at least 10% of data
				
				let initialEnd;
				if (filteredLabels.length <= minItemsToShow) {
					// If we have 20 or fewer items, show all
					initialEnd = 100;
				} else {
					// Show at least minItemsToShow items, but ensure at least minPercentToShow% is visible
					const itemsPercent = (minItemsToShow / filteredLabels.length) * 100;
					initialEnd = Math.max(minPercentToShow, Math.min(100, itemsPercent));
				}
				
				// If "Others" exists and is beyond the initial view, adjust to include it
				if (othersIndex !== -1 && othersIndex >= minItemsToShow) {
					// Include "Others" by showing up to its position + a bit more for context
					const othersEndPercent = ((othersIndex + 1) / filteredLabels.length) * 100;
					initialEnd = Math.min(100, Math.max(initialEnd, othersEndPercent + 5)); // Add 5% buffer, but don't go below minimum
				}
				
				// Ensure we always show at least some data (minimum 5%)
				initialEnd = Math.max(5, Math.min(100, initialEnd));

				return {
					// Explicitly hide title when chart has data
					title: {
						show: false
					},
					tooltip: {
						trigger: 'axis',
						appendToBody: true, // Render tooltip in document body to escape container constraints
						confine: false, // Allow tooltip to be positioned outside chart area
						// Dynamic positioning to ensure all items are visible
						position: function (point, params, dom, rect, size) {
							// point: mouse position [x, y]
							// params: tooltip content params
							// dom: tooltip DOM element
							// rect: chart area rect
							// size: tooltip size {contentSize: [width, height], viewSize: [width, height]}
							
							const viewWidth = size.viewSize[0];
							const viewHeight = size.viewSize[1];
							const tooltipWidth = size.contentSize[0];
							const tooltipHeight = size.contentSize[1];
							
							// Default position (below and to the right of cursor)
							let x = point[0] + 10;
							let y = point[1] + 10;
							
							// Check if tooltip goes off right edge
							if (x + tooltipWidth > viewWidth) {
								x = point[0] - tooltipWidth - 10; // Position to the left of cursor
							}
							
							// Check if tooltip goes off bottom edge
							if (y + tooltipHeight > viewHeight) {
								// Try positioning above cursor
								if (point[1] - tooltipHeight - 10 > 0) {
									y = point[1] - tooltipHeight - 10;
								} else {
									// If not enough space above, position at top of viewport
									y = 10;
								}
							}
							
							// Check if tooltip goes off top edge
							if (y < 10) {
								y = 10; // Keep 10px margin from top
							}
							
							// Check if tooltip goes off left edge
							if (x < 10) {
								x = 10; // Keep 10px margin from left
							}
							
							return [x, y];
						},
						axisPointer: {
							type: props.type === 'line' ? 'cross' : 'shadow',
							// Show tooltip label with full text when hovering over axis
							label: {
								show: true,
								formatter: (params) => {
									// Get the full label (not truncated) from filteredLabels
									if (params && params.value !== undefined) {
										// Try to find the full label by matching the displayed (truncated) value
										const displayedValue = formatLabelForDisplay(params.value);
										const labelIndex = filteredLabels.findIndex(label => {
											const displayedLabel = formatLabelForDisplay(label);
											return displayedLabel === displayedValue || label === params.value;
										});
										if (labelIndex !== -1) {
											return filteredLabels[labelIndex];
										}
										// Fallback: try to find by dataIndex if available
										if (params.dataIndex !== undefined && filteredLabels[params.dataIndex]) {
											return filteredLabels[params.dataIndex];
										}
									}
									return params?.value || '';
								},
								backgroundColor: 'rgba(50, 50, 50, 0.9)',
								borderColor: '#333',
								borderWidth: 1,
								padding: [4, 8],
								// Moved textStyle properties directly to label (ECharts 4.0+)
								color: '#fff',
								fontSize: 12,
								extraCssText: 'z-index: 99999 !important;'
							}
						},
						// Enhanced tooltip formatting with full label text - using grid layout
						formatter: (params) => {
							if (!params || !Array.isArray(params)) return '';
							// Get the full label (not truncated) - use original label from filteredLabels
							const labelIndex = params[0]?.dataIndex;
							const fullLabel = labelIndex !== undefined && filteredLabels[labelIndex] 
								? filteredLabels[labelIndex] 
								: (params[0]?.axisValue || '');
							
							// Calculate grid columns dynamically to keep rows under 18
							const itemCount = params.length;
							const maxRows = 18; // Maximum number of rows to show all items at a glance (strictly less than 18)
							
							// Calculate optimal number of columns to keep rows < 18
							let columns;
							if (itemCount <= 4) {
								// For very few items, use 1 column per item
								columns = itemCount;
							} else if (itemCount <= 8) {
								// For small counts, use 4 columns max
								columns = 4;
							} else {
								// For larger counts, calculate columns to ensure rows < 18
								// We want: Math.ceil(itemCount / columns) < 18
								// Which means: itemCount / columns < 18
								// So: columns > itemCount / 18
								// Therefore: columns = Math.ceil(itemCount / (maxRows - 1)) to ensure rows < 18
								columns = Math.ceil(itemCount / (maxRows - 1));
								// Ensure minimum of 3 columns for readability, and maximum reasonable limit
								columns = Math.max(3, Math.min(columns, 15)); // Cap at 15 columns for very large datasets
							}
							
							// Calculate actual rows with this column count
							let actualRows = Math.ceil(itemCount / columns);
							
							// If rows still >= maxRows, increase columns further to ensure rows < 18
							while (actualRows >= maxRows && columns < 20) {
								columns++;
								actualRows = Math.ceil(itemCount / columns);
							}
							
							// Calculate max-width based on column count (more columns = wider tooltip)
							const maxWidth = Math.min(600 + (columns - 3) * 100, 1200); // Scale width with columns, max 1200px
							
							let tooltipContent = `<div style="margin-bottom: 8px; font-weight: bold; border-bottom: 1px solid #eee; padding-bottom: 4px; max-width: ${maxWidth}px; word-wrap: break-word; word-break: break-word; overflow-wrap: break-word;">${fullLabel}</div>`;
							tooltipContent += `<div style="display: grid; grid-template-columns: repeat(${columns}, 1fr); gap: 8px 12px; max-width: ${maxWidth}px;">`;
							
							params.forEach((param) => {
								const value = typeof param.value === 'number' 
									? param.value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
									: param.value;
								const color = param.color || '#333';
								tooltipContent += `<div style="display: flex; align-items: center; flex-wrap: nowrap; min-width: 0;">
									<span style="display: inline-block; width: 10px; height: 10px; background-color: ${color}; margin-right: 6px; border-radius: 2px; flex-shrink: 0;"></span>
									<span style="font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-right: 4px;">${truncateLabel(param.seriesName, 15)}:</span>
									<span style="font-weight: bold; flex-shrink: 0;">${value}</span>
								</div>`;
							});
							tooltipContent += '</div>';
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
						extraCssText: 'box-shadow: 0 2px 8px rgba(0,0,0,0.15); border-radius: 4px; max-width: 1200px; z-index: 99999 !important;'
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
						// Grid bottom is set to section1Height (dynamic, min 190px) to maintain gap between grid and labels
						// The grid area itself remains at fixedChartDataAreaHeight (400px)
						// Section 1 = gap between grid bottom and x-axis labels (adjusts based on label height to prevent overlap)
						bottom: `${section1Height}px`, // Dynamic gap (section 1) between grid and labels, prevents overlap with dataZoom
						containLabel: false // Don't contain labels to maintain fixed data area
					},
					dataZoom: [
						{
							type: 'slider',
							show: true,
							xAxisIndex: [0],
							// Show at least some data on initial render (ensured by initialEnd calculation)
							start: 0,
							end: Math.max(5, Math.min(100, initialEnd)), // Ensure at least 5% is visible
							bottom: '10px', // Position dataZoom with adequate gap from bottom
							height: 20,
							showDataShadow: false, // Disable data shadow to avoid label textStyle warnings
							handleIcon: 'path://M10.7,11.9v-1.3H9.3v1.3c-4.9,0.3-8.8,4.4-8.8,9.4c0,5,3.9,9.1,8.8,9.4v1.3h1.3v-1.3c4.9-0.3,8.8-4.4,8.8-9.4C19.5,16.3,15.6,12.2,10.7,11.9z M13.3,24.4H6.7V23.1h6.6V24.4z M13.3,19.6H6.7v-1.4h6.6V19.6z',
							handleSize: '80%',
							handleStyle: {
								color: '#fff',
								shadowBlur: 3,
								shadowColor: 'rgba(0, 0, 0, 0.6)',
								shadowOffsetX: 2,
								shadowOffsetY: 2
							},
							labelFormatter: '', // Disable label formatter to avoid textStyle warnings
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
							end: Math.max(5, Math.min(100, initialEnd)), // Ensure at least 5% is visible
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
							showDataShadow: false, // Disable data shadow to avoid label textStyle warnings
							handleIcon: 'path://M10.7,11.9v-1.3H9.3v1.3c-4.9,0.3-8.8,4.4-8.8,9.4c0,5,3.9,9.1,8.8,9.4v1.3h1.3v-1.3c4.9-0.3,8.8-4.4,8.8-9.4C19.5,16.3,15.6,12.2,10.7,11.9z M13.3,24.4H6.7V23.1h6.6V24.4z M13.3,19.6H6.7v-1.4h6.6V19.6z',
							handleSize: '80%',
							handleStyle: {
								color: '#fff',
								shadowBlur: 3,
								shadowColor: 'rgba(0, 0, 0, 0.6)',
								shadowOffsetX: 2,
								shadowOffsetY: 2
							},
							labelFormatter: '', // Disable label formatter to avoid textStyle warnings
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
					series: series.map(s => ({
						...s,
						// Add click handler for "Others" items
						onClick: (params) => {
							// Check if clicked item is "Others"
							if (params.name === 'Others' || filteredLabels[params.dataIndex] === 'Others') {
								// Get the _othersData from current chart data
								const dataToUse = currentChartData.value || props.data;
								if (dataToUse && dataToUse._othersData) {
									drillDownIntoOthers(dataToUse._othersData);
								}
							}
						}
					})),
					// Disable animation on initial render to ensure chart is visible immediately
					animation: false, // Set to false for immediate rendering
					animationDuration: 0, // No animation delay
					animationEasing: 'linear'
				};
			}
		});

		// Responsive chart container ref
		const chartContainer = ref(null);
		// Track if user has hovered over chart to hide the hint message
		const hasHoveredChart = ref(false);
		// Responsive hint message position and styling
		const hintMessageLeft = ref(274);
		const hintMessageTop = ref(-45); // Default top position
		const hintFontSize = ref('15px');
		const hintMaxWidth = ref('calc(100% - 294px)');
		const hintWhiteSpace = ref('nowrap'); // Allow wrapping on small screens
		
		// Resize handler for responsive behavior
		const handleResize = () => {
			// Chart will auto-resize via autoresize prop
			// Update hint message position responsively
			if (window.innerWidth < 768) {
				// Small screens: position below legend area, well above chart canvas to avoid overlap
				// Legend is at top: 20px, legend height ~40px, gap ~20px = ~80px from top
				// Position text below legend area, well above chart canvas
				hintMessageLeft.value = 20;
				hintMessageTop.value = 85; // Position below legend area, well above chart canvas
				hintFontSize.value = '13px';
				hintMaxWidth.value = 'calc(100% - 40px)';
				hintWhiteSpace.value = 'normal'; // Allow wrapping into two lines
			} else if (window.innerWidth < 1024) {
				// Medium screens: position to avoid overlap, allow wrapping if needed
				hintMessageLeft.value = 250;
				hintMessageTop.value = -45; // Keep original top position
				hintFontSize.value = '14px';
				hintMaxWidth.value = 'calc(100% - 270px)';
				hintWhiteSpace.value = 'normal'; // Allow wrapping into two lines
			} else {
				// Large screens: original position, single line
				hintMessageLeft.value = 274;
				hintMessageTop.value = -45; // Original top position
				hintFontSize.value = '15px';
				hintMaxWidth.value = 'calc(100% - 294px)';
				hintWhiteSpace.value = 'nowrap'; // Single line on large screens
			}
		};
		
		// Hide hint message when user hovers over chart
		const handleChartMouseEnter = () => {
			hasHoveredChart.value = true;
		};
		
		onMounted(() => {
			// Initialize responsive hint message position
			handleResize();
			// Add resize listener for responsive behavior
			window.addEventListener('resize', handleResize);
			
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
				
				// Ensure tooltips appear above all elements by setting max z-index
				// Also ensure tooltips are positioned to show all items within viewport
				const ensureTooltipZIndex = () => {
					if (!chartContainer.value) return;
					
					// Find tooltip elements in document body (appendToBody tooltips)
					const tooltipsInBody = document.body.querySelectorAll('div[style*="position"]');
					
					tooltipsInBody.forEach((tooltip) => {
						const style = window.getComputedStyle(tooltip);
						// Check if it looks like a tooltip (positioned element with content)
						if ((style.position === 'absolute' || style.position === 'fixed') && 
						    tooltip.textContent && tooltip.textContent.trim()) {
							// Set maximum z-index
							if (parseInt(style.zIndex || '0') < 99999) {
								tooltip.style.zIndex = '99999';
							}
							
							// Ensure tooltip is positioned to show all items within viewport
							if (!tooltip._positionAdjusted) {
								tooltip._positionAdjusted = true;
								
								// Use requestAnimationFrame to ensure DOM is ready
								requestAnimationFrame(() => {
									const rect = tooltip.getBoundingClientRect();
									const viewportWidth = window.innerWidth;
									const viewportHeight = window.innerHeight;
									
									let newTop = parseFloat(style.top) || rect.top;
									let newLeft = parseFloat(style.left) || rect.left;
									let needsAdjustment = false;
									
									// Check if tooltip goes off bottom edge
									if (rect.bottom > viewportHeight - 10) {
										// Try to position above the mouse/cursor area
										// If tooltip height is less than available space above, position it above
										if (rect.top - rect.height - 10 > 10) {
											newTop = rect.top - rect.height - 20;
										} else {
											// Position at top of viewport with margin
											newTop = 10;
										}
										needsAdjustment = true;
									}
									
									// Check if tooltip goes off top edge
									if (rect.top < 10) {
										newTop = 10;
										needsAdjustment = true;
									}
									
									// Check if tooltip goes off right edge
									if (rect.right > viewportWidth - 10) {
										newLeft = viewportWidth - rect.width - 10;
										needsAdjustment = true;
									}
									
									// Check if tooltip goes off left edge
									if (rect.left < 10) {
										newLeft = 10;
										needsAdjustment = true;
									}
									
									// Apply adjustments
									if (needsAdjustment) {
										if (style.position === 'fixed') {
											tooltip.style.top = `${newTop}px`;
											tooltip.style.left = `${newLeft}px`;
										} else if (style.position === 'absolute') {
											const scrollX = window.scrollX || window.pageXOffset;
											const scrollY = window.scrollY || window.pageYOffset;
											tooltip.style.top = `${newTop + scrollY}px`;
											tooltip.style.left = `${newLeft + scrollX}px`;
										}
									}
								});
							}
						}
					});
				};
				
				// Use MutationObserver to watch for tooltip creation in document body
				const tooltipObserver = new MutationObserver(() => {
					ensureTooltipZIndex();
				});
				
				// Observe document body for appendToBody tooltips
				if (chartContainer.value) {
					tooltipObserver.observe(document.body, {
						childList: true,
						subtree: true,
						attributes: true,
						attributeFilter: ['style', 'class']
					});
					
					// Also check periodically as fallback
					const tooltipCheckInterval = setInterval(ensureTooltipZIndex, 100);
					
					// Store for cleanup
					chartContainer.value._tooltipObserver = tooltipObserver;
					chartContainer.value._tooltipCheckInterval = tooltipCheckInterval;
				}
			});
		});
		
		onUnmounted(() => {
			if (chartContainer.value) {
				if (chartContainer.value._resizeObserver) {
					chartContainer.value._resizeObserver.disconnect();
				}
				if (chartContainer.value._tooltipObserver) {
					chartContainer.value._tooltipObserver.disconnect();
				}
				if (chartContainer.value._tooltipCheckInterval) {
					clearInterval(chartContainer.value._tooltipCheckInterval);
				}
			}
			window.removeEventListener('resize', handleResize);
		});
		
		return () => {
			// Base chart data area height - minimum height for the chart visualization
			const baseChartDataAreaHeight = 400;
			
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
			
			// Always use props.data directly unless we're in drill-down mode
			const dataToUse = drillDownHistory.value.length > 0 ? (currentChartData.value || props.data) : props.data;
			
			// Use dataToUse - optimizations are already applied:
			// - Top-N is applied after pivot calculation
			// - LTTB runs in Web Worker if useWorkerOptimization is true
			if (dataToUse && dataToUse.datasets && dataToUse.labels) {
				const { labels, datasets } = dataToUse;
				
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
					const fixedGap = 15; // Increased gap between labels and dataZoom to prevent overlap
					const bottomMargin = 10; // Increased bottom margin for better spacing
					const fixedGapTotal = fixedGap + dataZoomHeight + bottomMargin; // Total: 45px
					
					// Calculate label height needed (can vary, but cap at reasonable maximum)
					let labelHeight = 35; // Base label height (slightly increased)
					if (isRotated) {
						// For rotated labels, calculate space more accurately
						// Rotated labels need ~6-8px per character
						labelHeight = Math.min(150, Math.max(50, maxLabelLength * 6.5));
					} else {
						if (maxLabelLength > 50) {
							// Very long labels might wrap, need more space
							labelHeight = Math.min(120, Math.ceil(maxLabelLength / 8) * 18);
						} else {
							labelHeight = 35; // Base label height
						}
					}
					
					// Total space = label height (variable, capped) + fixed gap (always constant)
					const labelSpaceNeeded = labelHeight + fixedGapTotal;
					
					// Section 1: Dynamic gap between chart grid bottom and x-axis labels
					// Minimum 200px, but increases when labels are long to prevent overlap with dataZoom
					// Section 1 must accommodate: labels + gap + dataZoom + margin + buffer
					// Formula: section1 = max(200, labelHeight + fixedGap + dataZoomHeight + bottomMargin + buffer)
					// This ensures labels never overlap with the dataZoom slider
					const minSection1Height = 200; // Increased minimum to ensure no overlap
					const requiredSpaceForLabels = labelHeight + fixedGap + dataZoomHeight + bottomMargin + 10; // Added 10px buffer
					const section1Height = Math.max(minSection1Height, requiredSpaceForLabels);
					
					// Calculate legend height
					let legendHeight = 40; // Base legend height
					if (filteredDatasets.length > 1) {
						// Estimate legend rows (assuming ~5 items per row, each row ~20px)
						const estimatedLegendRows = Math.ceil(filteredDatasets.length / 5);
						legendHeight = estimatedLegendRows * 20 + 40; // Each row ~20px + padding
					}
					
					// Calculate canvas height to maintain:
					// - Grid area (chart visualization) = baseChartDataAreaHeight (400px)
					// - Section 1 (gap between grid and labels) = section1Height (dynamic, min 190px)
					// - Labels are positioned within section 1, with dataZoom below
					// Canvas height = gridTop + gridArea + section1 (which includes space for labels + gap + dataZoom + margin)
					const barLineGridTopPx = legendTopPx + legendHeight + legendGapPx;
					// Section 1 already includes space for labels + gap + dataZoom + margin
					// So canvas height = gridTop + gridArea + section1
					canvasHeight = barLineGridTopPx + baseChartDataAreaHeight + section1Height;
				}
			}
			
			// Ensure canvas height is within bounds: minimum 600px, maximum 800px
			canvasHeight = Math.max(600, Math.min(canvasHeight, 800)); // Between 600px and 800px
			
			// Calculate grid bottom to maintain fixed chart data area height
			// Grid area = canvasHeight - gridTop - gridBottom = fixedChartDataAreaHeight
			// So: gridBottom = canvasHeight - gridTop - fixedChartDataAreaHeight
			// Update the chart option with the correct grid bottom
			const finalChartOption = { ...chartOption.value };
			if (finalChartOption.grid && (props.type === 'bar' || props.type === 'line')) {
				// Get grid top from the option
				const gridTopValue = finalChartOption.grid.top;
				const gridTopNum = typeof gridTopValue === 'string' ? parseFloat(gridTopValue) : (gridTopValue || 80);
				// Section 1: Dynamic gap between chart grid bottom and x-axis labels
				// We need to recalculate section1Height based on the actual label height from the chart option
				// Get label height from the chart configuration if available
				const xAxisConfig = finalChartOption.xAxis;
				const isRotated = xAxisConfig && xAxisConfig.axisLabel && xAxisConfig.axisLabel.rotate;
				// Estimate label height based on rotation and label count
				const filteredLabels = xAxisConfig && xAxisConfig.data ? xAxisConfig.data : [];
				let estimatedLabelHeight = 30;
				if (isRotated) {
					// For rotated labels, calculate based on max label length
					// Rotated labels need more vertical space
					const maxLabelLength = filteredLabels.length > 0 ? Math.max(...filteredLabels.map(l => String(l).length)) : 0;
					// More accurate calculation: rotated labels need ~6-8px per character
					estimatedLabelHeight = Math.min(150, Math.max(50, maxLabelLength * 6.5));
				} else if (filteredLabels.length > 0) {
					const maxLabelLength = Math.max(...filteredLabels.map(l => String(l).length));
					if (maxLabelLength > 50) {
						// Long labels might wrap, need more space
						estimatedLabelHeight = Math.min(120, Math.ceil(maxLabelLength / 8) * 18);
					} else {
						estimatedLabelHeight = 35; // Slightly more for non-rotated labels
					}
				}
				// Calculate section1Height dynamically to prevent overlap
				const dataZoomHeight = 20;
				const fixedGap = 15; // Increased gap between labels and dataZoom to prevent overlap
				const bottomMargin = 10; // Increased bottom margin for better spacing
				const minSection1Height = 200; // Increased minimum to ensure no overlap
				// Ensure we have enough space: label height + gap + dataZoom + margin + extra buffer
				const requiredSpaceForLabels = estimatedLabelHeight + fixedGap + dataZoomHeight + bottomMargin + 10; // Added 10px buffer
				const section1Height = Math.max(minSection1Height, requiredSpaceForLabels);
				// This maintains the gap between the grid and labels, preventing overlap with dataZoom
				// The grid area itself remains at baseChartDataAreaHeight (400px)
				finalChartOption.grid.bottom = `${section1Height}px`;
			}
			
			// Add back button if in drill-down mode
			const chartElements = [];
			
			// Removed hover hint message as requested
			
			if (drillDownHistory.value.length > 0) {
				chartElements.push(
					h('button', {
						onClick: goBack,
						style: {
							position: 'absolute',
							top: '10px',
							left: '10px',
							zIndex: 100000,
							padding: '8px 16px',
							backgroundColor: '#1976d2',
							color: '#fff',
							border: 'none',
							borderRadius: '4px',
							cursor: 'pointer',
							fontSize: '13px',
							fontWeight: '500',
							boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
							display: 'flex',
							alignItems: 'center',
							gap: '6px'
						}
					}, [
						h('span', { style: { fontSize: '16px' } }, '←'),
						h('span', {}, 'Back')
					])
				);
			}
			
			// Create a key based on data to force re-render when data changes
			const dataKey = dataToUse ? 
				`${dataToUse.labels?.length || 0}-${dataToUse.datasets?.length || 0}-${JSON.stringify(dataToUse.labels?.slice(0, 3) || [])}` : 
				'no-data';
			
			chartElements.push(
				h(VChart, {
					key: `chart-${props.type}-${dataToUse?.labels?.length || 0}-${dataToUse?.datasets?.length || 0}`, // Force re-render when data changes
					option: finalChartOption,
					autoresize: true,
					notMerge: true, // Force full re-render - don't merge options
					lazyUpdate: false, // Update immediately
					onEvents: {
						mouseenter: handleChartMouseEnter,
						click: (params) => {
							// Handle click on chart elements, specifically "Others"
							if (params) {
								// For bar/line charts - check if name is "Others"
								if (params.name === 'Others' || (params.seriesName && params.seriesName.includes('Others'))) {
									const dataToUse = currentChartData.value || props.data;
									if (dataToUse && dataToUse._othersData) {
										drillDownIntoOthers(dataToUse._othersData);
									}
								}
								// For pie charts - check if clicked item name contains "Others"
								if (params.name && params.name.includes('Others')) {
									// For pie charts, the _othersData is stored on the pieData array
									// We need to access it from the chart option or store it separately
									// The pie chart click is primarily handled in series onClick above
								}
							}
						}
					},
					style: {
						width: '100%',
						height: '100%',
						minHeight: '600px'
					}
				})
			);
			
			return h('div', {
				ref: chartContainer,
				style: {
					width: '100%',
					height: `${canvasHeight}px`,
					minHeight: '600px',
					position: 'relative',
					overflow: 'visible' // Changed from 'hidden' to allow tooltips to escape container
				},
				onMouseEnter: handleChartMouseEnter
			}, chartElements);
		};
	}
});


