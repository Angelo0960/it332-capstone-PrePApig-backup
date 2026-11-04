window.__PREPAPIG_INSTALL_PROMPT__ = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  window.__PREPAPIG_INSTALL_PROMPT__ = event;
  window.dispatchEvent(new Event('prepapig:install-prompt-available'));
});

window.addEventListener('appinstalled', () => {
  window.__PREPAPIG_INSTALL_PROMPT__ = null;
  window.dispatchEvent(new Event('prepapig:appinstalled'));
});
