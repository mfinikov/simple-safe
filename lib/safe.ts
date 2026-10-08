// Everything that talks to the chain. No libraries: it all goes through window.ethereum,
// the object MetaMask adds to the page.

type Provider = {
  request: (args: {method: string; params?: unknown[]}) => Promise<unknown>;
  on: (event: string, handler: () => void) => void;
};

declare global {
  interface Window {
    ethereum?: Provider;
  }
}

export const SEPOLIA = '0xaa36a7'; // 11155111 in hex
export const EXPLORER = 'https://sepolia.etherscan.io';
// contracts/Safe.sol compiled with solc 0.8.30 (--optimize). Sent as a transaction with no "to", it creates the contract.
export const BYTECODE = '0x6080604052348015600e575f5ffd5b505f80546001600160a01b031916331790556101be8061002d5f395ff3fe60806040526004361061002b575f3560e01c80632e1a7d4d146100365780638da5cb5b14610057575f5ffd5b3661003257005b5f5ffd5b348015610041575f5ffd5b50610055610050366004610171565b610091565b005b348015610062575f5ffd5b505f54610075906001600160a01b031681565b6040516001600160a01b03909116815260200160405180910390f35b5f546001600160a01b031633146100df5760405162461bcd60e51b815260206004820152600d60248201526c3737ba103a34329037bbb732b960991b60448201526064015b60405180910390fd5b5f80546040516001600160a01b039091169083908381818185875af1925050503d805f8114610129576040519150601f19603f3d011682016040523d82523d5f602084013e61012e565b606091505b505090508061016d5760405162461bcd60e51b815260206004820152600b60248201526a1cd95b990819985a5b195960aa1b60448201526064016100d6565b5050565b5f60208284031215610181575f5ffd5b503591905056fea2646970667358221220be2fa28ddb1caf83a31a80c837dc1c49a0bead7dde06fc6f1eedbb213430d2eb64736f6c634300081e0033';

export type Receipt = {status: string; contractAddress: string | null; transactionHash: string};

export function ask<T = string>(method: string, ...params: unknown[]): Promise<T> {
  if (!window.ethereum) throw new Error('MetaMask was not found. Install it from metamask.io, then reload this page.');
  return window.ethereum.request({method, params}) as Promise<T>;
}

export const short = (address: string) => address.slice(0, 6) + '…' + address.slice(-4);

// Wei to "0.0050". The chain has no decimals, so 1 ETH is stored as 10^18 wei.
export const formatEth = (wei: bigint) =>
  new Intl.NumberFormat('en-US', {minimumFractionDigits: 4, maximumFractionDigits: 4}).format(Number(wei) / 1e18);

// Wei to the exact decimal text, with no rounding, for filling the amount box: 4000000000000000n to "0.004".
export function exactEth(wei: bigint): string {
  const frac = (wei % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
  return (wei / 10n ** 18n).toString() + (frac ? '.' + frac : '');
}

// "0.001" to wei, shifting 18 places by hand. Returns null when the text is not a positive amount.
export function toWei(text: string): bigint | null {
  const s = text.trim();
  if (!/^\d*\.?\d{0,18}$/.test(s) || !/[1-9]/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return BigInt(whole || '0') * 10n ** 18n + BigInt(frac.padEnd(18, '0'));
}

export const isAddress = (text: string) => /^0x[0-9a-fA-F]{40}$/.test(text);

// Ask a contract who its owner is. Returns null if the address is not a Safe.
export async function ownerOf(address: string): Promise<string | null> {
  const out = await ask('eth_call', {to: address, data: '0x8da5cb5b'}, 'latest'); // owner()
  return out.length === 66 ? '0x' + out.slice(-40) : null;
}

export const balanceOf = async (address: string) => BigInt(await ask('eth_getBalance', address, 'latest'));

// Send a transaction and wait until the network includes it. onSent fires once MetaMask has signed.
export async function send(tx: Record<string, string>, onSent: (hash: string) => void): Promise<Receipt> {
  const hash = await ask('eth_sendTransaction', tx);
  onSent(hash);
  for (;;) {
    const receipt = await ask<Receipt | null>('eth_getTransactionReceipt', hash);
    if (receipt) {
      if (receipt.status !== '0x1') throw Object.assign(new Error('The network rejected it.'), {hash});
      return receipt;
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}

// deposit: plain ether sent to the safe, which triggers receive().
export const depositTx = (from: string, safe: string, wei: bigint) => ({from, to: safe, value: '0x' + wei.toString(16)});

// withdraw(uint256): the function's 4-byte id, then the amount padded to 32 bytes.
export const withdrawTx = (from: string, safe: string, wei: bigint) => ({from, to: safe, data: '0x2e1a7d4d' + wei.toString(16).padStart(64, '0')});
