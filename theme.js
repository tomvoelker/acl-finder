/* Apply the preferred theme before the stylesheet loads, avoiding a light flash. */
(() => {
  const key = 'emnlp2026-finder.theme';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let choice = 'auto';
  try {
    const saved = localStorage.getItem(key);
    if (saved === 'light' || saved === 'dark') choice = saved;
  } catch { /* The control still works when browser storage is unavailable. */ }

  function apply() {
    document.documentElement.dataset.theme = choice === 'auto' ? (system.matches ? 'dark' : 'light') : choice;
  }
  apply();
  system.addEventListener('change', () => { if (choice === 'auto') apply(); });

  document.addEventListener('DOMContentLoaded', () => {
    const control = document.querySelector('#theme');
    control.value = choice;
    control.closest('.theme-picker').hidden = false;
    control.addEventListener('change', () => {
      choice = control.value;
      apply();
      try {
        if (choice === 'auto') localStorage.removeItem(key);
        else localStorage.setItem(key, choice);
      } catch { /* Keep the chosen theme for this page even without storage. */ }
    });
  });
})();
