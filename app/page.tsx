'use client';

import {motion} from 'framer-motion';
import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {ChevronDown, Icon, Locked, Wallet} from '@/components/lime/icon';
import {AlertDialog, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle} from '@/components/lime/ui/alert-dialog';
import {Button} from '@/components/lime/ui/button';
import {Card} from '@/components/lime/ui/card';
import {CopyButton} from '@/components/lime/ui/copy-button';
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/components/lime/ui/dialog';
import {Field, FieldError, FieldLabel} from '@/components/lime/ui/field';
import {Input} from '@/components/lime/ui/input';
import {List, ListIcon, ListItem} from '@/components/lime/ui/list';
import {Popover, PopoverContent, PopoverTitle, PopoverTrigger} from '@/components/lime/ui/popover';
import {Segmented, SegmentedItem} from '@/components/lime/ui/segmented';
import {Status} from '@/components/lime/ui/status';
import {CircuitBoard} from '@/components/ui/circuit-board';
import {BYTECODE, EXPLORER, SEPOLIA, ask, balanceOf, depositTx, exactEth, formatEth, isAddress, ownerOf, send, short, toWei, withdrawTx} from '@/lib/safe';

type Action = 'connect' | 'disconnect' | 'create' | 'move' | 'adopt';
type Outcome = {failed: boolean; text: string; hash?: string};
// What the pop-up shows while something is in flight: its title, the two ends of the circuit, and the pulse's direction.
type Progress = {title: string; from: string; to: string; out: boolean};

// Each wallet remembers its own safe in this browser.
const storageKey = (account: string) => 'safe:' + account.toLowerCase();

// The small picture every dApp shows beside a wallet: a 5 by 5 mirrored pattern whose cells and two
// colours come straight from the address, so each wallet gets its own and it never changes.
function Identicon({address, size = 24}: {address: string; size?: number}) {
  const hex = address.slice(2).toLowerCase();
  const hue = parseInt(hex.slice(0, 3), 16) % 360;
  const cells = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if (parseInt(hex[3 + y * 3 + x], 16) < 8) continue;
      cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1"/>);
      if (x < 2) cells.push(<rect key={`${4 - x}-${y}`} x={4 - x} y={y} width="1" height="1"/>);
    }
  }
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 5 5" shapeRendering="crispEdges" className="shrink-0 rounded-full">
      <rect width="5" height="5" fill={`hsl(${hue} 55% 42%)`}/>
      <g fill={`hsl(${(hue + 130) % 360} 75% 68%)`}>{cells}</g>
    </svg>
  );
}

// The answer the pop-up ends on: a ring that draws itself, then a tick for yes or a cross for no.
function Verdict({ok}: {ok: boolean}) {
  const stroke = {fill: 'none', stroke: ok ? 'var(--success)' : 'var(--danger)', strokeWidth: 6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};
  return (
    <motion.svg aria-hidden="true" width="96" height="96" viewBox="0 0 96 96" className="mx-auto" initial={{scale: 0.7, opacity: 0}} animate={{scale: 1, opacity: 1}} transition={{duration: 0.25}}>
      <motion.circle cx="48" cy="48" r="40" {...stroke} initial={{pathLength: 0}} animate={{pathLength: 1}} transition={{duration: 0.4}}/>
      <motion.path d={ok ? 'M30 50 L43 62 L66 36' : 'M34 34 L62 62 M62 34 L34 62'} {...stroke} initial={{pathLength: 0}} animate={{pathLength: 1}} transition={{duration: 0.3, delay: 0.35}}/>
    </motion.svg>
  );
}

// The route, drawn as a circuit inside the progress pop-up. The pulse runs left to right, or right to
// left when out is set, for as long as the pop-up is open.
function Flow({from, to, out}: {from: string; to: string; out: boolean}) {
  return (
    <CircuitBoard
      aria-hidden="true"
      className="mx-auto"
      width={288}
      height={96}
      showGrid={false}
      pulseSpeed={1.5}
      nodes={[
        {id: 'wallet', x: 40, y: 40, size: 'lg', label: from, status: out ? 'processing' : 'inactive', icon: <Icon icon={Wallet} size={20}/>},
        {id: 'safe', x: 248, y: 40, size: 'lg', label: to, status: out ? 'inactive' : 'processing', icon: <Icon icon={Locked} size={20}/>},
      ]}
      connections={[{from: out ? 'safe' : 'wallet', to: out ? 'wallet' : 'safe', pulseColor: 'var(--accent)'}]}
    />
  );
}

