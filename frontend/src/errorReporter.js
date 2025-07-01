export function initErrorReporter() {
  if (typeof window === 'undefined') return;
  if (window.__errorReporterInitialized) return;
  window.__errorReporterInitialized = true;

  const previous = window.onerror;

  window.onerror = function (message, source, lineno, colno, error) {
    const payload = {
      message: message ? String(message) : '',
      source,
      lineno,
      colno,
      stack: error && error.stack ? error.stack : undefined,
    };

    fetch('/api/gemini-debug', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});

    if (typeof previous === 'function') {
      return previous.apply(this, arguments);
    }

    return false;
  };
}

