import { defineConfig } from 'vite';
import { resolve } from 'path';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
	plugins: [vue()],
	build: {
		lib: {
			entry: resolve(__dirname, 'src/entry/frappe.js'),
			name: 'Vue3PivottableFrappe',
			fileName: (format) => `vue3-pivottable-frappe.${format}.js`,
			formats: ['es', 'umd']
		},
		rollupOptions: {
			// Externalize deps that shouldn't be bundled
			external: ['vue', 'vuedraggable', 'xlsx'],
			output: {
				// Provide global variables for externalized deps
				globals: {
					vue: 'Vue',
					vuedraggable: 'vuedraggable',
					xlsx: 'XLSX'
				},
				// Use named exports to avoid the warning
				exports: 'named'
			}
		},
		cssCodeSplit: false,
		sourcemap: true
	},
	resolve: {
		alias: {
			'@': resolve(__dirname, 'src')
		}
	}
});

