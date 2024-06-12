import assert from 'assert';
import { Bot } from 'grammy';
import { Address, isAddress, isAddressEqual } from 'viem';
import { TransferData, watchTokenTransfer } from './crypto.js';
import { saveState } from './state_saver.js';

const ERROR_MESSAGE = `400 or smth i guess, too bad, get fucked`;
const ERROR_MESSAGE_MAX_WATCH = `Watching too much, ease up`;
const MAX_WATCH_PER_USER = 5;

export type WatchListEntry = {
  owner: number;
  toAddress: Address;
  toAlias?: string;
  tokenAddress: Address;
  unwatch: () => void;
};

export type WatchList = WatchListEntry[];

export type InitState = {
  WHITELIST: number[];
  WATCH_LIST: Omit<WatchListEntry, 'unwatch'>[];
};

type SendTransferMessageProps = {
  transferData: TransferData;
  watchListEntry: WatchListEntry;
};

const shortenAddress = (address: Address) => {
  return `${address.slice(0, 6)}..${address.slice(-5)}`;
};

export const initBot = async (initState: InitState | null) => {
  assert(process.env.ADMIN_ID && !isNaN(Number(process.env.ADMIN_ID)));
  assert(process.env.TELEGRAM_TOKEN, 'must have TELEGRAM_TOKEN');

  const ADMIN = Number(process.env.ADMIN_ID);
  const bot = new Bot(process.env.TELEGRAM_TOKEN);

  let WHITELIST: number[], WATCH_LIST: WatchList;

  const backUpState = () => {
    saveState({ WATCH_LIST, WHITELIST });
  };

  const addToWatchList = async (
    chatId: number,
    toAddress: Address,
    tokenAddress: Address,
    toAlias?: string,
  ) => {
    const watchListEntry: WatchListEntry = {
      owner: chatId,
      toAddress,
      tokenAddress,
      toAlias,
      unwatch: () => {},
    };
    const unwatch = await watchTokenTransfer(
      tokenAddress,
      toAddress,
      (events) => {
        events.forEach((transferData) => {
          sendTransferMessage({ transferData, watchListEntry });
        });
      },
    );
    watchListEntry.unwatch = unwatch;
    return watchListEntry;
  };

  if (initState) {
    WHITELIST = initState.WHITELIST;
    WATCH_LIST = [];
    for (let index = 0; index < initState.WATCH_LIST.length; index++) {
      const { owner, toAddress, tokenAddress, toAlias } =
        initState.WATCH_LIST[index];
      const entry = await addToWatchList(
        owner,
        toAddress,
        tokenAddress,
        toAlias,
      );
      WATCH_LIST.push(entry);
    }
  } else {
    WHITELIST = [ADMIN];
    WATCH_LIST = [];
  }

  const sendTransferMessage = ({
    transferData,
    watchListEntry,
  }: SendTransferMessageProps) => {
    return bot.api.sendMessage(
      watchListEntry.owner,
      `Received ${transferData.amount} ${transferData.name} to ${watchListEntry.toAlias ?? shortenAddress(transferData.to)} from ${shortenAddress(transferData.from)}. <a href='${transferData.txUrl}'>See tx here.</a>`,
      {
        parse_mode: 'HTML',
      },
    );
  };

  bot.command('start', async (ctx) => {
    return ctx.reply('Welcome! Up and running.');
  });

  bot.command('whitelist', async (ctx) => {
    if (ctx.chatId === ADMIN) {
      const id = Number(ctx.match);
      if (id && !isNaN(id) && !WHITELIST.includes(id)) {
        WHITELIST.push(id);

        backUpState();
        return ctx.reply(`${id} user was added to whitelist`);
      }
    }
    return ctx.reply(ERROR_MESSAGE);
  });

  bot.command('unwhitelist', async (ctx) => {
    if (ctx.chatId === ADMIN) {
      const id = Number(ctx.match);
      if (id && !isNaN(id) && WHITELIST.includes(id)) {
        const index = WHITELIST.findIndex((w) => id === w);
        WHITELIST.splice(index, 1);

        backUpState();
        return ctx.reply(`${id} user was added to whitelist`);
      }
    }
    return ctx.reply(ERROR_MESSAGE);
  });

  bot.command('watch', async (ctx) => {
    if (!WHITELIST.includes(ctx.chatId)) return ctx.reply(ERROR_MESSAGE);
    const userWatchList = WATCH_LIST.filter((w) => w.owner === ctx.chatId);
    if (userWatchList.length >= MAX_WATCH_PER_USER)
      return ctx.reply(ERROR_MESSAGE_MAX_WATCH);

    const [tokenAddress, toAddress, toAlias] = ctx.match
      .split(' ')
      .filter((s) => s);

    if (
      !tokenAddress ||
      !toAddress ||
      !isAddress(tokenAddress) ||
      !isAddress(toAddress)
    )
      return ctx.reply(ERROR_MESSAGE);

    if (
      userWatchList.find(
        (w) =>
          isAddressEqual(w.toAddress, toAddress as Address) &&
          isAddressEqual(w.tokenAddress, tokenAddress as Address),
      )
    )
      return ctx.reply('Already watching this for ya');

    try {
      const watchListEntry = await addToWatchList(
        ctx.chatId,
        toAddress,
        tokenAddress,
        toAlias,
      );
      WATCH_LIST.push(watchListEntry);
      backUpState();
      return ctx.reply('Now watching this');
    } catch (e) {
      console.error(`[initBot] failed to set watch`, e);
    }

    return ctx.reply(ERROR_MESSAGE);
  });

  bot.command('unwatch', async (ctx) => {
    if (!WHITELIST.includes(ctx.chatId)) return ctx.reply(ERROR_MESSAGE);
    const userWatchList = WATCH_LIST.filter((w) => w.owner === ctx.chatId);
    if (userWatchList.length >= MAX_WATCH_PER_USER)
      return ctx.reply(ERROR_MESSAGE_MAX_WATCH);

    const [tokenAddress, toAddress] = ctx.match.split(' ').filter((s) => s);

    if (
      !tokenAddress ||
      !toAddress ||
      !isAddress(tokenAddress) ||
      !isAddress(toAddress)
    )
      return ctx.reply(ERROR_MESSAGE);

    const entryIndex = userWatchList.findIndex(
      (w) =>
        isAddressEqual(w.toAddress, toAddress as Address) &&
        isAddressEqual(w.tokenAddress, tokenAddress as Address),
    );
    if (entryIndex < 0) return ctx.reply('Cannot unwatch unwatched');

    try {
      const entry = WATCH_LIST[entryIndex];
      WATCH_LIST.splice(entryIndex, 1);
      entry.unwatch();

      backUpState();

      return ctx.reply('unwatched that');
    } catch (e) {
      console.error(`[initBot] failed to unwatch`, e);
    }

    return ctx.reply(ERROR_MESSAGE);
  });

  bot.command('whoami', async (ctx) => {
    return ctx.reply(ctx.chatId.toString());
  });

  bot.command('status', async (ctx) => {
    if (ctx.chatId === ADMIN) {
      return ctx.reply(
        `Whitelist: [${WHITELIST.join(',')}] \n Now Watching: ${WATCH_LIST.length}`,
      );
    }
    return ctx.reply(ERROR_MESSAGE);
  });

  bot.command('help', async (ctx) => {
    ctx.reply(
      `How to use bot: \n \\whoami get your user id so you can be whitelisted \n \\watch [erc20 token address] [wallet address] [optional wallet alias] receive top up notifications \n \\unwatch [erc20 token address] [wallet address]`,
    );
  });

  return bot;
};
