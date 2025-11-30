<script>
import { ref, computed, h, nextTick, watch } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';

export default {
	name: 'VirtualizedTable',
	props: {
		headerRows: {
			type: Array,
			required: true,
		},
		bodyRows: {
			type: Array,
			required: true,
		},
		rowHeight: {
			type: Number,
			default: 35,
		},
		maxHeight: {
			type: Number,
			default: 600,
		},
	},
	setup(props) {
		const parentRef = ref(null);
		const ROW_HEIGHT = props.rowHeight;
		const MAX_HEIGHT = props.maxHeight;
		const forceUpdate = ref(0);
		const borderRedrawKey = ref(0);

		// Create virtualizer for scroll tracking
		const rowVirtualizer = useVirtualizer({
			count: computed(() => props.bodyRows.length),
			getScrollElement: () => parentRef.value,
			estimateSize: () => ROW_HEIGHT,
			overscan: 10,
		});

		// Function to force border redraw
		const forceBorderRedraw = () => {
			borderRedrawKey.value++;
			if (parentRef.value) {
				const table = parentRef.value.querySelector('table.pvtTable');
				if (table) {
					const thead = table.querySelector('thead');
					if (thead) {
						// Force repaint by toggling opacity slightly
						requestAnimationFrame(() => {
							thead.style.opacity = '0.999';
							requestAnimationFrame(() => {
								thead.style.opacity = '1';
							});
						});
					}
				}
			}
		};

		// Watch for scroll changes to update row visibility
		watch(
			() => rowVirtualizer.value.getVirtualItems(),
			() => {
				// Force re-render when visible items change
				forceUpdate.value++;
			},
			{ deep: true, flush: 'post' }
		);

		// Also watch for scroll events on the container
		watch(
			parentRef,
			(newEl) => {
				if (newEl) {
					const handleScroll = () => {
						forceUpdate.value++;
						// Force border redraw on every scroll
						forceBorderRedraw();
					};
					newEl.addEventListener('scroll', handleScroll, { passive: true });
					return () => {
						newEl.removeEventListener('scroll', handleScroll);
					};
				}
			},
			{ immediate: true }
		);

		return () => {
			// Reference forceUpdate and borderRedrawKey to trigger reactivity
			const _ = forceUpdate.value;
			const __ = borderRedrawKey.value;
			
			const currentHeaderRows = Array.isArray(props.headerRows) ? props.headerRows : [];
			const currentBodyRows = Array.isArray(props.bodyRows) ? props.bodyRows : [];

			// For small datasets, return table directly (exactly like normal renderer)
			if (currentBodyRows.length <= 100) {
				return h(
					"table",
					{
						class: ["pvtTable"],
					},
					[
						h("thead", currentHeaderRows),
						h("tbody", null, currentBodyRows.map((row, index) => {
							if (!row) return null;
							return h('tr', {
								...row.props,
								key: row.props?.key || row.key || `row-${index}`,
							}, row.children);
						}).filter(Boolean))
					]
				);
			}

			// For large datasets, use virtualization to determine visible rows
			// Get visible virtual items to determine which rows should be shown
			let visibleRange = { start: 0, end: currentBodyRows.length };
			try {
				const virtualItems = rowVirtualizer.value.getVirtualItems();
				if (virtualItems && virtualItems.length > 0) {
					visibleRange = {
						start: virtualItems[0].index,
						end: virtualItems[virtualItems.length - 1].index + 1,
					};
				}
			} catch (e) {
				// If virtualizer not ready, show all rows
			}

			// Render EXACTLY like the normal table renderer
			// Normal renderer: h("table", { class: ["pvtTable"] }, [h("thead", headerRows), h("tbody", null, bodyRows)])
			const tableElement = h(
				"table",
				{
					class: ["pvtTable"],
					key: `table-${borderRedrawKey.value}`,
				},
				[
					h("thead", {
						key: `thead-${borderRedrawKey.value}`,
						style: {
							display: 'table-header-group',
						},
					}, currentHeaderRows),
					h("tbody", null, currentBodyRows.map((row, index) => {
						if (!row) return null;
						
						// Determine if row is visible (within visible range)
						// Rows outside the visible range are hidden under the header or below viewport
						const isVisible = index >= visibleRange.start && index < visibleRange.end;
						
						return h('tr', {
							...row.props,
							key: row.props?.key || row.key || `row-${index}`,
							style: {
								...(row.props?.style || {}),
								display: isVisible ? '' : 'none',
							},
							ref: (el) => {
								if (el) {
									el.setAttribute('data-index', String(index));
									nextTick(() => {
										try {
											rowVirtualizer.value.measureElement(el);
										} catch (e) {
											// Ignore measurement errors
										}
									});
								}
							},
						}, row.children);
					}).filter(Boolean))
				]
			);

			// For large datasets, wrap in scrollable container
			// This preserves the exact table structure while allowing scrolling
			return h('div', {
				ref: parentRef,
				class: 'pvtVirtualizedContainer',
				style: {
					height: `${MAX_HEIGHT}px`,
					overflow: 'auto',
					position: 'relative',
				},
			}, [tableElement]);
		};
	},
};
</script>

