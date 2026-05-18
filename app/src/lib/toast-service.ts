/**
 * Toast notification service — singleton using EventTarget.
 * Replaces React's ToastContext with a framework-agnostic approach.
 * Components dispatch toasts via `ToastService.show()`.
 * The `<gable-toast-container>` component listens and renders them.
 */

export type ToastType = 'success' | 'error' | 'info';

export interface ToastDetail {
  id: string;
  message: string;
  type: ToastType;
}

class ToastServiceImpl extends EventTarget {
  private static _instance: ToastServiceImpl;

  static get instance(): ToastServiceImpl {
    if (!ToastServiceImpl._instance) {
      ToastServiceImpl._instance = new ToastServiceImpl();
    }
    return ToastServiceImpl._instance;
  }

  show(message: string, type: ToastType = 'info') {
    const id = Math.random().toString(36).substring(2, 11);
    this.dispatchEvent(
      new CustomEvent<ToastDetail>('toast', {
        detail: { id, message, type },
      })
    );
  }

  /** Convenience aliases matching the old React API */
  success(message: string) { this.show(message, 'success'); }
  error(message: string) { this.show(message, 'error'); }
  info(message: string) { this.show(message, 'info'); }
}

export const ToastService = ToastServiceImpl.instance;
