/* Apply the preferred theme before the stylesheet loads, avoiding a light flash. */
(() => {
  const key = 'emnlp2026-finder.theme';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const choices = ['auto', 'light', 'dark'];
  const labels = { auto: 'Auto', light: 'Light', dark: 'Dark' };
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
    let temporaryChoice = false;
    function updateControl() {
      const next = choices[(choices.indexOf(choice) + 1) % choices.length];
      control.dataset.mode = choice;
      const description = `Theme: ${labels[choice]}${choice === 'auto' ? ' (system)' : ''}. Switch to ${labels[next]}.`;
      control.setAttribute('aria-label', description);
      control.title = description;
    }
    updateControl();
    control.hidden = false;
    control.addEventListener('click', () => {
      choice = choices[(choices.indexOf(choice) + 1) % choices.length];
      apply();
      updateControl();
      try {
        if (choice === 'auto') localStorage.removeItem(key);
        else localStorage.setItem(key, choice);
        temporaryChoice = false;
      } catch { temporaryChoice = true; }
    });
    const refresh = () => {
      if (temporaryChoice) return;
      try {
        const saved = localStorage.getItem(key);
        choice = saved === 'light' || saved === 'dark' ? saved : 'auto';
      } catch { return; }
      apply();
      updateControl();
    };
    window.addEventListener('storage', event => {
      if (event.key === key || event.key === null) { temporaryChoice = false; refresh(); }
    });
    window.addEventListener('pageshow', refresh);
    window.addEventListener('focus', refresh);
  });
})();
