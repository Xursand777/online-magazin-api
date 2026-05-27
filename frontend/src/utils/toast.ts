// ─── Global Toast System with Undo support ───────────────────────────────────

let container: HTMLElement | null = null;

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
  return el;
};

interface ShowOptions {
  /** Duration (ms) before auto-dismiss. Default: 3500 */
  duration?: number;
  /** Label for optional action button (e.g. "Bekor qilish") */
  actionLabel?: string;
  /** Callback when action button is clicked */
  onAction?: () => void;
}

const COLORS = {
  success: { icon: 'check_circle', color: '#10b981', cls: 'toast-success' },
  error:   { icon: 'error',        color: '#ef4444', cls: 'toast-error'   },
  info:    { icon: 'info',         color: '#3b82f6', cls: 'toast-info'    },
  warning: { icon: 'warning',      color: '#f59e0b', cls: 'toast-info'    },
};

const show = (
  message: string,
  type: keyof typeof COLORS,
  options: ShowOptions = {}
) => {
  const target = getContainer();
  if (!target) return;

  const { duration = 3500, actionLabel, onAction } = options;
  const c = COLORS[type];

  // ─── Toast wrapper ───────────────────────────────────────
  const el = document.createElement('div');
  el.className = `bozor-toast ${c.cls}`;

  // Icon
  const icon = document.createElement('span');
  icon.className = 'material-symbols-outlined';
  icon.style.cssText = `
    color: ${c.color} !important;
    font-size: 20px !important;
    line-height: 1 !important;
    flex-shrink: 0 !important;
  `;
  icon.textContent = c.icon;

  // Message text
  const text = document.createElement('span');
  text.style.cssText = `
    line-height: 1.4 !important;
    flex-grow: 1 !important;
    font-weight: 500 !important;
    font-size: 13.5px !important;
  `;
  text.textContent = message;

  el.append(icon, text);

  // ─── Action button (Undo) ────────────────────────────────
  let actionClicked = false;
  if (actionLabel && onAction) {
    const divider = document.createElement('span');
    divider.style.cssText = `
      display: block !important;
      width: 1px !important;
      height: 20px !important;
      background: rgba(255,255,255,0.18) !important;
      flex-shrink: 0 !important;
    `;

    const btn = document.createElement('button');
    btn.textContent = actionLabel;
    btn.style.cssText = `
      background: none !important;
      border: none !important;
      cursor: pointer !important;
      flex-shrink: 0 !important;
      padding: 4px 6px !important;
      border-radius: 6px !important;
      font-size: 13px !important;
      font-weight: 700 !important;
      color: #86efac !important;
      letter-spacing: 0.02em !important;
      white-space: nowrap !important;
      transition: background 0.15s !important;
      pointer-events: all !important;
    `;
    btn.onmouseenter = () => { btn.style.background = 'rgba(255,255,255,0.1) !important'; };
    btn.onmouseleave = () => { btn.style.background = 'none !important'; };

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      actionClicked = true;
      onAction();
      // Immediately dismiss toast
      dismiss();
    });

    el.append(divider, btn);
  }

  target.appendChild(el);

  // Force reflow so CSS transition can fire
  el.offsetHeight;
  el.classList.add('toast-show');

  // ─── Auto dismiss ────────────────────────────────────────
  const dismiss = () => {
    el.classList.remove('toast-show');
    const cleanup = () => {
      el.removeEventListener('transitionend', cleanup);
      el.remove();
    };
    el.addEventListener('transitionend', cleanup);
    // Fallback if transitionend doesn't fire
    setTimeout(() => el.remove(), 500);
  };

  const timer = setTimeout(() => {
    if (!actionClicked) dismiss();
  }, duration);

  // Cancel timer if action clicked
  el.addEventListener('click', () => {
    if (actionClicked) clearTimeout(timer);
  });
};

// ─── Public API ───────────────────────────────────────────
export const toast = {
  success: (msg: string, opts?: ShowOptions) => show(msg, 'success', opts),
  error:   (msg: string, opts?: ShowOptions) => show(msg, 'error',   opts),
  info:    (msg: string, opts?: ShowOptions) => show(msg, 'info',    opts),
  warning: (msg: string, opts?: ShowOptions) => show(msg, 'warning', opts),

  /**
   * Convenience: shows a success toast with an "Bekor qilish" undo button.
   * Caller provides the undo callback.
   *
   * @example
   * toast.undo("Sevimlilardan olib tashlandi", () => addBackToFavorites(item));
   */
  undo: (msg: string, onUndo: () => void, undoLabel = "Bekor qilish") =>
    show(msg, 'success', {
      duration: 5000, // 5 seconds — enough time to tap undo
      actionLabel: undoLabel,
      onAction: onUndo,
    }),
};
