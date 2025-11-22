import { defineConfig } from 'vite';
import { resolve } from 'path';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ command, mode }) => {
	// Development mode - serve as app
	if (command === 'serve') {
		return {
			plugins: [vue({
				template: {
					compilerOptions: {
						// Allow kebab-case component names
						isCustomElement: (tag) => false
					}
				}
			})],
			resolve: {
				alias: {
					'@': resolve(__dirname, 'src')
				}
			},
			server: {
				port: 5173,
				open: true
			}
		};
	}

	// Production mode - build as library
	return {
		plugins: [vue()],
		build: {
			lib: {
				entry: resolve(__dirname, 'src/entry/index.js'),
				name: 'Vue3Pivottable',
				fileName: (format) => `vue3-pivottable.${format}.js`,
				formats: ['es', 'cjs', 'umd']
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
					// Use named exports to avoid warnings
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
	};
});