export default function Safe() {
  const [account, setAccount] = useState<string | null>(null);
  const [safe, setSafe] = useState<string | null>(null);
  const [walletWei, setWalletWei] = useState<bigint | null>(null);
  const [safeWei, setSafeWei] = useState<bigint | null>(null);
  const [mine, setMine] = useState(true);
  const [mode, setMode] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [existing, setExisting] = useState('');
  const [existingError, setExistingError] = useState<string | null>(null);
  const [showExisting, setShowExisting] = useState(false);
  const [busy, setBusy] = useState<Action | null>(null);
  const [stage, setStage] = useState<'sign' | 'network' | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [verdict, setVerdict] = useState<{ok: boolean; text: string} | null>(null);
  const settled = useRef<Outcome | null>(null);

  // Record how an action ended: the card keeps the sentence, and the pop-up reads it for its yes or no.
  const settle = (result: Outcome) => { settled.current = result; setOutcome(result); };

  // Reading is free: no transaction, no gas.
  const refresh = useCallback(async (who: string, where: string | null) => {
    setWalletWei(await balanceOf(who));
    if (!where) return;
    const [balance, owner] = await Promise.all([balanceOf(where), ownerOf(where)]);
    setSafeWei(balance);
    setMine(owner?.toLowerCase() === who.toLowerCase());
  }, []);

  const enter = useCallback(async (who: string) => {
    const where = localStorage.getItem(storageKey(who));
    setAccount(who);
    setSafe(where);
    await refresh(who, where);
  }, [refresh]);

  // Come back already connected, with no popup, when MetaMask still trusts this site.
  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;
    const reload = () => location.reload();
    provider.on('accountsChanged', reload);
    provider.on('chainChanged', reload);
    (async () => {
      const accounts = await ask<string[]>('eth_accounts');
      if (accounts.length && (await ask('eth_chainId')) === SEPOLIA) await enter(accounts[0]);
    })().catch(() => {});
  }, [enter]);

  // One action at a time. Any failure lands in the status line as a sentence that says what to do.
  // Pass a Progress to show the pop-up: the circuit while the work runs, then a tick or a cross.
  async function run(action: Action, work: () => Promise<void>, show?: Progress) {
    if (busy) return;
    setBusy(action);
    setOutcome(null);
    settled.current = null;
    if (show) { setVerdict(null); setProgress(show); setProgressOpen(true); }
    try {
      await work();
    } catch (error) {
      const {code, message, hash} = error as {code?: number; message?: string; hash?: string};
      if (code === 4001) settle({failed: true, text: 'Canceled in MetaMask. Nothing was sent.'});
      else if (hash) settle({failed: true, text: 'The network rejected it. Untick "Added protection" in MetaMask and try again.', hash});
      else settle({failed: true, text: message ?? 'Something went wrong. Try again.'});
    }
    setBusy(null);
    setStage(null);
    if (!show) return;
    const result = settled.current as Outcome | null;
    setVerdict({ok: !result?.failed, text: result?.text ?? 'Done.'});
    // Long enough to read the answer; a no stays a little longer than a yes.
    await new Promise(resolve => setTimeout(resolve, result?.failed ? 3000 : 1600));
    setProgressOpen(false);
  }

  const sendTx = (tx: Record<string, string>) => {
    setStage('sign');
    return send(tx, () => setStage('network'));
  };

  const connect = () => run('connect', async () => {
    const accounts = await ask<string[]>('eth_requestAccounts');
    if ((await ask('eth_chainId')) !== SEPOLIA) await ask('wallet_switchEthereumChain', {chainId: SEPOLIA});
    await enter(accounts[0]);
    settle({failed: false, text: 'Your wallet is connected.'});
  }, {title: 'Connecting your wallet', from: 'MetaMask', to: 'Simple Safe', out: false});

  // Ask MetaMask to forget this site, then start clean.
  const disconnect = () => run('disconnect', async () => {
    await ask('wallet_revokePermissions', {eth_accounts: {}}).catch(() => {});
    location.reload();
  });

  const create = () => run('create', async () => {
    const receipt = await sendTx({from: account!, data: BYTECODE});
    const where = receipt.contractAddress!;
    localStorage.setItem(storageKey(account!), where);
    setSafe(where);
    await refresh(account!, where);
    settle({failed: false, text: 'Your safe is ready.', hash: receipt.transactionHash});
  }, {title: 'Creating your safe', from: 'Your wallet', to: 'Your safe', out: false});

  // Puts money in or takes it out, depending on the switch. The amount is checked before MetaMask
  // opens, so a mistake costs no fee.
  function move(event: FormEvent) {
    event.preventDefault();
    const out = mode === 'out';
    const wei = toWei(amount);
    const limit = out ? safeWei : walletWei === null ? null : walletWei - 1n;
    const error =
      wei === null ? 'Type an amount, like 0.001.'
      : limit !== null && wei > limit ? (out ? `Your safe has ${formatEth(safeWei ?? 0n)} ETH. Type that much or less.` : `Your wallet has ${formatEth(walletWei ?? 0n)} ETH. Type less, and leave a little for the fee.`)
      : null;
    setAmountError(error);
    if (wei === null || error) return document.getElementById('amount')?.focus();
    run('move', async () => {
      const receipt = await sendTx(out ? withdrawTx(account!, safe!, wei) : depositTx(account!, safe!, wei));
      await refresh(account!, safe);
      setAmount('');
      settle({failed: false, text: out ? `${formatEth(wei)} ETH is back in your wallet.` : `${formatEth(wei)} ETH is in your safe.`, hash: receipt.transactionHash});
    }, {title: out ? `Taking ${formatEth(wei)} ETH out` : `Putting ${formatEth(wei)} ETH in your safe`, from: 'Your wallet', to: 'Your safe', out});
  }

  function adopt(event: FormEvent) {
    event.preventDefault();
    const where = existing.trim();
    if (!isAddress(where)) return setExistingError('Paste the full address. It starts with 0x and has 42 characters.');
    run('adopt', async () => {
      if (!(await ownerOf(where))) return setExistingError('There is no safe at that address. Check it and try again.');
      localStorage.setItem(storageKey(account!), where);
      setSafe(where);
      await refresh(account!, where);
    });
  }

  function startOver() {
    localStorage.removeItem(storageKey(account!));
    location.reload();
  }

  const others = (action: Action) => busy !== null && busy !== action;
  const out = mode === 'out';
  const locked = out && !mine;
  // What the amount can be at most: the whole safe, or the wallet minus a little kept back for the fee.
  const reserve = 3n * 10n ** 15n;
  const max = out ? safeWei : walletWei === null ? null : walletWei > reserve ? walletWei - reserve : 0n;
  // The chosen side of the switch takes the accent, so it reads at a glance on the dark card.
  const chosen = 'data-checked:bg-accent data-checked:text-on-accent data-checked:shadow-none';
  const fill = (text: string) => { setAmount(text); setAmountError(null); };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 shrink-0 items-center justify-end px-4 sm:px-6">
        {account && (
          <Popover open={walletOpen} onOpenChange={setWalletOpen}>
            <PopoverTrigger render={<Button variant="secondary" size="lg"/>}>
              <Identicon address={account}/>
              <span className="tabular-nums">{short(account)}</span>
              <Icon icon={ChevronDown} size={16}/>
            </PopoverTrigger>
            <PopoverContent align="end">
              <PopoverTitle>Your wallet</PopoverTitle>
              <div className="flex items-center gap-2">
                <Identicon address={account} size={32}/>
                <span className="min-w-0 flex-1 text-base text-fg tabular-nums">{short(account)}</span>
                <CopyButton value={account} label="Copy wallet address" size="icon-lg"/>
              </div>
              <Button variant="outline" size="lg" className="w-full" pending={busy === 'disconnect'} disabled={others('disconnect')} onClick={disconnect}>Disconnect</Button>
              {safe && <Button variant="ghost" size="lg" className="w-full" disabled={busy !== null} onClick={() => { setWalletOpen(false); setConfirmReset(true); }}>Start over with a new safe</Button>}
            </PopoverContent>
          </Popover>
        )}
      </header>

    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-4 pt-4 pb-16">
      <Card>
        <h1 className="sr-only">Simple Safe</h1>
        {account && safe && (
          <Segmented fill aria-label="Direction" value={mode} disabled={busy !== null} onValueChange={value => { setMode(value as 'in' | 'out'); setAmountError(null); }}>
            <SegmentedItem value="in" className={chosen}>Put in</SegmentedItem>
            <SegmentedItem value="out" className={chosen}>Take out</SegmentedItem>
          </Segmented>
        )}

        {!account && (
          <>
            <p className="text-base text-fg-2">A locked box for your crypto. Only your wallet opens it.</p>
            <Button size="lg" className="w-full" pending={busy === 'connect'} onClick={connect}>Connect MetaMask</Button>
          </>
        )}

        {account && !safe && (
          <>
            <p className="text-base text-fg-2">Create your safe. You do this once, for a small network fee.</p>
            <Button size="lg" className="w-full" pending={busy === 'create'} disabled={others('create')} onClick={create}>Create my safe</Button>
            {!showExisting && <Button variant="ghost" size="lg" className="w-full" disabled={busy !== null} onClick={() => setShowExisting(true)}>Use a safe I already have</Button>}
            {showExisting && (
              <form className="flex flex-col gap-4" onSubmit={adopt} noValidate>
                <Field name="existing" invalid={existingError !== null}>
                  <FieldLabel>Safe address</FieldLabel>
                  <Input size="lg" dir="ltr" autoComplete="off" spellCheck={false} placeholder="0x7Cce…AbDe" value={existing} onValueChange={value => { setExisting(value); setExistingError(null); }}/>
                  {existingError && <FieldError match>{existingError}</FieldError>}
                </Field>
                <Button type="submit" variant="outline" size="lg" pending={busy === 'adopt'} disabled={others('adopt')}>Use this safe</Button>
              </form>
            )}
          </>
        )}

        {account && safe && (
          <form className="flex flex-col gap-4" onSubmit={move} noValidate>
            <Field name="amount" invalid={amountError !== null} className="items-center text-center">
              <FieldLabel>Amount in ETH</FieldLabel>
              <Input id="amount" size="lg" className="text-center tabular-nums" inputMode="decimal" autoComplete="off" placeholder="0.001" value={amount} onValueChange={fill}/>
              {amountError && <FieldError match>{amountError}</FieldError>}
            </Field>

            <div className="grid grid-cols-2 gap-2">
              {['0.001', '0.005', '0.01'].map(preset => (
                <Button key={preset} type="button" variant="secondary" size="lg" disabled={busy !== null} onClick={() => fill(preset)}>{preset}</Button>
              ))}
              <Button type="button" variant="secondary" size="lg" disabled={busy !== null || !max} onClick={() => fill(exactEth(max ?? 0n))}>Max</Button>
            </div>

            <List className="-mx-4">
              <ListItem
                leading={<ListIcon icon={Wallet}/>}
                title="Balance"
                description={short(account)}
                trailing={<span className="tabular-nums">{walletWei === null ? '…' : formatEth(walletWei)} ETH</span>}
              />
              <ListItem
                leading={<ListIcon icon={Locked}/>}
                title="Your safe"
                description={short(safe)}
                trailing={<span className="tabular-nums">{safeWei === null ? '…' : formatEth(safeWei)} ETH</span>}
                href={`${EXPLORER}/address/${safe}`}
                chevron={false}
              />
            </List>

            <Button type="submit" size="lg" className="w-full" pending={busy === 'move'} disabled={locked || others('move')}>{out ? 'Take out' : 'Put in safe'}</Button>
            {locked && <p className="text-center text-sm text-fg">This safe belongs to another wallet. Only its owner can take money out.</p>}
          </form>
        )}

        {outcome && (
          <div role="status" className="flex flex-wrap items-center justify-center gap-2 text-center text-sm">
            <p className={outcome.failed ? 'text-danger-text' : 'text-fg'}>{outcome.text}</p>
            {outcome.hash && <a className="text-fg-2 underline underline-offset-2" href={`${EXPLORER}/tx/${outcome.hash}`} target="_blank" rel="noreferrer">View</a>}
          </div>
        )}
      </Card>

      <Dialog open={progressOpen} onOpenChange={setProgressOpen}>
        <DialogContent size="sm" showClose={false}>
          <DialogHeader>
            <DialogTitle>{progress?.title}</DialogTitle>
          </DialogHeader>
          {progress && !verdict && <Flow from={progress.from} to={progress.to} out={progress.out}/>}
          {verdict && <Verdict ok={verdict.ok}/>}
          <div role="status" className="flex justify-center text-center">
            {verdict
              ? <p className={verdict.ok ? 'text-base text-fg' : 'text-base text-danger-text'}>{verdict.text}</p>
              : <Status status="running" label={stage === 'network' ? 'Processing, about 15 seconds' : 'Processing, confirm in MetaMask'}/>}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start over with a new safe?</AlertDialogTitle>
            <AlertDialogDescription>
              This page forgets your current safe. The {formatEth(safeWei ?? 0n)} ETH inside stays there. Save its address to come back to it: {safe}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" size="lg"/>}>Keep this safe</AlertDialogClose>
            <Button variant="solid" size="lg" onClick={startOver}>Start over</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
    </div>
  );
}
