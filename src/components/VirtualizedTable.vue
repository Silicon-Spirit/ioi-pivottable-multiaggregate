<script>
import { ref, computed, h, nextTick } from 'vue';
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

		// Create virtualizer for scroll tracking
		const rowVirtualizer = useVirtualizer({
			count: computed(() => props.bodyRows.length),
			getScrollElement: () => parentRef.value,
			estimateSize: () => ROW_HEIGHT,
			overscan: 10,
		});

		return () => {
			const currentHeaderRows = Array.isArray(props.headerRows) ? props.headerRows : [];
			const currentBodyRows = Array.isArray(props.bodyRows) ? props.bodyRows : [];

			// Render EXACTLY like the normal table renderer
			// Normal renderer: h("table", { class: ["pvtTable"] }, [h("thead", headerRows), h("tbody", null, bodyRows)])
			const tableElement = h(
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

			// For small datasets, return table directly (exactly like normal renderer)
			if (currentBodyRows.length <= 100) {
				return tableElement;
			}

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
	/* Prevent border clipping */
	-webkit-transform: translateZ(0);
	transform: translateZ(0);
}

/* Ensure table maintains border-collapse like original */
.pvtVirtualizedContainer table.pvtTable {
	border-collapse: collapse !important;
	border-spacing: 0 !important;
}

/* Sticky header - ensure borders are always visible during scroll */
.pvtVirtualizedContainer table.pvtTable thead {
	position: sticky;
	top: 0;
	z-index: 1000;
	background-color: #fff;
	/* Prevent border clipping during scroll */
	-webkit-transform: translateZ(0);
	transform: translateZ(0);
	/* Ensure thead doesn't get clipped */
	margin: 0;
	padding: 0;
	/* Force repaint to prevent border disappearing */
	will-change: transform;
}

/* Header rows - ensure borders are preserved */
.pvtVirtualizedContainer table.pvtTable thead tr {
	margin: 0;
	padding: 0;
	/* Prevent border gaps */
	border-spacing: 0;
	display: table-row;
}

/* Header cells - force borders to be visible with maximum specificity and prevent clipping */
.pvtVirtualizedContainer table.pvtTable thead tr th,
.pvtVirtualizedContainer table.pvtTable thead tr th.pvtAxisLabel,
.pvtVirtualizedContainer table.pvtTable thead tr th.pvtColLabel {
	/* Force borders to match global CSS - use maximum specificity */
	border: 1px solid #c8d4e3 !important;
	border-top: 1px solid #c8d4e3 !important;
	border-bottom: 1px solid #c8d4e3 !important;
	border-left: 1px solid #c8d4e3 !important;
	border-right: 1px solid #c8d4e3 !important;
	/* Set all border properties explicitly */
	border-top-width: 1px !important;
	border-top-style: solid !important;
	border-top-color: #c8d4e3 !important;
	border-bottom-width: 1px !important;
	border-bottom-style: solid !important;
	border-bottom-color: #c8d4e3 !important;
	border-left-width: 1px !important;
	border-left-style: solid !important;
	border-left-color: #c8d4e3 !important;
	border-right-width: 1px !important;
	border-right-style: solid !important;
	border-right-color: #c8d4e3 !important;
	/* Match global CSS properties */
	background-color: #ebf0f8 !important;
	background-clip: padding-box !important;
	padding: 5px !important;
	font-size: 8pt !important;
	box-sizing: border-box !important;
	/* Prevent border clipping during scroll */
	-webkit-transform: translateZ(0);
	transform: translateZ(0);
	/* Ensure borders are always painted */
	-webkit-backface-visibility: hidden;
	backface-visibility: hidden;
	/* Prevent border-image from interfering */
	-webkit-border-image: none !important;
	border-image: none !important;
	/* Ensure cell doesn't create gaps */
	margin: 0 !important;
	position: relative;
	/* Force border rendering - ensure borders are always painted */
	contain: layout style paint;
	/* Prevent subpixel rendering issues */
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
}

/* Ensure adjacent cells don't create gaps - with border-collapse: collapse, borders merge naturally */
.pvtVirtualizedContainer table.pvtTable thead tr th + th {
	margin-left: 0 !important;
	/* Ensure borders overlap correctly */
	border-left: 1px solid #c8d4e3 !important;
}

/* First and last cells in row */
.pvtVirtualizedContainer table.pvtTable thead tr th:first-child {
	border-left: 1px solid #c8d4e3 !important;
}

.pvtVirtualizedContainer table.pvtTable thead tr th:last-child {
	border-right: 1px solid #c8d4e3 !important;
}

/* First and last rows */
.pvtVirtualizedContainer table.pvtTable thead tr:first-child th {
	border-top: 1px solid #c8d4e3 !important;
}

.pvtVirtualizedContainer table.pvtTable thead tr:last-child th {
	border-bottom: 1px solid #c8d4e3 !important;
}
</style>
