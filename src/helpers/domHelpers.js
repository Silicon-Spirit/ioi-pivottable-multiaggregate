/**
 * DOM manipulation helper functions
 * @module domHelpers
 */

/**
 * Get element by selector
 * @param {string} selector - CSS selector
 * @param {Element} parent - Parent element (default: document)
 * @returns {Element|null} Found element or null
 */
export function getElement(selector, parent = document) {
	return parent.querySelector(selector);
}

/**
 * Get all elements by selector
 * @param {string} selector - CSS selector
 * @param {Element} parent - Parent element (default: document)
 * @returns {NodeList} Found elements
 */
export function getElements(selector, parent = document) {
	return parent.querySelectorAll(selector);
}

/**
 * Wait for an element to appear in the DOM
 * @param {string} selector - CSS selector
 * @param {number} timeout - Timeout in milliseconds (default: 5000)
 * @param {Element} parent - Parent element (default: document)
 * @returns {Promise<Element>} Promise that resolves with the element
 */
export function waitForElement(selector, timeout = 5000, parent = document) {
	return new Promise((resolve, reject) => {
		const element = getElement(selector, parent);
		if (element) {
			resolve(element);
			return;
		}

		const observer = new MutationObserver((mutations, obs) => {
			const element = getElement(selector, parent);
			if (element) {
				obs.disconnect();
				resolve(element);
			}
		});

		observer.observe(parent, {
			childList: true,
			subtree: true,
		});

		setTimeout(() => {
			observer.disconnect();
			reject(new Error(`Element ${selector} not found within ${timeout}ms`));
		}, timeout);
	});
}

/**
 * Get bounding rectangle of an element
 * @param {Element|string} element - Element or selector
 * @returns {DOMRect|null} Bounding rectangle or null
 */
export function getBoundingRect(element) {
	const el = typeof element === 'string' ? getElement(element) : element;
	if (!el) {
		return null;
	}

	return el.getBoundingClientRect();
}

/**
 * Scroll element into view
 * @param {Element|string} element - Element or selector
 * @param {Object} options - Scroll options
 * @returns {boolean} True if successful
 */
export function scrollIntoView(element, options = {}) {
	const el = typeof element === 'string' ? getElement(element) : element;
	if (!el) {
		return false;
	}

	el.scrollIntoView({
		behavior: 'smooth',
		block: 'center',
		...options,
	});

	return true;
}

/**
 * Add event listener with automatic cleanup
 * @param {Element|string} element - Element or selector
 * @param {string} event - Event name
 * @param {Function} handler - Event handler
 * @param {Object} options - Event options
 * @returns {Function} Cleanup function
 */
export function addEventListener(element, event, handler, options = {}) {
	const el = typeof element === 'string' ? getElement(element) : element;
	if (!el) {
		return () => {};
	}

	el.addEventListener(event, handler, options);

	return () => {
		el.removeEventListener(event, handler, options);
	};
}

/**
 * Set element style
 * @param {Element|string} element - Element or selector
 * @param {Object|string} styles - Style object or CSS property name
 * @param {string} value - CSS property value (if styles is a string)
 * @returns {boolean} True if successful
 */
export function setStyle(element, styles, value) {
	const el = typeof element === 'string' ? getElement(element) : element;
	if (!el) {
		return false;
	}

	if (typeof styles === 'string') {
		el.style[styles] = value;
	} else {
		Object.assign(el.style, styles);
	}

	return true;
}

/**
 * Get computed style of an element
 * @param {Element|string} element - Element or selector
 * @param {string} property - CSS property name
 * @returns {string|null} Computed style value or null
 */
export function getComputedStyle(element, property) {
	const el = typeof element === 'string' ? getElement(element) : element;
	if (!el) {
		return null;
	}

	const computed = window.getComputedStyle(el);
	return property ? computed.getPropertyValue(property) : computed;
}

/**
 * Add class to element
 * @param {Element|string} element - Element or selector
 * @param {string} className - Class name
 * @returns {boolean} True if successful
 */
export function addClass(element, className) {
	const el = typeof element === 'string' ? getElement(element) : element;
	if (!el) {
		return false;
	}

	el.classList.add(className);
	return true;
}

/**
 * Remove class from element
 * @param {Element|string} element - Element or selector
 * @param {string} className - Class name
 * @returns {boolean} True if successful
 */
export function removeClass(element, className) {
	const el = typeof element === 'string' ? getElement(element) : element;
	if (!el) {
		return false;
	}

	el.classList.remove(className);
	return true;
}

/**
 * Toggle class on element
 * @param {Element|string} element - Element or selector
 * @param {string} className - Class name
 * @returns {boolean} True if successful
 */
export function toggleClass(element, className) {
	const el = typeof element === 'string' ? getElement(element) : element;
	if (!el) {
		return false;
	}

	el.classList.toggle(className);
	return true;
}

/**
 * Check if element has class
 * @param {Element|string} element - Element or selector
 * @param {string} className - Class name
 * @returns {boolean} True if element has class
 */
export function hasClass(element, className) {
	const el = typeof element === 'string' ? getElement(element) : element;
	if (!el) {
		return false;
	}

	return el.classList.contains(className);
}

/**
 * Create a MutationObserver for an element
 * @param {Element|string} element - Element or selector
 * @param {Function} callback - Callback function
 * @param {Object} options - Observer options
 * @returns {MutationObserver|null} Observer instance or null
 */
export function observeElement(element, callback, options = {}) {
	const el = typeof element === 'string' ? getElement(element) : element;
	if (!el) {
		return null;
	}

	const defaultOptions = {
		childList: true,
		subtree: true,
		attributes: false,
		characterData: false,
		...options,
	};

	const observer = new MutationObserver(callback);
	observer.observe(el, defaultOptions);

	return observer;
}

