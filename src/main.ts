import { initBot } from './bot.js';
import { restoreState } from './state_saver.js';

const start = async () => {
  console.log('Trying to restore state...');
  const state = await restoreState();
  console.log(state ? 'Restored state from back up' : 'No state found');

  console.log('Initing bot...');
  const bot = await initBot(state);

  console.log('Starting bot...');
  await bot.start();

  console.log('Bot up and running');
};

start();
