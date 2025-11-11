/* global window */

const identity = (value) => value;

window.__ = window.__ || identity;

window.get_number_format =
	window.get_number_format ||
	(() => "Float");

window.get_number_format_info =
	window.get_number_format_info ||
	(() => ({
		group_sep: ",",
		decimal_str: ".",
		precision: 2,
	}));

window.cur_list =
	window.cur_list ||
	{
		doctype: "Demo",
		pivot_value_filter: {},
	};

window.frappe =
	window.frappe ||
	{
		Chart: class {
			constructor(container, options) {
				this.container = container;
				this.options = options;
				if (container) {
					container.innerHTML =
						'<div style="padding:1rem;border:1px dashed #d1d5db;border-radius:8px;background:#f9fafb;color:#6b7280;font-size:0.875rem;">frappe.Chart stub – chart rendering is unavailable in the demo environment.</div>';
				}
				console.info("frappe.Chart stub invoked", options);
			}
		},
	};

window.XLSX =
	window.XLSX ||
	{
		utils: {
			aoa_to_sheet: (data) => ({ data }),
			book_new: () => ({}),
			book_append_sheet: () => {},
		},
		writeFile: (workbook, filename) => {
			console.info("XLSX.writeFile stub invoked", { workbook, filename });
		},
	};

