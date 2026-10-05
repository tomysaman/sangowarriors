import { Game } from './game.js';

const game = new Game();
game.load().catch((e) => {
  console.error(e);
  const m = document.querySelector('#loading .msg');
  if (m) m.textContent = `Failed to start: ${e.message}`;
});
