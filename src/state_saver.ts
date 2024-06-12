import debounce from 'debounce';

import type { InitState, WatchList } from './bot';
import { writeFile, access, readFile, constants } from 'fs/promises';

type State = {
  WHITELIST: number[];
  WATCH_LIST: WatchList;
};

const backUpPath = 'poluchka_backup.json';

export const saveState = debounce(async (state: State) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const trimmedWatchList = state.WATCH_LIST.map(({ unwatch, ...rest }) => ({
      ...rest,
    }));

    const jsonString = JSON.stringify({
      WHITELIST: state.WHITELIST,
      WATCH_LIST: trimmedWatchList,
    });

    await writeFile(backUpPath, jsonString);

    console.log('State has been save to ', backUpPath);
  } catch (e) {
    console.error('Error writing JSON to file:', e);
  }
}, 1000);

export const restoreState = async (): Promise<InitState | null> => {
  try {
    // Check if file exists
    await access(backUpPath, constants.F_OK);

    const data = await readFile(backUpPath, 'utf8');
    const jsonData = JSON.parse(data);
    return jsonData as InitState;
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error('File does not exist:', backUpPath);
    } else {
      console.error('Error reading file:', err);
    }
  }
  return null;
};