<style>
/* Container */
.pvtVirtualizedContainer {
	position: relative;
	overflow: auto;
	-webkit-overflow-scrolling: touch;
	/* Prevent any transform that could cause header movement */
	-webkit-transform: none !important;
	transform: none !important;
	/* Ensure header is not clipped */
	overflow-x: auto;
	overflow-y: auto;
	/* Prevent header from being clipped by container */
	contain: none !important;
	/* Lock container position */
	left: 0 !important;
	right: 0 !important;
	width: 100% !important;
}

/* Ensure table maintains border-collapse like original */
.pvtVirtualizedContainer table.pvtTable {
	border-collapse: separate !important;
	border-spacing: 0 !important;
	background-color: #ebf0f8 !important;
	/* Ensure table doesn't clip header borders */
	overflow: visible !important;
	position: relative !important;
	/* Prevent any transform that could cause header movement */
	-webkit-transform: none !important;
	transform: none !important;
	/* Lock table position */
	left: 0 !important;
	right: 0 !important;
	width: 100% !important;
}

/* Sticky header - ensure borders are always visible during scroll */
.pvtVirtualizedContainer table.pvtTable thead {
	position: sticky !important;
	top: 0 !important;
	z-index: 9999 !important;
	background-color: #ebf0f8 !important;
	/* Prevent any movement or transform during scroll */
	-webkit-transform: none !important;
	transform: none !important;
	/* Ensure thead doesn't get clipped */
	margin: 0 !important;
	padding: 0 !important;
	/* Prevent any transform that could cause movement */
	will-change: auto !important;
	/* Create isolated rendering context */
	isolation: isolate !important;
	contain: layout style paint !important;
	/* Ensure header is always on top layer */
	backface-visibility: visible !important;
	-webkit-backface-visibility: visible !important;
	/* Prevent any clipping */
	overflow: visible !important;
	clip: none !important;
	clip-path: none !important;
	/* Ensure borders are always rendered */
	display: table-header-group !important;
	/* Prevent any perspective that could cause movement */
	-webkit-perspective: none !important;
	perspective: none !important;
	/* Lock position to prevent movement */
	left: 0 !important;
	right: 0 !important;
	width: 100% !important;
}

/* Header rows - ensure borders are preserved */
.pvtVirtualizedContainer table.pvtTable thead tr {
	margin: 0 !important;
	padding: 0 !important;
	/* Prevent border gaps */
	border-spacing: 0 !important;
	display: table-row !important;
	/* Ensure row doesn't get clipped */
	position: relative !important;
	/* Prevent any transform that could cause movement */
	-webkit-transform: none !important;
	transform: none !important;
	backface-visibility: visible !important;
	-webkit-backface-visibility: visible !important;
	/* Lock row position */
	left: 0 !important;
	right: 0 !important;
	width: 100% !important;
}

/* Header cells - borders and styling */
.pvtVirtualizedContainer table.pvtTable thead tr th,
.pvtVirtualizedContainer table.pvtTable thead tr th.pvtAxisLabel,
.pvtVirtualizedContainer table.pvtTable thead tr th.pvtColLabel {
	/* Border styling */
	border: 1px solid #c8d4e3 !important;
	border-image: none !important;
	-webkit-border-image: none !important;
	
	/* Cell styling */
	background-color: #ebf0f8 !important;
	background-clip: padding-box !important;
	padding: 5px !important;
	font-size: 8pt !important;
	box-sizing: border-box !important;
	margin: 0 !important;
	/* Remove all spacing between cells */
	margin-left: 0 !important;
	margin-right: 0 !important;
	/* Ensure cells are flush */
	vertical-align: top !important;
	
	/* Positioning and rendering */
	position: relative !important;
	z-index: 9998 !important;
	contain: layout style paint !important;
	isolation: isolate !important;
	
	/* Prevent movement and clipping */
	transform: none !important;
	-webkit-transform: none !important;
	backface-visibility: visible !important;
	-webkit-backface-visibility: visible !important;
	overflow: visible !important;
	clip: none !important;
	clip-path: none !important;
	will-change: auto !important;
	
	/* Font rendering */
	-webkit-font-smoothing: antialiased !important;
	-moz-osx-font-smoothing: grayscale !important;
}

/* Ensure no spacing between adjacent header cells */
.pvtVirtualizedContainer table.pvtTable thead tr th + th {
	margin-left: 0 !important;
	padding-left: 0 !important;
}

/* Totals labels - vertical and horizontal center alignment */
.pvtVirtualizedContainer table.pvtTable thead tr th.pvtTotalLabel,
.pvtVirtualizedContainer table.pvtTable thead tr th.pvtTotalGroupLabel {
	text-align: center !important;
	vertical-align: middle !important;
}

/* Body cells - borders and styling */
.pvtVirtualizedContainer table.pvtTable tbody tr td {
	border: 1px solid #c8d4e3 !important;
}
</style>
