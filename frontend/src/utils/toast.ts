// Simple global toast system without extra dependencies
let container: HTMLElement | null = null;
let listenersAttached = false;

const positionContainer = (el: HTMLElement) => {
  const isDesktop = window.matchMedia('(min-width: 768px)').matches;

  el.style.position = 'fixed';
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = '8px';
  el.style.pointerEvents = 'none';
  el.style.zIndex = '45';

  if (isDesktop) {
    const header = document.querySelector('header');
    const headerBottom = header?.getBoundingClientRect().bottom ?? 64;

    el.style.top = `${Math.round(headerBottom + 12)}px`;
    el.style.right = '28px';
    el.style.bottom = 'auto';
    el.style.left = 'auto';
    el.style.width = 'auto';
    el.style.maxWidth = 'min(340px, calc(100vw - 56px))';
    el.style.alignItems = 'flex-end';
    return;
  }

  el.style.top = 'max(14px, env(safe-area-inset-top))';
  el.style.right = '12px';
  el.style.bottom = 'auto';
  el.style.left = '12px';
  el.style.width = 'auto';
  el.style.maxWidth = 'none';
  el.style.alignItems = 'stretch';
};

const attachPositionListeners = () => {
  if (listenersAttached || typeof window === 'undefined') return;
  listenersAttached = true;

  const refresh = () => {
    if (container) positionContainer(container);
  };

  window.addEventListener('resize', refresh);
  window.addEventListener('orientationchange', refresh);
  window.addEventListener('scroll', refresh, { passive: true });
};

const getContainer = () => {
  if (typeof document === 'undefined') return null;
  if (container) return container;
  
  let el = document.getElementById('toast-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-root';
    el.className = 'bozor-toast-root';
    document.body.appendChild(el);
  } else {
    el.classList.add('bozor-toast-root');
  }
  container = el;
  positionContainer(el);
  attachPositionListeners();
  return el;
};

const show = (message: string, type: 'success' | 'error' | 'info') => {
  const target = getContainer();
  if (!target) return;

  const colors = {
    success: {
      bg: 'rgb(var(--color-primary-container) / 0.16)',
      border: 'rgb(var(--color-primary) / 0.28)',
      text: 'rgb(var(--color-primary))',
      icon: '✓',
    },
    error: {
      bg: 'rgb(var(--color-error-container) / 0.7)',
      border: 'rgb(var(--color-error) / 0.28)',
      text: 'rgb(var(--color-on-error-container))',
      icon: '✕',
    },
    info: {
      bg: 'rgb(var(--color-primary-container) / 0.14)',
      border: 'rgb(var(--color-primary) / 0.25)',
      text: 'rgb(var(--color-primary))',
      icon: 'ℹ',
    },
  };
  const c = colors[type];

  const toast = document.createElement('div');
  toast.style.cssText = `
    background: ${c.bg};
    border: 1px solid ${c.border};
    color: ${c.text};
    padding: 10px 16px;
    border-radius: 10px;
    font-family: inherit;
    font-size: 14px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 10px 24px rgba(0,0,0,0.14);
    backdrop-filter: blur(14px);
    pointer-events: all;
    transform: translateX(120%);
    transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1);
    width: fit-content;
    min-width: 220px;
    max-width: min(340px, calc(100vw - 32px));
    box-sizing: border-box;
    white-space: normal;
  `;

  const icon = document.createElement('span');
  icon.style.cssText = 'font-weight:700;font-size:16px;line-height:1';
  icon.textContent = c.icon;

  const text = document.createElement('span');
  text.style.cssText = 'line-height:1.35';
  text.textContent = message;

  toast.append(icon, text);
  target.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(0)';
  });

  setTimeout(() => {
    toast.style.transform = 'translateX(120%)';
    toast.addEventListener('transitionend', () => toast.remove());
  }, 3000);
};

export const toast = {
  success: (msg: string) => show(msg, 'success'),
  error: (msg: string) => show(msg, 'error'),
  info: (msg: string) => show(msg, 'info'),
};
