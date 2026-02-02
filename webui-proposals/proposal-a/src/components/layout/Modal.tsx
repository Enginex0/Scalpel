import { Show, createEffect, createSignal, onCleanup } from 'solid-js';
import type { JSXElement } from 'solid-js';
import { store } from '../../lib/store';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: JSXElement;
}

export function Modal(props: ModalProps) {
  const [visible, setVisible] = createSignal(false);
  const [animating, setAnimating] = createSignal(false);
  const [backdropOpacity, setBackdropOpacity] = createSignal(0);

  createEffect(() => {
    if (props.open) {
      setVisible(true);
      setTimeout(() => {
        setAnimating(true);
        setBackdropOpacity(1);
      }, 10);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') props.onClose();
      };
      document.addEventListener('keydown', handleKeyDown);
      onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
    } else {
      setAnimating(false);
      setBackdropOpacity(0);
      setTimeout(() => setVisible(false), 350);
    }
  });

  return (
    <Show when={visible()}>
      <div
        onClick={props.onClose}
        style={`
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          z-index: 200;
          opacity: ${backdropOpacity()};
          transition: opacity 0.3s ease;
        `}
      />

      {/* Incision reveal: clip-path peels open from bottom edge */}
      <div
        style={`
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: ${store.currentTheme().gradientSecondary};
          border-top-left-radius: ${store.currentTheme().radiusXLarge};
          border-top-right-radius: ${store.currentTheme().radiusXLarge};
          padding: 24px 20px;
          padding-bottom: calc(24px + 48px + env(safe-area-inset-bottom));
          z-index: 201;
          max-height: 85vh;
          overflow-y: auto;
          ${animating()
            ? 'animation: incisionReveal 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;'
            : 'clip-path: inset(100% 0 0 0); opacity: 0;'
          }
        `}
      >
        <div
          style={`
            width: 40px;
            height: 4px;
            background: ${store.currentTheme().textTertiary};
            border-radius: 2px;
            margin: 0 auto 20px;
          `}
        />

        <h2
          style={`
            font-family: ${store.currentTheme().fontDisplay};
            font-size: 24px;
            font-weight: 700;
            text-align: center;
            background: ${store.currentTheme().gradientPrimary};
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin: 0 0 24px;
          `}
        >
          {props.title}
        </h2>

        {props.children}
      </div>
    </Show>
  );
}
