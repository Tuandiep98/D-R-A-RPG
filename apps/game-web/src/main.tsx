import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GameCanvas } from './GameCanvas';
import { Hud } from './hud/Hud';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

// GameCanvas stays outside StrictMode: its double-invoked effect would create
// two engines on the same canvas while the first is still initialising.
createRoot(root).render(
  <>
    <GameCanvas />
    <StrictMode>
      <Hud />
    </StrictMode>
  </>,
);
