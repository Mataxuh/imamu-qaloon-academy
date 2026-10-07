const COOKIE_CONSENT_KEY = 'iqa_cookie_consent';
const THEME_KEY = 'iqa_theme';

function applyTheme(theme) {
  const safeTheme = theme === 'dark' ? 'dark' : 'light';
  document.body.dataset.theme = safeTheme;
  document.documentElement.dataset.theme = safeTheme;
  window.localStorage.setItem(THEME_KEY, safeTheme);

  const themeToggle = document.querySelector('.theme-toggle');
  if (!themeToggle) return;

  const isDark = safeTheme === 'dark';
  themeToggle.setAttribute('aria-pressed', String(isDark));
  themeToggle.setAttribute('aria-label', isDark ? 'Switch to white theme' : 'Switch to dark theme');
  themeToggle.innerHTML = isDark
    ? '<span class="theme-icon" aria-hidden="true">☀️</span><span class="theme-text">Light</span>'
    : '<span class="theme-icon" aria-hidden="true">🌙</span><span class="theme-text">Dark</span>';
}

function initThemeToggle() {
  const navWrap = document.querySelector('.nav-wrap');
  if (!navWrap || document.querySelector('.theme-toggle')) return;

  const themeToggle = document.createElement('button');
  themeToggle.type = 'button';
  themeToggle.className = 'theme-toggle';
  themeToggle.setAttribute('aria-label', 'Switch color theme');
  themeToggle.setAttribute('aria-pressed', 'false');
  themeToggle.innerHTML = '<span class="theme-icon" aria-hidden="true">🌙</span><span class="theme-text">Dark</span>';

  navWrap.appendChild(themeToggle);

  const storedTheme = window.localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(storedTheme);

  themeToggle.addEventListener('click', () => {
    const nextTheme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
  });
}

function initCookieBanner() {
  if (window.localStorage.getItem(COOKIE_CONSENT_KEY)) {
    return;
  }

  const existingBanner = document.querySelector('.cookie-banner');
  if (existingBanner) {
    existingBanner.classList.remove('hidden');
    return;
  }

  const banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-live', 'polite');
  banner.innerHTML = `
    <p>
      We use cookies to improve your experience and help us understand how visitors use our website.
      <a href="cookies-policy.html">Learn more</a>
    </p>
    <div class="cookie-banner-actions">
      <button class="button secondary" type="button" data-cookie-choice="decline">Essential only</button>
      <button class="button" type="button" data-cookie-choice="accept">Accept cookies</button>
    </div>
  `;

  document.body.appendChild(banner);

  banner.querySelectorAll('[data-cookie-choice]').forEach((button) => {
    button.addEventListener('click', () => {
      const choice = button.dataset.cookieChoice;
      window.localStorage.setItem(COOKIE_CONSENT_KEY, choice);
      banner.classList.add('hidden');
    });
  });
}

const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
const filterButtons = document.querySelectorAll('.filter');
const courseCards = document.querySelectorAll('.course-card');
const filterStatus = document.querySelector('#filter-status');

initThemeToggle();
initCookieBanner();

if (menuToggle && navigation) {
  menuToggle.addEventListener('click', () => {
    const open = navigation.classList.toggle('is-open');
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.textContent = open ? 'Close' : 'Menu';
  });

  navigation.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navigation.classList.remove('is-open');
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.textContent = 'Menu';
    });
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('header')) {
      navigation.classList.remove('is-open');
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.textContent = 'Menu';
    }
  });
}

if (filterButtons.length && courseCards.length && filterStatus) {
  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.filter;
      let count = 0;

      filterButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));

      courseCards.forEach((card) => {
        const matches = filter === 'all' || card.dataset.audience.split(' ').includes(filter);
        card.hidden = !matches;
        if (matches) count += 1;
      });

      filterStatus.textContent = filter === 'all'
        ? `Showing all ${count} programs.`
        : `Showing ${count} programs for ${filter}.`;
    });
  });
}

const form = document.querySelector('#contactForm');
const formStatus = document.querySelector('#formStatus');

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    if (!form.reportValidity()) return;

    if (!payload.name || !payload.name.trim()) {
      formStatus.textContent = 'Please enter your name.';
      formStatus.style.color = '#ffd59a';
      return;
    }

    if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      formStatus.textContent = 'Please provide a valid email address.';
      formStatus.style.color = '#ffd59a';
      return;
    }

    if (!payload.program) {
      formStatus.textContent = 'Please choose a program.';
      formStatus.style.color = '#ffd59a';
      return;
    }

    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
    submitButton.textContent = 'Sending...';
    formStatus.textContent = 'Sending your inquiry...';
    formStatus.style.color = '#f2d89d';

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Request failed.');
      }

      const successMessage = result.message || 'Inquiry sent successfully.';
      const whatsappLink = result.whatsappUrl
        ? '<a class="whatsapp-success-link" href="' + result.whatsappUrl + '" target="_blank" rel="noopener noreferrer">Continue to WhatsApp</a>'
        : '';
      formStatus.innerHTML = successMessage + (whatsappLink ? ' ' + whatsappLink : '');
      formStatus.style.color = '#d8f7d0';
      form.reset();
    } catch (error) {
      const safeMessage = error?.message || 'Something went wrong while sending your inquiry.';
      formStatus.textContent = safeMessage;
      formStatus.style.color = '#ffd59a';
    } finally {
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
      submitButton.textContent = 'Send inquiry';
    }
  });
}

const yearNode = document.querySelector('#year');
if (yearNode) yearNode.textContent = new Date().getFullYear();

const adminSecretTrigger = document.querySelector('.admin-secret-trigger');
if (adminSecretTrigger) {
  let clickCount = 0;
  let clickTimer = null;

  adminSecretTrigger.addEventListener('click', () => {
    clickCount += 1;

    if (clickTimer) clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      clickCount = 0;
    }, 1200);

    if (clickCount >= 3) {
      window.location.href = '/admin-login';
      clickCount = 0;
      clearTimeout(clickTimer);
    }
  });
}

const programLinks = document.querySelectorAll('[data-program]');
const programSelect = document.querySelector('#program');
if (programSelect) {
  programLinks.forEach((link) => {
    link.addEventListener('click', () => {
      programSelect.value = link.dataset.program;
    });
  });
}
