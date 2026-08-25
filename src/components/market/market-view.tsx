"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAccount } from "wagmi";

import { contracts } from "@/lib/contracts";
import {
  fmtUsd,
  fmtUsdg,
  MARKETS,
  MOCK_POSITIONS,
  MOCK_USDG_BALANCE,
} from "@/lib/markets";
import { chain } from "@/lib/wagmi";

export type MarketAction = "supply" | "borrow";

const parseAmount = (s: string) => {
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Keep only digits and a single decimal point — typed or pasted. */
const sanitizeAmount = (raw: string) => {
  let s = raw.replace(/[^0-9.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }
  return s;
};

const NOT_LIVE_TOAST = "FarmentaMarket contracts are not deployed yet — this action goes live at launch.";

const marketOf = (marketId: string) => MARKETS.find((m) => m.id === marketId) ?? MARKETS[0];

/** Blockscout NFT page for a Uniswap v4 position (PositionManager ERC-721). */
const positionUrl = (tokenId: number) =>
  `${chain.blockExplorers.default.url}/token/${contracts.positionManager}/instance/${tokenId}`;

/* ------------------------------------------------------------------ */
/* Shared LŪMEN-glass class recipes                                   */
/* ------------------------------------------------------------------ */

/** Glass panel: hairline border, faint vertical sheen, top-edge highlight. */
const panel =
  "border border-white/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";

const focusable =
  "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#AFDDFF] focus-visible:-outline-offset-1";

const label11 = "text-[11px] leading-[14px] tracking-[0.08em] text-white/35";

/* ------------------------------------------------------------------ */
/* Small building blocks                                              */
/* ------------------------------------------------------------------ */

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className={label11}>{label}</p>
      <p
        className={`font-graphik mt-[6px] text-[18px] leading-[22px] ${accent ? "text-[#AFDDFF]" : "text-white"}`}
      >
        {value}
      </p>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-[12px]">
      <span className={label11}>{label}</span>
      <span className="text-right text-[13px] leading-[16px] text-white/80">{children}</span>
    </div>
  );
}

