/**
 * Single-input school typeahead (WAI-ARIA combobox) used on registration.
 * Renders suggestions from GET /api/schools/search/:query and writes the
 * chosen school's id into a hidden input[name="school_id"].
 */
(function() {
  'use strict';

  const MIN_CHARS = 2;
  const DEBOUNCE_MS = 250;
  const RESULT_LIMIT = 10;

  /**
   * Display label for one school suggestion.
   * @param {{name?:string, city?:string, state_province?:string}} school
   * @returns {string} e.g. "Lincoln High School — Chicago, IL"
   */
  function formatSchoolOption(school) {
    const name = (school && school.name ? String(school.name) : '').trim();
    const city = (school && school.city ? String(school.city) : '').trim();
    const state = (school && school.state_province ? String(school.state_province) : '').trim();
    const locality = [city, state].filter(Boolean).join(', ');
    if (name && locality) { return `${name} — ${locality}`; }
    if (locality) { return ` — ${locality}`; }
    return name;
  }

  /**
   * Wire a single-input school typeahead.
   * @param {{inputEl:HTMLInputElement, listboxEl:HTMLElement, hiddenEl:HTMLInputElement, noMatchText?:string}} opts
   */
  function initSchoolCombobox(opts) {
    const inputEl = opts.inputEl;
    const listboxEl = opts.listboxEl;
    const hiddenEl = opts.hiddenEl;
    const noMatchText = opts.noMatchText || "No matches — can't find your school? Contact your school administrator.";
    if (!inputEl || !listboxEl || !hiddenEl) { return; }

    let debounceTimer = null;
    let requestSeq = 0;   // guards against out-of-order responses
    let activeIndex = -1; // highlighted option index
    let options = [];     // [{ id, label }]

    function closeList() {
      listboxEl.replaceChildren();
      listboxEl.hidden = true;
      inputEl.setAttribute('aria-expanded', 'false');
      inputEl.removeAttribute('aria-activedescendant');
      activeIndex = -1;
      options = [];
    }

    function renderMessage(text) {
      listboxEl.replaceChildren();
      const li = document.createElement('li');
      li.className = 'school-combobox__empty';
      li.setAttribute('role', 'option');
      li.setAttribute('aria-disabled', 'true');
      li.textContent = text;
      listboxEl.appendChild(li);
      listboxEl.hidden = false;
      inputEl.setAttribute('aria-expanded', 'true');
      activeIndex = -1;
      options = [];
    }

    function renderOptions(schools) {
      listboxEl.replaceChildren();
      options = [];
      schools.forEach((school, i) => {
        const li = document.createElement('li');
        li.className = 'school-combobox__option';
        li.id = `school-option-${i}`;
        li.setAttribute('role', 'option');
        li.dataset.schoolId = school.id;
        li.textContent = formatSchoolOption(school);
        li.addEventListener('mousedown', (e) => {
          e.preventDefault(); // keep focus in the input so blur doesn't pre-empt selection
          selectOption(i);
        });
        listboxEl.appendChild(li);
        options.push({ id: school.id, label: li.textContent });
      });
      listboxEl.hidden = false;
      inputEl.setAttribute('aria-expanded', 'true');
      activeIndex = -1;
    }

    function highlight(index) {
      const items = listboxEl.querySelectorAll('.school-combobox__option');
      items.forEach((el) => { el.classList.remove('is-active'); });
      if (index >= 0 && index < items.length) {
        items[index].classList.add('is-active');
        inputEl.setAttribute('aria-activedescendant', items[index].id);
        activeIndex = index;
      }
    }

    function selectOption(index) {
      const opt = options[index];
      if (!opt) { return; }
      inputEl.value = opt.label;
      hiddenEl.value = opt.id;
      closeList();
    }

    function search(query) {
      const seq = ++requestSeq;
      fetch(`/api/schools/search/${encodeURIComponent(query)}?limit=${RESULT_LIMIT}`)
        .then((r) => { return r.json(); })
        .then((data) => {
          if (seq !== requestSeq) { return; } // a newer keystroke superseded this
          const results = (data && data.success && Array.isArray(data.data)) ? data.data : [];
          if (results.length === 0) {
            renderMessage(noMatchText);
          } else {
            renderOptions(results);
          }
        })
        .catch(() => {
          if (seq !== requestSeq) { return; }
          renderMessage('School search is unavailable — please try again.');
        });
    }

    inputEl.addEventListener('input', () => {
      hiddenEl.value = ''; // editing invalidates any prior selection
      const q = inputEl.value.trim();
      clearTimeout(debounceTimer);
      if (q.length < MIN_CHARS) { closeList(); return; }
      debounceTimer = setTimeout(() => { search(q); }, DEBOUNCE_MS);
    });

    inputEl.addEventListener('keydown', (e) => {
      const items = listboxEl.querySelectorAll('.school-combobox__option');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (items.length) { highlight(Math.min(activeIndex + 1, items.length - 1)); }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (items.length) { highlight(Math.max(activeIndex - 1, 0)); }
      } else if (e.key === 'Enter') {
        if (activeIndex >= 0) { e.preventDefault(); selectOption(activeIndex); }
      } else if (e.key === 'Escape') {
        closeList();
      }
    });

    // Close after a click outside; the 150ms delay lets an option mousedown land first.
    inputEl.addEventListener('blur', () => { setTimeout(closeList, 150); });

    closeList();
  }

  if (typeof window !== 'undefined') {
    window.SchoolCombobox = { init: initSchoolCombobox, formatSchoolOption };
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initSchoolCombobox, formatSchoolOption };
  }
})();
