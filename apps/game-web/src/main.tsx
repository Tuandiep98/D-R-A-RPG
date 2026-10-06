import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameCanvas } from './GameCanvas';
import { Hud } from './hud/Hud';
import { Login, type OnlineChoice } from './Login';
import './styles.css';

const params = new URLSearchParams(window.location.search);
/** `?online` → API login; `?online&dev=<name>` → dev login straight to the game server. */
const needsLogin = params.has('online') && !params.has('dev');

function App() {
  const [online, setOnline] = useState<OnlineChoice | null>(null);
  if (needsLogin && !online) {
    return (
      <StrictMode>
        <Login onPlay={setOnline} />
      </StrictMode>
    );
  }
  // GameCanvas stays outside StrictMode: its double-invoked effect would create
  // two engines on the same canvas while the first is still initialising.
  return (
    <>
      <GameCanvas online={online} />
      <StrictMode>
        <Hud />
      </StrictMode>
    </>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
createRoot(root).render(<App />);
