import { createApp } from './app.js';
import { config } from './config.js';
import { startProactiveScheduler } from './services/proactive.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`bunny-home-backend listening on http://localhost:${config.port}`);
  startProactiveScheduler();
});
