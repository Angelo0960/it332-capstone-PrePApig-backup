import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ConfirmationContext = createContext(null);

export function ConfirmationProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((options = {}) => new Promise((resolve) => {
    if (resolver.current) resolver.current(false);
    resolver.current = resolve;
    setRequest({
      title: options.title || 'Are you sure?',
      message: options.message || 'Please confirm that you want to continue.',
      confirmLabel: options.confirmLabel || 'Confirm',
      cancelLabel: options.cancelLabel || 'Cancel',
      destructive: options.destructive === true,
    });
  }), []);

  const finish = (confirmed) => {
    resolver.current?.(confirmed);
    resolver.current = null;
    setRequest(null);
  };

  return (
    <ConfirmationContext.Provider value={confirm}>
      {children}
      {request && (
        <div
          className="responsive-modal-overlay fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          style={{ zIndex: 120 }}
          onMouseDown={(event) => { if (event.target === event.currentTarget) finish(false); }}
        >
          <section
            aria-describedby="confirmation-message"
            aria-labelledby="confirmation-title"
            aria-modal="true"
            className="responsive-modal w-full max-w-md rounded-3xl border border-white/40 bg-white/90 p-6 shadow-2xl backdrop-blur-xl"
            onKeyDown={(event) => { if (event.key === 'Escape') finish(false); }}
            role="alertdialog"
            tabIndex={-1}
          >
            <h2 className="text-lg font-bold text-gray-900" id="confirmation-title">{request.title}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-700" id="confirmation-message">{request.message}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button autoFocus className="min-h-11 rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700" onClick={() => finish(false)} type="button">
                {request.cancelLabel}
              </button>
              <button className={`min-h-11 rounded-xl px-4 py-2 font-semibold text-white ${request.destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-700 hover:bg-emerald-800'}`} onClick={() => finish(true)} type="button">
                {request.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      )}
    </ConfirmationContext.Provider>
  );
}

export function useConfirmation() {
  const confirm = useContext(ConfirmationContext);
  if (!confirm) throw new Error('useConfirmation must be used inside ConfirmationProvider');
  return confirm;
}
