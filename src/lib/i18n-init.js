/**
 * Internationalization initialization script
 * Automatically translates elements with data-i18n attributes on page load
 *
 * Usage:
 *   <script src="../lib/i18n-init.js"></script>
 *
 * Supported attributes:
 *   data-i18n="messageKey"              - Sets textContent
 *   data-i18n-placeholder="messageKey"  - Sets placeholder attribute
 *   data-i18n-title="messageKey"        - Sets title attribute
 */

(function() {
  'use strict';

  /**
   * Translate all elements with i18n data attributes
   */
  function translatePage() {
    // Translate text content
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const message = chrome.i18n.getMessage(key);
      if (message) {
        el.textContent = message;
      }
    });

    // Translate placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const message = chrome.i18n.getMessage(key);
      if (message) {
        el.placeholder = message;
      }
    });

    // Translate title attributes
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      const message = chrome.i18n.getMessage(key);
      if (message) {
        el.title = message;
      }
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', translatePage);
  } else {
    translatePage();
  }
})();