function Chip({
  children,
  tone,
}: {
  children: string;
  tone: "accent" | "ok" | "warn";
}) {
  const tones = {
    accent: "border-[#AFDDFF]/40 text-[#AFDDFF] bg-[#AFDDFF]/[0.06]",
    ok: "border-emerald-400/40 text-emerald-400 bg-emerald-400/[0.06]",
    warn: "border-amber-400/40 text-amber-400 bg-amber-400/[0.06]",
  } as const;
  return (
    <span
      className={`inline-block whitespace-nowrap border px-[7px] py-[3px] text-[10px] leading-[13px] tracking-[0.06em] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Aave-style health-factor gauge. The scale runs 1.0 → 5.0 (values above 5
 * and ∞ pin to the right): red below 1.1, amber to 3.0, green beyond.
 */
function HealthFactorBar({ hf }: { hf: number }) {
  const clamped = hf === Infinity ? 5 : Math.min(Math.max(hf, 1), 5);
  const pct = ((clamped - 1) / 4) * 100;
  return (
    <div className="pb-[12px] pt-[2px]">
      <div className="relative h-[4px] w-full">
        <div className="absolute inset-y-0 left-0 w-[2.5%] bg-red-400/70" />
        <div className="absolute inset-y-0 left-[2.5%] w-[47.5%] bg-amber-400/70" />
        <div className="absolute inset-y-0 left-[50%] w-[50%] bg-emerald-400/70" />
        <div
          className="absolute top-[-3px] h-[10px] w-[2px] bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)] transition-[left]"
          style={{ left: `calc(${pct}% - 1px)` }}
        />
      </div>
      <div className="mt-[7px] flex justify-between text-[10px] leading-[13px] tracking-[0.06em]">
        <span className="text-red-400">1.0 LIQUIDATION</span>
        <span className="text-white/35">3.0</span>
        <span className="text-emerald-400">SAFE</span>
      </div>
    </div>
  );
}

function AmountInput({
  value,
  onChange,
  onMax,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onMax: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-stretch gap-[8px]">
      <input
        inputMode="decimal"
        placeholder="0.00"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(sanitizeAmount(e.target.value))}
        className="font-graphik w-full min-w-0 border border-white/20 bg-black/40 px-[14px] py-[11px] text-[16px] text-white transition-[border-color,box-shadow] placeholder:text-white/25 focus:border-[#AFDDFF] focus:shadow-[0_0_0_1px_rgba(175,221,255,0.25),0_0_18px_rgba(175,221,255,0.12)] focus:outline-none disabled:opacity-40"
      />
      <button
        type="button"
        onClick={onMax}
        disabled={disabled}
        className={`border border-white/20 px-[14px] text-[12px] tracking-[0.08em] text-[#AFDDFF] transition-colors hover:border-[#AFDDFF] hover:bg-[#AFDDFF]/10 disabled:opacity-40 ${focusable}`}
      >
        MAX
      </button>
    </div>
  );
}

function ActionButton({
  connected,
  onConnect,
  onAction,
  disabled,
  children,
}: {
  connected: boolean;
  onConnect: () => void;
  onAction: () => void;
  disabled: boolean;
  children: string;
}) {
  const base = `flex items-center gap-[10px] bg-[#AFDDFF] px-[22px] py-[12px] text-[13px] uppercase tracking-wide text-black transition-all hover:bg-[#c8e8ff] hover:shadow-[0_0_24px_rgba(175,221,255,0.35)] ${focusable}`;
  if (!connected) {
    return (
      <button type="button" onClick={onConnect} className={base}>
        <span className="text-[14px] leading-none">&#10022;</span>
        Connect
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onAction}
      disabled={disabled}
      className={`${base} disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:bg-[#AFDDFF]`}
    >
      <span className="text-[14px] leading-none">&#10022;</span>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Market view                                                        */
/* ------------------------------------------------------------------ */

const th = `px-[16px] py-[13px] font-normal whitespace-nowrap text-left ${label11}`;
const td = "px-[16px] py-[16px] whitespace-nowrap";

export function MarketView({ defaultAction }: { defaultAction: MarketAction }) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const connected = mounted && isConnected;

  const [marketId, setMarketId] = useState(MARKETS[0].id);
  const [action, setAction] = useState<MarketAction>(defaultAction);
  const [supplyAmount, setSupplyAmount] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [nftId, setNftId] = useState<number | null>(null);

  /* the table drives the SUPPLY side only */
  const market = marketOf(marketId);

  /* BORROW is position-first: all positions, market derived from the NFT */
  const positions = MOCK_POSITIONS;
  const position = positions.find((p) => p.tokenId === nftId) ?? positions[0] ?? null;
  const posMarket = position ? marketOf(position.marketId) : MARKETS[0];

  const connect = () => openConnectModal?.();

  const selectMarket = (id: string) => {
    setMarketId(id);
    setSupplyAmount("");
  };

  /* -- supply derived state -- */
  const supplyValue = parseAmount(supplyAmount);
  const supplyTooBig = connected && supplyValue > MOCK_USDG_BALANCE;
  const supplyYearly = (supplyValue * market.supplyApy) / 100;

  /* -- borrow derived state (terms come from the selected NFT's market) -- */
  const maxBorrow = position ? position.valueUsd * posMarket.maxLtv : 0;
  const borrowValue = parseAmount(borrowAmount);
  const borrowTooBig = borrowValue > maxBorrow;
  const hf =
    position && borrowValue > 0
      ? (position.valueUsd * posMarket.liqThreshold) / borrowValue
      : Infinity;
  /* Aave-style: display capped at 10 — anything above (incl. no debt) shows ">10" */
  const hfLabel = hf > 10 ? ">10" : hf.toFixed(2);
  /* Aave-style thresholds: <1.1 critical, 1.1–3 caution, ≥3 safe */
  const hfColor = hf >= 3 ? "text-emerald-400" : hf >= 1.1 ? "text-amber-400" : "text-red-400";
  /* collateral value at which HF hits 1.0 for the typed debt */
  const liqValue = borrowValue > 0 ? borrowValue / posMarket.liqThreshold : 0;
  const borrowYearly = (borrowValue * posMarket.borrowApr) / 100;

  return (
    <div className="font-manrope text-[13px] leading-[15.6px]">
      {/* market table */}
      <div
        className={`overflow-x-auto anim-fade-up ${panel}`}
        style={{ animationDelay: "100ms" }}
      >
        <table className="w-full min-w-[680px] border-collapse">
          <thead>
            <tr className="border-b border-white/15 bg-white/[0.02]">
              <th className={`${th} pl-[20px]`}>MARKET</th>
              <th className={th}>COLLATERAL</th>
              <th className={`${th} text-right`}>SUPPLY APY</th>
              <th className={`${th} text-right`}>BORROW APR</th>
              <th className={`${th} text-right`}>UTIL</th>
              <th className={`${th} text-right`}>TVL</th>
              <th className={`${th} pr-[20px] text-right`}>ORACLE</th>
            </tr>
          </thead>
          <tbody>
            {MARKETS.map((m) => {
              const active = m.id === market.id;
              return (
                <tr
                  key={m.id}
                  tabIndex={0}
                  aria-selected={active}
                  onClick={() => selectMarket(m.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      selectMarket(m.id);
                    }
                  }}
                  className={`cursor-pointer border-b border-white/10 transition-colors last:border-b-0 ${focusable} ${
                    active
                      ? "bg-[#AFDDFF]/[0.06] shadow-[inset_2px_0_0_#AFDDFF]"
                      : "hover:bg-white/[0.04]"
                  }`}
                >
                  <td
                    className={`${td} pl-[20px] text-[14px] ${active ? "text-[#AFDDFF]" : "text-white"}`}
                  >
                    [ {m.name} ]
                  </td>
                  <td className={`${td} text-white/60`}>{m.collateral}</td>
                  <td className={`${td} font-graphik text-right text-[16px] text-[#AFDDFF]`}>
                    {m.supplyApy}%
                  </td>
                  <td className={`${td} font-graphik text-right text-[16px] text-white`}>
                    {m.borrowApr}%
                  </td>
                  <td className={`${td} text-right text-white/60`}>{m.utilization}%</td>
                  <td className={`${td} text-right text-white/60`}>{fmtUsd(m.tvlUsd)}</td>
                  <td className={`${td} pr-[20px] text-right text-white/60`}>{m.oracle}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* action panel */}
      <div className={`mt-6 anim-fade-up ${panel}`} style={{ animationDelay: "200ms" }}>
        <div className="flex flex-wrap items-center justify-between gap-y-3 border-b border-white/15 bg-white/[0.02] px-[20px] py-[14px]">
          <span className="text-[14px] text-white">
            {action === "supply" ? `[ ${market.name} ]` : "[ YOUR LP POSITIONS ]"}
          </span>
          {/* segmented control */}
          <div className="flex border border-white/15 bg-black/30">
            {(["supply", "borrow"] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAction(a)}
                className={`px-[18px] py-[7px] text-[12px] uppercase tracking-[0.08em] transition-colors ${focusable} ${
                  action === a
                    ? "bg-[#AFDDFF] text-black"
                    : "text-white/50 hover:text-white"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        {action === "supply" ? (
          /* ------------------------------ SUPPLY ------------------------------ */
          <div className="grid gap-[32px] p-[26px] md:grid-cols-2 md:gap-[44px]">
            <div className="grid grid-cols-3 gap-[16px] self-start">
              <Stat label="SUPPLY APY" value={`${market.supplyApy}%`} accent />
              <Stat label="RESERVE FACTOR" value={`${market.reserveFactor}%`} />
              <Stat
                label="YOUR BALANCE"
                value={connected ? `${fmtUsdg(MOCK_USDG_BALANCE)} USDG` : "—"}
              />
            </div>
            <div>
              <p className={`mb-[8px] ${label11}`}>AMOUNT USDG</p>
              <AmountInput
                value={supplyAmount}
                onChange={setSupplyAmount}
                onMax={() => setSupplyAmount(String(MOCK_USDG_BALANCE))}
                disabled={!connected}
              />
              <div className="mt-[18px] divide-y divide-white/[0.06] border-t border-white/10">
                <InfoRow label="PROJECTED INTEREST">
                  {supplyTooBig ? (
                    <span className="text-red-400">INSUFFICIENT BALANCE</span>
                  ) : supplyValue > 0 ? (
                    <>≈ {fmtUsdg(supplyYearly)} USDG / year</>
                  ) : (
                    <span className="text-white/50">
                      {market.supplyApy}% APY, paid by borrowers
                    </span>
                  )}
                </InfoRow>
              </div>
              <div className="mt-[22px] flex justify-end">
                <ActionButton
                  connected={connected}
                  onConnect={connect}
                  onAction={() => toast(NOT_LIVE_TOAST)}
                  disabled={supplyValue <= 0 || supplyTooBig}
                >
                  Supply
                </ActionButton>
              </div>
            </div>
          </div>
        ) : !connected ? (
          /* ------------------------- BORROW, no wallet ------------------------ */
          <div className="flex flex-col items-start gap-[18px] p-[26px]">
            <p className="max-w-md text-white/50">
              Connect a wallet to see your Uniswap v4 LP position NFTs and borrow
              USDG against them.
            </p>
            <ActionButton connected={false} onConnect={connect} onAction={() => {}} disabled>
              Connect
            </ActionButton>
          </div>
        ) : (
          /* -------------------- BORROW: position-first -------------------- */
          <div className="grid gap-[32px] p-[26px] md:grid-cols-2 md:gap-[44px]">
            {/* all LP NFTs; each card carries its own market terms */}
            <div>
              <p className={`mb-[16px] ${label11}`}>
                PICK A POSITION — its market terms apply automatically
              </p>
              {positions.length === 0 ? (
                <p className="text-white/50">No Uniswap v4 LP positions in your wallet.</p>
              ) : (
                <div className="flex flex-col gap-[16px]">
                  {positions.map((p) => {
                    const pm = marketOf(p.marketId);
                    const selected = position?.tokenId === p.tokenId;
                    return (
                      <div
                        key={p.tokenId}
                        role="button"
                        tabIndex={0}
                        aria-pressed={selected}
                        onClick={() => {
                          setNftId(p.tokenId);
                          setBorrowAmount("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setNftId(p.tokenId);
                            setBorrowAmount("");
                          }
                        }}
                        className={`cursor-pointer border bg-black/20 p-[18px] text-left transition-all ${focusable} ${
                          selected
                            ? "border-[#AFDDFF]/70 bg-[#AFDDFF]/[0.07] shadow-[0_0_24px_rgba(175,221,255,0.12)]"
                            : "border-white/15 hover:border-white/40"
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-4">
                          <a
                            href={positionUrl(p.tokenId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className={`text-[14px] text-white underline-offset-4 transition-colors hover:text-[#AFDDFF] hover:underline ${focusable}`}
                          >
                            {p.pair} <span className="text-[11px] text-white/40">↗</span>
                          </a>
                          <span className="font-graphik text-[16px] text-white">
                            {fmtUsd(p.valueUsd)}
                          </span>
                        </div>
                        <div className="mt-[14px] flex flex-wrap gap-[8px]">
                          <Chip tone="accent">
                            {`${pm.name} · APR ${pm.borrowApr}% · LTV ${pm.maxLtv * 100}%`}
                          </Chip>
                          {p.inRange ? (
                            <Chip tone="ok">IN RANGE</Chip>
                          ) : (
                            <Chip tone="warn">OUT OF RANGE</Chip>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* borrow form for the selected NFT */}
            {position && (
              <div>
                <div className="grid grid-cols-2 gap-[20px]">
                  <Stat
                    label="COLLATERAL VALUE"
                    value={fmtUsd(position.valueUsd)}
                  />
                  <Stat
                    label={`MAX BORROW (${posMarket.maxLtv * 100}% LTV)`}
                    value={`${fmtUsdg(maxBorrow)} USDG`}
                    accent
                  />
                </div>

                {!position.inRange && (
                  <p className="mt-[18px] border border-amber-400/30 bg-amber-400/[0.06] px-[12px] py-[9px] text-[11px] leading-[15px] text-amber-400">
                    OUT OF RANGE — this position is one-sided: its value tracks a
                    single token, so the health factor is more volatile.
                  </p>
                )}

                <div className="mt-[26px] grid grid-cols-[auto_1fr] items-end gap-[12px]">
                  <div>
                    <p className={`mb-[8px] ${label11}`}>BORROW ASSET</p>
                    <div className="flex items-center gap-[8px] border border-white/15 bg-white/[0.04] px-[14px] py-[11px]">
                      <span className="font-graphik text-[16px] text-white">USDG</span>
                      <span className="border border-white/20 px-[4px] py-[1px] text-[9px] leading-[12px] tracking-[0.08em] text-white/40">
                        FIXED
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className={`mb-[8px] ${label11}`}>AMOUNT</p>
                    <AmountInput
                      value={borrowAmount}
                      onChange={setBorrowAmount}
                      onMax={() => setBorrowAmount(String(maxBorrow))}
                    />
                  </div>
                </div>

                <div className="mt-[22px] divide-y divide-white/[0.06] border-t border-white/10">
                  <div>
                    <InfoRow label="HEALTH FACTOR">
                      <span className={`font-graphik text-[16px] ${hfColor}`}>{hfLabel}</span>
                      {borrowTooBig && (
                        <span className="ml-[10px] text-red-400">EXCEEDS MAX BORROW</span>
                      )}
                    </InfoRow>
                    <HealthFactorBar hf={hf} />
                  </div>
                  {borrowValue > 0 && !borrowTooBig && (
                    <>
                      <InfoRow label="LIQUIDATION IF VALUE ≤">
                        {fmtUsd(liqValue)}
                      </InfoRow>
                      <InfoRow label="INTEREST COST">
                        ≈ {fmtUsdg(borrowYearly)} USDG/year ({posMarket.borrowApr}% APR)
                      </InfoRow>
                    </>
                  )}
                </div>

                <div className="mt-[26px] flex justify-end">
                  <ActionButton
                    connected={connected}
                    onConnect={connect}
                    onAction={() => toast(NOT_LIVE_TOAST)}
                    disabled={borrowValue <= 0 || borrowTooBig}
                  >
                    Deposit NFT & Borrow USDG
                  </ActionButton>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
