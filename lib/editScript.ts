// Returns a <script> tag to inject into HTML served in edit mode.
// Makes [data-drift-editable] elements contentEditable with constraints.

export function getEditScript(): string {
  return `<style>
  [data-drift-editable].drift-editing {
    outline: 1.5px dashed rgba(20, 184, 166, 0.4);
    outline-offset: 3px;
    cursor: text;
    transition: outline-color 0.15s;
  }
  [data-drift-editable].drift-editing:hover {
    outline-color: rgba(20, 184, 166, 0.7);
  }
  [data-drift-editable].drift-editing:focus {
    outline-color: rgba(20, 184, 166, 1);
    outline-offset: 4px;
  }
</style>
<script>
(function() {
  var elements = document.querySelectorAll('[data-drift-editable]');
  var originals = {};
  var edits = {};
  var enabled = false;

  // Store original content (innerHTML to preserve child nodes)
  elements.forEach(function(el) {
    var field = el.getAttribute('data-drift-editable');
    originals[field] = el.innerHTML;
  });

  function getOriginalText(field) {
    var tmp = document.createElement('div');
    tmp.innerHTML = originals[field];
    return tmp.textContent;
  }

  // Normalize text length — collapse whitespace so HTML indentation doesn't count
  function textLen(el) {
    return el.textContent.replace(/\\s+/g, ' ').trim().length;
  }

  function sendEdits(field) {
    window.parent.postMessage({
      type: 'drift:edit-change',
      field: field,
      value: edits[field] || originals[field],
      allEdits: Object.assign({}, edits)
    }, '*');
  }

  function enableEditing() {
    enabled = true;
    elements.forEach(function(el) {
      el.contentEditable = 'true';
      el.classList.add('drift-editing');
    });
  }

  function disableEditing() {
    enabled = false;
    elements.forEach(function(el) {
      el.contentEditable = 'false';
      el.classList.remove('drift-editing');
    });
  }

  function restoreEdits(savedEdits) {
    Object.keys(savedEdits).forEach(function(field) {
      var el = document.querySelector('[data-drift-editable="' + field + '"]');
      if (el) {
        el.innerHTML = savedEdits[field];
        edits[field] = savedEdits[field];
      }
    });
  }

  function showOriginals() {
    elements.forEach(function(el) {
      var field = el.getAttribute('data-drift-editable');
      el.innerHTML = originals[field];
    });
  }

  // Set up per-element handlers
  elements.forEach(function(el) {
    var field = el.getAttribute('data-drift-editable');

    // Prevent input that would exceed maxlen (preserves child nodes + cursor)
    el.addEventListener('beforeinput', function(e) {
      var maxlen = parseInt(el.getAttribute('data-drift-maxlen') || '0', 10);
      if (maxlen <= 0) return;
      if (e.inputType === 'insertText' && e.data) {
        var sel = window.getSelection();
        var selectedLen = sel && sel.rangeCount ? sel.toString().length : 0;
        if (textLen(el) - selectedLen + e.data.length > maxlen) {
          e.preventDefault();
        }
      }
    });

    el.addEventListener('input', function() {
      var current = el.innerHTML;
      if (el.textContent !== getOriginalText(field)) {
        edits[field] = current;
      } else {
        delete edits[field];
      }
      sendEdits(field);
    });

    // Block Enter
    el.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
      }
    });

    // Paste: plain text only, truncated to maxlen
    el.addEventListener('paste', function(e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text/plain');
      // Strip newlines
      text = text.replace(/[\\r\\n]/g, ' ');
      var maxlen = parseInt(el.getAttribute('data-drift-maxlen') || '0', 10);
      if (maxlen > 0) {
        var remaining = maxlen - textLen(el);
        var sel = window.getSelection();
        if (sel.rangeCount) {
          remaining += sel.toString().length;
        }
        text = text.slice(0, Math.max(0, remaining));
      }
      document.execCommand('insertText', false, text);
    });
  });

  // Listen for messages from parent
  window.addEventListener('message', function(e) {
    if (!e.data || !e.data.type) return;
    switch (e.data.type) {
      case 'drift:enable-edit':
        enableEditing();
        break;
      case 'drift:disable-edit':
        disableEditing();
        break;
      case 'drift:restore-edits':
        if (e.data.edits) restoreEdits(e.data.edits);
        break;
      case 'drift:show-originals':
        showOriginals();
        break;
    }
  });
})();
</script>`;
}
