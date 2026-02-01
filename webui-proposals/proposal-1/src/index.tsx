/* @refresh reload */
import { render } from 'solid-js/web';
import { App } from './App.tsx';
import './app.css';

const root = document.getElementById('root');

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error('Root element not found.');
}

render(() => <App />, root!);
