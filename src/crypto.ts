import {
  createPublicClient,
  http,
  getContract,
  Address,
  formatUnits,
  extractChain,
} from 'viem';

import { holesky, mainnet } from 'viem/chains';

const ERC20_EVENT_ABI = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: 'from',
        type: 'address',
      },
      {
        indexed: true,
        name: 'to',
        type: 'address',
      },
      {
        indexed: false,
        name: 'value',
        type: 'uint256',
      },
    ],
    name: 'Transfer',
    type: 'event',
  },
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [
      {
        name: '',
        type: 'uint8',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'name',
    outputs: [
      {
        name: '',
        type: 'string',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const publicClient = createPublicClient({
  chain: extractChain({
    chains: [mainnet, holesky],
    id: Number(process.env.CHAIN_ID) as 1 | 17000,
  }),
  transport: http(),
  cacheTime: 4000,
  pollingInterval: 60_000,
});

export type TransferData = {
  to: Address;
  from: Address;
  name: string;
  amount: string;
  txUrl: string;
};

export const watchTokenTransfer = async (
  tokenAddress: string,
  toAddress: string,
  onEvent: (data: TransferData[]) => void,
) => {
  const contract = getContract({
    abi: ERC20_EVENT_ABI,
    address: tokenAddress as Address,
    client: publicClient,
  });

  const [NAME, DECIMALS] = await Promise.all([
    contract.read.name(),
    contract.read.decimals(),
  ]);

  const unwatch = contract.watchEvent.Transfer(
    {
      to: toAddress as Address,
      from: undefined,
    },
    {
      strict: true,
      batch: true,
      poll: true,
      pollingInterval: 60_000,
      onLogs: (logs) => {
        onEvent(
          logs.map((log) => {
            return {
              name: NAME,
              from: log.args.from as Address,
              to: log.args.to as Address,
              amount: formatUnits(log.args.value as bigint, DECIMALS),
              txUrl: `${publicClient.chain.blockExplorers.default.url}/tx/${log.transactionHash}`,
            };
          }),
        );
      },
      onError: (error) => {
        console.error('[watchTokenTransfer]', error);
      },
    },
  );

  return unwatch;
};
